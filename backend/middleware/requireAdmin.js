import { createHmac } from "crypto";

function makeSessionToken(secret) {
  return createHmac("sha256", secret).update("admin-session-v1").digest("hex");
}

function parseCookies(cookieHeader = "") {
  return Object.fromEntries(
    cookieHeader.split(";").flatMap((part) => {
      const [k, ...v] = part.trim().split("=");
      return k.trim() ? [[k.trim(), decodeURIComponent(v.join("="))]] : [];
    })
  );
}

export function makeAdminSessionToken() {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) throw new Error("ADMIN_SECRET não configurado");
  return makeSessionToken(secret);
}

export function requireAdmin(req, res, next) {
  const secret = process.env.ADMIN_SECRET;

  if (!secret) {
    return res.status(503).json({ message: "Autenticação administrativa não configurada" });
  }

  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.admin_session;

  if (!token || token !== makeSessionToken(secret)) {
    return res.status(401).json({ message: "Não autorizado" });
  }

  next();
}
