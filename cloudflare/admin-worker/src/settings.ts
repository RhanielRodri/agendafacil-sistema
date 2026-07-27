import {
  APPOINTMENT_STATUSES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  invalid,
  isValidDate,
  requireBoolean,
  sanitizeText,
  shiftDate,
  todayIso,
  zeroed
} from "../../shared/src/admin";
import { timeToMinutes } from "../../shared/src/availability";
import { json, readJsonObject } from "../../shared/src/http";
import { parseBrazilPhone } from "../../shared/src/phone";
import { route, type AdminRequestContext, type AdminRoute } from "./router";

// Fusos aceitos hoje. A lista é curta de propósito: timezone precisa ser
// explícito e verificável, não texto livre.
const ALLOWED_TIMEZONES = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Manaus",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Rio_Branco",
  "America/Noronha"
];

const SLOT_DURATIONS = [10, 15, 20, 30, 45, 60];
const MAX_ADVANCE_MINUTES = 10080;
const MAX_FUTURE_DAYS = 365;
const MAX_PERIOD_DAYS = 92;
const FIRST_ACTION_SAMPLE = 500;
const RETURN_WINDOW_DAYS = 90;
const OCCUPIED = "('PENDING', 'CONFIRMED', 'COMPLETED', 'NO_SHOW')";

interface SettingsRow {
  id: string;
  tenant_id: string;
  public_name: string | null;
  public_phone: string | null;
  public_whatsapp: string | null;
  address_line: string | null;
  timezone: string;
  slot_duration_minutes: number;
  min_advance_minutes: number;
  change_min_advance_minutes: number;
  max_future_days: number;
  cancellation_policy: string | null;
  confirmation_message: string | null;
  booking_enabled: number;
  created_at: string;
  updated_at: string;
}

function settingsPayload(row: SettingsRow | null, tenantId: string) {
  return {
    id: row?.id ?? null,
    tenantId,
    publicName: row?.public_name ?? null,
    publicPhone: row?.public_phone ?? null,
    publicWhatsapp: row?.public_whatsapp ?? null,
    addressLine: row?.address_line ?? null,
    timezone: row?.timezone ?? "America/Sao_Paulo",
    slotDurationMinutes: row?.slot_duration_minutes ?? 30,
    minAdvanceMinutes: row?.min_advance_minutes ?? 0,
    changeMinAdvanceMinutes: row?.change_min_advance_minutes ?? 240,
    maxFutureDays: row?.max_future_days ?? 90,
    cancellationPolicy: row?.cancellation_policy ?? null,
    confirmationMessage: row?.confirmation_message ?? null,
    bookingEnabled: row ? row.booking_enabled === 1 : true
  };
}

async function loadSettings(ctx: AdminRequestContext): Promise<SettingsRow | null> {
  return ctx.db.prepare("SELECT * FROM tenant_settings WHERE tenant_id = ?")
    .bind(ctx.tenantId).first<SettingsRow>();
}

function parsePhone(value: unknown, field: string): string | null {
  const text = sanitizeText(value, field, 1, 30, false);
  if (text === null) return null;
  const phone = parseBrazilPhone(text);
  if (!phone) invalid(`${field} inválido`);
  return phone.normalized;
}

// Texto operacional é texto: nada de HTML entrando por aqui.
function parsePlainText(value: unknown, max: number, field: string): string | null {
  const text = sanitizeText(value, field, 1, max, false);
  if (text && /[<>]/.test(text)) invalid(`${field} não aceita marcação HTML`);
  return text;
}

function parseInteger(value: unknown, field: string, options: { min?: number; max?: number; allowed?: number[] }): number {
  const number = Number(value);
  if (!Number.isInteger(number)) invalid(`${field} inválido`);
  if (options.allowed && !options.allowed.includes(number)) invalid(`${field} inválido`);
  if (!options.allowed && (number < (options.min ?? 0) || number > (options.max ?? 0))) {
    invalid(`${field} inválido`);
  }
  return number;
}

async function getSettings(ctx: AdminRequestContext): Promise<Response> {
  return json(settingsPayload(await loadSettings(ctx), ctx.tenantId));
}

