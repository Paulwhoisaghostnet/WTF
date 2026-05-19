import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import { rewardCashoutRequests, rewardLedger, userWallets } from "@shared/schema";

type RewardDb = typeof db | any;

export const WTF_RAW_UNITS_PER_WHOLE = 100_000_000n;
export const MIN_WTF_REWARD_CASHOUT = 20;

export type RewardLedgerSettlementStatus =
  | "available"
  | "cashout_pending"
  | "paid"
  | "spent";

export type RewardLedgerSettlementType =
  | "cashout"
  | "market_spend"
  | "operator_disbursement"
  | "admin_manual";

export type RewardAllocationSourceRow = {
  id: number;
  amountWtf: number;
};

export type RewardAllocationStep = {
  ledgerId: number;
  takeWtf: number;
  remainingWtf: number;
  split: boolean;
};

export type WtfRewardCashoutValidation =
  | { ok: true; amountWtf: number; availableWtf: number; minimumWtf: number }
  | {
      ok: false;
      reason: "no_available_rewards" | "below_minimum" | "insufficient_balance";
      amountWtf: number;
      availableWtf: number;
      minimumWtf: number;
    };

export function normalizeWholeWtf(value: string | number | bigint): number {
  if (typeof value === "bigint") {
    if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("WTF amount is outside supported range");
    }
    return Number(value);
  }
  if (typeof value === "number") {
    const normalized = Math.floor(value);
    if (!Number.isSafeInteger(normalized) || normalized <= 0) {
      throw new Error("WTF amount must be a positive whole number");
    }
    return normalized;
  }
  const trimmed = value.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    throw new Error("WTF amount must be a positive whole number");
  }
  const asBigInt = BigInt(trimmed);
  if (asBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("WTF amount is outside supported range");
  }
  return Number(asBigInt);
}

function normalizeNonNegativeWholeWtf(value: string | number | bigint): number {
  if (typeof value === "bigint") {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("WTF amount is outside supported range");
    }
    return Number(value);
  }
  if (typeof value === "number") {
    const normalized = Math.floor(value);
    if (!Number.isSafeInteger(normalized) || normalized < 0) {
      throw new Error("WTF amount must be a non-negative whole number");
    }
    return normalized;
  }
  const trimmed = value.trim();
  if (!/^(0|[1-9]\d*)$/.test(trimmed)) {
    throw new Error("WTF amount must be a non-negative whole number");
  }
  const asBigInt = BigInt(trimmed);
  if (asBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("WTF amount is outside supported range");
  }
  return Number(asBigInt);
}

export function wholeWtfToRawUnits(amountWtf: string | number | bigint): string {
  const whole = normalizeWholeWtf(amountWtf);
  return (BigInt(whole) * WTF_RAW_UNITS_PER_WHOLE).toString();
}

export function ceilRawUnitsToWholeWtfNumber(rawUnits: string | number | bigint): number {
  const raw = BigInt(String(rawUnits ?? "0"));
  if (raw <= 0n) return 0;
  return Number((raw + WTF_RAW_UNITS_PER_WHOLE - 1n) / WTF_RAW_UNITS_PER_WHOLE);
}

export function validateWtfRewardCashoutAmount(
  amountWtfInput: string | number | bigint,
  availableWtfInput: string | number | bigint
): WtfRewardCashoutValidation {
  const availableWtf = normalizeNonNegativeWholeWtf(availableWtfInput);
  const amountWtf = normalizeNonNegativeWholeWtf(amountWtfInput);
  const minimumWtf = MIN_WTF_REWARD_CASHOUT;

  if (availableWtf <= 0) {
    return { ok: false, reason: "no_available_rewards", amountWtf, availableWtf, minimumWtf };
  }
  if (amountWtf < minimumWtf) {
    return { ok: false, reason: "below_minimum", amountWtf, availableWtf, minimumWtf };
  }
  if (amountWtf > availableWtf) {
    return { ok: false, reason: "insufficient_balance", amountWtf, availableWtf, minimumWtf };
  }
  return { ok: true, amountWtf, availableWtf, minimumWtf };
}

