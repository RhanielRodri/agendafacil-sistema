import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
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
});
