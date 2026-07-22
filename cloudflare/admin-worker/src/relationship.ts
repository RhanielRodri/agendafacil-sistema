import {
  FOLLOW_UP_TYPES,
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  appointmentHistoryStatement,
  endTimeFor,
  invalid,
  isConstraintError,
  notFoundError,
  pagination,
  relationshipEventStatement,
  requireDateValue,
  requireEnum,
  requireIsoDateTime,
  requireTimeValue,
  sanitizeText
} from "../../shared/src/admin";
import { calculateD1Availability, requirePublicId } from "../../shared/src/availability";
import { HttpError, json, readJsonObject } from "../../shared/src/http";
import { route, type AdminRequestContext, type AdminRoute } from "./router";

const ACTIVE_LEAD = ["NEW", "CONTACTED", "QUALIFIED"];
const LOST_REASONS = ["NO_RESPONSE", "PRICE", "NO_AVAILABILITY", "CHANGED_MIND", "NOT_A_FIT", "DUPLICATE", "OTHER"] as const;
const CONTACT_PERIODS = ["MORNING", "AFTERNOON", "EVENING", "ANY"] as const;
const URGENCIES = ["TODAY", "THIS_WEEK", "FLEXIBLE"] as const;

const LEAD_TRANSITIONS: Record<string, string[]> = {
  NEW: ["CONTACTED", "QUALIFIED", "CONVERTED", "LOST"],
  CONTACTED: ["QUALIFIED", "CONVERTED", "LOST"],
  QUALIFIED: ["CONVERTED", "LOST"],
  CONVERTED: [],
  LOST: []
};

type QualificationKind = "boolean" | "shortText" | "mediumText" | "professional" | "contactPeriod" | "urgency";

const QUALIFICATION_FIELDS: Record<string, Record<string, QualificationKind>> = {
  "studio-cut": {
    firstVisit: "boolean",
    serviceInterest: "shortText",
    preferredProfessionalId: "professional",
    availability: "mediumText",
    commercialNote: "mediumText",
    acceptsAnyProfessional: "boolean",
    bestContactPeriod: "contactPeriod",
    wantsImmediateOpening: "boolean",
    urgency: "urgency"
  },
  lumiere: {
    firstVisit: "boolean",
    procedureInterest: "shortText",
    preferredProfessionalId: "professional",
    availability: "mediumText",
    commercialNote: "mediumText",
    bestContactPeriod: "contactPeriod",
    requestsEvaluation: "boolean",
    statedGoal: "mediumText",
    packageInterest: "boolean"
  }
};

const CLINICAL_TERMS = /\b(diagn[oó]stico|doen[cç]a|prescri[cç][aã]o|prontu[aá]rio|medicamento|sintoma|laudo)\b/i;

function commercialText(value: unknown, max: number, required = false): string | null {
  const clean = sanitizeText(value, "Texto", 1, max, required);
  if (clean && CLINICAL_TERMS.test(clean)) {
    invalid("Não registre dados clínicos ou médicos neste campo comercial");
  }
  return clean;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function boundary(value: string | null, endOfDay = false): string | null {
  if (!value) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value);
  if (Number.isNaN(parsed.getTime())) invalid("Período inválido");
  if (endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T23:59:59.999Z`;
  return parsed.toISOString();
}

function booleanQuery(value: string | null, label: string): boolean {
  if (value === null) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  invalid(`${label} inválido`);
}

function paginated<T>(url: URL, items: T[], total: number): Response {
  if (!url.searchParams.has("page") && !url.searchParams.has("pageSize")) return json(items);
  const { page, pageSize } = pagination(url);
  return json({
    items,
    pagination: { page, limit: pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) }
  });
}

async function validateOwner(
  ctx: AdminRequestContext,
  value: unknown,
  allowNull = true
): Promise<string | null> {
  if (value === null || value === undefined || value === "") {
    if (allowNull) return null;
    invalid("Responsável inválido");
  }
  const identityId = requirePublicId(typeof value === "string" ? value : null, "Responsável");
  const row = await ctx.db.prepare(`
    SELECT i.active AS identity_active, m.active AS membership_active
    FROM admin_memberships m
    JOIN admin_identities i ON i.id = m.identity_id
    WHERE m.tenant_id = ? AND m.identity_id = ?
  `).bind(ctx.tenantId, identityId).first<{ identity_active: number; membership_active: number }>();
  if (!row) throw new HttpError(404, "NOT_FOUND", "Responsável não encontrado");
  if (row.identity_active !== 1 || row.membership_active !== 1) {
    throw new HttpError(409, "CONFLICT", "Usuário inativo não pode receber atribuição");
  }
  return identityId;
}

async function validateQualification(
  ctx: AdminRequestContext,
  payload: unknown
): Promise<Record<string, unknown>> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) invalid("Qualificação inválida");
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 4096) {
    invalid("Qualificação excede o limite permitido");
  }
  const schema = QUALIFICATION_FIELDS[ctx.tenantId];
  if (!schema) invalid("Vertical sem schema de qualificação");
  const entries = Object.entries(payload as Record<string, unknown>);
  if (!entries.length) invalid("Informe ao menos um campo de qualificação");

  const clean: Record<string, unknown> = {};
  for (const [field, value] of entries) {
    const kind = schema[field];
    if (!kind) invalid(`Campo de qualificação não permitido: ${field}`);
    if (kind === "boolean") {
      if (typeof value !== "boolean") invalid(`${field} deve ser booleano`);
      clean[field] = value;
    } else if (kind === "shortText") {
      clean[field] = commercialText(value, 120, true);
    } else if (kind === "mediumText") {
      clean[field] = commercialText(value, field === "commercialNote" ? 300 : 500, true);
    } else if (kind === "professional") {
      if (value === null || value === "") {
        clean[field] = null;
      } else {
        const professionalId = requirePublicId(typeof value === "string" ? value : null, "Profissional preferido");
        const professional = await ctx.db.prepare(
          "SELECT id FROM professionals WHERE tenant_id = ? AND id = ? AND active = 1"
        ).bind(ctx.tenantId, professionalId).first<{ id: string }>();
        if (!professional) throw new HttpError(404, "NOT_FOUND", "Profissional preferido não encontrado");
        clean[field] = professionalId;
      }
    } else if (kind === "contactPeriod") {
      clean[field] = requireEnum(value, CONTACT_PERIODS, "Melhor período de contato");
    } else {
      clean[field] = requireEnum(value, URGENCIES, "Urgência");
    }
  }
  return clean;
}

interface ClientRow {
  id: string;
  tenant_id: string;
  name: string;
  phone: string;
  normalized_phone: string;
  email: string | null;
  normalized_email: string | null;
  notes: string | null;
  first_contact_at: string;
  last_contact_at: string;
  created_at: string;
  updated_at: string;
  appointment_count?: number;
  lead_count?: number;
  follow_up_count?: number;
}

function clientPayload(row: ClientRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    phone: row.phone,
    normalizedPhone: row.normalized_phone,
    email: row.email,
    normalizedEmail: row.normalized_email,
    notes: row.notes,
    firstContactAt: row.first_contact_at,
    lastContactAt: row.last_contact_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.appointment_count === undefined ? {} : {
      _count: {
        appointments: row.appointment_count,
        leads: row.lead_count ?? 0,
        followUps: row.follow_up_count ?? 0
      }
    })
  };
}

async function loadClient(ctx: AdminRequestContext, id: string): Promise<ClientRow> {
  const row = await ctx.db.prepare(
    "SELECT * FROM clients WHERE tenant_id = ? AND id = ?"
  ).bind(ctx.tenantId, id).first<ClientRow>();
  if (!row) notFoundError();
  return row;
}

async function listClients(ctx: AdminRequestContext): Promise<Response> {
  const { pageSize, offset } = pagination(ctx.url);
  const search = sanitizeText(ctx.url.searchParams.get("search"), "Busca", 1, 120, false);
  const createdFrom = boundary(ctx.url.searchParams.get("createdFrom"));
  const createdTo = boundary(ctx.url.searchParams.get("createdTo"), true);
  const like = search ? `%${search}%` : null;

  const filter = `
    FROM clients
    WHERE tenant_id = ?
      AND (? IS NULL OR name LIKE ? OR phone LIKE ? OR email LIKE ?)
      AND (? IS NULL OR created_at >= ?)
      AND (? IS NULL OR created_at <= ?)
  `;
  const binds = [ctx.tenantId, like, like, like, like, createdFrom, createdFrom, createdTo, createdTo];

  const [count, rows] = await Promise.all([
    ctx.db.prepare(`SELECT COUNT(*) AS total ${filter}`).bind(...binds).first<{ total: number }>(),
    ctx.db.prepare(`
      SELECT clients.*,
        (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = clients.tenant_id AND a.client_id = clients.id) AS appointment_count,
        (SELECT COUNT(*) FROM leads l WHERE l.tenant_id = clients.tenant_id AND l.client_id = clients.id) AS lead_count,
        (SELECT COUNT(*) FROM follow_ups f WHERE f.tenant_id = clients.tenant_id AND f.client_id = clients.id) AS follow_up_count
      ${filter.replace("FROM clients", "FROM clients")}
      ORDER BY last_contact_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).bind(...binds, pageSize, offset).all<ClientRow>()
  ]);

  return paginated(ctx.url, rows.results.map(clientPayload), count?.total ?? 0);
}

