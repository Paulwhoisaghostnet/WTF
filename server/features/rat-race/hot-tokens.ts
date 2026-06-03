import { sql } from "drizzle-orm";
import { externalMarketplaceInfo, externalMarketplaceName } from "@shared/external-marketplaces";
import { normalizeIpfsUri } from "@shared/ipfs-gateways";
import type {
  RatRaceFeedDiagnostics,
  RatRaceHotToken,
  RatRaceNearMiss,
  RatRacePurchaseIntent,
  RatRaceSourceFreshness,
  RatRaceSupplementSource,
} from "@shared/tezos-intel";
import { db } from "../../db";
import { loadTz2atRatRaceRows } from "./tz2at-atproto";

export type RatRaceCandidateRow = {
  token_contract: string;
  token_id: string;
  token_name: string | null;
  token_thumbnail: string | null;
  creator_address: string | null;
  metadata_supply: number | string | null;
  minted_editions: number | string | null;
  minted_at: string | Date | null;
  first_listed_at: string | Date | null;
  last_sale_at: string | Date | null;
  sale_count: number | string | null;
  sold_editions: number | string | null;
  primary_sold_editions: number | string | null;
  recent_sale_count: number | string | null;
  recent_editions_sold: number | string | null;
  active_listing_count: number | string | null;
  floor_mutez: bigint | number | string | null;
  listing_id: string | null;
  marketplace_contract: string | null;
  listing_price_mutez: bigint | number | string | null;
};

export type RatRaceFilter = {
  windowHours: number;
  mintedWithinDays: number;
  minSoldPercent: number;
  minRecentSales: number;
  limit: number;
  now: Date;
};

export type RatRaceFeedResult = {
  items: RatRaceHotToken[];
  diagnostics: RatRaceFeedDiagnostics;
};

function envNumber(name: string, fallback: number, min: number, max: number, integer = true): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  const value = integer ? Math.floor(raw) : raw;
  return Math.max(min, Math.min(max, value));
}

export const RAT_RACE_FILTER_LIMITS = {
  windowHours: { min: 1, max: 168 },
  mintedWithinDays: { min: 1, max: 7 },
  minSoldPercent: { min: 1, max: 99 },
  minRecentSales: { min: 1, max: 25 },
  limit: { min: 1, max: 60 },
} as const;

export const RAT_RACE_DEFAULT_FILTER_VALUES = {
  windowHours: envNumber("RAT_RACE_DEFAULT_WINDOW_HOURS", 24, RAT_RACE_FILTER_LIMITS.windowHours.min, RAT_RACE_FILTER_LIMITS.windowHours.max),
  mintedWithinDays: envNumber(
    "RAT_RACE_DEFAULT_MINTED_WITHIN_DAYS",
    7,
    RAT_RACE_FILTER_LIMITS.mintedWithinDays.min,
    RAT_RACE_FILTER_LIMITS.mintedWithinDays.max
  ),
  minSoldPercent: envNumber(
    "RAT_RACE_DEFAULT_MIN_SOLD_PERCENT",
    50,
    RAT_RACE_FILTER_LIMITS.minSoldPercent.min,
    RAT_RACE_FILTER_LIMITS.minSoldPercent.max,
    false
  ),
  minRecentSales: envNumber(
    "RAT_RACE_DEFAULT_MIN_RECENT_SALES",
    2,
    RAT_RACE_FILTER_LIMITS.minRecentSales.min,
    RAT_RACE_FILTER_LIMITS.minRecentSales.max
  ),
  limit: envNumber("RAT_RACE_DEFAULT_LIMIT", 24, RAT_RACE_FILTER_LIMITS.limit.min, RAT_RACE_FILTER_LIMITS.limit.max),
} as const;

export const DEFAULT_RAT_RACE_FILTER: RatRaceFilter = {
  ...RAT_RACE_DEFAULT_FILTER_VALUES,
  now: new Date(),
};

function asNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "bigint") return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function positiveNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value > 0n ? Number(value) : null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function asIso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function hoursBetween(start: string | null, end: Date): number | null {
  if (!start) return null;
  const ms = end.getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return ms / 3_600_000;
}

function marketUrl(tokenContract: string, tokenId: string) {
  return `https://objkt.com/tokens/${encodeURIComponent(tokenContract)}/${encodeURIComponent(tokenId)}`;
}

