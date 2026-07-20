import { randomBytes, createHash } from "crypto";
import prisma from "../prismaClient.js";

export const SESSION_COOKIE = "admin_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8h
const MAX_ACTIVE_SESSIONS = 10;

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await prisma.adminSession.create({
    data: { userId, tokenHash: hashToken(token), expiresAt, lastUsedAt: new Date() }
  });

  // Limpeza leve de sessões expiradas/revogadas do próprio usuário.
  await prisma.adminSession.deleteMany({
    where: { userId, OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] }
  });

  // Limite simples de sessões ativas: revoga as mais antigas além do teto.
  const active = await prisma.adminSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true }
  });
  if (active.length > MAX_ACTIVE_SESSIONS) {
    const toRevoke = active.slice(MAX_ACTIVE_SESSIONS).map((s) => s.id);
    await prisma.adminSession.updateMany({ where: { id: { in: toRevoke } }, data: { revokedAt: new Date() } });
  }

  return { token, expiresAt };
}

export async function resolveSession(token) {
  if (!token) return null;

  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true }
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt <= new Date()) return null;
  if (!session.user || !session.user.active) return null;

  return session;
}

export async function revokeSession(sessionId) {
  await prisma.adminSession
    .update({ where: { id: sessionId }, data: { revokedAt: new Date() } })
    .catch(() => {});
}

export async function revokeByToken(token) {
  if (!token) return;
  const session = await prisma.adminSession.findUnique({ where: { tokenHash: hashToken(token) } });
  if (session && !session.revokedAt) {
    await revokeSession(session.id);
  }
}
