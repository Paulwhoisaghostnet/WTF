import { Router } from "express";
import { db } from "../db";
import {
  marketplaceListings,
  marketplaceBids,
  users,
  userWallets,
  walletHoldings,
  tokenMetadata,
  collections,
  collectionItems,
  tokenListings,
} from "@shared/schema";
import { eq, desc, and, inArray, sql, ne } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { hasPermission } from "../lib/permissions";
import { formatWtf } from "@shared/types";
import {
  actorDisplayName,
  createNotificationsForUsers,
  getAllUserIdsExcept,
} from "../lib/notifications";
import { z } from "zod";
import {
  getMarketplaceAddressOrNull,
  getTzktBase,
  requireMarketplaceAddress,
  MarketplaceNotConfiguredError,
} from "../lib/contract-config";
import {
  fetchTransactionsByHash,
  findAppliedContractCall,
  isValidOpHash,
} from "../lib/tzkt-ops";
import { sanitizeThumbnailUrl } from "../lib/thumbnail-url";
import {
  externalCancelEntrypoint,
  externalMarketplaceName,
  isCancellableExternalMarketplace,
} from "@shared/external-marketplaces";
import {
  resolveTokenDisplayIdentities,
  tokenIdentityKey,
} from "../lib/tezos-identity";

const router = Router();

const listingStatuses = ["active", "sold", "cancelled", "expired"] as const;

function contractNotConfiguredResponse(res: any) {
  return res.status(503).json({
    error: "Marketplace contract is not configured on this deployment.",
    code: "MARKETPLACE_CONTRACT_NOT_CONFIGURED",
  });
}

const optionalDateSchema = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid timestamp",
      });
      return z.NEVER;
    }
    return parsed;
  });

const listingUpdateSchema = z
  .object({
    priceWtf: z.coerce.number().int().min(0).max(10_000_000_000).optional(),
    minBidWtf: z.coerce.number().int().min(0).max(10_000_000_000).optional().nullable(),
    endTime: optionalDateSchema,
    status: z.enum(listingStatuses).optional(),
    opHash: z
      .string()
      .trim()
      .max(51)
      .optional()
      .nullable()
      .transform((value) => (value ? value : null)),
    onChainId: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        if (value === null || value === "") return null;
        return String(value);
      }),
    tokenName: z
      .string()
      .trim()
      .max(300)
      .optional()
      .nullable()
      .transform((value) => (value ? value : null)),
    tokenThumbnail: z
      .string()
      .trim()
      .url()
      .optional()
      .nullable()
      .transform((value) => (value ? value : null)),
  })
  .strict();

interface OnChainStorage {
  admin: string;
  paused: boolean;
  listings: string | number;
  auctions: string | number;
  offers: string | number;
}

interface BigMapKeyRow {
  key?: any;
  value?: any;
  active?: boolean;
}

interface AddressProfile {
  userId: number | null;
  username: string | null;
  displayName: string | null;
  pfpImageUrl: string | null;
}

interface TokenMetadata {
  tokenName: string | null;
  tokenThumbnail: string | null;
}

interface OnChainListing {
  id: number;
  seller: string;
  tokenContract: string;
  tokenId: string;
  tokenAmount: string;
  priceWtf: string;
  royaltyRecipient: string | null;
  royaltyBps: string;
  active: boolean;
}

interface OnChainAuctionShare {
  amount: string;
  recipient: string;
}

interface OnChainAuction {
  id: number;
  creator: string;
  tokenContract: string;
  tokenId: string;
  reserve: string;
  startTime: string;
  endTime: string;
  extensionTime: string;
  priceIncrement: string;
  currentPrice: string;
  highestBidder: string;
  hasBid: boolean;
  shares: OnChainAuctionShare[];
  active: boolean;
}

interface OnChainOffer {
  tokenContract: string;
  tokenId: string;
  offerer: string;
  tokenAmount: string;
  amountWtf: string;
  targetOwner: string;
}

interface OnChainMarketSnapshot {
  admin: string;
  paused: boolean;
  listings: OnChainListing[];
  auctions: OnChainAuction[];
  offers: OnChainOffer[];
}

function normalizeMediaUri(input: unknown): string | null {
  return sanitizeThumbnailUrl(input);
}

function resolveTokenThumbnail(
  tokenThumbnail: string | null | undefined,
  metadata: unknown
): string | null {
  const meta =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
  return (
    normalizeMediaUri(tokenThumbnail || null) ||
    normalizeMediaUri(meta.thumbnailUri) ||
    normalizeMediaUri(meta.displayUri) ||
    normalizeMediaUri(meta.artifactUri) ||
    normalizeMediaUri(meta.image) ||
    null
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function asNatString(value: unknown): string {
  const raw = String(value ?? "");
  return /^[0-9]+$/.test(raw) ? raw : "0";
}

function asNatNumber(value: unknown): number | null {
  const raw = asNatString(value);
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) return null;
  return n;
}

function asAddress(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("tz") && !trimmed.startsWith("KT1")) return null;
  return trimmed;
}

