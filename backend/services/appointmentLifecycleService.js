import { createHttpError } from "../controllers/utils.js";
import { revokeAppointmentTokens } from "./appointmentTokenService.js";

export const appointmentTransitions = Object.freeze({
  PENDING: Object.freeze(["CONFIRMED", "CANCELLED"]),
  CONFIRMED: Object.freeze(["COMPLETED", "CANCELLED", "NO_SHOW"]),
  COMPLETED: Object.freeze([]),
  CANCELLED: Object.freeze([]),
  NO_SHOW: Object.freeze([])
});

const historyTypeByStatus = {
  CONFIRMED: "CONFIRMED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW"
};

const metadataKeys = new Set([
  "reason",
  "source",
  "previousAppointmentId",
  "newAppointmentId",
  "previousDate",
  "previousTime",
  "newDate",
  "newTime",
  "previousProfessionalId",
  "newProfessionalId"
]);

export function sanitizeReason(value, maxLength = 300) {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function sanitizeHistoryMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const sanitized = {};
  for (const [key, value] of Object.entries(metadata).slice(0, 12)) {
    if (!metadataKeys.has(key)) continue;
    if (["string", "number", "boolean"].includes(typeof value)) {
      sanitized[key] = typeof value === "string" ? value.slice(0, 300) : value;
    }
  }
  if (!Object.keys(sanitized).length) return null;
  if (Buffer.byteLength(JSON.stringify(sanitized), "utf8") > 2048) {
    throw createHttpError(400, "Metadados de histórico excedem o limite permitido");
  }
  return sanitized;
}

export async function appendHistoryEvent(client, event) {
  return client.appointmentHistoryEvent.create({
    data: {
      tenantId: event.tenantId,
      appointmentId: event.appointmentId,
      type: event.type,
      fromStatus: event.fromStatus || null,
      toStatus: event.toStatus || null,
      metadata: sanitizeHistoryMetadata(event.metadata),
      actorType: event.actorType,
      actorId: event.actorId || null
    }
  });
}

export function assertStatusTransition(fromStatus, toStatus) {
  if (!Object.hasOwn(appointmentTransitions, toStatus)) {
    throw createHttpError(400, "Status inválido");
  }
  if (fromStatus === toStatus) return { idempotent: true };
  if (!appointmentTransitions[fromStatus]?.includes(toStatus)) {
    throw createHttpError(409, `Transição de ${fromStatus} para ${toStatus} não permitida`);
  }
  return { idempotent: false };
}

export async function lockAppointment(client, appointmentId, tenantId) {
  await client.$queryRaw`
    SELECT "id"
    FROM "Appointment"
    WHERE "id" = ${appointmentId} AND "demoId" = ${tenantId}
    FOR UPDATE
  `;
}

export async function transitionAppointment(client, {
  appointment,
  toStatus,
  actorType,
  actorId = null,
  reason = null,
  tokenWasUsed = false
}) {
  const transition = assertStatusTransition(appointment.status, toStatus);
  if (transition.idempotent) return { appointment, idempotent: true };

  const cleanReason = sanitizeReason(reason);
  const updated = await client.appointment.update({
    where: { id: appointment.id },
    data: {
      status: toStatus,
      ...(toStatus === "CANCELLED" ? { cancellationReason: cleanReason } : {})
    },
    include: {
      service: true,
      professional: true,
      rescheduledFrom: { select: { id: true, date: true, time: true } },
      rescheduledTo: { select: { id: true, date: true, time: true } }
    }
  });

  await appendHistoryEvent(client, {
    tenantId: appointment.tenantId,
    appointmentId: appointment.id,
    type: historyTypeByStatus[toStatus],
    fromStatus: appointment.status,
    toStatus,
    metadata: cleanReason ? { reason: cleanReason } : null,
    actorType,
    actorId
  });

  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(toStatus)) {
    await revokeAppointmentTokens(client, appointment.id, { used: tokenWasUsed });
  }

  return { appointment: updated, idempotent: false };
}

export function publicAppointmentSummary(appointment) {
  return {
    service: {
      name: appointment.service.name,
      duration: appointment.service.duration
    },
    professional: {
      id: appointment.professional.id,
      name: appointment.professional.name
    },
    date: appointment.date,
    time: appointment.time,
    status: appointment.status
  };
}
