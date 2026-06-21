CREATE INDEX IF NOT EXISTS idx_sync_runs_job_started_desc
  ON sync_runs (job_name, started_at DESC);
