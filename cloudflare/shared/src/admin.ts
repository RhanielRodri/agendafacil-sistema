import { minutesToTime, timeToMinutes } from "./availability";
import { HttpError } from "./http";

export const APPOINTMENT_STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"] as const;
export const OPEN_APPOINTMENT_STATUSES = ["PENDING", "CONFIRMED"] as const;
export const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"] as const;
export const ACTIVE_LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED"] as const;
export const LEAD_SOURCES = ["BOOKING", "WAITLIST", "EVALUATION", "CONTACT", "ABANDONED_BOOKING", "MANUAL"] as const;
export const LEAD_PRIORITIES = ["LOW", "NORMAL", "HIGH"] as const;
export const FOLLOW_UP_TYPES = ["CONTACT", "RETURN", "EVALUATION", "WAITLIST", "OTHER"] as const;
export const FOLLOW_UP_STATUSES = ["OPEN", "COMPLETED", "CANCELLED"] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: []
};

const HISTORY_TYPE_BY_STATUS: Record<string, string> = {
  CONFIRMED: "CONFIRMED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW"
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CONFLICT_LIMIT = 50;
const PAGE_SIZE_MAX = 100;

export function invalid(message: string): never {
  throw new HttpError(400, "INVALID_REQUEST", message);
}

export function notFoundError(): never {
  throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");
}

export function sanitizeText(
  value: unknown,
  field: string,
  min: number,
  max: number,
  required = true
): string | null {
  if (value === null || value === undefined || value === "") {
    if (required) invalid(`${field} inválido`);
    return null;
  }
  if (typeof value !== "string" || value.length > max) invalid(`${field} inválido`);
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length < min || clean.length > max) invalid(`${field} inválido`);
  return clean;
}

export function sanitizeReason(value: unknown, max = 300): string | null {
  if (typeof value !== "string") return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return clean ? clean.slice(0, max) : null;
}

export function requireEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) invalid(`${field} inválido`);
  return value as T;
}

export function optionalEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T | null {
  if (value === null || value === undefined || value === "") return null;
  return requireEnum(value, allowed, field);
}

export function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") invalid(`${field} inválido`);
  return value;
}

export function requireInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    invalid(`${field} inválido`);
  }
  return value;
}

export function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function requireDateValue(value: unknown, field = "Data"): string {
  if (!isValidDate(value)) invalid(`${field} inválida`);
  return value;
}

export function requireTimeValue(value: unknown, field = "Horário"): string {
  if (typeof value !== "string") invalid(`${field} inválido`);
  timeToMinutes(value);
  return value;
}

export function requireIsoDateTime(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length > 40) invalid(`${field} inválido`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) invalid(`${field} inválido`);
  return parsed.toISOString();
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

export function requestedDay(value: string | null): string {
  if (value === null || value === "") return todayIso();
  return requireDateValue(value);
}

export interface Pagination {
  page: number;
  pageSize: number;
  offset: number;
}

