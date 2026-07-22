import {
  appointmentsOnDate,
  assertConfirmed,
  dayOfWeek,
  fitsWindows,
  futureAppointments,
  invalid,
  isValidDate,
  notFoundError,
  overlapsBlock,
  requireBoolean,
  requireDateValue,
  requireInteger,
  requireTimeValue,
  sanitizeText,
  shiftDate,
  todayIso,
  type ConflictSourceRow
} from "../../shared/src/admin";
import { requirePublicId, timeToMinutes } from "../../shared/src/availability";
import { HttpError, json, readJsonObject } from "../../shared/src/http";
import { route, type AdminRequestContext, type AdminRoute } from "./router";

const WEEK = [0, 1, 2, 3, 4, 5, 6];

interface BusinessHoursRow {
  id: string;
  tenant_id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_open: number;
}

interface ScheduleRow {
  id: string;
  tenant_id: string;
  professional_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  active: number;
  created_at: string;
  updated_at: string;
  professional_name?: string;
}

interface BlockRow {
  id: string;
  tenant_id: string;
  professional_id: string | null;
  date: string;
  all_day: number;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  created_at: string;
  updated_at: string;
  professional_name?: string | null;
}

interface ScheduleWindow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  active: boolean;
}

function businessHoursPayload(row: BusinessHoursRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    dayOfWeek: row.day_of_week,
    openTime: row.open_time,
    closeTime: row.close_time,
    isOpen: row.is_open === 1
  };
}

function schedulePayload(row: ScheduleRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    professionalId: row.professional_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    active: row.active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    professional: row.professional_name === undefined
      ? undefined
      : { id: row.professional_id, name: row.professional_name }
  };
}

function blockPayload(row: BlockRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    professionalId: row.professional_id,
    date: row.date,
    allDay: row.all_day === 1,
    startTime: row.start_time,
    endTime: row.end_time,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    professional: row.professional_id
      ? { id: row.professional_id, name: row.professional_name ?? null }
      : null
  };
}

function requireDayOfWeek(value: unknown, field = "dayOfWeek"): number {
  return requireInteger(Number(value), field, 0, 6);
}

async function requireProfessional(ctx: AdminRequestContext, value: unknown): Promise<string> {
  const id = requirePublicId(typeof value === "string" ? value : null, "professionalId");
  const row = await ctx.db.prepare("SELECT id FROM professionals WHERE tenant_id = ? AND id = ?")
    .bind(ctx.tenantId, id).first<{ id: string }>();
  if (!row) notFoundError();
  return row.id;
}

// A agenda proposta é montada inteira antes de gravar: só assim dá para dizer
// quais agendamentos futuros deixariam de caber nela.
async function appointmentsOutsideWindows(
  ctx: AdminRequestContext,
  professionalId: string | null,
  windowsByDay: Record<number, [number, number][]>
): Promise<ConflictSourceRow[]> {
  const affected = await futureAppointments(
    ctx.db,
    ctx.tenantId,
    professionalId ? { professionalId } : {},
    200
  );
  return affected
    .filter((row) => !fitsWindows(row, windowsByDay[dayOfWeek(row.appointment_date)] ?? []))
    .slice(0, 50);
}

function windowsFromSchedules(schedules: ScheduleWindow[]): Record<number, [number, number][]> {
  const windows: Record<number, [number, number][]> = {};
  for (const schedule of schedules) {
    if (!schedule.active) continue;
    (windows[schedule.dayOfWeek] ||= []).push([
      timeToMinutes(schedule.startTime),
      timeToMinutes(schedule.endTime)
    ]);
  }
  return windows;
}

async function currentSchedules(ctx: AdminRequestContext, professionalId: string): Promise<ScheduleRow[]> {
  const rows = await ctx.db.prepare(`
    SELECT * FROM professional_schedules
    WHERE tenant_id = ? AND professional_id = ?
    ORDER BY day_of_week, start_time
  `).bind(ctx.tenantId, professionalId).all<ScheduleRow>();
  return rows.results;
}

function asWindow(row: ScheduleRow): ScheduleWindow {
  return {
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    active: row.active === 1
  };
}

