import prisma from "../prismaClient.js";
import { createHttpError, isValidTimeFormat, sanitizeId } from "./utils.js";

function scheduleConflict(error) {
  return error.code === "P2002" || error.code === "P2004" ||
    String(error.meta?.database_error || "").includes("ProfessionalSchedule_no_overlap");
}

async function requireProfessional(tenantId, professionalId) {
  const id = sanitizeId(professionalId);
  if (!id) throw createHttpError(400, "professionalId inválido");
  const professional = await prisma.professional.findFirst({ where: { id, tenantId } });
  if (!professional) throw createHttpError(404, "Profissional não encontrado");
  return professional;
}

function normalizeSchedule(payload, current = {}) {
  const professionalId = payload.professionalId === undefined ? current.professionalId : sanitizeId(payload.professionalId);
  const dayOfWeek = payload.dayOfWeek === undefined ? current.dayOfWeek : Number(payload.dayOfWeek);
  const startTime = payload.startTime === undefined ? current.startTime : payload.startTime;
  const endTime = payload.endTime === undefined ? current.endTime : payload.endTime;
  const active = payload.active === undefined ? (current.active ?? true) : payload.active;

  if (!professionalId) throw createHttpError(400, "professionalId inválido");
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    throw createHttpError(400, "dayOfWeek inválido");
  }
  if (!isValidTimeFormat(startTime) || !isValidTimeFormat(endTime) || startTime >= endTime) {
    throw createHttpError(400, "Intervalo de horário inválido");
  }
  if (typeof active !== "boolean") throw createHttpError(400, "active inválido");
  return { professionalId, dayOfWeek, startTime, endTime, active };
}

async function ensureNoOverlap(tenantId, data, excludeId) {
  const overlap = await prisma.professionalSchedule.findFirst({
    where: {
      tenantId,
      professionalId: data.professionalId,
      dayOfWeek: data.dayOfWeek,
      startTime: { lt: data.endTime },
      endTime: { gt: data.startTime },
      ...(excludeId ? { id: { not: excludeId } } : {})
    }
  });
  if (overlap) throw createHttpError(409, "O horário se sobrepõe a outro intervalo");
}

export async function listProfessionalSchedules(req, res, next) {
  try {
    const professionalId = req.query.professionalId === undefined
      ? undefined
      : (await requireProfessional(req.auth.tenantId, req.query.professionalId)).id;
    const schedules = await prisma.professionalSchedule.findMany({
      where: { tenantId: req.auth.tenantId, ...(professionalId ? { professionalId } : {}) },
      include: { professional: { select: { id: true, name: true } } },
      orderBy: [{ professionalId: "asc" }, { dayOfWeek: "asc" }, { startTime: "asc" }]
    });
    res.json(schedules);
  } catch (error) {
    next(error);
  }
}

export async function createProfessionalSchedule(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const data = normalizeSchedule(req.body);
    await requireProfessional(tenantId, data.professionalId);
    await ensureNoOverlap(tenantId, data);
    try {
      const schedule = await prisma.professionalSchedule.create({
        data: { tenantId, ...data },
        include: { professional: { select: { id: true, name: true } } }
      });
      res.status(201).json(schedule);
    } catch (error) {
      if (scheduleConflict(error)) throw createHttpError(409, "Horário duplicado ou sobreposto");
      throw error;
    }
  } catch (error) {
    next(error);
  }
}

export async function updateProfessionalSchedule(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const tenantId = req.auth.tenantId;
    const current = await prisma.professionalSchedule.findFirst({ where: { id, tenantId } });
    if (!current) throw createHttpError(404, "Horário não encontrado");
    const data = normalizeSchedule(req.body, current);
    await requireProfessional(tenantId, data.professionalId);
    await ensureNoOverlap(tenantId, data, id);
    try {
      const schedule = await prisma.professionalSchedule.update({
        where: { id },
        data,
        include: { professional: { select: { id: true, name: true } } }
      });
      res.json(schedule);
    } catch (error) {
      if (scheduleConflict(error)) throw createHttpError(409, "Horário duplicado ou sobreposto");
      throw error;
    }
  } catch (error) {
    next(error);
  }
}

export async function deleteProfessionalSchedule(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const schedule = await prisma.professionalSchedule.findFirst({
      where: { id, tenantId: req.auth.tenantId },
      select: { id: true }
    });
    if (!schedule) throw createHttpError(404, "Horário não encontrado");
    await prisma.professionalSchedule.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
