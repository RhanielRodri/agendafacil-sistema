import "dotenv/config";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import app from "../app.js";
import prisma from "../prismaClient.js";
import { hashPassword } from "../lib/password.js";
import { leadDedupeKey } from "../services/relationshipService.js";
import { clearRateLimitStore } from "../routes/index.js";

const execFileAsync = promisify(execFile);

const STUDIO = "studio-cut";
const LUMIERE = "lumiere";
const PASSWORD = "senha-local-a5b";
const fx = {};
let server;
let baseUrl;
let studioCookie;
let lumiereCookie;

const todayIso = new Date().toISOString().slice(0, 10);
const today = new Date(`${todayIso}T00:00:00.000Z`);

function shiftIso(days) {
  const date = new Date(today);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function hoursFromNow(hours) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

async function api(path, { method = "GET", body, cookie } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  return { status: response.status, data: await response.json().catch(() => null) };
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

async function createClient(tenantId, name, phone) {
  return prisma.client.create({
    data: { tenantId, name, phone, normalizedPhone: phone.replace(/\D/g, ""), email: `${phone}@example.test`, normalizedEmail: `${phone}@example.test` }
  });
}

async function createAppointment({ tenantId, client, service, professional, date = todayIso, time, status = "CONFIRMED", rescheduledFromId = null }) {
  return prisma.appointment.create({
    data: {
      tenantId,
      serviceId: service.id,
      professionalId: professional.id,
      clientId: client.id,
      clientName: client.name,
      clientPhone: client.phone,
      clientEmail: client.email,
      date: new Date(`${date}T00:00:00.000Z`),
      time,
      status,
      rescheduledFromId
    }
  });
}

async function createLead({ tenantId, client, service, professional, status = "NEW", source = "CONTACT", ownerUserId = null }) {
  return prisma.lead.create({
    data: {
      tenantId,
      clientId: client.id,
      source,
      status,
      priority: "NORMAL",
      serviceId: service.id,
      professionalId: professional.id,
      interestSummary: "Interesse A5B",
      ownerUserId,
      dedupeKey: leadDedupeKey({ source, serviceId: service.id, professionalId: professional.id, interestSummary: `A5B-${Math.random()}` })
    }
  });
}

const baseServices = () => [
  { id: fx.studioService.id, name: "Corte A5B", duration: 30, price: 45, active: true, displayOrder: 0, requiresEvaluation: false },
  { id: fx.studioServiceTwo.id, name: "Barba A5B", duration: 30, price: null, active: true, displayOrder: 1, requiresEvaluation: false },
  { id: fx.lumiereService.id, name: "Avaliação A5B", duration: 60, price: 180, active: true, displayOrder: 0, requiresEvaluation: false }
];

const baseProfessionals = () => [
  { id: fx.studioPro.id, name: "Barbeiro A5B", active: true, displayOrder: 0, internalContact: null },
  { id: fx.studioProTwo.id, name: "Barbeiro Dois A5B", active: true, displayOrder: 1, internalContact: null },
  { id: fx.lumierePro.id, name: "Esteticista A5B", active: true, displayOrder: 0, internalContact: null }
];

async function resetData() {
  await prisma.relationshipHistoryEvent.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.appointmentAccessToken.deleteMany();
  await prisma.appointmentHistoryEvent.deleteMany();
  await prisma.appointment.updateMany({ data: { leadId: null, rescheduledFromId: null } });
  await prisma.lead.updateMany({ data: { convertedAppointmentId: null } });
  await prisma.appointment.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.client.deleteMany();
  await prisma.scheduleBlock.deleteMany();
  await prisma.professionalService.deleteMany();
  await prisma.tenantSettings.deleteMany();

  const fixtureServiceIds = baseServices().map((service) => service.id);
  const fixtureProfessionalIds = baseProfessionals().map((professional) => professional.id);
  await prisma.professionalSchedule.deleteMany({ where: { professionalId: { notIn: fixtureProfessionalIds } } });
  await prisma.professional.deleteMany({ where: { id: { notIn: fixtureProfessionalIds } } });
  await prisma.service.deleteMany({ where: { id: { notIn: fixtureServiceIds } } });

  await Promise.all([
    ...baseServices().map(({ id, ...data }) => prisma.service.update({ where: { id }, data })),
    ...baseProfessionals().map(({ id, ...data }) => prisma.professional.update({ where: { id }, data }))
  ]);

  await prisma.professionalSchedule.deleteMany();
  await prisma.professionalSchedule.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) => [
      { tenantId: STUDIO, professionalId: fx.studioPro.id, dayOfWeek, startTime: "09:00", endTime: "18:00" },
      { tenantId: STUDIO, professionalId: fx.studioProTwo.id, dayOfWeek, startTime: "09:00", endTime: "18:00" },
      { tenantId: LUMIERE, professionalId: fx.lumierePro.id, dayOfWeek, startTime: "10:00", endTime: "19:00" }
    ])
  });

  await prisma.businessHours.deleteMany();
  await prisma.businessHours.createMany({
    data: [STUDIO, LUMIERE].flatMap((tenantId) => [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      tenantId,
      dayOfWeek,
      openTime: "08:00",
      closeTime: "20:00",
      isOpen: true
    })))
  });
}

