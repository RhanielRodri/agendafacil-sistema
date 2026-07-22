import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Guarda de fronteira entre as duas superfícies. Foi escrita depois de o smoke
// pegar o painel chamando `/api/tenants/...` (rota pública) no Worker
// administrativo: o erro não aparece em teste de unidade nem quebra o build,
// só some quando alguém abre o painel e olha a rede.
const SURFACES = [
  {
    name: "public",
    dir: "public-worker/assets/assets",
    forbidden: [
      ["/api/admin/", "chamada administrativa no bundle público"],
      ["Cf-Access-Jwt-Assertion", "asserção do Access no bundle público"]
    ]
  },
  {
    name: "admin",
    dir: "admin-worker/assets/assets",
    forbidden: [
      ["/api/tenants/", "chamada pública no bundle administrativo"],
      ["/admin/session", "sessão própria no bundle administrativo"],
      ["current-password", "campo de senha no bundle administrativo"],
      ["demoId", "tenant por payload no bundle administrativo"]
    ]
  }
];

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
