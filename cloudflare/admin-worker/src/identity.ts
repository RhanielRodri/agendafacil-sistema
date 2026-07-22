import { json } from "../../shared/src/http";
import { publicTerminology } from "../../shared/src/public-catalog";
import { listMemberships } from "./access";
import { route, type AdminRoute } from "./router";

interface IdentityRow {
  id: string;
  email: string;
  name: string | null;
  role: string;
  identity_active: number;
  membership_active: number;
}

export const identityRoutes: AdminRoute[] = [
  route("GET", /^context$/, async (ctx) => json({
    identity: ctx.admin.identity,
    tenant: ctx.admin.tenant,
    role: ctx.admin.role,
    terminology: publicTerminology(ctx.tenantId),
    memberships: await listMemberships(ctx.db, ctx.admin.identity.id)
  })),

  route("GET", /^identities$/, async (ctx) => {
    const rows = await ctx.db.prepare(`
      SELECT i.id, i.email, i.name, m.role,
        i.active AS identity_active, m.active AS membership_active
      FROM admin_memberships m
      JOIN admin_identities i ON i.id = m.identity_id
      WHERE m.tenant_id = ?
      ORDER BY m.active DESC, i.active DESC, i.name, i.id
    `).bind(ctx.tenantId).all<IdentityRow>();

    return json(rows.results.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      active: row.identity_active === 1 && row.membership_active === 1
    })));
  })
];
