import prisma from "../prismaClient.js";
import { appointmentsOutsideWindows, assertConfirmed } from "../services/structuralService.js";
import { createHttpError, isValidTimeFormat, sanitizeId, timeToMinutes } from "./utils.js";

function windowsByDay(schedules) {
  const windows = {};
  schedules
    .filter((schedule) => schedule.active)
    .forEach((schedule) => {
      (windows[schedule.dayOfWeek] ||= []).push([timeToMinutes(schedule.startTime), timeToMinutes(schedule.endTime)]);
    });
  return windows;
}

// A agenda proposta é montada inteira antes de gravar: só assim dá para dizer
// quais agendamentos futuros deixariam de caber nela.
async function assertScheduleChangeIsSafe(tenantId, professionalId, intended, confirm, message) {
  const affected = await appointmentsOutsideWindows(tenantId, professionalId, windowsByDay(intended));
  return assertConfirmed(affected, confirm, message);
}

async function currentSchedules(tenantId, professionalId) {
  return prisma.professionalSchedule.findMany({
    where: { tenantId, professionalId },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
  });
}

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

    const existing = await currentSchedules(tenantId, current.professionalId);
    const appliedImpact = await assertScheduleChangeIsSafe(
      tenantId,
      current.professionalId,
      [...existing.filter((schedule) => schedule.id !== id), { ...current, ...data }],
      req.body?.confirm,
      "A alteração deixa agendamentos futuros fora da agenda do profissional"
    );

    try {
      const schedule = await prisma.professionalSchedule.update({
        where: { id },
        data,
        include: { professional: { select: { id: true, name: true } } }
      });
      res.json({ ...schedule, appliedImpact });
    } catch (error) {
      if (scheduleConflict(error)) throw createHttpError(409, "Horário duplicado ou sobreposto");
      throw error;
    }
  } catch (error) {
    next(error);
  }
}

function parseTargetDays(value) {
  if (value === undefined) return [0, 1, 2, 3, 4, 5, 6];
  if (!Array.isArray(value) || !value.length) throw createHttpError(400, "targetDays inválido");
  const days = [...new Set(value.map(Number))];
  if (days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    throw createHttpError(400, "targetDays inválido");
  }
  return days;
}

async function sourceWindows(tenantId, body) {
  const source = body?.source === undefined ? "professional" : body.source;

  if (source === "business") {
    const hours = await prisma.businessHours.findMany({ where: { tenantId, isOpen: true } });
    if (!hours.length) throw createHttpError(400, "O negócio não tem horário de funcionamento configurado");
    return Object.fromEntries(hours.map((day) => [day.dayOfWeek, [{ startTime: day.openTime, endTime: day.closeTime }]]));
  }

  if (source === "professional") {
    const from = await requireProfessional(tenantId, body?.fromProfessionalId);
    const schedules = await prisma.professionalSchedule.findMany({
      where: { tenantId, professionalId: from.id, active: true },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
    });
    if (!schedules.length) throw createHttpError(400, "O profissional de origem não tem agenda configurada");
    const byDay = {};
    schedules.forEach((schedule) => {
      (byDay[schedule.dayOfWeek] ||= []).push({ startTime: schedule.startTime, endTime: schedule.endTime });
    });
    return byDay;
  }

  if (source === "day") {
    const from = await requireProfessional(tenantId, body?.fromProfessionalId ?? body?.professionalId);
    const dayOfWeek = Number(body?.fromDayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw createHttpError(400, "fromDayOfWeek inválido");
    }
    const schedules = await prisma.professionalSchedule.findMany({
      where: { tenantId, professionalId: from.id, dayOfWeek, active: true },
      orderBy: { startTime: "asc" }
    });
    if (!schedules.length) throw createHttpError(400, "O dia de origem não tem janelas ativas");
    const intervals = schedules.map((schedule) => ({ startTime: schedule.startTime, endTime: schedule.endTime }));
    return Object.fromEntries(parseTargetDays(body?.targetDays).map((day) => [day, intervals]));
  }

  throw createHttpError(400, "source inválido");
}

// Copiar agenda substitui os dias alvo por inteiro. É a única operação em massa
// da fase, e por isso relata impacto antes de gravar.
export async function copyProfessionalSchedules(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const target = await requireProfessional(tenantId, req.body?.targetProfessionalId ?? req.body?.professionalId);
    const targetDays = parseTargetDays(req.body?.targetDays);
    const windows = await sourceWindows(tenantId, req.body);

    const replacement = targetDays.flatMap((dayOfWeek) => (windows[dayOfWeek] || []).map((interval) => ({
      tenantId,
      professionalId: target.id,
      dayOfWeek,
      startTime: interval.startTime,
      endTime: interval.endTime,
      active: true
    })));

    const existing = await currentSchedules(tenantId, target.id);
    const intended = [...existing.filter((schedule) => !targetDays.includes(schedule.dayOfWeek)), ...replacement];
    const appliedImpact = await assertScheduleChangeIsSafe(
      tenantId,
      target.id,
      intended,
      req.body?.confirm,
      "A agenda copiada deixa agendamentos futuros descobertos"
    );

    await prisma.$transaction([
      prisma.professionalSchedule.deleteMany({
        where: { tenantId, professionalId: target.id, dayOfWeek: { in: targetDays } }
      }),
      ...(replacement.length ? [prisma.professionalSchedule.createMany({ data: replacement })] : [])
    ]);

    const schedules = await prisma.professionalSchedule.findMany({
      where: { tenantId, professionalId: target.id },
      include: { professional: { select: { id: true, name: true } } },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }]
    });
    res.json({ professionalId: target.id, copiedDays: targetDays, schedules, appliedImpact });
  } catch (error) {
    next(error);
  }
}

export async function deleteProfessionalSchedule(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const tenantId = req.auth.tenantId;
    const schedule = await prisma.professionalSchedule.findFirst({ where: { id, tenantId } });
    if (!schedule) throw createHttpError(404, "Horário não encontrado");

    const existing = await currentSchedules(tenantId, schedule.professionalId);
    await assertScheduleChangeIsSafe(
      tenantId,
      schedule.professionalId,
      existing.filter((item) => item.id !== id),
      req.query?.confirm === "true",
      "Remover esta janela deixa agendamentos futuros sem agenda"
    );

    await prisma.professionalSchedule.delete({ where: { id } });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
}