async function updateSettings(ctx: AdminRequestContext): Promise<Response> {
  const body = await readJsonObject(ctx.request);
  const columns: string[] = [];
  const binds: unknown[] = [];

  const assign = (column: string, value: unknown) => {
    columns.push(column);
    binds.push(value);
  };

  if (Object.hasOwn(body, "publicName")) assign("public_name", parsePlainText(body.publicName, 120, "Nome público"));
  if (Object.hasOwn(body, "publicPhone")) assign("public_phone", parsePhone(body.publicPhone, "Telefone público"));
  if (Object.hasOwn(body, "publicWhatsapp")) assign("public_whatsapp", parsePhone(body.publicWhatsapp, "WhatsApp público"));
  if (Object.hasOwn(body, "addressLine")) assign("address_line", parsePlainText(body.addressLine, 160, "Endereço"));
  if (Object.hasOwn(body, "timezone")) {
    if (typeof body.timezone !== "string" || !ALLOWED_TIMEZONES.includes(body.timezone)) invalid("Timezone inválido");
    assign("timezone", body.timezone);
  }
  if (Object.hasOwn(body, "slotDurationMinutes")) {
    assign("slot_duration_minutes", parseInteger(body.slotDurationMinutes, "Duração do slot", { allowed: SLOT_DURATIONS }));
  }
  if (Object.hasOwn(body, "minAdvanceMinutes")) {
    assign("min_advance_minutes", parseInteger(body.minAdvanceMinutes, "Antecedência mínima", { min: 0, max: MAX_ADVANCE_MINUTES }));
  }
  if (Object.hasOwn(body, "changeMinAdvanceMinutes")) {
    assign(
      "change_min_advance_minutes",
      parseInteger(body.changeMinAdvanceMinutes, "Prazo para cancelar ou remarcar", { min: 0, max: MAX_ADVANCE_MINUTES })
    );
  }
  if (Object.hasOwn(body, "maxFutureDays")) {
    assign("max_future_days", parseInteger(body.maxFutureDays, "Limite futuro", { min: 1, max: MAX_FUTURE_DAYS }));
  }
  if (Object.hasOwn(body, "cancellationPolicy")) {
    assign("cancellation_policy", parsePlainText(body.cancellationPolicy, 500, "Política de cancelamento"));
  }
  if (Object.hasOwn(body, "confirmationMessage")) {
    assign("confirmation_message", parsePlainText(body.confirmationMessage, 300, "Texto de confirmação"));
  }
  if (Object.hasOwn(body, "bookingEnabled")) {
    assign("booking_enabled", requireBoolean(body.bookingEnabled, "bookingEnabled") ? 1 : 0);
  }
  if (!columns.length) invalid("Nenhum campo válido para atualizar");

  const current = await loadSettings(ctx);
  const now = new Date().toISOString();
  if (current) {
    await ctx.db.prepare(`
      UPDATE tenant_settings SET ${columns.map((column) => `${column} = ?`).join(", ")}, updated_at = ?
      WHERE tenant_id = ?
    `).bind(...binds, now, ctx.tenantId).run();
  } else {
    await ctx.db.prepare(`
      INSERT INTO tenant_settings (id, tenant_id, ${columns.join(", ")}, created_at, updated_at)
      VALUES (?, ?, ${columns.map(() => "?").join(", ")}, ?, ?)
    `).bind(crypto.randomUUID(), ctx.tenantId, ...binds, now, now).run();
  }

  return json(settingsPayload(await loadSettings(ctx), ctx.tenantId));
}

function rate(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
}

interface Period {
  key: string;
  from: string;
  to: string;
  days: number;
}

function resolveMetricsPeriod(url: URL): Period {
  const key = url.searchParams.get("period") ?? "30d";
  const today = todayIso();

  if (key === "custom") {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!isValidDate(from) || !isValidDate(to) || from > to) invalid("Período inválido");
    const days = Math.round(
      (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000
    ) + 1;
    if (days > MAX_PERIOD_DAYS) invalid(`Período personalizado limitado a ${MAX_PERIOD_DAYS} dias`);
    return { key, from, to, days };
  }

  const spans: Record<string, number> = { today: 1, "7d": 7, "30d": 30 };
  const span = spans[key];
  if (!span) invalid("Período inválido");
  return { key, from: shiftDate(today, -(span - 1)), to: today, days: span };
}