function tokenKey(tokenContract: string, tokenId: string): string {
  return `${tokenContract}:${tokenId}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TzKT request failed (${res.status}) for ${url}`);
  }
  return res.json() as Promise<T>;
}

async function fetchOnChainStorage(): Promise<OnChainStorage> {
  const contract = requireMarketplaceAddress();
  const url = `${getTzktBase()}/contracts/${contract}/storage`;
  return fetchJson<OnChainStorage>(url);
}

async function fetchBigMapRows(
  bigMapId: string | number,
  limit: number
): Promise<BigMapKeyRow[]> {
  const safeLimit = clamp(limit, 1, 500);
  const url = `${getTzktBase()}/bigmaps/${bigMapId}/keys?active=true&limit=${safeLimit}`;
  return fetchJson<BigMapKeyRow[]>(url);
}

function parseListingRow(row: BigMapKeyRow): OnChainListing | null {
  const listingId = asNatNumber(row.key);
  const value = row.value ?? {};
  const seller = asAddress(value.seller);
  const tokenContract = asAddress(value.token_contract);
  if (listingId === null || !seller || !tokenContract) return null;
  return {
    id: listingId,
    seller,
    tokenContract,
    tokenId: asNatString(value.token_id),
    tokenAmount: asNatString(value.token_amount),
    priceWtf: asNatString(value.price_wtf),
    royaltyRecipient: asAddress(value.royalty_recipient),
    royaltyBps: asNatString(value.royalty_bps),
    active: Boolean(value.active),
  };
}

function parseAuctionRow(row: BigMapKeyRow): OnChainAuction | null {
  const auctionId = asNatNumber(row.key);
  const value = row.value ?? {};
  const creator = asAddress(value.creator);
  const tokenContract = asAddress(value.token_contract);
  const highestBidder = asAddress(value.highest_bidder);
  if (auctionId === null || !creator || !tokenContract || !highestBidder)
    return null;

  const sharesRaw = Array.isArray(value.shares) ? value.shares : [];
  const shares: OnChainAuctionShare[] = sharesRaw
    .map((share: any) => ({
      amount: asNatString(share?.amount),
      recipient: asAddress(share?.recipient) || "",
    }))
    .filter((share: OnChainAuctionShare) => share.recipient.length > 0);

  return {
    id: auctionId,
    creator,
    tokenContract,
    tokenId: asNatString(value.token_id),
    reserve: asNatString(value.reserve),
    startTime: String(value.start_time ?? ""),
    endTime: String(value.end_time ?? ""),
    extensionTime: asNatString(value.extension_time),
    priceIncrement: asNatString(value.price_increment),
    currentPrice: asNatString(value.current_price),
    highestBidder,
    hasBid: Boolean(value.has_bid),
    shares,
    active: Boolean(value.active),
  };
}

function parseOfferRow(row: BigMapKeyRow): OnChainOffer | null {
  const key = row.key ?? {};
  const value = row.value ?? {};
  const tokenContract = asAddress(key.token_contract);
  const offerer = asAddress(value.offerer);
  const targetOwner = asAddress(value.target_owner);
  if (!tokenContract || !offerer || !targetOwner) return null;
  return {
    tokenContract,
    tokenId: asNatString(key.token_id),
    offerer,
    tokenAmount: asNatString(value.token_amount),
    amountWtf: asNatString(value.amount_wtf),
    targetOwner,
  };
}

async function fetchOnChainSnapshot(limit: number): Promise<OnChainMarketSnapshot> {
  const storage = await fetchOnChainStorage();
  const [listingRows, auctionRows, offerRows] = await Promise.all([
    fetchBigMapRows(storage.listings, limit),
    fetchBigMapRows(storage.auctions, limit),
    fetchBigMapRows(storage.offers, limit),
  ]);

  return {
    admin: storage.admin,
    paused: Boolean(storage.paused),
    listings: listingRows.map(parseListingRow).filter(Boolean) as OnChainListing[],
    auctions: auctionRows.map(parseAuctionRow).filter(Boolean) as OnChainAuction[],
    offers: offerRows.map(parseOfferRow).filter(Boolean) as OnChainOffer[],
  };
}

