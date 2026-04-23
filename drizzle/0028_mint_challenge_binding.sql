-- ════════════════════════════════════════════════════════════════════════════
-- Phase 7 — Mint Portal + tag detection
--
-- Adds per-challenge mint-binding fields so the Mint Portal microapp and the
-- wallet-events watcher know which token mints to auto-credit against which
-- challenge. Also adds two new auto_verify_type enum values that run directly
-- off this binding.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS submission_contract varchar(36);

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS submission_tag varchar(120);

ALTER TABLE challenges
  ADD COLUMN IF NOT EXISTS submission_curation varchar(120);

-- Mint-created submissions are tracked on the existing
-- `challenge_submissions` table. Annotate the row so we know it came from
-- the auto-matcher and can idempotently look it up.
ALTER TABLE challenge_submissions
  ADD COLUMN IF NOT EXISTS source varchar(40) NOT NULL DEFAULT 'manual';

ALTER TABLE challenge_submissions
  ADD COLUMN IF NOT EXISTS mint_token_contract varchar(36);

ALTER TABLE challenge_submissions
  ADD COLUMN IF NOT EXISTS mint_token_id varchar(100);

ALTER TABLE challenge_submissions
  ADD COLUMN IF NOT EXISTS mint_op_hash varchar(80);

CREATE UNIQUE INDEX IF NOT EXISTS challenge_submissions_mint_unique_idx
  ON challenge_submissions (challenge_id, mint_token_contract, mint_token_id)
  WHERE mint_token_contract IS NOT NULL
    AND mint_token_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS challenges_submission_contract_idx
  ON challenges (submission_contract)
  WHERE submission_contract IS NOT NULL;

CREATE INDEX IF NOT EXISTS challenges_submission_tag_idx
  ON challenges (submission_tag)
  WHERE submission_tag IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'auto_verify_type')
      AND enumlabel = 'mint_with_tag'
  ) THEN
    ALTER TYPE auto_verify_type ADD VALUE 'mint_with_tag';
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'auto_verify_type')
      AND enumlabel = 'mint_in_curation'
  ) THEN
    ALTER TYPE auto_verify_type ADD VALUE 'mint_in_curation';
  END IF;
END$$;
