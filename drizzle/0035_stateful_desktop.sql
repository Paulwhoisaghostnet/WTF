-- Stateful desktop appearance, icon layout, and hamster pet telemetry.

CREATE TABLE IF NOT EXISTS "user_desktop_settings" (
  "user_id" integer PRIMARY KEY NOT NULL,
  "appearance" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "icon_layout" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "desktop_pet_states" (
  "user_id" integer PRIMARY KEY NOT NULL,
  "name" varchar(40) DEFAULT 'Niblet' NOT NULL,
  "alive" boolean DEFAULT true NOT NULL,
  "hunger" integer DEFAULT 72 NOT NULL,
  "thirst" integer DEFAULT 72 NOT NULL,
  "happiness" integer DEFAULT 68 NOT NULL,
  "hygiene" integer DEFAULT 70 NOT NULL,
  "energy" integer DEFAULT 64 NOT NULL,
  "level" integer DEFAULT 1 NOT NULL,
  "xp_earned" integer DEFAULT 0 NOT NULL,
  "missed_care_days" integer DEFAULT 0 NOT NULL,
  "care_streak" integer DEFAULT 0 NOT NULL,
  "last_care_date" date,
  "last_interaction_at" timestamp,
  "interaction_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "desktop_pet_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "action" varchar(40) NOT NULL,
  "stat_before" jsonb,
  "stat_after" jsonb,
  "xp_amount" integer DEFAULT 0 NOT NULL,
  "xp_event_id" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

DO $$
BEGIN
  ALTER TABLE "user_desktop_settings"
    ADD CONSTRAINT "user_desktop_settings_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "desktop_pet_states"
    ADD CONSTRAINT "desktop_pet_states_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "desktop_pet_events"
    ADD CONSTRAINT "desktop_pet_events_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "desktop_pet_events"
    ADD CONSTRAINT "desktop_pet_events_xp_event_id_xp_events_id_fk"
    FOREIGN KEY ("xp_event_id") REFERENCES "xp_events"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "desktop_pet_event_user_created_idx"
  ON "desktop_pet_events" ("user_id", "created_at");

CREATE INDEX IF NOT EXISTS "desktop_pet_event_action_idx"
  ON "desktop_pet_events" ("action");