function rowSnapshot(row: RatRaceCandidateRow, filter: RatRaceFilter): RatRaceNearMiss | null {
  const tokenContract = String(row.token_contract || "").trim();
  const tokenId = String(row.token_id || "").trim();
  if (!tokenContract || !tokenId) return null;

  const metadataSupply = positiveNumber(row.metadata_supply);
  const mintedEditions = positiveNumber(row.minted_editions);
  const totalEditions = metadataSupply || mintedEditions;
  const primarySold = asNumber(row.primary_sold_editions);
  const observedSoldEditions = Math.max(primarySold, asNumber(row.sold_editions));
  const soldEditions = totalEditions ? Math.min(totalEditions, observedSoldEditions) : observedSoldEditions;
  const soldPercent = totalEditions ? (soldEditions / totalEditions) * 100 : 0;
  const recentSaleCount = asNumber(row.recent_sale_count);
  const mintedAt = asIso(row.minted_at);
  const reasons: string[] = [];
  if (!totalEditions) {
    reasons.push("unknown total edition supply");
  } else if (soldPercent < filter.minSoldPercent) {
    reasons.push(`${soldPercent.toFixed(1)}% sold, needs ${filter.minSoldPercent}%`);
  }
  if (recentSaleCount < filter.minRecentSales) reasons.push(`${recentSaleCount} recent sale(s), needs ${filter.minRecentSales}`);
  if (asNumber(row.active_listing_count) <= 0) reasons.push("no active rolling listing signal");
  if (mintedAt) {
    const mintedAgeDays = (filter.now.getTime() - new Date(mintedAt).getTime()) / 86_400_000;
    if (Number.isFinite(mintedAgeDays) && mintedAgeDays > filter.mintedWithinDays) {
      reasons.push(`minted ${Math.floor(mintedAgeDays)} days ago, window is ${filter.mintedWithinDays} days`);
    }
  }
  return {
    tokenContract,
    tokenId,
    tokenName: row.token_name || `${tokenContract.slice(0, 8)}... #${tokenId}`,
    totalEditions: totalEditions || 0,
    soldEditions,
    soldPercent: Number(soldPercent.toFixed(1)),
    recentSaleCount,
    activeListingCount: asNumber(row.active_listing_count),
    mintedAt,
    lastSaleAt: asIso(row.last_sale_at),
    marketUrl: marketUrl(tokenContract, tokenId),
    reasons,
  };
}

function buildDiagnostics(
  rows: RatRaceCandidateRow[],
  filter: RatRaceFilter,
  source: RatRaceFeedDiagnostics["source"],
  counts: {
    localCandidateRows: number;
    tz2atCandidateRows: number;
    rankedItems: number;
    sourceFreshness?: RatRaceSourceFreshness | null;
    supplementSources?: RatRaceSupplementSource[];
  }
): RatRaceFeedDiagnostics {
  let rejectedByMintWindow = 0;
  let rejectedByRecentSales = 0;
  let rejectedBySoldPercent = 0;
  let rejectedByUnknownSupply = 0;
  let rejectedByNoActiveListing = 0;
  const nearMisses = rows
    .map((row) => {
      const miss = rowSnapshot(row, filter);
      if (!miss) return null;
      if (miss.reasons.some((reason) => reason.includes("unknown total edition supply"))) rejectedByUnknownSupply += 1;
      if (miss.reasons.some((reason) => reason.includes("no active rolling listing"))) rejectedByNoActiveListing += 1;
      if (miss.reasons.some((reason) => reason.includes("minted"))) rejectedByMintWindow += 1;
      if (miss.reasons.some((reason) => reason.includes("recent sale"))) rejectedByRecentSales += 1;
      if (miss.reasons.some((reason) => reason.includes("% sold"))) rejectedBySoldPercent += 1;
      return miss.reasons.length > 0 ? miss : null;
    })
    .filter((miss): miss is RatRaceNearMiss => Boolean(miss))
    .sort((a, b) => b.recentSaleCount - a.recentSaleCount || b.soldPercent - a.soldPercent)
    .slice(0, 5);

  const note =
    counts.rankedItems > 0
      ? "Rat Race found tokens matching the urgency filter."
      : counts.sourceFreshness?.ok === false
        ? "Rat Race did not rank tokens because the tz2at replay source is reporting stale indexer health."
        : counts.localCandidateRows === 0 && counts.tz2atCandidateRows === 0
          ? "Rat Race did not find buyable sale candidates in the local index or tz2at replay stream."
          : rejectedByRecentSales > 0 &&
              counts.tz2atCandidateRows > 0 &&
              rejectedByRecentSales >= counts.tz2atCandidateRows
            ? `Rat Race found ${counts.tz2atCandidateRows} sale candidate(s), but none had ${filter.minRecentSales}+ sale(s) in the last ${filter.windowHours} hour window. tz2at processed sales are behind intake${
                counts.sourceFreshness?.processedLagBlocks
                  ? ` by ${counts.sourceFreshness.processedLagBlocks.toLocaleString()} blocks`
                  : ""
              } - widen the sales window (try 72h) or restore tz2at block processing.`
            : "Rat Race found candidates, but none passed every hot-edition filter.";

  return {
    source,
    sourceFreshness: counts.sourceFreshness ?? null,
    supplementSources: counts.supplementSources ?? [],
    localCandidateRows: counts.localCandidateRows,
    tz2atCandidateRows: counts.tz2atCandidateRows,
    rankedItems: counts.rankedItems,
    rejectedByUnknownSupply,
    rejectedByNoActiveListing,
    rejectedByMintWindow,
    rejectedByRecentSales,
    rejectedBySoldPercent,
    nearMisses,
    note,
  };
}