export function planWtfRewardLedgerAllocation(
  rows: RewardAllocationSourceRow[],
  amountWtfInput: string | number | bigint
):
  | {
      ok: true;
      amountWtf: number;
      availableWtf: number;
      steps: RewardAllocationStep[];
    }
  | { ok: false; reason: "insufficient_balance"; amountWtf: number; availableWtf: number } {
  const amountWtf = normalizeWholeWtf(amountWtfInput);
  const availableWtf = rows.reduce((sum, row) => {
    const rowAmount = Number(row.amountWtf ?? 0);
    return Number.isSafeInteger(rowAmount) && rowAmount > 0 ? sum + rowAmount : sum;
  }, 0);
  if (availableWtf < amountWtf) {
    return { ok: false, reason: "insufficient_balance", amountWtf, availableWtf };
  }

  let remaining = amountWtf;
  const steps: RewardAllocationStep[] = [];
  for (const row of rows) {
    if (remaining <= 0) break;
    const rowAmount = Number(row.amountWtf ?? 0);
    if (!Number.isSafeInteger(rowAmount) || rowAmount <= 0) continue;
    const takeWtf = Math.min(rowAmount, remaining);
    steps.push({
      ledgerId: row.id,
      takeWtf,
      remainingWtf: rowAmount - takeWtf,
      split: takeWtf < rowAmount,
    });
    remaining -= takeWtf;
  }

  return { ok: true, amountWtf, availableWtf, steps };
}

export async function getPrimaryRewardWallet(
  userId: number,
  database: RewardDb = db
): Promise<{ id: number; walletAddress: string } | null> {
  const [wallet] = await database
    .select({
      id: userWallets.id,
      walletAddress: userWallets.walletAddress,
    })
    .from(userWallets)
    .where(and(eq(userWallets.userId, userId), eq(userWallets.isPrimary, true)))
    .limit(1);
  return wallet ?? null;
}