before(async () => {
  await prisma.adminSession.deleteMany();
  await prisma.relationshipHistoryEvent.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.appointmentAccessToken.deleteMany();
  await prisma.appointmentHistoryEvent.deleteMany();
  await prisma.appointment.updateMany({ data: { leadId: null } });
  await prisma.lead.updateMany({ data: { convertedAppointmentId: null } });
  await prisma.appointment.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.client.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.professionalService.deleteMany();
  await prisma.tenantSettings.deleteMany();
  await prisma.scheduleBlock.deleteMany();
  await prisma.professionalSchedule.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.businessHours.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.service.deleteMany();

  await prisma.tenant.upsert({ where: { slug: STUDIO }, update: { active: true }, create: { slug: STUDIO, name: "Studio Cut" } });
  await prisma.tenant.upsert({ where: { slug: LUMIERE }, update: { active: true }, create: { slug: LUMIERE, name: "Lumière Estética" } });

  fx.studioService = await prisma.service.create({ data: { tenantId: STUDIO, name: "Corte A5B", description: "x", duration: 30, price: 45 } });
  fx.studioServiceTwo = await prisma.service.create({ data: { tenantId: STUDIO, name: "Barba A5B", description: "x", duration: 30, price: null } });
  fx.lumiereService = await prisma.service.create({ data: { tenantId: LUMIERE, name: "Avaliação A5B", description: "x", duration: 60, price: 180 } });
  fx.studioPro = await prisma.professional.create({ data: { tenantId: STUDIO, name: "Barbeiro A5B", specialty: "x", photo: "x" } });
  fx.studioProTwo = await prisma.professional.create({ data: { tenantId: STUDIO, name: "Barbeiro Dois A5B", specialty: "x", photo: "x" } });
  fx.lumierePro = await prisma.professional.create({ data: { tenantId: LUMIERE, name: "Esteticista A5B", specialty: "x", photo: "x" } });

  const passwordHash = await hashPassword(PASSWORD);
  fx.studioAdmin = await prisma.adminUser.create({ data: { tenantId: STUDIO, email: "a5b-studio@example.test", name: "Admin Studio A5B", passwordHash } });
  fx.lumiereAdmin = await prisma.adminUser.create({ data: { tenantId: LUMIERE, email: "a5b-lumiere@example.test", name: "Admin Lumiere A5B", passwordHash: await hashPassword(PASSWORD) } });

  await resetData();

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  studioCookie = await loginCookie(STUDIO, "a5b-studio@example.test");
  lumiereCookie = await loginCookie(LUMIERE, "a5b-lumiere@example.test");
});

beforeEach(async () => {
  clearRateLimitStore();
  await resetData();
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

// ─── Serviços ────────────────────────────────────────────────────────────────

test("A5B 1. cria serviço com preço opcional distinguindo zero de ausente", async () => {
  const withoutPrice = await api("/admin/services", {
    method: "POST",
    cookie: studioCookie,
    body: { name: "Consulta A5B", description: "sem preço", duration: 45 }
  });
  const freeService = await api("/admin/services", {
    method: "POST",
    cookie: studioCookie,
    body: { name: "Cortesia A5B", description: "grátis", duration: 15, price: 0 }
  });

  assert.equal(withoutPrice.status, 201);
  assert.equal(withoutPrice.data.price, null);
  assert.equal(freeService.status, 201);
  assert.equal(Number(freeService.data.price), 0);
});

test("A5B 2. nome duplicado no mesmo tenant é recusado e liberado em outro", async () => {
  const duplicate = await api("/admin/services", {
    method: "POST",
    cookie: studioCookie,
    body: { name: "Corte A5B", description: "x", duration: 30 }
  });
  const otherTenant = await api("/admin/services", {
    method: "POST",
    cookie: lumiereCookie,
    body: { name: "Corte A5B", description: "x", duration: 30 }
  });

  assert.equal(duplicate.status, 409);
  assert.equal(otherTenant.status, 201);
});

test("A5B 3. inativar serviço mantém histórico e some do público", async () => {
  const client = await createClient(STUDIO, "Cliente Inativar A5B", "27977770101");
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, date: shiftIso(-2), time: "09:00", status: "COMPLETED" });

  const inactivated = await api(`/admin/services/${fx.studioService.id}/active`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { active: false }
  });
  const publicList = await api(`/services?demoId=${STUDIO}`);
  const adminList = await api("/admin/services?active=false", { cookie: studioCookie });

  assert.equal(inactivated.status, 200);
  assert.equal(inactivated.data.active, false);
  assert.ok(!publicList.data.some((service) => service.id === fx.studioService.id));
  assert.ok(adminList.data.items.some((service) => service.id === fx.studioService.id));
  assert.equal(await prisma.appointment.count({ where: { serviceId: fx.studioService.id } }), 1);
});

