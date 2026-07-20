import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import app from "../app.js";
import prisma from "../prismaClient.js";

const STUDIO = "studio-cut";
const LUMIERE = "lumiere";

let server;
let baseUrl;
const fx = {};

function nextWeekday(targetDow, minDaysAhead = 3) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + minDaysAhead);
  while (d.getUTCDay() !== targetDow) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

const wednesday = nextWeekday(3); // aberto em ambos os tenants na fixture

async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

before(async () => {
  await prisma.appointmentAccessToken.deleteMany();
  await prisma.appointmentHistoryEvent.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.scheduleBlock.deleteMany();
  await prisma.professionalSchedule.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.businessHours.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.service.deleteMany();

  await prisma.tenant.upsert({ where: { slug: STUDIO }, update: { active: true }, create: { slug: STUDIO, name: "Studio Cut" } });
  await prisma.tenant.upsert({ where: { slug: LUMIERE }, update: { active: true }, create: { slug: LUMIERE, name: "Lumière Estética" } });

  fx.studioService = await prisma.service.create({ data: { tenantId: STUDIO, name: "Corte teste", description: "x", duration: 30, price: 40 } });
  fx.studioPro = await prisma.professional.create({ data: { tenantId: STUDIO, name: "Pro Studio", specialty: "x", photo: "x" } });
  fx.lumiereService = await prisma.service.create({ data: { tenantId: LUMIERE, name: "Limpeza teste", description: "x", duration: 60, price: 150 } });
  fx.lumierePro = await prisma.professional.create({ data: { tenantId: LUMIERE, name: "Pro Lumiere", specialty: "x", photo: "x" } });

  await prisma.businessHours.createMany({
    data: [
      { tenantId: STUDIO, dayOfWeek: 1, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { tenantId: STUDIO, dayOfWeek: 3, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { tenantId: LUMIERE, dayOfWeek: 1, openTime: "00:00", closeTime: "00:00", isOpen: false },
      { tenantId: LUMIERE, dayOfWeek: 3, openTime: "10:00", closeTime: "19:00", isOpen: true }
    ]
  });

  await prisma.professionalSchedule.createMany({
    data: [
      { tenantId: STUDIO, professionalId: fx.studioPro.id, dayOfWeek: 1, startTime: "09:00", endTime: "18:00" },
      { tenantId: STUDIO, professionalId: fx.studioPro.id, dayOfWeek: 3, startTime: "09:00", endTime: "18:00" },
      { tenantId: LUMIERE, professionalId: fx.lumierePro.id, dayOfWeek: 3, startTime: "10:00", endTime: "19:00" }
    ]
  });

  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
});

test("1. horários independentes por tenant", async () => {
  const studio = await api(`/business-hours?demoId=${STUDIO}`);
  const lumiere = await api(`/business-hours?demoId=${LUMIERE}`);
  assert.equal(studio.data.find((h) => h.dayOfWeek === 1).isOpen, true);
  assert.equal(lumiere.data.find((h) => h.dayOfWeek === 1).isOpen, false);
});

test("2. datas bloqueadas independentes", async () => {
  await prisma.blockedDate.deleteMany({ where: { date: new Date(`${wednesday}T00:00:00.000Z`) } });
  await prisma.blockedDate.create({ data: { tenantId: STUDIO, date: new Date(`${wednesday}T00:00:00.000Z`), reason: "Bloqueio só Studio" } });

  const studioSlots = await api(`/available-slots?date=${wednesday}&professionalId=${fx.studioPro.id}&serviceId=${fx.studioService.id}&demoId=${STUDIO}`);
  const lumiereSlots = await api(`/available-slots?date=${wednesday}&professionalId=${fx.lumierePro.id}&serviceId=${fx.lumiereService.id}&demoId=${LUMIERE}`);
  assert.deepEqual(studioSlots.data, []);
  assert.ok(Array.isArray(lumiereSlots.data) && lumiereSlots.data.length > 0);

  await prisma.blockedDate.deleteMany({ where: { date: new Date(`${wednesday}T00:00:00.000Z`) } });
});

test("3. listagem de serviços isolada", async () => {
  const studio = await api(`/services?demoId=${STUDIO}`);
  const lumiere = await api(`/services?demoId=${LUMIERE}`);
  assert.ok(studio.data.every((s) => s.tenantId === STUDIO));
  assert.ok(lumiere.data.every((s) => s.tenantId === LUMIERE));
  assert.ok(!studio.data.some((s) => s.name === "Limpeza teste"));
});

test("4. listagem de profissionais isolada", async () => {
  const studio = await api(`/professionals?demoId=${STUDIO}`);
  const lumiere = await api(`/professionals?demoId=${LUMIERE}`);
  assert.ok(studio.data.every((p) => p.tenantId === STUDIO));
  assert.ok(lumiere.data.every((p) => p.tenantId === LUMIERE));
});

test("5. criação de agendamento com tenant correto", async () => {
  const res = await api("/appointments", {
    method: "POST",
    body: { demoId: STUDIO, serviceId: fx.studioService.id, professionalId: fx.studioPro.id, clientName: "Novo Cliente", clientPhone: "27988887777", date: wednesday, time: "09:00" }
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.tenantId, STUDIO);
});

test("6. rejeição de serviço e profissional cruzados", async () => {
  const res = await api("/appointments", {
    method: "POST",
    body: { demoId: STUDIO, serviceId: fx.studioService.id, professionalId: fx.lumierePro.id, clientName: "Cliente Cruzado", clientPhone: "27988886666", date: wednesday, time: "11:00" }
  });
  assert.equal(res.status, 404);
});

test("7. prevenção de sobreposição continua funcionando", async () => {
  const first = await api("/appointments", {
    method: "POST",
    body: { demoId: STUDIO, serviceId: fx.studioService.id, professionalId: fx.studioPro.id, clientName: "Cliente A", clientPhone: "27977776666", date: wednesday, time: "14:00" }
  });
  assert.equal(first.status, 201);

  const overlap = await api("/appointments", {
    method: "POST",
    body: { demoId: STUDIO, serviceId: fx.studioService.id, professionalId: fx.studioPro.id, clientName: "Cliente B", clientPhone: "27966665555", date: wednesday, time: "14:00" }
  });
  assert.equal(overlap.status, 409);
});
