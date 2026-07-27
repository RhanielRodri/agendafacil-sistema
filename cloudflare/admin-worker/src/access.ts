import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { HttpError } from "../../shared/src/http";
import {
  effectivePermissions,
  type AdminModule,
  type AdminRole
} from "../../shared/src/rbac";
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

export async function resolveIdentity(
  request: Request,
  env: AdminEnv,
  key?: CryptoKey | JWTVerifyGetKey
): Promise<AdminIdentity> {
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) return unauthorized();
  const email = await verifyAccessToken(token, env, key);
  const identity = await env.DB.prepare(`
    SELECT id, email, name
    FROM admin_identities
    WHERE email = ? AND active = 1
  `).bind(email).first<AdminIdentity>();
  if (!identity) return forbidden();
  return identity;
}

// Os painéis autorizados vêm da membership, nunca do que o cliente informa.
// É o que permite a mesma identidade operar as duas verticais sem trocar de
// sessão e o painel dizer com precisão quando o tenant não é dela.
export async function listMemberships(
  db: D1Database,
  identityId: string
): Promise<{ tenantId: string; tenantName: string; role: AdminRole; professionalId: string | null }[]> {
  const rows = await db.prepare(`
    SELECT t.slug AS tenantId, t.name AS tenantName, m.role, m.professional_id AS professionalId
    FROM admin_memberships m
    JOIN tenants t ON t.slug = m.tenant_id
    WHERE m.identity_id = ? AND m.active = 1 AND t.active = 1
    ORDER BY t.name, t.slug
  `).bind(identityId).all<{
    tenantId: string;
    tenantName: string;
    role: AdminRole;
    professionalId: string | null;
  }>();
  return rows.results;
}

export async function resolveAdminContext(
  request: Request,
  env: AdminEnv,
  tenantSlug: string,
  key?: CryptoKey | JWTVerifyGetKey
): Promise<AdminContext> {
  const identity = await resolveIdentity(request, env, key);
  const tenant = await findActiveTenant(env.DB, tenantSlug);
  const membership = await env.DB.prepare(`
    SELECT role, professional_id
    FROM admin_memberships
    WHERE identity_id = ? AND tenant_id = ? AND active = 1
  `).bind(identity.id, tenant.slug).first<{ role: AdminRole; professional_id: string | null }>();
  if (!membership) return forbidden();

  if (membership.role === "professional" && !membership.professional_id) {
    return forbidden();
  }

  const stored = await env.DB.prepare(`
    SELECT module
    FROM admin_membership_permissions
    WHERE identity_id = ? AND tenant_id = ?
  `).bind(identity.id, tenant.slug).all<{ module: AdminModule }>();

  return {
    identity,
    tenant,
    role: membership.role,
    permissions: effectivePermissions(membership.role, stored.results.map((row) => row.module)),
    professionalId: membership.professional_id
  };
}
