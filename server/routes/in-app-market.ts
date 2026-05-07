import { randomUUID } from "crypto";
import { Router } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { isAuthenticated } from "../auth/passport";
import { db } from "../db";
import {
  inAppInventoryItems,
  inAppMarketItems,
  inAppMarketPaymentIntents,
  inAppMarketPurchases,
  users,
  xpEvents,
} from "@shared/schema";
import { formatWtf } from "@shared/types";
import {
  getInAppMarketConfig,
  runInAppMarketSync,
  verifyAndGrantInAppMarketPurchaseByHash,
} from "../lib/in-app-market-sync";
import {
  isPetBallItem,
  itemMetadataKind,
  lockPetBallAccountCap,
  petBallAccountCapDecision,
} from "../lib/pet-ball-account-cap";
import { createTrustedCreatorMarketItem } from "../features/in-app-market/creator-items";

const router = Router();
const CART_ROUTER_LISTING_ID = 0;
const WTF_CART_ESTIMATED_FEE_MUTEZ = 70_000;
const INTENT_TTL_MS = 30 * 60_000;
const TEZOS_ADDRESS_RE = /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;

const verifyPayload = z.object({
  opHash: z.string().trim().min(30).max(80),
});

const cartLinePayload = z.object({
  sku: z.string().trim().min(1).max(80),
  quantity: z.coerce.number().int().min(1).max(99),
});

const intentPayload = z.object({
  currency: z.enum(["wtf", "exp"]),
  walletAddress: z.string().trim().max(40).optional().nullable(),
  items: z.array(cartLinePayload).min(1).max(20),
});

const checkoutExpPayload = z.object({
  purchaseRef: z.string().trim().min(8).max(128),
});

const usePayload = z.object({
  sku: z.string().trim().min(1).max(80),
});

