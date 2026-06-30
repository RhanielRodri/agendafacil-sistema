import prisma from "../prismaClient.js";
import { resolveDemoId } from "../config/demos.js";
import { createHttpError, intervalsOverlap, isValidDateInput, minutesToTime, normalizeDate, timeToMinutes } from "./utils.js";

export async function listAvailableSlots(req, res, next) {
  try {
    const { date, professionalId, serviceId } = req.query;
    const demoId = resolveDemoId(req.query.demoId);

    if (!demoId) {
      throw createHttpError(400, "Demonstração inválida");
    }

    if (!date || !professionalId || !serviceId) {
      throw createHttpError(400, "Informe date, professionalId e serviceId");
    }

    if (!isValidDateInput(date)) {
      throw createHttpError(400, "Data inválida");
    }

    const service = await prisma.service.findFirst({
      where: { id: Number(serviceId), demoId, active: true }
    });

    if (!service) {
      throw createHttpError(404, "Serviço não encontrado ou inativo");
    }

    const professional = await prisma.professional.findFirst({
      where: { id: Number(professionalId), demoId, active: true }
    });

    if (!professional) {
      throw createHttpError(404, "Profissional não encontrado ou inativo");
    }

    const appointmentDate = normalizeDate(date);
    const blockedDate = await prisma.blockedDate.findUnique({
      where: { date: appointmentDate }
    });

    if (blockedDate) {
      return res.json([]);
    }

    const dayOfWeek = appointmentDate.getUTCDay();
    const businessHours = await prisma.businessHours.findUnique({
      where: { dayOfWeek }
    });

    if (!businessHours || !businessHours.isOpen) {
      return res.json([]);
    }

    const appointments = await prisma.appointment.findMany({
      where: {
        date: appointmentDate,
        professionalId: Number(professionalId),
        status: { not: "CANCELLED" }
      },
      include: { service: true }
    });

    const occupiedIntervals = appointments.map((appointment) => {
      const start = timeToMinutes(appointment.time);
      return {
        start,
        end: start + appointment.service.duration
      };
    });
    const slots = [];
    const open = timeToMinutes(businessHours.openTime);
    const close = timeToMinutes(businessHours.closeTime);

    for (let minutes = open; minutes + service.duration <= close; minutes += 30) {
      const slot = minutesToTime(minutes);
      const end = minutes + service.duration;
      const hasConflict = occupiedIntervals.some((interval) =>
        intervalsOverlap(minutes, end, interval.start, interval.end)
      );

      if (!hasConflict) {
        slots.push(slot);
      }
    }

    res.json(slots);
  } catch (error) {
    next(error);
  }
}