async function listBusinessHours(ctx: AdminRequestContext): Promise<Response> {
  const rows = await ctx.db.prepare(
    "SELECT * FROM business_hours WHERE tenant_id = ? ORDER BY day_of_week"
  ).bind(ctx.tenantId).all<BusinessHoursRow>();
  const byDay = new Map(rows.results.map((row) => [row.day_of_week, row]));

  // O painel edita a semana inteira; dias sem registro voltam fechados.
  return json(WEEK.map((day) => {
    const row = byDay.get(day);
    return row ? businessHoursPayload(row) : {
      id: null,
      tenantId: ctx.tenantId,
      dayOfWeek: day,
      openTime: "09:00",
      closeTime: "18:00",
      isOpen: false
    };
  }));
}

async function updateBusinessHours(ctx: AdminRequestContext): Promise<Response> {
  const body = await readJsonObject(ctx.request, 16384);
  if (!Array.isArray(body.days) || !body.days.length) invalid("Informe os dias da semana");

  const seen = new Set<number>();
  const days = body.days.map((entry) => {
    const value = entry as Record<string, unknown>;
    const day = requireDayOfWeek(value.dayOfWeek);
    if (seen.has(day)) invalid("Dia da semana repetido");
    seen.add(day);
    const isOpen = value.isOpen === undefined ? true : requireBoolean(value.isOpen, "isOpen");
    const openTime = requireTimeValue(value.openTime, "Horário");
    const closeTime = requireTimeValue(value.closeTime, "Horário");
    // Dia fechado não gera slot, então a ordem dos horários é irrelevante.
    if (isOpen && timeToMinutes(openTime) >= timeToMinutes(closeTime)) {
      invalid("O horário de abertura deve ser menor que o de fechamento");
    }
    return { dayOfWeek: day, isOpen, openTime, closeTime };
  });

  const current = await ctx.db.prepare("SELECT * FROM business_hours WHERE tenant_id = ?")
    .bind(ctx.tenantId).all<BusinessHoursRow>();
  const merged = new Map(current.results.map((row) => [row.day_of_week, {
    dayOfWeek: row.day_of_week,
    isOpen: row.is_open === 1,
    openTime: row.open_time,
    closeTime: row.close_time
  }]));
  for (const day of days) merged.set(day.dayOfWeek, day);

  const windowsByDay: Record<number, [number, number][]> = {};
  for (const [day, value] of merged) {
    windowsByDay[day] = value.isOpen
      ? [[timeToMinutes(value.openTime), timeToMinutes(value.closeTime)]]
      : [];
  }

  const affected = await appointmentsOutsideWindows(ctx, null, windowsByDay);
  const appliedImpact = assertConfirmed(
    affected,
    body.confirm,
    "O novo horário deixa agendamentos futuros fora do expediente"
  );

  await ctx.db.batch(days.map((day) => ctx.db.prepare(`
    INSERT INTO business_hours (id, tenant_id, day_of_week, open_time, close_time, is_open)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(tenant_id, day_of_week) DO UPDATE SET
      open_time = excluded.open_time,
      close_time = excluded.close_time,
      is_open = excluded.is_open
  `).bind(
    crypto.randomUUID(),
    ctx.tenantId,
    day.dayOfWeek,
    day.isOpen ? day.openTime : "00:00",
    day.isOpen ? day.closeTime : "00:00",
    day.isOpen ? 1 : 0
  )));

  const saved = await ctx.db.prepare(
    "SELECT * FROM business_hours WHERE tenant_id = ? ORDER BY day_of_week"
  ).bind(ctx.tenantId).all<BusinessHoursRow>();
  return json({ days: saved.results.map(businessHoursPayload), appliedImpact });
}

async function assertNoOverlap(
  ctx: AdminRequestContext,
  data: { professionalId: string; dayOfWeek: number; startTime: string; endTime: string },
  excludeId: string | null
): Promise<void> {
  const overlap = await ctx.db.prepare(`
    SELECT id FROM professional_schedules
    WHERE tenant_id = ? AND professional_id = ? AND day_of_week = ?
      AND start_time < ? AND end_time > ? AND (? IS NULL OR id <> ?)
  `).bind(
    ctx.tenantId, data.professionalId, data.dayOfWeek,
    data.endTime, data.startTime, excludeId, excludeId
  ).first<{ id: string }>();
  if (overlap) throw new HttpError(409, "CONFLICT", "O horário se sobrepõe a outro intervalo");
}

