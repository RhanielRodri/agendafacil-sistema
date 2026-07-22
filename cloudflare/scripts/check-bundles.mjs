import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Guarda de fronteira entre as duas superfícies. Foi escrita depois de o smoke
// pegar o painel chamando `/api/tenants/...` (rota pública) no Worker
// administrativo: o erro não aparece em teste de unidade nem quebra o build,
// só some quando alguém abre o painel e olha a rede.
const FORBIDDEN = {
  public: [
    ["/api/admin/", "chamada administrativa no bundle público"],
    ["Cf-Access-Jwt-Assertion", "asserção do Access no bundle público"]
  ],
  admin: [
    ["/api/tenants/", "chamada pública no bundle administrativo"],
    ["/admin/session", "sessão própria no bundle administrativo"],
    ["current-password", "campo de senha no bundle administrativo"],
    ["demoId", "tenant por payload no bundle administrativo"]
  ]
};

// Nos deployments por vertical existe uma segunda fronteira: o bundle de uma
// demo não pode carregar a identidade da outra. `--tenant <slug>` verifica os
// bundles de `dist/<slug>/` e acrescenta essa regra.
const OTHER_TENANT = {
  "studio-cut": [["Lumière", "identidade da Lumière no bundle do Studio Cut"]],
  lumiere: [["Studio Cut", "identidade do Studio Cut no bundle da Lumière"]]
};

const tenantIndex = process.argv.indexOf("--tenant");
const tenant = tenantIndex === -1 ? "" : process.argv[tenantIndex + 1];
if (tenant && !OTHER_TENANT[tenant]) {
  console.error(`✗ tenant desconhecido: ${tenant}`);
  process.exit(1);
}

const SURFACES = ["public", "admin"].map((name) => ({
  name: tenant ? `${tenant}/${name}` : name,
  dir: tenant ? `dist/${tenant}/${name}/assets` : `${name}-worker/assets/assets`,
  forbidden: [...FORBIDDEN[name], ...(tenant ? OTHER_TENANT[tenant] : [])]
}));

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;

for (const surface of SURFACES) {
  const dir = join(root, surface.dir);
  let files;
  try {
    files = (await readdir(dir)).filter((file) => file.endsWith(".js"));
  } catch {
    console.error(`✗ ${surface.name}: bundle ausente em ${surface.dir} — rode o build antes`);
    failures += 1;
    continue;
  }
  if (!files.length) {
    console.error(`✗ ${surface.name}: nenhum arquivo .js em ${surface.dir}`);
    failures += 1;
    continue;
  }

  for (const file of files) {
    const content = await readFile(join(dir, file), "utf8");
    for (const [needle, reason] of surface.forbidden) {
      if (content.includes(needle)) {
        console.error(`✗ ${surface.name}/${file}: ${reason} (${needle})`);
        failures += 1;
      }
    }
  }
  console.log(`✓ ${surface.name}: ${files.length} bundle(s) sem vazamento de superfície`);
}

if (failures) process.exit(1);
