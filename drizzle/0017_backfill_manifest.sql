-- Backfill manifest — central queue for "things we know we're missing".
--
-- Seeders enumerate gaps; a dispatcher worker drains the queue
-- respecting TzKT/Objkt rate limits and retries with exponential
-- backoff.  Idempotent — safe to re-run across deploys.

CREATE TABLE IF NOT EXISTS "backfill_manifest" (
  "id"                 serial     PRIMARY KEY,
  "task_type"          varchar(32) NOT NULL,
  "target"             text        NOT NULL,
  "payload"            jsonb,
  "priority"           integer     NOT NULL DEFAULT 50,
  "status"             varchar(16) NOT NULL DEFAULT 'pending',
  "attempts"           integer     NOT NULL DEFAULT 0,
  "max_attempts"       integer     NOT NULL DEFAULT 6,
  "last_error"         text,
  "last_attempt_at"    timestamp,
  "next_attempt_at"    timestamp,
  "completed_at"       timestamp,
  "created_at"         timestamp   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_backfill_task_target"
  ON "backfill_manifest" ("task_type", "target");

CREATE INDEX IF NOT EXISTS "idx_backfill_dispatch"
  ON "backfill_manifest" ("status", "priority", "next_attempt_at");

CREATE INDEX IF NOT EXISTS "idx_backfill_task_type"
  ON "backfill_manifest" ("task_type");