async function listProfessionalSchedules(ctx: AdminRequestContext): Promise<Response> {
  const param = ctx.url.searchParams.get("professionalId");
  const professionalId = param === null || param === "" ? null : await requireProfessional(ctx, param);
  const rows = await ctx.db.prepare(`
    SELECT s.*, p.name AS professional_name
    FROM professional_schedules s
    JOIN professionals p ON p.tenant_id = s.tenant_id AND p.id = s.professional_id
    WHERE s.tenant_id = ? AND (? IS NULL OR s.professional_id = ?)
    ORDER BY s.professional_id, s.day_of_week, s.start_time
  `).bind(ctx.tenantId, professionalId, professionalId).all<ScheduleRow>();
  return json(rows.results.map(schedulePayload));
}

async function loadSchedule(ctx: AdminRequestContext, value: string): Promise<ScheduleRow> {
  const id = requirePublicId(value, "ID");
  const row = await ctx.db.prepare(`
    SELECT s.*, p.name AS professional_name
    FROM professional_schedules s
    JOIN professionals p ON p.tenant_id = s.tenant_id AND p.id = s.professional_id
    WHERE s.tenant_id = ? AND s.id = ?
  `).bind(ctx.tenantId, id).first<ScheduleRow>();
  if (!row) notFoundError();
  return row;
}

