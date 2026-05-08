import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  casinoMembershipIntents,
  casinoMemberships,
  inAppInventoryItems,
  inAppMarketItems,
  userWallets,
} from "@shared/schema";
import { formatWtf, WTF_CASINO_MEMBERSHIP } from "@shared/types";
import { coerceClientNetwork, getNetwork } from "../../lib/contract-config";
import {
  extractCallArg,
  fetchTransactionsByHash,
  findAppliedContractCall,
  isValidOpHash,
  type TzktTransactionOp,
} from "../../lib/tzkt-ops";
import type { ConsoleAuthUser } from "../console/types";

export const CASINO_APP_PASS_SKU = "casino-app-pass";
export const CASINO_MEMBERSHIP_DURATION_MS =
  WTF_CASINO_MEMBERSHIP.durationDays * 24 * 60 * 60 * 1000;
export const CASINO_MEMBERSHIP_INTENT_TTL_MS = 30 * 60_000;

const ADDRESS_RE = /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;
const KT1_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

export type CasinoMembershipConfig = {
  network: string;
  contractAddress: string | null;
  treasuryAddress: string;
  feeMutez: number;
  feeTez: string;
  durationDays: number;
  configured: boolean;
};

export type CasinoAccessStatus = {
  userId: number;
  appPass: {
    sku: string;
    owned: boolean;
    quantity: number;
    marketCategory: "casino";
  };
  membership: {
    active: boolean;
    expiresAt: string | null;
    walletAddress: string | null;
    purchaseRef: string | null;
  };
  canEnter: boolean;
  wageringEnabled: false;
  config: CasinoMembershipConfig;
};

export type CasinoGameStub = {
  key: string;
  title: string;
  mode: "single_player" | "multi_player";
  status: "planned";
  minPlayers: number;
  maxPlayers: number;
  defaultHouseTakeBps: number;
};

export const CASINO_GAME_REGISTRY: CasinoGameStub[] = [];

function normalizeAddress(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return ADDRESS_RE.test(trimmed) ? trimmed : null;
}

function normalizeKt1(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return KT1_RE.test(trimmed) ? trimmed : null;
}

