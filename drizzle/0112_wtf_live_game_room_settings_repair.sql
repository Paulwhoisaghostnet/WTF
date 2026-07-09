BEGIN;

ALTER TABLE wtf_live_room_settings
  DROP CONSTRAINT IF EXISTS wtf_live_room_settings_room_kind_check,
  DROP CONSTRAINT IF EXISTS wtf_live_room_settings_kind_check,
  ADD CONSTRAINT wtf_live_room_settings_kind_check
    CHECK (room_kind IN ('room', 'game', 'stage'));

ALTER TABLE wtf_live_room_invites
  DROP CONSTRAINT IF EXISTS wtf_live_room_invites_room_kind_check,
  DROP CONSTRAINT IF EXISTS wtf_live_room_invites_kind_check,
  ADD CONSTRAINT wtf_live_room_invites_kind_check
    CHECK (room_kind IN ('room', 'game', 'stage'));

ALTER TABLE wtf_live_room_calendar_events
  DROP CONSTRAINT IF EXISTS wtf_live_room_calendar_events_room_kind_check,
  DROP CONSTRAINT IF EXISTS wtf_live_room_calendar_events_kind_check,
  ADD CONSTRAINT wtf_live_room_calendar_events_kind_check
    CHECK (room_kind IN ('room', 'game', 'stage'));

INSERT INTO wtf_live_room_settings (
  owner_user_id,
  room_kind,
  room_id,
  allow_guest_audio,
  allow_guest_camera,
  allow_guest_screen,
  allow_guest_media,
  show_kit_enabled,
  show_kit_id,
  updated_at
)
SELECT
  owner_user_id,
  'game',
  slug,
  true,
  true,
  false,
  false,
  true,
  NULL,
  now()
FROM wtf_live_rooms
WHERE room_kind = 'game'
  AND archived_at IS NULL
ON CONFLICT (room_kind, room_id) DO UPDATE SET
  allow_guest_audio = EXCLUDED.allow_guest_audio,
  allow_guest_camera = EXCLUDED.allow_guest_camera,
  allow_guest_screen = EXCLUDED.allow_guest_screen,
  allow_guest_media = EXCLUDED.allow_guest_media,
  show_kit_enabled = EXCLUDED.show_kit_enabled,
  updated_at = EXCLUDED.updated_at;

COMMIT;
