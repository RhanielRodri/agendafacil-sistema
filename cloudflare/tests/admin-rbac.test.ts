import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  EMAIL_STUDIO,
  IDENTITY_STUDIO,
  adminCall,
  adminPath,
  setupAdminAccess
} from "./admin-harness";

const PROFESSIONAL_EMAIL = "professional-rbac@access.invalid";
const MANAGER_EMAIL = "manager-rbac@access.invalid";

interface TeamMember {
  id: string;
  role: string;
  permissions: string[];
  professionalId: string | null;
  active: boolean;
}

let professionalIdentityId = "";
let managerIdentityId = "";

beforeAll(async () => {
  await setupAdminAccess();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO clients (id, tenant_id, name, phone, normalized_phone)
      VALUES ('rbac-client-own', 'studio-cut', 'Cliente Próprio', '27999111111', '27999111111')
    `),
    env.DB.prepare(`
      INSERT INTO clients (id, tenant_id, name, phone, normalized_phone)
      VALUES ('rbac-client-other', 'studio-cut', 'Cliente Alheio', '27999222222', '27999222222')
    `),
    env.DB.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id,
        client_name, client_phone, appointment_date, start_time, end_time, status
      ) VALUES (
        'rbac-appointment-own', 'studio-cut', 'service-studio-combo', 'professional-studio-1',
        'rbac-client-own', 'Cliente Próprio', '27999111111', '2098-08-18', '09:00', '10:00', 'CONFIRMED'
      )
    `),
    env.DB.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id,
        client_name, client_phone, appointment_date, start_time, end_time, status
      ) VALUES (
        'rbac-appointment-other', 'studio-cut', 'service-studio-combo', 'professional-studio-2',
        'rbac-client-other', 'Cliente Alheio', '27999222222', '2098-08-18', '10:00', '11:00', 'CONFIRMED'
      )
    `)
  ]);

  const professional = await adminCall(adminPath("studio-cut", "team"), {
    method: "POST",
    body: {
      email: PROFESSIONAL_EMAIL,
      name: "Profissional RBAC",
      role: "professional",
      professionalId: "professional-studio-1",
      permissions: ["clients"]
    }
  });
  if (professional.status !== 201) throw new Error("Falha ao criar profissional RBAC");
  professionalIdentityId = (await professional.json() as TeamMember).id;

  const manager = await adminCall(adminPath("studio-cut", "team"), {
    method: "POST",
    body: {
      email: MANAGER_EMAIL,
      name: "Gestor RBAC",
      role: "manager",
      permissions: ["clients"]
    }
  });
  if (manager.status !== 201) throw new Error("Falha ao criar gestor RBAC");
  managerIdentityId = (await manager.json() as TeamMember).id;
});

describe("migration e contexto RBAC", () => {
  it("migra a role administrativa para owner preservando o valor legado", async () => {
    const row = await env.DB.prepare(`
      SELECT legacy_role, role, professional_id
      FROM admin_memberships
      WHERE tenant_id = 'studio-cut' AND identity_id = ?
    `).bind(IDENTITY_STUDIO).first<{
      legacy_role: string;
      role: string;
      professional_id: string | null;
    }>();

    expect(row).toEqual({ legacy_role: "ADMIN", role: "owner", professional_id: null });
  });

  it("expõe role, permissões e vínculo no contexto", async () => {
    const response = await adminCall(adminPath("studio-cut", "context"), { email: PROFESSIONAL_EMAIL });
    const body = await response.json() as {
      role: string;
      permissions: string[];
      professionalId: string | null;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      role: "professional",
      permissions: ["agenda"],
      professionalId: "professional-studio-1"
    });
  });

  it("atualiza last_access_at no máximo uma vez por hora", async () => {
    await env.DB.prepare(`
      UPDATE admin_memberships SET last_access_at = NULL
      WHERE tenant_id = 'studio-cut' AND identity_id = ?
    `).bind(IDENTITY_STUDIO).run();

    await adminCall(adminPath("studio-cut", "context"), { email: EMAIL_STUDIO });
    const first = await env.DB.prepare(`
      SELECT last_access_at FROM admin_memberships
      WHERE tenant_id = 'studio-cut' AND identity_id = ?
    `).bind(IDENTITY_STUDIO).first<{ last_access_at: string | null }>();
    await adminCall(adminPath("studio-cut", "context"), { email: EMAIL_STUDIO });
    const second = await env.DB.prepare(`
      SELECT last_access_at FROM admin_memberships
      WHERE tenant_id = 'studio-cut' AND identity_id = ?
    `).bind(IDENTITY_STUDIO).first<{ last_access_at: string | null }>();

    expect(first?.last_access_at).toMatch(/Z$/);
    expect(second?.last_access_at).toBe(first?.last_access_at);
  });
});

describe("permissões por módulo", () => {
  it("permite somente os módulos concedidos ao manager", async () => {
    const clients = await adminCall(adminPath("studio-cut", "clients"), { email: MANAGER_EMAIL });
    const services = await adminCall(adminPath("studio-cut", "services"), { email: MANAGER_EMAIL });
    const team = await adminCall(adminPath("studio-cut", "team"), { email: MANAGER_EMAIL });

    expect([clients.status, services.status, team.status]).toEqual([200, 403, 403]);
  });

  it("altera permissões e aplica a mudança no backend", async () => {
    const updated = await adminCall(adminPath("studio-cut", `team/${managerIdentityId}`), {
      method: "PATCH",
      body: { permissions: ["services"] }
    });
    const clients = await adminCall(adminPath("studio-cut", "clients"), { email: MANAGER_EMAIL });
    const services = await adminCall(adminPath("studio-cut", "services"), { email: MANAGER_EMAIL });

    expect(updated.status).toBe(200);
    expect((await updated.json() as TeamMember).permissions).toEqual(["services"]);
    expect([clients.status, services.status]).toEqual([403, 200]);
  });

  it("nega outro tenant mesmo com JWT e membership válidos em um tenant", async () => {
    const response = await adminCall(adminPath("lumiere", "context"), { email: MANAGER_EMAIL });
    expect(response.status).toBe(403);
  });
});

describe("agenda própria da role professional", () => {
  it("lista somente os próprios agendamentos e força o próprio filtro", async () => {
    const appointments = await adminCall(adminPath("studio-cut", "appointments"), {
      email: PROFESSIONAL_EMAIL
    });
    const agenda = await adminCall(`${adminPath("studio-cut", "agenda")}?date=2098-08-18`, {
      email: PROFESSIONAL_EMAIL
    });
    const otherFilter = await adminCall(
      `${adminPath("studio-cut", "agenda")}?date=2098-08-18&professionalId=professional-studio-2`,
      { email: PROFESSIONAL_EMAIL }
    );
    const appointmentItems = await appointments.json() as { id: string }[];
    const agendaBody = await agenda.json() as { items: { id: string }[] };

    expect(appointmentItems.map((item) => item.id)).toEqual(["rbac-appointment-own"]);
    expect(agendaBody.items.map((item) => item.id)).toEqual(["rbac-appointment-own"]);
    expect(otherFilter.status).toBe(404);
  });

  it("nega detalhe e alteração de agendamento de outro profissional", async () => {
    const detail = await adminCall(adminPath("studio-cut", "appointments/rbac-appointment-other"), {
      email: PROFESSIONAL_EMAIL
    });
    const update = await adminCall(
      adminPath("studio-cut", "appointments/rbac-appointment-other/status"),
      {
        method: "PATCH",
        email: PROFESSIONAL_EMAIL,
        body: { status: "COMPLETED" }
      }
    );

    expect([detail.status, update.status]).toEqual([404, 404]);
  });

  it("restringe CSV e bloqueia módulos fora da agenda", async () => {
    const csv = await adminCall(adminPath("studio-cut", "appointments/export.csv"), {
      email: PROFESSIONAL_EMAIL
    });
    const clients = await adminCall(adminPath("studio-cut", "clients"), {
      email: PROFESSIONAL_EMAIL
    });
    const overview = await adminCall(adminPath("studio-cut", "overview"), {
      email: PROFESSIONAL_EMAIL
    });
    const identities = await adminCall(adminPath("studio-cut", "identities"), {
      email: PROFESSIONAL_EMAIL
    });
    const text = await csv.text();

    expect(text).toContain("rbac-appointment-own");
    expect(text).not.toContain("rbac-appointment-other");
    expect([clients.status, overview.status, identities.status]).toEqual([403, 403, 403]);
  });

  it("impede dois acessos vinculados ao mesmo profissional", async () => {
    const duplicate = await adminCall(adminPath("studio-cut", "team"), {
      method: "POST",
      body: {
        email: "professional-duplicate@access.invalid",
        role: "professional",
        professionalId: "professional-studio-1"
      }
    });

    expect(duplicate.status).toBe(409);
  });

  it("impede vínculo profissional cross-tenant", async () => {
    const response = await adminCall(adminPath("studio-cut", "team"), {
      method: "POST",
      body: {
        email: "professional-cross-tenant@access.invalid",
        role: "professional",
        professionalId: "professional-lumiere-1"
      }
    });

    expect(response.status).toBe(404);
  });
});

describe("owners e auditoria", () => {
  it("não permite rebaixar nem desativar o último owner", async () => {
    const demote = await adminCall(adminPath("studio-cut", `team/${IDENTITY_STUDIO}`), {
      method: "PATCH",
      body: { role: "manager", permissions: ["clients"] }
    });
    const deactivate = await adminCall(adminPath("studio-cut", `team/${IDENTITY_STUDIO}/active`), {
      method: "PATCH",
      body: { active: false }
    });
    const demoteBody = await demote.json() as { error: { code: string } };

    expect([demote.status, deactivate.status]).toEqual([409, 409]);
    expect(demoteBody.error.code).toBe("CONFLICT");
  });

  it("registra criação, permissões e ativação em auditoria", async () => {
    const roleChange = await adminCall(adminPath("studio-cut", `team/${managerIdentityId}`), {
      method: "PATCH",
      body: { role: "receptionist", permissions: ["clients"] }
    });
    const deactivate = await adminCall(adminPath("studio-cut", `team/${managerIdentityId}/active`), {
      method: "PATCH",
      body: { active: false }
    });
    const audit = await adminCall(adminPath("studio-cut", "team/audit"));
    const body = await audit.json() as {
      items: { targetId: string; action: string; before: unknown; after: unknown }[];
    };
    const actions = body.items
      .filter((item) => [managerIdentityId, professionalIdentityId].includes(item.targetId))
      .map((item) => item.action);

    expect(roleChange.status).toBe(200);
    expect(deactivate.status).toBe(200);
    expect(actions).toEqual(expect.arrayContaining([
      "MEMBERSHIP_CREATED",
      "PERMISSIONS_CHANGED",
      "ROLE_CHANGED",
      "DEACTIVATED"
    ]));
    expect(body.items.every((item) => item.after !== null)).toBe(true);
  });

  it("protege o último owner contra alterações concorrentes no D1", async () => {
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO tenants (id, slug, name) VALUES ('tenant-owner-race', 'owner-race', 'Owner Race')
      `),
      env.DB.prepare(`
        INSERT INTO admin_identities (id, email, active)
        VALUES ('owner-race-a', 'owner-race-a@access.invalid', 1)
      `),
      env.DB.prepare(`
        INSERT INTO admin_identities (id, email, active)
        VALUES ('owner-race-b', 'owner-race-b@access.invalid', 1)
      `),
      env.DB.prepare(`
        INSERT INTO admin_memberships (identity_id, tenant_id, role, active)
        VALUES ('owner-race-a', 'owner-race', 'owner', 1)
      `),
      env.DB.prepare(`
        INSERT INTO admin_memberships (identity_id, tenant_id, role, active)
        VALUES ('owner-race-b', 'owner-race', 'owner', 1)
      `)
    ]);

    const results = await Promise.allSettled([
      env.DB.prepare(`
        UPDATE admin_memberships SET role = 'manager'
        WHERE tenant_id = 'owner-race' AND identity_id = 'owner-race-a'
      `).run(),
      env.DB.prepare(`
        UPDATE admin_memberships SET role = 'manager'
        WHERE tenant_id = 'owner-race' AND identity_id = 'owner-race-b'
      `).run()
    ]);
    const count = await env.DB.prepare(`
      SELECT COUNT(*) AS total FROM admin_memberships
      WHERE tenant_id = 'owner-race' AND role = 'owner' AND active = 1
    `).first<{ total: number }>();
    const remaining = await env.DB.prepare(`
      SELECT identity_id FROM admin_memberships
      WHERE tenant_id = 'owner-race' AND role = 'owner' AND active = 1
    `).first<{ identity_id: string }>();

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(count?.total).toBe(1);
    await expect(env.DB.prepare(`
      DELETE FROM admin_memberships
      WHERE tenant_id = 'owner-race' AND identity_id = ?
    `).bind(remaining?.identity_id).run()).rejects.toThrow();
  });
});
