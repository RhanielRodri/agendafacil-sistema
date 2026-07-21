import { createHash } from "node:crypto";
import { createHttpError, sanitizeId } from "../controllers/utils.js";

export const activeLeadStatuses = ["NEW", "CONTACTED", "QUALIFIED"];
export const leadTransitions = Object.freeze({
  NEW: Object.freeze(["CONTACTED", "QUALIFIED", "CONVERTED", "LOST"]),
  CONTACTED: Object.freeze(["QUALIFIED", "CONVERTED", "LOST"]),
  QUALIFIED: Object.freeze(["CONVERTED", "LOST"]),
  CONVERTED: Object.freeze([]),
  LOST: Object.freeze([])
});

const metadataKeys = new Set([
  "source",
  "fields",
  "fromStatus",
  "toStatus",
  "reason",
  "followUpId",
  "appointmentId",
  "leadId"
]);

export function sanitizeText(value, maxLength) {
  if (typeof value !== "string") return null;
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? clean.slice(0, maxLength) : null;
}

export function normalizePhone(value) {
  const digits = typeof value === "string" ? value.replace(/\D/g, "") : "";
  if (digits.length < 8 || digits.length > 15) {
    throw createHttpError(400, "Telefone inválido");
  }
  return digits;
}

export function normalizeEmail(value) {
  const email = sanitizeText(value, 254)?.toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createHttpError(400, "E-mail inválido");
  }
  return email;
}

export function validatePerson(payload) {
  const name = sanitizeText(payload?.name ?? payload?.clientName, 120);
  const phone = sanitizeText(payload?.phone ?? payload?.clientPhone, 30);
  if (!name || name.length < 2) throw createHttpError(400, "Nome inválido");
  if (!phone) throw createHttpError(400, "Telefone inválido");
  const normalizedPhone = normalizePhone(phone);
  const email = sanitizeText(payload?.email ?? payload?.clientEmail, 254);
  const normalizedEmail = normalizeEmail(email);
  return { name, phone, normalizedPhone, email, normalizedEmail };
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const clean = {};
  for (const [key, value] of Object.entries(metadata).slice(0, 10)) {
    if (!metadataKeys.has(key)) continue;
    if (["string", "number", "boolean"].includes(typeof value)) {
      clean[key] = typeof value === "string" ? value.slice(0, 500) : value;
    }
  }
  if (!Object.keys(clean).length) return null;
  if (Buffer.byteLength(JSON.stringify(clean), "utf8") > 2048) {
    throw createHttpError(400, "Metadados de histórico excedem o limite permitido");
  }
  return clean;
}

export async function appendRelationshipEvent(client, event) {
  return client.relationshipHistoryEvent.create({
    data: {
      tenantId: event.tenantId,
      clientId: event.clientId,
      leadId: event.leadId || null,
      appointmentId: event.appointmentId || null,
      type: event.type,
      actorType: event.actorType,
      actorId: event.actorId || null,
      metadata: sanitizeMetadata(event.metadata)
    }
  });
}

export async function findOrCreateClient(client, {
  tenantId,
  person,
  actorType,
  actorId = null,
  source
}) {
  const existing = await client.client.findUnique({
    where: {
      tenantId_normalizedPhone: {
        tenantId,
        normalizedPhone: person.normalizedPhone
      }
    }
  });

  if (!existing) {
    const created = await client.client.create({
      data: {
        tenantId,
        name: person.name,
        phone: person.phone,
        normalizedPhone: person.normalizedPhone,
        email: person.email,
        normalizedEmail: person.normalizedEmail
      }
    });
    await appendRelationshipEvent(client, {
      tenantId,
      clientId: created.id,
      type: "CLIENT_CREATED",
      actorType,
      actorId,
      metadata: { source }
    });
    return { client: created, created: true };
  }

  const changes = { lastContactAt: new Date() };
  const changedFields = [];
  if (!existing.email && person.email) {
    changes.email = person.email;
    changes.normalizedEmail = person.normalizedEmail;
    changedFields.push("email");
  }
  if (existing.name.toLowerCase() === person.name.toLowerCase() && existing.name !== person.name) {
    changes.name = person.name;
    changedFields.push("name");
  }
  if (existing.phone.replace(/\D/g, "") === person.normalizedPhone && existing.phone !== person.phone) {
    changes.phone = person.phone;
    changedFields.push("phone");
  }

  const updated = await client.client.update({ where: { id: existing.id }, data: changes });
  if (changedFields.length) {
    await appendRelationshipEvent(client, {
      tenantId,
      clientId: existing.id,
      type: "CLIENT_UPDATED",
      actorType,
      actorId,
      metadata: { source, fields: changedFields.join(",") }
    });
  }
  return { client: updated, created: false };
}

