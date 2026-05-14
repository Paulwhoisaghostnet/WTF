/**
 * In-app market payment verifier.
 *
 * Buyers pay WTF on Tezos L1 through the WtfInAppMarket contract. The contract
 * emits listing context and pulls FA2 WTF directly from the buyer to the
 * gameshow treasury wallet. This worker verifies the chain evidence through
 * TzKT and only then grants in-app inventory.
 */

import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  inAppInventoryItems,
  inAppMarketItems,
  inAppMarketPaymentIntents,
  inAppMarketPurchases,
  inAppMarketSyncState,
  userWallets,
} from "@shared/schema";
import { WTF_IN_APP_MARKET_CONTRACT, WTF_TOKEN } from "@shared/types";
import { coerceClientNetwork, getNetwork } from "./contract-config";
import { selectDirectListingItem } from "./in-app-market-policy";
import {
  extractCallArg,
  findAppliedContractCall,
  isValidOpHash,
  type TzktTransactionOp,
} from "./tzkt-ops";
import { tzkt, UpstreamError } from "./upstream";
import {
  isPetBallItem,
  itemMetadataKind,
  lockPetBallAccountCap,
  PET_BALL_MAX_OWNED,
  petBallAccountCapDecision,
} from "./pet-ball-account-cap";
import { buildInAppInventoryTraceMetadata } from "./in-app-inventory-trace";

const DEFAULT_GAMESHOW_TREASURY = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const SYNC_KEY = "wtf-in-app-market";
const ADDRESS_RE = /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;
const KT1_RE = /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/;

const TRANSFER_SELECT = [
  "id",
  "level",
  "timestamp",
  "token",
  "from",
  "to",
  "amount",
  "transactionId",
].join(",");

const INDEXER_RETRIES = 4;
const INDEXER_RETRY_DELAY_MS = 1500;

export type InAppMarketConfig = {
  network: string;
  contractAddress: string | null;
  treasuryAddress: string;
  wtfToken: typeof WTF_TOKEN;
  configured: boolean;
};

type TzktTransfer = {
  id: number;
  level?: number;
  timestamp?: string;
  token?: {
    contract?: { address?: string } | string;
    tokenId?: string | number;
  } | null;
  from?: { address?: string } | null;
  to?: { address?: string } | null;
  amount?: string | number;
  transactionId?: number | null;
};

type MatchedPurchase = {
  transfer: TzktTransfer;
  opHash: string;
  walletAddress: string;
  userId: number | null;
  amountWtfUnits: string;
  contractAddress: string;
  contractListingId: number;
  paymentIntentId: number | null;
  purchaseRef: string | null;
  lines: Array<{
    sku: string;
    quantity: number;
    amountWtfUnits: string;
    contractListingId: number | null;
  }>;
  observedAt: Date;
  raw: Record<string, unknown>;
};

function normalizeAddress(value: string | undefined | null): string | null {
  const trimmed = (value ?? "").trim();
  return ADDRESS_RE.test(trimmed) ? trimmed : null;
}

function normalizeKt1(value: string | undefined | null): string | null {
  const trimmed = (value ?? "").trim();
  return KT1_RE.test(trimmed) ? trimmed : null;
}

async function countOwnedPetBalls(queryDb: typeof db, userId: number): Promise<number> {
  const itemRows = await queryDb.select().from(inAppMarketItems);
  const ballSkus = new Set(
    itemRows
      .filter((item) => isPetBallItem(item.sku, itemMetadataKind(item.metadata)))
      .map((item) => item.sku)
  );
  ballSkus.add("pet-ball");
  const inventory = await queryDb
    .select({
      sku: inAppInventoryItems.sku,
      quantity: inAppInventoryItems.quantity,
    })
    .from(inAppInventoryItems)
    .where(eq(inAppInventoryItems.userId, userId));
  return inventory.reduce(
    (sum, item) => sum + (ballSkus.has(item.sku) ? item.quantity : 0),
    0
  );
}

async function isPetBallSku(queryDb: typeof db, sku: string): Promise<boolean> {
  if (sku === "pet-ball") return true;
  const [item] = await queryDb
    .select({ sku: inAppMarketItems.sku, metadata: inAppMarketItems.metadata })
    .from(inAppMarketItems)
    .where(eq(inAppMarketItems.sku, sku))
    .limit(1);
  return item ? isPetBallItem(item.sku, itemMetadataKind(item.metadata)) : false;
}

