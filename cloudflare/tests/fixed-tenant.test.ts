import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import publicWorker from "../public-worker/src/index";
import { adminCall, adminPath, EMAIL_STUDIO, setupAdminAccess } from "./admin-harness";

// Um deployment por vertical não é uma cópia da aplicação: é o mesmo código com
// `TENANT_SLUG` fixo. O que estes testes provam é que o slug da rota deixa de
// ser autoridade e que nenhum caminho alcança a outra demo.

const ORIGIN = "https://cf2.local";

function publicCall(path: string, tenantSlug?: string): Promise<Response> {
  const callEnv = tenantSlug ? { ...env, TENANT_SLUG: tenantSlug } : env;
  return publicWorker.fetch(new Request(`${ORIGIN}${path}`), callEnv as never);
}

describe("Worker público fixado em uma vertical", () => {
  it("atende o tenant do ambiente", async () => {
    const response = await publicCall("/api/tenants/studio-cut/context", "studio-cut");
    const body = await response.json() as { tenant: { slug: string } };
    expect(response.status).toBe(200);
    expect(body.tenant.slug).toBe("studio-cut");
  });

  it("responde 404 para a outra vertical, mesmo existindo no D1", async () => {
    const semFixo = await publicCall("/api/tenants/lumiere/context");
    expect(semFixo.status).toBe(200);

    const comFixo = await publicCall("/api/tenants/lumiere/context", "studio-cut");
    expect(comFixo.status).toBe(404);
    expect(await comFixo.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("não vaza a outra vertical por nenhuma rota pública", async () => {
    const rotas = ["services", "professionals", "business-hours", "settings", "appointment"];
    for (const rota of rotas) {
      const response = await publicCall(`/api/tenants/lumiere/${rota}`, "studio-cut");
      expect(response.status).toBe(404);
    }
  });

  it("ignora tenant informado por query, body ou header", async () => {
    const response = await publicCall("/api/tenants/studio-cut/services?tenantId=lumiere&demoId=lumiere", "studio-cut");
    const body = await response.json() as { id: string }[];
    expect(response.status).toBe(200);
    expect(body.length).toBeGreaterThan(0);
  });
});

describe("Worker administrativo fixado em uma vertical", () => {
  beforeAll(setupAdminAccess);

  it("responde 404 na outra vertical antes de qualquer autorização", async () => {
    const response = await adminCall(adminPath("lumiere", "appointments"), {
      email: EMAIL_STUDIO,
      envOverride: { TENANT_SLUG: "studio-cut" }
    });
    expect(response.status).toBe(404);
  });

  it("mantém o painel do próprio tenant", async () => {
    const response = await adminCall(adminPath("studio-cut", "appointments"), {
      email: EMAIL_STUDIO,
      envOverride: { TENANT_SLUG: "studio-cut" }
    });
    expect(response.status).toBe(200);
  });

  it("lista apenas a membership do tenant do ambiente", async () => {
    const completo = await adminCall("/api/admin/context", { email: EMAIL_STUDIO });
    const fixado = await adminCall("/api/admin/context", {
      email: EMAIL_STUDIO,
      envOverride: { TENANT_SLUG: "lumiere" }
    });

    expect((await completo.json() as { memberships: unknown[] }).memberships).toHaveLength(1);
    expect((await fixado.json() as { memberships: unknown[] }).memberships).toHaveLength(0);
  });

  it("continua exigindo JWT válido no tenant fixo", async () => {
    const response = await adminCall(adminPath("studio-cut", "appointments"), {
      email: null,
      envOverride: { TENANT_SLUG: "studio-cut" }
    });
    expect(response.status).toBe(401);
  });
});