export function leadDedupeKey({ source, serviceId, professionalId, interestSummary }) {
  const normalizedInterest = sanitizeText(interestSummary, 500)?.toLowerCase() || "";
  return createHash("sha256")
    .update([source, serviceId || 0, professionalId || 0, normalizedInterest].join("|"))
    .digest("hex");
}

export async function validateLeadReferences(client, tenantId, payload) {
  const serviceId = payload?.serviceId ? sanitizeId(payload.serviceId) : null;
  const professionalId = payload?.professionalId ? sanitizeId(payload.professionalId) : null;
  if (payload?.serviceId && !serviceId) throw createHttpError(400, "serviceId inválido");
  if (payload?.professionalId && !professionalId) throw createHttpError(400, "professionalId inválido");

  if (serviceId) {
    const service = await client.service.findFirst({ where: { id: serviceId, tenantId, active: true } });
    if (!service) throw createHttpError(404, "Serviço não encontrado");
  }
  if (professionalId) {
    const professional = await client.professional.findFirst({ where: { id: professionalId, tenantId, active: true } });
    if (!professional) throw createHttpError(404, "Profissional não encontrado");
  }
  return { serviceId, professionalId };
}

export async function createOrReuseLead(client, {
  tenantId,
  clientId,
  source,
  serviceId = null,
  professionalId = null,
  interestSummary = null,
  actorType,
  actorId = null
}) {
  const cleanInterest = sanitizeText(interestSummary, 500);
  const dedupeKey = leadDedupeKey({ source, serviceId, professionalId, interestSummary: cleanInterest });
  const existing = await client.lead.findFirst({
    where: { tenantId, clientId, dedupeKey, status: { in: activeLeadStatuses } },
    include: { client: true, service: true, professional: true }
  });
  if (existing) return { lead: existing, created: false };

  const lead = await client.lead.create({
    data: {
      tenantId,
      clientId,
      source,
      serviceId,
      professionalId,
      interestSummary: cleanInterest,
      dedupeKey
    },
    include: { client: true, service: true, professional: true }
  });
  await appendRelationshipEvent(client, {
    tenantId,
    clientId,
    leadId: lead.id,
    type: "LEAD_CREATED",
    actorType,
    actorId,
    metadata: { source }
  });
  return { lead, created: true };
}

export function assertLeadTransition(fromStatus, toStatus) {
  if (!Object.hasOwn(leadTransitions, toStatus)) throw createHttpError(400, "Status de lead inválido");
  if (fromStatus === toStatus) return { idempotent: true };
  if (!leadTransitions[fromStatus]?.includes(toStatus)) {
    throw createHttpError(409, `Transição de ${fromStatus} para ${toStatus} não permitida`);
  }
  return { idempotent: false };
}

export async function lockClient(client, clientId, tenantId) {
  await client.$queryRaw`
    SELECT "id" FROM "Client"
    WHERE "id" = ${clientId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
}

export async function lockLead(client, leadId, tenantId) {
  await client.$queryRaw`
    SELECT "id" FROM "Lead"
    WHERE "id" = ${leadId} AND "tenantId" = ${tenantId}
    FOR UPDATE
  `;
}

export function isSerializableConflict(error) {
  return error?.code === "P2002"
    || error?.code === "P2034"
    || (error?.code === "P2010" && error?.meta?.code === "40001");
}

export async function runSerializable(prisma, operation, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      lastError = error;
      if (!isSerializableConflict(error) || attempt === attempts - 1) throw error;
    }
  }
  throw lastError;
}