async function loadAddressProfiles(addresses: string[]): Promise<Map<string, AddressProfile>> {
  const map = new Map<string, AddressProfile>();
  if (addresses.length === 0) return map;

  const unique = Array.from(new Set(addresses));
  const rows = await db
    .select({
      walletAddress: userWallets.walletAddress,
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      pfpImageUrl: users.pfpImageUrl,
    })
    .from(userWallets)
    .leftJoin(users, eq(userWallets.userId, users.id))
    .where(inArray(userWallets.walletAddress, unique));

  for (const row of rows) {
    map.set(row.walletAddress, {
      userId: row.userId ?? null,
      username: row.username ?? null,
      displayName: row.displayName ?? null,
      pfpImageUrl: row.pfpImageUrl ?? null,
    });
  }
  return map;
}

async function loadTokenMetadata(
  tokenContract: string,
  tokenId: string
): Promise<TokenMetadata> {
  const [row] = await db
    .select({
      tokenName: tokenMetadata.name,
      tokenThumbnail: tokenMetadata.thumbnail,
    })
    .from(tokenMetadata)
    .where(
      and(
        eq(tokenMetadata.tokenContract, tokenContract),
        eq(tokenMetadata.tokenId, tokenId)
      )
    )
    .limit(1);

  return {
    tokenName: row?.tokenName ?? null,
    tokenThumbnail: row?.tokenThumbnail ?? null,
  };
}

router.get("/api/marketplace/onchain", async (req, res) => {
  try {
    if (!getMarketplaceAddressOrNull()) {
      return contractNotConfiguredResponse(res);
    }
    const limit = clamp(parseInt((req.query.limit as string) || "200", 10), 1, 500);
    const snapshot = await fetchOnChainSnapshot(limit);

    const addressSet = new Set<string>();
    for (const listing of snapshot.listings) {
      addressSet.add(listing.seller);
    }
    for (const auction of snapshot.auctions) {
      addressSet.add(auction.creator);
      addressSet.add(auction.highestBidder);
      for (const share of auction.shares) {
        addressSet.add(share.recipient);
      }
    }
    for (const offer of snapshot.offers) {
      addressSet.add(offer.offerer);
      addressSet.add(offer.targetOwner);
    }
    const profiles = await loadAddressProfiles(Array.from(addressSet));

    const metaCache = new Map<string, Promise<TokenMetadata>>();
    const getMeta = (tokenContract: string, tokenId: string) => {
      const key = tokenKey(tokenContract, tokenId);
      if (!metaCache.has(key)) {
        metaCache.set(key, loadTokenMetadata(tokenContract, tokenId));
      }
      return metaCache.get(key)!;
    };

    const listings = await Promise.all(
      snapshot.listings.map(async (listing) => {
        const profile = profiles.get(listing.seller) ?? null;
        const meta = await getMeta(listing.tokenContract, listing.tokenId);
        return {
          ...listing,
          ...meta,
          sellerUserId: profile?.userId ?? null,
          sellerUsername: profile?.username ?? null,
          sellerDisplayName: profile?.displayName ?? null,
        };
      })
    );

    const auctions = await Promise.all(
      snapshot.auctions.map(async (auction) => {
        const creatorProfile = profiles.get(auction.creator) ?? null;
        const highestBidderProfile = profiles.get(auction.highestBidder) ?? null;
        const meta = await getMeta(auction.tokenContract, auction.tokenId);
        return {
          ...auction,
          ...meta,
          creatorUserId: creatorProfile?.userId ?? null,
          creatorUsername: creatorProfile?.username ?? null,
          creatorDisplayName: creatorProfile?.displayName ?? null,
          highestBidderUserId: highestBidderProfile?.userId ?? null,
          highestBidderUsername: highestBidderProfile?.username ?? null,
          highestBidderDisplayName: highestBidderProfile?.displayName ?? null,
        };
      })
    );

    const offers = await Promise.all(
      snapshot.offers.map(async (offer) => {
        const offererProfile = profiles.get(offer.offerer) ?? null;
        const ownerProfile = profiles.get(offer.targetOwner) ?? null;
        const meta = await getMeta(offer.tokenContract, offer.tokenId);
        return {
          ...offer,
          ...meta,
          offererUserId: offererProfile?.userId ?? null,
          offererUsername: offererProfile?.username ?? null,
          offererDisplayName: offererProfile?.displayName ?? null,
          targetOwnerUserId: ownerProfile?.userId ?? null,
          targetOwnerUsername: ownerProfile?.username ?? null,
          targetOwnerDisplayName: ownerProfile?.displayName ?? null,
        };
      })
    );

    res.json({
      contractAddress: getMarketplaceAddressOrNull(),
      admin: snapshot.admin,
      paused: snapshot.paused,
      listings,
      auctions,
      offers,
      counts: {
        listings: listings.length,
        auctions: auctions.length,
        offers: offers.length,
      },
    });
  } catch (err) {
    if (err instanceof MarketplaceNotConfiguredError) {
      return contractNotConfiguredResponse(res);
    }
    res.status(500).json({ error: "Failed to fetch on-chain marketplace state" });
  }
});

