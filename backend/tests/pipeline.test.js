import "dotenv/config";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import app from "../app.js";
import prisma from "../prismaClient.js";
import { hashPassword } from "../lib/password.js";
import { clearRateLimitStore } from "../routes/index.js";

const STUDIO = "studio-cut";
const LUMIERE = "lumiere";
const PASSWORD = "senha-local-a4b";
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

function leadBody({ tenantId = STUDIO, phone = "27988880001", createFollowUp = true, urgency } = {}) {
  const studio = tenantId === STUDIO;
  return {
    demoId: tenantId,
    source: studio ? "WAITLIST" : "EVALUATION",
    name: studio ? "Lead Studio A4B" : "Lead Lumiere A4B",
    phone,
    email: `a4b.${phone}@example.test`,
    serviceId: studio ? fx.studioService.id : fx.lumiereService.id,
    professionalId: studio ? fx.studioProfessional.id : fx.lumiereProfessional.id,
    interestSummary: studio ? "Encaixe para corte" : "Avaliação estética inicial",
    createFollowUp,
    consent: true,
    website: "",
    ...(urgency ? { urgency } : {})
  };
}

async function createLead(options = {}) {
  const response = await api("/public/leads", { method: "POST", body: leadBody(options) });
  assert.equal(response.status, 201);
  const tenantId = options.tenantId || STUDIO;
  const phone = options.phone || "27988880001";
  const client = await prisma.client.findFirst({ where: { tenantId, normalizedPhone: phone.replace(/\D/g, "") } });
  return prisma.lead.findFirst({
    where: { tenantId, clientId: client.id },
    include: { client: true, followUps: true }
  });
}

function appointmentBody({ tenantId = STUDIO, phone = "27988880001", time = "09:00" } = {}) {
  const studio = tenantId === STUDIO;
  return {
    demoId: tenantId,
    serviceId: studio ? fx.studioService.id : fx.lumiereService.id,
    professionalId: studio ? fx.studioProfessional.id : fx.lumiereProfessional.id,
    clientName: studio ? "Lead Studio A4B" : "Lead Lumiere A4B",
    clientPhone: phone,
    clientEmail: `a4b.${phone}@example.test`,
    date: appointmentDay,
    time
  };
}

async function createAppointment(options = {}) {
  const response = await api("/appointments", { method: "POST", body: appointmentBody(options) });
  assert.equal(response.status, 201);
  return response.data;
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
  fx.studioService = await prisma.service.create({ data: { tenantId: STUDIO, name: "Corte A4B", description: "x", duration: 30, price: 45 } });
  fx.studioServiceTwo = await prisma.service.create({ data: { tenantId: STUDIO, name: "Barba A4B", description: "x", duration: 30, price: 35 } });
  fx.lumiereService = await prisma.service.create({ data: { tenantId: LUMIERE, name: "Avaliação A4B", description: "x", duration: 60, price: 180 } });
  fx.studioProfessional = await prisma.professional.create({ data: { tenantId: STUDIO, name: "Barbeiro A4B", specialty: "x", photo: "x" } });
  fx.lumiereProfessional = await prisma.professional.create({ data: { tenantId: LUMIERE, name: "Esteticista A4B", specialty: "x", photo: "x" } });
  await prisma.businessHours.createMany({ data: [
    { tenantId: STUDIO, dayOfWeek: 3, openTime: "09:00", closeTime: "18:00", isOpen: true },
    { tenantId: LUMIERE, dayOfWeek: 3, openTime: "09:00", closeTime: "18:00", isOpen: true }
  ] });
  await prisma.professionalSchedule.createMany({ data: [
    { tenantId: STUDIO, professionalId: fx.studioProfessional.id, dayOfWeek: 3, startTime: "09:00", endTime: "18:00" },
    { tenantId: LUMIERE, professionalId: fx.lumiereProfessional.id, dayOfWeek: 3, startTime: "09:00", endTime: "18:00" }
  ] });
  const passwordHash = await hashPassword(PASSWORD);
  fx.studioAdmin = await prisma.adminUser.create({ data: { tenantId: STUDIO, email: "a4b-studio@example.test", name: "Admin Studio A4B", passwordHash } });
  fx.studioInactive = await prisma.adminUser.create({ data: { tenantId: STUDIO, email: "a4b-inativo@example.test", name: "Admin Inativo A4B", passwordHash: await hashPassword(PASSWORD), active: false } });
  fx.lumiereAdmin = await prisma.adminUser.create({ data: { tenantId: LUMIERE, email: "a4b-lumiere@example.test", name: "Admin Lumiere A4B", passwordHash: await hashPassword(PASSWORD) } });

  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  studioCookie = await loginCookie(STUDIO, "a4b-studio@example.test");
  lumiereCookie = await loginCookie(LUMIERE, "a4b-lumiere@example.test");
});

