import prisma from "../prismaClient.js";
import { activeLeadStatuses } from "../services/relationshipService.js";
import {
  allowedStatuses,
  createHttpError,
  intervalsOverlap,
  isValidDateInput,
  minutesToTime,
  normalizeDate,
  sanitizeId,
  timeToMinutes
} from "./utils.js";

const leadStatuses = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];
const leadSources = ["BOOKING", "WAITLIST", "EVALUATION", "CONTACT", "ABANDONED_BOOKING", "MANUAL"];
const openStatuses = ["PENDING", "CONFIRMED"];

const UPCOMING_LIMIT = 8;
const AGENDA_LIMIT = 100;
const PENDING_HORIZON_DAYS = 7;

function requestedDay(value) {
  if (value === undefined || value === "") {
    return normalizeDate(new Date().toISOString().slice(0, 10));
  }
  if (!isValidDateInput(value)) throw createHttpError(400, "Data inválida");
  return normalizeDate(value);
}

function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDays(date, days) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function endOfDay(date) {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

function zeroed(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

const agendaInclude = {
  service: { select: { id: true, name: true, duration: true } },
  professional: { select: { id: true, name: true } },
  client: { select: { id: true, name: true, phone: true } },
  originLead: { select: { id: true, source: true, status: true } },
  rescheduledFrom: { select: { id: true } },
  rescheduledTo: { select: { id: true } }
};

// Payload enxuto de propósito: o painel não recebe telefone normalizado, e-mail,
// notas, qualificação nem chave de deduplicação.
function appointmentRow(appointment) {
  const duration = appointment.service.duration;
  return {
    id: appointment.id,
    date: isoDay(appointment.date),
    time: appointment.time,
    endTime: minutesToTime(timeToMinutes(appointment.time) + duration),
    durationMinutes: duration,
    status: appointment.status,
    clientId: appointment.clientId,
    clientName: appointment.client?.name || appointment.clientName,
    clientPhone: appointment.client?.phone || appointment.clientPhone,
    serviceId: appointment.service.id,
    serviceName: appointment.service.name,
    professionalId: appointment.professional.id,
    professionalName: appointment.professional.name,
    leadId: appointment.leadId,
    leadSource: appointment.originLead?.source || null,
    rescheduledFromId: appointment.rescheduledFrom?.id || null,
    rescheduledToId: appointment.rescheduledTo?.id || null,
    cancellationReason: appointment.cancellationReason || null
  };
}

export async function getOverview(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const day = requestedDay(req.query.date);
    const now = new Date();
    const dayEnd = endOfDay(day);

    const [
      dayGroups,
      upcoming,
      pipelineGroups,
      activeSourceGroups,
      overdueFollowUps,
      followUpsToday,
      leadsWithoutNextAction,
      leadsWithoutOwner,
      pendingUpcoming,
      professionals
    ] = await Promise.all([
      prisma.appointment.groupBy({
        by: ["professionalId", "status"],
        where: { tenantId, date: day },
        _count: { _all: true }
      }),
      prisma.appointment.findMany({
        where: { tenantId, date: day, status: { in: openStatuses } },
        include: agendaInclude,
        orderBy: [{ time: "asc" }, { id: "asc" }],
        take: UPCOMING_LIMIT
      }),
      prisma.lead.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: { _all: true }
      }),
      prisma.lead.groupBy({
        by: ["source"],
        where: { tenantId, status: { in: activeLeadStatuses } },
        _count: { _all: true }
      }),
      prisma.followUp.count({ where: { tenantId, status: "OPEN", dueAt: { lt: now } } }),
      prisma.followUp.count({ where: { tenantId, status: "OPEN", dueAt: { gte: now, lte: dayEnd } } }),
      prisma.lead.count({
        where: { tenantId, status: { in: activeLeadStatuses }, followUps: { none: { status: "OPEN" } } }
      }),
      prisma.lead.count({ where: { tenantId, status: { in: activeLeadStatuses }, ownerUserId: null } }),
      prisma.appointment.count({
        where: { tenantId, status: "PENDING", date: { gte: day, lte: shiftDays(day, PENDING_HORIZON_DAYS) } }
      }),
      prisma.professional.findMany({
        where: { tenantId, active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      })
    ]);

    const byStatus = zeroed(allowedStatuses);
    const perProfessional = new Map();
    dayGroups.forEach((group) => {
      const total = group._count._all;
      byStatus[group.status] += total;
      const current = perProfessional.get(group.professionalId) || { total: 0, open: 0 };
      current.total += total;
      if (openStatuses.includes(group.status)) current.open += total;
      perProfessional.set(group.professionalId, current);
    });

    const pipeline = zeroed(leadStatuses);
    pipelineGroups.forEach((group) => { pipeline[group.status] = group._count._all; });

    const activeLeadsBySource = zeroed(leadSources);
    activeSourceGroups.forEach((group) => { activeLeadsBySource[group.source] = group._count._all; });

    res.json({
      tenantId,
      date: isoDay(day),
      day: {
        total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
        byStatus
      },
      attention: {
        overdueFollowUps,
        followUpsToday,
        leadsWithoutNextAction,
        leadsWithoutOwner,
        pendingUpcoming,
        activeLeadsBySource
      },
      upcoming: upcoming.map(appointmentRow),
      pipeline,
      occupancy: professionals.map((professional) => ({
        professionalId: professional.id,
        name: professional.name,
        total: perProfessional.get(professional.id)?.total || 0,
        open: perProfessional.get(professional.id)?.open || 0
      }))
    });
  } catch (error) {
    next(error);
  }
}

