import prisma from "../prismaClient.js";
import { appointmentsOutsideWindows, assertConfirmed } from "../services/structuralService.js";
import { createHttpError, isValidTimeFormat, timeToMinutes } from "./utils.js";

export async function listBusinessHours(req, res, next) {
  try {
    const businessHours = await prisma.businessHours.findMany({
      where: { tenantId: req.tenant.slug },
      orderBy: { dayOfWeek: "asc" }
    });

    res.json(businessHours);
  } catch (error) {
    next(error);
  }
}

export async function listAdminBusinessHours(req, res, next) {
  try {
    const businessHours = await prisma.businessHours.findMany({
      where: { tenantId: req.auth.tenantId },
      orderBy: { dayOfWeek: "asc" }
    });
    // O painel edita a semana inteira; dias sem registro voltam fechados.
    const byDay = new Map(businessHours.map((day) => [day.dayOfWeek, day]));
    res.json([0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => byDay.get(dayOfWeek) || {
      id: null,
      tenantId: req.auth.tenantId,
      dayOfWeek,
      openTime: "09:00",
      closeTime: "18:00",
      isOpen: false
    }));
  } catch (error) {
    next(error);
  }
}

function normalizeDays(payload) {
  if (!Array.isArray(payload) || !payload.length) throw createHttpError(400, "Informe os dias da semana");
  const seen = new Set();
  return payload.map((entry) => {
    const dayOfWeek = Number(entry?.dayOfWeek);
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      throw createHttpError(400, "dayOfWeek inválido");
    }
    if (seen.has(dayOfWeek)) throw createHttpError(400, "Dia da semana repetido");
    seen.add(dayOfWeek);

    const isOpen = entry?.isOpen === undefined ? true : entry.isOpen;
    if (typeof isOpen !== "boolean") throw createHttpError(400, "isOpen inválido");
    const openTime = entry?.openTime;
    const closeTime = entry?.closeTime;
    if (!isValidTimeFormat(openTime) || !isValidTimeFormat(closeTime)) {
      throw createHttpError(400, "Horário inválido — use o formato HH:MM");
    }
    // Dia fechado não gera slot, então a ordem dos horários é irrelevante — e
    // exigi-la impediria salvar a semana inteira por causa de um 00:00–00:00.
    if (isOpen && timeToMinutes(openTime) >= timeToMinutes(closeTime)) {
      throw createHttpError(400, "O horário de abertura deve ser menor que o de fechamento");
    }
    return { dayOfWeek, isOpen, openTime, closeTime };
  });
}

export async function updateBusinessHours(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const days = normalizeDays(req.body?.days);

    const current = await prisma.businessHours.findMany({ where: { tenantId } });
    const merged = new Map(current.map((day) => [day.dayOfWeek, day]));
    days.forEach((day) => merged.set(day.dayOfWeek, day));

    const windowsByDay = {};
    merged.forEach((day, dayOfWeek) => {
      windowsByDay[dayOfWeek] = day.isOpen
        ? [[timeToMinutes(day.openTime), timeToMinutes(day.closeTime)]]
        : [];
    });

    const affected = await appointmentsOutsideWindows(tenantId, null, windowsByDay);
    const appliedImpact = assertConfirmed(
      affected,
      req.body?.confirm,
      "O novo horário deixa agendamentos futuros fora do expediente"
    );

    await prisma.$transaction(days.map((day) => prisma.businessHours.upsert({
      where: { tenantId_dayOfWeek: { tenantId, dayOfWeek: day.dayOfWeek } },
      update: { isOpen: day.isOpen, openTime: day.openTime, closeTime: day.closeTime },
      create: { tenantId, ...day }
    })));

    const saved = await prisma.businessHours.findMany({ where: { tenantId }, orderBy: { dayOfWeek: "asc" } });
    res.json({ days: saved, appliedImpact });
  } catch (error) {
    next(error);
  }
}
