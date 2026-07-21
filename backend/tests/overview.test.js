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
const PASSWORD = "senha-local-a5a";
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

async function createAppointment({ tenantId, client, service, professional, date = todayIso, time, status = "PENDING", leadId = null }) {
  return prisma.appointment.create({
    data: {
      tenantId,
      serviceId: service.id,
      professionalId: professional.id,
      clientId: client.id,
      leadId,
      clientName: client.name,
      clientPhone: client.phone,
      clientEmail: client.email,
      date: new Date(`${date}T00:00:00.000Z`),
      time,
      status
    }
  });
}

async function createLead({ tenantId, client, service, professional, status = "NEW", ownerUserId = null, interestSummary = "Interesse A5A", source = "CONTACT" }) {
  return prisma.lead.create({
    data: {
      tenantId,
      clientId: client.id,
      source,
      status,
      priority: "NORMAL",
      serviceId: service.id,
      professionalId: professional.id,
      interestSummary,
      ownerUserId,
      dedupeKey: leadDedupeKey({ source, serviceId: service.id, professionalId: professional.id, interestSummary })
    }
  });
}

async function createFollowUp({ tenantId, client, lead, dueAt, createdByUserId, status = "OPEN" }) {
  return prisma.followUp.create({
    data: { tenantId, clientId: client.id, leadId: lead?.id ?? null, dueAt, type: "CONTACT", status, createdByUserId }
  });
}

async function resetData() {
  await prisma.relationshipHistoryEvent.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.appointmentAccessToken.deleteMany();
  await prisma.appointmentHistoryEvent.deleteMany();
  await prisma.appointment.updateMany({ data: { leadId: null } });
  await prisma.lead.updateMany({ data: { convertedAppointmentId: null } });
  await prisma.appointment.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.client.deleteMany();
}

before(async () => {
  await prisma.adminSession.deleteMany();
  await resetData();
  await prisma.adminUser.deleteMany();
  await prisma.scheduleBlock.deleteMany();
  await prisma.professionalSchedule.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.businessHours.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.service.deleteMany();

  await prisma.tenant.upsert({ where: { slug: STUDIO }, update: { active: true }, create: { slug: STUDIO, name: "Studio Cut" } });
  await prisma.tenant.upsert({ where: { slug: LUMIERE }, update: { active: true }, create: { slug: LUMIERE, name: "Lumière Estética" } });

  fx.studioService = await prisma.service.create({ data: { tenantId: STUDIO, name: "Corte A5A", description: "x", duration: 30, price: 45 } });
  fx.lumiereService = await prisma.service.create({ data: { tenantId: LUMIERE, name: "Avaliação A5A", description: "x", duration: 60, price: 180 } });
  fx.studioPro = await prisma.professional.create({ data: { tenantId: STUDIO, name: "Barbeiro A5A", specialty: "x", photo: "x" } });
  fx.studioProTwo = await prisma.professional.create({ data: { tenantId: STUDIO, name: "Barbeiro Dois A5A", specialty: "x", photo: "x" } });
  fx.lumierePro = await prisma.professional.create({ data: { tenantId: LUMIERE, name: "Esteticista A5A", specialty: "x", photo: "x" } });

  await prisma.professionalSchedule.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].flatMap((dayOfWeek) => [
      { tenantId: STUDIO, professionalId: fx.studioPro.id, dayOfWeek, startTime: "09:00", endTime: "18:00" },
      { tenantId: STUDIO, professionalId: fx.studioProTwo.id, dayOfWeek, startTime: "09:00", endTime: "18:00" },
      { tenantId: LUMIERE, professionalId: fx.lumierePro.id, dayOfWeek, startTime: "10:00", endTime: "19:00" }
    ])
  });

  const passwordHash = await hashPassword(PASSWORD);
  fx.studioAdmin = await prisma.adminUser.create({ data: { tenantId: STUDIO, email: "a5a-studio@example.test", name: "Admin Studio A5A", passwordHash } });
  fx.lumiereAdmin = await prisma.adminUser.create({ data: { tenantId: LUMIERE, email: "a5a-lumiere@example.test", name: "Admin Lumiere A5A", passwordHash: await hashPassword(PASSWORD) } });

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  studioCookie = await loginCookie(STUDIO, "a5a-studio@example.test");
  lumiereCookie = await loginCookie(LUMIERE, "a5a-lumiere@example.test");
});