const creatorItemPayload = z.object({
  sku: z.string().trim().max(80).optional(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(800).optional(),
  category: z.string().trim().max(40).default("desktop_fun"),
  kind: z.string().trim().max(60).default("creator-item"),
  priceExp: z.coerce.number().int().min(1).max(1_000_000).default(100),
  stockQuantity: z.coerce.number().int().min(1).max(999_999).default(25),
  metadata: z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
    .default({}),
});

function formatMutez(mutez: number): string {
  return (mutez / 1_000_000)
    .toFixed(6)
    .replace(/0+$/, "")
    .replace(/\.$/, "");
}

function makePurchaseRef(userId: number): string {
  return `cart:${userId}:${Date.now().toString(36)}:${randomUUID().slice(0, 8)}`;
}

function normalizeWalletAddress(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return TEZOS_ADDRESS_RE.test(trimmed) ? trimmed : null;
}

function compactCartLines(
  items: Array<z.infer<typeof cartLinePayload>>
): Array<{ sku: string; quantity: number }> {
  const bySku = new Map<string, number>();
  for (const item of items) {
    bySku.set(item.sku, (bySku.get(item.sku) ?? 0) + item.quantity);
  }
  return Array.from(bySku, ([sku, quantity]) => ({
    sku,
    quantity: Math.min(quantity, 99),
  }));
}

async function buildCartIntentLines(
  currency: "wtf" | "exp",
  cartItems: Array<{ sku: string; quantity: number }>
): Promise<{
  ok: true;
  lines: Array<{
    sku: string;
    name: string;
    kind: string | null;
    quantity: number;
    unitWtfUnits: string;
    unitWtfFormatted: string;
    unitExp: number;
    lineWtfUnits: string;
    lineWtfFormatted: string;
    lineExp: number;
  }>;
  subtotalWtfUnits: string;
  subtotalWtfFormatted: string;
  subtotalExp: number;
} | {
  ok: false;
  reason: "missing_item" | "unsupported_currency" | "invalid_total" | "out_of_stock";
}> {
  const skus = cartItems.map((item) => item.sku);
  const rows = await db
    .select()
    .from(inAppMarketItems)
    .where(and(eq(inAppMarketItems.active, true), inArray(inAppMarketItems.sku, skus)));
  const bySku = new Map(rows.map((row) => [row.sku, row]));
  let subtotalWtf = 0n;
  let subtotalExp = 0;

  const lines = [];
  for (const cartItem of cartItems) {
    const item = bySku.get(cartItem.sku);
    if (!item) return { ok: false, reason: "missing_item" };
    if (Number(item.stockQuantity ?? 0) < cartItem.quantity) {
      return { ok: false, reason: "out_of_stock" };
    }

    const unitWtf = BigInt(String(item.priceWtfUnits));
    const unitExp = Number(item.priceExp ?? 0);
    if ((currency === "wtf" && unitWtf <= 0n) || (currency === "exp" && unitExp <= 0)) {
      return { ok: false, reason: "unsupported_currency" };
    }

    const lineWtf = unitWtf * BigInt(cartItem.quantity);
    const lineExp = unitExp * cartItem.quantity;
    subtotalWtf += lineWtf;
    subtotalExp += lineExp;
    lines.push({
      sku: item.sku,
      name: item.name,
      kind: itemMetadataKind(item.metadata),
      quantity: cartItem.quantity,
      unitWtfUnits: unitWtf.toString(),
      unitWtfFormatted: formatWtf(unitWtf.toString()),
      unitExp,
      lineWtfUnits: lineWtf.toString(),
      lineWtfFormatted: formatWtf(lineWtf.toString()),
      lineExp,
    });
  }

  if (currency === "wtf" && subtotalWtf <= 0n) return { ok: false, reason: "invalid_total" };
  if (currency === "exp" && subtotalExp <= 0) return { ok: false, reason: "invalid_total" };

  return {
    ok: true,
    lines,
    subtotalWtfUnits: subtotalWtf.toString(),
    subtotalWtfFormatted: formatWtf(subtotalWtf.toString()),
    subtotalExp,
  };
}

async function enforcePetBallAccountCap(
  queryDb: typeof db,
  userId: number,
  lines: Array<{ sku: string; kind?: string | null; quantity: number }>,
  options: { lock?: boolean } = {}
): Promise<{ ok: true } | { ok: false; owned: number; requested: number; limit: number }> {
  const itemRows = await queryDb.select().from(inAppMarketItems);
  const ballSkus = new Set(
    itemRows
      .filter((item) => isPetBallItem(item.sku, itemMetadataKind(item.metadata)))
      .map((item) => item.sku)
  );
  ballSkus.add("pet-ball");
  const requested = lines
    .filter((line) => isPetBallItem(line.sku, line.kind ?? null) || ballSkus.has(line.sku))
    .reduce((sum, line) => sum + line.quantity, 0);
  if (requested <= 0) return { ok: true };
  if (options.lock) await lockPetBallAccountCap(queryDb, userId);

  const inventory = await queryDb
    .select({
      sku: inAppInventoryItems.sku,
      quantity: inAppInventoryItems.quantity,
    })
    .from(inAppInventoryItems)
    .where(eq(inAppInventoryItems.userId, userId));
  const owned = inventory.reduce(
    (sum, item) => sum + (ballSkus.has(item.sku) ? item.quantity : 0),
    0
  );
  const decision = petBallAccountCapDecision(owned, requested);
  return decision.ok
    ? { ok: true }
    : { ok: false, owned: decision.owned, requested: decision.requested, limit: decision.limit };
}

async function reserveMarketStock(
  queryDb: typeof db,
  lines: Array<{ sku: string; quantity: number }>,
  now: Date
): Promise<boolean> {
  for (const line of lines) {
    if (!line.sku || !Number.isInteger(line.quantity) || line.quantity <= 0) {
      continue;
    }
    const [updated] = await queryDb
      .update(inAppMarketItems)
      .set({
        stockQuantity: sql`${inAppMarketItems.stockQuantity} - ${line.quantity}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(inAppMarketItems.sku, line.sku),
          eq(inAppMarketItems.active, true),
          sql`${inAppMarketItems.stockQuantity} >= ${line.quantity}`
        )
      )
      .returning({ id: inAppMarketItems.id });
    if (!updated) return false;
  }
  return true;
}

function serializeIntent(intent: typeof inAppMarketPaymentIntents.$inferSelect) {
  return {
    id: intent.id,
    purchaseRef: intent.purchaseRef,
    currency: intent.currency,
    status: intent.status,
    walletAddress: intent.walletAddress,
    items: intent.items,
    subtotalWtfUnits: String(intent.subtotalWtfUnits),
    subtotalWtfFormatted: formatWtf(String(intent.subtotalWtfUnits)),
    subtotalExp: intent.subtotalExp,
    estimatedFeeMutez: intent.estimatedFeeMutez,
    estimatedFeeTez: formatMutez(intent.estimatedFeeMutez),
    contractAddress: intent.contractAddress,
    routerListingId: intent.routerListingId,
    expiresAt: intent.expiresAt,
  };
}

router.post("/api/in-app-market/creator-items", isAuthenticated, async (req, res) => {
  try {
    const parsed = creatorItemPayload.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid creator item" });
    }
    const user = req.user as any;
    const item = await createTrustedCreatorMarketItem(
      {
        id: Number(user.id),
        username: String(user.username || `user-${user.id}`),
        role: user.role ?? null,
      },
      parsed.data
    );
    res.status(201).json({ ok: true, item });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create creator item";
    if (/trusted market creator/i.test(message)) {
      return res.status(403).json({ error: message });
    }
    console.error("POST /api/in-app-market/creator-items error:", err);
    res.status(/required|invalid/i.test(message) ? 400 : 500).json({ error: message });
  }
});

router.get("/api/in-app-market", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const category = String(req.query.category || "desktop_pet").slice(0, 40);
    const config = getInAppMarketConfig();

    const [items, inventory, purchases] = await Promise.all([
      db
        .select()
        .from(inAppMarketItems)
        .where(and(eq(inAppMarketItems.category, category), eq(inAppMarketItems.active, true)))
        .orderBy(asc(inAppMarketItems.sortOrder), asc(inAppMarketItems.id)),
      db
        .select()
        .from(inAppInventoryItems)
        .where(eq(inAppInventoryItems.userId, user.id)),
      db
        .select()
        .from(inAppMarketPurchases)
        .where(eq(inAppMarketPurchases.userId, user.id))
        .orderBy(desc(inAppMarketPurchases.createdAt))
        .limit(12),
    ]);

    const inventoryBySku = new Map(inventory.map((row) => [row.sku, row]));
    res.json({
      config,
      balances: {
        exp: Number(user.experiencePoints ?? 0),
      },
      items: items.map((item) => ({
        id: item.id,
        sku: item.sku,
        name: item.name,
        description: item.description,
        category: item.category,
        kind: itemMetadataKind(item.metadata),
        priceWtfUnits: String(item.priceWtfUnits),
        priceWtfFormatted: formatWtf(String(item.priceWtfUnits)),
        priceExp: item.priceExp ?? 0,
        contractAddress: item.contractAddress ?? config.contractAddress,
        contractListingId: item.contractListingId,
        metadata: item.metadata,
        stockQuantity: item.stockQuantity ?? 0,
        quantityOwned: inventoryBySku.get(item.sku)?.quantity ?? 0,
      })),
      inventory: inventory.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        metadata: item.metadata,
        updatedAt: item.updatedAt,
      })),
      purchases: purchases.map((purchase) => ({
        id: purchase.id,
        sku: purchase.sku,
        quantity: purchase.quantity,
        currency: purchase.currency,
        amountWtfUnits: String(purchase.amountWtfUnits),
        amountExp: purchase.amountExp,
        opHash: purchase.opHash,
        walletAddress: purchase.walletAddress,
        contractListingId: purchase.contractListingId,
        purchaseRef: purchase.purchaseRef,
        observedAt: purchase.observedAt,
        createdAt: purchase.createdAt,
      })),
    });
  } catch (err) {
    console.error("GET /api/in-app-market error:", err);
    res.status(500).json({ error: "Failed to fetch in-app market" });
  }
});

router.post("/api/in-app-market/intents", isAuthenticated, async (req, res) => {
  try {
    const parsed = intentPayload.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid cart" });
    }
    const user = req.user as any;
    const config = getInAppMarketConfig();
    if (parsed.data.currency === "wtf" && !config.configured) {
      return res.status(503).json({ error: "In-app market contract is not configured" });
    }

    const cartItems = compactCartLines(parsed.data.items);
    const totalTickets = cartItems.reduce((sum, item) => sum + item.quantity, 0);
    if (totalTickets <= 0 || totalTickets > 99) {
      return res.status(400).json({ error: "Cart has too many tickets" });
    }

    const built = await buildCartIntentLines(parsed.data.currency, cartItems);
    if (!built.ok) {
      return res.status(409).json({
        error:
          built.reason === "unsupported_currency"
            ? "One or more items cannot be bought with that currency"
            : built.reason === "out_of_stock"
              ? "One or more items are out of stock"
            : "One or more cart items are unavailable",
        reason: built.reason,
      });
    }
    const cap = await enforcePetBallAccountCap(db, user.id, built.lines);
    if (!cap.ok) {
      return res.status(409).json({
        error: "Pet ball limit is 3 per user",
        reason: "pet_ball_limit",
        limit: cap.limit,
        owned: cap.owned,
        requested: cap.requested,
      });
    }

    const walletAddress = normalizeWalletAddress(parsed.data.walletAddress);
    const [intent] = await db
      .insert(inAppMarketPaymentIntents)
      .values({
        userId: user.id,
        purchaseRef: makePurchaseRef(user.id),
        currency: parsed.data.currency,
        status: "pending",
        walletAddress,
        items: built.lines as any,
        subtotalWtfUnits:
          parsed.data.currency === "wtf" ? built.subtotalWtfUnits : "0",
        subtotalExp: parsed.data.currency === "exp" ? built.subtotalExp : 0,
        estimatedFeeMutez:
          parsed.data.currency === "wtf" ? WTF_CART_ESTIMATED_FEE_MUTEZ : 0,
        contractAddress: parsed.data.currency === "wtf" ? config.contractAddress : null,
        routerListingId: CART_ROUTER_LISTING_ID,
        expiresAt: new Date(Date.now() + INTENT_TTL_MS),
        updatedAt: new Date(),
      })
      .returning();

    res.json({
      ok: true,
      intent: serializeIntent(intent),
      totals: {
        subtotalWtfUnits: built.subtotalWtfUnits,
        subtotalWtfFormatted: built.subtotalWtfFormatted,
        subtotalExp: built.subtotalExp,
        estimatedFeeMutez:
          parsed.data.currency === "wtf" ? WTF_CART_ESTIMATED_FEE_MUTEZ : 0,
        estimatedFeeTez:
          parsed.data.currency === "wtf"
            ? formatMutez(WTF_CART_ESTIMATED_FEE_MUTEZ)
            : "0",
      },
    });
  } catch (err) {
    console.error("POST /api/in-app-market/intents error:", err);
    res.status(500).json({ error: "Failed to create market checkout" });
  }
});

router.post("/api/in-app-market/checkout-exp", isAuthenticated, async (req, res) => {
  try {
    const parsed = checkoutExpPayload.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid checkout reference" });
    }
    const user = req.user as any;
    const result = await db.transaction(async (tx) => {
      const now = new Date();
      const [intent] = await tx
        .update(inAppMarketPaymentIntents)
        .set({ status: "processing", updatedAt: now })
        .where(
          and(
            eq(inAppMarketPaymentIntents.userId, user.id),
            eq(inAppMarketPaymentIntents.purchaseRef, parsed.data.purchaseRef),
            eq(inAppMarketPaymentIntents.currency, "exp"),
            eq(inAppMarketPaymentIntents.status, "pending")
          )
        )
        .returning();

      if (!intent || intent.expiresAt < now) {
        return { ok: false as const, reason: "intent_unavailable" as const };
      }

      const subtotalExp = Number(intent.subtotalExp ?? 0);
      const lines = Array.isArray(intent.items) ? intent.items : [];
      if (subtotalExp <= 0 || lines.length === 0) {
        return { ok: false as const, reason: "invalid_total" as const };
      }
      const cap = await enforcePetBallAccountCap(
        tx as unknown as typeof db,
        user.id,
        lines.map((line) => ({
          sku: typeof (line as Record<string, unknown>).sku === "string"
            ? String((line as Record<string, unknown>).sku)
            : "",
          kind: typeof (line as Record<string, unknown>).kind === "string"
            ? String((line as Record<string, unknown>).kind)
            : null,
          quantity: Number((line as Record<string, unknown>).quantity ?? 0),
        })),
        { lock: true }
      );
      if (!cap.ok) {
        await tx
          .update(inAppMarketPaymentIntents)
          .set({ status: "pending", updatedAt: now })
          .where(eq(inAppMarketPaymentIntents.id, intent.id));
        return { ok: false as const, reason: "pet_ball_limit" as const };
      }

      const stockReserved = await reserveMarketStock(
        tx as unknown as typeof db,
        lines.map((line) => ({
          sku: typeof (line as Record<string, unknown>).sku === "string"
            ? String((line as Record<string, unknown>).sku)
            : "",
          quantity: Number((line as Record<string, unknown>).quantity ?? 0),
        })),
        now
      );
      if (!stockReserved) {
        await tx
          .update(inAppMarketPaymentIntents)
          .set({ status: "pending", updatedAt: now })
          .where(eq(inAppMarketPaymentIntents.id, intent.id));
        return { ok: false as const, reason: "out_of_stock" as const };
      }

      const [updatedUser] = await tx
        .update(users)
        .set({
          experiencePoints: sql`${users.experiencePoints} - ${subtotalExp}`,
          updatedAt: now,
        })
        .where(and(eq(users.id, user.id), sql`${users.experiencePoints} >= ${subtotalExp}`))
        .returning({ experiencePoints: users.experiencePoints });

      if (!updatedUser) {
        await tx
          .update(inAppMarketPaymentIntents)
          .set({ status: "pending", updatedAt: now })
          .where(eq(inAppMarketPaymentIntents.id, intent.id));
        return { ok: false as const, reason: "insufficient_exp" as const };
      }

      await tx.insert(xpEvents).values({
        userId: user.id,
        amount: -subtotalExp,
        reason: "in_app_market_purchase",
        metadata: {
          purchaseRef: intent.purchaseRef,
          items: lines,
        },
      });

      const purchaseIds: number[] = [];
      for (const rawLine of lines as Array<Record<string, unknown>>) {
        const sku = typeof rawLine.sku === "string" ? rawLine.sku : null;
        const quantity = Number(rawLine.quantity ?? 0);
        const lineExp = Number(rawLine.lineExp ?? 0);
        if (!sku || !Number.isInteger(quantity) || quantity <= 0 || lineExp <= 0) {
          continue;
        }
        const [purchase] = await tx
          .insert(inAppMarketPurchases)
          .values({
            userId: user.id,
            walletAddress: null,
            sku,
            quantity,
            currency: "exp",
            amountWtfUnits: "0",
            amountExp: lineExp,
            opHash: null,
            tzktTransferId: null,
            contractAddress: null,
            contractListingId: null,
            purchaseRef: intent.purchaseRef,
            paymentIntentId: intent.id,
            status: "confirmed",
            observedAt: now,
            raw: { intent, line: rawLine } as any,
          })
          .returning({ id: inAppMarketPurchases.id });

        purchaseIds.push(purchase.id);
        await tx
          .insert(inAppInventoryItems)
          .values({
            userId: user.id,
            sku,
            quantity,
            lastPurchaseId: purchase.id,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [inAppInventoryItems.userId, inAppInventoryItems.sku],
            set: {
              quantity: sql`${inAppInventoryItems.quantity} + ${quantity}`,
              lastPurchaseId: purchase.id,
              updatedAt: now,
            },
          });
      }

      await tx
        .update(inAppMarketPaymentIntents)
        .set({
          status: "completed",
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(inAppMarketPaymentIntents.id, intent.id));

      return {
        ok: true as const,
        purchaseIds,
        totalXp: updatedUser.experiencePoints,
      };
    });

    if (!result.ok) {
      return res.status(
        result.reason === "insufficient_exp" ||
          result.reason === "pet_ball_limit" ||
          result.reason === "out_of_stock"
          ? 409
          : 422
      ).json({
        error:
          result.reason === "insufficient_exp"
            ? "Not enough EXP for that cart"
            : result.reason === "pet_ball_limit"
              ? "Pet ball limit is 3 per user"
              : result.reason === "out_of_stock"
                ? "One or more items are out of stock"
                : "Checkout is no longer available",
        reason: result.reason,
      });
    }

    res.json(result);
  } catch (err) {
    console.error("POST /api/in-app-market/checkout-exp error:", err);
    res.status(500).json({ error: "Failed to redeem EXP cart" });
  }
});

router.post("/api/in-app-market/sync", isAuthenticated, async (_req, res) => {
  try {
    const result = await runInAppMarketSync({ limit: 100 });
    res.json(result);
  } catch (err) {
    console.error("POST /api/in-app-market/sync error:", err);
    res.status(500).json({ error: "Failed to sync in-app market purchases" });
  }
});

router.post("/api/in-app-market/verify", isAuthenticated, async (req, res) => {
  try {
    const parsed = verifyPayload.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid operation hash" });
    }
    const user = req.user as any;
    const result = await verifyAndGrantInAppMarketPurchaseByHash(
      parsed.data.opHash,
      user.id
    );
    if (!result.ok) {
      const status = result.reason === "not_configured" ? 503 : 422;
      return res.status(status).json({
        error:
          result.reason === "not_configured"
            ? "In-app market contract is not configured"
            : "Operation does not match a confirmed in-app market purchase",
        reason: result.reason,
      });
    }
    res.json(result);
  } catch (err) {
    console.error("POST /api/in-app-market/verify error:", err);
    res.status(500).json({ error: "Failed to verify in-app purchase" });
  }
});

router.post("/api/in-app-market/use", isAuthenticated, async (req, res) => {
  try {
    const parsed = usePayload.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid item" });
    }
    const user = req.user as any;
    const result = await db.transaction(async (tx) => {
      const [item] = await tx
        .select({
          id: inAppMarketItems.id,
          sku: inAppMarketItems.sku,
          metadata: inAppMarketItems.metadata,
        })
        .from(inAppMarketItems)
        .where(eq(inAppMarketItems.sku, parsed.data.sku))
        .limit(1);
      if (!item) return { ok: false as const, reason: "missing_item" as const };
      const kind = itemMetadataKind(item.metadata);
      const consumable = kind === "food" || kind === "medicine";
      if (!consumable) {
        return { ok: true as const, consumed: false, quantity: null };
      }

      const [updated] = await tx
        .update(inAppInventoryItems)
        .set({
          quantity: sql`${inAppInventoryItems.quantity} - 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(inAppInventoryItems.userId, user.id),
            eq(inAppInventoryItems.sku, parsed.data.sku),
            sql`${inAppInventoryItems.quantity} > 0`
          )
        )
        .returning({ quantity: inAppInventoryItems.quantity });
      if (!updated) {
        return { ok: false as const, reason: "not_owned" as const };
      }
      return { ok: true as const, consumed: true, quantity: updated.quantity };
    });

    if (!result.ok) {
      return res.status(409).json({
        error:
          result.reason === "not_owned"
            ? "You do not have that item in inventory"
            : "Item is not available",
        reason: result.reason,
      });
    }
    res.json(result);
  } catch (err) {
    console.error("POST /api/in-app-market/use error:", err);
    res.status(500).json({ error: "Failed to use in-app item" });
  }
});

export default router;
