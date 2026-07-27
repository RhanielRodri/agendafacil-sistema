ALTER TABLE admin_memberships RENAME COLUMN role TO legacy_role;
ALTER TABLE admin_memberships ADD COLUMN role TEXT NOT NULL DEFAULT 'owner'
  CHECK (role IN ('owner', 'manager', 'receptionist', 'professional'));
ALTER TABLE admin_memberships ADD COLUMN professional_id TEXT REFERENCES professionals(id) ON DELETE RESTRICT;
ALTER TABLE admin_memberships ADD COLUMN last_access_at TEXT;

CREATE UNIQUE INDEX idx_admin_memberships_professional
  ON admin_memberships(tenant_id, professional_id)
  WHERE professional_id IS NOT NULL;

CREATE TABLE admin_membership_permissions (
  identity_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  module TEXT NOT NULL CHECK (
    module IN (
      'overview',
      'agenda',
      'clients',
      'leads',
      'follow_ups',
      'services',
      'professionals',
      'scheduling',
      'metrics',
      'settings',
      'team'
    )
  ),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (identity_id, tenant_id, module),
  FOREIGN KEY (identity_id, tenant_id)
    REFERENCES admin_memberships(identity_id, tenant_id)
    ON DELETE CASCADE
);

CREATE TABLE admin_access_audit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_identity_id TEXT NOT NULL,
  target_identity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (
    action IN (
      'MEMBERSHIP_CREATED',
      'ROLE_CHANGED',
      'PERMISSIONS_CHANGED',
      'ACTIVATED',
      'DEACTIVATED'
    )
  ),
  before_json TEXT,
  after_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (before_json IS NULL OR json_valid(before_json)),
  CHECK (json_valid(after_json)),
  FOREIGN KEY (tenant_id) REFERENCES tenants(slug) ON DELETE RESTRICT,
  FOREIGN KEY (actor_identity_id, tenant_id)
    REFERENCES admin_memberships(identity_id, tenant_id)
    ON DELETE RESTRICT,
  FOREIGN KEY (target_identity_id, tenant_id)
    REFERENCES admin_memberships(identity_id, tenant_id)
    ON DELETE RESTRICT
);

CREATE INDEX idx_admin_permissions_tenant_module
  ON admin_membership_permissions(tenant_id, module, identity_id);
CREATE INDEX idx_admin_access_audit_tenant_created
  ON admin_access_audit_events(tenant_id, created_at DESC, id DESC);

INSERT INTO admin_membership_permissions (identity_id, tenant_id, module)
SELECT identity_id, tenant_id, 'overview' FROM admin_memberships;
INSERT INTO admin_membership_permissions (identity_id, tenant_id, module)
SELECT identity_id, tenant_id, 'agenda' FROM admin_memberships;
INSERT INTO admin_membership_permissions (identity_id, tenant_id, module)
SELECT identity_id, tenant_id, 'clients' FROM admin_memberships;
INSERT INTO admin_membership_permissions (identity_id, tenant_id, module)
SELECT identity_id, tenant_id, 'leads' FROM admin_memberships;
INSERT INTO admin_membership_permissions (identity_id, tenant_id, module)
SELECT identity_id, tenant_id, 'follow_ups' FROM admin_memberships;
INSERT INTO admin_membership_permissions (identity_id, tenant_id, module)
SELECT identity_id, tenant_id, 'services' FROM admin_memberships;
INSERT INTO admin_membership_permissions (identity_id, tenant_id, module)
SELECT identity_id, tenant_id, 'professionals' FROM admin_memberships;
INSERT INTO admin_membership_permissions (identity_id, tenant_id, module)
SELECT identity_id, tenant_id, 'scheduling' FROM admin_memberships;
INSERT INTO admin_membership_permissions (identity_id, tenant_id, module)
SELECT identity_id, tenant_id, 'metrics' FROM admin_memberships;
INSERT INTO admin_membership_permissions (identity_id, tenant_id, module)
SELECT identity_id, tenant_id, 'settings' FROM admin_memberships;
INSERT INTO admin_membership_permissions (identity_id, tenant_id, module)
SELECT identity_id, tenant_id, 'team' FROM admin_memberships;

