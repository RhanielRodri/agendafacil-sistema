#!/usr/bin/env node
/**
 * Uso:
 *   node novo-cliente.js --nicho barbearia --nome "The Barber House" --whatsapp "27999999999"
 *
 * Nichos disponíveis: barbearia | salao | petshop
 * --whatsapp é opcional
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, copyFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 ? process.argv[i + 1] : null;
}

const nicho = arg("--nicho");
const nome = arg("--nome");
const whatsapp = arg("--whatsapp");

if (!nicho || !nome) {
  console.error(`
Uso: node novo-cliente.js --nicho [barbearia|salao|petshop] --nome "Nome do Cliente" [--whatsapp 27999999999]
  `);
  process.exit(1);
}

const NICHOS = {
  barbearia: {
    preset: "frontend/src/config/presets/barbearia.tenant.js",
    seed: "backend/prisma/seeds/barbearia.seed.js",
  },
  salao: {
    preset: "frontend/src/config/presets/salao.tenant.js",
    seed: "backend/prisma/seeds/salao.seed.js",
  },
  petshop: {
    preset: "frontend/src/config/presets/petshop.tenant.js",
    seed: "backend/prisma/seeds/petshop.seed.js",
  },
};

const config = NICHOS[nicho];
if (!config) {
  console.error(`Nicho inválido: "${nicho}". Opções: ${Object.keys(NICHOS).join(", ")}`);
  process.exit(1);
}

const slug = nome
  .toLowerCase()
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const branch = `demo/${slug}`;

console.log(`\n[1/4] Branch: ${branch}`);
try {
  execSync(`git checkout main`, { stdio: "inherit" });
  execSync(`git checkout -b ${branch}`, { stdio: "inherit" });
} catch {
  console.error("Erro ao criar branch. Verifique se já existe ou se há mudanças não commitadas.");
  process.exit(1);
}

console.log(`\n[2/4] tenant.js → ${nome}`);
const tenantDest = resolve(__dirname, "frontend/src/config/tenant.js");
let tenant = readFileSync(resolve(__dirname, config.preset), "utf-8");
tenant = tenant.replace(/name:\s*"[^"]*"/, `name: "${nome}"`);
tenant = tenant.replace(
  /whatsapp:\s*(null|"[^"]*")/,
  `whatsapp: ${whatsapp ? `"${whatsapp}"` : "null"}`
);
writeFileSync(tenantDest, tenant);

console.log(`[3/4] seed.js copiado`);
copyFileSync(
  resolve(__dirname, config.seed),
  resolve(__dirname, "backend/prisma/seed.js")
);

console.log(`[4/4] index.html atualizado`);
const htmlPath = resolve(__dirname, "frontend/index.html");
let html = readFileSync(htmlPath, "utf-8");
html = html.replace(/<title>[^<]*<\/title>/, `<title>${nome} · Agendamento Online</title>`);
html = html
  .replace(/og:title" content="[^"]*"/, `og:title" content="${nome} · Agendamento Online"`)
  .replace(/name="description" content="[^"]*"/, `name="description" content="Agende online com ${nome}. Rápido, sem ligação."`)
  .replace(/og:description" content="[^"]*"/, `og:description" content="Agende online com ${nome}. Sem espera, sem ligação."`);
writeFileSync(htmlPath, html);

console.log(`
✓ Pronto!

Branch:  ${branch}
Tenant:  ${nome} (${nicho})
WhatsApp: ${whatsapp ?? "não definido — edite tenant.js depois"}

Próximos passos:
  1. Edite frontend/src/config/tenant.js — foto, stats reais, cidade
  2. Edite backend/prisma/seed.js — serviços e profissionais reais do cliente
  3. cd backend && npm run db:seed
  4. git add . && git commit -m "feat: demo ${nome}"
  5. git push origin ${branch}
  6. Deploy no Vercel + Render
`);
