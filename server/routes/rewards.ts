import { Router, type Request } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { isAuthenticated } from "../auth/passport";
import { db } from "../db";
import { operatorActions, operatorWalletRuns, rewardCashoutRequests } from "@shared/schema";
import {
  WTF_FA2_CONTRACT,
  WTF_FA2_TOKEN_ID,
  WTF_REWARD_ESCROW_CONTRACT,
} from "../lib/constants";
import { callSigner, isSignerConfigured, SignerError } from "../lib/operator-signer-client";
import { logSystemEvent } from "../lib/system-log";
import {
  allocateWtfRewardLedger,
  getPrimaryRewardWallet,
  getRewardAccountSummary,
  markWtfRewardLedgerPaid,
  releaseWtfRewardLedgerAllocation,
  validateWtfRewardCashoutAmount,
  wholeWtfToRawUnits,
} from "../lib/reward-account";
import { hasActiveUserCurse } from "../lib/user-curses";

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

const confirmCashoutPayload = z
  .object({
    opHash: z.string().trim().regex(/^o[1-9A-HJ-NP-Za-km-z]{50}$/),
  })
  .strict();

const REWARD_DISBURSER_WALLET_ID =
  (process.env.WTF_REWARD_DISBURSER_WALLET_ID ?? "").trim() || "reward-disburser";
const TZKT_API_URL = (process.env.TZKT_API_URL ?? "https://api.tzkt.io/v1").replace(
  /\/+$/,
  ""
);

type RewardRedemptionMetadata = {
  contract: string;
  redemptionId: string;
  claimant: string;
  amountWtfRaw: string;
  itemRef: string;
  expiresAt: string;
  expectedWtfTokenAddress: string;
  expectedWtfTokenId: number;
  createOpHash?: string | null;
  claimOpHash?: string | null;
};

function readRewardRedemptionMetadata(
  value: Record<string, unknown> | null | undefined
): RewardRedemptionMetadata | null {
  const redemption = value?.redemption;
  if (!redemption || typeof redemption !== "object") return null;
  const candidate = redemption as Record<string, unknown>;
  const required = [
    "contract",
    "redemptionId",
    "claimant",
    "amountWtfRaw",
    "itemRef",
    "expiresAt",
    "expectedWtfTokenAddress",
  ] as const;
  if (
    required.some((key) => typeof candidate[key] !== "string") ||
    typeof candidate.expectedWtfTokenId !== "number"
  ) {
    return null;
  }
  return candidate as RewardRedemptionMetadata;
}

async function verifyRewardClaimOperation(opts: {
  opHash: string;
  redemption: RewardRedemptionMetadata;
}): Promise<"applied" | "pending" | "invalid"> {
  const response = await fetch(
    `${TZKT_API_URL}/operations/transactions/${encodeURIComponent(opts.opHash)}`
  );
  if (response.status === 404) return "pending";
  if (!response.ok) {
    throw new Error(`TzKT claim verification failed with HTTP ${response.status}`);
  }
  const operations = (await response.json()) as Array<{
    status?: string;
    sender?: { address?: string };
    target?: { address?: string };
    parameter?: {
      entrypoint?: string;
      value?: Record<string, unknown>;
    };
  }>;
  if (operations.length === 0) return "pending";
  const matching = operations.find((operation) => {
    const value = operation.parameter?.value;
    return (
      operation.status === "applied" &&
      operation.sender?.address === opts.redemption.claimant &&
      operation.target?.address === opts.redemption.contract &&
      operation.parameter?.entrypoint === "claim_redemption" &&
      String(value?.redemption_id ?? "") === opts.redemption.redemptionId &&
      String(value?.expected_claimant ?? "") === opts.redemption.claimant &&
      String(value?.expected_amount_wtf_units ?? "") ===
        opts.redemption.amountWtfRaw &&
      String(value?.expected_item_ref ?? "") === opts.redemption.itemRef &&
      String(value?.expected_wtf_token_address ?? "") ===
        opts.redemption.expectedWtfTokenAddress &&
      String(value?.expected_wtf_token_id ?? "") ===
        String(opts.redemption.expectedWtfTokenId)
    );
  });
  return matching ? "applied" : "invalid";
}

