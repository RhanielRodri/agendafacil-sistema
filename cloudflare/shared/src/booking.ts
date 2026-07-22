import { calculateD1Availability, minutesToTime, requireDate, requirePublicId, timeToMinutes } from "./availability";
import { HttpError } from "./http";

interface BookingInput {
  tenantId: string;
  serviceId: string;
  professionalId: string;
  clientId?: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string | null;
  appointmentDate: string;
  startTime: string;
  slotMinutes?: number;
}

interface BookingService {
  id: string;
  name: string;
  duration_minutes: number;
}

interface AppointmentRow {
  id: string;
  tenant_id: string;
  service_id: string;
  professional_id: string;
  client_id: string;
  client_name: string;
  client_phone: string;
  client_email: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  service_name: string;
  service_duration: number;
  professional_name: string;
}

interface TokenRow extends AppointmentRow {
  token_id: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
}

export interface BookingResult {
  id: string;
  status: "PENDING";
  rawToken?: string;
}

export interface PublicBookingPayload {
  serviceId: string;
  professionalId: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string | null;
  normalizedPhone: string;
  normalizedEmail: string | null;
  date: string;
  time: string;
}

function isConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("SQLITE_CONSTRAINT") || message.includes("UNIQUE constraint failed");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function tokenExpiry(appointmentDate: string, now: Date): string {
  const minimum = now.getTime() + 30 * 24 * 60 * 60 * 1000;
  const appointmentDeadline = new Date(`${appointmentDate}T23:59:59.999Z`);
  appointmentDeadline.setUTCDate(appointmentDeadline.getUTCDate() + 2);
  return new Date(Math.max(minimum, appointmentDeadline.getTime())).toISOString();
}

function cleanText(value: unknown, field: string, min: number, max: number, required = true): string | null {
  if (value === null || value === undefined || value === "") {
    if (required) throw new HttpError(400, "INVALID_REQUEST", `${field} inválido`);
    return null;
  }
  if (typeof value !== "string" || value.length > max) {
    throw new HttpError(400, "INVALID_REQUEST", `${field} inválido`);
  }
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length < min || clean.length > max) {
    throw new HttpError(400, "INVALID_REQUEST", `${field} inválido`);
  }
  return clean;
}

function requireTime(value: unknown): string {
  if (typeof value !== "string") throw new HttpError(400, "INVALID_REQUEST", "Horário inválido");
  timeToMinutes(value);
  return value;
}

export function validatePublicBookingPayload(payload: Record<string, unknown>): PublicBookingPayload {
  const serviceId = requirePublicId(typeof payload.serviceId === "string" ? payload.serviceId : null, "serviceId");
  const professionalId = requirePublicId(typeof payload.professionalId === "string" ? payload.professionalId : null, "professionalId");
  const clientName = cleanText(payload.clientName, "Nome", 2, 120) as string;
  const clientPhone = cleanText(payload.clientPhone, "Telefone", 1, 30) as string;
  const normalizedPhone = clientPhone.replace(/\D/g, "");
  if (normalizedPhone.length < 8 || normalizedPhone.length > 15) {
    throw new HttpError(400, "INVALID_REQUEST", "Telefone inválido");
  }
  const clientEmail = cleanText(payload.clientEmail, "E-mail", 3, 254, false);
  const normalizedEmail = clientEmail?.toLowerCase() ?? null;
  if (normalizedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new HttpError(400, "INVALID_REQUEST", "E-mail inválido");
  }
  const date = requireDate(typeof payload.date === "string" ? payload.date : null);
  const time = requireTime(payload.time);
  return {
    serviceId,
    professionalId,
    clientName,
    clientPhone,
    clientEmail,
    normalizedPhone,
    normalizedEmail,
    date,
    time
  };
}

function slotTimes(startTime: string, durationMinutes: number, slotMinutes: number): string[] {
  const start = timeToMinutes(startTime);
  return Array.from(
    { length: Math.ceil(durationMinutes / slotMinutes) },
    (_, index) => minutesToTime(start + index * slotMinutes)
  );
}

async function loadService(db: D1Database, input: BookingInput): Promise<BookingService> {
  const service = await db.prepare(`
    SELECT s.id, s.name, s.duration_minutes
    FROM professional_services ps
    JOIN services s ON s.id = ps.service_id AND s.tenant_id = ps.tenant_id
    JOIN professionals p ON p.id = ps.professional_id AND p.tenant_id = ps.tenant_id
    WHERE ps.tenant_id = ? AND ps.service_id = ? AND ps.professional_id = ?
      AND s.active = 1 AND p.active = 1
  `).bind(input.tenantId, input.serviceId, input.professionalId).first<BookingService>();
  if (!service) throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");
  return service;
}

