import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

const ORIGIN = "https://cf1b.local";

function futureDate(dayOfWeek: number, weeksAhead = 1): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  const delta = (dayOfWeek - date.getUTCDay() + 7) % 7 + weeksAhead * 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function syntheticPhone() {
  const digits = crypto.randomUUID().replace(/\D/g, "").padEnd(11, "7").slice(0, 11);
  return digits.startsWith("0") ? `27${digits.slice(2)}` : digits;
}

function bookingPayload(tenant: "studio-cut" | "lumiere", overrides: Record<string, unknown> = {}) {
  const studio = tenant === "studio-cut";
  return {
    serviceId: studio ? "service-studio-cut" : "service-lumiere-skin",
    professionalId: studio ? "professional-studio-1" : "professional-lumiere-1",
    clientName: `CF1B Cliente ${crypto.randomUUID()}`,
    clientPhone: syntheticPhone(),
    clientEmail: "cliente.cf1b@example.test",
    date: futureDate(studio ? 1 : 2, 2),
    time: studio ? "09:00" : "10:00",
    ...overrides
  };
}

async function api(
  tenant: string,
  resource: string,
  options: RequestInit = {},
  ip = `198.51.100.${Math.floor(Math.random() * 200) + 1}`
) {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  headers.set("CF-Connecting-IP", ip);
  headers.set("User-Agent", "CF1B synthetic test");
  return SELF.fetch(`${ORIGIN}/api/tenants/${tenant}/${resource}`, { ...options, headers });
}

async function create(tenant: "studio-cut" | "lumiere", overrides: Record<string, unknown> = {}, ip?: string) {
  const payload = bookingPayload(tenant, overrides);
  const response = await api(tenant, "appointments", {
    method: "POST",
    body: JSON.stringify(payload)
  }, ip);
  return { response, payload, data: await response.json() as Record<string, any> };
}

function tokenFrom(data: Record<string, any>): string {
  return String(data.managementPath).split("=")[1];
}

