import { env, SELF } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const ORIGIN = "https://cf1d.local";

function syntheticPhone() {
  const digits = crypto.randomUUID().replace(/\D/g, "").padEnd(11, "5").slice(0, 11);
  return digits.startsWith("0") ? `27${digits.slice(2)}` : digits;
}

function payload(tenant: "studio-cut" | "lumiere", overrides: Record<string, unknown> = {}) {
  return {
    source: tenant === "studio-cut" ? "WAITLIST" : "EVALUATION",
    name: `CF1D Lead ${crypto.randomUUID()}`,
    phone: syntheticPhone(),
    email: "lead.cf1d@example.test",
    interestSummary: "Quero saber os horários disponíveis",
    consent: true,
    createFollowUp: true,
    website: "",
    ...overrides
  };
}

async function capture(
  tenant: string,
  body: Record<string, unknown>,
  ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`
) {
  return SELF.fetch(`${ORIGIN}/api/tenants/${tenant}/leads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "CF-Connecting-IP": ip,
      "User-Agent": "CF1D synthetic test"
    },
    body: JSON.stringify(body)
  });
}

// O follow-up automático só existe quando o negócio tem operador ativo; sem
// membership o lead é criado do mesmo jeito, como no contrato original.
beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO admin_identities (id, email, name, active)
      VALUES ('cf1d-owner', 'cf1d.owner@example.test', 'Operador CF1D', 1)
      ON CONFLICT(id) DO NOTHING
    `),
    env.DB.prepare(`
      INSERT INTO admin_memberships (identity_id, tenant_id, role, active)
      VALUES ('cf1d-owner', 'studio-cut', 'owner', 1)
      ON CONFLICT(identity_id, tenant_id) DO NOTHING
    `)
  ]);
});

afterEach(async () => {
  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM relationship_history_events
      WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'CF1D Lead%')
    `),
    env.DB.prepare("DELETE FROM follow_ups WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'CF1D Lead%')"),
    env.DB.prepare("DELETE FROM leads WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'CF1D Lead%')"),
    env.DB.prepare("DELETE FROM clients WHERE name LIKE 'CF1D Lead%'"),
    env.DB.prepare("DELETE FROM public_rate_limits")
  ]);
});

describe("captura pública de leads", () => {
  it("cria lead, cliente e follow-up na vertical de barbearia", async () => {
    const body = payload("studio-cut", { urgency: "TODAY" });
    const response = await capture("studio-cut", body);
    const data = await response.json() as Record<string, unknown>;

    const lead = await env.DB.prepare(`
      SELECT l.tenant_id, l.source, l.status, l.priority, l.qualification_json, c.name
      FROM leads l JOIN clients c ON c.id = l.client_id
      WHERE c.name = ?
    `).bind(body.name).first<Record<string, unknown>>();
    const followUp = await env.DB.prepare(`
      SELECT type, status FROM follow_ups
      WHERE client_id IN (SELECT id FROM clients WHERE name = ?)
    `).bind(body.name).first<{ type: string; status: string }>();

    expect(response.status).toBe(201);
    expect(data).toMatchObject({ status: "CREATED", source: "WAITLIST", followUpCreated: true });
    expect(lead).toMatchObject({ tenant_id: "studio-cut", status: "NEW", priority: "HIGH" });
    expect(JSON.parse(String(lead?.qualification_json))).toMatchObject({ urgency: "TODAY", wantsImmediateOpening: true });
    expect(followUp).toMatchObject({ type: "WAITLIST", status: "OPEN" });
  });

  it("reaproveita o lead ativo equivalente em vez de duplicar", async () => {
    const body = payload("lumiere");
    const first = await capture("lumiere", body);
    const second = await capture("lumiere", body);
    const total = await env.DB.prepare(`
      SELECT COUNT(*) AS total FROM leads
      WHERE client_id IN (SELECT id FROM clients WHERE name = ?)
    `).bind(body.name).first<{ total: number }>();

    expect(await first.json()).toMatchObject({ status: "CREATED", followUpCreated: false });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ status: "RECEIVED" });
    expect(total?.total).toBe(1);
  });

  it("recusa origem de outra vertical, consentimento ausente e urgência fora da barbearia", async () => {
    const foreignSource = await capture("lumiere", payload("lumiere", { source: "WAITLIST" }));
    const noConsent = await capture("studio-cut", payload("studio-cut", { consent: false }));
    const urgency = await capture("lumiere", payload("lumiere", { urgency: "TODAY" }));
    const shortInterest = await capture("studio-cut", payload("studio-cut", { interestSummary: "a" }));

    expect([foreignSource.status, noConsent.status, urgency.status, shortInterest.status])
      .toEqual([400, 400, 400, 400]);
  });

  it("descarta preenchimento automático sem gravar nada", async () => {
    const body = payload("studio-cut", { website: "https://spam.example" });
    const response = await capture("studio-cut", body);
    const stored = await env.DB.prepare("SELECT id FROM clients WHERE name = ?").bind(body.name).first<{ id: string }>();

    expect(response.status).toBe(202);
    expect(stored).toBeNull();
  });

  it("ignora tenant enviado no corpo e usa apenas o slug da rota", async () => {
    const body = payload("studio-cut", { tenantId: "lumiere", demoId: "lumiere", tenant: "lumiere" });
    await capture("studio-cut", body);

    const lead = await env.DB.prepare(`
      SELECT tenant_id FROM leads WHERE client_id IN (SELECT id FROM clients WHERE name = ?)
    `).bind(body.name).first<{ tenant_id: string }>();
    const leaked = await env.DB.prepare("SELECT id FROM clients WHERE tenant_id = 'lumiere' AND name = ?")
      .bind(body.name).first<{ id: string }>();

    expect(lead?.tenant_id).toBe("studio-cut");
    expect(leaked).toBeNull();
  });

  it("recusa serviço de outra vertical e aplica o limite de requisições", async () => {
    const foreignService = await capture("studio-cut", payload("studio-cut", { serviceId: "service-lumiere-skin" }));
    expect(foreignService.status).toBe(400);

    const ip = "203.0.113.250";
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1) {
      statuses.push((await capture("studio-cut", payload("studio-cut"), ip)).status);
    }
    expect(statuses.at(-1)).toBe(429);
  });
});
