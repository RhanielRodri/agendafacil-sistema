import { PrismaClient } from "@prisma/client";
import { allowedStatuses, createHttpError, intervalsOverlap, isValidDateInput, normalizeDate, timeToMinutes } from "./utils.js";

const prisma = new PrismaClient();

async function validateAppointmentPayload(payload) {
  const required = ["serviceId", "professionalId", "clientName", "clientPhone", "date", "time"];
  const missing = required.filter((field) => !payload[field]);

  if (missing.length) {
    throw createHttpError(400, `Campos obrigatórios ausentes: ${missing.join(", ")}`);
  }

  if (!isValidDateInput(payload.date)) {
    throw createHttpError(400, "Data inválida");
  }

  const service = await prisma.service.findFirst({
    where: { id: Number(payload.serviceId), active: true }
  });

  if (!service) {
    throw createHttpError(404, "Serviço não encontrado ou inativo");
  }

  const professional = await prisma.professional.findFirst({
    where: { id: Number(payload.professionalId), active: true }
  });

  if (!professional) {
    throw createHttpError(404, "Profissional não encontrado ou inativo");
  }

  const appointmentDate = normalizeDate(payload.date);
  const blockedDate = await prisma.blockedDate.findUnique({
    where: { date: appointmentDate }
  });

  if (blockedDate) {
    throw createHttpError(400, "Data bloqueada para agendamentos");
  }

  const businessHours = await prisma.businessHours.findUnique({
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

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      date: appointmentDate,
      professionalId: Number(payload.professionalId),
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

  return { service, professional, appointmentDate };
}

export async function listAppointments(req, res, next) {
  try {
    const appointments = await prisma.appointment.findMany({
      include: {
        service: true,
        professional: true
      },
      orderBy: [
        { date: "asc" },
        { time: "asc" }
      ]
    });

    res.json(appointments);
  } catch (error) {
    next(error);
  }
}

export async function getAppointment(req, res, next) {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        service: true,
        professional: true
      }
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
    const { appointmentDate } = await validateAppointmentPayload(req.body);

    const appointment = await prisma.appointment.create({
      data: {
        serviceId: Number(req.body.serviceId),
        professionalId: Number(req.body.professionalId),
        clientName: req.body.clientName,
        clientPhone: req.body.clientPhone,
        clientEmail: req.body.clientEmail || null,
        date: appointmentDate,
        time: req.body.time,
        status: "NEW"
      },
      include: {
        service: true,
        professional: true
      }
    });

    res.status(201).json(appointment);
  } catch (error) {
    next(error);
  }
}

export async function updateAppointmentStatus(req, res, next) {
  try {
    const { status } = req.body;

    if (!allowedStatuses.includes(status)) {
      throw createHttpError(400, "Status inválido");
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: Number(req.params.id) }
    });

    if (!appointment) {
      throw createHttpError(404, "Agendamento não encontrado");
    }

    if (appointment.status === "CANCELLED" && status === "COMPLETED") {
      throw createHttpError(400, "Não é permitido alterar CANCELLED para COMPLETED");
    }

    const updated = await prisma.appointment.update({
      where: { id: appointment.id },
      data: { status },
      include: {
        service: true,
        professional: true
      }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
}
