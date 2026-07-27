import {
  APPOINTMENT_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  appointmentHistoryStatement,
  assertStatusTransition,
  dayOfWeek,
  historyTypeFor,
  invalid,
  notFoundError,
  requestedDay,
  requireEnum,
  sanitizeReason,
  shiftDate,
  zeroed
} from "../../shared/src/admin";
import { requirePublicId, timeToMinutes } from "../../shared/src/availability";
import { json, readJsonObject } from "../../shared/src/http";
import { route, type AdminRequestContext, type AdminRoute } from "./router";

const UPCOMING_LIMIT = 8;
const AGENDA_LIMIT = 100;
const PENDING_HORIZON_DAYS = 7;

function ownProfessionalId(ctx: AdminRequestContext): string | null {
  return ctx.admin.role === "professional" ? ctx.admin.professionalId : null;
}

interface AppointmentDetailRow {
  id: string;
  tenant_id: string;
  service_id: string;
  professional_id: string;
  client_id: string;
  lead_id: string | null;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  cancellation_reason: string | null;
  rescheduled_from_id: string | null;
  created_at: string;
  updated_at: string;
  service_name: string;
  service_description: string;
  service_duration: number;
  service_price_cents: number | null;
  service_active: number;
  professional_name: string;
  professional_specialty: string;
  professional_photo: string;
  professional_active: number;
  client_record_name: string | null;
  client_record_phone: string | null;
  client_record_email: string | null;
  lead_source: string | null;
  lead_status: string | null;
  lead_interest: string | null;
  rescheduled_from_date: string | null;
  rescheduled_from_time: string | null;
  rescheduled_to_id: string | null;
  rescheduled_to_date: string | null;
  rescheduled_to_time: string | null;
}

const DETAIL_SELECT = `
  SELECT appointments.*,
    services.name AS service_name,
    services.description AS service_description,
    services.duration_minutes AS service_duration,
    services.price_cents AS service_price_cents,
    services.active AS service_active,
    professionals.name AS professional_name,
    professionals.specialty AS professional_specialty,
    professionals.photo AS professional_photo,
    professionals.active AS professional_active,
    clients.name AS client_record_name,
    clients.phone AS client_record_phone,
    clients.email AS client_record_email,
    leads.source AS lead_source,
    leads.status AS lead_status,
    leads.interest_summary AS lead_interest,
    origin.appointment_date AS rescheduled_from_date,
    origin.start_time AS rescheduled_from_time,
    replacement.id AS rescheduled_to_id,
    replacement.appointment_date AS rescheduled_to_date,
    replacement.start_time AS rescheduled_to_time
  FROM appointments
  JOIN services ON services.tenant_id = appointments.tenant_id AND services.id = appointments.service_id
  JOIN professionals ON professionals.tenant_id = appointments.tenant_id AND professionals.id = appointments.professional_id
  LEFT JOIN clients ON clients.tenant_id = appointments.tenant_id AND clients.id = appointments.client_id
  LEFT JOIN leads ON leads.tenant_id = appointments.tenant_id AND leads.id = appointments.lead_id
  LEFT JOIN appointments origin
    ON origin.tenant_id = appointments.tenant_id AND origin.id = appointments.rescheduled_from_id
  LEFT JOIN appointments replacement
    ON replacement.tenant_id = appointments.tenant_id AND replacement.rescheduled_from_id = appointments.id
`;

