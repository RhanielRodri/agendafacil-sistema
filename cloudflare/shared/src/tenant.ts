import { HttpError } from "./http";
import type { Tenant } from "./types";

const TENANT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeTenantSlug(value: string): string {
  const slug = decodeURIComponent(value).trim().toLowerCase();
  if (!slug || slug.length > 80 || !TENANT_SLUG.test(slug)) {
    throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");
  }
  return slug;
}

// Deployment fixado em uma vertical. O slug da rota continua existindo por
// compatibilidade, mas deixa de ser autoridade: divergir do tenant do ambiente
// é indistinguível de pedir um tenant inexistente, então responde 404.
export function fixedTenantSlug(env: { TENANT_SLUG?: string }): string | null {
  const value = (env.TENANT_SLUG || "").trim().toLowerCase();
  return value ? value : null;
}

export function enforceFixedTenant(env: { TENANT_SLUG?: string }, slug: string): string {
  const fixed = fixedTenantSlug(env);
  if (fixed && fixed !== slug) throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");
  return fixed || slug;
}

export function tenantSlugFromPath(pathname: string, pattern: RegExp): string | null {
  const match = pathname.match(pattern);
  return match ? normalizeTenantSlug(match[1]) : null;
}

export async function findActiveTenant(db: D1Database, slug: string): Promise<Tenant> {
  const tenant = await db.prepare(`
    SELECT id, slug, name
    FROM tenants
    WHERE slug = ? AND active = 1
  `).bind(slug).first<Tenant>();

  if (!tenant) throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");
  return tenant;
}
