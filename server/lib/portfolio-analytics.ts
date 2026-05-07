/**
 * Portfolio analytics — aggregates across a user's linked wallets.
 *
 * Reads from:
 *   • user_wallets           (which addresses belong to the user)
 *   • wallet_holdings        (what they currently own + balance)
 *   • token_sales            (buys + sells — cost basis + realized P&L)
 *   • token_mint_events      (first-owner mint rows — mint-fee cost basis)
 *   • token_market_summary   (floor, last sale, unique owners, etc.)
 *   • token_metadata         (display name + artifact uri for lists)
 *   • xtz_usd_daily          (historical XTZ→USD for dates without a
 *                             stored `price_usd` snapshot)
 *
 * Writes nothing.  All values are computed live; the market summary
 * table is used where available, falling back to live aggregation
 * against `token_sales` + `token_listings` if a summary row is stale
 * or missing.
 *
 * Every public function is parameterised by `userId` and keeps the
 * wallet universe server-side — callers never pass raw addresses in.
 * The only exception is `getTokenMarket(contract, tokenId)` which is
 * intentionally user-agnostic.
 *
 * All SQL is raw (`db.execute(sql\`...\`)`) because the aggregates are
 * heavy and benefit from set-based joins Drizzle's fluent builder can't
 * express cleanly.
 */

import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  calculatePortfolioCosting,
  type AcquisitionType,
  type HoldingSnapshot,
  type MintSnapshot,
  type PortfolioCostingResult,
  type SaleSnapshot,
  type StoredAcquisitionLotSnapshot,
  type TransferEvidenceSnapshot,
} from "./portfolio-costing";

// ───────────────────────── types ──────────────────────────────────

/** Per-wallet slice of a user's portfolio. */
export interface WalletSlice {
  walletAddress: string;
  tokensHeld: number;
  contractsHeld: number;
  firstAcquiredAt: string | null;
  lastActivityAt: string | null;
  costBasisMutez: string;
  costBasisUsd: string | null;
  /** Estimated mark-to-market value in mutez (floor × balance or last sale × balance). */
  estimatedValueMutez: string;
  estimatedValueUsd: string | null;
  /** Realised proceeds from sales this wallet has made, lifetime. */
  realizedProceedsMutez: string;
  realizedProceedsUsd: string | null;
  realizedCostBasisMutez?: string;
  realizedPnlMutez?: string;
  realizedPnlUsd?: string | null;
  pricedPositions?: number;
  binTrapPositions?: number;
  acquisitionConfidence?: Record<AcquisitionType, number>;
  /** # of tokens held where we still don't know the acquisition price.
   *  Feeds the UI's "cost basis coverage" badge. */
  tokensWithUnknownCost: number;
}

export interface PortfolioSummary {
  totals: {
    wallets: number;
    tokensHeld: number;
    contractsHeld: number;
    costBasisMutez: string;
    costBasisUsd: string | null;
    estimatedValueMutez: string;
    estimatedValueUsd: string | null;
    realizedProceedsMutez: string;
    realizedProceedsUsd: string | null;
    realizedCostBasisMutez?: string;
    realizedPnlMutez?: string;
    realizedPnlUsd?: string | null;
    unrealizedPnlMutez: string;
    unrealizedPnlUsd: string | null;
    tokensWithUnknownCost: number;
    pricedPositions?: number;
    binTrapPositions?: number;
    altCurrencySalesExcluded?: number;
    acquisitionConfidence?: Record<AcquisitionType, number>;
  };
  perWallet: WalletSlice[];
  fetchedAt: string;
  pnlMethod?: "legacy_latest_buy" | "lot_fifo";
  pnlNotes?: string[];
}

export interface RecentAcquisition {
  walletAddress: string;
  tokenContract: string;
  tokenId: string;
  tokenName: string | null;
  thumbnailUri: string | null;
  /**
   * How the wallet got the token:
   *   • "purchase"  — resolved to a token_sales row with the wallet as buyer.
   *   • "mint"      — resolved to a token_mint_events row (first_owner = wallet)
   *                  or a wallet_events token_mint row.
   *   • "transfer"  — only evidence is a wallet_events token_transfer_in row;
   *                  the on-chain counterparty is not one of our indexed
   *                  marketplaces so we may or may not have a price tag.
   *   • "unknown"   — none of the above; we haven't seen the wallet take
   *                  possession of this token yet (rare — should trend to
   *                  0 as workers fill in gaps).
   */
  acquisitionType: "purchase" | "mint" | "transfer" | "free_transfer" | "unknown";
  priceMutez: string | null;
  priceUsd: string | null;
  marketplace: string | null;
  acquiredAt: string;
  opHash: string | null;
  currentFloorMutez: string | null;
  lastSaleMutez: string | null;
}

export interface RecentSale {
  walletAddress: string;
  tokenContract: string;
  tokenId: string;
  tokenName: string | null;
  thumbnailUri: string | null;
  priceMutez: string;
  priceUsd: string | null;
  marketplace: string | null;
  soldAt: string;
  opHash: string;
  /** Cost basis for this specific sale (last buy before soldAt). */
  costBasisMutez: string | null;
  costBasisUsd: string | null;
  realizedPnlMutez: string | null;
  realizedPnlUsd: string | null;
}

export interface TokenMarketMetrics {
  tokenContract: string;
  tokenId: string;
  // sale metrics
  lastSaleMutez: string | null;
  lastSaleAt: string | null;
  highestSaleMutez: string | null;
  lowestSaleMutez: string | null;
  averageSaleMutez: string | null;
  saleCount: number;
  primarySaleCount: number;
  secondarySaleCount: number;
  totalVolumeMutez: string;
  // listing metrics
  currentFloorMutez: string | null;
  currentHighestListingMutez: string | null;
  averageActiveListingMutez: string | null;
  activeListingCount: number;
  // owner metrics
  uniqueOwnersCount: number;
  // fees / royalties lifetime
  totalRoyaltiesMutez: string;
  totalPlatformFeesMutez: string;
  /** How fresh the summary is, if it came from token_market_summary. */
  refreshedAt: string | null;
  /** True when metrics were computed live (no cached summary row). */
  fromLiveAggregate: boolean;
}

// ───────────────────────── helpers ────────────────────────────────

function strOrNull(x: unknown): string | null {
  if (x === null || x === undefined) return null;
  return String(x);
}

function str(x: unknown, fallback = "0"): string {
  if (x === null || x === undefined) return fallback;
  return String(x);
}

