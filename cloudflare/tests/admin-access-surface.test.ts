import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  EMAIL_LUMIERE,
  EMAIL_STUDIO,
  IDENTITY_STUDIO,
  adminCall,
  adminJson,
  adminPath,
  setupAdminAccess
} from "./admin-harness";

const BOTH_EMAIL = "admin-ambos@access.invalid";

interface IdentityContext {
  identity: { id: string; email: string; name: string | null };
  memberships: { tenantId: string; tenantName: string; role: string }[];
}

beforeAll(async () => {
  await setupAdminAccess();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO admin_identities (id, email, name, active) VALUES ('admin-identity-ambos', ?, 'Operadora das duas', 1)")
      .bind(BOTH_EMAIL),
    env.DB.prepare("INSERT INTO admin_memberships (identity_id, tenant_id, role, active) VALUES ('admin-identity-ambos', 'studio-cut', 'ADMIN', 1)"),
    env.DB.prepare("INSERT INTO admin_memberships (identity_id, tenant_id, role, active) VALUES ('admin-identity-ambos', 'lumiere', 'ADMIN', 1)"),
    env.DB.prepare(`
      INSERT INTO clients (id, tenant_id, name, phone, normalized_phone)
      VALUES ('csv-client', 'studio-cut', 'Cliente "CSV"', '(27) 97777-1000', '27977771000')
    `),
    env.DB.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id, client_name, client_phone,
        client_email, appointment_date, start_time, end_time, status
      ) VALUES (
        'csv-appointment', 'studio-cut', 'service-studio-cut', 'professional-studio-1',
        'csv-client', 'Cliente "CSV"', '(27) 97777-1000', 'csv@example.test',
        '2026-07-20', '09:00', '09:30', 'COMPLETED'
      )
    `)
  ]);
});

describe("contexto de identidade sem tenant", () => {
  it("exige asserção do Access e identidade conhecida", async () => {
    const anonymous = await adminCall("/api/admin/context", { email: null });
    const unknown = await adminCall("/api/admin/context", { email: "ninguem@access.invalid" });
    expect([anonymous.status, unknown.status]).toEqual([401, 403]);
  });

  it("devolve apenas as memberships ativas da própria identidade", async () => {
    const studio = await adminJson<IdentityContext>("/api/admin/context");
    const lumiere = await adminJson<IdentityContext>("/api/admin/context", { email: EMAIL_LUMIERE });

    expect(studio.identity.email).toBe(EMAIL_STUDIO);
    expect(studio.memberships.map((row) => row.tenantId)).toEqual(["studio-cut"]);
    expect(lumiere.memberships.map((row) => row.tenantId)).toEqual(["lumiere"]);
  });

  it("suporta identidade autorizada nas duas verticais", async () => {
    const both = await adminJson<IdentityContext>("/api/admin/context", { email: BOTH_EMAIL });
    const studioPanel = await adminCall(adminPath("studio-cut", "context"), { email: BOTH_EMAIL });
    const lumierePanel = await adminCall(adminPath("lumiere", "context"), { email: BOTH_EMAIL });

    expect(both.memberships.map((row) => row.tenantId).sort()).toEqual(["lumiere", "studio-cut"]);
    expect([studioPanel.status, lumierePanel.status]).toEqual([200, 200]);
  });

  it("expõe as memberships no contexto do painel sem vazar identidade alheia", async () => {
    const context = await adminJson<IdentityContext & { tenant: { slug: string } }>(
      adminPath("studio-cut", "context")
    );
    expect(context.tenant.slug).toBe("studio-cut");
    expect(context.identity.id).toBe(IDENTITY_STUDIO);
    expect(context.memberships).toEqual([
      { tenantId: "studio-cut", tenantName: expect.any(String), role: "ADMIN" }
    ]);
  });

  it("nega o painel de outra vertical mesmo com identidade válida", async () => {
    const foreign = await adminCall(adminPath("lumiere", "context"), { email: EMAIL_STUDIO });
    expect(foreign.status).toBe(403);
  });
});

describe("exportação de agendamentos", () => {
  it("entrega CSV do próprio tenant com escape e sem cache", async () => {
    const response = await adminCall(adminPath("studio-cut", "appointments/export.csv"));
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(text.split("\n")[0]).toBe("id,data,horario,status,servico,profissional,cliente,telefone,email");
    expect(text).toContain('"Cliente ""CSV"""');
  });

  it("não expõe agendamentos de outro tenant nem aceita acesso sem membership", async () => {
    const lumiere = await adminCall(adminPath("lumiere", "appointments/export.csv"), { email: EMAIL_LUMIERE });
    const foreign = await adminCall(adminPath("lumiere", "appointments/export.csv"), { email: EMAIL_STUDIO });

    expect(await lumiere.text()).not.toContain("csv-appointment");
    expect(foreign.status).toBe(403);
  });
});