function eachDay(period: Period): string[] {
  const days: string[] = [];
  for (let cursor = period.from; cursor <= period.to; cursor = shiftDate(cursor, 1)) days.push(cursor);
  return days;
}

function minutesInside(windows: [number, number][], start: number, end: number): number {
  return windows.reduce((sum, [open, close]) => (
    start < close && open < end ? sum + (Math.min(end, close) - Math.max(start, open)) : sum
  ), 0);
}

// Capacidade é derivada do que já existe: expediente, agenda de cada
// profissional e bloqueios do período. Não há tabela de capacidade.
async function capacityReport(ctx: AdminRequestContext, period: Period, slotMinutes: number) {
  const [businessHours, schedules, blocks, professionals, appointments] = await Promise.all([
    ctx.db.prepare("SELECT day_of_week, open_time, close_time, is_open FROM business_hours WHERE tenant_id = ?")
      .bind(ctx.tenantId).all<{ day_of_week: number; open_time: string; close_time: string; is_open: number }>(),
    ctx.db.prepare(`
      SELECT professional_id, day_of_week, start_time, end_time FROM professional_schedules
      WHERE tenant_id = ? AND active = 1
    `).bind(ctx.tenantId).all<{ professional_id: string; day_of_week: number; start_time: string; end_time: string }>(),
    ctx.db.prepare(`
      SELECT professional_id, date, all_day, start_time, end_time FROM schedule_blocks
      WHERE tenant_id = ? AND date >= ? AND date <= ?
    `).bind(ctx.tenantId, period.from, period.to).all<{
      professional_id: string | null;
      date: string;
      all_day: number;
      start_time: string | null;
      end_time: string | null;
    }>(),
    ctx.db.prepare(`
      SELECT id, name FROM professionals WHERE tenant_id = ? AND active = 1
      ORDER BY display_order, name
    `).bind(ctx.tenantId).all<{ id: string; name: string }>(),
    ctx.db.prepare(`
      SELECT a.professional_id, a.service_id, s.name AS service_name, s.duration_minutes
      FROM appointments a
      JOIN services s ON s.tenant_id = a.tenant_id AND s.id = a.service_id
      WHERE a.tenant_id = ? AND a.appointment_date >= ? AND a.appointment_date <= ?
        AND a.status IN ${OCCUPIED}
    `).bind(ctx.tenantId, period.from, period.to).all<{
      professional_id: string;
      service_id: string;
      service_name: string;
      duration_minutes: number;
    }>()
  ]);

  const businessByDay = new Map(businessHours.results.map((row) => [row.day_of_week, row]));
  const blocksByDate = new Map<string, typeof blocks.results>();
  for (const block of blocks.results) {
    const list = blocksByDate.get(block.date) ?? [];
    list.push(block);
    blocksByDate.set(block.date, list);
  }

  const openByProfessional = new Map(professionals.results.map((row) => [row.id, 0]));

  for (const date of eachDay(period)) {
    const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
    const business = businessByDay.get(weekday);
    if (!business || business.is_open !== 1) continue;
    const businessStart = timeToMinutes(business.open_time);
    const businessEnd = timeToMinutes(business.close_time);
    const dayBlocks = blocksByDate.get(date) ?? [];

    for (const professional of professionals.results) {
      const windows = schedules.results
        .filter((row) => row.professional_id === professional.id && row.day_of_week === weekday)
        .map((row): [number, number] => [
          Math.max(businessStart, timeToMinutes(row.start_time)),
          Math.min(businessEnd, timeToMinutes(row.end_time))
        ])
        .filter(([start, end]) => end > start);
      if (!windows.length) continue;

      const open = windows.reduce((sum, [start, end]) => sum + (end - start), 0);
      const relevant = dayBlocks.filter(
        (block) => block.professional_id === null || block.professional_id === professional.id
      );
      const blocked = relevant.some((block) => block.all_day === 1)
        ? open
        : relevant.reduce((sum, block) => (
            block.start_time && block.end_time
              ? sum + minutesInside(windows, timeToMinutes(block.start_time), timeToMinutes(block.end_time))
              : sum
          ), 0);
      openByProfessional.set(professional.id, (openByProfessional.get(professional.id) ?? 0) + Math.max(0, open - blocked));
    }
  }

  const bookedByProfessional = new Map<string, number>();
  const bookedByService = new Map<string, { name: string; minutes: number; count: number }>();
  for (const appointment of appointments.results) {
    bookedByProfessional.set(
      appointment.professional_id,
      (bookedByProfessional.get(appointment.professional_id) ?? 0) + appointment.duration_minutes
    );
    const current = bookedByService.get(appointment.service_id)
      ?? { name: appointment.service_name, minutes: 0, count: 0 };
    current.minutes += appointment.duration_minutes;
    current.count += 1;
    bookedByService.set(appointment.service_id, current);
  }

  const openMinutes = [...openByProfessional.values()].reduce((sum, value) => sum + value, 0);
  const bookedMinutes = [...bookedByProfessional.values()].reduce((sum, value) => sum + value, 0);

  return {
    openMinutes,
    bookedMinutes,
    freeMinutes: Math.max(0, openMinutes - bookedMinutes),
    occupancyRate: rate(bookedMinutes, openMinutes),
    estimatedOpenSlots: Math.floor(openMinutes / slotMinutes),
    estimatedBookedSlots: Math.round(bookedMinutes / slotMinutes),
    byProfessional: professionals.results.map((professional) => {
      const open = openByProfessional.get(professional.id) ?? 0;
      const booked = bookedByProfessional.get(professional.id) ?? 0;
      return {
        professionalId: professional.id,
        name: professional.name,
        openMinutes: open,
        bookedMinutes: booked,
        freeMinutes: Math.max(0, open - booked),
        occupancyRate: rate(booked, open)
      };
    }),
    byService: [...bookedByService.entries()]
      .map(([serviceId, value]) => ({
        serviceId,
        name: value.name,
        appointments: value.count,
        bookedMinutes: value.minutes,
        shareOfBookedTime: rate(value.minutes, bookedMinutes)
      }))
      .sort((a, b) => b.bookedMinutes - a.bookedMinutes || a.name.localeCompare(b.name))
  };
}

