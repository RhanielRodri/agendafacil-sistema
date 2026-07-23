#!/usr/bin/env node
// CLI única do ciclo de vida de um Client Pack. Segura por padrão: todo comando
// roda em dry-run e só escreve com flag explícita; produção exige confirmação
// extra. Saída resumida por padrão, `--json` para automação, códigos de saída
// estáveis e logs sanitizados (nunca ecoam segredos).
//
// Códigos de saída: 0 sucesso · 1 erro de validação/operação · 2 erro de uso.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validatePack, isPublishable } from "../client-packs/schema.mjs";
import { compileSeedSql } from "../client-packs/seed.mjs";
import { renderFrontendModule } from "../client-packs/compile.mjs";
import { buildBackup, verifyBackup, restoreStatements, toCsv, groupByDomain } from "../client-packs/backup.mjs";
import { readTenantTables } from "../client-packs/source.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PACKS_DIR = resolve(__dirname, "..", "client-packs");
const CF_DIR = resolve(__dirname, "..");
const FRONT_CONFIG_DIR = resolve(__dirname, "..", "..", "frontend", "src", "config");
const ENVIRONMENTS = ["local", "staging", "production"];

export const EXIT = { OK: 0, ERROR: 1, USAGE: 2 };

export function parseArgs(argv) {
  const flags = { json: false, apply: false, env: "local", confirm: null, help: false,
    source: null, out: null, from: null, to: null, mask: false, target: null };
  const positional = [];
  const valued = { "--env": "env", "--confirm": "confirm", "--source": "source", "--out": "out",
    "--from": "from", "--to": "to", "--target": "target" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--apply") flags.apply = true;
    else if (arg === "--mask") flags.mask = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (valued[arg]) flags[valued[arg]] = argv[++i];
    else if (arg.startsWith("--") && arg.includes("=") && valued[arg.slice(0, arg.indexOf("="))]) {
      flags[valued[arg.slice(0, arg.indexOf("="))]] = arg.slice(arg.indexOf("=") + 1);
    } else if (arg.startsWith("--")) throw new UsageError(`flag desconhecida: ${arg}`);
    else positional.push(arg);
  }
  return { flags, positional };
}

export class UsageError extends Error {}

// Aceita slug (resolvido em client-packs/<slug>.json) ou caminho explícito.
export function resolvePackPath(ref) {
  if (!ref) throw new UsageError("informe o pack (slug ou caminho)");
  if (ref.endsWith(".json") || ref.includes("/") || ref.includes("\\") || isAbsolute(ref)) {
    return isAbsolute(ref) ? ref : resolve(process.cwd(), ref);
  }
  return join(PACKS_DIR, `${ref}.json`);
}

export async function loadPack(ref) {
  const path = resolvePackPath(ref);
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new UsageError(`pack não encontrado: ${path}`);
  }
  try {
    return { path, pack: JSON.parse(raw) };
  } catch (e) {
    throw new UsageError(`JSON inválido em ${path}: ${e.message}`);
  }
}

function emit(flags, summary, data) {
  if (flags.json) {
    process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  } else {
    process.stdout.write(summary + "\n");
  }
}

async function cmdValidate({ positional, flags }) {
  const { path, pack } = await loadPack(positional[0]);
  const { ok, errors } = validatePack(pack);
  const slug = pack?.tenant?.slug ?? "(desconhecido)";
  const data = { command: "validate", pack: path, slug, ok, publishable: isPublishable(pack), errors };
  if (ok) {
    emit(flags, `OK  ${slug} — pack válido${isPublishable(pack) ? "" : " (não publicável)"}`, data);
    return EXIT.OK;
  }
  const lines = errors.map((e) => `  - ${e.path}: ${e.message}`).join("\n");
  emit(flags, `FALHA  ${slug} — ${errors.length} erro(s):\n${lines}`, data);
  return EXIT.ERROR;
}

// Carrega e valida; recusa (exit 1) se o pack for inválido — nenhum comando
// destrutivo prossegue sobre um pack que não passou no contrato.
async function loadValidPack(ref) {
  const { path, pack } = await loadPack(ref);
  const { ok, errors } = validatePack(pack);
  if (!ok) {
    const err = new Error(`pack inválido (${errors.length} erro(s)); rode "validate" para o detalhe`);
    err.validation = true;
    throw err;
  }
  return { path, pack };
}

