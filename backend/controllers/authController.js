import { randomBytes } from "crypto";
import prisma from "../prismaClient.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { createSession, revokeByToken, SESSION_COOKIE } from "../lib/session.js";
import { createHttpError, parseCookies } from "./utils.js";

// Hash descartável para gastar o mesmo tempo quando o usuário não existe,
// evitando enumeração de e-mail por diferença de tempo de resposta.
const DUMMY_HASH = await hashPassword(randomBytes(24).toString("base64url"));

const isProd = () => process.env.NODE_ENV === "production";

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    secure: isProd(),
    sameSite: isProd() ? "none" : "lax",
    path: "/",
    ...(maxAgeMs ? { maxAge: maxAgeMs } : {})
  };
}

export async function login(req, res, next) {
  try {
    const tenantId = req.tenant.slug; // vertical pública da rota de login
    const email = normalizeEmail(req.body?.email);
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!email || !password) {
      throw createHttpError(400, "Informe e-mail e senha");
    }

    const user = await prisma.adminUser.findUnique({
      where: { tenantId_email: { tenantId, email } }
    });

    const passwordOk = await verifyPassword(password, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !user.active || !passwordOk) {
      throw createHttpError(401, "Credenciais inválidas");
    }

    const { token, expiresAt } = await createSession(user.id);
    res.cookie(SESSION_COOKIE, token, cookieOptions(expiresAt.getTime() - Date.now()));
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    await revokeByToken(cookies[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

export async function me(req, res, next) {
  try {
    const user = await prisma.adminUser.findUnique({
      where: { id: req.auth.userId },
      select: { email: true, name: true, tenantId: true }
    });

    if (!user) {
      throw createHttpError(401, "Não autorizado");
    }

    res.json({ email: user.email, name: user.name, tenantId: user.tenantId });
  } catch (error) {
    next(error);
  }
}

export async function listAdminUsers(req, res, next) {
  try {
    const users = await prisma.adminUser.findMany({
      where: { tenantId: req.auth.tenantId },
      select: { id: true, name: true, email: true, active: true },
      orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }]
    });
    res.json(users);
  } catch (error) {
    next(error);
  }
}
