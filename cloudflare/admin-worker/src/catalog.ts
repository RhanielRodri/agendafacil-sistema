import {
  assertConfirmed,
  conflictRow,
  futureAppointments,
  invalid,
  isConstraintError,
  notFoundError,
  pagination,
  requireBoolean,
  requireInteger,
  sanitizeText,
  todayIso
} from "../../shared/src/admin";
import { requirePublicId, timeToMinutes } from "../../shared/src/availability";
import { HttpError, json, readJsonObject } from "../../shared/src/http";
import { route, type AdminRequestContext, type AdminRoute } from "./router";

const MIN_DURATION = 5;
const MAX_DURATION = 480;
const MAX_PRICE = 99999.99;

interface ServiceRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  duration_minutes: number;
  price_cents: number | null;
  active: number;
  display_order: number;
  requires_evaluation: number;
  created_at: string;
  updated_at: string;
}

interface ProfessionalRow {
  id: string;
  tenant_id: string;
  name: string;
  specialty: string;
  photo: string;
  active: number;
  display_order: number;
  internal_contact: string | null;
  created_at: string;
  updated_at: string;
}

function servicePayload(row: ServiceRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    description: row.description,
    duration: row.duration_minutes,
    price: row.price_cents === null ? null : row.price_cents / 100,
    active: row.active === 1,
    displayOrder: row.display_order,
    requiresEvaluation: row.requires_evaluation === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function professionalPayload(row: ProfessionalRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    specialty: row.specialty,
    photo: row.photo,
    active: row.active === 1,
    displayOrder: row.display_order,
    internalContact: row.internal_contact,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseDuration(value: unknown): number {
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > MAX_DURATION) {
    invalid(`Duração deve ser um inteiro entre ${MIN_DURATION} e ${MAX_DURATION} minutos`);
  }
  return duration;
}

// Preço zero é um preço; preço ausente é ausência de informação.
function parsePriceCents(value: unknown): number | null {
  if (value === null || value === "") return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0 || price > MAX_PRICE) invalid("Preço inválido");
  return Math.round(price * 100);
}

function parseOrder(value: unknown): number {
  return requireInteger(Number(value), "Ordem", 0, 999);
}

function activeFilter(url: URL): number | null {
  const value = url.searchParams.get("active");
  if (value === null || value === "") return null;
  return value === "true" ? 1 : 0;
}

async function loadService(ctx: AdminRequestContext, value: string): Promise<ServiceRow> {
  const id = requirePublicId(value, "ID");
  const row = await ctx.db.prepare("SELECT * FROM services WHERE tenant_id = ? AND id = ?")
    .bind(ctx.tenantId, id).first<ServiceRow>();
  if (!row) notFoundError();
  return row;
}

async function loadProfessional(ctx: AdminRequestContext, value: string): Promise<ProfessionalRow> {
  const id = requirePublicId(value, "ID");
  const row = await ctx.db.prepare("SELECT * FROM professionals WHERE tenant_id = ? AND id = ?")
    .bind(ctx.tenantId, id).first<ProfessionalRow>();
  if (!row) notFoundError();
  return row;
}

async function assertUniqueName(
  ctx: AdminRequestContext,
  table: "services" | "professionals",
  name: string,
  excludeId: string | null
): Promise<void> {
  const duplicate = await ctx.db.prepare(`
    SELECT id FROM ${table} WHERE tenant_id = ? AND name = ? AND (? IS NULL OR id <> ?)
  `).bind(ctx.tenantId, name, excludeId, excludeId).first<{ id: string }>();
  if (duplicate) {
    throw new HttpError(
      409,
      "CONFLICT",
      table === "services" ? "Já existe um serviço com esse nome" : "Já existe um profissional com esse nome"
    );
  }
}

function orderIds(body: Record<string, unknown>): string[] {
  const raw = body.order;
  if (!Array.isArray(raw) || !raw.length) invalid("Ordem inválida");
  const ids = raw.map((value) => requirePublicId(typeof value === "string" ? value : null, "Ordem"));
  if (new Set(ids).size !== ids.length) invalid("Ordem com IDs repetidos");
  return ids;
}

async function assertOwned(
  ctx: AdminRequestContext,
  table: "services" | "professionals",
  ids: string[]
): Promise<void> {
  const placeholders = ids.map(() => "?").join(", ");
  const owned = await ctx.db.prepare(`
    SELECT COUNT(*) AS total FROM ${table} WHERE tenant_id = ? AND id IN (${placeholders})
  `).bind(ctx.tenantId, ...ids).first<{ total: number }>();
  if ((owned?.total ?? 0) !== ids.length) notFoundError();
}

