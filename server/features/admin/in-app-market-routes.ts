import type { Router } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requirePermission } from "../../auth/passport";
import { db } from "../../db";
import { inAppMarketItems, inAppMarketSales } from "@shared/schema";
import { formatWtf } from "@shared/types";
import { itemMetadataKind } from "../../lib/pet-ball-account-cap";
import {
  buildPricingBands,
  IN_APP_MARKET_PRICING_TIERS,
  listActiveMarketSales,
  normalizeDiscountPercent,
  normalizePriceScore,
  normalizeRarityTier,
  rebalanceInAppMarketPrices,
  selectBestSaleForItem,
  serializeSaleForItem,
  suggestPriceForItem,
  wholeWtfToRawUnits,
  WTF_RAW_UNITS_PER_WHOLE,
} from "../in-app-market/pricing";

const updateMarketItemPayload = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(800).nullable().optional(),
  category: z.string().trim().min(1).max(40).optional(),
  kind: z.string().trim().min(1).max(60).optional(),
  priceWtfWhole: z.coerce.number().int().min(0).max(25_000_000).optional(),
  priceExp: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  active: z.boolean().optional(),
  stockQuantity: z.coerce.number().int().min(0).max(999_999).optional(),
  rarityTier: z.coerce.number().int().min(1).max(6).optional(),
  priceScore: z.coerce.number().int().min(1).max(10).optional(),
  priceWtfLocked: z.boolean().optional(),
  priceScoreLocked: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(999_999).optional(),
  rebalance: z.boolean().optional(),
});

const createMarketItemPayload = z.object({
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(800).nullable().optional(),
  category: z.string().trim().min(1).max(40).default("desktop_fun"),
  kind: z.string().trim().min(1).max(60).default("item"),
  priceWtfWhole: z.coerce.number().int().min(0).max(25_000_000).optional(),
  priceExp: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  stockQuantity: z.coerce.number().int().min(0).max(999_999).default(0),
  active: z.boolean().default(false),
  rarityTier: z.coerce.number().int().min(1).max(6).default(1),
  priceScore: z.coerce.number().int().min(1).max(10).default(5),
  priceWtfLocked: z.boolean().optional(),
  priceScoreLocked: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const saleBasePayload = z.object({
  name: z.string().trim().min(1).max(120),
  active: z.boolean().default(true),
  discountPercent: z.coerce.number().int().min(0).max(99),
  category: z.string().trim().max(40).nullable().optional(),
  sku: z.string().trim().max(80).nullable().optional(),
  startsAt: z.string().trim().nullable().optional(),
  endsAt: z.string().trim().nullable().optional(),
});

const salePayload = saleBasePayload
  .refine((value) => Boolean(value.category || value.sku), {
    message: "Sale must target a category or SKU",
  });

const updateSalePayload = saleBasePayload.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "No supported fields to update" }
);

function serializeMarketItem(
  item: typeof inAppMarketItems.$inferSelect,
  options: {
    bands: ReturnType<typeof buildPricingBands>;
    activeSales: Array<typeof inAppMarketSales.$inferSelect>;
  }
) {
  const suggestedPriceWtfUnits = suggestPriceForItem(item, options.bands);
  const sale = selectBestSaleForItem(options.activeSales, item);
  const currentRaw = BigInt(String(item.priceWtfUnits));
  const suggestedRaw = BigInt(String(suggestedPriceWtfUnits));
  const driftRaw = suggestedRaw - currentRaw;
  return {
    id: item.id,
    sku: item.sku,
    name: item.name,
    description: item.description,
    category: item.category,
    kind: itemMetadataKind(item.metadata),
    priceWtfUnits: String(item.priceWtfUnits),
    priceWtfFormatted: formatWtf(String(item.priceWtfUnits)),
    priceExp: item.priceExp ?? 0,
    suggestedPriceWtfUnits,
    suggestedPriceWtfFormatted: formatWtf(suggestedPriceWtfUnits),
    pricingDriftWholeWtf: Number(driftRaw / WTF_RAW_UNITS_PER_WHOLE),
    rarityTier: item.rarityTier,
    rarityLabel:
      IN_APP_MARKET_PRICING_TIERS.find((tier) => tier.tier === item.rarityTier)?.label ??
      "Common",
    priceScore: item.priceScore,
    priceWtfLocked: item.priceWtfLocked,
    priceScoreLocked: item.priceScoreLocked,
    contractAddress: item.contractAddress,
    contractListingId: item.contractListingId,
    active: item.active,
    stockQuantity: item.stockQuantity ?? 0,
    metadata: item.metadata,
    sortOrder: item.sortOrder,
    sale: serializeSaleForItem(sale, item.priceWtfUnits),
    updatedAt: item.updatedAt,
  };
}