function appointmentDetail(row: AppointmentDetailRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    serviceId: row.service_id,
    professionalId: row.professional_id,
    clientId: row.client_id,
    leadId: row.lead_id,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientEmail: row.client_email,
    date: row.appointment_date,
    time: row.start_time,
    endTime: row.end_time,
    status: row.status,
    cancellationReason: row.cancellation_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    service: {
      id: row.service_id,
      name: row.service_name,
      description: row.service_description,
      duration: row.service_duration,
      price: row.service_price_cents === null ? null : row.service_price_cents / 100,
      active: row.service_active === 1
    },
    professional: {
      id: row.professional_id,
      name: row.professional_name,
      specialty: row.professional_specialty,
      photo: row.professional_photo,
      active: row.professional_active === 1
    },
    client: {
      id: row.client_id,
      name: row.client_record_name ?? row.client_name,
      phone: row.client_record_phone ?? row.client_phone,
      email: row.client_record_email ?? row.client_email
    },
    originLead: row.lead_id
      ? { id: row.lead_id, source: row.lead_source, status: row.lead_status, interestSummary: row.lead_interest }
      : null,
    rescheduledFrom: row.rescheduled_from_id
      ? { id: row.rescheduled_from_id, date: row.rescheduled_from_date, time: row.rescheduled_from_time }
      : null,
    rescheduledTo: row.rescheduled_to_id
      ? { id: row.rescheduled_to_id, date: row.rescheduled_to_date, time: row.rescheduled_to_time }
      : null
  };
}

// Payload enxuto de propósito: a agenda não recebe telefone normalizado, e-mail,
// notas nem qualificação.
function agendaRow(row: AppointmentDetailRow) {
  return {
    id: row.id,
    date: row.appointment_date,
    time: row.start_time,
    endTime: row.end_time,
    durationMinutes: row.service_duration,
    status: row.status,
    clientId: row.client_id,
    clientName: row.client_record_name ?? row.client_name,
    clientPhone: row.client_record_phone ?? row.client_phone,
    serviceId: row.service_id,
    serviceName: row.service_name,
    professionalId: row.professional_id,
    professionalName: row.professional_name,
    leadId: row.lead_id,
    leadSource: row.lead_source,
    rescheduledFromId: row.rescheduled_from_id,
    rescheduledToId: row.rescheduled_to_id,
    cancellationReason: row.cancellation_reason
  };
}

async function loadDetail(ctx: AdminRequestContext, id: string): Promise<AppointmentDetailRow> {
  const professionalId = ownProfessionalId(ctx);
  const row = await ctx.db.prepare(`
    ${DETAIL_SELECT}
    WHERE appointments.tenant_id = ? AND appointments.id = ?
      AND (? IS NULL OR appointments.professional_id = ?)
  `).bind(ctx.tenantId, id, professionalId, professionalId).first<AppointmentDetailRow>();
  if (!row) notFoundError();
  return row;
}

async function listAppointments(ctx: AdminRequestContext): Promise<Response> {
  const professionalId = ownProfessionalId(ctx);
  const rows = await ctx.db.prepare(`
    ${DETAIL_SELECT}
    WHERE appointments.tenant_id = ?
      AND (? IS NULL OR appointments.professional_id = ?)
    ORDER BY appointments.appointment_date, appointments.start_time, appointments.id
  `).bind(ctx.tenantId, professionalId, professionalId).all<AppointmentDetailRow>();
  return json(rows.results.map(appointmentDetail));
}

async function getAppointment(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  return json(appointmentDetail(await loadDetail(ctx, id)));
}

