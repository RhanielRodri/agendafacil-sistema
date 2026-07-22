import { surface } from "../config/tenant.js";
import cloudflareAdminApi from "./cloudflare-admin.js";
import cloudflarePublicApi from "./cloudflare-public.js";
import expressApi from "./express.js";

// Um único frontend atende os dois destinos. O modo é decidido no build:
// `express` continua servindo Render/Vercel; `cloudflare` fala apenas com os
// Workers. Como `apiMode` e `surface` são constantes de build, o bundle público
// não carrega o cliente administrativo e o administrativo não carrega o público.
export const apiMode = import.meta.env.VITE_API_MODE === "cloudflare" ? "cloudflare" : "express";

export const api = apiMode !== "cloudflare"
  ? expressApi
  : surface === "admin" ? cloudflareAdminApi : cloudflarePublicApi;

export default api;