async function serviceDependencies(ctx: AdminRequestContext, serviceId: string) {
  const [upcoming, totals] = await Promise.all([
    futureAppointments(ctx.db, ctx.tenantId, { serviceId }),
    ctx.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM appointments WHERE tenant_id = ?1 AND service_id = ?2) AS total_appointments,
        (SELECT COUNT(*) FROM professional_services WHERE tenant_id = ?1 AND service_id = ?2) AS linked_professionals,
        (SELECT COUNT(*) FROM leads WHERE tenant_id = ?1 AND service_id = ?2
          AND status IN ('NEW', 'CONTACTED', 'QUALIFIED')) AS active_leads
    `).bind(ctx.tenantId, serviceId).first<{
      total_appointments: number;
      linked_professionals: number;
      active_leads: number;
    }>()
  ]);

  return {
    upcomingAppointments: upcoming.length,
    totalAppointments: totals?.total_appointments ?? 0,
    linkedProfessionals: totals?.linked_professionals ?? 0,
    activeLeads: totals?.active_leads ?? 0,
    // Histórico nunca é apagado: com qualquer vínculo, a saída é inativar.
    removable: (totals?.total_appointments ?? 0) === 0 && (totals?.active_leads ?? 0) === 0,
    conflicts: upcoming.map(conflictRow)
  };
}

async function professionalDependencies(ctx: AdminRequestContext, professionalId: string) {
  const [upcoming, totals] = await Promise.all([
    futureAppointments(ctx.db, ctx.tenantId, { professionalId }),
    ctx.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM appointments WHERE tenant_id = ?1 AND professional_id = ?2) AS total_appointments,
        (SELECT COUNT(*) FROM professional_schedules WHERE tenant_id = ?1 AND professional_id = ?2) AS schedules,
        (SELECT COUNT(*) FROM schedule_blocks WHERE tenant_id = ?1 AND professional_id = ?2) AS blocks,
        (SELECT COUNT(*) FROM professional_services WHERE tenant_id = ?1 AND professional_id = ?2) AS linked_services,
        (SELECT COUNT(*) FROM leads WHERE tenant_id = ?1 AND professional_id = ?2
          AND status IN ('NEW', 'CONTACTED', 'QUALIFIED')) AS active_leads
    `).bind(ctx.tenantId, professionalId).first<{
      total_appointments: number;
      schedules: number;
      blocks: number;
      linked_services: number;
      active_leads: number;
    }>()
  ]);

  return {
    upcomingAppointments: upcoming.length,
    totalAppointments: totals?.total_appointments ?? 0,
    schedules: totals?.schedules ?? 0,
    blocks: totals?.blocks ?? 0,
    linkedServices: totals?.linked_services ?? 0,
    activeLeads: totals?.active_leads ?? 0,
    removable: (totals?.total_appointments ?? 0) === 0 && (totals?.active_leads ?? 0) === 0,
    conflicts: upcoming.map(conflictRow)
  };
}

async function listServices(ctx: AdminRequestContext): Promise<Response> {
  const { page, pageSize, offset } = pagination(ctx.url);
  const search = sanitizeText(ctx.url.searchParams.get("search"), "Busca", 1, 120, false);
  const like = search ? `%${search}%` : null;
  const active = activeFilter(ctx.url);

  const filter = `
    FROM services
    WHERE tenant_id = ? AND (? IS NULL OR active = ?) AND (? IS NULL OR name LIKE ?)
  `;
  const binds = [ctx.tenantId, active, active, like, like];

  const [count, rows] = await Promise.all([
    ctx.db.prepare(`SELECT COUNT(*) AS total ${filter}`).bind(...binds).first<{ total: number }>(),
    ctx.db.prepare(`
      SELECT services.*,
        (SELECT COUNT(*) FROM professional_services ps
          WHERE ps.tenant_id = services.tenant_id AND ps.service_id = services.id) AS professional_count,
        (SELECT COUNT(*) FROM appointments a
          WHERE a.tenant_id = services.tenant_id AND a.service_id = services.id) AS appointment_count,
        (SELECT COUNT(*) FROM appointments a
          WHERE a.tenant_id = services.tenant_id AND a.service_id = services.id
            AND a.status IN ('PENDING', 'CONFIRMED') AND a.appointment_date >= ?) AS upcoming_appointments
      ${filter}
      ORDER BY display_order, name
      LIMIT ? OFFSET ?
    `).bind(todayIso(), ...binds, pageSize, offset).all<ServiceRow & {
      professional_count: number;
      appointment_count: number;
      upcoming_appointments: number;
    }>()
  ]);

  const total = count?.total ?? 0;
  return json({
    items: rows.results.map((row) => ({
      ...servicePayload(row),
      professionalCount: row.professional_count,
      appointmentCount: row.appointment_count,
      upcomingAppointments: row.upcoming_appointments
    })),
    pagination: { page, limit: pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) }
  });
}