async function atomicReservation(db: D1Database, input: BookingInput, service: BookingService): Promise<BookingResult> {
  const slotMinutes = input.slotMinutes ?? 30;
  const appointmentId = crypto.randomUUID();
  const clientId = input.clientId ?? crypto.randomUUID();
  const rawToken = randomToken();
  const tokenHash = await sha256(rawToken);
  const now = new Date();
  const nowIso = now.toISOString();
  const normalizedPhone = input.clientPhone.replace(/\D/g, "");
  const normalizedEmail = input.clientEmail?.toLowerCase() ?? null;
  const endTime = minutesToTime(timeToMinutes(input.startTime) + service.duration_minutes);
  const slots = slotTimes(input.startTime, service.duration_minutes, slotMinutes);
  const statements: D1PreparedStatement[] = [
    db.prepare(`
      INSERT INTO clients (
        id, tenant_id, name, phone, normalized_phone, email, normalized_email,
        first_contact_at, last_contact_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(tenant_id, normalized_phone) DO UPDATE SET
        name = CASE
          WHEN lower(clients.name) = lower(excluded.name) THEN excluded.name
          ELSE clients.name
        END,
        email = COALESCE(clients.email, excluded.email),
        normalized_email = COALESCE(clients.normalized_email, excluded.normalized_email),
        last_contact_at = excluded.last_contact_at,
        updated_at = excluded.updated_at
    `).bind(
      clientId,
      input.tenantId,
      input.clientName,
      input.clientPhone,
      normalizedPhone,
      input.clientEmail ?? null,
      normalizedEmail,
      nowIso,
      nowIso,
      nowIso,
      nowIso
    ),
    db.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id,
        client_name, client_phone, client_email, appointment_date, start_time,
        end_time, status, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, clients.id, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?
      FROM clients
      WHERE clients.tenant_id = ? AND clients.normalized_phone = ?
    `).bind(
      appointmentId,
      input.tenantId,
      input.serviceId,
      input.professionalId,
      input.clientName,
      input.clientPhone,
      input.clientEmail ?? null,
      input.appointmentDate,
      input.startTime,
      endTime,
      nowIso,
      nowIso,
      input.tenantId,
      normalizedPhone
    ),
    db.prepare(`
      INSERT INTO relationship_history_events (
        id, tenant_id, client_id, appointment_id, type, actor_type, metadata_json, created_at
      )
      SELECT ?, ?, clients.id, NULL, 'CLIENT_CREATED', 'CUSTOMER', ?, ?
      FROM clients
      WHERE clients.id = ? AND clients.tenant_id = ?
    `).bind(crypto.randomUUID(), input.tenantId, JSON.stringify({ source: "BOOKING" }), nowIso, clientId, input.tenantId),
    db.prepare(`
      INSERT INTO appointment_history_events (
        id, tenant_id, appointment_id, type, to_status, actor_type, created_at
      ) VALUES (?, ?, ?, 'CREATED', 'PENDING', 'CUSTOMER', ?)
    `).bind(crypto.randomUUID(), input.tenantId, appointmentId, nowIso),
    db.prepare(`
      INSERT INTO relationship_history_events (
        id, tenant_id, client_id, appointment_id, type, actor_type, metadata_json, created_at
      )
      SELECT ?, ?, clients.id, ?, 'APPOINTMENT_LINKED', 'CUSTOMER', ?, ?
      FROM clients
      WHERE clients.tenant_id = ? AND clients.normalized_phone = ?
    `).bind(
      crypto.randomUUID(),
      input.tenantId,
      appointmentId,
      JSON.stringify({ source: "BOOKING", appointmentId }),
      nowIso,
      input.tenantId,
      normalizedPhone
    ),
    db.prepare(`
      INSERT INTO appointment_access_tokens (
        id, tenant_id, appointment_id, token_hash, purpose, expires_at, created_at
      ) VALUES (?, ?, ?, ?, 'MANAGE', ?, ?)
    `).bind(crypto.randomUUID(), input.tenantId, appointmentId, tokenHash, tokenExpiry(input.appointmentDate, now), nowIso)
  ];
  for (const slot of slots) {
    statements.push(db.prepare(`
      INSERT INTO appointment_slots (
        tenant_id, professional_id, appointment_date, slot_time, appointment_id
      ) VALUES (?, ?, ?, ?, ?)
    `).bind(input.tenantId, input.professionalId, input.appointmentDate, slot, appointmentId));
  }
  try {
    await db.batch(statements);
  } catch (error) {
    if (isConstraintError(error)) throw new HttpError(409, "CONFLICT", "Horário indisponível");
    throw error;
  }
  return { id: appointmentId, status: "PENDING", rawToken };
}

export async function reserveAppointment(db: D1Database, input: BookingInput): Promise<BookingResult> {
  const service = await loadService(db, input);
  return atomicReservation(db, input, service);
}

async function conflictingAppointment(db: D1Database, input: BookingInput, durationMinutes: number, excludeId?: string) {
  const endTime = minutesToTime(timeToMinutes(input.startTime) + durationMinutes);
  return db.prepare(`
    SELECT id FROM appointments
    WHERE tenant_id = ? AND professional_id = ? AND appointment_date = ?
      AND status <> 'CANCELLED' AND start_time < ? AND end_time > ?
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).bind(
    input.tenantId,
    input.professionalId,
    input.appointmentDate,
    endTime,
    input.startTime,
    excludeId ?? null,
    excludeId ?? null
  ).first<{ id: string }>();
}