async function getClient(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const client = await loadClient(ctx, id);
  const [appointments, leads, followUps] = await Promise.all([
    ctx.db.prepare(`
      SELECT a.id, a.appointment_date, a.start_time, a.status, a.service_id, a.professional_id,
        s.name AS service_name, p.name AS professional_name
      FROM appointments a
      JOIN services s ON s.tenant_id = a.tenant_id AND s.id = a.service_id
      JOIN professionals p ON p.tenant_id = a.tenant_id AND p.id = a.professional_id
      WHERE a.tenant_id = ? AND a.client_id = ?
      ORDER BY a.appointment_date DESC, a.start_time DESC
      LIMIT 20
    `).bind(ctx.tenantId, id).all<Record<string, string>>(),
    ctx.db.prepare(`
      SELECT id, source, status, priority, service_id, professional_id, interest_summary, created_at
      FROM leads WHERE tenant_id = ? AND client_id = ?
      ORDER BY created_at DESC LIMIT 20
    `).bind(ctx.tenantId, id).all<Record<string, string>>(),
    ctx.db.prepare(`
      SELECT id, lead_id, due_at, type, status, note, owner_identity_id, created_at
      FROM follow_ups WHERE tenant_id = ? AND client_id = ?
      ORDER BY due_at DESC LIMIT 20
    `).bind(ctx.tenantId, id).all<Record<string, string>>()
  ]);

  return json({
    ...clientPayload(client),
    appointments: appointments.results.map((row) => ({
      id: row.id,
      date: row.appointment_date,
      time: row.start_time,
      status: row.status,
      serviceId: row.service_id,
      professionalId: row.professional_id,
      service: { id: row.service_id, name: row.service_name },
      professional: { id: row.professional_id, name: row.professional_name }
    })),
    leads: leads.results.map((row) => ({
      id: row.id,
      source: row.source,
      status: row.status,
      priority: row.priority,
      serviceId: row.service_id,
      professionalId: row.professional_id,
      interestSummary: row.interest_summary,
      createdAt: row.created_at
    })),
    followUps: followUps.results.map((row) => ({
      id: row.id,
      leadId: row.lead_id,
      dueAt: row.due_at,
      type: row.type,
      status: row.status,
      note: row.note,
      ownerUserId: row.owner_identity_id,
      createdAt: row.created_at
    }))
  });
}

async function updateClient(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request);
  const current = await loadClient(ctx, id);

  const updates: string[] = [];
  const binds: unknown[] = [];
  const fields: string[] = [];

  if (Object.hasOwn(body, "name")) {
    const name = sanitizeText(body.name, "Nome", 2, 120) as string;
    updates.push("name = ?");
    binds.push(name);
    fields.push("name");
  }
  if (Object.hasOwn(body, "phone")) {
    const phone = sanitizeText(body.phone, "Telefone", 1, 30) as string;
    const normalizedPhone = phone.replace(/\D/g, "");
    if (normalizedPhone.length < 8 || normalizedPhone.length > 15) invalid("Telefone inválido");
    const duplicate = await ctx.db.prepare(
      "SELECT id FROM clients WHERE tenant_id = ? AND normalized_phone = ? AND id <> ?"
    ).bind(ctx.tenantId, normalizedPhone, id).first<{ id: string }>();
    if (duplicate) throw new HttpError(409, "CONFLICT", "Telefone já pertence a outro cliente");
    updates.push("phone = ?", "normalized_phone = ?");
    binds.push(phone, normalizedPhone);
    fields.push("phone");
  }
  if (Object.hasOwn(body, "email")) {
    const email = sanitizeText(body.email, "E-mail", 3, 254, false);
    const normalizedEmail = email?.toLowerCase() ?? null;
    if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) invalid("E-mail inválido");
    updates.push("email = ?", "normalized_email = ?");
    binds.push(email, normalizedEmail);
    fields.push("email");
  }
  if (!fields.length) invalid("Nenhum campo válido para atualizar");

  try {
    await ctx.db.batch([
      ctx.db.prepare(`
        UPDATE clients SET ${updates.join(", ")}, updated_at = ?
        WHERE tenant_id = ? AND id = ?
      `).bind(...binds, new Date().toISOString(), ctx.tenantId, id),
      relationshipEventStatement(ctx.db, {
        tenantId: ctx.tenantId,
        clientId: id,
        type: "CLIENT_UPDATED",
        actorType: "ADMIN",
        actorIdentityId: ctx.admin.identity.id,
        metadata: { fields: fields.join(",") }
      })
    ]);
  } catch (error) {
    if (isConstraintError(error)) throw new HttpError(409, "CONFLICT", "Telefone já pertence a outro cliente");
    throw error;
  }

  return json(clientPayload({ ...current, ...await loadClient(ctx, id) }));
}

async function addClientNote(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request);
  const note = commercialText(body.note, 500, true) as string;
  const leadId = body.leadId ? requirePublicId(String(body.leadId), "leadId") : null;

  await loadClient(ctx, id);
  if (leadId) {
    const lead = await ctx.db.prepare(
      "SELECT id FROM leads WHERE tenant_id = ? AND id = ? AND client_id = ?"
    ).bind(ctx.tenantId, leadId, id).first<{ id: string }>();
    if (!lead) notFoundError();
  }

  const eventId = crypto.randomUUID();
  await ctx.db.prepare(`
    INSERT INTO relationship_history_events (
      id, tenant_id, client_id, lead_id, type, actor_type, actor_identity_id, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, 'NOTE_ADDED', 'ADMIN', ?, ?, ?)
  `).bind(
    eventId,
    ctx.tenantId,
    id,
    leadId,
    ctx.admin.identity.id,
    JSON.stringify({ content: note }),
    new Date().toISOString()
  ).run();

  return json({ id: eventId, clientId: id, leadId, type: "NOTE_ADDED", metadata: { content: note } }, { status: 201 });
}

interface HistoryRow {
  id: string;
  client_id: string;
  lead_id: string | null;
  appointment_id: string | null;
  type: string;
  actor_type: string;
  actor_identity_id: string | null;
  actor_name: string | null;
  metadata_json: string | null;
  created_at: string;
}

