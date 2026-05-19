/**
 * Operator-wallet routes (Phase 9).
 *
 * Unified hot-wallet payouts + buyback plumbing for the gameshow. Every
 * privileged action goes through:
 *
 *   preview  → review exact amounts, recipients, and balance impact
 *   run      → persist an `operator_wallet_runs` row, call the signer,
 *               update ledger rows, record the op hash
 *   reconcile → re-sync the most recent run's status against TzKT
 *
 * All routes require `manage_gameshow`. The signer enforces its own
 * policy (recipient caps, XTZ caps, contract allowlist) on top of these
 * checks; this file is the safer, DB-aware front door.
 */

import { Router, type Request } from "express";
import { z } from "zod";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db";
import {
  operatorActions,
  operatorWalletRuns,
  rewardLedger,
  userWallets,
  users,
} from "@shared/schema";
import { requirePermission } from "../auth/passport";
import {
  WTF_FA2_CONTRACT,
  WTF_FA2_TOKEN_ID,
  WTF_OPERATOR_WALLET_ADDRESS,
} from "../lib/constants";
import {
  callSigner,
  isSignerConfigured,
  SignerError,
} from "../lib/operator-signer-client";
import { checkOperatorSignerHealth } from "../features/operator-signer/health";
import {
  getOperatorBalances,
  getOperatorLowBalanceAlerts,
  runOperatorBalanceCheck,
} from "../lib/operator-wallet-balances";
import { tzkt, UpstreamError } from "../lib/upstream";

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
}): Promise<void> {
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
    console.warn("[operator-wallet] audit write failed:", err);
  }
}

function mapSignerError(err: unknown): { status: number; code: string; message: string } {
  if (err instanceof SignerError) {
    switch (err.code) {
      case "signer_not_configured":
        return { status: 503, code: err.code, message: err.message };
      case "signer_invalid_auth":
        return { status: 503, code: err.code, message: err.message };
      case "signer_unavailable":
      case "signer_timeout":
      case "signer_empty_response":
        return { status: 502, code: err.code, message: err.message };
      case "signer_refused":
      case "policy_recipients":
      case "policy_xtz_cap":
      case "policy_contract_not_allowed":
      case "policy_custom_disabled":
        return { status: 400, code: err.code, message: err.message };
      case "signer_broadcast_failed":
        return { status: 502, code: err.code, message: err.message };
      default:
        return { status: 500, code: err.code, message: err.message };
    }
  }
  return {
    status: 500,
    code: "internal",
    message: (err as Error)?.message ?? "Unknown error",
  };
}

/* ──────────────────────────────────────────────────────────
 * GET /api/operator-wallet/summary
 * Balances + low-balance alerts + pending reward queue size.
 * ────────────────────────────────────────────────────────── */

