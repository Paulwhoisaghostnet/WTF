-- 0022_tv_hardening.sql
--
-- WTF TV hardening:
--   1. tv_channels.dial_number  — stable "tuner" number shown to viewers.
--                                 Unique across the platform.  Legacy rows
--                                 get a dial assigned by the boot backfill
--                                 (not this migration) so the pinning rules
--                                 (opeculiar→1, yoeshi→2, WTF TV→3, admin→69)
--                                 can query the data at runtime.
--   2. tv_channels.videos_per_bumper
--                               — per-channel bumper cadence.  0 disables
--                                 bumpers.  Default 4 = "one interstitial
--                                 every ~4 playlist items" (broadcast-TV
--                                 commercial pacing).
--   3. tv_channel_videos.media_item_id
--                               — FK back to user_media_library so a
--                                 deletion in the library cascades through
--                                 the channel pool (which in turn cascades
--                                 through playlist items).  This is the
--                                 fix for "shells of videos" left behind
--                                 when a user removes something from My
--                                 Videos.
--   4. Supporting indexes + partial unique on (channel_id, media_item_id).
--
-- Idempotent: every ALTER uses IF NOT EXISTS / DO blocks that check
-- information_schema first, so re-running on a fully-migrated database
-- is a no-op.

BEGIN;

-- 1) tv_channels.dial_number
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'tv_channels'
       AND column_name = 'dial_number'
  ) THEN
    ALTER TABLE tv_channels
      ADD COLUMN dial_number integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'tv_channel_dial_number_unique_idx'
  ) THEN
    CREATE UNIQUE INDEX tv_channel_dial_number_unique_idx
      ON tv_channels (dial_number)
      WHERE dial_number IS NOT NULL;
  END IF;
END $$;

-- 2) tv_channels.videos_per_bumper
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'tv_channels'
       AND column_name = 'videos_per_bumper'
  ) THEN
    ALTER TABLE tv_channels
      ADD COLUMN videos_per_bumper integer NOT NULL DEFAULT 4;
  END IF;
END $$;

-- Clamp any out-of-range values a previous (manual) edit may have left
-- behind.  0 disables bumpers entirely; 20 is the documented upper
-- bound so a channel can't starve its own bumpers.
UPDATE tv_channels
   SET videos_per_bumper = LEAST(20, GREATEST(0, videos_per_bumper))
 WHERE videos_per_bumper < 0
    OR videos_per_bumper > 20;

-- 3) tv_channel_videos.media_item_id (+ ON DELETE CASCADE FK)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'tv_channel_videos'
       AND column_name = 'media_item_id'
  ) THEN
    ALTER TABLE tv_channel_videos
      ADD COLUMN media_item_id integer;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_name = 'tv_channel_videos'
       AND constraint_name = 'tv_channel_videos_media_item_id_fkey'
  ) THEN
    ALTER TABLE tv_channel_videos
      ADD CONSTRAINT tv_channel_videos_media_item_id_fkey
      FOREIGN KEY (media_item_id)
      REFERENCES user_media_library (id)
      ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'tv_channel_videos_media_item_idx'
  ) THEN
    CREATE INDEX tv_channel_videos_media_item_idx
      ON tv_channel_videos (media_item_id);
  END IF;
END $$;

-- Partial unique: a given media_item_id may appear at most once per
-- channel.  This prevents accidental double-imports when a user clicks
-- "Add to channel" twice from the MyVideos UI.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'tv_channel_videos_channel_media_unique_idx'
  ) THEN
    CREATE UNIQUE INDEX tv_channel_videos_channel_media_unique_idx
      ON tv_channel_videos (channel_id, media_item_id)
      WHERE media_item_id IS NOT NULL;
  END IF;
END $$;

-- 4) Defensive: prune any playlist items that point at a channel-video
-- whose underlying media_item was deleted *before* the FK was added.
-- FK cascade will handle this going forward; this sweep covers the
-- pre-migration backlog.  Wrapped in a CTE so the optimiser can skip
-- it when there's nothing to do.
WITH orphans AS (
  SELECT pi.id
    FROM tv_playlist_items pi
    JOIN tv_channel_videos cv ON cv.id = pi.video_id
    LEFT JOIN user_media_library uml ON uml.id = cv.media_item_id
   WHERE cv.media_item_id IS NOT NULL
     AND uml.id IS NULL
)
DELETE FROM tv_playlist_items pi
 USING orphans o
 WHERE pi.id = o.id;

COMMIT;