test("A5B 4. dependências do serviço relatam vínculo e bloqueiam exclusão", async () => {
  const client = await createClient(STUDIO, "Cliente Dependência A5B", "27977770102");
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, date: shiftIso(3), time: "10:00" });
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro });
  await prisma.professionalService.create({ data: { tenantId: STUDIO, professionalId: fx.studioPro.id, serviceId: fx.studioService.id } });

  const { status, data } = await api(`/admin/services/${fx.studioService.id}/dependencies`, { cookie: studioCookie });

  assert.equal(status, 200);
  assert.equal(data.upcomingAppointments, 1);
  assert.equal(data.totalAppointments, 1);
  assert.equal(data.linkedProfessionals, 1);
  assert.equal(data.activeLeads, 1);
  assert.equal(data.removable, false);
});

test("A5B 5. cria profissional com contato interno e ordem", async () => {
  const created = await api("/admin/professionals", {
    method: "POST",
    cookie: studioCookie,
    body: { name: "Barbeiro Novo A5B", specialty: "Degradê", internalContact: "ramal 12", displayOrder: 5 }
  });

  assert.equal(created.status, 201);
  assert.equal(created.data.internalContact, "ramal 12");
  assert.equal(created.data.displayOrder, 5);
  assert.equal(created.data.active, true);
});

test("A5B 6. associa serviços ao profissional e substitui a lista inteira", async () => {
  const first = await api(`/admin/professionals/${fx.studioPro.id}/services`, {
    method: "PUT",
    cookie: studioCookie,
    body: { serviceIds: [fx.studioService.id, fx.studioServiceTwo.id] }
  });
  const second = await api(`/admin/professionals/${fx.studioPro.id}/services`, {
    method: "PUT",
    cookie: studioCookie,
    body: { serviceIds: [fx.studioServiceTwo.id] }
  });

  assert.equal(first.status, 200);
  assert.equal(first.data.services.length, 2);
  assert.equal(second.data.services.length, 1);
  assert.equal(second.data.services[0].id, fx.studioServiceTwo.id);
});

test("A5B 7. recurso de outro tenant responde 404", async () => {
  const foreignProfessional = await api(`/admin/professionals/${fx.lumierePro.id}`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { specialty: "tentativa" }
  });
  const foreignService = await api(`/admin/services/${fx.lumiereService.id}/dependencies`, { cookie: studioCookie });
  const foreignLink = await api(`/admin/professionals/${fx.studioPro.id}/services`, {
    method: "PUT",
    cookie: studioCookie,
    body: { serviceIds: [fx.lumiereService.id] }
  });

  assert.equal(foreignProfessional.status, 404);
  assert.equal(foreignService.status, 404);
  assert.equal(foreignLink.status, 404);
});

test("A5B 8. inativar profissional com agendamento futuro exige confirmação", async () => {
  const client = await createClient(STUDIO, "Cliente Futuro A5B", "27977770103");
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, date: shiftIso(2), time: "11:00" });

  const blocked = await api(`/admin/professionals/${fx.studioPro.id}/active`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { active: false }
  });
  const confirmed = await api(`/admin/professionals/${fx.studioPro.id}/active`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { active: false, confirm: true }
  });

  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.code, "CONFLICT_REQUIRES_CONFIRMATION");
  assert.equal(blocked.data.conflicts.length, 1);
  assert.equal(blocked.data.conflicts[0].time, "11:00");
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.active, false);
  assert.equal(await prisma.appointment.count({ where: { professionalId: fx.studioPro.id } }), 1);
});

// ─── Disponibilidade ─────────────────────────────────────────────────────────

test("A5B 9. horário geral válido é salvo por tenant", async () => {
  const saved = await api("/admin/business-hours", {
    method: "PUT",
    cookie: studioCookie,
    body: { days: [{ dayOfWeek: 1, isOpen: true, openTime: "07:00", closeTime: "21:00" }] }
  });
  const lumiere = await api("/admin/business-hours", { cookie: lumiereCookie });

  assert.equal(saved.status, 200);
  assert.equal(saved.data.days.find((day) => day.dayOfWeek === 1).openTime, "07:00");
  assert.equal(lumiere.data.find((day) => day.dayOfWeek === 1).openTime, "08:00");
});

test("A5B 10. horário geral inválido é recusado", async () => {
  const inverted = await api("/admin/business-hours", {
    method: "PUT",
    cookie: studioCookie,
    body: { days: [{ dayOfWeek: 2, isOpen: true, openTime: "19:00", closeTime: "09:00" }] }
  });
  const repeated = await api("/admin/business-hours", {
    method: "PUT",
    cookie: studioCookie,
    body: [{ dayOfWeek: 2 }, { dayOfWeek: 2 }]
  });
  const badFormat = await api("/admin/business-hours", {
    method: "PUT",
    cookie: studioCookie,
    body: { days: [{ dayOfWeek: 2, isOpen: true, openTime: "9h", closeTime: "18:00" }] }
  });

  assert.equal(inverted.status, 400);
  assert.equal(repeated.status, 400);
  assert.equal(badFormat.status, 400);
});

