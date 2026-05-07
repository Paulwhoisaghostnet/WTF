ALTER TABLE in_app_market_items
  ADD COLUMN IF NOT EXISTS stock_quantity integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS x_tezos_identity_hints (
  id serial PRIMARY KEY,
  twitter_handle varchar(32) NOT NULL,
  tezos_address varchar(36) NOT NULL,
  alias text,
  tz_domain text,
  source varchar(64) NOT NULL,
  confidence varchar(32) NOT NULL DEFAULT 'profile_link',
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamp NOT NULL DEFAULT now(),
  last_checked_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS x_tezos_identity_hint_unique_idx
  ON x_tezos_identity_hints (twitter_handle, tezos_address, source);
CREATE INDEX IF NOT EXISTS x_tezos_identity_hint_handle_idx
  ON x_tezos_identity_hints (twitter_handle);
CREATE INDEX IF NOT EXISTS x_tezos_identity_hint_address_idx
  ON x_tezos_identity_hints (tezos_address);

CREATE TABLE IF NOT EXISTS token_archive_jobs (
  id serial PRIMARY KEY,
  requester_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  token_contract varchar(36) NOT NULL,
  token_id text NOT NULL,
  cid_path text NOT NULL,
  source_uri text NOT NULL,
  archive_url text NOT NULL,
  wayback_job_id text,
  wayback_url text,
  status varchar(24) NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  submitted_at timestamp,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS token_archive_jobs_token_cid_idx
  ON token_archive_jobs (token_contract, token_id, cid_path);
CREATE INDEX IF NOT EXISTS token_archive_jobs_status_created_idx
  ON token_archive_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS token_archive_jobs_requester_created_idx
  ON token_archive_jobs (requester_user_id, created_at);

INSERT INTO in_app_market_items
  (sku, name, description, category, price_wtf_units, price_exp, contract_listing_id, active, stock_quantity, metadata, sort_order)
VALUES
  (
    'artifact-archiver-pass',
    'Artifact Archiver Pass',
    'Queue owned Tezos token artifacts for preservation through the WTF archive worker.',
    'preservation',
    25000000000,
    2500,
    NULL,
    true,
    25,
    '{"kind":"archive-pass","tool":"wayback-ipfs","stockPolicy":"limited","opens":"/my-gallery","entitlement":"token-archive"}'::jsonb,
    10
  )
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  price_wtf_units = EXCLUDED.price_wtf_units,
  price_exp = EXCLUDED.price_exp,
  contract_listing_id = EXCLUDED.contract_listing_id,
  active = EXCLUDED.active,
  stock_quantity = EXCLUDED.stock_quantity,
  metadata = EXCLUDED.metadata,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();
