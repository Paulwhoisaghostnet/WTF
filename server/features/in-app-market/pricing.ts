import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db";
import { inAppMarketItems, inAppMarketSales } from "@shared/schema";
import { formatWtf } from "@shared/types";

export const WTF_RAW_UNITS_PER_WHOLE = 100_000_000n;

export type PricingCurve = "linear" | "log";

export type PricingTier = {
  tier: number;
  key: string;
  label: string;
  minWtf: number;
  maxWtf: number;
  curve: PricingCurve;
};

export const IN_APP_MARKET_PRICING_TIERS: PricingTier[] = [
  { tier: 1, key: "common", label: "Common", minWtf: 1, maxWtf: 99, curve: "linear" },
  { tier: 2, key: "uncommon", label: "Uncommon", minWtf: 100, maxWtf: 499, curve: "linear" },
  { tier: 3, key: "rare", label: "Rare", minWtf: 500, maxWtf: 1_999, curve: "linear" },
  { tier: 4, key: "epic", label: "Epic", minWtf: 2_000, maxWtf: 9_999, curve: "log" },
  { tier: 5, key: "legendary", label: "Legendary", minWtf: 10_000, maxWtf: 49_999, curve: "log" },
  { tier: 6, key: "mythic", label: "Mythic", minWtf: 50_000, maxWtf: 250_000, curve: "log" },
];

export type MarketPricingRow = Pick<
  typeof inAppMarketItems.$inferSelect,
  | "id"
  | "sku"
  | "category"
  | "priceWtfUnits"
  | "rarityTier"
  | "priceScore"
  | "priceWtfLocked"
  | "priceScoreLocked"
  | "metadata"
>;

export type PricingBand = PricingTier & {
  effectiveMinWtf: number;
  effectiveMaxWtf: number;
  anchorCount: number;
};

export type ActiveMarketSale = typeof inAppMarketSales.$inferSelect;

export function normalizeRarityTier(value: unknown): number {
  const tier = Math.floor(Number(value ?? 1));
  if (!Number.isFinite(tier)) return 1;
  return Math.max(1, Math.min(6, tier));
}

export function normalizePriceScore(value: unknown): number {
  const score = Math.floor(Number(value ?? 5));
  if (!Number.isFinite(score)) return 5;
  return Math.max(1, Math.min(10, score));
}

export function normalizeDiscountPercent(value: unknown): number {
  const percent = Math.floor(Number(value ?? 0));
  if (!Number.isFinite(percent)) return 0;
  return Math.max(0, Math.min(99, percent));
}

export function wholeWtfToRawUnits(value: unknown): string {
  const whole = Math.floor(Number(value ?? 0));
  if (!Number.isFinite(whole) || whole < 0) return "0";
  return (BigInt(whole) * WTF_RAW_UNITS_PER_WHOLE).toString();
}

export function rawUnitsToWholeWtf(value: unknown): number {
  const raw = parseRawUnits(value);
  return Number(raw / WTF_RAW_UNITS_PER_WHOLE);
}

export function ceilRawUnitsToWholeWtf(raw: bigint): bigint {
  if (raw <= 0n) return 0n;
  return ((raw + WTF_RAW_UNITS_PER_WHOLE - 1n) / WTF_RAW_UNITS_PER_WHOLE) * WTF_RAW_UNITS_PER_WHOLE;
}

export function applyDiscountToRawUnits(raw: bigint, discountPercent: number): bigint {
  const percent = BigInt(normalizeDiscountPercent(discountPercent));
  if (raw <= 0n || percent <= 0n) return raw;
  const keptPercent = 100n - percent;
  return (raw * keptPercent + 99n) / 100n;
}

export function tierForRarity(value: unknown): PricingTier {
  const tier = normalizeRarityTier(value);
  return IN_APP_MARKET_PRICING_TIERS.find((entry) => entry.tier === tier) ?? IN_APP_MARKET_PRICING_TIERS[0];
}

export function isUserCreatedMarketItem(row: Pick<MarketPricingRow, "metadata">): boolean {
  const metadata = row.metadata;
  return Boolean(
    metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      (metadata as Record<string, unknown>).source === "trusted_creator"
  );
}

