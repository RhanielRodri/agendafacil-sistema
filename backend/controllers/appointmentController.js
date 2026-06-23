import prisma from "../prismaClient.js";
import {
  allowedStatuses,
  createHttpError,
  intervalsOverlap,
  isDateInPast,
  isValidDateInput,
  isValidTimeFormat,
  normalizeDate,
  sanitizeId,
  timeToMinutes
} from "./utils.js";

function validateClientFields(payload) {
  const name = typeof payload.clientName === "string" ? payload.clientName.trim() : "";
  const phone = typeof payload.clientPhone === "string" ? payload.clientPhone.trim() : "";

  if (name.length < 2) {
    throw createHttpError(400, "Nome do cliente inválido (mínimo 2 caracteres)");
  }

  if (phone.length < 7) {
    throw createHttpError(400, "Telefone do cliente inválido");
  }

  const email = typeof payload.clientEmail === "string" ? payload.clientEmail.trim() : null;

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createHttpError(400, "E-mail inválido");
  }

  return { name, phone, email: email || null };
}

async function validateAppointmentPayload(tx, payload) {
  const required = ["serviceId", "professionalId", "clientName", "clientPhone", "date", "time"];
  const missing = required.filter((field) => !payload[field] && payload[field] !== 0);

  if (missing.length) {
    throw createHttpError(400, `Campos obrigatórios ausentes: ${missing.join(", ")}`);
  }

  const serviceId = sanitizeId(payload.serviceId);
  const professionalId = sanitizeId(payload.professionalId);

  if (!serviceId) throw createHttpError(400, "serviceId inválido");
  if (!professionalId) throw createHttpError(400, "professionalId inválido");

  if (!isValidDateInput(payload.date)) {
    throw createHttpError(400, "Data inválida");
  }

  if (isDateInPast(payload.date)) {
    throw createHttpError(400, "Não é possível agendar para uma data passada");
  }

  if (!isValidTimeFormat(payload.time)) {
    throw createHttpError(400, "Horário inválido — use o formato HH:MM");
  }

  const clientFields = validateClientFields(payload);

  const service = await tx.service.findFirst({
    where: { id: serviceId, active: true }
  });

  if (!service) {
    throw createHttpError(404, "Serviço não encontrado ou inativo");
  }

  const professional = await tx.professional.findFirst({
    where: { id: professionalId, active: true }
  });

  if (!professional) {
    throw createHttpError(404, "Profissional não encontrado ou inativo");
  }

  const appointmentDate = normalizeDate(payload.date);

  const blockedDate = await tx.blockedDate.findUnique({
    where: { date: appointmentDate }
  });

  if (blockedDate) {
    throw createHttpError(400, "Data bloqueada para agendamentos");
  }

  const businessHours = await tx.businessHours.findUnique({
    where: { dayOfWeek: appointmentDate.getUTCDay() }
  });

  if (!businessHours || !businessHours.isOpen) {
    throw createHttpError(400, "Dia fechado para agendamentos");
  }

  const selectedTime = timeToMinutes(payload.time);
  const openTime = timeToMinutes(businessHours.openTime);
  const closeTime = timeToMinutes(businessHours.closeTime);

  if (selectedTime < openTime || selectedTime + service.duration > closeTime) {
    throw createHttpError(400, "Horário fora do funcionamento");
  }

  const existingAppointments = await tx.appointment.findMany({
    where: {
      date: appointmentDate,
      professionalId,
      status: { not: "CANCELLED" }
    },
    include: { service: true }
  });

  const selectedEnd = selectedTime + service.duration;
  const hasConflict = existingAppointments.some((appointment) => {
    const start = timeToMinutes(appointment.time);
    return intervalsOverlap(selectedTime, selectedEnd, start, start + appointment.service.duration);
  });

  if (hasConflict) {
    throw createHttpError(409, "Horário já ocupado");
  }

  return { service, professional, appointmentDate, serviceId, professionalId, clientFields };
}

export async function listAppointments(req, res, next) {
  try {
    const appointments = await prisma.appointment.findMany({
      include: { service: true, professional: true },
      orderBy: [{ date: "asc" }, { time: "asc" }]
    });

    res.json(appointments);
  } catch (error) {
    next(error);
  }
}

export async function getAppointment(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");

    const appointment = await prisma.appointment.findUnique({
      where: { id },
      include: { service: true, professional: true }
    });

    if (!appointment) {
      throw createHttpError(404, "Agendamento não encontrado");
    }

    res.json(appointment);
  } catch (error) {
    next(error);
  }
}

export async function createAppointment(req, res, next) {
  try {
    let appointment;

    try {
      appointment = await prisma.$transaction(async (tx) => {
        const { appointmentDate, serviceId, professionalId, clientFields } =
          await validateAppointmentPayload(tx, req.body);

        return tx.appointment.create({
          data: {
            serviceId,
            professionalId,
            clientName: clientFields.name,
            clientPhone: clientFields.phone,
            clientEmail: clientFields.email,
            date: appointmentDate,
            time: req.body.time,
            status: "NEW"
          },
          include: { service: true, professional: true }
        });
      }, { isolationLevel: "Serializable" });
    } catch (txError) {
      if (txError.code === "P2034") {
        throw createHttpError(409, "Horário indisponível — tente novamente");
      }
      if (txError.code === "P2002") {
        throw createHttpError(409, "Horário já ocupado");
      }
      throw txError;
    }

    res.status(201).json(appointment);
  } catch (error) {
    next(error);
  }
}

export async function updateAppointmentStatus(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");

    const { status } = req.body;

    if (!allowedStatuses.includes(status)) {
      throw createHttpError(400, "Status inválido");
    }

    const appointment = await prisma.appointment.findUnique({ where: { id } });

    if (!appointment) {
      throw createHttpError(404, "Agendamento não encontrado");
    }

    if (appointment.status === "CANCELLED" && status === "COMPLETED") {
      throw createHttpError(400, "Não é permitido alterar CANCELLED para COMPLETED");
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status },
      include: { service: true, professional: true }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
}