function serializeMarketSale(sale: typeof inAppMarketSales.$inferSelect) {
  return {
    id: sale.id,
    name: sale.name,
    active: sale.active,
    discountPercent: sale.discountPercent,
    category: sale.category,
    sku: sale.sku,
    startsAt: sale.startsAt,
    endsAt: sale.endsAt,
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
  };
}

function normalizeCategory(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "desktop_fun"
  );
}

function normalizeKind(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "item"
  );
}

function parseOptionalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function buildAdminMarketResponse() {
  const [rows, sales, activeSales] = await Promise.all([
    db
      .select()
      .from(inAppMarketItems)
      .orderBy(
        asc(inAppMarketItems.category),
        asc(inAppMarketItems.sortOrder),
        asc(inAppMarketItems.id)
      ),
    db.select().from(inAppMarketSales).orderBy(asc(inAppMarketSales.id)),
    listActiveMarketSales(),
  ]);
  const bands = buildPricingBands(rows);
  return {
    items: rows.map((item) => serializeMarketItem(item, { bands, activeSales })),
    sales: sales.map(serializeMarketSale),
    pricing: {
      unitRaw: WTF_RAW_UNITS_PER_WHOLE.toString(),
      tiers: bands.map((band) => ({
        tier: band.tier,
        key: band.key,
        label: band.label,
        curve: band.curve,
        minWtf: band.effectiveMinWtf,
        maxWtf: band.effectiveMaxWtf,
        anchorCount: band.anchorCount,
      })),
      activeSales: activeSales.map(serializeMarketSale),
    },
  };
}

