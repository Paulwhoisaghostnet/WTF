/**
 * Phase 10 — WTF auctions.
 *
 * Operators list off-season perks (elimination immunity, custom round
 * name, first-into-R0, a 1/1 from a collaborator artist). The auction
 * is WTF-denominated and last-bid-wins by timestamp. Proceeds move
 * from the winner's wallet → operator wallet on settlement. Nothing
 * here signs or transfers on-chain — settlement just records the
 * op_hash the winner provides after an external-wallet transfer lands. The
 * settlement route verifies the applied TzKT operation, linked winning wallet,
 * WTF contract/token, operator destination, and exact winning amount before it
 * marks the auction settled.
 */

import { Router, type Request } from "express";
import { z } from "zod";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db";
import {
  operatorActions,
  wtfAuctionBids,
  wtfAuctions,
  users,
  userWallets,
} from "@shared/schema";
import { isAuthenticated, requirePermission } from "../auth/passport";
import { verifyWtfTransferToOperatorByHash } from "../lib/wtf-op-verification";

const router = Router();

function clientIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0]?.trim() ?? null;
  }
  const ip = req.socket.remoteAddress ?? null;
  return ip ? String(ip).slice(0, 64) : null;
}

async function logOperatorAction(opts: {
  actorId: number | null;
  actionKind: string;
  targetKind: string;
  targetId: number | null;
  payload?: Record<string, unknown>;
  req: Request;
}) {
  try {
    await db.insert(operatorActions).values({
      actorUserId: opts.actorId,
      actionKind: opts.actionKind,
      targetKind: opts.targetKind,
      targetId: opts.targetId,
      payloadJson: (opts.payload ?? {}) as Record<string, unknown>,
      ip: clientIp(opts.req),
    });
  } catch (err) {
    console.warn("[wtf-auctions] audit write failed:", err);
  }
}

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional().nullable(),
  perkKind: z.string().trim().min(1).max(60),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  minBidWtf: z.string().regex(/^\d+$/).default("1"),
  bidIncrementWtf: z.string().regex(/^\d+$/).default("1"),
});

const bidSchema = z.object({
  amountWtf: z.string().regex(/^\d+$/),
});

const settleSchema = z.object({
  winningBidId: z.number().int().positive(),
  opHash: z.string().min(30).max(80),
});

/* ── admin create ────────────────────────────────────────── */
router.post(
  "/api/wtf-auctions",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const starts = new Date(parsed.data.startsAt);
      const ends = new Date(parsed.data.endsAt);
      if (starts >= ends) {
        return res.status(400).json({ error: "startsAt must be before endsAt" });
      }
      const actor = req.user as any;
      const [row] = await db
        .insert(wtfAuctions)
        .values({
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          perkKind: parsed.data.perkKind,
          startsAt: starts,
          endsAt: ends,
          minBidWtf: parsed.data.minBidWtf,
          bidIncrementWtf: parsed.data.bidIncrementWtf,
          createdByUserId: actor?.id ?? null,
        })
        .returning();
      await logOperatorAction({
        actorId: actor?.id ?? null,
        actionKind: "wtf_auction_create",
        targetKind: "wtf_auction",
        targetId: row.id,
        payload: { title: parsed.data.title },
        req,
      });
      res.status(201).json(row);
    } catch (err) {
      console.error("[wtf-auctions] create failed:", err);
      res.status(500).json({ error: "Failed to create auction" });
    }
  }
);

/* ── admin transition ─────────────────────────────────────── */
const transitionSchema = z.object({
  target: z.enum(["live", "ended", "cancelled"]),
});
router.post(
  "/api/wtf-auctions/:id/transition",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id ?? ""), 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid auction id" });
      }
      const parsed = transitionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid target" });
      }
      const [auction] = await db
        .select()
        .from(wtfAuctions)
        .where(eq(wtfAuctions.id, id));
      if (!auction) return res.status(404).json({ error: "Auction not found" });
      const allowed: Record<string, string[]> = {
        draft: ["live", "cancelled"],
        live: ["ended", "cancelled"],
        ended: [],
        settled: [],
        cancelled: [],
      };
      if (!allowed[auction.status].includes(parsed.data.target)) {
        return res
          .status(400)
          .json({
            error: `Illegal transition ${auction.status} → ${parsed.data.target}`,
          });
      }
      await db
        .update(wtfAuctions)
        .set({ status: parsed.data.target, updatedAt: new Date() })
        .where(eq(wtfAuctions.id, id));
      const actor = req.user as any;
      await logOperatorAction({
        actorId: actor?.id ?? null,
        actionKind: `wtf_auction_${parsed.data.target}`,
        targetKind: "wtf_auction",
        targetId: id,
        payload: parsed.data,
        req,
      });
      res.json({ ok: true, status: parsed.data.target });
    } catch (err) {
      res.status(500).json({ error: "Failed to transition auction" });
    }
  }
);

