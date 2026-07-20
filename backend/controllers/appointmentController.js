import prisma from "../prismaClient.js";
import { assertAvailableSlot } from "../services/availabilityService.js";
import {
  appendHistoryEvent,
  lockAppointment,
  sanitizeReason,
  transitionAppointment
} from "../services/appointmentLifecycleService.js";
import { createManageToken, managementPath } from "../services/appointmentTokenService.js";
import {
  createHttpError,
  isDateInPast,
  isValidDateInput,
  sanitizeId
} from "./utils.js";

const appointmentInclude = {
  service: true,
  professional: true,
  rescheduledFrom: { select: { id: true, date: true, time: true } },
  rescheduledTo: { select: { id: true, date: true, time: true } }
};

function validateClientFields(payload) {
  const name = typeof payload.clientName === "string" ? payload.clientName.trim() : "";
  const phone = typeof payload.clientPhone === "string" ? payload.clientPhone.trim() : "";

  if (name.length < 2) {
    throw createHttpError(400, "Nome do cliente inválido (mínimo 2 caracteres)");
  }
  if (phone.length < 7) throw createHttpError(400, "Telefone do cliente inválido");

  const email = typeof payload.clientEmail === "string" ? payload.clientEmail.trim() : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createHttpError(400, "E-mail inválido");
  }
  return { name, phone, email: email || null };
}

async function validateAppointmentPayload(tx, tenantId, payload) {
  const required = ["serviceId", "professionalId", "clientName", "clientPhone", "date", "time"];
  const missing = required.filter((field) => !payload[field] && payload[field] !== 0);
  if (missing.length) {
    throw createHttpError(400, `Campos obrigatórios ausentes: ${missing.join(", ")}`);
  }

  const serviceId = sanitizeId(payload.serviceId);
  const professionalId = sanitizeId(payload.professionalId);
  if (!serviceId) throw createHttpError(400, "serviceId inválido");
  if (!professionalId) throw createHttpError(400, "professionalId inválido");
  if (!isValidDateInput(payload.date)) throw createHttpError(400, "Data inválida");
  if (isDateInPast(payload.date)) {
    throw createHttpError(400, "Não é possível agendar para uma data passada");
  }

  const clientFields = validateClientFields(payload);
  const availability = await assertAvailableSlot({
    client: tx,
    tenantId,
    date: payload.date,
    time: payload.time,
    serviceId,
    professionalId
  });
  return { ...availability, serviceId, professionalId, clientFields };
}

function mapTransactionError(error) {
  if (error.code === "P2034" || (error.code === "P2010" && error.meta?.code === "40001")) {
    return createHttpError(409, "Horário indisponível — tente novamente");
  }
  if (error.code === "P2002") return createHttpError(409, "Horário já ocupado");
  return error;
}

export async function listAppointments(req, res, next) {
  try {
    const appointments = await prisma.appointment.findMany({
      where: { tenantId: req.auth.tenantId },
      include: appointmentInclude,
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
    const appointment = await prisma.appointment.findFirst({
      where: { id, tenantId: req.auth.tenantId },
      include: appointmentInclude
    });
    if (!appointment) throw createHttpError(404, "Agendamento não encontrado");
    res.json(appointment);
  } catch (error) {
    next(error);
  }
}

export async function createAppointment(req, res, next) {
  try {
    const tenantId = req.tenant.slug;
    let result;
    try {
      result = await prisma.$transaction(async (tx) => {
        const { appointmentDate, serviceId, professionalId, clientFields } =
          await validateAppointmentPayload(tx, tenantId, req.body);
        const appointment = await tx.appointment.create({
          data: {
            tenantId,
            serviceId,
            professionalId,
            clientName: clientFields.name,
            clientPhone: clientFields.phone,
            clientEmail: clientFields.email,
            date: appointmentDate,
            time: req.body.time,
            status: "PENDING"
          },
          include: appointmentInclude
        });
        await appendHistoryEvent(tx, {
          tenantId,
          appointmentId: appointment.id,
          type: "CREATED",
          toStatus: "PENDING",
          actorType: "CUSTOMER"
        });
        const rawToken = await createManageToken(tx, appointment);
        return { appointment, rawToken };
      }, { isolationLevel: "Serializable" });
    } catch (txError) {
      throw mapTransactionError(txError);
    }

    res.status(201).json({
      ...result.appointment,
      managementPath: managementPath(tenantId, result.rawToken)
    });
  } catch (error) {
    next(error);
  }
}

export async function updateAppointmentStatus(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const toStatus = req.body?.status;
    const reason = sanitizeReason(req.body?.reason);

    const result = await prisma.$transaction(async (tx) => {
      await lockAppointment(tx, id, req.auth.tenantId);
      const appointment = await tx.appointment.findFirst({
        where: { id, tenantId: req.auth.tenantId },
        include: appointmentInclude
      });
      if (!appointment) throw createHttpError(404, "Agendamento não encontrado");
      return transitionAppointment(tx, {
        appointment,
        toStatus,
        actorType: "ADMIN",
        actorId: req.auth.userId,
        reason
      });
    }, { isolationLevel: "Serializable" });

    res.json(result.appointment);
  } catch (error) {
    next(mapTransactionError(error));
  }
}

export async function listAppointmentHistory(req, res, next) {
  try {
    const id = sanitizeId(req.params.id);
    if (!id) throw createHttpError(400, "ID inválido");
    const appointment = await prisma.appointment.findFirst({
      where: { id, tenantId: req.auth.tenantId },
      select: { id: true }
    });
    if (!appointment) throw createHttpError(404, "Agendamento não encontrado");

    const events = await prisma.appointmentHistoryEvent.findMany({
      where: { appointmentId: id, tenantId: req.auth.tenantId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    res.json(events);
  } catch (error) {
    next(error);
  }
}
