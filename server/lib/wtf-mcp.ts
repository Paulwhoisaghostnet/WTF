import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  collectionItems,
  collections,
  desktopPetEvents,
  desktopPetStates,
  tokenMarketSummary,
  tokenMetadata,
  tvChannels,
  userDesktopSettings,
  walletHoldings,
  users,
} from "@shared/schema";
import { DESKTOP_APPS, type DesktopAppKey } from "@shared/types";
import {
  applyHamsterAction,
  dateKey,
  DEFAULT_DESKTOP_APPEARANCE,
  DEFAULT_HAMSTER_STATE,
  createGeneratedHamsterState,
  deriveHamsterSnapshot,
  DESKTOP_BACKGROUND_FITS,
  DESKTOP_COLOR_SCHEMES,
  DESKTOP_CURSOR_STYLES,
  DESKTOP_GRAVITY_MODES,
  HAMSTER_ACTIONS,
  HAMSTER_EMOTION_COUNT_KEYS,
  HAMSTER_HEALTH_COUNT_KEYS,
  normalizeDesktopAppearance,
  normalizeHamsterGenetics,
  resolveHamsterColorSchemeKey,
  serializeHamsterInteractionCounts,
  type DesktopAppearance,
  type DesktopIconLayout,
  type HamsterAction,
  type HamsterState,
} from "@shared/desktop";
import { getDesktopAppConfig, type DesktopAppConfig } from "./desktop-apps";
import { awardXp } from "./xp";
import { mirrorTradeBoardChange } from "./collections-mirror";
import { getMarketplaceAddressOrNull } from "./contract-config";
import {
  grantNewPetStarterFood,
  NEW_PET_STARTER_FOOD_QUANTITY,
  PET_FOOD_SKU,
} from "./pet-food-inventory";
import type { McpAgentAuthContext } from "./mcp-agent-auth";

const RESPONSE_FORMATS = ["markdown", "json"] as const;
const ResponseFormatSchema = z.enum(RESPONSE_FORMATS).default("markdown");
type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Use a 6-digit hex color like #008080");

const DESKTOP_ICON_KEYS = [
  "recycle-bin",
  "hoard",
  "w",
  "tv",
  "dicksword",
  "console",
  "studio",
  "my-gallery",
] as const;

function clampPetStat(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampPetCounter(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(999, Math.floor(value)));
}

function clampPetLongCounter(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)));
}

function normalizeInteractionCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, count]) => Number.isFinite(Number(count)))
      .map(([key, count]) => [key, Math.max(0, Math.floor(Number(count)))])
  );
}

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

type FeatureGate = DesktopAppKey | null;

interface FeatureGateCheck {
  ok: boolean;
  apps: DesktopAppConfig;
  error?: ToolResult;
}

function safeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function serializeForJson(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeForJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        serializeForJson(entry),
      ])
    );
  }
  return value;
}

function asText(output: unknown, responseFormat: ResponseFormat, markdown?: string): string {
  const serialized = serializeForJson(output);
  if (responseFormat === "json") {
    return JSON.stringify(serialized, null, 2);
  }
  return markdown || JSON.stringify(serialized, null, 2);
}

function toolResult(
  output: Record<string, unknown>,
  responseFormat: ResponseFormat,
  markdown?: string
): ToolResult {
  const structuredContent = serializeForJson(output) as Record<string, unknown>;
  return {
    content: [{ type: "text", text: asText(structuredContent, responseFormat, markdown) }],
    structuredContent,
  };
}

function toolError(message: string, responseFormat: ResponseFormat, details?: unknown): ToolResult {
  const structuredContent = {
    ok: false,
    error: message,
    details: serializeForJson(details ?? null),
  } as Record<string, unknown>;
  return {
    isError: true,
    content: [{ type: "text", text: asText(structuredContent, responseFormat, message) }],
    structuredContent,
  };
}

export function isMcpFeatureEnabled(
  apps: DesktopAppConfig,
  gate: FeatureGate
): boolean {
  return gate === null || apps[gate] !== false;
}

async function requireMcpFeature(
  gate: FeatureGate,
  toolName: string,
  responseFormat: ResponseFormat
): Promise<FeatureGateCheck> {
  const apps = await getDesktopAppConfig();
  if (isMcpFeatureEnabled(apps, gate)) {
    return { ok: true, apps };
  }

  return {
    ok: false,
    apps,
    error: toolError(
      `${toolName} is disabled because the admin control panel has disabled the ${gate} sub app.`,
      responseFormat,
      { gate, apps }
    ),
  };
}

