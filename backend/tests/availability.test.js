import "dotenv/config";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import app from "../app.js";
import prisma from "../prismaClient.js";
import { hashPassword } from "../lib/password.js";

const STUDIO = "studio-cut";
const LUMIERE = "lumiere";
const STUDIO_EMAIL = "schedule.studio@test.local";
const LUMIERE_EMAIL = "schedule.lumiere@test.local";
const PASSWORD = "SchedulePass!234";

let server;
let baseUrl;
let studioCookie;
let lumiereCookie;
const fx = {};

function nextWeekday(dayOfWeek) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 10);
  while (date.getUTCDay() !== dayOfWeek) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const wednesday = nextWeekday(3);
const appointmentDate = new Date(`${wednesday}T00:00:00.000Z`);

async function api(path, { method = "GET", cookie, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  return { status: response.status, data };
}

async function loginCookie(tenantId, email) {
  const response = await fetch(`${baseUrl}/admin/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ demoId: tenantId, email, password: PASSWORD })
  });
  assert.equal(response.status, 200);
  const raw = response.headers.getSetCookie?.().find((value) => value.startsWith("admin_session=")) ||
    response.headers.get("set-cookie");
  return `admin_session=${raw.split("admin_session=")[1].split(";")[0]}`;
}

async function slots(tenantId, professionalId, serviceId) {
  return api(`/available-slots?demoId=${tenantId}&date=${wednesday}&professionalId=${professionalId}&serviceId=${serviceId}`);
}

async function replaceSchedule(professionalId, intervals, tenantId = STUDIO) {
  await prisma.professionalSchedule.deleteMany({ where: { professionalId } });
  await prisma.professionalSchedule.createMany({
    data: intervals.map(([startTime, endTime]) => ({
      tenantId,
      professionalId,
      dayOfWeek: 3,
      startTime,
      endTime
    }))
  });
}

before(async () => {
  await prisma.adminSession.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.appointmentAccessToken.deleteMany();
  await prisma.appointmentHistoryEvent.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.scheduleBlock.deleteMany();
  await prisma.professionalSchedule.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.businessHours.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.service.deleteMany();

  await prisma.tenant.upsert({
    where: { slug: STUDIO },
    update: { active: true },
    create: { slug: STUDIO, name: "Studio Cut" }
  });
  await prisma.tenant.upsert({
    where: { slug: LUMIERE },
    update: { active: true },
    create: { slug: LUMIERE, name: "Lumière Estética" }
  });

  const passwordHash = await hashPassword(PASSWORD);
  await prisma.adminUser.create({
    data: { tenantId: STUDIO, email: STUDIO_EMAIL, name: "Studio Schedule", passwordHash }
  });
  await prisma.adminUser.create({
    data: { tenantId: LUMIERE, email: LUMIERE_EMAIL, name: "Lumiere Schedule", passwordHash: await hashPassword(PASSWORD) }
  });

  fx.studio30 = await prisma.service.create({
    data: { tenantId: STUDIO, name: "Corte A3A", description: "x", duration: 30, price: 40 }
  });
  fx.studio60 = await prisma.service.create({
    data: { tenantId: STUDIO, name: "Combo A3A", description: "x", duration: 60, price: 70 }
  });
  fx.lumiere60 = await prisma.service.create({
    data: { tenantId: LUMIERE, name: "Estética A3A", description: "x", duration: 60, price: 150 }
  });
  fx.studioProA = await prisma.professional.create({
    data: { tenantId: STUDIO, name: "Barbeiro A3A A", specialty: "x", photo: "x" }
  });
  fx.studioProB = await prisma.professional.create({
    data: { tenantId: STUDIO, name: "Barbeiro A3A B", specialty: "x", photo: "x" }
  });
  fx.lumierePro = await prisma.professional.create({
    data: { tenantId: LUMIERE, name: "Profissional A3A Lumiere", specialty: "x", photo: "x" }
  });

  await prisma.businessHours.createMany({
    data: [
      { tenantId: STUDIO, dayOfWeek: 3, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { tenantId: LUMIERE, dayOfWeek: 3, openTime: "10:00", closeTime: "19:00", isOpen: true }
    ]
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  studioCookie = await loginCookie(STUDIO, STUDIO_EMAIL);
  lumiereCookie = await loginCookie(LUMIERE, LUMIERE_EMAIL);
});

beforeEach(async () => {
  await prisma.appointmentAccessToken.deleteMany();
  await prisma.appointmentHistoryEvent.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.scheduleBlock.deleteMany();
  await prisma.professionalSchedule.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.professionalSchedule.createMany({
    data: [
      { tenantId: STUDIO, professionalId: fx.studioProA.id, dayOfWeek: 3, startTime: "09:00", endTime: "18:00" },
      { tenantId: STUDIO, professionalId: fx.studioProB.id, dayOfWeek: 3, startTime: "09:00", endTime: "18:00" },
      { tenantId: LUMIERE, professionalId: fx.lumierePro.id, dayOfWeek: 3, startTime: "10:00", endTime: "19:00" }
    ]
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test("A3A 1. Studio Cut não aceita profissional Lumière em horário", async () => {
  const response = await api("/admin/professional-schedules", {
    method: "POST",
    cookie: studioCookie,
    body: { professionalId: fx.lumierePro.id, dayOfWeek: 4, startTime: "10:00", endTime: "12:00" }
  });
  assert.equal(response.status, 404);
});

test("A3A 2. horário individual limita o horário geral", async () => {
  await replaceSchedule(fx.studioProA.id, [["10:00", "16:00"]]);
  const response = await slots(STUDIO, fx.studioProA.id, fx.studio30.id);
  assert.equal(response.data[0], "10:00");
  assert.equal(response.data.at(-1), "15:30");
});

test("A3A 3. horário geral limita o horário individual", async () => {
  await replaceSchedule(fx.studioProA.id, [["08:00", "20:00"]]);
  const response = await slots(STUDIO, fx.studioProA.id, fx.studio30.id);
  assert.equal(response.data[0], "09:00");
  assert.equal(response.data.at(-1), "17:30");
});

test("A3A 4. dois intervalos no mesmo dia geram slots", async () => {
  await replaceSchedule(fx.studioProA.id, [["09:00", "12:00"], ["13:00", "18:00"]]);
  const response = await slots(STUDIO, fx.studioProA.id, fx.studio30.id);
  assert.ok(response.data.includes("11:30"));
  assert.ok(response.data.includes("13:00"));
  assert.ok(!response.data.includes("12:00"));
});

test("A3A 5. serviço não atravessa pausa entre intervalos", async () => {
  await replaceSchedule(fx.studioProA.id, [["09:00", "12:00"], ["13:00", "18:00"]]);
  const response = await slots(STUDIO, fx.studioProA.id, fx.studio60.id);
  assert.ok(response.data.includes("11:00"));
  assert.ok(!response.data.includes("11:30"));
  assert.ok(!response.data.includes("12:00"));
});

test("A3A 6. intervalo inválido é rejeitado", async () => {
  const response = await api("/admin/professional-schedules", {
    method: "POST",
    cookie: studioCookie,
    body: { professionalId: fx.studioProA.id, dayOfWeek: 4, startTime: "14:00", endTime: "14:00" }
  });
  assert.equal(response.status, 400);
});

test("A3A 7. intervalos sobrepostos são rejeitados", async () => {
  const response = await api("/admin/professional-schedules", {
    method: "POST",
    cookie: studioCookie,
    body: { professionalId: fx.studioProA.id, dayOfWeek: 3, startTime: "10:00", endTime: "12:00" }
  });
  assert.equal(response.status, 409);
});

test("A3A 8. bloqueio global do tenant afeta todos os profissionais", async () => {
  await prisma.scheduleBlock.create({
    data: { tenantId: STUDIO, date: appointmentDate, startTime: "10:00", endTime: "11:00" }
  });
  const first = await slots(STUDIO, fx.studioProA.id, fx.studio30.id);
  const second = await slots(STUDIO, fx.studioProB.id, fx.studio30.id);
  assert.ok(!first.data.includes("10:00"));
  assert.ok(!second.data.includes("10:00"));
});

test("A3A 9. bloqueio de profissional não afeta outro", async () => {
  await prisma.scheduleBlock.create({
    data: { tenantId: STUDIO, professionalId: fx.studioProA.id, date: appointmentDate, startTime: "10:00", endTime: "11:00" }
  });
  const first = await slots(STUDIO, fx.studioProA.id, fx.studio30.id);
  const second = await slots(STUDIO, fx.studioProB.id, fx.studio30.id);
  assert.ok(!first.data.includes("10:00"));
  assert.ok(second.data.includes("10:00"));
});

test("A3A 10. bloqueio parcial remove apenas slots sobrepostos", async () => {
  await prisma.scheduleBlock.create({
    data: { tenantId: STUDIO, date: appointmentDate, startTime: "10:15", endTime: "10:45" }
  });
  const response = await slots(STUDIO, fx.studioProA.id, fx.studio30.id);
  assert.ok(response.data.includes("09:30"));
  assert.ok(!response.data.includes("10:00"));
  assert.ok(!response.data.includes("10:30"));
  assert.ok(response.data.includes("11:00"));
});

test("A3A 11. bloqueio de dia inteiro remove todos os slots", async () => {
  await prisma.scheduleBlock.create({
    data: { tenantId: STUDIO, date: appointmentDate, allDay: true }
  });
  const response = await slots(STUDIO, fx.studioProA.id, fx.studio30.id);
  assert.deepEqual(response.data, []);
});

test("A3A 12. bloqueio Studio Cut não afeta Lumière", async () => {
  await prisma.scheduleBlock.create({
    data: { tenantId: STUDIO, date: appointmentDate, allDay: true }
  });
  const studio = await slots(STUDIO, fx.studioProA.id, fx.studio30.id);
  const lumiere = await slots(LUMIERE, fx.lumierePro.id, fx.lumiere60.id);
  assert.deepEqual(studio.data, []);
  assert.ok(lumiere.data.length > 0);
});

test("A3A 13. serviço de 30 minutos termina no fechamento", async () => {
  const response = await slots(STUDIO, fx.studioProA.id, fx.studio30.id);
  assert.equal(response.data.at(-1), "17:30");
});

test("A3A 14. serviço de 60 minutos termina no fechamento", async () => {
  const response = await slots(STUDIO, fx.studioProA.id, fx.studio60.id);
  assert.equal(response.data.at(-1), "17:00");
});

test("A3A 15. slot não pode ultrapassar o fechamento", async () => {
  const response = await api("/appointments", {
    method: "POST",
    body: {
      demoId: STUDIO,
      serviceId: fx.studio60.id,
      professionalId: fx.studioProA.id,
      clientName: "Cliente fechamento",
      clientPhone: "27999990000",
      date: wednesday,
      time: "17:30"
    }
  });
  assert.equal(response.status, 400);
});

test("A3A 16. agendamento existente remove slots sobrepostos", async () => {
  await prisma.appointment.create({
    data: {
      tenantId: STUDIO,
      serviceId: fx.studio60.id,
      professionalId: fx.studioProA.id,
      clientName: "Ocupado",
      clientPhone: "27999990001",
      date: appointmentDate,
      time: "10:00"
    }
  });
  const response = await slots(STUDIO, fx.studioProA.id, fx.studio30.id);
  assert.ok(response.data.includes("09:30"));
  assert.ok(!response.data.includes("10:00"));
  assert.ok(!response.data.includes("10:30"));
  assert.ok(response.data.includes("11:00"));
});

test("A3A 17. profissionais mantêm agendas independentes", async () => {
  await replaceSchedule(fx.studioProA.id, [["09:00", "12:00"]]);
  await replaceSchedule(fx.studioProB.id, [["14:00", "18:00"]]);
  const first = await slots(STUDIO, fx.studioProA.id, fx.studio30.id);
  const second = await slots(STUDIO, fx.studioProB.id, fx.studio30.id);
  assert.equal(first.data[0], "09:00");
  assert.equal(first.data.at(-1), "11:30");
  assert.equal(second.data[0], "14:00");
});

test("A3A 18. rota admin cross-tenant de horário retorna 404", async () => {
  const lumiereSchedule = await prisma.professionalSchedule.findFirst({
    where: { tenantId: LUMIERE, professionalId: fx.lumierePro.id }
  });
  const list = await api(`/admin/professional-schedules?professionalId=${fx.lumierePro.id}`, { cookie: studioCookie });
  const update = await api(`/admin/professional-schedules/${lumiereSchedule.id}`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { endTime: "18:30" }
  });
  assert.equal(list.status, 404);
  assert.equal(update.status, 404);
});

test("A3A 19. rota admin cross-tenant de bloqueio retorna 404", async () => {
  const block = await prisma.scheduleBlock.create({
    data: { tenantId: LUMIERE, date: appointmentDate, allDay: true }
  });
  const update = await api(`/admin/schedule-blocks/${block.id}`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { reason: "não autorizado" }
  });
  const remove = await api(`/admin/schedule-blocks/${block.id}`, {
    method: "DELETE",
    cookie: studioCookie
  });
  assert.equal(update.status, 404);
  assert.equal(remove.status, 404);
});

test("A3A 20. operações de agenda preservam agendamento existente", async () => {
  const appointment = await prisma.appointment.create({
    data: {
      tenantId: STUDIO,
      serviceId: fx.studio30.id,
      professionalId: fx.studioProA.id,
      clientName: "Preservado",
      clientPhone: "27999990002",
      date: appointmentDate,
      time: "10:00"
    }
  });
  const created = await api("/admin/professional-schedules", {
    method: "POST",
    cookie: studioCookie,
    body: { professionalId: fx.studioProB.id, dayOfWeek: 4, startTime: "09:00", endTime: "12:00" }
  });
  await api(`/admin/professional-schedules/${created.data.id}`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { endTime: "13:00" }
  });
  await api(`/admin/professional-schedules/${created.data.id}`, {
    method: "DELETE",
    cookie: studioCookie
  });
  assert.ok(await prisma.appointment.findUnique({ where: { id: appointment.id } }));
});

test("A3A 21. primeira disponibilidade é agregada entre profissionais", async () => {
  await replaceSchedule(fx.studioProA.id, [["11:00", "18:00"]]);
  await replaceSchedule(fx.studioProB.id, [["09:00", "18:00"]]);
  const response = await api(`/first-availability?demoId=${STUDIO}&date=${wednesday}&serviceId=${fx.studio30.id}`);
  assert.equal(response.status, 200);
  assert.equal(response.data.time, "09:00");
  assert.equal(response.data.professionalId, fx.studioProB.id);
});

test("A3A 22. tenant enviado no body não substitui a sessão", async () => {
  const response = await api("/admin/schedule-blocks", {
    method: "POST",
    cookie: studioCookie,
    body: { tenantId: LUMIERE, date: wednesday, allDay: true, reason: "sessão vence" }
  });
  assert.equal(response.status, 201);
  assert.equal(response.data.tenantId, STUDIO);
});

test("A3A 23. bloqueio pode ser atualizado e removido no próprio tenant", async () => {
  const created = await api("/admin/schedule-blocks", {
    method: "POST",
    cookie: lumiereCookie,
    body: { date: wednesday, startTime: "12:00", endTime: "13:00", reason: "pausa" }
  });
  const updated = await api(`/admin/schedule-blocks/${created.data.id}`, {
    method: "PATCH",
    cookie: lumiereCookie,
    body: { endTime: "13:30", reason: "pausa ampliada" }
  });
  const removed = await api(`/admin/schedule-blocks/${created.data.id}`, {
    method: "DELETE",
    cookie: lumiereCookie
  });
  assert.equal(created.status, 201);
  assert.equal(updated.status, 200);
  assert.equal(updated.data.endTime, "13:30");
  assert.equal(removed.status, 204);
});

test("A3A 24. banco rejeita bloqueio com profissional de outro tenant", async () => {
  await assert.rejects(() => prisma.scheduleBlock.create({
    data: {
      tenantId: STUDIO,
      professionalId: fx.lumierePro.id,
      date: appointmentDate,
      allDay: true
    }
  }));
});

test("A3A 25. banco rejeita bloqueio parcial sem início e fim", async () => {
  await assert.rejects(() => prisma.scheduleBlock.create({
    data: { tenantId: STUDIO, date: appointmentDate, allDay: false }
  }));
});

test("A3A 26. data impossível é rejeitada", async () => {
  const response = await api("/admin/schedule-blocks", {
    method: "POST",
    cookie: studioCookie,
    body: { date: "2026-02-30", allDay: true }
  });
  assert.equal(response.status, 400);
});

test("A3A 27. intervalo inativo também não pode se sobrepor", async () => {
  const response = await api("/admin/professional-schedules", {
    method: "POST",
    cookie: studioCookie,
    body: {
      professionalId: fx.studioProA.id,
      dayOfWeek: 3,
      startTime: "10:00",
      endTime: "11:00",
      active: false
    }
  });
  assert.equal(response.status, 409);
});
