import { Router } from "express";
import { listServices } from "../controllers/serviceController.js";
import { listProfessionals } from "../controllers/professionalController.js";
import { listAppointments, getAppointment, createAppointment, updateAppointmentStatus } from "../controllers/appointmentController.js";
import { getFirstAvailability, listAvailableSlots } from "../controllers/availabilityController.js";
import { listBusinessHours } from "../controllers/businessHoursController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { resolveTenant } from "../middleware/tenant.js";
import { login, logout, me } from "../controllers/authController.js";
import {
  createProfessionalSchedule,
  deleteProfessionalSchedule,
  listProfessionalSchedules,
  updateProfessionalSchedule
} from "../controllers/professionalScheduleController.js";
import {
  createScheduleBlock,
  deleteScheduleBlock,
  listScheduleBlocks,
  updateScheduleBlock
} from "../controllers/scheduleBlockController.js";
import prisma from "../prismaClient.js";

const router = Router();

// ─── Rate limit (in-memory, sem dependência extra) ───────────────────────────
const rlStore = new Map();

function rateLimit({ windowMs, max, message, keyFn }) {
  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : (req.ip || "unknown");
    const now = Date.now();
    const cutoff = now - windowMs;
    const hits = (rlStore.get(key) || []).filter((t) => t > cutoff);
    if (hits.length >= max) {
      return res.status(429).json({ message });
    }
    hits.push(now);
    rlStore.set(key, hits);
    next();
  };
}

function loginKey(req) {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  return `login|${req.ip || "unknown"}|${email}`;
}

// ─── Saúde ───────────────────────────────────────────────────────────────────
router.get("/health", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", service: "AgendaFácil API", database: "ok" });
  } catch {
    res.status(503).json({
      status: "error",
      service: "AgendaFácil API",
      database: "unavailable",
      message: "Banco de dados indisponível"
    });
  }
});

// ─── Rotas públicas ───────────────────────────────────────────────────────────
router.get("/services", resolveTenant("query"), listServices);
router.get("/professionals", resolveTenant("query"), listProfessionals);
router.get("/available-slots", resolveTenant("query"), listAvailableSlots);
router.get("/first-availability", resolveTenant("query"), getFirstAvailability);
router.get("/business-hours", resolveTenant("query"), listBusinessHours);

router.post(
  "/appointments",
  rateLimit({ windowMs: 60_000, max: 10, message: "Muitas tentativas. Aguarde um momento." }),
  resolveTenant("body"),
  createAppointment
);

// ─── Autenticação admin (sessão real por tenant) ──────────────────────────────
router.post(
  "/admin/session",
  rateLimit({ windowMs: 60_000, max: 5, message: "Muitas tentativas de login. Aguarde um momento.", keyFn: loginKey }),
  resolveTenant("body"),
  login
);
router.delete("/admin/session", logout);
router.get("/admin/me", requireAuth, me);

// ─── Rotas administrativas (tenant derivado da sessão) ────────────────────────
router.get("/appointments", requireAuth, listAppointments);

router.get("/appointments/export.csv", requireAuth, async (req, res, next) => {
  try {
    const appointments = await prisma.appointment.findMany({
      where: { tenantId: req.auth.tenantId },
      include: { service: true, professional: true },
      orderBy: [{ date: "asc" }, { time: "asc" }]
    });

    const header = "id,data,horario,status,servico,profissional,cliente,telefone,email\n";
    const rows = appointments.map((a) => {
      const fields = [
        a.id,
        a.date.toISOString().slice(0, 10),
        a.time,
        a.status,
        `"${a.service.name.replace(/"/g, '""')}"`,
        `"${a.professional.name.replace(/"/g, '""')}"`,
        `"${a.clientName.replace(/"/g, '""')}"`,
        `"${a.clientPhone.replace(/"/g, '""')}"`,
        a.clientEmail ? `"${a.clientEmail.replace(/"/g, '""')}"` : ""
      ];
      return fields.join(",");
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=\"agendamentos.csv\"");
    res.send("﻿" + header + rows.join("\n"));
  } catch (error) {
    next(error);
  }
});

router.get("/appointments/:id", requireAuth, getAppointment);
router.patch("/appointments/:id/status", requireAuth, updateAppointmentStatus);
router.get("/admin/professional-schedules", requireAuth, listProfessionalSchedules);
router.post("/admin/professional-schedules", requireAuth, createProfessionalSchedule);
router.patch("/admin/professional-schedules/:id", requireAuth, updateProfessionalSchedule);
router.delete("/admin/professional-schedules/:id", requireAuth, deleteProfessionalSchedule);
router.get("/admin/schedule-blocks", requireAuth, listScheduleBlocks);
router.post("/admin/schedule-blocks", requireAuth, createScheduleBlock);
router.patch("/admin/schedule-blocks/:id", requireAuth, updateScheduleBlock);
router.delete("/admin/schedule-blocks/:id", requireAuth, deleteScheduleBlock);

export default router;
