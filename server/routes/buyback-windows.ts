/**
 * Phase 10 — Buyback windows.
 *
 * An operator (cohost+) designs a closed XTZ-for-WTF buyback window,
 * attaches an allowlist (Merkle tree), opens it, and closes it.
 * Eligible sellers fetch their proof from `/api/buyback-windows/:id/eligibility`
 * and submit the swap through their own Beacon wallet. The watcher
 * (wtf-recapture-watcher) credits each confirmed swap against the
 * window via the `op_hash` tag we stored when the user called the
 * swap-intent endpoint.
 *
 * All privileged operations route through the operator-wallet
 * endpoints (/api/operator-wallet/buyback/:action) so they ride the
 * same signer, audit, and ledger plumbing Phase 9 already ships.
 */

import { Router, type Request } from "express";
import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  buybackAllowlist,
  buybackWindows,
  operatorActions,
  userWallets,
  users,
} from "@shared/schema";
import { isAuthenticated, requirePermission } from "../auth/passport";
import { buildLeaf, buildMerkleTree, toHex, verifyProof, fromHex } from "../lib/merkle";

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
    console.warn("[buyback-windows] audit write failed:", err);
  }
}

const createSchema = z.object({
  label: z.string().trim().min(1).max(120),
  contractAddress: z.string().startsWith("KT").length(36),
  network: z.enum(["ghostnet", "mainnet"]).default("ghostnet"),
  rateMutezPerWtf: z.string().regex(/^\d+$/),
  perSellerCapWtf: z.string().regex(/^\d+$/),
  totalXtzBudgetMutez: z.string().regex(/^\d+$/),
  opensAt: z.string().datetime(),
  closesAt: z.string().datetime(),
  snapshotMinBalanceWtf: z.string().regex(/^\d+$/).default("0"),
  snapshotBlockLevel: z.number().int().nonnegative().optional(),
  notes: z.string().max(2000).optional(),
});

const allowlistSchema = z.object({
  entries: z
    .array(
      z.object({
        walletAddress: z.string().min(36).max(40),
        maxWtf: z.string().regex(/^\d+$/),
        snapshotBalanceWtf: z.string().regex(/^\d+$/).default("0"),
        eligibilityReason: z.string().max(40).default("manual"),
        userId: z.number().int().positive().optional(),
      })
    )
    .min(1)
    .max(5000),
});

/* ── admin create ────────────────────────────────────────── */
router.post(
  "/api/buyback-windows",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const opens = new Date(parsed.data.opensAt);
      const closes = new Date(parsed.data.closesAt);
      if (opens >= closes) {
        return res.status(400).json({ error: "opensAt must be before closesAt" });
      }
      const actor = req.user as any;
      const [row] = await db
        .insert(buybackWindows)
        .values({
          label: parsed.data.label,
          contractAddress: parsed.data.contractAddress,
          network: parsed.data.network,
          rateMutezPerWtf: parsed.data.rateMutezPerWtf,
          perSellerCapWtf: parsed.data.perSellerCapWtf,
          totalXtzBudgetMutez: parsed.data.totalXtzBudgetMutez,
          opensAt: opens,
          closesAt: closes,
          snapshotMinBalanceWtf: parsed.data.snapshotMinBalanceWtf,
          snapshotBlockLevel: parsed.data.snapshotBlockLevel ?? null,
          notes: parsed.data.notes ?? null,
          createdByUserId: actor?.id ?? null,
        })
        .returning();
      await logOperatorAction({
        actorId: actor?.id ?? null,
        actionKind: "buyback_window_create",
        targetKind: "buyback_window",
        targetId: row.id,
        payload: { label: parsed.data.label, contract: parsed.data.contractAddress },
        req,
      });
      res.status(201).json(row);
    } catch (err) {
      console.error("[buyback-windows] create failed:", err);
      res.status(500).json({ error: "Failed to create buyback window" });
    }
  }
);

/* ── admin list ──────────────────────────────────────────── */
router.get(
  "/api/buyback-windows",
  requirePermission("manage_gameshow"),
  async (_req, res) => {
    try {
      const rows = await db
        .select()
        .from(buybackWindows)
        .orderBy(desc(buybackWindows.createdAt))
        .limit(200);
      res.json({ windows: rows });
    } catch (err) {
      res.status(500).json({ error: "Failed to list buyback windows" });
    }
  }
);

