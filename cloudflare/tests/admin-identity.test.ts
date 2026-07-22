import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import {
  EMAIL_LUMIERE,
  IDENTITY_STUDIO,
  adminCall,
  adminJson,
  adminPath,
  setupAdminAccess
} from "./admin-harness";

beforeAll(async () => {
  await setupAdminAccess();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO admin_identities (id, email, name, active) VALUES ('identity-inactive', 'inativo@access.invalid', 'Inativo', 0)"),
    env.DB.prepare("INSERT INTO admin_memberships (identity_id, tenant_id, role, active) VALUES ('identity-inactive', 'studio-cut', 'ADMIN', 1)")
  ]);
});

describe("identidade administrativa", () => {
  it("exige JWT do Cloudflare Access em toda rota administrativa", async () => {
    const paths = ["context", "identities", "overview", "agenda", "appointments"];
    const responses = await Promise.all(
      paths.map((resource) => adminCall(adminPath("studio-cut", resource), { email: null }))
    );
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401]);
    expect(await responses[0].json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Acesso não autorizado" }
    });
  });

  it("não aceita senha, cookie de sessão ou token próprio como identidade", async () => {
    const response = await adminCall(adminPath("studio-cut", "context"), {
      email: null,
      headers: {
        Cookie: "agendafacil_session=qualquer-coisa",
        Authorization: "Bearer token-proprio"
      }
    });
    expect(response.status).toBe(401);
  });

  it("autoriza somente o tenant com membership ativa", async () => {
    const studio = await adminCall(adminPath("studio-cut", "context"));
    const lumiere = await adminCall(adminPath("lumiere", "context"));
    expect(studio.status).toBe(200);
    expect(lumiere.status).toBe(403);
  });

  it("recusa identidade inativa mesmo com membership ativa", async () => {
    const response = await adminCall(adminPath("studio-cut", "context"), { email: "inativo@access.invalid" });
    expect(response.status).toBe(403);
  });

  it("devolve terminologia própria de cada vertical", async () => {
    const studio = await adminJson<{ terminology: { professionalPlural: string }; role: string }>(
      adminPath("studio-cut", "context")
    );
    const lumiere = await adminJson<{ terminology: { professionalPlural: string } }>(
      adminPath("lumiere", "context"),
      { email: EMAIL_LUMIERE }
    );
    expect(studio.terminology.professionalPlural).toBe("barbeiros");
    expect(studio.role).toBe("ADMIN");
    expect(lumiere.terminology.professionalPlural).toBe("profissionais");
  });

  it("mantém o slug da rota como única autoridade de tenant", async () => {
    const response = await adminCall(`${adminPath("studio-cut", "context")}?tenantId=lumiere&demoId=lumiere`, {
      method: "GET",
      headers: { "X-Tenant": "lumiere", "X-Demo-Id": "lumiere" }
    });
    const body = await response.json() as { tenant: { slug: string } };
    expect(response.status).toBe(200);
    expect(body.tenant.slug).toBe("studio-cut");
  });

  it("responde 404 para slug desconhecido e para rota inexistente", async () => {
    const unknownTenant = await adminCall(adminPath("tenant-inexistente", "context"));
    const unknownRoute = await adminCall(adminPath("studio-cut", "rota-inexistente"));
    expect(unknownTenant.status).toBe(404);
    expect(unknownRoute.status).toBe(404);
  });

  it("lista somente memberships do tenant autorizado", async () => {
    const identities = await adminJson<{ id: string; email: string; active: boolean }[]>(
      adminPath("studio-cut", "identities")
    );
    expect(identities.some((row) => row.id === IDENTITY_STUDIO)).toBe(true);
    expect(identities.some((row) => row.email === EMAIL_LUMIERE)).toBe(false);
    expect(identities.find((row) => row.id === "identity-inactive")?.active).toBe(false);
  });
});