function historyPayload(row: HistoryRow) {
  return {
    id: row.id,
    clientId: row.client_id,
    leadId: row.lead_id,
    appointmentId: row.appointment_id,
    type: row.type,
    actorType: row.actor_type,
    actorId: row.actor_identity_id,
    actor: row.actor_identity_id ? { id: row.actor_identity_id, name: row.actor_name } : null,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    createdAt: row.created_at
  };
}

async function listClientHistory(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  await loadClient(ctx, id);
  const rows = await ctx.db.prepare(`
    SELECT e.*, i.name AS actor_name
    FROM relationship_history_events e
    LEFT JOIN admin_identities i ON i.id = e.actor_identity_id
    WHERE e.tenant_id = ? AND e.client_id = ?
    ORDER BY e.created_at, e.id
  `).bind(ctx.tenantId, id).all<HistoryRow>();
  return json(rows.results.map(historyPayload));
}

interface LeadRow {
  id: string;
  tenant_id: string;
  client_id: string;
  source: string;
  status: string;
  priority: string;
  owner_identity_id: string | null;
  service_id: string | null;
  professional_id: string | null;
  interest_summary: string | null;
  qualification_json: string | null;
  qualification_version: number | null;
  lost_reason: string | null;
  lost_reason_note: string | null;
  lost_at: string | null;
  lost_by_identity_id: string | null;
  converted_at: string | null;
  converted_appointment_id: string | null;
  created_at: string;
  updated_at: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  service_name: string | null;
  professional_name: string | null;
  owner_name: string | null;
  owner_active: number | null;
}

const LEAD_SELECT = `
  SELECT leads.id, leads.tenant_id, leads.client_id, leads.source, leads.status, leads.priority,
    leads.owner_identity_id, leads.service_id, leads.professional_id, leads.interest_summary,
    leads.qualification_json, leads.qualification_version, leads.lost_reason, leads.lost_reason_note,
    leads.lost_at, leads.lost_by_identity_id, leads.converted_at, leads.converted_appointment_id,
    leads.created_at, leads.updated_at,
    clients.name AS client_name, clients.phone AS client_phone, clients.email AS client_email,
    services.name AS service_name, professionals.name AS professional_name,
    owner.name AS owner_name, owner.active AS owner_active
  FROM leads
  JOIN clients ON clients.tenant_id = leads.tenant_id AND clients.id = leads.client_id
  LEFT JOIN services ON services.tenant_id = leads.tenant_id AND services.id = leads.service_id
  LEFT JOIN professionals ON professionals.tenant_id = leads.tenant_id AND professionals.id = leads.professional_id
  LEFT JOIN admin_identities owner ON owner.id = leads.owner_identity_id
`;

interface FollowUpRow {
  id: string;
  tenant_id: string;
  client_id: string;
  lead_id: string | null;
  due_at: string;
  type: string;
  status: string;
  note: string | null;
  completed_at: string | null;
  created_by_identity_id: string;
  completed_by_identity_id: string | null;
  owner_identity_id: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string;
  client_phone?: string;
  owner_name?: string | null;
  owner_active?: number | null;
  created_by_name?: string | null;
  completed_by_name?: string | null;
  lead_source?: string | null;
  lead_status?: string | null;
  lead_priority?: string | null;
  lead_interest?: string | null;
}

const FOLLOW_UP_SELECT = `
  SELECT follow_ups.*, clients.name AS client_name, clients.phone AS client_phone,
    owner.name AS owner_name, owner.active AS owner_active,
    creator.name AS created_by_name, completer.name AS completed_by_name,
    leads.source AS lead_source, leads.status AS lead_status,
    leads.priority AS lead_priority, leads.interest_summary AS lead_interest
  FROM follow_ups
  JOIN clients ON clients.tenant_id = follow_ups.tenant_id AND clients.id = follow_ups.client_id
  LEFT JOIN admin_identities owner ON owner.id = follow_ups.owner_identity_id
  LEFT JOIN admin_identities creator ON creator.id = follow_ups.created_by_identity_id
  LEFT JOIN admin_identities completer ON completer.id = follow_ups.completed_by_identity_id
  LEFT JOIN leads ON leads.tenant_id = follow_ups.tenant_id AND leads.id = follow_ups.lead_id
`;

function followUpPayload(row: FollowUpRow, now = new Date().toISOString()) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    leadId: row.lead_id,
    dueAt: row.due_at,
    type: row.type,
    status: row.status,
    note: row.note,
    completedAt: row.completed_at,
    createdByUserId: row.created_by_identity_id,
    completedByUserId: row.completed_by_identity_id,
    ownerUserId: row.owner_identity_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    client: row.client_name === undefined
      ? undefined
      : { id: row.client_id, name: row.client_name, phone: row.client_phone },
    owner: row.owner_identity_id
      ? { id: row.owner_identity_id, name: row.owner_name ?? null, active: row.owner_active === 1 }
      : null,
    createdBy: { id: row.created_by_identity_id, name: row.created_by_name ?? null },
    completedBy: row.completed_by_identity_id
      ? { id: row.completed_by_identity_id, name: row.completed_by_name ?? null }
      : null,
    lead: row.lead_id
      ? {
          id: row.lead_id,
          source: row.lead_source ?? null,
          status: row.lead_status ?? null,
          priority: row.lead_priority ?? null,
          interestSummary: row.lead_interest ?? null
        }
      : null,
    overdue: row.status === "OPEN" && row.due_at < now
  };
}

function leadPayload(row: LeadRow, nextFollowUp: ReturnType<typeof followUpPayload> | null) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    source: row.source,
    status: row.status,
    priority: row.priority,
    ownerUserId: row.owner_identity_id,
    serviceId: row.service_id,
    professionalId: row.professional_id,
    interestSummary: row.interest_summary,
    qualification: row.qualification_json ? JSON.parse(row.qualification_json) : null,
    qualificationVersion: row.qualification_version,
    lostReason: row.lost_reason,
    lostReasonNote: row.lost_reason_note,
    lostAt: row.lost_at,
    lostByUserId: row.lost_by_identity_id,
    convertedAt: row.converted_at,
    convertedAppointmentId: row.converted_appointment_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    client: { id: row.client_id, name: row.client_name, phone: row.client_phone, email: row.client_email },
    service: row.service_id ? { id: row.service_id, name: row.service_name } : null,
    professional: row.professional_id ? { id: row.professional_id, name: row.professional_name } : null,
    owner: row.owner_identity_id
      ? { id: row.owner_identity_id, name: row.owner_name, active: row.owner_active === 1 }
      : null,
    nextFollowUp,
    overdue: Boolean(nextFollowUp?.overdue)
  };
}

async function nextFollowUpFor(ctx: AdminRequestContext, leadIds: string[]) {
  if (!leadIds.length) return new Map<string, ReturnType<typeof followUpPayload>>();
  const placeholders = leadIds.map(() => "?").join(", ");
  const rows = await ctx.db.prepare(`
    ${FOLLOW_UP_SELECT}
    WHERE follow_ups.tenant_id = ? AND follow_ups.status = 'OPEN'
      AND follow_ups.lead_id IN (${placeholders})
    ORDER BY follow_ups.due_at, follow_ups.id
  `).bind(ctx.tenantId, ...leadIds).all<FollowUpRow>();
  const map = new Map<string, ReturnType<typeof followUpPayload>>();
  for (const row of rows.results) {
    if (row.lead_id && !map.has(row.lead_id)) map.set(row.lead_id, followUpPayload(row));
  }
  return map;
}

async function loadLead(ctx: AdminRequestContext, id: string): Promise<LeadRow> {
  const row = await ctx.db.prepare(`${LEAD_SELECT} WHERE leads.tenant_id = ? AND leads.id = ?`)
    .bind(ctx.tenantId, id).first<LeadRow>();
  if (!row) notFoundError();
  return row;
}

