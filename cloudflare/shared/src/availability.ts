import { HttpError } from "./http";

export interface TimeWindow {
  startTime: string;
  endTime: string;
}

export interface AvailabilityBlock extends Partial<TimeWindow> {
  allDay: boolean;
}

export interface AvailabilityInput {
  business: (TimeWindow & { isOpen: boolean }) | null;
  professional: TimeWindow[];
  blocks: AvailabilityBlock[];
  occupied: TimeWindow[];
  durationMinutes: number;
  slotMinutes: number;
}

interface AvailabilitySettings {
  timezone: string;
  slot_duration_minutes: number;
  min_advance_minutes: number;
  max_future_days: number;
  booking_enabled: number;
}

interface AvailabilityService {
  id: string;
  duration_minutes: number;
}

interface AvailabilityProfessional {
  id: string;
}

interface BusinessHoursRow {
  is_open: number;
  open_time: string;
  close_time: string;
}

interface ScheduleRow {
  start_time: string;
  end_time: string;
}

interface BlockRow {
  all_day: number;
  start_time: string | null;
  end_time: string | null;
}

interface OccupiedSlotRow {
  slot_time: string;
}

export interface D1AvailabilityResult {
  date: string;
  serviceId: string;
  professionalId: string;
  durationMinutes: number;
  slotMinutes: number;
  slots: string[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;

export function timeToMinutes(value: string): number {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) throw new HttpError(400, "INVALID_REQUEST", "Horário inválido");
  return Number(match[1]) * 60 + Number(match[2]);
}

export function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60).toString().padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function contains(window: TimeWindow, start: number, end: number): boolean {
  return start >= timeToMinutes(window.startTime) && end <= timeToMinutes(window.endTime);
}

function overlaps(window: TimeWindow, start: number, end: number): boolean {
  return timeToMinutes(window.startTime) < end && timeToMinutes(window.endTime) > start;
}

export function calculateSlots(input: AvailabilityInput): string[] {
  if (!input.business?.isOpen) return [];
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) {
    throw new HttpError(400, "INVALID_REQUEST", "Duração inválida");
  }
  if (!Number.isInteger(input.slotMinutes) || input.slotMinutes <= 0) {
    throw new HttpError(400, "INVALID_REQUEST", "Grade inválida");
  }
  if (input.blocks.some((block) => block.allDay)) return [];

  const businessStart = timeToMinutes(input.business.startTime);
  const businessEnd = timeToMinutes(input.business.endTime);
  const partialBlocks = input.blocks.filter(
    (block): block is AvailabilityBlock & TimeWindow => !block.allDay && Boolean(block.startTime && block.endTime)
  );
  const slots: string[] = [];

  for (let start = businessStart; start + input.durationMinutes <= businessEnd; start += input.slotMinutes) {
    const end = start + input.durationMinutes;
    if (!input.professional.some((window) => contains(window, start, end))) continue;
    if (partialBlocks.some((block) => overlaps(block, start, end))) continue;
    if (input.occupied.some((window) => overlaps(window, start, end))) continue;
    slots.push(minutesToTime(start));
  }

  return slots;
}

export function requirePublicId(value: string | null, field: string): string {
  if (!value || !ID_PATTERN.test(value)) {
    throw new HttpError(400, "INVALID_REQUEST", `${field} inválido`);
  }
  return value;
}

export function requireDate(value: string | null): string {
  if (!value || !DATE_PATTERN.test(value)) {
    throw new HttpError(400, "INVALID_REQUEST", "Data inválida");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new HttpError(400, "INVALID_REQUEST", "Data inválida");
  }
  return value;
}