test("A5B 11. agenda individual aceita múltiplos intervalos e recusa sobreposição", async () => {
  await prisma.professionalSchedule.deleteMany({ where: { professionalId: fx.studioPro.id, dayOfWeek: 3 } });

  const morning = await api("/admin/professional-schedules", {
    method: "POST",
    cookie: studioCookie,
    body: { professionalId: fx.studioPro.id, dayOfWeek: 3, startTime: "09:00", endTime: "12:00" }
  });
  const afternoon = await api("/admin/professional-schedules", {
    method: "POST",
    cookie: studioCookie,
    body: { professionalId: fx.studioPro.id, dayOfWeek: 3, startTime: "13:00", endTime: "18:00" }
  });
  const overlapping = await api("/admin/professional-schedules", {
    method: "POST",
    cookie: studioCookie,
    body: { professionalId: fx.studioPro.id, dayOfWeek: 3, startTime: "11:00", endTime: "14:00" }
  });

  assert.equal(morning.status, 201);
  assert.equal(afternoon.status, 201);
  assert.equal(overlapping.status, 409);
});

test("A5B 12. copiar horários substitui os dias alvo do profissional", async () => {
  await api("/admin/business-hours", {
    method: "PUT",
    cookie: studioCookie,
    body: { days: [{ dayOfWeek: 1, isOpen: true, openTime: "07:00", closeTime: "13:00" }] }
  });

  const copied = await api("/admin/professional-schedules/copy", {
    method: "POST",
    cookie: studioCookie,
    body: { targetProfessionalId: fx.studioProTwo.id, source: "business", targetDays: [1] }
  });
  const monday = copied.data.schedules.filter((schedule) => schedule.dayOfWeek === 1);
  const untouched = copied.data.schedules.filter((schedule) => schedule.dayOfWeek === 2);

  assert.equal(copied.status, 200);
  assert.equal(monday.length, 1);
  assert.equal(monday[0].startTime, "07:00");
  assert.equal(monday[0].endTime, "13:00");
  assert.equal(untouched[0].startTime, "09:00");
});

test("A5B 13. mudança de agenda que descobre agendamento futuro exige confirmação", async () => {
  const target = shiftIso(3);
  const dayOfWeek = new Date(`${target}T00:00:00.000Z`).getUTCDay();
  const client = await createClient(STUDIO, "Cliente Agenda A5B", "27977770104");
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, date: target, time: "17:00" });

  const schedule = await prisma.professionalSchedule.findFirst({
    where: { tenantId: STUDIO, professionalId: fx.studioPro.id, dayOfWeek }
  });

  const blocked = await api(`/admin/professional-schedules/${schedule.id}`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { endTime: "16:00" }
  });
  const confirmed = await api(`/admin/professional-schedules/${schedule.id}`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { endTime: "16:00", confirm: true }
  });

  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.conflicts[0].time, "17:00");
  assert.equal(confirmed.status, 200);
  assert.equal(confirmed.data.endTime, "16:00");
  assert.equal((await prisma.appointment.count({ where: { tenantId: STUDIO, status: "CONFIRMED" } })), 1);
});

// ─── Bloqueios ───────────────────────────────────────────────────────────────

test("A5B 14. bloqueio parcial de profissional é criado com motivo interno", async () => {
  const created = await api("/admin/schedule-blocks", {
    method: "POST",
    cookie: studioCookie,
    body: { professionalId: fx.studioPro.id, date: shiftIso(4), allDay: false, startTime: "12:00", endTime: "13:00", reason: "Almoço" }
  });

  assert.equal(created.status, 201);
  assert.equal(created.data.allDay, false);
  assert.equal(created.data.reason, "Almoço");
  assert.equal(created.data.professionalId, fx.studioPro.id);
});

test("A5B 15. bloqueio geral vale para o tenant e não atravessa para o outro", async () => {
  const created = await api("/admin/schedule-blocks", {
    method: "POST",
    cookie: studioCookie,
    body: { date: shiftIso(5), allDay: true, reason: "Feriado interno" }
  });
  const studioList = await api("/admin/schedule-blocks?scope=future", { cookie: studioCookie });
  const lumiereList = await api("/admin/schedule-blocks?scope=future", { cookie: lumiereCookie });
  const foreignProfessional = await api("/admin/schedule-blocks", {
    method: "POST",
    cookie: studioCookie,
    body: { professionalId: fx.lumierePro.id, date: shiftIso(5), allDay: true }
  });

  assert.equal(created.status, 201);
  assert.equal(created.data.professionalId, null);
  assert.equal(studioList.data.length, 1);
  assert.equal(lumiereList.data.length, 0);
  assert.equal(foreignProfessional.status, 404);
});

