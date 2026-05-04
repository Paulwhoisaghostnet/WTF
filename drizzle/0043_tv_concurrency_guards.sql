-- 0043_tv_concurrency_guards.sql
--
-- TV write-path integrity guards:
--   1. Collapse any legacy "multiple active playlists in one channel"
--      state down to the lowest-id active playlist so current stream
--      behaviour stays stable.
--   2. Enforce the real invariant at the database layer: at most one
--      active playlist per channel.
--
-- Idempotent: the cleanup UPDATE is safe to re-run, and the partial
-- unique index is created only when absent.

BEGIN;

WITH ranked AS (
  SELECT
    id,
    channel_id,
    row_number() OVER (
      PARTITION BY channel_id
      ORDER BY id ASC
    ) AS rn
  FROM tv_playlists
  WHERE is_active = true
)
UPDATE tv_playlists AS p
   SET is_active = false,
       updated_at = now()
  FROM ranked AS r
 WHERE p.id = r.id
   AND r.rn > 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname = 'tv_playlist_one_active_per_channel_idx'
  ) THEN
    CREATE UNIQUE INDEX tv_playlist_one_active_per_channel_idx
      ON tv_playlists (channel_id)
      WHERE is_active = true;
  END IF;
END $$;

COMMIT;