router.get("/api/marketplace/trade-board", async (req, res) => {
  try {
    if (!getMarketplaceAddressOrNull()) {
      return contractNotConfiguredResponse(res);
    }
    const owner = String(req.query.owner || "").trim();
    const q = String(req.query.q || "").trim();
    const limit = clamp(parseInt((req.query.limit as string) || "200", 10), 1, 500);
    const offset = Math.max(0, parseInt((req.query.offset as string) || "0", 10));

    const snapshot = await fetchOnChainSnapshot(500);

    const listedOrAuctioned = new Set<string>();
    for (const listing of snapshot.listings) {
      listedOrAuctioned.add(tokenKey(listing.tokenContract, listing.tokenId));
    }
    for (const auction of snapshot.auctions) {
      listedOrAuctioned.add(tokenKey(auction.tokenContract, auction.tokenId));
    }

    const offerByToken = new Map<string, OnChainOffer>();
    for (const offer of snapshot.offers) {
      offerByToken.set(tokenKey(offer.tokenContract, offer.tokenId), offer);
    }

    const whereParts = [
      sql`COALESCE(NULLIF(${walletHoldings.balance}, ''), '0')::numeric > 0`,
      sql`${walletHoldings.tokenContract} <> 'WTF'`,
    ];

    if (owner) {
      whereParts.push(eq(walletHoldings.walletAddress, owner));
    }
    if (q) {
      const like = `%${q}%`;
      whereParts.push(
        sql`(
          COALESCE(${tokenMetadata.name}, '') ILIKE ${like}
          OR COALESCE(${tokenMetadata.raw}::text, '') ILIKE ${like}
          OR ${walletHoldings.tokenContract} ILIKE ${like}
          OR CAST(${walletHoldings.tokenId} AS TEXT) ILIKE ${like}
          OR ${users.username} ILIKE ${like}
          OR ${users.displayName} ILIKE ${like}
          OR ${walletHoldings.walletAddress} ILIKE ${like}
        )`
      );
    }

    const lastSeenMkt = sql`COALESCE(${walletHoldings.tzktLastTime}, ${walletHoldings.lastActivityAt}, ${walletHoldings.derivedAt})`;

    const rows = await db
      .select({
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        walletAddress: walletHoldings.walletAddress,
        tokenContract: walletHoldings.tokenContract,
        tokenId: walletHoldings.tokenId,
        balance: walletHoldings.balance,
        tradeBoardQuantity: collectionItems.quantity,
        tokenName: tokenMetadata.name,
        tokenThumbnail: tokenMetadata.thumbnail,
        metadata: tokenMetadata.raw,
        creatorAddress: sql<string | null>`COALESCE(${tokenMetadata.creatorAddress}, ${tokenMetadata.raw} -> 'creators' ->> 0)`,
        updatedAt: walletHoldings.derivedAt,
      })
      .from(walletHoldings)
      .innerJoin(
        collectionItems,
        and(
          eq(collectionItems.tokenContract, walletHoldings.tokenContract),
          eq(collectionItems.tokenId, walletHoldings.tokenId)
        )
      )
      .innerJoin(
        collections,
        and(
          eq(collections.id, collectionItems.collectionId),
          eq(collections.userId, walletHoldings.userId),
          eq(collections.type, "trade_board_listing")
        )
      )
      .leftJoin(users, eq(walletHoldings.userId, users.id))
      .leftJoin(
        tokenMetadata,
        and(
          eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
          eq(tokenMetadata.tokenId, walletHoldings.tokenId)
        )
      )
      .where(and(...whereParts))
      .orderBy(desc(lastSeenMkt))
      .limit(limit)
      .offset(offset);

    const tokenIdentities = await resolveTokenDisplayIdentities(
      rows.map((row) => ({
        tokenContract: row.tokenContract,
        tokenId: row.tokenId,
        tokenName: row.tokenName,
        metadata: row.metadata,
        creatorAddress: row.creatorAddress,
      }))
    );

    const filtered = rows
      .filter(
        (row) => !listedOrAuctioned.has(tokenKey(row.tokenContract, row.tokenId))
      )
      .map((row) => {
        const key = tokenKey(row.tokenContract, row.tokenId);
        const identity = tokenIdentities.get(
          tokenIdentityKey(row.tokenContract, row.tokenId)
        );
        const offer = offerByToken.get(key);
        const walletBalance = Math.max(0, parseInt(row.balance || "0", 10) || 0);
        const tradeBoardQuantity = Math.max(0, Number(row.tradeBoardQuantity) || 0);
        const offerableQuantity = Math.min(walletBalance, tradeBoardQuantity);
        const activeOffer =
          offer && offer.targetOwner === row.walletAddress
            ? {
                ...offer,
                offererUser:
                  offer.offerer === row.walletAddress
                    ? {
                        userId: row.userId ?? null,
                        username: row.username ?? null,
                        displayName: row.displayName ?? null,
                      }
                    : undefined,
              }
            : null;

        return {
          ownerWallet: row.walletAddress,
          ownerUserId: row.userId ?? null,
          ownerUsername: row.username ?? null,
          ownerDisplayName: row.displayName ?? null,
          tokenContract: row.tokenContract,
          tokenId: row.tokenId,
          tokenAmount: String(offerableQuantity),
          tradeBoardQuantity,
          walletBalance: row.balance,
          tokenName: row.tokenName,
          tokenThumbnail: resolveTokenThumbnail(row.tokenThumbnail, row.metadata),
          metadata: row.metadata ?? null,
          creatorName: identity?.creatorName ?? null,
          creatorAddress: identity?.creatorAddress ?? row.creatorAddress,
          collectionName: identity?.collectionName ?? null,
          updatedAt: row.updatedAt,
          activeOffer,
        };
      })
      .filter((row) => Number(row.tokenAmount) > 0);

    res.json({
      contractAddress: getMarketplaceAddressOrNull(),
      items: filtered,
      pagination: {
        limit,
        offset,
        count: filtered.length,
        hasMore: rows.length === limit,
        nextOffset: offset + rows.length,
      },
    });
  } catch (err) {
    if (err instanceof MarketplaceNotConfiguredError) {
      return contractNotConfiguredResponse(res);
    }
    res.status(500).json({ error: "Failed to fetch trade board tokens" });
  }
});