async function updateAppointmentStatus(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  const body = await readJsonObject(ctx.request);
  const toStatus = requireEnum(body.status, APPOINTMENT_STATUSES, "Status");
  const reason = sanitizeReason(body.reason);
  const current = await loadDetail(ctx, id);

  const transition = assertStatusTransition(current.status, toStatus);
  if (transition.idempotent) return json(appointmentDetail(current));

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    ctx.db.prepare(`
      UPDATE appointments
      SET status = ?, cancellation_reason = CASE WHEN ? = 'CANCELLED' THEN ? ELSE cancellation_reason END,
        updated_at = ?
      WHERE tenant_id = ? AND id = ? AND status = ?
    `).bind(toStatus, toStatus, reason, now, ctx.tenantId, id, current.status),
    appointmentHistoryStatement(ctx.db, {
      tenantId: ctx.tenantId,
      appointmentId: id,
      type: historyTypeFor(toStatus),
      fromStatus: current.status,
      toStatus,
      metadata: reason ? { reason } : null,
      actorType: "ADMIN",
      actorIdentityId: ctx.admin.identity.id
    })
  ];

  if (["COMPLETED", "CANCELLED", "NO_SHOW"].includes(toStatus)) {
    statements.push(ctx.db.prepare(`
      UPDATE appointment_access_tokens SET revoked_at = ?
      WHERE tenant_id = ? AND appointment_id = ? AND revoked_at IS NULL
    `).bind(now, ctx.tenantId, id));
  }
  if (toStatus === "CANCELLED") {
    statements.push(ctx.db.prepare(
      "DELETE FROM appointment_slots WHERE tenant_id = ? AND appointment_id = ?"
    ).bind(ctx.tenantId, id));
  }

  await ctx.db.batch(statements);
  return json(appointmentDetail(await loadDetail(ctx, id)));
}

async function listAppointmentHistory(ctx: AdminRequestContext): Promise<Response> {
  const id = requirePublicId(ctx.params[0], "ID");
  await loadDetail(ctx, id);
  const rows = await ctx.db.prepare(`
    SELECT id, appointment_id, type, from_status, to_status, metadata_json,
      actor_type, actor_identity_id, created_at
    FROM appointment_history_events
    WHERE tenant_id = ? AND appointment_id = ?
    ORDER BY created_at, id
  `).bind(ctx.tenantId, id).all<{
    id: string;
    appointment_id: string;
    type: string;
    from_status: string | null;
    to_status: string | null;
    metadata_json: string | null;
    actor_type: string;
    actor_identity_id: string | null;
    created_at: string;
  }>();

  return json(rows.results.map((row) => ({
    id: row.id,
    appointmentId: row.appointment_id,
    type: row.type,
    fromStatus: row.from_status,
    toStatus: row.to_status,
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : null,
    actorType: row.actor_type,
    actorId: row.actor_identity_id,
    createdAt: row.created_at
  })));
}

async function countOf(db: D1Database, sql: string, binds: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...binds).first<{ total: number }>();
  return row?.total ?? 0;
}

