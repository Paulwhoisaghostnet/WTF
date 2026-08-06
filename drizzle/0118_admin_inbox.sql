CREATE TABLE IF NOT EXISTS "admin_inbox_messages" (
  "id" serial PRIMARY KEY NOT NULL,
  "sender_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" varchar(32) NOT NULL,
  "subject" varchar(180) NOT NULL,
  "message" text NOT NULL,
  "evidence" text,
  "reproduction_steps" text,
  "expected_outcome" text,
  "impact" text,
  "route_path" text,
  "client_url" text,
  "attachment_media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'unread' NOT NULL,
  "sender_read_at" timestamp,
  "read_at" timestamp,
  "read_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "admin_inbox_messages_created_idx"
  ON "admin_inbox_messages" ("created_at");
CREATE INDEX IF NOT EXISTS "admin_inbox_messages_status_idx"
  ON "admin_inbox_messages" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "admin_inbox_messages_sender_idx"
  ON "admin_inbox_messages" ("sender_user_id", "created_at");

CREATE TABLE IF NOT EXISTS "admin_inbox_replies" (
  "id" serial PRIMARY KEY NOT NULL,
  "message_id" integer NOT NULL REFERENCES "admin_inbox_messages"("id") ON DELETE CASCADE,
  "sender_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "sender_kind" varchar(16) NOT NULL,
  "body" text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "admin_inbox_replies_message_idx"
  ON "admin_inbox_replies" ("message_id", "created_at");
CREATE INDEX IF NOT EXISTS "admin_inbox_replies_sender_idx"
  ON "admin_inbox_replies" ("sender_user_id", "created_at");
