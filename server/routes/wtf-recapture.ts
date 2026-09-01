/**
 * Phase 10 — WTF recapture leaderboard + ante / side-quest entry-fee
 * attestation.
 *
 * Users complete their own external-wallet transfer of WTF to the operator
 * wallet (ante for cohort slot, entry fee for a WTF-gated side quest), then
 * POST the resulting op hash here. These routes verify the applied TzKT
 * operation, linked sender, WTF contract/token, destination, and exact amount
 * before mutating payment state. The recapture watcher separately indexes the
 * confirmed event for the leaderboard and durable wallet-event history.
 */

import { Router, type Request } from "express";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import {
  seasonContestants,
  seasons,
  sideQuestEntryFees,
  sideQuests,
  users,
  userWallets,
  wtfRecaptureEvents,
} from "@shared/schema";
import { isAuthenticated, requirePermission } from "../auth/passport";
import { getRecaptureLeaderboard } from "../lib/wtf-recapture-watcher";
import { WTF_OPERATOR_WALLET_ADDRESS } from "../lib/constants";
import { verifyWtfTransferToOperatorByHash } from "../lib/wtf-op-verification";

const router = Router();

/* ── leaderboard ──────────────────────────────────────────── */
router.get("/api/wtf-recapture/leaderboard", async (req, res) => {
  try {
    const limit = Math.max(
      1,
      Math.min(500, parseInt(String(req.query.limit ?? "50"), 10) || 50)
    );
    const sinceRaw = typeof req.query.since === "string" ? req.query.since : "";
    const since = sinceRaw ? new Date(sinceRaw) : null;
    const source =
      typeof req.query.source === "string" ? req.query.source : null;

    const entries = await getRecaptureLeaderboard({
      limit,
      since,
      source,
    });

    const userIds = entries
      .map((e) => e.userId)
      .filter((id): id is number => typeof id === "number");
    const userRows =
      userIds.length > 0
        ? await db
            .select({
              id: users.id,
              username: users.username,
              displayName: users.displayName,
              avatarUrl: users.avatarUrl,
            })
            .from(users)
            .where(sql`${users.id} = ANY(${sql.param(userIds)})`)
        : [];
    const userMap = new Map(userRows.map((u) => [u.id, u]));

    res.json({
      entries: entries.map((e) => ({
        ...e,
        user: e.userId ? userMap.get(e.userId) ?? null : null,
      })),
      operatorWallet: WTF_OPERATOR_WALLET_ADDRESS || null,
    });
  } catch (err) {
    console.error("[wtf-recapture] leaderboard failed:", err);
    res.status(500).json({ error: "Failed to build leaderboard" });
  }
});

/* ── my recent recapture events ───────────────────────────── */
router.get(
  "/api/wtf-recapture/mine",
  isAuthenticated,
  async (req, res) => {
    try {
      const user = req.user as any;
      const rows = await db
        .select()
        .from(wtfRecaptureEvents)
        .where(eq(wtfRecaptureEvents.userId, user.id))
        .orderBy(desc(wtfRecaptureEvents.observedAt))
        .limit(100);
      res.json({ events: rows });
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch my events" });
    }
  }
);

/* ── ante attestation ─────────────────────────────────────── */
const anteAttestSchema = z.object({
  amountWtf: z.string().regex(/^\d+$/),
  opHash: z.string().min(30).max(80),
});
router.post(
  "/api/seasons/:id/ante/attest",
  isAuthenticated,
  async (req, res) => {
    try {
      const seasonId = parseInt(String(req.params.id ?? ""), 10);
      if (!Number.isInteger(seasonId) || seasonId <= 0) {
        return res.status(400).json({ error: "Invalid season id" });
      }
      const parsed = anteAttestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const user = req.user as any;
      const [season] = await db
        .select()
        .from(seasons)
        .where(eq(seasons.id, seasonId));
      if (!season) return res.status(404).json({ error: "Season not found" });
      const required = BigInt(season.anteWtfRequired ?? "0");
      const paid = BigInt(parsed.data.amountWtf);
      if (required > BigInt(0) && paid < required) {
        return res
          .status(400)
          .json({
            error: `Ante requires at least ${required.toString()} WTF; you attested ${paid.toString()}`,
          });
      }
      const linkedWallets = await db
        .select({ address: userWallets.walletAddress })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id));
      if (linkedWallets.length === 0) {
        return res
          .status(400)
          .json({ error: "Link a Tezos wallet before paying ante" });
      }
      const verified = await verifyWtfTransferToOperatorByHash({
        opHash: parsed.data.opHash,
        senderOneOf: linkedWallets.map((wallet) => wallet.address),
        amountWtf: parsed.data.amountWtf,
      });
      if (!verified.ok) {
        const status =
          verified.reason === "not_configured"
            ? 503
            : verified.reason === "not_found"
              ? 409
              : 400;
        return res.status(status).json({
          error: "Operation hash does not match the expected WTF ante transfer",
          code: `ANTE_OPHASH_${(verified.reason ?? "mismatch").toUpperCase()}`,
        });
      }
      const [row] = await db
        .update(seasonContestants)
        .set({
          antePaidWtf: parsed.data.amountWtf,
          anteOpHash: parsed.data.opHash,
          antePaidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(seasonContestants.seasonId, seasonId),
            eq(seasonContestants.userId, user.id)
          )
        )
        .returning();
      if (!row) {
        return res
          .status(404)
          .json({ error: "You do not have a slot in this season's cohort" });
      }
      res.json({ ok: true, contestant: row });
    } catch (err) {
      console.error("[wtf-recapture] ante attest failed:", err);
      res.status(500).json({ error: "Failed to record ante" });
    }
  }
);