async function getOverview(ctx: AdminRequestContext): Promise<Response> {
  const date = requestedDay(ctx.url.searchParams.get("date"));
  const now = new Date().toISOString();
  const dayEnd = `${date}T23:59:59.999Z`;

  const [dayGroups, upcoming, pipelineGroups, sourceGroups, professionals] = await Promise.all([
    ctx.db.prepare(`
      SELECT professional_id, status, COUNT(*) AS total
      FROM appointments
      WHERE tenant_id = ? AND appointment_date = ?
      GROUP BY professional_id, status
    `).bind(ctx.tenantId, date).all<{ professional_id: string; status: string; total: number }>(),
    ctx.db.prepare(`
      ${DETAIL_SELECT}
      WHERE appointments.tenant_id = ? AND appointments.appointment_date = ?
        AND appointments.status IN ('PENDING', 'CONFIRMED')
      ORDER BY appointments.start_time, appointments.id
      LIMIT ?
    `).bind(ctx.tenantId, date, UPCOMING_LIMIT).all<AppointmentDetailRow>(),
    ctx.db.prepare(`
      SELECT status, COUNT(*) AS total FROM leads WHERE tenant_id = ? GROUP BY status
    `).bind(ctx.tenantId).all<{ status: string; total: number }>(),
    ctx.db.prepare(`
      SELECT source, COUNT(*) AS total FROM leads
      WHERE tenant_id = ? AND status IN ('NEW', 'CONTACTED', 'QUALIFIED')
      GROUP BY source
    `).bind(ctx.tenantId).all<{ source: string; total: number }>(),
    ctx.db.prepare(`
      SELECT id, name FROM professionals
      WHERE tenant_id = ? AND active = 1 ORDER BY name
    `).bind(ctx.tenantId).all<{ id: string; name: string }>()
  ]);

  const [overdueFollowUps, followUpsToday, leadsWithoutNextAction, leadsWithoutOwner, pendingUpcoming] =
    await Promise.all([
      countOf(ctx.db, `
        SELECT COUNT(*) AS total FROM follow_ups
        WHERE tenant_id = ? AND status = 'OPEN' AND due_at < ?
      `, [ctx.tenantId, now]),
      countOf(ctx.db, `
        SELECT COUNT(*) AS total FROM follow_ups
        WHERE tenant_id = ? AND status = 'OPEN' AND due_at >= ? AND due_at <= ?
      `, [ctx.tenantId, now, dayEnd]),
      countOf(ctx.db, `
        SELECT COUNT(*) AS total FROM leads
        WHERE tenant_id = ? AND status IN ('NEW', 'CONTACTED', 'QUALIFIED')
          AND NOT EXISTS (
            SELECT 1 FROM follow_ups
            WHERE follow_ups.tenant_id = leads.tenant_id
              AND follow_ups.lead_id = leads.id AND follow_ups.status = 'OPEN'
          )
      `, [ctx.tenantId]),
      countOf(ctx.db, `
        SELECT COUNT(*) AS total FROM leads
        WHERE tenant_id = ? AND status IN ('NEW', 'CONTACTED', 'QUALIFIED')
          AND owner_identity_id IS NULL
      `, [ctx.tenantId]),
      countOf(ctx.db, `
        SELECT COUNT(*) AS total FROM appointments
        WHERE tenant_id = ? AND status = 'PENDING'
          AND appointment_date >= ? AND appointment_date <= ?
      `, [ctx.tenantId, date, shiftDate(date, PENDING_HORIZON_DAYS)])
    ]);

  const byStatus = zeroed(APPOINTMENT_STATUSES);
  const perProfessional = new Map<string, { total: number; open: number }>();
  for (const group of dayGroups.results) {
    byStatus[group.status] += group.total;
    const current = perProfessional.get(group.professional_id) ?? { total: 0, open: 0 };
    current.total += group.total;
    if (group.status === "PENDING" || group.status === "CONFIRMED") current.open += group.total;
    perProfessional.set(group.professional_id, current);
  }

  const pipeline = zeroed(LEAD_STATUSES);
  for (const group of pipelineGroups.results) pipeline[group.status] = group.total;

  const activeLeadsBySource = zeroed(LEAD_SOURCES);
  for (const group of sourceGroups.results) activeLeadsBySource[group.source] = group.total;

  return json({
    tenantId: ctx.tenantId,
    date,
    day: {
      total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
      byStatus
    },
    attention: {
      overdueFollowUps,
      followUpsToday,
      leadsWithoutNextAction,
      leadsWithoutOwner,
      pendingUpcoming,
      activeLeadsBySource
    },
    upcoming: upcoming.results.map(agendaRow),
    pipeline,
    occupancy: professionals.results.map((professional) => ({
      professionalId: professional.id,
      name: professional.name,
      total: perProfessional.get(professional.id)?.total ?? 0,
      open: perProfessional.get(professional.id)?.open ?? 0
    }))
  });
}

function blockedMinutes(
  windows: [number, number][],
  blocks: { all_day: number; start_time: string | null; end_time: string | null }[]
): number {
  if (blocks.some((block) => block.all_day === 1)) {
    return windows.reduce((sum, [start, end]) => sum + (end - start), 0);
  }
  return blocks.reduce((sum, block) => {
    if (!block.start_time || !block.end_time) return sum;
    const start = timeToMinutes(block.start_time);
    const end = timeToMinutes(block.end_time);
    return sum + windows.reduce((inner, [open, close]) => (
      start < close && open < end ? inner + (Math.min(end, close) - Math.max(start, open)) : inner
    ), 0);
  }, 0);
}