beforeEach(async () => {
  clearRateLimitStore();
  await resetData();
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

async function studioDay() {
  const client = await createClient(STUDIO, "Cliente Dia A5A", "27977770001");
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, time: "09:00", status: "CONFIRMED" });
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, time: "10:00", status: "PENDING" });
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, time: "11:00", status: "COMPLETED" });
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioProTwo, time: "12:00", status: "CANCELLED" });
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioProTwo, time: "13:00", status: "NO_SHOW" });
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, date: shiftIso(1), time: "09:00", status: "PENDING" });
  return client;
}

test("A5A 1. resumo do dia é isolado por tenant", async () => {
  await studioDay();
  const lumiereClient = await createClient(LUMIERE, "Cliente Lumiere A5A", "27966660001");
  await createAppointment({ tenantId: LUMIERE, client: lumiereClient, service: fx.lumiereService, professional: fx.lumierePro, time: "10:00", status: "CONFIRMED" });

  const studio = await api("/admin/overview", { cookie: studioCookie });
  const lumiere = await api("/admin/overview", { cookie: lumiereCookie });

  assert.equal(studio.status, 200);
  assert.equal(studio.data.tenantId, STUDIO);
  assert.equal(studio.data.day.total, 5);
  assert.equal(lumiere.data.tenantId, LUMIERE);
  assert.equal(lumiere.data.day.total, 1);
});

test("A5A 2. contagem do dia por status", async () => {
  await studioDay();
  const { data } = await api("/admin/overview", { cookie: studioCookie });
  assert.deepEqual(data.day.byStatus, {
    PENDING: 1,
    CONFIRMED: 1,
    COMPLETED: 1,
    CANCELLED: 1,
    NO_SHOW: 1
  });
});

test("A5A 3. próximos atendimentos trazem só o que está em aberto, em ordem", async () => {
  await studioDay();
  const { data } = await api("/admin/overview", { cookie: studioCookie });
  assert.equal(data.upcoming.length, 2);
  assert.deepEqual(data.upcoming.map((item) => item.time), ["09:00", "10:00"]);
  assert.ok(data.upcoming.every((item) => ["PENDING", "CONFIRMED"].includes(item.status)));
  assert.ok(data.upcoming.every((item) => item.date === todayIso));
});

test("A5A 4. pipeline conta leads por etapa", async () => {
  const client = await createClient(STUDIO, "Lead Etapas A5A", "27977770002");
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, status: "NEW", interestSummary: "a" });
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, status: "CONTACTED", interestSummary: "b" });
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, status: "CONTACTED", interestSummary: "c" });
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, status: "LOST", interestSummary: "d" });

  const { data } = await api("/admin/overview", { cookie: studioCookie });
  assert.deepEqual(data.pipeline, { NEW: 1, CONTACTED: 2, QUALIFIED: 0, CONVERTED: 0, LOST: 1 });
});

test("A5A 5. leads sem responsável contam só os ativos", async () => {
  const client = await createClient(STUDIO, "Lead Sem Dono A5A", "27977770003");
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, status: "NEW", interestSummary: "sem dono" });
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, status: "LOST", interestSummary: "perdido sem dono" });
  await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, status: "NEW", interestSummary: "com dono", ownerUserId: fx.studioAdmin.id });

  const { data } = await api("/admin/overview", { cookie: studioCookie });
  assert.equal(data.attention.leadsWithoutOwner, 1);

  const list = await api("/admin/leads?unassigned=true&page=1&limit=10", { cookie: studioCookie });
  assert.equal(list.data.pagination.total, 1);
  assert.equal(list.data.items[0].interestSummary, "sem dono");
});

test("A5A 6. leads sem próxima ação ignoram quem já tem follow-up aberto", async () => {
  const client = await createClient(STUDIO, "Lead Sem Ação A5A", "27977770004");
  const semAcao = await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, interestSummary: "sem ação" });
  const comAcao = await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, interestSummary: "com ação" });
  await createFollowUp({ tenantId: STUDIO, client, lead: comAcao, dueAt: hoursFromNow(48), createdByUserId: fx.studioAdmin.id });

  const { data } = await api("/admin/overview", { cookie: studioCookie });
  assert.equal(data.attention.leadsWithoutNextAction, 1);

  const list = await api("/admin/leads?noNextAction=true&page=1&limit=10", { cookie: studioCookie });
  assert.equal(list.data.pagination.total, 1);
  assert.equal(list.data.items[0].id, semAcao.id);
});

