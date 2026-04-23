-- 0023_gameshow_core.sql
--
-- Phase 2 gameshow core:
--   1. season_contestants            — contestant roster per season with
--                                      active/reserve/eliminated/withdrew
--                                      status, rank at lock, elimination
--                                      metadata, notes.
--   2. round_teams / round_team_members
--                                    — per-round team shape with the
--                                      `formed_via` audit column so we
--                                      can prove how teams were built.
--   3. round_elimination_rules       — declarative rule per round; the
--                                      operator clicks "Run rule" to
--                                      produce draft eliminations.
--   4. round_eliminations            — single source of truth for who
--                                      is out.  Rows produced by rule
--                                      are marked `was_drafted_by_rule`
--                                      and must be confirmed by the
--                                      operator before round advance.
--   5. operator_actions              — append-only audit log for every
--                                      Control Board action (lock,
--                                      eliminate, advance, override,
--                                      promote).  Drives the feed tab.
--
-- Plan reference: Phase 2 in wtf_gameshow_phase_plan_0a02000a.
-- The plan calls this file 0026_gameshow_core.sql; actual drizzle
-- numbering uses the next contiguous slot (0023).  Behavior is
-- identical to the plan specification.
--
-- Idempotent: every DDL statement is guarded by IF NOT EXISTS / DO
-- blocks that check information_schema first.  Safe to re-run.

BEGIN;

-- 1) season_contestants ----------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'contestant_status'
  ) THEN
    CREATE TYPE contestant_status AS ENUM (
      'active',
      'reserve',
      'eliminated',
      'withdrew',
      'non_participant'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS season_contestants (
  id                  serial PRIMARY KEY,
  season_id           integer NOT NULL REFERENCES seasons (id) ON DELETE CASCADE,
  user_id             integer NOT NULL REFERENCES users    (id) ON DELETE CASCADE,
  status              contestant_status NOT NULL DEFAULT 'active',
  rank_at_lock        integer,
  team_id_history     jsonb NOT NULL DEFAULT '[]'::jsonb,
  eliminated_at       timestamp,
  eliminated_round_id integer REFERENCES rounds (id) ON DELETE SET NULL,
  elimination_reason  text,
  withdrew_at         timestamp,
  notes               text,
  created_at          timestamp NOT NULL DEFAULT NOW(),
  updated_at          timestamp NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'season_contestants_season_user_unique_idx'
  ) THEN
    CREATE UNIQUE INDEX season_contestants_season_user_unique_idx
      ON season_contestants (season_id, user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'season_contestants_season_status_idx'
  ) THEN
    CREATE INDEX season_contestants_season_status_idx
      ON season_contestants (season_id, status);
  END IF;
END $$;

-- 2) round_teams + round_team_members --------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'round_team_formed_via'
  ) THEN
    CREATE TYPE round_team_formed_via AS ENUM (
      'manual_assign',
      'captain_draft',
      'by_wtf_standing',
      'by_last_round_rank',
      'random'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS round_teams (
  id               serial PRIMARY KEY,
  round_id         integer NOT NULL REFERENCES rounds (id) ON DELETE CASCADE,
  name             varchar(200) NOT NULL,
  captain_user_id  integer REFERENCES users (id) ON DELETE SET NULL,
  formed_via       round_team_formed_via NOT NULL DEFAULT 'manual_assign',
  created_at       timestamp NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'round_teams_round_idx'
  ) THEN
    CREATE INDEX round_teams_round_idx ON round_teams (round_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS round_team_members (
  team_id   integer NOT NULL REFERENCES round_teams (id) ON DELETE CASCADE,
  user_id   integer NOT NULL REFERENCES users       (id) ON DELETE CASCADE,
  PRIMARY KEY (team_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'round_team_members_user_idx'
  ) THEN
    CREATE INDEX round_team_members_user_idx
      ON round_team_members (user_id);
  END IF;
END $$;

-- 3) round_elimination_rules ----------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'round_elimination_rule_kind'
  ) THEN
    CREATE TYPE round_elimination_rule_kind AS ENUM (
      'bottom_n_by_wtf',
      'top_n_survive',
      'did_not_hold_token',
      'submission_rank',
      'team_rank',
      'manual'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS round_elimination_rules (
  round_id    integer PRIMARY KEY REFERENCES rounds (id) ON DELETE CASCADE,
  kind        round_elimination_rule_kind NOT NULL,
  params_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamp NOT NULL DEFAULT NOW(),
  updated_at  timestamp NOT NULL DEFAULT NOW()
);

-- 4) round_eliminations ---------------------------------------------------

CREATE TABLE IF NOT EXISTS round_eliminations (
  id                    serial PRIMARY KEY,
  round_id              integer NOT NULL REFERENCES rounds (id) ON DELETE CASCADE,
  user_id               integer NOT NULL REFERENCES users  (id) ON DELETE CASCADE,
  decided_by            integer REFERENCES users (id) ON DELETE SET NULL,
  decided_at            timestamp,
  reason                text,
  was_drafted_by_rule   boolean NOT NULL DEFAULT false,
  draft_rule_kind       round_elimination_rule_kind,
  override_reason       text,
  created_at            timestamp NOT NULL DEFAULT NOW(),
  updated_at            timestamp NOT NULL DEFAULT NOW()
);

-- A user can appear at most once per round.  Draft rows inserted by
-- `Run rule` are simply upserted with was_drafted_by_rule = true.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'round_eliminations_round_user_unique_idx'
  ) THEN
    CREATE UNIQUE INDEX round_eliminations_round_user_unique_idx
      ON round_eliminations (round_id, user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'round_eliminations_round_idx'
  ) THEN
    CREATE INDEX round_eliminations_round_idx
      ON round_eliminations (round_id);
  END IF;
END $$;

-- 5) operator_actions -----------------------------------------------------
--
-- Append-only audit log for Control Board actions.  Never updated.
-- ON DELETE SET NULL for actor and target so we preserve the audit
-- even if the acting user is removed or the target disappears.

CREATE TABLE IF NOT EXISTS operator_actions (
  id              serial PRIMARY KEY,
  actor_user_id   integer REFERENCES users (id) ON DELETE SET NULL,
  action_kind     varchar(80) NOT NULL,
  target_kind     varchar(40) NOT NULL,
  target_id       integer,
  payload_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamp NOT NULL DEFAULT NOW(),
  ip              varchar(64)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'operator_actions_actor_created_idx'
  ) THEN
    CREATE INDEX operator_actions_actor_created_idx
      ON operator_actions (actor_user_id, created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'operator_actions_target_idx'
  ) THEN
    CREATE INDEX operator_actions_target_idx
      ON operator_actions (target_kind, target_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'operator_actions_created_idx'
  ) THEN
    CREATE INDEX operator_actions_created_idx
      ON operator_actions (created_at DESC);
  END IF;
END $$;

COMMIT;
