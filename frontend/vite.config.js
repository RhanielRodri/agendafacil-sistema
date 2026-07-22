import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Os destinos Cloudflare publicam a mesma aplicação em dois Workers. Cada um
// recebe uma entrada única e o fallback de SPA do Static Assets resolve as
// rotas por caminho; o build do Vercel continua com as três entradas estáticas.
const cloudflareTargets = {
  "cf-public": "../cloudflare/public-worker/assets",
  "cf-admin": "../cloudflare/admin-worker/assets"
};

export default defineConfig(({ mode }) => {
  const cloudflareOutDir = cloudflareTargets[mode];

  if (cloudflareOutDir) {
    return {
      plugins: [react()],
      // O destino é decidido aqui, e não por arquivo `.env`, porque essa
      // configuração precisa ser versionada junto com o Worker que a consome.
      define: {
        "import.meta.env.VITE_API_MODE": JSON.stringify("cloudflare"),
        "import.meta.env.VITE_CF_SURFACE": JSON.stringify(mode === "cf-admin" ? "admin" : "public"),
        "import.meta.env.VITE_CF_API_URL": JSON.stringify("")
      },
      build: {
        outDir: resolve(process.cwd(), cloudflareOutDir),
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
