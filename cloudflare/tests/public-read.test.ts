import { env, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { calculateD1Availability } from "../shared/src/availability";
import { cancelAppointment, reserveAppointment } from "../shared/src/booking";

const ORIGIN = "https://cf1b.local";
const cleanupStatements: D1PreparedStatement[] = [];

function futureDate(dayOfWeek: number, weeksAhead = 1): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  const delta = (dayOfWeek - date.getUTCDay() + 7) % 7 + weeksAhead * 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function availabilityUrl(tenant: string, date: string, serviceId: string, professionalId: string) {
  const query = new URLSearchParams({ date, serviceId, professionalId });
  return `${ORIGIN}/api/tenants/${tenant}/available-slots?${query}`;
}

afterEach(async () => {
  if (cleanupStatements.length) await env.DB.batch(cleanupStatements.splice(0));
});

describe("catálogo público CF1B", () => {
  it("retorna contexto e terminologia próprios de cada vertical", async () => {
    const studio = await SELF.fetch(`${ORIGIN}/api/tenants/studio-cut/context`);
    const lumiere = await SELF.fetch(`${ORIGIN}/api/tenants/lumiere/context`);
    const studioData = await studio.json() as { tenant: { slug: string }; terminology: { professionalPlural: string } };
    const lumiereData = await lumiere.json() as { tenant: { slug: string }; terminology: { servicePlural: string } };

    expect(studioData.tenant.slug).toBe("studio-cut");
    expect(studioData.terminology.professionalPlural).toBe("barbeiros");
    expect(lumiereData.tenant.slug).toBe("lumiere");
    expect(lumiereData.terminology.servicePlural).toBe("procedimentos");
  });

  it("lista somente serviços ativos do tenant e representa preço nulo", async () => {
    const nullableId = `service-null-${crypto.randomUUID()}`;
    const inactiveId = `service-inactive-${crypto.randomUUID()}`;
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO services (id, tenant_id, name, description, duration_minutes, price_cents, active, display_order)
        VALUES (?, 'studio-cut', ?, 'Sintético', 30, NULL, 1, 90)
      `).bind(nullableId, `Sob consulta ${nullableId}`),
      env.DB.prepare(`
        INSERT INTO services (id, tenant_id, name, description, duration_minutes, price_cents, active, display_order)
        VALUES (?, 'studio-cut', ?, 'Sintético', 30, 1000, 0, 91)
      `).bind(inactiveId, `Inativo ${inactiveId}`),
      env.DB.prepare(`
        INSERT INTO professional_services (tenant_id, professional_id, service_id)
        VALUES ('studio-cut', 'professional-studio-1', ?)
      `).bind(inactiveId)
    ]);
    cleanupStatements.push(env.DB.prepare("DELETE FROM services WHERE id IN (?, ?)").bind(nullableId, inactiveId));

    const response = await SELF.fetch(`${ORIGIN}/api/tenants/studio-cut/services`);
    const services = await response.json() as Array<{ id: string; price: number | null; priceLabel: string | null }>;
    const professionalsResponse = await SELF.fetch(`${ORIGIN}/api/tenants/studio-cut/professionals`);
    const professionals = await professionalsResponse.json() as Array<{ id: string; serviceIds: string[] }>;

    expect(response.status).toBe(200);
    expect(services.find((service) => service.id === nullableId)).toMatchObject({ price: null, priceLabel: "Sob consulta" });
    expect(services.some((service) => service.id === inactiveId)).toBe(false);
    expect(services.some((service) => service.id === "service-lumiere-skin")).toBe(false);
    expect(professionals.find((professional) => professional.id === "professional-studio-1")?.serviceIds).not.toContain(inactiveId);
  });

  it("lista profissionais compatíveis sem campos internos", async () => {
    await env.DB.prepare(`
      UPDATE professionals SET internal_contact = 'interno-sintético'
      WHERE id = 'professional-studio-1'
    `).run();
    cleanupStatements.push(env.DB.prepare(`
      UPDATE professionals SET internal_contact = NULL WHERE id = 'professional-studio-1'
    `));

    const response = await SELF.fetch(`${ORIGIN}/api/tenants/studio-cut/professionals`);
    const professionals = await response.json() as Array<Record<string, unknown>>;
    const first = professionals.find((professional) => professional.id === "professional-studio-1");

    expect(first?.serviceIds).toEqual(expect.arrayContaining(["service-studio-cut", "service-studio-combo"]));
    expect(first).not.toHaveProperty("internal_contact");
    expect(first).not.toHaveProperty("tenant_id");
    expect(professionals.some((professional) => professional.id === "professional-lumiere-1")).toBe(false);
  });

  it("expõe somente a lista branca de settings e horários do tenant", async () => {
    const settingsResponse = await SELF.fetch(`${ORIGIN}/api/tenants/studio-cut/settings`);
    const settings = await settingsResponse.json() as Record<string, unknown>;
    const hoursResponse = await SELF.fetch(`${ORIGIN}/api/tenants/lumiere/business-hours`);
    const hours = await hoursResponse.json() as Array<{ dayOfWeek: number }>;

    expect(Object.keys(settings).sort()).toEqual([
      "addressLine",
      "bookingEnabled",
      "cancellationPolicy",
      "confirmationMessage",
      "maxFutureDays",
      "publicName",
      "publicPhone",
      "publicWhatsapp",
      "timezone"
    ]);
    expect(settings).not.toHaveProperty("slotDurationMinutes");
    expect(settings).not.toHaveProperty("minAdvanceMinutes");
    expect(hours).toHaveLength(7);
    expect(hours.map((entry) => entry.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("mantém slug da rota como única autoridade", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/tenants/studio-cut/services?demoId=lumiere&tenantId=lumiere`, {
      headers: { "X-Tenant": "lumiere" }
    });
    const services = await response.json() as Array<{ id: string }>;

    expect(response.status).toBe(200);
    expect(services.some((service) => service.id === "service-studio-cut")).toBe(true);
    expect(services.some((service) => service.id === "service-lumiere-skin")).toBe(false);
  });
});

