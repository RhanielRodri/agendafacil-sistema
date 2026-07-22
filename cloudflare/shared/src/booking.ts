import { HttpError } from "./http";
import { minutesToTime, timeToMinutes } from "./availability";

interface BookingInput {
  tenantId: string;
  serviceId: string;
  professionalId: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  appointmentDate: string;
  startTime: string;
  slotMinutes?: number;
}

interface BookingService {
  duration_minutes: number;
}

export interface BookingResult {
  id: string;
  status: "PENDING";
}

function isConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("SQLITE_CONSTRAINT") || message.includes("UNIQUE constraint failed");
}

export async function reserveAppointment(db: D1Database, input: BookingInput): Promise<BookingResult> {
  const service = await db.prepare(`
    SELECT s.duration_minutes
    FROM professional_services ps
    JOIN services s ON s.id = ps.service_id AND s.tenant_id = ps.tenant_id
    JOIN professionals p ON p.id = ps.professional_id AND p.tenant_id = ps.tenant_id
    WHERE ps.tenant_id = ? AND ps.service_id = ? AND ps.professional_id = ?
      AND s.active = 1 AND p.active = 1
  `).bind(input.tenantId, input.serviceId, input.professionalId).first<BookingService>();

  if (!service) throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");

  const slotMinutes = input.slotMinutes ?? 30;
  if (service.duration_minutes % slotMinutes !== 0) {
    throw new HttpError(400, "INVALID_REQUEST", "Duração incompatível com a grade");
  }

  const start = timeToMinutes(input.startTime);
  const end = start + service.duration_minutes;
  const appointmentId = crypto.randomUUID();
  const now = new Date().toISOString();
  const slots = Array.from(
    { length: service.duration_minutes / slotMinutes },
    (_, index) => minutesToTime(start + index * slotMinutes)
  );

  const statements: D1PreparedStatement[] = [
    db.prepare(`
      INSERT INTO clients (
        id, tenant_id, name, phone, normalized_phone,
        first_contact_at, last_contact_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        phone = excluded.phone,
        last_contact_at = excluded.last_contact_at,
        updated_at = excluded.updated_at
      WHERE clients.tenant_id = excluded.tenant_id
    `).bind(
      input.clientId,
      input.tenantId,
      input.clientName,
      input.clientPhone,
      input.clientPhone.replace(/\D/g, ""),
      now,
      now,
      now,
      now
    ),
    db.prepare(`
      INSERT INTO appointments (
        id, tenant_id, service_id, professional_id, client_id,
        client_name, client_phone, appointment_date, start_time,
        end_time, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
    `).bind(
      appointmentId,
      input.tenantId,
      input.serviceId,
      input.professionalId,
      input.clientId,
      input.clientName,
      input.clientPhone,
      input.appointmentDate,
      input.startTime,
      minutesToTime(end),
      now,
      now
    )
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

  return { id: appointmentId, status: "PENDING" };
}

export async function cancelAppointment(db: D1Database, tenantId: string, appointmentId: string): Promise<void> {
  const now = new Date().toISOString();
  const results = await db.batch([
    db.prepare(`
      UPDATE appointments
      SET status = 'CANCELLED', updated_at = ?
      WHERE id = ? AND tenant_id = ? AND status IN ('PENDING', 'CONFIRMED')
    `).bind(now, appointmentId, tenantId),
    db.prepare(`
      DELETE FROM appointment_slots
      WHERE appointment_id = ? AND tenant_id = ?
    `).bind(appointmentId, tenantId)
  ]);

  if (!results[0].meta.changes) throw new HttpError(404, "NOT_FOUND", "Recurso não encontrado");
}
