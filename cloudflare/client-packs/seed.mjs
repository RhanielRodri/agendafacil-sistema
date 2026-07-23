// Geração de SQL de provisionamento/reconciliação a partir de um Client Pack.
//
// Invariantes de segurança:
//  - Toda instrução é escopada por tenant_id = <slug>. Nunca cruza tenants.
//  - Só toca tabelas ESTRUTURAIS (serviços, profissionais, associações,
//    configurações, horários, agendas, bloqueios). Nunca referencia dados
//    operacionais (appointments, clients, leads, follow_ups, histórico), então
//    reconciliar não apaga nem move atendimento nenhum.
//  - Idempotente: upsert por chave estável; reexecutar não duplica.
//  - Reconciliação inativa (active = 0) serviços/profissionais removidos do
//    pack — nunca deleta, porque atendimentos existentes os referenciam. Só
//    linhas de junção e agenda (sem dependência operacional) são removidas.

function q(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function inList(values) {
  return values.length ? values.map(q).join(", ") : "''";
}

// Cabeçalho comum: identifica a operação e o momento, sem segredos.
function header(slug, now, mode) {
  return `-- Client Pack seed (${mode}) — tenant ${slug} — ${now}\n`;
}

function tenantRow(pack, now) {
  const { slug, name, active } = pack.tenant;
  return (
    `INSERT INTO tenants (id, slug, name, active, created_at, updated_at) VALUES\n` +
    `  (${q(`tenant-${slug}`)}, ${q(slug)}, ${q(name)}, ${q(active)}, ${q(now)}, ${q(now)})\n` +
    `ON CONFLICT(slug) DO UPDATE SET name = excluded.name, active = excluded.active, updated_at = ${q(now)};\n`
  );
}

function servicesRows(pack, now) {
  const slug = pack.tenant.slug;
  const rows = pack.catalog.services.map((s) =>
    `  (${q(s.id)}, ${q(slug)}, ${q(s.name)}, ${q(s.description)}, ${q(s.durationMinutes)}, ${q(s.priceCents)}, ${q(s.active)}, ${q(s.displayOrder)}, ${q(s.requiresEvaluation)})`
  );
  return (
    `INSERT INTO services (id, tenant_id, name, description, duration_minutes, price_cents, active, display_order, requires_evaluation) VALUES\n` +
    rows.join(",\n") + "\n" +
    `ON CONFLICT(id) DO UPDATE SET\n` +
    `  name = excluded.name,\n  description = excluded.description,\n  duration_minutes = excluded.duration_minutes,\n` +
    `  price_cents = excluded.price_cents,\n  active = excluded.active,\n  display_order = excluded.display_order,\n` +
    `  requires_evaluation = excluded.requires_evaluation,\n  updated_at = ${q(now)};\n`
  );
}

function professionalsRows(pack, now) {
  const slug = pack.tenant.slug;
  const rows = pack.catalog.professionals.map((p) =>
    `  (${q(p.id)}, ${q(slug)}, ${q(p.name)}, ${q(p.specialty)}, ${q(p.photo)}, ${q(p.active)}, ${q(p.displayOrder)})`
  );
  return (
    `INSERT INTO professionals (id, tenant_id, name, specialty, photo, active, display_order) VALUES\n` +
    rows.join(",\n") + "\n" +
    `ON CONFLICT(id) DO UPDATE SET\n` +
    `  name = excluded.name,\n  specialty = excluded.specialty,\n  photo = excluded.photo,\n` +
    `  active = excluded.active,\n  display_order = excluded.display_order,\n  updated_at = ${q(now)};\n`
  );
}

function associationsRows(pack) {
  const slug = pack.tenant.slug;
  if (pack.catalog.associations.length === 0) return "";
  const rows = pack.catalog.associations.map((a) =>
    `  (${q(slug)}, ${q(a.professionalId)}, ${q(a.serviceId)})`
  );
  return (
    `INSERT INTO professional_services (tenant_id, professional_id, service_id) VALUES\n` +
    rows.join(",\n") + "\n" +
    `ON CONFLICT(tenant_id, professional_id, service_id) DO NOTHING;\n`
  );
}

function settingsRow(pack, now) {
  const slug = pack.tenant.slug;
  const s = pack.settings;
  return (
    `INSERT INTO tenant_settings (\n` +
    `  id, tenant_id, public_name, timezone, slot_duration_minutes,\n` +
    `  min_advance_minutes, max_future_days, cancellation_policy,\n` +
    `  confirmation_message, booking_enabled\n` +
    `) VALUES\n` +
    `  (${q(`settings-${slug}`)}, ${q(slug)}, ${q(s.publicName)}, ${q(s.timezone)}, ${q(s.slotDurationMinutes)}, ` +
    `${q(s.minAdvanceMinutes)}, ${q(s.maxFutureDays)}, ${q(s.cancellationPolicy)}, ${q(s.confirmationMessage)}, ${q(s.bookingEnabled)})\n` +
    `ON CONFLICT(tenant_id) DO UPDATE SET\n` +
    `  public_name = excluded.public_name,\n  timezone = excluded.timezone,\n  slot_duration_minutes = excluded.slot_duration_minutes,\n` +
    `  min_advance_minutes = excluded.min_advance_minutes,\n  max_future_days = excluded.max_future_days,\n` +
    `  cancellation_policy = excluded.cancellation_policy,\n  confirmation_message = excluded.confirmation_message,\n` +
    `  booking_enabled = excluded.booking_enabled,\n  updated_at = ${q(now)};\n`
  );
}

function businessHoursRows(pack, now) {
  const slug = pack.tenant.slug;
  const rows = pack.schedule.businessHours.map((h) =>
    `  (${q(`hours-${slug}-${h.dayOfWeek}`)}, ${q(slug)}, ${q(h.dayOfWeek)}, ${q(h.openTime)}, ${q(h.closeTime)}, ${q(h.isOpen)})`
  );
  return (
    `INSERT INTO business_hours (id, tenant_id, day_of_week, open_time, close_time, is_open) VALUES\n` +
    rows.join(",\n") + "\n" +
    `ON CONFLICT(tenant_id, day_of_week) DO UPDATE SET\n` +
    `  open_time = excluded.open_time,\n  close_time = excluded.close_time,\n  is_open = excluded.is_open;\n`
  );
}

function professionalSchedulesRows(pack, now) {
  const slug = pack.tenant.slug;
  if (pack.schedule.professionalSchedules.length === 0) return "";
  const rows = pack.schedule.professionalSchedules.map((s) =>
    `  (${q(s.id)}, ${q(slug)}, ${q(s.professionalId)}, ${q(s.dayOfWeek)}, ${q(s.startTime)}, ${q(s.endTime)}, ${q(s.active)})`
  );
  return (
    `INSERT INTO professional_schedules (id, tenant_id, professional_id, day_of_week, start_time, end_time, active) VALUES\n` +
    rows.join(",\n") + "\n" +
    `ON CONFLICT(id) DO UPDATE SET\n` +
    `  day_of_week = excluded.day_of_week,\n  start_time = excluded.start_time,\n  end_time = excluded.end_time,\n` +
    `  active = excluded.active,\n  updated_at = ${q(now)};\n`
  );
}

function scheduleBlocksRows(pack, now) {
  const slug = pack.tenant.slug;
  if (pack.schedule.scheduleBlocks.length === 0) return "";
  const rows = pack.schedule.scheduleBlocks.map((b) =>
    `  (${q(b.id)}, ${q(slug)}, ${q(b.professionalId)}, ${q(b.date)}, ${q(b.allDay)}, ${q(b.startTime)}, ${q(b.endTime)}, ${q(b.reason)})`
  );
  return (
    `INSERT INTO schedule_blocks (id, tenant_id, professional_id, date, all_day, start_time, end_time, reason) VALUES\n` +
    rows.join(",\n") + "\n" +
    `ON CONFLICT(id) DO UPDATE SET\n` +
    `  professional_id = excluded.professional_id,\n  date = excluded.date,\n  all_day = excluded.all_day,\n` +
    `  start_time = excluded.start_time,\n  end_time = excluded.end_time,\n  reason = excluded.reason,\n  updated_at = ${q(now)};\n`
  );
}

// Passo de reconciliação: inativa/limpa o que saiu do pack, sempre escopado.
function reconcileStatements(pack, now) {
  const slug = pack.tenant.slug;
  const serviceIds = pack.catalog.services.map((s) => s.id);
  const proIds = pack.catalog.professionals.map((p) => p.id);
  const pairs = pack.catalog.associations.map((a) => `${a.professionalId}::${a.serviceId}`);
  const scheduleIds = pack.schedule.professionalSchedules.map((s) => s.id);
  const blockIds = pack.schedule.scheduleBlocks.map((b) => b.id);
  const out = [];
  out.push(
    `-- Reconciliação: inativa estrutura removida do pack (preserva histórico).\n` +
    `UPDATE services SET active = 0, updated_at = ${q(now)}\n  WHERE tenant_id = ${q(slug)} AND id NOT IN (${inList(serviceIds)});\n`
  );
  out.push(
    `UPDATE professionals SET active = 0, updated_at = ${q(now)}\n  WHERE tenant_id = ${q(slug)} AND id NOT IN (${inList(proIds)});\n`
  );
  out.push(
    `DELETE FROM professional_services\n  WHERE tenant_id = ${q(slug)} AND (professional_id || '::' || service_id) NOT IN (${inList(pairs)});\n`
  );
  out.push(
    `DELETE FROM professional_schedules\n  WHERE tenant_id = ${q(slug)} AND id NOT IN (${inList(scheduleIds)});\n`
  );
  out.push(
    `DELETE FROM schedule_blocks\n  WHERE tenant_id = ${q(slug)} AND id NOT IN (${inList(blockIds)});\n`
  );
  return out.join("\n");
}

// SQL completo. `mode`: "provision" (upsert idempotente) ou "reconcile"
// (upsert + inativação do que saiu do pack).
export function compileSeedSql(pack, { now = new Date().toISOString(), reconcile = false } = {}) {
  const mode = reconcile ? "reconcile" : "provision";
  const blocks = [
    header(pack.tenant.slug, now, mode),
    tenantRow(pack, now),
    servicesRows(pack, now),
    professionalsRows(pack, now),
    associationsRows(pack),
    settingsRow(pack, now),
    businessHoursRows(pack, now),
    professionalSchedulesRows(pack, now),
    scheduleBlocksRows(pack, now)
  ].filter(Boolean);
  if (reconcile) blocks.push(reconcileStatements(pack, now));
  return blocks.join("\n");
}