export async function createPublicAppointment(
  db: D1Database,
  tenantId: string,
  payload: PublicBookingPayload
) {
  const query = new URLSearchParams({
    date: payload.date,
    serviceId: payload.serviceId,
    professionalId: payload.professionalId
  });
  const availability = await calculateD1Availability(db, tenantId, query);
  const input: BookingInput = {
    tenantId,
    serviceId: payload.serviceId,
    professionalId: payload.professionalId,
    clientName: payload.clientName,
    clientPhone: payload.clientPhone,
    clientEmail: payload.clientEmail,
    appointmentDate: payload.date,
    startTime: payload.time,
    slotMinutes: availability.slotMinutes
  };
  if (!availability.slots.includes(payload.time)) {
    const conflict = await conflictingAppointment(db, input, availability.durationMinutes);
    if (conflict) throw new HttpError(409, "CONFLICT", "Horário indisponível");
    throw new HttpError(400, "INVALID_REQUEST", "Horário indisponível");
  }
  const service = await loadService(db, input);
  const created = await atomicReservation(db, input, service);
  const appointment = await loadAppointment(db, tenantId, created.id);
  return {
    ...publicCreatedAppointment(appointment),
    managementPath: managementPath(tenantId, created.rawToken as string)
  };
}

async function loadAppointment(db: D1Database, tenantId: string, appointmentId: string): Promise<AppointmentRow> {
  const appointment = await db.prepare(`
    SELECT appointments.*, services.name AS service_name,
      services.duration_minutes AS service_duration,
      professionals.name AS professional_name
    FROM appointments
    JOIN services ON services.tenant_id = appointments.tenant_id AND services.id = appointments.service_id
    JOIN professionals ON professionals.tenant_id = appointments.tenant_id AND professionals.id = appointments.professional_id
    WHERE appointments.tenant_id = ? AND appointments.id = ?
  `).bind(tenantId, appointmentId).first<AppointmentRow>();
  if (!appointment) throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");
  return appointment;
}

function publicSummary(appointment: AppointmentRow) {
  return {
    service: { name: appointment.service_name, duration: appointment.service_duration },
    professional: { id: appointment.professional_id, name: appointment.professional_name },
    date: appointment.appointment_date,
    time: appointment.start_time,
    status: appointment.status
  };
}

function publicCreatedAppointment(appointment: AppointmentRow) {
  return {
    id: appointment.id,
    serviceId: appointment.service_id,
    professionalId: appointment.professional_id,
    clientName: appointment.client_name,
    clientPhone: appointment.client_phone,
    clientEmail: appointment.client_email,
    date: appointment.appointment_date,
    time: appointment.start_time,
    status: appointment.status,
    service: { id: appointment.service_id, name: appointment.service_name, duration: appointment.service_duration },
    professional: { id: appointment.professional_id, name: appointment.professional_name }
  };
}

function tokenError(status: number, code: "TOKEN_INVALID" | "TOKEN_EXPIRED" | "TOKEN_REVOKED" | "TOKEN_USED", message: string): never {
  throw new HttpError(status, code, message);
}

