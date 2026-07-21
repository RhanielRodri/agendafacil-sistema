import "dotenv/config";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import app from "../app.js";
import prisma from "../prismaClient.js";
import { hashPassword } from "../lib/password.js";
import { hashAppointmentToken } from "../services/appointmentTokenService.js";
import { clearRateLimitStore } from "../routes/index.js";

const STUDIO = "studio-cut";
const LUMIERE = "lumiere";
const PASSWORD = "senha-local-a3b";
const STUDIO_EMAIL = "a3b-studio@example.test";
const LUMIERE_EMAIL = "a3b-lumiere@example.test";

let server;
let baseUrl;
let studioCookie;
let lumiereCookie;
const fx = {};

function nextWeekday(dayOfWeek, minimumDays = 10) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + minimumDays);
  while (date.getUTCDay() !== dayOfWeek) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const appointmentDay = nextWeekday(3);
const appointmentDate = new Date(`${appointmentDay}T00:00:00.000Z`);

async function api(path, { method = "GET", body, cookie, token } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(token ? { "X-Appointment-Token": token } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data, headers: response.headers };
}

async function loginCookie(tenantId, email) {
  const response = await fetch(`${baseUrl}/admin/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ demoId: tenantId, email, password: PASSWORD })
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
}

async function createBooking({
  tenantId = STUDIO,
  serviceId = fx.studio30.id,
  professionalId = fx.studioProA.id,
  date = appointmentDay,
  time = "09:00"
} = {}) {
  const response = await api("/appointments", {
    method: "POST",
    body: {
      demoId: tenantId,
      serviceId,
      professionalId,
      clientName: "Cliente A3B",
      clientPhone: "27999990000",
      clientEmail: "cliente@example.test",
      date,
      time
    }
  });
  assert.equal(response.status, 201);
  const token = new URLSearchParams(response.data.managementPath.split("#")[1]).get("agendamento");
  assert.match(token, /^[a-f0-9]{64}$/);
  return { response, token };
}

function publicPath(tenantId = STUDIO) {
  return `/public/appointment?demoId=${tenantId}`;
}

function actionPath(action, tenantId = STUDIO) {
  return `/public/appointment/${action}?demoId=${tenantId}`;
}

before(async () => {
  await prisma.appointmentAccessToken.deleteMany();
  await prisma.appointmentHistoryEvent.deleteMany();
  await prisma.relationshipHistoryEvent.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.client.deleteMany();
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

  fx.studio30 = await prisma.service.create({
    data: { tenantId: STUDIO, name: "Corte A3B", description: "x", duration: 30, price: 45 }
  });
  fx.studio60 = await prisma.service.create({
    data: { tenantId: STUDIO, name: "Combo A3B", description: "x", duration: 60, price: 75 }
  });
  fx.lumiere60 = await prisma.service.create({
    data: { tenantId: LUMIERE, name: "Limpeza A3B", description: "x", duration: 60, price: 180 }
  });
  fx.studioProA = await prisma.professional.create({
    data: { tenantId: STUDIO, name: "Profissional A3B A", specialty: "x", photo: "x" }
  });
  fx.studioProB = await prisma.professional.create({
    data: { tenantId: STUDIO, name: "Profissional A3B B", specialty: "x", photo: "x" }
  });
  fx.lumierePro = await prisma.professional.create({
    data: { tenantId: LUMIERE, name: "Profissional A3B Lumière", specialty: "x", photo: "x" }
  });

  await prisma.businessHours.createMany({
    data: [
      { tenantId: STUDIO, dayOfWeek: 3, openTime: "09:00", closeTime: "18:00", isOpen: true },
      { tenantId: LUMIERE, dayOfWeek: 3, openTime: "10:00", closeTime: "19:00", isOpen: true }
    ]
  });

  const passwordHash = await hashPassword(PASSWORD);
  await prisma.adminUser.upsert({
    where: { tenantId_email: { tenantId: STUDIO, email: STUDIO_EMAIL } },
    update: { passwordHash, active: true },
    create: { tenantId: STUDIO, email: STUDIO_EMAIL, name: "Admin A3B Studio", passwordHash }
  });
  await prisma.adminUser.upsert({
    where: { tenantId_email: { tenantId: LUMIERE, email: LUMIERE_EMAIL } },
    update: { passwordHash, active: true },
    create: { tenantId: LUMIERE, email: LUMIERE_EMAIL, name: "Admin A3B Lumière", passwordHash }
  });

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  studioCookie = await loginCookie(STUDIO, STUDIO_EMAIL);
  lumiereCookie = await loginCookie(LUMIERE, LUMIERE_EMAIL);
});

beforeEach(async () => {
  clearRateLimitStore();
  await prisma.appointmentAccessToken.deleteMany();
  await prisma.appointmentHistoryEvent.deleteMany();
  await prisma.relationshipHistoryEvent.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.client.deleteMany();
  await prisma.scheduleBlock.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.professionalSchedule.deleteMany();
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

test("A3B 1. criação gera histórico CREATED", async () => {
  const { response } = await createBooking();
  const event = await prisma.appointmentHistoryEvent.findFirst({
    where: { appointmentId: response.data.id, type: "CREATED" }
  });
  assert.equal(event.actorType, "CUSTOMER");
  assert.equal(event.toStatus, "PENDING");
});

test("A3B 2. criação gera token persistido como hash", async () => {
  const { response, token } = await createBooking();
  const stored = await prisma.appointmentAccessToken.findFirst({
    where: { appointmentId: response.data.id }
  });
  assert.equal(stored.tokenHash, hashAppointmentToken(token));
  assert.ok(stored.expiresAt > new Date());
});

test("A3B 3. token bruto não é persistido", async () => {
  const { token } = await createBooking();
  assert.equal(await prisma.appointmentAccessToken.findUnique({ where: { tokenHash: token } }), null);
});

test("A3B 4. token inválido recebe resposta genérica", async () => {
  const response = await api(publicPath(), { token: "a".repeat(64) });
  assert.equal(response.status, 404);
  assert.equal(response.data.code, "TOKEN_INVALID");
  assert.ok(!JSON.stringify(response.data).includes("appointment"));
});

test("A3B 5. token expirado é rejeitado", async () => {
  const { token } = await createBooking();
  await prisma.appointmentAccessToken.updateMany({
    where: { tokenHash: hashAppointmentToken(token) },
    data: { expiresAt: new Date(Date.now() - 60_000) }
  });
  const response = await api(publicPath(), { token });
  assert.equal(response.status, 410);
  assert.equal(response.data.code, "TOKEN_EXPIRED");
});

test("A3B 6. token revogado é rejeitado", async () => {
  const { token } = await createBooking();
  await prisma.appointmentAccessToken.updateMany({
    where: { tokenHash: hashAppointmentToken(token) },
    data: { revokedAt: new Date() }
  });
  const response = await api(publicPath(), { token });
  assert.equal(response.status, 410);
  assert.equal(response.data.code, "TOKEN_REVOKED");
});

test("A3B 7. confirmação pública muda PENDING para CONFIRMED", async () => {
  const { response: created, token } = await createBooking();
  const response = await api(actionPath("confirm"), { method: "POST", token });
  assert.equal(response.status, 200);
  assert.equal(response.data.status, "CONFIRMED");
  assert.equal((await prisma.appointment.findUnique({ where: { id: created.data.id } })).status, "CONFIRMED");
});

test("A3B 8. confirmação repetida é idempotente", async () => {
  const { response: created, token } = await createBooking();
  assert.equal((await api(actionPath("confirm"), { method: "POST", token })).status, 200);
  assert.equal((await api(actionPath("confirm"), { method: "POST", token })).status, 200);
  assert.equal(await prisma.appointmentHistoryEvent.count({
    where: { appointmentId: created.data.id, type: "CONFIRMED" }
  }), 1);
});

test("A3B 9. cliente cancela agendamento PENDING", async () => {
  const { response: created, token } = await createBooking();
  const response = await api(actionPath("cancel"), {
    method: "POST",
    token,
    body: { reason: "Mudança de planos" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.status, "CANCELLED");
  const saved = await prisma.appointment.findUnique({ where: { id: created.data.id } });
  assert.equal(saved.cancellationReason, "Mudança de planos");
});

test("A3B 10. cliente cancela agendamento CONFIRMED", async () => {
  const { token } = await createBooking();
  await api(actionPath("confirm"), { method: "POST", token });
  const response = await api(actionPath("cancel"), { method: "POST", token, body: {} });
  assert.equal(response.status, 200);
  assert.equal(response.data.status, "CANCELLED");
});

test("A3B 11. cancelamento libera o horário imediatamente", async () => {
  const { token } = await createBooking({ time: "10:00" });
  await api(actionPath("cancel"), { method: "POST", token, body: {} });
  const slots = await api(`/available-slots?demoId=${STUDIO}&date=${appointmentDay}&professionalId=${fx.studioProA.id}&serviceId=${fx.studio30.id}`);
  assert.ok(slots.data.includes("10:00"));
  const replacement = await createBooking({ time: "10:00" });
  assert.equal(replacement.response.status, 201);
});

test("A3B 12. motivo é sanitizado e limitado", async () => {
  const { response: created, token } = await createBooking();
  await api(actionPath("cancel"), {
    method: "POST",
    token,
    body: { reason: `\u0000  ${"x".repeat(400)}  ` }
  });
  const appointment = await prisma.appointment.findUnique({ where: { id: created.data.id } });
  const event = await prisma.appointmentHistoryEvent.findFirst({
    where: { appointmentId: created.data.id, type: "CANCELLED" }
  });
  assert.equal(appointment.cancellationReason.length, 300);
  assert.equal(event.metadata.reason.length, 300);
});

test("A3B 13. reagendamento cria novo registro", async () => {
  const { response: original, token } = await createBooking();
  const response = await api(actionPath("reschedule"), {
    method: "POST",
    token,
    body: { date: appointmentDay, time: "11:00", professionalId: fx.studioProB.id }
  });
  assert.equal(response.status, 201);
  assert.equal(await prisma.appointment.count(), 2);
  assert.notEqual((await prisma.appointment.findFirst({ where: { rescheduledFromId: original.data.id } })).id, original.data.id);
});

test("A3B 14. reagendamento preserva original cancelado", async () => {
  const { response: original, token } = await createBooking();
  await api(actionPath("reschedule"), {
    method: "POST",
    token,
    body: { date: appointmentDay, time: "11:00", professionalId: fx.studioProB.id }
  });
  const saved = await prisma.appointment.findUnique({ where: { id: original.data.id } });
  assert.equal(saved.status, "CANCELLED");
  assert.equal(saved.date.toISOString().slice(0, 10), appointmentDay);
  assert.equal(saved.time, "09:00");
});

test("A3B 15. vínculos entre original e novo são navegáveis", async () => {
  const { response: original, token } = await createBooking();
  await api(actionPath("reschedule"), {
    method: "POST",
    token,
    body: { date: appointmentDay, time: "11:00", professionalId: fx.studioProB.id }
  });
  const replacement = await prisma.appointment.findFirst({ where: { rescheduledFromId: original.data.id } });
  const loaded = await prisma.appointment.findUnique({
    where: { id: original.data.id },
    include: { rescheduledTo: true }
  });
  assert.equal(loaded.rescheduledTo.id, replacement.id);
});

test("A3B 16. token novo substitui e invalida o antigo", async () => {
  const { token } = await createBooking();
  const response = await api(actionPath("reschedule"), {
    method: "POST",
    token,
    body: { date: appointmentDay, time: "11:00", professionalId: fx.studioProB.id }
  });
  const newToken = new URLSearchParams(response.data.managementPath.split("#")[1]).get("agendamento");
  assert.notEqual(newToken, token);
  assert.equal((await api(publicPath(), { token })).data.code, "TOKEN_USED");
  assert.equal((await api(publicPath(), { token: newToken })).status, 200);
});

test("A3B 17. reagendamento respeita duração do serviço", async () => {
  const { token } = await createBooking({
    tenantId: LUMIERE,
    serviceId: fx.lumiere60.id,
    professionalId: fx.lumierePro.id,
    time: "10:00"
  });
  const response = await api(actionPath("reschedule", LUMIERE), {
    method: "POST",
    token,
    body: { date: appointmentDay, time: "18:30", professionalId: fx.lumierePro.id }
  });
  assert.equal(response.status, 400);
  assert.equal(await prisma.appointment.count(), 1);
});

test("A3B 18. reagendamento respeita bloqueio", async () => {
  const { token } = await createBooking();
  await prisma.scheduleBlock.create({
    data: { tenantId: STUDIO, date: appointmentDate, startTime: "11:00", endTime: "12:00" }
  });
  const response = await api(actionPath("reschedule"), {
    method: "POST",
    token,
    body: { date: appointmentDay, time: "11:00", professionalId: fx.studioProB.id }
  });
  assert.equal(response.status, 400);
  assert.equal(await prisma.appointment.count(), 1);
});

test("A3B 19. reagendamento concorrente cria apenas uma substituição", async () => {
  const { response: original, token } = await createBooking();
  const responses = await Promise.all([
    api(actionPath("reschedule"), {
      method: "POST",
      token,
      body: { date: appointmentDay, time: "11:00", professionalId: fx.studioProB.id }
    }),
    api(actionPath("reschedule"), {
      method: "POST",
      token,
      body: { date: appointmentDay, time: "12:00", professionalId: fx.studioProB.id }
    })
  ]);
  assert.equal(responses.filter((response) => response.status === 201).length, 1);
  assert.ok(responses.every((response) => [201, 409, 410].includes(response.status)));
  assert.equal(await prisma.appointment.count({ where: { rescheduledFromId: original.data.id } }), 1);
});

test("A3B 20. transição administrativa válida registra ator", async () => {
  const { response: created } = await createBooking();
  const response = await api(`/appointments/${created.data.id}/status`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { status: "CONFIRMED" }
  });
  assert.equal(response.status, 200);
  const event = await prisma.appointmentHistoryEvent.findFirst({
    where: { appointmentId: created.data.id, type: "CONFIRMED" }
  });
  assert.equal(event.actorType, "ADMIN");
  assert.ok(event.actorId);
});

test("A3B 21. transição administrativa inválida é bloqueada", async () => {
  const { response: created } = await createBooking();
  const response = await api(`/appointments/${created.data.id}/status`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { status: "COMPLETED" }
  });
  assert.equal(response.status, 409);
  assert.equal((await prisma.appointment.findUnique({ where: { id: created.data.id } })).status, "PENDING");
});

test("A3B 22. admin conclui somente agendamento confirmado", async () => {
  const { response: created } = await createBooking();
  await api(`/appointments/${created.data.id}/status`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { status: "CONFIRMED" }
  });
  const response = await api(`/appointments/${created.data.id}/status`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { status: "COMPLETED" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.status, "COMPLETED");
});

test("A3B 23. admin marca no-show somente após confirmação", async () => {
  const { response: created } = await createBooking();
  await api(`/appointments/${created.data.id}/status`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { status: "CONFIRMED" }
  });
  const response = await api(`/appointments/${created.data.id}/status`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { status: "NO_SHOW", reason: "Cliente não compareceu" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.data.status, "NO_SHOW");
});

test("A3B 24. histórico administrativo vem ordenado", async () => {
  const { response: created } = await createBooking();
  await api(`/appointments/${created.data.id}/status`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { status: "CONFIRMED" }
  });
  const response = await api(`/appointments/${created.data.id}/history`, { cookie: studioCookie });
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.map((event) => event.type), ["CREATED", "CONFIRMED"]);
  assert.ok(response.data[0].id < response.data[1].id);
});

test("A3B 25. histórico não cruza tenants", async () => {
  const { response: lumiere } = await createBooking({
    tenantId: LUMIERE,
    serviceId: fx.lumiere60.id,
    professionalId: fx.lumierePro.id,
    time: "10:00"
  });
  const response = await api(`/appointments/${lumiere.data.id}/history`, { cookie: studioCookie });
  assert.equal(response.status, 404);
});

test("A3B 26. token Studio Cut não funciona na Lumière", async () => {
  const { token } = await createBooking();
  const response = await api(publicPath(LUMIERE), { token });
  assert.equal(response.status, 404);
  assert.equal(response.data.code, "TOKEN_INVALID");
});

test("A3B 27. admin Studio Cut não altera Lumière", async () => {
  const { response: lumiere } = await createBooking({
    tenantId: LUMIERE,
    serviceId: fx.lumiere60.id,
    professionalId: fx.lumierePro.id,
    time: "10:00"
  });
  const response = await api(`/appointments/${lumiere.data.id}/status`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { status: "CONFIRMED" }
  });
  assert.equal(response.status, 404);
});

test("A3B 28. ações públicas têm rate limit", async () => {
  const invalidToken = "f".repeat(64);
  const responses = [];
  for (let index = 0; index < 11; index += 1) {
    responses.push(await api(actionPath("confirm"), { method: "POST", token: invalidToken }));
  }
  assert.equal(responses.at(-1).status, 429);
});

test("A3B 29. respostas não expõem tokenHash", async () => {
  const { response, token } = await createBooking();
  const summary = await api(publicPath(), { token });
  const admin = await api(`/appointments/${response.data.id}`, { cookie: studioCookie });
  assert.ok(!JSON.stringify(response.data).includes("tokenHash"));
  assert.ok(!JSON.stringify(summary.data).includes("tokenHash"));
  assert.ok(!JSON.stringify(admin.data).includes("tokenHash"));
});

test("A3B 30. logs HTTP não contêm token bruto", async () => {
  const { token } = await createBooking();
  let output = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = function capture(chunk, ...args) {
    output += String(chunk);
    return true;
  };
  try {
    await api(publicPath(), { token });
  } finally {
    process.stdout.write = originalWrite;
  }
  assert.ok(!output.includes(token));
});
