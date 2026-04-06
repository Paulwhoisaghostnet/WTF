import { Router } from "express";
import { db } from "../db";
import {
  marketplaceListings,
  marketplaceBids,
  users,
  userWallets,
  userOwnedTokens,
} from "@shared/schema";
import { eq, desc, and, inArray, sql } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";

const router = Router();

const TZKT_BASE = "https://api.tzkt.io/v1";
const DEFAULT_MARKETPLACE_CONTRACT = "KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj";
const MARKETPLACE_CONTRACT_ADDRESS =
  process.env.MARKETPLACE_CONTRACT_ADDRESS ||
  process.env.VITE_MARKETPLACE_CONTRACT_ADDRESS ||
  DEFAULT_MARKETPLACE_CONTRACT;

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
  const url = `${TZKT_BASE}/contracts/${MARKETPLACE_CONTRACT_ADDRESS}/storage`;
  return fetchJson<OnChainStorage>(url);
}

async function fetchBigMapRows(
  bigMapId: string | number,
  limit: number
): Promise<BigMapKeyRow[]> {
  const safeLimit = clamp(limit, 1, 500);
  const url = `${TZKT_BASE}/bigmaps/${bigMapId}/keys?active=true&limit=${safeLimit}`;
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
      tokenName: userOwnedTokens.tokenName,
      tokenThumbnail: userOwnedTokens.tokenThumbnail,
    })
    .from(userOwnedTokens)
    .where(
      and(
        eq(userOwnedTokens.tokenContract, tokenContract),
        eq(userOwnedTokens.tokenId, tokenId)
      )
    )
    .orderBy(desc(userOwnedTokens.updatedAt))
    .limit(1);

  return {
    tokenName: row?.tokenName ?? null,
    tokenThumbnail: row?.tokenThumbnail ?? null,
  };
}

router.get("/api/marketplace/onchain", async (req, res) => {
  try {
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
      contractAddress: MARKETPLACE_CONTRACT_ADDRESS,
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
    res.status(500).json({ error: "Failed to fetch on-chain marketplace state" });
  }
});

router.get("/api/marketplace/trade-board", async (req, res) => {
  try {
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
      sql`COALESCE(NULLIF(${userOwnedTokens.balance}, ''), '0')::numeric > 0`,
      sql`${userOwnedTokens.tokenContract} <> 'WTF'`,
      eq(userOwnedTokens.onTradeBoard, true),
    ];

    if (owner) {
      whereParts.push(eq(userOwnedTokens.walletAddress, owner));
    }
    if (q) {
      whereParts.push(
        sql`(
          ${userOwnedTokens.tokenName} ILIKE ${`%${q}%`}
          OR ${userOwnedTokens.tokenContract} ILIKE ${`%${q}%`}
          OR CAST(${userOwnedTokens.tokenId} AS TEXT) ILIKE ${`%${q}%`}
          OR ${users.username} ILIKE ${`%${q}%`}
          OR ${users.displayName} ILIKE ${`%${q}%`}
          OR ${userOwnedTokens.walletAddress} ILIKE ${`%${q}%`}
        )`
      );
    }

    const rows = await db
      .select({
        userId: users.id,
        username: users.username,
        displayName: users.displayName,
        walletAddress: userOwnedTokens.walletAddress,
        tokenContract: userOwnedTokens.tokenContract,
        tokenId: userOwnedTokens.tokenId,
        balance: userOwnedTokens.balance,
        tokenName: userOwnedTokens.tokenName,
        tokenThumbnail: userOwnedTokens.tokenThumbnail,
        metadata: userOwnedTokens.metadata,
        updatedAt: userOwnedTokens.updatedAt,
      })
      .from(userOwnedTokens)
      .leftJoin(users, eq(userOwnedTokens.userId, users.id))
      .where(and(...whereParts))
      .orderBy(desc(userOwnedTokens.lastSeenAt))
      .limit(limit)
      .offset(offset);

    const filtered = rows
      .filter(
        (row) => !listedOrAuctioned.has(tokenKey(row.tokenContract, row.tokenId))
      )
      .map((row) => {
        const key = tokenKey(row.tokenContract, row.tokenId);
        const offer = offerByToken.get(key);
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
          tokenAmount: row.balance,
          tokenName: row.tokenName,
          tokenThumbnail: row.tokenThumbnail,
          metadata: row.metadata ?? null,
          updatedAt: row.updatedAt,
          activeOffer,
        };
      });

    res.json({
      contractAddress: MARKETPLACE_CONTRACT_ADDRESS,
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
        createdAt: marketplaceListings.createdAt,
      })
      .from(marketplaceListings)
      .leftJoin(users, eq(marketplaceListings.sellerUserId, users.id))
      .where(eq(marketplaceListings.status, status as any))
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
        createdAt: marketplaceBids.createdAt,
      })
      .from(marketplaceBids)
      .leftJoin(users, eq(marketplaceBids.bidderUserId, users.id))
      .where(eq(marketplaceBids.listingId, listing.id))
      .orderBy(desc(marketplaceBids.amountWtf));

    res.json({ ...listing, bids });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch listing" });
  }
});

