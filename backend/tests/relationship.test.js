import "dotenv/config";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import app from "../app.js";
import prisma from "../prismaClient.js";
import { hashPassword } from "../lib/password.js";
import { clearRateLimitStore } from "../routes/index.js";

const STUDIO = "studio-cut";
const LUMIERE = "lumiere";
const PASSWORD = "senha-local-a4a";
const STUDIO_EMAIL = "a4a-studio@example.test";
const LUMIERE_EMAIL = "a4a-lumiere@example.test";
const fx = {};
let server;
let baseUrl;
let studioCookie;
let lumiereCookie;

function nextWednesday() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + 10);
  while (date.getUTCDay() !== 3) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

const appointmentDay = nextWednesday();

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

function person(phone = "27999994000", name = "Cliente A4A") {
  return { name, phone, email: "cliente.a4a@example.test" };
}

function bookingBody({ tenantId = STUDIO, phone = "27999994000", time = "09:00" } = {}) {
  return {
    demoId: tenantId,
    serviceId: tenantId === STUDIO ? fx.studioService.id : fx.lumiereService.id,
    professionalId: tenantId === STUDIO ? fx.studioProfessional.id : fx.lumiereProfessional.id,
    clientName: tenantId === STUDIO ? "Cliente Studio A4A" : "Cliente Lumiere A4A",
    clientPhone: phone,
    clientEmail: "cliente.a4a@example.test",
    date: appointmentDay,
    time
  };
}

function publicLeadBody(tenantId = STUDIO, phone = "27999994000") {
  return {
    demoId: tenantId,
    source: tenantId === STUDIO ? "WAITLIST" : "EVALUATION",
    ...person(phone, tenantId === STUDIO ? "Lead Studio A4A" : "Lead Lumiere A4A"),
    serviceId: tenantId === STUDIO ? fx.studioService.id : fx.lumiereService.id,
    interestSummary: tenantId === STUDIO ? "Pedido de encaixe para corte" : "Interesse em avaliação estética",
    createFollowUp: true,
    consent: true,
    website: ""
  };
}

async function createClientByBooking(options = {}) {
  const response = await api("/appointments", { method: "POST", body: bookingBody(options) });
  assert.equal(response.status, 201);
  return response.data;
}

async function createPublicLead(tenantId = STUDIO, phone = "27999994000") {
  return api("/public/leads", { method: "POST", body: publicLeadBody(tenantId, phone) });
}

async function resetRelationshipData() {
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
  await resetRelationshipData();
  await prisma.adminUser.deleteMany();
  await prisma.scheduleBlock.deleteMany();
  await prisma.professionalSchedule.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.businessHours.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.service.deleteMany();

  await prisma.tenant.upsert({ where: { slug: STUDIO }, update: { active: true }, create: { slug: STUDIO, name: "Studio Cut" } });
  await prisma.tenant.upsert({ where: { slug: LUMIERE }, update: { active: true }, create: { slug: LUMIERE, name: "Lumière Estética" } });
  fx.studioService = await prisma.service.create({ data: { tenantId: STUDIO, name: "Corte A4A", description: "x", duration: 30, price: 45 } });
  fx.lumiereService = await prisma.service.create({ data: { tenantId: LUMIERE, name: "Avaliação A4A", description: "x", duration: 60, price: 180 } });
  fx.studioProfessional = await prisma.professional.create({ data: { tenantId: STUDIO, name: "Barbeiro A4A", specialty: "x", photo: "x" } });
  fx.lumiereProfessional = await prisma.professional.create({ data: { tenantId: LUMIERE, name: "Esteticista A4A", specialty: "x", photo: "x" } });
  await prisma.businessHours.createMany({ data: [
    { tenantId: STUDIO, dayOfWeek: 3, openTime: "09:00", closeTime: "18:00", isOpen: true },
    { tenantId: LUMIERE, dayOfWeek: 3, openTime: "09:00", closeTime: "18:00", isOpen: true }
  ] });
  await prisma.professionalSchedule.createMany({ data: [
    { tenantId: STUDIO, professionalId: fx.studioProfessional.id, dayOfWeek: 3, startTime: "09:00", endTime: "18:00" },
    { tenantId: LUMIERE, professionalId: fx.lumiereProfessional.id, dayOfWeek: 3, startTime: "09:00", endTime: "18:00" }
  ] });
  const passwordHash = await hashPassword(PASSWORD);
  await prisma.adminUser.create({ data: { tenantId: STUDIO, email: STUDIO_EMAIL, name: "Admin A4A Studio", passwordHash } });
  await prisma.adminUser.create({ data: { tenantId: LUMIERE, email: LUMIERE_EMAIL, name: "Admin A4A Lumiere", passwordHash: await hashPassword(PASSWORD) } });

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  studioCookie = await loginCookie(STUDIO, STUDIO_EMAIL);
  lumiereCookie = await loginCookie(LUMIERE, LUMIERE_EMAIL);
});

