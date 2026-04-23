-- ════════════════════════════════════════════════════════════════════════════
-- Phase 6 — Console hi-score infrastructure
--
-- 1. `console_games` — registry of in-app games eligible for hi-score tracking.
-- 2. `console_scores` — append-only log of submitted scores (valid + invalid).
-- 3. `console_play_tickets` — short-lived server-signed tickets that bind a
--    user to a single play-session and `run_id` so score submissions cannot
--    be blindly replayed.
-- 4. `auto_verify_type` += `console_hiscore` so round/side-quest verifiers
--    can trigger on a submitted score meeting a game + threshold.
--
-- Matching Drizzle mirrors live in `shared/schema.ts`. Every statement is
-- idempotent — the backfill in `server/lib/gameshow-boot-backfill.ts` runs
-- the same DDL so the schema is present even without `npm run db:push`.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'console_verification_mode') THEN
    CREATE TYPE console_verification_mode AS ENUM (
      'parent_postmessage',
      'server_hmac',
      'manual'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS console_games (
  id                serial PRIMARY KEY,
  slug              varchar(120) NOT NULL UNIQUE,
  title             varchar(200) NOT NULL,
  description       text NOT NULL DEFAULT '',
  category          varchar(80) NOT NULL DEFAULT 'general',
  embed_path        text NOT NULL,
  verification_mode console_verification_mode NOT NULL DEFAULT 'parent_postmessage',
  weird_variant_of  varchar(120),
  hmac_secret       varchar(200),
  created_by        integer REFERENCES users(id) ON DELETE SET NULL,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamp NOT NULL DEFAULT NOW(),
  updated_at        timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS console_games_category_active_idx
  ON console_games (category, active);

CREATE TABLE IF NOT EXISTS console_play_tickets (
  id            serial PRIMARY KEY,
  game_id       integer NOT NULL REFERENCES console_games(id) ON DELETE CASCADE,
  user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  run_id        varchar(80) NOT NULL UNIQUE,
  issued_at     timestamp NOT NULL DEFAULT NOW(),
  expires_at    timestamp NOT NULL,
  used_at       timestamp,
  user_agent    text,
  ip            varchar(64)
);

CREATE INDEX IF NOT EXISTS console_play_tickets_user_idx
  ON console_play_tickets (user_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS console_scores (
  id                   serial PRIMARY KEY,
  game_id              integer NOT NULL REFERENCES console_games(id) ON DELETE CASCADE,
  user_id              integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score                bigint NOT NULL,
  run_id               varchar(80),
  ticket_payload_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid                boolean NOT NULL DEFAULT true,
  reject_reason        text,
  verification_mode    console_verification_mode NOT NULL,
  submitted_at         timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS console_scores_game_score_idx
  ON console_scores (game_id, score DESC)
  WHERE valid;

CREATE INDEX IF NOT EXISTS console_scores_user_idx
  ON console_scores (user_id, submitted_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS console_scores_run_unique_idx
  ON console_scores (run_id)
  WHERE run_id IS NOT NULL;

-- Extend the auto_verify_type enum with console_hiscore.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'auto_verify_type')
      AND enumlabel = 'console_hiscore'
  ) THEN
    ALTER TYPE auto_verify_type ADD VALUE 'console_hiscore';
  END IF;
END$$;
