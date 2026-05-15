/**
 * external-listings: opt-in puller for marketplace listings
 * (Objkt first; Teia remains unverified) and mirroring them into the
 * user's `external_listing` collections.
 *
 * CURRENTLY DISABLED BY DEFAULT.  This file defines the sync shape
 * but is NOT registered with the scheduler in server/lib/background-jobs.ts.
 * To turn it on, set COCKPIT_EXTERNAL_LISTINGS_ENABLED=1 in .env and
 * call `registerExternalListings()` from `startBackgroundJobs`.
 *
 * Why disabled: marketplace GraphQL endpoints can change shape and we
 * don't want a silent sync failure to clog sync_runs with error rows.
 * Objkt is implemented behind the feature flag; Teia remains exported
 * for future work but is not part of the default fetcher set.
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
import { objkt } from "./upstream";

const TICK_MS = 10 * 60 * 1000; // every 10 minutes when enabled
const OBJKT_LISTING_LIMIT = 200;

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
export const fetchTeiaListingsForWallet: MarketplaceListingFetcher = async () => {
  return [];
};

/**
 * Objkt active-listing fetcher.  Runs through the shared Objkt upstream
 * client so this opt-in job shares retry/backoff/rate-limit policy with
 * the rest of the Tezos data layer.
 */
export async function fetchObjktListingsForWallet(
  wallet: string,
  client: ObjktListingsClient = objkt
): ReturnType<MarketplaceListingFetcher> {
  const normalizedWallet = wallet.trim();
  if (!normalizedWallet) return [];

  const response = await client.postJson("", buildObjktListingsQuery(normalizedWallet));
  if (Array.isArray(response.errors) && response.errors.length > 0) {
    const first = response.errors[0];
    throw new Error(`Objkt listings GraphQL error: ${first?.message || "unknown"}`);
  }

  return normalizeObjktListingRows(response?.data?.listing ?? []);
}

const FETCHERS: Record<string, MarketplaceListingFetcher> = {
  objkt: fetchObjktListingsForWallet,
};

type ObjktListingRow = {
  id?: string | number | null;
  price?: number | string | null;
  amount_left?: number | string | null;
  status?: string | null;
  seller_address?: string | null;
  marketplace_contract?: string | null;
  token?: {
    fa_contract?: string | null;
    token_id?: string | number | null;
  } | null;
};

type ObjktListingsResponse = {
  data?: { listing?: ObjktListingRow[] | null };
  errors?: Array<{ message?: string | null }>;
};

type ObjktListingsClient = {
  postJson(path: string, body: unknown): Promise<ObjktListingsResponse>;
};

export function buildObjktListingsQuery(wallet: string) {
  return {
    query: `query WtfExternalObjktListings($seller: String!, $limit: Int!) {
      listing(
        where: {
          seller_address: { _eq: $seller }
          status: { _eq: "active" }
        }
        limit: $limit
        order_by: [{ timestamp: desc }, { id: desc }]
      ) {
        id
        price
        amount_left
        status
        seller_address
        marketplace_contract
        token {
          fa_contract
          token_id
        }
      }
    }`,
    variables: { seller: wallet, limit: OBJKT_LISTING_LIMIT },
  };
}

export function normalizeObjktListingRows(rows: ObjktListingRow[]): Awaited<ReturnType<MarketplaceListingFetcher>> {
  const listings = new Map<string, Awaited<ReturnType<MarketplaceListingFetcher>>[number]>();

  for (const row of rows) {
    const tokenContract = String(row?.token?.fa_contract ?? "").trim();
    const tokenId = String(row?.token?.token_id ?? "").trim();
    const listingId = row?.id == null ? "" : String(row.id).trim();
    if (!tokenContract || !tokenId || !listingId) continue;
    if (String(row.status || "").toLowerCase() !== "active") continue;

    const quantity = Math.max(1, Math.floor(Number(row.amount_left ?? 1) || 1));
    const priceNumber = Number(row.price ?? 0);
    const priceMutez = Number.isFinite(priceNumber) && priceNumber > 0
      ? Math.floor(priceNumber)
      : undefined;
    const marketplace = String(row.marketplace_contract || "objkt").trim() || "objkt";
    const key = `${marketplace}:${listingId}`;

    listings.set(key, {
      tokenContract,
      tokenId,
      quantity,
      priceMutez,
      externalUrl: `https://objkt.com/tokens/${encodeURIComponent(tokenContract)}/${encodeURIComponent(tokenId)}`,
      marketplace,
      listingId,
    });
  }

  return Array.from(listings.values()).sort((a, b) => {
    const left = `${a.tokenContract}:${a.tokenId}:${a.listingId}`;
    const right = `${b.tokenContract}:${b.tokenId}:${b.listingId}`;
    return left.localeCompare(right);
  });
}

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
