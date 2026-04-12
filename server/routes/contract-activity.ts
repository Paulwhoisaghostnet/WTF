import { Router } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db";
import { contractActivityLogs, marketplaceListings, users } from "@shared/schema";
import { isAuthenticated, requireRole } from "../auth/passport";
import { formatWtf } from "@shared/types";
import {
  actorDisplayName,
  createNotification,
  getUserIdByWalletAddress,
} from "../lib/notifications";
import { z } from "zod";

const router = Router();

type ActivityStatus = "attempt" | "success" | "failure";

const TZKT_BASE = "https://api.tzkt.io/v1";
const DEFAULT_MARKETPLACE_CONTRACT = "KT1Jt6gU4fS5UYHdhsYyr2EfpBJtXZLrPPfj";
const MARKETPLACE_CONTRACT_ADDRESS =
  process.env.MARKETPLACE_CONTRACT_ADDRESS ||
  process.env.VITE_MARKETPLACE_CONTRACT_ADDRESS ||
  DEFAULT_MARKETPLACE_CONTRACT;

interface OnChainStorage {
  auctions: string | number;
}

interface AuctionBigMapRow {
  value?: {
    creator?: string;
    highest_bidder?: string;
    has_bid?: boolean;
  };
}

const contractActivityPayloadSchema = z
  .object({
    interactionId: z.string().trim().min(1).max(80).optional(),
    status: z.enum(["attempt", "success", "failure"]).optional(),
    walletAddress: z.string().trim().max(36).optional(),
    module: z.string().trim().min(1).max(60).optional(),
    action: z.string().trim().min(1).max(120).optional(),
    contractAddress: z.string().trim().max(36).optional(),
    entrypoint: z.string().trim().max(120).optional(),
    opHash: z.string().trim().max(51).optional(),
    network: z.string().trim().max(24).optional(),
    rpcUrl: z.string().trim().max(2000).optional(),
    params: z.record(z.string(), z.unknown()).nullable().optional(),
    error: z.string().max(4000).optional(),
    clientTimestamp: z.string().optional(),
  })
  .strict();

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function truncate(value: unknown, max: number): string | null {
  if (value == null) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

function parseStatus(value: unknown): ActivityStatus {
  const s = String(value || "").trim().toLowerCase();
  if (s === "success" || s === "failure") return s;
  return "attempt";
}

function coerceClientTimestamp(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function asParamsObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  return input as Record<string, unknown>;
}

function parseNat(input: unknown): number | null {
  const n = Number(String(input ?? ""));
  if (!Number.isSafeInteger(n) || n < 0) return null;
  return n;
}

function parseTokenContext(params: Record<string, unknown>): {
  tokenContract: string | null;
  tokenId: string | null;
} {
  const rawContract = params.tokenContract ?? params.token_contract;
  const rawTokenId = params.tokenId ?? params.token_id;

  const tokenContract =
    typeof rawContract === "string" && rawContract.trim().startsWith("KT1")
      ? rawContract.trim()
      : null;

  const tokenId =
    rawTokenId != null && /^[0-9]+$/.test(String(rawTokenId).trim())
      ? String(rawTokenId).trim()
      : null;

  return { tokenContract, tokenId };
}

function parseAuctionId(params: Record<string, unknown>): number | null {
  return parseNat(params.auctionId ?? params.auction_id);
}

function parseListingId(params: Record<string, unknown>): number | null {
  return parseNat(params.listingId ?? params.listing_id);
}

function parseAmountWtf(params: Record<string, unknown>): string | null {
  const raw = params.amountWtf ?? params.amount_wtf;
  if (raw == null) return null;
  const v = String(raw).trim();
  return /^[0-9]+$/.test(v) ? v : null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TzKT request failed (${res.status}) for ${url}`);
  }
  return res.json() as Promise<T>;
}

async function fetchAuctionSummary(auctionId: number): Promise<{
  creator: string | null;
  highestBidder: string | null;
  hasBid: boolean;
}> {
  try {
    const storage = await fetchJson<OnChainStorage>(
      `${TZKT_BASE}/contracts/${MARKETPLACE_CONTRACT_ADDRESS}/storage`
    );
    const row = await fetchJson<AuctionBigMapRow>(
      `${TZKT_BASE}/bigmaps/${storage.auctions}/keys/${auctionId}`
    );

    const creator =
      typeof row?.value?.creator === "string" ? row.value.creator : null;
    const highestBidder =
      typeof row?.value?.highest_bidder === "string"
        ? row.value.highest_bidder
        : null;
    const hasBid = Boolean(row?.value?.has_bid);

    return {
      creator,
      highestBidder,
      hasBid,
    };
  } catch {
    return {
      creator: null,
      highestBidder: null,
      hasBid: false,
    };
  }
}

async function findLikelyActiveOfferer(
  activityId: number,
  tokenContract: string,
  tokenId: string
): Promise<{ userId: number | null; walletAddress: string | null } | null> {
  const [lastOffer] = await db
    .select({
      id: contractActivityLogs.id,
      userId: contractActivityLogs.userId,
      walletAddress: contractActivityLogs.walletAddress,
    })
    .from(contractActivityLogs)
    .where(
      and(
        eq(contractActivityLogs.status, "success"),
        eq(contractActivityLogs.module, "marketplace"),
        eq(contractActivityLogs.action, "place_offer"),
        sql`${contractActivityLogs.id} < ${activityId}`,
        sql`coalesce(${contractActivityLogs.params}->>'tokenContract', ${contractActivityLogs.params}->>'token_contract') = ${tokenContract}`,
        sql`coalesce(${contractActivityLogs.params}->>'tokenId', ${contractActivityLogs.params}->>'token_id') = ${tokenId}`
      )
    )
    .orderBy(desc(contractActivityLogs.id))
    .limit(1);

  if (!lastOffer) return null;

  const [resolved] = await db
    .select({ id: contractActivityLogs.id })
    .from(contractActivityLogs)
    .where(
      and(
        eq(contractActivityLogs.status, "success"),
        eq(contractActivityLogs.module, "marketplace"),
        sql`${contractActivityLogs.id} > ${lastOffer.id}`,
        sql`${contractActivityLogs.id} < ${activityId}`,
        sql`${contractActivityLogs.action} in ('cancel_offer', 'accept_offer')`,
        sql`coalesce(${contractActivityLogs.params}->>'tokenContract', ${contractActivityLogs.params}->>'token_contract') = ${tokenContract}`,
        sql`coalesce(${contractActivityLogs.params}->>'tokenId', ${contractActivityLogs.params}->>'token_id') = ${tokenId}`
      )
    )
    .orderBy(desc(contractActivityLogs.id))
    .limit(1);

  if (resolved) return null;

  return {
    userId: lastOffer.userId ?? null,
    walletAddress: lastOffer.walletAddress ?? null,
  };
}

async function dispatchSuccessNotifications(args: {
  activityId: number;
  user: any;
  module: string;
  action: string;
  walletAddress: string | null;
  opHash: string | null;
  params: Record<string, unknown>;
}) {
  const { activityId, user, module, action, walletAddress, opHash, params } = args;
  if (module !== "marketplace") return;

  const actorName = actorDisplayName(user);
  const actorUserId = user?.id ?? null;

  if (action === "place_offer") {
    const { tokenContract, tokenId } = parseTokenContext(params);
    const targetOwnerRaw = params.targetOwner ?? params.target_owner;
    const targetOwner =
      typeof targetOwnerRaw === "string" ? targetOwnerRaw.trim() : null;
    const amountWtf = parseAmountWtf(params);

    if (targetOwner) {
      const ownerUserId = await getUserIdByWalletAddress(targetOwner);
      if (ownerUserId && ownerUserId !== actorUserId) {
        await createNotification({
          userId: ownerUserId,
          sourceUserId: actorUserId,
          eventKey: "market.offer.received",
          preferenceKey: "market_offer_received",
          title: "New offer on your token",
          body: `${actorName} offered ${amountWtf ? formatWtf(amountWtf) : "?"} WTF on ${tokenContract || "token"}#${tokenId || "?"}.`,
          metadata: {
            tokenContract,
            tokenId,
            amountWtf,
            offererWallet: walletAddress,
            targetOwner,
            opHash,
          },
        });
      }
    }
    return;
  }

  if (action === "accept_offer") {
    const { tokenContract, tokenId } = parseTokenContext(params);
    if (!tokenContract || !tokenId) return;

    const offerer = await findLikelyActiveOfferer(activityId, tokenContract, tokenId);
    if (offerer?.userId && offerer.userId !== actorUserId) {
      await createNotification({
        userId: offerer.userId,
        sourceUserId: actorUserId,
        eventKey: "market.offer.accepted",
        preferenceKey: "market_offer_accepted",
        title: "Your offer was accepted",
        body: `${actorName} accepted your offer for ${tokenContract}#${tokenId}.`,
        metadata: {
          tokenContract,
          tokenId,
          offererWallet: offerer.walletAddress,
          opHash,
        },
      });
    }
    return;
  }

  if (action === "bid_auction") {
    const auctionId = parseAuctionId(params);
    if (auctionId == null) return;

    const amountWtf = parseAmountWtf(params);
    const summary = await fetchAuctionSummary(auctionId);

    if (summary.creator) {
      const creatorUserId = await getUserIdByWalletAddress(summary.creator);
      if (creatorUserId && creatorUserId !== actorUserId) {
        await createNotification({
          userId: creatorUserId,
          sourceUserId: actorUserId,
          eventKey: "market.auction.bid",
          preferenceKey: "market_bid_received",
          title: "New bid on your auction",
          body: `${actorName} bid ${amountWtf ? formatWtf(amountWtf) : "?"} WTF on auction #${auctionId}.`,
          metadata: {
            auctionId,
            amountWtf,
            bidderWallet: walletAddress,
            creatorWallet: summary.creator,
            opHash,
          },
        });
      }
    }

    const outbidFilters: any[] = [
      eq(contractActivityLogs.status, "success"),
      eq(contractActivityLogs.module, "marketplace"),
      eq(contractActivityLogs.action, "bid_auction"),
      sql`${contractActivityLogs.id} < ${activityId}`,
      sql`coalesce(${contractActivityLogs.params}->>'auctionId', ${contractActivityLogs.params}->>'auction_id') = ${String(
        auctionId
      )}`,
    ];

    if (walletAddress) {
      outbidFilters.push(sql`${contractActivityLogs.walletAddress} <> ${walletAddress}`);
    }

    const [previousBidder] = await db
      .select({
        userId: contractActivityLogs.userId,
        walletAddress: contractActivityLogs.walletAddress,
      })
      .from(contractActivityLogs)
      .where(and(...outbidFilters))
      .orderBy(desc(contractActivityLogs.id))
      .limit(1);

    if (previousBidder?.userId && previousBidder.userId !== actorUserId) {
      await createNotification({
        userId: previousBidder.userId,
        sourceUserId: actorUserId,
        eventKey: "market.auction.outbid",
        preferenceKey: "market_auction_outbid",
        title: "You were outbid",
        body: `${actorName} outbid you on auction #${auctionId}.`,
        metadata: {
          auctionId,
          outbidBy: walletAddress,
          previousBidderWallet: previousBidder.walletAddress,
          opHash,
        },
      });
    }
    return;
  }

  if (action === "buy_listing") {
    const listingId = parseListingId(params);
    if (listingId == null) return;

    const [listing] = await db
      .select({
        id: marketplaceListings.id,
        sellerUserId: marketplaceListings.sellerUserId,
        tokenContract: marketplaceListings.tokenContract,
        tokenId: marketplaceListings.tokenId,
        tokenName: marketplaceListings.tokenName,
        priceWtf: marketplaceListings.priceWtf,
      })
      .from(marketplaceListings)
      .where(eq(marketplaceListings.onChainId, String(listingId)))
      .orderBy(desc(marketplaceListings.createdAt))
      .limit(1);

    if (!listing) return;

    await db
      .update(marketplaceListings)
      .set({
        status: "sold" as any,
        ...(opHash ? { opHash } : {}),
      })
      .where(eq(marketplaceListings.id, listing.id));

    if (listing.sellerUserId !== actorUserId) {
      await createNotification({
        userId: listing.sellerUserId,
        sourceUserId: actorUserId,
        eventKey: "market.listing.sold",
        preferenceKey: "market_listing_sold",
        title: "Your listing sold",
        body: `${actorName} bought ${listing.tokenName || `${listing.tokenContract}#${listing.tokenId}`} for ${formatWtf(String(listing.priceWtf || 0))} WTF.`,
        metadata: {
          listingId: listing.id,
          onChainId: listingId,
          tokenContract: listing.tokenContract,
          tokenId: listing.tokenId,
          priceWtf: String(listing.priceWtf || 0),
          opHash,
        },
      });
    }
    return;
  }

  if (action === "settle_auction") {
    const auctionId = parseAuctionId(params);
    if (auctionId == null) return;

    const summary = await fetchAuctionSummary(auctionId);

    if (summary.creator) {
      const creatorUserId = await getUserIdByWalletAddress(summary.creator);
      if (creatorUserId && creatorUserId !== actorUserId) {
        await createNotification({
          userId: creatorUserId,
          sourceUserId: actorUserId,
          eventKey: "market.auction.settled",
          preferenceKey: "market_auction_settled",
          title: "Auction settled",
          body: `${actorName} settled auction #${auctionId}.`,
          metadata: {
            auctionId,
            creatorWallet: summary.creator,
            winnerWallet: summary.highestBidder,
            hasBid: summary.hasBid,
            opHash,
          },
        });
      }
    }

    if (summary.hasBid && summary.highestBidder) {
      const winnerUserId = await getUserIdByWalletAddress(summary.highestBidder);
      if (winnerUserId && winnerUserId !== actorUserId) {
        await createNotification({
          userId: winnerUserId,
          sourceUserId: actorUserId,
          eventKey: "market.auction.won",
          preferenceKey: "market_auction_settled",
          title: "Auction won",
          body: `Auction #${auctionId} has settled and you won the token.`,
          metadata: {
            auctionId,
            winnerWallet: summary.highestBidder,
            creatorWallet: summary.creator,
            opHash,
          },
        });
      }
    }
  }
}

