BEGIN;
CREATE TABLE IF NOT EXISTS public.horf_reward_entitlements (
  id bigserial PRIMARY KEY,
  season_start timestamptz NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('direct','stable')),
  source_key text NOT NULL,
  trader_address text NOT NULL,
  counterparty_address text NOT NULL,
  units text NOT NULL CHECK (units ~ '^[0-9]+$' AND units <> '0'),
  amount_raw text NOT NULL CHECK (amount_raw ~ '^[0-9]+$' AND amount_raw <> '0'),
  source_active boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','voided')),
  last_seen_run text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT horf_reward_entitlements_event_trader_uq UNIQUE (source_kind, source_key, trader_address),
  CONSTRAINT horf_reward_entitlements_wallet_check CHECK (trader_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$')
);
CREATE INDEX IF NOT EXISTS horf_reward_entitlements_trader_status_idx
  ON public.horf_reward_entitlements (trader_address, status);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['horf_reward_entitlements'] LOOP
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
