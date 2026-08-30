DO $$ BEGIN
  CREATE TYPE dm_message_report_status AS ENUM ('open', 'reviewed', 'dismissed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS dm_message_reports (
  id serial PRIMARY KEY,
  message_id integer NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
  reporter_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status dm_message_report_status DEFAULT 'open' NOT NULL,
  reviewer_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  review_note text,
  reviewed_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS dm_message_reports_reporter_message_unique
  ON dm_message_reports(reporter_user_id, message_id);
CREATE INDEX IF NOT EXISTS dm_message_reports_status_created_idx
  ON dm_message_reports(status, created_at);

-- DM messages use database-generated timestamps. Clamp legacy read markers that
-- were serialized from application Dates into timestamp-without-time-zone
-- columns and therefore landed ahead of the database clock.
UPDATE dm_conversation_participants
SET last_read_at = CURRENT_TIMESTAMP
WHERE last_read_at > CURRENT_TIMESTAMP;