router.get("/api/marketplace", async (req, res) => {
  try {
    const status = (req.query.status as string) || "active";
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

    const listings = await db
      .select({
        id: marketplaceListings.id,
        sellerUserId: marketplaceListings.sellerUserId,
        sellerUsername: users.username,
        sellerDisplayName: users.displayName,
        tokenContract: marketplaceListings.tokenContract,
        tokenId: marketplaceListings.tokenId,
        tokenName: marketplaceListings.tokenName,
        tokenThumbnail: marketplaceListings.tokenThumbnail,
        amount: marketplaceListings.amount,
        listingType: marketplaceListings.listingType,
        priceWtf: marketplaceListings.priceWtf,
        minBidWtf: marketplaceListings.minBidWtf,
        endTime: marketplaceListings.endTime,
        status: marketplaceListings.status,
        onChainId: marketplaceListings.onChainId,
        opHash: marketplaceListings.opHash,
        onchainStatus: marketplaceListings.onchainStatus,
        createdAt: marketplaceListings.createdAt,
      })
      .from(marketplaceListings)
      .leftJoin(users, eq(marketplaceListings.sellerUserId, users.id))
      .where(
        and(
          eq(marketplaceListings.status, status as any),
          ne(marketplaceListings.onchainStatus, "failed")
        )
      )
      .orderBy(desc(marketplaceListings.createdAt))
      .limit(limit);

    res.json(listings);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch listings" });
  }
});

router.get("/api/marketplace/mine", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const listings = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.sellerUserId, user.id))
      .orderBy(desc(marketplaceListings.createdAt))
      .limit(100);
    res.json(listings);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your listings" });
  }
});

router.get("/api/marketplace/external/mine", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: number };
    const wallets = await db
      .select({ walletAddress: userWallets.walletAddress })
      .from(userWallets)
      .where(eq(userWallets.userId, user.id));
    const walletAddresses = wallets.map((w) => w.walletAddress).filter(Boolean);
    if (walletAddresses.length === 0) {
      return res.json({ rows: [], fetchedAt: new Date().toISOString() });
    }

    const rows = await db
      .select({
        id: tokenListings.id,
        listingId: tokenListings.listingId,
        marketplace: tokenListings.marketplace,
        tokenContract: tokenListings.tokenContract,
        tokenId: tokenListings.tokenId,
        sellerAddress: tokenListings.sellerAddress,
        priceMutez: tokenListings.priceMutez,
        editions: tokenListings.editions,
        listedAt: tokenListings.listedAt,
        fetchedAt: tokenListings.fetchedAt,
        tokenName: tokenMetadata.name,
        tokenThumbnail: tokenMetadata.thumbnail,
      })
      .from(tokenListings)
      .leftJoin(
        tokenMetadata,
        and(
          eq(tokenMetadata.tokenContract, tokenListings.tokenContract),
          eq(tokenMetadata.tokenId, tokenListings.tokenId)
        )
      )
      .where(
        and(
          eq(tokenListings.active, true),
          inArray(tokenListings.sellerAddress, walletAddresses)
        )
      )
      .orderBy(desc(tokenListings.listedAt))
      .limit(100);

    res.json({
      rows: rows.map((row) => {
        const marketplace = String(row.marketplace ?? "");
        return {
          id: row.id,
          listingId: String(row.listingId),
          bigmapKey: Number(row.listingId),
          marketplaceContract: marketplace,
          marketplaceName: externalMarketplaceName(marketplace),
          cancelEntrypoint: externalCancelEntrypoint(marketplace),
          cancellable:
            /^[0-9]+$/.test(String(row.listingId)) &&
            isCancellableExternalMarketplace(marketplace),
          tokenContract: row.tokenContract,
          tokenId: row.tokenId,
          tokenName: row.tokenName,
          tokenThumbnail: row.tokenThumbnail,
          sellerAddress: row.sellerAddress,
          priceMutez: row.priceMutez?.toString?.() ?? String(row.priceMutez ?? "0"),
          editions: row.editions,
          listedAt: row.listedAt?.toISOString?.() ?? row.listedAt,
          fetchedAt: row.fetchedAt?.toISOString?.() ?? row.fetchedAt,
        };
      }),
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[marketplace] GET /external/mine failed:", err);
    res.status(500).json({ error: "Failed to fetch external listings" });
  }
});

