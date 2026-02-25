-- Metadata runtime tables used by PostgresJobRepository.
-- Keep names aligned with services/api/src/services/job-repo.ts.

CREATE TABLE IF NOT EXISTS imageops_metadata_kv (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS imageops_deletion_audit (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS imageops_billing_events (
  provider_event_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS imageops_deletion_audit_created_idx
ON imageops_deletion_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS imageops_billing_events_created_idx
ON imageops_billing_events (created_at DESC);
