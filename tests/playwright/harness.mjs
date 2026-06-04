// Playwright local harness: serves the built W microapp client (dist/public)
// and mocks every backend endpoint W.tsx hits, so we can drive the UI in a
// headless browser without Postgres / X API credentials.
//
// State is mutable via POST /__test/state — the test sets the desired
// scenario ("normal", "rate-limited", "cold") and then hits the page.

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../../dist/public");
const PORT = Number(process.env.HARNESS_PORT || 4173);

const state = {
  mode: "normal", // "normal" | "rate-limited" | "cold-rate-limited" | "ok-after-rate-limit"
  userRole: "admin",
  groupchatRequestCount: 0,
  groupchatLog: [],
  interactionLog: [],
  skywirePostPayloads: [],
  skywireFollowPayloads: [],
  wtfLiveOwnedRoom: { id: "my-room", title: "My Room", kind: "room", description: "Owned public room", source: "user", ownerUserId: 1, isPublic: true },
};

function nowIso() {
  return new Date().toISOString();
}

function logRequest(req) {
  state.groupchatLog.push({ ts: Date.now(), path: req.originalUrl });
}

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/__test/media/harness-alpha-token.png", (_req, res) => {
  res
    .type("image/png")
    .send(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64"));
});

// ── Test control ────────────────────────────────────────────────
app.post("/__test/state", (req, res) => {
  state.mode = String(req.body?.mode || "normal");
  state.userRole = String(req.body?.userRole || req.body?.role || "admin");
  state.groupchatRequestCount = 0;
  state.groupchatLog = [];
  state.interactionLog = [];
  state.skywirePostPayloads = [];
  state.skywireFollowPayloads = [];
  state.wtfLiveOwnedRoom = { id: "my-room", title: "My Room", kind: "room", description: "Owned public room", source: "user", ownerUserId: 1, isPublic: true };
  resetHarnessMarketState();
  res.json({ ok: true, state: { mode: state.mode, userRole: state.userRole } });
});

app.get("/__test/state", (_req, res) => {
  res.json({
    mode: state.mode,
    userRole: state.userRole,
    groupchatRequestCount: state.groupchatRequestCount,
    groupchatLog: state.groupchatLog,
    interactionLog: state.interactionLog,
    skywirePostPayloads: state.skywirePostPayloads,
    skywireFollowPayloads: state.skywireFollowPayloads,
  });
});

app.post("/__test/e2e/interaction", (req, res) => {
  const eventType = String(req.body?.handle || req.body?.eventType || "");
  const sourceDomain = String(req.body?.domain || "unknown");
  const sourceSubdomain = String(req.body?.subdomain || "unknown");
  const event = {
    id: `evt_${Date.now()}_${state.interactionLog.length}`,
    eventType,
    userId: req.body?.userId ?? 1,
    walletAddress: req.body?.walletAddress ?? "tz1-test-wallet",
    timestamp: new Date().toISOString(),
    source: `${sourceDomain}/${sourceSubdomain}`,
    metadata: req.body?.metadata ?? {},
    rawReferenceId: req.body?.rawReferenceId ?? `${sourceSubdomain}:${eventType}`,
  };
  state.interactionLog.push(event);
  res.json({ ok: Boolean(eventType), event });
});

// ── Auth ────────────────────────────────────────────────────────
app.get("/api/auth/csrf-token", (_req, res) => {
  res.json({ csrfToken: "test-csrf-token" });
});

