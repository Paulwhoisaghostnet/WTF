DO $$ BEGIN
  CREATE TYPE macaroni_reveal_network AS ENUM ('mainnet', 'shadownet');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE macaroni_reveal_mode AS ENUM ('instant', 'delayed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE macaroni_reveal_status AS ENUM ('active', 'completed', 'paused');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS macaroni_reveal_jobs (
  id serial PRIMARY KEY,
  owner_user_id integer REFERENCES users(id) ON DELETE CASCADE,
  network macaroni_reveal_network NOT NULL,
  contract varchar(36) NOT NULL,
  administrator varchar(36) NOT NULL,
  reveal_operator varchar(36) NOT NULL,
  mode macaroni_reveal_mode NOT NULL,
  reveal_delay_seconds integer DEFAULT 0 NOT NULL,
  encrypted_manifest text NOT NULL,
  status macaroni_reveal_status DEFAULT 'active' NOT NULL,
  next_attempt_at timestamp DEFAULT now() NOT NULL,
  last_operation_hash varchar(51),
  last_error text,
  completed_at timestamp,
  created_at timestamp DEFAULT now() NOT NULL,
  updated_at timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS macaroni_reveal_jobs_network_contract_unique_idx
  ON macaroni_reveal_jobs(network, contract);
CREATE INDEX IF NOT EXISTS macaroni_reveal_jobs_due_idx
  ON macaroni_reveal_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS macaroni_reveal_jobs_owner_idx
  ON macaroni_reveal_jobs(owner_user_id, updated_at);
