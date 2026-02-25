CREATE TYPE plan_type AS ENUM ('free', 'pro', 'team');
CREATE TYPE job_status AS ENUM ('queued', 'running', 'done', 'failed', 'expired');
CREATE TYPE subject_type AS ENUM ('user', 'session');
CREATE TYPE delete_reason AS ENUM ('delivered', 'page_exit', 'ttl_expiry', 'manual');
CREATE TYPE delete_result AS ENUM ('success', 'not_found', 'failed');

CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  plan plan_type NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  device_fingerprint_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE quota_windows (
  id UUID PRIMARY KEY,
  subject_type subject_type NOT NULL,
  subject_id UUID NOT NULL,
  window_start_at TIMESTAMPTZ NOT NULL,
  used_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE(subject_type, subject_id)
);

CREATE TABLE jobs (
  id UUID PRIMARY KEY,
  subject_id UUID NOT NULL,
  tool TEXT NOT NULL,
  is_advanced BOOLEAN NOT NULL,
  watermark_applied BOOLEAN NOT NULL DEFAULT FALSE,
  input_object_key TEXT,
  output_object_key TEXT,
  status job_status NOT NULL DEFAULT 'queued',
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE deletion_audit (
  id UUID PRIMARY KEY,
  object_key TEXT NOT NULL,
  reason delete_reason NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result delete_result NOT NULL
);

CREATE TABLE events (
  id UUID PRIMARY KEY,
  subject_id UUID,
  event_name TEXT NOT NULL,
  properties_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