function rowToHamsterState(
  row: typeof desktopPetStates.$inferSelect | null | undefined
): HamsterState {
  if (!row) return { ...DEFAULT_HAMSTER_STATE };
  const interactionCounts = normalizeInteractionCounts(row.interactionCounts);
  return {
    name: row.name,
    genetics: normalizeHamsterGenetics(row.genetics),
    colorSchemeKey: resolveHamsterColorSchemeKey(row.colorSchemeKey, row.genetics),
    alive: row.alive,
    hunger: row.hunger,
    thirst: row.thirst,
    happiness: row.happiness,
    hygiene: row.hygiene,
    energy: row.energy,
    sick: Number(interactionCounts[HAMSTER_HEALTH_COUNT_KEYS.sick] ?? 0) > 0,
    sicknessRisk: clampPetStat(
      Number(interactionCounts[HAMSTER_HEALTH_COUNT_KEYS.sicknessRisk] ?? 0)
    ),
    medicineDoses: clampPetCounter(
      Number(interactionCounts[HAMSTER_HEALTH_COUNT_KEYS.medicineDoses] ?? 0)
    ),
    restDoses: clampPetCounter(
      Number(interactionCounts[HAMSTER_HEALTH_COUNT_KEYS.restDoses] ?? 0)
    ),
    poopExposure: clampPetCounter(
      Number(interactionCounts[HAMSTER_HEALTH_COUNT_KEYS.poopExposure] ?? 0)
    ),
    bondXp: clampPetLongCounter(
      Number(interactionCounts[HAMSTER_EMOTION_COUNT_KEYS.bondXp] ?? 0)
    ),
    bondLevel: Math.max(
      1,
      Math.min(
        50,
        Math.floor(Math.sqrt(Number(interactionCounts[HAMSTER_EMOTION_COUNT_KEYS.bondXp] ?? 0) / 18)) + 1
      )
    ),
    happinessIndexScore: clampPetStat(
      Number(interactionCounts[HAMSTER_EMOTION_COUNT_KEYS.happinessIndexScore] ?? row.happiness)
    ),
    happinessSampleCount: clampPetLongCounter(
      Number(interactionCounts[HAMSTER_EMOTION_COUNT_KEYS.happinessSampleCount] ?? 0)
    ),
    trauma: clampPetStat(
      Number(interactionCounts[HAMSTER_EMOTION_COUNT_KEYS.trauma] ?? 0)
    ),
    level: row.level,
    xpEarned: row.xpEarned,
    carePoints: row.carePoints,
    missedCareDays: row.missedCareDays,
    careStreak: row.careStreak,
    lastCareDate: row.lastCareDate ?? null,
    lastInteractionAt: row.lastInteractionAt?.toISOString() ?? null,
    interactionCounts,
  };
}

function hamsterValues(userId: number, state: HamsterState) {
  const genetics = normalizeHamsterGenetics(state.genetics);
  return {
    userId,
    name: state.name,
    colorSchemeKey: resolveHamsterColorSchemeKey(state.colorSchemeKey, genetics),
    genetics,
    alive: state.alive,
    hunger: state.hunger,
    thirst: state.thirst,
    happiness: state.happiness,
    hygiene: state.hygiene,
    energy: state.energy,
    level: state.level,
    xpEarned: state.xpEarned,
    carePoints: state.carePoints,
    missedCareDays: state.missedCareDays,
    careStreak: state.careStreak,
    lastCareDate: state.lastCareDate,
    lastInteractionAt: state.lastInteractionAt
      ? new Date(state.lastInteractionAt)
      : null,
    interactionCounts: serializeHamsterInteractionCounts(state),
    updatedAt: new Date(),
  };
}

async function persistPetState(userId: number, state: HamsterState) {
  const values = hamsterValues(userId, state);
  await db
    .insert(desktopPetStates)
    .values(values)
    .onConflictDoUpdate({
      target: desktopPetStates.userId,
      set: values,
    });
}

async function getOrCreatePetState(userId: number, now = new Date()) {
  const [row] = await db
    .select()
    .from(desktopPetStates)
    .where(eq(desktopPetStates.userId, userId));

  if (!row) {
    const initial = createGeneratedHamsterState({
      seed: `mcp-founder:${userId}:${now.toISOString()}:${randomUUID()}`,
      now,
    });
    await persistPetState(userId, initial);
    await grantNewPetStarterFood(db, userId, now);
    await db.insert(desktopPetEvents).values({
      userId,
      action: "generated",
      statBefore: null,
      statAfter: initial,
      xpAmount: 0,
      metadata: {
        source: "mcp_founder_generation",
        geneticsVersion: initial.genetics.version,
        seed: initial.genetics.seed,
        starterInventory: {
          sku: PET_FOOD_SKU,
          quantity: NEW_PET_STARTER_FOOD_QUANTITY,
        },
      },
      createdAt: now,
    });
    return initial;
  }

  const persisted = rowToHamsterState(row);
  const snapshot = deriveHamsterSnapshot(persisted, now);
  if (
    snapshot.alive !== row.alive ||
    snapshot.hunger !== row.hunger ||
    snapshot.thirst !== row.thirst ||
    snapshot.happiness !== row.happiness ||
    snapshot.hygiene !== row.hygiene ||
    snapshot.energy !== row.energy ||
    snapshot.sick !== persisted.sick ||
    snapshot.sicknessRisk !== persisted.sicknessRisk ||
    snapshot.poopExposure !== persisted.poopExposure ||
    snapshot.medicineDoses !== persisted.medicineDoses ||
    snapshot.restDoses !== persisted.restDoses ||
    snapshot.bondXp !== persisted.bondXp ||
    snapshot.happinessIndexScore !== persisted.happinessIndexScore ||
    snapshot.happinessSampleCount !== persisted.happinessSampleCount ||
    snapshot.trauma !== persisted.trauma ||
    snapshot.missedCareDays !== row.missedCareDays
  ) {
    if (row.alive && !snapshot.alive) {
      await db.insert(desktopPetEvents).values({
        userId,
        action: "death",
        statBefore: persisted,
        statAfter: snapshot,
        xpAmount: 0,
        metadata: { reason: "missed_care_days", source: "mcp_snapshot_decay" },
        createdAt: now,
      });
    }
    await persistPetState(userId, snapshot);
  }
  return snapshot;
}