async function leadsReport(ctx: AdminRequestContext, from: string, to: string) {
  const [statusGroups, sourceGroups, convertedGroups, totals] = await Promise.all([
    ctx.db.prepare(`
      SELECT status, COUNT(*) AS total FROM leads
      WHERE tenant_id = ? AND created_at >= ? AND created_at <= ? GROUP BY status
    `).bind(ctx.tenantId, from, to).all<{ status: string; total: number }>(),
    ctx.db.prepare(`
      SELECT source, COUNT(*) AS total FROM leads
      WHERE tenant_id = ? AND created_at >= ? AND created_at <= ? GROUP BY source
    `).bind(ctx.tenantId, from, to).all<{ source: string; total: number }>(),
    ctx.db.prepare(`
      SELECT source, COUNT(*) AS total FROM leads
      WHERE tenant_id = ? AND created_at >= ? AND created_at <= ? AND status = 'CONVERTED'
      GROUP BY source
    `).bind(ctx.tenantId, from, to).all<{ source: string; total: number }>(),
    ctx.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM leads WHERE tenant_id = ?1 AND created_at >= ?2 AND created_at <= ?3) AS created,
        (SELECT COUNT(*) FROM leads WHERE tenant_id = ?1 AND created_at >= ?2 AND created_at <= ?3
          AND status IN ('NEW', 'CONTACTED', 'QUALIFIED') AND owner_identity_id IS NULL) AS without_owner,
        (SELECT COUNT(*) FROM leads WHERE tenant_id = ?1 AND created_at >= ?2 AND created_at <= ?3
          AND status IN ('NEW', 'CONTACTED', 'QUALIFIED')
          AND NOT EXISTS (
            SELECT 1 FROM follow_ups f
            WHERE f.tenant_id = leads.tenant_id AND f.lead_id = leads.id AND f.status = 'OPEN'
          )) AS without_next_action
    `).bind(ctx.tenantId, from, to).first<{ created: number; without_owner: number; without_next_action: number }>()
  ]);

  const byStatus = zeroed(LEAD_STATUSES);
  for (const group of statusGroups.results) byStatus[group.status] = group.total;
  const createdBySource = zeroed(LEAD_SOURCES);
  for (const group of sourceGroups.results) createdBySource[group.source] = group.total;
  const convertedBySource = zeroed(LEAD_SOURCES);
  for (const group of convertedGroups.results) convertedBySource[group.source] = group.total;

  const created = totals?.created ?? 0;
  // Tempo até a primeira ação só é honesto sobre uma amostra fechada.
  let averageMinutesToFirstAction: number | null = null;
  if (created > 0 && created <= FIRST_ACTION_SAMPLE) {
    const rows = await ctx.db.prepare(`
      SELECT leads.created_at AS lead_created,
        (SELECT MIN(e.created_at) FROM relationship_history_events e
          WHERE e.tenant_id = leads.tenant_id AND e.lead_id = leads.id AND e.type <> 'LEAD_CREATED') AS first_action
      FROM leads
      WHERE leads.tenant_id = ? AND leads.created_at >= ? AND leads.created_at <= ?
    `).bind(ctx.tenantId, from, to).all<{ lead_created: string; first_action: string | null }>();
    const deltas = rows.results
      .filter((row) => row.first_action !== null)
      .map((row) => (Date.parse(row.first_action as string) - Date.parse(row.lead_created)) / 60_000)
      .filter((value) => value >= 0);
    if (deltas.length) {
      averageMinutesToFirstAction = Math.round(deltas.reduce((sum, value) => sum + value, 0) / deltas.length);
    }
  }

  return {
    created,
    byStatus,
    withoutOwner: totals?.without_owner ?? 0,
    withoutNextAction: totals?.without_next_action ?? 0,
    averageMinutesToFirstAction,
    conversionRate: rate(byStatus.CONVERTED, created),
    bySource: LEAD_SOURCES.map((source) => ({
      source,
      created: createdBySource[source],
      converted: convertedBySource[source],
      conversionRate: rate(convertedBySource[source], createdBySource[source])
    }))
  };
}

async function followUpsReport(ctx: AdminRequestContext, from: string, to: string) {
  const now = new Date().toISOString();
  const [totals, completedRows] = await Promise.all([
    ctx.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM follow_ups WHERE tenant_id = ?1 AND created_at >= ?2 AND created_at <= ?3) AS created,
        (SELECT COUNT(*) FROM follow_ups WHERE tenant_id = ?1 AND status = 'COMPLETED'
          AND completed_at >= ?2 AND completed_at <= ?3) AS completed,
        (SELECT COUNT(*) FROM follow_ups WHERE tenant_id = ?1 AND status = 'OPEN'
          AND due_at >= ?2 AND due_at <= ?3 AND due_at < ?4) AS overdue
    `).bind(ctx.tenantId, from, to, now).first<{ created: number; completed: number; overdue: number }>(),
    ctx.db.prepare(`
      SELECT due_at, completed_at FROM follow_ups
      WHERE tenant_id = ? AND status = 'COMPLETED' AND completed_at >= ? AND completed_at <= ?
      LIMIT 1000
    `).bind(ctx.tenantId, from, to).all<{ due_at: string; completed_at: string }>()
  ]);

  const delays = completedRows.results
    .map((row) => (Date.parse(row.completed_at) - Date.parse(row.due_at)) / 60_000)
    .filter((value) => value > 0);

  return {
    created: totals?.created ?? 0,
    completed: totals?.completed ?? 0,
    overdue: totals?.overdue ?? 0,
    averageDelayMinutes: delays.length
      ? Math.round(delays.reduce((sum, value) => sum + value, 0) / delays.length)
      : null
  };
}