function windowMinutes(schedules) {
  return schedules.map((schedule) => [timeToMinutes(schedule.startTime), timeToMinutes(schedule.endTime)]);
}

function blockedMinutes(windows, blocks) {
  if (blocks.some((block) => block.allDay)) {
    return windows.reduce((sum, [start, end]) => sum + (end - start), 0);
  }
  return blocks.reduce((sum, block) => {
    const start = timeToMinutes(block.startTime);
    const end = timeToMinutes(block.endTime);
    return sum + windows.reduce((inner, [openStart, openEnd]) => (
      intervalsOverlap(start, end, openStart, openEnd)
        ? inner + (Math.min(end, openEnd) - Math.max(start, openStart))
        : inner
    ), 0);
  }, 0);
}

export async function getAgendaDay(req, res, next) {
  try {
    const tenantId = req.auth.tenantId;
    const day = requestedDay(req.query.date);
    const status = req.query.status;
    const professionalId = req.query.professionalId ? sanitizeId(req.query.professionalId) : null;
    if (status && !allowedStatuses.includes(status)) throw createHttpError(400, "Status inválido");
    if (req.query.professionalId && !professionalId) throw createHttpError(400, "Profissional inválido");

    const dayScope = { tenantId, date: day, ...(professionalId ? { professionalId } : {}) };

    const [items, summaryGroups, blocks, schedules, professionals] = await Promise.all([
      prisma.appointment.findMany({
        where: { ...dayScope, ...(status ? { status } : {}) },
        include: agendaInclude,
        orderBy: [{ time: "asc" }, { id: "asc" }],
        take: AGENDA_LIMIT
      }),
      prisma.appointment.groupBy({
        by: ["status"],
        where: dayScope,
        _count: { _all: true }
      }),
      prisma.scheduleBlock.findMany({
        where: {
          tenantId,
          date: day,
          ...(professionalId ? { OR: [{ professionalId }, { professionalId: null }] } : {})
        },
        include: { professional: { select: { id: true, name: true } } },
        orderBy: [{ allDay: "desc" }, { startTime: "asc" }, { id: "asc" }]
      }),
      prisma.professionalSchedule.findMany({
        where: {
          tenantId,
          active: true,
          dayOfWeek: day.getUTCDay(),
          ...(professionalId ? { professionalId } : {})
        },
        select: { professionalId: true, startTime: true, endTime: true }
      }),
      prisma.professional.findMany({
        where: { tenantId, active: true, ...(professionalId ? { id: professionalId } : {}) },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      })
    ]);

    const byStatus = zeroed(allowedStatuses);
    summaryGroups.forEach((group) => { byStatus[group.status] = group._count._all; });

    const bookedByProfessional = new Map();
    const booked = await prisma.appointment.findMany({
      where: { ...dayScope, status: { in: openStatuses } },
      select: { professionalId: true, service: { select: { duration: true } } }
    });
    booked.forEach((appointment) => {
      bookedByProfessional.set(
        appointment.professionalId,
        (bookedByProfessional.get(appointment.professionalId) || 0) + appointment.service.duration
      );
    });

    const availability = professionals.map((professional) => {
      const windows = windowMinutes(schedules.filter((schedule) => schedule.professionalId === professional.id));
      const open = windows.reduce((sum, [start, end]) => sum + (end - start), 0);
      const blocked = blockedMinutes(
        windows,
        blocks.filter((block) => block.professionalId === null || block.professionalId === professional.id)
      );
      const bookedMinutes = bookedByProfessional.get(professional.id) || 0;
      const openMinutes = Math.max(0, open - blocked);
      return {
        professionalId: professional.id,
        name: professional.name,
        openMinutes,
        bookedMinutes,
        freeMinutes: Math.max(0, openMinutes - bookedMinutes),
        working: windows.length > 0
      };
    });

    res.json({
      date: isoDay(day),
      filters: { professionalId, status: status || null },
      summary: {
        total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
        byStatus
      },
      items: items.map(appointmentRow),
      blocks: blocks.map((block) => ({
        id: block.id,
        professionalId: block.professionalId,
        professionalName: block.professional?.name || null,
        allDay: block.allDay,
        startTime: block.startTime,
        endTime: block.endTime,
        reason: block.reason
      })),
      availability
    });
  } catch (error) {
    next(error);
  }
}
