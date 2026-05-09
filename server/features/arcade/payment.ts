import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import {
  inAppInventoryItems,
  inAppMarketItems,
  inAppMarketPaymentIntents,
  consoleGames,
} from "@shared/schema";
import { formatWtf, isAdmin, type UserRole } from "@shared/types";
import { getInAppMarketConfig } from "../../lib/in-app-market-sync";
import { hasPermission } from "../../lib/permissions";
import type { ConsoleAuthUser } from "../console/types";
import type {
  ArcadePaymentConfig,
  ArcadePlayIntentDTO,
  ArcadePlayStatusDTO,
} from "./types";

export const ARCADE_PLAY_TICKET_SKU = "arcade-play-ticket";
export const ARCADE_PLAY_CARD_SKU = "arcade-play-card";
export const ARCADE_DEFAULT_CREDITS_PER_PLAY = 1;
const ARCADE_ROUTER_LISTING_ID = 0;
const ARCADE_ESTIMATED_FEE_MUTEZ = 70_000;
const ARCADE_INTENT_TTL_MS = 30 * 60_000;
const ARCADE_PLAY_CARD_PRICE_WTF_UNITS = "100000000";
const ARCADE_PLAY_CREDIT_PRICE_WTF_UNITS = "1000000000";
const TEZOS_ADDRESS_RE = /^(tz1|tz2|tz3|KT1)[1-9A-HJ-NP-Za-km-z]{33}$/;

function normalizeWalletAddress(value: unknown): string | null {
  const trimmed = String(value || "").trim();
  return TEZOS_ADDRESS_RE.test(trimmed) ? trimmed : null;
}

export function getDefaultArcadePlayFeeWtfUnits(): string {
  const rawUnits = String(process.env.WTF_ARCADE_PLAY_FEE_UNITS || "").trim();
  if (/^[0-9]+$/.test(rawUnits) && BigInt(rawUnits) > 0n) return rawUnits;
  const amount = Number(process.env.WTF_ARCADE_PLAY_FEE_WTF || 10);
  const units = Math.round((Number.isFinite(amount) && amount > 0 ? amount : 10) * 100_000_000);
  return String(Math.max(1, units));
}

export function normalizeArcadeCreditsPerPlay(value: unknown): number {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return ARCADE_DEFAULT_CREDITS_PER_PLAY;
  return Math.max(0, Math.min(99, parsed));
}

export function arcadePlayPassFailureMessage(input: {
  reason: "missing_card" | "insufficient_credits";
  creditsPerPlay: number;
  ticketsOwned: number;
}): string {
  if (input.reason === "missing_card") {
    return "Windows Arcade Error: You need a WTF Arcade Play Pass Card loaded with credits to play this game.";
  }
  const needed = Math.max(1, input.creditsPerPlay);
  return `Windows Arcade Error: This game costs ${needed} Arcade credit${
    needed === 1 ? "" : "s"
  }. Your Play Pass Card only has ${Math.max(0, input.ticketsOwned)} loaded.`;
}

export async function getArcadePlayFeeWtfUnits(): Promise<string> {
  const item = await ensureArcadePlayTicketItem();
  return String(item.priceWtfUnits || getDefaultArcadePlayFeeWtfUnits());
}

export async function getArcadePaymentConfig(): Promise<ArcadePaymentConfig> {
  const market = getInAppMarketConfig();
  const feeWtfUnits = await getArcadePlayFeeWtfUnits();
  return {
    sku: ARCADE_PLAY_TICKET_SKU,
    currency: "wtf",
    feeWtfUnits,
    feeWtfFormatted: formatWtf(feeWtfUnits),
    contractAddress: market.contractAddress,
    routerListingId: ARCADE_ROUTER_LISTING_ID,
    configured: market.configured,
  };
}