test("A5B 16. bloqueio sobre agendamento futuro relata conflito antes de gravar", async () => {
  const target = shiftIso(6);
  const client = await createClient(STUDIO, "Cliente Bloqueio A5B", "27977770105");
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, date: target, time: "10:00" });

  const blocked = await api("/admin/schedule-blocks", {
    method: "POST",
    cookie: studioCookie,
    body: { date: target, allDay: false, startTime: "09:30", endTime: "11:00", reason: "Manutenção" }
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.data.conflicts.length, 1);
  assert.equal(await prisma.scheduleBlock.count(), 0);

  const confirmed = await api("/admin/schedule-blocks", {
    method: "POST",
    cookie: studioCookie,
    body: { date: target, allDay: false, startTime: "09:30", endTime: "11:00", reason: "Manutenção", confirm: true }
  });
  assert.equal(confirmed.status, 201);
  assert.equal(await prisma.appointment.count({ where: { status: "CONFIRMED" } }), 1);
});

// ─── Configurações ───────────────────────────────────────────────────────────

test("A5B 17. configurações são criadas por tenant e não se misturam", async () => {
  const studio = await api("/admin/settings", {
    method: "PATCH",
    cookie: studioCookie,
    body: { publicName: "Studio A5B", publicPhone: "(27) 3200-0001", maxFutureDays: 45 }
  });
  const lumiere = await api("/admin/settings", { cookie: lumiereCookie });

  assert.equal(studio.status, 200);
  assert.equal(studio.data.publicName, "Studio A5B");
  assert.equal(studio.data.maxFutureDays, 45);
  assert.equal(lumiere.data.publicName, null);
  assert.equal(lumiere.data.maxFutureDays, 90);
});

test("A5B 18. timezone, telefone e texto com HTML são validados", async () => {
  const badTimezone = await api("/admin/settings", { method: "PATCH", cookie: studioCookie, body: { timezone: "Marte/Olympus" } });
  const badPhone = await api("/admin/settings", { method: "PATCH", cookie: studioCookie, body: { publicPhone: "123" } });
  const markup = await api("/admin/settings", { method: "PATCH", cookie: studioCookie, body: { cancellationPolicy: "<script>alert(1)</script>" } });
  const good = await api("/admin/settings", { method: "PATCH", cookie: studioCookie, body: { timezone: "America/Bahia" } });

  assert.equal(badTimezone.status, 400);
  assert.equal(badPhone.status, 400);
  assert.equal(markup.status, 400);
  assert.equal(good.data.timezone, "America/Bahia");
});

test("A5B 19. antecedência mínima corta horários do agendamento público", async () => {
  const before = await api(`/available-slots?date=${todayIso}&professionalId=${fx.studioPro.id}&serviceId=${fx.studioService.id}&demoId=${STUDIO}`);
  await api("/admin/settings", { method: "PATCH", cookie: studioCookie, body: { minAdvanceMinutes: 1440 } });
  const after = await api(`/available-slots?date=${todayIso}&professionalId=${fx.studioPro.id}&serviceId=${fx.studioService.id}&demoId=${STUDIO}`);

  assert.equal(before.status, 200);
  assert.ok(before.data.length > 0);
  assert.equal(after.status, 200);
  assert.equal(after.data.length, 0);
});

test("A5B 20. limite futuro e agendamento desativado bloqueiam a rota pública", async () => {
  await api("/admin/settings", { method: "PATCH", cookie: studioCookie, body: { maxFutureDays: 5 } });
  const tooFar = await api(`/available-slots?date=${shiftIso(20)}&professionalId=${fx.studioPro.id}&serviceId=${fx.studioService.id}&demoId=${STUDIO}`);
  const inRange = await api(`/available-slots?date=${shiftIso(3)}&professionalId=${fx.studioPro.id}&serviceId=${fx.studioService.id}&demoId=${STUDIO}`);

  await api("/admin/settings", { method: "PATCH", cookie: studioCookie, body: { bookingEnabled: false } });
  const disabled = await api(`/available-slots?date=${shiftIso(3)}&professionalId=${fx.studioPro.id}&serviceId=${fx.studioService.id}&demoId=${STUDIO}`);

  assert.equal(tooFar.status, 400);
  assert.equal(inRange.status, 200);
  assert.equal(disabled.status, 409);
});

// ─── Indicadores ─────────────────────────────────────────────────────────────

async function studioPeriod() {
  const client = await createClient(STUDIO, "Cliente Métrica A5B", "27977770106");
  const other = await createClient(STUDIO, "Cliente Único A5B", "27977770107");
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, date: todayIso, time: "09:00", status: "COMPLETED" });
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, date: todayIso, time: "10:00", status: "NO_SHOW" });
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioServiceTwo, professional: fx.studioProTwo, date: todayIso, time: "11:00", status: "CONFIRMED" });
  await createAppointment({ tenantId: STUDIO, client: other, service: fx.studioService, professional: fx.studioProTwo, date: todayIso, time: "12:00", status: "CANCELLED" });
  return { client, other };
}

