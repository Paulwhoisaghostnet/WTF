/**
 * collections-mirror: keep legacy per-token booleans and the new
 * `collections` / `collection_items` tables in sync without changing
 * any existing endpoint's observable behaviour.
 *
 * Contract:
 *   - Trade-board routes call `mirrorTradeBoardChange(...)` after
 *     updating `collection_items` (Phase 6 removed `user_owned_tokens`).
 *   - The mirror owns the user's one (lazy-created) `trade_board_listing`
 *     collection and the matching `collection_items` rows.
 *   - If mirroring throws, it is swallowed with a warning.  The
 *     legacy boolean remains the source of truth for existing code.
 */

import { db } from "../db";
import { collections, collectionItems } from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

const TRADE_BOARD_SLUG = "trade-board";

/**
 * Ensure the user has exactly one `trade_board_listing` collection.
 * Returns its id, creating on first call.  Idempotent.
 */
export async function ensureTradeBoardCollection(userId: number): Promise<number> {
  const existing = await db
    .select({ id: collections.id })
    .from(collections)
    .where(
      and(
        eq(collections.userId, userId),
        eq(collections.type, "trade_board_listing")
      )
    )
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  const [row] = await db
    .insert(collections)
    .values({
      userId,
      type: "trade_board_listing",
      title: "Trade Board",
      description: "Tokens this user has listed on the WTF trade board.",
      slug: TRADE_BOARD_SLUG,
      isPublic: true,
    })
    .returning({ id: collections.id });
  return row.id;
}

export type TradeBoardMirrorChange =
  | {
      action: "add";
      userId: number;
      tokens: Array<{
        tokenContract: string;
        tokenId: string;
        quantity: number;
      }>;
    }
  | {
      action: "remove";
      userId: number;
      tokens: Array<{ tokenContract: string; tokenId: string }>;
    };

/**
 * Reflect a trade-board boolean change into the collections table.
 * Never throws; only logs on failure so legacy write paths are not
 * affected by mirror outages.
 */
export async function mirrorTradeBoardChange(
  change: TradeBoardMirrorChange
): Promise<void> {
  try {
    const collectionId = await ensureTradeBoardCollection(change.userId);
    if (change.action === "add") {
      if (change.tokens.length === 0) return;
      await db
        .insert(collectionItems)
        .values(
          change.tokens.map((t) => ({
            collectionId,
            tokenContract: t.tokenContract,
            tokenId: t.tokenId,
            quantity: Math.max(1, Number.isFinite(t.quantity) ? t.quantity : 1),
          }))
        )
        .onConflictDoUpdate({
          target: [
            collectionItems.collectionId,
            collectionItems.tokenContract,
            collectionItems.tokenId,
          ],
          set: {
            quantity: sql`EXCLUDED.quantity`,
          },
        });
      await db
        .update(collections)
        .set({ updatedAt: new Date() })
        .where(eq(collections.id, collectionId));
    } else {
      if (change.tokens.length === 0) return;
      // Delete by (contract, tokenId) tuple to avoid the cartesian
      // trap of independently filtered inArray() calls.
      for (const t of change.tokens) {
        await db
          .delete(collectionItems)
          .where(
            and(
              eq(collectionItems.collectionId, collectionId),
              eq(collectionItems.tokenContract, t.tokenContract),
              eq(collectionItems.tokenId, t.tokenId)
            )
          );
      }
      await db
        .update(collections)
        .set({ updatedAt: new Date() })
        .where(eq(collections.id, collectionId));
    }
  } catch (err) {
    console.warn(
      "[collections-mirror] trade-board mirror failed (non-fatal):",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Rebuild the trade-board collection from scratch for one user,
 * using the current rows in the user's trade-board collection only.
 * Used by the one-shot backfill endpoint below.
 */
export async function backfillTradeBoardCollection(
  userId: number
): Promise<{ collectionId: number; added: number }> {
  const collectionId = await ensureTradeBoardCollection(userId);

  const existingItems = await db
    .select({
      tokenContract: collectionItems.tokenContract,
      tokenId: collectionItems.tokenId,
      quantity: collectionItems.quantity,
    })
    .from(collectionItems)
    .where(eq(collectionItems.collectionId, collectionId));

  const added = existingItems.length;

  await db
    .update(collections)
    .set({ updatedAt: new Date() })
    .where(eq(collections.id, collectionId));

  return { collectionId, added };
}
