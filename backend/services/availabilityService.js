import prisma from "../prismaClient.js";
import {
  createHttpError,
  intervalsOverlap,
  isValidDateInput,
  isValidTimeFormat,
  minutesToTime,
  normalizeDate,
  sanitizeId,
  timeToMinutes
} from "../controllers/utils.js";

function requireId(value, field) {
  const id = sanitizeId(value);
  if (!id) throw createHttpError(400, `${field} inválido`);
  return id;
}

async function loadAvailability(client, { tenantId, date, serviceId, professionalId, excludeAppointmentId }) {
  if (!isValidDateInput(date)) throw createHttpError(400, "Data inválida");

  const normalizedServiceId = requireId(serviceId, "serviceId");
  const normalizedProfessionalId = requireId(professionalId, "professionalId");
  const tenant = await client.tenant.findFirst({
    where: { slug: tenantId, active: true },
    select: { slug: true }
  });
  if (!tenant) throw createHttpError(404, "Negócio não encontrado ou inativo");

  const service = await client.service.findFirst({
    where: { id: normalizedServiceId, tenantId, active: true }
  });
  if (!service) throw createHttpError(404, "Serviço não encontrado ou inativo");

  const professional = await client.professional.findFirst({
    where: { id: normalizedProfessionalId, tenantId, active: true }
  });
  if (!professional) throw createHttpError(404, "Profissional não encontrado ou inativo");

  // Configurações operacionais só passam a valer quando o tenant realmente as
  // define. Sem registro, a disponibilidade se comporta exatamente como antes.
  const settings = await client.tenantSettings.findUnique({ where: { tenantId } });
  if (settings && !settings.bookingEnabled) {
    throw createHttpError(409, "Este negócio está com o agendamento on-line desativado");
  }

  const appointmentDate = normalizeDate(date);
  if (settings) {
    const today = new Date();
    const horizon = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    horizon.setUTCDate(horizon.getUTCDate() + settings.maxFutureDays);
    if (appointmentDate > horizon) {
      throw createHttpError(400, `Agendamentos são aceitos com até ${settings.maxFutureDays} dias de antecedência`);
    }
  }

  const dayOfWeek = appointmentDate.getUTCDay();
  const [businessHours, schedules, legacyBlock, blocks, appointments] = await Promise.all([
    client.businessHours.findUnique({
      where: { tenantId_dayOfWeek: { tenantId, dayOfWeek } }
    }),
    client.professionalSchedule.findMany({
      where: { tenantId, professionalId: normalizedProfessionalId, dayOfWeek, active: true },
      orderBy: { startTime: "asc" }
    }),
    client.blockedDate.findUnique({
      where: { tenantId_date: { tenantId, date: appointmentDate } },
      select: { id: true }
    }),
    client.scheduleBlock.findMany({
      where: {
        tenantId,
        date: appointmentDate,
        OR: [{ professionalId: null }, { professionalId: normalizedProfessionalId }]
      }
    }),
    client.appointment.findMany({
      where: {
        tenantId,
        date: appointmentDate,
        professionalId: normalizedProfessionalId,
        ...(excludeAppointmentId ? { id: { not: excludeAppointmentId } } : {}),
        status: { not: "CANCELLED" }
      },
      include: { service: true }
    })
  ]);

  const occupiedIntervals = appointments.map((appointment) => {
    const start = timeToMinutes(appointment.time);
    return { start, end: start + appointment.service.duration };
  });
  const blockedIntervals = blocks.map((block) => block.allDay
    ? { start: 0, end: 1440 }
    : { start: timeToMinutes(block.startTime), end: timeToMinutes(block.endTime) });

  return {
    appointmentDate,
    businessHours,
    blockedIntervals,
    legacyBlock,
    occupiedIntervals,
    professional,
    schedules,
    service,
    settings
  };
}