export async function ensureArcadePlayTicketItem() {
  await db
    .insert(inAppMarketItems)
    .values({
      sku: ARCADE_PLAY_CARD_SKU,
      name: "WTF Arcade Play Card",
      description: "The baseline card for holding WTF Arcade credits.",
      category: "arcade",
      priceWtfUnits: ARCADE_PLAY_CARD_PRICE_WTF_UNITS,
      priceExp: 0,
      active: true,
      stockQuantity: 1_000_000,
      rarityTier: 1,
      priceScore: 1,
      priceWtfLocked: true,
      priceScoreLocked: true,
      contractAddress: null,
      contractListingId: null,
      sortOrder: 2,
      metadata: {
        kind: "arcade-play-card",
        surface: "arcade",
        loads: ARCADE_PLAY_TICKET_SKU,
      },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: inAppMarketItems.sku,
      set: {
        name: "WTF Arcade Play Card",
        description: "The baseline card for holding WTF Arcade credits.",
        category: "arcade",
        priceWtfUnits: ARCADE_PLAY_CARD_PRICE_WTF_UNITS,
        priceExp: 0,
        active: true,
        stockQuantity: 1_000_000,
        rarityTier: 1,
        priceScore: 1,
        priceWtfLocked: true,
        priceScoreLocked: true,
        contractAddress: null,
        contractListingId: null,
        sortOrder: 1,
        metadata: {
          kind: "arcade-play-card",
          surface: "arcade",
          loads: ARCADE_PLAY_TICKET_SKU,
        },
        updatedAt: new Date(),
      },
    });

  const [item] = await db
    .insert(inAppMarketItems)
    .values({
      sku: ARCADE_PLAY_TICKET_SKU,
      name: "WTF Arcade Credit",
      description: "One play credit loaded to a WTF Arcade Play Card for public Arcade machines.",
      category: "arcade",
      priceWtfUnits: ARCADE_PLAY_CREDIT_PRICE_WTF_UNITS,
      priceExp: 0,
      active: true,
      stockQuantity: 1_000_000,
      rarityTier: 1,
      priceScore: 2,
      priceWtfLocked: true,
      priceScoreLocked: true,
      contractAddress: null,
      contractListingId: null,
      sortOrder: 1,
      metadata: {
        kind: "arcade-play-ticket",
        consumable: true,
        surface: "arcade",
        loadsOnto: ARCADE_PLAY_CARD_SKU,
        contract: "in-app-market-cart-router",
      },
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: inAppMarketItems.sku,
      set: {
        name: "WTF Arcade Credit",
        description: "One play credit loaded to a WTF Arcade Play Card for public Arcade machines.",
        category: "arcade",
        priceWtfUnits: ARCADE_PLAY_CREDIT_PRICE_WTF_UNITS,
        priceExp: 0,
        active: true,
        stockQuantity: 1_000_000,
        rarityTier: 1,
        priceScore: 2,
        priceWtfLocked: true,
        priceScoreLocked: true,
        contractAddress: null,
        contractListingId: null,
        sortOrder: 2,
        metadata: {
          kind: "arcade-play-ticket",
          consumable: true,
          surface: "arcade",
          loadsOnto: ARCADE_PLAY_CARD_SKU,
          contract: "in-app-market-cart-router",
        },
        updatedAt: new Date(),
      },
    })
    .returning();
  return item;
}

function makeArcadePurchaseRef(userId: number): string {
  return `arcade:${userId}:${Date.now().toString(36)}:${randomUUID().slice(0, 8)}`;
}

function buildArcadeIntentLine(quantity = 1) {
  const feeWtfUnits = getDefaultArcadePlayFeeWtfUnits();
  const lineWtfUnits = (BigInt(feeWtfUnits) * BigInt(quantity)).toString();
  return {
    sku: ARCADE_PLAY_TICKET_SKU,
    name: "WTF Arcade Credit",
    kind: "arcade-play-ticket",
    quantity,
    unitWtfUnits: feeWtfUnits,
    unitWtfFormatted: formatWtf(feeWtfUnits),
    unitExp: 0,
    lineWtfUnits,
    lineWtfFormatted: formatWtf(lineWtfUnits),
    lineExp: 0,
  };
}

