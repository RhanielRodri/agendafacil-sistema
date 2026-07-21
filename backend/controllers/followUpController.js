import prisma from "../prismaClient.js";
import {
  appendRelationshipEvent,
  createLeadFollowUp,
  followUpTypes,
  paginationResult,
  parsePagination,
  sanitizeText,
  validateActiveOwner,
  validateFollowUpPayload
} from "../services/relationshipService.js";
import { createHttpError, sanitizeId } from "./utils.js";

const statuses = ["OPEN", "COMPLETED", "CANCELLED"];

const followUpInclude = {
  client: true,
  owner: { select: { id: true, name: true, active: true } },
  createdBy: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  lead: { select: { id: true, source: true, status: true, priority: true, interestSummary: true } }
};

async function tenantFollowUp(tx, id, tenantId) {
  const followUp = await tx.followUp.findFirst({ where: { id, tenantId }, include: followUpInclude });
  if (!followUp) throw createHttpError(404, "Follow-up não encontrado");
  return followUp;
}

function parseDate(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw createHttpError(400, "Período inválido");
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function booleanQuery(value, label) {
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw createHttpError(400, `${label} inválido`);
}

function withOverdue(followUp, now = new Date()) {
  return { ...followUp, overdue: followUp.status === "OPEN" && new Date(followUp.dueAt) < now };
}

export async function listFollowUps(req, res, next) {
  try {
    const now = new Date();
    const { page, limit, skip } = parsePagination(req.query);
    const overdue = booleanQuery(req.query.overdue, "Filtro de vencidos");
    const unassigned = booleanQuery(req.query.unassigned, "Filtro sem responsável");
    const status = req.query.status;
    const type = req.query.type;
    const search = sanitizeText(req.query.search, 120);
    const ownerUserId = req.query.ownerUserId ? sanitizeId(req.query.ownerUserId) : null;
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to, true);
    const createdFrom = parseDate(req.query.createdFrom);
    const createdTo = parseDate(req.query.createdTo, true);
    if (status && !statuses.includes(status)) throw createHttpError(400, "Status inválido");
    if (type && !followUpTypes.includes(type)) throw createHttpError(400, "Tipo inválido");
    if (req.query.ownerUserId && !ownerUserId) throw createHttpError(400, "Responsável inválido");

    const where = {
      tenantId: req.auth.tenantId,
      ...(status ? { status } : {}),
      ...(type ? { type } : {}),
      ...(ownerUserId ? { ownerUserId } : {}),
      ...(unassigned ? { ownerUserId: null } : {}),
      ...(overdue ? { status: "OPEN", dueAt: { lt: now } } : {}),
      ...(!overdue && (from || to) ? { dueAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...((createdFrom || createdTo) ? { createdAt: { ...(createdFrom ? { gte: createdFrom } : {}), ...(createdTo ? { lte: createdTo } : {}) } } : {}),
      ...(search ? {
        OR: [
          { client: { name: { contains: search, mode: "insensitive" } } },
          { client: { phone: { contains: search } } },
          { note: { contains: search, mode: "insensitive" } }
        ]
      } : {})
    };
    const [total, followUps] = await Promise.all([
      prisma.followUp.count({ where }),
      prisma.followUp.findMany({
        where,
        include: followUpInclude,
        orderBy: [{ dueAt: "asc" }, { id: "asc" }],
        skip,
        take: limit
      })
    ]);
    const items = followUps.map((followUp) => withOverdue(followUp, now));
    if (req.query.page === undefined && req.query.limit === undefined) {
      res.json(items);
      return;
    }
    res.json(paginationResult(items, total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function createFollowUp(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const clientId = sanitizeId(req.body?.clientId);
    const leadId = req.body?.leadId ? sanitizeId(req.body.leadId) : null;
    if (!clientId) throw createHttpError(400, "clientId inválido");
    if (req.body?.leadId && !leadId) throw createHttpError(400, "leadId inválido");
    const created = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({ where: { id: clientId, tenantId } });
      if (!client) throw createHttpError(404, "Cliente não encontrado");
      if (leadId) {
        const lead = await tx.lead.findFirst({ where: { id: leadId, clientId, tenantId } });
        if (!lead) throw createHttpError(404, "Lead não encontrado");
        if (!["NEW", "CONTACTED", "QUALIFIED"].includes(lead.status)) {
          throw createHttpError(409, "Lead terminal não recebe nova próxima ação");
        }
        return createLeadFollowUp(tx, {
          tenantId,
          lead,
          payload: req.body,
          creatorUserId: req.auth.userId,
          actorType: "ADMIN",
          actorId: req.auth.userId,
          defaultOwnerUserId: lead.ownerUserId || req.auth.userId
        });
      }
      const fields = validateFollowUpPayload(req.body);
      const ownerUserId = await validateActiveOwner(tx, tenantId, req.body?.ownerUserId ?? req.auth.userId, { allowNull: true });
      const followUp = await tx.followUp.create({
        data: { tenantId, clientId, ...fields, ownerUserId, createdByUserId: req.auth.userId },
        include: followUpInclude
      });
      await appendRelationshipEvent(tx, {
        tenantId,
        clientId,
        type: "FOLLOW_UP_CREATED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { followUpId: followUp.id }
      });
      return followUp;
    });
    res.status(201).json(withOverdue(created));
  } catch (error) {
    next(error);
  }
}

export async function assignFollowUpOwner(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const result = await prisma.$transaction(async (tx) => {
      const followUp = await tenantFollowUp(tx, id, req.auth.tenantId);
      if (followUp.status !== "OPEN") throw createHttpError(409, "Follow-up encerrado não muda de responsável");
      const ownerUserId = await validateActiveOwner(tx, req.auth.tenantId, req.body?.ownerUserId, { allowNull: true });
      if (followUp.ownerUserId === ownerUserId) return followUp;
      return tx.followUp.update({ where: { id }, data: { ownerUserId }, include: followUpInclude });
    });
    res.json(withOverdue(result));
  } catch (error) {
    next(error);
  }
}

async function closeFollowUp(req, res, next, status) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const result = await prisma.$transaction(async (tx) => {
      const followUp = await tenantFollowUp(tx, id, req.auth.tenantId);
      if (followUp.status === status) return { followUp, nextFollowUp: null };
      if (followUp.status !== "OPEN") throw createHttpError(409, "Follow-up já encerrado");
      const saved = await tx.followUp.update({
        where: { id },
        data: status === "COMPLETED"
          ? { status, completedAt: new Date(), completedByUserId: req.auth.userId }
          : { status },
        include: followUpInclude
      });
      await appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: followUp.clientId,
        leadId: followUp.leadId,
        type: status === "COMPLETED" ? "FOLLOW_UP_COMPLETED" : "FOLLOW_UP_CANCELLED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { followUpId: id }
      });
      let nextFollowUp = null;
      if (status === "COMPLETED" && req.body?.nextFollowUp) {
        if (!followUp.leadId) throw createHttpError(400, "Próxima ação encadeada exige um lead");
        const lead = await tx.lead.findFirst({ where: { id: followUp.leadId, tenantId: req.auth.tenantId } });
        if (!lead) throw createHttpError(404, "Lead não encontrado");
        if (!["NEW", "CONTACTED", "QUALIFIED"].includes(lead.status)) {
          throw createHttpError(409, "Lead terminal não recebe nova próxima ação");
        }
        nextFollowUp = await createLeadFollowUp(tx, {
          tenantId: req.auth.tenantId,
          lead,
          payload: req.body.nextFollowUp,
          creatorUserId: req.auth.userId,
          actorType: "ADMIN",
          actorId: req.auth.userId,
          defaultOwnerUserId: lead.ownerUserId || followUp.ownerUserId || req.auth.userId
        });
      }
      return { followUp: saved, nextFollowUp };
    });
    res.json({ ...withOverdue(result.followUp), nextFollowUp: result.nextFollowUp });
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