/* ── side-quest entry fee attestation ─────────────────────── */
const feeAttestSchema = z.object({
  amountWtf: z.string().regex(/^\d+$/),
  opHash: z.string().min(30).max(80),
});
router.post(
  "/api/side-quests/:id/entry-fee/attest",
  isAuthenticated,
  async (req, res) => {
    try {
      const sideQuestId = parseInt(String(req.params.id ?? ""), 10);
      if (!Number.isInteger(sideQuestId) || sideQuestId <= 0) {
        return res.status(400).json({ error: "Invalid side quest id" });
      }
      const parsed = feeAttestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const user = req.user as any;
      const [quest] = await db
        .select()
        .from(sideQuests)
        .where(eq(sideQuests.id, sideQuestId));
      if (!quest) return res.status(404).json({ error: "Side quest not found" });
      const required = BigInt(quest.entryFeeWtf ?? "0");
      const paid = BigInt(parsed.data.amountWtf);
      if (required <= BigInt(0)) {
        return res.status(400).json({ error: "This quest has no entry fee" });
      }
      if (paid < required) {
        return res
          .status(400)
          .json({
            error: `Entry fee requires at least ${required.toString()} WTF`,
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
          .json({ error: "Link a Tezos wallet before paying entry fee" });
      }
      const linkedWallets = await db
        .select({ address: userWallets.walletAddress })
        .from(userWallets)
        .where(eq(userWallets.userId, user.id));
      const verified = await verifyWtfTransferToOperatorByHash({
        opHash: parsed.data.opHash,
        senderOneOf: linkedWallets.map((linked) => linked.address),
        amountWtf: parsed.data.amountWtf,
      });
      if (!verified.ok) {
        const status =
          verified.reason === "not_configured"
            ? 503
            : verified.reason === "not_found"
              ? 409
              : 400;
        return res.status(status).json({
          error: "Operation hash does not match the expected WTF entry-fee transfer",
          code: `ENTRY_FEE_OPHASH_${(verified.reason ?? "mismatch").toUpperCase()}`,
        });
      }

      await db
        .insert(sideQuestEntryFees)
        .values({
          sideQuestId,
          userId: user.id,
          walletAddress: verified.sender ?? wallet.address,
          amountWtf: parsed.data.amountWtf,
          opHash: parsed.data.opHash,
          status: "pending",
        })
        .onConflictDoUpdate({
          target: [sideQuestEntryFees.sideQuestId, sideQuestEntryFees.userId],
          set: {
            amountWtf: parsed.data.amountWtf,
            opHash: parsed.data.opHash,
            status: "pending",
          },
        });

      res.json({ ok: true });
    } catch (err) {
      console.error("[wtf-recapture] fee attest failed:", err);
      res.status(500).json({ error: "Failed to record entry fee" });
    }
  }
);

/* ── operator: confirm a fee manually after seeing settlement ── */
router.post(
  "/api/side-quests/:id/entry-fee/:feeId/confirm",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const sideQuestId = parseInt(String(req.params.id ?? ""), 10);
      const feeId = parseInt(String(req.params.feeId ?? ""), 10);
      if (!Number.isInteger(sideQuestId) || sideQuestId <= 0) {
        return res.status(400).json({ error: "Invalid side quest id" });
      }
      if (!Number.isInteger(feeId) || feeId <= 0) {
        return res.status(400).json({ error: "Invalid fee id" });
      }
      const [confirmedFee] = await db
        .update(sideQuestEntryFees)
        .set({ status: "confirmed", confirmedAt: new Date() })
        .where(
          and(
            eq(sideQuestEntryFees.id, feeId),
            eq(sideQuestEntryFees.sideQuestId, sideQuestId)
          )
        )
        .returning({ id: sideQuestEntryFees.id });
      if (!confirmedFee) {
        return res.status(404).json({ error: "Entry fee not found for this side quest" });
      }
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to confirm fee" });
    }
  }
);

export default router;
