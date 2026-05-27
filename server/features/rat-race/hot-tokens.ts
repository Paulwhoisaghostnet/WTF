import { sql } from "drizzle-orm";
import { externalMarketplaceInfo, externalMarketplaceName } from "@shared/external-marketplaces";
import { normalizeIpfsUri } from "@shared/ipfs-gateways";
import type { RatRaceFeedDiagnostics, RatRaceHotToken, RatRaceNearMiss, RatRacePurchaseIntent } from "@shared/tezos-intel";
import { db } from "../../db";
import { loadTz2atAtprotoRatRaceRows } from "./tz2at-atproto";

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

export const DEFAULT_RAT_RACE_FILTER: RatRaceFilter = {
  windowHours: 24,
  mintedWithinDays: 14,
  minSoldPercent: 50,
  minRecentSales: 2,
  limit: 24,
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
  counts: { localCandidateRows: number; tz2atCandidateRows: number; rankedItems: number }
): RatRaceFeedDiagnostics {
  let rejectedByMintWindow = 0;
  let rejectedByRecentSales = 0;
  let rejectedBySoldPercent = 0;
  let rejectedByUnknownSupply = 0;
  const nearMisses = rows
    .map((row) => {
      const miss = rowSnapshot(row, filter);
      if (!miss) return null;
      if (miss.reasons.some((reason) => reason.includes("unknown total edition supply"))) rejectedByUnknownSupply += 1;
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
      : counts.localCandidateRows === 0 && counts.tz2atCandidateRows === 0
        ? "Rat Race did not find buyable sale candidates in the local index or tz2at AT Protocol fallback."
        : "Rat Race found candidates, but none passed every hot-edition filter.";

  return {
    source,
    localCandidateRows: counts.localCandidateRows,
    tz2atCandidateRows: counts.tz2atCandidateRows,
    rankedItems: counts.rankedItems,
    rejectedByUnknownSupply,
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
  filter: RatRaceFilter = DEFAULT_RAT_RACE_FILTER
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

    const activeListingCount = asNumber(row.active_listing_count);
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
      source: "local-index",
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
    .slice(0, filter.limit)
    .map((item) => ({ ...item, source: "tz2at-firehose" }));
}

export async function loadRatRaceHotTokenFeed(options: Partial<RatRaceFilter> = {}): Promise<RatRaceFeedResult> {
  const filter = { ...DEFAULT_RAT_RACE_FILTER, ...options };
  const windowHours = Math.max(1, Math.min(168, Math.floor(filter.windowHours)));
  const mintedWithinDays = Math.max(1, Math.min(365, Math.floor(filter.mintedWithinDays)));
  const limit = Math.max(1, Math.min(60, Math.floor(filter.limit)));
  const now = filter.now ?? new Date();
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
        COUNT(*) FILTER (WHERE sold_at >= ${now}::timestamptz - (${windowHours} || ' hours')::interval)::int AS recent_sale_count,
        COALESCE(SUM(editions_sold) FILTER (WHERE sold_at >= ${now}::timestamptz - (${windowHours} || ' hours')::interval), 0)::int AS recent_editions_sold,
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
        OR ms.minted_at >= ${now}::timestamptz - (${mintedWithinDays} || ' days')::interval
      )
    ORDER BY ss.recent_sale_count DESC, ss.last_sale_at DESC
    LIMIT ${limit * 8}
  `);
  const sourceRows = (((rows as any).rows ?? rows) as RatRaceCandidateRow[]);
  const normalizedFilter = {
    ...filter,
    windowHours,
    mintedWithinDays,
    limit,
    now,
  };
  const localItems = rankRatRaceCandidates(sourceRows, normalizedFilter);
  if (localItems.length > 0) {
    return {
      items: localItems,
      diagnostics: buildDiagnostics(sourceRows, normalizedFilter, "local-index", {
        localCandidateRows: sourceRows.length,
        tz2atCandidateRows: 0,
        rankedItems: localItems.length,
      }),
    };
  }

  try {
    const tz2atRows = await loadTz2atAtprotoRatRaceRows(normalizedFilter);
    const tz2atItems = rankRatRaceCandidates(tz2atRows, normalizedFilter);
    return {
      items: tz2atItems,
      diagnostics: buildDiagnostics(tz2atRows, normalizedFilter, "tz2at-atproto", {
        localCandidateRows: sourceRows.length,
        tz2atCandidateRows: tz2atRows.length,
        rankedItems: tz2atItems.length,
      }),
    };
  } catch (err) {
    console.warn("[rat-race] tz2at AT Protocol fallback failed:", err);
    return {
      items: localItems,
      diagnostics: buildDiagnostics(sourceRows, normalizedFilter, sourceRows.length > 0 ? "local-index" : "none", {
        localCandidateRows: sourceRows.length,
        tz2atCandidateRows: 0,
        rankedItems: localItems.length,
      }),
    };
  }
}

export async function loadRatRaceHotTokens(options: Partial<RatRaceFilter> = {}) {
  const feed = await loadRatRaceHotTokenFeed(options);
  return feed.items;
}