test("A5B 21. indicadores contam agendamentos do período por status", async () => {
  await studioPeriod();
  const { status, data } = await api("/admin/metrics?period=today", { cookie: studioCookie });

  assert.equal(status, 200);
  assert.equal(data.period.days, 1);
  assert.equal(data.appointments.total, 4);
  assert.deepEqual(data.appointments.byStatus, { PENDING: 0, CONFIRMED: 1, COMPLETED: 1, CANCELLED: 1, NO_SHOW: 1 });
});

test("A5B 22. taxas de comparecimento, cancelamento e no-show usam bases explícitas", async () => {
  await studioPeriod();
  const { data } = await api("/admin/metrics?period=today", { cookie: studioCookie });

  assert.equal(data.appointments.attendanceRate, 50);
  assert.equal(data.appointments.noShowRate, 50);
  assert.equal(data.appointments.cancellationRate, 25);
});

test("A5B 23. ocupação por profissional e por serviço vem da agenda real", async () => {
  await studioPeriod();
  const { data } = await api("/admin/metrics?period=today", { cookie: studioCookie });

  const first = data.capacity.byProfessional.find((row) => row.professionalId === fx.studioPro.id);
  const second = data.capacity.byProfessional.find((row) => row.professionalId === fx.studioProTwo.id);

  assert.equal(first.openMinutes, 540);
  assert.equal(first.bookedMinutes, 60);
  assert.equal(second.bookedMinutes, 30);
  assert.equal(data.capacity.bookedMinutes, 90);
  assert.equal(data.capacity.freeMinutes, data.capacity.openMinutes - 90);
  assert.equal(data.capacity.byService.length, 2);
});

test("A5B 24. leads são contados por etapa dentro do período", async () => {
  const client = await createClient(STUDIO, "Cliente Lead A5B", "27977770108");
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, status: "NEW" });
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, status: "CONTACTED" });
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, status: "QUALIFIED" });
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, status: "LOST" });

  const { data } = await api("/admin/metrics?period=today", { cookie: studioCookie });

  assert.equal(data.leads.created, 4);
  assert.equal(data.leads.byStatus.NEW, 1);
  assert.equal(data.leads.byStatus.CONTACTED, 1);
  assert.equal(data.leads.byStatus.QUALIFIED, 1);
  assert.equal(data.leads.byStatus.LOST, 1);
  assert.equal(data.leads.withoutOwner, 3);
});

test("A5B 25. conversão por origem separa criados e convertidos", async () => {
  const client = await createClient(STUDIO, "Cliente Origem A5B", "27977770109");
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, source: "WAITLIST", status: "CONVERTED" });
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, source: "WAITLIST", status: "NEW" });
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, source: "BOOKING", status: "NEW" });

  const { data } = await api("/admin/metrics?period=today", { cookie: studioCookie });
  const waitlist = data.leads.bySource.find((row) => row.source === "WAITLIST");
  const booking = data.leads.bySource.find((row) => row.source === "BOOKING");

  assert.equal(waitlist.created, 2);
  assert.equal(waitlist.converted, 1);
  assert.equal(waitlist.conversionRate, 50);
  assert.equal(booking.conversionRate, 0);
});

test("A5B 26. follow-ups vencidos e atraso médio são calculáveis", async () => {
  const client = await createClient(STUDIO, "Cliente FollowUp A5B", "27977770110");
  await prisma.followUp.create({
    data: { tenantId: STUDIO, clientId: client.id, dueAt: hoursFromNow(-3), type: "CONTACT", status: "OPEN", createdByUserId: fx.studioAdmin.id }
  });
  await prisma.followUp.create({
    data: {
      tenantId: STUDIO,
      clientId: client.id,
      dueAt: hoursFromNow(-4),
      type: "CONTACT",
      status: "COMPLETED",
      completedAt: hoursFromNow(-2),
      createdByUserId: fx.studioAdmin.id
    }
  });

  const { data } = await api("/admin/metrics?period=today", { cookie: studioCookie });

  assert.equal(data.followUps.created, 2);
  assert.equal(data.followUps.completed, 1);
  assert.equal(data.followUps.overdue, 1);
  assert.ok(data.followUps.averageDelayMinutes >= 115 && data.followUps.averageDelayMinutes <= 125);
});

test("A5B 27. clientes recorrentes e sem retorno seguem regra documentada", async () => {
  const { client } = await studioPeriod();
  const old = await createClient(STUDIO, "Cliente Antigo A5B", "27977770111");
  await createAppointment({ tenantId: STUDIO, client: old, service: fx.studioService, professional: fx.studioPro, date: shiftIso(-200), time: "09:00", status: "COMPLETED" });

  const { data } = await api("/admin/metrics?period=today", { cookie: studioCookie });

  assert.equal(data.clients.withMoreThanOne, 1);
  assert.equal(data.clients.returning, 1);
  assert.equal(data.clients.returnWindowDays, 90);
  assert.equal(data.clients.withoutRecentReturn, 1);
  assert.ok(client.id);
});