export function getInAppMarketConfig(): InAppMarketConfig {
  const network =
    coerceClientNetwork(process.env.TEZOS_NETWORK) ?? getNetwork() ?? "mainnet";
  const contractAddress = normalizeKt1(
    process.env.IN_APP_MARKET_CONTRACT_ADDRESS ||
      process.env.WTF_IN_APP_MARKET_CONTRACT_ADDRESS ||
      process.env.VITE_IN_APP_MARKET_CONTRACT_ADDRESS ||
      WTF_IN_APP_MARKET_CONTRACT
  );
  const treasuryAddress =
    normalizeAddress(
      process.env.IN_APP_MARKET_TREASURY_ADDRESS ||
        process.env.WTF_IN_APP_MARKET_TREASURY ||
        process.env.WTF_OPERATOR_WALLET_ADDRESS
    ) ?? DEFAULT_GAMESHOW_TREASURY;

  return {
    network,
    contractAddress,
    treasuryAddress,
    wtfToken: WTF_TOKEN,
    configured: Boolean(contractAddress && treasuryAddress),
  };
}

function tokenContractOf(row: TzktTransfer): string | null {
  const contract = row.token?.contract;
  if (typeof contract === "string") return contract;
  return contract?.address ?? null;
}

function tokenIdOf(row: TzktTransfer): string {
  return String(row.token?.tokenId ?? "");
}

function addressOf(value: { address?: string } | null | undefined): string | null {
  return typeof value?.address === "string" ? value.address : null;
}

