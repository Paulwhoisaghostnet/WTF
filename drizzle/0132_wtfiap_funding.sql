BEGIN;
CREATE TABLE IF NOT EXISTS wtfiap_funded_rooms (
  room_code text PRIMARY KEY,
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wtfiap_funded_room_identity CHECK (
    document->>'roomCode' = room_code AND document->>'schemaVersion' = '1'
  )
);
COMMIT;