test("A5A 7. follow-ups vencidos são contados e listados do mais antigo", async () => {
  const client = await createClient(STUDIO, "Follow Vencido A5A", "27977770005");
  const lead = await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, interestSummary: "vencido" });
  await createFollowUp({ tenantId: STUDIO, client, lead, dueAt: hoursFromNow(-72), createdByUserId: fx.studioAdmin.id });
  await createFollowUp({ tenantId: STUDIO, client, lead, dueAt: hoursFromNow(-2), createdByUserId: fx.studioAdmin.id });
  await createFollowUp({ tenantId: STUDIO, client, lead, dueAt: hoursFromNow(72), createdByUserId: fx.studioAdmin.id });

  const { data } = await api("/admin/overview", { cookie: studioCookie });
  assert.equal(data.attention.overdueFollowUps, 2);

  const list = await api("/admin/follow-ups?overdue=true&page=1&limit=10", { cookie: studioCookie });
  assert.equal(list.data.pagination.total, 2);
  assert.ok(new Date(list.data.items[0].dueAt) < new Date(list.data.items[1].dueAt));
  assert.ok(list.data.items.every((item) => item.overdue === true));
});

test("A5A 8. follow-ups de hoje excluem vencidos e dias seguintes", async () => {
  const client = await createClient(STUDIO, "Follow Hoje A5A", "27977770006");
  const lead = await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, interestSummary: "hoje" });
  const endOfDay = new Date();
  endOfDay.setUTCHours(23, 59, 0, 0);
  await createFollowUp({ tenantId: STUDIO, client, lead, dueAt: endOfDay, createdByUserId: fx.studioAdmin.id });
  await createFollowUp({ tenantId: STUDIO, client, lead, dueAt: hoursFromNow(-5), createdByUserId: fx.studioAdmin.id });
  await createFollowUp({ tenantId: STUDIO, client, lead, dueAt: hoursFromNow(96), createdByUserId: fx.studioAdmin.id });

  const { data } = await api("/admin/overview", { cookie: studioCookie });
  assert.equal(data.attention.followUpsToday, 1);
  assert.equal(data.attention.overdueFollowUps, 1);
});

test("A5A 9. agenda filtra por profissional", async () => {
  await studioDay();
  const todos = await api("/admin/agenda", { cookie: studioCookie });
  const umPro = await api(`/admin/agenda?professionalId=${fx.studioProTwo.id}`, { cookie: studioCookie });

  assert.equal(todos.data.items.length, 5);
  assert.equal(umPro.data.items.length, 2);
  assert.ok(umPro.data.items.every((item) => item.professionalId === fx.studioProTwo.id));
  assert.equal(umPro.data.summary.total, 2);
  assert.equal(umPro.data.filters.professionalId, fx.studioProTwo.id);
});

test("A5A 10. agenda filtra por status e recusa status inválido", async () => {
  await studioDay();
  const confirmados = await api("/admin/agenda?status=CONFIRMED", { cookie: studioCookie });
  assert.equal(confirmados.data.items.length, 1);
  assert.equal(confirmados.data.items[0].status, "CONFIRMED");
  assert.equal(confirmados.data.summary.total, 5, "o resumo do dia não é reduzido pelo filtro de status");

  const invalido = await api("/admin/agenda?status=QUALQUER", { cookie: studioCookie });
  assert.equal(invalido.status, 400);
});

test("A5A 11. agenda vem ordenada por horário", async () => {
  const client = await createClient(STUDIO, "Ordem A5A", "27977770007");
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, time: "16:00" });
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, time: "08:30" });
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, time: "11:15" });

  const { data } = await api("/admin/agenda", { cookie: studioCookie });
  assert.deepEqual(data.items.map((item) => item.time), ["08:30", "11:15", "16:00"]);
  assert.equal(data.items[0].endTime, "09:00");
});

test("A5A 12. Studio Cut não recebe métricas da Lumière", async () => {
  const lumiereClient = await createClient(LUMIERE, "Lumiere Isolada A5A", "27966660002");
  const lead = await createLead({ tenantId: LUMIERE, client: lumiereClient, service: fx.lumiereService, professional: fx.lumierePro, source: "EVALUATION", interestSummary: "avaliação" });
  await createFollowUp({ tenantId: LUMIERE, client: lumiereClient, lead, dueAt: hoursFromNow(-10), createdByUserId: fx.lumiereAdmin.id });
  await createAppointment({ tenantId: LUMIERE, client: lumiereClient, service: fx.lumiereService, professional: fx.lumierePro, time: "10:00" });

  const overview = await api("/admin/overview", { cookie: studioCookie });
  const agenda = await api("/admin/agenda", { cookie: studioCookie });

  assert.equal(overview.data.day.total, 0);
  assert.equal(overview.data.attention.overdueFollowUps, 0);
  assert.equal(overview.data.pipeline.NEW, 0);
  assert.equal(overview.data.attention.activeLeadsBySource.EVALUATION, 0);
  assert.equal(agenda.data.items.length, 0);
  assert.ok(agenda.data.availability.every((entry) => entry.professionalId !== fx.lumierePro.id));
});