export function buildPricingBands(rows: MarketPricingRow[]): PricingBand[] {
  const bands = IN_APP_MARKET_PRICING_TIERS.map((tier) => {
    const anchors = rows.filter(
      (row) =>
        !isUserCreatedMarketItem(row) &&
        normalizeRarityTier(row.rarityTier) === tier.tier &&
        row.priceWtfLocked &&
        parseRawUnits(row.priceWtfUnits) > 0n
    );
    const band = buildPricingBand(tier, anchors);
    return band;
  });

  let previousMax = 0;
  return bands.map((band) => {
    let min = Math.max(1, Math.round(band.effectiveMinWtf));
    let max = Math.max(min, Math.round(band.effectiveMaxWtf));
    if (min <= previousMax) {
      const shift = previousMax + 1 - min;
      min += shift;
      max += shift;
    }
    previousMax = max;
    return { ...band, effectiveMinWtf: min, effectiveMaxWtf: max };
  });
}

export function suggestPriceForItem(
  item: Pick<MarketPricingRow, "rarityTier" | "priceScore" | "priceWtfUnits" | "priceWtfLocked" | "metadata">,
  bands: PricingBand[]
): string {
  if (isUserCreatedMarketItem(item)) return String(item.priceWtfUnits ?? "0");
  if (item.priceWtfLocked) return ceilRawUnitsToWholeWtf(parseRawUnits(item.priceWtfUnits)).toString();
  const band = bands.find((entry) => entry.tier === normalizeRarityTier(item.rarityTier)) ?? bands[0];
  return wholeWtfToRawUnits(priceWtfForScore(band, normalizePriceScore(item.priceScore)));
}

export function scoreForPriceInBand(band: PricingBand, priceWtf: number): number {
  const min = band.effectiveMinWtf;
  const max = Math.max(min + 1, band.effectiveMaxWtf);
  const price = Math.max(min, Math.min(max, priceWtf));
  let t = 0;
  if (band.curve === "log") {
    t = (Math.log(price) - Math.log(min)) / (Math.log(max) - Math.log(min));
  } else {
    t = (price - min) / (max - min);
  }
  return normalizePriceScore(Math.round(1 + t * 9));
}

