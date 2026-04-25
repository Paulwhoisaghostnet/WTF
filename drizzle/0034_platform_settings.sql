CREATE TABLE IF NOT EXISTS "platform_settings" (
  "key" varchar(120) PRIMARY KEY NOT NULL,
  "value" text,
  "updated_by" integer REFERENCES "users"("id"),
  "updated_at" timestamp DEFAULT now() NOT NULL
);