test("A5A 13. Lumière não recebe métricas do Studio Cut", async () => {
  await studioDay();
  const studioClient = await prisma.client.findFirst({ where: { tenantId: STUDIO } });
  const lead = await createLead({ tenantId: STUDIO, client: studioClient, service: fx.studioService, professional: fx.studioPro, source: "WAITLIST", interestSummary: "encaixe" });
  await createFollowUp({ tenantId: STUDIO, client: studioClient, lead, dueAt: hoursFromNow(-10), createdByUserId: fx.studioAdmin.id });

  const overview = await api("/admin/overview", { cookie: lumiereCookie });
  const agenda = await api("/admin/agenda", { cookie: lumiereCookie });

  assert.equal(overview.data.day.total, 0);
  assert.equal(overview.data.attention.overdueFollowUps, 0);
  assert.equal(overview.data.attention.activeLeadsBySource.WAITLIST, 0);
  assert.deepEqual(overview.data.pipeline, { NEW: 0, CONTACTED: 0, QUALIFIED: 0, CONVERTED: 0, LOST: 0 });
  assert.equal(agenda.data.items.length, 0);
});

test("A5A 14. ações do painel preservam a máquina de estados do agendamento", async () => {
  const client = await createClient(STUDIO, "Estado A5A", "27977770008");
  const appointment = await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, time: "09:00" });

  const concluirDireto = await api(`/appointments/${appointment.id}/status`, { method: "PATCH", cookie: studioCookie, body: { status: "COMPLETED" } });
  assert.equal(concluirDireto.status, 409);

  const confirmar = await api(`/appointments/${appointment.id}/status`, { method: "PATCH", cookie: studioCookie, body: { status: "CONFIRMED" } });
  assert.equal(confirmar.status, 200);
  const concluir = await api(`/appointments/${appointment.id}/status`, { method: "PATCH", cookie: studioCookie, body: { status: "COMPLETED" } });
  assert.equal(concluir.status, 200);
  const reabrir = await api(`/appointments/${appointment.id}/status`, { method: "PATCH", cookie: studioCookie, body: { status: "CONFIRMED" } });
  assert.equal(reabrir.status, 409);

  const agenda = await api("/admin/agenda", { cookie: studioCookie });
  assert.equal(agenda.data.items[0].status, "COMPLETED");
});

test("A5A 15. listas do painel paginam com limite máximo", async () => {
  const client = await createClient(STUDIO, "Paginação A5A", "27977770009");
  for (let index = 0; index < 7; index += 1) {
    await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, interestSummary: `interesse ${index}` });
  }

  const primeira = await api("/admin/leads?page=1&limit=3", { cookie: studioCookie });
  const segunda = await api("/admin/leads?page=2&limit=3", { cookie: studioCookie });
  assert.deepEqual(primeira.data.pagination, { page: 1, limit: 3, total: 7, pages: 3 });
  assert.equal(primeira.data.items.length, 3);
  assert.equal(segunda.data.items.length, 3);
  assert.equal(new Set([...primeira.data.items, ...segunda.data.items].map((item) => item.id)).size, 6);

  const excedido = await api("/admin/leads?page=1&limit=500", { cookie: studioCookie });
  assert.equal(excedido.status, 400);
});

test("A5A 16. busca de clientes filtra por nome e telefone", async () => {
  await createClient(STUDIO, "Fernanda Operacional", "27977770010");
  await createClient(STUDIO, "Outro Cliente", "27977770011");

  const porNome = await api("/admin/clients?search=fernanda&page=1&limit=10", { cookie: studioCookie });
  assert.equal(porNome.data.pagination.total, 1);
  assert.equal(porNome.data.items[0].name, "Fernanda Operacional");

  const porTelefone = await api("/admin/clients?search=27977770011&page=1&limit=10", { cookie: studioCookie });
  assert.equal(porTelefone.data.pagination.total, 1);
  assert.equal(porTelefone.data.items[0].name, "Outro Cliente");

  const semResultado = await api("/admin/clients?search=inexistente&page=1&limit=10", { cookie: studioCookie });
  assert.equal(semResultado.data.pagination.total, 0);
});