export function registerAdminInAppMarketRoutes(router: Router) {
  router.get(
    "/api/admin/in-app-market/items",
    requirePermission("manage_rewards", "manage_settings"),
    async (_req, res) => {
      try {
        res.json(await buildAdminMarketResponse());
      } catch (err) {
        console.error("[admin/in-app-market] failed to fetch items:", err);
        res.status(500).json({ error: "Failed to fetch in-app market items" });
      }
    }
  );

  router.post(
    "/api/admin/in-app-market/items",
    requirePermission("manage_rewards", "manage_settings"),
    async (req, res) => {
      try {
        const parsed = createMarketItemPayload.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid market item" });
        }
        const data = parsed.data;
        const category = normalizeCategory(data.category);
        const kind = normalizeKind(data.kind);
        const priceProvided = data.priceWtfWhole !== undefined;
        const priceWtfLocked = data.priceWtfLocked ?? priceProvided;
        const existingRows = await db.select().from(inAppMarketItems);
        const draft = {
          id: 0,
          sku: data.sku,
          category,
          priceWtfUnits: priceProvided
            ? wholeWtfToRawUnits(data.priceWtfWhole)
            : "0",
          rarityTier: normalizeRarityTier(data.rarityTier),
          priceScore: normalizePriceScore(data.priceScore),
          priceWtfLocked,
          priceScoreLocked: data.priceScoreLocked,
          metadata: { ...(data.metadata ?? {}), kind },
        };
        const bands = buildPricingBands([...existingRows, draft]);
        const priceWtfUnits = priceProvided
          ? wholeWtfToRawUnits(data.priceWtfWhole)
          : suggestPriceForItem(draft, bands);
        const wholeWtf = Number(BigInt(priceWtfUnits) / WTF_RAW_UNITS_PER_WHOLE);
        const [maxSort] = await db
          .select({ max: sql<number>`COALESCE(MAX(${inAppMarketItems.sortOrder}), 0)::int` })
          .from(inAppMarketItems)
          .where(eq(inAppMarketItems.category, category));

        await db.insert(inAppMarketItems).values({
          sku: data.sku,
          name: data.name,
          description: data.description ?? null,
          category,
          priceWtfUnits,
          priceExp: data.priceExp ?? wholeWtf * 10,
          active: data.active,
          stockQuantity: data.stockQuantity,
          rarityTier: draft.rarityTier,
          priceScore: draft.priceScore,
          priceWtfLocked,
          priceScoreLocked: data.priceScoreLocked,
          metadata: draft.metadata,
          sortOrder: Number(maxSort?.max || 0) + 1,
          updatedAt: new Date(),
        });

        if (!priceWtfLocked) await rebalanceInAppMarketPrices();
        res.status(201).json(await buildAdminMarketResponse());
      } catch (err) {
        console.error("[admin/in-app-market] failed to create item:", err);
        res.status(500).json({ error: "Failed to create in-app market item" });
      }
    }
  );

  router.patch(
    "/api/admin/in-app-market/items/:id",
    requirePermission("manage_rewards", "manage_settings"),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: "Invalid item id" });
        }
        const parsed = updateMarketItemPayload.safeParse(req.body ?? {});
        if (!parsed.success) {
          return res.status(400).json({ error: "Invalid market item update" });
        }
        const updates: Partial<typeof inAppMarketItems.$inferInsert> = {
          updatedAt: new Date(),
        };
        if (parsed.data.name !== undefined) updates.name = parsed.data.name;
        if (parsed.data.description !== undefined) {
          updates.description = parsed.data.description || null;
        }
        if (parsed.data.category !== undefined) {
          updates.category = normalizeCategory(parsed.data.category);
        }
        if (parsed.data.priceWtfWhole !== undefined) {
          updates.priceWtfUnits = wholeWtfToRawUnits(parsed.data.priceWtfWhole);
        }
        if (parsed.data.priceExp !== undefined) updates.priceExp = parsed.data.priceExp;
        if (parsed.data.active !== undefined) updates.active = parsed.data.active;
        if (parsed.data.stockQuantity !== undefined) {
          updates.stockQuantity = parsed.data.stockQuantity;
        }
        if (parsed.data.rarityTier !== undefined) {
          updates.rarityTier = normalizeRarityTier(parsed.data.rarityTier);
        }
        if (parsed.data.priceScore !== undefined) {
          updates.priceScore = normalizePriceScore(parsed.data.priceScore);
        }
        if (parsed.data.priceWtfLocked !== undefined) {
          updates.priceWtfLocked = parsed.data.priceWtfLocked;
        }
        if (parsed.data.priceScoreLocked !== undefined) {
          updates.priceScoreLocked = parsed.data.priceScoreLocked;
        }
        if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;
        if (parsed.data.kind !== undefined) {
          const [item] = await db
            .select({ metadata: inAppMarketItems.metadata })
            .from(inAppMarketItems)
            .where(eq(inAppMarketItems.id, id))
            .limit(1);
          updates.metadata = {
            ...((item?.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
              ? item.metadata
              : {}) as Record<string, unknown>),
            kind: normalizeKind(parsed.data.kind),
          };
        }
        const changedKeys = Object.keys(updates).filter((key) => key !== "updatedAt");
        if (changedKeys.length === 0) {
          return res.status(400).json({ error: "No supported fields to update" });
        }

        const [updated] = await db
          .update(inAppMarketItems)
          .set(updates)
          .where(eq(inAppMarketItems.id, id))
          .returning();
        if (!updated) {
          return res.status(404).json({ error: "In-app market item not found" });
        }

        if (
          parsed.data.rebalance !== false &&
          changedKeys.some((key) =>
            ["priceWtfUnits", "rarityTier", "priceScore", "priceWtfLocked", "priceScoreLocked"].includes(key)
          )
        ) {
          await rebalanceInAppMarketPrices();
        }
        res.json(await buildAdminMarketResponse());
      } catch (err) {
        console.error("[admin/in-app-market] failed to update item:", err);
        res.status(500).json({ error: "Failed to update in-app market item" });
      }
    }
  );

  router.post(
    "/api/admin/in-app-market/reprice",
    requirePermission("manage_rewards", "manage_settings"),
    async (_req, res) => {
      try {
        const result = await rebalanceInAppMarketPrices();
        res.json({ ok: true, updated: result.updated, ...(await buildAdminMarketResponse()) });
      } catch (err) {
        console.error("[admin/in-app-market] failed to rebalance prices:", err);
        res.status(500).json({ error: "Failed to rebalance in-app market prices" });
      }
    }
  );

  router.post(
    "/api/admin/in-app-market/sales",
    requirePermission("manage_rewards", "manage_settings"),
    async (req, res) => {
      try {
        const parsed = salePayload.safeParse(req.body ?? {});
        if (!parsed.success) return res.status(400).json({ error: "Invalid market sale" });
        await db.insert(inAppMarketSales).values({
          name: parsed.data.name,
          active: parsed.data.active,
          discountPercent: normalizeDiscountPercent(parsed.data.discountPercent),
          category: parsed.data.category ? normalizeCategory(parsed.data.category) : null,
          sku: parsed.data.sku || null,
          startsAt: parseOptionalDate(parsed.data.startsAt),
          endsAt: parseOptionalDate(parsed.data.endsAt),
          updatedAt: new Date(),
        });
        res.status(201).json(await buildAdminMarketResponse());
      } catch (err) {
        console.error("[admin/in-app-market] failed to create sale:", err);
        res.status(500).json({ error: "Failed to create in-app market sale" });
      }
    }
  );

  router.patch(
    "/api/admin/in-app-market/sales/:id",
    requirePermission("manage_rewards", "manage_settings"),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: "Invalid sale id" });
        }
        const parsed = updateSalePayload.safeParse(req.body ?? {});
        if (!parsed.success) return res.status(400).json({ error: "Invalid market sale update" });
        const updates: Partial<typeof inAppMarketSales.$inferInsert> = { updatedAt: new Date() };
        if (parsed.data.name !== undefined) updates.name = parsed.data.name;
        if (parsed.data.active !== undefined) updates.active = parsed.data.active;
        if (parsed.data.discountPercent !== undefined) {
          updates.discountPercent = normalizeDiscountPercent(parsed.data.discountPercent);
        }
        if (parsed.data.category !== undefined) {
          updates.category = parsed.data.category ? normalizeCategory(parsed.data.category) : null;
        }
        if (parsed.data.sku !== undefined) updates.sku = parsed.data.sku || null;
        if (parsed.data.startsAt !== undefined) {
          updates.startsAt = parseOptionalDate(parsed.data.startsAt);
        }
        if (parsed.data.endsAt !== undefined) {
          updates.endsAt = parseOptionalDate(parsed.data.endsAt);
        }
        const [updated] = await db
          .update(inAppMarketSales)
          .set(updates)
          .where(eq(inAppMarketSales.id, id))
          .returning();
        if (!updated) return res.status(404).json({ error: "Market sale not found" });
        res.json(await buildAdminMarketResponse());
      } catch (err) {
        console.error("[admin/in-app-market] failed to update sale:", err);
        res.status(500).json({ error: "Failed to update in-app market sale" });
      }
    }
  );

  router.delete(
    "/api/admin/in-app-market/sales/:id",
    requirePermission("manage_rewards", "manage_settings"),
    async (req, res) => {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id) || id <= 0) {
          return res.status(400).json({ error: "Invalid sale id" });
        }
        await db.delete(inAppMarketSales).where(eq(inAppMarketSales.id, id));
        res.json(await buildAdminMarketResponse());
      } catch (err) {
        console.error("[admin/in-app-market] failed to delete sale:", err);
        res.status(500).json({ error: "Failed to delete in-app market sale" });
      }
    }
  );
}