async function createProfessionalSchedule(ctx: AdminRequestContext): Promise<Response> {
  const body = await readJsonObject(ctx.request);
  const professionalId = await requireProfessional(ctx, body.professionalId);
  const day = requireDayOfWeek(body.dayOfWeek);
  const startTime = requireTimeValue(body.startTime);
  const endTime = requireTimeValue(body.endTime);
  if (startTime >= endTime) invalid("Intervalo de horário inválido");
  const active = body.active === undefined ? true : requireBoolean(body.active, "active");

  await assertNoOverlap(ctx, { professionalId, dayOfWeek: day, startTime, endTime }, null);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await ctx.db.prepare(`
    INSERT INTO professional_schedules (
      id, tenant_id, professional_id, day_of_week, start_time, end_time, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, ctx.tenantId, professionalId, day, startTime, endTime, active ? 1 : 0, now, now).run();
  return json(schedulePayload(await loadSchedule(ctx, id)), { status: 201 });
}

async function updateProfessionalSchedule(ctx: AdminRequestContext): Promise<Response> {
  const current = await loadSchedule(ctx, ctx.params[0]);
  const body = await readJsonObject(ctx.request);
  const professionalId = body.professionalId === undefined
    ? current.professional_id
    : await requireProfessional(ctx, body.professionalId);
  const day = body.dayOfWeek === undefined ? current.day_of_week : requireDayOfWeek(body.dayOfWeek);
  const startTime = body.startTime === undefined ? current.start_time : requireTimeValue(body.startTime);
  const endTime = body.endTime === undefined ? current.end_time : requireTimeValue(body.endTime);
  if (startTime >= endTime) invalid("Intervalo de horário inválido");
  const active = body.active === undefined ? current.active === 1 : requireBoolean(body.active, "active");

  await assertNoOverlap(ctx, { professionalId, dayOfWeek: day, startTime, endTime }, current.id);

  const existing = await currentSchedules(ctx, current.professional_id);
  const intended = [
    ...existing.filter((row) => row.id !== current.id).map(asWindow),
    { dayOfWeek: day, startTime, endTime, active }
  ];
  const appliedImpact = assertConfirmed(
    await appointmentsOutsideWindows(ctx, current.professional_id, windowsFromSchedules(intended)),
    body.confirm,
    "A alteração deixa agendamentos futuros fora da agenda do profissional"
  );

  await ctx.db.prepare(`
    UPDATE professional_schedules
    SET professional_id = ?, day_of_week = ?, start_time = ?, end_time = ?, active = ?, updated_at = ?
    WHERE tenant_id = ? AND id = ?
  `).bind(
    professionalId, day, startTime, endTime, active ? 1 : 0,
    new Date().toISOString(), ctx.tenantId, current.id
  ).run();

  return json({ ...schedulePayload(await loadSchedule(ctx, current.id)), appliedImpact });
}

async function deleteProfessionalSchedule(ctx: AdminRequestContext): Promise<Response> {
  const current = await loadSchedule(ctx, ctx.params[0]);
  const existing = await currentSchedules(ctx, current.professional_id);
  assertConfirmed(
    await appointmentsOutsideWindows(
      ctx,
      current.professional_id,
      windowsFromSchedules(existing.filter((row) => row.id !== current.id).map(asWindow))
    ),
    ctx.url.searchParams.get("confirm") === "true",
    "Remover esta janela deixa agendamentos futuros sem agenda"
  );

  await ctx.db.prepare("DELETE FROM professional_schedules WHERE tenant_id = ? AND id = ?")
    .bind(ctx.tenantId, current.id).run();
  return new Response(null, { status: 204 });
}

function targetDays(value: unknown): number[] {
  if (value === undefined) return WEEK;
  if (!Array.isArray(value) || !value.length) invalid("targetDays inválido");
  return [...new Set(value.map((day) => requireDayOfWeek(day, "targetDays")))];
}

async function sourceWindows(
  ctx: AdminRequestContext,
  body: Record<string, unknown>
): Promise<Record<number, { startTime: string; endTime: string }[]>> {
  const source = body.source === undefined ? "professional" : body.source;

  if (source === "business") {
    const rows = await ctx.db.prepare(
      "SELECT day_of_week, open_time, close_time FROM business_hours WHERE tenant_id = ? AND is_open = 1"
    ).bind(ctx.tenantId).all<{ day_of_week: number; open_time: string; close_time: string }>();
    if (!rows.results.length) invalid("O negócio não tem horário de funcionamento configurado");
    return Object.fromEntries(rows.results.map((row) => [
      row.day_of_week,
      [{ startTime: row.open_time, endTime: row.close_time }]
    ]));
  }

  if (source === "professional") {
    const from = await requireProfessional(ctx, body.fromProfessionalId);
    const rows = await ctx.db.prepare(`
      SELECT day_of_week, start_time, end_time FROM professional_schedules
      WHERE tenant_id = ? AND professional_id = ? AND active = 1
      ORDER BY day_of_week, start_time
    `).bind(ctx.tenantId, from).all<{ day_of_week: number; start_time: string; end_time: string }>();
    if (!rows.results.length) invalid("O profissional de origem não tem agenda configurada");
    const byDay: Record<number, { startTime: string; endTime: string }[]> = {};
    for (const row of rows.results) {
      (byDay[row.day_of_week] ||= []).push({ startTime: row.start_time, endTime: row.end_time });
    }
    return byDay;
  }

  if (source === "day") {
    const from = await requireProfessional(ctx, body.fromProfessionalId ?? body.professionalId);
    const day = requireDayOfWeek(body.fromDayOfWeek, "fromDayOfWeek");
    const rows = await ctx.db.prepare(`
      SELECT start_time, end_time FROM professional_schedules
      WHERE tenant_id = ? AND professional_id = ? AND day_of_week = ? AND active = 1
      ORDER BY start_time
    `).bind(ctx.tenantId, from, day).all<{ start_time: string; end_time: string }>();
    if (!rows.results.length) invalid("O dia de origem não tem janelas ativas");
    const intervals = rows.results.map((row) => ({ startTime: row.start_time, endTime: row.end_time }));
    return Object.fromEntries(targetDays(body.targetDays).map((target) => [target, intervals]));
  }

  return invalid("source inválido");
}

// Copiar agenda substitui os dias alvo por inteiro; por isso relata impacto antes de gravar.
async function copyProfessionalSchedules(ctx: AdminRequestContext): Promise<Response> {
  const body = await readJsonObject(ctx.request, 16384);
  const target = await requireProfessional(ctx, body.targetProfessionalId ?? body.professionalId);
  const days = targetDays(body.targetDays);
  const windows = await sourceWindows(ctx, body);

  const replacement = days.flatMap((day) => (windows[day] ?? []).map((interval) => ({
    dayOfWeek: day,
    startTime: interval.startTime,
    endTime: interval.endTime,
    active: true
  })));

  const existing = await currentSchedules(ctx, target);
  const intended = [
    ...existing.filter((row) => !days.includes(row.day_of_week)).map(asWindow),
    ...replacement
  ];
  const appliedImpact = assertConfirmed(
    await appointmentsOutsideWindows(ctx, target, windowsFromSchedules(intended)),
    body.confirm,
    "A agenda copiada deixa agendamentos futuros descobertos"
  );

  const now = new Date().toISOString();
  const placeholders = days.map(() => "?").join(", ");
  await ctx.db.batch([
    ctx.db.prepare(`
      DELETE FROM professional_schedules
      WHERE tenant_id = ? AND professional_id = ? AND day_of_week IN (${placeholders})
    `).bind(ctx.tenantId, target, ...days),
    ...replacement.map((window) => ctx.db.prepare(`
      INSERT INTO professional_schedules (
        id, tenant_id, professional_id, day_of_week, start_time, end_time, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(crypto.randomUUID(), ctx.tenantId, target, window.dayOfWeek, window.startTime, window.endTime, now, now))
  ]);

  const saved = await ctx.db.prepare(`
    SELECT s.*, p.name AS professional_name
    FROM professional_schedules s
    JOIN professionals p ON p.tenant_id = s.tenant_id AND p.id = s.professional_id
    WHERE s.tenant_id = ? AND s.professional_id = ?
    ORDER BY s.day_of_week, s.start_time
  `).bind(ctx.tenantId, target).all<ScheduleRow>();

  return json({
    professionalId: target,
    copiedDays: days,
    schedules: saved.results.map(schedulePayload),
    appliedImpact
  });
}

