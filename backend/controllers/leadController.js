import prisma from "../prismaClient.js";
import { assertAvailableSlot } from "../services/availabilityService.js";
import { appendHistoryEvent } from "../services/appointmentLifecycleService.js";
import {
  activeLeadStatuses,
  appendRelationshipEvent,
  assertLeadTransition,
  closeOpenLeadFollowUps,
  createLeadFollowUp,
  createOrReuseLead,
  leadPriorities,
  lockLead,
  lostReasons,
  paginationResult,
  parsePagination,
  runSerializable,
  sanitizeCommercialText,
  sanitizeText,
  validateActiveOwner,
  validateLeadQualification,
  validateLeadReferences
} from "../services/relationshipService.js";
import { createHttpError, isDateInPast, isValidDateInput, sanitizeId } from "./utils.js";
import { phoneSearchValues } from "../services/phoneService.js";

const sources = ["BOOKING", "WAITLIST", "EVALUATION", "CONTACT", "ABANDONED_BOOKING", "MANUAL"];
const statuses = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];

const listInclude = {
  client: { select: { id: true, name: true, phone: true, email: true } },
  service: true,
  professional: true,
  owner: { select: { id: true, name: true, active: true } },
  convertedAppointment: { include: { service: true, professional: true } },
  followUps: {
    where: { status: "OPEN" },
    include: { owner: { select: { id: true, name: true, active: true } } },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }],
    take: 1
  }
};

const detailInclude = {
  ...listInclude,
  lostBy: { select: { id: true, name: true } },
  sourceAppointments: {
    include: { service: true, professional: true },
    orderBy: [{ date: "desc" }, { time: "desc" }]
  },
  relationshipHistory: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
  followUps: {
    include: {
      owner: { select: { id: true, name: true, active: true } },
      createdBy: { select: { id: true, name: true } },
      completedBy: { select: { id: true, name: true } }
    },
    orderBy: [{ dueAt: "asc" }, { id: "asc" }]
  }
};

function safeLead(lead) {
  const { dedupeKey, ...safe } = lead;
  return {
    ...safe,
    nextFollowUp: lead.followUps?.find((followUp) => followUp.status === "OPEN") || null,
    overdue: Boolean(lead.followUps?.find((followUp) => followUp.status === "OPEN" && new Date(followUp.dueAt) < new Date()))
  };
}

async function tenantLead(tx, id, tenantId, include = detailInclude) {
  const lead = await tx.lead.findFirst({ where: { id, tenantId }, include });
  if (!lead) throw createHttpError(404, "Lead não encontrado");
  return lead;
}

