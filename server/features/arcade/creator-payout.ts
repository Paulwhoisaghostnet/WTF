/**
 * Creator payout hooks for the WTF Arcade.
 *
 * When a user spends credits on a creator-submitted game (creditsPerPlay > 0),
 * a payout event is fired so the platform can route a share of the credit spend
 * to the creator's account.  This module:
 *   - Defines the CreatorPayoutEvent shape
 *   - Provides `recordCreatorPayoutEvent` to persist events for later settlement
 *   - Exports a hook `onArcadePlayConsumed` that callers invoke after a credit
 *     has been deducted from the player
 *
 * NOTE: Actual settlement (transferring WTF tokens / recording claim records) is
 * a separate batch job.  This file records *intent* only.
 */

import { db } from "../../db";
import { consoleAuditEvents } from "@shared/schema";
import { MINDWALK_CREATOR_USERNAME, MINDWALK_SLUG } from "./mindwalk-catalog";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreatorPayoutEvent {
  /** Arcade game slug */
  gameSlug: string;
  /** Username of the creator that owns the game */
  creatorUsername: string;
  /** WTF user ID of the player who spent credits */
  playerUserId: number;
  /** Number of arcade credits consumed in this play */
  creditsConsumed: number;
  /** Fraction of consumed credits that go to the creator (0–1) */
  creatorShareFraction: number;
  /** ISO timestamp */
  occurredAt: string;
}

// Default revenue share: creator gets 50 % of each credit spent on their game.
export const DEFAULT_CREATOR_SHARE_FRACTION = 0.5;

// ─── Known creator mappings ──────────────────────────────────────────────────

/**
 * Maps arcade game slugs to the username that should receive a payout.
 * Add new entries here when new creator-games are registered.
 */
export const ARCADE_CREATOR_MAP: Record<string, string> = {
  [MINDWALK_SLUG]: MINDWALK_CREATOR_USERNAME,
};

// ─── Core functions ──────────────────────────────────────────────────────────

/**
 * Records a creator payout event in the audit log for later settlement.
 * Never throws — payout recording is best-effort and must not block gameplay.
 */
export async function recordCreatorPayoutEvent(
  event: CreatorPayoutEvent
): Promise<void> {
  try {
    await db.insert(consoleAuditEvents).values({
      gameId: null as unknown as number, // resolved by settlement job
      actorUserId: event.playerUserId,
      action: "arcade.creator_payout.pending",
      reason: `Creator payout: ${event.creatorUsername} — ${event.gameSlug}`,
      payloadJson: {
        gameSlug: event.gameSlug,
        creatorUsername: event.creatorUsername,
        playerUserId: event.playerUserId,
        creditsConsumed: event.creditsConsumed,
        creatorShareFraction: event.creatorShareFraction,
        creatorCreditShare: event.creditsConsumed * event.creatorShareFraction,
        occurredAt: event.occurredAt,
        status: "pending",
      },
    });
  } catch (err) {
    console.error(
      "[arcade:creator-payout] Failed to record payout event:",
      err instanceof Error ? err.message : err
    );
  }
}

/**
 * Main hook — call this after a player successfully consumes arcade credits
 * for a creator-submitted game.  Resolves the creator username from the slug
 * map and persists a pending payout event.
 *
 * @param opts.gameSlug   - Arcade game slug
 * @param opts.playerUserId - WTF user ID of the player
 * @param opts.creditsConsumed - How many credits were deducted
 */
export async function onArcadePlayConsumed(opts: {
  gameSlug: string;
  playerUserId: number;
  creditsConsumed?: number;
}): Promise<void> {
  const creatorUsername = ARCADE_CREATOR_MAP[opts.gameSlug];
  if (!creatorUsername) return; // not a creator game — no payout

  await recordCreatorPayoutEvent({
    gameSlug: opts.gameSlug,
    creatorUsername,
    playerUserId: opts.playerUserId,
    creditsConsumed: opts.creditsConsumed ?? 1,
    creatorShareFraction: DEFAULT_CREATOR_SHARE_FRACTION,
    occurredAt: new Date().toISOString(),
  });
}