beforeEach(async () => {
  clearRateLimitStore();
  await resetRelationshipData();
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test("A4A 1. Client é criado por agendamento", async () => {
  await createClientByBooking();
  assert.equal(await prisma.client.count({ where: { tenantId: STUDIO } }), 1);
});

test("A4A 2. Client é reutilizado por telefone normalizado", async () => {
  await createClientByBooking({ phone: "(27) 99999-4000", time: "09:00" });
  await createClientByBooking({ phone: "27 99999 4000", time: "10:00" });
  assert.equal(await prisma.client.count({ where: { tenantId: STUDIO } }), 1);
});

test("A4A 3. mesmo telefone pode existir em tenant diferente", async () => {
  await createClientByBooking({ tenantId: STUDIO, phone: "27999994001" });
  await createClientByBooking({ tenantId: LUMIERE, phone: "27999994001" });
  assert.equal(await prisma.client.count({ where: { normalizedPhone: "5527999994001" } }), 2);
});

test("A4A 4. concorrência não cria Client duplicado", async () => {
  const [first, second] = await Promise.all([
    api("/appointments", { method: "POST", body: bookingBody({ phone: "27999994002", time: "09:00" }) }),
    api("/appointments", { method: "POST", body: bookingBody({ phone: "(27) 99999-4002", time: "10:00" }) })
  ]);
  assert.ok([200, 201, 409].includes(first.status));
  assert.ok([200, 201, 409].includes(second.status));
  assert.equal(await prisma.client.count({ where: { tenantId: STUDIO, normalizedPhone: "5527999994002" } }), 1);
});

test("A4A 5. Appointment fica vinculado ao Client", async () => {
  const appointment = await createClientByBooking();
  const saved = await prisma.appointment.findUnique({ where: { id: appointment.id } });
  assert.ok(saved.clientId);
});

test("A4A 6. Lead pode existir sem Appointment", async () => {
  await createPublicLead();
  const lead = await prisma.lead.findFirst({ where: { tenantId: STUDIO } });
  assert.equal(lead.convertedAppointmentId, null);
});

test("A4A 7. Lead pertence a um Client", async () => {
  await createPublicLead();
  const lead = await prisma.lead.findFirst({ where: { tenantId: STUDIO }, include: { client: true } });
  assert.equal(lead.client.tenantId, STUDIO);
});

test("A4A 8. Lead ativo equivalente é reutilizado", async () => {
  assert.equal((await createPublicLead()).status, 201);
  assert.equal((await createPublicLead()).status, 200);
  assert.equal(await prisma.lead.count({ where: { tenantId: STUDIO } }), 1);
});

test("A4A 9. captura pública Studio Cut cria WAITLIST", async () => {
  const response = await createPublicLead(STUDIO);
  assert.equal(response.status, 201);
  assert.equal((await prisma.lead.findFirst({ where: { tenantId: STUDIO } })).source, "WAITLIST");
});

test("A4A 10. captura pública Lumière cria EVALUATION", async () => {
  const response = await createPublicLead(LUMIERE);
  assert.equal(response.status, 201);
  assert.equal((await prisma.lead.findFirst({ where: { tenantId: LUMIERE } })).source, "EVALUATION");
});

test("A4A 11. navegação anônima não cria Lead", async () => {
  await api("/services?demoId=studio-cut");
  assert.equal(await prisma.lead.count(), 0);
});

test("A4A 12. payload público inválido é rejeitado", async () => {
  const response = await api("/public/leads", { method: "POST", body: { demoId: STUDIO, source: "WAITLIST" } });
  assert.equal(response.status, 400);
  assert.equal(await prisma.lead.count(), 0);
});

test("A4A 13. captura pública tem rate limit", async () => {
  const statuses = [];
  for (let index = 0; index < 6; index += 1) {
    statuses.push((await api("/public/leads", { method: "POST", body: publicLeadBody(STUDIO, `27999994${String(index).padStart(3, "0")}`) })).status);
  }
  assert.equal(statuses.at(-1), 429);
});

test("A4A 14. Lead é convertido por Appointment do mesmo Client", async () => {
  await createPublicLead();
  const lead = await prisma.lead.findFirst({ where: { tenantId: STUDIO } });
  const appointment = await createClientByBooking();
  const response = await api(`/admin/leads/${lead.id}/convert`, { method: "POST", cookie: studioCookie, body: { appointmentId: appointment.id } });
  assert.equal(response.status, 200);
  assert.equal(response.data.status, "CONVERTED");
});

test("A4A 15. Lead perdido exige e preserva motivo", async () => {
  await createPublicLead();
  const lead = await prisma.lead.findFirst({ where: { tenantId: STUDIO } });
  const response = await api(`/admin/leads/${lead.id}/lost`, { method: "POST", cookie: studioCookie, body: { reason: "Sem interesse no momento" } });
  assert.equal(response.status, 200);
  assert.equal(response.data.lostReason, "Sem interesse no momento");
});

test("A4A 16. FollowUp é criado", async () => {
  await createPublicLead();
  assert.equal(await prisma.followUp.count({ where: { tenantId: STUDIO } }), 1);
});

test("A4A 17. API identifica FollowUp vencido", async () => {
  await createPublicLead();
  await prisma.followUp.updateMany({ data: { dueAt: new Date(Date.now() - 60_000) } });
  const response = await api("/admin/follow-ups?overdue=true", { cookie: studioCookie });
  assert.equal(response.status, 200);
  assert.equal(response.data[0].overdue, true);
});

test("A4A 18. conclusão de FollowUp registra ator e horário", async () => {
  await createPublicLead();
  const followUp = await prisma.followUp.findFirst();
  const response = await api(`/admin/follow-ups/${followUp.id}/complete`, { method: "POST", cookie: studioCookie, body: {} });
  assert.equal(response.status, 200);
  assert.ok(response.data.completedAt);
  assert.ok(response.data.completedByUserId);
});

test("A4A 19. histórico comercial é append-only pela aplicação", async () => {
  await createPublicLead();
  const client = await prisma.client.findFirst();
  const beforeCount = await prisma.relationshipHistoryEvent.count({ where: { clientId: client.id } });
  await api(`/admin/clients/${client.id}/notes`, { method: "POST", cookie: studioCookie, body: { note: "Retornar pela manhã" } });
  const afterCount = await prisma.relationshipHistoryEvent.count({ where: { clientId: client.id } });
  assert.equal(afterCount, beforeCount + 1);
});

test("A4A 20. histórico comercial vem ordenado", async () => {
  await createPublicLead();
  const client = await prisma.client.findFirst();
  const response = await api(`/admin/clients/${client.id}/history`, { cookie: studioCookie });
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.map((event) => event.id), [...response.data.map((event) => event.id)].sort((a, b) => a - b));
});

test("A4A 21. notas internas não aparecem em rota pública", async () => {
  await createPublicLead();
  const client = await prisma.client.findFirst();
  await api(`/admin/clients/${client.id}/notes`, { method: "POST", cookie: studioCookie, body: { note: "Nota interna secreta de teste" } });
  const response = await createPublicLead();
  assert.ok(!JSON.stringify(response.data).includes("Nota interna"));
});

test("A4A 22. Client é isolado por tenant", async () => {
  await createPublicLead(LUMIERE);
  const client = await prisma.client.findFirst({ where: { tenantId: LUMIERE } });
  assert.equal((await api(`/admin/clients/${client.id}`, { cookie: studioCookie })).status, 404);
});

test("A4A 23. Lead é isolado por tenant", async () => {
  await createPublicLead(LUMIERE);
  const lead = await prisma.lead.findFirst({ where: { tenantId: LUMIERE } });
  assert.equal((await api(`/admin/leads/${lead.id}`, { cookie: studioCookie })).status, 404);
});

test("A4A 24. FollowUp é isolado por tenant", async () => {
  await createPublicLead(LUMIERE);
  const followUp = await prisma.followUp.findFirst({ where: { tenantId: LUMIERE } });
  assert.equal((await api(`/admin/follow-ups/${followUp.id}/complete`, { method: "POST", cookie: studioCookie, body: {} })).status, 404);
});

test("A4A 25. admin Studio não lista dados Lumière", async () => {
  await createPublicLead(LUMIERE);
  const response = await api("/admin/clients", { cookie: studioCookie });
  assert.equal(response.data.length, 0);
});

test("A4A 26. admin Lumière não lista dados Studio", async () => {
  await createPublicLead(STUDIO);
  const response = await api("/admin/leads", { cookie: lumiereCookie });
  assert.equal(response.data.length, 0);
});

test("A4A 27. migration e backfill garantem Client em todo Appointment", async () => {
  await createClientByBooking();
  const orphanCount = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "Appointment" WHERE "clientId" IS NULL`;
  const migration = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE "migration_name" = '20260720230000_relationship_foundation' AND "finished_at" IS NOT NULL`;
  assert.equal(orphanCount[0].count, 0);
  assert.equal(migration[0].count, 1);
});

test("A4A 28. resposta pública não expõe IDs nem campos internos", async () => {
  const response = await createPublicLead();
  const serialized = JSON.stringify(response.data);
  assert.ok(!serialized.includes("clientId"));
  assert.ok(!serialized.includes("leadId"));
  assert.ok(!serialized.includes("dedupeKey"));
  assert.ok(!serialized.includes("notes"));
});

test("A4A 29. jornada Studio Cut preserva sequência comercial", async () => {
  await createPublicLead(STUDIO, "27999994029");
  const lead = await prisma.lead.findFirst({ where: { tenantId: STUDIO } });
  await api(`/admin/leads/${lead.id}/status`, { method: "PATCH", cookie: studioCookie, body: { status: "QUALIFIED" } });
  const appointment = await createClientByBooking({ phone: "27999994029" });
  await api(`/admin/leads/${lead.id}/convert`, { method: "POST", cookie: studioCookie, body: { appointmentId: appointment.id } });
  const types = (await prisma.relationshipHistoryEvent.findMany({ where: { clientId: lead.clientId }, orderBy: { id: "asc" } })).map((event) => event.type);
  assert.ok(["CLIENT_CREATED", "LEAD_CREATED", "FOLLOW_UP_CREATED", "LEAD_STATUS_CHANGED", "APPOINTMENT_LINKED", "LEAD_CONVERTED"].every((type) => types.includes(type)));
});

test("A4A 30. jornada Lumière registra interesse sem dado clínico", async () => {
  await createPublicLead(LUMIERE, "27999994030");
  const lead = await prisma.lead.findFirst({ where: { tenantId: LUMIERE } });
  assert.equal(lead.source, "EVALUATION");
  assert.ok(lead.interestSummary.includes("avaliação"));
  assert.ok(!Object.keys(lead).some((key) => ["diagnosis", "prescription", "medicalRecord"].includes(key)));
});