function parseDate(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw createHttpError(400, "Período inválido");
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function parseBoolean(value, label) {
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw createHttpError(400, `${label} inválido`);
}

export async function listLeads(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const status = req.query.status;
    const source = req.query.source;
    const priority = req.query.priority;
    const search = sanitizeText(req.query.search, 120);
    const phoneSearches = phoneSearchValues(search);
    const service = sanitizeText(req.query.service, 120);
    const ownerUserId = req.query.ownerUserId ? sanitizeId(req.query.ownerUserId) : null;
    const createdFrom = parseDate(req.query.createdFrom);
    const createdTo = parseDate(req.query.createdTo, true);
    const overdue = parseBoolean(req.query.overdue, "Filtro de vencidos");
    const noNextAction = parseBoolean(req.query.noNextAction, "Filtro sem próxima ação");
    const unassigned = parseBoolean(req.query.unassigned, "Filtro sem responsável");
    const attention = parseBoolean(req.query.attention, "Filtro de atenção");
    if (status && !statuses.includes(status)) throw createHttpError(400, "Status inválido");
    if (source && !sources.includes(source)) throw createHttpError(400, "Origem inválida");
    if (priority && !leadPriorities.includes(priority)) throw createHttpError(400, "Prioridade inválida");
    if (req.query.ownerUserId && !ownerUserId) throw createHttpError(400, "Responsável inválido");

    const where = {
      tenantId: req.auth.tenantId,
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
      ...(priority ? { priority } : {}),
      ...(ownerUserId ? { ownerUserId } : {}),
      ...(unassigned ? { ownerUserId: null } : {}),
      ...(search ? {
        OR: [
          { client: { name: { contains: search, mode: "insensitive" } } },
          { client: { phone: { contains: search } } },
          ...phoneSearches.map((value) => ({ client: { normalizedPhone: { contains: value } } })),
          { interestSummary: { contains: search, mode: "insensitive" } }
        ]
      } : {}),
      ...(service ? (/^\d+$/.test(service)
        ? { serviceId: Number(service) }
        : { service: { name: { contains: service, mode: "insensitive" } } }) : {}),
      ...((createdFrom || createdTo) ? { createdAt: { ...(createdFrom ? { gte: createdFrom } : {}), ...(createdTo ? { lte: createdTo } : {}) } } : {}),
      ...(overdue ? { followUps: { some: { status: "OPEN", dueAt: { lt: new Date() } } } } : {}),
      ...(noNextAction ? {
        status: { in: activeLeadStatuses },
        followUps: { none: { status: "OPEN" } }
      } : {}),
      ...(unassigned && !noNextAction && !status ? { status: { in: activeLeadStatuses } } : {}),
      // Fila de atenção: lead ativo sem próxima ação, com follow-up vencido ou
      // sem responsável. Expresso em AND para não colidir com a busca textual.
      ...(attention ? {
        status: { in: activeLeadStatuses },
        AND: [{
          OR: [
            { followUps: { none: { status: "OPEN" } } },
            { followUps: { some: { status: "OPEN", dueAt: { lt: new Date() } } } },
            { ownerUserId: null }
          ]
        }]
      } : {})
    };

    const [total, leads] = await Promise.all([
      prisma.lead.count({ where }),
      prisma.lead.findMany({
        where,
        include: listInclude,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit
      })
    ]);
    const items = leads.map(safeLead);
    if (req.query.page === undefined && req.query.limit === undefined) {
      res.json(items);
      return;
    }
    res.json(paginationResult(items, total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function getLead(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const lead = await tenantLead(prisma, id, req.auth.tenantId);
    const actorIds = [...new Set(lead.relationshipHistory.map((event) => event.actorId).filter(Boolean))];
    const actors = actorIds.length ? await prisma.adminUser.findMany({
      where: { tenantId: req.auth.tenantId, id: { in: actorIds } },
      select: { id: true, name: true }
    }) : [];
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));
    res.json(safeLead({
      ...lead,
      relationshipHistory: lead.relationshipHistory.map((event) => ({
        ...event,
        actor: event.actorId ? actorById.get(event.actorId) || null : null
      }))
    }));
  } catch (error) {
    next(error);
  }
}

export async function createLead(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const clientId = sanitizeId(req.body?.clientId);
    const source = req.body?.source || "MANUAL";
    const priority = req.body?.priority || "NORMAL";
    if (!clientId) throw createHttpError(400, "clientId inválido");
    if (!sources.includes(source)) throw createHttpError(400, "Origem inválida");
    if (!leadPriorities.includes(priority)) throw createHttpError(400, "Prioridade inválida");
    if (!req.body?.nextFollowUp) throw createHttpError(400, "Próxima ação é obrigatória para um lead ativo");

    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({ where: { id: clientId, tenantId } });
      if (!client) throw createHttpError(404, "Cliente não encontrado");
      const refs = await validateLeadReferences(tx, tenantId, req.body);
      const ownerUserId = await validateActiveOwner(tx, tenantId, req.body?.ownerUserId ?? req.auth.userId, { allowNull: false });
      const qualification = req.body?.qualification
        ? await validateLeadQualification(tx, tenantId, req.body.qualification)
        : null;
      const leadResult = await createOrReuseLead(tx, {
        tenantId,
        clientId,
        source,
        ...refs,
        interestSummary: req.body?.interestSummary,
        priority,
        ownerUserId,
        qualification,
        qualificationVersion: qualification ? 1 : null,
        actorType: "ADMIN",
        actorId: req.auth.userId
      });
      if (leadResult.created) {
        await createLeadFollowUp(tx, {
          tenantId,
          lead: leadResult.lead,
          payload: req.body.nextFollowUp,
          creatorUserId: req.auth.userId,
          actorType: "ADMIN",
          actorId: req.auth.userId,
          defaultOwnerUserId: ownerUserId
        });
      }
      return { ...leadResult, lead: await tenantLead(tx, leadResult.lead.id, tenantId) };
    });
    res.status(result.created ? 201 : 200).json(safeLead(result.lead));
  } catch (error) {
    next(error?.code === "P2002" ? createHttpError(409, "Lead ativo equivalente já existe") : error);
  }
}

