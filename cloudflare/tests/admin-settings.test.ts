import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { EMAIL_LUMIERE, adminCall, adminJson, adminPath, setupAdminAccess } from "./admin-harness";

interface SettingsPayload {
  tenantId: string;
  publicName: string | null;
  timezone: string;
  slotDurationMinutes: number;
  bookingEnabled: boolean;
}

interface MetricsPayload {
  tenantId: string;
  period: { key: string; from: string; to: string; days: number };
  appointments: { total: number; byStatus: Record<string, number>; attendanceRate: number | null };
  capacity: { openMinutes: number; byProfessional: { professionalId: string }[] };
  leads: { created: number; bySource: { source: string }[] };
  followUps: { created: number };
  clients: { created: number; returnWindowDays: number };
}

beforeAll(async () => {
  await setupAdminAccess();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO clients (id, tenant_id, name, phone, normalized_phone, created_at)
      VALUES ('met-client', 'studio-cut', 'Cliente Métrica', '(27) 95555-1000', '27955551000', '2026-07-20T10:00:00.000Z')
    `),
    env.DB.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id, client_name, client_phone,
        appointment_date, start_time, end_time, status
      ) VALUES (
        'met-appointment', 'studio-cut', 'service-studio-cut', 'professional-studio-1',
        'met-client', 'Cliente Métrica', '(27) 95555-1000', '2026-07-20', '10:00', '10:30', 'COMPLETED'
      )
    `)
  ]);
});

describe("configurações administrativas", () => {
  it("devolve os defaults do tenant quando ainda não há ajuste próprio", async () => {
    const settings = await adminJson<SettingsPayload>(adminPath("studio-cut", "settings"));
    expect(settings).toMatchObject({
      tenantId: "studio-cut",
      timezone: "America/Sao_Paulo",
      slotDurationMinutes: 30,
      bookingEnabled: true
    });
  });

  it("recusa timezone fora da lista, grade inválida, HTML e telefone inconsistente", async () => {
    const timezone = await adminCall(adminPath("studio-cut", "settings"), {
      method: "PATCH",
      body: { timezone: "Europe/Lisbon" }
    });
    const slot = await adminCall(adminPath("studio-cut", "settings"), {
      method: "PATCH",
      body: { slotDurationMinutes: 7 }
    });
    const markup = await adminCall(adminPath("studio-cut", "settings"), {
      method: "PATCH",
      body: { cancellationPolicy: "<b>Sem cancelamento</b>" }
    });
    const phone = await adminCall(adminPath("studio-cut", "settings"), {
      method: "PATCH",
      body: { publicPhone: "123" }
    });
    const empty = await adminCall(adminPath("studio-cut", "settings"), { method: "PATCH", body: {} });

    expect([timezone.status, slot.status, markup.status, phone.status, empty.status])
      .toEqual([400, 400, 400, 400, 400]);
  });

  it("aplica campos válidos sem tocar no outro tenant", async () => {
    const updated = await adminJson<SettingsPayload>(adminPath("studio-cut", "settings"), {
      method: "PATCH",
      body: { publicName: "Studio Cut Centro", slotDurationMinutes: 15, bookingEnabled: false }
    });
    const lumiere = await adminJson<SettingsPayload>(adminPath("lumiere", "settings"), { email: EMAIL_LUMIERE });

    expect(updated).toMatchObject({
      publicName: "Studio Cut Centro",
      slotDurationMinutes: 15,
      bookingEnabled: false
    });
    expect(lumiere).toMatchObject({ tenantId: "lumiere", slotDurationMinutes: 30, bookingEnabled: true });
  });

  it("ignora tenantId enviado no corpo da configuração", async () => {
    await adminCall(adminPath("studio-cut", "settings"), {
      method: "PATCH",
      body: { tenantId: "lumiere", addressLine: "Rua Teste, 100" }
    });
    const lumiere = await env.DB.prepare("SELECT address_line FROM tenant_settings WHERE tenant_id = 'lumiere'")
      .first<{ address_line: string | null }>();
    expect(lumiere?.address_line).toBeNull();
  });
});

describe("indicadores administrativos", () => {
  it("recusa período inválido e janela personalizada acima do limite", async () => {
    const unknown = await adminCall(`${adminPath("studio-cut", "metrics")}?period=90d`);
    const inverted = await adminCall(`${adminPath("studio-cut", "metrics")}?period=custom&from=2026-07-20&to=2026-07-01`);
    const tooLong = await adminCall(`${adminPath("studio-cut", "metrics")}?period=custom&from=2026-01-01&to=2026-07-01`);
    expect([unknown.status, inverted.status, tooLong.status]).toEqual([400, 400, 400]);
  });

  it("consolida agendamentos, capacidade, leads, follow-ups e clientes do tenant", async () => {
    const metrics = await adminJson<MetricsPayload>(
      `${adminPath("studio-cut", "metrics")}?period=custom&from=2026-07-01&to=2026-07-22`
    );

    expect(metrics.tenantId).toBe("studio-cut");
    expect(metrics.period).toMatchObject({ key: "custom", from: "2026-07-01", to: "2026-07-22", days: 22 });
    expect(metrics.appointments.total).toBe(1);
    expect(metrics.appointments.byStatus.COMPLETED).toBe(1);
    expect(metrics.appointments.attendanceRate).toBe(100);
    expect(metrics.capacity.byProfessional.map((row) => row.professionalId))
      .toEqual(["professional-studio-1", "professional-studio-2"]);
    expect(metrics.capacity.openMinutes).toBeGreaterThan(0);
    expect(metrics.leads.bySource).toHaveLength(6);
    expect(metrics.clients).toMatchObject({ created: 1, returnWindowDays: 90 });
  });

  it("não mistura indicadores entre verticais", async () => {
    const lumiere = await adminJson<MetricsPayload>(
      `${adminPath("lumiere", "metrics")}?period=custom&from=2026-07-01&to=2026-07-22`,
      { email: EMAIL_LUMIERE }
    );
    expect(lumiere.tenantId).toBe("lumiere");
    expect(lumiere.appointments.total).toBe(0);
    expect(lumiere.clients.created).toBe(0);
  });
});