// Períodos nomeados evitam que o painel precise calcular datas para as visões
// mais usadas — futuro e passado.
function resolvePeriod(url: URL): { from: string; to: string } {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (from !== null || to !== null) {
    if (!isValidDate(from) || !isValidDate(to) || from > to) invalid("Período inválido");
    return { from, to };
  }
  const today = todayIso();
  const scope = url.searchParams.get("scope");
  if (scope === "past") return { from: shiftDate(today, -180), to: shiftDate(today, -1) };
  if (scope === "all") return { from: shiftDate(today, -180), to: shiftDate(today, 180) };
  return { from: today, to: shiftDate(today, 180) };
}

async function appointmentsInsideBlock(
  ctx: AdminRequestContext,
  block: { date: string; professionalId: string | null; allDay: boolean; startTime: string | null; endTime: string | null }
): Promise<ConflictSourceRow[]> {
  if (block.date < todayIso()) return [];
  const affected = await appointmentsOnDate(ctx.db, ctx.tenantId, block.date, block.professionalId);
  if (block.allDay) return affected;
  return affected.filter((row) => overlapsBlock(row, block));
}

async function loadBlock(ctx: AdminRequestContext, value: string): Promise<BlockRow> {
  const id = requirePublicId(value, "ID");
  const row = await ctx.db.prepare(`
    SELECT b.*, p.name AS professional_name
    FROM schedule_blocks b
    LEFT JOIN professionals p ON p.tenant_id = b.tenant_id AND p.id = b.professional_id
    WHERE b.tenant_id = ? AND b.id = ?
  `).bind(ctx.tenantId, id).first<BlockRow>();
  if (!row) notFoundError();
  return row;
}

async function normalizeBlock(
  ctx: AdminRequestContext,
  body: Record<string, unknown>,
  current: BlockRow | null
) {
  const rawProfessional = body.professionalId === undefined ? current?.professional_id ?? null : body.professionalId;
  const professionalId = rawProfessional === null || rawProfessional === undefined || rawProfessional === ""
    ? null
    : await requireProfessional(ctx, rawProfessional);
  const date = body.date === undefined && current ? current.date : requireDateValue(body.date);
  const allDay = body.allDay === undefined
    ? current?.all_day === 1
    : requireBoolean(body.allDay, "allDay");

  let startTime: string | null = null;
  let endTime: string | null = null;
  if (!allDay) {
    startTime = requireTimeValue(body.startTime === undefined ? current?.start_time : body.startTime, "Bloqueio");
    endTime = requireTimeValue(body.endTime === undefined ? current?.end_time : body.endTime, "Bloqueio");
    if (startTime >= endTime) invalid("Intervalo de bloqueio inválido");
  }

  const reason = body.reason === undefined
    ? current?.reason ?? null
    : sanitizeText(body.reason, "Motivo", 1, 200, false);

  return { professionalId, date, allDay, startTime, endTime, reason };
}

