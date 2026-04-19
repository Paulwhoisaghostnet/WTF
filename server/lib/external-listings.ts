/**
 * external-listings: scaffold for pulling marketplace listings
 * (Teia, Objkt, fxhash, etc.) and mirroring them into the user's
 * `external_listing` collections.
 *
 * CURRENTLY DISABLED BY DEFAULT.  This file defines the sync shape
 * but is NOT registered with the scheduler in server/lib/background-jobs.ts.
 * To turn it on, set COCKPIT_EXTERNAL_LISTINGS_ENABLED=1 in .env and
 * call `registerExternalListings()` from `startBackgroundJobs`.
 *
 * Why disabled: Teia/Objkt both expose GraphQL endpoints that change
 * shape occasionally, and we don't want a silent sync failure to
 * clog sync_runs with error rows.  Phase 5 ships only the plumbing
 * so Phase 6+ can flip the switch after validating shapes in staging.
 *
 * Safe to delete this file to revert Phase 5; nothing else imports
 * from it.
 */

import { register as registerJob } from "./scheduler";
import { db } from "../db";
import {
  collections,
  collectionItems,
  userWallets,
} from "@shared/schema";
import { and, eq, sql } from "drizzle-orm";

const TICK_MS = 10 * 60 * 1000; // every 10 minutes when enabled

/**
 * Per-marketplace fetcher contract.  Returns normalized listing
 * entries for one wallet.  Implementations should raise on network
 * errors — the scheduler will mark the run as 'error' and back off.
 */
export type MarketplaceListingFetcher = (wallet: string) => Promise<
  Array<{
    tokenContract: string;
    tokenId: string;
    quantity: number;
    priceMutez?: number;
    externalUrl?: string;
    marketplace: string;
    listingId?: string | number;
  }>
>;

/**
 * Stub Teia fetcher.  TODO(phase 6): replace with a real GraphQL
 * query against hdapi.teia.rocks.  Intentional no-op so the
 * scheduler pipeline is testable without an external dependency.
 */
export const fetchTeiaListingsForWallet: MarketplaceListingFetcher = async (
  _wallet: string
) => {
  return [];
};

/**
 * Stub Objkt fetcher.  TODO(phase 6): replace with a real GraphQL
 * query against data.objkt.com/v3/graphql.
 */
export const fetchObjktListingsForWallet: MarketplaceListingFetcher = async (
  _wallet: string
) => {
  return [];
};

const FETCHERS: Record<string, MarketplaceListingFetcher> = {
  teia: fetchTeiaListingsForWallet,
  objkt: fetchObjktListingsForWallet,
};

/**
 * Ensure each user has a per-marketplace `external_listing` collection,
 * and replace its items with the current set returned by the fetcher.
 * Snapshot-style sync: one pull per wallet per marketplace per tick.
 */
export async function runExternalListingsSync(): Promise<{
  itemsIn: number;
  itemsOut: number;
}> {
  if (process.env.COCKPIT_EXTERNAL_LISTINGS_ENABLED !== "1") {
    return { itemsIn: 0, itemsOut: 0 };
  }

  const walletRows = await db
    .select({
      userId: userWallets.userId,
      walletAddress: userWallets.walletAddress,
    })
    .from(userWallets);

  let items = 0;
  let written = 0;

  for (const { userId, walletAddress } of walletRows) {
    for (const [marketplace, fetcher] of Object.entries(FETCHERS)) {
      const slug = `external-${marketplace}`;
      try {
        const listings = await fetcher(walletAddress);
        items += listings.length;

        // Find or create the per-marketplace external_listing
        // collection for this user.
        const existing = await db
          .select({ id: collections.id })
          .from(collections)
          .where(
            and(
              eq(collections.userId, userId),
              eq(collections.type, "external_listing"),
              eq(collections.slug, slug)
            )
          )
          .limit(1);
        let collectionId: number;
        if (existing.length === 0) {
          const [row] = await db
            .insert(collections)
            .values({
              userId,
              type: "external_listing",
              title: `${marketplace[0].toUpperCase()}${marketplace.slice(1)} listings`,
              description: `Tokens this wallet has listed on ${marketplace}.`,
              slug,
              isPublic: true,
              externalRef: marketplace,
            })
            .returning({ id: collections.id });
          collectionId = row.id;
        } else {
          collectionId = existing[0].id;
        }

        await db
          .delete(collectionItems)
          .where(eq(collectionItems.collectionId, collectionId));

        if (listings.length > 0) {
          await db.insert(collectionItems).values(
            listings.map((l, idx) => ({
              collectionId,
              tokenContract: l.tokenContract,
              tokenId: l.tokenId,
              quantity: Math.max(1, l.quantity),
              position: idx,
              note: l.externalUrl ?? null,
            }))
          );
          written += listings.length;
        }

        await db
          .update(collections)
          .set({
            updatedAt: new Date(),
            metadata: sql`jsonb_build_object('lastSyncedAt', NOW(), 'lastFetched', ${listings.length})`,
          })
          .where(eq(collections.id, collectionId));
      } catch (err) {
        console.warn(
          `[external-listings] ${marketplace} fetch failed for ${walletAddress}:`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  return { itemsIn: items, itemsOut: written };
}

/**
 * NOT called from startBackgroundJobs by default.  To enable:
 *   1. set COCKPIT_EXTERNAL_LISTINGS_ENABLED=1 in .env
 *   2. add `registerExternalListings()` to startBackgroundJobs()
 *      in server/lib/background-jobs.ts
 */
export function registerExternalListings(): void {
  registerJob({
    name: "external-listings",
    fn: runExternalListingsSync,
    intervalMs: TICK_MS,
    initialDelayMs: 5 * 60 * 1000,
  });
}
