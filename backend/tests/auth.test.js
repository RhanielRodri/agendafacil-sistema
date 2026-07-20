import "dotenv/config";
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import app from "../app.js";
import prisma from "../prismaClient.js";
import { hashPassword } from "../lib/password.js";
import { createSession, revokeSession, hashToken } from "../lib/session.js";

const STUDIO = "studio-cut";
const LUMIERE = "lumiere";

// Credenciais fictícias exclusivas dos testes (não são as do .env local).
const STUDIO_EMAIL = "studio.admin@test.local";
const STUDIO_PASS = "StudioPass!234";
const LUMIERE_EMAIL = "lumiere.admin@test.local";
const LUMIERE_PASS = "LumierePass!234";
const INACTIVE_EMAIL = "inactive.admin@test.local";
const INACTIVE_PASS = "InactivePass!234";
const SAME_PASS = "SharedPassword!777";

let server;
let baseUrl;
const fx = {};
let studioCookie;
let lumiereCookie;
let studioSetCookieRaw;

async function login(tenantSlug, email, password) {
  const res = await fetch(`${baseUrl}/admin/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, demoId: tenantSlug })
  });
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const raw = setCookies.find((c) => c.startsWith("admin_session=")) || null;
  const cookie = raw ? "admin_session=" + raw.split("admin_session=")[1].split(";")[0] : null;
  const data = await res.json().catch(() => null);
  return { status: res.status, cookie, raw, data };
}

async function api(path, { method = "GET", cookie, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, text };
}

before(async () => {
  await prisma.adminSession.deleteMany();
  await prisma.adminUser.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.businessHours.deleteMany();
  await prisma.professional.deleteMany();
  await prisma.service.deleteMany();

  await prisma.tenant.upsert({ where: { slug: STUDIO }, update: { active: true }, create: { slug: STUDIO, name: "Studio Cut" } });
  await prisma.tenant.upsert({ where: { slug: LUMIERE }, update: { active: true }, create: { slug: LUMIERE, name: "Lumière Estética" } });

  fx.studioUser = await prisma.adminUser.create({ data: { tenantId: STUDIO, email: STUDIO_EMAIL, name: "Studio Admin", passwordHash: await hashPassword(STUDIO_PASS) } });
  fx.lumiereUser = await prisma.adminUser.create({ data: { tenantId: LUMIERE, email: LUMIERE_EMAIL, name: "Lumiere Admin", passwordHash: await hashPassword(LUMIERE_PASS) } });
  await prisma.adminUser.create({ data: { tenantId: STUDIO, email: INACTIVE_EMAIL, name: "Inactive", active: false, passwordHash: await hashPassword(INACTIVE_PASS) } });
  // Dois usuários com a MESMA senha, para provar hash não determinístico.
  fx.dupA = await prisma.adminUser.create({ data: { tenantId: STUDIO, email: "dupa@test.local", name: "Dup A", passwordHash: await hashPassword(SAME_PASS) } });
  fx.dupB = await prisma.adminUser.create({ data: { tenantId: LUMIERE, email: "dupb@test.local", name: "Dup B", passwordHash: await hashPassword(SAME_PASS) } });

  const studioSvc = await prisma.service.create({ data: { tenantId: STUDIO, name: "Corte auth", description: "x", duration: 30, price: 40 } });
  const studioPro = await prisma.professional.create({ data: { tenantId: STUDIO, name: "Pro S", specialty: "x", photo: "x" } });
  const lumiereSvc = await prisma.service.create({ data: { tenantId: LUMIERE, name: "Limpeza auth", description: "x", duration: 60, price: 150 } });
  const lumierePro = await prisma.professional.create({ data: { tenantId: LUMIERE, name: "Pro L", specialty: "x", photo: "x" } });

  fx.studioAppt = await prisma.appointment.create({ data: { tenantId: STUDIO, serviceId: studioSvc.id, professionalId: studioPro.id, clientName: "Cliente Studio", clientPhone: "27900000001", date: new Date("2026-09-02T00:00:00.000Z"), time: "10:00" } });
  fx.lumiereAppt = await prisma.appointment.create({ data: { tenantId: LUMIERE, serviceId: lumiereSvc.id, professionalId: lumierePro.id, clientName: "Cliente Lumiere", clientPhone: "27900000002", date: new Date("2026-09-02T00:00:00.000Z"), time: "11:00" } });

  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;

  const s = await login(STUDIO, STUDIO_EMAIL, STUDIO_PASS);
  studioCookie = s.cookie;
  studioSetCookieRaw = s.raw;
  const l = await login(LUMIERE, LUMIERE_EMAIL, LUMIERE_PASS);
  lumiereCookie = l.cookie;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
});

test("1. login Studio Cut com credencial correta", async () => {
  assert.ok(studioCookie);
  const me = await api("/admin/me", { cookie: studioCookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.tenantId, STUDIO);
});

test("2. login Lumière com credencial correta", async () => {
  assert.ok(lumiereCookie);
  const me = await api("/admin/me", { cookie: lumiereCookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.tenantId, LUMIERE);
});

test("3. senha incorreta", async () => {
  const res = await login(STUDIO, STUDIO_EMAIL, "senha-errada");
  assert.equal(res.status, 401);
  assert.equal(res.cookie, null);
});

test("4. usuário inexistente (mesma resposta genérica)", async () => {
  const res = await login(STUDIO, "ghost@test.local", "qualquer-coisa");
  assert.equal(res.status, 401);
  assert.equal(res.data.message, "Credenciais inválidas");
});

test("5. usuário inativo rejeitado", async () => {
  const res = await login(STUDIO, INACTIVE_EMAIL, INACTIVE_PASS);
  assert.equal(res.status, 401);
});

test("6. rota admin sem cookie", async () => {
  const res = await api("/appointments");
  assert.equal(res.status, 401);
});

test("7. sessão válida", async () => {
  const res = await api("/appointments", { cookie: studioCookie });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data));
});

test("8. sessão expirada rejeitada", async () => {
  const token = "expired-token-fixo";
  await prisma.adminSession.create({
    data: { userId: fx.studioUser.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() - 1000) }
  });
  const res = await api("/admin/me", { cookie: `admin_session=${token}` });
  assert.equal(res.status, 401);
});

test("9. sessão revogada rejeitada", async () => {
  const { token } = await createSession(fx.studioUser.id);
  const before = await api("/admin/me", { cookie: `admin_session=${token}` });
  assert.equal(before.status, 200);

  const session = await prisma.adminSession.findUnique({ where: { tokenHash: hashToken(token) } });
  await revokeSession(session.id);

  const after = await api("/admin/me", { cookie: `admin_session=${token}` });
  assert.equal(after.status, 401);
});

test("10. logout invalida o token antigo", async () => {
  const s = await login(STUDIO, STUDIO_EMAIL, STUDIO_PASS);
  const ok = await api("/admin/me", { cookie: s.cookie });
  assert.equal(ok.status, 200);

  const out = await api("/admin/session", { method: "DELETE", cookie: s.cookie });
  assert.equal(out.status, 200);

  const reused = await api("/admin/me", { cookie: s.cookie });
  assert.equal(reused.status, 401);
});

test("11. cookie seguro conforme ambiente (dev: HttpOnly, sem Secure)", () => {
  assert.ok(studioSetCookieRaw);
  assert.match(studioSetCookieRaw, /HttpOnly/);
  assert.match(studioSetCookieRaw, /Path=\//);
  assert.match(studioSetCookieRaw, /SameSite=Lax/);
  assert.doesNotMatch(studioSetCookieRaw, /Secure/);
});

test("12. tenant da sessão não é substituível por query param", async () => {
  const res = await api(`/appointments?demoId=${LUMIERE}`, { cookie: studioCookie });
  assert.equal(res.status, 200);
  assert.ok(res.data.every((a) => a.tenantId === STUDIO));
});

test("13. admin Studio Cut não lista dados Lumière", async () => {
  const res = await api("/appointments", { cookie: studioCookie });
  assert.ok(!res.data.some((a) => a.tenantId === LUMIERE));
  assert.ok(res.data.some((a) => a.id === fx.studioAppt.id));
});

test("14. admin Studio Cut não lê ID Lumière", async () => {
  const res = await api(`/appointments/${fx.lumiereAppt.id}`, { cookie: studioCookie });
  assert.equal(res.status, 404);
});

test("15. admin Studio Cut não altera ID Lumière", async () => {
  const res = await api(`/appointments/${fx.lumiereAppt.id}/status`, { method: "PATCH", cookie: studioCookie, body: { status: "CANCELLED" } });
  assert.equal(res.status, 404);
  const still = await prisma.appointment.findUnique({ where: { id: fx.lumiereAppt.id } });
  assert.equal(still.status, "NEW");
});

test("16. admin Lumière não lê dados Studio Cut", async () => {
  const read = await api(`/appointments/${fx.studioAppt.id}`, { cookie: lumiereCookie });
  assert.equal(read.status, 404);
  const list = await api("/appointments", { cookie: lumiereCookie });
  assert.ok(!list.data.some((a) => a.tenantId === STUDIO));
});

test("17. CSV contém apenas dados do tenant autenticado", async () => {
  const res = await api("/appointments/export.csv", { cookie: studioCookie });
  assert.equal(res.status, 200);
  assert.match(res.text, /Cliente Studio/);
  assert.doesNotMatch(res.text, /Cliente Lumiere/);
});

test("18. rate limit de login", async () => {
  let got429 = false;
  for (let i = 0; i < 7; i++) {
    const res = await login(STUDIO, "ratelimit@test.local", "errada");
    if (res.status === 429) { got429 = true; break; }
  }
  assert.ok(got429);
});

test("19. hash de senha não é determinístico entre usuários com a mesma senha", async () => {
  const a = await prisma.adminUser.findUnique({ where: { id: fx.dupA.id }, select: { passwordHash: true } });
  const b = await prisma.adminUser.findUnique({ where: { id: fx.dupB.id }, select: { passwordHash: true } });
  assert.notEqual(a.passwordHash, b.passwordHash);
});

test("20. nenhuma resposta expõe hash ou token armazenado", async () => {
  const me = await api("/admin/me", { cookie: studioCookie });
  const list = await api("/appointments", { cookie: studioCookie });
  const loginRes = await login(STUDIO, STUDIO_EMAIL, STUDIO_PASS);
  for (const blob of [me.text, list.text, JSON.stringify(loginRes.data)]) {
    assert.doesNotMatch(blob, /passwordHash/);
    assert.doesNotMatch(blob, /tokenHash/);
  }
});