async function listScheduleBlocks(ctx: AdminRequestContext): Promise<Response> {
  const { from, to } = resolvePeriod(ctx.url);
  const param = ctx.url.searchParams.get("professionalId");
  const professionalId = param === null || param === "" ? null : await requireProfessional(ctx, param);
  const rows = await ctx.db.prepare(`
    SELECT b.*, p.name AS professional_name
    FROM schedule_blocks b
    LEFT JOIN professionals p ON p.tenant_id = b.tenant_id AND p.id = b.professional_id
    WHERE b.tenant_id = ? AND b.date >= ? AND b.date <= ?
      AND (? IS NULL OR b.professional_id = ?)
    ORDER BY b.date, b.start_time
  `).bind(ctx.tenantId, from, to, professionalId, professionalId).all<BlockRow>();
  return json(rows.results.map(blockPayload));
}

async function createScheduleBlock(ctx: AdminRequestContext): Promise<Response> {
  const body = await readJsonObject(ctx.request);
  const data = await normalizeBlock(ctx, body, null);
  const appliedImpact = assertConfirmed(
    await appointmentsInsideBlock(ctx, data),
    body.confirm,
    "O bloqueio cobre agendamentos futuros já marcados"
  );

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await ctx.db.prepare(`
    INSERT INTO schedule_blocks (
      id, tenant_id, professional_id, date, all_day, start_time, end_time, reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id, ctx.tenantId, data.professionalId, data.date, data.allDay ? 1 : 0,
    data.startTime, data.endTime, data.reason, now, now
  ).run();

  return json({ ...blockPayload(await loadBlock(ctx, id)), appliedImpact }, { status: 201 });
}

async function updateScheduleBlock(ctx: AdminRequestContext): Promise<Response> {
  const current = await loadBlock(ctx, ctx.params[0]);
  const body = await readJsonObject(ctx.request);
  const data = await normalizeBlock(ctx, body, current);
  const appliedImpact = assertConfirmed(
    await appointmentsInsideBlock(ctx, data),
    body.confirm,
    "O bloqueio cobre agendamentos futuros já marcados"
  );

  await ctx.db.prepare(`
    UPDATE schedule_blocks
    SET professional_id = ?, date = ?, all_day = ?, start_time = ?, end_time = ?, reason = ?, updated_at = ?
    WHERE tenant_id = ? AND id = ?
  `).bind(
    data.professionalId, data.date, data.allDay ? 1 : 0, data.startTime, data.endTime,
    data.reason, new Date().toISOString(), ctx.tenantId, current.id
  ).run();

  return json({ ...blockPayload(await loadBlock(ctx, current.id)), appliedImpact });
}

async function deleteScheduleBlock(ctx: AdminRequestContext): Promise<Response> {
  const current = await loadBlock(ctx, ctx.params[0]);
  await ctx.db.prepare("DELETE FROM schedule_blocks WHERE tenant_id = ? AND id = ?")
    .bind(ctx.tenantId, current.id).run();
  return new Response(null, { status: 204 });
}

export const schedulingRoutes: AdminRoute[] = [
  route("GET", /^business-hours$/, listBusinessHours),
  route("PUT", /^business-hours$/, updateBusinessHours),

  route("POST", /^professional-schedules\/copy$/, copyProfessionalSchedules),
  route("GET", /^professional-schedules$/, listProfessionalSchedules),
  route("POST", /^professional-schedules$/, createProfessionalSchedule),
  route("PATCH", /^professional-schedules\/([^/]+)$/, updateProfessionalSchedule),
  route("DELETE", /^professional-schedules\/([^/]+)$/, deleteProfessionalSchedule),

  route("GET", /^schedule-blocks$/, listScheduleBlocks),
  route("POST", /^schedule-blocks$/, createScheduleBlock),
  route("PATCH", /^schedule-blocks\/([^/]+)$/, updateScheduleBlock),
  route("DELETE", /^schedule-blocks\/([^/]+)$/, deleteScheduleBlock)
];