async function resolveToken(
  db: D1Database,
  tenantId: string,
  rawToken: string,
  allowInactive = false
): Promise<{ appointment: TokenRow; state: "active" | "expired" | "revoked" | "used" }> {
  if (!/^[a-f0-9]{64}$/.test(rawToken)) {
    return tokenError(404, "TOKEN_INVALID", "Link inválido ou indisponível");
  }
  const tokenHash = await sha256(rawToken);
  const appointment = await db.prepare(`
    SELECT tokens.id AS token_id, tokens.expires_at, tokens.used_at, tokens.revoked_at,
      appointments.*, services.name AS service_name,
      services.duration_minutes AS service_duration,
      professionals.name AS professional_name
    FROM appointment_access_tokens tokens
    JOIN appointments ON appointments.tenant_id = tokens.tenant_id AND appointments.id = tokens.appointment_id
    JOIN services ON services.tenant_id = appointments.tenant_id AND services.id = appointments.service_id
    JOIN professionals ON professionals.tenant_id = appointments.tenant_id AND professionals.id = appointments.professional_id
    WHERE tokens.tenant_id = ? AND tokens.token_hash = ? AND tokens.purpose = 'MANAGE'
  `).bind(tenantId, tokenHash).first<TokenRow>();
  if (!appointment) return tokenError(404, "TOKEN_INVALID", "Link inválido ou indisponível");
  const state = appointment.used_at
    ? "used"
    : appointment.revoked_at
      ? "revoked"
      : appointment.expires_at <= new Date().toISOString()
        ? "expired"
        : "active";
  if (state !== "active" && !allowInactive) {
    if (state === "expired") return tokenError(410, "TOKEN_EXPIRED", "Este link expirou");
    if (state === "revoked") return tokenError(410, "TOKEN_REVOKED", "Este link não está mais ativo");
    return tokenError(410, "TOKEN_USED", "Este link já foi utilizado");
  }
  return { appointment, state };
}

export async function getPublicAppointment(db: D1Database, tenantId: string, rawToken: string) {
  const { appointment } = await resolveToken(db, tenantId, rawToken);
  return publicSummary(appointment);
}

export async function confirmPublicAppointment(db: D1Database, tenantId: string, rawToken: string) {
  const { appointment } = await resolveToken(db, tenantId, rawToken);
  if (appointment.status === "CONFIRMED") return publicSummary(appointment);
  if (appointment.status !== "PENDING") throw new HttpError(409, "CONFLICT", "Transição não permitida");
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`
      UPDATE appointments SET status = 'CONFIRMED', updated_at = ?
      WHERE tenant_id = ? AND id = ? AND status = 'PENDING'
    `).bind(now, tenantId, appointment.id),
    db.prepare(`
      INSERT INTO appointment_history_events (
        id, tenant_id, appointment_id, type, from_status, to_status, actor_type, created_at
      )
      SELECT ?, ?, ?, 'CONFIRMED', 'PENDING', 'CONFIRMED', 'CUSTOMER', ?
      WHERE NOT EXISTS (
        SELECT 1 FROM appointment_history_events
        WHERE tenant_id = ? AND appointment_id = ? AND type = 'CONFIRMED'
      )
    `).bind(crypto.randomUUID(), tenantId, appointment.id, now, tenantId, appointment.id)
  ]);
  return publicSummary(await loadAppointment(db, tenantId, appointment.id));
}

function cleanReason(value: unknown): string | null {
  return cleanText(value, "Motivo", 1, 300, false);
}

