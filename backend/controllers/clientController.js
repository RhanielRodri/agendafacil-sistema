import prisma from "../prismaClient.js";
import {
  appendRelationshipEvent,
  normalizeEmail,
  normalizePhone,
  paginationResult,
  parsePagination,
  sanitizeCommercialText,
  sanitizeText
} from "../services/relationshipService.js";
import { phoneLookupValues, phoneSearchValues } from "../services/phoneService.js";
import { createHttpError, sanitizeId } from "./utils.js";

const clientSummaryInclude = {
  _count: { select: { appointments: true, leads: true, followUps: true } }
};

export async function listClients(req, res, next) {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const search = sanitizeText(req.query.search, 120);
    const phoneSearches = phoneSearchValues(search);
    const createdFrom = req.query.createdFrom ? new Date(req.query.createdFrom) : null;
    const createdTo = req.query.createdTo ? new Date(req.query.createdTo) : null;
    if ((createdFrom && Number.isNaN(createdFrom.getTime())) || (createdTo && Number.isNaN(createdTo.getTime()))) {
      throw createHttpError(400, "Período inválido");
    }
    if (createdTo && /^\d{4}-\d{2}-\d{2}$/.test(req.query.createdTo)) createdTo.setUTCHours(23, 59, 59, 999);
    const where = {
      tenantId: req.auth.tenantId,
      ...(search ? {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { phone: { contains: search } },
          ...phoneSearches.map((value) => ({ normalizedPhone: { contains: value } })),
          { email: { contains: search, mode: "insensitive" } }
        ]
      } : {}),
      ...((createdFrom || createdTo) ? { createdAt: { ...(createdFrom ? { gte: createdFrom } : {}), ...(createdTo ? { lte: createdTo } : {}) } } : {})
    };
    const [total, clients] = await Promise.all([
      prisma.client.count({ where }),
      prisma.client.findMany({
        where,
        include: clientSummaryInclude,
        orderBy: [{ lastContactAt: "desc" }, { id: "desc" }],
        skip,
        take: limit
      })
    ]);
    if (req.query.page === undefined && req.query.limit === undefined) {
      res.json(clients);
      return;
    }
    res.json(paginationResult(clients, total, page, limit));
  } catch (error) {
    next(error);
  }
}

export async function getClient(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const client = await prisma.client.findFirst({
      where: { id, tenantId: req.auth.tenantId },
      include: {
        appointments: {
          include: { service: true, professional: true },
          orderBy: [{ date: "desc" }, { time: "desc" }],
          take: 20
        },
        leads: {
          include: { service: true, professional: true },
          orderBy: { createdAt: "desc" },
          take: 20
        },
        followUps: { orderBy: { dueAt: "desc" }, take: 20 }
      }
    });
    if (!client) throw createHttpError(404, "Cliente não encontrado");
    res.json({
      ...client,
      leads: client.leads.map(({ dedupeKey, ...lead }) => lead)
    });
  } catch (error) {
    next(error);
  }
}

export async function updateClient(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const current = await prisma.client.findFirst({ where: { id, tenantId: req.auth.tenantId } });
    if (!current) throw createHttpError(404, "Cliente não encontrado");

    const data = {};
    const fields = [];
    if (Object.hasOwn(req.body, "name")) {
      const name = sanitizeText(req.body.name, 120);
      if (!name || name.length < 2) throw createHttpError(400, "Nome inválido");
      data.name = name;
      fields.push("name");
    }
    if (Object.hasOwn(req.body, "phone")) {
      const phone = sanitizeText(req.body.phone, 30);
      const normalizedPhone = normalizePhone(phone);
      const phoneValues = phoneLookupValues(normalizedPhone);
      const duplicate = await prisma.client.findFirst({
        where: { tenantId: req.auth.tenantId, normalizedPhone: { in: phoneValues }, id: { not: id } }
      });
      if (duplicate) throw createHttpError(409, "Telefone já pertence a outro cliente");
      data.phone = normalizedPhone;
      data.normalizedPhone = normalizedPhone;
      fields.push("phone");
    }
    if (Object.hasOwn(req.body, "email")) {
      const email = sanitizeText(req.body.email, 254);
      data.email = email;
      data.normalizedEmail = normalizeEmail(email);
      fields.push("email");
    }
    if (!fields.length) throw createHttpError(400, "Nenhum campo válido para atualizar");

    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.client.update({ where: { id }, data });
      await appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: id,
        type: "CLIENT_UPDATED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { fields: fields.join(",") }
      });
      return saved;
    });
    res.json(updated);
  } catch (error) {
    next(error?.code === "P2002" ? createHttpError(409, "Telefone já pertence a outro cliente") : error);
  }
}

export async function addClientNote(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    const note = sanitizeCommercialText(req.body?.note, 500);
    if (!id) throw createHttpError(400, "ID inválido");
    if (!note) throw createHttpError(400, "Nota inválida");

    const leadId = req.body?.leadId ? sanitizeId(req.body.leadId) : null;
    if (req.body?.leadId && !leadId) throw createHttpError(400, "leadId inválido");
    const event = await prisma.$transaction(async (tx) => {
      const client = await tx.client.findFirst({ where: { id, tenantId: req.auth.tenantId } });
      if (!client) throw createHttpError(404, "Cliente não encontrado");
      if (leadId) {
        const lead = await tx.lead.findFirst({ where: { id: leadId, clientId: id, tenantId: req.auth.tenantId } });
        if (!lead) throw createHttpError(404, "Lead não encontrado");
      }
      return appendRelationshipEvent(tx, {
        tenantId: req.auth.tenantId,
        clientId: id,
        leadId,
        type: "NOTE_ADDED",
        actorType: "ADMIN",
        actorId: req.auth.userId,
        metadata: { content: note }
      });
    });
    res.status(201).json(event);
  } catch (error) {
    next(error);
  }
}

export async function listClientHistory(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const client = await prisma.client.findFirst({ where: { id, tenantId: req.auth.tenantId }, select: { id: true } });
    if (!client) throw createHttpError(404, "Cliente não encontrado");
    const history = await prisma.relationshipHistoryEvent.findMany({
      where: { tenantId: req.auth.tenantId, clientId: id },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    res.json(history);
  } catch (error) {
    next(error);
  }
}