async function waitForRewardRedemptionCreation(opts: {
  opHash: string;
  issuer: string;
  redemption: RewardRedemptionMetadata;
}): Promise<"applied" | "failed" | "pending"> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(
      `${TZKT_API_URL}/operations/transactions/${encodeURIComponent(opts.opHash)}`
    );
    if (!response.ok && response.status !== 404) {
      throw new Error(
        `TzKT redemption verification failed with HTTP ${response.status}`
      );
    }
    const operations = response.ok
      ? ((await response.json()) as Array<{
          status?: string;
          sender?: { address?: string };
          target?: { address?: string };
          parameter?: {
            entrypoint?: string;
            value?: Record<string, unknown>;
          };
        }>)
      : [];
    const matching = operations.find((operation) => {
      const value = operation.parameter?.value;
      return (
        operation.sender?.address === opts.issuer &&
        operation.target?.address === opts.redemption.contract &&
        operation.parameter?.entrypoint === "create_redemption" &&
        String(value?.redemption_id ?? "") === opts.redemption.redemptionId &&
        String(value?.claimant ?? "") === opts.redemption.claimant &&
        String(value?.amount_wtf_units ?? "") === opts.redemption.amountWtfRaw &&
        String(value?.item_ref ?? "") === opts.redemption.itemRef &&
        new Date(String(value?.expires_at ?? "")).getTime() ===
          new Date(opts.redemption.expiresAt).getTime()
      );
    });
    if (matching?.status === "applied") return "applied";
    if (matching && matching.status && matching.status !== "pending") return "failed";
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  return "pending";
}

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
      "REDEMPTION_CREATE_FAILED",
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
    const rewardEmbargo = await hasActiveUserCurse(Number(user.id), "wtf_reward_embargo");
    const account = await getRewardAccountSummary(Number(user.id));
    if (rewardEmbargo) {
      logSystemEvent({
        source: "rewards",
        eventType: "reward.wtf_embargo.warned",
        severity: "warn",
        userId: Number(user.id),
        message: "WTF reward account viewed while No WTF Rewards curse is active",
        metadata: { curseKey: "wtf_reward_embargo", action: "account_view" },
      });
    }
    res.json({
      ...account,
      rewardEmbargo,
      curseWarning: rewardEmbargo
        ? "A WTF OS curse prevents this account from earning new WTF platform rewards."
        : null,
    });
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

router.post(
  "/api/rewards/cashouts/:id/confirm",
  isAuthenticated,
  async (req, res) => {
    const parsed = confirmCashoutPayload.safeParse(req.body ?? {});
    const requestId = Number(req.params.id);
    if (!parsed.success || !Number.isSafeInteger(requestId) || requestId <= 0) {
      return res.status(400).json({ error: "Invalid cashout confirmation" });
    }

    const user = req.user as any;
    const userId = Number(user.id);
    try {
      const [cashout] = await db
        .select()
        .from(rewardCashoutRequests)
        .where(
          and(
            eq(rewardCashoutRequests.id, requestId),
            eq(rewardCashoutRequests.userId, userId)
          )
        )
        .limit(1);
      if (!cashout) return res.status(404).json({ error: "Cashout not found" });
      if (cashout.status === "paid") {
        return res.json({
          ok: true,
          status: "paid",
          requestId,
          opHash: cashout.opHash,
        });
      }
      if (cashout.status !== "claimable") {
        return res.status(409).json({
          error: "Cashout is not ready to claim",
          status: cashout.status,
        });
      }

      const redemption = readRewardRedemptionMetadata(cashout.metadata);
      if (!redemption) {
        return res.status(500).json({ error: "Cashout redemption metadata is missing" });
      }
      const verification = await verifyRewardClaimOperation({
        opHash: parsed.data.opHash,
        redemption,
      });
      if (verification === "pending") {
        await db
          .update(rewardCashoutRequests)
          .set({
            metadata: {
              ...cashout.metadata,
              redemption: {
                ...redemption,
                claimOpHash: parsed.data.opHash,
              },
            },
          })
          .where(eq(rewardCashoutRequests.id, requestId));
        return res.status(202).json({
          ok: true,
          status: "confirming",
          requestId,
          opHash: parsed.data.opHash,
        });
      }
      if (verification === "invalid") {
        return res.status(400).json({
          error: "Operation does not match this reward claim",
          code: "claim_operation_mismatch",
        });
      }

      await db.transaction(async (tx) => {
        const [settled] = await tx
          .update(rewardCashoutRequests)
          .set({
            status: "paid",
            opHash: parsed.data.opHash,
            processedAt: new Date(),
            metadata: {
              ...cashout.metadata,
              redemption: {
                ...redemption,
                claimOpHash: parsed.data.opHash,
              },
            },
          })
          .where(
            and(
              eq(rewardCashoutRequests.id, requestId),
              eq(rewardCashoutRequests.status, "claimable")
            )
          )
          .returning({ id: rewardCashoutRequests.id });
        if (!settled) return;
        await markWtfRewardLedgerPaid(
          {
            ledgerIds: cashout.ledgerIds,
            opHash: parsed.data.opHash,
            paidBy: userId,
            operatorWalletRunId: cashout.operatorWalletRunId,
            settlementStatus: "paid",
          },
          tx
        );
      });

      await logRewardAction({
        actorId: userId,
        actionKind: "reward_cashout_claim_confirmed",
        targetId: requestId,
        payload: {
          opHash: parsed.data.opHash,
          contract: redemption.contract,
          redemptionId: redemption.redemptionId,
        },
        req,
      });

      return res.json({
        ok: true,
        status: "paid",
        requestId,
        opHash: parsed.data.opHash,
      });
    } catch (err) {
      console.error("POST /api/rewards/cashouts/:id/confirm error:", err);
      return res.status(502).json({ error: "Failed to verify reward claim" });
    }
  }
);

