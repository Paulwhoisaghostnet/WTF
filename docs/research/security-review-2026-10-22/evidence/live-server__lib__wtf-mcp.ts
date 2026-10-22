import { resolvePublicSiteOrigin } from "@shared/platform-branding";
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
import { DESKTOP_APPS, isAdmin, type DesktopAppKey } from "@shared/types";
import {
  applyHamsterAction,
  dateKey,
  DEFAULT_DESKTOP_APPEARANCE,
  DEFAULT_HAMSTER_STATE,
  createGeneratedHamsterState,
  deriveHamsterSnapshot,
  DESKTOP_APPEARANCE_STYLES,
  DESKTOP_BACKGROUND_FITS,
  DESKTOP_COLOR_SCHEMES,
  DESKTOP_CURSOR_STYLES,
  DESKTOP_GRAVITY_MODES,
  DESKTOP_ICON_LAYOUT_KEYS,
  HAMSTER_ACTIONS,
  HAMSTER_EMOTION_COUNT_KEYS,
  HAMSTER_HEALTH_COUNT_KEYS,
  normalizeDesktopAppearance,
  normalizeHamsterGenetics,
  normalizeIconLayout,
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
  listConsoleCatalog,
} from "../features/console/catalog";
import { getArcadeStats, listArcadeCatalog } from "../features/arcade/catalog";
import { runArcadeSourceImport } from "../features/arcade/source-import";
import {
  createArcadePlayIntent,
  getArcadePaymentConfig,
  getArcadePlayStatus,
} from "../features/arcade/payment";
import { listConsoleAuditEvents } from "../features/console/audit";
import {
  getConsolePlayerLeaderboard,
  getRecentConsoleScores,
} from "../features/console/scoring";
import { getConsoleDiscoveryShelves } from "../features/console/discovery";
import { getConsoleStats } from "../features/console/stats";
import {
  buildGameStudioScaffold,
  GAME_STUDIO_CODE_SNIPPETS,
  GAME_STUDIO_STOCK_ASSETS,
  GAME_STUDIO_TARGETS,
  GAME_STUDIO_TEMPLATES,
  listGameStudioCodeSnippets,
  listGameStudioStockAssetDescriptors,
} from "../features/game-studio/catalog";
import { buildGameStudioZip, normalizeConsoleSlug } from "../features/game-studio/packaging";
import {
  buildGameStudioProjectBundle,
  createGameStudioProject,
  listGameStudioProjects,
  submitGameStudioProjectToArcade,
  updateGameStudioProject,
} from "../features/game-studio/projects";
import { createTrustedCreatorMarketItem } from "../features/in-app-market/creator-items";
import { buildWtfAccessManifest } from "./wtf-access";
import { buildWtfOsRegisteredInventory } from "./wtfos-inventory";
import {
  apiOperationAllowedForAgent,
  listWtfOsApiOperations,
  resolveWtfOsApiOperationCall,
} from "./public-api";
import { registerCrpNominationMcpTools } from "../features/crp-nominations/mcp";
import {
  grantNewPetStarterFood,
  NEW_PET_STARTER_FOOD_QUANTITY,
  PET_FOOD_SKU,
} from "./pet-food-inventory";
import type { McpAgentAuthContext } from "./mcp-agent-auth";

const RESPONSE_FORMATS = ["markdown", "json"] as const;
const ResponseFormatSchema = z.enum(RESPONSE_FORMATS).default("markdown");
type ResponseFormat = (typeof RESPONSE_FORMATS)[number];

const ApiOperationSummaryOutputSchema = z.object({
  operationId: z.string(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string(),
  summary: z.string(),
  tags: z.array(z.string()),
  requiredScopes: z.array(z.string()),
  requiredRole: z.string(),
});
const ApiPortalErrorOutputShape = {
  error: z.string().optional(),
  details: z.unknown().optional(),
};

const HexColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Use a 6-digit hex color like #008080");

const MapLabNodeKindSchema = z.enum(["system", "agent", "data", "policy", "repo", "milestone"]);
const MapLabWireKindSchema = z.enum(["serves", "depends", "reads", "writes", "blocks"]);
const MapLabNodeInputSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(120),
  kind: MapLabNodeKindSchema.default("system"),
  system: z.string().trim().max(80).default("Unassigned"),
  notes: z.string().trim().max(500).default(""),
  locked: z.boolean().default(false),
});
const MapLabWireInputSchema = z.object({
  fromKey: z.string().trim().min(1).max(80),
  toKey: z.string().trim().min(1).max(80),
  kind: MapLabWireKindSchema.default("serves"),
  color: HexColorSchema.default("#2563eb"),
  label: z.string().trim().max(80).default(""),
});