router.get("/api/marketplace/:id", async (req, res) => {
  try {
    const [listing] = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, parseInt(req.params.id as string)));
    if (!listing) return res.status(404).json({ error: "Listing not found" });

    const bids = await db
      .select({
        id: marketplaceBids.id,
        bidderUserId: marketplaceBids.bidderUserId,
        bidderUsername: users.username,
        amountWtf: marketplaceBids.amountWtf,
        opHash: marketplaceBids.opHash,
        onchainStatus: marketplaceBids.onchainStatus,
        createdAt: marketplaceBids.createdAt,
      })
      .from(marketplaceBids)
      .leftJoin(users, eq(marketplaceBids.bidderUserId, users.id))
      .where(
        and(
          eq(marketplaceBids.listingId, listing.id),
          ne(marketplaceBids.onchainStatus, "failed")
        )
      )
      .orderBy(desc(marketplaceBids.amountWtf));

    res.json({ ...listing, bids });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch listing" });
  }
});

router.post("/api/marketplace", isAuthenticated, async (req, res) => {
  try {
    const marketplaceContract = getMarketplaceAddressOrNull();
    if (!marketplaceContract) {
      return contractNotConfiguredResponse(res);
    }

    const user = req.user as any;
    const {
      tokenContract,
      tokenId,
      tokenName,
      tokenThumbnail,
      amount,
      listingType,
      priceWtf,
      minBidWtf,
      endTime,
      opHash: rawOpHash,
      onChainId: rawOnChainId,
    } = req.body ?? {};

    if (
      typeof tokenContract !== "string" ||
      !/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(tokenContract)
    ) {
      return res.status(400).json({ error: "Invalid FA2 token contract address" });
    }

    const parsedTokenId = String(tokenId ?? "").trim();
    const parsedAmount = Number(amount);
    const parsedPrice = Number(priceWtf);
    const parsedMinBid =
      minBidWtf === null || typeof minBidWtf === "undefined"
        ? null
        : Number(minBidWtf);

    if (!/^[0-9]+$/.test(parsedTokenId)) {
      return res.status(400).json({ error: "Invalid token ID" });
    }
    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive integer" });
    }
    if (!Number.isInteger(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ error: "Price (WTF) must be a positive integer" });
    }
    if (listingType !== "buy_now" && listingType !== "auction") {
      return res.status(400).json({ error: "Invalid listing type" });
    }
    if (
      listingType === "auction" &&
      (parsedMinBid === null || !Number.isInteger(parsedMinBid) || parsedMinBid <= 0)
    ) {
      return res.status(400).json({ error: "Auction listings require a valid minimum bid" });
    }

    let parsedEndTime: Date | null = null;
    if (listingType === "auction") {
      if (!endTime || Number.isNaN(Date.parse(endTime))) {
        return res.status(400).json({ error: "Auction listings require a valid end time" });
      }
      parsedEndTime = new Date(endTime);
      if (parsedEndTime.getTime() <= Date.now()) {
        return res.status(400).json({ error: "Auction end time must be in the future" });
      }
    }

    // Every listing MUST come with the op hash from the on-chain call.
    // We verify it was sent by one of the user's linked wallets, targets
    // the configured marketplace contract, and hit the expected
    // entrypoint.  Anything else is rejected — the DB row was previously
    // written from pure client input which let anyone fabricate
    // listings for tokens they don't own.
    if (typeof rawOpHash !== "string" || !isValidOpHash(rawOpHash.trim())) {
      return res.status(400).json({
        error: "A valid on-chain operation hash is required to create a listing",
      });
    }
    const parsedOpHash = rawOpHash.trim();

    const parsedOnChainId =
      rawOnChainId !== null && rawOnChainId !== undefined
        ? String(rawOnChainId)
        : null;

    const linkedWallets = await db
      .select()
      .from(userWallets)
      .where(eq(userWallets.userId, user.id));
    if (linkedWallets.length === 0) {
      return res.status(400).json({
        error:
          "Link a wallet in your Profile before creating marketplace listings",
      });
    }
    const walletAddresses = linkedWallets.map((w) => w.walletAddress);

    const expectedEntrypoint =
      listingType === "auction" ? ["create_auction"] : ["create_listing"];

    let onchainStatus: "verified" | "pending_verification" = "pending_verification";
    let verifiedAt: Date | null = null;
    let verifiedSender: string | null = null;
    try {
      const transactions = await fetchTransactionsByHash(parsedOpHash, {
        retries: 2,
        retryDelayMs: 1500,
      });
      if (transactions.length > 0) {
        const match = findAppliedContractCall(transactions, {
          contract: marketplaceContract,
          senderOneOf: walletAddresses,
          entrypoint: expectedEntrypoint,
        });
        if (!match) {
          return res.status(400).json({
            error:
              "Operation hash does not match a create-listing call from a linked wallet to the marketplace contract",
            code: "OPHASH_MISMATCH",
          });
        }
        onchainStatus = "verified";
        verifiedAt = new Date();
        verifiedSender = match.sender;
      }
    } catch (err) {
      console.warn(
        "[marketplace.create] TzKT verification threw; proceeding as pending:",
        (err as Error).message
      );
    }

    const [listing] = await db
      .insert(marketplaceListings)
      .values({
        sellerUserId: user.id,
        tokenContract,
        tokenId: parsedTokenId,
        tokenName: tokenName || null,
        tokenThumbnail: sanitizeThumbnailUrl(tokenThumbnail) || null,
        amount: parsedAmount,
        listingType,
        priceWtf: parsedPrice,
        minBidWtf: listingType === "auction" ? parsedMinBid : null,
        endTime: parsedEndTime,
        opHash: parsedOpHash,
        onChainId: parsedOnChainId,
        onchainStatus,
        onchainVerifiedAt: verifiedAt,
        onchainVerifiedSender: verifiedSender,
      })
      .returning();

    if (onchainStatus === "verified") {
      try {
        const recipients = await getAllUserIdsExcept(user.id);
        const tokenLabel = tokenName || `Token #${parsedTokenId}`;
        const listingLabel = listingType === "auction" ? "auction" : "listing";
        await createNotificationsForUsers(recipients, {
          eventKey: "market.listing.created",
          preferenceKey: "market_new_listing",
          title: "New market listing",
          body: `${actorDisplayName(user)} posted a ${listingLabel}: ${tokenLabel} for ${formatWtf(parsedPrice)} WTF.`,
          sourceUserId: user.id,
          metadata: {
            listingId: listing.id,
            onChainId: parsedOnChainId,
            tokenContract,
            tokenId: parsedTokenId,
            amount: parsedAmount,
            listingType,
            priceWtf: String(parsedPrice),
          },
        });
      } catch {
        // Notifications should never block market writes.
      }
    }

    res.status(201).json(listing);
  } catch (err) {
    res.status(500).json({ error: "Failed to create listing" });
  }
});