function dateInTimezone(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function timezoneOffsetMs(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(at);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const represented = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return represented - Math.floor(at.getTime() / 1000) * 1000;
}

function zonedDateTimeToEpoch(date: string, time: string, timezone: string): number {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const intended = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = intended - timezoneOffsetMs(new Date(intended), timezone);
  candidate = intended - timezoneOffsetMs(new Date(candidate), timezone);
  return candidate;
}

export async function calculateD1Availability(
  db: D1Database,
  tenantId: string,
  query: URLSearchParams,
  now = new Date()
): Promise<D1AvailabilityResult> {
  const date = requireDate(query.get("date"));
  const serviceId = requirePublicId(query.get("serviceId"), "serviceId");
  const professionalId = requirePublicId(query.get("professionalId"), "professionalId");

  const [settings, service, professional] = await Promise.all([
    db.prepare(`
      SELECT timezone, slot_duration_minutes, min_advance_minutes, max_future_days, booking_enabled
      FROM tenant_settings
      WHERE tenant_id = ?
    `).bind(tenantId).first<AvailabilitySettings>(),
    db.prepare(`
      SELECT s.id, s.duration_minutes
      FROM services s
      JOIN professional_services ps
        ON ps.tenant_id = s.tenant_id AND ps.service_id = s.id
      WHERE s.tenant_id = ? AND s.id = ? AND s.active = 1
        AND ps.professional_id = ?
    `).bind(tenantId, serviceId, professionalId).first<AvailabilityService>(),
    db.prepare(`
      SELECT id FROM professionals
      WHERE tenant_id = ? AND id = ? AND active = 1
    `).bind(tenantId, professionalId).first<AvailabilityProfessional>()
  ]);

  if (!service || !professional) {
    throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");
  }
  if (settings && settings.booking_enabled !== 1) {
    throw new HttpError(409, "CONFLICT", "Agendamento on-line indisponível");
  }

  const timezone = settings?.timezone ?? "America/Sao_Paulo";
  const today = dateInTimezone(now, timezone);
  const maxFutureDays = settings?.max_future_days ?? 90;
  if (date < today) {
    return {
      date,
      serviceId,
      professionalId,
      durationMinutes: service.duration_minutes,
      slotMinutes: settings?.slot_duration_minutes ?? 30,
      slots: []
    };
  }
  if (date > addDays(today, maxFutureDays)) {
    throw new HttpError(400, "INVALID_REQUEST", `Data excede o horizonte de ${maxFutureDays} dias`);
  }

  const dayOfWeek = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const [business, schedules, legacyBlock, blocks, occupied] = await Promise.all([
    db.prepare(`
      SELECT is_open, open_time, close_time
      FROM business_hours
      WHERE tenant_id = ? AND day_of_week = ?
    `).bind(tenantId, dayOfWeek).first<BusinessHoursRow>(),
    db.prepare(`
      SELECT start_time, end_time
      FROM professional_schedules
      WHERE tenant_id = ? AND professional_id = ? AND day_of_week = ? AND active = 1
      ORDER BY start_time
    `).bind(tenantId, professionalId, dayOfWeek).all<ScheduleRow>(),
    db.prepare(`
      SELECT id FROM blocked_dates
      WHERE tenant_id = ? AND date = ?
    `).bind(tenantId, date).first<{ id: string }>(),
    db.prepare(`
      SELECT all_day, start_time, end_time
      FROM schedule_blocks
      WHERE tenant_id = ? AND date = ?
        AND (professional_id IS NULL OR professional_id = ?)
    `).bind(tenantId, date, professionalId).all<BlockRow>(),
    db.prepare(`
      SELECT slots.slot_time
      FROM appointment_slots slots
      JOIN appointments appointments
        ON appointments.tenant_id = slots.tenant_id AND appointments.id = slots.appointment_id
      WHERE slots.tenant_id = ? AND slots.professional_id = ?
        AND slots.appointment_date = ? AND appointments.status <> 'CANCELLED'
    `).bind(tenantId, professionalId, date).all<OccupiedSlotRow>()
  ]);

  const slotMinutes = settings?.slot_duration_minutes ?? 30;
  const minimumEpoch = now.getTime() + (settings?.min_advance_minutes ?? 0) * 60_000;
  const slots = calculateSlots({
    business: business
      ? { isOpen: business.is_open === 1, startTime: business.open_time, endTime: business.close_time }
      : null,
    professional: schedules.results.map((row) => ({ startTime: row.start_time, endTime: row.end_time })),
    blocks: legacyBlock
      ? [{ allDay: true }]
      : blocks.results.map((row) => ({
          allDay: row.all_day === 1,
          startTime: row.start_time ?? undefined,
          endTime: row.end_time ?? undefined
        })),
    occupied: occupied.results.map((row) => ({
      startTime: row.slot_time,
      endTime: minutesToTime(timeToMinutes(row.slot_time) + slotMinutes)
    })),
    durationMinutes: service.duration_minutes,
    slotMinutes
  }).filter((slot) => zonedDateTimeToEpoch(date, slot, timezone) >= minimumEpoch);

  return {
    date,
    serviceId,
    professionalId,
    durationMinutes: service.duration_minutes,
    slotMinutes,
    slots
  };
}
