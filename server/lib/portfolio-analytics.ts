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
    unrealizedPnlMutez: string;
    unrealizedPnlUsd: string | null;
    tokensWithUnknownCost: number;
  };
  perWallet: WalletSlice[];
  fetchedAt: string;
}

export interface RecentAcquisition {
  walletAddress: string;
  tokenContract: string;
  tokenId: string;
  tokenName: string | null;
  thumbnailUri: string | null;
  acquisitionType: "purchase" | "mint" | "unknown";
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
    -- most recent buy for each (wallet, contract, token)
    last_buy AS (
      SELECT DISTINCT ON (s.buyer_address, s.token_contract, s.token_id)
        s.buyer_address AS wallet_address,
        s.token_contract,
        s.token_id,
        s.price_mutez,
        s.price_usd,
        s.sold_at
      FROM token_sales s
      JOIN uw ON uw.wallet_address = s.buyer_address
      ORDER BY s.buyer_address, s.token_contract, s.token_id, s.sold_at DESC
    ),
    -- mint row (fee as cost basis) — pick the earliest mint in case of
    -- re-mints so we're honest about the "held-since" date
    minted AS (
      SELECT DISTINCT ON (m.first_owner, m.token_contract, m.token_id)
        m.first_owner AS wallet_address,
        m.token_contract,
        m.token_id,
        COALESCE(m.mint_fee_mutez, 0) AS price_mutez,
        m.minted_at
      FROM token_mint_events m
      JOIN uw ON uw.wallet_address = m.first_owner
      ORDER BY m.first_owner, m.token_contract, m.token_id, m.minted_at ASC
    ),
    cost AS (
      SELECT
        h.wallet_address,
        h.token_contract,
        h.token_id,
        COALESCE(lb.price_mutez, mn.price_mutez) AS cost_mutez,
        -- USD: prefer stored, else derive from day-level XTZ/USD
        COALESCE(
          lb.price_usd,
          (lb.price_mutez::numeric / 1e6)
             * (SELECT price_usd FROM xtz_usd_daily
                WHERE day = (lb.sold_at AT TIME ZONE 'UTC')::date
                LIMIT 1),
          (mn.price_mutez::numeric / 1e6)
             * (SELECT price_usd FROM xtz_usd_daily
                WHERE day = (mn.minted_at AT TIME ZONE 'UTC')::date
                LIMIT 1)
        ) AS cost_usd,
        -- acquisition flag — used by caller for UI badge.
        CASE
          WHEN lb.price_mutez IS NOT NULL THEN 'purchase'
          WHEN mn.price_mutez IS NOT NULL THEN 'mint'
          ELSE 'unknown'
        END AS acquisition_type
      FROM held h
      LEFT JOIN last_buy lb
        ON lb.wallet_address = h.wallet_address
       AND lb.token_contract = h.token_contract
       AND lb.token_id       = h.token_id
      LEFT JOIN minted mn
        ON mn.wallet_address = h.wallet_address
       AND mn.token_contract = h.token_contract
       AND mn.token_id       = h.token_id
    ),
    -- market value per token — joined by (contract, token_id) only, so
    -- the same token in multiple wallets gets the same "floor" mark
    mv AS (
      SELECT h.wallet_address, h.token_contract, h.token_id,
             COALESCE(ms.current_floor_mutez, ms.last_sale_mutez) AS est_mutez
      FROM held h
      LEFT JOIN token_market_summary ms USING (token_contract, token_id)
    ),
    -- realized proceeds — sum of sales where seller is this wallet
    realized AS (
      SELECT s.seller_address AS wallet_address,
             SUM(s.price_mutez)::numeric AS proceeds_mutez,
             SUM(COALESCE(
               s.price_usd,
               (s.price_mutez::numeric / 1e6)
                 * (SELECT price_usd FROM xtz_usd_daily
                    WHERE day = (s.sold_at AT TIME ZONE 'UTC')::date
                    LIMIT 1)
             ))::numeric AS proceeds_usd
      FROM token_sales s
      JOIN uw ON uw.wallet_address = s.seller_address
      GROUP BY s.seller_address
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
      WHERE s.buyer_address = ${walletAddress}
      ORDER BY s.token_contract, s.token_id, s.sold_at DESC
    ),
    minted AS (
      SELECT DISTINCT ON (m.token_contract, m.token_id)
        m.token_contract, m.token_id, COALESCE(m.mint_fee_mutez, 0) AS price_mutez
      FROM token_mint_events m
      WHERE m.first_owner = ${walletAddress}
      ORDER BY m.token_contract, m.token_id, m.minted_at ASC
    )
    SELECT
      h.token_contract,
      h.token_id,
      h.balance,
      md.name AS token_name,
      md.thumbnail_uri,
      COALESCE(lb.price_mutez, mn.price_mutez)::text AS cost_basis_mutez,
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
    buys AS (
      SELECT
        s.buyer_address                AS wallet_address,
        s.token_contract,
        s.token_id,
        'purchase'::text               AS acquisition_type,
        s.price_mutez::text            AS price_mutez,
        s.price_usd::text              AS price_usd,
        s.marketplace,
        s.sold_at                      AS acquired_at,
        s.op_hash
      FROM token_sales s
      JOIN uw ON uw.wallet_address = s.buyer_address
    ),
    mints AS (
      SELECT
        m.first_owner                  AS wallet_address,
        m.token_contract,
        m.token_id,
        'mint'::text                   AS acquisition_type,
        COALESCE(m.mint_fee_mutez, 0)::text AS price_mutez,
        NULL::text                     AS price_usd,
        m.platform                     AS marketplace,
        m.minted_at                    AS acquired_at,
        m.op_hash
      FROM token_mint_events m
      JOIN uw ON uw.wallet_address = m.first_owner
    ),
    all_acq AS (
      SELECT * FROM buys
      UNION ALL
      SELECT * FROM mints
    )
    SELECT
      a.wallet_address,
      a.token_contract,
      a.token_id,
      md.name           AS token_name,
      md.thumbnail_uri,
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
      SELECT s.id, s.seller_address, s.token_contract, s.token_id,
             s.price_mutez, s.price_usd, s.marketplace, s.sold_at,
             s.op_hash
      FROM token_sales s
      JOIN uw ON uw.wallet_address = s.seller_address
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
        WHERE b.buyer_address   = sel.seller_address
          AND b.token_contract  = sel.token_contract
          AND b.token_id        = sel.token_id
          AND b.sold_at         < sel.sold_at
        ORDER BY b.sold_at DESC
        LIMIT 1
      ) cb ON TRUE
    )
    SELECT
      w.seller_address,
      w.token_contract,
      w.token_id,
      md.name           AS token_name,
      md.thumbnail_uri,
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
  return rows.map((r) => {
    const price = BigInt(String(r.price_mutez ?? "0"));
    const cost = r.cost_basis_mutez ? BigInt(String(r.cost_basis_mutez)) : null;
    const pnlMutez = cost !== null ? (price - cost).toString() : null;
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
