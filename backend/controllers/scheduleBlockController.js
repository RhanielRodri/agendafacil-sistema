import prisma from "../prismaClient.js";
import {
  createHttpError,
  isValidDateInput,
  isValidTimeFormat,
  normalizeDate,
  sanitizeId
} from "./utils.js";

async function requireProfessional(tenantId, value) {
  const id = sanitizeId(value);
  if (!id) throw createHttpError(400, "professionalId inválido");
  const professional = await prisma.professional.findFirst({ where: { id, tenantId } });
  if (!professional) throw createHttpError(404, "Profissional não encontrado");
  return professional;
}

function normalizeReason(value, fallback) {
  if (value === undefined) return fallback ?? null;
  if (value === null) return null;
  if (typeof value !== "string") throw createHttpError(400, "Motivo inválido");
  return value.trim().slice(0, 200) || null;
}

async function normalizeBlock(tenantId, payload, current = {}) {
  const rawProfessionalId = payload.professionalId === undefined ? current.professionalId : payload.professionalId;
  const professionalId = rawProfessionalId === null || rawProfessionalId === undefined || rawProfessionalId === ""
    ? null
    : (await requireProfessional(tenantId, rawProfessionalId)).id;
  const date = payload.date === undefined ? current.date?.toISOString().slice(0, 10) : payload.date;
  const allDay = payload.allDay === undefined ? (current.allDay ?? false) : payload.allDay;

  if (!isValidDateInput(date)) throw createHttpError(400, "Data inválida");
  if (typeof allDay !== "boolean") throw createHttpError(400, "allDay inválido");

  let startTime = payload.startTime === undefined ? current.startTime : payload.startTime;
  let endTime = payload.endTime === undefined ? current.endTime : payload.endTime;
  if (allDay) {
    startTime = null;
    endTime = null;
  } else if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime) || startTime >= endTime) {
    throw createHttpError(400, "Intervalo de bloqueio inválido");
  }

  return {
    professionalId,
    date: normalizeDate(date),
    allDay,
    startTime,
    endTime,
    reason: normalizeReason(payload.reason, current.reason)
  };
}

export async function listScheduleBlocks(req, res, next) {
  try {
    const { from, to } = req.query;
    if (!isValidDateInput(from) || !isValidDateInput(to) || from > to) {
      throw createHttpError(400, "Período inválido");
    }
    const professionalId = req.query.professionalId === undefined
      ? undefined
      : (await requireProfessional(req.auth.tenantId, req.query.professionalId)).id;
    const blocks = await prisma.scheduleBlock.findMany({
      where: {
        tenantId: req.auth.tenantId,
        date: { gte: normalizeDate(from), lte: normalizeDate(to) },
        ...(professionalId ? { professionalId } : {})
      },
      include: { professional: { select: { id: true, name: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }]
    });
    res.json(blocks);
  } catch (error) {
    next(error);
  }
}

export async function createScheduleBlock(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const data = await normalizeBlock(tenantId, req.body);
    const block = await prisma.scheduleBlock.create({
      data: { tenantId, ...data },
      include: { professional: { select: { id: true, name: true } } }
    });
    res.status(201).json(block);
  } catch (error) {
    next(error);
  }
}

export async function updateScheduleBlock(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const tenantId = req.auth.tenantId;
    const current = await prisma.scheduleBlock.findFirst({ where: { id, tenantId } });
    if (!current) throw createHttpError(404, "Bloqueio não encontrado");
    const data = await normalizeBlock(tenantId, req.body, current);
    const block = await prisma.scheduleBlock.update({
      where: { id },
      data,
      include: { professional: { select: { id: true, name: true } } }
    });
    res.json(block);
  } catch (error) {
    next(error);
  }
}

export async function deleteScheduleBlock(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const block = await prisma.scheduleBlock.findFirst({
      where: { id, tenantId: req.auth.tenantId },
      select: { id: true }
    });
    if (!block) throw createHttpError(404, "Bloqueio não encontrado");
    await prisma.scheduleBlock.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
