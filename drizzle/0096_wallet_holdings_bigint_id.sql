BEGIN;

ALTER TABLE wallet_holdings
  ALTER COLUMN id TYPE bigint;

ALTER SEQUENCE wallet_holdings_id_seq
  AS bigint
  NO MAXVALUE;

SELECT setval(
  'wallet_holdings_id_seq',
  GREATEST(
    COALESCE((SELECT MAX(id) FROM wallet_holdings), 0),
    COALESCE((SELECT last_value FROM wallet_holdings_id_seq), 0)
  ) + 1,
  false
);

COMMIT;