function checkEnv(env) {
  if (!ENVIRONMENTS.includes(env)) throw new UsageError(`--env inválido: ${env} (use ${ENVIRONMENTS.join(" | ")})`);
}

// Resumo do que existe no pack, sem despejar conteúdo.
function packStats(pack) {
  return {
    services: pack.catalog.services.length,
    activeServices: pack.catalog.services.filter((s) => s.active).length,
    professionals: pack.catalog.professionals.length,
    associations: pack.catalog.associations.length,
    professionalSchedules: pack.schedule.professionalSchedules.length,
    scheduleBlocks: pack.schedule.scheduleBlocks.length,
    bookingEnabled: pack.settings.bookingEnabled
  };
}

async function cmdPlan({ positional, flags }) {
  checkEnv(flags.env);
  const { path, pack } = await loadValidPack(positional[0]);
  const slug = pack.tenant.slug;
  const stats = packStats(pack);
  const data = { command: "plan", pack: path, slug, env: flags.env, publishable: isPublishable(pack), stats };
  const summary = [
    `PLANO  ${slug} — ambiente ${flags.env}${isPublishable(pack) ? "" : " (pack não publicável)"}`,
    `  serviços: ${stats.services} (${stats.activeServices} ativos) · profissionais: ${stats.professionals} · associações: ${stats.associations}`,
    `  agendas: ${stats.professionalSchedules} · bloqueios: ${stats.scheduleBlocks} · booking: ${stats.bookingEnabled ? "ligado" : "desligado"}`,
    `  provisionar geraria: seed/generated/${slug}.sql e frontend/src/config/demos/${slug}.js`,
    `  nada foi escrito (dry-run).`
  ].join("\n");
  emit(flags, summary, data);
  return EXIT.OK;
}

async function writeArtifact(absPath, contents, apply) {
  if (!apply) return { path: absPath, written: false };
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
  return { path: absPath, written: true };
}

// Passos Cloudflare (nunca executados aqui): plano textual e checagem de
// conflito staging↔produção. AUDs/identidades vêm do tooling de Access, nunca
// do pack; produção jamais reaproveita config de staging.
function cloudflarePlan(slug, env) {
  const steps = [
    `configs esperadas: wrangler.${env}.${slug}.public.jsonc e wrangler.${env}.${slug}.admin.jsonc (TENANT_SLUG=${slug})`,
    `D1: banco de ${env} explícito e separado; binding declarado na config, nunca em runtime`,
    `Access: aplicação/policy de ${env} via scripts/configure-access.mjs --environment ${env}`,
    `rollback: manter deploy anterior; reverter é redeploy da versão prévia + revalidar Access`
  ];
  const warnings = [];
  if (env === "production") {
    warnings.push("produção usa AUD/identidades próprias; jamais reutilizar as de staging");
  }
  return { steps, warnings, publishesThirdVertical: false };
}

async function cmdProvision({ positional, flags }) {
  checkEnv(flags.env);
  const { path, pack } = await loadValidPack(positional[0]);
  const slug = pack.tenant.slug;
  const remote = flags.env === "staging" || flags.env === "production";

  // Publicar operação não publicável (fixture/template) é sempre recusado.
  if (remote && flags.apply && !isPublishable(pack)) {
    throw Object.assign(new Error(`pack "${slug}" é não publicável; provisão remota recusada`), { validation: true });
  }
  // Produção exige confirmação explícita com o slug.
  if (flags.env === "production" && flags.apply && flags.confirm !== slug) {
    throw new UsageError(`produção exige --confirm ${slug}`);
  }

  const now = new Date().toISOString();
  const seedSql = compileSeedSql(pack, { now, reconcile: false });
  const frontModule = renderFrontendModule(pack);
  const seedPath = join(CF_DIR, "seed", "generated", `${slug}.sql`);
  const frontPath = join(FRONT_CONFIG_DIR, "demos", `${slug}.js`);

  // Escrita local materializa os artefatos; remota apenas planeja (o deploy é
  // sempre manual e explícito, fora desta CLI).
  const localApply = flags.apply && flags.env === "local";
  const seedArt = await writeArtifact(seedPath, seedSql, localApply);
  const frontArt = await writeArtifact(frontPath, frontModule, localApply);
  const cf = cloudflarePlan(slug, flags.env);

  const data = {
    command: "provision", pack: path, slug, env: flags.env, apply: flags.apply,
    artifacts: { seed: seedArt, frontendConfig: frontArt }, cloudflare: cf
  };
  const lines = [
    `PROVISION  ${slug} — ambiente ${flags.env}${flags.apply ? " (apply)" : " (dry-run)"}`,
    `  seed: ${seedArt.written ? "escrito" : "geraria"} ${seedPath}`,
    `  config front: ${frontArt.written ? "escrito" : "geraria"} ${frontPath}`,
    `  Cloudflare:`,
    ...cf.steps.map((s) => `    - ${s}`),
    ...cf.warnings.map((w) => `    ! ${w}`)
  ];
  if (remote) {
    lines.push(`  deploy remoto NÃO executado por esta CLI — rode os scripts wrangler ${flags.env} manualmente após revisar.`);
  }
  emit(flags, lines.join("\n"), data);
  return EXIT.OK;
}