router.post("/api/marketplace", isAuthenticated, async (req, res) => {
  try {
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

    // Require at least one linked wallet before listing.
    const linkedWallets = await db
      .select()
      .from(userWallets)
      .where(eq(userWallets.userId, user.id))
      .limit(1);
    if (linkedWallets.length === 0) {
      return res.status(400).json({
        error:
          "Link a wallet in your Profile before creating marketplace listings",
      });
    }

    const parsedOpHash =
      typeof rawOpHash === "string" && rawOpHash.trim() ? rawOpHash.trim() : null;
    const parsedOnChainId =
      rawOnChainId !== null && rawOnChainId !== undefined
        ? String(rawOnChainId)
        : null;

    const [listing] = await db
      .insert(marketplaceListings)
      .values({
        sellerUserId: user.id,
        tokenContract,
        tokenId: parsedTokenId,
        tokenName: tokenName || null,
        tokenThumbnail: tokenThumbnail || null,
        amount: parsedAmount,
        listingType,
        priceWtf: parsedPrice,
        minBidWtf: listingType === "auction" ? parsedMinBid : null,
        endTime: parsedEndTime,
        opHash: parsedOpHash,
        onChainId: parsedOnChainId,
      })
      .returning();
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
      !["host", "cohost"].includes(user.role)
    )
      return res.status(403).json({ error: "Not authorized" });

    const [updated] = await db
      .update(marketplaceListings)
      .set(req.body)
      .where(eq(marketplaceListings.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update listing" });
  }
});

router.post(
  "/api/marketplace/:id/bid",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const listingId = parseInt(req.params.id as string);

      const [listing] = await db
        .select()
        .from(marketplaceListings)
        .where(eq(marketplaceListings.id, listingId));
      if (!listing)
        return res.status(404).json({ error: "Listing not found" });
      if (listing.status !== "active")
        return res.status(400).json({ error: "Listing is not active" });
      if (listing.listingType !== "auction")
        return res
          .status(400)
          .json({ error: "Can only bid on auction listings" });

      const [bid] = await db
        .insert(marketplaceBids)
        .values({
          listingId,
          bidderUserId: user.id,
          amountWtf: req.body.amountWtf,
          opHash: req.body.opHash,
        })
        .returning();
      res.status(201).json(bid);
    } catch (err) {
      res.status(500).json({ error: "Failed to place bid" });
    }
  }
);

router.post(
  "/api/marketplace/:id/sold",
  isAuthenticated,
  async (req, res) => {
    try {
      const id = parseInt(req.params.id as string);
      const { opHash: buyOpHash } = req.body ?? {};

      const [existing] = await db
        .select()
        .from(marketplaceListings)
        .where(eq(marketplaceListings.id, id));
      if (!existing)
        return res.status(404).json({ error: "Listing not found" });
      if (existing.status !== "active")
        return res.status(400).json({ error: "Listing is not active" });

      const [updated] = await db
        .update(marketplaceListings)
        .set({
          status: "sold" as any,
          ...(buyOpHash ? { opHash: String(buyOpHash) } : {}),
        })
        .where(eq(marketplaceListings.id, id))
        .returning();
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: "Failed to mark listing as sold" });
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
        !["host", "cohost"].includes(user.role)
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
