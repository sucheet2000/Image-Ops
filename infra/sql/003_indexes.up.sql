-- Jobs by subject for dashboard queries
CREATE INDEX IF NOT EXISTS idx_jobs_subject_created
  ON jobs(subject_id, created_at DESC);

-- Jobs by active status for queue/worker visibility
CREATE INDEX IF NOT EXISTS idx_jobs_status_active
  ON jobs(status)
  WHERE status IN ('queued', 'running');

-- Jobs by subject + status for filtered dashboard views
CREATE INDEX IF NOT EXISTS idx_jobs_subject_status
  ON jobs(subject_id, status, created_at DESC);

-- Sessions by user for account/session management
CREATE INDEX IF NOT EXISTS idx_sessions_user_created
  ON sessions(user_id, created_at DESC);

-- Quota windows by subject for repository lookups
CREATE INDEX IF NOT EXISTS idx_quota_windows_subject
  ON quota_windows(subject_type, subject_id);

-- Billing checkout sessions by subject from metadata store
CREATE INDEX IF NOT EXISTS imageops_billing_checkout_subject_updated_idx
  ON imageops_metadata_kv ((value->>'subjectId'), (value->>'updatedAt') DESC)
  WHERE key LIKE 'imageops:billing-checkout:%';