afterEach(async () => {
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE appointments SET rescheduled_from_id = NULL
      WHERE client_name LIKE 'CF1B Cliente%'
    `),
    env.DB.prepare(`
      DELETE FROM relationship_history_events
      WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'CF1B Cliente%')
    `),
    env.DB.prepare("DELETE FROM appointments WHERE client_name LIKE 'CF1B Cliente%'"),
    env.DB.prepare("DELETE FROM clients WHERE name LIKE 'CF1B Cliente%'"),
    env.DB.prepare("DELETE FROM public_rate_limits")
  ]);
});

describe("criação pública CF1B", () => {
  it("cria agendamento completo no Studio Cut com histórico, slots e token hash-only", async () => {
    const { response, data } = await create("studio-cut");
    const token = tokenFrom(data);
    const appointment = await env.DB.prepare(`
      SELECT tenant_id, status FROM appointments WHERE id = ?
    `).bind(data.id).first<{ tenant_id: string; status: string }>();
    const tokenRow = await env.DB.prepare(`
      SELECT token_hash FROM appointment_access_tokens WHERE appointment_id = ?
    `).bind(data.id).first<{ token_hash: string }>();
    const history = await env.DB.prepare(`
      SELECT type FROM appointment_history_events WHERE appointment_id = ?
    `).bind(data.id).all<{ type: string }>();
    const relationship = await env.DB.prepare(`
      SELECT type FROM relationship_history_events WHERE appointment_id = ?
    `).bind(data.id).all<{ type: string }>();

    expect(response.status).toBe(201);
    expect(data).toMatchObject({ status: "PENDING", clientName: expect.stringContaining("CF1B Cliente") });
    expect(appointment).toEqual({ tenant_id: "studio-cut", status: "PENDING" });
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenRow?.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(tokenRow?.token_hash).not.toBe(token);
    expect(history.results.map((event) => event.type)).toEqual(["CREATED"]);
    expect(relationship.results.map((event) => event.type)).toContain("APPOINTMENT_LINKED");
  });

  it("cria agendamento válido na Lumière", async () => {
    const { response, data } = await create("lumiere");
    expect(response.status).toBe(201);
    expect(data.service.name).toBe("Limpeza de pele");
    expect(data.professional.id).toBe("professional-lumiere-1");
  });

  it("retorna 404 uniforme para serviço, profissional, associação e IDs cross-tenant", async () => {
    const cases = [
      { serviceId: "service-inexistente" },
      { professionalId: "professional-inexistente" },
      { serviceId: "service-studio-beard", professionalId: "professional-studio-1" },
      { serviceId: "service-lumiere-skin", professionalId: "professional-lumiere-1" }
    ];
    for (const overrides of cases) {
      const { response, data } = await create("studio-cut", overrides);
      expect(response.status).toBe(404);
      expect(data).toEqual({ error: { code: "NOT_FOUND", message: "Recurso não encontrado" } });
    }
  });

  it("ignora demoId, tenantId e header customizado enviados pelo cliente", async () => {
    const payload = bookingPayload("studio-cut", { demoId: "lumiere", tenantId: "lumiere" });
    const response = await api("studio-cut", "appointments", {
      method: "POST",
      headers: { "X-Tenant": "lumiere" },
      body: JSON.stringify(payload)
    });
    const data = await response.json() as Record<string, any>;
    const appointment = await env.DB.prepare("SELECT tenant_id FROM appointments WHERE id = ?").bind(data.id).first<{ tenant_id: string }>();

    expect(response.status).toBe(201);
    expect(appointment?.tenant_id).toBe("studio-cut");
  });

  it("normaliza telefone e reutiliza o mesmo cliente com segurança", async () => {
    const phone = `27${syntheticPhone().slice(-9)}`;
    const first = await create("studio-cut", { clientPhone: `(${phone.slice(0, 2)}) ${phone.slice(2, 7)}-${phone.slice(7)}`, date: futureDate(1, 2), time: "09:00" });
    const second = await create("studio-cut", { clientName: first.payload.clientName, clientPhone: phone, date: futureDate(1, 3), time: "09:00" });
    const count = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM clients WHERE normalized_phone = ? AND tenant_id = 'studio-cut'
    `).bind(phone).first<{ count: number }>();

    expect([first.response.status, second.response.status]).toEqual([201, 201]);
    expect(count?.count).toBe(1);
  });

  it("rejeita horário indisponível e sobreposição parcial", async () => {
    const date = futureDate(1, 3);
    const first = await create("studio-cut", {
      serviceId: "service-studio-combo",
      date,
      time: "09:00"
    });
    const overlap = await create("studio-cut", { date, time: "09:30" });

    expect(first.response.status).toBe(201);
    expect(overlap.response.status).toBe(409);
    expect(overlap.data.error.code).toBe("CONFLICT");
  });

  it("prova concorrência 201/409 sem cliente ou histórico órfão", async () => {
    const date = futureDate(1, 4);
    const attempts = await Promise.all([
      create("studio-cut", { date, time: "09:00" }, "203.0.113.10"),
      create("studio-cut", { date, time: "09:00" }, "203.0.113.11")
    ]);
    const appointments = await env.DB.prepare(`
      SELECT id FROM appointments
      WHERE tenant_id = 'studio-cut' AND appointment_date = ? AND start_time = '09:00'
        AND client_name LIKE 'CF1B Cliente%' AND status <> 'CANCELLED'
    `).bind(date).all<{ id: string }>();
    const clients = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM clients WHERE name LIKE 'CF1B Cliente%'
    `).first<{ count: number }>();
    const histories = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM appointment_history_events
      WHERE appointment_id IN (SELECT id FROM appointments WHERE client_name LIKE 'CF1B Cliente%')
    `).first<{ count: number }>();
    const slots = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM appointment_slots
      WHERE appointment_id IN (SELECT id FROM appointments WHERE client_name LIKE 'CF1B Cliente%')
    `).first<{ count: number }>();

    expect(attempts.map(({ response }) => response.status).sort()).toEqual([201, 409]);
    expect(appointments.results).toHaveLength(1);
    expect(clients?.count).toBe(1);
    expect(histories?.count).toBe(1);
    expect(slots?.count).toBe(1);
  });

  it("mantém conflitos independentes entre tenants", async () => {
    const [studio, lumiere] = await Promise.all([
      create("studio-cut", { date: futureDate(1, 5), time: "09:00" }, "203.0.113.20"),
      create("lumiere", { date: futureDate(2, 5), time: "10:00" }, "203.0.113.20")
    ]);
    expect([studio.response.status, lumiere.response.status]).toEqual([201, 201]);
  });
});

describe("token e lifecycle público CF1B", () => {
  it("consulta somente o resumo necessário com token válido", async () => {
    const created = await create("studio-cut");
    const response = await api("studio-cut", "appointment", {
      headers: { "X-Appointment-Token": tokenFrom(created.data) }
    });
    const data = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(Object.keys(data).sort()).toEqual(["date", "professional", "service", "status", "time"]);
    expect(data).not.toHaveProperty("clientPhone");
    expect(data).not.toHaveProperty("id");
  });

  it("usa resposta genérica para token inválido e cross-tenant", async () => {
    const created = await create("studio-cut");
    const invalid = await api("studio-cut", "appointment", {
      headers: { "X-Appointment-Token": "0".repeat(64) }
    });
    const cross = await api("lumiere", "appointment", {
      headers: { "X-Appointment-Token": tokenFrom(created.data) }
    });

    expect(invalid.status).toBe(404);
    expect(cross.status).toBe(404);
    expect(await invalid.json()).toEqual(await cross.json());
  });

  it("rejeita token expirado", async () => {
    const created = await create("studio-cut");
    await env.DB.prepare(`
      UPDATE appointment_access_tokens SET expires_at = '2000-01-01T00:00:00.000Z'
      WHERE appointment_id = ?
    `).bind(created.data.id).run();
    const response = await api("studio-cut", "appointment", {
      headers: { "X-Appointment-Token": tokenFrom(created.data) }
    });
    const data = await response.json() as Record<string, any>;

    expect(response.status).toBe(410);
    expect(data.error.code).toBe("TOKEN_EXPIRED");
  });

  it("confirma o agendamento e registra histórico uma única vez", async () => {
    const created = await create("studio-cut");
    const token = tokenFrom(created.data);
    const first = await api("studio-cut", "appointment/confirm", { method: "POST", headers: { "X-Appointment-Token": token } });
    const second = await api("studio-cut", "appointment/confirm", { method: "POST", headers: { "X-Appointment-Token": token } });
    const count = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM appointment_history_events
      WHERE appointment_id = ? AND type = 'CONFIRMED'
    `).bind(created.data.id).first<{ count: number }>();

    expect([first.status, second.status]).toEqual([200, 200]);
    expect((await first.json() as Record<string, unknown>).status).toBe("CONFIRMED");
    expect(count?.count).toBe(1);
  });

  it("cancela de forma atômica e idempotente, registra histórico e libera o slot", async () => {
    const date = futureDate(1, 3);
    const created = await create("studio-cut", { date, time: "10:00" });
    const token = tokenFrom(created.data);
    const first = await api("studio-cut", "appointment/cancel", {
      method: "POST",
      headers: { "X-Appointment-Token": token },
      body: JSON.stringify({ reason: "Não poderei comparecer" })
    });
    const second = await api("studio-cut", "appointment/cancel", {
      method: "POST",
      headers: { "X-Appointment-Token": token },
      body: JSON.stringify({ reason: "Repetido" })
    });
    const replacement = await create("studio-cut", { date, time: "10:00" });
    const history = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM appointment_history_events
      WHERE appointment_id = ? AND type = 'CANCELLED'
    `).bind(created.data.id).first<{ count: number }>();
    const slots = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM appointment_slots WHERE appointment_id = ?
    `).bind(created.data.id).first<{ count: number }>();

    expect([first.status, second.status, replacement.response.status]).toEqual([200, 200, 201]);
    expect((await first.json() as Record<string, unknown>).status).toBe("CANCELLED");
    expect(history?.count).toBe(1);
    expect(slots?.count).toBe(0);
  });

  it("cancelamento não libera slots de outro agendamento", async () => {
    const date = futureDate(1, 4);
    const first = await create("studio-cut", { date, time: "09:00" });
    const second = await create("studio-cut", { date, time: "09:30" });
    await api("studio-cut", "appointment/cancel", {
      method: "POST",
      headers: { "X-Appointment-Token": tokenFrom(first.data) },
      body: JSON.stringify({})
    });
    const secondSlots = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM appointment_slots WHERE appointment_id = ?
    `).bind(second.data.id).first<{ count: number }>();

    expect(second.response.status).toBe(201);
    expect(secondSlots?.count).toBe(1);
  });

  it("reagenda, revoga o token antigo e emite novo mecanismo de gestão", async () => {
    const created = await create("studio-cut", { date: futureDate(1, 2), time: "09:00" });
    const oldToken = tokenFrom(created.data);
    const newDate = futureDate(1, 3);
    const availability = await api(
      "studio-cut",
      `appointment/reschedule-availability?date=${newDate}&professionalId=professional-studio-1`,
      { headers: { "X-Appointment-Token": oldToken } }
    );
    const rescheduled = await api("studio-cut", "appointment/reschedule", {
      method: "POST",
      headers: { "X-Appointment-Token": oldToken },
      body: JSON.stringify({ date: newDate, time: "10:00", professionalId: "professional-studio-1" })
    });
    const data = await rescheduled.json() as Record<string, any>;
    const oldLookup = await api("studio-cut", "appointment", { headers: { "X-Appointment-Token": oldToken } });
    const newLookup = await api("studio-cut", "appointment", { headers: { "X-Appointment-Token": tokenFrom(data) } });

    expect(availability.status).toBe(200);
    expect(await availability.json()).toContain("10:00");
    expect(rescheduled.status).toBe(201);
    expect(oldLookup.status).toBe(410);
    expect(newLookup.status).toBe(200);
    expect((await newLookup.json() as Record<string, unknown>).date).toBe(newDate);
  });
});

describe("validação e abuso CF1B", () => {
  it("rejeita JSON inválido e payload excessivo sem detalhe interno", async () => {
    const invalid = await api("studio-cut", "appointments", { method: "POST", body: "{" });
    const excessive = await api("studio-cut", "appointments", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(9000) })
    });
    const invalidData = await invalid.json() as Record<string, any>;

    expect([invalid.status, excessive.status]).toEqual([400, 400]);
    expect(invalidData.error.code).toBe("INVALID_REQUEST");
    expect(JSON.stringify(invalidData)).not.toMatch(/SQL|stack|table/i);
  });

  it("valida campos obrigatórios, IDs, data, horário, nome, telefone e e-mail", async () => {
    const cases = [
      { serviceId: null },
      { serviceId: "inválido!" },
      { date: "21/07/2026" },
      { time: "25:00" },
      { clientName: "A" },
      { clientPhone: "123" },
      { clientEmail: "sem-arroba" }
    ];
    for (const overrides of cases) {
      const { response, data } = await create("studio-cut", overrides);
      expect(response.status).toBe(400);
      expect(data.error.code).toBe("INVALID_REQUEST");
    }
  });

  it("aplica rate limit D1 e retorna 429", async () => {
    const ip = "192.0.2.200";
    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const response = await api("studio-cut", "appointments", {
        method: "POST",
        body: JSON.stringify({})
      }, ip);
      statuses.push(response.status);
    }

    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(400));
    expect(statuses[10]).toBe(429);
  });
});