async function createService(ctx: AdminRequestContext): Promise<Response> {
  const body = await readJsonObject(ctx.request);
  const name = sanitizeText(body.name, "Nome do serviço", 2, 80) as string;
  const description = sanitizeText(body.description, "Descrição", 1, 240, false) ?? "";
  const duration = parseDuration(body.duration);
  const priceCents = parsePriceCents(body.price === undefined ? null : body.price);
  const displayOrder = body.displayOrder === undefined ? 0 : parseOrder(body.displayOrder);
  const requiresEvaluation = body.requiresEvaluation === undefined
    ? false
    : requireBoolean(body.requiresEvaluation, "requiresEvaluation");

  await assertUniqueName(ctx, "services", name, null);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await ctx.db.prepare(`
      INSERT INTO services (
        id, tenant_id, name, description, duration_minutes, price_cents,
        active, display_order, requires_evaluation, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).bind(id, ctx.tenantId, name, description, duration, priceCents, displayOrder, requiresEvaluation ? 1 : 0, now, now).run();
  } catch (error) {
    if (isConstraintError(error)) throw new HttpError(409, "CONFLICT", "Já existe um serviço com esse nome");
    throw error;
  }
  return json(servicePayload(await loadService(ctx, id)), { status: 201 });
}

async function updateService(ctx: AdminRequestContext): Promise<Response> {
  const current = await loadService(ctx, ctx.params[0]);
  const body = await readJsonObject(ctx.request);
  const updates: string[] = [];
  const binds: unknown[] = [];
  let nextDuration: number | null = null;

  if (Object.hasOwn(body, "name")) {
    const name = sanitizeText(body.name, "Nome do serviço", 2, 80) as string;
    await assertUniqueName(ctx, "services", name, current.id);
    updates.push("name = ?");
    binds.push(name);
  }
  if (Object.hasOwn(body, "description")) {
    updates.push("description = ?");
    binds.push(sanitizeText(body.description, "Descrição", 1, 240, false) ?? "");
  }
  if (Object.hasOwn(body, "duration")) {
    nextDuration = parseDuration(body.duration);
    updates.push("duration_minutes = ?");
    binds.push(nextDuration);
  }
  if (Object.hasOwn(body, "price")) {
    updates.push("price_cents = ?");
    binds.push(parsePriceCents(body.price));
  }
  if (Object.hasOwn(body, "displayOrder")) {
    updates.push("display_order = ?");
    binds.push(parseOrder(body.displayOrder));
  }
  if (Object.hasOwn(body, "requiresEvaluation")) {
    updates.push("requires_evaluation = ?");
    binds.push(requireBoolean(body.requiresEvaluation, "requiresEvaluation") ? 1 : 0);
  }
  if (!updates.length) invalid("Nenhum campo válido para atualizar");

  // Encurtar ou alongar a duração muda o fim de todo agendamento futuro do serviço.
  let appliedImpact: unknown[] = [];
  if (nextDuration !== null && nextDuration !== current.duration_minutes) {
    const affected = await futureAppointments(ctx.db, ctx.tenantId, { serviceId: current.id });
    appliedImpact = assertConfirmed(affected, body.confirm, "A nova duração afeta agendamentos futuros deste serviço");
  }

  try {
    await ctx.db.prepare(`
      UPDATE services SET ${updates.join(", ")}, updated_at = ? WHERE tenant_id = ? AND id = ?
    `).bind(...binds, new Date().toISOString(), ctx.tenantId, current.id).run();
  } catch (error) {
    if (isConstraintError(error)) throw new HttpError(409, "CONFLICT", "Já existe um serviço com esse nome");
    throw error;
  }
  return json({ ...servicePayload(await loadService(ctx, current.id)), appliedImpact });
}

async function setServiceActive(ctx: AdminRequestContext): Promise<Response> {
  const current = await loadService(ctx, ctx.params[0]);
  const body = await readJsonObject(ctx.request);
  const active = requireBoolean(body.active, "active");

  let appliedImpact: unknown[] = [];
  if (!active && current.active === 1) {
    const affected = await futureAppointments(ctx.db, ctx.tenantId, { serviceId: current.id });
    appliedImpact = assertConfirmed(affected, body.confirm, "Existem agendamentos futuros com este serviço");
  }

  await ctx.db.prepare("UPDATE services SET active = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
    .bind(active ? 1 : 0, new Date().toISOString(), ctx.tenantId, current.id).run();
  return json({ ...servicePayload(await loadService(ctx, current.id)), appliedImpact });
}

async function reorderServices(ctx: AdminRequestContext): Promise<Response> {
  const body = await readJsonObject(ctx.request, 16384);
  const ids = orderIds(body);
  await assertOwned(ctx, "services", ids);
  const now = new Date().toISOString();

  await ctx.db.batch(ids.map((id, index) => ctx.db.prepare(
    "UPDATE services SET display_order = ?, updated_at = ? WHERE tenant_id = ? AND id = ?"
  ).bind(index, now, ctx.tenantId, id)));

  const rows = await ctx.db.prepare(
    "SELECT * FROM services WHERE tenant_id = ? ORDER BY display_order, name"
  ).bind(ctx.tenantId).all<ServiceRow>();
  return json(rows.results.map(servicePayload));
}

async function getServiceDependencies(ctx: AdminRequestContext): Promise<Response> {
  const service = await loadService(ctx, ctx.params[0]);
  return json({ serviceId: service.id, ...await serviceDependencies(ctx, service.id) });
}

async function listProfessionals(ctx: AdminRequestContext): Promise<Response> {
  const { page, pageSize, offset } = pagination(ctx.url);
  const search = sanitizeText(ctx.url.searchParams.get("search"), "Busca", 1, 120, false);
  const like = search ? `%${search}%` : null;
  const active = activeFilter(ctx.url);

  const filter = `
    FROM professionals
    WHERE tenant_id = ? AND (? IS NULL OR active = ?)
      AND (? IS NULL OR name LIKE ? OR specialty LIKE ?)
  `;
  const binds = [ctx.tenantId, active, active, like, like, like];

  const [count, rows] = await Promise.all([
    ctx.db.prepare(`SELECT COUNT(*) AS total ${filter}`).bind(...binds).first<{ total: number }>(),
    ctx.db.prepare(`
      SELECT professionals.*,
        (SELECT COUNT(*) FROM appointments a
          WHERE a.tenant_id = professionals.tenant_id AND a.professional_id = professionals.id) AS appointment_count,
        (SELECT COUNT(*) FROM professional_schedules s
          WHERE s.tenant_id = professionals.tenant_id AND s.professional_id = professionals.id) AS schedule_count,
        (SELECT COUNT(*) FROM appointments a
          WHERE a.tenant_id = professionals.tenant_id AND a.professional_id = professionals.id
            AND a.status IN ('PENDING', 'CONFIRMED') AND a.appointment_date >= ?) AS upcoming_appointments
      ${filter}
      ORDER BY display_order, name
      LIMIT ? OFFSET ?
    `).bind(todayIso(), ...binds, pageSize, offset).all<ProfessionalRow & {
      appointment_count: number;
      schedule_count: number;
      upcoming_appointments: number;
    }>()
  ]);

  const ids = rows.results.map((row) => row.id);
  const placeholders = ids.map(() => "?").join(", ");
  const [links, schedules] = ids.length
    ? await Promise.all([
        ctx.db.prepare(`
          SELECT ps.professional_id, ps.service_id, s.name AS service_name
          FROM professional_services ps
          JOIN services s ON s.tenant_id = ps.tenant_id AND s.id = ps.service_id
          WHERE ps.tenant_id = ? AND ps.professional_id IN (${placeholders})
          ORDER BY ps.service_id
        `).bind(ctx.tenantId, ...ids).all<{ professional_id: string; service_id: string; service_name: string }>(),
        ctx.db.prepare(`
          SELECT professional_id, start_time, end_time FROM professional_schedules
          WHERE tenant_id = ? AND active = 1 AND professional_id IN (${placeholders})
        `).bind(ctx.tenantId, ...ids).all<{ professional_id: string; start_time: string; end_time: string }>()
      ])
    : [{ results: [] }, { results: [] }];

  const weekly = new Map<string, number>();
  for (const schedule of schedules.results) {
    const minutes = timeToMinutes(schedule.end_time) - timeToMinutes(schedule.start_time);
    weekly.set(schedule.professional_id, (weekly.get(schedule.professional_id) ?? 0) + minutes);
  }

  const total = count?.total ?? 0;
  return json({
    items: rows.results.map((row) => {
      const owned = links.results.filter((link) => link.professional_id === row.id);
      return {
        ...professionalPayload(row),
        serviceIds: owned.map((link) => link.service_id),
        serviceNames: owned.map((link) => link.service_name),
        appointmentCount: row.appointment_count,
        scheduleCount: row.schedule_count,
        weeklyMinutes: weekly.get(row.id) ?? 0,
        upcomingAppointments: row.upcoming_appointments
      };
    }),
    pagination: { page, limit: pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) }
  });
}

async function createProfessional(ctx: AdminRequestContext): Promise<Response> {
  const body = await readJsonObject(ctx.request);
  const name = sanitizeText(body.name, "Nome do profissional", 2, 80) as string;
  const specialty = sanitizeText(body.specialty, "Especialidade", 1, 120, false) ?? "";
  const photo = sanitizeText(body.photo, "Foto", 1, 300, false) ?? "";
  const internalContact = sanitizeText(body.internalContact, "Contato interno", 1, 60, false);
  const displayOrder = body.displayOrder === undefined ? 0 : parseOrder(body.displayOrder);

  await assertUniqueName(ctx, "professionals", name, null);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await ctx.db.prepare(`
      INSERT INTO professionals (
        id, tenant_id, name, specialty, photo, active, display_order,
        internal_contact, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
    `).bind(id, ctx.tenantId, name, specialty, photo, displayOrder, internalContact, now, now).run();
  } catch (error) {
    if (isConstraintError(error)) throw new HttpError(409, "CONFLICT", "Já existe um profissional com esse nome");
    throw error;
  }
  return json(professionalPayload(await loadProfessional(ctx, id)), { status: 201 });
}

async function updateProfessional(ctx: AdminRequestContext): Promise<Response> {
  const current = await loadProfessional(ctx, ctx.params[0]);
  const body = await readJsonObject(ctx.request);
  const updates: string[] = [];
  const binds: unknown[] = [];

  if (Object.hasOwn(body, "name")) {
    const name = sanitizeText(body.name, "Nome do profissional", 2, 80) as string;
    await assertUniqueName(ctx, "professionals", name, current.id);
    updates.push("name = ?");
    binds.push(name);
  }
  if (Object.hasOwn(body, "specialty")) {
    updates.push("specialty = ?");
    binds.push(sanitizeText(body.specialty, "Especialidade", 1, 120, false) ?? "");
  }
  if (Object.hasOwn(body, "photo")) {
    updates.push("photo = ?");
    binds.push(sanitizeText(body.photo, "Foto", 1, 300, false) ?? "");
  }
  if (Object.hasOwn(body, "internalContact")) {
    updates.push("internal_contact = ?");
    binds.push(sanitizeText(body.internalContact, "Contato interno", 1, 60, false));
  }
  if (Object.hasOwn(body, "displayOrder")) {
    updates.push("display_order = ?");
    binds.push(parseOrder(body.displayOrder));
  }
  if (!updates.length) invalid("Nenhum campo válido para atualizar");

  try {
    await ctx.db.prepare(`
      UPDATE professionals SET ${updates.join(", ")}, updated_at = ? WHERE tenant_id = ? AND id = ?
    `).bind(...binds, new Date().toISOString(), ctx.tenantId, current.id).run();
  } catch (error) {
    if (isConstraintError(error)) throw new HttpError(409, "CONFLICT", "Já existe um profissional com esse nome");
    throw error;
  }
  return json(professionalPayload(await loadProfessional(ctx, current.id)));
}

async function setProfessionalActive(ctx: AdminRequestContext): Promise<Response> {
  const current = await loadProfessional(ctx, ctx.params[0]);
  const body = await readJsonObject(ctx.request);
  const active = requireBoolean(body.active, "active");

  let appliedImpact: unknown[] = [];
  if (!active && current.active === 1) {
    const affected = await futureAppointments(ctx.db, ctx.tenantId, { professionalId: current.id });
    appliedImpact = assertConfirmed(affected, body.confirm, "Existem agendamentos futuros com este profissional");
  }

  await ctx.db.prepare("UPDATE professionals SET active = ?, updated_at = ? WHERE tenant_id = ? AND id = ?")
    .bind(active ? 1 : 0, new Date().toISOString(), ctx.tenantId, current.id).run();
  return json({ ...professionalPayload(await loadProfessional(ctx, current.id)), appliedImpact });
}

async function setProfessionalServices(ctx: AdminRequestContext): Promise<Response> {
  const professional = await loadProfessional(ctx, ctx.params[0]);
  const body = await readJsonObject(ctx.request, 16384);
  if (!Array.isArray(body.serviceIds)) invalid("serviceIds inválido");
  const serviceIds = [...new Set(body.serviceIds.map(
    (value) => requirePublicId(typeof value === "string" ? value : null, "serviceIds")
  ))];

  // Serviço de outro tenant não existe deste lado da autorização.
  if (serviceIds.length) await assertOwned(ctx, "services", serviceIds);

  const placeholders = serviceIds.map(() => "?").join(", ");
  const statements: D1PreparedStatement[] = [
    serviceIds.length
      ? ctx.db.prepare(`
          DELETE FROM professional_services
          WHERE tenant_id = ? AND professional_id = ? AND service_id NOT IN (${placeholders})
        `).bind(ctx.tenantId, professional.id, ...serviceIds)
      : ctx.db.prepare("DELETE FROM professional_services WHERE tenant_id = ? AND professional_id = ?")
        .bind(ctx.tenantId, professional.id),
    ...serviceIds.map((serviceId) => ctx.db.prepare(`
      INSERT INTO professional_services (tenant_id, professional_id, service_id)
      VALUES (?, ?, ?)
      ON CONFLICT(tenant_id, professional_id, service_id) DO NOTHING
    `).bind(ctx.tenantId, professional.id, serviceId))
  ];
  await ctx.db.batch(statements);

  const links = await ctx.db.prepare(`
    SELECT s.id, s.name, s.active
    FROM professional_services ps
    JOIN services s ON s.tenant_id = ps.tenant_id AND s.id = ps.service_id
    WHERE ps.tenant_id = ? AND ps.professional_id = ?
    ORDER BY ps.service_id
  `).bind(ctx.tenantId, professional.id).all<{ id: string; name: string; active: number }>();

  return json({
    professionalId: professional.id,
    services: links.results.map((row) => ({ id: row.id, name: row.name, active: row.active === 1 }))
  });
}

async function reorderProfessionals(ctx: AdminRequestContext): Promise<Response> {
  const body = await readJsonObject(ctx.request, 16384);
  const ids = orderIds(body);
  await assertOwned(ctx, "professionals", ids);
  const now = new Date().toISOString();

  await ctx.db.batch(ids.map((id, index) => ctx.db.prepare(
    "UPDATE professionals SET display_order = ?, updated_at = ? WHERE tenant_id = ? AND id = ?"
  ).bind(index, now, ctx.tenantId, id)));

  const rows = await ctx.db.prepare(
    "SELECT * FROM professionals WHERE tenant_id = ? ORDER BY display_order, name"
  ).bind(ctx.tenantId).all<ProfessionalRow>();
  return json(rows.results.map(professionalPayload));
}

async function getProfessionalDependencies(ctx: AdminRequestContext): Promise<Response> {
  const professional = await loadProfessional(ctx, ctx.params[0]);
  return json({ professionalId: professional.id, ...await professionalDependencies(ctx, professional.id) });
}

export const catalogRoutes: AdminRoute[] = [
  route("GET", /^services$/, listServices),
  route("POST", /^services$/, createService),
  route("PATCH", /^services\/order$/, reorderServices),
  route("GET", /^services\/([^/]+)\/dependencies$/, getServiceDependencies),
  route("PATCH", /^services\/([^/]+)\/active$/, setServiceActive),
  route("PATCH", /^services\/([^/]+)$/, updateService),

  route("GET", /^professionals$/, listProfessionals),
  route("POST", /^professionals$/, createProfessional),
  route("PATCH", /^professionals\/order$/, reorderProfessionals),
  route("GET", /^professionals\/([^/]+)\/dependencies$/, getProfessionalDependencies),
  route("PUT", /^professionals\/([^/]+)\/services$/, setProfessionalServices),
  route("PATCH", /^professionals\/([^/]+)\/active$/, setProfessionalActive),
  route("PATCH", /^professionals\/([^/]+)$/, updateProfessional)
];