// "Sem retorno recente" é uma regra fechada: teve atendimento concluído e o mais
// recente deles é anterior à janela de retorno.
async function clientsReport(ctx: AdminRequestContext, period: Period, from: string, to: string) {
  const today = todayIso();
  const [created, groups, recent] = await Promise.all([
    ctx.db.prepare("SELECT COUNT(*) AS total FROM clients WHERE tenant_id = ? AND created_at >= ? AND created_at <= ?")
      .bind(ctx.tenantId, from, to).first<{ total: number }>(),
    ctx.db.prepare(`
      SELECT client_id, COUNT(*) AS total FROM appointments
      WHERE tenant_id = ? AND appointment_date >= ? AND appointment_date <= ?
        AND status IN ${OCCUPIED}
      GROUP BY client_id
    `).bind(ctx.tenantId, period.from, period.to).all<{ client_id: string; total: number }>(),
    ctx.db.prepare(`
      SELECT client_id, MAX(appointment_date) AS last_date FROM appointments
      WHERE tenant_id = ? AND status = 'COMPLETED' AND appointment_date >= ?
      GROUP BY client_id
    `).bind(ctx.tenantId, shiftDate(today, -365)).all<{ client_id: string; last_date: string }>()
  ]);

  const withMoreThanOne = groups.results.filter((row) => row.total > 1).length;
  const cutoff = shiftDate(today, -RETURN_WINDOW_DAYS);

  return {
    created: created?.total ?? 0,
    withAppointments: groups.results.length,
    withMoreThanOne,
    returning: withMoreThanOne,
    withoutRecentReturn: recent.results.filter((row) => row.last_date < cutoff).length,
    returnWindowDays: RETURN_WINDOW_DAYS
  };
}