export async function getRewardAccountSummary(
  userId: number,
  database: RewardDb = db
): Promise<{
  balances: {
    totalEarnedWtf: number;
    availableWtf: number;
    pendingCashoutWtf: number;
    currentOwedWtf: number;
    alreadyPaidWtf: number;
    marketSpentWtf: number;
  };
  cashout: {
    currency: "wtf";
    minimumWtf: number;
    canCashOut: boolean;
    expCashoutEnabled: false;
  };
  primaryWallet: { id: number; walletAddress: string } | null;
  ledger: Array<{
    id: number;
    amountWtf: number;
    reason: string;
    sourceType: string;
    sourceId: number | null;
    settlementStatus: string;
    settlementType: string | null;
    settlementRef: string | null;
    paid: boolean;
    opHash: string | null;
    createdAt: Date;
    settledAt: Date | null;
    paidAt: Date | null;
  }>;
  cashouts: Array<typeof rewardCashoutRequests.$inferSelect>;
}> {
  const [totals] = await database
    .select({
      totalEarnedWtf: sql<string>`coalesce(sum(${rewardLedger.amountWtf})::text, '0')`,
      availableWtf: sql<string>`coalesce(sum(case when ${rewardLedger.paid} = false and ${rewardLedger.settlementStatus} = 'available' then ${rewardLedger.amountWtf} else 0 end)::text, '0')`,
      pendingCashoutWtf: sql<string>`coalesce(sum(case when ${rewardLedger.paid} = false and ${rewardLedger.settlementStatus} = 'cashout_pending' then ${rewardLedger.amountWtf} else 0 end)::text, '0')`,
      alreadyPaidWtf: sql<string>`coalesce(sum(case when ${rewardLedger.paid} = true and (${rewardLedger.settlementType} is null or ${rewardLedger.settlementType} in ('cashout', 'operator_disbursement', 'admin_manual')) then ${rewardLedger.amountWtf} else 0 end)::text, '0')`,
      marketSpentWtf: sql<string>`coalesce(sum(case when ${rewardLedger.paid} = true and ${rewardLedger.settlementType} = 'market_spend' then ${rewardLedger.amountWtf} else 0 end)::text, '0')`,
    })
    .from(rewardLedger)
    .where(eq(rewardLedger.userId, userId));

  const [primaryWallet, ledger, cashouts] = await Promise.all([
    getPrimaryRewardWallet(userId, database),
    database
      .select({
        id: rewardLedger.id,
        amountWtf: rewardLedger.amountWtf,
        reason: rewardLedger.reason,
        sourceType: rewardLedger.sourceType,
        sourceId: rewardLedger.sourceId,
        settlementStatus: rewardLedger.settlementStatus,
        settlementType: rewardLedger.settlementType,
        settlementRef: rewardLedger.settlementRef,
        paid: rewardLedger.paid,
        opHash: rewardLedger.opHash,
        createdAt: rewardLedger.createdAt,
        settledAt: rewardLedger.settledAt,
        paidAt: rewardLedger.paidAt,
      })
      .from(rewardLedger)
      .where(eq(rewardLedger.userId, userId))
      .orderBy(desc(rewardLedger.createdAt), desc(rewardLedger.id))
      .limit(25),
    database
      .select()
      .from(rewardCashoutRequests)
      .where(eq(rewardCashoutRequests.userId, userId))
      .orderBy(desc(rewardCashoutRequests.requestedAt))
      .limit(12),
  ]);

  const availableWtf = numberFromSql(totals?.availableWtf);
  const pendingCashoutWtf = numberFromSql(totals?.pendingCashoutWtf);
  return {
    balances: {
      totalEarnedWtf: numberFromSql(totals?.totalEarnedWtf),
      availableWtf,
      pendingCashoutWtf,
      currentOwedWtf: availableWtf + pendingCashoutWtf,
      alreadyPaidWtf: numberFromSql(totals?.alreadyPaidWtf),
      marketSpentWtf: numberFromSql(totals?.marketSpentWtf),
    },
    cashout: {
      currency: "wtf",
      minimumWtf: MIN_WTF_REWARD_CASHOUT,
      canCashOut: availableWtf >= MIN_WTF_REWARD_CASHOUT,
      expCashoutEnabled: false,
    },
    primaryWallet,
    ledger,
    cashouts,
  };
}

export async function allocateWtfRewardLedger(
  input: {
    userId: number;
    amountWtf: string | number | bigint;
    settlementStatus: RewardLedgerSettlementStatus;
    settlementType: RewardLedgerSettlementType;
    settlementRef: string;
    paid: boolean;
    paidBy?: number | null;
    opHash?: string | null;
    operatorWalletRunId?: number | null;
    settledAt?: Date;
    paidAt?: Date | null;
  },
  database: RewardDb = db
): Promise<
  | { ok: true; amountWtf: number; ledgerIds: number[] }
  | { ok: false; reason: "insufficient_balance"; availableWtf: number }
