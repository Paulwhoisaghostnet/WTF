CREATE TABLE IF NOT EXISTS "user_curses" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "curse_key" varchar(64) NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "reason" text,
  "assigned_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "assigned_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp,
  "lifted_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "lifted_at" timestamp,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_curses_user_key_unique"
  ON "user_curses" ("user_id", "curse_key");

CREATE INDEX IF NOT EXISTS "user_curses_user_active_idx"
  ON "user_curses" ("user_id", "active");

CREATE INDEX IF NOT EXISTS "user_curses_key_active_idx"
  ON "user_curses" ("curse_key", "active");
