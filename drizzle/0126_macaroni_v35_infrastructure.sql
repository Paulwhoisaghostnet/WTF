DO $$ BEGIN
  CREATE TYPE macaroni_v35_provider AS ENUM ('wtfos_managed', 'creator_companion');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE macaroni_v35_asset_strategy AS ENUM ('public_prepin_private_manifest', 'pin_on_claim');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE macaroni_v35_fulfillment_trigger AS ENUM ('immediate', 'rolling_delay', 'absolute_time', 'sellout');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE macaroni_v35_drop_status AS ENUM ('setup_required', 'ready', 'active', 'paused', 'closed', 'blocked', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE macaroni_v35_private_asset_kind AS ENUM ('artifact', 'display', 'thumbnail', 'metadata');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE macaroni_v35_private_asset_status AS ENUM ('staged', 'pinned_private', 'allocated', 'published', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE macaroni_v35_work_type AS ENUM ('scan_claims', 'arm_fulfillment', 'simulate_allocation', 'settle_claim', 'publish_artifact_car', 'publish_metadata_car', 'verify_nft_ready', 'sweep_funds');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE macaroni_v35_claim_state AS ENUM ('secured', 'allocation_simulated', 'settling', 'artwork_secured', 'publishing_ipfs', 'nft_ready', 'needs_reconciliation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE macaroni_v35_work_state AS ENUM ('queued', 'leased', 'prepared', 'submitted', 'applied', 'retry_wait', 'manual_review', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE macaroni_v35_setup_status AS ENUM ('pending', 'in_progress', 'submitted', 'complete', 'failed', 'blocked');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE macaroni_v35_operation_state AS ENUM ('ready', 'awaiting_signature', 'wallet_prompt_started', 'wallet_rejected', 'submitted', 'confirming', 'applied', 'failed', 'needs_reconciliation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE macaroni_v35_funding_account AS ENUM ('contract_reserve', 'operator_gas', 'sales_proceeds');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE macaroni_v35_funding_direction AS ENUM ('credit', 'debit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE macaroni_v35_funding_kind AS ENUM ('initial_reserve', 'sale_subsidy', 'finalizer_reimbursement', 'automatic_final_sweep', 'operator_gas_funding', 'adjustment');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS macaroni_v35_drops (
  id serial PRIMARY KEY,
  owner_user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_setup_id varchar(100) NOT NULL,
  registration_digest varchar(64) NOT NULL,
  network macaroni_reveal_network NOT NULL,
  contract varchar(36),
  administrator varchar(36) NOT NULL,
  administrator_public_key varchar(128) NOT NULL,
  provider macaroni_v35_provider NOT NULL,
  asset_strategy macaroni_v35_asset_strategy NOT NULL,
  fulfillment_trigger macaroni_v35_fulfillment_trigger NOT NULL,
  claim_delay_seconds integer DEFAULT 0 NOT NULL CHECK (claim_delay_seconds >= 0),
  claim_interval_seconds integer DEFAULT 0 NOT NULL CHECK (claim_interval_seconds >= 0),
  fulfillment_scheduled_at timestamptz,
  sales_proceeds_address varchar(36) NOT NULL,
  operator_address varchar(36),
  operator_wallet_ref text,
  abi_version varchar(120),
  abi_validated_at timestamptz,
  service_ready boolean DEFAULT false NOT NULL,
  status macaroni_v35_drop_status DEFAULT 'setup_required' NOT NULL,
  public_status jsonb DEFAULT '{"state":"setup_required","message":"Creator setup is incomplete.","fulfilledClaims":0,"pendingClaims":0}'::jsonb NOT NULL,
  physical_supply integer CHECK (physical_supply > 0),
  supply_fixed_at timestamptz,
  encrypted_entropy_manifest_ref text,
  encrypted_entropy_recovery_ref text,
  entropy_head varchar(64),
  entropy_chain_length integer CHECK (entropy_chain_length > 0),
  entropy_key_version varchar(80),
  entropy_recovery_key_version varchar(80),
  entropy_recovery_version varchar(80),
  entropy_generated_at timestamptz,
  reserve_estimate_version varchar(80),
  fulfillment_subsidy_mutez bigint DEFAULT 0 NOT NULL CHECK (fulfillment_subsidy_mutez >= 0),
  contract_reserve_required_mutez bigint DEFAULT 0 NOT NULL CHECK (contract_reserve_required_mutez >= 0),
  contract_reserve_observed_mutez bigint DEFAULT 0 NOT NULL CHECK (contract_reserve_observed_mutez >= 0),
  operator_gas_observed_mutez bigint DEFAULT 0 NOT NULL CHECK (operator_gas_observed_mutez >= 0),
  operator_gas_ready boolean DEFAULT false NOT NULL,
  indexed_purchase_claims integer DEFAULT 0 NOT NULL CHECK (indexed_purchase_claims >= 0),
  last_scanned_purchase_event_id bigint DEFAULT 0 NOT NULL CHECK (last_scanned_purchase_event_id >= 0),
  sale_permanently_closed_at timestamptz,
  final_fulfillment_at timestamptz,
  final_sweep_operation_hash varchar(51),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT macaroni_v35_drops_schedule_check CHECK (
    fulfillment_trigger <> 'absolute_time' OR fulfillment_scheduled_at IS NOT NULL
  ),
  CONSTRAINT macaroni_v35_drops_ready_check CHECK (
    NOT service_ready OR (contract IS NOT NULL AND abi_version IS NOT NULL AND abi_validated_at IS NOT NULL AND operator_address IS NOT NULL)
  ),
  CONSTRAINT macaroni_v35_drops_final_sweep_check CHECK (
    final_sweep_operation_hash IS NULL OR final_fulfillment_at IS NOT NULL
  ),
  CONSTRAINT macaroni_v35_drops_entropy_complete_check CHECK (
    (encrypted_entropy_manifest_ref IS NULL AND encrypted_entropy_recovery_ref IS NULL AND entropy_head IS NULL AND entropy_chain_length IS NULL AND entropy_key_version IS NULL AND entropy_recovery_key_version IS NULL AND entropy_recovery_version IS NULL AND entropy_generated_at IS NULL)
    OR
    (encrypted_entropy_manifest_ref IS NOT NULL AND encrypted_entropy_recovery_ref IS NOT NULL AND entropy_head IS NOT NULL AND entropy_chain_length IS NOT NULL AND entropy_key_version IS NOT NULL AND entropy_recovery_key_version IS NOT NULL AND entropy_recovery_version IS NOT NULL AND entropy_generated_at IS NOT NULL AND physical_supply IS NOT NULL AND supply_fixed_at IS NOT NULL AND entropy_chain_length = physical_supply AND entropy_generated_at >= supply_fixed_at)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS macaroni_v35_drops_network_contract_unique_idx ON macaroni_v35_drops(network, contract);
CREATE UNIQUE INDEX IF NOT EXISTS macaroni_v35_drops_owner_setup_unique_idx ON macaroni_v35_drops(owner_user_id, client_setup_id);
CREATE INDEX IF NOT EXISTS macaroni_v35_drops_owner_idx ON macaroni_v35_drops(owner_user_id, updated_at);
CREATE INDEX IF NOT EXISTS macaroni_v35_drops_status_idx ON macaroni_v35_drops(status, updated_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS macaroni_v35_claim_fulfillments (
  id serial PRIMARY KEY,
  drop_id integer NOT NULL REFERENCES macaroni_v35_drops(id) ON DELETE CASCADE,
  claim_id varchar(160) NOT NULL,
  purchase_operation_hash varchar(51) NOT NULL,
  purchase_transaction_id bigint NOT NULL CHECK (purchase_transaction_id >= 0),
  purchase_event_id bigint NOT NULL CHECK (purchase_event_id >= 0),
  purchase_event_index integer NOT NULL CHECK (purchase_event_index >= 0),
  buyer varchar(36) NOT NULL,
  recipient varchar(36) NOT NULL,
  unit integer NOT NULL CHECK (unit >= 0),
  purchase_level integer NOT NULL CHECK (purchase_level >= 0),
  purchase_time timestamptz NOT NULL,
  stage_id integer NOT NULL CHECK (stage_id >= 0),
  claim_position integer NOT NULL CHECK (claim_position >= 0),
  allocated_token_slot integer CHECK (allocated_token_slot >= 0),
  allocation_digest varchar(64),
  metadata_commitment varchar(64),
  state macaroni_v35_claim_state DEFAULT 'secured' NOT NULL,
  settlement_operation_hash varchar(51),
  settled_at timestamptz,
  published_at timestamptz,
  ready_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT macaroni_v35_claim_publish_after_settle_check CHECK (
    state NOT IN ('artwork_secured', 'publishing_ipfs', 'nft_ready') OR (settlement_operation_hash IS NOT NULL AND settled_at IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS macaroni_v35_claim_drop_claim_unique_idx ON macaroni_v35_claim_fulfillments(drop_id, claim_id);
CREATE UNIQUE INDEX IF NOT EXISTS macaroni_v35_claim_drop_position_unique_idx ON macaroni_v35_claim_fulfillments(drop_id, claim_position);
CREATE UNIQUE INDEX IF NOT EXISTS macaroni_v35_claim_purchase_event_unique_idx ON macaroni_v35_claim_fulfillments(drop_id, purchase_event_id);
CREATE INDEX IF NOT EXISTS macaroni_v35_claim_purchase_operation_idx ON macaroni_v35_claim_fulfillments(purchase_operation_hash);
CREATE INDEX IF NOT EXISTS macaroni_v35_claim_drop_state_idx ON macaroni_v35_claim_fulfillments(drop_id, state);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS macaroni_v35_private_assets (
  id serial PRIMARY KEY,
  drop_id integer NOT NULL REFERENCES macaroni_v35_drops(id) ON DELETE CASCADE,
  token_slot integer NOT NULL CHECK (token_slot >= 0),
  quantity integer DEFAULT 1 NOT NULL CHECK (quantity > 0),
  kind macaroni_v35_private_asset_kind NOT NULL,
  checksum_sha256 varchar(64) NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  mime_type varchar(255) NOT NULL,
  encrypted_storage_ref text NOT NULL,
  encryption_key_version varchar(80) NOT NULL,
  commitment varchar(64) NOT NULL,
  encrypted_cid_payload text,
  published_cid varchar(255),
  status macaroni_v35_private_asset_status DEFAULT 'staged' NOT NULL,
  allocated_at timestamptz,
  published_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS macaroni_v35_private_assets_slot_kind_unique_idx ON macaroni_v35_private_assets(drop_id, token_slot, kind);
CREATE UNIQUE INDEX IF NOT EXISTS macaroni_v35_private_assets_digest_unique_idx ON macaroni_v35_private_assets(drop_id, kind, checksum_sha256) WHERE kind IN ('artifact', 'metadata');
CREATE UNIQUE INDEX IF NOT EXISTS macaroni_v35_private_assets_commitment_unique_idx ON macaroni_v35_private_assets(drop_id, kind, commitment) WHERE kind IN ('artifact', 'metadata');
CREATE INDEX IF NOT EXISTS macaroni_v35_private_assets_drop_status_idx ON macaroni_v35_private_assets(drop_id, status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS macaroni_v35_work_items (
  id serial PRIMARY KEY,
  drop_id integer NOT NULL REFERENCES macaroni_v35_drops(id) ON DELETE CASCADE,
  claim_fulfillment_id integer REFERENCES macaroni_v35_claim_fulfillments(id) ON DELETE CASCADE,
  depends_on_work_item_id integer REFERENCES macaroni_v35_work_items(id) ON DELETE RESTRICT,
  work_type macaroni_v35_work_type NOT NULL,
  semantic_key varchar(255) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  state macaroni_v35_work_state DEFAULT 'queued' NOT NULL,
  eligible_at timestamptz DEFAULT now() NOT NULL,
  next_attempt_at timestamptz DEFAULT now() NOT NULL,
  lease_owner varchar(160),
  lease_expires_at timestamptz,
  attempt_count integer DEFAULT 0 NOT NULL CHECK (attempt_count >= 0),
  operation_hash varchar(51),
  submitted_at timestamptz,
  applied_at timestamptz,
  last_error text,
  error_class varchar(100),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT macaroni_v35_work_submitted_hash_check CHECK (
    state NOT IN ('submitted', 'applied') OR operation_hash IS NOT NULL
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS macaroni_v35_work_semantic_unique_idx ON macaroni_v35_work_items(drop_id, work_type, semantic_key);
CREATE INDEX IF NOT EXISTS macaroni_v35_work_due_idx ON macaroni_v35_work_items(state, next_attempt_at, eligible_at);
CREATE INDEX IF NOT EXISTS macaroni_v35_work_lease_idx ON macaroni_v35_work_items(state, lease_expires_at);
CREATE INDEX IF NOT EXISTS macaroni_v35_work_dependency_idx ON macaroni_v35_work_items(depends_on_work_item_id, state);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS macaroni_v35_funding_ledger (
  id serial PRIMARY KEY,
  drop_id integer NOT NULL REFERENCES macaroni_v35_drops(id) ON DELETE CASCADE,
  direction macaroni_v35_funding_direction NOT NULL,
  account macaroni_v35_funding_account NOT NULL,
  kind macaroni_v35_funding_kind NOT NULL,
  amount_mutez bigint NOT NULL CHECK (amount_mutez >= 0),
  balance_after_mutez bigint CHECK (balance_after_mutez >= 0),
  semantic_event_key varchar(255) NOT NULL,
  operation_hash varchar(51),
  source_ref varchar(255),
  details jsonb DEFAULT '{}'::jsonb NOT NULL,
  occurred_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS macaroni_v35_funding_event_unique_idx ON macaroni_v35_funding_ledger(drop_id, semantic_event_key);
CREATE INDEX IF NOT EXISTS macaroni_v35_funding_operation_idx ON macaroni_v35_funding_ledger(drop_id, operation_hash);
CREATE INDEX IF NOT EXISTS macaroni_v35_funding_drop_time_idx ON macaroni_v35_funding_ledger(drop_id, occurred_at);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS macaroni_v35_setup_steps (
  id serial PRIMARY KEY,
  drop_id integer NOT NULL REFERENCES macaroni_v35_drops(id) ON DELETE CASCADE,
  step_key varchar(100) NOT NULL,
  status macaroni_v35_setup_status DEFAULT 'pending' NOT NULL,
  intent_digest varchar(64) NOT NULL,
  expected_postcondition jsonb DEFAULT '{}'::jsonb NOT NULL,
  parameters jsonb DEFAULT 'null'::jsonb,
  network macaroni_reveal_network NOT NULL,
  signer varchar(36),
  target varchar(36),
  entrypoint varchar(100) NOT NULL,
  amount_mutez bigint DEFAULT 0 NOT NULL CHECK (amount_mutez >= 0),
  operation_hash varchar(51),
  details jsonb DEFAULT '{}'::jsonb NOT NULL,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS macaroni_v35_setup_drop_step_unique_idx ON macaroni_v35_setup_steps(drop_id, step_key);
CREATE INDEX IF NOT EXISTS macaroni_v35_setup_drop_status_idx ON macaroni_v35_setup_steps(drop_id, status);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS macaroni_v35_operation_attempts (
  id serial PRIMARY KEY,
  drop_id integer NOT NULL REFERENCES macaroni_v35_drops(id) ON DELETE CASCADE,
  work_item_id integer REFERENCES macaroni_v35_work_items(id) ON DELETE SET NULL,
  setup_step_id integer REFERENCES macaroni_v35_setup_steps(id) ON DELETE SET NULL,
  retry_of_attempt_id integer REFERENCES macaroni_v35_operation_attempts(id) ON DELETE SET NULL,
  request_id varchar(160) NOT NULL,
  intent varchar(100) NOT NULL,
  intent_digest varchar(64) NOT NULL,
  expected_postcondition jsonb DEFAULT '{}'::jsonb NOT NULL,
  parameters jsonb DEFAULT 'null'::jsonb,
  network macaroni_reveal_network NOT NULL,
  signer varchar(36),
  target varchar(36),
  entrypoint varchar(100) NOT NULL,
  amount_mutez bigint DEFAULT 0 NOT NULL CHECK (amount_mutez >= 0),
  state macaroni_v35_operation_state DEFAULT 'ready' NOT NULL,
  operation_hash varchar(51),
  wallet_response_id varchar(80),
  wallet_sender_id varchar(80),
  encrypted_signed_bytes text,
  signed_bytes_key_version varchar(80),
  signed_operation_branch varchar(51),
  signed_branch_level integer CHECK (signed_branch_level >= 0),
  signer_counter bigint CHECK (signer_counter >= 0),
  submission_head_hash varchar(51),
  submission_head_level integer CHECK (submission_head_level >= 0),
  submission_head_observed_at timestamptz,
  originated_contract varchar(36),
  error text,
  reconciliation jsonb,
  reconciled_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  submitted_at timestamptz,
  applied_at timestamptz,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT macaroni_v35_operation_submitted_hash_check CHECK (
    state NOT IN ('submitted', 'confirming', 'applied', 'needs_reconciliation') OR operation_hash IS NOT NULL
  ),
  CONSTRAINT macaroni_v35_operation_signed_bytes_complete_check CHECK (
    (encrypted_signed_bytes IS NULL AND signed_bytes_key_version IS NULL)
    OR (encrypted_signed_bytes IS NOT NULL AND signed_bytes_key_version IS NOT NULL AND operation_hash IS NOT NULL)
  ),
  CONSTRAINT macaroni_v35_operation_envelope_evidence_complete_check CHECK (
    (signed_operation_branch IS NULL AND signed_branch_level IS NULL AND signer_counter IS NULL)
    OR (operation_hash IS NOT NULL AND signed_operation_branch IS NOT NULL AND signed_branch_level IS NOT NULL AND signer_counter IS NOT NULL)
  ),
  CONSTRAINT macaroni_v35_operation_submission_horizon_complete_check CHECK (
    (submission_head_hash IS NULL AND submission_head_level IS NULL AND submission_head_observed_at IS NULL)
    OR (submission_head_hash IS NOT NULL AND submission_head_level IS NOT NULL AND submission_head_observed_at IS NOT NULL)
  ),
  CONSTRAINT macaroni_v35_operation_wallet_abort_identity_complete_check CHECK (
    (wallet_response_id IS NULL AND wallet_sender_id IS NULL)
    OR (wallet_response_id IS NOT NULL AND wallet_sender_id IS NOT NULL AND state = 'wallet_rejected')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS macaroni_v35_operation_request_unique_idx ON macaroni_v35_operation_attempts(request_id);
CREATE UNIQUE INDEX IF NOT EXISTS macaroni_v35_wallet_abort_response_unique_idx
  ON macaroni_v35_operation_attempts(wallet_response_id)
  WHERE wallet_response_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS macaroni_v35_operator_inflight_unique_idx
  ON macaroni_v35_operation_attempts(network, signer)
  WHERE work_item_id IS NOT NULL
    AND signer IS NOT NULL
    AND state IN ('ready', 'submitted', 'confirming', 'needs_reconciliation');
CREATE INDEX IF NOT EXISTS macaroni_v35_operation_work_idx ON macaroni_v35_operation_attempts(work_item_id, state);
CREATE INDEX IF NOT EXISTS macaroni_v35_operation_hash_idx ON macaroni_v35_operation_attempts(operation_hash);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION macaroni_v35_setup_intent_guard() RETURNS trigger AS $$
BEGIN
  IF NEW.intent_digest IS DISTINCT FROM OLD.intent_digest
    OR NEW.expected_postcondition IS DISTINCT FROM OLD.expected_postcondition
    OR NEW.parameters IS DISTINCT FROM OLD.parameters
    OR NEW.network IS DISTINCT FROM OLD.network
    OR NEW.signer IS DISTINCT FROM OLD.signer
    OR NEW.target IS DISTINCT FROM OLD.target
    OR NEW.entrypoint IS DISTINCT FROM OLD.entrypoint
    OR NEW.amount_mutez IS DISTINCT FROM OLD.amount_mutez THEN
    RAISE EXCEPTION 'Macaroni V3.5 setup intent fields are immutable';
  END IF;
  IF OLD.operation_hash IS NOT NULL AND NEW.operation_hash IS DISTINCT FROM OLD.operation_hash THEN
    RAISE EXCEPTION 'Macaroni V3.5 setup operation hash cannot be replaced';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS macaroni_v35_setup_intent_guard_trigger ON macaroni_v35_setup_steps;
CREATE TRIGGER macaroni_v35_setup_intent_guard_trigger
  BEFORE UPDATE ON macaroni_v35_setup_steps
  FOR EACH ROW EXECUTE FUNCTION macaroni_v35_setup_intent_guard();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION macaroni_v35_operation_attempt_guard() RETURNS trigger AS $$
DECLARE prior_reconciled_at timestamptz;
DECLARE prior_state macaroni_v35_operation_state;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Macaroni V3.5 operation attempts are append-only';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.retry_of_attempt_id IS NOT NULL THEN
      SELECT reconciled_at, state INTO prior_reconciled_at, prior_state
        FROM macaroni_v35_operation_attempts
        WHERE id = NEW.retry_of_attempt_id;
      IF prior_reconciled_at IS NULL AND prior_state <> 'wallet_rejected' THEN
        RAISE EXCEPTION 'Macaroni V3.5 operation must be reconciled before retry';
      END IF;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.drop_id IS DISTINCT FROM OLD.drop_id
    OR NEW.work_item_id IS DISTINCT FROM OLD.work_item_id
    OR NEW.setup_step_id IS DISTINCT FROM OLD.setup_step_id
    OR NEW.request_id IS DISTINCT FROM OLD.request_id
    OR NEW.retry_of_attempt_id IS DISTINCT FROM OLD.retry_of_attempt_id
    OR NEW.intent IS DISTINCT FROM OLD.intent
    OR NEW.intent_digest IS DISTINCT FROM OLD.intent_digest
    OR NEW.expected_postcondition IS DISTINCT FROM OLD.expected_postcondition
    OR NEW.parameters IS DISTINCT FROM OLD.parameters
    OR NEW.network IS DISTINCT FROM OLD.network
    OR NEW.signer IS DISTINCT FROM OLD.signer
    OR NEW.target IS DISTINCT FROM OLD.target
    OR NEW.entrypoint IS DISTINCT FROM OLD.entrypoint
    OR NEW.amount_mutez IS DISTINCT FROM OLD.amount_mutez THEN
    RAISE EXCEPTION 'Macaroni V3.5 operation intent fields are immutable';
  END IF;
  IF OLD.operation_hash IS NOT NULL AND NEW.operation_hash IS DISTINCT FROM OLD.operation_hash THEN
    RAISE EXCEPTION 'Macaroni V3.5 operation hash cannot be replaced';
  END IF;
  IF OLD.wallet_response_id IS NOT NULL AND NEW.wallet_response_id IS DISTINCT FROM OLD.wallet_response_id THEN
    RAISE EXCEPTION 'Macaroni V3.5 wallet response identity cannot be replaced';
  END IF;
  IF OLD.wallet_sender_id IS NOT NULL AND NEW.wallet_sender_id IS DISTINCT FROM OLD.wallet_sender_id THEN
    RAISE EXCEPTION 'Macaroni V3.5 wallet sender identity cannot be replaced';
  END IF;
  IF OLD.encrypted_signed_bytes IS NOT NULL AND NEW.encrypted_signed_bytes IS DISTINCT FROM OLD.encrypted_signed_bytes THEN
    RAISE EXCEPTION 'Macaroni V3.5 signed operation bytes cannot be replaced';
  END IF;
  IF OLD.signed_bytes_key_version IS NOT NULL AND NEW.signed_bytes_key_version IS DISTINCT FROM OLD.signed_bytes_key_version THEN
    RAISE EXCEPTION 'Macaroni V3.5 signed operation key version cannot be replaced';
  END IF;
  IF OLD.signed_operation_branch IS NOT NULL AND NEW.signed_operation_branch IS DISTINCT FROM OLD.signed_operation_branch THEN
    RAISE EXCEPTION 'Macaroni V3.5 signed operation branch cannot be replaced';
  END IF;
  IF OLD.signed_branch_level IS NOT NULL AND NEW.signed_branch_level IS DISTINCT FROM OLD.signed_branch_level THEN
    RAISE EXCEPTION 'Macaroni V3.5 signed operation branch level cannot be replaced';
  END IF;
  IF OLD.signer_counter IS NOT NULL AND NEW.signer_counter IS DISTINCT FROM OLD.signer_counter THEN
    RAISE EXCEPTION 'Macaroni V3.5 signed operation signer counter cannot be replaced';
  END IF;
  IF OLD.submission_head_hash IS NOT NULL AND NEW.submission_head_hash IS DISTINCT FROM OLD.submission_head_hash THEN
    RAISE EXCEPTION 'Macaroni V3.5 submission head hash cannot be replaced';
  END IF;
  IF OLD.submission_head_level IS NOT NULL AND NEW.submission_head_level IS DISTINCT FROM OLD.submission_head_level THEN
    RAISE EXCEPTION 'Macaroni V3.5 submission head level cannot be replaced';
  END IF;
  IF OLD.submission_head_observed_at IS NOT NULL AND NEW.submission_head_observed_at IS DISTINCT FROM OLD.submission_head_observed_at THEN
    RAISE EXCEPTION 'Macaroni V3.5 submission head observation cannot be replaced';
  END IF;
  IF OLD.originated_contract IS NOT NULL AND NEW.originated_contract IS DISTINCT FROM OLD.originated_contract THEN
    RAISE EXCEPTION 'Macaroni V3.5 originated contract cannot be replaced';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS macaroni_v35_operation_attempt_guard_trigger ON macaroni_v35_operation_attempts;
CREATE TRIGGER macaroni_v35_operation_attempt_guard_trigger
  BEFORE INSERT OR UPDATE OR DELETE ON macaroni_v35_operation_attempts
  FOR EACH ROW EXECUTE FUNCTION macaroni_v35_operation_attempt_guard();
