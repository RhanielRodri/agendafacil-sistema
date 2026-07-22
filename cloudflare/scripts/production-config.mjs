import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(root, ".env.production");

if (!existsSync(envPath)) {
  console.error("Falta cloudflare/.env.production.");
  process.exit(1);
}

const env = {};
for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
}

function required(name) {
  if (!env[name]) {
    console.error(`Falta ${name} em cloudflare/.env.production.`);
    process.exit(1);
  }
  return env[name];
}

const databaseId = required("CF_PRODUCTION_D1_ID");
const databaseName = env.CF_PRODUCTION_D1_NAME || "agendafacil-production-db";
const teamDomain = env.ACCESS_TEAM_DOMAIN || "nao-configurado.cloudflareaccess.com";

function config(name, slug, surface, audience) {
  const value = {
    name,
    main: `${surface}-worker/src/index.ts`,
    compatibility_date: "2026-07-21",
    d1_databases: [{
      binding: "DB",
      database_name: databaseName,
      database_id: databaseId,
      migrations_dir: "migrations"
    }],
    vars: { TENANT_SLUG: slug },
    assets: {
      directory: `./dist/${slug}/${surface}`,
      binding: "ASSETS",
      not_found_handling: "single-page-application",
      run_worker_first: true
    }
  };
  if (surface === "admin") {
    value.vars.ACCESS_TEAM_DOMAIN = teamDomain;
    value.vars.ACCESS_POLICY_AUD = audience || "nao-configurado";
  }
  return value;
}

const targets = {
  "wrangler.production.studio-cut.public.jsonc": config("studio-cut-public", "studio-cut", "public"),
  "wrangler.production.studio-cut.admin.jsonc": config("studio-cut-admin", "studio-cut", "admin", env.STUDIO_CUT_ACCESS_POLICY_AUD),
  "wrangler.production.lumiere.public.jsonc": config("lumiere-public", "lumiere", "public"),
  "wrangler.production.lumiere.admin.jsonc": config("lumiere-admin", "lumiere", "admin", env.LUMIERE_ACCESS_POLICY_AUD)
};

for (const [file, value] of Object.entries(targets)) {
  writeFileSync(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`gerado ${file} (${value.name})`);
}

const missingAccess = [
  !env.ACCESS_TEAM_DOMAIN && "ACCESS_TEAM_DOMAIN",
  !env.STUDIO_CUT_ACCESS_POLICY_AUD && "STUDIO_CUT_ACCESS_POLICY_AUD",
  !env.LUMIERE_ACCESS_POLICY_AUD && "LUMIERE_ACCESS_POLICY_AUD"
].filter(Boolean);

if (missingAccess.length) {
  console.log(`aviso: falta ${missingAccess.join(", ")}; os Workers administrativos falharão fechados até o Access ser configurado.`);
}