// Minutos a partir da meia-noite UTC do dia consultado antes dos quais o
// agendamento já não respeita a antecedência mínima configurada.
function earliestAllowedMinute(context) {
  if (!context.settings?.minAdvanceMinutes) return null;
  const limit = new Date(Date.now() + context.settings.minAdvanceMinutes * 60_000);
  const dayStart = context.appointmentDate.getTime();
  const diff = Math.ceil((limit.getTime() - dayStart) / 60_000);
  return diff > 0 ? diff : null;
}

function buildSlots(context) {
  if (!context.businessHours?.isOpen || context.legacyBlock) return [];

  const businessStart = timeToMinutes(context.businessHours.openTime);
  const businessEnd = timeToMinutes(context.businessHours.closeTime);
  const step = context.settings?.slotDurationMinutes || 30;
  const earliest = earliestAllowedMinute(context);
  const slots = new Set();

  for (const schedule of context.schedules) {
    const intervalStart = Math.max(businessStart, timeToMinutes(schedule.startTime));
    const intervalEnd = Math.min(businessEnd, timeToMinutes(schedule.endTime));

    for (let start = intervalStart; start + context.service.duration <= intervalEnd; start += step) {
      if (earliest !== null && start < earliest) continue;
      const end = start + context.service.duration;
      const blocked = context.blockedIntervals.some((interval) =>
        intervalsOverlap(start, end, interval.start, interval.end)
      );
      const occupied = context.occupiedIntervals.some((interval) =>
        intervalsOverlap(start, end, interval.start, interval.end)
      );
      if (!blocked && !occupied) slots.add(minutesToTime(start));
    }
  }

  return [...slots].sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
}

export async function calculateAvailability({ client = prisma, tenantId, date, serviceId, professionalId, excludeAppointmentId }) {
  const context = await loadAvailability(client, { tenantId, date, serviceId, professionalId, excludeAppointmentId });
  return {
    appointmentDate: context.appointmentDate,
    professional: context.professional,
    service: context.service,
    slots: buildSlots(context)
  };
}

export async function assertAvailableSlot({ client = prisma, tenantId, date, time, serviceId, professionalId, excludeAppointmentId }) {
  if (!isValidTimeFormat(time)) {
    throw createHttpError(400, "Horário inválido — use o formato HH:MM");
  }

  const context = await loadAvailability(client, { tenantId, date, serviceId, professionalId, excludeAppointmentId });
  const slots = buildSlots(context);
  if (!slots.includes(time)) {
    const start = timeToMinutes(time);
    const end = start + context.service.duration;
    const occupied = context.occupiedIntervals.some((interval) =>
      intervalsOverlap(start, end, interval.start, interval.end)
    );
    if (occupied) throw createHttpError(409, "Horário já ocupado");
    throw createHttpError(400, "Horário indisponível");
  }

  return {
    appointmentDate: context.appointmentDate,
    professional: context.professional,
    service: context.service
  };
}

export async function findFirstAvailability({ client = prisma, tenantId, date, serviceId }) {
  if (!isValidDateInput(date)) throw createHttpError(400, "Data inválida");
  const normalizedServiceId = requireId(serviceId, "serviceId");
  const tenant = await client.tenant.findFirst({
    where: { slug: tenantId, active: true },
    select: { slug: true }
  });
  if (!tenant) throw createHttpError(404, "Negócio não encontrado ou inativo");
  const service = await client.service.findFirst({
    where: { id: normalizedServiceId, tenantId, active: true },
    select: { id: true }
  });
  if (!service) throw createHttpError(404, "Serviço não encontrado ou inativo");
  const professionals = await client.professional.findMany({
    where: { tenantId, active: true },
    select: { id: true },
    orderBy: { id: "asc" }
  });

  let first = null;
  for (const professional of professionals) {
    const result = await calculateAvailability({
      client,
      tenantId,
      date,
      serviceId: normalizedServiceId,
      professionalId: professional.id
    });
    if (!result.slots.length) continue;
    const candidate = { date, time: result.slots[0], professionalId: professional.id };
    if (!first || timeToMinutes(candidate.time) < timeToMinutes(first.time)) first = candidate;
  }
  return first;
}
