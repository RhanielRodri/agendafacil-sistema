import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { EMAIL_LUMIERE, adminCall, adminJson, adminPath, setupAdminAccess } from "./admin-harness";

const DAY = "2099-01-15";

interface AgendaPayload {
  date: string;
  filters: { professionalId: string | null; status: string | null };
  summary: { total: number; byStatus: Record<string, number> };
  items: { id: string; professionalId: string; status: string; clientPhone: string }[];
  blocks: { id: string; allDay: boolean }[];
  availability: { professionalId: string; openMinutes: number; bookedMinutes: number; working: boolean }[];
}

async function seedAppointments(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO clients (id, tenant_id, name, phone, normalized_phone, email, normalized_email)
      VALUES ('client-studio-1', 'studio-cut', 'Cliente Studio', '(27) 99999-0001', '27999990001', 'studio@cliente.invalid', 'studio@cliente.invalid')
    `),
    env.DB.prepare(`
      INSERT INTO clients (id, tenant_id, name, phone, normalized_phone)
      VALUES ('client-lumiere-1', 'lumiere', 'Cliente Lumière', '(27) 99999-0002', '27999990002')
    `),
    env.DB.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id, client_name, client_phone,
        appointment_date, start_time, end_time, status
      ) VALUES (
        'appointment-studio-1', 'studio-cut', 'service-studio-cut', 'professional-studio-1',
        'client-studio-1', 'Cliente Studio', '(27) 99999-0001', ?, '10:00', '10:30', 'PENDING'
      )
    `).bind(DAY),
    env.DB.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id, client_name, client_phone,
        appointment_date, start_time, end_time, status
      ) VALUES (
        'appointment-studio-2', 'studio-cut', 'service-studio-combo', 'professional-studio-1',
        'client-studio-1', 'Cliente Studio', '(27) 99999-0001', ?, '14:00', '15:00', 'CONFIRMED'
      )
    `).bind(DAY),
    env.DB.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id, client_name, client_phone,
        appointment_date, start_time, end_time, status
      ) VALUES (
        'appointment-lumiere-1', 'lumiere', 'service-lumiere-skin', 'professional-lumiere-1',
        'client-lumiere-1', 'Cliente Lumière', '(27) 99999-0002', ?, '11:00', '12:00', 'PENDING'
      )
    `).bind(DAY),
    env.DB.prepare(`
      INSERT INTO appointment_slots (tenant_id, professional_id, appointment_date, slot_time, appointment_id)
      VALUES ('studio-cut', 'professional-studio-1', ?, '10:00', 'appointment-studio-1')
    `).bind(DAY),
    env.DB.prepare(`
      INSERT INTO appointment_slots (tenant_id, professional_id, appointment_date, slot_time, appointment_id)
      VALUES ('studio-cut', 'professional-studio-1', ?, '14:00', 'appointment-studio-2')
    `).bind(DAY),
    env.DB.prepare(`
      INSERT INTO appointment_slots (tenant_id, professional_id, appointment_date, slot_time, appointment_id)
      VALUES ('studio-cut', 'professional-studio-1', ?, '14:30', 'appointment-studio-2')
    `).bind(DAY),
    env.DB.prepare(`
      INSERT INTO appointment_access_tokens (id, tenant_id, appointment_id, token_hash, expires_at)
      VALUES ('token-studio-2', 'studio-cut', 'appointment-studio-2', ?, '2099-12-31T00:00:00.000Z')
    `).bind("b".repeat(64))
  ]);
}

beforeAll(async () => {
  await setupAdminAccess();
  await seedAppointments();
});

