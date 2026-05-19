import { Router, type Request } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { db } from "../db";
import { operatorActions, operatorWalletRuns, rewardCashoutRequests } from "@shared/schema";
import { WTF_FA2_CONTRACT, WTF_FA2_TOKEN_ID } from "../lib/constants";
import { callSigner, isSignerConfigured, SignerError } from "../lib/operator-signer-client";
import {
  allocateWtfRewardLedger,
  getPrimaryRewardWallet,
  getRewardAccountSummary,
  markWtfRewardLedgerPaid,
  releaseWtfRewardLedgerAllocation,
  validateWtfRewardCashoutAmount,
  wholeWtfToRawUnits,
} from "../lib/reward-account";

const router = Router();

const cashoutPayload = z
  .object({
    amountWtf: z
      .union([
        z.string().trim().regex(/^[1-9]\d*$/),
        z.coerce.number().int().positive(),
      ])
      .optional(),
  })
  .strict();

const REWARD_DISBURSER_WALLET_ID =
  (process.env.WTF_REWARD_DISBURSER_WALLET_ID ?? "").trim() || "reward-disburser";

function clientIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0]?.trim() ?? null;
  }
  const ip = req.socket.remoteAddress ?? null;
  return ip ? String(ip).slice(0, 64) : null;
}

async function logRewardAction(opts: {
  actorId: number | null;
  actionKind: string;
  targetId: number | null;
  payload?: Record<string, unknown>;
  req: Request;
}): Promise<void> {
  try {
    await db.insert(operatorActions).values({
      actorUserId: opts.actorId,
      actionKind: opts.actionKind,
      targetKind: "reward_cashout_request",
      targetId: opts.targetId,
      payloadJson: opts.payload ?? {},
      ip: clientIp(opts.req),
    });
  } catch (err) {
    console.warn("[rewards] audit write failed:", err);
  }
}

function mapSignerError(err: unknown): {
  status: number;
  code: string;
  message: string;
  releaseAllocation: boolean;
} {
  if (err instanceof SignerError) {
    const releaseAllocation = [
      "signer_not_configured",
      "signer_invalid_auth",
      "signer_refused",
      "policy_recipients",
      "policy_contract_not_allowed",
      "policy_custom_disabled",
      "DISBURSE_ASSET",
    ].includes(err.code);
    const status =
      err.code === "signer_not_configured" || err.code === "signer_invalid_auth"
        ? 503
        : err.retryable
          ? 502
          : 400;
    return { status, code: err.code, message: err.message, releaseAllocation };
  }
  return {
    status: 500,
    code: "internal",
    message: err instanceof Error ? err.message : "Unknown signer failure",
    releaseAllocation: false,
  };
}

router.get("/api/rewards/account", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const account = await getRewardAccountSummary(Number(user.id));
    res.json(account);
  } catch (err) {
    console.error("GET /api/rewards/account error:", err);
    res.status(500).json({ error: "Failed to fetch reward account" });
  }
});

router.get("/api/rewards/cashouts", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const account = await getRewardAccountSummary(Number(user.id));
    res.json(account.cashouts);
  } catch (err) {
    console.error("GET /api/rewards/cashouts error:", err);
    res.status(500).json({ error: "Failed to fetch cashout requests" });
  }
});

