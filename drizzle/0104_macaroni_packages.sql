DO $$ BEGIN
  CREATE TYPE macaroni_package_status AS ENUM ('draft', 'finalized', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE macaroni_package_item_status AS ENUM ('uploaded', 'ready', 'needs_metadata', 'failed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS macaroni_packages (
  id serial PRIMARY KEY,
  owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE cascade,
  title varchar(200) NOT NULL,
  description text NOT NULL DEFAULT '',
  schema_version varchar(80) NOT NULL DEFAULT 'wtfos.macaroni-package.v1',
  status macaroni_package_status NOT NULL DEFAULT 'draft',
  item_count integer NOT NULL DEFAULT 0,
  total_bytes bigint NOT NULL DEFAULT 0,
  average_bytes bigint NOT NULL DEFAULT 0,
  csv_text text,
  csv_cid varchar(255),
  csv_job_id integer REFERENCES ipfs_pinning_jobs(id) ON DELETE set null,
  manifest_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  manifest_cid varchar(255),
  manifest_job_id integer REFERENCES ipfs_pinning_jobs(id) ON DELETE set null,
  drop_config jsonb NOT NULL DEFAULT '{"exportTarget":"macaroni","layout":"single-page","theme":"gallery-white","headline":"Untitled drop","intro":"A wtfOS-staged collection package.","callToAction":"View collection","modules":{"dropStory":true,"mintPanel":true,"tokenGrid":true,"recentMints":false,"mintGallery":true,"leaderboard":false,"collectionCompletion":false}}'::jsonb,
  finalized_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE macaroni_packages
  ADD COLUMN IF NOT EXISTS drop_config jsonb NOT NULL DEFAULT '{"exportTarget":"macaroni","layout":"single-page","theme":"gallery-white","headline":"Untitled drop","intro":"A wtfOS-staged collection package.","callToAction":"View collection","modules":{"dropStory":true,"mintPanel":true,"tokenGrid":true,"recentMints":false,"mintGallery":true,"leaderboard":false,"collectionCompletion":false}}'::jsonb;

CREATE INDEX IF NOT EXISTS macaroni_packages_owner_status_idx
  ON macaroni_packages(owner_user_id, status);
CREATE INDEX IF NOT EXISTS macaroni_packages_owner_updated_idx
  ON macaroni_packages(owner_user_id, updated_at);

CREATE TABLE IF NOT EXISTS macaroni_package_items (
  id serial PRIMARY KEY,
  package_id integer NOT NULL REFERENCES macaroni_packages(id) ON DELETE cascade,
  token_id integer NOT NULL,
  original_filename varchar(512) NOT NULL,
  original_title varchar(300) NOT NULL,
  normalized_filename varchar(120) NOT NULL,
  token_name varchar(300) NOT NULL,
  token_description text NOT NULL DEFAULT '',
  mime_type varchar(255) NOT NULL,
  size_bytes bigint NOT NULL,
  checksum_sha256 varchar(64) NOT NULL,
  media_cid varchar(255) NOT NULL,
  media_job_id integer REFERENCES ipfs_pinning_jobs(id) ON DELETE set null,
  metadata_cid varchar(255),
  metadata_job_id integer REFERENCES ipfs_pinning_jobs(id) ON DELETE set null,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  attributes jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  readiness jsonb NOT NULL DEFAULT '{"hasMedia":false,"hasMetadata":false,"hasName":false,"readyForMint":false,"warnings":[]}'::jsonb,
  status macaroni_package_item_status NOT NULL DEFAULT 'uploaded',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS macaroni_package_items_token_unique_idx
  ON macaroni_package_items(package_id, token_id);
CREATE INDEX IF NOT EXISTS macaroni_package_items_package_idx
  ON macaroni_package_items(package_id);
CREATE INDEX IF NOT EXISTS macaroni_package_items_media_cid_idx
  ON macaroni_package_items(media_cid);
