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
};

function nowIso() {
  return new Date().toISOString();
}

function logRequest(req) {
  state.groupchatLog.push({ ts: Date.now(), path: req.originalUrl });
}

const app = express();
app.use(express.json({ limit: "1mb" }));

// ── Test control ────────────────────────────────────────────────
app.post("/__test/state", (req, res) => {
  state.mode = String(req.body?.mode || "normal");
  state.userRole = String(req.body?.userRole || req.body?.role || "admin");
  state.groupchatRequestCount = 0;
  state.groupchatLog = [];
  state.interactionLog = [];
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

const desktopAppearance = {
  colorSchemeKey: "classic-teal",
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
  w: true,
  tv: true,
  dicksword: true,
  arcade: true,
  casino: true,
  "dues-manager": false,
  console: true,
  "game-studio": true,
  studio: true,
  "my-gallery": true,
  casino: true,
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
  title: "E2E Challenge",
  description: "Inventory harness challenge",
  status: "active",
  rewardXp: 50,
  roundId: 1,
};

const sampleSideQuest = {
  id: 1,
  title: "E2E Side Quest",
  description: "Inventory harness side quest",
  status: "active",
  xpReward: 25,
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

function apiMock(req, res) {
  const url = new URL(req.originalUrl, `http://127.0.0.1:${PORT}`);
  const pathName = url.pathname;

  if (pathName === "/api/apps/desktop" || pathName === "/api/admin/apps/desktop") {
    return res.json({
      apps: desktopApps,
      list: Object.entries(desktopApps).map(([key, enabled]) => ({ key, enabled })),
    });
  }
  if (pathName.startsWith("/api/admin/apps/desktop/")) {
    return res.json({ ok: true, app: pathName.split("/").pop(), enabled: true });
  }
  if (pathName === "/api/desktop/settings") {
    return res.json({ appearance: desktopAppearance, iconLayout: {} });
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
  if (pathName.startsWith("/api/messages/")) return res.json([]);
  if (pathName === "/api/messages/users") return res.json([]);
  if (pathName === "/api/notifications/preferences") return res.json({});
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
  if (pathName.startsWith("/api/tv/channels")) return res.json([]);
  if (pathName.startsWith("/api/tv/") || pathName.startsWith("/api/admin/wtf-tv")) return res.json({ channels: [], items: [], current: null, stream: [] });
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
          status: "planned",
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
  if (pathName.startsWith("/api/dex/")) return res.json({ tokens: [], pools: [], counterparts: [], health: "ok" });
  if (pathName.startsWith("/api/dicksword/")) return res.json({ ok: true, config: {}, claims: [], roleMappings: [], avatarLayers: [] });
  if (pathName.startsWith("/api/etherlink/")) return res.json({ wallets: [], assets: [] });
  if (pathName === "/api/wallets") {
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
    oauth2Configured: true,
    platformAccountConfigured: true,
    platformAccountSource: "user_record",
    platformAccountReason: null,
    platformAccountHandle: "wtf_gameshow",
    groupchatConfigured: true,
    groupchatIds: ["g1934373363226407162"],
    connected: true,
    canUseAdminControls: true,
    scopes: ["tweet.read", "users.read", "tweet.write", "dm.read", "dm.write"],
    tiers: [],
    capabilities: [
      { key: "timeline", scopes: [], available: true, enabled: true },
      { key: "engage", scopes: ["tweet.write"], available: true, enabled: true },
      { key: "messages", scopes: ["dm.read", "dm.write"], available: true, enabled: true },
      { key: "follows", scopes: ["follows.write", "users.read"], available: true, enabled: true },
    ],
    defaultAccountHandle: "wtf_gameshow",
  });
});

app.get("/api/w/timeline", (_req, res) => {
  res.json({
    posts: [],
    accounts: [],
    cachedAt: nowIso(),
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
