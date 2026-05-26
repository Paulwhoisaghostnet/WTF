DO $$ BEGIN
  CREATE TYPE wtfos_atproto_identity_status AS ENUM ('offered', 'requested', 'provisioning', 'active', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS wtfos_atproto_identities (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE cascade,
  atproto_account_id integer REFERENCES atproto_accounts(id) ON DELETE set null,
  canonical_did varchar(255) NOT NULL,
  canonical_handle varchar(255),
  wtf_did varchar(255),
  wtf_handle varchar(255),
  wtf_pds_url text,
  status wtfos_atproto_identity_status NOT NULL DEFAULT 'offered',
  linkage_record_uri text,
  linkage_record_cid varchar(255),
  provision_request jsonb NOT NULL DEFAULT '{}'::jsonb,
  provision_error text,
  encrypted_access_token text,
  encrypted_refresh_token text,
  encrypted_repo_password text,
  requested_at timestamp,
  provisioned_at timestamp,
  last_checked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wtfos_atproto_identities_user_canonical_did_unique
  ON wtfos_atproto_identities(user_id, canonical_did);

CREATE INDEX IF NOT EXISTS wtfos_atproto_identities_user_idx
  ON wtfos_atproto_identities(user_id);

CREATE INDEX IF NOT EXISTS wtfos_atproto_identities_canonical_did_idx
  ON wtfos_atproto_identities(canonical_did);

CREATE INDEX IF NOT EXISTS wtfos_atproto_identities_wtf_did_idx
  ON wtfos_atproto_identities(wtf_did);

ALTER TABLE wtfos_atproto_identities
  ADD COLUMN IF NOT EXISTS encrypted_access_token text,
  ADD COLUMN IF NOT EXISTS encrypted_refresh_token text,
  ADD COLUMN IF NOT EXISTS encrypted_repo_password text;