test("A5B 28. período personalizado respeita limite e recusa intervalo inválido", async () => {
  const valid = await api(`/admin/metrics?period=custom&from=${shiftIso(-10)}&to=${todayIso}`, { cookie: studioCookie });
  const tooLong = await api(`/admin/metrics?period=custom&from=${shiftIso(-200)}&to=${todayIso}`, { cookie: studioCookie });
  const inverted = await api(`/admin/metrics?period=custom&from=${todayIso}&to=${shiftIso(-5)}`, { cookie: studioCookie });
  const unknown = await api("/admin/metrics?period=decada", { cookie: studioCookie });

  assert.equal(valid.status, 200);
  assert.equal(valid.data.period.days, 11);
  assert.equal(tooLong.status, 400);
  assert.equal(inverted.status, 400);
  assert.equal(unknown.status, 400);
});

test("A5B 29. indicadores não atravessam tenants", async () => {
  await studioPeriod();
  const lumiereClient = await createClient(LUMIERE, "Cliente Lumiere A5B", "27966660201");
  await createAppointment({ tenantId: LUMIERE, client: lumiereClient, service: fx.lumiereService, professional: fx.lumierePro, date: todayIso, time: "10:00", status: "COMPLETED" });

  const studio = await api("/admin/metrics?period=today", { cookie: studioCookie });
  const lumiere = await api("/admin/metrics?period=today", { cookie: lumiereCookie });

  assert.equal(studio.data.tenantId, STUDIO);
  assert.equal(studio.data.appointments.total, 4);
  assert.equal(lumiere.data.tenantId, LUMIERE);
  assert.equal(lumiere.data.appointments.total, 1);
  assert.equal(lumiere.data.capacity.byProfessional.length, 1);
});

// ─── Contratos gerais ────────────────────────────────────────────────────────

test("A5B 30. listagens estruturais paginam com limite máximo", async () => {
  const page = await api("/admin/services?page=1&limit=1", { cookie: studioCookie });
  const overLimit = await api("/admin/services?page=1&limit=500", { cookie: studioCookie });
  const professionals = await api("/admin/professionals?page=2&limit=1", { cookie: studioCookie });

  assert.equal(page.status, 200);
  assert.equal(page.data.items.length, 1);
  assert.equal(page.data.pagination.total, 2);
  assert.equal(page.data.pagination.pages, 2);
  assert.equal(overLimit.status, 400);
  assert.equal(professionals.data.pagination.page, 2);
  assert.equal(professionals.data.items.length, 1);
});

test("A5B 31. ordenação é determinística e reordenável", async () => {
  const reordered = await api("/admin/services/order", {
    method: "PATCH",
    cookie: studioCookie,
    body: { order: [fx.studioServiceTwo.id, fx.studioService.id] }
  });
  const list = await api("/admin/services", { cookie: studioCookie });
  const foreign = await api("/admin/services/order", {
    method: "PATCH",
    cookie: studioCookie,
    body: { order: [fx.lumiereService.id] }
  });

  assert.equal(reordered.status, 200);
  assert.equal(list.data.items[0].id, fx.studioServiceTwo.id);
  assert.equal(list.data.items[1].id, fx.studioService.id);
  assert.equal(foreign.status, 404);
});

test("A5B 32. rotas anteriores continuam respondendo", async () => {
  const client = await createClient(STUDIO, "Cliente A5A A5B", "27977770112");
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, date: todayIso, time: "09:00", status: "PENDING" });

  const overview = await api("/admin/overview", { cookie: studioCookie });
  const agenda = await api("/admin/agenda", { cookie: studioCookie });
  const clients = await api("/admin/clients", { cookie: studioCookie });
  const publicServices = await api(`/services?demoId=${STUDIO}`);

  assert.equal(overview.status, 200);
  assert.equal(overview.data.day.total, 1);
  assert.equal(agenda.data.items.length, 1);
  assert.equal(clients.status, 200);
  assert.equal(publicServices.data.length, 2);
});

test("A5B 33. nenhuma resposta estrutural expõe dado interno", async () => {
  await api("/admin/settings", { method: "PATCH", cookie: studioCookie, body: { publicName: "Studio A5B" } });
  const publicSettings = await api(`/settings?demoId=${STUDIO}`);
  const client = await createClient(STUDIO, "Cliente Privado A5B", "27977770113");
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, date: shiftIso(2), time: "09:00" });
  const conflict = await api(`/admin/professionals/${fx.studioPro.id}/active`, {
    method: "PATCH",
    cookie: studioCookie,
    body: { active: false }
  });

  assert.equal(publicSettings.status, 200);
  assert.equal(publicSettings.data.slotDurationMinutes, undefined);
  assert.equal(publicSettings.data.minAdvanceMinutes, undefined);
  assert.equal(publicSettings.data.id, undefined);
  assert.equal(conflict.data.conflicts[0].clientPhone, undefined);
  assert.equal(conflict.data.conflicts[0].clientId, undefined);
});

// ─── Recálculo na confirmação ────────────────────────────────────────────────