export function buildRatRacePurchaseIntent(row: RatRaceCandidateRow): RatRacePurchaseIntent {
  const listingId = row.listing_id ? String(row.listing_id) : null;
  const marketplaceContract = row.marketplace_contract ? String(row.marketplace_contract) : null;
  const priceMutez = row.listing_price_mutez == null ? null : String(row.listing_price_mutez);
  const amount = 1;
  if (!listingId || !marketplaceContract || !priceMutez) {
    return {
      supported: false,
      reason: "No active fixed-price listing is mirrored yet",
      marketplaceContract,
      marketplaceName: marketplaceContract ? externalMarketplaceName(marketplaceContract) : null,
      entrypoint: null,
      listingId,
      amount,
      priceMutez,
      totalMutez: priceMutez,
    };
  }
  if (!/^[0-9]+$/.test(listingId) || !/^[0-9]+$/.test(priceMutez)) {
    return {
      supported: false,
      reason: "Mirrored listing is missing a numeric contract purchase key",
      marketplaceContract,
      marketplaceName: externalMarketplaceName(marketplaceContract),
      entrypoint: null,
      listingId,
      amount,
      priceMutez,
      totalMutez: priceMutez,
    };
  }

  const info = externalMarketplaceInfo(marketplaceContract);
  if (!info) {
    return {
      supported: false,
      reason: "Marketplace contract is not allowlisted for in-app contract purchase",
      marketplaceContract,
      marketplaceName: externalMarketplaceName(marketplaceContract),
      entrypoint: null,
      listingId,
      amount,
      priceMutez,
      totalMutez: priceMutez,
    };
  }

  const entrypoint =
    info.marketplace === "objkt" && info.version.startsWith("fixed-price")
      ? "buy"
      : info.marketplace === "objkt"
        ? "fulfill_ask"
        : info.marketplace === "teia" || info.marketplace === "hen"
          ? "collect"
          : null;

  return {
    supported: Boolean(entrypoint),
    reason: entrypoint ? null : "Marketplace purchase shape is not supported yet",
    marketplaceContract,
    marketplaceName: info.name,
    entrypoint,
    listingId,
    amount,
    priceMutez,
    totalMutez: priceMutez,
  };
}