async function getMetrics(ctx: AdminRequestContext): Promise<Response> {
  const period = resolveMetricsPeriod(ctx.url);
  const settings = settingsPayload(await loadSettings(ctx), ctx.tenantId);
  const from = `${period.from}T00:00:00.000Z`;
  const to = `${period.to}T23:59:59.999Z`;

  const [statusGroups, rescheduled, capacity, leads, followUps, clients] = await Promise.all([
    ctx.db.prepare(`
      SELECT status, COUNT(*) AS total FROM appointments
      WHERE tenant_id = ? AND appointment_date >= ? AND appointment_date <= ?
      GROUP BY status
    `).bind(ctx.tenantId, period.from, period.to).all<{ status: string; total: number }>(),
    ctx.db.prepare(`
      SELECT COUNT(*) AS total FROM appointments
      WHERE tenant_id = ? AND appointment_date >= ? AND appointment_date <= ?
        AND rescheduled_from_id IS NOT NULL
    `).bind(ctx.tenantId, period.from, period.to).first<{ total: number }>(),
    capacityReport(ctx, period, settings.slotDurationMinutes),
    leadsReport(ctx, from, to),
    followUpsReport(ctx, from, to),
    clientsReport(ctx, period, from, to)
  ]);

  const byStatus = zeroed(APPOINTMENT_STATUSES);
  for (const group of statusGroups.results) byStatus[group.status] = group.total;
  const total = Object.values(byStatus).reduce((sum, value) => sum + value, 0);
  const finished = byStatus.COMPLETED + byStatus.NO_SHOW;

  return json({
    tenantId: ctx.tenantId,
    period,
    appointments: {
      total,
      byStatus,
      rescheduled: rescheduled?.total ?? 0,
      attendanceRate: rate(byStatus.COMPLETED, finished),
      cancellationRate: rate(byStatus.CANCELLED, total),
      noShowRate: rate(byStatus.NO_SHOW, finished)
    },
    capacity,
    leads,
    followUps,
    clients
  });
}

export const settingsRoutes: AdminRoute[] = [
  route("GET", /^settings$/, "settings", getSettings),
  route("PATCH", /^settings$/, "settings", updateSettings),
  route("GET", /^metrics$/, "metrics", getMetrics)
];