function parsePositiveInt(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!/^[0-9]+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function parseNonNegativeInt(value: unknown): number | null {
  const raw = String(value ?? "").trim();
  if (!/^[0-9]+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

function parseNatString(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  return /^[0-9]+$/.test(raw) ? raw.replace(/^0+(?=\d)/, "") || "0" : null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function linkedUserId(walletAddress: string): Promise<number | null> {
  const [link] = await db
    .select({ userId: userWallets.userId })
    .from(userWallets)
    .where(eq(userWallets.walletAddress, walletAddress))
    .limit(1);
  return link?.userId ?? null;
}

async function linkedWalletsForUser(userId: number): Promise<string[]> {
  const rows = await db
    .select({ walletAddress: userWallets.walletAddress })
    .from(userWallets)
    .where(eq(userWallets.userId, userId));
  return rows.map((row) => row.walletAddress);
}

async function itemForListing(contractAddress: string, listingId: number) {
  const items = await db
    .select()
    .from(inAppMarketItems)
    .where(
      and(
        eq(inAppMarketItems.contractListingId, listingId),
        or(
          eq(inAppMarketItems.contractAddress, contractAddress),
          isNull(inAppMarketItems.contractAddress)
        )
      )
    )
    .orderBy(sql`${inAppMarketItems.contractAddress} IS NULL`, asc(inAppMarketItems.id))
    .limit(25);
  return selectDirectListingItem(items, contractAddress);
}

async function fetchTransactionsByHashRateLimited(
  opHash: string,
  opts: { retries?: number; retryDelayMs?: number } = {}
): Promise<TzktTransactionOp[]> {
  if (!isValidOpHash(opHash)) return [];
  const retries = Math.max(0, opts.retries ?? 0);
  const retryDelayMs = Math.max(0, opts.retryDelayMs ?? INDEXER_RETRY_DELAY_MS);
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const rows = await tzkt.getJson<TzktTransactionOp[]>(
        `/operations/transactions/${encodeURIComponent(opHash)}`,
        { limit: 50 }
      );
      if (Array.isArray(rows) && rows.length > 0) return rows;
      if (attempt === retries) return [];
    } catch (err) {
      if (err instanceof UpstreamError && err.status === 404) {
        if (attempt === retries) return [];
      } else {
        throw err;
      }
    }
    if (attempt < retries) await sleep(retryDelayMs);
  }
  return [];
}

async function fetchTransactionById(
  transactionId: number
): Promise<TzktTransactionOp | null> {
  try {
    const row = await tzkt.getJson<TzktTransactionOp>(
      `/operations/transactions/${transactionId}`
    );
    return row && typeof row === "object" ? row : null;
  } catch (err) {
    if (err instanceof UpstreamError && err.status === 404) return null;
    throw err;
  }
}

async function fetchTransfersForTransactionIds(
  transactionIds: number[],
  opts: { retries?: number; retryDelayMs?: number } = {}
): Promise<TzktTransfer[]> {
  const unique = Array.from(
    new Set(transactionIds.filter((id) => Number.isSafeInteger(id) && id > 0))
  );
  if (unique.length === 0) return [];
  const retries = Math.max(0, opts.retries ?? 0);
  const retryDelayMs = Math.max(0, opts.retryDelayMs ?? INDEXER_RETRY_DELAY_MS);
  for (let attempt = 0; attempt <= retries; attempt++) {
    const rows = await tzkt.getJson<TzktTransfer[]>("/tokens/transfers", {
      "transactionId.in": unique.join(","),
      select: TRANSFER_SELECT,
      limit: 100,
    });
    if (Array.isArray(rows) && rows.length > 0) return rows;
    if (attempt === retries) return [];
    await sleep(retryDelayMs);
  }
  return [];
}

async function fetchTreasuryTransfersSince(
  treasury: string,
  sinceId: number,
  limit: number
): Promise<TzktTransfer[]> {
  const rows = await tzkt.getJson<TzktTransfer[]>("/tokens/transfers", {
    "token.contract": WTF_TOKEN.contract,
    "token.tokenId": WTF_TOKEN.tokenId,
    to: treasury,
    "id.gt": sinceId,
    "sort.asc": "id",
    limit,
    select: TRANSFER_SELECT,
  });
  return Array.isArray(rows) ? rows : [];
}

function extractPurchaseArgs(op: TzktTransactionOp): {
  listingId: number | null;
  quantity: number | null;
  amountWtfUnits: string | null;
  purchaseRef: string | null;
} {
  const listingId = parseNonNegativeInt(
    extractCallArg(op, [["listing_id"], ["listingId"]])
  );
  const quantity = parsePositiveInt(
    extractCallArg(op, [["quantity"]])
  );
  const amountWtfUnits = parseNatString(
    extractCallArg(op, [["amount_wtf_units"], ["amountWtfUnits"]])
  );
  const ref = extractCallArg(op, [["purchase_ref"], ["purchaseRef"]]);
  return {
    listingId,
    quantity,
    amountWtfUnits,
    purchaseRef: typeof ref === "string" ? ref : null,
  };
}

function normalizeIntentLines(value: unknown): MatchedPurchase["lines"] | null {
  if (!Array.isArray(value)) return null;
  const lines: MatchedPurchase["lines"] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const line = raw as Record<string, unknown>;
    const sku = typeof line.sku === "string" ? line.sku : null;
    const quantity = parsePositiveInt(line.quantity);
    const amountWtfUnits = parseNatString(line.lineWtfUnits);
    if (!sku || quantity == null || !amountWtfUnits || amountWtfUnits === "0") {
      return null;
    }
    lines.push({
      sku,
      quantity,
      amountWtfUnits,
      contractListingId: null,
    });
  }
  return lines.length > 0 ? lines : null;
}

function deriveQuantityFromAmount(amount: string, unitPrice: string): number | null {
  const amountBig = BigInt(amount);
  const priceBig = BigInt(unitPrice);
  if (priceBig <= 0n || amountBig <= 0n || amountBig % priceBig !== 0n) return null;
  const quantity = amountBig / priceBig;
  if (quantity <= 0n || quantity > 100n) return null;
  return Number(quantity);
}

async function matchPurchaseFromEvidence(
  args: {
    transfer: TzktTransfer;
    transactions: TzktTransactionOp[];
    requesterUserId?: number | null;
  }
): Promise<MatchedPurchase | null> {
  const config = getInAppMarketConfig();
  if (!config.contractAddress) return null;

  const transfer = args.transfer;
  const amount = parseNatString(transfer.amount);
  const from = normalizeAddress(addressOf(transfer.from));
  const to = normalizeAddress(addressOf(transfer.to));
  if (!amount || amount === "0" || !from || to !== config.treasuryAddress) {
    return null;
  }
  if (tokenContractOf(transfer) !== WTF_TOKEN.contract) return null;
  if (tokenIdOf(transfer) !== String(WTF_TOKEN.tokenId)) return null;

  let senderOneOf = [from];
  if (args.requesterUserId) {
    const linked = await linkedWalletsForUser(args.requesterUserId);
    if (!linked.includes(from)) return null;
    senderOneOf = linked;
  }

  const call = findAppliedContractCall(args.transactions, {
    contract: config.contractAddress,
    senderOneOf,
    entrypoint: "purchase",
  });
  if (!call?.op?.hash) return null;
  if ((call.op.hash ?? "") && !isValidOpHash(call.op.hash)) return null;

  const parsed = extractPurchaseArgs(call.op);
  if (parsed.amountWtfUnits != null && parsed.amountWtfUnits !== amount) return null;
  if (parsed.purchaseRef) {
    const [intent] = await db
      .select()
      .from(inAppMarketPaymentIntents)
      .where(eq(inAppMarketPaymentIntents.purchaseRef, parsed.purchaseRef))
      .limit(1);
    if (intent && intent.currency === "wtf") {
      if (args.requesterUserId && intent.userId !== args.requesterUserId) return null;
      const intentWallet = normalizeAddress(intent.walletAddress);
      if (intentWallet && intentWallet !== from) return null;
      if (String(intent.subtotalWtfUnits) !== amount) return null;
      const lines = normalizeIntentLines(intent.items);
      if (!lines) return null;
      const lineTotal = lines.reduce(
        (sum, line) => sum + BigInt(line.amountWtfUnits),
        0n
      );
      if (lineTotal !== BigInt(amount)) return null;

      const observedAt = transfer.timestamp
        ? new Date(transfer.timestamp)
        : call.timestamp
          ? new Date(call.timestamp)
          : new Date();

      return {
        transfer,
        opHash: call.op.hash,
        walletAddress: from,
        userId: intent.userId,
        amountWtfUnits: amount,
        contractAddress: config.contractAddress,
        contractListingId: parsed.listingId ?? intent.routerListingId,
        paymentIntentId: intent.id,
        purchaseRef: parsed.purchaseRef,
        lines,
        observedAt,
        raw: {
          transfer,
          purchaseCall: call.op,
          purchaseRef: parsed.purchaseRef,
          paymentIntent: intent,
        },
      };
    }
  }

  if (parsed.listingId == null || parsed.listingId <= 0) return null;
  const item = await itemForListing(config.contractAddress, parsed.listingId);
  if (!item) return null;

  const quantity =
    parsed.quantity ??
    deriveQuantityFromAmount(amount, String(item.priceWtfUnits));
  if (quantity == null) return null;

  const expected =
    BigInt(String(item.priceWtfUnits)) * BigInt(quantity);
  if (BigInt(amount) !== expected) return null;

  const userId =
    args.requesterUserId && senderOneOf.includes(from)
      ? args.requesterUserId
      : await linkedUserId(from);
  const observedAt = transfer.timestamp
    ? new Date(transfer.timestamp)
    : call.timestamp
      ? new Date(call.timestamp)
      : new Date();

  return {
    transfer,
    opHash: call.op.hash,
    walletAddress: from,
    userId,
    amountWtfUnits: amount,
    contractAddress: config.contractAddress,
    contractListingId: parsed.listingId,
    paymentIntentId: null,
    purchaseRef: parsed.purchaseRef,
    lines: [
      {
        sku: item.sku,
        quantity,
        amountWtfUnits: amount,
        contractListingId: parsed.listingId,
      },
    ],
    observedAt,
    raw: {
      transfer,
      purchaseCall: call.op,
      purchaseRef: parsed.purchaseRef,
    },
  };
}

async function grantMatchedPurchase(match: MatchedPurchase): Promise<{
  inserted: boolean;
  granted: boolean;
  purchaseId: number | null;
  purchaseIds: number[];
}> {
  return db.transaction(async (tx) => {
    const purchaseIds: number[] = [];
    let firstPurchaseId: number | null = null;
    let insertedAny = false;
    let grantedAny = false;

    for (const line of match.lines) {
      const [inserted] = await tx
        .insert(inAppMarketPurchases)
        .values({
          userId: match.userId,
          walletAddress: match.walletAddress,
          sku: line.sku,
          quantity: line.quantity,
          currency: "wtf",
          amountWtfUnits: line.amountWtfUnits,
          amountExp: 0,
          opHash: match.opHash,
          tzktTransferId: match.transfer.id,
          contractAddress: match.contractAddress,
          contractListingId: line.contractListingId ?? match.contractListingId,
          purchaseRef: match.purchaseRef,
          paymentIntentId: match.paymentIntentId,
          status: "confirmed",
          observedAt: match.observedAt,
          raw: { ...match.raw, line } as any,
        })
        .onConflictDoNothing()
        .returning({ id: inAppMarketPurchases.id, userId: inAppMarketPurchases.userId });

      let purchaseId = inserted?.id ?? null;
      let grantUserId = inserted?.userId ?? match.userId;
      insertedAny = insertedAny || Boolean(inserted);

      if (!inserted) {
        const [existing] = await tx
          .select({
            id: inAppMarketPurchases.id,
            userId: inAppMarketPurchases.userId,
          })
          .from(inAppMarketPurchases)
          .where(
            and(
              eq(inAppMarketPurchases.tzktTransferId, match.transfer.id),
              eq(inAppMarketPurchases.sku, line.sku)
            )
          )
          .limit(1);
        purchaseId = existing?.id ?? null;
        if (existing?.userId != null) {
          if (!firstPurchaseId) firstPurchaseId = existing.id;
          purchaseIds.push(existing.id);
          continue;
        }
        grantUserId = match.userId;
        if (existing && existing.userId == null && match.userId != null) {
          await tx
            .update(inAppMarketPurchases)
            .set({ userId: match.userId })
            .where(eq(inAppMarketPurchases.id, existing.id));
          grantUserId = match.userId;
        }
      }

      if (!purchaseId) continue;
      if (!firstPurchaseId) firstPurchaseId = purchaseId;
      purchaseIds.push(purchaseId);
      if (!grantUserId) continue;
      if (await isPetBallSku(tx as unknown as typeof db, line.sku)) {
        await lockPetBallAccountCap(tx as unknown as typeof db, grantUserId);
        const ownedBalls = await countOwnedPetBalls(tx as unknown as typeof db, grantUserId);
        if (!petBallAccountCapDecision(ownedBalls, line.quantity, PET_BALL_MAX_OWNED).ok) {
          continue;
        }
      }

      const inventoryMetadata = buildInAppInventoryTraceMetadata({
        currency: "wtf",
        cause: "chain_purchase",
        purchaseId,
        sku: line.sku,
        quantity: line.quantity,
        purchaseRef: match.purchaseRef,
        paymentIntentId: match.paymentIntentId,
        walletAddress: match.walletAddress,
        opHash: match.opHash,
        tzktTransferId: match.transfer.id,
        contractAddress: match.contractAddress,
        contractListingId: line.contractListingId ?? match.contractListingId,
        amountWtfUnits: line.amountWtfUnits,
        observedAt: match.observedAt,
      });
      await tx
        .insert(inAppInventoryItems)
        .values({
          userId: grantUserId,
          sku: line.sku,
          quantity: line.quantity,
          metadata: inventoryMetadata,
          lastPurchaseId: purchaseId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [inAppInventoryItems.userId, inAppInventoryItems.sku],
          set: {
            quantity: sql`${inAppInventoryItems.quantity} + ${line.quantity}`,
            metadata: sql`COALESCE(${inAppInventoryItems.metadata}, '{}'::jsonb) || ${JSON.stringify(inventoryMetadata)}::jsonb`,
            lastPurchaseId: purchaseId,
            updatedAt: new Date(),
          },
        });
      grantedAny = true;
    }

    if (match.paymentIntentId) {
      await tx
        .update(inAppMarketPaymentIntents)
        .set({
          status: "completed",
          walletAddress: match.walletAddress,
          opHash: match.opHash,
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(inAppMarketPaymentIntents.id, match.paymentIntentId));
    }

    return {
      inserted: insertedAny,
      granted: grantedAny,
      purchaseId: firstPurchaseId,
      purchaseIds,
    };
  });
}

export async function verifyAndGrantInAppMarketPurchaseByHash(
  opHash: string,
  requesterUserId?: number | null
): Promise<{
  ok: boolean;
  reason?: "not_configured" | "invalid_hash" | "not_found" | "mismatch";
  purchaseId?: number | null;
  purchaseIds?: number[];
  granted?: boolean;
}> {
  const config = getInAppMarketConfig();
  if (!config.contractAddress) return { ok: false, reason: "not_configured" };
  if (!isValidOpHash(opHash)) return { ok: false, reason: "invalid_hash" };

  const transactions = await fetchTransactionsByHashRateLimited(opHash, {
    retries: INDEXER_RETRIES,
  });
  if (transactions.length === 0) return { ok: false, reason: "not_found" };

  const ids = transactions
    .map((tx: any) => Number(tx.id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
  const transfers = await fetchTransfersForTransactionIds(ids, {
    retries: INDEXER_RETRIES,
  });

  for (const transfer of transfers) {
    const match = await matchPurchaseFromEvidence({
      transfer,
      transactions,
      requesterUserId,
    });
    if (!match) continue;
    const result = await grantMatchedPurchase(match);
    return {
      ok: true,
      purchaseId: result.purchaseId,
      purchaseIds: result.purchaseIds,
      granted: result.granted,
    };
  }

  return { ok: false, reason: "mismatch" };
}

async function getCursor(): Promise<number> {
  await db
    .insert(inAppMarketSyncState)
    .values({ key: SYNC_KEY, lastTransferId: 0, updatedAt: new Date() })
    .onConflictDoNothing({ target: inAppMarketSyncState.key });
  const [row] = await db
    .select({ cursor: inAppMarketSyncState.lastTransferId })
    .from(inAppMarketSyncState)
    .where(eq(inAppMarketSyncState.key, SYNC_KEY))
    .limit(1);
  return Number(row?.cursor ?? 0);
}

async function updateCursor(
  lastTransferId: number,
  status: string,
  error: string | null = null
) {
  await db
    .insert(inAppMarketSyncState)
    .values({
      key: SYNC_KEY,
      lastTransferId,
      lastStatus: status,
      lastError: error,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: inAppMarketSyncState.key,
      set: {
        lastTransferId: sql`GREATEST(${inAppMarketSyncState.lastTransferId}, ${lastTransferId})`,
        lastStatus: status,
        lastError: error,
        updatedAt: new Date(),
      },
    });
}

export async function runInAppMarketSync(opts: {
  limit?: number;
} = {}): Promise<{
  scanned: number;
  matched: number;
  granted: number;
  cursorBefore: number;
  cursorAfter: number;
  configured: boolean;
}> {
  const config = getInAppMarketConfig();
  if (!config.contractAddress) {
    return {
      scanned: 0,
      matched: 0,
      granted: 0,
      cursorBefore: 0,
      cursorAfter: 0,
      configured: false,
    };
  }

  const limit = Math.max(1, Math.min(500, Math.floor(opts.limit ?? 100)));
  const cursorBefore = await getCursor();
  let cursorAfter = cursorBefore;

  try {
    const transfers = await fetchTreasuryTransfersSince(
      config.treasuryAddress,
      cursorBefore,
      limit
    );
    let matched = 0;
    let granted = 0;

    for (const transfer of transfers) {
      cursorAfter = Math.max(cursorAfter, Number(transfer.id) || cursorAfter);
      if (!transfer.transactionId) continue;
      const tokenTx = await fetchTransactionById(Number(transfer.transactionId));
      const opHash = tokenTx?.hash;
      if (!opHash || !isValidOpHash(opHash)) continue;
      const transactions = await fetchTransactionsByHashRateLimited(opHash);
      const match = await matchPurchaseFromEvidence({ transfer, transactions });
      if (!match) continue;
      matched += 1;
      const result = await grantMatchedPurchase(match);
      if (result.granted) granted += 1;
    }

    await updateCursor(cursorAfter, "success", null);
    return {
      scanned: transfers.length,
      matched,
      granted,
      cursorBefore,
      cursorAfter,
      configured: true,
    };
  } catch (err) {
    await updateCursor(cursorAfter, "error", (err as Error).message.slice(0, 1000));
    throw err;
  }
}
