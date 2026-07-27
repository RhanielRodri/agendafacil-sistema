ALTER TABLE clients ADD COLUMN archived_at TEXT;
ALTER TABLE clients ADD COLUMN archived_by_identity_id TEXT;

CREATE INDEX idx_clients_archive_last_contact
  ON clients(tenant_id, archived_at, last_contact_at);