async function respondLead(ctx: AdminRequestContext, id: string, status = 200): Promise<Response> {
  const lead = await loadLead(ctx, id);
  const next = await nextFollowUpFor(ctx, [id]);
  return json(leadPayload(lead, next.get(id) ?? null), { status });
}

async function listLeads(ctx: AdminRequestContext): Promise<Response> {
  const { pageSize, offset } = pagination(ctx.url);
  const query = ctx.url.searchParams;
  const status = query.get("status");
  const source = query.get("source");
  const priority = query.get("priority");
  if (status && !LEAD_STATUSES.includes(status as never)) invalid("Status inválido");
  if (source && !LEAD_SOURCES.includes(source as never)) invalid("Origem inválida");
  if (priority && !LEAD_PRIORITIES.includes(priority as never)) invalid("Prioridade inválida");
  const ownerUserId = query.get("ownerUserId") ? requirePublicId(query.get("ownerUserId"), "Responsável") : null;
  const search = sanitizeText(query.get("search"), "Busca", 1, 120, false);
  const like = search ? `%${search}%` : null;
  const createdFrom = boundary(query.get("createdFrom"));
  const createdTo = boundary(query.get("createdTo"), true);
  const overdue = booleanQuery(query.get("overdue"), "Filtro de vencidos");
  const noNextAction = booleanQuery(query.get("noNextAction"), "Filtro sem próxima ação");
  const unassigned = booleanQuery(query.get("unassigned"), "Filtro sem responsável");
  const attention = booleanQuery(query.get("attention"), "Filtro de atenção");
  const now = new Date().toISOString();
  const activeOnly = noNextAction || attention || (unassigned && !status);

  const conditions = [
    "leads.tenant_id = ?",
    "(? IS NULL OR leads.status = ?)",
    "(? IS NULL OR leads.source = ?)",
    "(? IS NULL OR leads.priority = ?)",
    "(? IS NULL OR leads.owner_identity_id = ?)",
    "(? IS NULL OR clients.name LIKE ? OR clients.phone LIKE ? OR leads.interest_summary LIKE ?)",
    "(? IS NULL OR leads.created_at >= ?)",
    "(? IS NULL OR leads.created_at <= ?)"
  ];
  const binds: unknown[] = [
    ctx.tenantId,
    status, status,
    source, source,
    priority, priority,
    ownerUserId, ownerUserId,
    like, like, like, like,
    createdFrom, createdFrom,
    createdTo, createdTo
  ];

  if (unassigned) conditions.push("leads.owner_identity_id IS NULL");
  if (activeOnly) conditions.push("leads.status IN ('NEW', 'CONTACTED', 'QUALIFIED')");
  if (overdue) {
    conditions.push(`EXISTS (
      SELECT 1 FROM follow_ups f
      WHERE f.tenant_id = leads.tenant_id AND f.lead_id = leads.id AND f.status = 'OPEN' AND f.due_at < ?
    )`);
    binds.push(now);
  }
  if (noNextAction) {
    conditions.push(`NOT EXISTS (
      SELECT 1 FROM follow_ups f
      WHERE f.tenant_id = leads.tenant_id AND f.lead_id = leads.id AND f.status = 'OPEN'
    )`);
  }
  // Fila de atenção: lead ativo sem próxima ação, com follow-up vencido ou sem responsável.
  if (attention) {
    conditions.push(`(
      NOT EXISTS (SELECT 1 FROM follow_ups f WHERE f.tenant_id = leads.tenant_id AND f.lead_id = leads.id AND f.status = 'OPEN')
      OR EXISTS (SELECT 1 FROM follow_ups f WHERE f.tenant_id = leads.tenant_id AND f.lead_id = leads.id AND f.status = 'OPEN' AND f.due_at < ?)
      OR leads.owner_identity_id IS NULL
    )`);
    binds.push(now);
  }

  const where = conditions.join(" AND ");
  const [count, rows] = await Promise.all([
    ctx.db.prepare(`
      SELECT COUNT(*) AS total FROM leads
      JOIN clients ON clients.tenant_id = leads.tenant_id AND clients.id = leads.client_id
      WHERE ${where}
    `).bind(...binds).first<{ total: number }>(),
    ctx.db.prepare(`
      ${LEAD_SELECT} WHERE ${where}
      ORDER BY leads.created_at DESC, leads.id DESC
      LIMIT ? OFFSET ?
    `).bind(...binds, pageSize, offset).all<LeadRow>()
  ]);

  const next = await nextFollowUpFor(ctx, rows.results.map((row) => row.id));
  const items = rows.results.map((row) => leadPayload(row, next.get(row.id) ?? null));
  return paginated(ctx.url, items, count?.total ?? 0);
}

async function getLead(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const lead = await loadLead(ctx, id);
  const [history, followUps, appointments] = await Promise.all([
    ctx.db.prepare(`
      SELECT e.*, i.name AS actor_name
      FROM relationship_history_events e
      LEFT JOIN admin_identities i ON i.id = e.actor_identity_id
      WHERE e.tenant_id = ? AND e.lead_id = ?
      ORDER BY e.created_at, e.id
    `).bind(ctx.tenantId, id).all<HistoryRow>(),
    ctx.db.prepare(`
      ${FOLLOW_UP_SELECT}
      WHERE follow_ups.tenant_id = ? AND follow_ups.lead_id = ?
      ORDER BY follow_ups.due_at, follow_ups.id
    `).bind(ctx.tenantId, id).all<FollowUpRow>(),
    ctx.db.prepare(`
      SELECT id, appointment_date, start_time, status FROM appointments
      WHERE tenant_id = ? AND lead_id = ?
      ORDER BY appointment_date DESC, start_time DESC
    `).bind(ctx.tenantId, id).all<{ id: string; appointment_date: string; start_time: string; status: string }>()
  ]);

  const open = followUps.results.filter((row) => row.status === "OPEN").map((row) => followUpPayload(row));
  return json({
    ...leadPayload(lead, open[0] ?? null),
    followUps: followUps.results.map((row) => followUpPayload(row)),
    relationshipHistory: history.results.map(historyPayload),
    sourceAppointments: appointments.results.map((row) => ({
      id: row.id,
      date: row.appointment_date,
      time: row.start_time,
      status: row.status
    }))
  });
}

async function followUpFields(body: Record<string, unknown>) {
  const dueAt = requireIsoDateTime(body.dueAt, "Data do follow-up");
  const type = requireEnum(body.type, FOLLOW_UP_TYPES, "Tipo de follow-up");
  return { dueAt, type, note: sanitizeText(body.note, "Nota", 1, 500, false) };
}

function followUpInsert(
  ctx: AdminRequestContext,
  input: {
    id: string;
    clientId: string;
    leadId: string | null;
    dueAt: string;
    type: string;
    note: string | null;
    ownerId: string | null;
  }
): D1PreparedStatement {
  const now = new Date().toISOString();
  return ctx.db.prepare(`
    INSERT INTO follow_ups (
      id, tenant_id, client_id, lead_id, due_at, type, status, note,
      created_by_identity_id, owner_identity_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?)
  `).bind(
    input.id,
    ctx.tenantId,
    input.clientId,
    input.leadId,
    input.dueAt,
    input.type,
    input.note,
    ctx.admin.identity.id,
    input.ownerId,
    now,
    now
  );
}

