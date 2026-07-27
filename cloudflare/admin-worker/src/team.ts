import { invalid, pagination, requireBoolean, sanitizeText } from "../../shared/src/admin";
import { HttpError, json, readJsonObject } from "../../shared/src/http";
import {
  effectivePermissions,
  permissionsForRole,
  requireAdminRole,
  type AdminModule,
  type AdminRole
} from "../../shared/src/rbac";
import { requirePublicId } from "../../shared/src/availability";
import { route, type AdminRequestContext, type AdminRoute } from "./router";

interface TeamMemberRow {
  identity_id: string;
  email: string;
  name: string | null;
  identity_active: number;
  role: AdminRole;
  active: number;
  professional_id: string | null;
  professional_name: string | null;
  last_access_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AuditRow {
  id: string;
  actor_identity_id: string;
  actor_name: string | null;
  target_identity_id: string;
  target_name: string | null;
  action: string;
  before_json: string | null;
  after_json: string;
  created_at: string;
}

function normalizedEmail(value: unknown): string {
  if (typeof value !== "string") invalid("E-mail inválido");
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    invalid("E-mail inválido");
  }
  return email;
}

function triggerConflict(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("LAST_OWNER")) {
    throw new HttpError(409, "CONFLICT", "O último owner ativo não pode ser removido, desativado ou rebaixado");
  }
  if (
    message.includes("INVALID_PROFESSIONAL_LINK")
    || message.includes("idx_admin_memberships_professional")
    || message.includes("admin_memberships.tenant_id, admin_memberships.professional_id")
  ) {
    throw new HttpError(409, "CONFLICT", "Profissional inválido ou já vinculado a outro acesso");
  }
  throw error;
}

async function professionalForRole(
  ctx: AdminRequestContext,
  role: AdminRole,
  value: unknown
): Promise<string | null> {
  if (role !== "professional") {
    if (value !== null && value !== undefined && value !== "") {
      invalid("Somente a role professional pode ter profissional vinculado");
    }
    return null;
  }
  const id = requirePublicId(typeof value === "string" ? value : null, "Profissional");
  const row = await ctx.db.prepare(`
    SELECT id FROM professionals
    WHERE tenant_id = ? AND id = ? AND active = 1
  `).bind(ctx.tenantId, id).first<{ id: string }>();
  if (!row) throw new HttpError(404, "NOT_FOUND", "Profissional não encontrado");
  return row.id;
}

async function storedPermissions(
  ctx: AdminRequestContext,
  identityId: string
): Promise<AdminModule[]> {
  const rows = await ctx.db.prepare(`
    SELECT module FROM admin_membership_permissions
    WHERE tenant_id = ? AND identity_id = ?
  `).bind(ctx.tenantId, identityId).all<{ module: AdminModule }>();
  return rows.results.map((row) => row.module);
}

async function loadMember(ctx: AdminRequestContext, identityId: string): Promise<TeamMemberRow> {
  const row = await ctx.db.prepare(`
    SELECT m.identity_id, i.email, i.name, i.active AS identity_active,
      m.role, m.active, m.professional_id, p.name AS professional_name,
      m.last_access_at, m.created_at, m.updated_at
    FROM admin_memberships m
    JOIN admin_identities i ON i.id = m.identity_id
    LEFT JOIN professionals p
      ON p.tenant_id = m.tenant_id AND p.id = m.professional_id
    WHERE m.tenant_id = ? AND m.identity_id = ?
  `).bind(ctx.tenantId, identityId).first<TeamMemberRow>();
  if (!row) throw new HttpError(404, "NOT_FOUND", "Acesso não encontrado");
  return row;
}