async function getDesktopSettings(userId: number): Promise<{
  appearance: DesktopAppearance;
  iconLayout: DesktopIconLayout;
}> {
  const [row] = await db
    .select()
    .from(userDesktopSettings)
    .where(eq(userDesktopSettings.userId, userId));

  return {
    appearance: normalizeDesktopAppearance({
      ...DEFAULT_DESKTOP_APPEARANCE,
      ...(row?.appearance ?? {}),
    }),
    iconLayout: normalizeIconLayoutLocal(row?.iconLayout ?? {}),
  };
}

function normalizeIconLayoutLocal(value: unknown): DesktopIconLayout {
  const input = safeObject(value);
  const layout: DesktopIconLayout = {};
  for (const key of DESKTOP_ICON_KEYS) {
    const pos = safeObject(input[key]);
    const x = Number(pos.x);
    const y = Number(pos.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      layout[key] = {
        x: Math.max(0, Math.min(10000, Math.round(x))),
        y: Math.max(0, Math.min(10000, Math.round(y))),
      };
    }
  }
  return layout;
}

async function saveDesktopAppearance(userId: number, appearance: DesktopAppearance) {
  const current = await getDesktopSettings(userId);
  const [row] = await db
    .insert(userDesktopSettings)
    .values({
      userId,
      appearance,
      iconLayout: current.iconLayout,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userDesktopSettings.userId,
      set: {
        appearance,
        iconLayout: current.iconLayout,
        updatedAt: new Date(),
      },
    })
    .returning();

  return {
    appearance: normalizeDesktopAppearance(row.appearance),
    iconLayout: normalizeIconLayoutLocal(row.iconLayout),
  };
}