CREATE TRIGGER trg_admin_memberships_professional_insert
BEFORE INSERT ON admin_memberships
FOR EACH ROW
WHEN (
  NEW.role = 'professional'
  AND (
    NEW.professional_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM professionals
      WHERE id = NEW.professional_id AND tenant_id = NEW.tenant_id
    )
  )
) OR (
  NEW.role <> 'professional' AND NEW.professional_id IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_PROFESSIONAL_LINK');
END;

CREATE TRIGGER trg_admin_memberships_professional_update
BEFORE UPDATE OF role, professional_id, tenant_id ON admin_memberships
FOR EACH ROW
WHEN (
  NEW.role = 'professional'
  AND (
    NEW.professional_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM professionals
      WHERE id = NEW.professional_id AND tenant_id = NEW.tenant_id
    )
  )
) OR (
  NEW.role <> 'professional' AND NEW.professional_id IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'INVALID_PROFESSIONAL_LINK');
END;

CREATE TRIGGER trg_admin_memberships_last_owner_update
BEFORE UPDATE OF role, active ON admin_memberships
FOR EACH ROW
WHEN OLD.role = 'owner'
  AND OLD.active = 1
  AND (NEW.role <> 'owner' OR NEW.active <> 1)
  AND NOT EXISTS (
    SELECT 1
    FROM admin_memberships other
    JOIN admin_identities identity ON identity.id = other.identity_id
    WHERE other.tenant_id = OLD.tenant_id
      AND other.identity_id <> OLD.identity_id
      AND other.role = 'owner'
      AND other.active = 1
      AND identity.active = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'LAST_OWNER');
END;

CREATE TRIGGER trg_admin_memberships_last_owner_delete
BEFORE DELETE ON admin_memberships
FOR EACH ROW
WHEN OLD.role = 'owner'
  AND OLD.active = 1
  AND NOT EXISTS (
    SELECT 1
    FROM admin_memberships other
    JOIN admin_identities identity ON identity.id = other.identity_id
    WHERE other.tenant_id = OLD.tenant_id
      AND other.identity_id <> OLD.identity_id
      AND other.role = 'owner'
      AND other.active = 1
      AND identity.active = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'LAST_OWNER');
END;

CREATE TRIGGER trg_admin_identities_last_owner_update
BEFORE UPDATE OF active ON admin_identities
FOR EACH ROW
WHEN OLD.active = 1
  AND NEW.active <> 1
  AND EXISTS (
    SELECT 1
    FROM admin_memberships target
    WHERE target.identity_id = OLD.id
      AND target.role = 'owner'
      AND target.active = 1
      AND NOT EXISTS (
        SELECT 1
        FROM admin_memberships other
        JOIN admin_identities identity ON identity.id = other.identity_id
        WHERE other.tenant_id = target.tenant_id
          AND other.identity_id <> OLD.id
          AND other.role = 'owner'
          AND other.active = 1
          AND identity.active = 1
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'LAST_OWNER');
END;

CREATE TRIGGER trg_admin_identities_last_owner_delete
BEFORE DELETE ON admin_identities
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM admin_memberships target
  WHERE target.identity_id = OLD.id
    AND target.role = 'owner'
    AND target.active = 1
    AND NOT EXISTS (
      SELECT 1
      FROM admin_memberships other
      JOIN admin_identities identity ON identity.id = other.identity_id
      WHERE other.tenant_id = target.tenant_id
        AND other.identity_id <> OLD.id
        AND other.role = 'owner'
        AND other.active = 1
        AND identity.active = 1
    )
)
BEGIN
  SELECT RAISE(ABORT, 'LAST_OWNER');
END;