export async function updateLeadStatus(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    const toStatus = req.body?.status;
    if (!id) throw createHttpError(400, "ID inválido");
    if (["CONVERTED", "LOST"].includes(toStatus)) {
      throw createHttpError(400, "Use a ação específica para converter ou perder o lead");
    }
    const updated = await prisma.$transaction(async (tx) => {
      await lockLead(tx, id, req.auth.tenantId);
      const lead = await tenantLead(tx, id, req.auth.tenantId);
      const transition = assertLeadTransition(lead.status, toStatus);
      if (transition.idempotent) return lead;
      const openCount = await tx.followUp.count({ where: { tenantId: req.auth.tenantId, leadId: id, status: "OPEN" } });
      if (!openCount) {
        if (!req.body?.nextFollowUp) throw createHttpError(409, "Crie a próxima ação antes de avançar o lead");
        await createLeadFollowUp(tx, {
          tenantId: req.auth.tenantId,
          lead,
          payload: req.body.nextFollowUp,
          creatorUserId: req.auth.userId,
          actorType: "ADMIN",
          actorId: req.auth.userId,
          defaultOwnerUserId: lead.ownerUserId
        });
      }
      await tx.lead.update({ where: { id }, data: { status: toStatus } });
      await appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: lead.clientId,
        leadId: id,
        type: "LEAD_STATUS_CHANGED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { fromStatus: lead.status, toStatus }
      });
      return tenantLead(tx, id, req.auth.tenantId);
    });
    res.json(safeLead(updated));
  } catch (error) {
    next(error);
  }
}

export async function updateLeadPriority(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    const priority = req.body?.priority;
    if (!id) throw createHttpError(400, "ID inválido");
    if (!leadPriorities.includes(priority)) throw createHttpError(400, "Prioridade inválida");
    const result = await prisma.$transaction(async (tx) => {
      await lockLead(tx, id, req.auth.tenantId);
      const lead = await tenantLead(tx, id, req.auth.tenantId);
      if (lead.priority === priority) return lead;
      await tx.lead.update({ where: { id }, data: { priority } });
      await appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: lead.clientId,
        leadId: id,
        type: "LEAD_PRIORITY_CHANGED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { fromPriority: lead.priority, toPriority: priority }
      });
      return tenantLead(tx, id, req.auth.tenantId);
    });
    res.json(safeLead(result));
  } catch (error) {
    next(error);
  }
}

export async function assignLeadOwner(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const result = await prisma.$transaction(async (tx) => {
      await lockLead(tx, id, req.auth.tenantId);
      const lead = await tenantLead(tx, id, req.auth.tenantId);
      const ownerUserId = await validateActiveOwner(tx, req.auth.tenantId, req.body?.ownerUserId, { allowNull: true });
      if (lead.ownerUserId === ownerUserId) return lead;
      await tx.lead.update({ where: { id }, data: { ownerUserId } });
      await appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: lead.clientId,
        leadId: id,
        type: "LEAD_OWNER_CHANGED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: {
          fromOwnerUserId: lead.ownerUserId || 0,
          toOwnerUserId: ownerUserId || 0
        }
      });
      return tenantLead(tx, id, req.auth.tenantId);
    });
    res.json(safeLead(result));
  } catch (error) {
    next(error);
  }
}