function formatMutez(mutez: number): string {
  return (mutez / 1_000_000)
    .toFixed(6)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

function parseMutez(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!/^[0-9]+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function getCasinoMembershipConfig(): CasinoMembershipConfig {
  const network =
    coerceClientNetwork(process.env.TEZOS_NETWORK) ?? getNetwork() ?? "mainnet";
  const contractAddress = normalizeKt1(
    process.env.CASINO_MEMBERSHIP_CONTRACT_ADDRESS ||
      process.env.WTF_CASINO_MEMBERSHIP_CONTRACT_ADDRESS
  );
  const treasuryAddress =
    normalizeAddress(
      process.env.CASINO_MEMBERSHIP_TREASURY_ADDRESS ||
        process.env.WTF_CASINO_MEMBERSHIP_TREASURY
    ) ?? WTF_CASINO_MEMBERSHIP.treasuryAddress;
  const configured = Boolean(contractAddress && treasuryAddress);

  return {
    network,
    contractAddress,
    treasuryAddress,
    feeMutez: WTF_CASINO_MEMBERSHIP.feeMutez,
    feeTez: formatMutez(WTF_CASINO_MEMBERSHIP.feeMutez),
    durationDays: WTF_CASINO_MEMBERSHIP.durationDays,
    configured,
  };
}

export async function ensureCasinoAppPassItem() {
  const [item] = await db
    .insert(inAppMarketItems)
    .values({
      sku: CASINO_APP_PASS_SKU,
      name: "WTF Casino App",
      description:
        "Unlocks the WTF Casino desktop app. A separate XTZ membership card is required for entry.",
      category: "casino",
      priceWtfUnits: "10000000000",
      priceExp: 1000,
      active: true,
      stockQuantity: 1_000_000,
      rarityTier: 2,
      priceScore: 1,
      priceWtfLocked: false,
      priceScoreLocked: true,
      contractAddress: null,
      contractListingId: null,
      sortOrder: 1,
      metadata: {
        kind: "casino-app-pass",
        surface: "casino",
        entitlement: "casino-app",
        opens: "/casino",
      },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: inAppMarketItems.sku,
      set: {
        name: "WTF Casino App",
        description:
          "Unlocks the WTF Casino desktop app. A separate XTZ membership card is required for entry.",
        category: "casino",
        priceWtfUnits: "10000000000",
        priceExp: 1000,
        active: true,
        stockQuantity: 1_000_000,
        rarityTier: 2,
        priceScore: 1,
        priceScoreLocked: true,
        metadata: {
          kind: "casino-app-pass",
          surface: "casino",
          entitlement: "casino-app",
          opens: "/casino",
        },
        sortOrder: 1,
        updatedAt: new Date(),
      },
    })
    .returning();
  return item;
}

async function linkedWalletsForUser(userId: number): Promise<string[]> {
  const rows = await db
    .select({ walletAddress: userWallets.walletAddress })
    .from(userWallets)
    .where(eq(userWallets.userId, userId));
  return rows.map((row) => row.walletAddress).filter(Boolean);
}

async function loadAppPass(userId: number): Promise<{ owned: boolean; quantity: number }> {
  await ensureCasinoAppPassItem();
  const [row] = await db
    .select({ quantity: inAppInventoryItems.quantity })
    .from(inAppInventoryItems)
    .where(
      and(
        eq(inAppInventoryItems.userId, userId),
        eq(inAppInventoryItems.sku, CASINO_APP_PASS_SKU)
      )
    )
    .limit(1);
  const quantity = Math.max(0, Number(row?.quantity ?? 0));
  return { owned: quantity > 0, quantity };
}

async function loadActiveMembership(userId: number) {
  const [membership] = await db
    .select()
    .from(casinoMemberships)
    .where(
      and(
        eq(casinoMemberships.userId, userId),
        eq(casinoMemberships.status, "active"),
        gt(casinoMemberships.expiresAt, new Date())
      )
    )
    .orderBy(desc(casinoMemberships.expiresAt))
    .limit(1);
  return membership ?? null;
}

export async function getCasinoAccessStatus(
  user: ConsoleAuthUser
): Promise<CasinoAccessStatus> {
  const [appPass, membership] = await Promise.all([
    loadAppPass(user.id),
    loadActiveMembership(user.id),
  ]);

  return {
    userId: user.id,
    appPass: {
      sku: CASINO_APP_PASS_SKU,
      owned: appPass.owned,
      quantity: appPass.quantity,
      marketCategory: "casino",
    },
    membership: {
      active: Boolean(membership),
      expiresAt: membership?.expiresAt?.toISOString() ?? null,
      walletAddress: membership?.walletAddress ?? null,
      purchaseRef: membership?.purchaseRef ?? null,
    },
    canEnter: appPass.owned && Boolean(membership),
    wageringEnabled: false,
    config: getCasinoMembershipConfig(),
  };
}

function makeCasinoPurchaseRef(userId: number): string {
  return `casino:${userId}:${Date.now().toString(36)}:${randomUUID().slice(0, 8)}`;
}

export async function createCasinoMembershipIntent(input: {
  userId: number;
  walletAddress?: string | null;
}) {
  const appPass = await loadAppPass(input.userId);
  if (!appPass.owned) {
    const err = new Error("WTF Casino app purchase required before membership.");
    (err as Error & { statusCode?: number }).statusCode = 402;
    throw err;
  }

  const config = getCasinoMembershipConfig();
  if (!config.configured || !config.contractAddress) {
    const err = new Error("WTF Casino membership contract is not configured.");
    (err as Error & { statusCode?: number }).statusCode = 503;
    throw err;
  }

  const [intent] = await db
    .insert(casinoMembershipIntents)
    .values({
      userId: input.userId,
      purchaseRef: makeCasinoPurchaseRef(input.userId),
      walletAddress: normalizeAddress(input.walletAddress),
      contractAddress: config.contractAddress,
      treasuryAddress: config.treasuryAddress,
      feeMutez: config.feeMutez,
      status: "pending",
      expiresAt: new Date(Date.now() + CASINO_MEMBERSHIP_INTENT_TTL_MS),
      updatedAt: new Date(),
    })
    .returning();

  return {
    id: intent.id,
    purchaseRef: intent.purchaseRef,
    walletAddress: intent.walletAddress,
    contractAddress: intent.contractAddress,
    treasuryAddress: intent.treasuryAddress,
    feeMutez: intent.feeMutez,
    feeTez: formatMutez(intent.feeMutez),
    status: intent.status,
    expiresAt: intent.expiresAt.toISOString(),
  };
}

function transactionSender(row: TzktTransactionOp): string {
  return row.sender?.address || "";
}

function transactionTarget(row: TzktTransactionOp): string {
  return row.target?.address || "";
}

function hasTreasuryForward(rows: TzktTransactionOp[], config: CasinoMembershipConfig): boolean {
  const contract = String(config.contractAddress || "").toLowerCase();
  const treasury = config.treasuryAddress.toLowerCase();
  return rows.some((row) => {
    const status = row.status || "applied";
    return (
      status === "applied" &&
      transactionSender(row).toLowerCase() === contract &&
      transactionTarget(row).toLowerCase() === treasury &&
      parseMutez(row.amount) === config.feeMutez
    );
  });
}

export async function verifyCasinoMembershipPurchaseByHash(
  opHash: string,
  requesterUserId: number
): Promise<{
  ok: boolean;
  reason?: "not_configured" | "invalid_hash" | "not_found" | "mismatch" | "intent_unavailable";
  membershipId?: number | null;
  expiresAt?: string | null;
}> {
  const config = getCasinoMembershipConfig();
  if (!config.configured || !config.contractAddress) {
    return { ok: false, reason: "not_configured" };
  }
  if (!isValidOpHash(opHash)) return { ok: false, reason: "invalid_hash" };

  const linkedWallets = await linkedWalletsForUser(requesterUserId);
  if (linkedWallets.length === 0) return { ok: false, reason: "mismatch" };

  const rows = await fetchTransactionsByHash(opHash, { retries: 4 });
  if (rows.length === 0) return { ok: false, reason: "not_found" };

  const call = findAppliedContractCall(rows, {
    contract: config.contractAddress,
    senderOneOf: linkedWallets,
    entrypoint: "purchase_membership",
  });
  if (!call?.op.hash) return { ok: false, reason: "mismatch" };
  if (parseMutez(call.op.amount) !== config.feeMutez) {
    return { ok: false, reason: "mismatch" };
  }
  if (!hasTreasuryForward(rows, config)) return { ok: false, reason: "mismatch" };

  const purchaseRef = extractCallArg(call.op, [["membership_ref"], ["membershipRef"]]);
  if (typeof purchaseRef !== "string" || purchaseRef.length === 0) {
    return { ok: false, reason: "mismatch" };
  }

  const [intent] = await db
    .select()
    .from(casinoMembershipIntents)
    .where(eq(casinoMembershipIntents.purchaseRef, purchaseRef))
    .limit(1);
  const now = new Date();
  if (
    !intent ||
    intent.userId !== requesterUserId ||
    intent.status !== "pending" ||
    intent.expiresAt < now
  ) {
    return { ok: false, reason: "intent_unavailable" };
  }
  const intentWallet = normalizeAddress(intent.walletAddress);
  if (intentWallet && intentWallet !== call.sender) return { ok: false, reason: "mismatch" };
  if (intent.contractAddress !== config.contractAddress) return { ok: false, reason: "mismatch" };
  if (intent.treasuryAddress !== config.treasuryAddress) return { ok: false, reason: "mismatch" };
  if (Number(intent.feeMutez) !== config.feeMutez) return { ok: false, reason: "mismatch" };

  const startsAt = call.timestamp ? new Date(call.timestamp) : now;
  const expiresAt = new Date(startsAt.getTime() + CASINO_MEMBERSHIP_DURATION_MS);

  const [inserted] = await db
    .insert(casinoMemberships)
    .values({
      userId: requesterUserId,
      walletAddress: call.sender,
      purchaseRef,
      opHash,
      contractAddress: config.contractAddress,
      treasuryAddress: config.treasuryAddress,
      feeMutez: config.feeMutez,
      status: "active",
      startsAt,
      expiresAt,
      raw: { transactions: rows, purchaseCall: call.op } as any,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: casinoMemberships.opHash })
    .returning({ id: casinoMemberships.id, expiresAt: casinoMemberships.expiresAt });

  const [membership] = inserted
    ? [inserted]
    : await db
        .select({ id: casinoMemberships.id, expiresAt: casinoMemberships.expiresAt })
        .from(casinoMemberships)
        .where(eq(casinoMemberships.opHash, opHash))
        .limit(1);

  await db
    .update(casinoMembershipIntents)
    .set({
      status: "completed",
      walletAddress: call.sender,
      opHash,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(casinoMembershipIntents.id, intent.id));

  return {
    ok: true,
    membershipId: membership?.id ?? null,
    expiresAt: membership?.expiresAt?.toISOString() ?? expiresAt.toISOString(),
  };
}

export function getCasinoAppPassEconomy() {
  return {
    sku: CASINO_APP_PASS_SKU,
    priceWtfUnits: "10000000000",
    priceWtfFormatted: formatWtf("10000000000"),
    priceExp: 1000,
  };
}
