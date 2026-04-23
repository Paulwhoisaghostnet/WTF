-- ════════════════════════════════════════════════════════════════════════════
-- Phase 5 — X Spaces attendance + CRP nomination verifier
--
-- 1. Extend `auto_verify_type` enum with `x_space_attendance` and
--    `x_hashtag_post`.
-- 2. Add `auto_verify_config` jsonb column to `side_quests` (per-quest
--    parameters such as space url, min minutes, hashtag, mention caps,
--    exclude handles).
-- 3. Add `crp_nominations` table so the worker can dedupe per-post and
--    per-nominator/nominee within a campaign window without re-crediting.
--
-- All statements are idempotent. Matching TypeScript mirrors live in
-- `server/lib/gameshow-boot-backfill.ts`.
-- ════════════════════════════════════════════════════════════════════════════

-- 1. Add new enum values if the type already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'auto_verify_type')
      AND enumlabel = 'x_space_attendance'
  ) THEN
    ALTER TYPE auto_verify_type ADD VALUE 'x_space_attendance';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'auto_verify_type')
      AND enumlabel = 'x_hashtag_post'
  ) THEN
    ALTER TYPE auto_verify_type ADD VALUE 'x_hashtag_post';
  END IF;
END$$;

-- 2. Per-quest parameter bag.
ALTER TABLE side_quests
  ADD COLUMN IF NOT EXISTS auto_verify_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. CRP nomination idempotency table.
CREATE TABLE IF NOT EXISTS crp_nominations (
  id                  serial PRIMARY KEY,
  side_quest_id       integer NOT NULL REFERENCES side_quests(id) ON DELETE CASCADE,
  nominator_user_id   integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nominator_x_id      varchar(100) NOT NULL,
  post_id             varchar(100) NOT NULL,
  post_url            text NOT NULL,
  nominee_handles     jsonb NOT NULL DEFAULT '[]'::jsonb,
  unique_nominee_count integer NOT NULL DEFAULT 0,
  reward_count        integer NOT NULL DEFAULT 0,
  observed_at         timestamp NOT NULL DEFAULT NOW(),
  created_at          timestamp NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS crp_nominations_quest_post_unique_idx
  ON crp_nominations (side_quest_id, post_id);

CREATE INDEX IF NOT EXISTS crp_nominations_nominator_idx
  ON crp_nominations (nominator_user_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS crp_nominations_quest_observed_idx
  ON crp_nominations (side_quest_id, observed_at DESC);