/* ── admin settle (record winner + on-chain op hash) ────── */
router.post(
  "/api/wtf-auctions/:id/settle",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id ?? ""), 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid auction id" });
      }
      const parsed = settleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const [auction] = await db
        .select()
        .from(wtfAuctions)
        .where(eq(wtfAuctions.id, id));
      if (!auction) return res.status(404).json({ error: "Auction not found" });
      if (auction.status !== "ended") {
        return res.status(400).json({ error: "Auction must be 'ended' before settlement" });
      }
      const [bid] = await db
        .select()
        .from(wtfAuctionBids)
        .where(
          and(
            eq(wtfAuctionBids.id, parsed.data.winningBidId),
            eq(wtfAuctionBids.auctionId, id)
          )
        );
      if (!bid) return res.status(400).json({ error: "Bid not found for this auction" });
      const verified = await verifyWtfTransferToOperatorByHash({
        opHash: parsed.data.opHash,
        senderOneOf: [bid.walletAddress],
        amountWtf: bid.amountWtf,
      });
      if (!verified.ok) {
        const status =
          verified.reason === "not_configured"
            ? 503
            : verified.reason === "not_found"
              ? 409
              : 400;
        return res.status(status).json({
          error: "Operation hash does not match the winning WTF settlement transfer",
          code: `AUCTION_SETTLEMENT_OPHASH_${(verified.reason ?? "mismatch").toUpperCase()}`,
        });
      }
      await db
        .update(wtfAuctions)
        .set({
          status: "settled",
          winningBidId: bid.id,
          settlementOpHash: parsed.data.opHash,
          updatedAt: new Date(),
        })
        .where(eq(wtfAuctions.id, id));
      const actor = req.user as any;
      await logOperatorAction({
        actorId: actor?.id ?? null,
        actionKind: "wtf_auction_settle",
        targetKind: "wtf_auction",
        targetId: id,
        payload: {
          winningBidId: bid.id,
          winningUserId: bid.userId,
          amountWtf: bid.amountWtf,
          opHash: parsed.data.opHash,
        },
        req,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to settle auction" });
    }
  }
);

/* ── public list ──────────────────────────────────────────── */
router.get("/api/wtf-auctions", async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(wtfAuctions)
      .orderBy(desc(wtfAuctions.endsAt))
      .limit(100);
    res.json({ auctions: rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to list auctions" });
  }
});

/* ── public detail ────────────────────────────────────────── */
router.get("/api/wtf-auctions/:id", async (req, res) => {
  try {
    const id = parseInt(String(req.params.id ?? ""), 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid auction id" });
    }
    const [auction] = await db
      .select()
      .from(wtfAuctions)
      .where(eq(wtfAuctions.id, id));
    if (!auction) return res.status(404).json({ error: "Auction not found" });

    const bids = await db
      .select({
        id: wtfAuctionBids.id,
        amountWtf: wtfAuctionBids.amountWtf,
        userId: wtfAuctionBids.userId,
        walletAddress: wtfAuctionBids.walletAddress,
        createdAt: wtfAuctionBids.createdAt,
        username: users.username,
      })
      .from(wtfAuctionBids)
      .leftJoin(users, eq(users.id, wtfAuctionBids.userId))
      .where(eq(wtfAuctionBids.auctionId, id))
      .orderBy(desc(wtfAuctionBids.amountWtf), desc(wtfAuctionBids.createdAt))
      .limit(50);

    res.json({ auction, bids });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch auction" });
  }
});

/* ── authenticated: place bid ────────────────────────────── */
router.post(
  "/api/wtf-auctions/:id/bids",
  isAuthenticated,
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id ?? ""), 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid auction id" });
      }
      const parsed = bidSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const user = req.user as any;
      const [auction] = await db
        .select()
        .from(wtfAuctions)
        .where(eq(wtfAuctions.id, id));
      if (!auction) return res.status(404).json({ error: "Auction not found" });
      if (auction.status !== "live") {
        return res.status(400).json({ error: "Auction is not live" });
      }
      const now = new Date();
      if (now < auction.startsAt) {
        return res.status(400).json({ error: "Auction not yet open" });
      }
      if (now > auction.endsAt) {
        return res.status(400).json({ error: "Auction has ended" });
      }

      const [topBid] = await db
        .select({ amount: wtfAuctionBids.amountWtf })
        .from(wtfAuctionBids)
        .where(eq(wtfAuctionBids.auctionId, id))
        .orderBy(desc(wtfAuctionBids.amountWtf))
        .limit(1);

      const minAllowed = topBid
        ? BigInt(topBid.amount) + BigInt(auction.bidIncrementWtf)
        : BigInt(auction.minBidWtf);
      const bidAmount = BigInt(parsed.data.amountWtf);
      if (bidAmount < minAllowed) {
        return res.status(400).json({
          error: `Bid must be at least ${minAllowed.toString()} WTF`,
        });
      }

      const [wallet] = await db
        .select({ address: userWallets.walletAddress })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id))
        .limit(1);
      if (!wallet) {
        return res
          .status(400)
          .json({ error: "Link a Tezos wallet before bidding" });
      }

      const [row] = await db
        .insert(wtfAuctionBids)
        .values({
          auctionId: id,
          userId: user.id,
          walletAddress: wallet.address,
          amountWtf: parsed.data.amountWtf,
        })
        .returning();

      res.status(201).json(row);
    } catch (err) {
      console.error("[wtf-auctions] bid failed:", err);
      res.status(500).json({ error: "Failed to place bid" });
    }
  }
);

void gt;
void sql;

export default router;