router.put("/api/marketplace/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const id = parseInt(req.params.id as string);

    const [existing] = await db
      .select()
      .from(marketplaceListings)
      .where(eq(marketplaceListings.id, id));
    if (!existing) return res.status(404).json({ error: "Listing not found" });
    if (
      existing.sellerUserId !== user.id &&
      !(await hasPermission(user.role, "manage_channels"))
    )
      return res.status(403).json({ error: "Not authorized" });

    const parsed = listingUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid listing payload" });
    }
    if (Object.keys(parsed.data).length === 0) {
      return res.status(400).json({ error: "No updatable fields provided" });
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.priceWtf !== undefined) updates.priceWtf = parsed.data.priceWtf;
    if (parsed.data.minBidWtf !== undefined) updates.minBidWtf = parsed.data.minBidWtf;
    if (parsed.data.endTime !== undefined) updates.endTime = parsed.data.endTime;
    if (parsed.data.status !== undefined) updates.status = parsed.data.status;
    if (parsed.data.opHash !== undefined) updates.opHash = parsed.data.opHash;
    if (parsed.data.onChainId !== undefined) updates.onChainId = parsed.data.onChainId;
    if (parsed.data.tokenName !== undefined) updates.tokenName = parsed.data.tokenName;
    if (parsed.data.tokenThumbnail !== undefined) {
      updates.tokenThumbnail =
        parsed.data.tokenThumbnail === null
          ? null
          : sanitizeThumbnailUrl(parsed.data.tokenThumbnail);
    }

    const [updated] = await db
      .update(marketplaceListings)
      .set(updates)
      .where(eq(marketplaceListings.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update listing" });
  }
});

