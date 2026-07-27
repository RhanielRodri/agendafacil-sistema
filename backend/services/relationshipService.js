import { createHash } from "node:crypto";
import { createHttpError, sanitizeId } from "../controllers/utils.js";
import { parseBrazilPhone, phoneLookupValues } from "./phoneService.js";

export const activeLeadStatuses = ["NEW", "CONTACTED", "QUALIFIED"];
export const leadPriorities = ["LOW", "NORMAL", "HIGH"];
export const lostReasons = [
  "NO_RESPONSE",
  "PRICE",
  "NO_AVAILABILITY",
  "CHANGED_MIND",
  "NOT_A_FIT",
  "DUPLICATE",
  "OTHER"
];
export const followUpTypes = ["CONTACT", "RETURN", "EVALUATION", "WAITLIST", "OTHER"];
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
  "leadId",
  "content",
  "priority",
  "fromPriority",
  "toPriority",
  "fromOwnerUserId",
  "toOwnerUserId",
  "qualificationVersion",
  "lostReason",
  "lostReasonNote",
  "closedFollowUps"
]);

const qualificationFields = Object.freeze({
  "studio-cut": Object.freeze({
    firstVisit: "boolean",
    serviceInterest: "shortText",
    preferredProfessionalId: "professional",
    availability: "mediumText",
    commercialNote: "mediumText",
    acceptsAnyProfessional: "boolean",
    bestContactPeriod: "contactPeriod",
    wantsImmediateOpening: "boolean",
    urgency: "urgency"
  }),
  lumiere: Object.freeze({
    firstVisit: "boolean",
    procedureInterest: "shortText",
    preferredProfessionalId: "professional",
    availability: "mediumText",
    commercialNote: "mediumText",
    bestContactPeriod: "contactPeriod",
    requestsEvaluation: "boolean",
    statedGoal: "mediumText",
    packageInterest: "boolean"
  })
});

const clinicalTerms = /\b(diagn[oó]stico|doen[cç]a|prescri[cç][aã]o|prontu[aá]rio|medicamento|sintoma|laudo)\b/i;

export function sanitizeText(value, maxLength) {
  if (typeof value !== "string") return null;
  const clean = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean ? clean.slice(0, maxLength) : null;
}

export function parsePagination(query, { defaultLimit = 20, maxLimit = 50 } = {}) {
  const rawPage = query?.page ?? "1";
  const rawLimit = query?.limit ?? String(defaultLimit);
  if (!/^\d+$/.test(String(rawPage)) || !/^\d+$/.test(String(rawLimit))) {
    throw createHttpError(400, "Paginação inválida");
  }
  const page = Number(rawPage);
  const limit = Number(rawLimit);
  if (page < 1 || limit < 1 || limit > maxLimit) {
    throw createHttpError(400, `Paginação deve usar página positiva e limite máximo ${maxLimit}`);
  }
  return { page, limit, skip: (page - 1) * limit };
}

export function paginationResult(items, total, page, limit) {
  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit))
    }
  };
}

export async function validateActiveOwner(client, tenantId, value, { allowNull = true } = {}) {
  if ((value === null || value === "" || value === undefined) && allowNull) return null;
  const ownerUserId = sanitizeId(value);
  if (!ownerUserId) throw createHttpError(400, "Responsável inválido");
  const owner = await client.adminUser.findFirst({ where: { id: ownerUserId, tenantId } });
  if (!owner) throw createHttpError(404, "Responsável não encontrado");
  if (!owner.active) throw createHttpError(409, "Usuário inativo não pode receber atribuição");
  return ownerUserId;
}

function cleanQualificationText(value, maxLength) {
  const clean = sanitizeText(value, maxLength);
  if (!clean) throw createHttpError(400, "Campo textual da qualificação inválido");
  if (clinicalTerms.test(clean)) {
    throw createHttpError(400, "Não registre dados clínicos ou médicos na qualificação");
  }
  return clean;
}

export function sanitizeCommercialText(value, maxLength) {
  const clean = sanitizeText(value, maxLength);
  if (clean && clinicalTerms.test(clean)) {
    throw createHttpError(400, "Não registre dados clínicos ou médicos neste campo comercial");
  }
  return clean;
}

