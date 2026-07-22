import { env, SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { calculateSlots } from "../shared/src/availability";
import { cancelAppointment, reserveAppointment } from "../shared/src/booking";
import { HttpError } from "../shared/src/http";
import { executeSqlScript } from "./sql";

const ORIGIN = "https://cf1.local";

async function statusOf(operation: Promise<unknown>): Promise<number> {
  try {
    await operation;
    return 201;
  } catch (error) {
    return error instanceof HttpError ? error.status : 500;
  }
}

function booking(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "studio-cut",
    serviceId: "service-studio-cut",
    professionalId: "professional-studio-1",
    clientId: crypto.randomUUID(),
    clientName: "Cliente Sintético",
    clientPhone: `279${crypto.randomUUID().replace(/\D/g, "").padEnd(8, "0").slice(0, 8)}`,
    appointmentDate: "2099-02-02",
    startTime: "09:00",
    ...overrides
  };
}

describe("schema e seed D1", () => {
  it("aplica a migration completa em D1 vazio", async () => {
    const tables = await env.DB.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all<{ name: string }>();

    expect(tables.results.map((table) => table.name)).toEqual(expect.arrayContaining([
      "tenants",
      "services",
      "professionals",
      "professional_services",
      "business_hours",
      "professional_schedules",
      "schedule_blocks",
      "clients",
      "appointments",
      "appointment_slots",
      "leads",
      "follow_ups",
      "appointment_history_events",
      "relationship_history_events",
      "tenant_settings",
      "admin_identities",
      "admin_memberships"
    ]));
  });

  it("mantém foreign keys habilitadas", async () => {
    const pragma = await env.DB.prepare("PRAGMA foreign_keys").first<{ foreign_keys: number }>();
    expect(pragma?.foreign_keys).toBe(1);

    await expect(env.DB.prepare(`
      INSERT INTO services (
        id, tenant_id, name, description, duration_minutes, price_cents
      ) VALUES ('invalid-tenant-service', 'tenant-inexistente', 'Inválido', 'Inválido', 30, 1000)
    `).run()).rejects.toThrow();
  });

  it("semeia as duas verticais sem identidade administrativa", async () => {
    const tenants = await env.DB.prepare("SELECT slug FROM tenants ORDER BY slug").all<{ slug: string }>();
    const identities = await env.DB.prepare("SELECT COUNT(*) AS count FROM admin_identities").first<{ count: number }>();
    const services = await env.DB.prepare("SELECT tenant_id, COUNT(*) AS count FROM services GROUP BY tenant_id").all();

    expect(tenants.results.map((tenant) => tenant.slug)).toEqual(["lumiere", "studio-cut"]);
    expect(identities?.count).toBe(0);
    expect(services.results).toHaveLength(2);
  });

  it("reaplica o seed de forma idempotente", async () => {
    const before = await env.DB.prepare("SELECT COUNT(*) AS count FROM professional_services").first<{ count: number }>();
    await executeSqlScript(env.DB, env.TEST_SEED);
    const after = await env.DB.prepare("SELECT COUNT(*) AS count FROM professional_services").first<{ count: number }>();

    expect(after?.count).toBe(before?.count);
  });

  it("impede associação profissional-serviço cross-tenant", async () => {
    await expect(env.DB.prepare(`
      INSERT INTO professional_services (tenant_id, professional_id, service_id)
      VALUES ('studio-cut', 'professional-studio-1', 'service-lumiere-skin')
    `).run()).rejects.toThrow();
  });

  it("rejeita status inválido e data fora do formato", async () => {
    const clientId = crypto.randomUUID();
    await env.DB.prepare(`
      INSERT INTO clients (id, tenant_id, name, phone, normalized_phone)
      VALUES (?, 'studio-cut', 'Cliente Sintético', '27999990000', '27999990000')
    `).bind(clientId).run();

    await expect(env.DB.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id,
        client_name, client_phone, appointment_date, start_time, end_time, status
      ) VALUES (?, 'studio-cut', 'service-studio-cut', 'professional-studio-1', ?,
        'Cliente Sintético', '27999990000', '2099-02-03', '09:00', '09:30', 'INVALID')
    `).bind(crypto.randomUUID(), clientId).run()).rejects.toThrow();

    await expect(env.DB.prepare(`
      INSERT INTO blocked_dates (id, tenant_id, date, reason)
      VALUES (?, 'studio-cut', '03/02/2099', 'Formato inválido')
    `).bind(crypto.randomUUID()).run()).rejects.toThrow();
  });

  it("persiste dinheiro somente em centavos inteiros", async () => {
    const service = await env.DB.prepare(`
      SELECT price_cents FROM services WHERE id = 'service-studio-cut'
    `).first<{ price_cents: number }>();
    expect(service?.price_cents).toBe(4500);

    await expect(env.DB.prepare(`
      INSERT INTO services (
        id, tenant_id, name, description, duration_minutes, price_cents
      ) VALUES (?, 'studio-cut', ?, 'Teste', 30, 12.5)
    `).bind(crypto.randomUUID(), `Serviço ${crypto.randomUUID()}`).run()).rejects.toThrow();
  });

  it("mantém timestamps UTC ISO-8601", async () => {
    const tenant = await env.DB.prepare(`
      SELECT created_at FROM tenants WHERE slug = 'studio-cut'
    `).first<{ created_at: string }>();
    expect(tenant?.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe("resolução pública de tenant", () => {
  it("responde live com D1", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/live`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("usa o slug da rota e ignora query/header do cliente", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/tenants/studio-cut/context?tenantId=lumiere`, {
      headers: { "X-Tenant": "lumiere" }
    });
    const data = await response.json() as { tenant: { slug: string } };
    expect(response.status).toBe(200);
    expect(data.tenant.slug).toBe("studio-cut");
  });

  it("retorna 404 para tenant desconhecido e rota desconhecida", async () => {
    const tenant = await SELF.fetch(`${ORIGIN}/api/tenants/inexistente/context`);
    const route = await SELF.fetch(`${ORIGIN}/api/inexistente`);
    expect(tenant.status).toBe(404);
    expect(route.status).toBe(404);
  });
});

describe("disponibilidade", () => {
  const base = {
    business: { isOpen: true, startTime: "09:00", endTime: "18:00" },
    professional: [
      { startTime: "09:00", endTime: "12:00" },
      { startTime: "13:00", endTime: "17:00" }
    ],
    blocks: [],
    occupied: [],
    durationMinutes: 60,
    slotMinutes: 30
  };

  it("dia fechado e bloqueio integral geram zero slots", () => {
    expect(calculateSlots({ ...base, business: { isOpen: false, startTime: "00:00", endTime: "00:00" } })).toEqual([]);
    expect(calculateSlots({ ...base, blocks: [{ allDay: true }] })).toEqual([]);
  });

  it("respeita pausa, duração e limite do negócio", () => {
    const slots = calculateSlots(base);
    expect(slots).toContain("09:00");
    expect(slots).not.toContain("11:30");
    expect(slots).not.toContain("12:00");
    expect(slots).not.toContain("16:30");
  });

  it("bloqueio parcial remove somente slots afetados", () => {
    const slots = calculateSlots({
      ...base,
      durationMinutes: 30,
      blocks: [{ allDay: false, startTime: "10:00", endTime: "10:30" }]
    });
    expect(slots).toContain("09:30");
    expect(slots).not.toContain("10:00");
    expect(slots).toContain("10:30");
  });
});

describe("conflito de agendamento", () => {
  it("produz 201 e 409 para duas reservas concorrentes", async () => {
    const input = booking({ appointmentDate: "2099-02-10", startTime: "09:00" });
    const attempts = await Promise.all([
      statusOf(reserveAppointment(env.DB, input)),
      statusOf(reserveAppointment(env.DB, booking({ appointmentDate: "2099-02-10", startTime: "09:00" })))
    ]);
    const count = await env.DB.prepare(`
      SELECT COUNT(*) AS count FROM appointments
      WHERE tenant_id = 'studio-cut' AND professional_id = 'professional-studio-1'
        AND appointment_date = '2099-02-10' AND start_time = '09:00'
        AND status <> 'CANCELLED'
    `).first<{ count: number }>();

    expect(attempts.sort()).toEqual([201, 409]);
    expect(count?.count).toBe(1);
  });

  it("impede sobreposição parcial pela duração do serviço", async () => {
    const first = await statusOf(reserveAppointment(env.DB, booking({
      serviceId: "service-studio-combo",
      appointmentDate: "2099-02-11",
      startTime: "09:00"
    })));
    const overlap = await statusOf(reserveAppointment(env.DB, booking({
      serviceId: "service-studio-combo",
      appointmentDate: "2099-02-11",
      startTime: "09:30"
    })));
    const adjacent = await statusOf(reserveAppointment(env.DB, booking({
      serviceId: "service-studio-combo",
      appointmentDate: "2099-02-11",
      startTime: "10:00"
    })));

    expect([first, overlap, adjacent]).toEqual([201, 409, 201]);
  });

  it("cancelado libera o slot", async () => {
    const input = booking({ appointmentDate: "2099-02-12", startTime: "11:00" });
    const created = await reserveAppointment(env.DB, input);
    await cancelAppointment(env.DB, "studio-cut", created.id);
    const replacement = await statusOf(reserveAppointment(env.DB, booking({ appointmentDate: "2099-02-12", startTime: "11:00" })));

    expect(replacement).toBe(201);
  });

  it("impede referências de negócio cross-tenant", async () => {
    const status = await statusOf(reserveAppointment(env.DB, booking({ serviceId: "service-lumiere-skin" })));
    expect(status).toBe(404);
  });
});
