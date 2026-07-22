import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { adminCall, adminJson, adminPath, setupAdminAccess } from "./admin-harness";

const DAY = "2099-01-15";

interface ImpactResponse {
  active?: boolean;
  duration?: number;
  appliedImpact: { appointmentId: string; date: string; status: string }[];
}

interface ConflictBody {
  error: { code: string; message: string; conflicts: { appointmentId: string }[] };
}

beforeAll(async () => {
  await setupAdminAccess();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO clients (id, tenant_id, name, phone, normalized_phone)
      VALUES ('cat-client', 'studio-cut', 'Cliente Catálogo', '(27) 97777-1000', '27977771000')
    `),
    env.DB.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id, client_name, client_phone,
        appointment_date, start_time, end_time, status
      ) VALUES (
        'cat-appointment', 'studio-cut', 'service-studio-cut', 'professional-studio-1',
        'cat-client', 'Cliente Catálogo', '(27) 97777-1000', ?, '10:00', '10:30', 'CONFIRMED'
      )
    `).bind(DAY)
  ]);
});

describe("serviços administrativos", () => {
  it("lista com dependências agregadas e pagina dentro do tenant", async () => {
    const page = await adminJson<{
      items: { id: string; appointmentCount: number; upcomingAppointments: number; professionalCount: number }[];
      pagination: { total: number };
    }>(adminPath("studio-cut", "services"));
    const service = page.items.find((row) => row.id === "service-studio-cut");
    expect(page.pagination.total).toBe(3);
    expect(service).toMatchObject({ appointmentCount: 1, upcomingAppointments: 1, professionalCount: 1 });
  });

  it("recusa serviço de outro tenant em detalhe estrutural", async () => {
    const dependencies = await adminCall(adminPath("studio-cut", "services/service-lumiere-skin/dependencies"));
    const update = await adminCall(adminPath("studio-cut", "services/service-lumiere-skin"), {
      method: "PATCH",
      body: { name: "Renomeado" }
    });
    expect([dependencies.status, update.status]).toEqual([404, 404]);
  });

  it("prévia de inativação não grava e devolve os conflitos", async () => {
    const response = await adminCall(adminPath("studio-cut", "services/service-studio-cut/active"), {
      method: "PATCH",
      body: { active: false }
    });
    const body = await response.json() as ConflictBody;
    const service = await env.DB.prepare("SELECT active FROM services WHERE id = 'service-studio-cut'")
      .first<{ active: number }>();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe("CONFLICT_REQUIRES_CONFIRMATION");
    expect(body.error.conflicts.map((row) => row.appointmentId)).toEqual(["cat-appointment"]);
    expect(service?.active).toBe(1);
  });

  it("confirmação recalcula o impacto no estado atual e preserva o agendamento", async () => {
    const applied = await adminJson<ImpactResponse>(adminPath("studio-cut", "services/service-studio-cut/active"), {
      method: "PATCH",
      body: { active: false, confirm: true }
    });
    const [service, appointment] = await Promise.all([
      env.DB.prepare("SELECT active FROM services WHERE id = 'service-studio-cut'").first<{ active: number }>(),
      env.DB.prepare("SELECT status, appointment_date, start_time FROM appointments WHERE id = 'cat-appointment'")
        .first<{ status: string; appointment_date: string; start_time: string }>()
    ]);

    expect(applied.active).toBe(false);
    expect(applied.appliedImpact.map((row) => row.appointmentId)).toEqual(["cat-appointment"]);
    expect(service?.active).toBe(0);
    expect(appointment).toMatchObject({ status: "CONFIRMED", appointment_date: DAY, start_time: "10:00" });
  });

  it("ignora appliedImpact enviado pelo cliente", async () => {
    const response = await adminCall(adminPath("studio-cut", "services/service-studio-cut"), {
      method: "PATCH",
      body: { duration: 45, appliedImpact: [] }
    });
    const forged = await response.json() as ConflictBody;
    const applied = await adminJson<ImpactResponse>(adminPath("studio-cut", "services/service-studio-cut"), {
      method: "PATCH",
      body: { duration: 45, confirm: true, appliedImpact: [] }
    });

    expect(response.status).toBe(409);
    expect(forged.error.conflicts).toHaveLength(1);
    expect(applied.duration).toBe(45);
    expect(applied.appliedImpact).toHaveLength(1);
  });

  it("cria, valida e reordena serviços do tenant", async () => {
    const created = await adminJson<{ id: string; price: number | null }>(adminPath("studio-cut", "services"), {
      method: "POST",
      body: { name: "Hidratação", description: "Teste", duration: 30, price: 0 }
    });
    const duplicate = await adminCall(adminPath("studio-cut", "services"), {
      method: "POST",
      body: { name: "Hidratação", duration: 30 }
    });
    const badDuration = await adminCall(adminPath("studio-cut", "services"), {
      method: "POST",
      body: { name: "Inválido", duration: 3 }
    });
    const crossTenantOrder = await adminCall(adminPath("studio-cut", "services/order"), {
      method: "PATCH",
      body: { order: [created.id, "service-lumiere-skin"] }
    });
    const reordered = await adminJson<{ id: string }[]>(adminPath("studio-cut", "services/order"), {
      method: "PATCH",
      body: { order: [created.id, "service-studio-cut"] }
    });

    expect(created.price).toBe(0);
    expect(duplicate.status).toBe(409);
    expect(badDuration.status).toBe(400);
    expect(crossTenantOrder.status).toBe(404);
    expect(reordered[0].id).toBe(created.id);
  });
});