export async function validateLeadQualification(client, tenantId, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw createHttpError(400, "Qualificação inválida");
  }
  if (Buffer.byteLength(JSON.stringify(payload), "utf8") > 4096) {
    throw createHttpError(400, "Qualificação excede o limite permitido");
  }
  const schema = qualificationFields[tenantId];
  if (!schema) throw createHttpError(400, "Vertical sem schema de qualificação");
  const entries = Object.entries(payload);
  if (!entries.length) throw createHttpError(400, "Informe ao menos um campo de qualificação");
  const clean = {};
  for (const [field, value] of entries) {
    const kind = schema[field];
    if (!kind) throw createHttpError(400, `Campo de qualificação não permitido: ${field}`);
    if (kind === "boolean") {
      if (typeof value !== "boolean") throw createHttpError(400, `${field} deve ser booleano`);
      clean[field] = value;
    } else if (kind === "shortText") {
      clean[field] = cleanQualificationText(value, 120);
    } else if (kind === "mediumText") {
      clean[field] = cleanQualificationText(value, field === "commercialNote" ? 300 : 500);
    } else if (kind === "professional") {
      if (value === null || value === "") {
        clean[field] = null;
      } else {
        const professionalId = sanitizeId(value);
        if (!professionalId) throw createHttpError(400, "Profissional preferido inválido");
        const professional = await client.professional.findFirst({ where: { id: professionalId, tenantId, active: true } });
        if (!professional) throw createHttpError(404, "Profissional preferido não encontrado");
        clean[field] = professionalId;
      }
    } else if (kind === "contactPeriod") {
      if (!["MORNING", "AFTERNOON", "EVENING", "ANY"].includes(value)) {
        throw createHttpError(400, "Melhor período de contato inválido");
      }
      clean[field] = value;
    } else if (kind === "urgency") {
      if (!["TODAY", "THIS_WEEK", "FLEXIBLE"].includes(value)) {
        throw createHttpError(400, "Urgência inválida");
      }
      clean[field] = value;
    }
  }
  return clean;
}

export function normalizePhone(value) {
  const phone = parseBrazilPhone(value);
  if (!phone) {
    throw createHttpError(400, "Telefone inválido");
  }
  return phone.normalized;
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
  return { name, phone: normalizedPhone, normalizedPhone, email, normalizedEmail };
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
  const [canonicalPhone, legacyPhone] = phoneLookupValues(person.normalizedPhone);
  const existing = await client.client.findUnique({
    where: {
      tenantId_normalizedPhone: {
        tenantId,
        normalizedPhone: canonicalPhone
      }
    }
  }) || await client.client.findUnique({
    where: {
      tenantId_normalizedPhone: {
        tenantId,
        normalizedPhone: legacyPhone
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
  if (existing.phone !== person.phone || existing.normalizedPhone !== person.normalizedPhone) {
    changes.phone = person.phone;
    changes.normalizedPhone = person.normalizedPhone;
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
  priority = "NORMAL",
  ownerUserId = null,
  qualification = null,
  qualificationVersion = null,
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
      priority,
      ownerUserId,
      qualification,
      qualificationVersion,
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

export function validateFollowUpPayload(payload) {
  const dueAt = new Date(payload?.dueAt);
  if (!payload?.dueAt || Number.isNaN(dueAt.getTime())) {
    throw createHttpError(400, "Data do follow-up inválida");
  }
  if (!followUpTypes.includes(payload?.type)) throw createHttpError(400, "Tipo de follow-up inválido");
  return { dueAt, type: payload.type, note: sanitizeText(payload?.note, 500) };
}

export async function createLeadFollowUp(client, {
  tenantId,
  lead,
  payload,
  creatorUserId,
  actorType,
  actorId = null,
  defaultOwnerUserId = null
}) {
  const fields = validateFollowUpPayload(payload);
  const ownerUserId = await validateActiveOwner(
    client,
    tenantId,
    payload?.ownerUserId ?? defaultOwnerUserId,
    { allowNull: true }
  );
  const followUp = await client.followUp.create({
    data: {
      tenantId,
      clientId: lead.clientId,
      leadId: lead.id,
      ...fields,
      ownerUserId,
      createdByUserId: creatorUserId
    },
    include: {
      owner: { select: { id: true, name: true, active: true } },
      client: true,
      lead: { select: { id: true, source: true, status: true, interestSummary: true } }
    }
  });
  await appendRelationshipEvent(client, {
    tenantId,
    clientId: lead.clientId,
    leadId: lead.id,
    type: "FOLLOW_UP_CREATED",
    actorType,
    actorId,
    metadata: { followUpId: followUp.id }
  });
  return followUp;
}

export async function closeOpenLeadFollowUps(client, { tenantId, lead, actorId }) {
  const open = await client.followUp.findMany({
    where: { tenantId, leadId: lead.id, status: "OPEN" },
    orderBy: { id: "asc" }
  });
  for (const followUp of open) {
    await client.followUp.update({ where: { id: followUp.id }, data: { status: "CANCELLED" } });
    await appendRelationshipEvent(client, {
      tenantId,
      clientId: lead.clientId,
      leadId: lead.id,
      type: "FOLLOW_UP_CANCELLED",
      actorType: "ADMIN",
      actorId,
      metadata: { followUpId: followUp.id, reason: "LEAD_TERMINAL" }
    });
  }
  return open.length;
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
