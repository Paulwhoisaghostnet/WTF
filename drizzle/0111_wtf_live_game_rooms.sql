BEGIN;

ALTER TABLE wtf_live_rooms
  ADD COLUMN IF NOT EXISTS room_kind varchar(24) NOT NULL DEFAULT 'room';

UPDATE wtf_live_rooms
SET room_kind = 'room'
WHERE room_kind IS NULL OR room_kind = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wtf_live_rooms_kind_check'
  ) THEN
    ALTER TABLE wtf_live_rooms
      DROP CONSTRAINT wtf_live_rooms_kind_check;
  END IF;

  ALTER TABLE wtf_live_rooms
    ADD CONSTRAINT wtf_live_rooms_kind_check
    CHECK (room_kind IN ('room', 'game'));
END $$;

CREATE INDEX IF NOT EXISTS wtf_live_rooms_kind_idx
  ON wtf_live_rooms(room_kind);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wtf_live_room_settings_kind_check'
  ) THEN
    ALTER TABLE wtf_live_room_settings
      DROP CONSTRAINT wtf_live_room_settings_kind_check;
  END IF;

  ALTER TABLE wtf_live_room_settings
    ADD CONSTRAINT wtf_live_room_settings_kind_check
    CHECK (room_kind IN ('room', 'game', 'stage'));
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wtf_live_room_invites_kind_check'
  ) THEN
    ALTER TABLE wtf_live_room_invites
      DROP CONSTRAINT wtf_live_room_invites_kind_check;
  END IF;

  ALTER TABLE wtf_live_room_invites
    ADD CONSTRAINT wtf_live_room_invites_kind_check
    CHECK (room_kind IN ('room', 'game', 'stage'));
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wtf_live_room_calendar_events_kind_check'
  ) THEN
    ALTER TABLE wtf_live_room_calendar_events
      DROP CONSTRAINT wtf_live_room_calendar_events_kind_check;
  END IF;

  ALTER TABLE wtf_live_room_calendar_events
    ADD CONSTRAINT wtf_live_room_calendar_events_kind_check
    CHECK (room_kind IN ('room', 'game', 'stage'));
END $$;

COMMIT;
