import prisma from "../prismaClient.js";
import { appendRelationshipEvent, sanitizeText } from "../services/relationshipService.js";
import { createHttpError, sanitizeId } from "./utils.js";

const types = ["CONTACT", "RETURN", "EVALUATION", "WAITLIST", "OTHER"];

function parseDueAt(value) {
  const dueAt = new Date(value);
  if (!value || Number.isNaN(dueAt.getTime())) throw createHttpError(400, "Data do follow-up inválida");
  return dueAt;
}

async function tenantFollowUp(tx, id, tenantId) {
  const followUp = await tx.followUp.findFirst({
    where: { id, tenantId },
    include: { client: true, lead: { select: { id: true, source: true, status: true, interestSummary: true } } }
  });
  if (!followUp) throw createHttpError(404, "Follow-up não encontrado");
  return followUp;
}

export async function listFollowUps(req, res, next) {
  try {
    const now = new Date();
    const overdue = req.query.overdue === "true";
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    if (from && Number.isNaN(from.getTime())) throw createHttpError(400, "Período inválido");
    if (to && Number.isNaN(to.getTime())) throw createHttpError(400, "Período inválido");
    if (to) to.setUTCHours(23, 59, 59, 999);
    const followUps = await prisma.followUp.findMany({
      where: {
        tenantId: req.auth.tenantId,
        ...(overdue ? { status: "OPEN", dueAt: { lt: now } } : {}),
        ...(!overdue && (from || to) ? { dueAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {})
      },
      include: { client: true, lead: { select: { id: true, source: true, status: true, interestSummary: true } } },
      orderBy: [{ dueAt: "asc" }, { id: "asc" }],
      take: 100
    });
    res.json(followUps.map((followUp) => ({
      ...followUp,
      overdue: followUp.status === "OPEN" && followUp.dueAt < now
    })));
  } catch (error) {
    next(error);
  }
}

export async function createFollowUp(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const clientId = sanitizeId(req.body?.clientId);
    const leadId = req.body?.leadId ? sanitizeId(req.body.leadId) : null;
    const dueAt = parseDueAt(req.body?.dueAt);
    const type = req.body?.type;
    const note = sanitizeText(req.body?.note, 500);
    if (!clientId) throw createHttpError(400, "clientId inválido");
    if (req.body?.leadId && !leadId) throw createHttpError(400, "leadId inválido");
    if (!types.includes(type)) throw createHttpError(400, "Tipo inválido");

    const created = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({ where: { id: clientId, tenantId } });
      if (!client) throw createHttpError(404, "Cliente não encontrado");
      if (leadId) {
        const lead = await tx.lead.findFirst({ where: { id: leadId, clientId, tenantId } });
        if (!lead) throw createHttpError(404, "Lead não encontrado");
      }
      const followUp = await tx.followUp.create({
        data: { tenantId, clientId, leadId, dueAt, type, note, createdByUserId: req.auth.userId },
        include: { client: true, lead: { select: { id: true, source: true, status: true, interestSummary: true } } }
      });
      await appendRelationshipEvent(tx, {
        tenantId,
        clientId,
        leadId,
        type: "FOLLOW_UP_CREATED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { followUpId: followUp.id }
      });
      return followUp;
    });
    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
}

async function closeFollowUp(req, res, next, status) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const updated = await prisma.$transaction(async (tx) => {
      const followUp = await tenantFollowUp(tx, id, req.auth.tenantId);
      if (followUp.status === status) return followUp;
      if (followUp.status !== "OPEN") throw createHttpError(409, "Follow-up já encerrado");
      const saved = await tx.followUp.update({
        where: { id },
        data: status === "COMPLETED"
          ? { status, completedAt: new Date(), completedByUserId: req.auth.userId }
          : { status },
        include: { client: true, lead: { select: { id: true, source: true, status: true, interestSummary: true } } }
      });
      if (status === "COMPLETED") {
        await appendRelationshipEvent(tx, {
          tenantId: req.auth.tenantId,
          clientId: followUp.clientId,
          leadId: followUp.leadId,
          type: "FOLLOW_UP_COMPLETED",
          actorType: "ADMIN",
          actorId: req.auth.userId,
          metadata: { followUpId: id }
        });
      }
      return saved;
    });
    res.json(updated);
  } catch (error) {
    next(error);
  }
}

export function completeFollowUp(req, res, next) {
  return closeFollowUp(req, res, next, "COMPLETED");
}

export function cancelFollowUp(req, res, next) {
  return closeFollowUp(req, res, next, "CANCELLED");
}