/* ── admin upload allowlist + build merkle tree ──────────── */
router.post(
  "/api/buyback-windows/:id/allowlist",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id ?? ""), 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid window id" });
      }
      const parsed = allowlistSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const [window] = await db
        .select()
        .from(buybackWindows)
        .where(eq(buybackWindows.id, id));
      if (!window) return res.status(404).json({ error: "Window not found" });
      if (window.status !== "draft" && window.status !== "funded") {
        return res
          .status(400)
          .json({ error: `Allowlist is frozen once window is ${window.status}` });
      }

      // Dedup and sort entries to get deterministic root
      const byWallet = new Map<string, (typeof parsed.data.entries)[number]>();
      for (const e of parsed.data.entries) {
        byWallet.set(e.walletAddress, e);
      }
      const sorted = Array.from(byWallet.values()).sort((a, b) =>
        a.walletAddress.localeCompare(b.walletAddress)
      );
      const leaves = sorted.map((e) => buildLeaf(e.walletAddress, BigInt(e.maxWtf)));
      const { root, proofs } = buildMerkleTree(leaves);

      // Wipe previous allowlist for this window and re-insert. No
      // partial state — the admin provides the full set each time.
      await db
        .delete(buybackAllowlist)
        .where(eq(buybackAllowlist.windowId, id));

      // Resolve userIds for wallets already linked.
      const walletSet = sorted.map((e) => e.walletAddress);
      const linked = await db
        .select({
          walletAddress: userWallets.walletAddress,
          userId: userWallets.userId,
        })
        .from(userWallets)
        .where(
          walletSet.length > 0
            ? sql`${userWallets.walletAddress} = ANY(${sql.param(walletSet)})`
            : sql`FALSE`
        );
      const userByWallet = new Map<string, number>();
      for (const l of linked) userByWallet.set(l.walletAddress, l.userId);

      const batch = sorted.map((e, i) => ({
        windowId: id,
        walletAddress: e.walletAddress,
        userId: e.userId ?? userByWallet.get(e.walletAddress) ?? null,
        maxWtf: e.maxWtf,
        snapshotBalanceWtf: e.snapshotBalanceWtf,
        merkleProof: proofs[i].map((b) => toHex(b)),
        eligibilityReason: e.eligibilityReason,
      }));
      if (batch.length > 0) {
        // Chunk inserts so we don't blow pg bind param limits on big allowlists.
        const CHUNK = 500;
        for (let i = 0; i < batch.length; i += CHUNK) {
          await db.insert(buybackAllowlist).values(batch.slice(i, i + CHUNK));
        }
      }

      await db
        .update(buybackWindows)
        .set({ merkleRoot: toHex(root), updatedAt: new Date() })
        .where(eq(buybackWindows.id, id));

      const actor = req.user as any;
      await logOperatorAction({
        actorId: actor?.id ?? null,
        actionKind: "buyback_window_allowlist_set",
        targetKind: "buyback_window",
        targetId: id,
        payload: { root: toHex(root), size: batch.length },
        req,
      });

      res.json({
        ok: true,
        merkleRoot: toHex(root),
        size: batch.length,
      });
    } catch (err) {
      console.error("[buyback-windows] allowlist failed:", err);
      res.status(500).json({ error: "Failed to set allowlist" });
    }
  }
);

/* ── admin transition window state ──────────────────────── */
const transitionSchema = z.object({
  target: z.enum(["funded", "open", "closed", "swept", "cancelled"]),
  fundRunId: z.number().int().positive().optional(),
  withdrawXtzRunId: z.number().int().positive().optional(),
  withdrawWtfRunId: z.number().int().positive().optional(),
});

router.post(
  "/api/buyback-windows/:id/transition",
  requirePermission("manage_gameshow"),
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id ?? ""), 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid window id" });
      }
      const parsed = transitionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const [window] = await db
        .select()
        .from(buybackWindows)
        .where(eq(buybackWindows.id, id));
      if (!window) return res.status(404).json({ error: "Window not found" });

      // Minimal state machine guard:
      const allowed: Record<string, string[]> = {
        draft: ["funded", "cancelled"],
        funded: ["open", "cancelled"],
        open: ["closed", "cancelled"],
        closed: ["swept"],
        swept: [],
        cancelled: [],
      };
      if (!allowed[window.status].includes(parsed.data.target)) {
        return res
          .status(400)
          .json({
            error: `Illegal transition ${window.status} → ${parsed.data.target}`,
          });
      }

      const updates: Record<string, unknown> = {
        status: parsed.data.target,
        updatedAt: new Date(),
      };
      if (parsed.data.fundRunId) {
        updates.operatorFundRunId = parsed.data.fundRunId;
      }
      if (parsed.data.withdrawXtzRunId) {
        updates.operatorWithdrawXtzRunId = parsed.data.withdrawXtzRunId;
      }
      if (parsed.data.withdrawWtfRunId) {
        updates.operatorWithdrawWtfRunId = parsed.data.withdrawWtfRunId;
      }

      await db
        .update(buybackWindows)
        .set(updates)
        .where(eq(buybackWindows.id, id));

      const actor = req.user as any;
      await logOperatorAction({
        actorId: actor?.id ?? null,
        actionKind: `buyback_window_${parsed.data.target}`,
        targetKind: "buyback_window",
        targetId: id,
        payload: parsed.data,
        req,
      });

      res.json({ ok: true, status: parsed.data.target });
    } catch (err) {
      console.error("[buyback-windows] transition failed:", err);
      res.status(500).json({ error: "Failed to transition window" });
    }
  }
);

