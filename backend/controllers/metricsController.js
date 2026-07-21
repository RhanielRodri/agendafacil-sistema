import prisma from "../prismaClient.js";
import { loadSettings } from "./settingsController.js";
import { isoDay, shiftDays, todayUtc } from "../services/structuralService.js";
import {
  allowedStatuses,
  createHttpError,
  intervalsOverlap,
  isValidDateInput,
  normalizeDate,
  timeToMinutes
} from "./utils.js";

const leadStatuses = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];
const leadSources = ["BOOKING", "WAITLIST", "EVALUATION", "CONTACT", "ABANDONED_BOOKING", "MANUAL"];
const activeLeadStatuses = ["NEW", "CONTACTED", "QUALIFIED"];
const occupiedStatuses = ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"];

const MAX_PERIOD_DAYS = 92;
const FIRST_ACTION_SAMPLE = 500;
const RETURN_WINDOW_DAYS = 90;

function zeroed(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function rate(part, total) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
}

export function resolvePeriod(query = {}) {
  const key = query.period || "30d";
  const today = todayUtc();

  if (key === "custom") {
    if (!isValidDateInput(query.from) || !isValidDateInput(query.to) || query.from > query.to) {
      throw createHttpError(400, "Período inválido");
    }
    const from = normalizeDate(query.from);
    const to = normalizeDate(query.to);
    const days = Math.round((to - from) / 86_400_000) + 1;
    if (days > MAX_PERIOD_DAYS) throw createHttpError(400, `Período personalizado limitado a ${MAX_PERIOD_DAYS} dias`);
    return { key, from, to, days };
  }

  const spans = { today: 1, "7d": 7, "30d": 30 };
  const span = spans[key];
  if (!span) throw createHttpError(400, "Período inválido");
  return { key, from: shiftDays(today, -(span - 1)), to: today, days: span };
}

function eachDay(period) {
  const days = [];
  for (let cursor = new Date(period.from); cursor <= period.to; cursor = shiftDays(cursor, 1)) {
    days.push(new Date(cursor));
  }
  return days;
}

function minutesInside(windows, start, end) {
  return windows.reduce((sum, [openStart, openEnd]) => (
    intervalsOverlap(start, end, openStart, openEnd)
      ? sum + (Math.min(end, openEnd) - Math.max(start, openStart))
      : sum
  ), 0);
}

// Capacidade é derivada do que já existe: expediente do negócio, agenda de cada
// profissional e bloqueios do período. Não há tabela de capacidade.
async function capacityReport(tenantId, period, slotMinutes) {
  const [businessHours, schedules, blocks, professionals, appointments] = await Promise.all([
    prisma.businessHours.findMany({ where: { tenantId } }),
    prisma.professionalSchedule.findMany({
      where: { tenantId, active: true },
      select: { professionalId: true, dayOfWeek: true, startTime: true, endTime: true }
    }),
    prisma.scheduleBlock.findMany({
      where: { tenantId, date: { gte: period.from, lte: period.to } },
      select: { professionalId: true, date: true, allDay: true, startTime: true, endTime: true }
    }),
    prisma.professional.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    }),
    prisma.appointment.findMany({
      where: { tenantId, date: { gte: period.from, lte: period.to }, status: { in: occupiedStatuses } },
      select: { professionalId: true, serviceId: true, service: { select: { name: true, duration: true } } }
    })
  ]);

  const businessByDay = new Map(businessHours.map((day) => [day.dayOfWeek, day]));
  const blocksByDay = new Map();
  blocks.forEach((block) => {
    const key = isoDay(block.date);
    if (!blocksByDay.has(key)) blocksByDay.set(key, []);
    blocksByDay.get(key).push(block);
  });

  const openByProfessional = new Map(professionals.map((professional) => [professional.id, 0]));

  eachDay(period).forEach((day) => {
    const business = businessByDay.get(day.getUTCDay());
    if (!business?.isOpen) return;
    const businessStart = timeToMinutes(business.openTime);
    const businessEnd = timeToMinutes(business.closeTime);
    const dayBlocks = blocksByDay.get(isoDay(day)) || [];

    professionals.forEach((professional) => {
      const windows = schedules
        .filter((schedule) => schedule.professionalId === professional.id && schedule.dayOfWeek === day.getUTCDay())
        .map((schedule) => [
          Math.max(businessStart, timeToMinutes(schedule.startTime)),
          Math.min(businessEnd, timeToMinutes(schedule.endTime))
        ])
        .filter(([start, end]) => end > start);
      if (!windows.length) return;

      const open = windows.reduce((sum, [start, end]) => sum + (end - start), 0);
      const relevant = dayBlocks.filter((block) => block.professionalId === null || block.professionalId === professional.id);
      const blocked = relevant.some((block) => block.allDay)
        ? open
        : relevant.reduce(
          (sum, block) => sum + minutesInside(windows, timeToMinutes(block.startTime), timeToMinutes(block.endTime)),
          0
        );
      openByProfessional.set(professional.id, openByProfessional.get(professional.id) + Math.max(0, open - blocked));
    });
  });

  const bookedByProfessional = new Map();
  const bookedByService = new Map();
  appointments.forEach((appointment) => {
    const duration = appointment.service.duration;
    bookedByProfessional.set(appointment.professionalId, (bookedByProfessional.get(appointment.professionalId) || 0) + duration);
    const current = bookedByService.get(appointment.serviceId) || { name: appointment.service.name, minutes: 0, count: 0 };
    current.minutes += duration;
    current.count += 1;
    bookedByService.set(appointment.serviceId, current);
  });

  const openMinutes = [...openByProfessional.values()].reduce((sum, value) => sum + value, 0);
  const bookedMinutes = [...bookedByProfessional.values()].reduce((sum, value) => sum + value, 0);

  return {
    openMinutes,
    bookedMinutes,
    freeMinutes: Math.max(0, openMinutes - bookedMinutes),
    occupancyRate: rate(bookedMinutes, openMinutes),
    estimatedOpenSlots: Math.floor(openMinutes / slotMinutes),
    estimatedBookedSlots: Math.round(bookedMinutes / slotMinutes),
    byProfessional: professionals.map((professional) => {
      const open = openByProfessional.get(professional.id) || 0;
      const booked = bookedByProfessional.get(professional.id) || 0;
      return {
        professionalId: professional.id,
        name: professional.name,
        openMinutes: open,
        bookedMinutes: booked,
        freeMinutes: Math.max(0, open - booked),
        occupancyRate: rate(booked, open)
      };
    }),
    byService: [...bookedByService.entries()]
      .map(([serviceId, value]) => ({
        serviceId,
        name: value.name,
        appointments: value.count,
        bookedMinutes: value.minutes,
        shareOfBookedTime: rate(value.minutes, bookedMinutes)
      }))
      .sort((a, b) => b.bookedMinutes - a.bookedMinutes || a.name.localeCompare(b.name))
  };
}