async function memberPayload(ctx: AdminRequestContext, row: TeamMemberRow) {
  const permissions = effectivePermissions(row.role, await storedPermissions(ctx, row.identity_id));
  return {
    id: row.identity_id,
    email: row.email,
    name: row.name,
    role: row.role,
    permissions,
    active: row.active === 1 && row.identity_active === 1,
    membershipActive: row.active === 1,
    identityActive: row.identity_active === 1,
    professionalId: row.professional_id,
    professional: row.professional_id
      ? { id: row.professional_id, name: row.professional_name }
      : null,
    lastAccessAt: row.last_access_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function auditSnapshot(
  role: AdminRole,
  permissions: AdminModule[],
  active: boolean,
  professionalId: string | null
) {
  return { role, permissions, active, professionalId };
}

function auditStatement(
  ctx: AdminRequestContext,
  targetIdentityId: string,
  action: string,
  before: unknown,
  after: unknown,
  now: string
): D1PreparedStatement {
  return ctx.db.prepare(`
    INSERT INTO admin_access_audit_events (
      id, tenant_id, actor_identity_id, target_identity_id,
      action, before_json, after_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    ctx.tenantId,
    ctx.admin.identity.id,
    targetIdentityId,
    action,
    before === null ? null : JSON.stringify(before),
    JSON.stringify(after),
    now
  );
}

function permissionStatements(
  ctx: AdminRequestContext,
  identityId: string,
  permissions: AdminModule[]
): D1PreparedStatement[] {
  return permissions.map((module) => ctx.db.prepare(`
    INSERT INTO admin_membership_permissions (identity_id, tenant_id, module)
    VALUES (?, ?, ?)
  `).bind(identityId, ctx.tenantId, module));
}

async function listTeam(ctx: AdminRequestContext): Promise<Response> {
  const rows = await ctx.db.prepare(`
    SELECT m.identity_id, i.email, i.name, i.active AS identity_active,
      m.role, m.active, m.professional_id, p.name AS professional_name,
      m.last_access_at, m.created_at, m.updated_at
    FROM admin_memberships m
    JOIN admin_identities i ON i.id = m.identity_id
    LEFT JOIN professionals p
      ON p.tenant_id = m.tenant_id AND p.id = m.professional_id
    WHERE m.tenant_id = ?
    ORDER BY m.active DESC, i.name, i.email, m.identity_id
  `).bind(ctx.tenantId).all<TeamMemberRow>();
  return json(await Promise.all(rows.results.map((row) => memberPayload(ctx, row))));
}

async function createTeamMember(ctx: AdminRequestContext): Promise<Response> {
  const body = await readJsonObject(ctx.request);
  const email = normalizedEmail(body.email);
  const name = sanitizeText(body.name, "Nome", 2, 120, false);
  const role = requireAdminRole(body.role);
  const professionalId = await professionalForRole(ctx, role, body.professionalId);
  const permissions = permissionsForRole(role, body.permissions);
  const existingIdentity = await ctx.db.prepare(`
    SELECT id, active FROM admin_identities WHERE email = ?
  `).bind(email).first<{ id: string; active: number }>();
  if (existingIdentity?.active === 0) {
    throw new HttpError(409, "CONFLICT", "Identidade global inativa exige liberação operacional");
  }
  const identityId = existingIdentity?.id ?? crypto.randomUUID();
  const existingMembership = await ctx.db.prepare(`
    SELECT identity_id FROM admin_memberships
    WHERE identity_id = ? AND tenant_id = ?
  `).bind(identityId, ctx.tenantId).first<{ identity_id: string }>();
  if (existingMembership) {
    throw new HttpError(409, "CONFLICT", "E-mail já possui acesso neste negócio");
  }

  const now = new Date().toISOString();
  const snapshot = auditSnapshot(role, permissions, true, professionalId);
  const statements: D1PreparedStatement[] = [];
  if (!existingIdentity) {
    statements.push(ctx.db.prepare(`
      INSERT INTO admin_identities (id, email, name, active, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `).bind(identityId, email, name, now, now));
  }
  statements.push(ctx.db.prepare(`
    INSERT INTO admin_memberships (
      identity_id, tenant_id, role, active, professional_id, created_at, updated_at
    ) VALUES (?, ?, ?, 1, ?, ?, ?)
  `).bind(identityId, ctx.tenantId, role, professionalId, now, now));
  statements.push(...permissionStatements(ctx, identityId, permissions));
  statements.push(auditStatement(ctx, identityId, "MEMBERSHIP_CREATED", null, snapshot, now));

  try {
    await ctx.db.batch(statements);
  } catch (error) {
    triggerConflict(error);
  }
  return json(await memberPayload(ctx, await loadMember(ctx, identityId)), { status: 201 });
}

async function updateTeamMember(ctx: AdminRequestContext): Promise<Response> {
  const identityId = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request);
  if (!Object.hasOwn(body, "role") && !Object.hasOwn(body, "permissions") && !Object.hasOwn(body, "professionalId")) {
    invalid("Nenhuma alteração informada");
  }
  const current = await loadMember(ctx, identityId);
  const currentPermissions = effectivePermissions(current.role, await storedPermissions(ctx, identityId));
  const role = Object.hasOwn(body, "role") ? requireAdminRole(body.role) : current.role;
  const professionalValue = Object.hasOwn(body, "professionalId")
    ? body.professionalId
    : role === current.role ? current.professional_id : null;
  const professionalId = await professionalForRole(ctx, role, professionalValue);
  const permissions = permissionsForRole(
    role,
    Object.hasOwn(body, "permissions")
      ? body.permissions
      : role === current.role ? currentPermissions : undefined
  );
  const before = auditSnapshot(
    current.role,
    currentPermissions,
    current.active === 1,
    current.professional_id
  );
  const after = auditSnapshot(role, permissions, current.active === 1, professionalId);
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return json(await memberPayload(ctx, current));
  }

  const now = new Date().toISOString();
  const action = current.role !== role || current.professional_id !== professionalId
    ? "ROLE_CHANGED"
    : "PERMISSIONS_CHANGED";
  const statements = [
    ctx.db.prepare(`
      UPDATE admin_memberships
      SET role = ?, professional_id = ?, updated_at = ?
      WHERE tenant_id = ? AND identity_id = ?
    `).bind(role, professionalId, now, ctx.tenantId, identityId),
    ctx.db.prepare(`
      DELETE FROM admin_membership_permissions
      WHERE tenant_id = ? AND identity_id = ?
    `).bind(ctx.tenantId, identityId),
    ...permissionStatements(ctx, identityId, permissions),
    auditStatement(ctx, identityId, action, before, after, now)
  ];
  try {
    await ctx.db.batch(statements);
  } catch (error) {
    triggerConflict(error);
  }
  return json(await memberPayload(ctx, await loadMember(ctx, identityId)));
}

async function setTeamMemberActive(ctx: AdminRequestContext): Promise<Response> {
  const identityId = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request);
  const active = requireBoolean(body.active, "Ativo");
  const current = await loadMember(ctx, identityId);
  const permissions = effectivePermissions(current.role, await storedPermissions(ctx, identityId));
  if ((current.active === 1) === active) {
    return json(await memberPayload(ctx, current));
  }
  const before = auditSnapshot(current.role, permissions, current.active === 1, current.professional_id);
  const after = auditSnapshot(current.role, permissions, active, current.professional_id);
  const now = new Date().toISOString();
  try {
    await ctx.db.batch([
      ctx.db.prepare(`
        UPDATE admin_memberships
        SET active = ?, updated_at = ?
        WHERE tenant_id = ? AND identity_id = ?
      `).bind(active ? 1 : 0, now, ctx.tenantId, identityId),
      auditStatement(ctx, identityId, active ? "ACTIVATED" : "DEACTIVATED", before, after, now)
    ]);
  } catch (error) {
    triggerConflict(error);
  }
  return json(await memberPayload(ctx, await loadMember(ctx, identityId)));
}

async function listAccessAudit(ctx: AdminRequestContext): Promise<Response> {
  const { page, pageSize, offset } = pagination(ctx.url, 50);
  const [count, rows] = await Promise.all([
    ctx.db.prepare(`
      SELECT COUNT(*) AS total
      FROM admin_access_audit_events
      WHERE tenant_id = ?
    `).bind(ctx.tenantId).first<{ total: number }>(),
    ctx.db.prepare(`
      SELECT event.*, actor.name AS actor_name, target.name AS target_name
      FROM admin_access_audit_events event
      LEFT JOIN admin_identities actor ON actor.id = event.actor_identity_id
      LEFT JOIN admin_identities target ON target.id = event.target_identity_id
      WHERE event.tenant_id = ?
      ORDER BY event.created_at DESC, event.id DESC
      LIMIT ? OFFSET ?
    `).bind(ctx.tenantId, pageSize, offset).all<AuditRow>()
  ]);
  return json({
    items: rows.results.map((row) => ({
      id: row.id,
      actorId: row.actor_identity_id,
      actorName: row.actor_name,
      targetId: row.target_identity_id,
      targetName: row.target_name,
      action: row.action,
      before: row.before_json ? JSON.parse(row.before_json) : null,
      after: JSON.parse(row.after_json),
      createdAt: row.created_at
    })),
    pagination: {
      page,
      limit: pageSize,
      total: count?.total ?? 0,
      pages: Math.max(1, Math.ceil((count?.total ?? 0) / pageSize))
    }
  });
}

export const teamRoutes: AdminRoute[] = [
  route("GET", /^team$/, "team", listTeam),
  route("POST", /^team$/, "team", createTeamMember),
  route("GET", /^team\/audit$/, "team", listAccessAudit),
  route("PATCH", /^team\/([^/]+)$/, "team", updateTeamMember),
  route("PATCH", /^team\/([^/]+)\/active$/, "team", setTeamMemberActive)
];