export function priceWtfForScore(band: PricingBand, score: number): number {
  const normalizedScore = normalizePriceScore(score);
  const t = (normalizedScore - 1) / 9;
  const min = band.effectiveMinWtf;
  const max = Math.max(min, band.effectiveMaxWtf);
  if (min === max) return min;
  const value =
    band.curve === "log"
      ? Math.exp(Math.log(min) + t * (Math.log(max) - Math.log(min)))
      : min + t * (max - min);
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function selectBestSaleForItem(
  sales: ActiveMarketSale[],
  item: Pick<typeof inAppMarketItems.$inferSelect, "sku" | "category">
): ActiveMarketSale | null {
  const matches = sales.filter(
    (sale) =>
      (sale.sku && sale.sku === item.sku) ||
      (!sale.sku && sale.category && sale.category === item.category)
  );
  if (matches.length === 0) return null;
  return matches.sort(
    (a, b) =>
      normalizeDiscountPercent(b.discountPercent) - normalizeDiscountPercent(a.discountPercent) ||
      (b.sku ? 1 : 0) - (a.sku ? 1 : 0) ||
      b.id - a.id
  )[0];
}

export function serializeSaleForItem(
  sale: ActiveMarketSale | null,
  basePriceWtfUnits: unknown
) {
  if (!sale) return null;
  const discountPercent = normalizeDiscountPercent(sale.discountPercent);
  const saleUnitRaw = ceilRawUnitsToWholeWtf(
    applyDiscountToRawUnits(parseRawUnits(basePriceWtfUnits), discountPercent)
  );
  return {
    id: sale.id,
    name: sale.name,
    discountPercent,
    category: sale.category,
    sku: sale.sku,
    salePriceWtfUnits: saleUnitRaw.toString(),
    salePriceWtfFormatted: formatWtf(saleUnitRaw.toString()),
  };
}

export async function listActiveMarketSales(now = new Date()): Promise<ActiveMarketSale[]> {
  return db
    .select()
    .from(inAppMarketSales)
    .where(
      and(
        eq(inAppMarketSales.active, true),
        or(isNull(inAppMarketSales.startsAt), sql`${inAppMarketSales.startsAt} <= ${now}`),
        or(isNull(inAppMarketSales.endsAt), sql`${inAppMarketSales.endsAt} > ${now}`)
      )
    )
    .orderBy(asc(inAppMarketSales.id));
}

export async function rebalanceInAppMarketPrices(): Promise<{
  updated: number;
  bands: PricingBand[];
}> {
  const rows = await db.select().from(inAppMarketItems).orderBy(asc(inAppMarketItems.id));
  const bands = buildPricingBands(rows);
  let updated = 0;
  const now = new Date();

  for (const row of rows) {
    if (isUserCreatedMarketItem(row)) continue;
    const band = bands.find((entry) => entry.tier === normalizeRarityTier(row.rarityTier)) ?? bands[0];
    const updates: Partial<typeof inAppMarketItems.$inferInsert> = { updatedAt: now };
    if (row.priceWtfLocked) {
      if (!row.priceScoreLocked) {
        updates.priceScore = scoreForPriceInBand(
          band,
          rawUnitsToWholeWtf(row.priceWtfUnits)
        );
      }
    } else {
      updates.priceWtfUnits = suggestPriceForItem(row, bands);
    }

    if (updates.priceWtfUnits !== undefined || updates.priceScore !== undefined) {
      await db.update(inAppMarketItems).set(updates).where(eq(inAppMarketItems.id, row.id));
      updated += 1;
    }
  }

  return { updated, bands };
}

function buildPricingBand(tier: PricingTier, anchors: MarketPricingRow[]): PricingBand {
  if (anchors.length === 0) {
    return {
      ...tier,
      effectiveMinWtf: tier.minWtf,
      effectiveMaxWtf: tier.maxWtf,
      anchorCount: 0,
    };
  }

  const baselinePrices = anchors.map((row) =>
    baselinePriceForTier(tier, normalizePriceScore(row.priceScore))
  );
  const anchorPrices = anchors.map((row) => rawUnitsToWholeWtf(row.priceWtfUnits));

  if (tier.curve === "log") {
    const logRatios = anchorPrices.map((price, index) => {
      const baseline = Math.max(1, baselinePrices[index]);
      return Math.log(Math.max(0.05, price / baseline));
    });
    const dampedScale = Math.exp((average(logRatios) || 0) * 0.65);
    return {
      ...tier,
      effectiveMinWtf: Math.max(1, Math.round(tier.minWtf * dampedScale)),
      effectiveMaxWtf: Math.max(1, Math.round(tier.maxWtf * dampedScale)),
      anchorCount: anchors.length,
    };
  }

  const shift = average(anchorPrices.map((price, index) => price - baselinePrices[index]));
  const anchorMin = Math.min(...anchorPrices);
  const anchorMax = Math.max(...anchorPrices);
  const positiveShift = Math.max(0, shift);
  return {
    ...tier,
    effectiveMinWtf: Math.max(1, Math.round(Math.min(tier.minWtf + positiveShift, anchorMin))),
    effectiveMaxWtf: Math.max(1, Math.round(Math.max(tier.maxWtf + positiveShift, anchorMax))),
    anchorCount: anchors.length,
  };
}

function baselinePriceForTier(tier: PricingTier, score: number): number {
  const band: PricingBand = {
    ...tier,
    effectiveMinWtf: tier.minWtf,
    effectiveMaxWtf: tier.maxWtf,
    anchorCount: 0,
  };
  return priceWtfForScore(band, score);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function parseRawUnits(value: unknown): bigint {
  const raw = String(value ?? "0").trim();
  if (!/^[0-9]+$/.test(raw)) return 0n;
  return BigInt(raw);
}