async function bookedTomorrow(name, phone, time) {
  const client = await createClient(STUDIO, name, phone);
  return createAppointment({
    tenantId: STUDIO,
    client,
    service: fx.studioService,
    professional: fx.studioPro,
    date: shiftIso(1),
    time
  });
}

function narrowTomorrow(confirm) {
  return api("/admin/business-hours", {
    method: "PUT",
    cookie: studioCookie,
    body: {
      days: [{
        dayOfWeek: new Date(`${shiftIso(1)}T00:00:00.000Z`).getUTCDay(),
        isOpen: true,
        openTime: "10:00",
        closeTime: "12:00"
      }],
      ...(confirm ? { confirm: true } : {})
    }
  });
}

test("A5B 36. prévia de conflito não grava nada", async () => {
  const appointment = await bookedTomorrow("Prévia A5B", "27980000036", "09:00");
  const dayOfWeek = new Date(`${shiftIso(1)}T00:00:00.000Z`).getUTCDay();

  const preview = await narrowTomorrow(false);
  const stored = await prisma.businessHours.findFirst({ where: { tenantId: STUDIO, dayOfWeek } });
  const kept = await prisma.appointment.findUnique({ where: { id: appointment.id } });

  assert.equal(preview.status, 409);
  assert.equal(preview.data.code, "CONFLICT_REQUIRES_CONFIRMATION");
  assert.equal(preview.data.conflicts.length, 1);
  assert.equal(stored.openTime, "08:00");
  assert.equal(stored.closeTime, "20:00");
  assert.equal(kept.status, "CONFIRMED");
});

test("A5B 37. impacto é recalculado quando o banco muda entre prévia e confirmação", async () => {
  await bookedTomorrow("Prévia Um A5B", "27980000037", "09:00");
  const first = await narrowTomorrow(false);

  // Agendamento criado depois da prévia, como aconteceria com uma reserva
  // recebida enquanto o painel decidia.
  await bookedTomorrow("Prévia Dois A5B", "27980000038", "14:00");
  const second = await narrowTomorrow(false);

  assert.equal(first.data.conflicts.length, 1);
  assert.equal(second.data.conflicts.length, 2);
  assert.ok(second.data.conflicts.some((row) => row.clientName === "Prévia Dois A5B"));
});

test("A5B 38. confirmação aplica a mudança e devolve o impacto recalculado", async () => {
  const early = await bookedTomorrow("Confirma Um A5B", "27980000039", "09:00");
  const preview = await narrowTomorrow(false);
  const late = await bookedTomorrow("Confirma Dois A5B", "27980000040", "14:00");

  const confirmed = await narrowTomorrow(true);
  const dayOfWeek = new Date(`${shiftIso(1)}T00:00:00.000Z`).getUTCDay();
  const stored = confirmed.data.days.find((day) => day.dayOfWeek === dayOfWeek);
  const survivors = await prisma.appointment.findMany({
    where: { id: { in: [early.id, late.id] } },
    orderBy: { time: "asc" }
  });

  assert.equal(preview.data.conflicts.length, 1);
  assert.equal(confirmed.status, 200);
  assert.equal(stored.openTime, "10:00");
  assert.equal(stored.closeTime, "12:00");
  assert.equal(confirmed.data.appliedImpact.length, 2);
  assert.ok(confirmed.data.appliedImpact.some((row) => row.clientName === "Confirma Dois A5B"));
  assert.equal(survivors.length, 2);
  assert.deepEqual(survivors.map((row) => row.status), ["CONFIRMED", "CONFIRMED"]);
  assert.deepEqual(survivors.map((row) => row.time), ["09:00", "14:00"]);
});

test("A5B 34. sessão ausente ou inválida bloqueia todas as rotas novas", async () => {
  const paths = [
    "/admin/services",
    "/admin/professionals",
    "/admin/business-hours",
    "/admin/settings",
    "/admin/metrics"
  ];
  for (const path of paths) {
    const anonymous = await api(path);
    assert.equal(anonymous.status, 401, path);
  }

  const forged = await api("/admin/services", { cookie: "admin_session=token-invalido-a5b" });
  assert.equal(forged.status, 401);
});

test("A5B 35. seed local continua idempotente com as tabelas novas", async () => {
  const options = {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, NODE_ENV: "development" }
  };
  await execFileAsync(process.execPath, ["prisma/seed.js"], options);
  const first = {
    services: await prisma.service.count(),
    professionals: await prisma.professional.count(),
    links: await prisma.professionalService.count(),
    settings: await prisma.tenantSettings.count()
  };

  await execFileAsync(process.execPath, ["prisma/seed.js"], options);
  const second = {
    services: await prisma.service.count(),
    professionals: await prisma.professional.count(),
    links: await prisma.professionalService.count(),
    settings: await prisma.tenantSettings.count()
  };

  assert.deepEqual(second, first);
  assert.equal(first.settings, 2);
  assert.ok(first.links > 0);
  assert.ok(await prisma.service.count({ where: { active: false } }) >= 2);
});