export async function updateLeadQualification(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const result = await prisma.$transaction(async (tx) => {
      await lockLead(tx, id, req.auth.tenantId);
      const lead = await tenantLead(tx, id, req.auth.tenantId);
      const qualification = await validateLeadQualification(tx, req.auth.tenantId, req.body?.qualification);
      await tx.lead.update({ where: { id }, data: { qualification, qualificationVersion: 1 } });
      await appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: lead.clientId,
        leadId: id,
        type: "LEAD_QUALIFICATION_UPDATED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { fields: Object.keys(qualification).join(","), qualificationVersion: 1 }
      });
      return tenantLead(tx, id, req.auth.tenantId);
    });
    res.json(safeLead(result));
  } catch (error) {
    next(error);
  }
}

export async function loseLead(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const legacyReason = !req.body?.lostReason ? sanitizeText(req.body?.reason, 300) : null;
    const result = await prisma.$transaction(async (tx) => {
      await lockLead(tx, id, req.auth.tenantId);
      const lead = await tenantLead(tx, id, req.auth.tenantId);
      const transition = assertLeadTransition(lead.status, "LOST");
      if (transition.idempotent) return lead;
      const lostReason = req.body?.lostReason || (legacyReason ? "OTHER" : null);
      const lostReasonNote = sanitizeText(req.body?.lostReasonNote ?? legacyReason, 300);
      if (!lostReasons.includes(lostReason)) throw createHttpError(400, "Motivo da perda é obrigatório e deve ser estruturado");
      if (lostReason === "OTHER" && !lostReasonNote) throw createHttpError(400, "Observação é obrigatória para o motivo OTHER");
      const lostAt = new Date();
      await tx.lead.update({
        where: { id },
        data: { status: "LOST", lostReason, lostReasonNote, lostAt, lostByUserId: req.auth.userId }
      });
      await appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: lead.clientId,
        leadId: id,
        type: "LEAD_STATUS_CHANGED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { fromStatus: lead.status, toStatus: "LOST" }
      });
      const closedFollowUps = await closeOpenLeadFollowUps(tx, {
        tenantId: req.auth.tenantId,
        lead,
        actorId: req.auth.userId
      });
      await appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: lead.clientId,
        leadId: id,
        type: "LEAD_LOST",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { lostReason, lostReasonNote, closedFollowUps }
      });
      return tenantLead(tx, id, req.auth.tenantId);
    });
    const safe = safeLead(result);
    res.json(legacyReason ? { ...safe, lostReason: legacyReason } : safe);
  } catch (error) {
    next(error);
  }
}

async function linkLeadToAppointment(tx, { tenantId, lead, appointmentId, actorId }) {
  const appointment = await tx.appointment.findFirst({ where: { id: appointmentId, tenantId } });
  if (!appointment) throw createHttpError(404, "Agendamento não encontrado");
  if (appointment.clientId !== lead.clientId) throw createHttpError(409, "Lead e agendamento pertencem a clientes diferentes");
  if (appointment.status === "CANCELLED") throw createHttpError(409, "Agendamento cancelado não pode gerar conversão");
  if (appointment.leadId && appointment.leadId !== lead.id) throw createHttpError(409, "Agendamento já está vinculado a outro lead");
  if (!appointment.leadId) {
    await tx.appointment.update({ where: { id: appointment.id }, data: { leadId: lead.id } });
    await appendRelationshipEvent(tx, {
      tenantId,
      clientId: lead.clientId,
      leadId: lead.id,
      appointmentId: appointment.id,
      type: "APPOINTMENT_LINKED",
      actorType: "ADMIN",
      actorId,
      metadata: { appointmentId: appointment.id, leadId: lead.id }
    });
  }
  return appointment;
}