async function applyPetCareAction(
  userId: number,
  action: HamsterAction,
  metadata: Record<string, unknown>
) {
  const now = new Date();
  const before = await getOrCreatePetState(userId, now);
  const applied = applyHamsterAction(before, action, now);
  const todayStart = new Date(`${dateKey(now)}T00:00:00.000Z`);
  const [{ count: alreadyAwardedToday }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(desktopPetEvents)
    .where(
      and(
        eq(desktopPetEvents.userId, userId),
        eq(desktopPetEvents.action, action),
        sql`${desktopPetEvents.createdAt} >= ${todayStart}`,
        sql`${desktopPetEvents.xpAmount} > 0`
      )
    );

  const xpAmount = alreadyAwardedToday > 0 ? 0 : applied.xpAmount;
  const next = {
    ...applied.next,
    xpEarned: applied.next.xpEarned - applied.xpAmount + xpAmount,
  };
  next.level = Math.max(1, Math.floor(next.xpEarned / 100) + 1);

  let xpEventId: number | null = null;
  let totalXp: number | null = null;
  if (xpAmount > 0) {
    const awarded = await awardXp({
      userId,
      amount: xpAmount,
      reason: "desktop_pet_care",
      metadata: {
        action,
        hamsterName: next.name,
        careStreak: next.careStreak,
        source: "wtf_mcp",
      },
    });
    xpEventId = awarded.eventId;
    totalXp = awarded.totalXp;
  }

  await persistPetState(userId, next);
  const [event] = await db
    .insert(desktopPetEvents)
    .values({
      userId,
      action,
      statBefore: before,
      statAfter: next,
      xpAmount,
      xpEventId,
      metadata,
      createdAt: now,
    })
    .returning();

  return { pet: next, event, xpAmount, totalXp };
}

export function selectKeepAliveActions(
  pet: HamsterState,
  maxActions: number
): HamsterAction[] {
  if (maxActions <= 0) return [];
  if (!pet.alive) return ["revive"];

  const actions: HamsterAction[] = [];
  if (pet.thirst < 55) actions.push("water");
  if (pet.hunger < 55) actions.push("feed");
  if (pet.hygiene < 55) actions.push(pet.hygiene < 35 ? "scoop" : "clean");
  if (pet.happiness < 50) actions.push("pet");
  if (pet.energy < 35) actions.push("nap");
  if (actions.length === 0 && pet.happiness < 80) actions.push("pet");
  return actions.slice(0, Math.max(1, Math.min(5, maxActions)));
}

function applySchemePatch(
  current: DesktopAppearance,
  schemeKey: string | undefined
): DesktopAppearance {
  const scheme = DESKTOP_COLOR_SCHEMES.find((entry) => entry.key === schemeKey);
  if (!scheme) return current;
  return {
    ...current,
    colorSchemeKey: scheme.key,
    desktopColor: scheme.desktopColor,
    windowColor: scheme.windowColor,
    activeTitleColor: scheme.activeTitleColor,
    activeTitleTextColor: scheme.activeTitleTextColor,
    inactiveTitleColor: scheme.inactiveTitleColor,
    inactiveTitleTextColor: scheme.inactiveTitleTextColor,
    textColor: scheme.textColor,
    highlightColor: scheme.highlightColor,
    buttonFace: scheme.buttonFace,
  };
}

function clampLimit(value: number, defaultValue = 25, max = 100): number {
  if (!Number.isFinite(value)) return defaultValue;
  return Math.max(1, Math.min(max, Math.floor(value)));
}

function clampOffset(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function tokenMarkdown(items: Array<Record<string, unknown>>, title: string): string {
  if (items.length === 0) return `${title}\n\nNo matching public token rows found.`;
  return [
    title,
    "",
    ...items.map((item, index) => {
      const name = String(item.name || item.tokenName || "Untitled token");
      const contract = String(item.tokenContract || item.contract || "");
      const tokenId = String(item.tokenId || "");
      const suffix = item.currentFloorMutez
        ? ` floor ${item.currentFloorMutez} mutez`
        : "";
      return `${index + 1}. ${name} (${contract} #${tokenId})${suffix}`;
    }),
  ].join("\n");
}

function featureMarkdown(apps: DesktopAppConfig, tokenName: string): string {
  const lines = DESKTOP_APPS.map((key) => `- ${key}: ${apps[key] ? "enabled" : "disabled"}`);
  return [
    `WTF MCP paired as ${tokenName}.`,
    "",
    "Admin feature gates:",
    ...lines,
    "",
    "Private user data remains outside public-data tools; token/Objkt/TzKT/IPFS-derived rows are treated as public.",
  ].join("\n");
}

export function createWtfMcpServer(auth: McpAgentAuthContext): McpServer {
  const server = new McpServer({
    name: "wtf-mcp-server",
    version: "1.0.0",
  });

  server.registerTool(
    "wtf_get_capabilities",
    {
      title: "Get WTF MCP Capabilities",
      description:
        "Return paired user context, admin feature gates, MCP rate-limit hints, and available WTF agent workflows.",
      inputSchema: z.object({
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ response_format }) => {
      const apps = await getDesktopAppConfig();
      const output = {
        ok: true,
        server: "wtf-mcp-server",
        pairedAgent: {
          tokenId: auth.tokenId,
          name: auth.tokenName,
          tokenPrefix: auth.tokenPrefix,
          scopes: auth.scopes,
        },
        user: auth.user,
        adminFeatureGates: apps,
        rateLimit: {
          requestsPerMinute: Number(process.env.MCP_AGENT_RATE_LIMIT_PER_MINUTE || 60),
        },
        tools: [
          "wtf_get_capabilities",
          "wtf_get_desktop_appearance",
          "wtf_set_desktop_appearance",
          "wtf_get_desktop_pet",
          "wtf_keep_desktop_pet_alive",
          "wtf_search_public_tokens",
          "wtf_list_unlisted_trade_board_tokens",
          "wtf_set_trade_board_tokens",
          "wtf_prepare_single_edition_listing_workflow",
          "wtf_list_public_tv_channels",
        ],
      };
      return toolResult(output, response_format, featureMarkdown(apps, auth.tokenName));
    }
  );

  server.registerTool(
    "wtf_get_desktop_appearance",
    {
      title: "Get Desktop Appearance",
      description:
        "Read the paired user's WTF desktop appearance settings, including color scheme, wallpaper, cursor, physics, and desktop pet switch.",
      inputSchema: z.object({
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ response_format }) => {
      const settings = await getDesktopSettings(auth.user.id);
      return toolResult(
        { ok: true, ...settings },
        response_format,
        `Desktop scheme: ${settings.appearance.colorSchemeKey}\nCursor: ${settings.appearance.cursorStyle}\nDesktop pet: ${settings.appearance.desktopPetEnabled ? "enabled" : "disabled"}`
      );
    }
  );

  server.registerTool(
    "wtf_set_desktop_appearance",
    {
      title: "Set Desktop Appearance",
      description:
        "Update the paired user's WTF desktop color scheme and appearance. Use this when a user asks their agent to apply a custom color scheme or cursor.",
      inputSchema: z.object({
        scheme_key: z
          .string()
          .optional()
          .describe("Optional built-in scheme key from WTF desktop settings."),
        desktop_color: HexColorSchema.optional(),
        window_color: HexColorSchema.optional(),
        active_title_color: HexColorSchema.optional(),
        active_title_text_color: HexColorSchema.optional(),
        inactive_title_color: HexColorSchema.optional(),
        inactive_title_text_color: HexColorSchema.optional(),
        text_color: HexColorSchema.optional(),
        highlight_color: HexColorSchema.optional(),
        button_face: HexColorSchema.optional(),
        background_image_url: z.string().url().nullable().optional(),
        background_fit: z.enum(DESKTOP_BACKGROUND_FITS).optional(),
        cursor_style: z.enum(DESKTOP_CURSOR_STYLES).optional(),
        desktop_physics_enabled: z.boolean().optional(),
        desktop_gravity_mode: z.enum(DESKTOP_GRAVITY_MODES).optional(),
        desktop_pet_enabled: z.boolean().optional(),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      const current = await getDesktopSettings(auth.user.id);
      const withScheme = applySchemePatch(current.appearance, params.scheme_key);
      const next = normalizeDesktopAppearance({
        ...withScheme,
        desktopColor: params.desktop_color ?? withScheme.desktopColor,
        windowColor: params.window_color ?? withScheme.windowColor,
        activeTitleColor: params.active_title_color ?? withScheme.activeTitleColor,
        activeTitleTextColor:
          params.active_title_text_color ?? withScheme.activeTitleTextColor,
        inactiveTitleColor:
          params.inactive_title_color ?? withScheme.inactiveTitleColor,
        inactiveTitleTextColor:
          params.inactive_title_text_color ?? withScheme.inactiveTitleTextColor,
        textColor: params.text_color ?? withScheme.textColor,
        highlightColor: params.highlight_color ?? withScheme.highlightColor,
        buttonFace: params.button_face ?? withScheme.buttonFace,
        backgroundImageUrl:
          params.background_image_url === undefined
            ? withScheme.backgroundImageUrl
            : params.background_image_url,
        backgroundFit: params.background_fit ?? withScheme.backgroundFit,
        cursorStyle: params.cursor_style ?? withScheme.cursorStyle,
        desktopPhysicsEnabled:
          params.desktop_physics_enabled ?? withScheme.desktopPhysicsEnabled,
        desktopGravityMode: params.desktop_gravity_mode ?? withScheme.desktopGravityMode,
        desktopPetEnabled: params.desktop_pet_enabled ?? withScheme.desktopPetEnabled,
      });
      const saved = await saveDesktopAppearance(auth.user.id, next);
      return toolResult(
        { ok: true, ...saved },
        params.response_format,
        `Updated desktop appearance to ${saved.appearance.colorSchemeKey}.`
      );
    }
  );

  server.registerTool(
    "wtf_get_desktop_pet",
    {
      title: "Get Desktop Pet",
      description:
        "Read the paired user's desktop hamster state and recent care status. This tool only accesses the paired user's own pet.",
      inputSchema: z.object({
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ response_format }) => {
      const pet = await getOrCreatePetState(auth.user.id);
      return toolResult(
        { ok: true, pet },
        response_format,
        `Hamster ${pet.name}: ${pet.alive ? "alive" : "not alive"}, hunger ${pet.hunger}, thirst ${pet.thirst}, happiness ${pet.happiness}, hygiene ${pet.hygiene}, energy ${pet.energy}, bond L${pet.bondLevel}, happiness index ${pet.happinessIndexScore}, trauma ${pet.trauma}.`
      );
    }
  );

  server.registerTool(
    "wtf_keep_desktop_pet_alive",
    {
      title: "Keep Desktop Pet Alive",
      description:
        "Care for the paired user's desktop hamster. With strategy='auto', the tool chooses the most urgent safe care actions and applies up to max_actions.",
      inputSchema: z.object({
        strategy: z.enum(["auto", "specific"]).default("auto"),
        action: z.enum(HAMSTER_ACTIONS).optional(),
        max_actions: z.number().int().min(1).max(5).default(1),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ strategy, action, max_actions, response_format }) => {
      let pet = await getOrCreatePetState(auth.user.id);
      const actions =
        strategy === "specific" && action
          ? [action]
          : selectKeepAliveActions(pet, max_actions);
      if (actions.length === 0) {
        return toolResult(
          { ok: true, pet, actionsApplied: [] },
          response_format,
          `${pet.name} does not need care right now.`
        );
      }

      const events: unknown[] = [];
      for (const nextAction of actions) {
        const result = await applyPetCareAction(auth.user.id, nextAction, {
          surface: "mcp",
          agentTokenId: auth.tokenId,
          strategy,
        });
        pet = result.pet;
        events.push(result.event);
      }

      return toolResult(
        { ok: true, pet, actionsApplied: actions, events },
        response_format,
        `Applied ${actions.join(", ")} for ${pet.name}. Hunger ${pet.hunger}, thirst ${pet.thirst}, hygiene ${pet.hygiene}, happiness ${pet.happiness}, energy ${pet.energy}, bond L${pet.bondLevel}, happiness index ${pet.happinessIndexScore}, trauma ${pet.trauma}.`
      );
    }
  );

  server.registerTool(
    "wtf_search_public_tokens",
    {
      title: "Search Public Tokens",
      description:
        "Search public WTF token metadata and market-summary database rows derived from Objkt, TzKT, IPFS, and on-chain data. Does not return private user data.",
      inputSchema: z.object({
        q: z.string().trim().max(200).optional(),
        contract: z.string().trim().max(64).optional(),
        creator_address: z.string().trim().max(64).optional(),
        limit: z.number().int().min(1).max(100).default(25),
        offset: z.number().int().min(0).default(0),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ q, contract, creator_address, limit, offset, response_format }) => {
      const gate = await requireMcpFeature("gallery", "wtf_search_public_tokens", response_format);
      if (!gate.ok) return gate.error!;

      const whereParts = [];
      if (q) {
        const like = `%${q}%`;
        whereParts.push(sql`(
          COALESCE(${tokenMetadata.name}, '') ILIKE ${like}
          OR COALESCE(${tokenMetadata.description}, '') ILIKE ${like}
          OR COALESCE(${tokenMetadata.raw}::text, '') ILIKE ${like}
          OR ${tokenMetadata.tokenContract} ILIKE ${like}
          OR CAST(${tokenMetadata.tokenId} AS TEXT) ILIKE ${like}
        )`);
      }
      if (contract) whereParts.push(eq(tokenMetadata.tokenContract, contract));
      if (creator_address) whereParts.push(eq(tokenMetadata.creatorAddress, creator_address));

      const whereClause = whereParts.length > 0 ? and(...whereParts) : sql`true`;
      const safeLimit = clampLimit(limit, 25, 100);
      const safeOffset = clampOffset(offset);

      const rows = await db
        .select({
          tokenContract: tokenMetadata.tokenContract,
          tokenId: tokenMetadata.tokenId,
          name: tokenMetadata.name,
          symbol: tokenMetadata.symbol,
          description: tokenMetadata.description,
          thumbnail: tokenMetadata.thumbnail,
          artifactUri: tokenMetadata.artifactUri,
          displayUri: tokenMetadata.displayUri,
          mimeType: tokenMetadata.mimeType,
          creatorAddress: tokenMetadata.creatorAddress,
          supply: tokenMetadata.supply,
          fetchedAt: tokenMetadata.fetchedAt,
          currentFloorMutez: tokenMarketSummary.currentFloorMutez,
          activeListingCount: tokenMarketSummary.activeListingCount,
          uniqueOwnersCount: tokenMarketSummary.uniqueOwnersCount,
          lastSaleMutez: tokenMarketSummary.lastSaleMutez,
          lastSaleAt: tokenMarketSummary.lastSaleAt,
        })
        .from(tokenMetadata)
        .leftJoin(
          tokenMarketSummary,
          and(
            eq(tokenMarketSummary.tokenContract, tokenMetadata.tokenContract),
            eq(tokenMarketSummary.tokenId, tokenMetadata.tokenId)
          )
        )
        .where(whereClause)
        .orderBy(desc(tokenMetadata.updatedAt))
        .limit(safeLimit)
        .offset(safeOffset);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(tokenMetadata)
        .where(whereClause);

      const items = rows.map((row) => ({
        ...row,
        supply: row.supply == null ? null : String(row.supply),
        currentFloorMutez:
          row.currentFloorMutez == null ? null : String(row.currentFloorMutez),
        lastSaleMutez: row.lastSaleMutez == null ? null : String(row.lastSaleMutez),
      }));

      return toolResult(
        {
          ok: true,
          items,
          pagination: {
            limit: safeLimit,
            offset: safeOffset,
            total: count,
            count: items.length,
            hasMore: safeOffset + items.length < count,
            nextOffset: safeOffset + items.length,
          },
        },
        response_format,
        tokenMarkdown(items, "Public token search results")
      );
    }
  );

  server.registerTool(
    "wtf_list_unlisted_trade_board_tokens",
    {
      title: "List Unlisted Trade Board Tokens",
      description:
        "Find public trade-board token rows that do not currently have active listing rows in WTF's public marketplace/listing caches. This is for agent research and listing planning.",
      inputSchema: z.object({
        mine_only: z.boolean().default(false),
        single_editions_only: z.boolean().default(false),
        q: z.string().trim().max(200).optional(),
        limit: z.number().int().min(1).max(100).default(25),
        offset: z.number().int().min(0).default(0),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ mine_only, single_editions_only, q, limit, offset, response_format }) => {
      const gate = await requireMcpFeature("hoard", "wtf_list_unlisted_trade_board_tokens", response_format);
      if (!gate.ok) return gate.error!;

      const whereParts = [
        eq(collections.type, "trade_board_listing" as const),
        sql`COALESCE(NULLIF(${walletHoldings.balance}, ''), '0')::numeric > 0`,
        sql`${walletHoldings.tokenContract} <> 'WTF'`,
        sql`NOT EXISTS (
          SELECT 1 FROM token_listings tl
          WHERE tl.token_contract = ${walletHoldings.tokenContract}
            AND tl.token_id = ${walletHoldings.tokenId}
            AND tl.active = true
        )`,
        sql`NOT EXISTS (
          SELECT 1 FROM marketplace_listings ml
          WHERE ml.token_contract = ${walletHoldings.tokenContract}
            AND ml.token_id = ${walletHoldings.tokenId}
            AND ml.status = 'active'
            AND ml.onchain_status <> 'failed'
        )`,
      ];
      if (mine_only) whereParts.push(eq(collections.userId, auth.user.id));
      if (single_editions_only) whereParts.push(sql`${tokenMetadata.supply} = 1`);
      if (q) {
        const like = `%${q}%`;
        whereParts.push(sql`(
          COALESCE(${tokenMetadata.name}, '') ILIKE ${like}
          OR COALESCE(${tokenMetadata.raw}::text, '') ILIKE ${like}
          OR ${walletHoldings.tokenContract} ILIKE ${like}
          OR CAST(${walletHoldings.tokenId} AS TEXT) ILIKE ${like}
          OR ${users.username} ILIKE ${like}
          OR ${users.displayName} ILIKE ${like}
          OR ${walletHoldings.walletAddress} ILIKE ${like}
        )`);
      }

      const safeLimit = clampLimit(limit, 25, 100);
      const safeOffset = clampOffset(offset);
      const whereClause = and(...whereParts);

      const rows = await db
        .select({
          ownerUserId: users.id,
          ownerUsername: users.username,
          ownerDisplayName: users.displayName,
          ownerWallet: walletHoldings.walletAddress,
          tokenContract: walletHoldings.tokenContract,
          tokenId: walletHoldings.tokenId,
          walletBalance: walletHoldings.balance,
          tradeBoardQuantity: collectionItems.quantity,
          tokenName: tokenMetadata.name,
          tokenThumbnail: tokenMetadata.thumbnail,
          creatorAddress: tokenMetadata.creatorAddress,
          supply: tokenMetadata.supply,
          activeListingCount: tokenMarketSummary.activeListingCount,
          currentFloorMutez: tokenMarketSummary.currentFloorMutez,
          lastSeenAt: walletHoldings.derivedAt,
        })
        .from(collectionItems)
        .innerJoin(collections, eq(collections.id, collectionItems.collectionId))
        .innerJoin(
          walletHoldings,
          and(
            eq(walletHoldings.userId, collections.userId),
            eq(walletHoldings.tokenContract, collectionItems.tokenContract),
            eq(walletHoldings.tokenId, collectionItems.tokenId)
          )
        )
        .leftJoin(users, eq(users.id, collections.userId))
        .leftJoin(
          tokenMetadata,
          and(
            eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
            eq(tokenMetadata.tokenId, walletHoldings.tokenId)
          )
        )
        .leftJoin(
          tokenMarketSummary,
          and(
            eq(tokenMarketSummary.tokenContract, walletHoldings.tokenContract),
            eq(tokenMarketSummary.tokenId, walletHoldings.tokenId)
          )
        )
        .where(whereClause)
        .orderBy(desc(walletHoldings.derivedAt))
        .limit(safeLimit)
        .offset(safeOffset);

      const items = rows.map((row) => ({
        ...row,
        tokenName: row.tokenName || `#${row.tokenId}`,
        supply: row.supply == null ? null : String(row.supply),
        currentFloorMutez:
          row.currentFloorMutez == null ? null : String(row.currentFloorMutez),
        suggestedListingAmount: 1,
        canUseSingleEditionListing:
          row.supply == null ? "unknown_supply" : Number(row.supply) === 1,
      }));

      return toolResult(
        {
          ok: true,
          items,
          pagination: {
            limit: safeLimit,
            offset: safeOffset,
            count: items.length,
            hasMore: items.length === safeLimit,
            nextOffset: safeOffset + items.length,
          },
        },
        response_format,
        tokenMarkdown(items, "Unlisted trade-board tokens")
      );
    }
  );

  server.registerTool(
    "wtf_set_trade_board_tokens",
    {
      title: "Set Trade Board Tokens",
      description:
        "Add or remove the paired user's owned tokens from the WTF trade board by contract/token id. This mutates only the paired user's trade-board collection.",
      inputSchema: z.object({
        action: z.enum(["add", "remove"]),
        tokens: z
          .array(
            z.object({
              token_contract: z.string().trim().min(1).max(64),
              token_id: z.string().trim().regex(/^[0-9]+$/),
              quantity: z.number().int().min(1).max(100000).default(1),
            })
          )
          .min(1)
          .max(100),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ action, tokens, response_format }) => {
      const gate = await requireMcpFeature("hoard", "wtf_set_trade_board_tokens", response_format);
      if (!gate.ok) return gate.error!;

      const ownedRows = await db
        .select({
          tokenContract: walletHoldings.tokenContract,
          tokenId: walletHoldings.tokenId,
          balance: walletHoldings.balance,
        })
        .from(walletHoldings)
        .where(
          and(
            eq(walletHoldings.userId, auth.user.id),
            or(
              ...tokens.map((token) =>
                and(
                  eq(walletHoldings.tokenContract, token.token_contract),
                  eq(walletHoldings.tokenId, token.token_id)
                )
              )
            )
          )
        );
      const owned = new Map(
        ownedRows.map((row) => [`${row.tokenContract}:${row.tokenId}`, row])
      );

      const accepted = [];
      const rejected = [];
      for (const token of tokens) {
        const key = `${token.token_contract}:${token.token_id}`;
        const row = owned.get(key);
        if (!row) {
          rejected.push({ ...token, reason: "not_found_in_paired_user_holdings" });
          continue;
        }
        const balance = Math.max(0, parseInt(row.balance || "0", 10) || 0);
        if (balance <= 0) {
          rejected.push({ ...token, reason: "zero_balance" });
          continue;
        }
        accepted.push({
          tokenContract: row.tokenContract,
          tokenId: row.tokenId,
          quantity: Math.min(token.quantity, balance),
        });
      }

      if (accepted.length > 0) {
        if (action === "add") {
          await mirrorTradeBoardChange({
            action: "add",
            userId: auth.user.id,
            tokens: accepted,
          });
        } else {
          await mirrorTradeBoardChange({
            action: "remove",
            userId: auth.user.id,
            tokens: accepted.map(({ tokenContract, tokenId }) => ({
              tokenContract,
              tokenId,
            })),
          });
        }
      }

      return toolResult(
        { ok: true, action, accepted, rejected },
        response_format,
        `${action === "add" ? "Added" : "Removed"} ${accepted.length} token(s) ${action === "add" ? "to" : "from"} the paired user's trade board. Rejected ${rejected.length}.`
      );
    }
  );

  server.registerTool(
    "wtf_prepare_single_edition_listing_workflow",
    {
      title: "Prepare Single Edition Listing Workflow",
      description:
        "Prepare safe next steps for listing one of the paired user's trade-board tokens. This does not create a listing without a user wallet signature/op hash.",
      inputSchema: z.object({
        token_contract: z.string().trim().min(1).max(64),
        token_id: z.string().trim().regex(/^[0-9]+$/),
        price_wtf: z.number().int().min(1).max(10_000_000_000),
        amount: z.number().int().min(1).max(1).default(1),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async ({ token_contract, token_id, price_wtf, amount, response_format }) => {
      const gate = await requireMcpFeature("hoard", "wtf_prepare_single_edition_listing_workflow", response_format);
      if (!gate.ok) return gate.error!;

      const [holding] = await db
        .select({
          walletAddress: walletHoldings.walletAddress,
          balance: walletHoldings.balance,
          tradeBoardQuantity: collectionItems.quantity,
          tokenName: tokenMetadata.name,
          tokenThumbnail: tokenMetadata.thumbnail,
          supply: tokenMetadata.supply,
        })
        .from(walletHoldings)
        .leftJoin(
          tokenMetadata,
          and(
            eq(tokenMetadata.tokenContract, walletHoldings.tokenContract),
            eq(tokenMetadata.tokenId, walletHoldings.tokenId)
          )
        )
        .leftJoin(
          collectionItems,
          and(
            eq(collectionItems.tokenContract, walletHoldings.tokenContract),
            eq(collectionItems.tokenId, walletHoldings.tokenId),
            sql`${collectionItems.collectionId} IN (
              SELECT id FROM collections
              WHERE user_id = ${auth.user.id}
                AND type = 'trade_board_listing'
            )`
          )
        )
        .where(
          and(
            eq(walletHoldings.userId, auth.user.id),
            eq(walletHoldings.tokenContract, token_contract),
            eq(walletHoldings.tokenId, token_id)
          )
        )
        .limit(1);

      if (!holding) {
        return toolError(
          "The paired user does not have this token in synced wallet holdings.",
          response_format,
          { token_contract, token_id }
        );
      }

      const marketplaceContract = getMarketplaceAddressOrNull();
      const balance = Math.max(0, parseInt(holding.balance || "0", 10) || 0);
      const tradeBoardQuantity = Math.max(0, Number(holding.tradeBoardQuantity) || 0);
      const canProceed = Boolean(marketplaceContract && balance >= amount);
      const output = {
        ok: true,
        canProceed,
        token: {
          tokenContract: token_contract,
          tokenId: token_id,
          tokenName: holding.tokenName,
          tokenThumbnail: holding.tokenThumbnail,
          supply: holding.supply == null ? null : String(holding.supply),
          ownerWallet: holding.walletAddress,
          walletBalance: balance,
          tradeBoardQuantity,
        },
        listingPlan: {
          listingType: "buy_now",
          amount,
          priceWtf: price_wtf,
          marketplaceContract,
          requiresWalletSignature: true,
          expectedEntrypoint: "create_listing",
        },
        steps: [
          "Confirm the token is on the user's trade board and amount is available.",
          "Ask the user's wallet to sign a create_listing call to the configured WTF marketplace contract.",
          "Submit the resulting operation hash to the normal WTF marketplace create-listing API so the server can verify it against TzKT.",
        ],
        blockers: [
          ...(marketplaceContract ? [] : ["MARKETPLACE_CONTRACT_NOT_CONFIGURED"]),
          ...(balance >= amount ? [] : ["INSUFFICIENT_SYNCED_BALANCE"]),
          ...(tradeBoardQuantity >= amount ? [] : ["TOKEN_NOT_ON_TRADE_BOARD_OR_QUANTITY_TOO_LOW"]),
        ],
      };

      return toolResult(
        output,
        response_format,
        `Prepared listing workflow for ${holding.tokenName || `#${token_id}`} at ${price_wtf} WTF. Wallet signature required: yes.`
      );
    }
  );

  server.registerTool(
    "wtf_list_public_tv_channels",
    {
      title: "List Public TV Channels",
      description:
        "List active public WTF TV channels from the database. Disabled automatically when admin disables the TV sub app.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(25),
        offset: z.number().int().min(0).default(0),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit, offset, response_format }) => {
      const gate = await requireMcpFeature("tv", "wtf_list_public_tv_channels", response_format);
      if (!gate.ok) return gate.error!;

      const safeLimit = clampLimit(limit, 25, 100);
      const safeOffset = clampOffset(offset);
      const channels = await db
        .select({
          id: tvChannels.id,
          slug: tvChannels.slug,
          title: tvChannels.title,
          description: tvChannels.description,
          logoUrl: tvChannels.logoUrl,
          bannerUrl: tvChannels.bannerUrl,
          dialNumber: tvChannels.dialNumber,
          sortOrder: tvChannels.sortOrder,
          videosPerBumper: tvChannels.videosPerBumper,
          updatedAt: tvChannels.updatedAt,
        })
        .from(tvChannels)
        .where(and(eq(tvChannels.isPublic, true), eq(tvChannels.isActive, true)))
        .orderBy(tvChannels.sortOrder, tvChannels.id)
        .limit(safeLimit)
        .offset(safeOffset);

      return toolResult(
        {
          ok: true,
          channels,
          pagination: {
            limit: safeLimit,
            offset: safeOffset,
            count: channels.length,
            hasMore: channels.length === safeLimit,
            nextOffset: safeOffset + channels.length,
          },
        },
        response_format,
        channels.length
          ? ["Public WTF TV channels:", ...channels.map((channel) => `- ${channel.title} (${channel.slug}) dial ${channel.dialNumber ?? "n/a"}`)].join("\n")
          : "No active public WTF TV channels found."
      );
    }
  );

  return server;
}
