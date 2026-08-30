DO $$ BEGIN
  CREATE TYPE calendar_participation_status AS ENUM ('interested', 'going');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS calendar_participations (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_key varchar(500) NOT NULL,
  source_provider varchar(20) NOT NULL,
  source_event_id integer REFERENCES gameshow_events(id) ON DELETE CASCADE,
  title varchar(300) NOT NULL,
  starts_at timestamp NOT NULL,
  ends_at timestamp,
  all_day boolean DEFAULT false NOT NULL,
  status calendar_participation_status NOT NULL,
  reminder_enabled boolean DEFAULT true NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL,
  CONSTRAINT calendar_participations_provider_check
    CHECK (source_provider IN ('wtf', 'ttc'))
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_participations_user_event_unique
  ON calendar_participations(user_id, event_key);
CREATE INDEX IF NOT EXISTS calendar_participations_user_start_idx
  ON calendar_participations(user_id, starts_at);
