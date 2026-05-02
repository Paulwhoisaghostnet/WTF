ALTER TABLE "seasons"
  ADD COLUMN IF NOT EXISTS "media_assets" jsonb DEFAULT '{}'::jsonb NOT NULL;

ALTER TABLE "rounds"
  ALTER COLUMN "season_id" DROP NOT NULL;

ALTER TABLE "rounds"
  DROP CONSTRAINT IF EXISTS "rounds_season_id_seasons_id_fk";

ALTER TABLE "rounds"
  ADD CONSTRAINT "rounds_season_id_seasons_id_fk"
  FOREIGN KEY ("season_id")
  REFERENCES "public"."seasons"("id")
  ON DELETE SET NULL
  ON UPDATE NO ACTION;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'rounds_season_number_unique_idx'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM "rounds"
      WHERE "season_id" IS NOT NULL
      GROUP BY "season_id", "number"
      HAVING count(*) > 1
    ) THEN
      RAISE NOTICE 'Skipping rounds_season_number_unique_idx because duplicate assigned round numbers exist';
    ELSE
      CREATE UNIQUE INDEX "rounds_season_number_unique_idx"
        ON "rounds" ("season_id", "number")
        WHERE "season_id" IS NOT NULL;
    END IF;
  END IF;
END $$;
