import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { HttpError } from "../../shared/src/http";
import { findActiveTenant } from "../../shared/src/tenant";
import type { AdminContext, AdminEnv, AdminIdentity } from "../../shared/src/types";

const remoteKeys = new Map<string, JWTVerifyGetKey>();

function unauthorized(): never {
  throw new HttpError(401, "UNAUTHORIZED", "Acesso não autorizado");
}

function forbidden(): never {
  throw new HttpError(403, "FORBIDDEN", "Acesso negado");
}

function teamOrigin(value: string): string {
  try {
    const raw = value.trim();
    const url = new URL(raw.startsWith("https://") ? raw : `https://${raw}`);
    if (url.protocol !== "https:" || !url.hostname.endsWith(".cloudflareaccess.com") || url.pathname !== "/") {
      return unauthorized();
    }
    return url.origin;
  } catch {
    return unauthorized();
  }
}

function remoteKey(issuer: string): JWTVerifyGetKey {
  const cached = remoteKeys.get(issuer);
  if (cached) return cached;
  const key = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  remoteKeys.set(issuer, key);
  return key;
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") return unauthorized();
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !email.includes("@")) return unauthorized();
  return email;
}

export async function verifyAccessToken(
  token: string,
  env: Pick<AdminEnv, "ACCESS_TEAM_DOMAIN" | "ACCESS_POLICY_AUD">,
  key?: CryptoKey | JWTVerifyGetKey
): Promise<string> {
  try {
    const issuer = teamOrigin(env.ACCESS_TEAM_DOMAIN);
    const audience = env.ACCESS_POLICY_AUD.trim();
    if (!audience) return unauthorized();
    const options = {
      algorithms: ["RS256"],
      audience,
      issuer,
      requiredClaims: ["exp", "email"]
    };
    const result = typeof key === "function"
      ? await jwtVerify(token, key, options)
      : key
        ? await jwtVerify(token, key, options)
        : await jwtVerify(token, remoteKey(issuer), options);
    const { payload } = result;
    return normalizeEmail(payload.email);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return unauthorized();
  }
}

export async function resolveAdminContext(
  request: Request,
  env: AdminEnv,
  tenantSlug: string,
  key?: CryptoKey | JWTVerifyGetKey
): Promise<AdminContext> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return unauthorized();
  const email = await verifyAccessToken(token, env, key);
  const identity = await env.DB.prepare(`
    SELECT id, email, name
    FROM admin_identities
    WHERE email = ? AND active = 1
  `).bind(email).first<AdminIdentity>();
  if (!identity) return forbidden();

  const tenant = await findActiveTenant(env.DB, tenantSlug);
  const membership = await env.DB.prepare(`
    SELECT role
    FROM admin_memberships
    WHERE identity_id = ? AND tenant_id = ? AND active = 1 AND role = 'ADMIN'
  `).bind(identity.id, tenant.slug).first<{ role: "ADMIN" }>();
  if (!membership) return forbidden();

  return { identity, tenant, role: membership.role };
}
