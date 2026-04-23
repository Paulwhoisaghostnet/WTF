-- ════════════════════════════════════════════════════════════════════════════
-- Phase 4 — Discord bot + attendance
--
-- Adds the `attendance_events` table (authoritative log of voice/stage/
-- in-app attendance signals) and the `discord_scheduled_event_id` column on
-- `gameshow_events` so we can round-trip mirrors to Discord.
--
-- Every statement is idempotent (`CREATE ... IF NOT EXISTS` / `ADD COLUMN IF
-- NOT EXISTS` / guarded enum creation). The matching TypeScript backfill lives
-- in `server/lib/gameshow-boot-backfill.ts` so fresh boots work even without
-- `npm run db:push`.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_source') THEN
    CREATE TYPE attendance_source AS ENUM (
      'discord_voice',
      'discord_stage',
      'x_space',
      'in_app'
    );
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_state') THEN
    CREATE TYPE attendance_state AS ENUM ('join', 'heartbeat', 'leave');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS attendance_events (
  id             serial PRIMARY KEY,
  user_id        integer REFERENCES users(id) ON DELETE CASCADE,
  event_id       integer REFERENCES gameshow_events(id) ON DELETE SET NULL,
  source         attendance_source NOT NULL,
  state          attendance_state NOT NULL,
  discord_user_id  varchar(100),
  discord_guild_id varchar(100),
  discord_channel_id varchar(100),
  external_ref   varchar(200),
  payload_json   jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at    timestamp NOT NULL DEFAULT NOW(),
  created_at     timestamp NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS attendance_events_user_observed_idx
  ON attendance_events (user_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS attendance_events_event_idx
  ON attendance_events (event_id, observed_at);

CREATE INDEX IF NOT EXISTS attendance_events_source_state_idx
  ON attendance_events (source, state, observed_at DESC);

CREATE INDEX IF NOT EXISTS attendance_events_discord_user_idx
  ON attendance_events (discord_user_id, observed_at DESC);

ALTER TABLE gameshow_events
  ADD COLUMN IF NOT EXISTS discord_scheduled_event_id varchar(100);

ALTER TABLE gameshow_events
  ADD COLUMN IF NOT EXISTS discord_guild_id varchar(100);

CREATE INDEX IF NOT EXISTS gameshow_events_discord_sched_idx
  ON gameshow_events (discord_scheduled_event_id)
  WHERE discord_scheduled_event_id IS NOT NULL;