export function rankRatRaceCandidates(
  rows: RatRaceCandidateRow[],
  filter: RatRaceFilter = DEFAULT_RAT_RACE_FILTER,
  source: RatRaceHotToken["source"] = "tz2at-firehose"
): RatRaceHotToken[] {
  const items: RatRaceHotToken[] = [];
  for (const row of rows) {
    const tokenContract = String(row.token_contract || "").trim();
    const tokenId = String(row.token_id || "").trim();
    if (!tokenContract || !tokenId) continue;

    const metadataSupply = positiveNumber(row.metadata_supply);
    const mintedEditions = positiveNumber(row.minted_editions);
    const totalEditions = metadataSupply || mintedEditions;
    if (!totalEditions) continue;
    const primarySold = asNumber(row.primary_sold_editions);
    const soldEditions = Math.min(totalEditions, Math.max(primarySold, asNumber(row.sold_editions)));
    const soldPercent = totalEditions > 0 ? (soldEditions / totalEditions) * 100 : 0;
    const recentSaleCount = asNumber(row.recent_sale_count);
    const recentEditionsSold = asNumber(row.recent_editions_sold);
    const activeListingCount = asNumber(row.active_listing_count);
    if (activeListingCount <= 0) continue;
    if (soldPercent < filter.minSoldPercent || recentSaleCount < filter.minRecentSales) continue;

    const mintedAt = asIso(row.minted_at);
    if (mintedAt) {
      const mintedAgeDays = (filter.now.getTime() - new Date(mintedAt).getTime()) / 86_400_000;
      if (Number.isFinite(mintedAgeDays) && mintedAgeDays > filter.mintedWithinDays) continue;
    }
    const firstListedAt = asIso(row.first_listed_at);
    const lastSaleAt = asIso(row.last_sale_at);
    const recentVelocity = recentEditionsSold / Math.max(1, filter.windowHours);
    const ageHours = hoursBetween(mintedAt, filter.now) ?? filter.windowHours;
    const listedHours = hoursBetween(firstListedAt, filter.now) ?? ageHours;
    const lifetimeVelocity = soldEditions / Math.max(1, ageHours);
    const listedVelocity = soldEditions / Math.max(1, listedHours);
    const salesVelocityPerHour = Math.max(recentVelocity, lifetimeVelocity, listedVelocity);
    const remainingEditions = Math.max(0, totalEditions - soldEditions);
    const hoursToSellout =
      remainingEditions === 0
        ? 0
        : salesVelocityPerHour > 0
          ? remainingEditions / salesVelocityPerHour
          : null;
    const estimatedSelloutAt =
      hoursToSellout === null
        ? null
        : new Date(filter.now.getTime() + hoursToSellout * 3_600_000).toISOString();

    const selloutPressure = hoursToSellout === null ? 0 : 100 / Math.max(1, hoursToSellout);
    const scarcityPressure = soldPercent * 1.5;
    const recentPressure = recentSaleCount * 20 + recentEditionsSold * 8;
    const listingPressure = activeListingCount > 0 ? Math.min(30, 120 / activeListingCount) : 0;

    items.push({
      tokenContract,
      tokenId,
      tokenName: row.token_name || `${tokenContract.slice(0, 8)}... #${tokenId}`,
      tokenThumbnail: row.token_thumbnail ? normalizeIpfsUri(String(row.token_thumbnail)) : null,
      creatorAddress: row.creator_address || null,
      totalEditions,
      soldEditions,
      soldPercent: Number(soldPercent.toFixed(1)),
      recentSaleCount,
      recentEditionsSold,
      activeListingCount,
      floorMutez: row.floor_mutez == null ? null : String(row.floor_mutez),
      mintedAt,
      firstListedAt,
      lastSaleAt,
      estimatedSelloutAt,
      hoursToSellout: hoursToSellout === null ? null : Number(hoursToSellout.toFixed(2)),
      urgencyScore: Number((scarcityPressure + recentPressure + selloutPressure + listingPressure).toFixed(2)),
      salesVelocityPerHour: Number(salesVelocityPerHour.toFixed(4)),
      remainingEditions,
      marketUrl: marketUrl(tokenContract, tokenId),
      source,
      purchaseIntent: buildRatRacePurchaseIntent(row),
    });
  }

  return items
    .sort((a, b) => {
      if (a.hoursToSellout !== null && b.hoursToSellout !== null && a.hoursToSellout !== b.hoursToSellout) {
        return a.hoursToSellout - b.hoursToSellout;
      }
      if (a.hoursToSellout !== null) return -1;
      if (b.hoursToSellout !== null) return 1;
      return b.urgencyScore - a.urgencyScore;
    })
    .slice(0, filter.limit);
}

function normalizeRatRaceFilter(options: Partial<RatRaceFilter> = {}): RatRaceFilter {
  const filter = { ...DEFAULT_RAT_RACE_FILTER, ...options };
  return {
    ...filter,
    windowHours: Math.max(
      RAT_RACE_FILTER_LIMITS.windowHours.min,
      Math.min(RAT_RACE_FILTER_LIMITS.windowHours.max, Math.floor(filter.windowHours))
    ),
    mintedWithinDays: Math.max(
      RAT_RACE_FILTER_LIMITS.mintedWithinDays.min,
      Math.min(RAT_RACE_FILTER_LIMITS.mintedWithinDays.max, Math.floor(filter.mintedWithinDays))
    ),
    limit: Math.max(RAT_RACE_FILTER_LIMITS.limit.min, Math.min(RAT_RACE_FILTER_LIMITS.limit.max, Math.floor(filter.limit))),
    now: options.now ?? new Date(),
  };
}