async function getAgendaDay(ctx: AdminRequestContext): Promise<Response> {
  const date = requestedDay(ctx.url.searchParams.get("date"));
  const statusFilter = ctx.url.searchParams.get("status");
  const professionalParam = ctx.url.searchParams.get("professionalId");
  if (statusFilter && !APPOINTMENT_STATUSES.includes(statusFilter as never)) invalid("Status inválido");
  const requestedProfessionalId = professionalParam ? requirePublicId(professionalParam, "Profissional") : null;
  const ownId = ownProfessionalId(ctx);
  if (ownId && requestedProfessionalId && requestedProfessionalId !== ownId) notFoundError();
  const professionalId = ownId ?? requestedProfessionalId;

  const [items, summaryGroups, blocks, schedules, professionals, booked] = await Promise.all([
    ctx.db.prepare(`
      ${DETAIL_SELECT}
      WHERE appointments.tenant_id = ? AND appointments.appointment_date = ?
        AND (? IS NULL OR appointments.professional_id = ?)
        AND (? IS NULL OR appointments.status = ?)
      ORDER BY appointments.start_time, appointments.id
      LIMIT ?
    `).bind(
      ctx.tenantId, date, professionalId, professionalId, statusFilter, statusFilter, AGENDA_LIMIT
    ).all<AppointmentDetailRow>(),
    ctx.db.prepare(`
      SELECT status, COUNT(*) AS total FROM appointments
      WHERE tenant_id = ? AND appointment_date = ?
        AND (? IS NULL OR professional_id = ?)
      GROUP BY status
    `).bind(ctx.tenantId, date, professionalId, professionalId).all<{ status: string; total: number }>(),
    ctx.db.prepare(`
      SELECT b.id, b.professional_id, b.all_day, b.start_time, b.end_time, b.reason,
        professionals.name AS professional_name
      FROM schedule_blocks b
      LEFT JOIN professionals
        ON professionals.tenant_id = b.tenant_id AND professionals.id = b.professional_id
      WHERE b.tenant_id = ? AND b.date = ?
        AND (? IS NULL OR b.professional_id = ? OR b.professional_id IS NULL)
      ORDER BY b.all_day DESC, b.start_time, b.id
    `).bind(ctx.tenantId, date, professionalId, professionalId).all<{
      id: string;
      professional_id: string | null;
      all_day: number;
      start_time: string | null;
      end_time: string | null;
      reason: string | null;
      professional_name: string | null;
    }>(),
    ctx.db.prepare(`
      SELECT professional_id, start_time, end_time FROM professional_schedules
      WHERE tenant_id = ? AND active = 1 AND day_of_week = ?
        AND (? IS NULL OR professional_id = ?)
    `).bind(ctx.tenantId, dayOfWeek(date), professionalId, professionalId)
      .all<{ professional_id: string; start_time: string; end_time: string }>(),
    ctx.db.prepare(`
      SELECT id, name FROM professionals
      WHERE tenant_id = ? AND active = 1 AND (? IS NULL OR id = ?)
      ORDER BY name
    `).bind(ctx.tenantId, professionalId, professionalId).all<{ id: string; name: string }>(),
    ctx.db.prepare(`
      SELECT appointments.professional_id, SUM(services.duration_minutes) AS minutes
      FROM appointments
      JOIN services ON services.tenant_id = appointments.tenant_id AND services.id = appointments.service_id
      WHERE appointments.tenant_id = ? AND appointments.appointment_date = ?
        AND appointments.status IN ('PENDING', 'CONFIRMED')
        AND (? IS NULL OR appointments.professional_id = ?)
      GROUP BY appointments.professional_id
    `).bind(ctx.tenantId, date, professionalId, professionalId)
      .all<{ professional_id: string; minutes: number }>()
  ]);

  const byStatus = zeroed(APPOINTMENT_STATUSES);
  for (const group of summaryGroups.results) byStatus[group.status] = group.total;
  const bookedByProfessional = new Map(booked.results.map((row) => [row.professional_id, row.minutes]));

  const availability = professionals.results.map((professional) => {
    const windows = schedules.results
      .filter((schedule) => schedule.professional_id === professional.id)
      .map((schedule): [number, number] => [timeToMinutes(schedule.start_time), timeToMinutes(schedule.end_time)]);
    const open = windows.reduce((sum, [start, end]) => sum + (end - start), 0);
    const blocked = blockedMinutes(
      windows,
      blocks.results.filter((block) => block.professional_id === null || block.professional_id === professional.id)
    );
    const openMinutes = Math.max(0, open - blocked);
    const bookedMinutes = bookedByProfessional.get(professional.id) ?? 0;
    return {
      professionalId: professional.id,
      name: professional.name,
      openMinutes,
      bookedMinutes,
      freeMinutes: Math.max(0, openMinutes - bookedMinutes),
      working: windows.length > 0
    };
  });

  return json({
    date,
    filters: { professionalId, status: statusFilter || null },
    summary: {
      total: Object.values(byStatus).reduce((sum, value) => sum + value, 0),
      byStatus
    },
    items: items.results.map(agendaRow),
    blocks: blocks.results.map((block) => ({
      id: block.id,
      professionalId: block.professional_id,
      professionalName: block.professional_name,
      allDay: block.all_day === 1,
      startTime: block.start_time,
      endTime: block.end_time,
      reason: block.reason
    })),
    availability
  });
}

