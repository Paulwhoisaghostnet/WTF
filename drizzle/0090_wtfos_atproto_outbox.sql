DO $$ BEGIN
  CREATE TYPE wtfos_atproto_outbox_status AS ENUM ('queued', 'published', 'failed', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE wtfos_atproto_outbox_target AS ENUM ('primary_wtfos_repo', 'user_wtfos_repo');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS wtfos_atproto_outbox (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE cascade,
  wtfos_identity_id integer REFERENCES wtfos_atproto_identities(id) ON DELETE set null,
  target_type wtfos_atproto_outbox_target NOT NULL,
  target_did varchar(255),
  target_handle varchar(255),
  target_pds_url text,
  collection varchar(255) NOT NULL,
  rkey varchar(255),
  record jsonb NOT NULL,
  source_event_type varchar(128),
  source_ref_type varchar(64),
  source_ref_id text,
  status wtfos_atproto_outbox_status NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  record_uri text,
  record_cid varchar(255),
  scheduled_at timestamp NOT NULL DEFAULT now(),
  published_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wtfos_atproto_outbox_user_status_idx
  ON wtfos_atproto_outbox(user_id, status);

CREATE INDEX IF NOT EXISTS wtfos_atproto_outbox_status_scheduled_idx
  ON wtfos_atproto_outbox(status, scheduled_at);

CREATE INDEX IF NOT EXISTS wtfos_atproto_outbox_target_status_idx
  ON wtfos_atproto_outbox(target_type, status);

CREATE INDEX IF NOT EXISTS wtfos_atproto_outbox_target_did_idx
  ON wtfos_atproto_outbox(target_did);

CREATE INDEX IF NOT EXISTS wtfos_atproto_outbox_identity_status_idx
  ON wtfos_atproto_outbox(wtfos_identity_id, status);

CREATE INDEX IF NOT EXISTS wtfos_atproto_outbox_source_idx
  ON wtfos_atproto_outbox(source_event_type, source_ref_id);
