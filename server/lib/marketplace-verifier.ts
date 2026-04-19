/**
 * Reconcile `marketplace_listings` / `marketplace_bids` rows that were
 * inserted with `onchainStatus = 'pending_verification'`.
 *
 * When the POST /api/marketplace or /bid handler runs, TzKT usually
 * hasn't indexed the operation yet (2–5 second lag).  The handler does a
 * short synchronous verify and, if that fails only because the op isn't
 * visible yet, inserts the row as pending.  This reconciler runs
 * periodically and every time a user calls /api/contract-activity with a
 * successful telemetry event — it re-queries TzKT and flips rows to
 * either `verified` or `failed`.
 *
 * Rows that stay pending for longer than `PENDING_TTL_MS` are marked
 * `failed` so they drop out of the public feed.
 */

import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import {
  marketplaceBids,
  marketplaceListings,
  userWallets,
} from "@shared/schema";
import {
  fetchTransactionsByHash,
  findAppliedContractCall,
  isValidOpHash,
} from "./tzkt-ops";
import { getMarketplaceAddressOrNull } from "./contract-config";

const PENDING_TTL_MS = 15 * 60 * 1000; // 15 minutes
const RECONCILE_INTERVAL_MS = 60 * 1000; // 1 minute
const MAX_ROWS_PER_PASS = 50;

type ListingRow = typeof marketplaceListings.$inferSelect;
type BidRow = typeof marketplaceBids.$inferSelect;

let timer: ReturnType<typeof setInterval> | null = null;

async function walletsForUser(userId: number): Promise<string[]> {
  const rows = await db
    .select({ walletAddress: userWallets.walletAddress })
    .from(userWallets)
    .where(eq(userWallets.userId, userId));
  return rows.map((r) => r.walletAddress);
}

async function reconcileListing(
  row: ListingRow,
  contract: string
): Promise<"verified" | "failed" | "still_pending"> {
  if (!row.opHash || !isValidOpHash(row.opHash)) {
    await db
      .update(marketplaceListings)
      .set({ onchainStatus: "failed" })
      .where(eq(marketplaceListings.id, row.id));
    return "failed";
  }

  const senders = await walletsForUser(row.sellerUserId);
  if (senders.length === 0) return "still_pending";

  const transactions = await fetchTransactionsByHash(row.opHash, {
    retries: 1,
    retryDelayMs: 500,
  });
  if (transactions.length === 0) {
    const ageMs = Date.now() - new Date(row.createdAt).getTime();
    if (ageMs > PENDING_TTL_MS) {
      await db
        .update(marketplaceListings)
        .set({ onchainStatus: "failed" })
        .where(eq(marketplaceListings.id, row.id));
      return "failed";
    }
    return "still_pending";
  }

  const entrypoint =
    row.listingType === "auction" ? ["create_auction"] : ["create_listing"];
  const match = findAppliedContractCall(transactions, {
    contract,
    senderOneOf: senders,
    entrypoint,
  });

  if (!match) {
    await db
      .update(marketplaceListings)
      .set({ onchainStatus: "failed" })
      .where(eq(marketplaceListings.id, row.id));
    return "failed";
  }

  await db
    .update(marketplaceListings)
    .set({
      onchainStatus: "verified",
      onchainVerifiedAt: new Date(),
      onchainVerifiedSender: match.sender,
    })
    .where(eq(marketplaceListings.id, row.id));
  return "verified";
}

