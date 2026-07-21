import prisma from "../prismaClient.js";
import { assertAvailableSlot, calculateAvailability } from "../services/availabilityService.js";
import {
  appendHistoryEvent,
  assertStatusTransition,
  lockAppointment,
  publicAppointmentSummary,
  sanitizeReason,
  transitionAppointment
} from "../services/appointmentLifecycleService.js";
import {
  createManageToken,
  managementPath,
  resolveManageToken,
  revokeAppointmentTokens
} from "../services/appointmentTokenService.js";
import { appendRelationshipEvent } from "../services/relationshipService.js";
import {
  createHttpError,
  isDateInPast,
  isValidDateInput,
  sanitizeId
} from "./utils.js";

const appointmentInclude = {
  service: true,
  professional: true
};

function rawToken(req) {
  return req.get("X-Appointment-Token") || "";
}

function ensureReschedulable(appointment) {
  if (!["PENDING", "CONFIRMED"].includes(appointment.status)) {
    throw createHttpError(409, `Agendamento ${appointment.status} não pode ser reagendado`);
  }
}

function validateReschedulePayload(payload) {
  const professionalId = sanitizeId(payload?.professionalId);
  if (!professionalId) throw createHttpError(400, "professionalId inválido");
  if (!isValidDateInput(payload?.date)) throw createHttpError(400, "Data inválida");
  if (isDateInPast(payload.date)) throw createHttpError(400, "Não é possível reagendar para uma data passada");
  return professionalId;
}

function mapTransactionError(error) {
  if (error.code === "P2034" || (error.code === "P2010" && error.meta?.code === "40001")) {
    return createHttpError(409, "Horário indisponível — tente novamente");
  }
  if (error.code === "P2002") return createHttpError(409, "Horário já ocupado ou reagendamento já concluído");
  return error;
}

export async function getPublicAppointment(req, res, next) {
  try {
    const { appointment } = await resolveManageToken({
      client: prisma,
      tenantId: req.tenant.slug,
      rawToken: rawToken(req)
    });
    res.json(publicAppointmentSummary(appointment));
  } catch (error) {
    next(error);
  }
}

export async function confirmPublicAppointment(req, res, next) {
  try {
    const tenantId = req.tenant.slug;
    const token = rawToken(req);
    const result = await prisma.$transaction(async (tx) => {
      const initial = await resolveManageToken({ client: tx, tenantId, rawToken: token });
      await lockAppointment(tx, initial.appointment.id, tenantId);
      const current = await resolveManageToken({ client: tx, tenantId, rawToken: token });
      return transitionAppointment(tx, {
        appointment: current.appointment,
        toStatus: "CONFIRMED",
        actorType: "CUSTOMER"
      });
    }, { isolationLevel: "Serializable" });
    res.json(publicAppointmentSummary(result.appointment));
  } catch (error) {
    next(mapTransactionError(error));
  }
}

export async function cancelPublicAppointment(req, res, next) {
  try {
    const tenantId = req.tenant.slug;
    const token = rawToken(req);
    const reason = sanitizeReason(req.body?.reason);
    const result = await prisma.$transaction(async (tx) => {
      const initial = await resolveManageToken({
        client: tx,
        tenantId,
        rawToken: token,
        allowInactive: true
      });
      await lockAppointment(tx, initial.appointment.id, tenantId);
      const current = await resolveManageToken({
        client: tx,
        tenantId,
        rawToken: token,
        allowInactive: true
      });

      if (current.state !== "active") {
        if (current.appointment.status === "CANCELLED") {
          return { appointment: current.appointment, idempotent: true };
        }
        await resolveManageToken({ client: tx, tenantId, rawToken: token });
      }

      return transitionAppointment(tx, {
        appointment: current.appointment,
        toStatus: "CANCELLED",
        actorType: "CUSTOMER",
        reason,
        tokenWasUsed: true
      });
    }, { isolationLevel: "Serializable" });
    res.json(publicAppointmentSummary(result.appointment));
  } catch (error) {
    next(mapTransactionError(error));
  }
}

