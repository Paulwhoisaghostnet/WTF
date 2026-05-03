ALTER TABLE "rounds"
  ADD COLUMN IF NOT EXISTS "starting_contestants" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "eliminated_at_end" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "required_platforms" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "rules" text,
  ADD COLUMN IF NOT EXISTS "prizes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "previous_winners" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "leaderboard" jsonb DEFAULT '[]'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS "eliminated_contestants" jsonb DEFAULT '[]'::jsonb NOT NULL;

UPDATE "rounds"
SET
  "required_platforms" = COALESCE("required_platforms", '[]'::jsonb),
  "prizes" = COALESCE("prizes", '[]'::jsonb),
  "previous_winners" = COALESCE("previous_winners", '[]'::jsonb),
  "leaderboard" = COALESCE("leaderboard", '[]'::jsonb),
  "eliminated_contestants" = COALESCE("eliminated_contestants", '[]'::jsonb);
