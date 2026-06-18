CREATE TABLE IF NOT EXISTS "wtf_live_soundboard_clips" (
  "id" serial PRIMARY KEY,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "clip_id" varchar(80) NOT NULL,
  "label" varchar(64) NOT NULL,
  "category" varchar(48) NOT NULL DEFAULT 'General',
  "shortcut" varchar(32) NOT NULL DEFAULT '',
  "mime_type" varchar(64) NOT NULL,
  "data_url" text NOT NULL,
  "size_bytes" integer NOT NULL DEFAULT 0,
  "volume" integer NOT NULL DEFAULT 90,
  "cooldown_ms" integer NOT NULL DEFAULT 1500,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "wtf_live_soundboard_owner_clip_idx"
  ON "wtf_live_soundboard_clips" ("owner_user_id", "clip_id");

CREATE INDEX IF NOT EXISTS "wtf_live_soundboard_owner_order_idx"
  ON "wtf_live_soundboard_clips" ("owner_user_id", "sort_order");