function num(x: unknown, fallback = 0): number {
  if (x === null || x === undefined) return fallback;
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function lotPnlEnabled(): boolean {
  return process.env.TEZOS_OPEN_TOOLS_PNL_ENABLED !== "false";
}

function isoOrNull(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeAcquisitionType(value: unknown): AcquisitionType {
  if (value === "purchase" || value === "mint" || value === "free_transfer") {
    return value;
  }
  return "unknown";
}

function mutezToUsdString(mutez: bigint, usdPerXtz: number): string | null {
  if (!Number.isFinite(usdPerXtz) || usdPerXtz <= 0) return null;
  return ((Number(mutez) / 1e6) * usdPerXtz).toFixed(2);
}

function saleCostingKey(row: {
  walletAddress: string;
  tokenContract: string;
  tokenId: string;
  opHash: string;
  soldAt: string;
}): string {
  return [
    row.walletAddress.toLowerCase(),
    row.tokenContract,
    row.tokenId,
    row.opHash,
    new Date(row.soldAt).toISOString(),
  ].join("|");
}

interface PortfolioCostingSnapshot {
  walletAddresses: string[];
  holdings: HoldingSnapshot[];
  result: PortfolioCostingResult;
  latestUsdPerXtz: number;
  firstByWallet: Map<string, string | null>;
  lastByWallet: Map<string, string | null>;
  contractsByWallet: Map<string, Set<string>>;
}

async function loadLatestUsdPerXtz(): Promise<number> {
  const latestPriceRes = await db.execute(sql`
    SELECT price_usd::text AS price_usd FROM xtz_usd_daily
    ORDER BY day DESC LIMIT 1
  `);
  return Number(((latestPriceRes as any)?.rows?.[0]?.price_usd ?? 0) as string) || 0;
}

async function loadPortfolioCostingSnapshot(
  userId: number
): Promise<PortfolioCostingSnapshot> {
  const walletRes = await db.execute(sql`
    SELECT wallet_address FROM user_wallets WHERE user_id = ${userId}
  `);
  const walletAddresses = (((walletRes as any)?.rows ?? []) as any[])
    .map((r) => String(r.wallet_address ?? "").trim())
    .filter(Boolean);

  const latestUsdPerXtz = await loadLatestUsdPerXtz();

  if (walletAddresses.length === 0) {
    const result = calculatePortfolioCosting({
      wallets: [],
      holdings: [],
      sales: [],
    });
    return {
      walletAddresses,
      holdings: [],
      result,
      latestUsdPerXtz,
      firstByWallet: new Map(),
      lastByWallet: new Map(),
      contractsByWallet: new Map(),
    };
  }

  const holdingsRes = await db.execute(sql`
    SELECT
      h.wallet_address,
      h.token_contract,
      h.token_id,
      COALESCE(NULLIF(h.balance, ''), '0')::numeric AS quantity,
      h.first_acquired_at,
      h.last_activity_at,
      md.name AS token_name,
      md.thumbnail AS thumbnail_uri,
      COALESCE(ms.current_floor_mutez, ms.last_sale_mutez)::text AS floor_mutez,
      (
        SELECT tl.marketplace
        FROM token_listings tl
        WHERE tl.token_contract = h.token_contract
          AND tl.token_id = h.token_id
          AND tl.active = true
        ORDER BY tl.price_mutez ASC
        LIMIT 1
      ) AS floor_marketplace
    FROM wallet_holdings h
    LEFT JOIN token_metadata md
      ON md.token_contract = h.token_contract AND md.token_id = h.token_id
    LEFT JOIN token_market_summary ms
      ON ms.token_contract = h.token_contract AND ms.token_id = h.token_id
    WHERE h.user_id = ${userId}
      AND COALESCE(NULLIF(h.balance, ''), '0')::numeric > 0
  `);
  const holdingRows = (((holdingsRes as any)?.rows ?? []) as any[]);

  const firstByWallet = new Map<string, string | null>();
  const lastByWallet = new Map<string, string | null>();
  const contractsByWallet = new Map<string, Set<string>>();
  const holdings: HoldingSnapshot[] = holdingRows.map((r) => {
    const walletAddress = String(r.wallet_address);
    const first = isoOrNull(r.first_acquired_at);
    const last = isoOrNull(r.last_activity_at);
    const walletKey = walletAddress.toLowerCase();
    if (first && (!firstByWallet.get(walletKey) || first < String(firstByWallet.get(walletKey)))) {
      firstByWallet.set(walletKey, first);
    } else if (!firstByWallet.has(walletKey)) {
      firstByWallet.set(walletKey, null);
    }
    if (last && (!lastByWallet.get(walletKey) || last > String(lastByWallet.get(walletKey)))) {
      lastByWallet.set(walletKey, last);
    } else if (!lastByWallet.has(walletKey)) {
      lastByWallet.set(walletKey, null);
    }
    const contracts = contractsByWallet.get(walletKey) ?? new Set<string>();
    contracts.add(String(r.token_contract));
    contractsByWallet.set(walletKey, contracts);

    return {
      walletAddress,
      tokenContract: String(r.token_contract),
      tokenId: String(r.token_id),
      quantity: Math.max(1, Math.floor(Number(r.quantity ?? 1) || 1)),
      tokenName: r.token_name ? String(r.token_name) : null,
      thumbnailUri: r.thumbnail_uri ? String(r.thumbnail_uri) : null,
      floorMutez: strOrNull(r.floor_mutez),
      floorMarketplace: r.floor_marketplace ? String(r.floor_marketplace) : null,
    };
  });

  const salesRes = await db.execute(sql`
    WITH uw AS (
      SELECT wallet_address FROM user_wallets WHERE user_id = ${userId}
    ),
    scoped AS (
      SELECT s.*
      FROM token_sales s
      JOIN uw
        ON LOWER(s.buyer_address) = LOWER(uw.wallet_address)
        OR LOWER(COALESCE(s.seller_address, '')) = LOWER(uw.wallet_address)
    )
    SELECT DISTINCT ON (
      op_hash, token_contract, token_id,
      COALESCE(seller_address, ''), buyer_address,
      price_mutez, sold_at
    )
      buyer_address,
      seller_address,
      token_contract,
      token_id,
      price_mutez::text,
      price_usd::text,
      sold_at,
      op_hash,
      marketplace,
      editions_sold
    FROM scoped
    ORDER BY
      op_hash, token_contract, token_id,
      COALESCE(seller_address, ''), buyer_address,
      price_mutez, sold_at, id ASC
  `);
  const sales: SaleSnapshot[] = (((salesRes as any)?.rows ?? []) as any[]).map((r) => ({
    buyerAddress: r.buyer_address ? String(r.buyer_address) : null,
    sellerAddress: r.seller_address ? String(r.seller_address) : null,
    tokenContract: String(r.token_contract),
    tokenId: String(r.token_id),
    priceMutez: String(r.price_mutez ?? "0"),
    priceUsd: strOrNull(r.price_usd),
    soldAt: new Date(r.sold_at).toISOString(),
    opHash: String(r.op_hash),
    marketplace: r.marketplace ? String(r.marketplace) : null,
    editionsSold: num(r.editions_sold, 1),
  }));

  const mintsRes = await db.execute(sql`
    WITH uw AS (
      SELECT wallet_address FROM user_wallets WHERE user_id = ${userId}
    )
    SELECT DISTINCT ON (m.op_hash, m.token_contract, m.token_id, COALESCE(m.first_owner, ''))
      m.first_owner,
      m.token_contract,
      m.token_id,
      COALESCE(m.mint_fee_mutez, 0)::text AS mint_fee_mutez,
      m.minted_at,
      m.op_hash,
      m.editions,
      m.platform
    FROM token_mint_events m
    JOIN uw ON LOWER(m.first_owner) = LOWER(uw.wallet_address)
    ORDER BY m.op_hash, m.token_contract, m.token_id, COALESCE(m.first_owner, ''), m.minted_at ASC, m.id ASC
  `);
  const mints: MintSnapshot[] = (((mintsRes as any)?.rows ?? []) as any[]).map((r) => ({
    firstOwner: r.first_owner ? String(r.first_owner) : null,
    tokenContract: String(r.token_contract),
    tokenId: String(r.token_id),
    mintFeeMutez: String(r.mint_fee_mutez ?? "0"),
    mintedAt: new Date(r.minted_at).toISOString(),
    opHash: String(r.op_hash),
    editions: num(r.editions, 1),
    platform: r.platform ? String(r.platform) : null,
  }));

  const transferRes = await db.execute(sql`
    WITH uw AS (
      SELECT wallet_address FROM user_wallets WHERE user_id = ${userId}
    )
    SELECT DISTINCT ON (e.wallet_address, e.token_contract, e.token_id, COALESCE(e.op_hash, ''))
      e.wallet_address,
      e.token_contract,
      e.token_id,
      e.timestamp,
      e.op_hash,
      e.token_amount
    FROM wallet_events e
    JOIN uw ON uw.wallet_address = e.wallet_address
    WHERE e.event_type = 'token_transfer_in'
      AND e.token_contract IS NOT NULL
      AND e.token_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM token_sales s
        WHERE LOWER(s.buyer_address) = LOWER(e.wallet_address)
          AND s.token_contract = e.token_contract
          AND s.token_id = e.token_id
          AND (s.op_hash = e.op_hash OR e.op_hash IS NULL)
      )
      AND NOT EXISTS (
        SELECT 1 FROM token_mint_events m
        WHERE LOWER(m.first_owner) = LOWER(e.wallet_address)
          AND m.token_contract = e.token_contract
          AND m.token_id = e.token_id
          AND (m.op_hash = e.op_hash OR e.op_hash IS NULL)
      )
    ORDER BY e.wallet_address, e.token_contract, e.token_id, COALESCE(e.op_hash, ''), e.timestamp ASC, e.id ASC
  `);
  const freeTransfers: TransferEvidenceSnapshot[] = (((transferRes as any)?.rows ?? []) as any[])
    .map((r) => ({
      walletAddress: String(r.wallet_address),
      tokenContract: String(r.token_contract),
      tokenId: String(r.token_id),
      timestamp: new Date(r.timestamp).toISOString(),
      opHash: r.op_hash ? String(r.op_hash) : null,
      quantity: num(r.token_amount, 1),
    }));

  const lotsRes = await db.execute(sql`
    WITH uw AS (
      SELECT wallet_address FROM user_wallets WHERE user_id = ${userId}
    )
    SELECT
      l.wallet_address,
      l.token_contract,
      l.token_id,
      l.editions,
      l.acquisition_type,
      l.cost_mutez::text,
      l.marketplace,
      l.op_hash,
      l.acquired_at
    FROM acquisition_lots l
    JOIN uw ON LOWER(l.wallet_address) = LOWER(uw.wallet_address)
    ORDER BY l.acquired_at ASC, l.id ASC
  `);
  const acquisitionLots: StoredAcquisitionLotSnapshot[] = (((lotsRes as any)?.rows ?? []) as any[])
    .map((r) => ({
      walletAddress: String(r.wallet_address),
      tokenContract: String(r.token_contract),
      tokenId: String(r.token_id),
      quantity: num(r.editions, 1),
      acquisitionType: normalizeAcquisitionType(r.acquisition_type),
      totalCostMutez: String(r.cost_mutez ?? "0"),
      marketplace: r.marketplace ? String(r.marketplace) : null,
      opHash: r.op_hash ? String(r.op_hash) : null,
      acquiredAt: new Date(r.acquired_at).toISOString(),
      costBasisKnown: !["free_transfer", "unknown"].includes(String(r.acquisition_type)),
    }));

  const result = calculatePortfolioCosting({
    wallets: walletAddresses,
    holdings,
    sales,
    mints,
    freeTransfers,
    acquisitionLots,
  });

  return {
    walletAddresses,
    holdings,
    result,
    latestUsdPerXtz,
    firstByWallet,
    lastByWallet,
    contractsByWallet,
  };
}

async function getLotBasedPortfolioSummary(userId: number): Promise<PortfolioSummary> {
  const snapshot = await loadPortfolioCostingSnapshot(userId);
  const { result, latestUsdPerXtz } = snapshot;
  const rowsByWallet = new Map<string, typeof result.rows>();
  const realizedByWallet = new Map<string, typeof result.realized>();

  for (const row of result.rows) {
    const key = row.walletAddress.toLowerCase();
    rowsByWallet.set(key, [...(rowsByWallet.get(key) ?? []), row]);
  }
  for (const row of result.realized) {
    const key = row.walletAddress.toLowerCase();
    realizedByWallet.set(key, [...(realizedByWallet.get(key) ?? []), row]);
  }

  const perWallet: WalletSlice[] = snapshot.walletAddresses.map((walletAddress) => {
    const key = walletAddress.toLowerCase();
    const rows = rowsByWallet.get(key) ?? [];
    const realized = realizedByWallet.get(key) ?? [];
    const confidence: Record<AcquisitionType, number> = {
      purchase: 0,
      mint: 0,
      free_transfer: 0,
      unknown: 0,
    };
    let cost = 0n;
    let est = 0n;
    let unknown = 0;
    let priced = 0;
    let binTrap = 0;
    for (const row of rows) {
      for (const type of row.acquisitionTypes) confidence[type] += 1;
      if (row.binTrap) {
        binTrap++;
        continue;
      }
      if (row.costBasisMutez === null || row.estimatedValueMutez === null) {
        unknown += row.unknownQuantity || 1;
        continue;
      }
      cost += row.costBasisMutez;
      est += row.estimatedValueMutez;
      priced++;
    }
    const proceeds = realized.reduce((acc, row) => acc + row.proceedsMutez, 0n);
    const realizedCost = realized.reduce(
      (acc, row) => acc + (row.costBasisMutez ?? 0n),
      0n,
    );
    const realizedPnl = realized.reduce(
      (acc, row) => acc + (row.realizedPnlMutez ?? 0n),
      0n,
    );

    return {
      walletAddress,
      tokensHeld: rows.length,
      contractsHeld: snapshot.contractsByWallet.get(key)?.size ?? 0,
      firstAcquiredAt: snapshot.firstByWallet.get(key) ?? null,
      lastActivityAt: snapshot.lastByWallet.get(key) ?? null,
      costBasisMutez: cost.toString(),
      costBasisUsd: mutezToUsdString(cost, latestUsdPerXtz),
      estimatedValueMutez: est.toString(),
      estimatedValueUsd: mutezToUsdString(est, latestUsdPerXtz),
      realizedProceedsMutez: proceeds.toString(),
      realizedProceedsUsd: mutezToUsdString(proceeds, latestUsdPerXtz),
      realizedCostBasisMutez: realizedCost.toString(),
      realizedPnlMutez: realizedPnl.toString(),
      realizedPnlUsd: mutezToUsdString(realizedPnl, latestUsdPerXtz),
      pricedPositions: priced,
      binTrapPositions: binTrap,
      acquisitionConfidence: confidence,
      tokensWithUnknownCost: unknown,
    };
  }).sort((a, b) => b.tokensHeld - a.tokensHeld || a.walletAddress.localeCompare(b.walletAddress));

  const confidence: Record<AcquisitionType, number> = {
    purchase: result.totals.purchasePositions,
    mint: result.totals.mintPositions,
    free_transfer: result.totals.freeTransferPositions,
    unknown: result.totals.unknownCostPositions,
  };

  return {
    totals: {
      wallets: snapshot.walletAddresses.length,
      tokensHeld: result.rows.length,
      contractsHeld: new Set(result.rows.map((row) => row.tokenContract)).size,
      costBasisMutez: result.totals.costBasisMutez.toString(),
      costBasisUsd: mutezToUsdString(result.totals.costBasisMutez, latestUsdPerXtz),
      estimatedValueMutez: result.totals.estimatedValueMutez.toString(),
      estimatedValueUsd: mutezToUsdString(result.totals.estimatedValueMutez, latestUsdPerXtz),
      realizedProceedsMutez: result.totals.realizedProceedsMutez.toString(),
      realizedProceedsUsd: mutezToUsdString(result.totals.realizedProceedsMutez, latestUsdPerXtz),
      realizedCostBasisMutez: result.totals.realizedCostBasisMutez.toString(),
      realizedPnlMutez: result.totals.realizedPnlMutez.toString(),
      realizedPnlUsd: mutezToUsdString(result.totals.realizedPnlMutez, latestUsdPerXtz),
      unrealizedPnlMutez: result.totals.unrealizedPnlMutez.toString(),
      unrealizedPnlUsd: mutezToUsdString(result.totals.unrealizedPnlMutez, latestUsdPerXtz),
      tokensWithUnknownCost: result.totals.unknownCostPositions,
      pricedPositions: result.totals.pricedPositions,
      binTrapPositions: result.totals.binTrapPositions,
      altCurrencySalesExcluded: result.totals.altCurrencySalesExcluded,
      acquisitionConfidence: confidence,
    },
    perWallet,
    fetchedAt: new Date().toISOString(),
    pnlMethod: "lot_fifo",
    pnlNotes: [
      "FIFO lot costing adapted from Tezos Open Tools.",
      "Gift/free-transfer and unknown-basis holdings are visible but excluded from priced P&L totals.",
      "BIN-trap floor outliers over 100x known unit cost are excluded from totals.",
    ],
  };
}

// ───────────────────────── portfolio summary ──────────────────────

/**
 * One big query that, for each of a user's linked wallets, returns
 * tokens-held, cost basis (mutez + usd), estimated market value, and
 * realised proceeds.  Rolled up into a totals object by the caller.
 *
 * Cost basis rule:
 *   1. prefer the most recent `token_sales` row where buyer = wallet
 *   2. else the mint fee from `token_mint_events.first_owner = wallet`
 *   3. else NULL (tokens_with_unknown_cost++)
 *
 * USD basis rule:
 *   • use stored `price_usd` from the sale row when present
 *   • else mutez * xtz_usd_daily.price_usd / 1e6 at the acquisition day
 *   • else NULL (portfolio.usd totals become NULL only when *every*
 *     row lacks USD data; mixed rows are summed honestly)
 *
 * Estimated market value rule:
 *   • prefer `current_floor_mutez` (cheapest active ask)
 *   • else `last_sale_mutez`
 *   • else NULL → contributes 0 to the estimated total (unknown)
 */
export async function getPortfolioSummary(userId: number): Promise<PortfolioSummary> {
  if (lotPnlEnabled()) {
    try {
      return await getLotBasedPortfolioSummary(userId);
    } catch (err) {
      console.warn("[portfolio] lot-based P&L failed; falling back to legacy latest-buy summary:", err);
    }
  }

  const perWalletRes = await db.execute(sql`
    WITH uw AS (
      SELECT wallet_address FROM user_wallets WHERE user_id = ${userId}
    ),
    held AS (
      SELECT h.wallet_address, h.token_contract, h.token_id,
             h.balance, h.first_acquired_at, h.last_activity_at
      FROM wallet_holdings h
      WHERE h.user_id = ${userId}
        AND COALESCE(NULLIF(h.balance, ''), '0')::numeric > 0
    ),
    -- most recent buy for each (wallet, contract, token).  Addresses
    -- are normalised with LOWER() on both sides because the Guidance
    -- import lowercased some buyer addresses while TzKT kept the
    -- checksum case — without the lower join we miss ~2% of rows
    -- (see db-diag 'case_mismatched_sales' audit).
    last_buy AS (
      SELECT DISTINCT ON (LOWER(s.buyer_address), s.token_contract, s.token_id)
        LOWER(s.buyer_address) AS wallet_address_lc,
        s.token_contract,
        s.token_id,
        s.price_mutez,
        s.price_usd,
        s.sold_at
      FROM token_sales s
      JOIN uw ON LOWER(s.buyer_address) = LOWER(uw.wallet_address)
      ORDER BY LOWER(s.buyer_address), s.token_contract, s.token_id, s.sold_at DESC
    ),
    -- mint row (fee as cost basis) — pick the earliest mint in case of
    -- re-mints so we're honest about the held-since date.
    minted AS (
      SELECT DISTINCT ON (LOWER(m.first_owner), m.token_contract, m.token_id)
        LOWER(m.first_owner) AS wallet_address_lc,
        m.token_contract,
        m.token_id,
        COALESCE(m.mint_fee_mutez, 0) AS price_mutez,
        m.minted_at
      FROM token_mint_events m
      JOIN uw ON LOWER(m.first_owner) = LOWER(uw.wallet_address)
      ORDER BY LOWER(m.first_owner), m.token_contract, m.token_id, m.minted_at ASC
    ),
    -- wallet_events earliest acquisition — catches the ~80% of held
    -- tokens that arrived via a transfer-in or a mint op that never
    -- landed in token_sales / token_mint_events.  We pick the oldest
    -- event per token so the acquired-at date matches holdings.
    first_event AS (
      SELECT DISTINCT ON (e.wallet_address, e.token_contract, e.token_id)
        e.wallet_address,
        e.token_contract,
        e.token_id,
        e.event_type::text                                        AS event_type,
        COALESCE(e.xtz_amount_mutez, 0)                           AS price_mutez,
        e.timestamp                                               AS acquired_at
      FROM wallet_events e
      JOIN uw ON uw.wallet_address = e.wallet_address
      WHERE e.event_type IN ('token_mint', 'token_transfer_in')
        AND e.token_contract IS NOT NULL
        AND e.token_id       IS NOT NULL
      ORDER BY e.wallet_address, e.token_contract, e.token_id, e.timestamp ASC
    ),
    cost AS (
      SELECT
        h.wallet_address,
        h.token_contract,
        h.token_id,
        -- price precedence: indexed sale → mint event → wallet_event XTZ leg → 0
        COALESCE(
          lb.price_mutez,
          mn.price_mutez,
          NULLIF(fe.price_mutez, 0),
          0
        ) AS cost_mutez,
        -- USD: prefer stored, else derive from day-level XTZ/USD for
        -- the matched source date.
        COALESCE(
          lb.price_usd,
          (lb.price_mutez::numeric / 1e6)
             * (SELECT price_usd FROM xtz_usd_daily
                WHERE day = (lb.sold_at AT TIME ZONE 'UTC')::date
                LIMIT 1),
          (mn.price_mutez::numeric / 1e6)
             * (SELECT price_usd FROM xtz_usd_daily
                WHERE day = (mn.minted_at AT TIME ZONE 'UTC')::date
                LIMIT 1),
          (NULLIF(fe.price_mutez, 0)::numeric / 1e6)
             * (SELECT price_usd FROM xtz_usd_daily
                WHERE day = (fe.acquired_at AT TIME ZONE 'UTC')::date
                LIMIT 1)
        ) AS cost_usd,
        -- Acquisition classification for UI / analytics badges:
        --   purchase  → we have a token_sales buy row
        --   mint      → token_mint_events first_owner OR wallet_events token_mint
        --   transfer  → only wallet_events token_transfer_in is known (airdrop,
        --               gift, trade_board relay, custom-contract buy whose
        --               sale row we do not yet have)
        --   unknown   → no evidence at all — worker should resolve soon
        CASE
          WHEN lb.price_mutez IS NOT NULL          THEN 'purchase'
          WHEN mn.price_mutez IS NOT NULL          THEN 'mint'
          WHEN fe.event_type = 'token_mint'        THEN 'mint'
          WHEN fe.event_type = 'token_transfer_in' THEN 'transfer'
          ELSE 'unknown'
        END AS acquisition_type
      FROM held h
      LEFT JOIN last_buy lb
        ON lb.wallet_address_lc = LOWER(h.wallet_address)
       AND lb.token_contract    = h.token_contract
       AND lb.token_id          = h.token_id
      LEFT JOIN minted mn
        ON mn.wallet_address_lc = LOWER(h.wallet_address)
       AND mn.token_contract    = h.token_contract
       AND mn.token_id          = h.token_id
      LEFT JOIN first_event fe
        ON fe.wallet_address    = h.wallet_address
       AND fe.token_contract    = h.token_contract
       AND fe.token_id          = h.token_id
    ),
    -- market value per token — joined by (contract, token_id) only, so
    -- the same token in multiple wallets gets the same "floor" mark
    mv AS (
      SELECT h.wallet_address, h.token_contract, h.token_id,
             COALESCE(ms.current_floor_mutez, ms.last_sale_mutez) AS est_mutez
      FROM held h
      LEFT JOIN token_market_summary ms USING (token_contract, token_id)
    ),
    -- realized proceeds — sum of sales where seller is this wallet.
    -- Normalised with LOWER() so we catch the ~2% of rows that landed
    -- with a non-canonical casing from the Guidance CSV import.
    realized AS (
      SELECT uw.wallet_address,
             SUM(s.price_mutez)::numeric AS proceeds_mutez,
             SUM(COALESCE(
               s.price_usd,
               (s.price_mutez::numeric / 1e6)
                 * (SELECT price_usd FROM xtz_usd_daily
                    WHERE day = (s.sold_at AT TIME ZONE 'UTC')::date
                    LIMIT 1)
             ))::numeric AS proceeds_usd
      FROM token_sales s
      JOIN uw ON LOWER(s.seller_address) = LOWER(uw.wallet_address)
      GROUP BY uw.wallet_address
    )
    SELECT
      uw.wallet_address,
      COUNT(h.token_contract)::int                      AS tokens_held,
      COUNT(DISTINCT h.token_contract)::int             AS contracts_held,
      MIN(h.first_acquired_at)                          AS first_acquired_at,
      MAX(h.last_activity_at)                           AS last_activity_at,
      COALESCE(SUM(c.cost_mutez), 0)::text              AS cost_basis_mutez,
      NULLIF(SUM(c.cost_usd), 0)::text                  AS cost_basis_usd,
      COALESCE(SUM(mv.est_mutez), 0)::text              AS est_value_mutez,
      COUNT(*) FILTER (WHERE c.acquisition_type = 'unknown')::int
                                                        AS tokens_with_unknown_cost,
      COALESCE(r.proceeds_mutez, 0)::text               AS realized_proceeds_mutez,
      NULLIF(r.proceeds_usd, 0)::text                   AS realized_proceeds_usd
    FROM uw
    LEFT JOIN held h   ON h.wallet_address  = uw.wallet_address
    LEFT JOIN cost c   ON c.wallet_address  = h.wallet_address
                      AND c.token_contract  = h.token_contract
                      AND c.token_id        = h.token_id
    LEFT JOIN mv       ON mv.wallet_address = h.wallet_address
                      AND mv.token_contract = h.token_contract
                      AND mv.token_id       = h.token_id
    LEFT JOIN realized r ON r.wallet_address = uw.wallet_address
    GROUP BY uw.wallet_address, r.proceeds_mutez, r.proceeds_usd
    ORDER BY tokens_held DESC, uw.wallet_address ASC
  `);

  const rows = ((perWalletRes as { rows?: any[] })?.rows ?? []) as any[];

  // Estimate-USD: compute from mutez * latest XTZ/USD (today) — simpler
  // than derived per-row and honest for a mark-to-market snapshot.
  const latestPriceRes = await db.execute(sql`
    SELECT price_usd::text AS price_usd FROM xtz_usd_daily
    ORDER BY day DESC LIMIT 1
  `);
  const latestUsdPerXtz =
    Number(((latestPriceRes as any)?.rows?.[0]?.price_usd ?? 0) as string) || 0;

  const perWallet: WalletSlice[] = rows.map((r) => {
    const estMutez = BigInt(r.est_value_mutez ?? "0");
    const estXtz = Number(estMutez) / 1e6;
    const estUsd = latestUsdPerXtz > 0 ? (estXtz * latestUsdPerXtz).toFixed(2) : null;
    return {
      walletAddress: String(r.wallet_address),
      tokensHeld: num(r.tokens_held),
      contractsHeld: num(r.contracts_held),
      firstAcquiredAt: r.first_acquired_at ? new Date(r.first_acquired_at).toISOString() : null,
      lastActivityAt: r.last_activity_at ? new Date(r.last_activity_at).toISOString() : null,
      costBasisMutez: str(r.cost_basis_mutez),
      costBasisUsd: strOrNull(r.cost_basis_usd),
      estimatedValueMutez: str(r.est_value_mutez),
      estimatedValueUsd: estUsd,
      realizedProceedsMutez: str(r.realized_proceeds_mutez),
      realizedProceedsUsd: strOrNull(r.realized_proceeds_usd),
      tokensWithUnknownCost: num(r.tokens_with_unknown_cost),
    };
  });

  // Totals roll-up
  let tokensHeld = 0;
  let contractsHeld = 0;
  let costMutez = 0n;
  let estMutez = 0n;
  let realMutez = 0n;
  let unknownCost = 0;
  let costUsd = 0;
  let realUsd = 0;
  let anyCostUsd = false;
  let anyRealUsd = false;

  const contractsGlobalRes = await db.execute(sql`
    SELECT COUNT(DISTINCT (token_contract))::int AS contracts
    FROM wallet_holdings
    WHERE user_id = ${userId}
      AND COALESCE(NULLIF(balance, ''), '0')::numeric > 0
  `);
  contractsHeld = num(
    ((contractsGlobalRes as any)?.rows?.[0]?.contracts ?? 0) as number
  );

  for (const w of perWallet) {
    tokensHeld += w.tokensHeld;
    costMutez += BigInt(w.costBasisMutez);
    estMutez += BigInt(w.estimatedValueMutez);
    realMutez += BigInt(w.realizedProceedsMutez);
    unknownCost += w.tokensWithUnknownCost;
    if (w.costBasisUsd) {
      costUsd += Number(w.costBasisUsd);
      anyCostUsd = true;
    }
    if (w.realizedProceedsUsd) {
      realUsd += Number(w.realizedProceedsUsd);
      anyRealUsd = true;
    }
  }

  const estXtz = Number(estMutez) / 1e6;
  const estUsdTotal = latestUsdPerXtz > 0 ? (estXtz * latestUsdPerXtz).toFixed(2) : null;
  const unrealizedMutez = estMutez - costMutez;
  const unrealizedUsd =
    anyCostUsd && latestUsdPerXtz > 0
      ? ((estXtz * latestUsdPerXtz) - costUsd).toFixed(2)
      : null;

  return {
    totals: {
      wallets: perWallet.length,
      tokensHeld,
      contractsHeld,
      costBasisMutez: costMutez.toString(),
      costBasisUsd: anyCostUsd ? costUsd.toFixed(2) : null,
      estimatedValueMutez: estMutez.toString(),
      estimatedValueUsd: estUsdTotal,
      realizedProceedsMutez: realMutez.toString(),
      realizedProceedsUsd: anyRealUsd ? realUsd.toFixed(2) : null,
      unrealizedPnlMutez: unrealizedMutez.toString(),
      unrealizedPnlUsd: unrealizedUsd,
      tokensWithUnknownCost: unknownCost,
    },
    perWallet,
    fetchedAt: new Date().toISOString(),
    pnlMethod: "legacy_latest_buy",
  };
}

// ───────────────────────── per-wallet deep slice ──────────────────

/**
 * Like getPortfolioSummary, but scoped to a single wallet AND returns
 * a richer payload (top positions by estimated value).  Callers must
 * verify the wallet actually belongs to the user before invoking.
 */
export async function getWalletDeepSlice(
  userId: number,
  walletAddress: string
): Promise<{
  slice: WalletSlice | null;
  topPositionsByValue: Array<{
    tokenContract: string;
    tokenId: string;
    tokenName: string | null;
    thumbnailUri: string | null;
    balance: string;
    costBasisMutez: string | null;
    estimatedValueMutez: string | null;
    unrealizedPnlMutez: string | null;
  }>;
}> {
  const summary = await getPortfolioSummary(userId);
  const slice = summary.perWallet.find(
    (w) => w.walletAddress.toLowerCase() === walletAddress.toLowerCase()
  ) ?? null;

  if (!slice) return { slice: null, topPositionsByValue: [] };

  const topRes = await db.execute(sql`
    WITH held AS (
      SELECT h.token_contract, h.token_id, h.balance
      FROM wallet_holdings h
      WHERE h.user_id = ${userId}
        AND h.wallet_address = ${walletAddress}
        AND COALESCE(NULLIF(h.balance, ''), '0')::numeric > 0
    ),
    last_buy AS (
      SELECT DISTINCT ON (s.token_contract, s.token_id)
        s.token_contract, s.token_id, s.price_mutez
      FROM token_sales s
      WHERE LOWER(s.buyer_address) = LOWER(${walletAddress})
      ORDER BY s.token_contract, s.token_id, s.sold_at DESC
    ),
    minted AS (
      SELECT DISTINCT ON (m.token_contract, m.token_id)
        m.token_contract, m.token_id, COALESCE(m.mint_fee_mutez, 0) AS price_mutez
      FROM token_mint_events m
      WHERE LOWER(m.first_owner) = LOWER(${walletAddress})
      ORDER BY m.token_contract, m.token_id, m.minted_at ASC
    ),
    -- fallback when neither a sale nor a mint row covers the holding:
    -- use the XTZ leg (if any) of the earliest wallet_event for the token.
    first_event AS (
      SELECT DISTINCT ON (e.token_contract, e.token_id)
        e.token_contract, e.token_id,
        COALESCE(e.xtz_amount_mutez, 0) AS price_mutez
      FROM wallet_events e
      WHERE e.wallet_address = ${walletAddress}
        AND e.event_type IN ('token_mint', 'token_transfer_in')
        AND e.token_contract IS NOT NULL
        AND e.token_id       IS NOT NULL
      ORDER BY e.token_contract, e.token_id, e.timestamp ASC
    )
    SELECT
      h.token_contract,
      h.token_id,
      h.balance,
      md.name AS token_name,
      md.thumbnail AS thumbnail_uri,
      COALESCE(lb.price_mutez, mn.price_mutez, NULLIF(fe.price_mutez, 0))::text AS cost_basis_mutez,
      COALESCE(ms.current_floor_mutez, ms.last_sale_mutez)::text AS est_value_mutez
    FROM held h
    LEFT JOIN token_metadata md
      ON md.token_contract = h.token_contract AND md.token_id = h.token_id
    LEFT JOIN token_market_summary ms
      ON ms.token_contract = h.token_contract AND ms.token_id = h.token_id
    LEFT JOIN last_buy lb
      ON lb.token_contract = h.token_contract AND lb.token_id = h.token_id
    LEFT JOIN minted mn
      ON mn.token_contract = h.token_contract AND mn.token_id = h.token_id
    LEFT JOIN first_event fe
      ON fe.token_contract = h.token_contract AND fe.token_id = h.token_id
    ORDER BY COALESCE(ms.current_floor_mutez, ms.last_sale_mutez, 0) DESC NULLS LAST
    LIMIT 20
  `);
  const topRows = ((topRes as any)?.rows ?? []) as any[];

  return {
    slice,
    topPositionsByValue: topRows.map((r) => {
      const cost = r.cost_basis_mutez ? BigInt(r.cost_basis_mutez) : null;
      const est = r.est_value_mutez ? BigInt(r.est_value_mutez) : null;
      return {
        tokenContract: String(r.token_contract),
        tokenId: String(r.token_id),
        tokenName: r.token_name ? String(r.token_name) : null,
        thumbnailUri: r.thumbnail_uri ? String(r.thumbnail_uri) : null,
        balance: String(r.balance ?? "0"),
        costBasisMutez: cost !== null ? cost.toString() : null,
        estimatedValueMutez: est !== null ? est.toString() : null,
        unrealizedPnlMutez:
          cost !== null && est !== null ? (est - cost).toString() : null,
      };
    }),
  };
}

// ───────────────────────── activity feeds ─────────────────────────

/**
 * Merge-sorted stream of the user's most recent acquisitions across all
 * their wallets.  Includes purchases (token_sales where buyer∈user) AND
 * mints (token_mint_events where first_owner∈user), dedup'd to one row
 * per on-chain op.
 */
export async function getRecentAcquisitions(
  userId: number,
  limit = 20
): Promise<RecentAcquisition[]> {
  const capped = Math.min(200, Math.max(1, limit));
  const res = await db.execute(sql`
    WITH uw AS (
      SELECT wallet_address FROM user_wallets WHERE user_id = ${userId}
    ),
    -- 1. direct token_sales rows we recorded the user as the buyer on
    buys AS (
      SELECT
        uw.wallet_address              AS wallet_address,
        s.token_contract,
        s.token_id,
        'purchase'::text               AS acquisition_type,
        s.price_mutez::text            AS price_mutez,
        s.price_usd::text              AS price_usd,
        s.marketplace,
        s.sold_at                      AS acquired_at,
        s.op_hash
      FROM token_sales s
      JOIN uw ON LOWER(s.buyer_address) = LOWER(uw.wallet_address)
    ),
    -- 2. token_mint_events rows with the user as first_owner
    mints AS (
      SELECT
        uw.wallet_address              AS wallet_address,
        m.token_contract,
        m.token_id,
        'mint'::text                   AS acquisition_type,
        COALESCE(m.mint_fee_mutez, 0)::text AS price_mutez,
        NULL::text                     AS price_usd,
        m.platform                     AS marketplace,
        m.minted_at                    AS acquired_at,
        m.op_hash
      FROM token_mint_events m
      JOIN uw ON LOWER(m.first_owner) = LOWER(uw.wallet_address)
    ),
    -- 3. wallet_events acquisitions we have NO sale/mint row for yet.
    --    We filter out tokens already represented in (1) or (2) so the
    --    list isn't dominated by three copies of the same acquisition
    --    (sale + mint + event).  Kept lightweight — just the XTZ leg.
    events_acq AS (
      SELECT
        e.wallet_address,
        e.token_contract,
        e.token_id,
        CASE
          WHEN e.event_type = 'token_mint'        THEN 'mint'
          WHEN e.event_type = 'token_transfer_in' THEN 'transfer'
          ELSE 'unknown'
        END::text                                  AS acquisition_type,
        COALESCE(e.xtz_amount_mutez, 0)::text      AS price_mutez,
        NULL::text                                 AS price_usd,
        NULL::text                                 AS marketplace,
        e.timestamp                                AS acquired_at,
        e.op_hash
      FROM wallet_events e
      JOIN uw ON uw.wallet_address = e.wallet_address
      WHERE e.event_type IN ('token_mint', 'token_transfer_in')
        AND e.token_contract IS NOT NULL
        AND e.token_id       IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM token_sales s
           WHERE LOWER(s.buyer_address) = LOWER(e.wallet_address)
             AND s.token_contract = e.token_contract
             AND s.token_id       = e.token_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM token_mint_events m
           WHERE LOWER(m.first_owner) = LOWER(e.wallet_address)
             AND m.token_contract = e.token_contract
             AND m.token_id       = e.token_id
        )
    ),
    all_acq AS (
      SELECT * FROM buys
      UNION ALL
      SELECT * FROM mints
      UNION ALL
      SELECT * FROM events_acq
    )
    SELECT
      a.wallet_address,
      a.token_contract,
      a.token_id,
      md.name           AS token_name,
      md.thumbnail AS thumbnail_uri,
      a.acquisition_type,
      a.price_mutez,
      a.price_usd,
      a.marketplace,
      a.acquired_at,
      a.op_hash,
      ms.current_floor_mutez::text  AS current_floor_mutez,
      ms.last_sale_mutez::text      AS last_sale_mutez
    FROM all_acq a
    LEFT JOIN token_metadata md
      ON md.token_contract = a.token_contract AND md.token_id = a.token_id
    LEFT JOIN token_market_summary ms
      ON ms.token_contract = a.token_contract AND ms.token_id = a.token_id
    ORDER BY a.acquired_at DESC NULLS LAST
    LIMIT ${capped}
  `);

  const rows = ((res as any)?.rows ?? []) as any[];
  return rows.map((r) => ({
    walletAddress: String(r.wallet_address),
    tokenContract: String(r.token_contract),
    tokenId: String(r.token_id),
    tokenName: r.token_name ? String(r.token_name) : null,
    thumbnailUri: r.thumbnail_uri ? String(r.thumbnail_uri) : null,
    acquisitionType: (r.acquisition_type as RecentAcquisition["acquisitionType"]) ?? "unknown",
    priceMutez: strOrNull(r.price_mutez),
    priceUsd: strOrNull(r.price_usd),
    marketplace: r.marketplace ? String(r.marketplace) : null,
    acquiredAt: new Date(r.acquired_at).toISOString(),
    opHash: r.op_hash ? String(r.op_hash) : null,
    currentFloorMutez: strOrNull(r.current_floor_mutez),
    lastSaleMutez: strOrNull(r.last_sale_mutez),
  }));
}

/**
 * Recent sales by the user (seller = any of their wallets), paired
 * with the cost basis from the most recent prior buy for the same
 * token.  Enables a "realized P&L per trade" UI row.
 */
export async function getRecentSales(
  userId: number,
  limit = 20
): Promise<RecentSale[]> {
  const capped = Math.min(200, Math.max(1, limit));
  const res = await db.execute(sql`
    WITH uw AS (
      SELECT wallet_address FROM user_wallets WHERE user_id = ${userId}
    ),
    sells AS (
      SELECT s.id,
             uw.wallet_address AS seller_address,
             s.token_contract, s.token_id,
             s.price_mutez, s.price_usd, s.marketplace, s.sold_at,
             s.op_hash
      FROM token_sales s
      JOIN uw ON LOWER(s.seller_address) = LOWER(uw.wallet_address)
      ORDER BY s.sold_at DESC
      LIMIT ${capped}
    ),
    -- cost basis: the most recent buy *before* the sale date, for
    -- that (wallet, contract, token_id).  LATERAL keeps it cheap.
    with_cost AS (
      SELECT
        sel.*,
        cb.price_mutez AS cost_basis_mutez,
        cb.price_usd   AS cost_basis_usd
      FROM sells sel
      LEFT JOIN LATERAL (
        SELECT b.price_mutez, b.price_usd, b.sold_at
        FROM token_sales b
        WHERE LOWER(b.buyer_address) = LOWER(sel.seller_address)
          AND b.token_contract       = sel.token_contract
          AND b.token_id             = sel.token_id
          AND b.sold_at              < sel.sold_at
        ORDER BY b.sold_at DESC
        LIMIT 1
      ) cb ON TRUE
    )
    SELECT
      w.seller_address,
      w.token_contract,
      w.token_id,
      md.name           AS token_name,
      md.thumbnail AS thumbnail_uri,
      w.price_mutez::text,
      w.price_usd::text,
      w.marketplace,
      w.sold_at,
      w.op_hash,
      w.cost_basis_mutez::text,
      w.cost_basis_usd::text
    FROM with_cost w
    LEFT JOIN token_metadata md
      ON md.token_contract = w.token_contract AND md.token_id = w.token_id
    ORDER BY w.sold_at DESC
  `);
  const rows = ((res as any)?.rows ?? []) as any[];
  const lotCostBySale = new Map<string, {
    costBasisMutez: string | null;
    realizedPnlMutez: string | null;
  }>();
  if (lotPnlEnabled()) {
    try {
      const snapshot = await loadPortfolioCostingSnapshot(userId);
      for (const row of snapshot.result.realized) {
        lotCostBySale.set(
          saleCostingKey({
            walletAddress: row.walletAddress,
            tokenContract: row.tokenContract,
            tokenId: row.tokenId,
            opHash: row.opHash,
            soldAt: row.soldAt,
          }),
          {
            costBasisMutez: row.costBasisMutez?.toString() ?? null,
            realizedPnlMutez: row.realizedPnlMutez?.toString() ?? null,
          },
        );
      }
    } catch (err) {
      console.warn("[portfolio] recent-sale lot costing failed; using legacy last-buy row costing:", err);
    }
  }
  return rows.map((r) => {
    const price = BigInt(String(r.price_mutez ?? "0"));
    const lotCost = lotCostBySale.get(
      saleCostingKey({
        walletAddress: String(r.seller_address),
        tokenContract: String(r.token_contract),
        tokenId: String(r.token_id),
        opHash: String(r.op_hash),
        soldAt: new Date(r.sold_at).toISOString(),
      }),
    );
    const cost = lotCost?.costBasisMutez
      ? BigInt(lotCost.costBasisMutez)
      : r.cost_basis_mutez
        ? BigInt(String(r.cost_basis_mutez))
        : null;
    const pnlMutez = lotCost?.realizedPnlMutez ?? (cost !== null ? (price - cost).toString() : null);
    const pnlUsd =
      r.price_usd && r.cost_basis_usd
        ? (Number(r.price_usd) - Number(r.cost_basis_usd)).toFixed(2)
        : null;
    return {
      walletAddress: String(r.seller_address),
      tokenContract: String(r.token_contract),
      tokenId: String(r.token_id),
      tokenName: r.token_name ? String(r.token_name) : null,
      thumbnailUri: r.thumbnail_uri ? String(r.thumbnail_uri) : null,
      priceMutez: str(r.price_mutez),
      priceUsd: strOrNull(r.price_usd),
      marketplace: r.marketplace ? String(r.marketplace) : null,
      soldAt: new Date(r.sold_at).toISOString(),
      opHash: String(r.op_hash),
      costBasisMutez: cost !== null ? cost.toString() : null,
      costBasisUsd: strOrNull(r.cost_basis_usd),
      realizedPnlMutez: pnlMutez,
      realizedPnlUsd: pnlUsd,
    };
  });
}

// ───────────────────────── per-token metrics ──────────────────────

/**
 * Return the 15+ market metrics for a single token, preferring the
 * materialised `token_market_summary` row when available and computing
 * them live otherwise.
 *
 * Covers every metric the spec calls out:
 *   last sale, floor, highest active listing, avg active listing,
 *   historical avg sale, highest sale, lowest sale, sale count,
 *   primary vs secondary, unique owners (from holdings), total
 *   royalties paid, total platform fees paid.
 */
export async function getTokenMarket(
  tokenContract: string,
  tokenId: string
): Promise<TokenMarketMetrics | null> {
  // First try the summary row.
  const summaryRes = await db.execute(sql`
    SELECT *
    FROM token_market_summary
    WHERE token_contract = ${tokenContract}
      AND token_id       = ${tokenId}
    LIMIT 1
  `);
  const sumRow = ((summaryRes as any)?.rows ?? [])[0];

  if (sumRow) {
    return {
      tokenContract,
      tokenId,
      lastSaleMutez: strOrNull(sumRow.last_sale_mutez),
      lastSaleAt: sumRow.last_sale_at ? new Date(sumRow.last_sale_at).toISOString() : null,
      highestSaleMutez: strOrNull(sumRow.highest_sale_mutez),
      lowestSaleMutez: strOrNull(sumRow.lowest_sale_mutez),
      averageSaleMutez: strOrNull(sumRow.average_sale_mutez),
      saleCount: num(sumRow.sale_count),
      primarySaleCount: num(sumRow.primary_sale_count),
      secondarySaleCount: num(sumRow.secondary_sale_count),
      totalVolumeMutez: str(sumRow.total_volume_mutez),
      currentFloorMutez: strOrNull(sumRow.current_floor_mutez),
      currentHighestListingMutez: strOrNull(sumRow.current_highest_listing_mutez),
      averageActiveListingMutez: strOrNull(sumRow.average_active_listing_mutez),
      activeListingCount: num(sumRow.active_listing_count),
      uniqueOwnersCount: num(sumRow.unique_owners_count),
      totalRoyaltiesMutez: str(sumRow.total_royalties_mutez),
      totalPlatformFeesMutez: str(sumRow.total_platform_fees_mutez),
      refreshedAt: sumRow.refreshed_at ? new Date(sumRow.refreshed_at).toISOString() : null,
      fromLiveAggregate: false,
    };
  }

  // Live aggregation fallback.  Runs two queries (sales agg + listings
  // agg + holdings owner count) because mixing them in one SQL with
  // filtered aggregates is a readability nightmare.
  const salesRes = await db.execute(sql`
    SELECT
      MAX(sold_at)                                    AS last_sale_at,
      (ARRAY_AGG(price_mutez ORDER BY sold_at DESC))[1] AS last_sale_mutez,
      MAX(price_mutez)                                AS highest_sale_mutez,
      MIN(price_mutez)                                AS lowest_sale_mutez,
      AVG(price_mutez)::bigint                        AS average_sale_mutez,
      COUNT(*)::int                                   AS sale_count,
      COUNT(*) FILTER (WHERE is_primary)::int         AS primary_sale_count,
      COUNT(*) FILTER (WHERE NOT is_primary)::int     AS secondary_sale_count,
      COALESCE(SUM(price_mutez), 0)::text             AS total_volume_mutez,
      COALESCE(SUM(royalties_mutez), 0)::text         AS total_royalties_mutez,
      COALESCE(SUM(platform_fee_mutez), 0)::text      AS total_platform_fees_mutez
    FROM token_sales
    WHERE token_contract = ${tokenContract}
      AND token_id       = ${tokenId}
  `);
  const sRow = ((salesRes as any)?.rows ?? [])[0] ?? {};

  const listingsRes = await db.execute(sql`
    SELECT
      MIN(price_mutez)                            AS floor_mutez,
      MAX(price_mutez)                            AS highest_mutez,
      AVG(price_mutez)::bigint                    AS avg_mutez,
      COUNT(*)::int                               AS active_count
    FROM token_listings
    WHERE token_contract = ${tokenContract}
      AND token_id       = ${tokenId}
      AND active = TRUE
  `);
  const lRow = ((listingsRes as any)?.rows ?? [])[0] ?? {};

  const ownersRes = await db.execute(sql`
    SELECT COUNT(DISTINCT wallet_address)::int AS uniq
    FROM wallet_holdings
    WHERE token_contract = ${tokenContract}
      AND token_id       = ${tokenId}
      AND COALESCE(NULLIF(balance, ''), '0')::numeric > 0
  `);
  const oRow = ((ownersRes as any)?.rows ?? [])[0] ?? {};

  const saleCount = num(sRow.sale_count);
  if (saleCount === 0 && num(lRow.active_count) === 0 && num(oRow.uniq) === 0) {
    return null;
  }

  return {
    tokenContract,
    tokenId,
    lastSaleMutez: strOrNull(sRow.last_sale_mutez),
    lastSaleAt: sRow.last_sale_at ? new Date(sRow.last_sale_at).toISOString() : null,
    highestSaleMutez: strOrNull(sRow.highest_sale_mutez),
    lowestSaleMutez: strOrNull(sRow.lowest_sale_mutez),
    averageSaleMutez: strOrNull(sRow.average_sale_mutez),
    saleCount,
    primarySaleCount: num(sRow.primary_sale_count),
    secondarySaleCount: num(sRow.secondary_sale_count),
    totalVolumeMutez: str(sRow.total_volume_mutez),
    currentFloorMutez: strOrNull(lRow.floor_mutez),
    currentHighestListingMutez: strOrNull(lRow.highest_mutez),
    averageActiveListingMutez: strOrNull(lRow.avg_mutez),
    activeListingCount: num(lRow.active_count),
    uniqueOwnersCount: num(oRow.uniq),
    totalRoyaltiesMutez: str(sRow.total_royalties_mutez),
    totalPlatformFeesMutez: str(sRow.total_platform_fees_mutez),
    refreshedAt: null,
    fromLiveAggregate: true,
  };
}