function serializeArcadeIntent(
  intent: typeof inAppMarketPaymentIntents.$inferSelect
): ArcadePlayIntentDTO {
  return {
    id: intent.id,
    purchaseRef: intent.purchaseRef,
    currency: "wtf",
    status: intent.status,
    walletAddress: intent.walletAddress ?? null,
    items: intent.items,
    subtotalWtfUnits: String(intent.subtotalWtfUnits),
    subtotalWtfFormatted: formatWtf(String(intent.subtotalWtfUnits)),
    estimatedFeeMutez: intent.estimatedFeeMutez,
    contractAddress: intent.contractAddress ?? null,
    routerListingId: intent.routerListingId,
    expiresAt: intent.expiresAt,
  };
}

export async function createArcadePlayIntent(input: {
  userId: number;
  walletAddress?: string | null;
}): Promise<ArcadePlayIntentDTO> {
  const config = await getArcadePaymentConfig();
  if (!config.configured) {
    throw new Error("WTF Arcade fee contract is not configured");
  }

  const feeWtfUnits = await getArcadePlayFeeWtfUnits();
  const line = buildArcadeIntentLine(1);
  line.unitWtfUnits = feeWtfUnits;
  line.unitWtfFormatted = formatWtf(feeWtfUnits);
  line.lineWtfUnits = feeWtfUnits;
  line.lineWtfFormatted = formatWtf(feeWtfUnits);
  const [intent] = await db
    .insert(inAppMarketPaymentIntents)
    .values({
      userId: input.userId,
      purchaseRef: makeArcadePurchaseRef(input.userId),
      currency: "wtf",
      status: "pending",
      walletAddress: normalizeWalletAddress(input.walletAddress),
      items: [line] as any,
      subtotalWtfUnits: line.lineWtfUnits,
      subtotalExp: 0,
      estimatedFeeMutez: ARCADE_ESTIMATED_FEE_MUTEZ,
      contractAddress: config.contractAddress,
      routerListingId: ARCADE_ROUTER_LISTING_ID,
      expiresAt: new Date(Date.now() + ARCADE_INTENT_TTL_MS),
      updatedAt: new Date(),
    })
    .returning();

  return serializeArcadeIntent(intent);
}

async function canBypassArcadeFee(user: ConsoleAuthUser): Promise<boolean> {
  const role = String(user.role || "witness") as UserRole;
  if (isAdmin(role)) return true;
  return (
    (await hasPermission(role, "trusted_arcade_creator")) ||
    (await hasPermission(role, "trusted_console_creator"))
  );
}

export async function getArcadeCreditRequirement(slug?: string | null): Promise<{
  creditsRequired: boolean;
  creditsPerPlay: number;
}> {
  const normalized = String(slug || "").trim();
  if (!normalized) {
    return { creditsRequired: true, creditsPerPlay: ARCADE_DEFAULT_CREDITS_PER_PLAY };
  }
  const [game] = await db
    .select({
      creditsRequired: consoleGames.arcadeCreditsRequired,
      creditPrice: consoleGames.arcadeCreditPrice,
    })
    .from(consoleGames)
    .where(eq(consoleGames.slug, normalized))
    .limit(1);
  if (!game) {
    return { creditsRequired: true, creditsPerPlay: ARCADE_DEFAULT_CREDITS_PER_PLAY };
  }
  const creditsRequired = game.creditsRequired ?? true;
  return {
    creditsRequired,
    creditsPerPlay: creditsRequired
      ? Math.max(1, normalizeArcadeCreditsPerPlay(game.creditPrice))
      : 0,
  };
}