router.post("/api/rewards/cashout", isAuthenticated, async (req, res) => {
  const parsed = cashoutPayload.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid cashout amount" });
  }

  const user = req.user as any;
  const userId = Number(user.id);
  const amountInput = parsed.data.amountWtf;

  try {
    const [account, primaryWallet] = await Promise.all([
      getRewardAccountSummary(userId),
      getPrimaryRewardWallet(userId),
    ]);
    const requestedAmountWtf =
      amountInput == null ? account.balances.availableWtf : Number(amountInput);
    const cashoutCheck = validateWtfRewardCashoutAmount(
      requestedAmountWtf,
      account.balances.availableWtf
    );

    if (!cashoutCheck.ok && cashoutCheck.reason === "no_available_rewards") {
      return res.status(400).json({
        error: "No available WTF rewards to cash out",
        reason: cashoutCheck.reason,
        minimumWtf: cashoutCheck.minimumWtf,
        availableWtf: cashoutCheck.availableWtf,
      });
    }
    if (!cashoutCheck.ok && cashoutCheck.reason === "below_minimum") {
      return res.status(400).json({
        error: `Minimum cashout is ${cashoutCheck.minimumWtf} WTF`,
        reason: cashoutCheck.reason,
        minimumWtf: cashoutCheck.minimumWtf,
        availableWtf: cashoutCheck.availableWtf,
      });
    }
    if (!cashoutCheck.ok && cashoutCheck.reason === "insufficient_balance") {
      return res.status(409).json({
        error: "Cashout amount exceeds available rewards",
        reason: cashoutCheck.reason,
        minimumWtf: cashoutCheck.minimumWtf,
        availableWtf: cashoutCheck.availableWtf,
      });
    }
    if (!cashoutCheck.ok) {
      return res.status(400).json({ error: "Invalid cashout amount" });
    }

    if (!primaryWallet) {
      return res.status(409).json({
        error: "Set a primary linked wallet before cashing out rewards",
        reason: "missing_primary_wallet",
        minimumWtf: cashoutCheck.minimumWtf,
      });
    }

    const amountWtf = cashoutCheck.amountWtf;
    const amountWtfRaw = wholeWtfToRawUnits(amountWtf);
    const reserved = await db.transaction(async (tx) => {
      const [request] = await tx
        .insert(rewardCashoutRequests)
        .values({
          userId,
          walletAddress: primaryWallet.walletAddress,
          amountWtf: String(amountWtf),
          amountWtfRaw,
          status: "pending",
          metadata: {
            requestedBy: userId,
            disburserWalletId: REWARD_DISBURSER_WALLET_ID,
          },
        })
        .returning();

      const settlementRef = `cashout:${request.id}`;
      const allocation = await allocateWtfRewardLedger(
        {
          userId,
          amountWtf,
          settlementStatus: "cashout_pending",
          settlementType: "cashout",
          settlementRef,
          paid: false,
        },
        tx
      );
      if (!allocation.ok) {
        throw new Error("Reward balance changed before cashout could reserve");
      }

      await tx
        .update(rewardCashoutRequests)
        .set({ ledgerIds: allocation.ledgerIds })
        .where(eq(rewardCashoutRequests.id, request.id));

      return {
        requestId: request.id,
        settlementRef,
        ledgerIds: allocation.ledgerIds,
      };
    });

    await logRewardAction({
      actorId: userId,
      actionKind: "reward_cashout_requested",
      targetId: reserved.requestId,
      payload: {
        currency: "wtf",
        amountWtf,
        amountWtfRaw,
        walletAddress: primaryWallet.walletAddress,
        signerConfigured: isSignerConfigured(),
      },
      req,
    });

    if (!isSignerConfigured()) {
      return res.status(202).json({
        ok: true,
        status: "pending",
        currency: "wtf",
        amountWtf,
        requestId: reserved.requestId,
        message: "Cashout reserved. Operator signer is not configured on this server.",
      });
    }

    const [run] = await db
      .insert(operatorWalletRuns)
      .values({
        preparedBy: userId,
        intent: "disburse_wtf",
        assetKind: "fa2",
        assetContract: WTF_FA2_CONTRACT,
        assetTokenId: String(WTF_FA2_TOKEN_ID),
        totalRecipients: 1,
        totalAmount: amountWtfRaw,
        payload: {
          source: "reward_cashout",
          requestId: reserved.requestId,
          ledgerIds: reserved.ledgerIds,
          recipient: {
            userId,
            walletAddress: primaryWallet.walletAddress,
            amountWtf: String(amountWtf),
            amountWtfRaw,
          },
          walletId: REWARD_DISBURSER_WALLET_ID,
        },
        notes: "User reward cashout",
        status: "broadcasting",
      })
      .returning({ id: operatorWalletRuns.id });

    await db
      .update(rewardCashoutRequests)
      .set({
        status: "broadcasting",
        operatorWalletRunId: run.id,
      })
      .where(eq(rewardCashoutRequests.id, reserved.requestId));

    try {
      const response = await callSigner({
        intent: "disburse_wtf",
        assetContract: WTF_FA2_CONTRACT,
        assetTokenId: Number(WTF_FA2_TOKEN_ID),
        recipients: [
          {
            address: primaryWallet.walletAddress,
            amount: amountWtfRaw,
          },
        ],
        runId: run.id,
        walletId: REWARD_DISBURSER_WALLET_ID,
      });

      await db.transaction(async (tx) => {
        await tx
          .update(operatorWalletRuns)
          .set({
            status: "confirmed",
            opHash: response.opHash ?? null,
            signedBy: response.signedBy ?? null,
            finishedAt: new Date(),
          })
          .where(eq(operatorWalletRuns.id, run.id));
        await tx
          .update(rewardCashoutRequests)
          .set({
            status: "paid",
            opHash: response.opHash ?? null,
            processedAt: new Date(),
            operatorWalletRunId: run.id,
          })
          .where(eq(rewardCashoutRequests.id, reserved.requestId));
        await markWtfRewardLedgerPaid(
          {
            ledgerIds: reserved.ledgerIds,
            opHash: response.opHash ?? null,
            paidBy: userId,
            operatorWalletRunId: run.id,
            settlementStatus: "paid",
          },
          tx
        );
      });

      await logRewardAction({
        actorId: userId,
        actionKind: "reward_cashout_executed",
        targetId: reserved.requestId,
        payload: { runId: run.id, opHash: response.opHash, amountWtf, amountWtfRaw },
        req,
      });

      return res.json({
        ok: true,
        status: "paid",
        currency: "wtf",
        amountWtf,
        requestId: reserved.requestId,
        runId: run.id,
        opHash: response.opHash ?? null,
      });
    } catch (signErr) {
      const mapped = mapSignerError(signErr);
      await db.transaction(async (tx) => {
        await tx
          .update(operatorWalletRuns)
          .set({
            status: "failed",
            errorMessage: mapped.message.slice(0, 2000),
            finishedAt: new Date(),
          })
          .where(eq(operatorWalletRuns.id, run.id));
        await tx
          .update(rewardCashoutRequests)
          .set({
            status: "failed",
            errorMessage: mapped.message.slice(0, 2000),
            processedAt: new Date(),
            operatorWalletRunId: run.id,
          })
          .where(eq(rewardCashoutRequests.id, reserved.requestId));
        if (mapped.releaseAllocation) {
          await releaseWtfRewardLedgerAllocation(
            {
              ledgerIds: reserved.ledgerIds,
              settlementRef: reserved.settlementRef,
            },
            tx
          );
        }
      });

      await logRewardAction({
        actorId: userId,
        actionKind: "reward_cashout_failed",
        targetId: reserved.requestId,
        payload: { runId: run.id, code: mapped.code, error: mapped.message },
        req,
      });

      return res.status(mapped.status).json({
        error: mapped.message,
        code: mapped.code,
        requestId: reserved.requestId,
        runId: run.id,
      });
    }
  } catch (err) {
    console.error("POST /api/rewards/cashout error:", err);
    res.status(500).json({ error: "Failed to cash out rewards" });
  }
});

export default router;