describe("disponibilidade pública CF1B", () => {
  it("calcula dia aberto, pausa e duração real do serviço", async () => {
    const monday = futureDate(1);
    const cutResponse = await SELF.fetch(availabilityUrl("studio-cut", monday, "service-studio-cut", "professional-studio-1"));
    const comboResponse = await SELF.fetch(availabilityUrl("studio-cut", monday, "service-studio-combo", "professional-studio-1"));
    const cut = await cutResponse.json() as string[];
    const combo = await comboResponse.json() as string[];

    expect(cut).toContain("09:00");
    expect(cut).not.toContain("12:00");
    expect(combo).toContain("09:00");
    expect(combo).not.toContain("11:30");
    expect(combo).not.toContain("16:30");
  });

  it("dia fechado retorna zero slots", async () => {
    const sunday = futureDate(0);
    const response = await SELF.fetch(availabilityUrl("studio-cut", sunday, "service-studio-cut", "professional-studio-1"));
    expect(await response.json()).toEqual([]);
  });

  it("bloqueios parcial e integral removem os slots afetados", async () => {
    const monday = futureDate(1, 2);
    const partialId = `block-${crypto.randomUUID()}`;
    const fullId = `block-${crypto.randomUUID()}`;
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO schedule_blocks (id, tenant_id, professional_id, date, all_day, start_time, end_time)
        VALUES (?, 'studio-cut', 'professional-studio-1', ?, 0, '09:30', '10:00')
      `).bind(partialId, monday),
      env.DB.prepare(`
        INSERT INTO schedule_blocks (id, tenant_id, professional_id, date, all_day)
        VALUES (?, 'lumiere', NULL, ?, 1)
      `).bind(fullId, futureDate(2, 2))
    ]);
    cleanupStatements.push(env.DB.prepare("DELETE FROM schedule_blocks WHERE id IN (?, ?)").bind(partialId, fullId));

    const partial = await SELF.fetch(availabilityUrl("studio-cut", monday, "service-studio-cut", "professional-studio-1"));
    const full = await SELF.fetch(availabilityUrl("lumiere", futureDate(2, 2), "service-lumiere-skin", "professional-lumiere-1"));
    const partialSlots = await partial.json() as string[];

    expect(partialSlots).toContain("09:00");
    expect(partialSlots).not.toContain("09:30");
    expect(await full.json()).toEqual([]);
  });

  it("limita agenda profissional ao horário do negócio", async () => {
    const id = `schedule-${crypto.randomUUID()}`;
    await env.DB.prepare(`
      INSERT INTO professional_schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, active)
      VALUES (?, 'studio-cut', 'professional-studio-1', 1, '07:00', '08:00', 1)
    `).bind(id).run();
    cleanupStatements.push(env.DB.prepare("DELETE FROM professional_schedules WHERE id = ?").bind(id));

    const response = await SELF.fetch(availabilityUrl("studio-cut", futureDate(1, 3), "service-studio-cut", "professional-studio-1"));
    const slots = await response.json() as string[];
    expect(slots).not.toContain("07:00");
    expect(slots).toContain("09:00");
  });

  it("agendamento ativo ocupa e cancelado libera o horário", async () => {
    const date = futureDate(1, 4);
    const clientId = crypto.randomUUID();
    const created = await reserveAppointment(env.DB, {
      tenantId: "studio-cut",
      serviceId: "service-studio-cut",
      professionalId: "professional-studio-1",
      clientId,
      clientName: "Cliente Disponibilidade",
      clientPhone: `279${Date.now().toString().slice(-8)}`,
      appointmentDate: date,
      startTime: "09:00"
    });
    cleanupStatements.push(
      env.DB.prepare("DELETE FROM relationship_history_events WHERE appointment_id = ? OR client_id = ?").bind(created.id, clientId),
      env.DB.prepare("DELETE FROM appointments WHERE id = ?").bind(created.id),
      env.DB.prepare("DELETE FROM clients WHERE id = ?").bind(clientId)
    );

    const occupied = await SELF.fetch(availabilityUrl("studio-cut", date, "service-studio-cut", "professional-studio-1"));
    expect(await occupied.json()).not.toContain("09:00");

    await cancelAppointment(env.DB, "studio-cut", created.id);
    const released = await SELF.fetch(availabilityUrl("studio-cut", date, "service-studio-cut", "professional-studio-1"));
    expect(await released.json()).toContain("09:00");
  });

  it("rejeita associação e IDs pertencentes ao outro tenant sem revelar existência", async () => {
    const date = futureDate(1);
    const association = await SELF.fetch(availabilityUrl("studio-cut", date, "service-studio-beard", "professional-studio-1"));
    const crossTenant = await SELF.fetch(availabilityUrl("studio-cut", date, "service-lumiere-skin", "professional-lumiere-1"));

    expect(association.status).toBe(404);
    expect(crossTenant.status).toBe(404);
    expect(await crossTenant.json()).toEqual({ error: { code: "NOT_FOUND", message: "Recurso não encontrado" } });
  });

  it("aplica data passada, antecedência mínima e horizonte máximo", async () => {
    const fixedNow = new Date("2026-08-03T11:30:00.000Z");
    const base = (date: string) => new URLSearchParams({
      date,
      serviceId: "service-studio-cut",
      professionalId: "professional-studio-1"
    });

    const past = await calculateD1Availability(env.DB, "studio-cut", base("2026-07-27"), fixedNow);
    const advance = await calculateD1Availability(env.DB, "studio-cut", base("2026-08-03"), fixedNow);

    expect(past.slots).toEqual([]);
    expect(advance.slots).not.toContain("09:00");
    expect(advance.slots).toContain("09:30");
    await expect(calculateD1Availability(env.DB, "studio-cut", base("2027-01-04"), fixedNow)).rejects.toMatchObject({ status: 400 });
  });
});
