import prisma from "../prismaClient.js";
import { resolveSession, SESSION_COOKIE } from "../lib/session.js";
import { createHttpError, parseCookies } from "../controllers/utils.js";

export async function requireAuth(req, res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie);
    const session = await resolveSession(cookies[SESSION_COOKIE]);

    if (!session) {
      throw createHttpError(401, "Não autorizado");
    }

    prisma.adminSession
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});

    req.auth = {
      userId: session.userId,
      tenantId: session.user.tenantId,
      sessionId: session.id
    };

    next();
  } catch (error) {
    next(error);
  }
}