async function createAppointmentFromLead(tx, { tenantId, lead, payload, actorId }) {
  const date = payload?.date;
  const time = payload?.time;
  const serviceId = sanitizeId(payload?.serviceId || lead.serviceId);
  const professionalId = sanitizeId(payload?.professionalId || lead.professionalId);
  if (!serviceId || !professionalId) throw createHttpError(400, "Serviço e profissional são obrigatórios");
  if (!isValidDateInput(date) || isDateInPast(date)) throw createHttpError(400, "Data do agendamento inválida");
  const availability = await assertAvailableSlot({ client: tx, tenantId, date, time, serviceId, professionalId });
  const appointment = await tx.appointment.create({
    data: {
      tenantId,
      serviceId,
      professionalId,
      clientId: lead.clientId,
      leadId: lead.id,
      clientName: lead.client.name,
      clientPhone: lead.client.phone,
      clientEmail: lead.client.email,
      date: availability.appointmentDate,
      time,
      status: "PENDING"
    }
  });
  await appendHistoryEvent(tx, {
    tenantId,
    appointmentId: appointment.id,
    type: "CREATED",
    toStatus: "PENDING",
    actorType: "ADMIN",
    actorId
  });
  await appendRelationshipEvent(tx, {
    tenantId,
    clientId: lead.clientId,
    leadId: lead.id,
    appointmentId: appointment.id,
    type: "APPOINTMENT_LINKED",
    actorType: "ADMIN",
    actorId,
    metadata: { appointmentId: appointment.id, leadId: lead.id }
  });
  return appointment;
}

export async function linkLeadAppointment(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    const appointmentId = sanitizeId(req.body?.appointmentId);
    if (!id || !appointmentId) throw createHttpError(400, "IDs inválidos");
    const result = await prisma.$transaction(async (tx) => {
      const lead = await tenantLead(tx, id, req.auth.tenantId);
      await linkLeadToAppointment(tx, { tenantId: req.auth.tenantId, lead, appointmentId, actorId: req.auth.userId });
      return tenantLead(tx, id, req.auth.tenantId);
    });
    res.json(safeLead(result));
  } catch (error) {
    next(error);
  }
}

export async function convertLead(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const result = await runSerializable(prisma, async (tx) => {
      await lockLead(tx, id, req.auth.tenantId);
      const lead = await tenantLead(tx, id, req.auth.tenantId);
      const transition = assertLeadTransition(lead.status, "CONVERTED");
      const requestedAppointmentId = sanitizeId(req.body?.appointmentId);
      if (transition.idempotent) {
        if (requestedAppointmentId && lead.convertedAppointmentId !== requestedAppointmentId) {
          throw createHttpError(409, "Lead já convertido por outro agendamento");
        }
        return lead;
      }
      let appointment;
      if (requestedAppointmentId) {
        appointment = await linkLeadToAppointment(tx, {
          tenantId: req.auth.tenantId,
          lead,
          appointmentId: requestedAppointmentId,
          actorId: req.auth.userId
        });
      } else if (req.body?.appointment) {
        appointment = await createAppointmentFromLead(tx, {
          tenantId: req.auth.tenantId,
          lead,
          payload: req.body.appointment,
          actorId: req.auth.userId
        });
      } else {
        throw createHttpError(400, "Informe um agendamento existente ou os dados para criar um");
      }
      const convertedAt = new Date();
      await tx.lead.update({
        where: { id },
        data: { status: "CONVERTED", convertedAt, convertedAppointmentId: appointment.id }
      });
      await appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: lead.clientId,
        leadId: id,
        appointmentId: appointment.id,
        type: "LEAD_STATUS_CHANGED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { fromStatus: lead.status, toStatus: "CONVERTED" }
      });
      const closedFollowUps = await closeOpenLeadFollowUps(tx, {
        tenantId: req.auth.tenantId,
        lead,
        actorId: req.auth.userId
      });
      await appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: lead.clientId,
        leadId: id,
        appointmentId: appointment.id,
        type: "LEAD_CONVERTED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { fromStatus: lead.status, toStatus: "CONVERTED", appointmentId: appointment.id, closedFollowUps }
      });
      return tenantLead(tx, id, req.auth.tenantId);
    });
    res.json(safeLead(result));
  } catch (error) {
    next(error);
  }
}

export async function addLeadNote(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    const content = sanitizeCommercialText(req.body?.content ?? req.body?.note, 500);
    if (!id) throw createHttpError(400, "ID inválido");
    if (!content) throw createHttpError(400, "Nota inválida");
    const event = await prisma.$transaction(async (tx) => {
      const lead = await tenantLead(tx, id, req.auth.tenantId);
      return appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: lead.clientId,
        leadId: id,
        type: "NOTE_ADDED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { content }
      });
    });
    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
}
