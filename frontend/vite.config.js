import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Os destinos Cloudflare publicam a mesma aplicação em dois Workers. Cada um
// recebe uma entrada única e o fallback de SPA do Static Assets resolve as
// rotas por caminho; o build do Vercel continua com as três entradas estáticas.
const cloudflareTargets = {
  public: "../cloudflare/public-worker/assets",
  admin: "../cloudflare/admin-worker/assets"
};

// Cada demo passa a ter Workers próprios. O tenant entra no build, e não em
// tempo de execução, porque a garantia pedida é de bundle: o pacote do Studio
// Cut não pode conter a Lumière nem como texto morto. O modo carrega as duas
// dimensões porque `--mode` é o único canal que o Vite passa igual nos três
// sistemas operacionais.
const tenantSlugs = ["studio-cut", "lumiere"];
const CLOUDFLARE_MODE = /^cf-(public|admin)(?:-(studio-cut|lumiere))?$/;

function singleTenantPlugin(slug) {
  const removed = tenantSlugs.filter((value) => value !== slug);
  return {
    name: "agendafacil-single-tenant",
    enforce: "pre",
    resolveId(source) {
      if (removed.some((value) => source.endsWith(`/demos/${value}.js`))) {
        return resolve(process.cwd(), "src/config/demos/absent.js");
      }
      return null;
    }
  };
}

export default defineConfig(({ mode }) => {
  const cloudflare = mode.match(CLOUDFLARE_MODE);

  if (cloudflare) {
    const surface = cloudflare[1];
    const tenantSlug = cloudflare[2] || "";
    const outDir = tenantSlug ? `../cloudflare/dist/${tenantSlug}/${surface}` : cloudflareTargets[surface];

    return {
      plugins: [react(), ...(tenantSlug ? [singleTenantPlugin(tenantSlug)] : [])],
      // O destino é decidido aqui, e não por arquivo `.env`, porque essa
      // configuração precisa ser versionada junto com o Worker que a consome.
      define: {
        "import.meta.env.VITE_API_MODE": JSON.stringify("cloudflare"),
        "import.meta.env.VITE_CF_SURFACE": JSON.stringify(surface),
        "import.meta.env.VITE_CF_TENANT": JSON.stringify(tenantSlug),
        "import.meta.env.VITE_CF_API_URL": JSON.stringify("")
      },
      build: {
        outDir: resolve(process.cwd(), outDir),
        emptyOutDir: true,
        rollupOptions: {
          input: { main: resolve(process.cwd(), "index.html") }
        }
      }
    };
  }

  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(process.cwd(), "index.html"),
          studioCut: resolve(process.cwd(), "studio-cut/index.html"),
          lumiere: resolve(process.cwd(), "lumiere/index.html")
        }
      }
    }
  };
});
