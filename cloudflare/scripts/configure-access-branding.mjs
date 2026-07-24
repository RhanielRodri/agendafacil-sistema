// Personaliza a tela de login do Cloudflare Access (One-Time PIN) com branding
// NEUTRO AgendaFácil / SOR ONE. Essa tela é servida pela Cloudflare, não pelos
// nossos Workers, e é da ORGANIZAÇÃO Zero Trust — ou seja, é compartilhada entre
// todas as verticais e entre staging e produção. Por isso o branding aqui é
// deliberadamente neutro (nunca a identidade Lumière ou Studio Cut).
//
// Como é um recurso compartilhado que também afeta produção, o script é um
// dry-run por padrão: imprime o desenho que seria aplicado. Só muta a organização
// com `--apply` explícito. O logo entra por `ACCESS_BRAND_LOGO_URL` (URL pública
// do SVG em scripts/access-branding/), ou é enviado pelo painel Zero Trust.

import { fileURLToPath } from "node:url";
import { accessProfiles, CloudflareApi, loadEnvironment } from "./configure-access.mjs";

// Branding neutro. `header_text` é o título da tela; `footer_text`, a instrução.
export const brandingDesign = {
  background_color: "#f4f4f5",
  text_color: "#1c1c1e",
  header_text: "Acesso seguro ao painel",
  footer_text: "Insira o código de uso único enviado para o seu e-mail autorizado. AgendaFácil · SOR ONE"
};

function requireValue(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}.`);
  return value;
}

export function buildDesign(environment = {}) {
  const logo = environment.ACCESS_BRAND_LOGO_URL?.trim();
  return logo ? { ...brandingDesign, logo_path: logo } : { ...brandingDesign };
}

export async function run(options = {}) {
  const profile = accessProfiles[options.profileName || "staging"];
  const environment = options.environment || loadEnvironment(profile);
  const design = buildDesign(environment);

  if (!options.apply) {
    console.log("Dry-run — nenhuma mudança aplicada. Desenho de login que seria enviado:");
    console.log(JSON.stringify({ login_design: design }, null, 2));
    if (!design.logo_path) {
      console.log("\nSem ACCESS_BRAND_LOGO_URL: o logo seria mantido/enviado pelo painel Zero Trust.");
    }
    console.log("\nPara aplicar de fato (afeta a organização inteira, inclusive produção): --apply");
    return design;
  }

  const token = requireValue(environment, "CLOUDFLARE_ACCESS_API_TOKEN");
  const accountId = requireValue(environment, "CLOUDFLARE_ACCOUNT_ID");
  const api = options.api || new CloudflareApi(accountId, token, options.fetchImplementation);
  await api.request("/access/organizations", { method: "PUT", body: { login_design: design } });
  console.log("Tela de login do Cloudflare Access atualizada com branding neutro AgendaFácil / SOR ONE.");
  return design;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const environmentIndex = process.argv.indexOf("--environment");
  const profileName = environmentIndex === -1 ? "staging" : process.argv[environmentIndex + 1];
  run({ apply: process.argv.includes("--apply"), profileName }).catch((error) => {
    console.error(error instanceof Error ? error.message : "Falha ao configurar o branding do Access.");
    process.exitCode = 1;
  });
}