export async function cancelPublicAppointment(
  db: D1Database,
  tenantId: string,
  rawToken: string,
  reasonValue: unknown
) {
  const { appointment, state } = await resolveToken(db, tenantId, rawToken, true);
  if (appointment.status === "CANCELLED") return publicSummary(appointment);
  if (state !== "active") {
    if (state === "expired") return tokenError(410, "TOKEN_EXPIRED", "Este link expirou");
    if (state === "revoked") return tokenError(410, "TOKEN_REVOKED", "Este link não está mais ativo");
    return tokenError(410, "TOKEN_USED", "Este link já foi utilizado");
  }
  if (!["PENDING", "CONFIRMED"].includes(appointment.status)) {
    throw new HttpError(409, "CONFLICT", "Transição não permitida");
  }
  const reason = cleanReason(reasonValue);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`
      UPDATE appointments
      SET status = 'CANCELLED', cancellation_reason = ?, updated_at = ?
      WHERE tenant_id = ? AND id = ? AND status IN ('PENDING', 'CONFIRMED')
    `).bind(reason, now, tenantId, appointment.id),
    db.prepare(`
      INSERT INTO appointment_history_events (
        id, tenant_id, appointment_id, type, from_status, to_status,
        metadata_json, actor_type, created_at
      )
      SELECT ?, ?, ?, 'CANCELLED', ?, 'CANCELLED', ?, 'CUSTOMER', ?
      WHERE NOT EXISTS (
        SELECT 1 FROM appointment_history_events
        WHERE tenant_id = ? AND appointment_id = ? AND type = 'CANCELLED'
      )
    `).bind(
      crypto.randomUUID(),
      tenantId,
      appointment.id,
      appointment.status,
      reason ? JSON.stringify({ reason }) : null,
      now,
      tenantId,
      appointment.id
    ),
    db.prepare(`
      UPDATE appointment_access_tokens SET used_at = ?, revoked_at = ?
      WHERE tenant_id = ? AND appointment_id = ? AND revoked_at IS NULL
    `).bind(now, now, tenantId, appointment.id),
    db.prepare("DELETE FROM appointment_slots WHERE tenant_id = ? AND appointment_id = ?").bind(tenantId, appointment.id)
  ]);
  return publicSummary(await loadAppointment(db, tenantId, appointment.id));
}

export async function rescheduleAvailability(
  db: D1Database,
  tenantId: string,
  rawToken: string,
  query: URLSearchParams
) {
  const { appointment } = await resolveToken(db, tenantId, rawToken);
  if (!["PENDING", "CONFIRMED"].includes(appointment.status)) {
    throw new HttpError(409, "CONFLICT", "Agendamento não pode ser reagendado");
  }
  const availabilityQuery = new URLSearchParams({
    date: requireDate(query.get("date")),
    serviceId: appointment.service_id,
    professionalId: requirePublicId(query.get("professionalId"), "professionalId")
  });
  const availability = await calculateD1Availability(db, tenantId, availabilityQuery, new Date(), appointment.id);
  return availability.slots;
}