async function cmdUpdate({ positional, flags }) {
  checkEnv(flags.env);
  const { path, pack } = await loadValidPack(positional[0]);
  const slug = pack.tenant.slug;
  if (flags.env === "production" && flags.apply && flags.confirm !== slug) {
    throw new UsageError(`produção exige --confirm ${slug} (operação com passo destrutivo de inativação)`);
  }
  const now = new Date().toISOString();
  const reconcileSql = compileSeedSql(pack, { now, reconcile: true });
  const outPath = join(CF_DIR, "seed", "generated", `${slug}.reconcile.sql`);
  const localApply = flags.apply && flags.env === "local";
  const art = await writeArtifact(outPath, reconcileSql, localApply);
  const data = { command: "update", pack: path, slug, env: flags.env, apply: flags.apply, artifact: art, backupRequired: true };
  const lines = [
    `UPDATE  ${slug} — ambiente ${flags.env}${flags.apply ? " (apply)" : " (dry-run)"}`,
    `  reconciliação preserva dados operacionais; serviços/profissionais fora do pack são INATIVADOS (nunca apagados).`,
    `  antes de qualquer apply remoto: rode "client backup ${slug}" (backup obrigatório).`,
    `  SQL de reconciliação: ${art.written ? "escrito" : "geraria"} ${outPath}`
  ];
  if (flags.env !== "local") {
    lines.push(`  apply remoto NÃO executado por esta CLI — revise o SQL e aplique via wrangler manualmente.`);
  }
  emit(flags, lines.join("\n"), data);
  return EXIT.OK;
}

async function cmdSmoke({ positional, flags }) {
  const { path, pack } = await loadValidPack(positional[0]);
  const slug = pack.tenant.slug;
  const checks = [];
  const record = (name, ok, detail) => checks.push({ name, ok, detail });

  record("contrato", true, "pack válido");
  // O seed gerado tem statements terminados e é escopado ao tenant.
  const seed = compileSeedSql(pack, { now: "1970-01-01T00:00:00.000Z", reconcile: true });
  record("seed:gerado", seed.includes("INSERT INTO tenants"), "seed inclui tenant");
  const scoped = [...seed.matchAll(/tenant_id = '([^']*)'/g)].map((m) => m[1]);
  record("seed:escopo", scoped.length > 0 && scoped.every((s) => s === slug), "todo tenant_id é do slug");
  record("seed:sem-operacional", !/\b(appointments|clients|leads|follow_ups|appointment_history|relationship_history)\b/.test(seed), "não referencia dados operacionais");
  // Config do front reimporta como objeto.
  const module = renderFrontendModule(pack);
  record("config:front", module.includes("export default"), "módulo do front gerado");

  const ok = checks.every((c) => c.ok);
  const data = { command: "smoke", pack: path, slug, ok, checks };
  const summary = [`SMOKE  ${slug} — ${ok ? "todos os checks passaram" : "FALHA"}`]
    .concat(checks.map((c) => `  [${c.ok ? "ok" : "x"}] ${c.name}: ${c.detail}`))
    .join("\n");
  emit(flags, summary, data);
  return ok ? EXIT.OK : EXIT.ERROR;
}