export async function getRescheduleAvailability(req, res, next) {
  try {
    const professionalId = validateReschedulePayload(req.query);
    const { appointment } = await resolveManageToken({
      client: prisma,
      tenantId: req.tenant.slug,
      rawToken: rawToken(req)
    });
    ensureReschedulable(appointment);
    const availability = await calculateAvailability({
      tenantId: req.tenant.slug,
      date: req.query.date,
      serviceId: appointment.serviceId,
      professionalId,
      excludeAppointmentId: appointment.id
    });
    res.json(availability.slots);
  } catch (error) {
    next(error);
  }
}

export async function reschedulePublicAppointment(req, res, next) {
  try {
    const tenantId = req.tenant.slug;
    const token = rawToken(req);
    const professionalId = validateReschedulePayload(req.body);
    let result;

    try {
      result = await prisma.$transaction(async (tx) => {
        const initial = await resolveManageToken({ client: tx, tenantId, rawToken: token });
        await lockAppointment(tx, initial.appointment.id, tenantId);
        const { appointment: original } = await resolveManageToken({
          client: tx,
          tenantId,
          rawToken: token
        });
        ensureReschedulable(original);
        assertStatusTransition(original.status, "CANCELLED");
        const originalDate = original.date.toISOString().slice(0, 10);
        if (
          req.body.date === originalDate
          && req.body.time === original.time
          && professionalId === original.professionalId
        ) {
          throw createHttpError(400, "Escolha um novo horário ou profissional para reagendar");
        }

        const { appointmentDate } = await assertAvailableSlot({
          client: tx,
          tenantId,
          date: req.body.date,
          time: req.body.time,
          serviceId: original.serviceId,
          professionalId,
          excludeAppointmentId: original.id
        });

        const replacement = await tx.appointment.create({
          data: {
            tenantId,
            serviceId: original.serviceId,
            professionalId,
            clientId: original.clientId,
            leadId: original.leadId,
            clientName: original.clientName,
            clientPhone: original.clientPhone,
            clientEmail: original.clientEmail,
            date: appointmentDate,
            time: req.body.time,
            status: "PENDING",
            rescheduledFromId: original.id
          },
          include: appointmentInclude
        });

        const reason = "Reagendado pelo cliente";
        await tx.appointment.update({
          where: { id: original.id },
          data: { status: "CANCELLED", cancellationReason: reason }
        });
        await revokeAppointmentTokens(tx, original.id, { used: true });

        const metadata = {
          previousAppointmentId: original.id,
          newAppointmentId: replacement.id,
          previousDate: original.date.toISOString().slice(0, 10),
          previousTime: original.time,
          newDate: replacement.date.toISOString().slice(0, 10),
          newTime: replacement.time,
          previousProfessionalId: original.professionalId,
          newProfessionalId: replacement.professionalId
        };

        await appendHistoryEvent(tx, {
          tenantId,
          appointmentId: original.id,
          type: "RESCHEDULED_FROM",
          fromStatus: original.status,
          toStatus: "CANCELLED",
          metadata,
          actorType: "CUSTOMER"
        });
        await appendHistoryEvent(tx, {
          tenantId,
          appointmentId: replacement.id,
          type: "CREATED",
          toStatus: "PENDING",
          actorType: "CUSTOMER"
        });
        await appendHistoryEvent(tx, {
          tenantId,
          appointmentId: replacement.id,
          type: "RESCHEDULED_TO",
          toStatus: "PENDING",
          metadata,
          actorType: "CUSTOMER"
        });
        await appendRelationshipEvent(tx, {
          tenantId,
          clientId: original.clientId,
          leadId: original.leadId,
          appointmentId: replacement.id,
          type: "APPOINTMENT_LINKED",
          actorType: "CUSTOMER",
          metadata: { source: "RESCHEDULE", appointmentId: replacement.id }
        });

        const newRawToken = await createManageToken(tx, replacement);
        return { appointment: replacement, rawToken: newRawToken };
      }, { isolationLevel: "Serializable" });
    } catch (txError) {
      throw mapTransactionError(txError);
    }

    res.status(201).json({
      ...publicAppointmentSummary(result.appointment),
      managementPath: managementPath(tenantId, result.rawToken)
    });
  } catch (error) {
    next(error);
  }
}
