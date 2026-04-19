-- Cockpit migration — Phase 0
--
-- Adds the sync infrastructure + shared caches the cockpit uses.
-- Every statement is idempotent; safe to run more than once, safe to
-- skip by feature flag (app will start without these tables but won't
-- write audit rows — see server/lib/scheduler.ts, which catches DB
-- errors from recordStart/recordFinish).
--
-- Rollback: DROP TABLE IF EXISTS sync_runs, indexing_queue,
--           token_metadata, contract_metadata, address_labels CASCADE;

CREATE TABLE IF NOT EXISTS "sync_runs" (
  "id" serial PRIMARY KEY,
  "job_name" varchar(64) NOT NULL,
  "scope" varchar(128),
  "status" varchar(16) NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp,
  "duration_ms" integer,
  "items_in" integer DEFAULT 0 NOT NULL,
  "items_out" integer DEFAULT 0 NOT NULL,
  "error" text,
  "cursor_before" jsonb,
  "cursor_after" jsonb
);
CREATE INDEX IF NOT EXISTS "idx_sync_runs_job_started"
  ON "sync_runs" ("job_name", "started_at");
CREATE INDEX IF NOT EXISTS "idx_sync_runs_job_status"
  ON "sync_runs" ("job_name", "status");

CREATE TABLE IF NOT EXISTS "indexing_queue" (
  "id" serial PRIMARY KEY,
  "target" varchar(64) NOT NULL,
  "target_kind" varchar(16) NOT NULL,
  "priority" integer DEFAULT 5 NOT NULL,
  "reason" varchar(64),
  "enqueued_at" timestamp DEFAULT now() NOT NULL,
  "picked_up_at" timestamp,
  "finished_at" timestamp,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text
);
CREATE INDEX IF NOT EXISTS "idx_indexing_queue_pri"
  ON "indexing_queue" ("priority", "enqueued_at");
CREATE INDEX IF NOT EXISTS "idx_indexing_queue_status"
  ON "indexing_queue" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_indexing_queue_target_pending"
  ON "indexing_queue" ("target", "target_kind", "status");

CREATE TABLE IF NOT EXISTS "token_metadata" (
  "token_contract" varchar(36) NOT NULL,
  "token_id" text NOT NULL,
  "name" text,
  "symbol" text,
  "description" text,
  "thumbnail" text,
  "artifact_uri" text,
  "display_uri" text,
  "mime_type" varchar(128),
  "creators" jsonb,
  "tags" jsonb,
  "formats" jsonb,
  "attributes" jsonb,
  "raw" jsonb,
  "fetched_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "pk_token_metadata"
  ON "token_metadata" ("token_contract", "token_id");
CREATE INDEX IF NOT EXISTS "idx_token_metadata_contract"
  ON "token_metadata" ("token_contract");

CREATE TABLE IF NOT EXISTS "contract_metadata" (
  "address" varchar(36) PRIMARY KEY,
  "kind" varchar(32),
  "alias" text,
  "creator" varchar(36),
  "interfaces" jsonb,
  "raw" jsonb,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "address_labels" (
  "address" varchar(64) PRIMARY KEY,
  "label" text,
  "category" varchar(32),
  "tezos_domain" text,
  "notes" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_address_labels_category"
  ON "address_labels" ("category");
