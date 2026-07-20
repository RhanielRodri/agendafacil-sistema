import prisma from "../prismaClient.js";

export const DEFAULT_TENANT_SLUG = "studio-cut";

const SLUG_PATTERN = /^[a-z0-9-]+$/;

export function normalizeTenantSlug(value) {
  const slug = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TENANT_SLUG;
  return SLUG_PATTERN.test(slug) ? slug : null;
}

export async function resolveActiveTenant(value) {
  const slug = normalizeTenantSlug(value);
  if (!slug) return null;
  return prisma.tenant.findFirst({ where: { slug, active: true } });
}