test("A5A 17. painel exige sessão válida do tenant", async () => {
  const semSessao = await api("/admin/overview");
  assert.equal(semSessao.status, 401);

  const agendaSemSessao = await api("/admin/agenda");
  assert.equal(agendaSemSessao.status, 401);

  const cookieInvalido = await api("/admin/overview", { cookie: "agendafacil_session=token-invalido-a5a" });
  assert.equal(cookieInvalido.status, 401);
});

test("A5A 18. payload do painel não expõe dados internos desnecessários", async () => {
  const client = await createClient(STUDIO, "Payload A5A", "27977770012");
  const lead = await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, source: "WAITLIST", interestSummary: "encaixe payload" });
  await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, time: "09:00", leadId: lead.id });

  const overview = await api("/admin/overview", { cookie: studioCookie });
  const agenda = await api("/admin/agenda", { cookie: studioCookie });
  const item = agenda.data.items[0];

  assert.equal(item.leadSource, "WAITLIST");
  assert.equal(item.serviceName, "Corte A5A");
  for (const payload of [overview.data.upcoming[0], item]) {
    assert.equal(payload.client, undefined);
    assert.equal(payload.service, undefined);
    assert.equal(payload.professional, undefined);
    assert.equal(payload.originLead, undefined);
    assert.equal(payload.clientEmail, undefined);
    assert.equal(payload.dedupeKey, undefined);
    assert.equal(payload.tenantId, undefined);
  }
  const serialized = JSON.stringify(agenda.data);
  assert.ok(!serialized.includes("passwordHash"));
  assert.ok(!serialized.includes("normalizedPhone"));
  assert.ok(!serialized.includes("qualification"));
});

// Declarado antes do seed: o seed reconstrói o banco inteiro e precisa ser o
// último caso deste arquivo.
test("A5A 20. dados e rotas anteriores continuam preservados", async () => {
  const client = await createClient(STUDIO, "Legado A5A", "27977770013");
  const lead = await createLead({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, interestSummary: "legado" });
  await createFollowUp({ tenantId: STUDIO, client, lead, dueAt: hoursFromNow(24), createdByUserId: fx.studioAdmin.id });
  const appointment = await createAppointment({ tenantId: STUDIO, client, service: fx.studioService, professional: fx.studioPro, time: "09:00" });

  const [appointments, leads, followUps, clients, services, history] = await Promise.all([
    api("/appointments", { cookie: studioCookie }),
    api("/admin/leads", { cookie: studioCookie }),
    api("/admin/follow-ups", { cookie: studioCookie }),
    api("/admin/clients", { cookie: studioCookie }),
    api(`/services?demoId=${STUDIO}`),
    api(`/appointments/${appointment.id}/history`, { cookie: studioCookie })
  ]);

  assert.ok(Array.isArray(appointments.data) && appointments.data.length === 1, "listagem legada continua sem paginação");
  assert.ok(Array.isArray(leads.data) && leads.data.length === 1);
  assert.ok(Array.isArray(followUps.data) && followUps.data.length === 1);
  assert.ok(Array.isArray(clients.data) && clients.data.length === 1);
  assert.ok(Array.isArray(services.data) && services.data.length === 1);
  assert.equal(history.status, 200);
  assert.ok(appointments.data.every((item) => item.tenantId === STUDIO));
  assert.equal(leads.data[0].dedupeKey, undefined);
});

test("A5A 19. seed local é idempotente", async () => {
  const options = {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, NODE_ENV: "development" }
  };
  await execFileAsync(process.execPath, ["prisma/seed.js"], options);
  const first = {
    clients: await prisma.client.count(),
    appointments: await prisma.appointment.count(),
    leads: await prisma.lead.count(),
    followUps: await prisma.followUp.count()
  };

  await execFileAsync(process.execPath, ["prisma/seed.js"], options);
  const second = {
    clients: await prisma.client.count(),
    appointments: await prisma.appointment.count(),
    leads: await prisma.lead.count(),
    followUps: await prisma.followUp.count()
  };

  assert.deepEqual(second, first);
  assert.ok(first.appointments > 0 && first.leads > 0);
  assert.equal(await prisma.tenant.count({ where: { slug: { in: [STUDIO, LUMIERE] } } }), 2);
});
