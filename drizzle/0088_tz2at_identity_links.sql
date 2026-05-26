DO $$ BEGIN
  CREATE TYPE tz2at_identity_chain AS ENUM ('tezos', 'etherlink');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE tz2at_identity_source AS ENUM ('tzbsky_import', 'wtf_signature');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE tz2at_identity_status AS ENUM ('imported', 'verified', 'published', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS tz2at_identity_links (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE cascade,
  atproto_account_id integer REFERENCES atproto_accounts(id) ON DELETE set null,
  did varchar(255) NOT NULL,
  chain tz2at_identity_chain NOT NULL,
  wallet_address text NOT NULL,
  source tz2at_identity_source NOT NULL,
  role varchar(32) NOT NULL DEFAULT 'additional',
  local_wallet_id integer,
  local_etherlink_wallet_id integer,
  imported_uri text,
  imported_cid varchar(255),
  imported_record jsonb NOT NULL DEFAULT '{}'::jsonb,
  proof jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_status tz2at_identity_status NOT NULL DEFAULT 'imported',
  verification_error text,
  tz2at_record_uri text,
  tz2at_record_cid varchar(255),
  relay_status varchar(32),
  relay_error text,
  imported_at timestamp,
  verified_at timestamp,
  published_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tz2at_identity_links_user_did_chain_wallet_unique
  ON tz2at_identity_links(user_id, did, chain, wallet_address);

CREATE INDEX IF NOT EXISTS tz2at_identity_links_user_idx
  ON tz2at_identity_links(user_id);

CREATE INDEX IF NOT EXISTS tz2at_identity_links_did_idx
  ON tz2at_identity_links(did);

CREATE INDEX IF NOT EXISTS tz2at_identity_links_wallet_idx
  ON tz2at_identity_links(wallet_address);
