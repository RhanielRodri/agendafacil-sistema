import prisma from "../prismaClient.js";
import {
  createHttpError,
  intervalsOverlap,
  minutesToTime,
  normalizeDate,
  timeToMinutes
} from "../controllers/utils.js";

export const openStatuses = ["PENDING", "CONFIRMED"];

export function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

export function shiftDays(date, days) {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

// Resumo de impacto exposto ao painel: identifica o agendamento sem vazar dado
// interno do cliente.
export function conflictRow(appointment) {
  return {
    appointmentId: appointment.id,
    date: isoDay(appointment.date),
    time: appointment.time,
    endTime: minutesToTime(timeToMinutes(appointment.time) + appointment.service.duration),
    status: appointment.status,
    clientName: appointment.clientName,
    serviceName: appointment.service.name,
    professionalId: appointment.professionalId,
    professionalName: appointment.professional.name
  };
}

const conflictInclude = {
  service: { select: { name: true, duration: true } },
  professional: { select: { name: true } }
};

const CONFLICT_LIMIT = 50;

export async function futureAppointments(tenantId, where, take = CONFLICT_LIMIT) {
  return prisma.appointment.findMany({
    where: { tenantId, status: { in: openStatuses }, date: { gte: todayUtc() }, ...where },
    include: conflictInclude,
    orderBy: [{ date: "asc" }, { time: "asc" }, { id: "asc" }],
    take
  });
}

export async function serviceDependencies(tenantId, serviceId) {
  const [upcoming, totalAppointments, professionals, activeLeads] = await Promise.all([
    futureAppointments(tenantId, { serviceId }),
    prisma.appointment.count({ where: { tenantId, serviceId } }),
    prisma.professionalService.count({ where: { tenantId, serviceId } }),
    prisma.lead.count({ where: { tenantId, serviceId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } } })
  ]);
  return {
    upcomingAppointments: upcoming.length,
    totalAppointments,
    linkedProfessionals: professionals,
    activeLeads,
    // Histórico nunca é apagado: com qualquer vínculo, a saída é inativar.
    removable: totalAppointments === 0 && activeLeads === 0,
    conflicts: upcoming.map(conflictRow)
  };
}

export async function professionalDependencies(tenantId, professionalId) {
  const [upcoming, totalAppointments, schedules, blocks, services, activeLeads] = await Promise.all([
    futureAppointments(tenantId, { professionalId }),
    prisma.appointment.count({ where: { tenantId, professionalId } }),
    prisma.professionalSchedule.count({ where: { tenantId, professionalId } }),
    prisma.scheduleBlock.count({ where: { tenantId, professionalId } }),
    prisma.professionalService.count({ where: { tenantId, professionalId } }),
    prisma.lead.count({ where: { tenantId, professionalId, status: { in: ["NEW", "CONTACTED", "QUALIFIED"] } } })
  ]);
  return {
    upcomingAppointments: upcoming.length,
    totalAppointments,
    schedules,
    blocks,
    linkedServices: services,
    activeLeads,
    removable: totalAppointments === 0 && activeLeads === 0,
    conflicts: upcoming.map(conflictRow)
  };
}

function fitsWindows(appointment, windows) {
  const start = timeToMinutes(appointment.time);
  const end = start + appointment.service.duration;
  return windows.some(([openStart, openEnd]) => start >= openStart && end <= openEnd);
}

// Agendamentos futuros que deixariam de caber nas janelas propostas. Recebe um
// mapa dayOfWeek → [[inícioEmMinutos, fimEmMinutos]].
export async function appointmentsOutsideWindows(tenantId, professionalId, windowsByDay) {
  const affected = await futureAppointments(
    tenantId,
    professionalId ? { professionalId } : {},
    200
  );
  return affected
    .filter((appointment) => !fitsWindows(appointment, windowsByDay[appointment.date.getUTCDay()] || []))
    .slice(0, CONFLICT_LIMIT);
}

export async function appointmentsInsideBlock(tenantId, block, excludeBlockId) {
  const date = block.date instanceof Date ? block.date : normalizeDate(block.date);
  if (date < todayUtc()) return [];
  const affected = await prisma.appointment.findMany({
    where: {
      tenantId,
      date,
      status: { in: openStatuses },
      ...(block.professionalId ? { professionalId: block.professionalId } : {})
    },
    include: conflictInclude,
    orderBy: [{ time: "asc" }, { id: "asc" }],
    take: CONFLICT_LIMIT
  });
  if (block.allDay) return affected;
  const blockStart = timeToMinutes(block.startTime);
  const blockEnd = timeToMinutes(block.endTime);
  return affected.filter((appointment) => {
    const start = timeToMinutes(appointment.time);
    return intervalsOverlap(start, start + appointment.service.duration, blockStart, blockEnd);
  });
}

// Devolve o impacto recalculado agora, para que a resposta da confirmação
// mostre o estado real do banco no momento da aplicação — inclusive
// agendamentos criados depois da prévia.
export function assertConfirmed(conflicts, confirm, message) {
  const rows = conflicts.map(conflictRow);
  if (!rows.length || confirm === true) return rows;
  const error = createHttpError(409, message);
  error.conflicts = rows;
  throw error;
}
