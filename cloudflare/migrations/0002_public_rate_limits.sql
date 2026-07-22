CREATE TABLE public_rate_limits (
  key_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  window_started_at TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count >= 1),
  expires_at TEXT NOT NULL,
  PRIMARY KEY (key_hash, action),
  CHECK (length(key_hash) = 64),
  CHECK (length(action) BETWEEN 1 AND 40)
);

CREATE INDEX idx_public_rate_limits_expiry ON public_rate_limits(expires_at);