export function pagination(url: URL, defaultSize = 20): Pagination {
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? String(defaultSize));
  if (!Number.isInteger(page) || page < 1) invalid("page inválido");
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE_MAX) invalid("pageSize inválido");
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function zeroed(keys: readonly string[]): Record<string, number> {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

export function assertStatusTransition(from: string, to: string): { idempotent: boolean } {
  if (!APPOINTMENT_STATUSES.includes(to as AppointmentStatus)) invalid("Status inválido");
  if (from === to) return { idempotent: true };
  if (!TRANSITIONS[from as AppointmentStatus]?.includes(to as AppointmentStatus)) {
    throw new HttpError(409, "CONFLICT", `Transição de ${from} para ${to} não permitida`);
  }
  return { idempotent: false };
}

export function historyTypeFor(status: string): string {
  return HISTORY_TYPE_BY_STATUS[status] ?? "STATUS_CHANGED";
}

export function appointmentHistoryStatement(
  db: D1Database,
  event: {
    tenantId: string;
    appointmentId: string;
    type: string;
    fromStatus?: string | null;
    toStatus?: string | null;
    metadata?: Record<string, unknown> | null;
    actorType: "ADMIN" | "CUSTOMER" | "SYSTEM";
    actorIdentityId?: string | null;
  }
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO appointment_history_events (
      id, tenant_id, appointment_id, type, from_status, to_status,
      metadata_json, actor_type, actor_identity_id, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    event.tenantId,
    event.appointmentId,
    event.type,
    event.fromStatus ?? null,
    event.toStatus ?? null,
    event.metadata ? JSON.stringify(event.metadata) : null,
    event.actorType,
    event.actorIdentityId ?? null,
    new Date().toISOString()
  );
}

export function relationshipEventStatement(
  db: D1Database,
  event: {
    tenantId: string;
    clientId: string;
    leadId?: string | null;
    appointmentId?: string | null;
    type: string;
    metadata?: Record<string, unknown> | null;
    actorType: "ADMIN" | "CUSTOMER" | "SYSTEM";
    actorIdentityId?: string | null;
  }
): D1PreparedStatement {
  return db.prepare(`
    INSERT INTO relationship_history_events (
      id, tenant_id, client_id, lead_id, appointment_id, type,
      actor_type, actor_identity_id, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    crypto.randomUUID(),
    event.tenantId,
    event.clientId,
    event.leadId ?? null,
    event.appointmentId ?? null,
    event.type,
    event.actorType,
    event.actorIdentityId ?? null,
    event.metadata ? JSON.stringify(event.metadata) : null,
    new Date().toISOString()
  );
}

export interface ConflictSourceRow {
  id: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  client_name: string;
  service_name: string;
  professional_id: string;
  professional_name: string;
}

export interface ConflictRow {
  appointmentId: string;
  date: string;
  time: string;
  endTime: string;
  status: string;
  clientName: string;
  serviceName: string;
  professionalId: string;
  professionalName: string;
}

export function conflictRow(row: ConflictSourceRow): ConflictRow {
  return {
    appointmentId: row.id,
    date: row.appointment_date,
    time: row.start_time,
    endTime: row.end_time,
    status: row.status,
    clientName: row.client_name,
    serviceName: row.service_name,
    professionalId: row.professional_id,
    professionalName: row.professional_name
  };
}

const CONFLICT_SELECT = `
  SELECT appointments.id, appointments.appointment_date, appointments.start_time,
    appointments.end_time, appointments.status, appointments.client_name,
    appointments.professional_id, services.name AS service_name,
    professionals.name AS professional_name
  FROM appointments
  JOIN services ON services.tenant_id = appointments.tenant_id AND services.id = appointments.service_id
  JOIN professionals ON professionals.tenant_id = appointments.tenant_id AND professionals.id = appointments.professional_id
`;

export async function futureAppointments(
  db: D1Database,
  tenantId: string,
  filter: { serviceId?: string; professionalId?: string } = {},
  limit = CONFLICT_LIMIT
): Promise<ConflictSourceRow[]> {
  const rows = await db.prepare(`
    ${CONFLICT_SELECT}
    WHERE appointments.tenant_id = ?
      AND appointments.status IN ('PENDING', 'CONFIRMED')
      AND appointments.appointment_date >= ?
      AND (? IS NULL OR appointments.service_id = ?)
      AND (? IS NULL OR appointments.professional_id = ?)
    ORDER BY appointments.appointment_date, appointments.start_time, appointments.id
    LIMIT ?
  `).bind(
    tenantId,
    todayIso(),
    filter.serviceId ?? null,
    filter.serviceId ?? null,
    filter.professionalId ?? null,
    filter.professionalId ?? null,
    limit
  ).all<ConflictSourceRow>();
  return rows.results;
}

export async function appointmentsOnDate(
  db: D1Database,
  tenantId: string,
  date: string,
  professionalId: string | null
): Promise<ConflictSourceRow[]> {
  const rows = await db.prepare(`
    ${CONFLICT_SELECT}
    WHERE appointments.tenant_id = ?
      AND appointments.appointment_date = ?
      AND appointments.status IN ('PENDING', 'CONFIRMED')
      AND (? IS NULL OR appointments.professional_id = ?)
    ORDER BY appointments.start_time, appointments.id
    LIMIT ?
  `).bind(tenantId, date, professionalId, professionalId, CONFLICT_LIMIT).all<ConflictSourceRow>();
  return rows.results;
}

export function fitsWindows(row: ConflictSourceRow, windows: [number, number][]): boolean {
  const start = timeToMinutes(row.start_time);
  const end = timeToMinutes(row.end_time);
  return windows.some(([open, close]) => start >= open && end <= close);
}

export function overlapsBlock(
  row: ConflictSourceRow,
  block: { allDay: boolean; startTime?: string | null; endTime?: string | null }
): boolean {
  if (block.allDay) return true;
  if (!block.startTime || !block.endTime) return false;
  const start = timeToMinutes(row.start_time);
  const end = timeToMinutes(row.end_time);
  return start < timeToMinutes(block.endTime) && timeToMinutes(block.startTime) < end;
}

// A prévia nunca escreve. A confirmação recalcula o impacto no estado atual e
// só aplica quando o operador confirmou explicitamente.
export function assertConfirmed(rows: ConflictSourceRow[], confirm: unknown, message: string): ConflictRow[] {
  const conflicts = rows.map(conflictRow);
  if (!conflicts.length || confirm === true) return conflicts;
  const error = new HttpError(409, "CONFLICT", message) as HttpError & { conflicts: ConflictRow[] };
  error.conflicts = conflicts;
  throw error;
}

export function endTimeFor(startTime: string, durationMinutes: number): string {
  return minutesToTime(timeToMinutes(startTime) + durationMinutes);
}

export function isConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("SQLITE_CONSTRAINT") || message.includes("UNIQUE constraint failed");
}
