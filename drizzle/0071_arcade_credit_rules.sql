ALTER TABLE console_games
  ADD COLUMN IF NOT EXISTS arcade_credits_required boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS arcade_credit_price integer DEFAULT 1 NOT NULL;

UPDATE console_games
SET
  arcade_credits_required = COALESCE(arcade_credits_required, true),
  arcade_credit_price = GREATEST(0, COALESCE(arcade_credit_price, 1))
WHERE TRUE;