export async function getArcadePlayStatus(
  user: ConsoleAuthUser,
  slug?: string | null
): Promise<ArcadePlayStatusDTO> {
  await ensureArcadePlayTicketItem();
  const bypass = await canBypassArcadeFee(user);
  const requirement = await getArcadeCreditRequirement(slug);
  const inventory = await db
    .select({ sku: inAppInventoryItems.sku, quantity: inAppInventoryItems.quantity })
    .from(inAppInventoryItems)
    .where(
      and(
        eq(inAppInventoryItems.userId, user.id),
        inArray(inAppInventoryItems.sku, [ARCADE_PLAY_TICKET_SKU, ARCADE_PLAY_CARD_SKU])
      )
    );
  const ticketsOwned = Math.max(
    0,
    Number(inventory.find((item) => item.sku === ARCADE_PLAY_TICKET_SKU)?.quantity || 0)
  );
  const cardsOwned = Math.max(
    0,
    Number(inventory.find((item) => item.sku === ARCADE_PLAY_CARD_SKU)?.quantity || 0)
  );
  return {
    userId: user.id,
    sku: ARCADE_PLAY_TICKET_SKU,
    cardSku: ARCADE_PLAY_CARD_SKU,
    cardsOwned,
    ticketsOwned,
    creditsRequired: requirement.creditsRequired,
    creditsPerPlay: requirement.creditsPerPlay,
    bypass,
    canPlay:
      bypass ||
      !requirement.creditsRequired ||
      (cardsOwned > 0 && ticketsOwned >= requirement.creditsPerPlay),
    payment: await getArcadePaymentConfig(),
  };
}

export async function consumeArcadePlayTicket(user: ConsoleAuthUser, slug?: string | null) {
  if (await canBypassArcadeFee(user)) {
    return {
      ok: true as const,
      consumed: false,
      bypass: true,
      creditsPerPlay: 0,
      remaining: null,
    };
  }

  await ensureArcadePlayTicketItem();
  const requirement = await getArcadeCreditRequirement(slug);
  if (!requirement.creditsRequired || requirement.creditsPerPlay <= 0) {
    return {
      ok: true as const,
      consumed: false,
      bypass: false,
      creditsPerPlay: 0,
      remaining: null,
    };
  }
  const inventory = await db
    .select({ sku: inAppInventoryItems.sku, quantity: inAppInventoryItems.quantity })
    .from(inAppInventoryItems)
    .where(
      and(
        eq(inAppInventoryItems.userId, user.id),
        inArray(inAppInventoryItems.sku, [ARCADE_PLAY_TICKET_SKU, ARCADE_PLAY_CARD_SKU])
      )
    );
  const cardsOwned = Math.max(
    0,
    Number(inventory.find((item) => item.sku === ARCADE_PLAY_CARD_SKU)?.quantity || 0)
  );
  const ticketsOwned = Math.max(
    0,
    Number(inventory.find((item) => item.sku === ARCADE_PLAY_TICKET_SKU)?.quantity || 0)
  );
  if (cardsOwned <= 0) {
    return {
      ok: false as const,
      consumed: false,
      bypass: false,
      reason: "missing_card" as const,
      creditsPerPlay: requirement.creditsPerPlay,
      ticketsOwned,
      message: arcadePlayPassFailureMessage({
        reason: "missing_card",
        creditsPerPlay: requirement.creditsPerPlay,
        ticketsOwned,
      }),
    };
  }

  const [updated] = await db
    .update(inAppInventoryItems)
    .set({
      quantity: sql`${inAppInventoryItems.quantity} - ${requirement.creditsPerPlay}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(inAppInventoryItems.userId, user.id),
        eq(inAppInventoryItems.sku, ARCADE_PLAY_TICKET_SKU),
        sql`${inAppInventoryItems.quantity} >= ${requirement.creditsPerPlay}`
      )
    )
    .returning({ quantity: inAppInventoryItems.quantity });

  if (!updated) {
    return {
      ok: false as const,
      consumed: false,
      bypass: false,
      reason: "insufficient_credits" as const,
      creditsPerPlay: requirement.creditsPerPlay,
      ticketsOwned,
      message: arcadePlayPassFailureMessage({
        reason: "insufficient_credits",
        creditsPerPlay: requirement.creditsPerPlay,
        ticketsOwned,
      }),
    };
  }
  return {
    ok: true as const,
    consumed: true,
    bypass: false,
    creditsPerPlay: requirement.creditsPerPlay,
    remaining: updated.quantity,
  };
}