router.post("/api/contract-activity", isAuthenticated, async (req, res) => {
  try {
    const parsed = contractActivityPayloadSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid contract activity payload" });
    }

    const body = parsed.data;
    const status = parseStatus(body.status);
    const interactionId =
      truncate(body.interactionId, 80) ||
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

    const user = (req as any).user || null;
    const userId = user?.id ?? null;

    const [logged] = await db
      .insert(contractActivityLogs)
      .values({
        interactionId,
        userId,
        walletAddress: truncate(body.walletAddress, 36),
        module: truncate(body.module, 60) || "unknown",
        action: truncate(body.action, 120) || "unknown",
        status,
        contractAddress: truncate(body.contractAddress, 36),
        entrypoint: truncate(body.entrypoint, 120),
        opHash: truncate(body.opHash, 51),
        network: truncate(body.network, 24),
        rpcUrl: truncate(body.rpcUrl, 2000),
        params: typeof body.params === "object" && body.params !== null ? body.params : null,
        error: truncate(body.error, 4000),
        clientTimestamp: coerceClientTimestamp(body.clientTimestamp),
      })
      .returning({
        id: contractActivityLogs.id,
      });

    if (status === "success") {
      try {
        await dispatchSuccessNotifications({
          activityId: logged.id,
          user,
          module: String(body.module || ""),
          action: String(body.action || ""),
          walletAddress: truncate(body.walletAddress, 36),
          opHash: truncate(body.opHash, 51),
          params: asParamsObject(body.params),
        });
      } catch {
        // Notification dispatch should never block activity logging.
      }
    }

    if (status === "failure" && userId) {
      try {
        await createNotification({
          userId,
          sourceUserId: null,
          eventKey: "contract.action.failed",
          preferenceKey: "contract_action_failed",
          title: "Contract interaction failed",
          body: `${String(body.action || "Action")} failed${body.error ? `: ${String(body.error)}` : "."}`,
          metadata: {
            module: truncate(body.module, 60),
            action: truncate(body.action, 120),
            contractAddress: truncate(body.contractAddress, 36),
            entrypoint: truncate(body.entrypoint, 120),
            opHash: truncate(body.opHash, 51),
            params:
              typeof body.params === "object" && body.params !== null
                ? body.params
                : null,
            error: truncate(body.error, 4000),
          },
        });
      } catch {
        // Ignore notification errors for failures.
      }
    }

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to record contract activity" });
  }
});