async function loadLocalRatRaceRows(filter: RatRaceFilter): Promise<RatRaceCandidateRow[]> {
  const rows = await db.execute(sql`
    WITH mint_summary AS (
      SELECT
        token_contract,
        token_id,
        MIN(minted_at) AS minted_at,
        SUM(editions)::int AS minted_editions
      FROM token_mint_events
      GROUP BY token_contract, token_id
      ),
    sale_summary AS (
      SELECT
        token_contract,
        token_id,
        COUNT(*)::int AS sale_count,
        SUM(editions_sold)::int AS sold_editions,
        SUM(CASE WHEN is_primary THEN editions_sold ELSE 0 END)::int AS primary_sold_editions,
        COUNT(*) FILTER (WHERE sold_at >= ${filter.now}::timestamptz - (${filter.windowHours} || ' hours')::interval)::int AS recent_sale_count,
        COALESCE(SUM(editions_sold) FILTER (WHERE sold_at >= ${filter.now}::timestamptz - (${filter.windowHours} || ' hours')::interval), 0)::int AS recent_editions_sold,
        MAX(sold_at) AS last_sale_at
      FROM token_sales
      GROUP BY token_contract, token_id
    ),
    listing_summary AS (
      SELECT DISTINCT ON (token_contract, token_id)
        token_contract,
        token_id,
        listing_id,
        marketplace AS marketplace_contract,
        price_mutez AS listing_price_mutez,
        MIN(listed_at) OVER (PARTITION BY token_contract, token_id) AS first_listed_at,
        COUNT(*) OVER (PARTITION BY token_contract, token_id)::int AS active_listing_count,
        MIN(price_mutez) OVER (PARTITION BY token_contract, token_id) AS floor_mutez
      FROM token_listings
      WHERE active = true
      ORDER BY token_contract, token_id, price_mutez ASC, listed_at ASC
    )
    SELECT
      ss.token_contract,
      ss.token_id,
      tm.name AS token_name,
      tm.thumbnail AS token_thumbnail,
      tm.creator_address,
      tm.supply AS metadata_supply,
      ms.minted_editions,
      ms.minted_at,
      ls.first_listed_at,
      ss.last_sale_at,
      ss.sale_count,
      ss.sold_editions,
      ss.primary_sold_editions,
      ss.recent_sale_count,
      ss.recent_editions_sold,
      COALESCE(ls.active_listing_count, 0) AS active_listing_count,
      ls.floor_mutez,
      ls.listing_id,
      ls.marketplace_contract,
      ls.listing_price_mutez
    FROM sale_summary ss
    LEFT JOIN mint_summary ms
      ON ms.token_contract = ss.token_contract
     AND ms.token_id = ss.token_id
    LEFT JOIN token_metadata tm
      ON tm.token_contract = ss.token_contract
     AND tm.token_id = ss.token_id
    LEFT JOIN listing_summary ls
      ON ls.token_contract = ss.token_contract
     AND ls.token_id = ss.token_id
    WHERE ss.recent_sale_count >= ${filter.minRecentSales}
      AND COALESCE(ls.active_listing_count, 0) > 0
      AND (
        ms.minted_at IS NULL
        OR ms.minted_at >= ${filter.now}::timestamptz - (${filter.mintedWithinDays} || ' days')::interval
      )
    ORDER BY ss.recent_sale_count DESC, ss.last_sale_at DESC
    LIMIT ${filter.limit * 8}
  `);
  return (((rows as any).rows ?? rows) as RatRaceCandidateRow[]);
}

export async function loadRatRaceHotTokenFeed(options: Partial<RatRaceFilter> = {}): Promise<RatRaceFeedResult> {
  const normalizedFilter = normalizeRatRaceFilter(options);

  try {
    const tz2atResult = await loadTz2atRatRaceRows(normalizedFilter);
    const tz2atRows = tz2atResult.rows;
    const tz2atItems = rankRatRaceCandidates(tz2atRows, normalizedFilter, "tz2at-firehose");
    return {
      items: tz2atItems,
      diagnostics: buildDiagnostics(tz2atRows, normalizedFilter, tz2atResult.source, {
        localCandidateRows: 0,
        tz2atCandidateRows: tz2atRows.length,
        rankedItems: tz2atItems.length,
        sourceFreshness: tz2atResult.sourceFreshness ?? null,
        supplementSources: tz2atResult.supplementSources ?? [],
      }),
    };
  } catch (err) {
    console.warn("[rat-race] tz2at canonical feed failed; falling back to local market index:", err);
  }

  const sourceRows = await loadLocalRatRaceRows(normalizedFilter);
  const localItems = rankRatRaceCandidates(sourceRows, normalizedFilter, "local-index");
  return {
    items: localItems,
    diagnostics: buildDiagnostics(sourceRows, normalizedFilter, sourceRows.length > 0 ? "local-index" : "none", {
      localCandidateRows: sourceRows.length,
      tz2atCandidateRows: 0,
      rankedItems: localItems.length,
    }),
  };
}

export async function loadRatRaceHotTokens(options: Partial<RatRaceFilter> = {}) {
  const feed = await loadRatRaceHotTokenFeed(options);
  return feed.items;
}
