import { Router } from "express";
import { listServices } from "../controllers/serviceController.js";
import { listProfessionals } from "../controllers/professionalController.js";
import { listAppointments, getAppointment, createAppointment, updateAppointmentStatus } from "../controllers/appointmentController.js";
import { listAvailableSlots } from "../controllers/availabilityController.js";
import { listBusinessHours } from "../controllers/businessHoursController.js";
import { requireAdmin, makeAdminSessionToken } from "../middleware/requireAdmin.js";
import prisma from "../prismaClient.js";

const router = Router();

// ─── Rate limit (in-memory, sem dependência extra) ───────────────────────────
const rlStore = new Map();

function rateLimit({ windowMs, max, message }) {
  return (req, res, next) => {
    const key = req.ip || "unknown";
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
router.get("/services", listServices);
router.get("/professionals", listProfessionals);
router.get("/available-slots", listAvailableSlots);
router.get("/business-hours", listBusinessHours);

router.post(
  "/appointments",
  rateLimit({ windowMs: 60_000, max: 10, message: "Muitas tentativas. Aguarde um momento." }),
  createAppointment
);

// ─── Autenticação admin ───────────────────────────────────────────────────────
router.post("/admin/session", (req, res) => {
  const { password } = req.body || {};
  const secret = process.env.ADMIN_SECRET;

  if (!secret) {
    return res.status(503).json({ message: "Autenticação administrativa não configurada" });
  }

  if (!password || password !== secret) {
    return res.status(401).json({ message: "Senha incorreta" });
  }

  try {
    const token = makeAdminSessionToken();
    res.cookie("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      maxAge: 8 * 60 * 60 * 1000
    });
    res.json({ ok: true });
  } catch {
    res.status(503).json({ message: "Autenticação administrativa não configurada" });
  }
});

router.delete("/admin/session", (req, res) => {
  res.clearCookie("admin_session", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax"
  });
  res.json({ ok: true });
});

// ─── Rotas administrativas (requerem autenticação) ────────────────────────────
router.get("/appointments", requireAdmin, listAppointments);

router.get("/appointments/export.csv", requireAdmin, async (req, res, next) => {
  try {
    const appointments = await prisma.appointment.findMany({
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

router.get("/appointments/:id", requireAdmin, getAppointment);
router.patch("/appointments/:id/status", requireAdmin, updateAppointmentStatus);

export default router;
