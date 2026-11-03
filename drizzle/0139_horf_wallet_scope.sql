BEGIN;

CREATE TABLE IF NOT EXISTS public.horf_verified_wallets (
  address text PRIMARY KEY,
  first_verified_at timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz NOT NULL DEFAULT now(),
  proof_source text NOT NULL CHECK (proof_source IN ('wallet-proof', 'linked-account')),
  linked_user_id integer REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT horf_verified_wallets_address_check CHECK (address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$')
);

ALTER TABLE public.horf_posse_partners
  ADD COLUMN IF NOT EXISTS owner_wallet_address text;
ALTER TABLE public.horf_posse_partners
  ALTER COLUMN user_id DROP NOT NULL;

-- Existing signed-in posse rows follow that account's primary linked wallet.
UPDATE public.horf_posse_partners p
   SET owner_wallet_address = (
    SELECT wallet_address
      FROM public.user_wallets
     WHERE user_id = p.user_id
     ORDER BY is_primary DESC, id ASC
     LIMIT 1
  )
 WHERE p.owner_wallet_address IS NULL;

ALTER TABLE public.horf_posse_partners
  DROP CONSTRAINT IF EXISTS horf_posse_partners_user_address_uq;
DROP INDEX IF EXISTS public.horf_posse_partners_user_address_uq;
CREATE UNIQUE INDEX IF NOT EXISTS horf_posse_partners_wallet_address_uq
  ON public.horf_posse_partners (owner_wallet_address, address);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'horf_posse_partners_owner_check') THEN
    ALTER TABLE public.horf_posse_partners
      ADD CONSTRAINT horf_posse_partners_owner_check
      CHECK (owner_wallet_address IS NOT NULL OR user_id IS NOT NULL);
  END IF;
END $$;

INSERT INTO public.horf_verified_wallets (address, proof_source, linked_user_id)
SELECT DISTINCT ON (wallet_address) wallet_address, 'linked-account', user_id
  FROM public.user_wallets
 WHERE wallet_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$'
 ORDER BY wallet_address, is_primary DESC, id ASC
ON CONFLICT (address) DO NOTHING;

-- Keep the audit registry in step with both canonical wallet-link paths.
CREATE OR REPLACE FUNCTION public.horf_register_linked_wallet()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.wallet_address ~ '^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$' THEN
    INSERT INTO public.horf_verified_wallets
      (address, proof_source, linked_user_id)
    VALUES (NEW.wallet_address, 'linked-account', NEW.user_id)
    ON CONFLICT (address) DO UPDATE
      SET last_verified_at = now(),
          proof_source = 'linked-account',
          linked_user_id = EXCLUDED.linked_user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS horf_register_linked_wallet_trigger ON public.user_wallets;
CREATE TRIGGER horf_register_linked_wallet_trigger
AFTER INSERT ON public.user_wallets
FOR EACH ROW EXECUTE FUNCTION public.horf_register_linked_wallet();

CREATE INDEX IF NOT EXISTS horf_verified_wallets_linked_user_idx
  ON public.horf_verified_wallets (linked_user_id);

ALTER TABLE public.horf_verified_wallets ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public.horf_verified_wallets FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public.horf_verified_wallets FROM authenticated;
  END IF;
END $$;

COMMIT;
