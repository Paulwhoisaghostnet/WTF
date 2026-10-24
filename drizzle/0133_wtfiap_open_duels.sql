BEGIN;
CREATE TABLE IF NOT EXISTS wtfiap_open_duels (
  room_code text PRIMARY KEY,
  document jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wtfiap_open_duel_identity CHECK (
    document->>'roomCode' = room_code AND document->>'schemaVersion' = '2'
  )
);
COMMIT;