router.get(
  "/api/operator-wallet/summary",
  requirePermission("manage_gameshow"),
  async (_req, res, next) => {
    try {
      const balances = await getOperatorBalances();
      const lowBalances = await getOperatorLowBalanceAlerts();
      const [pendingTotals] = await db
        .select({
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${rewardLedger.amountWtf})::text, '0')`,
        })
        .from(rewardLedger)
        .where(and(eq(rewardLedger.paid, false), eq(rewardLedger.settlementStatus, "available")));

      const recentRuns = await db
        .select({
          id: operatorWalletRuns.id,
          intent: operatorWalletRuns.intent,
          assetKind: operatorWalletRuns.assetKind,
          status: operatorWalletRuns.status,
          totalRecipients: operatorWalletRuns.totalRecipients,
          totalAmount: operatorWalletRuns.totalAmount,
          opHash: operatorWalletRuns.opHash,
          startedAt: operatorWalletRuns.startedAt,
          finishedAt: operatorWalletRuns.finishedAt,
          errorMessage: operatorWalletRuns.errorMessage,
        })
        .from(operatorWalletRuns)
        .orderBy(desc(operatorWalletRuns.startedAt))
        .limit(25);

      res.json({
        operatorWallet: WTF_OPERATOR_WALLET_ADDRESS || null,
        signerConfigured: isSignerConfigured(),
        balances,
        lowBalances,
        pendingRewards: {
          count: pendingTotals?.count ?? 0,
          totalWtf: pendingTotals?.total ?? "0",
        },
        recentRuns,
      });
    } catch (err) {
      next(err);
    }
  }
);

router.get(
  "/api/operator-wallet/signer/health",
  requirePermission("manage_gameshow"),
  async (_req, res, next) => {
    try {
      const health = await checkOperatorSignerHealth();
      res.status(health.ok ? 200 : 503).json(health);
    } catch (err) {
      next(err);
    }
  }
);

/* ──────────────────────────────────────────────────────────
 * POST /api/operator-wallet/balances/refresh
 * Force a fresh TzKT probe (normally runs on a 2-minute schedule).
 * ────────────────────────────────────────────────────────── */

router.post(
  "/api/operator-wallet/balances/refresh",
  requirePermission("manage_gameshow"),
  async (req, res, next) => {
    try {
      const result = await runOperatorBalanceCheck();
      const actor = req.user as any;
      await logOperatorAction({
        actorId: actor?.id ?? null,
        actionKind: "operator_balance_refresh",
        targetKind: "operator_wallet",
        targetId: null,
        payload: result,
        req,
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  }
);

/* ──────────────────────────────────────────────────────────
 * POST /api/operator-wallet/disburse/preview
 *
 * Show the exact payout plan the operator is about to execute: every
 * ledger row (or manual override), resolved wallet, and total.
 * ────────────────────────────────────────────────────────── */

const disbursePreviewSchema = z.object({
  scope: z.enum(["pending_ledger", "ledger_ids", "manual"]).default(
    "pending_ledger"
  ),
  ledgerIds: z.array(z.number().int().positive()).optional(),
  manual: z
    .array(
      z.object({
        userId: z.number().int().positive(),
        amountWtf: z.string().regex(/^\d+$/, "amount must be a positive integer string"),
        reason: z.string().min(1).max(200),
      })
    )
    .optional(),
  maxRecipients: z.number().int().min(1).max(200).optional(),
});

type DisbursePlanRow = {
  userId: number;
  username: string | null;
  walletAddress: string | null;
  amount: string;
  ledgerId: number | null;
  reason: string;
};

async function buildDisbursePlan(
  parsed: z.infer<typeof disbursePreviewSchema>
): Promise<{ rows: DisbursePlanRow[]; unpaidLedgerIds: number[] }> {
  const maxRecipients = parsed.maxRecipients ?? 200;
  const rows: DisbursePlanRow[] = [];
  const unpaidLedgerIds: number[] = [];

  if (parsed.scope === "manual") {
    const manual = parsed.manual ?? [];
    if (manual.length === 0) return { rows, unpaidLedgerIds };
    const userIds = manual.map((m) => m.userId);
    const userRows = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(inArray(users.id, userIds));
    const walletRows = await db
      .select({ userId: userWallets.userId, address: userWallets.walletAddress })
      .from(userWallets)
      .where(inArray(userWallets.userId, userIds));
    const userById = new Map(userRows.map((u) => [u.id, u.username]));
    const walletByUser = new Map<number, string>();
    for (const w of walletRows) {
      if (!walletByUser.has(w.userId)) walletByUser.set(w.userId, w.address);
    }
    for (const m of manual.slice(0, maxRecipients)) {
      rows.push({
        userId: m.userId,
        username: userById.get(m.userId) ?? null,
        walletAddress: walletByUser.get(m.userId) ?? null,
        amount: m.amountWtf,
        ledgerId: null,
        reason: m.reason,
      });
    }
    return { rows, unpaidLedgerIds };
  }

  const where =
    parsed.scope === "ledger_ids" && parsed.ledgerIds?.length
      ? and(
          eq(rewardLedger.paid, false),
          eq(rewardLedger.settlementStatus, "available"),
          inArray(rewardLedger.id, parsed.ledgerIds)
        )!
      : and(eq(rewardLedger.paid, false), eq(rewardLedger.settlementStatus, "available"))!;

  const ledgerRows = await db
    .select({
      id: rewardLedger.id,
      userId: rewardLedger.userId,
      amountWtf: rewardLedger.amountWtf,
      reason: rewardLedger.reason,
    })
    .from(rewardLedger)
    .where(where)
    .orderBy(rewardLedger.createdAt)
    .limit(maxRecipients);

  if (ledgerRows.length === 0) return { rows, unpaidLedgerIds };
  const userIds = Array.from(new Set(ledgerRows.map((r) => r.userId)));
  const userRows = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(inArray(users.id, userIds));
  const walletRows = await db
    .select({ userId: userWallets.userId, address: userWallets.walletAddress })
    .from(userWallets)
    .where(inArray(userWallets.userId, userIds));
  const userById = new Map(userRows.map((u) => [u.id, u.username]));
  const walletByUser = new Map<number, string>();
  for (const w of walletRows) {
    if (!walletByUser.has(w.userId)) walletByUser.set(w.userId, w.address);
  }

  const agg = new Map<number, DisbursePlanRow>();
  for (const lr of ledgerRows) {
    const cur =
      agg.get(lr.userId) ??
      ({
        userId: lr.userId,
        username: userById.get(lr.userId) ?? null,
        walletAddress: walletByUser.get(lr.userId) ?? null,
        amount: "0",
        ledgerId: lr.id,
        reason: lr.reason,
      } as DisbursePlanRow);
    const a = BigInt(cur.amount) + BigInt(lr.amountWtf);
    cur.amount = a.toString();
    if (cur.ledgerId == null) cur.ledgerId = lr.id;
    agg.set(lr.userId, cur);
    unpaidLedgerIds.push(lr.id);
  }

  rows.push(...Array.from(agg.values()));
  return { rows, unpaidLedgerIds };
}

router.post(
  "/api/operator-wallet/disburse/preview",
  requirePermission("manage_gameshow"),
  async (req, res, next) => {
    try {
      const parsed = disbursePreviewSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }
      const { rows, unpaidLedgerIds } = await buildDisbursePlan(parsed.data);
      const missing = rows.filter((r) => !r.walletAddress).map((r) => r.userId);
      const deliverable = rows.filter((r) => r.walletAddress);
      const total = deliverable.reduce(
        (acc, r) => acc + BigInt(r.amount),
        BigInt(0)
      );
      res.json({
        scope: parsed.data.scope,
        recipients: rows,
        deliverableCount: deliverable.length,
        missingWallets: missing,
        totalWtf: total.toString(),
        unpaidLedgerIds,
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ──────────────────────────────────────────────────────────
 * POST /api/operator-wallet/disburse/run
 *
 * Call the signer, record a run row, flip matched ledger rows to paid.
 * Safe to re-run: failures leave the rows un-flipped; success is idempotent
 * because the run's unique op hash guards against double-spending.
 * ────────────────────────────────────────────────────────── */

const disburseRunSchema = disbursePreviewSchema.extend({
  notes: z.string().max(500).optional(),
});

router.post(
  "/api/operator-wallet/disburse/run",
  requirePermission("manage_gameshow"),
  async (req, res, next) => {
    const parsed = disburseRunSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid payload", details: parsed.error.issues });
    }
    const actor = req.user as any;
    const actorId = actor?.id ?? null;

    try {
      if (!WTF_OPERATOR_WALLET_ADDRESS) {
        return res
          .status(503)
          .json({ error: "WTF_OPERATOR_WALLET_ADDRESS not configured" });
      }
      if (!isSignerConfigured()) {
        return res.status(503).json({ error: "operator signer not configured" });
      }

      const { rows, unpaidLedgerIds } = await buildDisbursePlan(parsed.data);
      const deliverable = rows.filter((r) => r.walletAddress);
      if (deliverable.length === 0) {
        return res
          .status(400)
          .json({ error: "No deliverable recipients in plan" });
      }
      const total = deliverable.reduce(
        (acc, r) => acc + BigInt(r.amount),
        BigInt(0)
      );

      const [run] = await db
        .insert(operatorWalletRuns)
        .values({
          preparedBy: actorId,
          intent: "disburse_wtf",
          assetKind: "fa2",
          assetContract: WTF_FA2_CONTRACT,
          assetTokenId: String(WTF_FA2_TOKEN_ID),
          totalRecipients: deliverable.length,
          totalAmount: total.toString(),
          payload: {
            scope: parsed.data.scope,
            ledgerIds: unpaidLedgerIds,
            recipients: deliverable.map((r) => ({
              userId: r.userId,
              walletAddress: r.walletAddress,
              amount: r.amount,
              reason: r.reason,
            })),
          },
          notes: parsed.data.notes ?? null,
          status: "broadcasting",
        })
        .returning({ id: operatorWalletRuns.id });

      try {
        const response = await callSigner({
          intent: "disburse_wtf",
          assetContract: WTF_FA2_CONTRACT,
          assetTokenId: Number(WTF_FA2_TOKEN_ID),
          recipients: deliverable.map((r) => ({
            address: r.walletAddress as string,
            amount: r.amount,
          })),
          runId: run.id,
        });

        await db
          .update(operatorWalletRuns)
          .set({
            status: "confirmed",
            opHash: response.opHash ?? null,
            signedBy: response.signedBy ?? WTF_OPERATOR_WALLET_ADDRESS,
            finishedAt: new Date(),
          })
          .where(eq(operatorWalletRuns.id, run.id));

        if (parsed.data.scope !== "manual" && unpaidLedgerIds.length > 0) {
          await db
            .update(rewardLedger)
            .set({
              paid: true,
              opHash: response.opHash ?? null,
            paidAt: new Date(),
            paidBy: actorId,
            operatorWalletRunId: run.id,
            settlementStatus: "paid",
            settlementType: "operator_disbursement",
            settlementRef: `operator_wallet_run:${run.id}`,
            settledAt: new Date(),
          })
          .where(inArray(rewardLedger.id, unpaidLedgerIds));
        }

        await logOperatorAction({
          actorId,
          actionKind: "operator_disburse_wtf",
          targetKind: "operator_wallet_run",
          targetId: run.id,
          payload: {
            recipients: deliverable.length,
            total,
            opHash: response.opHash,
            ledgerIds: unpaidLedgerIds,
          },
          req,
        });

        return res.json({
          ok: true,
          runId: run.id,
          opHash: response.opHash ?? null,
          recipients: deliverable.length,
          totalWtf: total.toString(),
        });
      } catch (signErr) {
        const mapped = mapSignerError(signErr);
        await db
          .update(operatorWalletRuns)
          .set({
            status: "failed",
            errorMessage: mapped.message.slice(0, 2000),
            finishedAt: new Date(),
          })
          .where(eq(operatorWalletRuns.id, run.id));
        await logOperatorAction({
          actorId,
          actionKind: "operator_disburse_wtf_failed",
          targetKind: "operator_wallet_run",
          targetId: run.id,
          payload: { error: mapped.message, code: mapped.code },
          req,
        });
        return res
          .status(mapped.status)
          .json({ error: mapped.message, code: mapped.code, runId: run.id });
      }
    } catch (err) {
      next(err);
    }
  }
);

/* ──────────────────────────────────────────────────────────
 * POST /api/operator-wallet/buyback/:action
 * Buyback fund / withdraw / pause / unpause. Thin pass-through to the
 * signer, gated by the contract allowlist.
 * ────────────────────────────────────────────────────────── */

const buybackSchema = z.object({
  contract: z.string().startsWith("KT").min(36).max(36),
  amountMutez: z.string().regex(/^\d+$/).optional(),
  amount: z.string().regex(/^\d+$/).optional(),
  notes: z.string().max(500).optional(),
});

router.post(
  "/api/operator-wallet/buyback/:action",
  requirePermission("manage_gameshow"),
  async (req, res, next) => {
    try {
      const action = String(req.params.action);
      const parsed = buybackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: "Invalid payload", details: parsed.error.issues });
      }

      const actor = req.user as any;
      const actorId = actor?.id ?? null;

      if (!isSignerConfigured()) {
        return res.status(503).json({ error: "operator signer not configured" });
      }

      let intent:
        | "fund_buyback"
        | "withdraw_buyback_xtz"
        | "withdraw_buyback_wtf"
        | "pause_buyback"
        | "unpause_buyback";
      let assetKind: "fa2" | "xtz";
      let totalAmount = "0";
      let signerPayload:
        | Parameters<typeof callSigner>[0];

      switch (action) {
        case "fund": {
          intent = "fund_buyback";
          assetKind = "xtz";
          if (!parsed.data.amountMutez) {
            return res
              .status(400)
              .json({ error: "amountMutez required to fund buyback" });
          }
          totalAmount = parsed.data.amountMutez;
          signerPayload = {
            intent,
            counterpartyContract: parsed.data.contract,
            amountMutez: parsed.data.amountMutez,
          };
          break;
        }
        case "withdraw-xtz": {
          intent = "withdraw_buyback_xtz";
          assetKind = "xtz";
          signerPayload = {
            intent,
            counterpartyContract: parsed.data.contract,
          };
          break;
        }
        case "withdraw-wtf": {
          intent = "withdraw_buyback_wtf";
          assetKind = "fa2";
          if (!parsed.data.amount) {
            return res
              .status(400)
              .json({ error: "amount required to withdraw WTF" });
          }
          totalAmount = parsed.data.amount;
          signerPayload = {
            intent,
            counterpartyContract: parsed.data.contract,
            amount: parsed.data.amount,
          };
          break;
        }
        case "pause": {
          intent = "pause_buyback";
          assetKind = "xtz";
          signerPayload = {
            intent,
            counterpartyContract: parsed.data.contract,
          };
          break;
        }
        case "unpause": {
          intent = "unpause_buyback";
          assetKind = "xtz";
          signerPayload = {
            intent,
            counterpartyContract: parsed.data.contract,
          };
          break;
        }
        default:
          return res.status(400).json({ error: `Unknown action: ${action}` });
      }

      const [run] = await db
        .insert(operatorWalletRuns)
        .values({
          preparedBy: actorId,
          intent,
          assetKind,
          assetContract: assetKind === "fa2" ? WTF_FA2_CONTRACT : null,
          assetTokenId: assetKind === "fa2" ? String(WTF_FA2_TOKEN_ID) : null,
          totalRecipients: 1,
          totalAmount,
          counterpartyContract: parsed.data.contract,
          payload: {
            action,
            amountMutez: parsed.data.amountMutez ?? null,
            amount: parsed.data.amount ?? null,
          },
          notes: parsed.data.notes ?? null,
          status: "broadcasting",
        })
        .returning({ id: operatorWalletRuns.id });

      try {
        const response = await callSigner({ ...signerPayload, runId: run.id });
        await db
          .update(operatorWalletRuns)
          .set({
            status: "confirmed",
            opHash: response.opHash ?? null,
            signedBy: response.signedBy ?? WTF_OPERATOR_WALLET_ADDRESS,
            finishedAt: new Date(),
          })
          .where(eq(operatorWalletRuns.id, run.id));

        await logOperatorAction({
          actorId,
          actionKind: `operator_${intent}`,
          targetKind: "operator_wallet_run",
          targetId: run.id,
          payload: {
            contract: parsed.data.contract,
            amountMutez: parsed.data.amountMutez,
            amount: parsed.data.amount,
            opHash: response.opHash,
          },
          req,
        });

        return res.json({
          ok: true,
          runId: run.id,
          opHash: response.opHash ?? null,
        });
      } catch (signErr) {
        const mapped = mapSignerError(signErr);
        await db
          .update(operatorWalletRuns)
          .set({
            status: "failed",
            errorMessage: mapped.message.slice(0, 2000),
            finishedAt: new Date(),
          })
          .where(eq(operatorWalletRuns.id, run.id));
        await logOperatorAction({
          actorId,
          actionKind: `operator_${intent}_failed`,
          targetKind: "operator_wallet_run",
          targetId: run.id,
          payload: { error: mapped.message, code: mapped.code },
          req,
        });
        return res
          .status(mapped.status)
          .json({ error: mapped.message, code: mapped.code, runId: run.id });
      }
    } catch (err) {
      next(err);
    }
  }
);

/* ──────────────────────────────────────────────────────────
 * GET /api/operator-wallet/runs
 * Paginated run history for audit + UI.
 * ────────────────────────────────────────────────────────── */

router.get(
  "/api/operator-wallet/runs",
  requirePermission("manage_gameshow"),
  async (req, res, next) => {
    try {
      const limitRaw = Number(req.query.limit ?? 50);
      const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);
      const rows = await db
        .select()
        .from(operatorWalletRuns)
        .orderBy(desc(operatorWalletRuns.startedAt))
        .limit(limit);
      res.json({ runs: rows });
    } catch (err) {
      next(err);
    }
  }
);

/* ──────────────────────────────────────────────────────────
 * POST /api/operator-wallet/runs/:id/reconcile
 * Pull the on-chain status of the run's op hash from TzKT and update
 * the cached status. Used when a run is stuck in `broadcasting` because
 * the signer crashed mid-response.
 * ────────────────────────────────────────────────────────── */

router.post(
  "/api/operator-wallet/runs/:id/reconcile",
  requirePermission("manage_gameshow"),
  async (req, res, next) => {
    try {
      const id = parseInt(String(req.params.id ?? ""), 10);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: "Invalid run id" });
      }
      const [run] = await db
        .select()
        .from(operatorWalletRuns)
        .where(eq(operatorWalletRuns.id, id))
        .limit(1);
      if (!run) return res.status(404).json({ error: "Run not found" });
      if (!run.opHash) {
        return res
          .status(400)
          .json({ error: "Run has no op hash to reconcile" });
      }

      let ops: Array<{ status?: string }>;
      try {
        ops = await tzkt.getJson<Array<{ status?: string }>>(
          `/operations/${encodeURIComponent(run.opHash)}`
        );
      } catch (err) {
        if (err instanceof UpstreamError) {
          return res
            .status(502)
            .json({ error: `TzKT upstream ${err.status ?? "unavailable"}` });
        }
        throw err;
      }
      if (!Array.isArray(ops)) {
        return res
          .status(502)
          .json({ error: "TzKT upstream returned invalid operation data" });
      }
      const statuses = new Set(
        ops
          .map((o) => (o?.status ? String(o.status).toLowerCase() : null))
          .filter((s): s is string => Boolean(s))
      );

      let newStatus: typeof run.status = run.status;
      let errorMessage: string | null = run.errorMessage;
      if (statuses.has("applied")) {
        newStatus = "confirmed";
      } else if (statuses.has("backtracked") || statuses.has("failed")) {
        newStatus = "failed";
        errorMessage = "On-chain status reports failed/backtracked";
      }

      if (newStatus !== run.status || errorMessage !== run.errorMessage) {
        await db
          .update(operatorWalletRuns)
          .set({
            status: newStatus,
            errorMessage: errorMessage,
            finishedAt: new Date(),
          })
          .where(eq(operatorWalletRuns.id, id));
      }

      res.json({
        runId: id,
        previousStatus: run.status,
        newStatus,
        onChainStatuses: [...statuses],
      });
    } catch (err) {
      next(err);
    }
  }
);

/* ──────────────────────────────────────────────────────────
 * GET /api/operator-wallet/ledger/unpaid
 * Helper for the UI preview form — lists unpaid reward_ledger rows with
 * resolved usernames/wallets.
 * ────────────────────────────────────────────────────────── */

router.get(
  "/api/operator-wallet/ledger/unpaid",
  requirePermission("manage_gameshow"),
  async (_req, res, next) => {
    try {
      const rows = await db
        .select({
          id: rewardLedger.id,
          userId: rewardLedger.userId,
          amountWtf: rewardLedger.amountWtf,
          reason: rewardLedger.reason,
          sourceType: rewardLedger.sourceType,
          sourceId: rewardLedger.sourceId,
          createdAt: rewardLedger.createdAt,
        })
        .from(rewardLedger)
        .where(and(eq(rewardLedger.paid, false), eq(rewardLedger.settlementStatus, "available")))
        .orderBy(rewardLedger.createdAt)
        .limit(500);

      if (rows.length === 0) {
        return res.json({ rows: [], uniqueUsers: 0, totalWtf: "0" });
      }
      const userIds = Array.from(new Set(rows.map((r) => r.userId)));
      const userRows = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(inArray(users.id, userIds));
      const walletRows = await db
        .select({
          userId: userWallets.userId,
          address: userWallets.walletAddress,
        })
        .from(userWallets)
        .where(inArray(userWallets.userId, userIds));

      const userById = new Map(userRows.map((u) => [u.id, u.username]));
      const walletByUser = new Map<number, string>();
      for (const w of walletRows) {
        if (!walletByUser.has(w.userId)) walletByUser.set(w.userId, w.address);
      }
      const total = rows.reduce((acc, r) => acc + BigInt(r.amountWtf), BigInt(0));

      res.json({
        rows: rows.map((r) => ({
          ...r,
          username: userById.get(r.userId) ?? null,
          walletAddress: walletByUser.get(r.userId) ?? null,
        })),
        uniqueUsers: userIds.length,
        totalWtf: total.toString(),
      });
    } catch (err) {
      next(err);
    }
  }
);

// Suppress lint for the orderBy+where helper patterns.
void isNull;

export default router;