export async function reschedulePublicAppointment(
  db: D1Database,
  tenantId: string,
  rawToken: string,
  payload: Record<string, unknown>
) {
  const { appointment } = await resolveToken(db, tenantId, rawToken);
  if (!["PENDING", "CONFIRMED"].includes(appointment.status)) {
    throw new HttpError(409, "CONFLICT", "Agendamento não pode ser reagendado");
  }
  const date = requireDate(typeof payload.date === "string" ? payload.date : null);
  const professionalId = requirePublicId(typeof payload.professionalId === "string" ? payload.professionalId : null, "professionalId");
  const time = requireTime(payload.time);
  if (date === appointment.appointment_date && professionalId === appointment.professional_id && time === appointment.start_time) {
    throw new HttpError(400, "INVALID_REQUEST", "Escolha um novo horário ou profissional");
  }
  const query = new URLSearchParams({ date, serviceId: appointment.service_id, professionalId });
  const availability = await calculateD1Availability(db, tenantId, query, new Date(), appointment.id);
  const input: BookingInput = {
    tenantId,
    serviceId: appointment.service_id,
    professionalId,
    clientName: appointment.client_name,
    clientPhone: appointment.client_phone,
    clientEmail: appointment.client_email,
    appointmentDate: date,
    startTime: time,
    slotMinutes: availability.slotMinutes
  };
  if (!availability.slots.includes(time)) {
    const conflict = await conflictingAppointment(db, input, availability.durationMinutes, appointment.id);
    if (conflict) throw new HttpError(409, "CONFLICT", "Horário indisponível");
    throw new HttpError(400, "INVALID_REQUEST", "Horário indisponível");
  }
  const service = await loadService(db, input);
  const replacementId = crypto.randomUUID();
  const rawNewToken = randomToken();
  const tokenHash = await sha256(rawNewToken);
  const now = new Date();
  const nowIso = now.toISOString();
  const endTime = minutesToTime(timeToMinutes(time) + service.duration_minutes);
  const slots = slotTimes(time, service.duration_minutes, availability.slotMinutes);
  const metadata = JSON.stringify({
    previousAppointmentId: appointment.id,
    newAppointmentId: replacementId,
    previousDate: appointment.appointment_date,
    previousTime: appointment.start_time,
    newDate: date,
    newTime: time,
    previousProfessionalId: appointment.professional_id,
    newProfessionalId: professionalId
  });
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM appointment_slots WHERE tenant_id = ? AND appointment_id = ?").bind(tenantId, appointment.id),
    db.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id, client_name,
        client_phone, client_email, appointment_date, start_time, end_time,
        status, rescheduled_from_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)
    `).bind(
      replacementId,
      tenantId,
      appointment.service_id,
      professionalId,
      appointment.client_id,
      appointment.client_name,
      appointment.client_phone,
      appointment.client_email,
      date,
      time,
      endTime,
      appointment.id,
      nowIso,
      nowIso
    ),
    db.prepare(`
      UPDATE appointments
      SET status = 'CANCELLED', cancellation_reason = 'Reagendado pelo cliente', updated_at = ?
      WHERE tenant_id = ? AND id = ? AND status IN ('PENDING', 'CONFIRMED')
    `).bind(nowIso, tenantId, appointment.id),
    db.prepare(`
      UPDATE appointment_access_tokens SET used_at = ?, revoked_at = ?
      WHERE tenant_id = ? AND appointment_id = ? AND revoked_at IS NULL
    `).bind(nowIso, nowIso, tenantId, appointment.id),
    db.prepare(`
      INSERT INTO appointment_history_events (
        id, tenant_id, appointment_id, type, from_status, to_status, metadata_json, actor_type, created_at
      ) VALUES (?, ?, ?, 'RESCHEDULED_FROM', ?, 'CANCELLED', ?, 'CUSTOMER', ?)
    `).bind(crypto.randomUUID(), tenantId, appointment.id, appointment.status, metadata, nowIso),
    db.prepare(`
      INSERT INTO appointment_history_events (
        id, tenant_id, appointment_id, type, to_status, actor_type, created_at
      ) VALUES (?, ?, ?, 'CREATED', 'PENDING', 'CUSTOMER', ?)
    `).bind(crypto.randomUUID(), tenantId, replacementId, nowIso),
    db.prepare(`
      INSERT INTO appointment_history_events (
        id, tenant_id, appointment_id, type, to_status, metadata_json, actor_type, created_at
      ) VALUES (?, ?, ?, 'RESCHEDULED_TO', 'PENDING', ?, 'CUSTOMER', ?)
    `).bind(crypto.randomUUID(), tenantId, replacementId, metadata, nowIso),
    db.prepare(`
      INSERT INTO relationship_history_events (
        id, tenant_id, client_id, appointment_id, type, actor_type, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, 'APPOINTMENT_LINKED', 'CUSTOMER', ?, ?)
    `).bind(crypto.randomUUID(), tenantId, appointment.client_id, replacementId, JSON.stringify({ source: "RESCHEDULE", appointmentId: replacementId }), nowIso),
    db.prepare(`
      INSERT INTO appointment_access_tokens (
        id, tenant_id, appointment_id, token_hash, purpose, expires_at, created_at
      ) VALUES (?, ?, ?, ?, 'MANAGE', ?, ?)
    `).bind(crypto.randomUUID(), tenantId, replacementId, tokenHash, tokenExpiry(date, now), nowIso)
  ];
  for (const slot of slots) {
    statements.push(db.prepare(`
      INSERT INTO appointment_slots (tenant_id, professional_id, appointment_date, slot_time, appointment_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(tenantId, professionalId, date, slot, replacementId));
  }
  try {
    await db.batch(statements);
  } catch (error) {
    if (isConstraintError(error)) throw new HttpError(409, "CONFLICT", "Horário indisponível");
    throw error;
  }
  return {
    ...publicSummary(await loadAppointment(db, tenantId, replacementId)),
    managementPath: managementPath(tenantId, rawNewToken)
  };
}

export async function cancelAppointment(db: D1Database, tenantId: string, appointmentId: string): Promise<void> {
  const appointment = await loadAppointment(db, tenantId, appointmentId);
  if (!["PENDING", "CONFIRMED"].includes(appointment.status)) {
    throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");
  }
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(`
      UPDATE appointments SET status = 'CANCELLED', updated_at = ?
      WHERE id = ? AND tenant_id = ? AND status IN ('PENDING', 'CONFIRMED')
    `).bind(now, appointmentId, tenantId),
    db.prepare("DELETE FROM appointment_slots WHERE appointment_id = ? AND tenant_id = ?").bind(appointmentId, tenantId)
  ]);
}

export function appointmentToken(request: Request): string {
  return request.headers.get("X-Appointment-Token") || "";
}

export function managementPath(tenantId: string, rawToken: string): string {
  return `/${tenantId}#agendamento=${rawToken}`;
}