describe("agenda e agendamentos administrativos", () => {
  it("lista somente agendamentos do tenant autorizado", async () => {
    const studio = await adminJson<{ id: string; tenantId: string }[]>(adminPath("studio-cut", "appointments"));
    const lumiere = await adminJson<{ id: string }[]>(adminPath("lumiere", "appointments"), { email: EMAIL_LUMIERE });
    expect(studio.map((row) => row.id)).toEqual(["appointment-studio-1", "appointment-studio-2"]);
    expect(studio.every((row) => row.tenantId === "studio-cut")).toBe(true);
    expect(lumiere.map((row) => row.id)).toEqual(["appointment-lumiere-1"]);
  });

  it("retorna 404 uniforme para ID de outro tenant", async () => {
    const detail = await adminCall(adminPath("studio-cut", "appointments/appointment-lumiere-1"));
    const history = await adminCall(adminPath("studio-cut", "appointments/appointment-lumiere-1/history"));
    expect([detail.status, history.status]).toEqual([404, 404]);
    expect(await detail.json()).toEqual({ error: { code: "NOT_FOUND", message: "Recurso não encontrado" } });
  });

  it("não permite mudar status de agendamento de outro tenant", async () => {
    const response = await adminCall(adminPath("studio-cut", "appointments/appointment-lumiere-1/status"), {
      method: "PATCH",
      body: { status: "CONFIRMED" }
    });
    const untouched = await env.DB.prepare(
      "SELECT status FROM appointments WHERE id = 'appointment-lumiere-1'"
    ).first<{ status: string }>();
    expect(response.status).toBe(404);
    expect(untouched?.status).toBe("PENDING");
  });

  it("ignora tenantId e demoId enviados no corpo e na query", async () => {
    const response = await adminCall(
      `${adminPath("studio-cut", "appointments/appointment-studio-1/status")}?tenantId=lumiere&demoId=lumiere`,
      {
        method: "PATCH",
        body: { status: "CONFIRMED", tenantId: "lumiere", demoId: "lumiere" },
        headers: { "X-Tenant": "lumiere" }
      }
    );
    const body = await response.json() as { tenantId: string; status: string };
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ tenantId: "studio-cut", status: "CONFIRMED" });
  });

  it("registra histórico da transição com a identidade do Access", async () => {
    const history = await adminJson<{ type: string; fromStatus: string; toStatus: string; actorId: string }[]>(
      adminPath("studio-cut", "appointments/appointment-studio-1/history")
    );
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      type: "CONFIRMED",
      fromStatus: "PENDING",
      toStatus: "CONFIRMED",
      actorType: "ADMIN",
      actorId: "admin-identity-studio"
    });
  });

  it("é idempotente quando o status enviado já é o atual", async () => {
    const response = await adminCall(adminPath("studio-cut", "appointments/appointment-studio-1/status"), {
      method: "PATCH",
      body: { status: "CONFIRMED" }
    });
    const history = await adminJson<unknown[]>(adminPath("studio-cut", "appointments/appointment-studio-1/history"));
    expect(response.status).toBe(200);
    expect(history).toHaveLength(1);
  });

  it("recusa transição não permitida e status inválido", async () => {
    const invalidStatus = await adminCall(adminPath("studio-cut", "appointments/appointment-studio-1/status"), {
      method: "PATCH",
      body: { status: "ARQUIVADO" }
    });
    await adminCall(adminPath("studio-cut", "appointments/appointment-studio-1/status"), {
      method: "PATCH",
      body: { status: "COMPLETED" }
    });
    const afterTerminal = await adminCall(adminPath("studio-cut", "appointments/appointment-studio-1/status"), {
      method: "PATCH",
      body: { status: "CONFIRMED" }
    });
    expect(invalidStatus.status).toBe(400);
    expect(afterTerminal.status).toBe(409);
  });

  it("cancela de forma atômica: libera slots, revoga token e registra histórico", async () => {
    const response = await adminCall(adminPath("studio-cut", "appointments/appointment-studio-2/status"), {
      method: "PATCH",
      body: { status: "CANCELLED", reason: "  Cliente  pediu   cancelamento  " }
    });
    const body = await response.json() as { status: string; cancellationReason: string };
    const [slots, token, history] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS total FROM appointment_slots WHERE appointment_id = 'appointment-studio-2'")
        .first<{ total: number }>(),
      env.DB.prepare("SELECT revoked_at FROM appointment_access_tokens WHERE id = 'token-studio-2'")
        .first<{ revoked_at: string | null }>(),
      env.DB.prepare("SELECT type, metadata_json FROM appointment_history_events WHERE appointment_id = 'appointment-studio-2'")
        .all<{ type: string; metadata_json: string }>()
    ]);
    expect(body).toMatchObject({ status: "CANCELLED", cancellationReason: "Cliente pediu cancelamento" });
    expect(slots?.total).toBe(0);
    expect(token?.revoked_at).not.toBeNull();
    expect(history.results).toHaveLength(1);
    expect(JSON.parse(history.results[0].metadata_json)).toEqual({ reason: "Cliente pediu cancelamento" });
  });

  it("não libera slots de outro agendamento ao cancelar", async () => {
    const remaining = await env.DB.prepare(
      "SELECT appointment_id FROM appointment_slots WHERE tenant_id = 'studio-cut'"
    ).all<{ appointment_id: string }>();
    expect(remaining.results.map((row) => row.appointment_id)).toEqual(["appointment-studio-1"]);
  });

  it("resume o dia com indicadores, pipeline e ocupação do tenant", async () => {
    const overview = await adminJson<{
      tenantId: string;
      date: string;
      day: { total: number; byStatus: Record<string, number> };
      attention: Record<string, unknown>;
      occupancy: { professionalId: string; total: number }[];
    }>(`${adminPath("studio-cut", "overview")}?date=${DAY}`);

    expect(overview.tenantId).toBe("studio-cut");
    expect(overview.date).toBe(DAY);
    expect(overview.day.total).toBe(2);
    expect(overview.day.byStatus.CANCELLED).toBe(1);
    expect(overview.attention).toHaveProperty("overdueFollowUps", 0);
    expect(overview.occupancy.find((row) => row.professionalId === "professional-studio-1")?.total).toBe(2);
  });

  it("filtra a agenda do dia por status e por profissional sem vazar outro tenant", async () => {
    const all = await adminJson<AgendaPayload>(`${adminPath("studio-cut", "agenda")}?date=${DAY}`);
    const filtered = await adminJson<AgendaPayload>(
      `${adminPath("studio-cut", "agenda")}?date=${DAY}&status=CANCELLED&professionalId=professional-studio-1`
    );
    const other = await adminJson<AgendaPayload>(
      `${adminPath("studio-cut", "agenda")}?date=${DAY}&professionalId=professional-studio-2`
    );

    expect(all.summary.total).toBe(2);
    expect(all.items.map((item) => item.id)).toEqual(["appointment-studio-1", "appointment-studio-2"]);
    expect(all.blocks.map((block) => block.id)).toContain("block-studio-partial");
    expect(filtered.items.map((item) => item.id)).toEqual(["appointment-studio-2"]);
    expect(filtered.filters).toEqual({ professionalId: "professional-studio-1", status: "CANCELLED" });
    expect(other.items).toHaveLength(0);
  });

  it("recusa data, status e profissional inválidos na agenda", async () => {
    const badDate = await adminCall(`${adminPath("studio-cut", "agenda")}?date=15-01-2099`);
    const badStatus = await adminCall(`${adminPath("studio-cut", "agenda")}?status=QUALQUER`);
    const badProfessional = await adminCall(`${adminPath("studio-cut", "agenda")}?professionalId=${encodeURIComponent("../lumiere")}`);
    expect([badDate.status, badStatus.status, badProfessional.status]).toEqual([400, 400, 400]);
  });
});