router.post("/api/rewards/cashout", isAuthenticated, async (req, res) => {
  const parsed = cashoutPayload.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid cashout amount" });
  }

  const user = req.user as any;
  const userId = Number(user.id);
  const amountInput = parsed.data.amountWtf;

  try {
    if (await hasActiveUserCurse(userId, "wtf_reward_embargo")) {
      logSystemEvent({
        source: "rewards",
        eventType: "reward.wtf_embargo.warned",
        severity: "warn",
        userId,
        message: "WTF reward cashout blocked by No WTF Rewards curse",
        metadata: { curseKey: "wtf_reward_embargo", action: "cashout" },
      });
      return res.status(403).json({
        error: "A WTF OS curse prevents this account from using WTF reward actions.",
        reason: "wtf_reward_embargo",
      });
    }
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

    if (!WTF_REWARD_ESCROW_CONTRACT) {
      return res.status(202).json({
        ok: true,
        status: "pending",
        currency: "wtf",
        amountWtf,
        requestId: reserved.requestId,
        message: "Cashout reserved. Reward escrow is not configured on this server.",
      });
    }

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString();
    const redemption: RewardRedemptionMetadata = {
      contract: WTF_REWARD_ESCROW_CONTRACT,
      redemptionId: String(reserved.requestId),
      claimant: primaryWallet.walletAddress,
      amountWtfRaw,
      itemRef: `reward_cashout:${reserved.requestId}`,
      expiresAt,
      expectedWtfTokenAddress: WTF_FA2_CONTRACT,
      expectedWtfTokenId: Number(WTF_FA2_TOKEN_ID),
    };

    const [run] = await db
      .insert(operatorWalletRuns)
      .values({
        preparedBy: userId,
        intent: "custom",
        assetKind: "fa2",
        assetContract: WTF_FA2_CONTRACT,
        assetTokenId: String(WTF_FA2_TOKEN_ID),
        counterpartyContract: WTF_REWARD_ESCROW_CONTRACT,
        totalRecipients: 1,
        totalAmount: amountWtfRaw,
        payload: {
          source: "reward_cashout_redemption",
          requestId: reserved.requestId,
          ledgerIds: reserved.ledgerIds,
          redemption,
          walletId: REWARD_DISBURSER_WALLET_ID,
        },
        notes: "Create user-claimed WTF reward redemption",
        status: "broadcasting",
      })
      .returning({ id: operatorWalletRuns.id });

    await db
      .update(rewardCashoutRequests)
      .set({
        status: "broadcasting",
        operatorWalletRunId: run.id,
        metadata: {
          requestedBy: userId,
          disburserWalletId: REWARD_DISBURSER_WALLET_ID,
          redemption,
        },
      })
      .where(eq(rewardCashoutRequests.id, reserved.requestId));

    try {
      const response = await callSigner({
        intent: "custom",
        counterpartyContract: WTF_REWARD_ESCROW_CONTRACT,
        entrypoint: "create_redemption",
        params: {
          redemption_id: redemption.redemptionId,
          claimant: redemption.claimant,
          amount_wtf_units: redemption.amountWtfRaw,
          item_ref: redemption.itemRef,
          expires_at: redemption.expiresAt,
        },
        amountMutez: "0",
        runId: run.id,
        walletId: REWARD_DISBURSER_WALLET_ID,
      });
      if (!response.opHash || !response.signedBy) {
        throw new SignerError("Signer omitted redemption operation identity", {
          code: "signer_malformed_response",
        });
      }
      let creationStatus: "applied" | "failed" | "pending" = "pending";
      try {
        creationStatus = await waitForRewardRedemptionCreation({
          opHash: response.opHash,
          issuer: response.signedBy,
          redemption,
        });
      } catch (verificationError) {
        console.warn(
          "[rewards] redemption creation confirmation unavailable:",
          verificationError
        );
      }
      if (creationStatus === "failed") {
        throw new SignerError("Reward redemption creation failed on-chain", {
          code: "REDEMPTION_CREATE_FAILED",
        });
      }

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
            status: "claimable",
            opHash: null,
            operatorWalletRunId: run.id,
            metadata: {
              requestedBy: userId,
              disburserWalletId: REWARD_DISBURSER_WALLET_ID,
              redemption: {
                ...redemption,
                createOpHash: response.opHash ?? null,
              },
            },
          })
          .where(eq(rewardCashoutRequests.id, reserved.requestId));
      });

      await logRewardAction({
        actorId: userId,
        actionKind: "reward_cashout_redemption_created",
        targetId: reserved.requestId,
        payload: { runId: run.id, opHash: response.opHash, amountWtf, amountWtfRaw },
        req,
      });

      return res.json({
        ok: true,
        status: "claimable",
        currency: "wtf",
        amountWtf,
        requestId: reserved.requestId,
        runId: run.id,
        createOpHash: response.opHash ?? null,
        creationConfirmed: creationStatus === "applied",
        redemption: {
          ...redemption,
        },
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
