PRAGMA foreign_keys = ON;

CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (length(slug) BETWEEN 1 AND 80),
  CHECK (slug = lower(trim(slug))),
  CHECK (slug NOT GLOB '*[^a-z0-9-]*')
);

CREATE TABLE admin_identities (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (length(email) BETWEEN 3 AND 254),
  CHECK (email = lower(trim(email))),
  CHECK (instr(email, '@') > 1)
);

CREATE TABLE admin_memberships (
  identity_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN' CHECK (role IN ('ADMIN')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (identity_id, tenant_id),
  FOREIGN KEY (identity_id) REFERENCES admin_identities(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT
);

CREATE TABLE services (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 5 AND 1440),
  price_cents INTEGER CHECK (price_cents IS NULL OR (typeof(price_cents) = 'integer' AND price_cents BETWEEN 0 AND 999999999999)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  requires_evaluation INTEGER NOT NULL DEFAULT 0 CHECK (requires_evaluation IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, name),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT
);

CREATE TABLE professionals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  photo TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 0 CHECK (display_order >= 0),
  internal_contact TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, name),
  CHECK (internal_contact IS NULL OR length(internal_contact) <= 60),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT
);

CREATE TABLE professional_services (
  tenant_id TEXT NOT NULL,
  professional_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (tenant_id, professional_id, service_id),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT,
  FOREIGN KEY (professional_id, tenant_id) REFERENCES professionals(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (service_id, tenant_id) REFERENCES services(id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE tenant_settings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL UNIQUE,
  public_name TEXT,
  public_phone TEXT,
  public_whatsapp TEXT,
  address_line TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  slot_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (slot_duration_minutes IN (10, 15, 20, 30, 45, 60)),
  min_advance_minutes INTEGER NOT NULL DEFAULT 0 CHECK (min_advance_minutes BETWEEN 0 AND 10080),
  max_future_days INTEGER NOT NULL DEFAULT 90 CHECK (max_future_days BETWEEN 1 AND 365),
  cancellation_policy TEXT,
  confirmation_message TEXT,
  booking_enabled INTEGER NOT NULL DEFAULT 1 CHECK (booking_enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (public_name IS NULL OR length(public_name) <= 120),
  CHECK (public_phone IS NULL OR length(public_phone) <= 30),
  CHECK (public_whatsapp IS NULL OR length(public_whatsapp) <= 30),
  CHECK (address_line IS NULL OR length(address_line) <= 160),
  CHECK (length(timezone) BETWEEN 1 AND 60),
  CHECK (cancellation_policy IS NULL OR length(cancellation_policy) <= 500),
  CHECK (confirmation_message IS NULL OR length(confirmation_message) <= 300),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT
);

CREATE TABLE business_hours (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  open_time TEXT NOT NULL,
  close_time TEXT NOT NULL,
  is_open INTEGER NOT NULL DEFAULT 1 CHECK (is_open IN (0, 1)),
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, day_of_week),
  CHECK (length(open_time) = 5 AND substr(open_time, 3, 1) = ':'),
  CHECK (length(close_time) = 5 AND substr(close_time, 3, 1) = ':'),
  CHECK (
    (is_open = 0 AND open_time = '00:00' AND close_time = '00:00')
    OR (is_open = 1 AND open_time < close_time)
  ),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT
);

CREATE TABLE blocked_dates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  date TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, date),
  CHECK (length(date) = 10 AND substr(date, 5, 1) = '-' AND substr(date, 8, 1) = '-'),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT
);

CREATE TABLE professional_schedules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  professional_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, professional_id, day_of_week, start_time, end_time),
  CHECK (length(start_time) = 5 AND substr(start_time, 3, 1) = ':'),
  CHECK (length(end_time) = 5 AND substr(end_time, 3, 1) = ':'),
  CHECK (start_time < end_time),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT,
  FOREIGN KEY (professional_id, tenant_id) REFERENCES professionals(id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE schedule_blocks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  professional_id TEXT,
  date TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  start_time TEXT,
  end_time TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, tenant_id),
  CHECK (length(date) = 10 AND substr(date, 5, 1) = '-' AND substr(date, 8, 1) = '-'),
  CHECK (reason IS NULL OR length(reason) <= 200),
  CHECK (
    (all_day = 1 AND start_time IS NULL AND end_time IS NULL)
    OR (
      all_day = 0
      AND start_time IS NOT NULL
      AND end_time IS NOT NULL
      AND length(start_time) = 5
      AND length(end_time) = 5
      AND start_time < end_time
    )
  ),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT,
  FOREIGN KEY (professional_id, tenant_id) REFERENCES professionals(id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  normalized_phone TEXT NOT NULL,
  email TEXT,
  normalized_email TEXT,
  notes TEXT,
  first_contact_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_contact_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, tenant_id),
  UNIQUE (tenant_id, normalized_phone),
  CHECK (length(name) BETWEEN 1 AND 120),
  CHECK (length(phone) BETWEEN 1 AND 30),
  CHECK (length(normalized_phone) BETWEEN 8 AND 15),
  CHECK (normalized_phone NOT GLOB '*[^0-9]*'),
  CHECK (email IS NULL OR length(email) <= 254),
  CHECK (normalized_email IS NULL OR normalized_email = lower(trim(normalized_email))),
  CHECK (notes IS NULL OR length(notes) <= 2000),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT
);

CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  professional_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  lead_id TEXT,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_email TEXT,
  appointment_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  cancellation_reason TEXT,
  rescheduled_from_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, tenant_id),
  UNIQUE (rescheduled_from_id, tenant_id),
  CHECK (length(appointment_date) = 10 AND substr(appointment_date, 5, 1) = '-' AND substr(appointment_date, 8, 1) = '-'),
  CHECK (length(start_time) = 5 AND length(end_time) = 5 AND start_time < end_time),
  CHECK (cancellation_reason IS NULL OR length(cancellation_reason) <= 300),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT,
  FOREIGN KEY (service_id, tenant_id) REFERENCES services(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (professional_id, tenant_id) REFERENCES professionals(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, tenant_id) REFERENCES clients(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (lead_id, tenant_id) REFERENCES leads(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (rescheduled_from_id, tenant_id) REFERENCES appointments(id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE appointment_slots (
  tenant_id TEXT NOT NULL,
  professional_id TEXT NOT NULL,
  appointment_date TEXT NOT NULL,
  slot_time TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  PRIMARY KEY (tenant_id, professional_id, appointment_date, slot_time),
  UNIQUE (tenant_id, appointment_id, slot_time),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT,
  FOREIGN KEY (professional_id, tenant_id) REFERENCES professionals(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (appointment_id, tenant_id) REFERENCES appointments(id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE appointment_access_tokens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL DEFAULT 'MANAGE' CHECK (purpose IN ('MANAGE')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, tenant_id),
  CHECK (length(token_hash) = 64),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT,
  FOREIGN KEY (appointment_id, tenant_id) REFERENCES appointments(id, tenant_id) ON DELETE CASCADE
);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('BOOKING', 'WAITLIST', 'EVALUATION', 'CONTACT', 'ABANDONED_BOOKING', 'MANUAL')),
  status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST')),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH')),
  owner_identity_id TEXT,
  service_id TEXT,
  professional_id TEXT,
  interest_summary TEXT,
  qualification_json TEXT,
  qualification_version INTEGER,
  dedupe_key TEXT NOT NULL,
  lost_reason TEXT,
  lost_reason_note TEXT,
  lost_at TEXT,
  lost_by_identity_id TEXT,
  converted_at TEXT,
  converted_appointment_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, tenant_id),
  UNIQUE (converted_appointment_id, tenant_id),
  CHECK (interest_summary IS NULL OR length(interest_summary) <= 500),
  CHECK (qualification_json IS NULL OR (json_valid(qualification_json) AND length(qualification_json) <= 4096)),
  CHECK (length(dedupe_key) = 64),
  CHECK (lost_reason IS NULL OR length(lost_reason) <= 300),
  CHECK (lost_reason_note IS NULL OR length(lost_reason_note) <= 300),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, tenant_id) REFERENCES clients(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (service_id, tenant_id) REFERENCES services(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (professional_id, tenant_id) REFERENCES professionals(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_identity_id, tenant_id) REFERENCES admin_memberships(identity_id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (lost_by_identity_id, tenant_id) REFERENCES admin_memberships(identity_id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (converted_appointment_id, tenant_id) REFERENCES appointments(id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE follow_ups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  lead_id TEXT,
  due_at TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CONTACT', 'RETURN', 'EVALUATION', 'WAITLIST', 'OTHER')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'COMPLETED', 'CANCELLED')),
  note TEXT,
  completed_at TEXT,
  created_by_identity_id TEXT NOT NULL,
  completed_by_identity_id TEXT,
  owner_identity_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, tenant_id),
  CHECK (note IS NULL OR length(note) <= 500),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, tenant_id) REFERENCES clients(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (lead_id, tenant_id) REFERENCES leads(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_identity_id, tenant_id) REFERENCES admin_memberships(identity_id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (completed_by_identity_id, tenant_id) REFERENCES admin_memberships(identity_id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_identity_id, tenant_id) REFERENCES admin_memberships(identity_id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE appointment_history_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  appointment_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CREATED', 'CONFIRMED', 'CANCELLED', 'RESCHEDULED_FROM', 'RESCHEDULED_TO', 'COMPLETED', 'NO_SHOW', 'STATUS_CHANGED')),
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  to_status TEXT CHECK (to_status IS NULL OR to_status IN ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
  metadata_json TEXT,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('ADMIN', 'CUSTOMER', 'SYSTEM')),
  actor_identity_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (metadata_json IS NULL OR (json_valid(metadata_json) AND length(metadata_json) <= 2048)),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT,
  FOREIGN KEY (appointment_id, tenant_id) REFERENCES appointments(id, tenant_id) ON DELETE CASCADE,
  FOREIGN KEY (actor_identity_id, tenant_id) REFERENCES admin_memberships(identity_id, tenant_id) ON DELETE RESTRICT
);

CREATE TABLE relationship_history_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  lead_id TEXT,
  appointment_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('CLIENT_CREATED', 'CLIENT_UPDATED', 'LEAD_CREATED', 'LEAD_STATUS_CHANGED', 'LEAD_CONVERTED', 'LEAD_LOST', 'LEAD_PRIORITY_CHANGED', 'LEAD_OWNER_CHANGED', 'LEAD_QUALIFICATION_UPDATED', 'FOLLOW_UP_CREATED', 'FOLLOW_UP_COMPLETED', 'FOLLOW_UP_CANCELLED', 'APPOINTMENT_LINKED', 'NOTE_ADDED')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('ADMIN', 'CUSTOMER', 'SYSTEM')),
  actor_identity_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (metadata_json IS NULL OR (json_valid(metadata_json) AND length(metadata_json) <= 4096)),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT,
  FOREIGN KEY (client_id, tenant_id) REFERENCES clients(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (lead_id, tenant_id) REFERENCES leads(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (appointment_id, tenant_id) REFERENCES appointments(id, tenant_id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_identity_id, tenant_id) REFERENCES admin_memberships(identity_id, tenant_id) ON DELETE RESTRICT
);

CREATE INDEX idx_admin_memberships_tenant_active ON admin_memberships(tenant_id, active);
CREATE INDEX idx_services_public ON services(tenant_id, active, display_order, name);
CREATE INDEX idx_professionals_public ON professionals(tenant_id, active, display_order, name);
CREATE INDEX idx_professional_services_service ON professional_services(tenant_id, service_id);
CREATE INDEX idx_professional_schedules_lookup ON professional_schedules(tenant_id, professional_id, day_of_week, active, start_time);
CREATE INDEX idx_schedule_blocks_date ON schedule_blocks(tenant_id, date);
CREATE INDEX idx_schedule_blocks_professional_date ON schedule_blocks(tenant_id, professional_id, date);
CREATE INDEX idx_clients_email ON clients(tenant_id, normalized_email);
CREATE INDEX idx_clients_last_contact ON clients(tenant_id, last_contact_at);
CREATE INDEX idx_appointments_date_status ON appointments(tenant_id, appointment_date, status);
CREATE INDEX idx_appointments_professional_date_time ON appointments(tenant_id, professional_id, appointment_date, start_time);
CREATE INDEX idx_appointments_client_date ON appointments(tenant_id, client_id, appointment_date);
CREATE INDEX idx_appointments_lead ON appointments(tenant_id, lead_id);
CREATE INDEX idx_appointment_tokens_appointment ON appointment_access_tokens(tenant_id, appointment_id);
CREATE INDEX idx_appointment_tokens_expires ON appointment_access_tokens(expires_at);
CREATE INDEX idx_leads_status_created ON leads(tenant_id, status, created_at);
CREATE INDEX idx_leads_source_created ON leads(tenant_id, source, created_at);
CREATE INDEX idx_leads_priority_status ON leads(tenant_id, priority, status, created_at);
CREATE INDEX idx_leads_owner_status ON leads(tenant_id, owner_identity_id, status, created_at);
CREATE INDEX idx_leads_client_created ON leads(tenant_id, client_id, created_at);
CREATE UNIQUE INDEX idx_leads_active_dedupe ON leads(tenant_id, client_id, dedupe_key) WHERE status IN ('NEW', 'CONTACTED', 'QUALIFIED');
CREATE INDEX idx_follow_ups_status_due ON follow_ups(tenant_id, status, due_at);
CREATE INDEX idx_follow_ups_client_created ON follow_ups(tenant_id, client_id, created_at);
CREATE INDEX idx_follow_ups_lead ON follow_ups(tenant_id, lead_id);
CREATE INDEX idx_follow_ups_owner_status ON follow_ups(tenant_id, owner_identity_id, status, due_at);
CREATE INDEX idx_appointment_history ON appointment_history_events(tenant_id, appointment_id, created_at);
CREATE INDEX idx_relationship_client ON relationship_history_events(tenant_id, client_id, created_at, id);
CREATE INDEX idx_relationship_lead ON relationship_history_events(tenant_id, lead_id, created_at);
CREATE INDEX idx_relationship_appointment ON relationship_history_events(tenant_id, appointment_id);
