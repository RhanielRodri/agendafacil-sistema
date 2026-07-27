ALTER TABLE tenant_settings
ADD COLUMN change_min_advance_minutes INTEGER NOT NULL DEFAULT 240
CHECK (change_min_advance_minutes BETWEEN 0 AND 10080);
