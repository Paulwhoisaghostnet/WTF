import { sql } from "drizzle-orm";

import { db } from "../../db";
import type { MarketPulse, MarketPulseMarketplace } from "@shared/tezos-intel";

let cachedPulse: { expiresAt: number; data: MarketPulse } | null = null;

export async function loadMarketPulse(windowDays = 30): Promise<MarketPulse> {
  const boundedWindow = Math.min(365, Math.max(1, windowDays));
  const now = Date.now();
  if (cachedPulse && cachedPulse.expiresAt > now && cachedPulse.data.windowDays === boundedWindow) {
    return cachedPulse.data;
  }

  const summaryRes = await db.execute(sql`
    SELECT
      COUNT(*)::int AS sale_count,
      COALESCE(SUM(price_mutez), 0)::text AS volume_mutez,
      COUNT(*) FILTER (WHERE is_primary = true)::int AS primary_sale_count,
      COUNT(*) FILTER (WHERE is_primary = false)::int AS secondary_sale_count
    FROM token_sales
    WHERE sold_at >= now() - (${boundedWindow} * interval '1 day')
  `);

  const listingsRes = await db.execute(sql`
    SELECT COUNT(*)::int AS active_listing_count
    FROM token_listings
    WHERE active = true
  `);

  const marketplaceRes = await db.execute(sql`
    SELECT
      COALESCE(marketplace, 'unknown') AS marketplace,
      COUNT(*)::int AS sale_count,
      COALESCE(SUM(price_mutez), 0)::text AS volume_mutez
    FROM token_sales
    WHERE sold_at >= now() - (${boundedWindow} * interval '1 day')
    GROUP BY COALESCE(marketplace, 'unknown')
    ORDER BY SUM(price_mutez) DESC NULLS LAST, COUNT(*) DESC
    LIMIT 8
  `);

  const summary = ((summaryRes as any)?.rows?.[0] ?? {}) as Record<string, unknown>;
  const listings = ((listingsRes as any)?.rows?.[0] ?? {}) as Record<string, unknown>;
  const topMarketplaces = (((marketplaceRes as any)?.rows ?? []) as Record<string, unknown>[]).map(
    (row): MarketPulseMarketplace => ({
      marketplace: String(row.marketplace ?? "unknown"),
      saleCount: Number(row.sale_count ?? 0),
      volumeMutez: Number(row.volume_mutez ?? 0),
    })
  );

  const data: MarketPulse = {
    windowDays: boundedWindow,
    saleCount: Number(summary.sale_count ?? 0),
    volumeMutez: Number(summary.volume_mutez ?? 0),
    primarySaleCount: Number(summary.primary_sale_count ?? 0),
    secondarySaleCount: Number(summary.secondary_sale_count ?? 0),
    activeListingCount: Number(listings.active_listing_count ?? 0),
    topMarketplaces,
    generatedAt: new Date().toISOString(),
  };

  cachedPulse = {
    expiresAt: now + 60_000,
    data,
  };
  return data;
}
