-- Desktop hamster founder genetics for future breeding and racing systems.

ALTER TABLE "desktop_pet_states"
  ADD COLUMN IF NOT EXISTS "genetics" jsonb DEFAULT '{}'::jsonb NOT NULL;