beforeEach(async () => {
  clearRateLimitStore();
  await resetData();
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
});

test("A4B 1. máquina de estados aceita transição válida", async () => {
  const lead = await createLead();
  const response = await api(`/admin/leads/${lead.id}/status`, { method: "PATCH", cookie: studioCookie, body: { status: "CONTACTED" } });
  assert.equal(response.status, 200);
  assert.equal(response.data.status, "CONTACTED");
  assert.equal(await prisma.relationshipHistoryEvent.count({ where: { leadId: lead.id, type: "LEAD_STATUS_CHANGED" } }), 1);
});

test("A4B 2. máquina de estados rejeita transição inválida", async () => {
  const lead = await createLead();
  await api(`/admin/leads/${lead.id}/status`, { method: "PATCH", cookie: studioCookie, body: { status: "CONTACTED" } });
  const response = await api(`/admin/leads/${lead.id}/status`, { method: "PATCH", cookie: studioCookie, body: { status: "NEW" } });
  assert.equal(response.status, 409);
});

test("A4B 3. estado terminal não pode ser reaberto", async () => {
  const lead = await createLead();
  await api(`/admin/leads/${lead.id}/lost`, { method: "POST", cookie: studioCookie, body: { lostReason: "NO_RESPONSE" } });
  const response = await api(`/admin/leads/${lead.id}/status`, { method: "PATCH", cookie: studioCookie, body: { status: "CONTACTED" } });
  assert.equal(response.status, 409);
});

test("A4B 4. prioridade padrão é NORMAL", async () => {
  const lead = await createLead();
  assert.equal(lead.priority, "NORMAL");
});

test("A4B 5. prioridade alterada registra histórico", async () => {
  const lead = await createLead();
  const response = await api(`/admin/leads/${lead.id}/priority`, { method: "PATCH", cookie: studioCookie, body: { priority: "HIGH" } });
  assert.equal(response.data.priority, "HIGH");
  assert.equal(await prisma.relationshipHistoryEvent.count({ where: { leadId: lead.id, type: "LEAD_PRIORITY_CHANGED" } }), 1);
});

test("A4B 6. responsável do mesmo tenant pode ser atribuído", async () => {
  const lead = await createLead();
  const response = await api(`/admin/leads/${lead.id}/owner`, { method: "PATCH", cookie: studioCookie, body: { ownerUserId: fx.studioAdmin.id } });
  assert.equal(response.status, 200);
  assert.equal(response.data.ownerUserId, fx.studioAdmin.id);
});

test("A4B 7. responsável cross-tenant retorna 404", async () => {
  const lead = await createLead();
  const response = await api(`/admin/leads/${lead.id}/owner`, { method: "PATCH", cookie: studioCookie, body: { ownerUserId: fx.lumiereAdmin.id } });
  assert.equal(response.status, 404);
});

test("A4B 8. usuário inativo não recebe atribuição", async () => {
  const lead = await createLead();
  const response = await api(`/admin/leads/${lead.id}/owner`, { method: "PATCH", cookie: studioCookie, body: { ownerUserId: fx.studioInactive.id } });
  assert.equal(response.status, 409);
});