describe("profissionais e associações", () => {
  it("lista com serviços, agenda semanal e dependências", async () => {
    const page = await adminJson<{
      items: { id: string; serviceIds: string[]; weeklyMinutes: number; upcomingAppointments: number }[];
    }>(adminPath("studio-cut", "professionals"));
    const professional = page.items.find((row) => row.id === "professional-studio-1");
    expect(professional?.serviceIds.sort()).toEqual(["service-studio-combo", "service-studio-cut"]);
    expect(professional?.weeklyMinutes).toBeGreaterThan(0);
    expect(professional?.upcomingAppointments).toBe(1);
  });

  it("recusa associação com serviço de outro tenant sem alterar as atuais", async () => {
    const response = await adminCall(adminPath("studio-cut", "professionals/professional-studio-1/services"), {
      method: "PUT",
      body: { serviceIds: ["service-studio-cut", "service-lumiere-skin"] }
    });
    const links = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM professional_services WHERE tenant_id = 'studio-cut' AND professional_id = 'professional-studio-1'"
    ).first<{ total: number }>();
    expect(response.status).toBe(404);
    expect(links?.total).toBe(2);
  });

  it("substitui as associações de forma atômica", async () => {
    const result = await adminJson<{ services: { id: string }[] }>(
      adminPath("studio-cut", "professionals/professional-studio-1/services"),
      { method: "PUT", body: { serviceIds: ["service-studio-beard"] } }
    );
    const links = await env.DB.prepare(
      "SELECT service_id FROM professional_services WHERE tenant_id = 'studio-cut' AND professional_id = 'professional-studio-1'"
    ).all<{ service_id: string }>();
    expect(result.services.map((row) => row.id)).toEqual(["service-studio-beard"]);
    expect(links.results.map((row) => row.service_id)).toEqual(["service-studio-beard"]);
  });

  it("exige confirmação para inativar profissional com agenda futura", async () => {
    const preview = await adminCall(adminPath("studio-cut", "professionals/professional-studio-1/active"), {
      method: "PATCH",
      body: { active: false }
    });
    const applied = await adminJson<ImpactResponse>(
      adminPath("studio-cut", "professionals/professional-studio-1/active"),
      { method: "PATCH", body: { active: false, confirm: true } }
    );
    const appointment = await env.DB.prepare("SELECT status FROM appointments WHERE id = 'cat-appointment'")
      .first<{ status: string }>();

    expect(preview.status).toBe(409);
    expect(applied.active).toBe(false);
    expect(applied.appliedImpact).toHaveLength(1);
    expect(appointment?.status).toBe("CONFIRMED");
  });

  it("expõe dependências sem apagar histórico", async () => {
    const dependencies = await adminJson<{
      professionalId: string;
      totalAppointments: number;
      removable: boolean;
      conflicts: unknown[];
    }>(adminPath("studio-cut", "professionals/professional-studio-1/dependencies"));
    expect(dependencies).toMatchObject({
      professionalId: "professional-studio-1",
      totalAppointments: 1,
      removable: false
    });
    expect(dependencies.conflicts).toHaveLength(1);
  });
});
