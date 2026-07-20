import { createHash, randomBytes } from "node:crypto";
import { createHttpError } from "../controllers/utils.js";

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function hashAppointmentToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function tokenError(status, code, message) {
  const error = createHttpError(status, message);
  error.code = code;
  return error;
}

function calculateExpiry(appointmentDate) {
  const minimum = Date.now() + THIRTY_DAYS_MS;
  const appointmentDeadline = new Date(appointmentDate);
  appointmentDeadline.setUTCDate(appointmentDeadline.getUTCDate() + 2);
  return new Date(Math.max(minimum, appointmentDeadline.getTime()));
}

export async function createManageToken(client, appointment) {
  const rawToken = randomBytes(32).toString("hex");
  await client.appointmentAccessToken.create({
    data: {
      tenantId: appointment.tenantId,
      appointmentId: appointment.id,
      tokenHash: hashAppointmentToken(rawToken),
      purpose: "MANAGE",
      expiresAt: calculateExpiry(appointment.date)
    }
  });
  return rawToken;
}

export async function revokeAppointmentTokens(client, appointmentId, { used = false } = {}) {
  const now = new Date();
  await client.appointmentAccessToken.updateMany({
    where: { appointmentId, revokedAt: null },
    data: { revokedAt: now, ...(used ? { usedAt: now } : {}) }
  });
}

export async function resolveManageToken({ client, tenantId, rawToken, allowInactive = false }) {
  if (typeof rawToken !== "string" || !TOKEN_PATTERN.test(rawToken)) {
    throw tokenError(404, "TOKEN_INVALID", "Link inválido ou indisponível");
  }

  const accessToken = await client.appointmentAccessToken.findFirst({
    where: {
      tenantId,
      tokenHash: hashAppointmentToken(rawToken),
      purpose: "MANAGE"
    },
    include: {
      appointment: {
        include: {
          service: true,
          professional: true
        }
      }
    }
  });

  if (!accessToken) {
    throw tokenError(404, "TOKEN_INVALID", "Link inválido ou indisponível");
  }

  const state = accessToken.usedAt
    ? "used"
    : accessToken.revokedAt
      ? "revoked"
      : accessToken.expiresAt <= new Date()
        ? "expired"
        : "active";

  if (state !== "active" && !allowInactive) {
    const messages = {
      expired: ["TOKEN_EXPIRED", "Este link expirou"],
      revoked: ["TOKEN_REVOKED", "Este link não está mais ativo"],
      used: ["TOKEN_USED", "Este link já foi substituído ou utilizado"]
    };
    const [code, message] = messages[state];
    throw tokenError(410, code, message);
  }

  return { accessToken, appointment: accessToken.appointment, state };
}

export function managementPath(tenantId, rawToken) {
  return `/${tenantId}#agendamento=${rawToken}`;
}