app.get("/api/auth/user", (_req, res) => {
  if (state.userRole === "anonymous") {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({
    id: 1,
    username: state.userRole === "admin" ? "wtf-admin" : "wtf-user",
    displayName: state.userRole === "admin" ? "WTF Admin" : "WTF User",
    role: state.userRole,
    twitterHandle: "wtf_admin",
    twitterVerified: true,
    twitterPublic: true,
    welcomedToWtfOs: true,
    welcomedToWtfOsAt: "2026-01-01T00:00:00Z",
    gmWelcomeUtcDay: new Date().toISOString().slice(0, 10),
    gmWelcomeLastSeenAt: nowIso(),
    gmWelcome: null,
    createdAt: "2026-01-01T00:00:00Z",
    effectivePermissions:
      state.userRole === "admin"
        ? {
            access_admin_panel: true,
            manage_roles: true,
            manage_desktop_apps: true,
            manage_gameshow: true,
            manage_rewards: true,
          }
        : {},
  });
});

app.post("/api/auth/welcome/complete", (_req, res) => {
  res.json({
    id: 1,
    username: state.userRole === "admin" ? "wtf-admin" : "wtf-user",
    displayName: state.userRole === "admin" ? "WTF Admin" : "WTF User",
    role: state.userRole,
    welcomedToWtfOs: true,
    welcomedToWtfOsAt: nowIso(),
    gmWelcomeUtcDay: new Date().toISOString().slice(0, 10),
    gmWelcomeLastSeenAt: nowIso(),
    gmWelcome: null,
    createdAt: "2026-01-01T00:00:00Z",
    effectivePermissions: {},
  });
});

app.post("/api/auth/gm-welcome/complete", (_req, res) => {
  res.json({
    id: 1,
    username: state.userRole === "admin" ? "wtf-admin" : "wtf-user",
    displayName: state.userRole === "admin" ? "WTF Admin" : "WTF User",
    role: state.userRole,
    welcomedToWtfOs: true,
    welcomedToWtfOsAt: "2026-01-01T00:00:00Z",
    gmWelcomeUtcDay: new Date().toISOString().slice(0, 10),
    gmWelcomeLastSeenAt: nowIso(),
    gmWelcome: null,
    createdAt: "2026-01-01T00:00:00Z",
    effectivePermissions: {},
  });
});

const desktopAppearance = {
  appearanceStyleKey: "classic-95",
  colorSchemeKey: "wtf-teal",
  desktopColor: "#008080",
  windowColor: "#c0c0c0",
  activeTitleColor: "#000080",
  activeTitleTextColor: "#ffffff",
  inactiveTitleColor: "#808080",
  inactiveTitleTextColor: "#c0c0c0",
  textColor: "#000000",
  highlightColor: "#000080",
  buttonFace: "#c0c0c0",
  backgroundImageUrl: null,
  backgroundFit: "cover",
  cursorStyle: "eggplant",
  desktopPhysicsEnabled: false,
  desktopGravityMode: "on",
  desktopPetEnabled: false,
};

const desktopApps = {
  wtfiam: true,
  hoard: true,
  wim: true,
  w: true,
  tv: true,
  dicksword: true,
  "i-hate-telegram": true,
  "dear-diary": true,
  arcade: true,
  casino: true,
  "dues-manager": false,
  console: true,
  "game-studio": true,
  studio: true,
  gallery: true,
  skywire: true,
  "wtf-live": true,
  tz2at: true,
  "rat-race": true,
  "map-lab": true,
  mail: true,
};

const sampleSeason = {
  id: 1,
  title: "E2E Season",
  name: "E2E Season",
  status: "active",
  description: "Inventory harness season",
};

const sampleRound = {
  id: 1,
  seasonId: 1,
  title: "E2E Round",
  name: "E2E Round",
  status: "active",
  startsAt: null,
  endsAt: null,
};

const sampleChallenge = {
  id: 1,
  title: "Community Warm-Up Challenge",
  description: "Complete a small bundle of community actions before the show.",
  status: "active",
  rewardXp: 50,
  rewardAmountWtf: 5,
  roundId: 1,
};

const sampleSideQuest = {
  id: 1,
  title: "Profile Spark",
  description: "Add a little personality to your WTF profile.",
  status: "active",
  rewardXp: 25,
  rewardAmountWtf: 1,
  autoVerifyType: "profile_bio",
  completionCount: 2,
  approvedCompletionCount: 2,
};

const sampleDailySideQuests = {
  completionKey: new Date().toISOString().slice(0, 10),
  resetAtUtc: "00:00",
  nextResetAt: new Date(Date.now() + 86_400_000).toISOString(),
  loops: [
    {
      id: 101,
      title: "Daily Social Check-In",
      description: "Post once on the message board.",
      route: "/messageboard",
      actionLabel: "Post",
      category: "social",
      order: 1,
      rewards: { xp: 15, wtf: 1 },
      claimRequired: true,
      verifiedToday: true,
      claimableToday: true,
      claimedToday: false,
      completedToday: false,
      verifiedByCount: 4,
      completedByCount: 3,
      rewardStatus: "pending",
    },
    {
      id: 102,
      title: "Daily Studio Note",
      description: "Create a Dear Diary entry.",
      route: "/dear-diary",
      actionLabel: "Write",
      category: "creative",
      order: 2,
      rewards: { xp: 20, wtf: 1 },
      claimRequired: true,
      verifiedToday: false,
      claimableToday: false,
      claimedToday: false,
      completedToday: false,
      verifiedByCount: 1,
      completedByCount: 1,
      rewardStatus: null,
    },
  ],
};

const sampleTvChannel = {
  id: 3,
  ownerUserId: 1,
  slug: "wtf-tv",
  title: "WTF TV",
  description: "Harness TV channel",
  isPublic: true,
  ownerUsername: "wtf-admin",
  ownerDisplayName: "WTF Admin",
  dialNumber: 3,
  videosPerBumper: 4,
};

const sampleBoardCategories = [
  { id: 1, name: "General", slug: "general", sortOrder: 1 },
];
const sampleBoardChannels = [
  {
    id: 1,
    categoryId: 1,
    name: "Announcements",
    slug: "announcements",
    description: "Harness channel",
    sortOrder: 1,
    locked: false,
    canView: true,
    canPost: true,
  },
];
const sampleBoardMessages = [
  {
    id: 1,
    channelId: 1,
    userId: 1,
    username: "wtf-admin",
    displayName: "WTF Admin",
    body: "Harness board message",
    content: "Harness board message",
    createdAt: "2026-05-08T00:00:00.000Z",
    pinned: false,
    reactions: [],
  },
];
const sampleDiaryEntries = [
  {
    id: 1,
    userId: 1,
    title: "Harness note to future me",
    body: "Remember that the desktop opened cleanly.",
    classification: "memoir",
    tags: ["harness", "future-me"],
    entryAt: "2026-05-09T12:00:00.000Z",
    crossRefs: [],
    createdAt: "2026-05-09T12:00:00.000Z",
    updatedAt: "2026-05-09T12:00:00.000Z",
  },
];

const WHOLE_WTF_RAW = 100_000_000n;

const pricingTiers = [
  { tier: 1, key: "common", label: "Common", curve: "linear", minWtf: 1, maxWtf: 99, anchorCount: 2 },
  { tier: 2, key: "uncommon", label: "Uncommon", curve: "linear", minWtf: 100, maxWtf: 499, anchorCount: 1 },
  { tier: 3, key: "rare", label: "Rare", curve: "linear", minWtf: 500, maxWtf: 1999, anchorCount: 0 },
  { tier: 4, key: "epic", label: "Epic", curve: "log", minWtf: 2000, maxWtf: 9999, anchorCount: 0 },
  { tier: 5, key: "legendary", label: "Legendary", curve: "log", minWtf: 10000, maxWtf: 49999, anchorCount: 0 },
  { tier: 6, key: "mythic", label: "Mythic", curve: "log", minWtf: 50000, maxWtf: 250000, anchorCount: 0 },
];

function wholeWtfUnits(value) {
  return (BigInt(Math.max(0, Math.floor(Number(value) || 0))) * WHOLE_WTF_RAW).toString();
}

function formatHarnessWtf(rawUnits) {
  return (Number(BigInt(String(rawUnits || "0"))) / Number(WHOLE_WTF_RAW)).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function applyHarnessDiscount(rawUnits, discountPercent) {
  const raw = BigInt(String(rawUnits || "0"));
  const percent = BigInt(Math.max(0, Math.min(99, Math.floor(Number(discountPercent) || 0))));
  if (raw <= 0n || percent <= 0n) return raw;
  return (raw * (100n - percent) + 99n) / 100n;
}

function ceilHarnessWholeWtf(rawUnits) {
  const raw = BigInt(String(rawUnits || "0"));
  if (raw <= 0n) return 0n;
  return ((raw + WHOLE_WTF_RAW - 1n) / WHOLE_WTF_RAW) * WHOLE_WTF_RAW;
}

function makeHarnessMarketItem(input) {
  const priceWtfUnits = wholeWtfUnits(input.priceWtfWhole);
  return {
    id: input.id,
    sku: input.sku,
    name: input.name,
    description: input.description,
    category: input.category,
    kind: input.kind,
    priceWtfUnits,
    priceWtfFormatted: formatHarnessWtf(priceWtfUnits),
    priceExp: input.priceExp ?? input.priceWtfWhole * 10,
    contractAddress: null,
    contractListingId: null,
    metadata: input.metadata ?? { kind: input.kind },
    stockQuantity: input.stockQuantity ?? 1000,
    quantityOwned: 0,
    active: true,
    rarityTier: input.rarityTier,
    rarityLabel: pricingTiers.find((tier) => tier.tier === input.rarityTier)?.label ?? "Common",
    priceScore: input.priceScore,
    priceWtfLocked: Boolean(input.priceWtfLocked),
    priceScoreLocked: Boolean(input.priceScoreLocked),
    sortOrder: input.sortOrder ?? input.id,
    updatedAt: "2026-05-08T00:00:00.000Z",
  };
}

function makeHarnessMarketState() {
  return {
    sales: [],
    nextSaleId: 1,
    items: [
      makeHarnessMarketItem({
        id: 1,
        sku: "arcade-play-card",
        name: "WTF Arcade Play Card",
        description: "The cheapest physical-ish ecosystem anchor.",
        category: "arcade",
        kind: "arcade-play-card",
        priceWtfWhole: 1,
        priceExp: 0,
        rarityTier: 1,
        priceScore: 1,
        priceWtfLocked: true,
        priceScoreLocked: true,
        metadata: { kind: "arcade-play-card", surface: "arcade", loads: "arcade-play-ticket" },
      }),
      makeHarnessMarketItem({
        id: 2,
        sku: "arcade-play-ticket",
        name: "WTF Arcade Credit",
        description: "One paid Arcade machine credit loaded to a play card.",
        category: "arcade",
        kind: "arcade-play-ticket",
        priceWtfWhole: 10,
        priceExp: 0,
        rarityTier: 1,
        priceScore: 2,
        priceWtfLocked: true,
        priceScoreLocked: true,
        metadata: { kind: "arcade-play-ticket", surface: "arcade", loadsOnto: "arcade-play-card" },
      }),
      makeHarnessMarketItem({
        id: 5,
        sku: "casino-app-pass",
        name: "WTF Casino App",
        description: "Unlocks the WTF Casino desktop app.",
        category: "casino",
        kind: "casino-app-pass",
        priceWtfWhole: 100,
        priceExp: 1000,
        rarityTier: 2,
        priceScore: 1,
        priceWtfLocked: false,
        priceScoreLocked: true,
        metadata: { kind: "casino-app-pass", surface: "casino", entitlement: "casino-app" },
      }),
      makeHarnessMarketItem({
        id: 3,
        sku: "desktop-mop",
        name: "Desktop Mop",
        description: "Tier-two floor cleanup utility.",
        category: "desktop_pet",
        kind: "desktop-mop",
        priceWtfWhole: 100,
        rarityTier: 2,
        priceScore: 1,
        priceWtfLocked: true,
        priceScoreLocked: true,
        metadata: { kind: "desktop-mop", tierAnchor: "tier-2-floor" },
      }),
      makeHarnessMarketItem({
        id: 4,
        sku: "desktop-vacuum",
        name: "Desktop Vacuum",
        description: "Rare cleanup utility for stronger desktop effects.",
        category: "desktop_pet",
        kind: "desktop-vacuum",
        priceWtfWhole: 700,
        rarityTier: 3,
        priceScore: 2,
        priceWtfLocked: false,
        priceScoreLocked: true,
        metadata: { kind: "desktop-vacuum", pricingRole: "rare-cleanup-tool" },
      }),
    ],
  };
}

let marketState = makeHarnessMarketState();

function resetHarnessMarketState() {
  marketState = makeHarnessMarketState();
}

function activeHarnessSales() {
  return marketState.sales.filter((sale) => sale.active);
}

function bestHarnessSaleForItem(item) {
  return activeHarnessSales()
    .filter((sale) => (sale.sku && sale.sku === item.sku) || (!sale.sku && sale.category === item.category))
    .sort((a, b) => b.discountPercent - a.discountPercent || (b.sku ? 1 : 0) - (a.sku ? 1 : 0) || b.id - a.id)[0] ?? null;
}

function serializeHarnessSaleForItem(sale, item) {
  if (!sale) return null;
  const saleRaw = ceilHarnessWholeWtf(applyHarnessDiscount(item.priceWtfUnits, sale.discountPercent)).toString();
  return {
    id: sale.id,
    name: sale.name,
    discountPercent: sale.discountPercent,
    category: sale.category,
    sku: sale.sku,
    salePriceWtfUnits: saleRaw,
    salePriceWtfFormatted: formatHarnessWtf(saleRaw),
  };
}

function serializeHarnessMarketItem(item, { admin = false } = {}) {
  const sale = serializeHarnessSaleForItem(bestHarnessSaleForItem(item), item);
  const publicItem = {
    ...item,
    sale,
  };
  if (!admin) return publicItem;
  return {
    ...publicItem,
    suggestedPriceWtfUnits: item.priceWtfUnits,
    suggestedPriceWtfFormatted: item.priceWtfFormatted,
    pricingDriftWholeWtf: 0,
  };
}

function serializeHarnessMarketSale(sale) {
  return {
    ...sale,
    startsAt: sale.startsAt ?? null,
    endsAt: sale.endsAt ?? null,
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
  };
}

function harnessMarketAdminPayload(extra = {}) {
  return {
    ...extra,
    items: marketState.items.map((item) => serializeHarnessMarketItem(item, { admin: true })),
    sales: marketState.sales.map(serializeHarnessMarketSale),
    pricing: {
      unitRaw: WHOLE_WTF_RAW.toString(),
      tiers: pricingTiers,
      activeSales: activeHarnessSales().map(serializeHarnessMarketSale),
    },
  };
}

function emptyPage(itemsKey = "items") {
  return { [itemsKey]: [], total: 0, limit: 20, offset: 0 };
}

function consolePayload(surface = "console") {
  return {
    games: [],
    items: [],
    cartridges: [],
    surface,
    pageInfo: { limit: 20, offset: 0, total: 0 },
  };
}

function consoleCatalogPayload(surface = "console") {
  const payment = {
    sku: "arcade-play-ticket",
    currency: "wtf",
    feeWtfUnits: WHOLE_WTF_RAW.toString(),
    feeWtfFormatted: "1",
    contractAddress: null,
    routerListingId: 0,
    configured: false,
  };
  return {
    demos: [],
    published: [],
    mine: [],
    all: [],
    surface,
    ...(surface === "arcade" ? { payment } : {}),
  };
}

function consoleStatsPayload() {
  return {
    totalGames: 0,
    publishedGames: 0,
    pendingGames: 0,
    sourceArcadeGames: 0,
    creatorGames: 0,
    gameStudioGames: 0,
    totalPlays: 0,
    totalPlayers: 0,
    totalScores: 0,
    totalConsoleXp: 0,
    openReports: 0,
    latestSourceArcadeImportAt: null,
    latestConsoleActivityAt: null,
    topCategories: [],
  };
}

function consoleDiscoveryPayload() {
  return {
    popular: [],
    newest: [],
    sourceArcade: [],
    creator: [],
    studio: [],
  };
}

function arcadePlayFeePayload() {
  return {
    payment: {
      sku: "arcade-play-ticket",
      currency: "wtf",
      feeWtfUnits: WHOLE_WTF_RAW.toString(),
      feeWtfFormatted: "1",
      contractAddress: null,
      routerListingId: 0,
      configured: false,
    },
  };
}

function arcadePlayStatusPayload() {
  return {
    userId: 1,
    sku: "arcade-play-ticket",
    ticketsOwned: 0,
    bypass: true,
    canPlay: true,
    payment: arcadePlayFeePayload().payment,
  };
}

function desktopAppListEntry(key, enabled) {
  return {
    key,
    enabled,
    docStatus: enabled ? "registered" : "pending",
    docRegistryVersion: "1",
    docsUpdatedAt: nowIso(),
    docsExpiresAt: nowIso(),
    installKeyPrefix: enabled ? `${key}-install` : null,
    installKeyIssuedAt: enabled ? nowIso() : null,
    installKeyExpiresAt: enabled ? nowIso() : null,
    installKeyRevokedAt: null,
    registeredBy: 1,
    registeredAt: nowIso(),
    updatedBy: 1,
    updatedAt: nowIso(),
    installable: enabled,
    documentation: {
      masterRegister: "docs/domains/master-register.md",
      domainGuide: "docs/domains/wtf-os.md",
      registry: "docs/domains/wtf-os-registry.md",
      commandPalette: "docs/domains/wtf-os-registry.md",
      mcpRegistry: "docs/domains/wtf-os-registry.md",
      eventRegistry: "docs/domains/wtf-os-registry.md",
      installPolicy: "docs/domains/wtf-os-registry.md",
      operatingProcedures: "docs/domains/wtf-os-registry.md",
    },
  };
}

function apiMock(req, res) {
  const url = new URL(req.originalUrl, `http://127.0.0.1:${PORT}`);
  const pathName = url.pathname;

  if (pathName === "/api/apps/desktop" || pathName === "/api/admin/apps/desktop") {
    return res.json({
      apps: desktopApps,
      list: Object.entries(desktopApps).map(([key, enabled]) =>
        desktopAppListEntry(key, enabled)
      ),
    });
  }
  if (pathName.startsWith("/api/admin/apps/desktop/")) {
    return res.json({
      ok: true,
      app: pathName.split("/").pop(),
      enabled: true,
      installKey: "wtf_app_mock_install_key",
      apps: desktopApps,
      list: Object.entries(desktopApps).map(([key, enabled]) =>
        desktopAppListEntry(key, enabled)
      ),
    });
  }
  if (pathName === "/api/desktop/settings") {
    return res.json({ appearance: desktopAppearance, iconLayout: {} });
  }
  if (pathName === "/api/atproto/me") {
    return res.json({
      enabled: true,
      account: {
        id: 1,
        did: "did:plc:skywiretest",
        handle: "wtf-admin.bsky.social",
        pdsUrl: "https://bsky.social",
        displayName: "WTF Admin",
        avatarUrl: null,
        description: "Inventory harness Skywire account",
        hasEncryptedTokens: true,
        hasDpopKey: true,
        lastSyncedAt: nowIso(),
        oauthScopes: "atproto transition:generic chat.bsky",
        oauthRequestedScopes: "atproto transition:generic chat.bsky",
        oauthPermissionTier: "be-bold",
        oauthChatEnabled: true,
        oauthCapabilities: ["profileWrite", "socialActions", "compose", "signals", "rooms", "stages", "chat", "notifications"],
        oauthHasBroadScope: true,
        session: { status: "oauth_ready", reconnectRequired: false, reason: null },
      },
      handleClaims: [],
      tezosAlias: "wtf.tez",
      walletAddress: "tz1-test-wallet",
      oauth: {
        clientIdUrl: "http://127.0.0.1/harness-client.json",
        redirectUri: "http://127.0.0.1/oauth/callback",
        scope: "atproto",
        maxScope: "atproto transition:generic chat.bsky",
      },
    });
  }
  if (pathName === "/api/wtf-live/status") {
    return res.json({
      rolloutMode: "staff_alpha",
      eligible: true,
      wtfLiveEligible: true,
      wtfLiveEnabled: true,
      atprotoEnabled: true,
      skywireSettingsPath: "/skywire?tab=account",
      publishesThrough: "Skywire AT Protocol identity",
    });
  }
  if (pathName === "/api/wtf-live/public/rooms/wtf-live" && req.method === "GET") {
    return res.json({
      room: {
        id: "wtf-live",
        title: "WTF LIVE",
        kind: "room",
        description: "Official show room",
        source: "system",
        ownerUserId: null,
        isPublic: true,
      },
      joinMode: "guest_room_only",
      roomPath: "/live/r/wtf-live",
      capabilities: {
        audio: true,
        camera: true,
        screen: true,
        media: true,
        transport: "browser_preview_until_room_transport_enabled",
      },
    });
  }
  if (pathName === "/api/wtf-live/public/rooms/wtf-live/messages" && req.method === "GET") {
    return res.json({ roomId: "wtf-live", collection: "app.wtfgameshow.skywire.room.message", messages: [], cursor: null, source: "harness" });
  }
  if (pathName === "/api/wtf-live/rooms" && req.method === "GET") {
    const ownedRoom = state.wtfLiveOwnedRoom?.isPublic ? state.wtfLiveOwnedRoom : null;
    return res.json({
      rooms: [
        { id: "wtf-live", title: "WTF LIVE", kind: "room", description: "Official show room", source: "system", ownerUserId: null, isPublic: true },
        ...(ownedRoom ? [ownedRoom] : []),
      ],
      collection: "app.wtfgameshow.skywire.room.message",
      storage: "public_atproto_repo_records",
      skywirePath: "/skywire?tab=account",
    });
  }
  if (pathName === "/api/wtf-live/rooms/mine" && req.method === "GET") {
    return res.json({
      rooms: state.wtfLiveOwnedRoom ? [state.wtfLiveOwnedRoom] : [],
      collection: "app.wtfgameshow.skywire.room.message",
      storage: "wtf_live_rooms",
    });
  }
  if (pathName === "/api/wtf-live/rooms" && req.method === "POST") {
    const title = String(req.body?.title || "New Room").trim();
    state.wtfLiveOwnedRoom = { id: "my-room", title, kind: "room", description: req.body?.description || "", source: "user", ownerUserId: 1, isPublic: true };
    return res.status(201).json({
      room: state.wtfLiveOwnedRoom,
    });
  }
  if (/^\/api\/wtf-live\/rooms\/[^/]+$/.test(pathName) && req.method === "PATCH") {
    const roomId = pathName.split("/")[4];
    if (!state.wtfLiveOwnedRoom || state.wtfLiveOwnedRoom.id !== roomId) {
      return res.status(404).json({ error: "Owned room not found" });
    }
    state.wtfLiveOwnedRoom = {
      ...state.wtfLiveOwnedRoom,
      isPublic: Boolean(req.body?.isPublic),
    };
    return res.json({ room: state.wtfLiveOwnedRoom });
  }
  if (/^\/api\/wtf-live\/rooms\/[^/]+$/.test(pathName) && req.method === "DELETE") {
    const roomId = pathName.split("/")[4];
    if (!state.wtfLiveOwnedRoom || state.wtfLiveOwnedRoom.id !== roomId) {
      return res.status(404).json({ error: "Owned room not found" });
    }
    state.wtfLiveOwnedRoom = null;
    return res.json({ ok: true, roomId });
  }
  if (pathName === "/api/wtf-live/stages" && req.method === "GET") {
    return res.json({
      stages: [{ id: "wtf-stage", title: "WTF Stage", kind: "stage", description: "Official stage", liveUrl: "/live", source: "system" }],
      collection: "app.wtfgameshow.skywire.stage.broadcast",
      storage: "public_atproto_repo_records",
      mode: "one_way_broadcast",
      skywirePath: "/skywire?tab=account",
    });
  }
  if (pathName === "/api/wtf-live/stages" && req.method === "POST") {
    const title = String(req.body?.title || "New Stage").trim();
    return res.status(201).json({
      stage: { id: "my-stage", title, kind: "stage", description: req.body?.description || "", liveUrl: req.body?.liveUrl || null, source: "user" },
    });
  }
  if (/^\/api\/wtf-live\/rooms\/[^/]+\/messages$/.test(pathName) && req.method === "GET") {
    return res.json({ roomId: pathName.split("/")[4], collection: "app.wtfgameshow.skywire.room.message", messages: [], cursor: null, source: "harness" });
  }
  if (/^\/api\/wtf-live\/stages\/[^/]+\/broadcasts$/.test(pathName) && req.method === "GET") {
    return res.json({ stageId: pathName.split("/")[4], collection: "app.wtfgameshow.skywire.stage.broadcast", broadcasts: [], cursor: null, source: "harness" });
  }
  if (pathName === "/api/skywire/token-link" && req.method === "GET") {
    const rawUrl = url.searchParams.get("url") || "";
    const allowedTokenLink =
      /^https:\/\/objkt\.com\/asset\/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton\/1$/.test(rawUrl) ||
      /^https:\/\/objkt\.com\/open-edition\/333$/.test(rawUrl) ||
      /^https:\/\/teia\.art\/objkt\/789$/.test(rawUrl) ||
      /^https:\/\/teia\.art\/objkt\/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton\/789$/.test(rawUrl);
    if (!allowedTokenLink) {
      return res.status(400).json({ error: "URL is not a supported Tezos token link." });
    }
    const isOpenEdition = rawUrl.includes("/open-edition/");
    const isTeia = rawUrl.includes("teia.art");
    const tokenId = isOpenEdition ? "333" : isTeia ? "789" : "1";
    const tokenTitle = isOpenEdition ? "Harness Open Edition" : isTeia ? "Harness Teia Token" : "Harness Token";
    const tokenImage =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 800'%3E%3Crect width='800' height='800' fill='%230b1f2a'/%3E%3Ccircle cx='400' cy='330' r='190' fill='%2322c7bd'/%3E%3Cpath d='M110 660 290 460 430 570 565 365 690 660z' fill='%23fb7185'/%3E%3Ctext x='96' y='112' font-family='Arial' font-size='62' font-weight='700' fill='%23fff8d6'%3ETezos%3C/text%3E%3C/svg%3E";
    return res.json({
      reference: {
        source: isTeia ? "teia" : "objkt",
        sourceUrl: rawUrl,
        faContract: isOpenEdition ? "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E" : "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
        faSlug: isOpenEdition ? "open_objkt" : null,
        tokenId,
        marketUrl: rawUrl,
      },
      token: {
        faContract: isOpenEdition ? "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E" : "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
        tokenId,
        title: tokenTitle,
        imageUrl: tokenImage,
        creatorAddress: "tz1HarnessCreator",
        creatorName: "Harness Creator",
        collectionName: isOpenEdition ? "Harness OE" : "Harness Collection",
        mintedAt: isOpenEdition ? "2024-03-01T12:00:00.000Z" : isTeia ? "2024-02-14T12:00:00.000Z" : "2024-01-08T12:00:00.000Z",
        marketUrl: rawUrl,
      },
      listing: {
        kind: isOpenEdition ? "open_edition" : "fixed_listing",
        marketplaceContract: isOpenEdition
          ? "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E"
          : isTeia
            ? "KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w"
            : "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
        marketplaceName: isOpenEdition ? "objkt open edition" : isTeia ? "Teia" : "objkt v6.2",
        listingId: isOpenEdition ? tokenId : isTeia ? "2002" : "1001",
        priceMutez: isTeia ? "250000" : "1000000",
        priceTez: isTeia ? "0.25" : "1",
        sellerAddress: "tz1HarnessSeller",
        amountLeft: isOpenEdition ? null : 1,
      },
      purchaseIntent: {
        supported: true,
        reason: null,
        marketplaceContract: isOpenEdition
          ? "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E"
          : isTeia
            ? "KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w"
            : "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
        marketplaceName: isOpenEdition ? "objkt open edition" : isTeia ? "Teia" : "objkt v6.2",
        entrypoint: isOpenEdition ? "claim" : isTeia ? "collect" : "fulfill_ask",
        listingId: isOpenEdition ? tokenId : isTeia ? "2002" : "1001",
        amount: 1,
        priceMutez: isTeia ? "250000" : "1000000",
        totalMutez: isTeia ? "250000" : "1000000",
      },
      source: "objkt",
    });
  }
  if (pathName === "/api/skywire/tezos-vault" && req.method === "GET") {
    return res.json({
      generatedAt: nowIso(),
      wallets: [
        {
          id: 1,
          walletAddress: "tz1HarnessWallet",
          tezDomain: "harness.tez",
          isPrimary: true,
          linkedAt: nowIso(),
          lastSyncedAt: nowIso(),
        },
      ],
      owned: {
        source: "wallet_holdings",
        total: 1,
        items: [
          {
            walletAddress: "tz1HarnessWallet",
            balance: "1",
            lastSeenAt: nowIso(),
            source: "wallet_holdings",
            faContract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
            tokenId: "1",
            title: "Harness Owned Token",
            imageUrl: null,
            creatorAddress: "tz1HarnessCreator",
            creatorName: "Harness Creator",
            collectionName: "Harness Collection",
            mintedAt: "2024-02-02T12:00:00.000Z",
            marketUrl: "https://objkt.com/asset/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/1",
          },
        ],
      },
      created: {
        source: "objkt",
        total: 3,
        error: null,
        items: [
          {
            faContract: "KT1AlphaCreatedCollection",
            tokenId: "2",
            title: "Harness Alpha Token",
            imageUrl: `http://127.0.0.1:${PORT}/__test/media/harness-alpha-token.png`,
            creatorAddress: "tz1HarnessWallet",
            creatorName: "Harness Creator",
            collectionName: "Harness Alpha Collection",
            mintedAt: "2024-04-05T12:00:00.000Z",
            marketUrl: "https://objkt.com/tokens/KT1AlphaCreatedCollection/2",
          },
          {
            faContract: "KT1AlphaCreatedCollection",
            tokenId: "9",
            title: "Harness Alpha Edition",
            imageUrl: null,
            creatorAddress: "tz1HarnessWallet",
            creatorName: "Harness Creator",
            collectionName: "Harness Alpha Collection",
            mintedAt: "2024-04-06T12:00:00.000Z",
            marketUrl: "https://objkt.com/tokens/KT1AlphaCreatedCollection/9",
          },
          {
            faContract: "KT1BetaCreatedCollection",
            tokenId: "1",
            title: "Harness Beta Token",
            imageUrl: null,
            creatorAddress: "tz1HarnessWallet",
            creatorName: "Harness Creator",
            collectionName: "Harness Beta Collection",
            mintedAt: "2024-05-01T12:00:00.000Z",
            marketUrl: "https://objkt.com/tokens/KT1BetaCreatedCollection/1",
          },
        ],
      },
    });
  }
  if (pathName === "/api/skywire/post" && req.method === "POST") {
    state.skywirePostPayloads.push(req.body ?? {});
    return res.status(201).json({
      uri: "at://did:plc:skywiretest/app.bsky.feed.post/vault-share",
      cid: "bafyreivaultshare",
      sourceUrl: "https://bsky.app/profile/wtf-admin.bsky.social/post/vault-share",
      claimable: false,
    });
  }
  if (pathName === "/api/skywire/actors/follows" && req.method === "GET") {
    return res.json({
      cursor: null,
      source: "inventory.harness.skywire.follows",
      actors: [
        {
          did: "did:plc:already-followed",
          handle: "already-followed.bsky.social",
          displayName: "Already Followed",
          avatar: null,
          description: "Harness actor already in the graph.",
        },
      ],
    });
  }
  if (pathName === "/api/skywire/follow" && req.method === "POST") {
    state.skywireFollowPayloads.push(req.body ?? {});
    return res.status(201).json({
      uri: `at://did:plc:skywiretest/app.bsky.graph.follow/${state.skywireFollowPayloads.length}`,
      cid: "bafyreifollowharness",
    });
  }
  if (pathName === "/api/skywire/events" && req.method === "POST") {
    return res.json({ ok: true });
  }
  if (pathName === "/api/media/upload" && req.method === "POST") {
    const mimeType = String(req.body?.mimeType || "image/gif");
    return res.status(201).json({
      id: 901,
      title: String(req.body?.title || "Harness chat media"),
      mimeType,
      playbackUrl: String(req.body?.fileData || "data:image/gif;base64,R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw=="),
      fileSizeBytes: 512,
      status: "ready",
      uploadStatus: "ready",
    });
  }
  if (pathName === "/api/skywire/chats" && req.method === "GET") {
    const gifUrl = "data:image/gif;base64,R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
    return res.json({
      convos: [
        {
          id: "test-convo",
          rev: "1",
          status: "accepted",
          muted: false,
          unreadCount: 0,
          kind: "direct",
          groupName: null,
          memberCount: 2,
          members: [
            { did: "did:plc:skywiretest", handle: "wtf-admin.bsky.social", displayName: "WTF Admin", avatar: null, description: null },
            { did: "did:plc:harness", handle: "harness.bsky.social", displayName: "Harness Skywire", avatar: null, description: null },
          ],
          lastMessage: {
            id: "msg-last",
            rev: "1",
            text: "GIF attachment",
            senderDid: "did:plc:harness",
            sender: null,
            sentAt: nowIso(),
            deleted: false,
            system: false,
            media: [{ mediaId: 901, title: "Harness GIF", mimeType: "image/gif", url: gifUrl, fileSizeBytes: 512 }],
            quote: null,
          },
        },
      ],
      cursor: null,
      source: "inventory.harness.skywire.chats",
      service: "did:web:api.bsky.chat#bsky_chat",
    });
  }
  if (pathName === "/api/skywire/chats/resolve" && req.method === "POST") {
    return res.json({
      convo: {
        id: "test-convo",
        rev: "1",
        status: "accepted",
        muted: false,
        unreadCount: 0,
        kind: "direct",
        groupName: null,
        memberCount: 2,
        members: [
          { did: "did:plc:skywiretest", handle: "wtf-admin.bsky.social", displayName: "WTF Admin", avatar: null, description: null },
          { did: "did:plc:harness", handle: "harness.bsky.social", displayName: "Harness Skywire", avatar: null, description: null },
        ],
        lastMessage: null,
      },
      source: "inventory.harness.skywire.resolve",
    });
  }
  if (pathName === "/api/skywire/chats/test-convo/messages" && req.method === "GET") {
    const gifUrl = "data:image/gif;base64,R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
    return res.json({
      convoId: "test-convo",
      messages: [
        {
          id: "msg-in",
          rev: "1",
          text: "This GIF should render in chat.",
          senderDid: "did:plc:harness",
          sender: { did: "did:plc:harness", handle: "harness.bsky.social", displayName: "Harness Skywire", avatar: null, description: null },
          sentAt: nowIso(),
          deleted: false,
          system: false,
          media: [{ mediaId: 901, title: "Harness GIF", mimeType: "image/gif", url: gifUrl, fileSizeBytes: 512 }],
          quote: {
            uri: "at://did:plc:harness/app.bsky.feed.post/pipeline",
            cid: "bafyreiharness",
            sourceUrl: "https://bsky.app/profile/harness.bsky.social/post/pipeline",
            author: { did: "did:plc:harness", handle: "harness.bsky.social", displayName: "Harness Skywire", avatar: null, description: null },
            text: "Original post text for quoted chat reply.",
            createdAt: nowIso(),
            indexedAt: nowIso(),
            embed: { images: [], external: null, video: null },
            state: "visible",
          },
        },
      ],
      cursor: null,
      source: "inventory.harness.skywire.messages",
    });
  }
  if (pathName === "/api/skywire/chats/test-convo/messages" && req.method === "POST") {
    return res.status(201).json({
      message: {
        id: "msg-posted",
        rev: "1",
        text: String(req.body?.text || ""),
        senderDid: "did:plc:skywiretest",
        sender: null,
        sentAt: nowIso(),
        deleted: false,
        system: false,
        media: Array.isArray(req.body?.media)
          ? req.body.media.map((item, index) => ({
              mediaId: Number(item.mediaId || index + 901),
              title: String(item.title || "Harness media"),
              mimeType: String(item.mimeType || "image/gif"),
              url: "data:image/gif;base64,R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==",
              fileSizeBytes: 512,
            }))
          : [],
        quote: null,
      },
      source: "inventory.harness.skywire.sendMessage",
    });
  }
  if (pathName === "/api/skywire/chats/send" && req.method === "POST") {
    return res.status(201).json({
      convo: {
        id: "test-convo",
        rev: "1",
        status: "accepted",
        muted: false,
        unreadCount: 0,
        kind: "direct",
        groupName: null,
        memberCount: 2,
        members: [],
        lastMessage: null,
      },
      message: {
        id: "msg-send",
        rev: "1",
        text: String(req.body?.text || ""),
        senderDid: "did:plc:skywiretest",
        sentAt: nowIso(),
        deleted: false,
        system: false,
        media: [],
        quote: null,
      },
      source: "inventory.harness.skywire.sendToMembers",
    });
  }
  if (pathName.startsWith("/api/skywire/chat-media/") && pathName.endsWith("/file")) {
    res.setHeader("Content-Type", "image/gif");
    return res.send(Buffer.from("R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==", "base64"));
  }
  if (pathName === "/api/skywire/feed") {
    const skywireHarnessGif =
      "data:image/gif;base64,R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==";
    const skywireHarnessImage =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 960 540'%3E%3Crect width='960' height='540' fill='%2310212b'/%3E%3Cpath d='M0 390 190 248 340 338 510 170 690 296 960 120v420H0z' fill='%230f8a96'/%3E%3Ccircle cx='760' cy='154' r='72' fill='%23fb7185'/%3E%3Ctext x='72' y='116' font-family='Arial' font-size='54' font-weight='700' fill='%23fff8d6'%3ESkywire media%3C/text%3E%3C/svg%3E";
    const skywirePortraitImage =
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 720 1080'%3E%3Crect width='720' height='1080' fill='%230b1f2a'/%3E%3Ccircle cx='360' cy='270' r='170' fill='%23f2c94c'/%3E%3Cpath d='M90 930 260 590 380 780 500 510 640 930z' fill='%2322c7bd'/%3E%3Ctext x='80' y='118' font-family='Arial' font-size='56' font-weight='700' fill='%23fff8d6'%3EFull media%3C/text%3E%3C/svg%3E";
    const basePost = {
      uri: "at://did:plc:harness/app.bsky.feed.post/pipeline",
      cid: "bafyreiharness",
      sourceUrl: "https://bsky.app/profile/harness.bsky.social/post/pipeline",
      author: {
        did: "did:plc:harness",
        handle: "harness.bsky.social",
        displayName: "Harness Skywire",
        avatar: null,
        description: "Mocked Skywire feed actor",
      },
      text: "Fresh Skywire context ready for TV, Studio, Rat Race, WTF LIVE, and reward automation. https://objkt.com/asset/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/1",
      createdAt: nowIso(),
      indexedAt: nowIso(),
      replyRoot: null,
      replyParent: null,
      counts: { reply: 2, repost: 3, like: 5, quote: 1 },
      viewer: { like: null, repost: null, threadMuted: false, embeddingDisabled: false },
      embed: {
        images: [
          {
            thumb: skywireHarnessImage,
            fullsize: skywireHarnessImage,
            alt: "Skywire media preview",
          },
        ],
        external: {
          uri: "https://objkt.com/asset/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/1",
          title: "Harness Token",
          description: "Objkt listing link promoted into a Skywire token preview.",
          thumb: skywireHarnessGif,
        },
        video: { playlist: null, thumbnail: skywireHarnessGif, alt: "Harness animated GIF preview", aspectRatio: { width: 1, height: 1 } },
      },
      links: ["https://objkt.com/asset/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/1"],
      quote: null,
    };
    const openEditionPost = {
      ...basePost,
      uri: "at://did:plc:harness/app.bsky.feed.post/open-edition",
      cid: "bafyreiopenedition",
      sourceUrl: "https://bsky.app/profile/harness.bsky.social/post/open-edition",
      text: "OE mint should stay inside Skywire instead of falling back to a generic href.",
      counts: { reply: 4, repost: 7, like: 14, quote: 2 },
      embed: {
        images: [],
        external: {
          uri: "https://objkt.com/open-edition/333",
          title: "Harness Open Edition",
          description: "Objkt open edition listing promoted into a Skywire token preview.",
        },
      },
      links: [],
    };
    const teiaPost = {
      ...basePost,
      uri: "at://did:plc:harness/app.bsky.feed.post/teia-media",
      cid: "bafyreiteiamedia",
      sourceUrl: "https://bsky.app/profile/harness.bsky.social/post/teia-media",
      text: "Tall image media should expand the post card and stay fully visible. https://teia.art/objkt/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/789",
      counts: { reply: 1, repost: 2, like: 9, quote: 0 },
      embed: {
        images: [
          {
            thumb: skywirePortraitImage,
            fullsize: skywirePortraitImage,
            alt: "Tall Skywire media preview",
          },
        ],
        external: {
          uri: "https://teia.art/objkt/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/789",
          title: "Harness Teia Token",
          description: "Teia token link promoted into a Skywire token preview.",
        },
      },
      links: ["https://teia.art/objkt/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/789"],
    };
    return res.json({
      feedType: url.searchParams.get("feedType") || "home",
      source: "inventory.harness.skywire.feed",
      cursor: null,
      feed: [
        { post: basePost, reason: null },
        { post: openEditionPost, reason: { type: "repost", by: basePost.author, indexedAt: nowIso() } },
        { post: teiaPost, reason: null },
      ],
    });
  }
  if (/^\/api\/skywire\/actor\/[^/]+\/feed$/.test(pathName) && req.method === "GET") {
    const actorKey = decodeURIComponent(pathName.split("/")[4] || "");
    const actor = {
      did: actorKey.startsWith("did:") ? actorKey : "did:plc:harness",
      handle: actorKey.includes(".") ? actorKey : "harness.bsky.social",
      displayName: "Harness Skywire",
      avatar: null,
      description: "Mocked Skywire feed actor",
    };
    const post = {
      uri: `at://${actor.did}/app.bsky.feed.post/actor-feed`,
      cid: "bafyreiactorfeed",
      sourceUrl: `https://bsky.app/profile/${actor.handle}/post/actor-feed`,
      author: actor,
      text: "Author feed loaded from the actor card.",
      createdAt: nowIso(),
      indexedAt: nowIso(),
      replyRoot: null,
      replyParent: null,
      counts: { reply: 0, repost: 0, like: 1, quote: 0 },
      viewer: { like: null, repost: null, threadMuted: false, embeddingDisabled: false },
      embed: { images: [], external: null, video: null },
      links: [],
      quote: null,
    };
    return res.json({
      actor,
      cursor: null,
      source: "inventory.harness.skywire.actor-feed",
      feed: [{ post, reason: null }],
    });
  }
  if (pathName === "/api/skywire/post/thread") {
    const post = {
      uri: url.searchParams.get("uri") || "at://did:plc:harness/app.bsky.feed.post/pipeline",
      cid: "bafyreiharness",
      sourceUrl: "https://bsky.app/profile/harness.bsky.social/post/pipeline",
      author: { did: "did:plc:harness", handle: "harness.bsky.social", displayName: "Harness Skywire", avatar: null, description: null },
      text: "Thread context mocked for Skywire pipeline smoke.",
      createdAt: nowIso(),
      indexedAt: nowIso(),
      replyRoot: null,
      replyParent: null,
      counts: { reply: 0, repost: 0, like: 1, quote: 0 },
      viewer: { like: null, repost: null, threadMuted: false, embeddingDisabled: false },
      embed: { images: [], external: null },
      quote: null,
    };
    return res.json({ uri: post.uri, source: "inventory.harness.skywire.thread", thread: { state: "visible", uri: post.uri, post, parent: null, replies: [] } });
  }
  if (pathName === "/api/skywire/pipelines" && req.method === "GET") {
    return res.json({
      source: "skywire.systemEventPipelines",
      storage: "wtfos_system_events",
      writesCanonicalPdsState: false,
      pipelines: [
        { id: "reward-spine", title: "Reward Spine", app: "WTF Rewards", appRoute: "/challenges", eventType: "skywire.pipeline.reward_queued", description: "Queue Skywire post context for rewards." },
        { id: "tv", title: "TV Programming", app: "WTF TV", appRoute: "/tv", eventType: "skywire.pipeline.tv_queued", description: "Queue Skywire post context for TV programming." },
        { id: "studio", title: "Studio Intake", app: "Studio", appRoute: "/studio", eventType: "skywire.pipeline.studio_queued", description: "Queue Skywire post context for Studio." },
        { id: "rat-race", title: "Rat Race Signal", app: "Rat Race", appRoute: "/rat-race", eventType: "skywire.pipeline.rat_race_queued", description: "Queue Skywire post context for Rat Race." },
        { id: "wtf-live", title: "WTF LIVE", app: "Rooms + Stages", appRoute: "/live", eventType: "skywire.pipeline.live_queued", description: "Queue Skywire post context for WTF LIVE." },
      ],
    });
  }
  if (pathName === "/api/skywire/pipelines/history" && req.method === "GET") {
    return res.json({
      source: "challenge_system_events",
      sourceModule: "skywire-pipeline",
      storage: "wtfos_system_events",
      events: state.interactionLog
        .filter((event) => String(event.eventType || "").startsWith("skywire.pipeline."))
        .slice(-20)
        .reverse()
        .map((event, index) => ({
          id: index + 1,
          eventId: `harness:${index}`,
          eventType: event.eventType,
          occurredAt: event.timestamp || nowIso(),
          rawRefType: "atproto_post",
          rawRefId: event.metadata?.post?.uri ?? "at://did:plc:harness/app.bsky.feed.post/pipeline",
          metadata: {
            pipelineTitle: event.metadata?.pipelineId || "Harness Pipeline",
            targetApp: event.metadata?.pipelineId || "WTFOS",
            postText: event.metadata?.post?.text || "Harness pipeline dispatch",
            postUri: event.metadata?.post?.uri || "at://did:plc:harness/app.bsky.feed.post/pipeline",
          },
        })),
    });
  }
  if (pathName === "/api/skywire/pipelines/dispatch" && req.method === "POST") {
    const pipelineEventTypes = {
      "reward-spine": "skywire.pipeline.reward_queued",
      tv: "skywire.pipeline.tv_queued",
      studio: "skywire.pipeline.studio_queued",
      "rat-race": "skywire.pipeline.rat_race_queued",
      "wtf-live": "skywire.pipeline.live_queued",
    };
    const eventType = pipelineEventTypes[req.body?.pipelineId] || "skywire.pipeline.queued";
    state.interactionLog.push({
      eventType,
      metadata: req.body ?? {},
      timestamp: nowIso(),
    });
    return res.status(201).json({
      pipeline: { id: req.body?.pipelineId ?? "reward-spine" },
      event: { id: 1, eventId: "skywire.pipeline.harness", eventType, deduped: false },
      interactionEvent: { id: 2, eventId: "app.interaction.tracked.harness", eventType: "app.interaction.tracked", deduped: false },
      source: "skywire.systemEventPipelines",
    });
  }
  if (pathName === "/api/skywire/pipelines/dispatch-batch" && req.method === "POST") {
    const pipelineEventTypes = {
      "reward-spine": "skywire.pipeline.reward_queued",
      tv: "skywire.pipeline.tv_queued",
      studio: "skywire.pipeline.studio_queued",
      "rat-race": "skywire.pipeline.rat_race_queued",
      "wtf-live": "skywire.pipeline.live_queued",
    };
    const pipelineIds = Array.isArray(req.body?.pipelineIds) ? req.body.pipelineIds : [];
    const results = pipelineIds.map((pipelineId, index) => {
      const eventType = pipelineEventTypes[pipelineId] || "skywire.pipeline.queued";
      state.interactionLog.push({
        eventType,
        metadata: { ...req.body, pipelineId },
        timestamp: nowIso(),
      });
      return {
        pipeline: { id: pipelineId },
        event: { id: index + 10, eventId: `skywire.pipeline.harness.${pipelineId}`, eventType, deduped: false },
        interactionEvent: { id: index + 20, eventId: `app.interaction.tracked.harness.${pipelineId}`, eventType: "app.interaction.tracked", deduped: false },
      };
    });
    return res.status(201).json({ results, count: results.length, source: "skywire.systemEventPipelines" });
  }
  if (pathName === "/api/desktop/pet") {
    return res.json({ pet: null, events: [] });
  }
  if (pathName.startsWith("/api/desktop/world/")) {
    return res.json({ visitors: [], activity: { activeNeighborCount: 0 } });
  }
  if (pathName === "/api/in-app-market" && req.method === "GET") {
    const category = url.searchParams.get("category");
    const items = marketState.items
      .filter((item) => item.active && (!category || item.category === category))
      .map((item) => serializeHarnessMarketItem(item));
    return res.json({
      config: {
        configured: true,
        contractAddress: null,
        treasuryAddress: "tz1-test-treasury",
        network: "inventory-harness",
      },
      items,
      inventory: [],
      balances: { exp: 1000, wtf: 100 },
      purchases: [],
    });
  }
  if (pathName === "/api/in-app-market/intents" && req.method === "POST") {
    const cartItems = Array.isArray(req.body?.items) ? req.body.items : [];
    let subtotalWtf = 0n;
    for (const cartItem of cartItems) {
      const item = marketState.items.find((candidate) => candidate.sku === cartItem?.sku);
      if (!item) continue;
      const quantity = Math.max(1, Math.min(99, Number(cartItem.quantity) || 1));
      const sale = bestHarnessSaleForItem(item);
      subtotalWtf += applyHarnessDiscount(BigInt(item.priceWtfUnits) * BigInt(quantity), sale?.discountPercent ?? 0);
    }
    subtotalWtf = ceilHarnessWholeWtf(subtotalWtf);
    return res.json({
      ok: true,
      intent: {
        id: 1,
        purchaseRef: "cart:inventory:harness",
        currency: req.body?.currency ?? "wtf",
        status: "pending",
        walletAddress: req.body?.walletAddress ?? null,
        items: cartItems,
        subtotalWtfUnits: subtotalWtf.toString(),
        subtotalWtfFormatted: formatHarnessWtf(subtotalWtf.toString()),
        subtotalExp: 0,
        estimatedFeeMutez: 70000,
        estimatedFeeTez: "0.07",
        contractAddress: null,
        routerListingId: 0,
        expiresAt: "2026-05-08T00:30:00.000Z",
      },
    });
  }
  if (pathName === "/api/seasons") return res.json([sampleSeason]);
  if (pathName === "/api/rounds") return res.json([sampleRound]);
  if (pathName === "/api/rounds/1") return res.json(sampleRound);
  if (pathName === "/api/challenges") return res.json([sampleChallenge]);
  if (pathName === "/api/challenges/1") {
    return res.json({ challenge: sampleChallenge, submissions: [], rewardFlags: [] });
  }
  if (pathName === "/api/reward-flags/challenges") {
    return res.json([
      {
        id: 1,
        challengeTitle: "Community Warm-Up Challenge",
        claimable: true,
        claimed: false,
        rewardType: "WTF",
        rewardAmountWtf: "10",
      },
    ]);
  }
  if (pathName === "/api/challenge-automation/daily-loops") {
    return res.json(sampleDailySideQuests);
  }
  if (/^\/api\/challenge-automation\/daily-loops\/\d+\/claim$/.test(pathName)) {
    return res.json({
      ok: true,
      claimed: true,
      rewardStatus: "completed",
      completionKey: sampleDailySideQuests.completionKey,
      completion: {
        id: 500,
        challengeId: Number(pathName.split("/").at(-2)),
        rewardStatus: "completed",
      },
    });
  }
  if (pathName === "/api/side-quests") return res.json([sampleSideQuest]);
  if (pathName === "/api/side-quests/my/completions") return res.json([]);
  if (pathName === "/api/mint-portal/challenges") {
    return res.json({
      challenges: [
        {
          ...sampleChallenge,
          roundId: 1,
          deadline: null,
          rewardAmountWtf: 10,
          rewardXp: 50,
          submissionContract: "KT1E2eHarness",
          submissionTag: "wtf-e2e",
          submissionCuration: null,
          roundTitle: "E2E Round",
          seasonId: 1,
          seasonTitle: "E2E Season",
          mySubmissions: [],
        },
      ],
      wallet: { count: 0, addresses: [] },
    });
  }
  if (pathName === "/api/calendar/events") return res.json([]);
  if (pathName === "/api/calendar/tickets/mine") return res.json([]);
  if (pathName === "/api/buyback-windows/active") return res.json({ window: null, leaderboard: [], auctions: [] });
  if (pathName === "/api/board/categories") return res.json(sampleBoardCategories);
  if (pathName === "/api/board/channels") return res.json(sampleBoardChannels);
  if (/^\/api\/board\/channels\/\d+\/messages$/.test(pathName)) return res.json(sampleBoardMessages);
  if (pathName === "/api/telegram-digest/config") {
    return res.json({
      appName: "I Hate Telegram",
      botConfigured: false,
      webhookSecretConfigured: false,
      bridgeHmacConfigured: false,
      userClientModeConfigured: false,
      fartNoisesBot: "fart_noises_bot",
      readOnly: true,
    });
  }
  if (pathName === "/api/telegram-digest/sources") {
    return res.json({
      sources: [
        {
          id: 1,
          key: "fart_noises",
          title: "FART NOISES",
          description: "Harness FART source",
          telegramUsername: "fart_noises",
          sourceKind: "bot",
          enabled: true,
          publicVisible: true,
          digestEnabled: true,
        },
      ],
    });
  }
  if (pathName === "/api/telegram-digest/messages") return res.json({ messages: [] });
  if (pathName === "/api/telegram-digest/me/farts") return res.json({ tracks: [] });
  if (pathName === "/api/telegram-digest/admin/announcements") return res.json({ announcements: [] });
  if (pathName === "/api/porcupin/connection") return res.json(null);
  if (pathName === "/api/porcupin/status") return res.json({ connected: false });
  if (pathName === "/api/porcupin/premium-eligibility") {
    return res.json({
      wtfBalanceOk: false,
      membershipCardOk: false,
      duesActiveOk: false,
      eligible: false,
      wtfBalance: 0,
      notes: [],
    });
  }
  if (pathName === "/api/messages/dms" && req.method === "POST") {
    return res.status(201).json({ id: 101, existed: false });
  }
  if (pathName === "/api/messages/dms") return res.json([]);
  if (pathName === "/api/messages/dms/101/messages") return res.json([]);
  if (pathName === "/api/messages/users") {
    return res.json([
      {
        id: 2,
        username: "wim-online",
        displayName: "WIM Online",
        avatarUrl: null,
        role: "contestant",
        experiencePoints: 42,
        online: true,
      },
      {
        id: 3,
        username: "wim-away",
        displayName: "WIM Away",
        avatarUrl: null,
        role: "witness",
        experiencePoints: 7,
        online: false,
      },
    ]);
  }
  if (pathName.startsWith("/api/messages/")) return res.json([]);
  if (pathName === "/api/diary/entries" && req.method === "GET") {
    return res.json({ entries: sampleDiaryEntries });
  }
  if (pathName === "/api/diary/index" && req.method === "GET") {
    return res.json({
      classifications: [{ name: "memoir", count: 1 }],
      tags: [
        { name: "harness", count: 1 },
        { name: "future-me", count: 1 },
      ],
      backlinks: [],
      updatedAt: nowIso(),
    });
  }
  if (pathName === "/api/diary/entries" && req.method === "POST") {
    return res.status(201).json({
      entry: {
        ...sampleDiaryEntries[0],
        ...req.body,
        id: 2,
        userId: 1,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    });
  }
  if (/^\/api\/diary\/entries\/\d+$/.test(pathName)) {
    return res.json({
      entry: {
        ...sampleDiaryEntries[0],
        ...req.body,
        id: Number(pathName.split("/").pop()),
        updatedAt: nowIso(),
      },
      ok: true,
    });
  }
  if (pathName === "/api/notifications/preferences") return res.json({});
  if (pathName === "/api/notifications") {
    return res.json({
      unreadCount: 1,
      items: [
        {
          id: 1,
          sourceUserId: 1,
          sourceUsername: "wtf-admin",
          sourceDisplayName: "WTF Admin",
          eventKey: "system.notice",
          title: "Harness system notice",
          body: "Mission Control smoke notification",
          metadata: {},
          read: false,
          createdAt: nowIso(),
        },
      ],
    });
  }
  if (pathName === "/api/health") {
    return res.json({
      ok: true,
      status: "ok",
      version: { commitRef: "harness", packageVersion: "1.0.0" },
      db: { ok: true },
      chain: {
        ok: true,
        network: "mainnet",
        rpcBase: "https://api.tzkt.io/v1",
        tezosRpcUrl: "https://rpc.tzkt.io/mainnet",
      },
      jobs: { ok: true, registered: 7, running: 0, recentErrors: 0 },
    });
  }
  if (pathName === "/api/links" || pathName === "/api/faq") return res.json([]);
  if (pathName.startsWith("/api/leaderboard")) return res.json([]);
  if (/^\/api\/users\/[^/]+$/.test(pathName)) {
    const username = decodeURIComponent(pathName.split("/").pop() || "wtf-admin");
    return res.json({
      id: username === "wtf-admin" ? 1 : 2,
      username,
      displayName: username === "wtf-admin" ? "WTF Admin" : "WTF User",
      role: username === "wtf-admin" ? "admin" : "user",
      experiencePoints: 420,
      bio: "Inventory harness public profile",
      pfpImageUrl: null,
      twitterHandle: username === "wtf-admin" ? "wtf_admin" : null,
      twitterVerified: username === "wtf-admin",
      discordHandle: null,
      discordVerified: false,
      wallets: ["tz1-test-wallet"],
      createdAt: "2026-01-01T00:00:00Z",
    });
  }
  if (/^\/api\/users\/[^/]+\/(trade-board|listings|activity)$/.test(pathName)) return res.json([]);
  if (/^\/api\/users\/[^/]+\/dm$/.test(pathName)) return res.json({ conversationId: null, messages: [] });
  if (pathName.startsWith("/api/gallery")) return res.json(emptyPage());
  if (pathName.startsWith("/api/profile/tokens")) return res.json({ items: [], total: 0 });
  if (pathName.startsWith("/api/profile/")) return res.json({ ok: true });
  if (/^\/api\/wallets\/[^/]+\/tokens$/.test(pathName)) {
    return res.json({ items: [], pagination: { total: 0, limit: 1, offset: 0 } });
  }
  if (pathName === "/api/cockpit/overview") {
    return res.json({
      holdings: { totalTokens: 0, totalContracts: 0 },
      wallets: [],
      sync: { status: "idle" },
    });
  }
  if (pathName === "/api/cockpit/sync/status") {
    return res.json({ status: "idle", runs: [] });
  }
  if (pathName === "/api/cockpit/activity") return res.json({ items: [] });
  if (pathName === "/api/cockpit/collections") return res.json({ collections: [] });
  if (pathName === "/api/portfolio/summary") {
    return res.json({
      pnlMethod: "lot_fifo",
      totals: {
        wallets: 1,
        tokensHeld: 0,
        contractsHeld: 0,
        costBasisMutez: "0",
        costBasisUsd: "0",
        estimatedValueMutez: "0",
        estimatedValueUsd: "0",
        unrealizedPnlMutez: "0",
        unrealizedPnlUsd: "0",
        realizedPnlMutez: "0",
        realizedProceedsMutez: "0",
        pricedPositions: 0,
        tokensWithUnknownCost: 0,
        binTrapPositions: 0,
        acquisitionConfidence: { purchase: 0, mint: 0, free_transfer: 0 },
      },
      perWallet: [],
    });
  }
  if (pathName.startsWith("/api/portfolio/activity/")) return res.json({ rows: [] });
  if (pathName.startsWith("/api/cockpit/") || pathName.startsWith("/api/portfolio/")) return res.json({ items: [], summary: {}, activity: [] });
  if (pathName === "/api/collekt/session") {
    return res.json({
      user: { id: 1, username: "wtf-admin", displayName: "WTF Admin" },
      wallets: [],
      gallery: { moduleUrl: "", tokenEndpoint: "/api/collekt/tokens" },
    });
  }
  if (pathName.startsWith("/api/collekt/")) return res.json({ wallets: [], tokens: [], items: [] });
  if (pathName.startsWith("/api/tezos-intel/")) return res.json({ sources: [], creators: [], items: [], marketPulse: [] });
  if (pathName === "/api/wtf-subdomains/my") return res.json([]);
  if (pathName === "/api/wtf-subdomains/registrar/config") {
    return res.json({
      config: {
        enabled: false,
        network: "ghostnet",
        parentDomain: "wtf.tez",
        registrarAddress: null,
        rpcUrl: "",
        tzktApi: "",
        domainsGraphql: "",
        tedAppUrl: "",
        tedCheckAddress: "",
        tedSetChildRecord: "",
        tedUpdateRecord: "",
        missingEnv: [],
      },
      storage: null,
    });
  }
  if (pathName === "/api/wtf-subdomains/chat/config") {
    return res.json({
      enabled: false,
      parentDomains: ["wtf.tez"],
      signingPrefix: "wtf-domain-chat",
      apiBaseUrl: null,
    });
  }
  if (pathName.startsWith("/api/wtf-subdomains")) {
    return res.json({ ok: true, grants: [], config: {}, items: [] });
  }
  if (pathName.startsWith("/api/media/mine")) return res.json([]);
  if (pathName.startsWith("/api/media/")) return res.json({ ok: true, usage: [] });
  if (/^\/api\/tv\/channels\/\d+\/stream$/.test(pathName)) {
    return res.json({
      channel: sampleTvChannel,
      playlist: null,
      scheduleLabel: null,
      generatedAt: nowIso(),
      loopDurationSeconds: 0,
      queue: [],
      current: null,
      offline: state.mode === "tv-offline",
      bumperOnly: false,
      message: state.mode === "tv-offline" ? "Harness stream unavailable" : "No playlist content",
    });
  }
  if (/^\/api\/tv\/channels\/\d+$/.test(pathName)) {
    return res.json({
      channel: sampleTvChannel,
      canManage: true,
      videos: [],
      playlists: [],
      playlistItems: [],
    });
  }
  if (pathName.startsWith("/api/tv/channels")) return res.json([sampleTvChannel]);
  if (pathName === "/api/tv/bumpers/pool") return res.json([]);
  if (pathName.startsWith("/api/tv/") || pathName.startsWith("/api/admin/wtf-tv")) return res.json({ channels: [sampleTvChannel], items: [], current: null, stream: [] });
  if (pathName === "/api/casino/status") {
    return res.json({
      userId: 1,
      appPass: { sku: "casino-app-pass", owned: false, quantity: 0, marketCategory: "casino" },
      membership: { active: false, expiresAt: null, walletAddress: null, purchaseRef: null },
      canEnter: false,
      wageringEnabled: false,
      config: {
        network: "inventory-harness",
        contractAddress: null,
        treasuryAddress: "tz1-test-treasury",
        feeMutez: 1000000,
        feeTez: "1",
        durationDays: 30,
        configured: false,
      },
    });
  }
  if (pathName === "/api/casino/games") {
    return res.json({
      games: [
        {
          key: "wtf-button",
          title: "WTF Does This Button Do?!!?",
          tagline: "Everyone sees the button. Everyone says don't press it. Someone always does.",
          summary: "Mocked XTZ jackpot table with Red, Green, and Blue buttons.",
          mode: "multi_player",
          status: "mocked_playable",
          tableKind: "live_multiplayer",
          wagerAsset: "XTZ",
          wageringEnabled: false,
          minPlayers: 1,
          maxPlayers: null,
          defaultHouseTakeBps: 1500,
          requiredContracts: ["WtfCasinoMembership", "WtfButtonEscrow"],
          monitoringHandles: ["wtf_button.lobby.viewed", "wtf_button.quote.created"],
          highlights: ["Three live jackpot buttons", "Rug Clash windows"],
          rules: {
            route: "/casino/wtf-button",
            dangerZoneSeconds: 60,
            rugClashSeconds: 15,
          },
        },
        {
          key: "rug-pull",
          title: "Rug Pull: The Game",
          tagline: "Everyone sees the button. Everyone says don't press it. Someone always does.",
          summary: "Planned live multiplayer Tezos pressure table.",
          mode: "multi_player",
          status: "mocked_playable",
          tableKind: "live_multiplayer",
          wagerAsset: "XTZ",
          wageringEnabled: false,
          minPlayers: 1,
          maxPlayers: null,
          defaultHouseTakeBps: 2000,
          requiredContracts: ["WtfCasinoMembership", "WtfRugPullGame"],
          monitoringHandles: ["rug_pull.rules.viewed", "rug_pull.wager.rejected"],
          rules: {
            entryFeeMutez: 5000000,
            entryPotMutez: 4000000,
            entryPlatformMutez: 1000000,
            panicSeconds: 30,
          },
        },
        {
          key: "guinea-pig-raceway",
          title: "Guinea Pig Raceway",
          tagline: "Tiny racers, loud odds, five tracks, and a replay booth that never sleeps.",
          summary: "Mocked live 3D Casino raceway with statted racers and GLB assets.",
          mode: "multi_player",
          status: "mocked_playable",
          tableKind: "live_multiplayer",
          wagerAsset: "WTF",
          wageringEnabled: false,
          minPlayers: 2,
          maxPlayers: null,
          defaultHouseTakeBps: 500,
          requiredContracts: ["WtfCasinoMembership", "WtfGuineaPigRaceway"],
          monitoringHandles: ["guinea_pig_raceway.race_card.viewed", "guinea_pig_raceway.wager.rejected"],
          highlights: ["3D GLB racers", "five tracks", "effect caps", "replay booth"],
          rules: {
            houseTakeBps: 500,
            bettingOpenSeconds: 90,
            introMarksSeconds: 30,
            assetManifestPath: "/games/casino/guinea-pig-raceway/assets/manifest.json",
          },
        },
      ],
      canEnter: false,
      wageringEnabled: false,
    });
  }
  if (pathName === "/api/casino/wtf-button/state") {
    const amount = (mutez) => ({
      mutez: String(mutez),
      xtz: String(Number(mutez) / 1000000).replace(/\.0$/, ""),
    });
    const quote = {
      id: "red-harness-quote",
      buttonId: "red",
      roundId: "red-harness-round",
      quotedCost: amount(1000000),
      actualCost: amount(1000000),
      maxAcceptedCost: amount(1000000),
      priceProtectionMode: "strict",
      tolerance: amount(0),
      quoteTimestampMs: Date.now(),
      houseCut: amount(100000),
      potAdd: amount(900000),
      timeAddedSeconds: 1800,
      canPress: true,
      reason: null,
    };
    return res.json({
      title: "WTF Does This Button Do?!!?",
      shortName: "WTF Button",
      route: "/casino/wtf-button",
      paymentMode: "mocked_xtz_balances",
      nowMs: Date.now(),
      user: {
        walletId: "mock-wallet-1",
        displayName: "Inventory Harness",
        balance: amount(30000000),
        leaderButtonId: null,
        winnerCooldownUntilMs: null,
      },
      wtfTreasury: amount(0),
      tables: ["red", "green", "blue"].map((buttonId, index) => ({
        buttonId,
        color: buttonId === "red" ? "Red" : buttonId === "green" ? "Green" : "Blue",
        name: buttonId === "red" ? "Red Button" : buttonId === "green" ? "Green Button" : "Blue Button",
        tableName: buttonId === "red" ? "Sprint" : buttonId === "green" ? "Standard" : "Jackpot",
        roundId: `${buttonId}-harness-round`,
        currentPot: amount(index * 2500000),
        currentLeader: {
          walletId: null,
          displayName: null,
          leaderSinceMs: null,
          leaderForSeconds: 0,
          origin: null,
          paidIntoButton: amount(0),
          presses: 0,
          estimatedPayoutIfExpiresNow: amount(index * 2500000),
        },
        countdownEndMs: Date.now() + 3600000,
        roundStartMs: Date.now() - 60000,
        timeRemainingSeconds: 3600,
        roundAgeSeconds: 60,
        startDurationSeconds: 21600,
        maxRoundAgeSeconds: 172800,
        totalPressCount: 0,
        uniquePresserCount: 0,
        wtfEarnings: amount(0),
        state: "active",
        rottenness: "fresh",
        dangerZone: false,
        rugClash: {
          active: false,
          countdownSeconds: 0,
          entrants: [],
          potAdded: amount(0),
          wtfEarned: amount(0),
          selectedWalletId: null,
          seedProof: null,
        },
        userQuote: { ...quote, buttonId, roundId: `${buttonId}-harness-round` },
        userStats: {
          presses: 0,
          totalPaid: amount(0),
          totalPotAdded: amount(0),
          totalWtfPaid: amount(0),
          canPress: true,
          cannotPressReason: null,
        },
        participants: [],
        timeline: [],
        cooldownUntilMs: null,
        lastWinner: { walletId: null, displayName: null, payout: amount(0) },
      })),
    });
  }
  if (pathName === "/api/casino/wtf-button/quote") {
    const amount = (mutez) => ({
      mutez: String(mutez),
      xtz: String(Number(mutez) / 1000000).replace(/\.0$/, ""),
    });
    return res.json({
      ok: true,
      quote: {
        id: "red-harness-quote",
        buttonId: "red",
        roundId: "red-harness-round",
        quotedCost: amount(1000000),
        actualCost: amount(1000000),
        maxAcceptedCost: amount(1000000),
        priceProtectionMode: "strict",
        tolerance: amount(0),
        quoteTimestampMs: Date.now(),
        houseCut: amount(100000),
        potAdd: amount(900000),
        timeAddedSeconds: 1800,
        canPress: true,
        reason: null,
      },
    });
  }
  if (pathName === "/api/casino/rug-pull/state") {
    const amount = (mutez) => ({
      mutez: String(mutez),
      xtz: String(Number(mutez) / 1000000).replace(/\.0$/, ""),
    });
    return res.json({
      title: "Rug Pull: The Game",
      route: "/casino/rug-pull",
      paymentMode: "mocked_xtz_balances",
      wageringEnabled: false,
      nowMs: Date.now(),
      user: {
        walletId: "mock-wallet-1",
        displayName: "Inventory Harness",
        balance: amount(50000000),
        activePlayer: false,
        activeWitness: false,
      },
      round: {
        roundId: "rug-harness-round",
        phase: "active",
        pot: amount(8000000),
        nextSeedPot: amount(0),
        platformTake: amount(2000000),
        buttonLockUntilMs: Date.now(),
        secondsUntilButtonUnlock: 0,
        panicEndsAtMs: null,
        panicSecondsRemaining: 0,
        panicModifier: "none",
        pressureMultiplierBps: 12000,
        totalPlayers: 2,
        totalWitnesses: 1,
        totalLockedMicroshares: "120000000",
        nextRoundPressOrder: [],
      },
      userActions: {
        joinCost: amount(5000000),
        pressCost: amount(5000000),
        witnessCost: amount(250000),
        nextDelayCost: amount(1000000),
        canJoin: true,
        canDelay: false,
        canPress: false,
        canJoinWitness: true,
        canVote: false,
        reason: null,
      },
      players: [
        {
          walletId: "mock-wallet-2",
          displayName: "Alice",
          joinOrder: 1,
          status: "active",
          pressedOrder: null,
          delayCount: 0,
          currentMicroshares: "60000000",
          shareRatePerSecond: "1000000",
          totalPaid: amount(5000000),
          estimatedPayout: amount(4000000),
        },
      ],
      witnesses: [{ walletId: "mock-wallet-3", displayName: "Mira", vote: null }],
      lastSettlement: null,
      timeline: [{ id: "rug-feed-1", atMs: Date.now(), kind: "join", message: "Alice joined the round." }],
    });
  }
  if (pathName === "/api/casino/guinea-pig-raceway/state") {
    const wtf = (microwtf) => ({
      microwtf: String(microwtf),
      wtf: String(Number(microwtf) / 1000000).replace(/\.0$/, ""),
    });
    const now = Date.now();
    const entrants = [
      ["miso-missile", "Miso Missile", 2600],
      ["pickle-jet", "Pickle Jet", 1900],
      ["button-biscuit", "Button Biscuit", 1550],
      ["hazel-havoc", "Hazel Havoc", 900],
      ["nori-nova", "Nori Nova", 1700],
    ].map(([id, displayName, odds], index) => ({
      id,
      displayName,
      modelVariant: String(id),
      coat: "race coat",
      laneStyle: "steady lane",
      scoutingReport: "Harness scouting report.",
      stats: { speed: 70 + index, stamina: 74, cornering: 72, focus: 68, courage: 71 },
      trackBiasBps: 0,
      conditionBiasBps: 0,
      preRaceWeight: 10000,
      winProbabilityBps: Number(odds),
      modelPath: `/games/casino/guinea-pig-raceway/assets/models/racers/${id}.glb`,
      thumbnailPath: `/games/casino/guinea-pig-raceway/assets/thumbnails/${id}.svg`,
      lane: index + 1,
      currentProgressBps: index * 800,
      currentPositionMeters: index * 4,
      effectBps: 0,
      betTotal: wtf(index * 1000000),
    }));
    return res.json({
      title: "Guinea Pig Raceway",
      route: "/casino/guinea-pig-raceway",
      paymentMode: "mocked_wtf_balances",
      wageringEnabled: false,
      tokenPolicy: {
        asset: "WTF",
        entertainmentOnly: true,
        cashValue: "none",
        statement: "WTF is unpaired in-app entertainment currency with no cash value.",
      },
      nowMs: now,
      assetManifestPath: "/games/casino/guinea-pig-raceway/assets/manifest.json",
      user: { walletId: "mock-wallet-1", displayName: "Inventory Harness", balance: wtf(100000000) },
      race: {
        raceId: "raceway-harness",
        phase: "betting_open",
        elapsedSeconds: 12,
        phaseSecondsRemaining: 78,
        track: {
          key: "cloverleaf_classic",
          label: "Cloverleaf Classic",
          lengthMeters: 42,
          laneCount: 8,
          surface: "felt_and_clover",
          replayAngles: ["broadcast_follow", "finish_line", "winner_closeup"],
        },
        conditions: [{ key: "clear_fast", label: "Clear and fast", modifierBps: 250 }],
        globalVariableBps: { trackGrip: 50, crowdNoise: -10 },
        uniquenessProfile: "raceway-harness|cloverleaf_classic",
        scheduleSeconds: { bettingOpen: 90, bettingLockout: 20, introMarks: 30, race: 75, replay: 60 },
        houseTakeBps: 500,
        pool: wtf(12000000),
        houseTakeIfSettledNow: wtf(600000),
        winnerPoolIfSettledNow: wtf(11400000),
        carryover: wtf(0),
        toteBoard: {
          totalHandle: wtf(12000000),
          poolSummaries: [
            {
              wagerType: "win",
              gross: wtf(7000000),
              takeout: wtf(350000),
              net: wtf(6650000),
              breakage: wtf(0),
              carryover: wtf(0),
              ticketCount: 2,
            },
            {
              wagerType: "place",
              gross: wtf(5000000),
              takeout: wtf(250000),
              net: wtf(4750000),
              breakage: wtf(0),
              carryover: wtf(0),
              ticketCount: 1,
            },
            {
              wagerType: "show",
              gross: wtf(0),
              takeout: wtf(0),
              net: wtf(0),
              breakage: wtf(0),
              carryover: wtf(0),
              ticketCount: 0,
            },
            {
              wagerType: "exacta",
              gross: wtf(0),
              takeout: wtf(0),
              net: wtf(0),
              breakage: wtf(0),
              carryover: wtf(0),
              ticketCount: 0,
            },
            {
              wagerType: "trifecta",
              gross: wtf(0),
              takeout: wtf(0),
              net: wtf(0),
              breakage: wtf(0),
              carryover: wtf(0),
              ticketCount: 0,
            },
          ],
          winOdds: entrants.map((entrant, index) => ({
            racerId: entrant.id,
            pool: wtf(index === 0 ? 7000000 : 0),
            approximatePayoutPerWtf: index === 0 ? wtf(950000) : null,
          })),
        },
      },
      entrants,
      bets: [],
      tickets: [],
      effects: [],
      userActions: {
        defaultBet: wtf(5000000),
        canBet: true,
        canInjectEffect: false,
        betRejectReason: null,
        effectRejectReason: "Effects unlock only while the race is live.",
      },
      lastSettlement: null,
      timeline: [{ id: "race-feed-1", atMs: now, kind: "race_card", message: "Race card opened." }],
    });
  }
  if (pathName.startsWith("/api/casino/")) {
    return res.json({ ok: true });
  }
  if (pathName === "/api/club-dues/contracts") {
    return res.json({
      contracts: [
        {
          id: 1,
          slug: "e2e-club",
          name: "E2E Club",
          description: "Inventory harness club dues contract",
          templateVersion: "wtf-club-dues-v1",
          network: "shadownet",
          status: "live",
          contractAddress: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
          managerWalletId: "club-dues-manager",
          treasuryAddress: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
          adminAddress: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
          monthlyDuesMutez: 1000000,
          monthlyDuesTez: "1",
          monthSeconds: 2592000,
          utilityUnitsPerMonth: "1",
          gracePeriodDays: 7,
          arrearsWarningDays: 3,
          membershipSymbol: "DUES",
          metadataUri: null,
          deployedAt: nowIso(),
          deployOpHash: null,
          errorMessage: null,
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
      ],
    });
  }
  if (pathName === "/api/club-dues/my") {
    return res.json({ memberships: [] });
  }
  if (pathName === "/api/club-dues/templates/compile") {
    return res.json({
      ok: true,
      templateVersion: "wtf-club-dues-v1",
      sourcePath: "contracts/wtf-club-dues/WtfClubDues.py",
      initialStorage: "{}",
      workflow: { harness: true },
      code: [{ prim: "parameter", args: [{ prim: "unit" }] }],
      init: { prim: "Unit" },
    });
  }
  if (pathName === "/api/admin/club-dues") {
    return res.json({
      signerConfigured: false,
      network: "shadownet",
      contracts: [],
      totals: { members: 0, arrears: 0 },
      recentDeployments: [],
    });
  }
  if (pathName.startsWith("/api/admin/club-dues/") || pathName.startsWith("/api/club-dues/")) {
    return res.json({ ok: true });
  }
  if (pathName === "/api/console/demo-cartridges") return res.json([]);
  if (pathName === "/api/console/cartridges") return res.json([]);
  if (pathName === "/api/console/games") return res.json(consoleCatalogPayload("console"));
  if (pathName === "/api/console/stats") return res.json(consoleStatsPayload());
  if (pathName === "/api/console/discovery") return res.json(consoleDiscoveryPayload());
  if (pathName === "/api/arcade/games") return res.json(consoleCatalogPayload("arcade"));
  if (pathName === "/api/arcade/stats") return res.json(consoleStatsPayload());
  if (pathName === "/api/arcade/discovery") return res.json(consoleDiscoveryPayload());
  if (pathName === "/api/arcade/champions") return res.json({ champions: [] });
  if (pathName === "/api/arcade/players/top") return res.json({ players: [] });
  if (pathName === "/api/arcade/recent") return res.json({ scores: [] });
  if (pathName === "/api/arcade/play-fee") return res.json(arcadePlayFeePayload());
  if (pathName === "/api/arcade/play-status") return res.json(arcadePlayStatusPayload());
  if (pathName.startsWith("/api/console/")) return res.json(consolePayload("console"));
  if (pathName.startsWith("/api/arcade/")) return res.json(consolePayload("arcade"));
  if (pathName === "/api/arcade" || pathName === "/api/console") return res.json(consolePayload());
  if (pathName.startsWith("/api/game-studio/templates")) return res.json({ templates: [] });
  if (pathName.startsWith("/api/game-studio/assets")) return res.json({ assets: [] });
  if (pathName.startsWith("/api/game-studio/snippets")) return res.json({ snippets: [] });
  if (pathName.startsWith("/api/game-studio/projects")) return res.json({ projects: [], builds: [] });
  if (pathName.startsWith("/api/studio/projects")) return res.json({ projects: [], items: [] });
  if (pathName.startsWith("/api/studio/")) return res.json({ ok: true, items: [] });
  if (pathName.startsWith("/api/marketplace") || pathName.startsWith("/api/barter")) return res.json({ listings: [], offers: [], items: [], tokens: [] });
  if (pathName === "/api/rat-race/hot-tokens") {
    return res.json({
      limit: Number(url.searchParams.get("limit") || 24),
      windowHours: Number(url.searchParams.get("windowHours") || 24),
      mintedWithinDays: Number(url.searchParams.get("mintedWithinDays") || 7),
      minSoldPercent: Number(url.searchParams.get("minSoldPercent") || 50),
      minRecentSales: Number(url.searchParams.get("minRecentSales") || 2),
      generatedAt: new Date().toISOString(),
      diagnostics: {
        source: "tz2at-replay",
        localCandidateRows: 0,
        tz2atCandidateRows: 1,
        rankedItems: 0,
        supplementSources: [
          {
            source: "objkt",
            used: true,
            purpose: "Harness metadata/listing supplement for tz2at rolling sale records.",
          },
        ],
        rejectedByUnknownSupply: 0,
        rejectedByNoActiveListing: 0,
        rejectedByMintWindow: 1,
        rejectedByRecentSales: 1,
        rejectedBySoldPercent: 0,
        note: "Rat Race found candidates, but none passed every hot-edition filter.",
        nearMisses: [
          {
            tokenContract: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
            tokenId: "170670",
            tokenName: "Glishco",
            totalEditions: 3,
            soldEditions: 2,
            soldPercent: 66.7,
            recentSaleCount: 1,
            activeListingCount: 1,
            mintedAt: "2021-07-15T22:17:46.000Z",
            lastSaleAt: "2026-05-26T10:17:37.000Z",
            marketUrl: "https://objkt.com/tokens/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/170670",
            reasons: ["1 recent sale(s), needs 2", "minted 1776 days ago, window is 7 days"],
          },
        ],
      },
      items: [],
    });
  }
  if (pathName === "/api/rat-race/events" && req.method === "POST") return res.json({ ok: true });
  if (pathName === "/api/dex/tokens") return res.json([]);
  if (pathName === "/api/dex/pools") return res.json([]);
  if (pathName.startsWith("/api/dex/counterparts/")) return res.json([]);
  if (pathName === "/api/dex/health") {
    return res.json({
      spicyswap: true,
      totalPools: 0,
      activePools: 0,
      activeTokens: 0,
    });
  }
  if (/^\/api\/dex\/pools\/[^/]+\/metrics$/.test(pathName)) return res.json([]);
  if (pathName.startsWith("/api/dicksword/")) return res.json({ ok: true, config: {}, claims: [], roleMappings: [], avatarLayers: [] });
  if (pathName === "/api/tz2at/status") {
    return res.json({
      enabled: true,
      relay: { baseUrl: "https://tz2at.xyz", ok: true, network: "mainnet" },
      firehose: {
        mode: "read-only-appview-consumer",
        baseUrl: "https://tz2at.xyz",
        jsonFirehosePath: "/firehose",
        snapshotEndpoint: "/api/tz2at/firehose/events",
        cursorStorage: "server-proxy",
      },
      account: null,
      permissions: {
        identityScope: "atproto",
        walletLinkScope: "atproto repo:xyz.tz2at.identity.walletLink",
      },
      pdsOffering: {
        enabled: true,
        configured: false,
        provisioningEnabled: false,
        pdsUrl: "https://pds.wtfgameshow.app",
        handleDomain: "wtfgameshow.app",
        suggestedHandle: null,
        identityLinkCollection: "app.wtfos.identity.link",
        gameLexiconPrefix: "app.wtfos",
        serviceHealth: { ok: null, healthUrl: null },
        canonicalRepoPolicy: {
          role: "portable identity proofs only",
          allowedWriteCollections: ["xyz.tz2at.identity.walletLink"],
          readOnlyImportCollections: ["com.tzbsky.cryptoAddress"],
        },
        wtfRepoPolicy: { role: "WTFOS game/system state", writePrefix: "app.wtfos" },
        identity: null,
      },
      links: [],
      wallets: { tezos: [], etherlink: [] },
    });
  }
  if (pathName === "/api/tz2at/activity") return res.json({ items: [] });
  if (pathName === "/api/tz2at/pds/status") {
    return res.json({
      publicUrl: "https://pds.wtfgameshow.app",
      configured: false,
      provisioningEnabled: false,
      handleDomain: "wtfgameshow.app",
      identityLinkCollection: "app.wtfos.identity.link",
      gameLexiconPrefix: "app.wtfos",
      serviceHealth: { ok: null, healthUrl: null },
    });
  }
  if (pathName === "/api/tz2at/pds-offering") return res.json({ account: null, offering: null });
  if (pathName === "/api/tz2at/outbox/status") {
    return res.json({
      canonicalDid: null,
      wtfDid: null,
      active: false,
      primary: { did: null, configured: false },
      collection: "app.wtfos.activity.event",
      pending: 0,
      published: 0,
      failed: 0,
      skipped: 0,
      targets: { primary: 0, user: 0 },
      recent: [],
    });
  }
  if (pathName === "/api/tz2at/outbox/flush" && req.method === "POST") {
    return res.json({ ok: true, published: [], status: { pending: 0, published: 0, failed: 0, skipped: 0, recent: [] } });
  }
  if (pathName === "/api/tz2at/firehose/status") {
    return res.json({ mode: "read-only-appview-consumer", baseUrl: "https://tz2at.xyz", ok: true, pdsWrites: "none" });
  }
  if (pathName === "/api/tz2at/firehose/events" || pathName === "/api/tz2at/firehose/search") {
    return res.json({
      mode: req.url.includes("walletAddress=") ? "wallet-activity-snapshot" : "relay-replay-search",
      sourceUrl: "https://tz2at.xyz/replay?limit=25",
      walletAddress: null,
      filters: {},
      scannedItems: 1,
      matchedItems: 1,
      cursor: null,
      items: [
        {
          $type: "xyz.tz2at.marketplace.collect",
          network: "mainnet",
          marketplace: "KT1Market",
          tokenId: "42",
          buyer: "tz1Buyer",
          operationHash: "ooHarnessCollect",
          timestamp: "2026-05-27T00:00:00.000Z",
        },
      ],
    });
  }
  if (pathName === "/api/tz2at/ecosystem/analytics") {
    return res.json({
      generatedAt: "2026-05-28T09:05:00.000Z",
      mode: "atproto-pds-repo-analytics",
      query: {
        limitPerCollection: 3,
        sampleReposPerHost: 2,
        cexAddressCount: 1,
        windowHours: 72,
        since: "2026-05-27T09:05:00.000Z",
        until: "2026-05-28T09:05:00.000Z",
        hydrateCex: true,
        marketNetwork: "mainnet",
        filters: {},
      },
      marketHealth: {
        windowHours: 72,
        since: "2026-05-27T09:05:00.000Z",
        until: "2026-05-28T09:05:00.000Z",
        network: "mainnet",
        capitalEnteredFromCexMutez: "7000000",
        capitalExitedToCexMutez: "0",
        internalNetFlowMutez: "0",
        grossTransferVolumeMutez: "7000000",
        marketplaceVolumeMutez: "5000000",
        flowRecordCount: 1,
        topInflowRoutes: [],
        topOutflowRoutes: [],
        userFlow: {
          topReceiversFromCex: [{ id: "tz1Buyer", count: 1, amountMutez: "7000000", netMutez: "7000000", collections: [], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
          topSendersToCex: [],
          topRetailSenders: [],
          topRetailReceivers: [],
          topRetailRoutes: [],
        },
        marketFlow: {
          topBuyers: [{ id: "tz1Buyer", count: 1, amountMutez: "5000000", netMutez: "0", collections: [], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
          topSellers: [{ id: "tz1Seller", count: 1, amountMutez: "5000000", netMutez: "0", collections: [], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
          topVenues: [],
          topRoutes: [],
        },
        sources: {
          mainRelayRecords: 3,
          replayRecords: 0,
          replayMainnetRecords: 0,
          replayEtherlinkRecords: 0,
          cexEntityRepoRecords: 0,
          dedupedRecords: 3,
          windowMatchedRecords: 3,
          recordSources: { "main-relay": 3 },
        },
        hydration: { requested: false, wallets: 0, queued: 0, failed: 0, maxPagesPerWallet: 0 },
      },
      etherlinkBridge: {
        windowHours: 72,
        since: "2026-05-27T09:05:00.000Z",
        until: "2026-05-28T09:05:00.000Z",
        l1ToEtherlinkVolumeRaw: "0",
        etherlinkToL1VolumeRaw: "0",
        etherlinkInternalVolumeRaw: "0",
        tezosBridgeCorridorVolumeMutez: "0",
        etherlinkFlowRecordCount: 0,
        tezosBridgeTaggedCount: 0,
        topL1ToEtherlinkRoutes: [],
        topEtherlinkToL1Routes: [],
        topEtherlinkInternalRoutes: [],
        flows: [],
        sources: {
          replayEtherlinkRecords: 0,
          replayMainnetRecords: 0,
          etherlinkRecordsInWindow: 0,
          tezosBridgeTaggedRecords: 0,
          byRecordSource: {},
        },
        readout: "No mainnet↔Etherlink bridge-classified flows in the last 72h window.",
      },
      hosts: [
        {
          key: "main",
          label: "Main relay repo",
          service: "https://tz2at.store",
          role: "canonical mixed event stream",
          ok: true,
          serviceDid: "did:web:tz2at.store",
          repoCount: 1,
          activeRepoCount: 1,
          sampledRepoCount: 1,
          collections: ["xyz.tz2at.marketplace.collect", "xyz.tz2at.xtz.flow"],
          error: null,
        },
      ],
      overview: {
        totalRepos: 1,
        activeRepos: 1,
        scannedRecords: 3,
        matchedRecords: 3,
        collectionCounts: [{ name: "xyz.tz2at.marketplace.collect", count: 1 }],
        networkCounts: [{ name: "mainnet", count: 3 }],
        latestTimestamp: "2026-05-28T09:05:00.000Z",
        latestBlockLevel: 13394780,
      },
      segments: {
        byHost: [{ name: "main", count: 3, amountMutez: "12000000", latestTimestamp: "2026-05-28T09:05:00.000Z", latestBlockLevel: 13394780 }],
        byNetwork: [{ name: "mainnet", count: 3, amountMutez: "12000000", latestTimestamp: "2026-05-28T09:05:00.000Z", latestBlockLevel: 13394780 }],
        byCollection: [
          { name: "xyz.tz2at.xtz.flow", count: 1, amountMutez: "7000000", latestTimestamp: "2026-05-28T09:05:00.000Z", latestBlockLevel: 13394780 },
          { name: "xyz.tz2at.marketplace.collect", count: 1, amountMutez: "5000000", latestTimestamp: "2026-05-28T09:05:00.000Z", latestBlockLevel: 13394780 },
        ],
        addressRoles: [{ name: "xtz_in", count: 1 }],
      },
      intelligence: {
        cards: [
          { id: "freshness", tone: "good", title: "Freshness", value: "5s old", detail: "Latest matched level 13394780", timestamp: "2026-05-28T09:05:00.000Z" },
          { id: "coverage", tone: "info", title: "Coverage", value: "3/3", detail: "1 active repos observed before filters" },
          { id: "largest-flow", tone: "good", title: "Largest Value Flow", value: "7000000", detail: "XTZ flow: tz1Cex -> tz1Buyer", amountMutez: "7000000" },
        ],
        lanes: [
          { lane: "liquidity", label: "Liquidity", name: "liquidity", count: 1, amountMutez: "7000000", shareOfMatchedRecords: 0.33, topCollection: "xyz.tz2at.xtz.flow", latestTimestamp: "2026-05-28T09:05:00.000Z", latestBlockLevel: 13394780 },
          { lane: "marketplace", label: "Marketplace", name: "marketplace", count: 1, amountMutez: "5000000", shareOfMatchedRecords: 0.33, topCollection: "xyz.tz2at.marketplace.collect", latestTimestamp: "2026-05-28T09:05:00.000Z", latestBlockLevel: 13394780 },
        ],
        valueFlows: [
          {
            kind: "xtz_flow",
            label: "XTZ flow",
            from: "tz1Cex",
            to: "tz1Buyer",
            amountMutez: "7000000",
            collection: "xyz.tz2at.xtz.flow",
            host: "main",
            repo: "did:web:tz2at.store",
            uri: "at://did:web:tz2at.store/xyz.tz2at.xtz.flow/harness",
            operationHash: "ooHarness",
            network: "mainnet",
            timestamp: "2026-05-28T09:05:00.000Z",
            blockLevel: 13394780,
          },
        ],
        routes: [
          {
            route: "tz1Cex -> tz1Buyer",
            from: "tz1Cex",
            to: "tz1Buyer",
            via: null,
            collection: "xyz.tz2at.xtz.flow",
            network: "mainnet",
            count: 1,
            amountMutez: "7000000",
            latestTimestamp: "2026-05-28T09:05:00.000Z",
          },
        ],
        valueAdders: [{ id: "tz1Buyer", count: 2, amountMutez: "12000000", netMutez: "7000000", collections: ["xyz.tz2at.xtz.flow", "xyz.tz2at.marketplace.collect"], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
        valueExtractors: [{ id: "tz1Cex", count: 1, amountMutez: "7000000", netMutez: "-7000000", collections: ["xyz.tz2at.xtz.flow"], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
      },
      usage: {
        topAddresses: [
          {
            id: "tz1Buyer",
            count: 2,
            amountMutez: "0",
            netMutez: "7000000",
            collections: ["xyz.tz2at.xtz.flow"],
            networks: ["mainnet"],
            latestTimestamp: "2026-05-28T09:05:00.000Z",
            roles: ["xtz_in"],
            xtzInMutez: "7000000",
            xtzOutMutez: "0",
            marketplaceBuyMutez: "5000000",
            marketplaceSellMutez: "0",
          },
        ],
        topContracts: [{ id: "KT1Market", count: 1, amountMutez: "0", netMutez: "0", collections: ["xyz.tz2at.marketplace.collect"], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
        topMarketplaces: [{ id: "KT1Market", count: 1, amountMutez: "5000000", netMutez: "0", collections: ["xyz.tz2at.marketplace.collect"], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
        topTokens: [{ id: "tezos:mainnet:KT1Token:token:42", count: 1, amountMutez: "0", netMutez: "0", collections: ["xyz.tz2at.marketplace.collect"], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
        topObjktGroups: [],
      },
      liquidity: {
        totalXtzFlowMutez: "7000000",
        marketplaceVolumeMutez: "5000000",
        topXtzSenders: [{ id: "tz1Cex", count: 1, amountMutez: "7000000", netMutez: "0", collections: ["xyz.tz2at.xtz.flow"], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
        topXtzReceivers: [{ id: "tz1Buyer", count: 1, amountMutez: "7000000", netMutez: "0", collections: ["xyz.tz2at.xtz.flow"], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
        topNetXtzIn: [{ id: "tz1Buyer", count: 1, amountMutez: "0", netMutez: "7000000", collections: ["xyz.tz2at.xtz.flow"], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
        topNetXtzOut: [{ id: "tz1Cex", count: 1, amountMutez: "0", netMutez: "-7000000", collections: ["xyz.tz2at.xtz.flow"], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
        topMarketplaceBuyers: [{ id: "tz1Buyer", count: 1, amountMutez: "5000000", netMutez: "0", collections: ["xyz.tz2at.marketplace.collect"], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
        topMarketplaceSellers: [{ id: "tz1Artist", count: 1, amountMutez: "5000000", netMutez: "0", collections: ["xyz.tz2at.marketplace.collect"], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
        topMarketplaceVolume: [{ id: "KT1Market", count: 1, amountMutez: "5000000", netMutez: "0", collections: ["xyz.tz2at.marketplace.collect"], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
      },
      cexFlow: {
        configured: true,
        addressBook: [{ address: "tz1Cex", label: "Harness CEX", source: "harness" }],
        totalWithdrawnFromCexMutez: "7000000",
        totalDepositedToCexMutez: "0",
        topBuyersFromCex: [{ id: "tz1Buyer", count: 1, amountMutez: "7000000", netMutez: "0", collections: ["xyz.tz2at.xtz.flow"], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
        topSellersToCex: [],
        unclassifiedCandidates: [{ id: "tz1Buyer", count: 1, amountMutez: "7000000", netMutez: "7000000", collections: ["xyz.tz2at.xtz.flow"], networks: ["mainnet"], latestTimestamp: "2026-05-28T09:05:00.000Z" }],
        flows: [{ direction: "from_cex", cex: "Harness CEX", counterparty: "tz1Buyer", amountMutez: "7000000", operationHash: "ooHarness", timestamp: "2026-05-28T09:05:00.000Z", network: "mainnet" }],
      },
      records: { sample: [], errors: [] },
    });
  }
  if (pathName === "/api/tz2at/import/tzbsky" && req.method === "POST") {
    return res.status(409).json({ error: "Connect an AT Protocol DID before importing tzbsky wallet proofs" });
  }
  if (pathName === "/api/tz2at/publish/wallet-link" && req.method === "POST") {
    return res.status(409).json({ error: "Connect an AT Protocol DID before publishing wallet links" });
  }
  if (pathName.startsWith("/api/etherlink/")) return res.json({ wallets: [], assets: [] });
  if (pathName === "/api/wallets") {
    if (state.mode === "no-wallet") return res.json([]);
    return res.json([
      {
        id: 1,
        walletAddress: "tz1-test-wallet",
        address: "tz1-test-wallet",
        isPrimary: true,
        walletType: "tezos",
        tezDomain: "wtf-admin.tez",
      },
    ]);
  }
  if (/^\/api\/wallets\/[^/]+\/balance$/.test(pathName)) {
    return res.json({ balance: "100" });
  }
  if (pathName.startsWith("/api/factory/")) return res.json({ templates: [], contracts: [], ok: true });
  if (pathName.startsWith("/api/operator-wallet/")) return res.json({ ok: true, balances: [], ledger: [], runs: [] });
  if (pathName.startsWith("/api/admin/challenge-automation/registry")) {
    return res.json({
      triggers: [],
      predicates: [],
      actions: [],
    });
  }
  if (pathName.startsWith("/api/admin/challenge-automation/challenges")) {
    return res.json({ challenges: [], progress: [], auditLogs: [] });
  }
  if (pathName.startsWith("/api/admin/challenge-automation/events")) return res.json({ events: [] });
  if (pathName === "/api/admin/stats") {
    return res.json({
      users: 1,
      seasons: 1,
      rounds: 1,
      challenges: 1,
      sideQuests: 1,
      rewardLedger: 0,
      storage: { usedBytes: 0 },
    });
  }
  if (pathName === "/api/admin/in-app-market/items" && req.method === "GET") {
    return res.json(harnessMarketAdminPayload());
  }
  if (pathName === "/api/admin/in-app-market/reprice" && req.method === "POST") {
    return res.json(harnessMarketAdminPayload({ ok: true, updated: marketState.items.length }));
  }
  if (pathName === "/api/admin/in-app-market/sales" && req.method === "POST") {
    const now = nowIso();
    const sale = {
      id: marketState.nextSaleId++,
      name: String(req.body?.name || "Inventory Sale"),
      active: req.body?.active !== false,
      discountPercent: Math.max(0, Math.min(99, Math.floor(Number(req.body?.discountPercent) || 0))),
      category: req.body?.category ? String(req.body.category) : null,
      sku: req.body?.sku ? String(req.body.sku) : null,
      startsAt: req.body?.startsAt || null,
      endsAt: req.body?.endsAt || null,
      createdAt: now,
      updatedAt: now,
    };
    marketState.sales.push(sale);
    return res.status(201).json(harnessMarketAdminPayload());
  }
  const saleMatch = pathName.match(/^\/api\/admin\/in-app-market\/sales\/(\d+)$/);
  if (saleMatch && req.method === "PATCH") {
    const id = Number(saleMatch[1]);
    const sale = marketState.sales.find((candidate) => candidate.id === id);
    if (!sale) return res.status(404).json({ error: "Market sale not found" });
    if (req.body?.name !== undefined) sale.name = String(req.body.name);
    if (req.body?.active !== undefined) sale.active = Boolean(req.body.active);
    if (req.body?.discountPercent !== undefined) {
      sale.discountPercent = Math.max(0, Math.min(99, Math.floor(Number(req.body.discountPercent) || 0)));
    }
    if (req.body?.category !== undefined) sale.category = req.body.category ? String(req.body.category) : null;
    if (req.body?.sku !== undefined) sale.sku = req.body.sku ? String(req.body.sku) : null;
    sale.updatedAt = nowIso();
    return res.json(harnessMarketAdminPayload());
  }
  if (saleMatch && req.method === "DELETE") {
    const id = Number(saleMatch[1]);
    marketState.sales = marketState.sales.filter((candidate) => candidate.id !== id);
    return res.json(harnessMarketAdminPayload());
  }
  if (pathName === "/api/admin/users") return res.json([]);
  if (pathName === "/api/admin/xp/events") return res.json([]);
  if (pathName === "/api/admin/reward-ledger") return res.json([]);
  if (pathName === "/api/admin/contract-activity") return res.json([]);
  if (pathName === "/api/admin/wtf-subdomains") return res.json([]);
  if (pathName === "/api/admin/permissions") {
    return res.json({
      admin: { access_admin_panel: true, manage_roles: true, manage_desktop_apps: true },
      host: {},
      cohost: {},
      contestant: {},
      viewer: {},
    });
  }
  if (pathName.startsWith("/api/admin/")) return res.json({ ok: true, users: [], items: [], stats: {} });
  if (pathName.startsWith("/api/control-board/")) return res.json({ ok: true, state: null, events: [] });

  return null;
}

// Some pages call this; return null for unused calls.
app.get("/api/auth/twitter-oauth2/diagnostics", (_req, res) => {
  res.json({ ok: true, configured: true });
});
app.get("/api/auth/twitter-oauth2/diagnostics/self-test", (_req, res) => {
  res.json({ ok: true });
});

// ── W microapp ──────────────────────────────────────────────────
app.get("/api/w/capabilities", (_req, res) => {
  res.json({
    mode: "digest",
    canReadTimeline: true,
    canReplyInline: false,
    canPost: false,
    canLike: false,
    canRepost: false,
    canQuote: false,
    canDm: false,
    oauth2Configured: false,
    platformAccountConfigured: false,
    platformAccountSource: "none",
    platformAccountReason: null,
    platformAccountHandle: "",
    groupchatConfigured: false,
    groupchatIds: [],
    connected: false,
    canUseAdminControls: true,
    scopes: [],
    tiers: [],
    capabilities: [{ key: "timeline", scopes: [], available: true, enabled: true }],
    defaultAccountHandle: "",
  });
});

app.get("/api/w/timeline", (_req, res) => {
  res.json({
    source: "w-digest-scraper",
    refreshedAt: nowIso(),
    canReplyInline: false,
    accounts: [{ userId: 0, username: "tezos", displayName: "@tezos", twitterHandle: "tezos", profileUrl: "https://x.com/tezos" }],
    timeline: [],
    diagnostics: { message: "Harness digest timeline", fromCache: true, cachedAt: nowIso() },
  });
});

app.get("/api/w/admin/digest-handles", (_req, res) => {
  res.json({
    handles: [{ handle: "tezos", enabled: true, initialScrapeCompleted: true, latestPostId: "1", lastScrapedAt: nowIso() }],
    scraperConfigured: false,
  });
});

app.get("/api/admin/w-digest-handles", (_req, res) => {
  res.json({
    handles: [{ handle: "tezos", enabled: true, initialScrapeCompleted: true, latestPostId: "1", lastScrapedAt: nowIso() }],
    scraperConfigured: false,
  });
});

app.get("/api/w/follows/summary", (_req, res) => {
  res.json({
    profile: {
      id: "11111",
      username: "wtf_admin",
      name: "WTF Admin",
      profileImageUrl: "https://example.com/avatar.png",
      followersCount: 42,
      followingCount: 7,
    },
  });
});

app.get("/api/w/spaces", (_req, res) => {
  res.json({ spaces: [], creatorHandle: "wtf_admin" });
});

app.get("/api/w/admin/dm-conversations", (_req, res) => {
  res.json({
    currentConversationId: "g1934373363226407162",
    currentConversationIds: ["g1934373363226407162"],
    conversations: [
      {
        id: "g1934373363226407162",
        type: "group",
        name: "WTF Gameshow Group",
        createdAt: "2026-04-01T00:00:00Z",
        participantCount: 3,
        participants: [
          { id: "11111", username: "wtf_admin", name: "WTF Admin", profileImageUrl: null },
          { id: "22222", username: "wtf_gameshow", name: "WTF Gameshow", profileImageUrl: null },
          { id: "33333", username: "contestant_one", name: "Contestant", profileImageUrl: null },
        ],
      },
    ],
  });
});

app.get("/api/w/user-dms", (_req, res) => {
  res.json({
    conversations: [],
    filtered: true,
    policy: "test",
    rateLimitedUntil: null,
    cachedAt: Date.now(),
  });
});

// The endpoint we're actually testing — switchable.
app.get("/api/w/groupchat", (_req, res) => {
  state.groupchatRequestCount += 1;
  logRequest(_req);

  switch (state.mode) {
    case "rate-limited": {
      // Soft 429: server returns 200 + rateLimitedUntil + cached payload.
      const rateLimitedUntil = Date.now() + 30_000; // 30s window
      const cached = {
        configured: true,
        conversationId: "g1934373363226407162",
        conversation: {
          id: "g1934373363226407162",
          type: "group",
          name: "WTF Gameshow Group",
          createdAt: "2026-04-01T00:00:00Z",
          participantCount: 3,
          participants: [],
        },
        messages: [
          {
            id: "msg-cached-1",
            text: "Cached message from before the rate limit hit",
            createdAt: "2026-04-26T12:00:00Z",
            sender: { id: "22222", username: "wtf_gameshow", name: "WTF Gameshow", profileImageUrl: null },
          },
        ],
        diagnostics: {
          message: "X DM lookup is rate-limited; showing cached messages. Auto-resumes in ~30s.",
          rateLimited: true,
        },
        rateLimitedUntil,
        cachedAt: Date.now() - 5_000,
      };
      return res.json({
        ...cached,
        chats: [cached],
        readonly: false,
        canWrite: true,
        defaultAccountHandle: "wtf_gameshow",
        rateLimitedUntil,
      });
    }
    case "cold-rate-limited": {
      // Soft 429 with no cached data — proves the client doesn't loop.
      const rateLimitedUntil = Date.now() + 60_000;
      return res.json({
        configured: false,
        conversationId: null,
        messages: [],
        chats: [],
        readonly: true,
        canWrite: false,
        rateLimitedUntil,
        diagnostics: {
          message: "X DM lookup is rate-limited. Try again in ~1m.",
          rateLimited: true,
        },
      });
    }
    case "normal":
    default: {
      const payload = {
        configured: true,
        conversationId: "g1934373363226407162",
        conversation: {
          id: "g1934373363226407162",
          type: "group",
          name: "WTF Gameshow Group",
          createdAt: "2026-04-01T00:00:00Z",
          participantCount: 3,
          participants: [],
        },
        messages: [
          {
            id: "msg-1",
            text: "Hello world from the W harness",
            createdAt: nowIso(),
            sender: { id: "22222", username: "wtf_gameshow", name: "WTF Gameshow", profileImageUrl: null },
          },
        ],
        diagnostics: null,
        rateLimitedUntil: null,
        cachedAt: Date.now(),
      };
      return res.json({
        ...payload,
        chats: [payload],
        readonly: false,
        canWrite: true,
        defaultAccountHandle: "wtf_gameshow",
        rateLimitedUntil: null,
      });
    }
  }
});

// Catch-all for unmocked /api/* — returns empty 200 to keep the page from
// surfacing unrelated errors.
app.use("/api", (req, res) => {
  const mocked = apiMock(req, res);
  if (mocked) return;
  res.json({ ok: true, mocked: true, path: req.originalUrl });
});

// ── Static client + SPA fallback ────────────────────────────────
app.use(express.static(DIST_DIR, { fallthrough: true, index: false }));
// Express 5 renamed wildcard from "*" to "/*splat".
app.get(/.*/, (_req, res) => {
  res.sendFile(path.join(DIST_DIR, "index.html"));
});

const server = app.listen(PORT, () => {
  console.log(`[harness] listening on http://127.0.0.1:${PORT} (dist: ${DIST_DIR})`);
});

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
