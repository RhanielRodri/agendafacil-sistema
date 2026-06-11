import { Router } from "express";
import { listServices } from "../controllers/serviceController.js";
import { listProfessionals } from "../controllers/professionalController.js";
import { listAppointments, getAppointment, createAppointment, updateAppointmentStatus } from "../controllers/appointmentController.js";
import { listAvailableSlots } from "../controllers/availabilityController.js";
import { listBusinessHours } from "../controllers/businessHoursController.js";

const router = Router();

router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "AgendaFácil API" });
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
