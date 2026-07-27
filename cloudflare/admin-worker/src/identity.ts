import { HttpError, json } from "../../shared/src/http";
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
  route("GET", /^context$/, null, async (ctx) => {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    await ctx.db.prepare(`
      UPDATE admin_memberships
      SET last_access_at = ?
      WHERE identity_id = ? AND tenant_id = ?
        AND (last_access_at IS NULL OR last_access_at <= ?)
    `).bind(now.toISOString(), ctx.admin.identity.id, ctx.tenantId, cutoff).run();

    return json({
      identity: ctx.admin.identity,
      tenant: ctx.admin.tenant,
      role: ctx.admin.role,
      professionalId: ctx.admin.professionalId,
      permissions: ctx.admin.permissions,
      terminology: publicTerminology(ctx.tenantId),
      memberships: await listMemberships(ctx.db, ctx.admin.identity.id)
    });
  }),

  route("GET", /^identities$/, null, async (ctx) => {
    if (
      ctx.admin.role !== "owner"
      && !ctx.admin.permissions.includes("leads")
      && !ctx.admin.permissions.includes("follow_ups")
    ) {
      throw new HttpError(403, "FORBIDDEN", "Acesso negado");
    }
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
