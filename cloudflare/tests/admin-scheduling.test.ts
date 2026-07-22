import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { EMAIL_LUMIERE, adminCall, adminJson, adminPath, setupAdminAccess } from "./admin-harness";

const DAY = "2099-01-15";
const WEEKDAY = 4;

interface ConflictBody {
  error: { code: string; conflicts: { appointmentId: string }[] };
}

async function appointmentSnapshot() {
  return env.DB.prepare(
    "SELECT status, appointment_date, start_time, professional_id FROM appointments WHERE id = 'sch-appointment'"
  ).first<{ status: string; appointment_date: string; start_time: string; professional_id: string }>();
}

beforeAll(async () => {
  await setupAdminAccess();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO professional_schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, active)
      VALUES ('sch-studio-1-thu', 'studio-cut', 'professional-studio-1', ?, '09:00', '18:00', 1)
    `).bind(WEEKDAY),
    env.DB.prepare(`
      INSERT INTO clients (id, tenant_id, name, phone, normalized_phone)
      VALUES ('sch-client', 'studio-cut', 'Cliente Agenda', '(27) 96666-1000', '27966661000')
    `),
    env.DB.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id, client_name, client_phone,
        appointment_date, start_time, end_time, status
      ) VALUES (
        'sch-appointment', 'studio-cut', 'service-studio-cut', 'professional-studio-1',
        'sch-client', 'Cliente Agenda', '(27) 96666-1000', ?, '10:00', '10:30', 'CONFIRMED'
      )
    `).bind(DAY)
  ]);
});