async function leadsReport(tenantId, period, from, to) {
  const [statusGroups, sourceGroups, convertedGroups, withoutOwner, withoutNextAction, created] = await Promise.all([
    prisma.lead.groupBy({ by: ["status"], where: { tenantId, createdAt: { gte: from, lte: to } }, _count: { _all: true } }),
    prisma.lead.groupBy({ by: ["source"], where: { tenantId, createdAt: { gte: from, lte: to } }, _count: { _all: true } }),
    prisma.lead.groupBy({
      by: ["source"],
      where: { tenantId, createdAt: { gte: from, lte: to }, status: "CONVERTED" },
      _count: { _all: true }
    }),
    prisma.lead.count({ where: { tenantId, createdAt: { gte: from, lte: to }, status: { in: activeLeadStatuses }, ownerUserId: null } }),
    prisma.lead.count({
      where: {
        tenantId,
        createdAt: { gte: from, lte: to },
        status: { in: activeLeadStatuses },
        followUps: { none: { status: "OPEN" } }
      }
    }),
    prisma.lead.count({ where: { tenantId, createdAt: { gte: from, lte: to } } })
  ]);

  const byStatus = zeroed(leadStatuses);
  statusGroups.forEach((group) => { byStatus[group.status] = group._count._all; });
  const createdBySource = zeroed(leadSources);
  sourceGroups.forEach((group) => { createdBySource[group.source] = group._count._all; });
  const convertedBySource = zeroed(leadSources);
  convertedGroups.forEach((group) => { convertedBySource[group.source] = group._count._all; });

  // Tempo até a primeira ação só é honesto sobre uma amostra fechada; acima
  // dela o número vira estimativa e o painel prefere não afirmar nada.
  let averageMinutesToFirstAction = null;
  if (created > 0 && created <= FIRST_ACTION_SAMPLE) {
    const leads = await prisma.lead.findMany({
      where: { tenantId, createdAt: { gte: from, lte: to } },
      select: { id: true, createdAt: true }
    });
    const firstActions = await prisma.relationshipHistoryEvent.groupBy({
      by: ["leadId"],
      where: { tenantId, leadId: { in: leads.map((lead) => lead.id) }, type: { not: "LEAD_CREATED" } },
      _min: { createdAt: true }
    });
    const byLead = new Map(firstActions.map((group) => [group.leadId, group._min.createdAt]));
    const deltas = leads
      .map((lead) => {
        const first = byLead.get(lead.id);
        return first ? (first.getTime() - lead.createdAt.getTime()) / 60_000 : null;
      })
      .filter((value) => value !== null && value >= 0);
    if (deltas.length) {
      averageMinutesToFirstAction = Math.round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length);
    }
  }

  return {
    created,
    byStatus,
    withoutOwner,
    withoutNextAction,
    averageMinutesToFirstAction,
    conversionRate: rate(byStatus.CONVERTED, created),
    bySource: leadSources.map((source) => ({
      source,
      created: createdBySource[source],
      converted: convertedBySource[source],
      conversionRate: rate(convertedBySource[source], createdBySource[source])
    }))
  };
}

