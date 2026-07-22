import cloudflareApi from "./cloudflare.js";
import expressApi from "./express.js";

// Um único frontend atende os dois destinos. O modo é decidido no build:
// `express` continua servindo Render/Vercel; `cloudflare` fala apenas com os
// Workers, e nesse modo nenhuma chamada ao Express permanece no bundle.
export const apiMode = import.meta.env.VITE_API_MODE === "cloudflare" ? "cloudflare" : "express";

export const api = apiMode === "cloudflare" ? cloudflareApi : expressApi;

export default api;
