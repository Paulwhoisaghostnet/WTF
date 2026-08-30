DO $$ BEGIN
  CREATE TYPE media_mint_network AS ENUM ('mainnet', 'shadownet');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE media_mint_receipt_status AS ENUM ('pending', 'applied');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS media_mint_receipts (
  id serial PRIMARY KEY,
  media_item_id integer NOT NULL REFERENCES user_media_library(id) ON DELETE CASCADE,
  owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  network media_mint_network NOT NULL,
  op_hash varchar(51) NOT NULL,
  minter_wallet varchar(36) NOT NULL,
  contract varchar(36),
  token_id text,
  amount text,
  artifact_uri text,
  status media_mint_receipt_status DEFAULT 'pending' NOT NULL,
  verified_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS media_mint_receipts_media_op_unique
  ON media_mint_receipts(media_item_id, op_hash);
CREATE INDEX IF NOT EXISTS media_mint_receipts_owner_media_idx
  ON media_mint_receipts(owner_user_id, media_item_id, updated_at);
