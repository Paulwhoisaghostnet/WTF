-- Desktop hamster customization and scooper care-point tally.

ALTER TABLE "desktop_pet_states"
  ADD COLUMN IF NOT EXISTS "color_scheme_key" varchar(64) DEFAULT 'golden' NOT NULL;

ALTER TABLE "desktop_pet_states"
  ADD COLUMN IF NOT EXISTS "care_points" integer DEFAULT 0 NOT NULL;