async function reconcileBid(
  row: BidRow,
  contract: string
): Promise<"verified" | "failed" | "still_pending"> {
  if (!row.opHash || !isValidOpHash(row.opHash)) {
    await db
      .update(marketplaceBids)
      .set({ onchainStatus: "failed" })
      .where(eq(marketplaceBids.id, row.id));
    return "failed";
  }

  const senders = await walletsForUser(row.bidderUserId);
  if (senders.length === 0) return "still_pending";

  const transactions = await fetchTransactionsByHash(row.opHash, {
    retries: 1,
    retryDelayMs: 500,
  });
  if (transactions.length === 0) {
    const ageMs = Date.now() - new Date(row.createdAt).getTime();
    if (ageMs > PENDING_TTL_MS) {
      await db
        .update(marketplaceBids)
        .set({ onchainStatus: "failed" })
        .where(eq(marketplaceBids.id, row.id));
      return "failed";
    }
    return "still_pending";
  }

  const match = findAppliedContractCall(transactions, {
    contract,
    senderOneOf: senders,
    entrypoint: ["bid_auction"],
  });

  if (!match) {
    await db
      .update(marketplaceBids)
      .set({ onchainStatus: "failed" })
      .where(eq(marketplaceBids.id, row.id));
    return "failed";
  }

  await db
    .update(marketplaceBids)
    .set({
      onchainStatus: "verified",
      onchainVerifiedAt: new Date(),
      onchainVerifiedSender: match.sender,
    })
    .where(eq(marketplaceBids.id, row.id));
  return "verified";
}

export async function reconcilePendingMarketplaceRows(): Promise<{
  listings: { verified: number; failed: number; stillPending: number };
  bids: { verified: number; failed: number; stillPending: number };
}> {
  const contract = getMarketplaceAddressOrNull();
  const empty = { verified: 0, failed: 0, stillPending: 0 };
  if (!contract) {
    return { listings: empty, bids: empty };
  }

  const listingRows = await db
    .select()
    .from(marketplaceListings)
    .where(eq(marketplaceListings.onchainStatus, "pending_verification"))
    .orderBy(desc(marketplaceListings.createdAt))
    .limit(MAX_ROWS_PER_PASS);

  const bidRows = await db
    .select()
    .from(marketplaceBids)
    .where(eq(marketplaceBids.onchainStatus, "pending_verification"))
    .orderBy(desc(marketplaceBids.createdAt))
    .limit(MAX_ROWS_PER_PASS);

  const listingStats = { verified: 0, failed: 0, stillPending: 0 };
  for (const row of listingRows) {
    try {
      const outcome = await reconcileListing(row, contract);
      if (outcome === "verified") listingStats.verified++;
      else if (outcome === "failed") listingStats.failed++;
      else listingStats.stillPending++;
    } catch (err) {
      listingStats.stillPending++;
      console.warn(
        `[marketplace-verifier] listing ${row.id} reconcile threw:`,
        (err as Error).message
      );
    }
  }

  const bidStats = { verified: 0, failed: 0, stillPending: 0 };
  for (const row of bidRows) {
    try {
      const outcome = await reconcileBid(row, contract);
      if (outcome === "verified") bidStats.verified++;
      else if (outcome === "failed") bidStats.failed++;
      else bidStats.stillPending++;
    } catch (err) {
      bidStats.stillPending++;
      console.warn(
        `[marketplace-verifier] bid ${row.id} reconcile threw:`,
        (err as Error).message
      );
    }
  }

  return { listings: listingStats, bids: bidStats };
}

import { register as registerJob } from "./scheduler";

/**
 * Register marketplace-verifier with the cockpit scheduler.  Cadence
 * unchanged (every minute).  The scheduler serializes per-job runs so
 * we no longer need the local `timer` guard.
 */
export function registerMarketplaceVerifier(): void {
  registerJob({
    name: "marketplace-verifier",
    fn: async () => {
      const stats = await reconcilePendingMarketplaceRows();
      const inCount =
        stats.listings.verified +
        stats.listings.failed +
        stats.listings.stillPending +
        stats.bids.verified +
        stats.bids.failed +
        stats.bids.stillPending;
      const outCount =
        stats.listings.verified +
        stats.listings.failed +
        stats.bids.verified +
        stats.bids.failed;
      return { itemsIn: inCount, itemsOut: outCount };
    },
    intervalMs: RECONCILE_INTERVAL_MS,
  });
}

/** Legacy lifecycle shims.  Scheduler owns start/stop now. */
export function startMarketplaceVerifier(): void {
  registerMarketplaceVerifier();
}
export function stopMarketplaceVerifier(): void {
  // no-op
}
