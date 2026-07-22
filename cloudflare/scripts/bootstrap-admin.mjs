import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Cria ou reativa identidades administrativas no D1 remoto sem que nenhum
// e-mail entre no repositório: os endereços chegam por argumento, viram SQL num
// arquivo temporário fora da árvore do projeto e são apagados no fim.
//
// Uso:
//   node scripts/bootstrap-admin.mjs --config wrangler.staging.admin.jsonc \
//     --db agendafacil-staging-db pessoa@dominio.com=studio-cut,lumiere
//
// Acrescente --dry-run para apenas imprimir o SQL e não tocar no banco.

const args = process.argv.slice(2);
function flag(name, fallback) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return args[index + 1];
}

const dryRun = args.includes("--dry-run");
const config = flag("config", "wrangler.staging.admin.jsonc");
const database = flag("db", "agendafacil-staging-db");
const entries = args.filter((value) => value.includes("@") && value.includes("="));

if (!entries.length) {
  console.error("Informe ao menos um par email=slug[,slug]. Nenhum e-mail é gravado no repositório.");
  process.exit(1);
}

function sqlText(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

const statements = [];
for (const entry of entries) {
  const [rawEmail, rawSlugs] = entry.split("=");
  const email = rawEmail.trim().toLowerCase();
  const slugs = rawSlugs.split(",").map((slug) => slug.trim()).filter(Boolean);
  if (!email.includes("@") || email.length < 3 || email.length > 254 || !slugs.length) {
    console.error(`Entrada inválida: ${entry}`);
    process.exit(1);
  }

  // O id só é usado quando a identidade ainda não existe; o ON CONFLICT
  // preserva o id anterior para não quebrar as memberships e o histórico.
  statements.push(
    `INSERT INTO admin_identities (id, email, active) VALUES (${sqlText(randomUUID())}, ${sqlText(email)}, 1)\n` +
    `ON CONFLICT(email) DO UPDATE SET active = 1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');`
  );
  for (const slug of slugs) {
    statements.push(
      `INSERT INTO admin_memberships (identity_id, tenant_id, role, active)\n` +
      `SELECT id, ${sqlText(slug)}, 'ADMIN', 1 FROM admin_identities WHERE email = ${sqlText(email)}\n` +
      `ON CONFLICT(identity_id, tenant_id) DO UPDATE SET active = 1, role = 'ADMIN', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now');`
    );
  }
}

const sql = `${statements.join("\n\n")}\n`;

if (dryRun) {
  console.log(sql);
  process.exit(0);
}

const dir = mkdtempSync(join(tmpdir(), "agendafacil-bootstrap-"));
const file = join(dir, "bootstrap.sql");
try {
  writeFileSync(file, sql);
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  execFileSync(executable, ["wrangler", "d1", "execute", database, "--remote", "--config", config, "--file", file], {
    stdio: "inherit"
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

console.log(`\n${entries.length} identidade(s) aplicada(s). Nenhum e-mail foi gravado no repositório.`);
