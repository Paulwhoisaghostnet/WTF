-- Master structured system log for requests, server events, console output,
-- process failures, outbound fetches, database calls, and background jobs.

CREATE TABLE IF NOT EXISTS "system_event_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_id" varchar(64) NOT NULL,
  "request_id" varchar(64),
  "source" varchar(80) NOT NULL,
  "event_type" varchar(120) NOT NULL,
  "severity" varchar(16) DEFAULT 'info' NOT NULL,
  "message" text,
  "user_id" integer,
  "method" varchar(16),
  "path" text,
  "status_code" integer,
  "duration_ms" integer,
  "ip" varchar(120),
  "user_agent" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "error_name" varchar(255),
  "error_message" text,
  "error_stack" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "system_event_logs"
    ADD CONSTRAINT "system_event_logs_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "system_event_logs_event_id_idx"
  ON "system_event_logs" ("event_id");

CREATE INDEX IF NOT EXISTS "system_event_logs_created_idx"
  ON "system_event_logs" ("created_at");

CREATE INDEX IF NOT EXISTS "system_event_logs_request_idx"
  ON "system_event_logs" ("request_id");

CREATE INDEX IF NOT EXISTS "system_event_logs_source_created_idx"
  ON "system_event_logs" ("source", "created_at");

CREATE INDEX IF NOT EXISTS "system_event_logs_type_created_idx"
  ON "system_event_logs" ("event_type", "created_at");

CREATE INDEX IF NOT EXISTS "system_event_logs_severity_created_idx"
  ON "system_event_logs" ("severity", "created_at");

CREATE INDEX IF NOT EXISTS "system_event_logs_user_created_idx"
  ON "system_event_logs" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "system_event_logs_status_created_idx"
  ON "system_event_logs" ("status_code", "created_at");
