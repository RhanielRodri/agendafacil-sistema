import { Router } from "express";
import { listServices } from "../controllers/serviceController.js";
import { listProfessionals } from "../controllers/professionalController.js";
import { listAppointments, getAppointment, createAppointment, updateAppointmentStatus } from "../controllers/appointmentController.js";
import { listAvailableSlots } from "../controllers/availabilityController.js";
import { listBusinessHours } from "../controllers/businessHoursController.js";
import prisma from "../prismaClient.js";

const router = Router();

router.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "AgendaFácil API", database: "ok" });
  } catch (error) {
    res.status(503).json({
      status: "error",
      service: "AgendaFácil API",
      database: "unavailable",
      message: "Banco de dados indisponível"
    });
  }
});

router.get("/services", listServices);
router.get("/professionals", listProfessionals);
router.get("/appointments", listAppointments);
router.get("/appointments/:id", getAppointment);
router.post("/appointments", createAppointment);
router.patch("/appointments/:id/status", updateAppointmentStatus);
router.get("/available-slots", listAvailableSlots);
router.get("/business-hours", listBusinessHours);

export default router;
