import type { Tenant } from "./types";

interface ServiceRow {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price_cents: number | null;
  requires_evaluation: number;
}

interface ProfessionalRow {
  id: string;
  name: string;
  specialty: string;
  photo: string;
  service_ids: string | null;
}

interface BusinessHoursRow {
  id: string;
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_open: number;
}

interface SettingsRow {
  public_name: string | null;
  public_phone: string | null;
  public_whatsapp: string | null;
  address_line: string | null;
  timezone: string;
  change_min_advance_minutes: number;
  cancellation_policy: string | null;
  confirmation_message: string | null;
  booking_enabled: number;
  max_future_days: number;
}

export function publicTerminology(slug: string) {
  return slug === "studio-cut"
    ? { serviceSingular: "serviço", servicePlural: "serviços", professionalSingular: "barbeiro", professionalPlural: "barbeiros" }
    : { serviceSingular: "procedimento", servicePlural: "procedimentos", professionalSingular: "profissional", professionalPlural: "profissionais" };
}

export async function publicContext(db: D1Database, tenant: Tenant) {
  const settings = await publicSettings(db, tenant);
  return {
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name },
    terminology: publicTerminology(tenant.slug),
    settings
  };
}

export async function listPublicServices(db: D1Database, tenantId: string) {
  const rows = await db.prepare(`
    SELECT id, name, description, duration_minutes, price_cents, requires_evaluation
    FROM services
    WHERE tenant_id = ? AND active = 1
    ORDER BY display_order, name
  `).bind(tenantId).all<ServiceRow>();
  return rows.results.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    duration: row.duration_minutes,
    price: row.price_cents === null ? null : row.price_cents / 100,
    priceLabel: row.price_cents === null ? "Sob consulta" : null,
    requiresEvaluation: row.requires_evaluation === 1
  }));
}

export async function listPublicProfessionals(db: D1Database, tenantId: string) {
  const rows = await db.prepare(`
    SELECT p.id, p.name, p.specialty, p.photo,
      group_concat(services.id) AS service_ids
    FROM professionals p
    LEFT JOIN professional_services ps
      ON ps.tenant_id = p.tenant_id AND ps.professional_id = p.id
    LEFT JOIN services
      ON services.tenant_id = ps.tenant_id AND services.id = ps.service_id AND services.active = 1
    WHERE p.tenant_id = ? AND p.active = 1
    GROUP BY p.id, p.name, p.specialty, p.photo, p.display_order
    ORDER BY p.display_order, p.name
  `).bind(tenantId).all<ProfessionalRow>();
  return rows.results.map((row) => ({
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    photo: row.photo,
    serviceIds: row.service_ids ? row.service_ids.split(",") : []
  }));
}

export async function listPublicBusinessHours(db: D1Database, tenantId: string) {
  const rows = await db.prepare(`
    SELECT id, day_of_week, open_time, close_time, is_open
    FROM business_hours
    WHERE tenant_id = ?
    ORDER BY day_of_week
  `).bind(tenantId).all<BusinessHoursRow>();
  return rows.results.map((row) => ({
    id: row.id,
    dayOfWeek: row.day_of_week,
    openTime: row.open_time,
    closeTime: row.close_time,
    isOpen: row.is_open === 1
  }));
}

export async function publicSettings(db: D1Database, tenant: Tenant) {
  const row = await db.prepare(`
    SELECT public_name, public_phone, public_whatsapp, address_line, timezone,
      change_min_advance_minutes,
      cancellation_policy, confirmation_message, booking_enabled, max_future_days
    FROM tenant_settings
    WHERE tenant_id = ?
  `).bind(tenant.slug).first<SettingsRow>();
  return {
    publicName: row?.public_name ?? tenant.name,
    publicPhone: row?.public_phone ?? null,
    publicWhatsapp: row?.public_whatsapp ?? null,
    addressLine: row?.address_line ?? null,
    timezone: row?.timezone ?? "America/Sao_Paulo",
    changeMinAdvanceMinutes: row?.change_min_advance_minutes ?? 240,
    cancellationPolicy: row?.cancellation_policy ?? null,
    confirmationMessage: row?.confirmation_message ?? null,
    bookingEnabled: row ? row.booking_enabled === 1 : true,
    maxFutureDays: row?.max_future_days ?? 90
  };
}