function cmdDecommissionPlan({ positional, flags }) {
  return loadValidPack(positional[0]).then(({ path, pack }) => {
    const slug = pack.tenant.slug;
    const steps = [
      "1. export completo (client export) e backup assinado (client backup) — guardar fora do repo",
      "2. desligar booking: settings.bookingEnabled = false e reprovisionar (sem apagar dados)",
      "3. remover acesso: revogar policies/identities do Access daquele tenant",
      "4. remover Workers público e admin do tenant (staging e produção separadamente)",
      "5. arquivar/soltar o D1 do tenant só após confirmar backup íntegro (checksum)",
      "6. remover configs wrangler do tenant e o Client Pack do repositório"
    ];
    const data = { command: "decommission-plan", pack: path, slug, executes: false, steps };
    const summary = [`PLANO DE DESATIVAÇÃO  ${slug} — somente planejamento, nada é executado`]
      .concat(steps.map((s) => `  ${s}`)).join("\n");
    emit(flags, summary, data);
    return EXIT.OK;
  });
}

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const BACKUPS_DIR = join(CF_DIR, "backups");

function requireSlug(ref) {
  if (!ref || !SLUG_RE.test(ref)) throw new UsageError("informe o slug do tenant");
  return ref;
}

function stamp(now) {
  return now.replace(/[:.]/g, "-");
}

// Extrai as tabelas do tenant. Local exige --source (SQLite). Em staging/
// produção esta CLI não busca dados remotos sozinha: instrui o comando wrangler.
function extractOrGuide(slug, flags) {
  if (flags.source) {
    return readTenantTables(resolve(process.cwd(), flags.source), slug, { from: flags.from, to: flags.to });
  }
  if (flags.env !== "local") {
    throw new UsageError(
      `sem --source: exporte o D1 de ${flags.env} com wrangler primeiro, ex.:\n` +
      `  wrangler d1 export <db-${flags.env}> --remote --output dump.sqlite\n` +
      `  depois rode este comando com --source dump.sqlite`
    );
  }
  throw new UsageError("informe --source <arquivo.sqlite> (D1 local do wrangler)");
}

async function cmdBackup({ positional, flags }) {
  checkEnv(flags.env);
  const slug = requireSlug(positional[0]);
  const tables = extractOrGuide(slug, flags);
  const now = new Date().toISOString();
  const backup = buildBackup({ tenant: slug, tables, now });
  const totals = Object.fromEntries(Object.entries(backup.tables).map(([t, r]) => [t, r.length]));
  const outPath = flags.out ? resolve(process.cwd(), flags.out) : join(BACKUPS_DIR, `${slug}-${stamp(now)}.json`);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(backup, null, 2), "utf8");
  const data = { command: "backup", slug, out: outPath, checksum: backup.checksum, totals };
  emit(flags, `BACKUP  ${slug} — ${outPath}\n  checksum: ${backup.checksum}\n  linhas: ${Object.values(totals).reduce((a, b) => a + b, 0)}`, data);
  return EXIT.OK;
}

async function cmdExport({ positional, flags }) {
  checkEnv(flags.env);
  const slug = requireSlug(positional[0]);
  const tables = extractOrGuide(slug, flags);
  const now = new Date().toISOString();
  const backup = buildBackup({ tenant: slug, tables, now });
  const outDir = flags.out ? resolve(process.cwd(), flags.out) : join(BACKUPS_DIR, `${slug}-${stamp(now)}`);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "backup.json"), JSON.stringify(backup, null, 2), "utf8");
  const groups = groupByDomain(tables);
  const csvFiles = [];
  for (const [domain, rows] of Object.entries(groups)) {
    const csv = toCsv(rows, { mask: flags.mask });
    if (csv) {
      const file = join(outDir, `${domain}.csv`);
      await writeFile(file, csv, "utf8");
      csvFiles.push({ domain, rows: rows.length });
    }
  }
  const data = { command: "export", slug, out: outDir, masked: flags.mask, checksum: backup.checksum, domains: csvFiles };
  emit(flags, `EXPORT  ${slug} — ${outDir}\n  JSON restaurável + ${csvFiles.length} CSV por domínio${flags.mask ? " (mascarado)" : ""}\n  checksum: ${backup.checksum}`, data);
  return EXIT.OK;
}

