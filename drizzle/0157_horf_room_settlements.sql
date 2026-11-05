BEGIN;

CREATE TABLE IF NOT EXISTS public.horf_room_settlement_events (
  contract_address text NOT NULL,
  tzkt_event_id bigint NOT NULL,
  occurred_at timestamptz NOT NULL,
  operation_hash text NOT NULL,
  mode smallint NOT NULL,
  owner_address text NOT NULL,
  claimant_address text NOT NULL,
  output_contract text NOT NULL,
  output_token_id text NOT NULL,
  input_contract text,
  input_token_id text,
  PRIMARY KEY (contract_address, tzkt_event_id),
  CONSTRAINT horf_room_settlement_contract_check
    CHECK (contract_address ~ '^KT1[1-9A-HJ-NP-Za-km-z]{33}$'),
  CONSTRAINT horf_room_settlement_mode_check
    CHECK (mode IN (0, 1, 2, 3)),
  CONSTRAINT horf_room_settlement_wallet_check
    CHECK (owner_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$'
      AND claimant_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$'
      AND owner_address <> claimant_address),
  CONSTRAINT horf_room_settlement_token_check
    CHECK (output_contract ~ '^KT1[1-9A-HJ-NP-Za-km-z]{33}$'
      AND output_token_id ~ '^[0-9]+$'
      AND ((mode IN (0, 1) AND input_contract IS NULL AND input_token_id IS NULL)
        OR (mode IN (2, 3) AND input_contract ~ '^KT1[1-9A-HJ-NP-Za-km-z]{33}$'
          AND input_token_id ~ '^[0-9]+$')))
);
CREATE INDEX IF NOT EXISTS horf_room_settlement_contract_time_idx
  ON public.horf_room_settlement_events (contract_address, occurred_at);
CREATE INDEX IF NOT EXISTS horf_room_settlement_operation_idx
  ON public.horf_room_settlement_events (operation_hash);

CREATE TABLE IF NOT EXISTS public.horf_room_settlement_sync (
  contract_address text PRIMARY KEY,
  cursor bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'syncing' CHECK (status IN ('ready', 'syncing', 'error')),
  as_of timestamptz,
  error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horf_room_settlement_sync_contract_check
    CHECK (contract_address ~ '^KT1[1-9A-HJ-NP-Za-km-z]{33}$')
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['horf_room_settlement_events', 'horf_room_settlement_sync'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
