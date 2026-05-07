import { sql } from "drizzle-orm";

import { db } from "../../db";
import type { CreatorScoreInput } from "@shared/tezos-intel";
import { calculateCreatorScore, compareCreatorScores } from "./scoring";

export async function loadCreatorScore(address: string) {
  const input = await loadCreatorScoreInput(address);
  return calculateCreatorScore(input);
}

export async function compareCreators(addresses: string[]) {
  const unique = Array.from(new Set(addresses.map((a) => a.trim()).filter(Boolean))).slice(0, 8);
  const inputs = await Promise.all(unique.map(loadCreatorScoreInput));
  return compareCreatorScores(inputs);
}

async function loadCreatorScoreInput(address: string): Promise<CreatorScoreInput> {
  const res = await db.execute(sql`
    WITH creator_tokens AS (
      SELECT token_contract, token_id
      FROM token_metadata
      WHERE creator_address = ${address}
    ),
    sales AS (
      SELECT s.*
      FROM token_sales s
      INNER JOIN creator_tokens t
        ON t.token_contract = s.token_contract AND t.token_id = s.token_id
    ),
    listings AS (
      SELECT l.*
      FROM token_listings l
      INNER JOIN creator_tokens t
        ON t.token_contract = l.token_contract AND t.token_id = l.token_id
      WHERE l.active = true
    )
    SELECT
      (SELECT COUNT(*)::int FROM creator_tokens) AS token_count,
      (SELECT COUNT(*)::int FROM sales) AS sale_count,
      (SELECT COUNT(DISTINCT buyer_address)::int FROM sales) AS collector_count,
      (SELECT COUNT(*)::int FROM listings) AS active_listing_count,
      COALESCE((SELECT SUM(price_mutez)::bigint FROM sales), 0)::text AS total_volume_mutez,
      COALESCE((SELECT MAX(price_mutez)::bigint FROM sales), 0)::text AS highest_sale_mutez,
      COALESCE((SELECT MIN(price_mutez)::bigint FROM listings), 0)::text AS floor_mutez,
      (SELECT MAX(sold_at) FROM sales) AS last_sale_at
  `);

  const row = ((res as any)?.rows?.[0] ?? {}) as Record<string, unknown>;
  return {
    creatorAddress: address,
    tokenCount: Number(row.token_count ?? 0),
    saleCount: Number(row.sale_count ?? 0),
    collectorCount: Number(row.collector_count ?? 0),
    activeListingCount: Number(row.active_listing_count ?? 0),
    totalVolumeMutez: Number(row.total_volume_mutez ?? 0),
    highestSaleMutez: Number(row.highest_sale_mutez ?? 0),
    floorMutez: Number(row.floor_mutez ?? 0),
    lastSaleAt: row.last_sale_at ? new Date(String(row.last_sale_at)).toISOString() : null,
  };
}