async function createLead(ctx: AdminRequestContext): Promise<Response> {
  const body = await readJsonObject(ctx.request, 16384);
  const clientId = requirePublicId(typeof body.clientId === "string" ? body.clientId : null, "clientId");
  const source = requireEnum(body.source ?? "MANUAL", LEAD_SOURCES, "Origem");
  const priority = requireEnum(body.priority ?? "NORMAL", LEAD_PRIORITIES, "Prioridade");
  if (!body.nextFollowUp) invalid("Próxima ação é obrigatória para um lead ativo");

  const client = await loadClient(ctx, clientId);
  const serviceId = body.serviceId ? requirePublicId(String(body.serviceId), "serviceId") : null;
  const professionalId = body.professionalId ? requirePublicId(String(body.professionalId), "professionalId") : null;
  if (serviceId) {
    const service = await ctx.db.prepare("SELECT id FROM services WHERE tenant_id = ? AND id = ? AND active = 1")
      .bind(ctx.tenantId, serviceId).first<{ id: string }>();
    if (!service) notFoundError();
  }
  if (professionalId) {
    const professional = await ctx.db.prepare("SELECT id FROM professionals WHERE tenant_id = ? AND id = ? AND active = 1")
      .bind(ctx.tenantId, professionalId).first<{ id: string }>();
    if (!professional) notFoundError();
  }

  const ownerId = await validateOwner(ctx, body.ownerUserId ?? ctx.admin.identity.id, false);
  const qualification = body.qualification ? await validateQualification(ctx, body.qualification) : null;
  const interestSummary = sanitizeText(body.interestSummary, "Interesse", 1, 500, false);
  const dedupeKey = await sha256Hex([
    source,
    serviceId ?? 0,
    professionalId ?? 0,
    interestSummary?.toLowerCase() ?? ""
  ].join("|"));

  const existing = await ctx.db.prepare(`
    SELECT id FROM leads
    WHERE tenant_id = ? AND client_id = ? AND dedupe_key = ?
      AND status IN ('NEW', 'CONTACTED', 'QUALIFIED')
  `).bind(ctx.tenantId, clientId, dedupeKey).first<{ id: string }>();
  if (existing) return respondLead(ctx, existing.id);

  const leadId = crypto.randomUUID();
  const followUp = await followUpFields(body.nextFollowUp as Record<string, unknown>);
  const followUpOwner = await validateOwner(
    ctx,
    (body.nextFollowUp as Record<string, unknown>).ownerUserId ?? ownerId
  );
  const followUpId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await ctx.db.batch([
      ctx.db.prepare(`
        INSERT INTO leads (
          id, tenant_id, client_id, source, status, priority, owner_identity_id,
          service_id, professional_id, interest_summary, qualification_json,
          qualification_version, dedupe_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'NEW', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        leadId, ctx.tenantId, clientId, source, priority, ownerId,
        serviceId, professionalId, interestSummary,
        qualification ? JSON.stringify(qualification) : null,
        qualification ? 1 : null, dedupeKey, now, now
      ),
      relationshipEventStatement(ctx.db, {
        tenantId: ctx.tenantId,
        clientId,
        leadId,
        type: "LEAD_CREATED",
        actorType: "ADMIN",
        actorIdentityId: ctx.admin.identity.id,
        metadata: { source }
      }),
      followUpInsert(ctx, {
        id: followUpId,
        clientId: client.id,
        leadId,
        dueAt: followUp.dueAt,
        type: followUp.type,
        note: followUp.note,
        ownerId: followUpOwner
      }),
      relationshipEventStatement(ctx.db, {
        tenantId: ctx.tenantId,
        clientId,
        leadId,
        type: "FOLLOW_UP_CREATED",
        actorType: "ADMIN",
        actorIdentityId: ctx.admin.identity.id,
        metadata: { followUpId }
      })
    ]);
  } catch (error) {
    if (isConstraintError(error)) throw new HttpError(409, "CONFLICT", "Lead ativo equivalente já existe");
    throw error;
  }

  return respondLead(ctx, leadId, 201);
}

function assertLeadTransition(from: string, to: string): { idempotent: boolean } {
  if (!Object.hasOwn(LEAD_TRANSITIONS, to)) invalid("Status de lead inválido");
  if (from === to) return { idempotent: true };
  if (!LEAD_TRANSITIONS[from]?.includes(to)) {
    throw new HttpError(409, "CONFLICT", `Transição de ${from} para ${to} não permitida`);
  }
  return { idempotent: false };
}

async function updateLeadStatus(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request, 16384);
  const toStatus = typeof body.status === "string" ? body.status : "";
  if (["CONVERTED", "LOST"].includes(toStatus)) {
    invalid("Use a ação específica para converter ou perder o lead");
  }
  const lead = await loadLead(ctx, id);
  const transition = assertLeadTransition(lead.status, toStatus);
  if (transition.idempotent) return respondLead(ctx, id);

  const open = await ctx.db.prepare(`
    SELECT COUNT(*) AS total FROM follow_ups
    WHERE tenant_id = ? AND lead_id = ? AND status = 'OPEN'
  `).bind(ctx.tenantId, id).first<{ total: number }>();

  const statements: D1PreparedStatement[] = [];
  if (!open?.total) {
    if (!body.nextFollowUp) throw new HttpError(409, "CONFLICT", "Crie a próxima ação antes de avançar o lead");
    const fields = await followUpFields(body.nextFollowUp as Record<string, unknown>);
    const ownerId = await validateOwner(
      ctx,
      (body.nextFollowUp as Record<string, unknown>).ownerUserId ?? lead.owner_identity_id
    );
    const followUpId = crypto.randomUUID();
    statements.push(
      followUpInsert(ctx, {
        id: followUpId,
        clientId: lead.client_id,
        leadId: id,
        dueAt: fields.dueAt,
        type: fields.type,
        note: fields.note,
        ownerId
      }),
      relationshipEventStatement(ctx.db, {
        tenantId: ctx.tenantId,
        clientId: lead.client_id,
        leadId: id,
        type: "FOLLOW_UP_CREATED",
        actorType: "ADMIN",
        actorIdentityId: ctx.admin.identity.id,
        metadata: { followUpId }
      })
    );
  }

  statements.push(
    ctx.db.prepare("UPDATE leads SET status = ?, updated_at = ? WHERE tenant_id = ? AND id = ? AND status = ?")
      .bind(toStatus, new Date().toISOString(), ctx.tenantId, id, lead.status),
    relationshipEventStatement(ctx.db, {
      tenantId: ctx.tenantId,
      clientId: lead.client_id,
      leadId: id,
      type: "LEAD_STATUS_CHANGED",
      actorType: "ADMIN",
      actorIdentityId: ctx.admin.identity.id,
      metadata: { fromStatus: lead.status, toStatus }
    })
  );

  await ctx.db.batch(statements);
  return respondLead(ctx, id);
}

async function updateLeadPriority(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request);
  const priority = requireEnum(body.priority, LEAD_PRIORITIES, "Prioridade");
  const lead = await loadLead(ctx, id);
  if (lead.priority === priority) return respondLead(ctx, id);

  await ctx.db.batch([
    ctx.db.prepare("UPDATE leads SET priority = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
      .bind(priority, new Date().toISOString(), ctx.tenantId, id),
    relationshipEventStatement(ctx.db, {
      tenantId: ctx.tenantId,
      clientId: lead.client_id,
      leadId: id,
      type: "LEAD_PRIORITY_CHANGED",
      actorType: "ADMIN",
      actorIdentityId: ctx.admin.identity.id,
      metadata: { fromPriority: lead.priority, toPriority: priority }
    })
  ]);
  return respondLead(ctx, id);
}

async function assignLeadOwner(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request);
  const lead = await loadLead(ctx, id);
  const ownerId = await validateOwner(ctx, body.ownerUserId ?? null);
  if (lead.owner_identity_id === ownerId) return respondLead(ctx, id);

  await ctx.db.batch([
    ctx.db.prepare("UPDATE leads SET owner_identity_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
      .bind(ownerId, new Date().toISOString(), ctx.tenantId, id),
    relationshipEventStatement(ctx.db, {
      tenantId: ctx.tenantId,
      clientId: lead.client_id,
      leadId: id,
      type: "LEAD_OWNER_CHANGED",
      actorType: "ADMIN",
      actorIdentityId: ctx.admin.identity.id,
      metadata: { fromOwnerUserId: lead.owner_identity_id ?? 0, toOwnerUserId: ownerId ?? 0 }
    })
  ]);
  return respondLead(ctx, id);
}

async function updateLeadQualification(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request, 16384);
  const lead = await loadLead(ctx, id);
  const qualification = await validateQualification(ctx, body.qualification);

  await ctx.db.batch([
    ctx.db.prepare(`
      UPDATE leads SET qualification_json = ?, qualification_version = 1, updated_at = ?
      WHERE tenant_id = ? AND id = ?
    `).bind(JSON.stringify(qualification), new Date().toISOString(), ctx.tenantId, id),
    relationshipEventStatement(ctx.db, {
      tenantId: ctx.tenantId,
      clientId: lead.client_id,
      leadId: id,
      type: "LEAD_QUALIFICATION_UPDATED",
      actorType: "ADMIN",
      actorIdentityId: ctx.admin.identity.id,
      metadata: { fields: Object.keys(qualification).join(","), qualificationVersion: 1 }
    })
  ]);
  return respondLead(ctx, id);
}

function closeOpenFollowUpStatements(
  ctx: AdminRequestContext,
  lead: LeadRow,
  openIds: string[]
): D1PreparedStatement[] {
  const now = new Date().toISOString();
  return openIds.flatMap((followUpId) => [
    ctx.db.prepare("UPDATE follow_ups SET status = 'CANCELLED', updated_at = ? WHERE tenant_id = ? AND id = ? AND status = 'OPEN'")
      .bind(now, ctx.tenantId, followUpId),
    relationshipEventStatement(ctx.db, {
      tenantId: ctx.tenantId,
      clientId: lead.client_id,
      leadId: lead.id,
      type: "FOLLOW_UP_CANCELLED",
      actorType: "ADMIN",
      actorIdentityId: ctx.admin.identity.id,
      metadata: { followUpId, reason: "LEAD_TERMINAL" }
    })
  ]);
}

async function openFollowUpIds(ctx: AdminRequestContext, leadId: string): Promise<string[]> {
  const rows = await ctx.db.prepare(
    "SELECT id FROM follow_ups WHERE tenant_id = ? AND lead_id = ? AND status = 'OPEN' ORDER BY id"
  ).bind(ctx.tenantId, leadId).all<{ id: string }>();
  return rows.results.map((row) => row.id);
}

async function loseLead(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request);
  const lead = await loadLead(ctx, id);
  const transition = assertLeadTransition(lead.status, "LOST");
  if (transition.idempotent) return respondLead(ctx, id);

  const legacyReason = body.lostReason ? null : sanitizeText(body.reason, "Motivo", 1, 300, false);
  const lostReason = requireEnum(
    body.lostReason ?? (legacyReason ? "OTHER" : null),
    LOST_REASONS,
    "Motivo da perda"
  );
  const lostReasonNote = sanitizeText(body.lostReasonNote ?? legacyReason, "Observação", 1, 300, false);
  if (lostReason === "OTHER" && !lostReasonNote) invalid("Observação é obrigatória para o motivo OTHER");

  const openIds = await openFollowUpIds(ctx, id);
  const now = new Date().toISOString();
  await ctx.db.batch([
    ctx.db.prepare(`
      UPDATE leads
      SET status = 'LOST', lost_reason = ?, lost_reason_note = ?, lost_at = ?,
        lost_by_identity_id = ?, updated_at = ?
      WHERE tenant_id = ? AND id = ? AND status = ?
    `).bind(lostReason, lostReasonNote, now, ctx.admin.identity.id, now, ctx.tenantId, id, lead.status),
    relationshipEventStatement(ctx.db, {
      tenantId: ctx.tenantId,
      clientId: lead.client_id,
      leadId: id,
      type: "LEAD_STATUS_CHANGED",
      actorType: "ADMIN",
      actorIdentityId: ctx.admin.identity.id,
      metadata: { fromStatus: lead.status, toStatus: "LOST" }
    }),
    ...closeOpenFollowUpStatements(ctx, lead, openIds),
    relationshipEventStatement(ctx.db, {
      tenantId: ctx.tenantId,
      clientId: lead.client_id,
      leadId: id,
      type: "LEAD_LOST",
      actorType: "ADMIN",
      actorIdentityId: ctx.admin.identity.id,
      metadata: { lostReason, lostReasonNote, closedFollowUps: openIds.length }
    })
  ]);
  return respondLead(ctx, id);
}

async function linkableAppointment(ctx: AdminRequestContext, lead: LeadRow, appointmentId: string) {
  const appointment = await ctx.db.prepare(
    "SELECT id, client_id, lead_id, status FROM appointments WHERE tenant_id = ? AND id = ?"
  ).bind(ctx.tenantId, appointmentId).first<{ id: string; client_id: string; lead_id: string | null; status: string }>();
  if (!appointment) notFoundError();
  if (appointment.client_id !== lead.client_id) {
    throw new HttpError(409, "CONFLICT", "Lead e agendamento pertencem a clientes diferentes");
  }
  if (appointment.status === "CANCELLED") {
    throw new HttpError(409, "CONFLICT", "Agendamento cancelado não pode gerar conversão");
  }
  if (appointment.lead_id && appointment.lead_id !== lead.id) {
    throw new HttpError(409, "CONFLICT", "Agendamento já está vinculado a outro lead");
  }
  return appointment;
}

function linkStatements(
  ctx: AdminRequestContext,
  lead: LeadRow,
  appointment: { id: string; lead_id: string | null }
): D1PreparedStatement[] {
  if (appointment.lead_id) return [];
  return [
    ctx.db.prepare("UPDATE appointments SET lead_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ? AND lead_id IS NULL")
      .bind(lead.id, new Date().toISOString(), ctx.tenantId, appointment.id),
    relationshipEventStatement(ctx.db, {
      tenantId: ctx.tenantId,
      clientId: lead.client_id,
      leadId: lead.id,
      appointmentId: appointment.id,
      type: "APPOINTMENT_LINKED",
      actorType: "ADMIN",
      actorIdentityId: ctx.admin.identity.id,
      metadata: { appointmentId: appointment.id, leadId: lead.id }
    })
  ];
}

async function linkLeadAppointment(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request);
  const appointmentId = requirePublicId(typeof body.appointmentId === "string" ? body.appointmentId : null, "appointmentId");
  const lead = await loadLead(ctx, id);
  const appointment = await linkableAppointment(ctx, lead, appointmentId);
  const statements = linkStatements(ctx, lead, appointment);
  if (statements.length) await ctx.db.batch(statements);
  return respondLead(ctx, id);
}

// Agendamento criado pelo painel a partir do lead: mesma reserva atômica do
// fluxo público, com ator ADMIN e sem token público de gestão.
async function createAppointmentFromLead(
  ctx: AdminRequestContext,
  lead: LeadRow,
  payload: Record<string, unknown>
): Promise<{ id: string; statements: D1PreparedStatement[] }> {
  const serviceId = requirePublicId(
    typeof payload.serviceId === "string" ? payload.serviceId : lead.service_id,
    "serviceId"
  );
  const professionalId = requirePublicId(
    typeof payload.professionalId === "string" ? payload.professionalId : lead.professional_id,
    "professionalId"
  );
  const date = requireDateValue(payload.date);
  const time = requireTimeValue(payload.time);

  const availability = await calculateD1Availability(
    ctx.db,
    ctx.tenantId,
    new URLSearchParams({ date, serviceId, professionalId })
  );
  if (!availability.slots.includes(time)) {
    throw new HttpError(409, "CONFLICT", "Horário indisponível");
  }

  const appointmentId = crypto.randomUUID();
  const endTime = endTimeFor(time, availability.durationMinutes);
  const now = new Date().toISOString();
  const slots = Array.from(
    { length: Math.ceil(availability.durationMinutes / availability.slotMinutes) },
    (_, index) => endTimeFor(time, index * availability.slotMinutes)
  );

  return {
    id: appointmentId,
    statements: [
      ctx.db.prepare(`
        INSERT INTO appointments (
          id, tenant_id, service_id, professional_id, client_id, lead_id,
          client_name, client_phone, client_email, appointment_date,
          start_time, end_time, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
      `).bind(
        appointmentId, ctx.tenantId, serviceId, professionalId, lead.client_id, lead.id,
        lead.client_name, lead.client_phone, lead.client_email, date, time, endTime, now, now
      ),
      ...slots.map((slot) => ctx.db.prepare(`
        INSERT INTO appointment_slots (tenant_id, professional_id, appointment_date, slot_time, appointment_id)
        VALUES (?, ?, ?, ?, ?)
      `).bind(ctx.tenantId, professionalId, date, slot, appointmentId)),
      appointmentHistoryStatement(ctx.db, {
        tenantId: ctx.tenantId,
        appointmentId,
        type: "CREATED",
        toStatus: "PENDING",
        actorType: "ADMIN",
        actorIdentityId: ctx.admin.identity.id
      }),
      relationshipEventStatement(ctx.db, {
        tenantId: ctx.tenantId,
        clientId: lead.client_id,
        leadId: lead.id,
        appointmentId,
        type: "APPOINTMENT_LINKED",
        actorType: "ADMIN",
        actorIdentityId: ctx.admin.identity.id,
        metadata: { appointmentId, leadId: lead.id }
      })
    ]
  };
}

async function convertLead(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request, 16384);
  const lead = await loadLead(ctx, id);
  const requestedId = body.appointmentId
    ? requirePublicId(String(body.appointmentId), "appointmentId")
    : null;
  const transition = assertLeadTransition(lead.status, "CONVERTED");
  if (transition.idempotent) {
    if (requestedId && lead.converted_appointment_id !== requestedId) {
      throw new HttpError(409, "CONFLICT", "Lead já convertido por outro agendamento");
    }
    return respondLead(ctx, id);
  }
  if (!requestedId && !body.appointment) {
    invalid("Informe um agendamento existente ou os dados para criar um");
  }

  const created = requestedId
    ? null
    : await createAppointmentFromLead(ctx, lead, body.appointment as Record<string, unknown>);
  const appointment = requestedId
    ? await linkableAppointment(ctx, lead, requestedId)
    : { id: created!.id, lead_id: lead.id };
  const openIds = await openFollowUpIds(ctx, id);
  const now = new Date().toISOString();

  await ctx.db.batch([
    ...(created ? created.statements : linkStatements(ctx, lead, appointment)),
    ctx.db.prepare(`
      UPDATE leads SET status = 'CONVERTED', converted_at = ?, converted_appointment_id = ?, updated_at = ?
      WHERE tenant_id = ? AND id = ? AND status = ?
    `).bind(now, appointment.id, now, ctx.tenantId, id, lead.status),
    relationshipEventStatement(ctx.db, {
      tenantId: ctx.tenantId,
      clientId: lead.client_id,
      leadId: id,
      appointmentId: appointment.id,
      type: "LEAD_STATUS_CHANGED",
      actorType: "ADMIN",
      actorIdentityId: ctx.admin.identity.id,
      metadata: { fromStatus: lead.status, toStatus: "CONVERTED" }
    }),
    ...closeOpenFollowUpStatements(ctx, lead, openIds),
    relationshipEventStatement(ctx.db, {
      tenantId: ctx.tenantId,
      clientId: lead.client_id,
      leadId: id,
      appointmentId: appointment.id,
      type: "LEAD_CONVERTED",
      actorType: "ADMIN",
      actorIdentityId: ctx.admin.identity.id,
      metadata: {
        fromStatus: lead.status,
        toStatus: "CONVERTED",
        appointmentId: appointment.id,
        closedFollowUps: openIds.length
      }
    })
  ]);
  return respondLead(ctx, id);
}

async function addLeadNote(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request);
  const content = commercialText(body.content ?? body.note, 500, true) as string;
  const lead = await loadLead(ctx, id);
  const eventId = crypto.randomUUID();

  await ctx.db.prepare(`
    INSERT INTO relationship_history_events (
      id, tenant_id, client_id, lead_id, type, actor_type, actor_identity_id, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, 'NOTE_ADDED', 'ADMIN', ?, ?, ?)
  `).bind(
    eventId,
    ctx.tenantId,
    lead.client_id,
    id,
    ctx.admin.identity.id,
    JSON.stringify({ content }),
    new Date().toISOString()
  ).run();

  return json({ id: eventId, clientId: lead.client_id, leadId: id, type: "NOTE_ADDED", metadata: { content } }, { status: 201 });
}

async function loadFollowUp(ctx: AdminRequestContext, id: string): Promise<FollowUpRow> {
  const row = await ctx.db.prepare(`${FOLLOW_UP_SELECT} WHERE follow_ups.tenant_id = ? AND follow_ups.id = ?`)
    .bind(ctx.tenantId, id).first<FollowUpRow>();
  if (!row) notFoundError();
  return row;
}

async function listFollowUps(ctx: AdminRequestContext): Promise<Response> {
  const { pageSize, offset } = pagination(ctx.url);
  const query = ctx.url.searchParams;
  const status = query.get("status");
  const type = query.get("type");
  if (status && !["OPEN", "COMPLETED", "CANCELLED"].includes(status)) invalid("Status inválido");
  if (type && !FOLLOW_UP_TYPES.includes(type as never)) invalid("Tipo inválido");
  const ownerUserId = query.get("ownerUserId") ? requirePublicId(query.get("ownerUserId"), "Responsável") : null;
  const unassigned = booleanQuery(query.get("unassigned"), "Filtro sem responsável");
  const overdue = booleanQuery(query.get("overdue"), "Filtro de vencidos");
  const search = sanitizeText(query.get("search"), "Busca", 1, 120, false);
  const like = search ? `%${search}%` : null;
  const from = overdue ? null : boundary(query.get("from"));
  const to = overdue ? null : boundary(query.get("to"), true);
  const createdFrom = boundary(query.get("createdFrom"));
  const createdTo = boundary(query.get("createdTo"), true);
  const now = new Date().toISOString();

  const conditions = [
    "follow_ups.tenant_id = ?",
    "(? IS NULL OR follow_ups.status = ?)",
    "(? IS NULL OR follow_ups.type = ?)",
    "(? IS NULL OR follow_ups.owner_identity_id = ?)",
    "(? IS NULL OR clients.name LIKE ? OR clients.phone LIKE ? OR follow_ups.note LIKE ?)",
    "(? IS NULL OR follow_ups.due_at >= ?)",
    "(? IS NULL OR follow_ups.due_at <= ?)",
    "(? IS NULL OR follow_ups.created_at >= ?)",
    "(? IS NULL OR follow_ups.created_at <= ?)"
  ];
  const binds: unknown[] = [
    ctx.tenantId,
    status, status,
    type, type,
    ownerUserId, ownerUserId,
    like, like, like, like,
    from, from,
    to, to,
    createdFrom, createdFrom,
    createdTo, createdTo
  ];
  if (unassigned) conditions.push("follow_ups.owner_identity_id IS NULL");
  if (overdue) {
    conditions.push("follow_ups.status = 'OPEN'", "follow_ups.due_at < ?");
    binds.push(now);
  }

  const where = conditions.join(" AND ");
  const [count, rows] = await Promise.all([
    ctx.db.prepare(`
      SELECT COUNT(*) AS total FROM follow_ups
      JOIN clients ON clients.tenant_id = follow_ups.tenant_id AND clients.id = follow_ups.client_id
      WHERE ${where}
    `).bind(...binds).first<{ total: number }>(),
    ctx.db.prepare(`
      ${FOLLOW_UP_SELECT} WHERE ${where}
      ORDER BY follow_ups.due_at, follow_ups.id
      LIMIT ? OFFSET ?
    `).bind(...binds, pageSize, offset).all<FollowUpRow>()
  ]);

  return paginated(ctx.url, rows.results.map((row) => followUpPayload(row, now)), count?.total ?? 0);
}

async function createFollowUp(ctx: AdminRequestContext): Promise<Response> {
  const body = await readJsonObject(ctx.request, 16384);
  const clientId = requirePublicId(typeof body.clientId === "string" ? body.clientId : null, "clientId");
  const leadId = body.leadId ? requirePublicId(String(body.leadId), "leadId") : null;
  const client = await loadClient(ctx, clientId);

  let defaultOwner: string | null = ctx.admin.identity.id;
  if (leadId) {
    const lead = await ctx.db.prepare(
      "SELECT id, status, owner_identity_id FROM leads WHERE tenant_id = ? AND id = ? AND client_id = ?"
    ).bind(ctx.tenantId, leadId, clientId).first<{ id: string; status: string; owner_identity_id: string | null }>();
    if (!lead) notFoundError();
    if (!ACTIVE_LEAD.includes(lead.status)) {
      throw new HttpError(409, "CONFLICT", "Lead terminal não recebe nova próxima ação");
    }
    defaultOwner = lead.owner_identity_id ?? ctx.admin.identity.id;
  }

  const fields = await followUpFields(body);
  const ownerId = await validateOwner(ctx, body.ownerUserId ?? defaultOwner);
  const followUpId = crypto.randomUUID();

  await ctx.db.batch([
    followUpInsert(ctx, {
      id: followUpId,
      clientId: client.id,
      leadId,
      dueAt: fields.dueAt,
      type: fields.type,
      note: fields.note,
      ownerId
    }),
    relationshipEventStatement(ctx.db, {
      tenantId: ctx.tenantId,
      clientId,
      leadId,
      type: "FOLLOW_UP_CREATED",
      actorType: "ADMIN",
      actorIdentityId: ctx.admin.identity.id,
      metadata: { followUpId }
    })
  ]);

  return json(followUpPayload(await loadFollowUp(ctx, followUpId)), { status: 201 });
}

async function assignFollowUpOwner(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request);
  const followUp = await loadFollowUp(ctx, id);
  if (followUp.status !== "OPEN") {
    throw new HttpError(409, "CONFLICT", "Follow-up encerrado não muda de responsável");
  }
  const ownerId = await validateOwner(ctx, body.ownerUserId ?? null);
  if (followUp.owner_identity_id !== ownerId) {
    await ctx.db.prepare("UPDATE follow_ups SET owner_identity_id = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
      .bind(ownerId, new Date().toISOString(), ctx.tenantId, id).run();
  }
  return json(followUpPayload(await loadFollowUp(ctx, id)));
}

async function closeFollowUp(ctx: AdminRequestContext, status: "COMPLETED" | "CANCELLED"): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request, 16384);
  const followUp = await loadFollowUp(ctx, id);
  if (followUp.status === status) {
    return json({ ...followUpPayload(followUp), nextFollowUp: null });
  }
  if (followUp.status !== "OPEN") throw new HttpError(409, "CONFLICT", "Follow-up já encerrado");

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    status === "COMPLETED"
      ? ctx.db.prepare(`
          UPDATE follow_ups SET status = 'COMPLETED', completed_at = ?, completed_by_identity_id = ?, updated_at = ?
          WHERE tenant_id = ? AND id = ? AND status = 'OPEN'
        `).bind(now, ctx.admin.identity.id, now, ctx.tenantId, id)
      : ctx.db.prepare(`
          UPDATE follow_ups SET status = 'CANCELLED', updated_at = ?
          WHERE tenant_id = ? AND id = ? AND status = 'OPEN'
        `).bind(now, ctx.tenantId, id),
    relationshipEventStatement(ctx.db, {
      tenantId: ctx.tenantId,
      clientId: followUp.client_id,
      leadId: followUp.lead_id,
      type: status === "COMPLETED" ? "FOLLOW_UP_COMPLETED" : "FOLLOW_UP_CANCELLED",
      actorType: "ADMIN",
      actorIdentityId: ctx.admin.identity.id,
      metadata: { followUpId: id }
    })
  ];

  let nextId: string | null = null;
  if (status === "COMPLETED" && body.nextFollowUp) {
    if (!followUp.lead_id) invalid("Próxima ação encadeada exige um lead");
    const lead = await ctx.db.prepare(
      "SELECT id, status, owner_identity_id FROM leads WHERE tenant_id = ? AND id = ?"
    ).bind(ctx.tenantId, followUp.lead_id).first<{ id: string; status: string; owner_identity_id: string | null }>();
    if (!lead) notFoundError();
    if (!ACTIVE_LEAD.includes(lead.status)) {
      throw new HttpError(409, "CONFLICT", "Lead terminal não recebe nova próxima ação");
    }
    const fields = await followUpFields(body.nextFollowUp as Record<string, unknown>);
    const ownerId = await validateOwner(
      ctx,
      (body.nextFollowUp as Record<string, unknown>).ownerUserId
        ?? lead.owner_identity_id
        ?? followUp.owner_identity_id
        ?? ctx.admin.identity.id
    );
    nextId = crypto.randomUUID();
    statements.push(
      followUpInsert(ctx, {
        id: nextId,
        clientId: followUp.client_id,
        leadId: followUp.lead_id,
        dueAt: fields.dueAt,
        type: fields.type,
        note: fields.note,
        ownerId
      }),
      relationshipEventStatement(ctx.db, {
        tenantId: ctx.tenantId,
        clientId: followUp.client_id,
        leadId: followUp.lead_id,
        type: "FOLLOW_UP_CREATED",
        actorType: "ADMIN",
        actorIdentityId: ctx.admin.identity.id,
        metadata: { followUpId: nextId }
      })
    );
  }

  await ctx.db.batch(statements);
  return json({
    ...followUpPayload(await loadFollowUp(ctx, id)),
    nextFollowUp: nextId ? followUpPayload(await loadFollowUp(ctx, nextId)) : null
  });
}

export const relationshipRoutes: AdminRoute[] = [
  route("GET", /^clients$/, listClients),
  route("GET", /^clients\/([^/]+)$/, getClient),
  route("PATCH", /^clients\/([^/]+)$/, updateClient),
  route("POST", /^clients\/([^/]+)\/notes$/, addClientNote),
  route("GET", /^clients\/([^/]+)\/history$/, listClientHistory),

  route("GET", /^leads$/, listLeads),
  route("POST", /^leads$/, createLead),
  route("GET", /^leads\/([^/]+)$/, getLead),
  route("PATCH", /^leads\/([^/]+)\/status$/, updateLeadStatus),
  route("PATCH", /^leads\/([^/]+)\/priority$/, updateLeadPriority),
  route("PATCH", /^leads\/([^/]+)\/owner$/, assignLeadOwner),
  route("PATCH", /^leads\/([^/]+)\/qualification$/, updateLeadQualification),
  route("POST", /^leads\/([^/]+)\/notes$/, addLeadNote),
  route("POST", /^leads\/([^/]+)\/lost$/, loseLead),
  route("POST", /^leads\/([^/]+)\/convert$/, convertLead),
  route("POST", /^leads\/([^/]+)\/appointment$/, linkLeadAppointment),

  route("GET", /^follow-ups$/, listFollowUps),
  route("POST", /^follow-ups$/, createFollowUp),
  route("POST", /^follow-ups\/([^/]+)\/complete$/, (ctx) => closeFollowUp(ctx, "COMPLETED")),
  route("POST", /^follow-ups\/([^/]+)\/cancel$/, (ctx) => closeFollowUp(ctx, "CANCELLED")),
  route("PATCH", /^follow-ups\/([^/]+)\/owner$/, assignFollowUpOwner)
];