describe("horário de funcionamento", () => {
  it("devolve a semana inteira com dias ausentes fechados", async () => {
    const days = await adminJson<{ dayOfWeek: number; isOpen: boolean }[]>(
      adminPath("studio-cut", "business-hours")
    );
    expect(days).toHaveLength(7);
    expect(days.map((day) => day.dayOfWeek)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(days.find((day) => day.dayOfWeek === 0)?.isOpen).toBe(false);
  });

  it("prévia de fechamento não grava e a confirmação preserva o agendamento", async () => {
    const preview = await adminCall(adminPath("studio-cut", "business-hours"), {
      method: "PUT",
      body: { days: [{ dayOfWeek: WEEKDAY, isOpen: false, openTime: "00:00", closeTime: "00:00" }] }
    });
    const body = await preview.json() as ConflictBody;
    const untouched = await env.DB.prepare(
      "SELECT is_open FROM business_hours WHERE tenant_id = 'studio-cut' AND day_of_week = ?"
    ).bind(WEEKDAY).first<{ is_open: number }>();

    const applied = await adminJson<{ days: { dayOfWeek: number; isOpen: boolean }[]; appliedImpact: unknown[] }>(
      adminPath("studio-cut", "business-hours"),
      {
        method: "PUT",
        body: { confirm: true, days: [{ dayOfWeek: WEEKDAY, isOpen: false, openTime: "00:00", closeTime: "00:00" }] }
      }
    );

    expect(preview.status).toBe(409);
    expect(body.error.conflicts.map((row) => row.appointmentId)).toEqual(["sch-appointment"]);
    expect(untouched?.is_open).toBe(1);
    expect(applied.appliedImpact).toHaveLength(1);
    expect(applied.days.find((day) => day.dayOfWeek === WEEKDAY)?.isOpen).toBe(false);
    expect(await appointmentSnapshot()).toMatchObject({ status: "CONFIRMED", start_time: "10:00" });
  });

  it("recusa dia repetido, horário inválido e abertura maior que fechamento", async () => {
    const repeated = await adminCall(adminPath("studio-cut", "business-hours"), {
      method: "PUT",
      body: { days: [{ dayOfWeek: 1, openTime: "09:00", closeTime: "18:00" }, { dayOfWeek: 1, openTime: "09:00", closeTime: "18:00" }] }
    });
    const badTime = await adminCall(adminPath("studio-cut", "business-hours"), {
      method: "PUT",
      body: { days: [{ dayOfWeek: 1, openTime: "9h", closeTime: "18:00" }] }
    });
    const inverted = await adminCall(adminPath("studio-cut", "business-hours"), {
      method: "PUT",
      body: { days: [{ dayOfWeek: 1, openTime: "19:00", closeTime: "18:00" }] }
    });
    expect([repeated.status, badTime.status, inverted.status]).toEqual([400, 400, 400]);
  });
});

describe("agendas profissionais", () => {
  it("recusa janela sobreposta e profissional de outro tenant", async () => {
    const overlap = await adminCall(adminPath("studio-cut", "professional-schedules"), {
      method: "POST",
      body: { professionalId: "professional-studio-1", dayOfWeek: WEEKDAY, startTime: "10:00", endTime: "12:00" }
    });
    const foreign = await adminCall(adminPath("studio-cut", "professional-schedules"), {
      method: "POST",
      body: { professionalId: "professional-lumiere-1", dayOfWeek: 2, startTime: "10:00", endTime: "12:00" }
    });
    expect([overlap.status, foreign.status]).toEqual([409, 404]);
  });

  it("cria janela válida e filtra a listagem por profissional", async () => {
    const created = await adminJson<{ id: string; professional: { name: string } }>(
      adminPath("studio-cut", "professional-schedules"),
      { method: "POST", body: { professionalId: "professional-studio-2", dayOfWeek: WEEKDAY, startTime: "09:00", endTime: "13:00" } }
    );
    const filtered = await adminJson<{ id: string }[]>(
      `${adminPath("studio-cut", "professional-schedules")}?professionalId=professional-studio-2`
    );
    expect(created.professional.name).toBe("Barbeiro Studio 2");
    expect(filtered.map((row) => row.id)).toContain(created.id);
  });

  it("exige confirmação para remover a janela que cobre um agendamento", async () => {
    const preview = await adminCall(adminPath("studio-cut", "professional-schedules/sch-studio-1-thu"), {
      method: "DELETE"
    });
    const stillThere = await env.DB.prepare("SELECT id FROM professional_schedules WHERE id = 'sch-studio-1-thu'")
      .first<{ id: string }>();
    expect(preview.status).toBe(409);
    expect(stillThere?.id).toBe("sch-studio-1-thu");
  });

  it("copia a agenda substituindo os dias alvo e relatando impacto", async () => {
    const copied = await adminJson<{
      professionalId: string;
      copiedDays: number[];
      schedules: { dayOfWeek: number }[];
      appliedImpact: unknown[];
    }>(adminPath("studio-cut", "professional-schedules/copy"), {
      method: "POST",
      body: {
        targetProfessionalId: "professional-studio-2",
        source: "day",
        fromProfessionalId: "professional-studio-1",
        fromDayOfWeek: WEEKDAY,
        targetDays: [5],
        confirm: true
      }
    });
    const saved = await env.DB.prepare(
      "SELECT day_of_week, start_time FROM professional_schedules WHERE tenant_id = 'studio-cut' AND professional_id = 'professional-studio-2' AND day_of_week = 5"
    ).first<{ day_of_week: number; start_time: string }>();

    expect(copied.professionalId).toBe("professional-studio-2");
    expect(copied.copiedDays).toEqual([5]);
    expect(saved).toMatchObject({ day_of_week: 5, start_time: "09:00" });
    expect(await appointmentSnapshot()).toMatchObject({ professional_id: "professional-studio-1" });
  });

  it("recusa origem sem agenda configurada", async () => {
    const response = await adminCall(adminPath("lumiere", "professional-schedules/copy"), {
      method: "POST",
      email: EMAIL_LUMIERE,
      body: {
        targetProfessionalId: "professional-lumiere-1",
        source: "day",
        fromProfessionalId: "professional-lumiere-2",
        fromDayOfWeek: 0
      }
    });
    expect(response.status).toBe(400);
  });
});

describe("bloqueios", () => {
  it("prévia do bloqueio não grava e a confirmação preserva o agendamento", async () => {
    const preview = await adminCall(adminPath("studio-cut", "schedule-blocks"), {
      method: "POST",
      body: { date: DAY, allDay: true, reason: "Manutenção" }
    });
    const before = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM schedule_blocks WHERE tenant_id = 'studio-cut' AND date = ?"
    ).bind(DAY).first<{ total: number }>();

    const created = await adminJson<{ id: string; allDay: boolean; appliedImpact: unknown[] }>(
      adminPath("studio-cut", "schedule-blocks"),
      { method: "POST", body: { date: DAY, allDay: true, reason: "Manutenção", confirm: true } }
    );

    expect(preview.status).toBe(409);
    expect(before?.total).toBe(2);
    expect(created.allDay).toBe(true);
    expect(created.appliedImpact).toHaveLength(1);
    expect(await appointmentSnapshot()).toMatchObject({ status: "CONFIRMED", start_time: "10:00" });
  });

  it("lista por período e recusa período inválido", async () => {
    const listed = await adminJson<{ id: string }[]>(
      `${adminPath("studio-cut", "schedule-blocks")}?from=${DAY}&to=${DAY}`
    );
    const badPeriod = await adminCall(`${adminPath("studio-cut", "schedule-blocks")}?from=${DAY}&to=2098-01-01`);
    expect(listed.length).toBeGreaterThan(0);
    expect(badPeriod.status).toBe(400);
  });

  it("não alcança bloqueio de outro tenant", async () => {
    const update = await adminCall(adminPath("studio-cut", "schedule-blocks/block-lumiere-full"), {
      method: "PATCH",
      body: { reason: "Sequestrado" }
    });
    const remove = await adminCall(adminPath("studio-cut", "schedule-blocks/block-lumiere-full"), {
      method: "DELETE"
    });
    const untouched = await env.DB.prepare("SELECT reason FROM schedule_blocks WHERE id = 'block-lumiere-full'")
      .first<{ reason: string }>();

    expect([update.status, remove.status]).toEqual([404, 404]);
    expect(untouched?.reason).toBe("Bloqueio integral de demonstração");
  });

  it("remove bloqueio do próprio tenant", async () => {
    const removed = await adminCall(adminPath("studio-cut", "schedule-blocks/block-studio-professional"), {
      method: "DELETE"
    });
    const gone = await env.DB.prepare("SELECT id FROM schedule_blocks WHERE id = 'block-studio-professional'")
      .first<{ id: string }>();
    expect(removed.status).toBe(204);
    expect(gone).toBeNull();
  });
});