async function followUpsReport(tenantId, from, to) {
  const [created, completed, overdue, completedRows] = await Promise.all([
    prisma.followUp.count({ where: { tenantId, createdAt: { gte: from, lte: to } } }),
    prisma.followUp.count({ where: { tenantId, status: "COMPLETED", completedAt: { gte: from, lte: to } } }),
    prisma.followUp.count({ where: { tenantId, status: "OPEN", dueAt: { gte: from, lte: to, lt: new Date() } } }),
    prisma.followUp.findMany({
      where: { tenantId, status: "COMPLETED", completedAt: { gte: from, lte: to } },
      select: { dueAt: true, completedAt: true },
      take: 1000
    })
  ]);

  const delays = completedRows
    .map((row) => (row.completedAt.getTime() - row.dueAt.getTime()) / 60_000)
    .filter((value) => value > 0);

  return {
    created,
    completed,
    overdue,
    averageDelayMinutes: delays.length
      ? Math.round(delays.reduce((sum, value) => sum + value, 0) / delays.length)
      : null
  };
}

// "Sem retorno recente" é uma regra fechada: teve atendimento concluído e o mais
// recente deles é anterior à janela de retorno. Sem histórico, o cliente não entra.
async function clientsReport(tenantId, period, from, to) {
  const today = todayUtc();
  const [created, appointmentGroups, recentCompleted] = await Promise.all([
    prisma.client.count({ where: { tenantId, createdAt: { gte: from, lte: to } } }),
    prisma.appointment.groupBy({
      by: ["clientId"],
      where: { tenantId, date: { gte: period.from, lte: period.to }, status: { in: occupiedStatuses } },
      _count: { _all: true }
    }),
    prisma.appointment.groupBy({
      by: ["clientId"],
      where: { tenantId, status: "COMPLETED", date: { gte: shiftDays(today, -365) } },
      _max: { date: true }
    })
  ]);

  const withAppointments = appointmentGroups.length;
  const withMoreThanOne = appointmentGroups.filter((group) => group._count._all > 1).length;
  const returnCutoff = shiftDays(today, -RETURN_WINDOW_DAYS);
  const withoutRecentReturn = recentCompleted.filter((group) => group._max.date < returnCutoff).length;

  return {
    created,
    withAppointments,
    withMoreThanOne,
    returning: withMoreThanOne,
    withoutRecentReturn,
    returnWindowDays: RETURN_WINDOW_DAYS
  };
}

export async function getMetrics(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const period = resolvePeriod(req.query);
    const settings = await loadSettings(tenantId);
    const from = new Date(period.from);
    const to = new Date(period.to);
    to.setUTCHours(23, 59, 59, 999);

    const [statusGroups, rescheduled, capacity, leads, followUps, clients] = await Promise.all([
      prisma.appointment.groupBy({
        by: ["status"],
        where: { tenantId, date: { gte: period.from, lte: period.to } },
        _count: { _all: true }
      }),
      prisma.appointment.count({
        where: { tenantId, date: { gte: period.from, lte: period.to }, rescheduledFromId: { not: null } }
      }),
      capacityReport(tenantId, period, settings.slotDurationMinutes),
      leadsReport(tenantId, period, from, to),
      followUpsReport(tenantId, from, to),
      clientsReport(tenantId, period, from, to)
    ]);

    const byStatus = zeroed(allowedStatuses);
    statusGroups.forEach((group) => { byStatus[group.status] = group._count._all; });
    const total = Object.values(byStatus).reduce((sum, value) => sum + value, 0);
    const finished = byStatus.COMPLETED + byStatus.NO_SHOW;

    res.json({
      tenantId,
      period: { key: period.key, from: isoDay(period.from), to: isoDay(period.to), days: period.days },
      appointments: {
        total,
        byStatus,
        rescheduled,
        attendanceRate: rate(byStatus.COMPLETED, finished),
        cancellationRate: rate(byStatus.CANCELLED, total),
        noShowRate: rate(byStatus.NO_SHOW, finished)
      },
      capacity,
      leads,
      followUps,
      clients
    });
  } catch (error) {
    next(error);
  }
}
