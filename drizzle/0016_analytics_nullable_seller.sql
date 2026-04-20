-- Analytics phase 1b — relax seller_address on token_sales.
--
-- Rationale: historic data from Objkt-GraphQL (2021-2023 especially)
-- consistently fills `buyer_address` but leaves `seller_address` NULL
-- or empty.  Requiring seller to be NOT NULL throws away ~650K rows
-- of real usable acquisition history, which is exactly the side of
-- the trade we need for wallet cost-basis.  Make it nullable and
-- rebuild the unique index to treat missing sellers as dedupable.

ALTER TABLE "token_sales"
  ALTER COLUMN "seller_address" DROP NOT NULL;

-- Replace the old unique index that had `seller_address` directly.
DROP INDEX IF EXISTS "uniq_sales_ophash";
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_sales_ophash"
  ON "token_sales" (
    "op_hash",
    "token_contract",
    "token_id",
    COALESCE("seller_address", ''),
    "buyer_address"
  );