/* ── user-facing: list live windows ─────────────────────── */
router.get("/api/buyback-windows/active", async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: buybackWindows.id,
        label: buybackWindows.label,
        contractAddress: buybackWindows.contractAddress,
        network: buybackWindows.network,
        status: buybackWindows.status,
        rateMutezPerWtf: buybackWindows.rateMutezPerWtf,
        perSellerCapWtf: buybackWindows.perSellerCapWtf,
        totalXtzBudgetMutez: buybackWindows.totalXtzBudgetMutez,
        opensAt: buybackWindows.opensAt,
        closesAt: buybackWindows.closesAt,
        merkleRoot: buybackWindows.merkleRoot,
        swapsObserved: buybackWindows.swapsObserved,
        wtfRecaptured: buybackWindows.wtfRecaptured,
        xtzDispensedMutez: buybackWindows.xtzDispensedMutez,
      })
      .from(buybackWindows)
      .where(
        sql`${buybackWindows.status} IN ('funded','open','closed')`
      )
      .orderBy(desc(buybackWindows.opensAt))
      .limit(50);
    res.json({ windows: rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to list active windows" });
  }
});

/* ── user-facing: my eligibility for a window ───────────── */
router.get(
  "/api/buyback-windows/:id/eligibility",
  isAuthenticated,
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id ?? ""), 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid window id" });
      }
      const user = req.user as any;

      const [window] = await db
        .select()
        .from(buybackWindows)
        .where(eq(buybackWindows.id, id));
      if (!window) return res.status(404).json({ error: "Window not found" });

      const mine = await db
        .select({
          id: buybackAllowlist.id,
          walletAddress: buybackAllowlist.walletAddress,
          maxWtf: buybackAllowlist.maxWtf,
          merkleProof: buybackAllowlist.merkleProof,
          eligibilityReason: buybackAllowlist.eligibilityReason,
          swappedWtf: buybackAllowlist.swappedWtf,
          swappedAt: buybackAllowlist.swappedAt,
          swapOpHash: buybackAllowlist.swapOpHash,
        })
        .from(buybackAllowlist)
        .where(
          and(
            eq(buybackAllowlist.windowId, id),
            eq(buybackAllowlist.userId, user.id)
          )
        );

      res.json({
        window: {
          id: window.id,
          label: window.label,
          contractAddress: window.contractAddress,
          network: window.network,
          status: window.status,
          rateMutezPerWtf: window.rateMutezPerWtf,
          perSellerCapWtf: window.perSellerCapWtf,
          opensAt: window.opensAt,
          closesAt: window.closesAt,
          merkleRoot: window.merkleRoot,
        },
        eligibility: mine,
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to resolve eligibility" });
    }
  }
);

/* ── user-facing: record my swap intent (client → server) ── */
const swapIntentSchema = z.object({
  allowlistId: z.number().int().positive(),
  opHash: z.string().min(30).max(80),
  amountWtf: z.string().regex(/^\d+$/),
});
router.post(
  "/api/buyback-windows/:id/swap-intent",
  isAuthenticated,
  async (req, res) => {
    try {
      const id = parseInt(String(req.params.id ?? ""), 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid window id" });
      }
      const parsed = swapIntentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const user = req.user as any;
      const [entry] = await db
        .select()
        .from(buybackAllowlist)
        .where(
          and(
            eq(buybackAllowlist.id, parsed.data.allowlistId),
            eq(buybackAllowlist.windowId, id),
            eq(buybackAllowlist.userId, user.id)
          )
        );
      if (!entry) {
        return res.status(403).json({ error: "Not on the allowlist" });
      }
      const alreadySwapped = BigInt(entry.swappedWtf ?? "0");
      const maxAllowed = BigInt(entry.maxWtf);
      const addAmount = BigInt(parsed.data.amountWtf);
      if (alreadySwapped + addAmount > maxAllowed) {
        return res
          .status(400)
          .json({ error: "Amount exceeds per-seller cap", alreadySwapped: alreadySwapped.toString(), maxAllowed: maxAllowed.toString() });
      }

      await db
        .update(buybackAllowlist)
        .set({
          swappedWtf: (alreadySwapped + addAmount).toString(),
          swappedAt: new Date(),
          swapOpHash: parsed.data.opHash,
        })
        .where(eq(buybackAllowlist.id, parsed.data.allowlistId));

      res.json({ ok: true });
    } catch (err) {
      console.error("[buyback-windows] swap-intent failed:", err);
      res.status(500).json({ error: "Failed to record swap intent" });
    }
  }
);

// Defensive: surface unused imports so linters don't complain if one
// of these helpers becomes optional after a future refactor.
void isNull;
void users;
void verifyProof;
void fromHex;

export default router;