// POST /api/marketplace/:id/bid
//
// Records an auction bid after verifying the client-supplied opHash is a
// `bid_auction` call from the bidder's wallet to the marketplace
// contract.  We also require `amountWtf` to be a safe positive integer
// so nobody can feed the DB oversized / non-numeric values that break
// downstream BigInt math.
//
// Outbid / seller notifications are NOT sent from here — they're
// handled by the contract-activity ledger when the client reports a
// successful sign, which keeps the "real event" fan-out in one place.
router.post(
  "/api/marketplace/:id/bid",
  isAuthenticated,
  async (req, res) => {
    try {
      const marketplaceContract = getMarketplaceAddressOrNull();
      if (!marketplaceContract) {
        return contractNotConfiguredResponse(res);
      }

      const user = req.user as any;
      const listingId = parseInt(req.params.id as string);
      if (!Number.isInteger(listingId) || listingId <= 0) {
        return res.status(400).json({ error: "Invalid listing id" });
      }

      const { amountWtf: rawAmount, opHash: rawOpHash } = req.body ?? {};

      const parsedAmount = Number(rawAmount);
      if (
        !Number.isSafeInteger(parsedAmount) ||
        parsedAmount <= 0 ||
        parsedAmount > 10_000_000_000
      ) {
        return res
          .status(400)
          .json({ error: "Bid amount must be a positive integer up to 10,000,000,000" });
      }

      if (typeof rawOpHash !== "string" || !isValidOpHash(rawOpHash.trim())) {
        return res
          .status(400)
          .json({ error: "A valid on-chain operation hash is required to place a bid" });
      }
      const parsedOpHash = rawOpHash.trim();

      const [listing] = await db
        .select()
        .from(marketplaceListings)
        .where(eq(marketplaceListings.id, listingId));
      if (!listing) return res.status(404).json({ error: "Listing not found" });
      if (listing.status !== "active")
        return res.status(400).json({ error: "Listing is not active" });
      if (listing.listingType !== "auction")
        return res
          .status(400)
          .json({ error: "Can only bid on auction listings" });

      const bidderWallets = await db
        .select({ walletAddress: userWallets.walletAddress })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id));
      if (bidderWallets.length === 0) {
        return res
          .status(400)
          .json({ error: "Link a wallet in your Profile before bidding" });
      }
      const walletAddresses = bidderWallets.map((w) => w.walletAddress);

      let onchainStatus: "verified" | "pending_verification" = "pending_verification";
      let verifiedAt: Date | null = null;
      let verifiedSender: string | null = null;
      try {
        const transactions = await fetchTransactionsByHash(parsedOpHash, {
          retries: 2,
          retryDelayMs: 1500,
        });
        if (transactions.length > 0) {
          const match = findAppliedContractCall(transactions, {
            contract: marketplaceContract,
            senderOneOf: walletAddresses,
            entrypoint: ["bid_auction"],
          });
          if (!match) {
            return res.status(400).json({
              error:
                "Operation hash does not match a bid_auction call from a linked wallet",
              code: "OPHASH_MISMATCH",
            });
          }
          onchainStatus = "verified";
          verifiedAt = new Date();
          verifiedSender = match.sender;
        }
      } catch (err) {
        console.warn(
          "[marketplace.bid] TzKT verification threw; proceeding as pending:",
          (err as Error).message
        );
      }

      const [bid] = await db
        .insert(marketplaceBids)
        .values({
          listingId,
          bidderUserId: user.id,
          amountWtf: parsedAmount,
          opHash: parsedOpHash,
          onchainStatus,
          onchainVerifiedAt: verifiedAt,
          onchainVerifiedSender: verifiedSender,
        })
        .returning();

      res.status(201).json(bid);
    } catch (err) {
      res.status(500).json({ error: "Failed to place bid" });
    }
  }
);

router.post(
  "/api/marketplace/:id/cancel",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const id = parseInt(req.params.id as string);

      const [existing] = await db
        .select()
        .from(marketplaceListings)
        .where(eq(marketplaceListings.id, id));
      if (!existing)
        return res.status(404).json({ error: "Listing not found" });
      if (existing.status !== "active")
        return res.status(400).json({ error: "Listing is not active" });
      if (
        existing.sellerUserId !== user.id &&
        !(await hasPermission(user.role, "manage_channels"))
      )
        return res.status(403).json({ error: "Not authorized" });

      const [updated] = await db
        .update(marketplaceListings)
        .set({ status: "cancelled" as any })
        .where(eq(marketplaceListings.id, id))
        .returning();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to cancel listing" });
    }
  }
);

export default router;
