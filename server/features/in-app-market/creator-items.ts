import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { hasPermission } from "../../lib/permissions";
import { inAppMarketItems } from "@shared/schema";
import { formatWtf, type UserRole } from "@shared/types";
import { itemMetadataKind } from "../../lib/pet-ball-account-cap";

const CREATOR_MARKET_CATEGORIES = new Set([
  "desktop_fun",
  "desktop_pet",
  "system_appearance",
  "tv",
  "studio",
  "preservation",
]);

export type TrustedCreatorMarketUser = {
  id: number;
  username: string;
  role: UserRole | string | null;
};

export type TrustedCreatorMarketItemInput = {
  sku?: string;
  name?: string;
  description?: string;
  category?: string;
  kind?: string;
  priceExp?: number;
  stockQuantity?: number;
  metadata?: Record<string, unknown>;
};

export function serializeInAppMarketItem(item: typeof inAppMarketItems.$inferSelect) {
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
    contractAddress: item.contractAddress,
    contractListingId: item.contractListingId,
    active: item.active,
    stockQuantity: item.stockQuantity ?? 0,
    metadata: item.metadata,
    sortOrder: item.sortOrder,
    updatedAt: item.updatedAt,
  };
}

export async function createTrustedCreatorMarketItem(
  user: TrustedCreatorMarketUser,
  input: TrustedCreatorMarketItemInput
) {
  if (!(await hasPermission(String(user.role || "witness") as UserRole, "trusted_market_creator"))) {
    throw new Error("Trusted market creator permission required");
  }

  const name = normalizeMarketItemName(input.name);
  const category = normalizeMarketCategory(input.category);
  const sku = await nextCreatorMarketSku(user.id, input.sku || name);
  const priceExp = normalizePriceExp(input.priceExp);
  const stockQuantity = normalizeStockQuantity(input.stockQuantity);
  const kind = normalizeMarketKind(input.kind);
  const metadata = normalizeMetadata(input.metadata);
  const [maxSort] = await db
    .select({ max: sql<number>`COALESCE(MAX(${inAppMarketItems.sortOrder}), 0)::int` })
    .from(inAppMarketItems)
    .where(eq(inAppMarketItems.category, category));
  const sortOrder = Number(maxSort?.max || 0) + 1;

  const [item] = await db
    .insert(inAppMarketItems)
    .values({
      sku,
      name,
      description: normalizeMarketDescription(input.description),
      category,
      priceWtfUnits: "0",
      priceExp,
      active: true,
      stockQuantity,
      contractAddress: null,
      contractListingId: null,
      sortOrder,
      metadata: {
        ...metadata,
        kind,
        source: "trusted_creator",
        creatorUserId: user.id,
        creatorUsername: user.username,
        currency: "exp",
      },
      updatedAt: new Date(),
    })
    .returning();

  return serializeInAppMarketItem(item);
}

async function nextCreatorMarketSku(userId: number, value: string): Promise<string> {
  const base = `creator-${userId}-${slugifyMarketSku(value)}`;
  for (let i = 0; i < 100; i += 1) {
    const sku = i === 0 ? base : `${base}-${i + 1}`;
    const [existing] = await db
      .select({ id: inAppMarketItems.id })
      .from(inAppMarketItems)
      .where(eq(inAppMarketItems.sku, sku))
      .limit(1);
    if (!existing) return sku;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 80);
}

function slugifyMarketSku(value: string): string {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "item"
  );
}

function normalizeMarketItemName(value: unknown): string {
  const name = String(value || "").trim().slice(0, 120);
  if (!name) throw new Error("Market item name is required");
  return name;
}

function normalizeMarketDescription(value: unknown): string | null {
  const description = String(value || "").trim().slice(0, 800);
  return description || null;
}

function normalizeMarketCategory(value: unknown): string {
  const category = String(value || "desktop_fun")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .slice(0, 40);
  return CREATOR_MARKET_CATEGORIES.has(category) ? category : "desktop_fun";
}

function normalizeMarketKind(value: unknown): string {
  return (
    String(value || "creator-item")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "creator-item"
  );
}

function normalizePriceExp(value: unknown): number {
  const price = Math.floor(Number(value ?? 100));
  if (!Number.isFinite(price) || price <= 0) return 100;
  return Math.min(price, 1_000_000);
}

function normalizeStockQuantity(value: unknown): number {
  const stock = Math.floor(Number(value ?? 25));
  if (!Number.isFinite(stock) || stock <= 0) return 25;
  return Math.min(stock, 999_999);
}

function normalizeMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([key, entry]) =>
        key.length <= 80 &&
        (entry === null ||
          typeof entry === "string" ||
          typeof entry === "number" ||
          typeof entry === "boolean")
    )
  );
}
