#!/usr/bin/env node
// CLI única do ciclo de vida de um Client Pack. Segura por padrão: todo comando
// roda em dry-run e só escreve com flag explícita; produção exige confirmação
// extra. Saída resumida por padrão, `--json` para automação, códigos de saída
// estáveis e logs sanitizados (nunca ecoam segredos).
//
// Códigos de saída: 0 sucesso · 1 erro de validação/operação · 2 erro de uso.

import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validatePack, isPublishable } from "../client-packs/schema.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PACKS_DIR = resolve(__dirname, "..", "client-packs");

export const EXIT = { OK: 0, ERROR: 1, USAGE: 2 };

export function parseArgs(argv) {
  const flags = { json: false, apply: false, env: "local", confirm: null, help: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") flags.json = true;
    else if (arg === "--apply") flags.apply = true;
    else if (arg === "--help" || arg === "-h") flags.help = true;
    else if (arg === "--env") flags.env = argv[++i];
    else if (arg === "--confirm") flags.confirm = argv[++i];
    else if (arg.startsWith("--env=")) flags.env = arg.slice(6);
    else if (arg.startsWith("--confirm=")) flags.confirm = arg.slice(10);
    else if (arg.startsWith("--")) throw new UsageError(`flag desconhecida: ${arg}`);
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

const COMMANDS = {
  validate: cmdValidate
};

const HELP = `client — ciclo de vida de Client Packs (dry-run por padrão)

Uso:
  client <comando> <pack> [flags]

Comandos:
  validate <pack>     Valida um pack contra o contrato (fail-closed).

Flags:
  --json              Saída em JSON (automação).
  --apply             Executa a escrita (comandos que alteram estado).
  --env <ambiente>    local | staging | production (default: local).
  --confirm <slug>    Confirmação extra exigida em produção.
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
