CREATE TABLE IF NOT EXISTS "x_w_media_uploads" (
  "id" serial PRIMARY KEY,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "x_media_id" varchar(64) NOT NULL,
  "media_category" varchar(40) NOT NULL,
  "expires_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "x_w_media_uploads_media_unique_idx"
  ON "x_w_media_uploads" ("x_media_id");

CREATE INDEX IF NOT EXISTS "x_w_media_uploads_owner_idx"
  ON "x_w_media_uploads" ("owner_user_id");

CREATE INDEX IF NOT EXISTS "x_w_media_uploads_expiry_idx"
  ON "x_w_media_uploads" ("expires_at");