async function cmdRestore({ positional, flags }) {
  checkEnv(flags.env);
  const backupPath = positional[0];
  if (!backupPath) throw new UsageError("informe o arquivo de backup");
  const target = requireSlug(flags.target || "");
  let backup;
  try {
    backup = JSON.parse(await readFile(resolve(process.cwd(), backupPath), "utf8"));
  } catch (e) {
    throw new UsageError(`backup ilegível: ${e.message}`);
  }
  const check = verifyBackup(backup);
  if (!check.ok) throw Object.assign(new Error(`backup inválido: ${check.errors.join("; ")}`), { validation: true });
  if (flags.env === "production" && flags.apply && flags.confirm !== target) {
    throw new UsageError(`produção exige --confirm ${target}`);
  }
  // restoreStatements recusa fechado se o backup for de outro tenant.
  const statements = restoreStatements(backup, target, { now: new Date().toISOString() });
  const sql = statements.join("\n") + "\n";
  const outPath = join(CF_DIR, "seed", "generated", `${target}.restore.sql`);
  const localApply = flags.apply && flags.env === "local";
  const art = await writeArtifact(outPath, sql, localApply);
  const data = { command: "restore", target, source: backupPath, env: flags.env, apply: flags.apply, checksum: backup.checksum, artifact: art };
  const lines = [
    `RESTORE  ${target} — ambiente ${flags.env}${flags.apply ? " (apply)" : " (dry-run)"}`,
    `  backup de "${backup.tenant}" (checksum ${backup.checksum}) — alvo confere.`,
    `  SQL de restauração: ${art.written ? "escrito" : "geraria"} ${outPath}`
  ];
  if (flags.env !== "local") lines.push(`  apply remoto NÃO executado por esta CLI — revise e aplique via wrangler manualmente.`);
  emit(flags, lines.join("\n"), data);
  return EXIT.OK;
}

const COMMANDS = {
  validate: cmdValidate,
  plan: cmdPlan,
  provision: cmdProvision,
  update: cmdUpdate,
  backup: cmdBackup,
  export: cmdExport,
  restore: cmdRestore,
  smoke: cmdSmoke,
  "decommission-plan": cmdDecommissionPlan
};

const HELP = `client — ciclo de vida de Client Packs (dry-run por padrão)

Uso:
  client <comando> <pack> [flags]

Comandos:
  validate <pack>            Valida um pack contra o contrato (fail-closed).
  plan <pack>                Mostra o que a provisão faria (dry-run).
  provision <pack>           Gera seed + config do tenant (--apply escreve local).
  update <pack>              Gera SQL de reconciliação idempotente (inativa o que saiu).
  backup <slug>              Snapshot JSON com checksum (--source <sqlite>).
  export <slug>              JSON restaurável + CSV por domínio (--mask opcional).
  restore <backup.json>      Gera SQL de restauração (--target <slug>; recusa cross-tenant).
  smoke <pack>               Checks locais proporcionais (contrato, seed, config).
  decommission-plan <pack>   Planeja a desativação (nada é executado).

Flags:
  --json              Saída em JSON (automação).
  --apply             Executa a escrita (comandos que alteram estado).
  --env <ambiente>    local | staging | production (default: local).
  --confirm <slug>    Confirmação extra exigida em produção.
  --source <sqlite>   Fonte D1 local para backup/export.
  --out <destino>     Arquivo/pasta de saída.
  --from/--to <data>  Filtro de período no export/backup.
  --mask              Mascara dados pessoais no export.
  --target <slug>     Tenant alvo do restore.
  -h, --help          Esta ajuda.

Pack pode ser um slug (client-packs/<slug>.json) ou um caminho .json.`;

export async function run(argv) {
  const command = argv[0];
  if (!command || command === "--help" || command === "-h") {
    process.stdout.write(HELP + "\n");
    return command ? EXIT.OK : EXIT.USAGE;
  }
  const handler = COMMANDS[command];
  if (!handler) {
    process.stderr.write(`erro: comando desconhecido "${command}"\n\n${HELP}\n`);
    return EXIT.USAGE;
  }
  const parsed = parseArgs(argv.slice(1));
  if (parsed.flags.help) {
    process.stdout.write(HELP + "\n");
    return EXIT.OK;
  }
  return handler(parsed);
}

// Entrada CLI. Erros de uso saem com código 2; qualquer outra falha, com 1.
// A mensagem é sanitizada: só o texto do erro, sem stack nem valores do pack.
const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  run(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((e) => {
      const usage = e instanceof UsageError;
      process.stderr.write(`erro: ${e.message}\n`);
      process.exit(usage ? EXIT.USAGE : EXIT.ERROR);
    });
}