router.get(
  "/api/admin/contract-activity",
  requireRole("admin", "host", "cohost"),
  async (req, res) => {
    try {
      const limit = clamp(parseInt(String(req.query.limit || "250"), 10), 1, 1000);
      const status = String(req.query.status || "").trim().toLowerCase();
      const q = String(req.query.q || "").trim();
      const wallet = String(req.query.wallet || "").trim();
      const moduleFilter = String(req.query.module || "").trim();

      const where: any[] = [];
      if (status === "attempt" || status === "success" || status === "failure") {
        where.push(eq(contractActivityLogs.status, status as ActivityStatus));
      }
      if (wallet) {
        where.push(eq(contractActivityLogs.walletAddress, wallet));
      }
      if (moduleFilter) {
        where.push(eq(contractActivityLogs.module, moduleFilter));
      }
      if (q) {
        where.push(
          or(
            ilike(contractActivityLogs.action, `%${q}%`),
            ilike(contractActivityLogs.module, `%${q}%`),
            ilike(contractActivityLogs.entrypoint, `%${q}%`),
            ilike(contractActivityLogs.contractAddress, `%${q}%`),
            ilike(contractActivityLogs.walletAddress, `%${q}%`),
            ilike(contractActivityLogs.opHash, `%${q}%`),
            ilike(contractActivityLogs.error, `%${q}%`),
            ilike(users.username, `%${q}%`),
            ilike(users.displayName, `%${q}%`)
          )
        );
      }

      const rows = await db
        .select({
          id: contractActivityLogs.id,
          interactionId: contractActivityLogs.interactionId,
          userId: contractActivityLogs.userId,
          username: users.username,
          displayName: users.displayName,
          walletAddress: contractActivityLogs.walletAddress,
          module: contractActivityLogs.module,
          action: contractActivityLogs.action,
          status: contractActivityLogs.status,
          contractAddress: contractActivityLogs.contractAddress,
          entrypoint: contractActivityLogs.entrypoint,
          opHash: contractActivityLogs.opHash,
          network: contractActivityLogs.network,
          rpcUrl: contractActivityLogs.rpcUrl,
          params: contractActivityLogs.params,
          error: contractActivityLogs.error,
          clientTimestamp: contractActivityLogs.clientTimestamp,
          createdAt: contractActivityLogs.createdAt,
        })
        .from(contractActivityLogs)
        .leftJoin(users, eq(contractActivityLogs.userId, users.id))
        .where(where.length ? and(...where) : undefined)
        .orderBy(desc(contractActivityLogs.createdAt))
        .limit(limit);

      res.json(rows);
    } catch {
      res.status(500).json({ error: "Failed to fetch contract activity ledger" });
    }
  }
);

export default router;
