/**
 * Cockpit-derived stats for challenges, side quests, and leaderboards.
 * Reads `wallet_holdings`, `wallet_events`, and trade-board collections only.
 */

import { sql } from "drizzle-orm";
import { db } from "../db";
import { WTF_TOKEN } from "@shared/types";

export type GameLayerStats = {
  /** Rows in wallet_holdings with numeric balance &gt; 0. */
  holdingsWithBalance: number;
  /** Same but excluding the platform WTF fungible row (FA2 balance token). */
  nonWtfHoldingsWithBalance: number;
  /** Count of indexed `token_mint` events for this user. */
  mintEventCount: number;
  /** Sum of `collection_items.quantity` on the user’s trade-board mirror collections. */
  tradeBoardListedQuantity: number;
};

function firstCount(result: unknown): number {
  const rows = (result as { rows?: { c: number }[] })?.rows ?? [];
  const n = rows[0]?.c;
  return typeof n === "number" ? n : 0;
}

export async function getUserGameLayerStats(userId: number): Promise<GameLayerStats> {
  const wtfContract = WTF_TOKEN.contract;
  const wtfTokenId = String(WTF_TOKEN.tokenId);

  const hold = await db.execute(sql`
    SELECT COUNT(*)::int AS c
    FROM wallet_holdings h
    WHERE h.user_id = ${userId}
      AND COALESCE(NULLIF(TRIM(h.balance), '')::numeric, 0) > 0
  `);
  const nonWtf = await db.execute(sql`
    SELECT COUNT(*)::int AS c
    FROM wallet_holdings h
    WHERE h.user_id = ${userId}
      AND COALESCE(NULLIF(TRIM(h.balance), '')::numeric, 0) > 0
      AND NOT (
        LOWER(h.token_contract) = LOWER(${wtfContract})
        AND h.token_id = ${wtfTokenId}
      )
  `);
  const mint = await db.execute(sql`
    SELECT COUNT(*)::int AS c
    FROM wallet_events
    WHERE user_id = ${userId}
      AND event_type = 'token_mint'
  `);
  const tb = await db.execute(sql`
    SELECT COALESCE(SUM(ci.quantity), 0)::int AS c
    FROM collections c
    INNER JOIN collection_items ci ON ci.collection_id = c.id
    WHERE c.user_id = ${userId}
      AND c.type = 'trade_board_listing'
  `);

  return {
    holdingsWithBalance: firstCount(hold),
    nonWtfHoldingsWithBalance: firstCount(nonWtf),
    mintEventCount: firstCount(mint),
    tradeBoardListedQuantity: firstCount(tb),
  };
}