interface ExportRow {
  id: string;
  appointment_date: string;
  start_time: string;
  status: string;
  service_name: string;
  professional_name: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
}

function csvField(value: string | null): string {
  if (value === null || value === "") return "";
  return `"${value.replace(/"/g, '""')}"`;
}

// A exportação sai pelo Worker administrativo e continua restrita ao tenant
// autorizado; o Access injeta a asserção também no download do navegador.
async function exportAppointments(ctx: AdminRequestContext): Promise<Response> {
  const professionalId = ownProfessionalId(ctx);
  const rows = await ctx.db.prepare(`
    SELECT a.id, a.appointment_date, a.start_time, a.status,
      s.name AS service_name, p.name AS professional_name,
      a.client_name, a.client_phone, a.client_email
    FROM appointments a
    JOIN services s ON s.tenant_id = a.tenant_id AND s.id = a.service_id
    JOIN professionals p ON p.tenant_id = a.tenant_id AND p.id = a.professional_id
    WHERE a.tenant_id = ?
      AND (? IS NULL OR a.professional_id = ?)
    ORDER BY a.appointment_date, a.start_time
  `).bind(ctx.tenantId, professionalId, professionalId).all<ExportRow>();

  const header = "id,data,horario,status,servico,profissional,cliente,telefone,email";
  const body = rows.results.map((row) => [
    row.id,
    row.appointment_date,
    row.start_time,
    row.status,
    csvField(row.service_name),
    csvField(row.professional_name),
    csvField(row.client_name),
    csvField(row.client_phone),
    csvField(row.client_email)
  ].join(","));

  return new Response(`${[header, ...body].join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="agendamentos.csv"',
      "Cache-Control": "no-store"
    }
  });
}

export const agendaRoutes: AdminRoute[] = [
  route("GET", /^appointments\/export\.csv$/, "agenda", exportAppointments),
  route("GET", /^appointments$/, "agenda", listAppointments),
  route("GET", /^appointments\/([^/]+)$/, "agenda", getAppointment),
  route("PATCH", /^appointments\/([^/]+)\/status$/, "agenda", updateAppointmentStatus),
  route("GET", /^appointments\/([^/]+)\/history$/, "agenda", listAppointmentHistory),
  route("GET", /^overview$/, "overview", getOverview),
  route("GET", /^agenda$/, "agenda", getAgendaDay)
];

export { appointmentDetail, agendaRow, DETAIL_SELECT };
export type { AppointmentDetailRow };