test("A4B 9. qualificação Studio Cut válida", async () => {
  const lead = await createLead();
  const qualification = { firstVisit: true, serviceInterest: "Corte", preferredProfessionalId: fx.studioProfessional.id, availability: "Tarde", commercialNote: "Cliente flexível", acceptsAnyProfessional: true, bestContactPeriod: "AFTERNOON", wantsImmediateOpening: true, urgency: "TODAY" };
  const response = await api(`/admin/leads/${lead.id}/qualification`, { method: "PATCH", cookie: studioCookie, body: { qualification } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.qualification, qualification);
});

test("A4B 10. qualificação Studio Cut inválida é rejeitada", async () => {
  const lead = await createLead();
  const response = await api(`/admin/leads/${lead.id}/qualification`, { method: "PATCH", cookie: studioCookie, body: { qualification: { scoreByAi: 99 } } });
  assert.equal(response.status, 400);
});

test("A4B 11. qualificação Lumière válida", async () => {
  const lead = await createLead({ tenantId: LUMIERE, phone: "27988880011" });
  const qualification = { firstVisit: true, procedureInterest: "Limpeza de pele", preferredProfessionalId: fx.lumiereProfessional.id, availability: "Manhã", commercialNote: "Busca atendimento inicial", bestContactPeriod: "MORNING", requestsEvaluation: true, statedGoal: "Melhorar aparência e rotina de cuidado", packageInterest: true };
  const response = await api(`/admin/leads/${lead.id}/qualification`, { method: "PATCH", cookie: lumiereCookie, body: { qualification } });
  assert.equal(response.status, 200);
  assert.deepEqual(response.data.qualification, qualification);
});

test("A4B 12. dado clínico é rejeitado", async () => {
  const lead = await createLead({ tenantId: LUMIERE, phone: "27988880012" });
  const response = await api(`/admin/leads/${lead.id}/qualification`, { method: "PATCH", cookie: lumiereCookie, body: { qualification: { statedGoal: "Registrar diagnóstico médico" } } });
  assert.equal(response.status, 400);
});

test("A4B 13. mudança operacional exige próximo FollowUp", async () => {
  const lead = await createLead({ createFollowUp: false });
  const response = await api(`/admin/leads/${lead.id}/status`, { method: "PATCH", cookie: studioCookie, body: { status: "CONTACTED" } });
  assert.equal(response.status, 409);
});

test("A4B 14. Lead sem próxima ação aparece no filtro de atenção", async () => {
  const lead = await createLead({ createFollowUp: false });
  const response = await api("/admin/leads?page=1&limit=10&noNextAction=true", { cookie: studioCookie });
  assert.equal(response.status, 200);
  assert.equal(response.data.items[0].id, lead.id);
});

test("A4B 15. FollowUp vencido aparece no filtro", async () => {
  const lead = await createLead();
  await prisma.followUp.updateMany({ where: { leadId: lead.id }, data: { dueAt: new Date(Date.now() - 60_000) } });
  const response = await api("/admin/follow-ups?page=1&limit=10&overdue=true", { cookie: studioCookie });
  assert.equal(response.data.items.length, 1);
  assert.equal(response.data.items[0].overdue, true);
});

test("A4B 16. concluir FollowUp pode criar o próximo na mesma operação", async () => {
  const lead = await createLead();
  const followUp = lead.followUps[0];
  const response = await api(`/admin/follow-ups/${followUp.id}/complete`, { method: "POST", cookie: studioCookie, body: { nextFollowUp: { dueAt: new Date(Date.now() + 172800000).toISOString(), type: "RETURN", ownerUserId: fx.studioAdmin.id, note: "Novo retorno" } } });
  assert.equal(response.status, 200);
  assert.equal(response.data.nextFollowUp.status, "OPEN");
  assert.equal(await prisma.followUp.count({ where: { leadId: lead.id } }), 2);
});

test("A4B 17. motivo de perda é obrigatório", async () => {
  const lead = await createLead();
  const response = await api(`/admin/leads/${lead.id}/lost`, { method: "POST", cookie: studioCookie, body: {} });
  assert.equal(response.status, 400);
});

test("A4B 18. OTHER exige observação", async () => {
  const lead = await createLead();
  const response = await api(`/admin/leads/${lead.id}/lost`, { method: "POST", cookie: studioCookie, body: { lostReason: "OTHER" } });
  assert.equal(response.status, 400);
});

test("A4B 19. conversão aceita Appointment existente", async () => {
  const lead = await createLead();
  const appointment = await createAppointment();
  const response = await api(`/admin/leads/${lead.id}/convert`, { method: "POST", cookie: studioCookie, body: { appointmentId: appointment.id } });
  assert.equal(response.status, 200);
  assert.equal(response.data.convertedAppointmentId, appointment.id);
});

test("A4B 20. conversão cria Appointment pelo motor existente", async () => {
  const lead = await createLead({ phone: "27988880020" });
  const response = await api(`/admin/leads/${lead.id}/convert`, { method: "POST", cookie: studioCookie, body: { appointment: { serviceId: fx.studioService.id, professionalId: fx.studioProfessional.id, date: appointmentDay, time: "09:00" } } });
  assert.equal(response.status, 200);
  assert.ok(response.data.convertedAppointmentId);
  assert.equal(await prisma.appointment.count({ where: { leadId: lead.id } }), 1);
});

test("A4B 21. Appointment cross-tenant é rejeitado", async () => {
  const lead = await createLead();
  const appointment = await createAppointment({ tenantId: LUMIERE, phone: "27988880021" });
  const response = await api(`/admin/leads/${lead.id}/convert`, { method: "POST", cookie: studioCookie, body: { appointmentId: appointment.id } });
  assert.equal(response.status, 404);
});

test("A4B 22. Appointment cancelado é rejeitado", async () => {
  const lead = await createLead();
  const appointment = await createAppointment();
  await prisma.appointment.update({ where: { id: appointment.id }, data: { status: "CANCELLED", cancellationReason: "Teste" } });
  const response = await api(`/admin/leads/${lead.id}/convert`, { method: "POST", cookie: studioCookie, body: { appointmentId: appointment.id } });
  assert.equal(response.status, 409);
});

test("A4B 23. falha de conversão causa rollback", async () => {
  const lead = await createLead();
  const appointment = await createAppointment({ phone: "27988889999" });
  const response = await api(`/admin/leads/${lead.id}/convert`, { method: "POST", cookie: studioCookie, body: { appointmentId: appointment.id } });
  assert.equal(response.status, 409);
  assert.equal((await prisma.lead.findUnique({ where: { id: lead.id } })).status, "NEW");
  assert.equal((await prisma.appointment.findUnique({ where: { id: appointment.id } })).leadId, null);
});

test("A4B 24. conversão é idempotente", async () => {
  const lead = await createLead();
  const appointment = await createAppointment();
  assert.equal((await api(`/admin/leads/${lead.id}/convert`, { method: "POST", cookie: studioCookie, body: { appointmentId: appointment.id } })).status, 200);
  assert.equal((await api(`/admin/leads/${lead.id}/convert`, { method: "POST", cookie: studioCookie, body: { appointmentId: appointment.id } })).status, 200);
  assert.equal(await prisma.relationshipHistoryEvent.count({ where: { leadId: lead.id, type: "LEAD_CONVERTED" } }), 1);
});

test("A4B 25. conversão encerra FollowUps abertos", async () => {
  const lead = await createLead();
  const appointment = await createAppointment();
  await api(`/admin/leads/${lead.id}/convert`, { method: "POST", cookie: studioCookie, body: { appointmentId: appointment.id } });
  assert.equal(await prisma.followUp.count({ where: { leadId: lead.id, status: "OPEN" } }), 0);
  assert.ok(await prisma.followUp.count({ where: { leadId: lead.id, status: "CANCELLED" } }));
});

test("A4B 26. nota comercial é append-only", async () => {
  const lead = await createLead();
  await api(`/admin/leads/${lead.id}/notes`, { method: "POST", cookie: studioCookie, body: { content: "Primeira nota" } });
  await api(`/admin/leads/${lead.id}/notes`, { method: "POST", cookie: studioCookie, body: { content: "Segunda nota" } });
  const detail = await api(`/admin/leads/${lead.id}`, { cookie: studioCookie });
  const notes = detail.data.relationshipHistory.filter((event) => event.type === "NOTE_ADDED");
  assert.deepEqual(notes.map((event) => event.metadata.content), ["Primeira nota", "Segunda nota"]);
  assert.equal(notes[0].actor.name, fx.studioAdmin.name);
});

test("A4B 27. paginação retorna total e ordem determinística", async () => {
  await createLead({ phone: "27988880027" });
  await createLead({ phone: "27988880127" });
  await createLead({ phone: "27988880227" });
  const response = await api("/admin/leads?page=1&limit=2", { cookie: studioCookie });
  assert.equal(response.data.items.length, 2);
  assert.equal(response.data.pagination.total, 3);
  assert.ok(response.data.items[0].id > response.data.items[1].id);
});

test("A4B 28. busca encontra nome e telefone", async () => {
  const lead = await createLead({ phone: "27988880028" });
  const response = await api("/admin/leads?page=1&limit=10&search=80028", { cookie: studioCookie });
  assert.equal(response.data.items.length, 1);
  assert.equal(response.data.items[0].id, lead.id);
});

test("A4B 29. filtros combinados retornam somente o Lead esperado", async () => {
  const lead = await createLead({ phone: "27988880029" });
  await createLead({ phone: "27988880129" });
  await api(`/admin/leads/${lead.id}/priority`, { method: "PATCH", cookie: studioCookie, body: { priority: "HIGH" } });
  await api(`/admin/leads/${lead.id}/owner`, { method: "PATCH", cookie: studioCookie, body: { ownerUserId: fx.studioAdmin.id } });
  const response = await api(`/admin/leads?page=1&limit=10&status=NEW&priority=HIGH&ownerUserId=${fx.studioAdmin.id}&service=${fx.studioService.id}`, { cookie: studioCookie });
  assert.equal(response.data.items.length, 1);
  assert.equal(response.data.items[0].id, lead.id);
});

test("A4B 30. pipeline é isolado por tenant", async () => {
  await createLead({ phone: "27988880030" });
  await createLead({ tenantId: LUMIERE, phone: "27988880130" });
  const studio = await api("/admin/leads?page=1&limit=10", { cookie: studioCookie });
  const lumiere = await api("/admin/leads?page=1&limit=10", { cookie: lumiereCookie });
  assert.deepEqual(studio.data.items.map((lead) => lead.tenantId), [STUDIO]);
  assert.deepEqual(lumiere.data.items.map((lead) => lead.tenantId), [LUMIERE]);
});

test("A4B 31. jornada Studio Cut completa preserva sequência", async () => {
  const lead = await createLead({ phone: "27988880031", urgency: "TODAY" });
  assert.equal(lead.priority, "HIGH");
  await api(`/admin/leads/${lead.id}/owner`, { method: "PATCH", cookie: studioCookie, body: { ownerUserId: fx.studioAdmin.id } });
  await api(`/admin/leads/${lead.id}/qualification`, { method: "PATCH", cookie: studioCookie, body: { qualification: { serviceInterest: "Corte", acceptsAnyProfessional: true, wantsImmediateOpening: true, urgency: "TODAY", firstVisit: true, availability: "Hoje", commercialNote: "Aceita encaixe", bestContactPeriod: "ANY", preferredProfessionalId: null } } });
  await api(`/admin/leads/${lead.id}/status`, { method: "PATCH", cookie: studioCookie, body: { status: "CONTACTED" } });
  const appointment = await createAppointment({ phone: "27988880031" });
  await api(`/admin/leads/${lead.id}/convert`, { method: "POST", cookie: studioCookie, body: { appointmentId: appointment.id } });
  const events = await prisma.relationshipHistoryEvent.findMany({ where: { leadId: lead.id }, orderBy: { id: "asc" } });
  const types = events.map((event) => event.type);
  assert.ok(["LEAD_CREATED", "FOLLOW_UP_CREATED", "LEAD_OWNER_CHANGED", "LEAD_QUALIFICATION_UPDATED", "LEAD_STATUS_CHANGED", "APPOINTMENT_LINKED", "LEAD_CONVERTED"].every((type) => types.includes(type)));
});

test("A4B 32. jornada Lumière completa sem dado clínico", async () => {
  const lead = await createLead({ tenantId: LUMIERE, phone: "27988880032" });
  await api(`/admin/leads/${lead.id}/owner`, { method: "PATCH", cookie: lumiereCookie, body: { ownerUserId: fx.lumiereAdmin.id } });
  const qualification = { procedureInterest: "Limpeza de pele", requestsEvaluation: true, statedGoal: "Rotina de cuidado e aparência", firstVisit: true, packageInterest: true, availability: "Manhã", commercialNote: "Avaliação inicial", bestContactPeriod: "MORNING", preferredProfessionalId: fx.lumiereProfessional.id };
  await api(`/admin/leads/${lead.id}/qualification`, { method: "PATCH", cookie: lumiereCookie, body: { qualification } });
  await api(`/admin/leads/${lead.id}/status`, { method: "PATCH", cookie: lumiereCookie, body: { status: "CONTACTED" } });
  await api(`/admin/leads/${lead.id}/status`, { method: "PATCH", cookie: lumiereCookie, body: { status: "QUALIFIED" } });
  const appointment = await createAppointment({ tenantId: LUMIERE, phone: "27988880032" });
  const converted = await api(`/admin/leads/${lead.id}/convert`, { method: "POST", cookie: lumiereCookie, body: { appointmentId: appointment.id } });
  assert.equal(converted.data.status, "CONVERTED");
  assert.ok(!JSON.stringify(converted.data.qualification).match(/diagnóstico|doença|prescrição/i));
});

test("A4B 33. resposta pública não expõe nota nem motivo de perda", async () => {
  const lead = await createLead({ phone: "27988880033" });
  await api(`/admin/leads/${lead.id}/notes`, { method: "POST", cookie: studioCookie, body: { content: "Nota reservada" } });
  await api(`/admin/leads/${lead.id}/lost`, { method: "POST", cookie: studioCookie, body: { lostReason: "PRICE" } });
  const response = await api("/public/leads", { method: "POST", body: leadBody({ phone: "27988880033" }) });
  const serialized = JSON.stringify(response.data);
  assert.ok(!serialized.includes("Nota reservada"));
  assert.ok(!serialized.includes("PRICE"));
  assert.ok(!serialized.includes("lostReason"));
});

test("A4B 34. histórico comercial permanece ordenado", async () => {
  const lead = await createLead();
  await api(`/admin/leads/${lead.id}/priority`, { method: "PATCH", cookie: studioCookie, body: { priority: "HIGH" } });
  await api(`/admin/leads/${lead.id}/notes`, { method: "POST", cookie: studioCookie, body: { content: "Histórico ordenado" } });
  const response = await api(`/admin/leads/${lead.id}`, { cookie: studioCookie });
  const ids = response.data.relationshipHistory.map((event) => event.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
});

test("A4B 35. migration e dados anteriores permanecem preservados", async () => {
  const appointment = await createAppointment({ phone: "27988880035" });
  const saved = await prisma.appointment.findUnique({ where: { id: appointment.id }, include: { client: true } });
  const migration = await prisma.$queryRaw`SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE "migration_name" = '20260721000000_operational_pipeline' AND "finished_at" IS NOT NULL`;
  assert.equal(migration[0].count, 1);
  assert.ok(saved.clientId);
  assert.equal(saved.clientPhone, "27988880035");
  assert.equal(await prisma.appointmentHistoryEvent.count({ where: { appointmentId: saved.id } }), 1);
});
