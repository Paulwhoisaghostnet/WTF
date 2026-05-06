ALTER TABLE "tv_bumpers" ADD COLUMN IF NOT EXISTS "media_item_id" integer;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tv_bumpers_media_item_id_user_media_library_id_fk'
  ) THEN
    ALTER TABLE "tv_bumpers"
      ADD CONSTRAINT "tv_bumpers_media_item_id_user_media_library_id_fk"
      FOREIGN KEY ("media_item_id")
      REFERENCES "user_media_library"("id")
      ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tv_bumper_media_item_idx" ON "tv_bumpers" USING btree ("media_item_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tv_bumper_owner_media_category_unique_idx"
  ON "tv_bumpers" USING btree ("owner_user_id","media_item_id","category")
  WHERE "media_item_id" IS NOT NULL;