> {
  const amountWtf = normalizeWholeWtf(input.amountWtf);
  const rows = await database
    .select()
    .from(rewardLedger)
    .where(
      and(
        eq(rewardLedger.userId, input.userId),
        eq(rewardLedger.paid, false),
        eq(rewardLedger.settlementStatus, "available")
      )
    )
    .orderBy(asc(rewardLedger.createdAt), asc(rewardLedger.id));

  const allocationPlan = planWtfRewardLedgerAllocation(
    (rows as Array<typeof rewardLedger.$inferSelect>).map((row) => ({
      id: row.id,
      amountWtf: Number(row.amountWtf ?? 0),
    })),
    amountWtf
  );
  if (!allocationPlan.ok) {
    return {
      ok: false,
      reason: "insufficient_balance",
      availableWtf: allocationPlan.availableWtf,
    };
  }

  const now = input.settledAt ?? new Date();
  const ledgerIds: number[] = [];
  const rowsById = new Map(
    (rows as Array<typeof rewardLedger.$inferSelect>).map((row) => [row.id, row])
  );

  for (const step of allocationPlan.steps) {
    const row = rowsById.get(step.ledgerId);
    if (!row) throw new Error("Reward ledger allocation plan referenced a missing row");
    const rowAmount = Number(row.amountWtf ?? 0);
    if (!Number.isSafeInteger(rowAmount) || rowAmount <= 0) continue;
    const settlementSet = {
      paid: input.paid,
      paidAt: input.paid ? input.paidAt ?? now : null,
      paidBy: input.paidBy ?? null,
      opHash: input.opHash ?? null,
      operatorWalletRunId: input.operatorWalletRunId ?? null,
      settlementStatus: input.settlementStatus,
      settlementType: input.settlementType,
      settlementRef: input.settlementRef.slice(0, 160),
      settledAt: now,
    };

    if (!step.split) {
      const [updated] = await database
        .update(rewardLedger)
        .set(settlementSet)
        .where(
          and(
            eq(rewardLedger.id, row.id),
            eq(rewardLedger.paid, false),
            eq(rewardLedger.settlementStatus, "available"),
            eq(rewardLedger.amountWtf, rowAmount)
          )
        )
        .returning({ id: rewardLedger.id });
      if (!updated) throw new Error("Reward ledger allocation race detected");
      ledgerIds.push(updated.id);
    } else {
      const [updatedOriginal] = await database
        .update(rewardLedger)
        .set({ amountWtf: rowAmount - step.takeWtf })
        .where(
          and(
            eq(rewardLedger.id, row.id),
            eq(rewardLedger.paid, false),
            eq(rewardLedger.settlementStatus, "available"),
            eq(rewardLedger.amountWtf, rowAmount)
          )
        )
        .returning({ id: rewardLedger.id });
      if (!updatedOriginal) throw new Error("Reward ledger allocation race detected");

      const [splitRow] = await database
        .insert(rewardLedger)
        .values({
          userId: row.userId,
          amountWtf: step.takeWtf,
          reason: row.reason,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          ...settlementSet,
        })
        .returning({ id: rewardLedger.id });
      ledgerIds.push(splitRow.id);
    }
  }

  if (ledgerIds.length !== allocationPlan.steps.length) {
    throw new Error("Reward ledger allocation failed");
  }
  return { ok: true, amountWtf, ledgerIds };
}

export async function markWtfRewardLedgerPaid(
  input: {
    ledgerIds: number[];
    opHash?: string | null;
    paidBy?: number | null;
    operatorWalletRunId?: number | null;
    settlementStatus?: RewardLedgerSettlementStatus;
  },
  database: RewardDb = db
): Promise<void> {
  if (input.ledgerIds.length === 0) return;
  const now = new Date();
  await database
    .update(rewardLedger)
    .set({
      paid: true,
      opHash: input.opHash ?? null,
      paidAt: now,
      paidBy: input.paidBy ?? null,
      operatorWalletRunId: input.operatorWalletRunId ?? null,
      settlementStatus: input.settlementStatus ?? "paid",
      settledAt: now,
    })
    .where(inArray(rewardLedger.id, input.ledgerIds));
}

export async function releaseWtfRewardLedgerAllocation(
  input: { ledgerIds: number[]; settlementRef: string },
  database: RewardDb = db
): Promise<void> {
  if (input.ledgerIds.length === 0) return;
  await database
    .update(rewardLedger)
    .set({
      paid: false,
      opHash: null,
      paidAt: null,
      paidBy: null,
      operatorWalletRunId: null,
      settlementStatus: "available",
      settlementType: null,
      settlementRef: null,
      settledAt: null,
    })
    .where(
      and(
        inArray(rewardLedger.id, input.ledgerIds),
        eq(rewardLedger.settlementRef, input.settlementRef)
      )
    );
}

export function settlementGrantKey(
  ledgerId: number,
  settlementType: string,
  settlementRef: string
): string {
  const digest = createHash("sha256")
    .update(`${ledgerId}:${settlementType}:${settlementRef}`)
    .digest("hex")
    .slice(0, 16);
  return `reward_ledger:${ledgerId}:settle:${settlementType.slice(0, 12)}:${digest}`.slice(
    0,
    180
  );
}

function numberFromSql(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}
