import prisma from "../prismaClient.js";
import {
  appendRelationshipEvent,
  assertLeadTransition,
  createOrReuseLead,
  lockLead,
  sanitizeText,
  validateLeadReferences
} from "../services/relationshipService.js";
import { createHttpError, sanitizeId } from "./utils.js";

const leadInclude = {
  client: true,
  service: true,
  professional: true,
  convertedAppointment: { include: { service: true, professional: true } },
  followUps: { orderBy: { dueAt: "asc" } }
};

const sources = ["BOOKING", "WAITLIST", "EVALUATION", "CONTACT", "ABANDONED_BOOKING", "MANUAL"];
const statuses = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];

function safeLead(lead) {
  const { dedupeKey, ...safe } = lead;
  return safe;
}

async function tenantLead(tx, id, tenantId) {
  const lead = await tx.lead.findFirst({ where: { id, tenantId }, include: leadInclude });
  if (!lead) throw createHttpError(404, "Lead não encontrado");
  return lead;
}

export async function listLeads(req, res, next) {
  try {
    const status = req.query.status;
    const source = req.query.source;
    if (status && !statuses.includes(status)) throw createHttpError(400, "Status inválido");
    if (source && !sources.includes(source)) throw createHttpError(400, "Origem inválida");
    const leads = await prisma.lead.findMany({
      where: { tenantId: req.auth.tenantId, ...(status ? { status } : {}), ...(source ? { source } : {}) },
      include: leadInclude,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100
    });
    res.json(leads.map(safeLead));
  } catch (error) {
    next(error);
  }
}

export async function getLead(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    res.json(safeLead(await tenantLead(prisma, id, req.auth.tenantId)));
  } catch (error) {
    next(error);
  }
}

export async function createLead(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const clientId = sanitizeId(req.body?.clientId);
    const source = req.body?.source || "MANUAL";
    if (!clientId) throw createHttpError(400, "clientId inválido");
    if (!sources.includes(source)) throw createHttpError(400, "Origem inválida");
    const result = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({ where: { id: clientId, tenantId } });
      if (!client) throw createHttpError(404, "Cliente não encontrado");
      const refs = await validateLeadReferences(tx, tenantId, req.body);
      return createOrReuseLead(tx, {
        tenantId,
        clientId,
        source,
        ...refs,
        interestSummary: req.body?.interestSummary,
        actorType: "ADMIN",
        actorId: req.auth.userId
      });
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
      const saved = await tx.lead.update({ where: { id }, data: { status: toStatus }, include: leadInclude });
      await appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: lead.clientId,
        leadId: id,
        type: "LEAD_STATUS_CHANGED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { fromStatus: lead.status, toStatus }
      });
      return saved;
    });
    res.json(safeLead(updated));
  } catch (error) {
    next(error);
  }
}

export async function loseLead(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    const reason = sanitizeText(req.body?.reason, 300);
    if (!id) throw createHttpError(400, "ID inválido");
    if (!reason) throw createHttpError(400, "Motivo da perda é obrigatório");
    const updated = await prisma.$transaction(async (tx) => {
      await lockLead(tx, id, req.auth.tenantId);
      const lead = await tenantLead(tx, id, req.auth.tenantId);
      const transition = assertLeadTransition(lead.status, "LOST");
      if (transition.idempotent) return lead;
      const saved = await tx.lead.update({ where: { id }, data: { status: "LOST", lostReason: reason }, include: leadInclude });
      await appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: lead.clientId,
        leadId: id,
        type: "LEAD_LOST",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { fromStatus: lead.status, toStatus: "LOST", reason }
      });
      return saved;
    });
    res.json(safeLead(updated));
  } catch (error) {
    next(error);
  }
}

async function linkLeadToAppointment(tx, { tenantId, lead, appointmentId, actorId }) {
  const appointment = await tx.appointment.findFirst({ where: { id: appointmentId, tenantId } });
  if (!appointment) throw createHttpError(404, "Agendamento não encontrado");
  if (appointment.clientId !== lead.clientId) {
    throw createHttpError(409, "Lead e agendamento pertencem a clientes diferentes");
  }
  if (appointment.leadId && appointment.leadId !== lead.id) {
    throw createHttpError(409, "Agendamento já está vinculado a outro lead");
  }
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

export async function linkLeadAppointment(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    const appointmentId = sanitizeId(req.body?.appointmentId);
    if (!id || !appointmentId) throw createHttpError(400, "IDs inválidos");
    const result = await prisma.$transaction(async (tx) => {
      const lead = await tenantLead(tx, id, req.auth.tenantId);
      await linkLeadToAppointment(tx, {
        tenantId: req.auth.tenantId,
        lead,
        appointmentId,
        actorId: req.auth.userId
      });
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
    const appointmentId = sanitizeId(req.body?.appointmentId);
    if (!id || !appointmentId) throw createHttpError(400, "IDs inválidos");
    const result = await prisma.$transaction(async (tx) => {
      await lockLead(tx, id, req.auth.tenantId);
      const lead = await tenantLead(tx, id, req.auth.tenantId);
      const transition = assertLeadTransition(lead.status, "CONVERTED");
      if (lead.convertedAppointmentId && lead.convertedAppointmentId !== appointmentId) {
        throw createHttpError(409, "Lead já convertido por outro agendamento");
      }
      await linkLeadToAppointment(tx, {
        tenantId: req.auth.tenantId,
        lead,
        appointmentId,
        actorId: req.auth.userId
      });
      if (transition.idempotent) return tenantLead(tx, id, req.auth.tenantId);
      const saved = await tx.lead.update({
        where: { id },
        data: { status: "CONVERTED", convertedAt: new Date(), convertedAppointmentId: appointmentId },
        include: leadInclude
      });
      await appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: lead.clientId,
        leadId: id,
        appointmentId,
        type: "LEAD_CONVERTED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { fromStatus: lead.status, toStatus: "CONVERTED", appointmentId }
      });
      return saved;
    });
    res.json(safeLead(result));
  } catch (error) {
    next(error);
  }
}
