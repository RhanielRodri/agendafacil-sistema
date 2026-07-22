import { env } from "cloudflare:test";
import { generateKeyPair, SignJWT } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { resolveAdminContext, verifyAccessToken } from "../admin-worker/src/access";
import { createAdminHandler } from "../admin-worker/src/index";

const ISSUER = "https://example.cloudflareaccess.com";
const AUDIENCE = "local-test-audience";
const EMAIL_STUDIO = "operator-studio@access.invalid";
const EMAIL_BOTH = "operator-both@access.invalid";

let privateKey: CryptoKey;
let publicKey: CryptoKey;

async function token(options: {
  issuer?: string;
  audience?: string;
  email?: string | null;
  expiration?: string | number;
} = {}): Promise<string> {
  const jwt = new SignJWT(options.email === null ? {} : { email: options.email ?? EMAIL_STUDIO })
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? AUDIENCE)
    .setExpirationTime(options.expiration ?? "5m");
  return jwt.sign(privateKey);
}

async function adminRequest(path: string, jwt?: string): Promise<Response> {
  const headers = jwt ? { "Cf-Access-Jwt-Assertion": jwt } : undefined;
  const request = new Request(`https://admin.cf1.local${path}`, { headers });
  return createAdminHandler({ jwtKey: publicKey }).fetch!(request as never, env, {} as ExecutionContext);
}

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  publicKey = pair.publicKey;
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO admin_identities (id, email, active)
      VALUES ('identity-studio', ?, 1)
    `).bind(EMAIL_STUDIO),
    env.DB.prepare(`
      INSERT INTO admin_identities (id, email, active)
      VALUES ('identity-both', ?, 1)
    `).bind(EMAIL_BOTH),
    env.DB.prepare(`
      INSERT INTO admin_memberships (identity_id, tenant_id, role, active)
      VALUES ('identity-studio', 'studio-cut', 'ADMIN', 1)
    `),
    env.DB.prepare(`
      INSERT INTO admin_memberships (identity_id, tenant_id, role, active)
      VALUES ('identity-both', 'studio-cut', 'ADMIN', 1)
    `),
    env.DB.prepare(`
      INSERT INTO admin_memberships (identity_id, tenant_id, role, active)
      VALUES ('identity-both', 'lumiere', 'ADMIN', 1)
    `)
  ]);
});

describe("JWT Cloudflare Access", () => {
  it("aceita assinatura, issuer, audience, expiração e email válidos", async () => {
    expect(await verifyAccessToken(await token(), env, publicKey)).toBe(EMAIL_STUDIO);
  });

  it("rejeita JWT inválido ou ausente", async () => {
    const invalid = await adminRequest("/api/admin/tenants/studio-cut/context", "invalid.jwt.value");
    const missing = await adminRequest("/api/admin/tenants/studio-cut/context");
    expect(invalid.status).toBe(401);
    expect(missing.status).toBe(401);
    expect(await invalid.json()).toEqual({ error: { code: "UNAUTHORIZED", message: "Acesso não autorizado" } });
  });

  it("rejeita issuer incorreto", async () => {
    const response = await adminRequest("/api/admin/tenants/studio-cut/context", await token({
      issuer: "https://wrong.cloudflareaccess.com"
    }));
    expect(response.status).toBe(401);
  });

  it("rejeita audience incorreta", async () => {
    const response = await adminRequest("/api/admin/tenants/studio-cut/context", await token({ audience: "wrong-audience" }));
    expect(response.status).toBe(401);
  });

  it("rejeita token expirado", async () => {
    const response = await adminRequest("/api/admin/tenants/studio-cut/context", await token({ expiration: 1 }));
    expect(response.status).toBe(401);
  });

  it("rejeita email ausente", async () => {
    const response = await adminRequest("/api/admin/tenants/studio-cut/context", await token({ email: null }));
    expect(response.status).toBe(401);
  });
});

describe("AdminIdentity e AdminMembership", () => {
  it("autoriza somente o tenant da membership", async () => {
    const jwt = await token();
    const studio = await adminRequest("/api/admin/tenants/studio-cut/context", jwt);
    const lumiere = await adminRequest("/api/admin/tenants/lumiere/context", jwt);
    const data = await studio.json() as { tenant: { slug: string }; role: string };

    expect(studio.status).toBe(200);
    expect(data).toMatchObject({ tenant: { slug: "studio-cut" }, role: "ADMIN" });
    expect(lumiere.status).toBe(403);
  });

  it("permite dois painéis para identidade com duas memberships", async () => {
    const jwt = await token({ email: EMAIL_BOTH });
    const [studio, lumiere] = await Promise.all([
      adminRequest("/api/admin/tenants/studio-cut/context", jwt),
      adminRequest("/api/admin/tenants/lumiere/context", jwt)
    ]);
    expect([studio.status, lumiere.status]).toEqual([200, 200]);
  });

  it("identidade ativa sem membership recebe 403", async () => {
    const email = "operator-none@access.invalid";
    await env.DB.prepare(`
      INSERT INTO admin_identities (id, email, active)
      VALUES ('identity-none', ?, 1)
    `).bind(email).run();
    const response = await adminRequest("/api/admin/tenants/studio-cut/context", await token({ email }));
    expect(response.status).toBe(403);
  });

  it("ignora tenant de body, query e header", async () => {
    const jwt = await token();
    const request = new Request("https://admin.cf1.local/api/admin/tenants/studio-cut/context?tenantId=lumiere", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cf-Access-Jwt-Assertion": jwt,
        "X-Tenant": "lumiere"
      },
      body: JSON.stringify({ tenantId: "lumiere", demoId: "lumiere" })
    });
    const context = await resolveAdminContext(request, env, "studio-cut", publicKey);
    expect(context.tenant.slug).toBe("studio-cut");
  });
});
