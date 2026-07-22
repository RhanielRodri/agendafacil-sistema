import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Gera as configurações remotas a partir de valores locais não versionados.
// IDs de banco, domínio de equipe e audience do Access identificam a conta e a
// política reais: eles ficam em `.env.staging` (ignorado) e nunca no Git. Os
// arquivos gerados também são ignorados, então o repositório continua contendo
// apenas o procedimento, não o ambiente.

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(root, ".env.staging");

if (!existsSync(envPath)) {
  console.error("Falta cloudflare/.env.staging. Veja docs/DEPLOY_STAGING.md.");
  process.exit(1);
}

const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
}

function required(name) {
  if (!env[name]) {
    console.error(`Falta ${name} em cloudflare/.env.staging.`);
    process.exit(1);
  }
  return env[name];
}

const databaseId = required("CF_STAGING_D1_ID");
const databaseName = env.CF_STAGING_D1_NAME || "agendafacil-staging-db";
const compatibilityDate = "2026-07-21";

function database() {
  return [{ binding: "DB", database_name: databaseName, database_id: databaseId, migrations_dir: "migrations" }];
}

function assets(directory) {
  return { directory, binding: "ASSETS", not_found_handling: "single-page-application", run_worker_first: true };
}

// Sem Access configurado estes valores não casam com nenhum emissor real e
// toda requisição administrativa termina em 401. O padrão é falhar fechado.
function accessVars(prefix) {
  return {
    ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN || "nao-configurado.cloudflareaccess.com",
    ACCESS_POLICY_AUD: env[`${prefix}_ACCESS_POLICY_AUD`] || "nao-configurado"
  };
}

const targets = {
  "wrangler.staging.public.jsonc": {
    name: env.CF_STAGING_PUBLIC_NAME || "agendafacil-staging-public",
    main: "public-worker/src/index.ts",
    compatibility_date: compatibilityDate,
    d1_databases: database(),
    assets: assets("./public-worker/assets")
  },
  "wrangler.staging.admin.jsonc": {
    name: env.CF_STAGING_ADMIN_NAME || "agendafacil-staging-admin",
    main: "admin-worker/src/index.ts",
    compatibility_date: compatibilityDate,
    d1_databases: database(),
    vars: accessVars("SHARED"),
    assets: assets("./admin-worker/assets")
  }
};

// Um deployment por vertical. Mesmo código, mesmo D1, mesmo schema: o que muda
// é `TENANT_SLUG`, os assets já construídos para aquela demo e — no painel — a
// aplicação do Access, que tem AUD própria para cada uma.
const verticals = [
  { slug: "studio-cut", prefix: "STUDIO_CUT", name: "Studio Cut" },
  { slug: "lumiere", prefix: "LUMIERE", name: "Lumière" }
];

for (const vertical of verticals) {
  const base = env[`CF_STAGING_${vertical.prefix}_PREFIX`] || `agendafacil-staging-${vertical.slug}`;

  targets[`wrangler.staging.${vertical.slug}.public.jsonc`] = {
    name: `${base}-public`,
    main: "public-worker/src/index.ts",
    compatibility_date: compatibilityDate,
    d1_databases: database(),
    vars: { TENANT_SLUG: vertical.slug },
    assets: assets(`./dist/${vertical.slug}/public`)
  };

  targets[`wrangler.staging.${vertical.slug}.admin.jsonc`] = {
    name: `${base}-admin`,
    main: "admin-worker/src/index.ts",
    compatibility_date: compatibilityDate,
    d1_databases: database(),
    vars: { TENANT_SLUG: vertical.slug, ...accessVars(vertical.prefix) },
    assets: assets(`./dist/${vertical.slug}/admin`)
  };
}

for (const [file, config] of Object.entries(targets)) {
  writeFileSync(join(root, file), `${JSON.stringify(config, null, 2)}\n`);
  console.log(`gerado ${file} (${config.name})`);
}

const semAccess = [
  !env.ACCESS_TEAM_DOMAIN && "ACCESS_TEAM_DOMAIN",
  !env.STUDIO_CUT_ACCESS_POLICY_AUD && "STUDIO_CUT_ACCESS_POLICY_AUD",
  !env.LUMIERE_ACCESS_POLICY_AUD && "LUMIERE_ACCESS_POLICY_AUD"
].filter(Boolean);

if (semAccess.length) {
  console.log(`aviso: falta ${semAccess.join(", ")}; os Workers administrativos correspondentes responderão 401 em todas as rotas.`);
}