export const WTF_MCP_TOOL_NAMES = [
  "wtf_get_capabilities",
  "wtf_get_access_manifest",
  "wtf_get_registered_inventory",
  "wtf_search_api_operations",
  "wtf_get_api_operation",
  "wtf_call_api_operation",
  "wtf_api_request",
  "wtf_create_map_lab_document",
  "wtf_get_desktop_appearance",
  "wtf_set_desktop_appearance",
  "wtf_get_desktop_pet",
  "wtf_keep_desktop_pet_alive",
  "wtf_search_public_tokens",
  "wtf_list_unlisted_trade_board_tokens",
  "wtf_set_trade_board_tokens",
  "wtf_prepare_single_edition_listing_workflow",
  "wtf_list_public_tv_channels",
  "wtf_list_arcade_games",
  "wtf_get_arcade_stats",
  "wtf_get_arcade_play_fee",
  "wtf_get_arcade_play_status",
  "wtf_create_arcade_play_intent",
  "wtf_list_arcade_audit_events",
  "wtf_run_arcade_source_import",
  "wtf_list_console_games",
  "wtf_get_console_stats",
  "wtf_get_console_discovery_shelves",
  "wtf_list_console_players",
  "wtf_list_console_recent_scores",
  "wtf_list_console_audit_events",
  "wtf_list_game_studio_assets",
  "wtf_list_game_studio_snippets",
  "wtf_list_game_studio_targets",
  "wtf_create_game_studio_scaffold",
  "wtf_build_game_studio_bundle",
  "wtf_list_game_studio_projects",
  "wtf_create_game_studio_project",
  "wtf_update_game_studio_project",
  "wtf_build_game_studio_project",
  "wtf_submit_game_studio_project_to_arcade",
  "wtf_create_trusted_creator_market_item",
  "wtf_list_crp_categories",
  "wtf_get_crp_nomination_status",
  "wtf_resolve_crp_nominee",
  "wtf_list_my_crp_nominations",
  "wtf_get_crp_nomination_credits",
  "wtf_submit_crp_nomination",
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

export function hasMcpScope(scopes: readonly string[], required: string): boolean {
  const normalized = new Set(scopes.map((scope) => String(scope || "").trim()).filter(Boolean));
  if (normalized.has("*") || normalized.has(required)) return true;
  const [domain] = required.split(":");
  return Boolean(domain && normalized.has(`${domain}:*`));
}

function requireMcpScopes(
  auth: McpAgentAuthContext,
  requiredScopes: string[],
  toolName: string,
  responseFormat: ResponseFormat
): ToolResult | null {
  const missing = requiredScopes.filter((scope) => !hasMcpScope(auth.scopes, scope));
  if (missing.length === 0) return null;
  return toolError(
    `${toolName} requires MCP scope${missing.length === 1 ? "" : "s"} ${missing.join(", ")}. Create or update a paired agent token with the required scope before using this workflow.`,
    responseFormat,
    {
      requiredScopes,
      pairedScopes: auth.scopes,
    }
  );
}

function requireMcpAdmin(
  auth: McpAgentAuthContext,
  toolName: string,
  responseFormat: ResponseFormat
): ToolResult | null {
  if (isAdmin(auth.user.role)) return null;
  return toolError(
    `${toolName} requires an admin WTF user, even when the paired agent token has matching scopes.`,
    responseFormat,
    { userRole: auth.user.role }
  );
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
    iconLayout: normalizeIconLayout(row?.iconLayout ?? {}, DESKTOP_ICON_LAYOUT_KEYS),
  };
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
    iconLayout: normalizeIconLayout(row.iconLayout, DESKTOP_ICON_LAYOUT_KEYS),
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

export function createWtfMcpServer(
  auth: McpAgentAuthContext,
  options: {
    accessOrigin?: string;
    mcpEndpoint?: string;
    apiRequest?: (input: {
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
      path: string;
      query?: Record<string, string | number | boolean>;
      body?: unknown;
    }) => Promise<{
      status: number;
      contentType: string;
      body: unknown;
    }>;
  } = {}
): McpServer {
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
        access: {
          manifestApi: "/api/access",
          mcpEndpoint:
            options.mcpEndpoint ||
            process.env.MCP_PUBLIC_ENDPOINT ||
            `${resolvePublicSiteOrigin(options.accessOrigin || process.env.PUBLIC_SITE_URL)}/mcp`,
        },
        tools: [...WTF_MCP_TOOL_NAMES],
      };
      return toolResult(output, response_format, featureMarkdown(apps, auth.tokenName));
    }
  );

  server.registerTool(
    "wtf_get_access_manifest",
    {
      title: "Get WTF Standard Access Manifest",
      description:
        "Return the standard WTF browser, JSON API, and paired MCP access map. Use this before navigating or automating WTF so agent access stays aligned with the web-browser experience.",
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
      const origin = resolvePublicSiteOrigin(options.accessOrigin || process.env.PUBLIC_SITE_URL);
      const manifest = buildWtfAccessManifest({
        origin,
        mcpEndpoint: options.mcpEndpoint || process.env.MCP_PUBLIC_ENDPOINT || `${origin}/mcp`,
        apps,
      });
      return toolResult(
        manifest,
        response_format,
        [
          "WTF standard access is available through browser routes, public JSON APIs, and paired MCP.",
          `Browser origin: ${manifest.origin}`,
          `MCP endpoint: ${manifest.mcp.endpoint}`,
          `Browser routes: ${manifest.browserRoutes.length}`,
          `Public/API routes: ${manifest.apiRoutes.length}`,
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "wtf_get_registered_inventory",
    {
      title: "Get WTFOS Registered Inventory",
      description:
        "Return the standardized WTFOS app/package inventory with current pathways, provenance, witness metadata, and deployment state. Use this for agent handshakes that need the live creation and service registry.",
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
      const origin = resolvePublicSiteOrigin(options.accessOrigin || process.env.PUBLIC_SITE_URL);
      const inventory = buildWtfOsRegisteredInventory({
        origin,
        mcpEndpoint: options.mcpEndpoint || process.env.MCP_PUBLIC_ENDPOINT || `${origin}/mcp`,
        apps,
      });
      return toolResult(
        inventory as unknown as Record<string, unknown>,
        response_format,
        [
          `WTFOS inventory: ${inventory.summary.enabledArtifacts}/${inventory.summary.totalArtifacts} enabled`,
          `Discovery tools: ${inventory.discoveryTools.join(", ")}`,
          `Browser pathways: ${inventory.summary.pathwayCounts.browser}`,
          `API pathways: ${inventory.summary.pathwayCounts.api}`,
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "wtf_search_api_operations",
    {
      title: "Search the wtfOS API",
      description:
        "Search the OpenAPI operation catalog that this paired agent is allowed to call. Results are filtered by the token's API scopes and the owner's account role. Use '*' to list the complete allowed catalog.",
      inputSchema: z.object({
        query: z.string().trim().min(1).describe("Words from an operation id, method, path, tag, or summary; use * for all allowed operations."),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
        tag: z.string().trim().min(1).optional(),
        response_format: ResponseFormatSchema,
      }).strict(),
      outputSchema: z.object({
        ok: z.boolean(),
        query: z.string().optional(),
        count: z.number().int().optional(),
        operations: z.array(ApiOperationSummaryOutputSchema).optional(),
        ...ApiPortalErrorOutputShape,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ query, method, tag, response_format }) => {
      const origin = resolvePublicSiteOrigin(options.accessOrigin || process.env.PUBLIC_SITE_URL);
      const terms = query === "*" ? [] : query.toLowerCase().split(/\s+/).filter(Boolean);
      const operations = listWtfOsApiOperations(origin)
        .filter((operation) => apiOperationAllowedForAgent(operation, auth))
        .filter((operation) => !method || operation.method === method)
        .filter((operation) => !tag || operation.tags.some((value) => value.toLowerCase() === tag.toLowerCase()))
        .filter((operation) => {
          const searchable = [
            operation.operationId,
            operation.method,
            operation.path,
            operation.summary,
            ...operation.tags,
          ].join(" ").toLowerCase();
          return terms.every((term) => searchable.includes(term));
        })
        .map((operation) => ({
          operationId: operation.operationId,
          method: operation.method,
          path: operation.path,
          summary: operation.summary,
          tags: operation.tags,
          requiredScopes: operation.requiredScopes,
          requiredRole: operation.requiredRole,
        }));
      return toolResult(
        { ok: true, query, count: operations.length, operations },
        response_format,
        operations.length
          ? [
              `Found ${operations.length} allowed wtfOS API operation(s):`,
              ...operations.map((operation) => `- ${operation.operationId}: ${operation.method} ${operation.path} — ${operation.summary}`),
            ].join("\n")
          : "No allowed wtfOS API operations matched that search.",
      );
    },
  );

  server.registerTool(
    "wtf_get_api_operation",
    {
      title: "Get a wtfOS API Operation",
      description:
        "Return the OpenAPI details for one operation that this paired agent is allowed to call, including parameters, request body, responses, required scopes, and required role.",
      inputSchema: z.object({
        operation_id: z.string().trim().min(1),
        response_format: ResponseFormatSchema,
      }).strict(),
      outputSchema: z.object({
        ok: z.boolean(),
        operation: z.object({
          operationId: z.string(),
          method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
          path: z.string(),
          summary: z.string(),
          description: z.string(),
          tags: z.array(z.string()),
          public: z.boolean(),
          requiredScopes: z.array(z.string()),
          requiredRole: z.string(),
          declaredAccess: z.string(),
          parameters: z.array(z.unknown()),
          requestBody: z.unknown().optional(),
          responses: z.unknown(),
        }).optional(),
        ...ApiPortalErrorOutputShape,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ operation_id, response_format }) => {
      const origin = resolvePublicSiteOrigin(options.accessOrigin || process.env.PUBLIC_SITE_URL);
      const operation = listWtfOsApiOperations(origin).find((candidate) => candidate.operationId === operation_id);
      if (!operation || !apiOperationAllowedForAgent(operation, auth)) {
        return toolError("That API operation does not exist or is not available to this paired agent.", response_format);
      }
      return toolResult(
        { ok: true, operation: operation as unknown as Record<string, unknown> },
        response_format,
        [
          `${operation.operationId}`,
          `${operation.method} ${operation.path}`,
          operation.summary,
          `Scopes: ${operation.requiredScopes.join(", ") || "none"}; role: ${operation.requiredRole}.`,
        ].join("\n"),
      );
    },
  );

  server.registerTool(
    "wtf_call_api_operation",
    {
      title: "Call a wtfOS API Operation",
      description:
        "Call an allowed wtfOS API operation by its stable OpenAPI operationId. The portal fills encoded path parameters and then uses the paired token through the same API middleware, ownership checks, account role, app gates, and handler validation as a direct /api/v1 request.",
      inputSchema: z.object({
        operation_id: z.string().trim().min(1),
        path_parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .describe("Values for every {parameter} in the selected operation path. Values are URL-encoded by the portal.")
          .optional(),
        query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
        body: z.unknown().optional(),
        response_format: ResponseFormatSchema,
      }).strict(),
      outputSchema: z.object({
        ok: z.boolean(),
        operationId: z.string().optional(),
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).optional(),
        path: z.string().optional(),
        status: z.number().int().optional(),
        contentType: z.string().optional(),
        body: z.unknown().optional(),
        ...ApiPortalErrorOutputShape,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ operation_id, path_parameters, query, body, response_format }) => {
      const origin = resolvePublicSiteOrigin(options.accessOrigin || process.env.PUBLIC_SITE_URL);
      const operation = listWtfOsApiOperations(origin).find((candidate) => candidate.operationId === operation_id);
      if (!operation || !apiOperationAllowedForAgent(operation, auth)) {
        return toolError("That API operation does not exist or is not available to this paired agent.", response_format);
      }
      if (!options.apiRequest) {
        return toolError("The versioned API transport is unavailable in this MCP runtime.", response_format);
      }
      try {
        const request = resolveWtfOsApiOperationCall(operation, path_parameters);
        const response = await options.apiRequest({ ...request, query, body });
        const output = {
          ok: response.status >= 200 && response.status < 300,
          operationId: operation.operationId,
          method: request.method,
          path: request.path,
          status: response.status,
          contentType: response.contentType,
          body: response.body,
        };
        if (!output.ok) {
          return toolError(
            `wtfOS API operation failed with HTTP ${response.status}. The API's scope, role, ownership, app-gate, and handler checks remain authoritative.`,
            response_format,
            output,
          );
        }
        return toolResult(output, response_format, `${operation.operationId} succeeded with HTTP ${response.status}.`);
      } catch (error) {
        return toolError(
          `wtfOS API operation could not be completed: ${error instanceof Error ? error.message : String(error)}`,
          response_format,
        );
      }
    },
  );

  server.registerTool(
    "wtf_api_request",
    {
      title: "Call the wtfOS Platform API",
      description:
        "Call any operation exposed by the versioned wtfOS Platform API at /api/v1 using the paired token. Existing route ownership, role, app-gate, and token-scope checks remain authoritative. Read calls require api:read; mutations require api:write; admin paths additionally require an admin account and api:admin.",
      inputSchema: z.object({
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string().trim().refine(
          (value) => value === "/api/v1" || value.startsWith("/api/v1/"),
          "Path must start with /api/v1",
        ),
        query: z.record(
          z.string(),
          z.union([z.string(), z.number(), z.boolean()]),
        ).optional(),
        body: z.unknown().optional(),
        response_format: ResponseFormatSchema,
      }).strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ method, path, query, body, response_format }) => {
      const requiredScope = method === "GET" ? "api:read" : "api:write";
      const scopeError = requireMcpScopes(
        auth,
        [requiredScope],
        "wtf_api_request",
        response_format,
      );
      if (scopeError) return scopeError;
      if (!options.apiRequest) {
        return toolError(
          "The versioned API transport is unavailable in this MCP runtime.",
          response_format,
        );
      }
      try {
        const response = await options.apiRequest({ method, path, query, body });
        const output = {
          ok: response.status >= 200 && response.status < 300,
          method,
          path,
          status: response.status,
          contentType: response.contentType,
          body: response.body,
        };
        if (!output.ok) {
          return toolError(
            `wtfOS API request failed with HTTP ${response.status}. Check the path, token scopes, app gate, ownership, and request payload.`,
            response_format,
            output,
          );
        }
        return toolResult(
          output,
          response_format,
          `${method} ${path} succeeded with HTTP ${response.status}.`,
        );
      } catch (error) {
        return toolError(
          `wtfOS API request could not be completed: ${error instanceof Error ? error.message : String(error)}`,
          response_format,
        );
      }
    },
  );

  server.registerTool(
    "wtf_create_map_lab_document",
    {
      title: "Create WTF Map Lab Document",
      description:
        "Create a sanitized WTF Map Lab document payload from explicit MCP-provided nodes and wires. This tool can create map objects but cannot read, use, or expose ingested AT repo/firehose data paths.",
      inputSchema: z.object({
        title: z.string().trim().min(1).max(120).default("MCP Map Lab draft"),
        nodes: z.array(MapLabNodeInputSchema).min(1).max(80),
        wires: z.array(MapLabWireInputSchema).max(160).default([]),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ title, nodes, wires, response_format }) => {
      const gate = await requireMcpFeature("map-lab", "wtf_create_map_lab_document", response_format);
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["map-lab:write"],
        "wtf_create_map_lab_document",
        response_format
      );
      if (scopeError) return scopeError;

      const seenKeys = new Set<string>();
      const mapNodes = nodes.map((node, index) => {
        const uniqueKey = seenKeys.has(node.key) ? `${node.key}-${index + 1}` : node.key;
        seenKeys.add(uniqueKey);
        return {
          id: `mcp-node-${index + 1}`,
          key: uniqueKey,
          index: index + 1,
          label: node.label,
          kind: node.kind,
          x: 80 + (index % 4) * 210,
          y: 80 + Math.floor(index / 4) * 132,
          locked: node.locked,
          system: node.system,
          notes: node.notes,
        };
      });
      const keyToId = new Map(mapNodes.map((node) => [node.key, node.id]));
      const mapWires = wires
        .filter((wire) => keyToId.has(wire.fromKey) && keyToId.has(wire.toKey))
        .map((wire, index) => ({
          id: `mcp-wire-${index + 1}`,
          from: keyToId.get(wire.fromKey)!,
          to: keyToId.get(wire.toKey)!,
          kind: wire.kind,
          color: wire.color,
          label: wire.label || wire.kind,
        }));
      const document = {
        version: 1,
        title,
        nodes: mapNodes,
        wires: mapWires,
        updatedAt: new Date().toISOString(),
        policy: {
          createdBy: "mcp",
          pairedTokenPrefix: auth.tokenPrefix,
          ingestedDataPathsAccessible: false,
          note:
            "MCP-created Map Lab documents contain only explicit map objects supplied to this tool. AT repo/firehose ingested data paths remain unavailable.",
        },
      };
      return toolResult(
        { ok: true, document },
        response_format,
        `Created Map Lab document "${title}" with ${mapNodes.length} node(s) and ${mapWires.length} wire(s). Ingested data paths were not read or exposed.`
      );
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
      const scopeError = requireMcpScopes(
        auth,
        ["desktop:read"],
        "wtf_get_desktop_appearance",
        response_format
      );
      if (scopeError) return scopeError;
      const settings = await getDesktopSettings(auth.user.id);
      return toolResult(
        { ok: true, ...settings },
        response_format,
        `Desktop style: ${settings.appearance.appearanceStyleKey}\nDesktop scheme: ${settings.appearance.colorSchemeKey}\nCursor: ${settings.appearance.cursorStyle}\nDesktop pet: ${settings.appearance.desktopPetEnabled ? "enabled" : "disabled"}`
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
        appearance_style_key: z
          .enum(DESKTOP_APPEARANCE_STYLES.map((style) => style.key) as [string, ...string[]])
          .optional()
          .describe("Optional OS appearance grammar: classic-95, wtf-xp, wtf-aqua, or wtf-zine."),
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
      const scopeError = requireMcpScopes(
        auth,
        ["desktop:write"],
        "wtf_set_desktop_appearance",
        params.response_format
      );
      if (scopeError) return scopeError;
      const current = await getDesktopSettings(auth.user.id);
      const withScheme = applySchemePatch(current.appearance, params.scheme_key);
      const next = normalizeDesktopAppearance({
        ...withScheme,
        appearanceStyleKey:
          params.appearance_style_key ?? withScheme.appearanceStyleKey,
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
        `Updated desktop appearance to ${saved.appearance.appearanceStyleKey} / ${saved.appearance.colorSchemeKey}.`
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
      const scopeError = requireMcpScopes(
        auth,
        ["pet:read"],
        "wtf_get_desktop_pet",
        response_format
      );
      if (scopeError) return scopeError;
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
      const scopeError = requireMcpScopes(
        auth,
        ["pet:write"],
        "wtf_keep_desktop_pet_alive",
        response_format
      );
      if (scopeError) return scopeError;
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
      const gate = await requireMcpFeature("wtfiam", "wtf_list_unlisted_trade_board_tokens", response_format);
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
      const gate = await requireMcpFeature("wtfiam", "wtf_set_trade_board_tokens", response_format);
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["trade-board:write"],
        "wtf_set_trade_board_tokens",
        response_format
      );
      if (scopeError) return scopeError;

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
      const gate = await requireMcpFeature("wtfiam", "wtf_prepare_single_edition_listing_workflow", response_format);
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["market:write"],
        "wtf_prepare_single_edition_listing_workflow",
        response_format
      );
      if (scopeError) return scopeError;

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

  server.registerTool(
    "wtf_list_arcade_games",
    {
      title: "List WTF Arcade Games",
      description:
        "List active public WTF Arcade games, including compatible-source games and creator/Game Studio submissions. Console stock cartridges are excluded.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(25),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit, response_format }) => {
      const gate = await requireMcpFeature("arcade", "wtf_list_arcade_games", response_format);
      if (!gate.ok) return gate.error!;

      const catalog = await listArcadeCatalog(limit);
      const games = catalog.all.slice(0, limit);
      return toolResult(
        {
          ok: true,
          games,
          payment: catalog.payment,
          pagination: {
            limit,
            count: games.length,
            hasMore: games.length === limit,
          },
        },
        response_format,
        games.length
          ? [
              "Active WTF Arcade games:",
              ...games.map((game) =>
                `- ${game.title} (${game.slug}) by ${game.builderName || game.sourceLabel || "WTF"}: ${game.playCount || 0} play(s)`
              ),
            ].join("\n")
          : "No active WTF Arcade games found."
      );
    }
  );

  server.registerTool(
    "wtf_get_arcade_stats",
    {
      title: "Get WTF Arcade Stats",
      description:
        "Get aggregate WTF Arcade stats plus the current in-app market play-fee wiring.",
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
      const gate = await requireMcpFeature("arcade", "wtf_get_arcade_stats", response_format);
      if (!gate.ok) return gate.error!;
      const stats = await getArcadeStats();
      return toolResult(
        { ok: true, stats },
        response_format,
        [
          "WTF Arcade stats:",
          `- ${stats.publishedGames} public game(s), ${stats.sourceArcadeGames} compatible-source game(s)`,
          `- ${stats.totalPlays} play(s), ${stats.totalScores} score(s)`,
          `- Play fee: ${stats.payment.feeWtfFormatted} WTF via ${stats.payment.contractAddress || "unconfigured contract"}`,
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "wtf_get_arcade_play_fee",
    {
      title: "Get WTF Arcade Play Fee",
      description:
        "Return the current WTF Arcade play-ticket SKU, WTF price, and in-app market contract wiring.",
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
      const gate = await requireMcpFeature("arcade", "wtf_get_arcade_play_fee", response_format);
      if (!gate.ok) return gate.error!;
      const payment = await getArcadePaymentConfig();
      return toolResult(
        { ok: true, payment },
        response_format,
        `WTF Arcade play ticket ${payment.sku}: ${payment.feeWtfFormatted} WTF via ${payment.contractAddress || "unconfigured contract"}.`
      );
    }
  );

  server.registerTool(
    "wtf_get_arcade_play_status",
    {
      title: "Get WTF Arcade Play Status",
      description:
        "Return the paired user's WTF Arcade ticket inventory, trusted/admin bypass status, and current play-fee wiring.",
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
      const gate = await requireMcpFeature("arcade", "wtf_get_arcade_play_status", response_format);
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["arcade:read"],
        "wtf_get_arcade_play_status",
        response_format
      );
      if (scopeError) return scopeError;

      const status = await getArcadePlayStatus(auth.user);
      return toolResult(
        { ok: true, status },
        response_format,
        status.canPlay
          ? `WTF Arcade play is available: ${status.bypass ? "trusted/admin bypass" : `${status.ticketsOwned} ticket(s) owned`}.`
          : `WTF Arcade play needs a ${status.payment.feeWtfFormatted} WTF ticket (${status.sku}).`
      );
    }
  );

  server.registerTool(
    "wtf_create_arcade_play_intent",
    {
      title: "Create WTF Arcade Play Intent",
      description:
        "Create a WTF in-app market payment intent for one WTF Arcade Play ticket for the paired user.",
      inputSchema: z.object({
        wallet_address: z.string().trim().max(40).optional(),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ wallet_address, response_format }) => {
      const gate = await requireMcpFeature("arcade", "wtf_create_arcade_play_intent", response_format);
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["arcade:write", "market:write"],
        "wtf_create_arcade_play_intent",
        response_format
      );
      if (scopeError) return scopeError;

      const intent = await createArcadePlayIntent({
        userId: auth.user.id,
        walletAddress: wallet_address,
      });
      const payment = await getArcadePaymentConfig();
      return toolResult(
        { ok: true, intent, payment },
        response_format,
        `Created WTF Arcade play intent ${intent.purchaseRef} for ${intent.subtotalWtfFormatted} WTF.`
      );
    }
  );

  server.registerTool(
    "wtf_list_arcade_audit_events",
    {
      title: "List WTF Arcade Audit Events",
      description:
        "List recent WTF Arcade moderation, compatible-source check, report, and score audit events. Requires an admin WTF user and arcade:admin MCP scope.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).default(50),
        action: z.string().trim().max(80).optional(),
        game_slug: z.string().trim().max(160).optional(),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit, action, game_slug, response_format }) => {
      const gate = await requireMcpFeature("arcade", "wtf_list_arcade_audit_events", response_format);
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["arcade:admin"],
        "wtf_list_arcade_audit_events",
        response_format
      );
      if (scopeError) return scopeError;
      const adminError = requireMcpAdmin(
        auth,
        "wtf_list_arcade_audit_events",
        response_format
      );
      if (adminError) return adminError;

      const events = await listConsoleAuditEvents({
        limit,
        action,
        gameSlug: game_slug,
        surface: "arcade",
      });
      return toolResult(
        { ok: true, events },
        response_format,
        events.length
          ? [
              "Recent WTF Arcade audit events:",
              ...events
                .slice(0, 20)
                .map((event) =>
                  `- ${event.action} ${event.slug || "system"} by ${event.actorUsername || "system"}`
                ),
            ].join("\n")
          : "No WTF Arcade audit events matched the filter."
      );
    }
  );

  server.registerTool(
    "wtf_run_arcade_source_import",
    {
      title: "Run WTF Arcade Compatible Source Check",
      description:
        "Run the WTF Arcade compatible-source check job immediately. Requires an admin WTF user and arcade:admin MCP scope.",
      inputSchema: z.object({
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ response_format }) => {
      const gate = await requireMcpFeature("arcade", "wtf_run_arcade_source_import", response_format);
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["arcade:admin"],
        "wtf_run_arcade_source_import",
        response_format
      );
      if (scopeError) return scopeError;
      const adminError = requireMcpAdmin(
        auth,
        "wtf_run_arcade_source_import",
        response_format
      );
      if (adminError) return adminError;

      const result = await runArcadeSourceImport();
      const cursor = (result.cursorAfter || {}) as Record<string, unknown>;
      return toolResult(
        { ok: true, result },
        response_format,
        [
          "WTF Arcade compatible-source check finished:",
          `- scanned ${result.itemsIn} candidate(s)`,
          `- inserted ${String(cursor.inserted ?? 0)}, updated ${String(cursor.updated ?? 0)}, skipped ${String(cursor.skipped ?? 0)}`,
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "wtf_list_console_games",
    {
      title: "List WTF Console Games",
      description:
        "List WTF Console cartridges that live on every user's personal console: stock console games plus owned media when paired user scope allows it.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(25),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit, response_format }) => {
      const gate = await requireMcpFeature("console", "wtf_list_console_games", response_format);
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["console:read"],
        "wtf_list_console_games",
        response_format
      );
      if (scopeError) return scopeError;

      const catalog = await listConsoleCatalog(auth.user.id);
      const games = catalog.all.slice(0, limit);
      return toolResult(
        {
          ok: true,
          games,
          pagination: {
            limit,
            count: games.length,
            hasMore: games.length === limit,
          },
        },
        response_format,
        games.length
          ? [
              "WTF Console personal library:",
              ...games.map((game) =>
                `- ${game.title} (${game.slug}) ${game.isDemo ? "stock" : game.category || "owned"}`
              ),
            ].join("\n")
          : "No active WTF Console games found."
      );
    }
  );

  server.registerTool(
    "wtf_get_console_stats",
    {
      title: "Get WTF Console Stats",
      description:
        "Get aggregate WTF Console health stats for the personal stock-console surface only. Public Arcade/source/creator games are excluded.",
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
      const gate = await requireMcpFeature("console", "wtf_get_console_stats", response_format);
      if (!gate.ok) return gate.error!;

      const stats = await getConsoleStats();
      return toolResult(
        { ok: true, stats },
        response_format,
        [
          "WTF Console stats:",
          `- ${stats.publishedGames} live game(s), ${stats.totalGames} total catalog row(s)`,
          `- ${stats.totalPlays} play(s), ${stats.totalPlayers} player slot(s), ${stats.totalScores} valid score(s)`,
          `- ${stats.totalConsoleXp} Console XP awarded, ${stats.openReports} open report(s)`,
          stats.topCategories.length
            ? `- Top categories: ${stats.topCategories
                .map((entry) => `${entry.category} (${entry.games})`)
                .join(", ")}`
            : "- No category activity yet.",
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "wtf_get_console_discovery_shelves",
    {
      title: "Get WTF Console Discovery Shelves",
      description:
        "Get active WTF Console discovery shelves for the stock console surface. Public Arcade/source/creator games are excluded.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).default(8),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit, response_format }) => {
      const gate = await requireMcpFeature(
        "console",
        "wtf_get_console_discovery_shelves",
        response_format
      );
      if (!gate.ok) return gate.error!;

      const shelves = await getConsoleDiscoveryShelves(limit, { surface: "console" });
      return toolResult(
        {
          ok: true,
          shelves,
          pagination: {
            limit,
          },
        },
        response_format,
        [
          "WTF Console discovery shelves:",
          ...[
            ["popular", shelves.popular],
            ["newest", shelves.newest],
          ].map(
            ([name, games]) =>
              `- ${name}: ${(games as typeof shelves.popular)
                .map((game) => `${game.title} (${game.slug})`)
                .join(", ") || "empty"}`
          ),
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "wtf_list_console_players",
    {
      title: "List WTF Console Players",
      description:
        "List top public WTF Console players ranked by Console XP, score volume, plays, and first-place finishes.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(25),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit, response_format }) => {
      const gate = await requireMcpFeature("console", "wtf_list_console_players", response_format);
      if (!gate.ok) return gate.error!;

      const players = await getConsolePlayerLeaderboard(limit, { surface: "console" });
      return toolResult(
        {
          ok: true,
          players,
          pagination: {
            limit,
            count: players.length,
            hasMore: players.length === limit,
          },
        },
        response_format,
        players.length
          ? [
              "Top WTF Console players:",
              ...players.map((player) =>
                `#${player.rank} ${player.displayName || player.username}: ${player.consoleXp} XP, ${player.totalPlays} play(s), ${player.firstPlaceCount} first-place game(s)`
              ),
            ].join("\n")
          : "No WTF Console player activity found."
      );
    }
  );

  server.registerTool(
    "wtf_list_console_recent_scores",
    {
      title: "List Recent Console Scores",
      description:
        "List recent valid public WTF Console score submissions with game, player, score, and timestamp.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).default(25),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit, response_format }) => {
      const gate = await requireMcpFeature(
        "console",
        "wtf_list_console_recent_scores",
        response_format
      );
      if (!gate.ok) return gate.error!;

      const scores = await getRecentConsoleScores(limit, { surface: "console" });
      return toolResult(
        {
          ok: true,
          scores,
          pagination: {
            limit,
            count: scores.length,
            hasMore: scores.length === limit,
          },
        },
        response_format,
        scores.length
          ? [
              "Recent WTF Console scores:",
              ...scores.map(
                (score) =>
                  `- ${score.displayName || score.username} scored ${score.score.toLocaleString()} on ${score.title} (${score.slug})`
              ),
            ].join("\n")
          : "No recent WTF Console scores found."
      );
    }
  );

  server.registerTool(
    "wtf_list_console_audit_events",
    {
      title: "List Console Audit Events",
      description:
        "List recent WTF Console moderation/import/score audit events. Requires an admin WTF user and console:admin MCP scope.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(200).default(50),
        action: z.string().trim().max(80).optional(),
        game_slug: z.string().trim().max(160).optional(),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit, action, game_slug, response_format }) => {
      const gate = await requireMcpFeature(
        "console",
        "wtf_list_console_audit_events",
        response_format
      );
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["console:admin"],
        "wtf_list_console_audit_events",
        response_format
      );
      if (scopeError) return scopeError;
      const adminError = requireMcpAdmin(
        auth,
        "wtf_list_console_audit_events",
        response_format
      );
      if (adminError) return adminError;

      const events = await listConsoleAuditEvents({
        limit,
        action,
        gameSlug: game_slug,
        surface: "console",
      });
      return toolResult(
        { ok: true, events },
        response_format,
        events.length
          ? [
              "Recent Console audit events:",
              ...events
                .slice(0, 20)
                .map((event) =>
                  `- ${event.action} ${event.slug || "system"} by ${event.actorUsername || "system"}`
                ),
            ].join("\n")
          : "No Console audit events matched the filter."
      );
    }
  );

  server.registerTool(
    "wtf_list_game_studio_assets",
    {
      title: "List Game Studio Assets",
      description:
        "List stock assets and templates available in the WTF Game Studio creator app.",
      inputSchema: z.object({
        kind: z
          .enum([
            "all",
            "sprite",
            "tileset",
            "background",
            "audio",
            "ui",
            "font",
            "shader",
            "model",
          ])
          .default("all"),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ kind, response_format }) => {
      const gate = await requireMcpFeature(
        "game-studio",
        "wtf_list_game_studio_assets",
        response_format
      );
      if (!gate.ok) return gate.error!;

      const stockAssets =
        kind === "all"
          ? GAME_STUDIO_STOCK_ASSETS
          : GAME_STUDIO_STOCK_ASSETS.filter((asset) => asset.kind === kind);
      const assets = listGameStudioStockAssetDescriptors(stockAssets);
      return toolResult(
        {
          ok: true,
          templates: GAME_STUDIO_TEMPLATES,
          assets,
        },
        response_format,
        [
          `Game Studio templates: ${GAME_STUDIO_TEMPLATES.length}`,
          `Stock assets: ${assets.length}`,
          ...assets
            .slice(0, 20)
            .map((asset) => `- ${asset.title} (${asset.kind}) -> ${asset.bundlePath}`),
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "wtf_list_game_studio_snippets",
    {
      title: "List Game Studio Code Snippets",
      description:
        "List copy-ready WTF Game SDK and browser-game code snippets available in the Game Studio creator app.",
      inputSchema: z.object({
        category: z
          .enum(["all", "sdk", "input", "physics", "spawning", "ui"])
          .default("all"),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ category, response_format }) => {
      const gate = await requireMcpFeature(
        "game-studio",
        "wtf_list_game_studio_snippets",
        response_format
      );
      if (!gate.ok) return gate.error!;

      const snippetRows =
        category === "all"
          ? GAME_STUDIO_CODE_SNIPPETS
          : GAME_STUDIO_CODE_SNIPPETS.filter((snippet) => snippet.category === category);
      const snippets = listGameStudioCodeSnippets(snippetRows);
      return toolResult(
        {
          ok: true,
          snippets,
        },
        response_format,
        snippets.length
          ? [
              "Game Studio code snippets:",
              ...snippets.map(
                (snippet) => `- ${snippet.title} (${snippet.category}) -> ${snippet.targetFile}`
              ),
            ].join("\n")
          : "No Game Studio code snippets matched the filter."
      );
    }
  );

  server.registerTool(
    "wtf_list_game_studio_targets",
    {
      title: "List Game Studio Targets",
      description:
        "List the WTF Game Studio SDK target surfaces: WTF Arcade for public paid play, and WTF Console for personal owned media.",
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
      const gate = await requireMcpFeature(
        "game-studio",
        "wtf_list_game_studio_targets",
        response_format
      );
      if (!gate.ok) return gate.error!;

      return toolResult(
        {
          ok: true,
          targets: GAME_STUDIO_TARGETS,
        },
        response_format,
        [
          "Game Studio targets:",
          ...GAME_STUDIO_TARGETS.map(
            (target) => `- ${target.label}: ${target.mode} (${target.publishEndpoint || "download/import"})`
          ),
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "wtf_create_game_studio_scaffold",
    {
      title: "Create Game Studio Scaffold",
      description:
        "Generate a starter browser-game project scaffold wired to the WTF Game SDK.",
      inputSchema: z.object({
        template_id: z.string().trim().max(80).default("endless-runner"),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ template_id, response_format }) => {
      const gate = await requireMcpFeature(
        "game-studio",
        "wtf_create_game_studio_scaffold",
        response_format
      );
      if (!gate.ok) return gate.error!;

      const scaffold = buildGameStudioScaffold(template_id);
      return toolResult(
        {
          ok: true,
          scaffold,
        },
        response_format,
        [
          `Generated ${scaffold.template.title} scaffold.`,
          ...Object.keys(scaffold.files).map((file) => `- ${file}`),
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "wtf_build_game_studio_bundle",
    {
      title: "Build Game Studio Bundle",
      description:
        "Build an SDK-compatible ZIP bundle from a Game Studio template and selected stock assets.",
      inputSchema: z.object({
        template_id: z.string().trim().max(80).default("endless-runner"),
        title: z.string().trim().max(200).default("Game Studio Draft"),
        selected_asset_ids: z.array(z.string().trim().max(120)).default([]),
        include_file_data: z.boolean().default(false),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ template_id, title, selected_asset_ids, include_file_data, response_format }) => {
      const gate = await requireMcpFeature(
        "game-studio",
        "wtf_build_game_studio_bundle",
        response_format
      );
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["game-studio:write"],
        "wtf_build_game_studio_bundle",
        response_format
      );
      if (scopeError) return scopeError;

      const scaffold = buildGameStudioScaffold(template_id);
      const { zip, manifest } = buildGameStudioZip({
        title,
        slug: normalizeConsoleSlug(title),
        template: scaffold.template,
        files: scaffold.files,
        selectedAssetIds: selected_asset_ids,
      });
      return toolResult(
        {
          ok: true,
          filename: `${manifest.slug}.zip`,
          mimeType: "application/zip",
          sizeBytes: zip.length,
          manifest,
          ...(include_file_data
            ? { fileData: `data:application/zip;base64,${zip.toString("base64")}` }
            : {}),
        },
        response_format,
        [
          `Built ${manifest.title} as ${manifest.slug}.zip.`,
          `Files: ${manifest.files.length}`,
          `Size: ${zip.length} bytes`,
        ].join("\n")
      );
    }
  );

  const GameStudioFilesSchema = z
    .record(z.string(), z.string().max(1_000_000))
    .optional()
    .describe("Optional project files keyed by relative path, e.g. index.html, styles.css, game.js.");
  const GameStudioLocalAssetsSchema = z
    .array(
      z.object({
        id: z.string().trim().max(180).optional(),
        name: z.string().trim().min(1).max(160),
        size: z.number().int().min(0).max(2_097_152),
        type: z.string().trim().min(1).max(120),
        dataBase64: z.string().max(3_000_000).optional(),
      })
    )
    .max(40)
    .optional()
    .describe("Optional uploaded asset descriptors. dataBase64 may be omitted for planning-only assets.");

  server.registerTool(
    "wtf_list_game_studio_projects",
    {
      title: "List Game Studio Projects",
      description:
        "List saved Game Studio projects owned by the paired user, including last build and submission metadata.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ limit, response_format }) => {
      const gate = await requireMcpFeature(
        "game-studio",
        "wtf_list_game_studio_projects",
        response_format
      );
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["game-studio:read"],
        "wtf_list_game_studio_projects",
        response_format
      );
      if (scopeError) return scopeError;

      const projects = (await listGameStudioProjects(auth.user.id)).slice(0, limit);
      return toolResult(
        {
          ok: true,
          projects,
          pagination: {
            limit,
            count: projects.length,
            hasMore: projects.length === limit,
          },
        },
        response_format,
        projects.length
          ? [
              "Game Studio projects:",
              ...projects.map((project) =>
                `- #${project.id} ${project.title} (${project.slug}) ${project.status}`
              ),
            ].join("\n")
          : "No saved Game Studio projects found."
      );
    }
  );

  server.registerTool(
    "wtf_create_game_studio_project",
    {
      title: "Create Game Studio Project",
      description:
        "Create a saved Game Studio project for the paired user from a template, optional source files, and optional stock or uploaded assets.",
      inputSchema: z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(2000).optional(),
        template_id: z.string().trim().max(120).default("endless-runner"),
        selected_asset_ids: z.array(z.string().trim().max(120)).max(100).default([]),
        local_assets: GameStudioLocalAssetsSchema,
        files: GameStudioFilesSchema,
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      title,
      description,
      template_id,
      selected_asset_ids,
      local_assets,
      files,
      response_format,
    }) => {
      const gate = await requireMcpFeature(
        "game-studio",
        "wtf_create_game_studio_project",
        response_format
      );
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["game-studio:write"],
        "wtf_create_game_studio_project",
        response_format
      );
      if (scopeError) return scopeError;

      const project = await createGameStudioProject({
        ownerUserId: auth.user.id,
        title,
        description,
        templateId: template_id,
        selectedAssetIds: selected_asset_ids,
        localAssets: local_assets,
        files,
      });
      return toolResult(
        { ok: true, project },
        response_format,
        `Created Game Studio project #${project.id}: ${project.title} (${project.slug}).`
      );
    }
  );

  server.registerTool(
    "wtf_update_game_studio_project",
    {
      title: "Update Game Studio Project",
      description:
        "Update a saved Game Studio project owned by the paired user. Only supplied fields are changed.",
      inputSchema: z.object({
        project_id: z.number().int().min(1),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(2000).optional(),
        template_id: z.string().trim().max(120).optional(),
        selected_asset_ids: z.array(z.string().trim().max(120)).max(100).optional(),
        local_assets: GameStudioLocalAssetsSchema,
        files: GameStudioFilesSchema,
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({
      project_id,
      title,
      description,
      template_id,
      selected_asset_ids,
      local_assets,
      files,
      response_format,
    }) => {
      const gate = await requireMcpFeature(
        "game-studio",
        "wtf_update_game_studio_project",
        response_format
      );
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["game-studio:write"],
        "wtf_update_game_studio_project",
        response_format
      );
      if (scopeError) return scopeError;

      const project = await updateGameStudioProject({
        ownerUserId: auth.user.id,
        id: project_id,
        title,
        description,
        templateId: template_id,
        selectedAssetIds: selected_asset_ids,
        localAssets: local_assets,
        files,
      });
      return toolResult(
        { ok: true, project },
        response_format,
        `Updated Game Studio project #${project.id}: ${project.title}.`
      );
    }
  );

  server.registerTool(
    "wtf_build_game_studio_project",
    {
      title: "Build Game Studio Project",
      description:
        "Build and validate a saved Game Studio project, recording a build snapshot and returning SDK-compatible ZIP metadata.",
      inputSchema: z.object({
        project_id: z.number().int().min(1),
        include_file_data: z.boolean().default(false),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ project_id, include_file_data, response_format }) => {
      const gate = await requireMcpFeature(
        "game-studio",
        "wtf_build_game_studio_project",
        response_format
      );
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["game-studio:write"],
        "wtf_build_game_studio_project",
        response_format
      );
      if (scopeError) return scopeError;

      const built = await buildGameStudioProjectBundle({
        ownerUserId: auth.user.id,
        id: project_id,
      });
      const { fileData, ...summary } = built;
      return toolResult(
        {
          ok: true,
          ...summary,
          ...(include_file_data ? { fileData } : {}),
        },
        response_format,
        [
          `Built ${built.project.title} as ${built.filename}.`,
          `Build #${built.build.buildNumber}`,
          `Size: ${built.sizeBytes} bytes`,
          `Checksum: ${built.build.checksumSha256}`,
        ].join("\n")
      );
    }
  );

  server.registerTool(
    "wtf_submit_game_studio_project_to_arcade",
    {
      title: "Submit Game Studio Project To Arcade",
      description:
        "Build a saved Game Studio project and submit it to WTF Arcade review or the paired user's trusted creator auto-publish lane. Use update_slug to submit a new version of one of the paired user's existing Arcade games.",
      inputSchema: z.object({
        project_id: z.number().int().min(1),
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(1000).optional(),
        category: z.string().trim().max(80).optional(),
        update_slug: z.string().trim().max(120).optional(),
        max_possible_score: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
        max_score_per_second: z.number().int().min(0).max(1_000_000_000).optional(),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      project_id,
      title,
      description,
      category,
      update_slug,
      max_possible_score,
      max_score_per_second,
      response_format,
    }) => {
      const studioGate = await requireMcpFeature(
        "game-studio",
        "wtf_submit_game_studio_project_to_arcade",
        response_format
      );
      if (!studioGate.ok) return studioGate.error!;
      const arcadeGate = await requireMcpFeature(
        "arcade",
        "wtf_submit_game_studio_project_to_arcade",
        response_format
      );
      if (!arcadeGate.ok) return arcadeGate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["game-studio:write", "arcade:write"],
        "wtf_submit_game_studio_project_to_arcade",
        response_format
      );
      if (scopeError) return scopeError;

      const submitted = await submitGameStudioProjectToArcade({
        ownerUserId: auth.user.id,
        id: project_id,
        user: auth.user,
        title,
        description,
        category,
        updateSlug: update_slug,
        maxPossibleScore: max_possible_score,
        maxScorePerSecond: max_score_per_second,
      });
      return toolResult(
        { ok: true, ...submitted },
        response_format,
        submitted.game.status === "active"
          ? `${submitted.game.title} is live in WTF Arcade as ${submitted.game.slug}.`
          : `${submitted.game.title} was submitted to WTF Arcade as ${submitted.game.slug}.`
      );
    }
  );

  server.registerTool(
    "wtf_create_trusted_creator_market_item",
    {
      title: "Create Trusted Creator Market Item",
      description:
        "Create an EXP-priced in-app market item in the paired user's trusted market creator lane. Requires the paired WTF user to have the trusted_market_creator permission.",
      inputSchema: z.object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(800).optional(),
        category: z
          .enum([
            "desktop_fun",
            "desktop_pet",
            "system_appearance",
            "tv",
            "arcade",
            "studio",
            "preservation",
          ])
          .default("desktop_fun"),
        kind: z.string().trim().max(60).default("creator-item"),
        sku: z.string().trim().max(80).optional(),
        price_exp: z.number().int().min(1).max(1_000_000).default(100),
        stock_quantity: z.number().int().min(1).max(999_999).default(25),
        metadata: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
          .default({}),
        response_format: ResponseFormatSchema,
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      name,
      description,
      category,
      kind,
      sku,
      price_exp,
      stock_quantity,
      metadata,
      response_format,
    }) => {
      const gate = await requireMcpFeature(
        "wtfiam",
        "wtf_create_trusted_creator_market_item",
        response_format
      );
      if (!gate.ok) return gate.error!;
      const scopeError = requireMcpScopes(
        auth,
        ["market:write"],
        "wtf_create_trusted_creator_market_item",
        response_format
      );
      if (scopeError) return scopeError;

      const item = await createTrustedCreatorMarketItem(auth.user, {
        name,
        description,
        category,
        kind,
        sku,
        priceExp: price_exp,
        stockQuantity: stock_quantity,
        metadata,
      });
      return toolResult(
        { ok: true, item },
        response_format,
        `Created in-app market item ${item.name} (${item.sku}) for ${item.priceExp} EXP.`
      );
    }
  );

  registerCrpNominationMcpTools(server, auth);

  return server;
}
