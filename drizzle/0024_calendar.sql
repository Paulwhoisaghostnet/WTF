-- 0024_calendar.sql
--
-- Phase 3 gameshow calendar + ticket queue:
--   1. gameshow_events  — canonical calendar feed.  Rows may be
--                         auto-materialized from rounds / challenges /
--                         side_quests, mirrored from X Spaces and
--                         Discord stages, or hand-submitted via the
--                         ticket queue below.
--   2. calendar_tickets — contestant-submitted event requests pending
--                         cohost+ review.  Approval publishes a row
--                         into gameshow_events.
--
-- Plan reference: Phase 3 in wtf_gameshow_phase_plan_0a02000a.
-- Idempotent: guarded CREATE TYPE / CREATE TABLE IF NOT EXISTS /
-- DO blocks.  Safe to re-run.

BEGIN;

-- 1) gameshow_events ------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'gameshow_event_kind'
  ) THEN
    CREATE TYPE gameshow_event_kind AS ENUM (
      'round_window',
      'challenge_window',
      'side_quest_window',
      'x_space',
      'discord_stage',
      'custom'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'gameshow_event_visibility'
  ) THEN
    CREATE TYPE gameshow_event_visibility AS ENUM (
      'public',
      'contestants',
      'hosts'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'gameshow_event_status'
  ) THEN
    CREATE TYPE gameshow_event_status AS ENUM (
      'draft',
      'published',
      'cancelled'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS gameshow_events (
  id             serial PRIMARY KEY,
  kind           gameshow_event_kind NOT NULL,
  title          varchar(300) NOT NULL,
  description    text,
  starts_at      timestamp NOT NULL,
  ends_at        timestamp,
  all_day        boolean NOT NULL DEFAULT false,
  source_kind    varchar(40) NOT NULL DEFAULT 'manual',
  source_id      integer,
  visibility     gameshow_event_visibility NOT NULL DEFAULT 'public',
  status         gameshow_event_status NOT NULL DEFAULT 'draft',
  links_json     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by     integer REFERENCES users (id) ON DELETE SET NULL,
  approved_by    integer REFERENCES users (id) ON DELETE SET NULL,
  approved_at    timestamp,
  created_at     timestamp NOT NULL DEFAULT NOW(),
  updated_at     timestamp NOT NULL DEFAULT NOW()
);

-- Source uniqueness: a round / challenge / side-quest materializes at
-- most one row per (source_kind, source_id).  Manual events have
-- source_id NULL and are not constrained.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'gameshow_events_source_unique_idx'
  ) THEN
    CREATE UNIQUE INDEX gameshow_events_source_unique_idx
      ON gameshow_events (source_kind, source_id)
      WHERE source_id IS NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'gameshow_events_starts_at_idx'
  ) THEN
    CREATE INDEX gameshow_events_starts_at_idx
      ON gameshow_events (starts_at);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'gameshow_events_status_starts_at_idx'
  ) THEN
    CREATE INDEX gameshow_events_status_starts_at_idx
      ON gameshow_events (status, starts_at);
  END IF;
END $$;

-- 2) calendar_tickets -----------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'calendar_ticket_status'
  ) THEN
    CREATE TYPE calendar_ticket_status AS ENUM (
      'submitted',
      'under_review',
      'changes_requested',
      'approved',
      'rejected',
      'cancelled'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS calendar_tickets (
  id                 serial PRIMARY KEY,
  submitter_user_id  integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  payload_json       jsonb NOT NULL,
  status             calendar_ticket_status NOT NULL DEFAULT 'submitted',
  reviewer_user_id   integer REFERENCES users (id) ON DELETE SET NULL,
  review_reason      text,
  decided_at         timestamp,
  published_event_id integer REFERENCES gameshow_events (id) ON DELETE SET NULL,
  created_at         timestamp NOT NULL DEFAULT NOW(),
  updated_at         timestamp NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'calendar_tickets_status_created_idx'
  ) THEN
    CREATE INDEX calendar_tickets_status_created_idx
      ON calendar_tickets (status, created_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = current_schema()
       AND indexname  = 'calendar_tickets_submitter_idx'
  ) THEN
    CREATE INDEX calendar_tickets_submitter_idx
      ON calendar_tickets (submitter_user_id, created_at DESC);
  END IF;
END $$;

COMMIT;
