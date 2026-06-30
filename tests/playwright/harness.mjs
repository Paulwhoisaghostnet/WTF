// Playwright local harness: serves the built W microapp client (dist/public)
// and mocks every backend endpoint W.tsx hits, so we can drive the UI in a
// headless browser without Postgres / X API credentials.
//
// State is mutable via POST /__test/state — the test sets the desired
// scenario ("normal", "rate-limited", "cold") and then hits the page.

import express from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket, WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, "../../dist/public");
const PORT = Number(process.env.HARNESS_PORT || 4173);
const COBWEBSAINTS_FULL_USER_ROLE = "cobwebsaints_full_user";

const state = {
  mode: "normal", // "normal" | "rate-limited" | "cold-rate-limited" | "ok-after-rate-limit"
  userRole: "admin",
  groupchatRequestCount: 0,
  groupchatLog: [],
  interactionLog: [],
  authUser: { id: 1, username: "wtf-admin", displayName: "WTF Admin" },
  skywirePostPayloads: [],
  skywireFollowPayloads: [],
  skywireGroupPayloads: [],
  skywireSignals: [],
  skywireLiveStatus: null,
  skywireChatEnabled: true,
  skywireHandle: "wtf-admin.bsky.social",
  welcomePending: false,
  welcomeCompleteUnauthorized: false,
  wtfLiveSoundboard: { clips: [], armed: true, updatedAt: null },
  macaroniPackages: [],
  macaroniNextPackageId: 1,
  macaroniNextItemId: 1,
  wtfUserSiteClaimed: false,
  wtfLiveOwnedRoom: { id: "my-room", title: "My Room", kind: "room", description: "Owned public room", source: "user", ownerUserId: 1, accessMode: "public", isPublic: true },
  wtfLivePrivateRoom: null,
  wtfLivePrivateMembers: [],
  wtfLiveOwnedStage: { id: "my-stage", title: "My Stage", kind: "stage", description: "Owned stage", liveUrl: "/live", source: "user", ownerUserId: 1, isPublic: true },
};

function nowIso() {
  return new Date().toISOString();
}

function defaultAuthUserForRole(role) {
  if (role === "anonymous") return null;
  if (role === "admin") return { id: 1, username: "wtf-admin", displayName: "WTF Admin" };
  return { id: 2, username: "wtf-user", displayName: "WTF User" };
}

function currentAuthUser() {
  if (state.userRole === "anonymous") return null;
  return state.authUser || defaultAuthUserForRole(state.userRole);
}

function isCobwebsaintsUser(user = currentAuthUser()) {
  return String(user?.username || "").toLowerCase() === "cobwebsaints";
}

function siteSafeLabelForUser(user = currentAuthUser()) {
  const raw = String(user?.username || "wtf-admin").toLowerCase();
  return raw.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "wtf-admin";
}

function mockWtfUserSiteState() {
  const user = currentAuthUser();
  const label = siteSafeLabelForUser(user);
  const host = `${label}.wtfos.me`;
  const eligibility = {
    canClaim: true,
    label,
    host,
    reasons: [],
    hasWallet: true,
    hasOAuthSocial: true,
    hasLinkedBluesky: true,
    hasActiveWtfDid: true,
    canIssueWtfDid: true,
    didTarget: {
      did: `did:web:${host}`,
      source: "wtf",
      handle: host,
      pdsUrl: "https://pds.wtfos.me",
      wtfosIdentityId: 1,
    },
  };
  if (!state.wtfUserSiteClaimed) return { eligibility, site: null };
  return {
    eligibility,
    site: {
      id: 1,
      label,
      host,
      url: `https://${host}/`,
      status: "draft",
      activeDid: eligibility.didTarget.did,
      activeDidSource: "wtf",
      proofGraceUntil: null,
      suspendedAt: null,
      suspendedReason: null,
      publishedAt: null,
      pages: [
        {
          id: 1,
          slug: "home",
          title: "Home",
          draftHtml: "<main><h1>Harness Home</h1></main>",
          sortOrder: 0,
          updatedAt: nowIso(),
        },
      ],
      versions: [],
      assets: [],
      assetBytes: 0,
      maxAssetBytes: 500 * 1024 * 1024,
      maxNamedPages: 25,
    },
  };
}

function mockWtfDomainPlan(labelInput, targetAddress, includeSalt = false) {
  const label = String(labelInput || siteSafeLabelForUser()).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "wtf-admin";
  const target = String(targetAddress || "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY");
  const body = {
    enabled: true,
    network: "ghostnet",
    parentDomain: "wtf.tez",
    registrarAddress: "KT1HarnessRegistrar11111111111111111111",
    label,
    fullName: `${label}.wtf.tez`,
    targetAddress: target,
    labelHex: Buffer.from(label, "utf8").toString("hex"),
    minCommitAgeSec: 1,
    operations: [
      {
        phase: "commit",
        destination: "KT1HarnessRegistrar11111111111111111111",
        entrypoint: "commit",
        value: { commitmentHash: "client-computed harness hash" },
      },
      {
        phase: "register",
        destination: "KT1HarnessRegistrar11111111111111111111",
        entrypoint: "register",
        value: { label, targetAddress: target, salt: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      },
    ],
  };
  return includeSalt
    ? {
        ...body,
        salt: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        hashFormula: "blake2b(pack(label_bytes, sender_address, target_address, salt_bytes))",
      }
    : body;
}

function accountDomainIdentity(user = currentAuthUser()) {
  const label = siteSafeLabelForUser(user);
  const host = `${label}.wtfos.me`;
  return {
    label,
    host,
    wtfTezHost: `${label}.wtf.tez`,
    did: `did:web:${host}`,
    pdsUrl: "https://pds.wtfos.me",
    identityId: Number(user?.id || 1),
  };
}

function mockIpfsPinningOverview(policy = null) {
  const identity = accountDomainIdentity();
  const hasSite = Boolean(state.wtfUserSiteClaimed);
  const did = hasSite ? identity.did : null;
  return {
    organ: "ipfs-pinning",
    role: {
      roles: ["user", "wtf_pin_collector"],
      canUsePinning: true,
      hasPinCollectorRole: true,
      permissionKey: "use_wtfos_pinning",
      marketSku: "wtf-pin-collector-pass",
      legacyAliasSku: "wtf-autopin-membership",
    },
    prerequisites: {
      hasActivePdsRepo: hasSite,
      hasWtfosSite: hasSite,
      siteSuspended: false,
      spineEnabled: true,
    },
    pds: hasSite
      ? {
          repoDid: did,
          handle: identity.host,
          pdsUrl: identity.pdsUrl,
          identityId: identity.identityId,
          hasRepo: true,
        }
      : null,
    site: hasSite
      ? {
          id: 3001,
          host: identity.host,
          status: "active",
          activeDid: did,
          wtfosIdentityId: identity.identityId,
          atprotoHandleClaimId: 77,
          wellKnownUrl: `https://${identity.host}/.well-known/wtfos-pins`,
        }
      : null,
    subdomainRefs: hasSite
      ? [
          { kind: "wtfos.me", host: identity.host },
          { kind: "wtf.tez", host: identity.wtfTezHost, grantId: 88 },
        ]
      : [],
    provider: {
      key: "wtfos-porcupin-hetzner",
      kind: "wtfos_porcupin_hetzner",
      health: "configured",
      enabled: true,
      storageRoot: "/mnt/wtf-data/workers/porcupin",
      hostedApiConfigured: true,
      pinataFallbackConfigured: false,
      lastCheckAt: null,
      lastError: null,
    },
    storage: {
      objectStorage: {
        configured: true,
        bucket: "wtfos-harness",
        endpoint: "https://s3.eu-central-1.hetzner.cloud",
        region: "eu-central",
        uploadsProtected: true,
      },
      s3Access: {
        ok: true,
        bucket: "wtfos-harness",
        endpoint: "https://s3.eu-central-1.hetzner.cloud",
      },
      storageBoxMirror: { configured: false, scope: "manifest_proofs_only" },
    },
    quota: {
      usedBytes: 5242880,
      quotaBytes: 10737418240,
      remainingBytes: 10732175360,
      jobs: 1,
      pinnedJobs: 1,
    },
    policies: policy
      ? [{ id: 99, scopeType: "wallet_full", scopeRef: policy.scopeRef ?? "tz1HarnessWallet", pdsStatus: "queued" }]
      : [],
    manifests: hasSite
      ? [
          {
            id: 12,
            scopeType: "wallet_full",
            scopeRef: policy?.scopeRef ?? "tz1HarnessWallet",
            walletAddress: policy?.walletAddress ?? "tz1HarnessWallet",
            pdsRecordUri: `at://${did}/app.wtfos.media.pinManifest/harness`,
            pdsStatus: "published",
            createdAt: "2026-06-13T00:00:00.000Z",
          },
        ]
      : [],
    jobs: hasSite
      ? [
          {
            id: 21,
            cid: "bafybeiharnesspinningfixture",
            source: "wallet_scan",
            status: "pinned",
            providerKey: "wtfos-porcupin-hetzner",
            byteSize: 5242880,
            pdsStatus: "published",
          },
        ]
      : [],
  };
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
  const defaultAuthUser = defaultAuthUserForRole(state.userRole);
  state.authUser = defaultAuthUser
    ? {
        ...defaultAuthUser,
        id: Number.isInteger(Number(req.body?.userId)) ? Number(req.body.userId) : defaultAuthUser.id,
        username: String(req.body?.username || defaultAuthUser.username),
        displayName: String(req.body?.displayName || defaultAuthUser.displayName),
      }
    : null;
  state.skywirePostPayloads = [];
  state.skywireFollowPayloads = [];
  state.skywireGroupPayloads = [];
  state.skywireSignals = [];
  state.skywireLiveStatus = null;
  state.skywireChatEnabled = req.body?.skywireChatEnabled !== false;
  state.skywireHandle = String(req.body?.skywireHandle || "wtf-admin.bsky.social");
  state.welcomePending = Boolean(req.body?.welcomePending);
  state.welcomeCompleteUnauthorized = Boolean(req.body?.welcomeCompleteUnauthorized);
  state.wtfLiveSoundboard = { clips: [], armed: true, updatedAt: null };
  state.macaroniPackages = [];
  state.macaroniNextPackageId = 1;
  state.macaroniNextItemId = 1;
  state.wtfUserSiteClaimed = Boolean(req.body?.wtfUserSiteClaimed);
  state.wtfLiveOwnedRoom = { id: "my-room", title: "My Room", kind: "room", description: "Owned public room", source: "user", ownerUserId: 1, accessMode: "public", isPublic: true };
  state.wtfLivePrivateRoom = null;
  state.wtfLivePrivateMembers = [];
  state.wtfLiveOwnedStage = { id: "my-stage", title: "My Stage", kind: "stage", description: "Owned stage", liveUrl: "/live", source: "user", ownerUserId: 1, isPublic: true };
  resetHarnessMarketState();
  res.json({
    ok: true,
    state: {
      mode: state.mode,
      userRole: state.userRole,
      authUser: state.authUser,
      skywireChatEnabled: state.skywireChatEnabled,
      skywireHandle: state.skywireHandle,
      welcomePending: state.welcomePending,
      welcomeCompleteUnauthorized: state.welcomeCompleteUnauthorized,
      wtfUserSiteClaimed: state.wtfUserSiteClaimed,
    },
  });
});

app.get("/__test/state", (_req, res) => {
  res.json({
    mode: state.mode,
    userRole: state.userRole,
    groupchatRequestCount: state.groupchatRequestCount,
    groupchatLog: state.groupchatLog,
    interactionLog: state.interactionLog,
    authUser: state.authUser,
    skywirePostPayloads: state.skywirePostPayloads,
    skywireFollowPayloads: state.skywireFollowPayloads,
    skywireGroupPayloads: state.skywireGroupPayloads,
    skywireSignals: state.skywireSignals,
    skywireLiveStatus: state.skywireLiveStatus,
    skywireChatEnabled: state.skywireChatEnabled,
    skywireHandle: state.skywireHandle,
    welcomePending: state.welcomePending,
    welcomeCompleteUnauthorized: state.welcomeCompleteUnauthorized,
    wtfUserSiteClaimed: state.wtfUserSiteClaimed,
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

app.post("/api/desktop/events", (req, res) => {
  const eventType = String(req.body?.eventType || "desktop.object.clicked");
  const authUser = currentAuthUser() || { id: 1 };
  const event = {
    id: `desktop_evt_${Date.now()}_${state.interactionLog.length}`,
    eventType,
    userId: authUser.id,
    objectId: String(req.body?.objectId || "desktop"),
    objectKind: String(req.body?.objectKind || "object"),
    action: String(req.body?.action || "interact"),
    metadata: req.body?.metadata || {},
    timestamp: nowIso(),
  };
  state.interactionLog.push(event);
  res.json({ ok: true, eventId: event.id });
});

// ── Auth ────────────────────────────────────────────────────────
app.get("/api/auth/csrf-token", (_req, res) => {
  res.json({ csrfToken: "test-csrf-token" });
});

app.get("/api/auth/user", (_req, res) => {
  const authUser = currentAuthUser();
  if (!authUser) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  res.json({
    id: authUser.id,
    username: authUser.username,
    displayName: authUser.displayName,
    role: state.userRole,
    roles: [state.userRole],
    twitterHandle: isCobwebsaintsUser(authUser) ? "unitedsaints" : "wtf_admin",
    twitterVerified: true,
    twitterPublic: true,
    welcomedToWtfOs: !state.welcomePending,
    welcomedToWtfOsAt: state.welcomePending ? null : "2026-01-01T00:00:00Z",
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
        : state.userRole === COBWEBSAINTS_FULL_USER_ROLE
          ? {
              edit_own_profile: true,
              link_wallets: true,
              trusted_arcade_creator: true,
              trusted_console_creator: true,
              trusted_tv_creator: true,
              trusted_market_creator: true,
              use_wtfos_pinning: true,
              access_admin_panel: false,
              manage_roles: false,
            }
        : {},
  });
});

app.post("/api/auth/welcome/complete", (_req, res) => {
  if (state.welcomeCompleteUnauthorized) {
    state.userRole = "anonymous";
    state.authUser = null;
    state.welcomePending = false;
    return res.status(401).json({ error: "Not authenticated" });
  }
  const authUser = currentAuthUser() || defaultAuthUserForRole("admin");
  res.json({
    id: authUser.id,
    username: authUser.username,
    displayName: authUser.displayName,
    role: state.userRole,
    roles: [state.userRole],
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
  const authUser = currentAuthUser() || defaultAuthUserForRole("admin");
  res.json({
    id: authUser.id,
    username: authUser.username,
    displayName: authUser.displayName,
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
  fontPackKey: "wtfos-soft-system",
  chatTypographyPresetKey: "wtfos-default",
  wimChatStyle: {
    fontFamily: "Helvetica",
    fontSize: 12,
    color: "#06135f",
    bold: false,
    italic: false,
    underline: false,
  },
  wtfLiveChatStyle: {
    font: "classic-95",
    color: "ink",
    size: 12,
    bold: false,
    italic: false,
  },
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
  "ipfs-pinning": true,
  "wtf-subdomains": true,
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
    nextTransferId: 2,
    rewardWtfByUserId: { 1: 0, 2: 0 },
    inventoryByUserId: {
      1: {
        "wtf-live-rose": 2,
        "wtf-live-rubber-chicken": 1,
      },
      2: {},
    },
    tipTransfers: [
      {
        id: 1,
        senderUserId: 2,
        receiverUserId: 1,
        sku: "wtf-live-rubber-chicken",
        quantity: 1,
        source: "wtf_live_tip",
        sourceRoomId: "wtf-live",
        note: null,
        status: "completed",
        metadata: { itemName: "Rubber Chicken", redeemWtf: 5 },
        redeemedAt: null,
        rewardLedgerId: null,
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T00:00:00.000Z",
      },
    ],
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
      makeHarnessMarketItem({
        id: 6,
        sku: "wtf-live-rose",
        name: "WTF LIVE Rose",
        description: "A classic rose to throw on stage in WTF LIVE rooms.",
        category: "wtf_live",
        kind: "live-tip",
        priceWtfWhole: 1,
        priceExp: 10,
        rarityTier: 1,
        priceScore: 1,
        priceWtfLocked: true,
        priceScoreLocked: true,
        stockQuantity: 999999,
        metadata: { kind: "live-tip", surface: "wtf-live", tipItem: true, physicalItem: true, redeemWtf: 1, throwLabel: "Rose", animation: "toss-rose" },
      }),
      makeHarnessMarketItem({
        id: 7,
        sku: "wtf-live-pocket-change",
        name: "Pocket Change",
        description: "A handful of coins to drop into a busker guitar case.",
        category: "wtf_live",
        kind: "live-tip",
        priceWtfWhole: 2,
        priceExp: 20,
        rarityTier: 1,
        priceScore: 2,
        priceWtfLocked: true,
        priceScoreLocked: true,
        stockQuantity: 999999,
        metadata: { kind: "live-tip", surface: "wtf-live", tipItem: true, physicalItem: true, redeemWtf: 2, throwLabel: "Pocket Change", animation: "drop-coins" },
      }),
      makeHarnessMarketItem({
        id: 8,
        sku: "wtf-live-rubber-chicken",
        name: "Rubber Chicken",
        description: "A ridiculous rubber chicken to fling onto the stage.",
        category: "wtf_live",
        kind: "live-tip",
        priceWtfWhole: 5,
        priceExp: 50,
        rarityTier: 1,
        priceScore: 5,
        priceWtfLocked: true,
        priceScoreLocked: true,
        stockQuantity: 999999,
        metadata: { kind: "live-tip", surface: "wtf-live", tipItem: true, physicalItem: true, redeemWtf: 5, throwLabel: "Rubber Chicken", animation: "fling-rubber-chicken" },
      }),
      makeHarnessMarketItem({
        id: 9,
        sku: "wtf-live-jalapeno",
        name: "Jalapeno",
        description: "A spicy pepper to toss on stage when the set gets hot.",
        category: "wtf_live",
        kind: "live-tip",
        priceWtfWhole: 10,
        priceExp: 100,
        rarityTier: 1,
        priceScore: 10,
        priceWtfLocked: true,
        priceScoreLocked: true,
        stockQuantity: 999999,
        metadata: { kind: "live-tip", surface: "wtf-live", tipItem: true, physicalItem: true, redeemWtf: 10, throwLabel: "Jalapeno", animation: "toss-jalapeno" },
      }),
      makeHarnessMarketItem({
        id: 10,
        sku: "wtf-live-flaming-heart",
        name: "Flaming Heart",
        description: "A blazing heart to toss when a performer sets the room on fire.",
        category: "wtf_live",
        kind: "live-tip",
        priceWtfWhole: 25,
        priceExp: 250,
        rarityTier: 1,
        priceScore: 25,
        priceWtfLocked: true,
        priceScoreLocked: true,
        stockQuantity: 999999,
        metadata: { kind: "live-tip", surface: "wtf-live", tipItem: true, physicalItem: true, redeemWtf: 25, throwLabel: "Flaming Heart", animation: "throw-flaming-heart" },
      }),
      makeHarnessMarketItem({
        id: 11,
        sku: "wtf-live-pauls-panties",
        name: "Paul's Panties",
        description: "A cursed laundry drop to fling onto the stage when the room gets weird.",
        category: "wtf_live",
        kind: "live-tip",
        priceWtfWhole: 69,
        priceExp: 690,
        rarityTier: 1,
        priceScore: 69,
        priceWtfLocked: true,
        priceScoreLocked: true,
        stockQuantity: 999999,
        metadata: { kind: "live-tip", surface: "wtf-live", tipItem: true, physicalItem: true, redeemWtf: 69, throwLabel: "Paul's Panties", animation: "fling-pauls-panties" },
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

function harnessUserById(userId) {
  if (Number(userId) === 1) return { id: 1, username: "wtf-admin", displayName: "WTF Admin" };
  if (Number(userId) === 2) return { id: 2, username: "wim-online", displayName: "WIM Online" };
  if (Number(userId) === 3) return { id: 3, username: "wim-away", displayName: "WIM Away" };
  return null;
}

function harnessInventoryQuantity(userId, sku) {
  return Number(marketState.inventoryByUserId?.[userId]?.[sku] ?? 0);
}

function setHarnessInventoryQuantity(userId, sku, quantity) {
  marketState.inventoryByUserId[userId] = marketState.inventoryByUserId[userId] ?? {};
  marketState.inventoryByUserId[userId][sku] = Math.max(0, Number(quantity) || 0);
}

function serializeHarnessTipTransfer(transfer) {
  const item = marketState.items.find((candidate) => candidate.sku === transfer.sku);
  return {
    ...transfer,
    name: item?.name ?? transfer.sku,
    redeemWtf: Number(item?.metadata?.redeemWtf ?? transfer.metadata?.redeemWtf ?? 0),
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

const harnessRoleCatalog = [
  {
    slug: "admin",
    label: "Admin",
    category: "access",
    purpose: "Full platform operator role with all permissions and WTF OS access.",
    description: "Harness strict-admin account.",
    accessLevel: 100,
    sortOrder: 10,
    color: "#d10000",
    icon: "shield",
    defaultWtfOsAccess: true,
    isSystem: true,
    isAssignable: true,
  },
  {
    slug: "host",
    label: "Host",
    category: "gameshow",
    purpose: "Gameshow operator role for live rounds, challenge flow, and contestants.",
    description: "Harness live-ops operator.",
    accessLevel: 80,
    sortOrder: 20,
    color: "#005eb8",
    icon: "mic",
    defaultWtfOsAccess: true,
    isSystem: true,
    isAssignable: true,
  },
  {
    slug: COBWEBSAINTS_FULL_USER_ROLE,
    label: "Cobwebsaints Full User",
    category: "builder",
    purpose: "Non-admin full user role reserved for cobwebsaints.",
    description: "Harness role that grants creator, social, market, and pinning affordances without admin authority.",
    accessLevel: 45,
    sortOrder: 55,
    color: "#8b5cf6",
    icon: "sparkles",
    defaultWtfOsAccess: true,
    isSystem: false,
    isAssignable: false,
  },
  {
    slug: "contestant",
    label: "Contestant",
    category: "gameshow",
    purpose: "Player role with public apps and challenge participation.",
    description: "Harness participant role.",
    accessLevel: 30,
    sortOrder: 70,
    color: "#84cc16",
    icon: "gamepad",
    defaultWtfOsAccess: true,
    isSystem: true,
    isAssignable: true,
  },
];

const harnessRoleSurfaces = [
  {
    id: "admin-control-suite",
    label: "Admin Control Suite",
    domain: "Admin/ops",
    subdomain: "Roles/permissions/app gates",
    kind: "admin-tool",
    routePatterns: ["/admin"],
    desktopAppKey: "admin",
    adminPanelTabs: ["users", "roles", "os-admin", "automation"],
    nativeSettings: ["os.admin.roleManagement", "os.admin.appRegistry"],
    automationHandles: ["admin.role_catalog.updated", "admin.permissions.updated", "admin.role_access.updated"],
    adminRoutes: ["/api/admin/roles", "/api/admin/permissions", "/api/admin/role-access"],
  },
  {
    id: "control-board",
    label: "Control Board",
    domain: "Gameshow Ops",
    subdomain: "Host controls",
    kind: "tool",
    routePatterns: ["/control-board"],
    desktopAppKey: "control-board",
    adminPanelTabs: ["seasons", "rounds", "challenges"],
    nativeSettings: ["os.controlBoard.enabled"],
    automationHandles: ["control_board.action_applied"],
    adminRoutes: ["/api/control-board/state"],
  },
  {
    id: "desktop-app-gates",
    label: "Desktop and Start Menu App Gates",
    domain: "Admin/ops",
    subdomain: "Desktop visibility",
    kind: "desktop-item",
    routePatterns: ["/desktop", "/api/admin/apps/desktop"],
    desktopAppKey: "settings",
    adminPanelTabs: ["desktop-apps", "os-admin"],
    nativeSettings: ["desktop.apps.enabled", "startMenu.visible"],
    automationHandles: ["admin.app_gate.updated", "desktop.app.disabled_by_admin"],
    adminRoutes: ["/api/admin/apps/desktop"],
  },
  {
    id: "market-admin",
    label: "In-App Market Admin",
    domain: "Economy",
    subdomain: "Pricing and sales",
    kind: "admin-tool",
    routePatterns: ["/wtfiam", "/marketplace"],
    desktopAppKey: "wtf-iam",
    adminPanelTabs: ["in-app-market", "contract-ledger"],
    nativeSettings: ["economy.market.repricing"],
    automationHandles: ["wtfiam.admin.price_rebalanced", "wtfiam.admin.sale_updated"],
    adminRoutes: ["/api/admin/in-app-market/items"],
  },
  {
    id: "arcade-admin",
    label: "Arcade Admin",
    domain: "Arcade/console",
    subdomain: "Game moderation",
    kind: "app",
    routePatterns: ["/arcade", "/console", "/game-studio"],
    desktopAppKey: "arcade",
    adminPanelTabs: ["arcade"],
    nativeSettings: ["arcade.moderation.enabled"],
    automationHandles: ["arcade.game.approved", "arcade.report.resolved"],
    adminRoutes: ["/api/arcade/admin/games", "/api/arcade/admin/reports"],
  },
  {
    id: "studio-admin",
    label: "Studio Admin",
    domain: "Platform Apps",
    subdomain: "Creator storage",
    kind: "app",
    routePatterns: ["/studio", "/game-studio"],
    desktopAppKey: "studio",
    adminPanelTabs: ["studio"],
    nativeSettings: ["studio.drive.root"],
    automationHandles: ["studio.storage.updated"],
    adminRoutes: ["/api/studio/admin/drive/status"],
  },
  {
    id: "tv-admin",
    label: "WTF TV Admin",
    domain: "Platform Apps",
    subdomain: "TV programming",
    kind: "app",
    routePatterns: ["/tv", "/wtf-tv"],
    desktopAppKey: "wtf-tv",
    adminPanelTabs: ["wtf-tv"],
    nativeSettings: ["tv.sourceMode", "tv.bumpers.enabled"],
    automationHandles: ["admin.tv.config_updated"],
    adminRoutes: ["/api/admin/wtf-tv"],
  },
];

function harnessRoleAccessPayload(extra = {}) {
  const allSurfaceAccess = Object.fromEntries(harnessRoleSurfaces.map((surface) => [surface.id, true]));
  return {
    ...extra,
    roles: harnessRoleCatalog,
    surfaces: harnessRoleSurfaces,
    matrix: {
      admin: allSurfaceAccess,
      host: {
        "control-board": true,
        "arcade-admin": true,
        "studio-admin": true,
        "tv-admin": true,
      },
      contestant: {
        "arcade-admin": true,
        "studio-admin": true,
      },
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
  if (pathName === "/api/desktop/settings" && req.method === "GET") {
    return res.json({ appearance: desktopAppearance, iconLayout: {}, updatedAt: null });
  }
  if (pathName === "/api/desktop/settings" && req.method === "PUT") {
    Object.assign(desktopAppearance, req.body?.appearance ?? {});
    return res.json({ appearance: desktopAppearance, iconLayout: {}, updatedAt: nowIso() });
  }
  if (pathName === "/api/atproto/oauth/start") {
    const wantsChat = url.searchParams.get("chat") === "1" || url.searchParams.get("chat") === "true";
    const handle = url.searchParams.get("handle") || "wtf-admin.bsky.social";
    if (handle === "missing.bsky.social") {
      const redirect = new URL("/skywire", "http://127.0.0.1");
      redirect.searchParams.set("tab", "account");
      redirect.searchParams.set("error", "atproto_handle_not_found");
      redirect.searchParams.set("handle", handle);
      return res.redirect(`${redirect.pathname}${redirect.search}`);
    }
    return res.type("html").send(`<!doctype html>
<html>
  <head><title>Harness Skywire OAuth</title></head>
  <body>
    <p>Harness Skywire OAuth ${wantsChat ? "chat upgrade" : "connect"} pending for @${handle}.</p>
  </body>
</html>`);
  }
  if (pathName === "/api/atproto/me") {
    const skywireChatEnabled = state.skywireChatEnabled !== false;
    const skywireOauthScopes = skywireChatEnabled
      ? "atproto transition:generic chat.bsky"
      : "atproto transition:generic";
    const skywireCapabilities = [
      "profileWrite",
      "liveStatus",
      "socialActions",
      "compose",
      "signals",
      "rooms",
      "stages",
      "notifications",
      ...(skywireChatEnabled ? ["chat"] : []),
    ];
    return res.json({
      enabled: true,
      account: {
        id: 1,
        did: isCobwebsaintsUser() ? "did:plc:hlwiidixnd2bcc65tkvsmfs2" : "did:plc:skywiretest",
        handle: isCobwebsaintsUser() ? "cobwebsaints.bsky.social" : state.skywireHandle,
        pdsUrl: isCobwebsaintsUser() ? "https://stropharia.us-west.host.bsky.network" : "https://bsky.social",
        displayName: isCobwebsaintsUser() ? "Cobweb" : "WTF Admin",
        avatarUrl: null,
        description: "Inventory harness Skywire account",
        hasEncryptedTokens: true,
        hasDpopKey: true,
        lastSyncedAt: nowIso(),
        oauthScopes: skywireOauthScopes,
        oauthRequestedScopes: skywireOauthScopes,
        oauthPermissionTier: "be-bold",
        oauthChatEnabled: skywireChatEnabled,
        oauthCapabilities: skywireCapabilities,
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
  if (pathName === "/api/wtf-live/soundboard" && req.method === "GET") {
    return res.json({
      ...state.wtfLiveSoundboard,
      storage: "harness_wtf_live_soundboard",
    });
  }
  if (pathName === "/api/wtf-live/soundboard" && req.method === "PUT") {
    state.wtfLiveSoundboard = {
      clips: Array.isArray(req.body?.clips) ? req.body.clips : [],
      armed: req.body?.armed !== false,
      updatedAt: nowIso(),
    };
    logHarnessInteraction("wtf_live.soundboard.configured", {
      clipCount: state.wtfLiveSoundboard.clips.length,
      armed: state.wtfLiveSoundboard.armed,
    });
    return res.json({
      ...state.wtfLiveSoundboard,
      storage: "harness_wtf_live_soundboard",
    });
  }
  if (/^\/api\/wtf-live\/public\/rooms\/[^/]+$/.test(pathName) && req.method === "GET") {
    const roomId = pathName.split("/")[5];
    const publicRooms = [
      { id: "wtf-live", title: "WTF LIVE", kind: "room", description: "Official show room", source: "system", ownerUserId: null, accessMode: "public", isPublic: true },
      ...(state.wtfLiveOwnedRoom?.isPublic && state.wtfLiveOwnedRoom.accessMode !== "private" ? [state.wtfLiveOwnedRoom] : []),
    ];
    const room = publicRooms.find((candidate) => candidate.id === roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    return res.json({
      room: { ...room, presence: liveRoomPresence(room.id) },
      joinMode: "guest_room_only",
      roomPath: `/live/r/${room.id}`,
      capabilities: {
        audio: true,
        camera: true,
        screen: true,
        media: true,
        transport: "webrtc_mesh_via_wtf_live_signaling",
      },
    });
  }
  if (/^\/api\/wtf-live\/public\/rooms\/[^/]+\/messages$/.test(pathName) && req.method === "GET") {
    const roomId = pathName.split("/")[5];
    return res.json({ roomId, collection: "app.wtfgameshow.skywire.room.message", messages: [], cursor: null, source: "harness" });
  }
  if (/^\/api\/wtf-live\/rooms\/[^/]+\/messages$/.test(pathName) && req.method === "GET") {
    const roomId = pathName.split("/")[4];
    if (state.wtfLivePrivateRoom?.id === roomId) {
      return res.json({
        roomId,
        collection: null,
        messages: [],
        cursor: null,
        source: "wtf-live.privateRealtimeOnly",
        upstreamAvailable: true,
      });
    }
    return res.json({ roomId, collection: "app.wtfgameshow.skywire.room.message", messages: [], cursor: null, source: "harness" });
  }
  if (pathName === "/api/wtf-live/rooms" && req.method === "GET") {
    const ownedRoom = state.wtfLiveOwnedRoom?.isPublic ? state.wtfLiveOwnedRoom : null;
    return res.json({
      rooms: [
        { id: "wtf-live", title: "WTF LIVE", kind: "room", description: "Official show room", source: "system", ownerUserId: null, accessMode: "public", isPublic: true },
        ...(ownedRoom && ownedRoom.accessMode !== "private" ? [ownedRoom] : []),
      ].map((room) => ({ ...room, presence: liveRoomPresence(room.id) })),
      collection: "app.wtfgameshow.skywire.room.message",
      storage: "public_atproto_repo_records",
      skywirePath: "/skywire?tab=account",
    });
  }
  if (pathName === "/api/wtf-live/rooms/mine" && req.method === "GET") {
    return res.json({
      rooms: [state.wtfLiveOwnedRoom, state.wtfLivePrivateRoom]
        .filter(Boolean)
        .map((room) => ({ ...room, presence: liveRoomPresence(room.id) })),
      collection: "app.wtfgameshow.skywire.room.message",
      storage: "wtf_live_rooms",
    });
  }
  if (pathName === "/api/wtf-live/rooms/private" && req.method === "GET") {
    return res.json({
      rooms: state.wtfLivePrivateRoom ? [{ ...state.wtfLivePrivateRoom, presence: liveRoomPresence(state.wtfLivePrivateRoom.id) }] : [],
      collection: "app.wtfgameshow.skywire.room.message",
      storage: "wtf_live_room_access_members",
      accessMode: "private",
    });
  }
  if (pathName === "/api/wtf-live/rooms" && req.method === "POST") {
    const title = String(req.body?.title || "New Room").trim();
    const accessMode = req.body?.accessMode === "private" ? "private" : "public";
    const room = { id: accessMode === "private" ? "private-room" : "my-room", title, kind: "room", description: req.body?.description || "", source: "user", ownerUserId: 1, accessMode, isPublic: true };
    if (accessMode === "private") {
      state.wtfLivePrivateRoom = room;
      state.wtfLivePrivateMembers = Array.isArray(req.body?.accessUsernames)
        ? req.body.accessUsernames.map((username, index) => ({ userId: index + 2, username: String(username).replace(/^@/, ""), displayName: null }))
        : [];
    } else {
      state.wtfLiveOwnedRoom = room;
    }
    return res.status(201).json({
      room: { ...room, presence: liveRoomPresence(room.id) },
      members: accessMode === "private" ? state.wtfLivePrivateMembers : [],
      missingUsernames: [],
    });
  }
  if (/^\/api\/wtf-live\/rooms\/[^/]+\/join$/.test(pathName) && req.method === "GET") {
    const roomId = pathName.split("/")[4];
    const candidates = [
      { id: "wtf-live", title: "WTF LIVE", kind: "room", description: "Official show room", source: "system", ownerUserId: null, accessMode: "public", isPublic: true },
      state.wtfLiveOwnedRoom,
      state.wtfLivePrivateRoom,
    ].filter(Boolean);
    const room = candidates.find((candidate) => candidate.id === roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    return res.json({
      room: { ...room, presence: liveRoomPresence(room.id) },
      joinMode: room.accessMode === "private" ? "wtf_user_private_room" : "guest_room_only",
      roomPath: `/live/r/${room.id}`,
      capabilities: { audio: true, camera: true, screen: true, media: true, transport: "webrtc_mesh_via_wtf_live_signaling", privateRoom: room.accessMode === "private" },
    });
  }
  if (/^\/api\/wtf-live\/rooms\/[^/]+\/access$/.test(pathName) && req.method === "GET") {
    const roomId = pathName.split("/")[4];
    if (!state.wtfLivePrivateRoom || state.wtfLivePrivateRoom.id !== roomId) {
      return res.status(404).json({ error: "Owned private room not found" });
    }
    return res.json({ roomId, members: state.wtfLivePrivateMembers });
  }
  if (/^\/api\/wtf-live\/rooms\/[^/]+\/access$/.test(pathName) && req.method === "PATCH") {
    const roomId = pathName.split("/")[4];
    if (!state.wtfLivePrivateRoom || state.wtfLivePrivateRoom.id !== roomId) {
      return res.status(404).json({ error: "Owned private room not found" });
    }
    state.wtfLivePrivateMembers = Array.isArray(req.body?.usernames)
      ? req.body.usernames.map((username, index) => ({ userId: index + 2, username: String(username).replace(/^@/, ""), displayName: null }))
      : [];
    return res.json({ room: { ...state.wtfLivePrivateRoom, presence: liveRoomPresence(roomId) }, members: state.wtfLivePrivateMembers, missingUsernames: [] });
  }
  if (/^\/api\/wtf-live\/rooms\/[^/]+$/.test(pathName) && req.method === "PATCH") {
    const roomId = pathName.split("/")[4];
    const targetKey = state.wtfLiveOwnedRoom?.id === roomId ? "wtfLiveOwnedRoom" : state.wtfLivePrivateRoom?.id === roomId ? "wtfLivePrivateRoom" : null;
    if (!targetKey) {
      return res.status(404).json({ error: "Owned room not found" });
    }
    state[targetKey] = {
      ...state[targetKey],
      isPublic: Boolean(req.body?.isPublic),
    };
    return res.json({ room: { ...state[targetKey], presence: liveRoomPresence(state[targetKey].id) } });
  }
  if (/^\/api\/wtf-live\/rooms\/[^/]+$/.test(pathName) && req.method === "DELETE") {
    const roomId = pathName.split("/")[4];
    if (state.wtfLivePrivateRoom?.id === roomId) {
      state.wtfLivePrivateRoom = null;
      state.wtfLivePrivateMembers = [];
      return res.json({ ok: true, roomId });
    }
    if (!state.wtfLiveOwnedRoom || state.wtfLiveOwnedRoom.id !== roomId) {
      return res.status(404).json({ error: "Owned room not found" });
    }
    state.wtfLiveOwnedRoom = null;
    return res.json({ ok: true, roomId });
  }
  if (pathName === "/api/wtf-live/stages" && req.method === "GET") {
    return res.json({
      stages: [
        { id: "wtf-stage", title: "WTF Stage", kind: "stage", description: "Official stage", liveUrl: "/live", source: "system", isPublic: true },
        ...(state.wtfLiveOwnedStage?.isPublic ? [state.wtfLiveOwnedStage] : []),
      ],
      collection: "app.wtfgameshow.skywire.stage.broadcast",
      storage: "public_atproto_repo_records",
      mode: "one_way_broadcast",
      skywirePath: "/skywire?tab=account",
    });
  }
  if (pathName === "/api/wtf-live/stages/mine" && req.method === "GET") {
    return res.json({
      stages: state.wtfLiveOwnedStage ? [state.wtfLiveOwnedStage] : [],
      collection: "app.wtfgameshow.skywire.stage.broadcast",
      storage: "wtf_live_stages",
    });
  }
  if (pathName === "/api/wtf-live/stages" && req.method === "POST") {
    const title = String(req.body?.title || "New Stage").trim();
    state.wtfLiveOwnedStage = { id: "my-stage", title, kind: "stage", description: req.body?.description || "", liveUrl: req.body?.liveUrl || null, source: "user", ownerUserId: 1, isPublic: true };
    return res.status(201).json({
      stage: state.wtfLiveOwnedStage,
    });
  }
  if (/^\/api\/wtf-live\/stages\/[^/]+$/.test(pathName) && req.method === "PATCH") {
    const stageId = pathName.split("/")[4];
    if (!state.wtfLiveOwnedStage || state.wtfLiveOwnedStage.id !== stageId) {
      return res.status(404).json({ error: "Owned stage not found" });
    }
    state.wtfLiveOwnedStage = { ...state.wtfLiveOwnedStage, isPublic: Boolean(req.body?.isPublic) };
    return res.json({ stage: state.wtfLiveOwnedStage });
  }
  if (/^\/api\/wtf-live\/stages\/[^/]+$/.test(pathName) && req.method === "DELETE") {
    const stageId = pathName.split("/")[4];
    if (!state.wtfLiveOwnedStage || state.wtfLiveOwnedStage.id !== stageId) {
      return res.status(404).json({ error: "Owned stage not found" });
    }
    state.wtfLiveOwnedStage = null;
    return res.json({ ok: true, stageId });
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
        pagination: {
          limit: 24,
          offset: 0,
          hasMore: false,
          nextOffset: 1,
        },
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
  if (pathName === "/api/skywire/live-status" && req.method === "GET") {
    return res.json({
      status: state.skywireLiveStatus,
      collection: "app.bsky.actor.status",
      rkey: "self",
      source: "inventory.harness.skywire.liveStatus",
    });
  }
  if (pathName === "/api/skywire/live-status" && req.method === "POST") {
    state.skywireLiveStatus = {
      uri: "at://did:plc:skywiretest/app.bsky.actor.status/self",
      cid: "bafyreilivestatus",
      status: "app.bsky.actor.status#live",
      liveUrl: String(req.body?.liveUrl || ""),
      title: String(req.body?.title || "WTF LIVE"),
      description: String(req.body?.description || ""),
      durationMinutes: Number(req.body?.durationMinutes || 120),
      createdAt: nowIso(),
      source: "app.bsky.actor.status",
    };
    return res.status(201).json({
      status: state.skywireLiveStatus,
      collection: "app.bsky.actor.status",
      rkey: "self",
      source: "inventory.harness.skywire.liveStatus.put",
      note: "Harness live status saved.",
    });
  }
  if (pathName === "/api/skywire/live-status" && req.method === "DELETE") {
    state.skywireLiveStatus = null;
    return res.json({
      ok: true,
      collection: "app.bsky.actor.status",
      rkey: "self",
      source: "inventory.harness.skywire.liveStatus.delete",
    });
  }
  if (pathName === "/api/skywire/signals" && req.method === "GET") {
    return res.json({
      collection: "app.wtfgameshow.skywire.signal",
      records: state.skywireSignals,
      cursor: null,
      source: "inventory.harness.skywire.signals",
    });
  }
  if (pathName === "/api/skywire/signals" && req.method === "POST") {
    const rkey = randomUUID().replace(/-/g, "").slice(0, 14);
    const tags = Array.isArray(req.body?.tags) ? req.body.tags.map((tag) => String(tag)).filter(Boolean) : [];
    const value = {
      $type: "app.wtfgameshow.skywire.signal",
      text: String(req.body?.text || ""),
      signalType: String(req.body?.signalType || "status"),
      tags,
      relatedUri: req.body?.relatedUri ? String(req.body.relatedUri) : null,
      wtfUserId: state.authUser?.id ?? 1,
      wtfUsername: state.authUser?.username ?? "wtf-admin",
      source: "wtfos.skywire",
      createdAt: nowIso(),
    };
    const record = {
      uri: `at://did:plc:skywiretest/app.wtfgameshow.skywire.signal/${rkey}`,
      cid: `bafyrei${rkey}`,
      value,
    };
    state.skywireSignals = [record, ...state.skywireSignals].slice(0, 50);
    state.interactionLog.push({
      eventType: "atproto.signal.published",
      timestamp: nowIso(),
      metadata: { signalType: value.signalType, tags },
    });
    return res.status(201).json({
      collection: "app.wtfgameshow.skywire.signal",
      uri: record.uri,
      cid: record.cid,
      record: value,
      source: "inventory.harness.skywire.signals.put",
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
    const latestGroup = state.skywireGroupPayloads.at(-1);
    const groupConvo = latestGroup
      ? {
          id: "test-group-convo",
          rev: "1",
          status: "accepted",
          muted: false,
          unreadCount: 0,
          kind: "group",
          groupName: String(latestGroup.groupName || "Harness group"),
          memberCount: Array.isArray(latestGroup.members) ? latestGroup.members.length + 1 : 3,
          members: [
            { did: "did:plc:skywiretest", handle: "wtf-admin.bsky.social", displayName: "WTF Admin", avatar: null, description: null },
            { did: "did:plc:harness", handle: "harness.bsky.social", displayName: "Harness Skywire", avatar: null, description: null },
            { did: "did:plc:second", handle: "second.bsky.social", displayName: "Second Skywire", avatar: null, description: null },
          ],
          lastMessage: null,
        }
      : null;
    return res.json({
      convos: [
        ...(groupConvo ? [groupConvo] : []),
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
    const members = Array.isArray(req.body?.members) ? req.body.members : [];
    const isGroup = members.length > 1;
    if (isGroup) state.skywireGroupPayloads.push(req.body ?? {});
    return res.json({
      convo: {
        id: isGroup ? "test-group-convo" : "test-convo",
        rev: "1",
        status: "accepted",
        muted: false,
        unreadCount: 0,
        kind: isGroup ? "group" : "direct",
        groupName: isGroup ? String(req.body?.groupName || "Harness group") : null,
        memberCount: isGroup ? members.length + 1 : 2,
        members: [
          { did: "did:plc:skywiretest", handle: "wtf-admin.bsky.social", displayName: "WTF Admin", avatar: null, description: null },
          { did: "did:plc:harness", handle: "harness.bsky.social", displayName: "Harness Skywire", avatar: null, description: null },
        ],
        lastMessage: null,
      },
      source: "inventory.harness.skywire.resolve",
    });
  }
  if (pathName === "/api/skywire/chats/test-group-convo/messages" && req.method === "GET") {
    return res.json({
      convoId: "test-group-convo",
      messages: [],
      cursor: null,
      source: "inventory.harness.skywire.groupMessages",
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
    const members = Array.isArray(req.body?.members) ? req.body.members : [];
    const isGroup = members.length > 1;
    if (isGroup) state.skywireGroupPayloads.push(req.body ?? {});
    return res.status(201).json({
      convo: {
        id: isGroup ? "test-group-convo" : "test-convo",
        rev: "1",
        status: "accepted",
        muted: false,
        unreadCount: 0,
        kind: isGroup ? "group" : "direct",
        groupName: isGroup ? String(req.body?.groupName || "Harness group") : null,
        memberCount: isGroup ? members.length + 1 : 2,
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
    const authUser = currentAuthUser() || { id: 1 };
    const category = url.searchParams.get("category");
    const items = marketState.items
      .filter((item) => item.active && (!category || item.category === category))
      .map((item) => ({
        ...serializeHarnessMarketItem(item),
        quantityOwned: harnessInventoryQuantity(authUser.id, item.sku),
      }));
    const inventory = Object.entries(marketState.inventoryByUserId?.[authUser.id] ?? {})
      .filter(([_sku, quantity]) => Number(quantity) > 0)
      .map(([sku, quantity]) => ({
        sku,
        quantity,
        metadata: { source: "harness" },
        updatedAt: nowIso(),
      }));
    const tipTransfers =
      category === "wtf_live"
        ? marketState.tipTransfers
            .filter((transfer) => transfer.receiverUserId === authUser.id || transfer.senderUserId === authUser.id)
            .map(serializeHarnessTipTransfer)
        : [];
    return res.json({
      config: {
        configured: true,
        contractAddress: null,
        treasuryAddress: "tz1-test-treasury",
        network: "inventory-harness",
      },
      items,
      inventory,
      balances: { exp: 1000, rewardWtf: marketState.rewardWtfByUserId?.[authUser.id] ?? 0 },
      purchases: [],
      tipLedger:
        category === "wtf_live"
          ? {
              received: tipTransfers.filter((transfer) => transfer.receiverUserId === authUser.id),
              sent: tipTransfers.filter((transfer) => transfer.senderUserId === authUser.id),
            }
          : undefined,
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
  if (pathName === "/api/in-app-market/tips" && req.method === "POST") {
    const sender = currentAuthUser();
    if (!sender) return res.status(401).json({ error: "Not authenticated" });
    const receiver = harnessUserById(req.body?.receiverUserId);
    if (!receiver || receiver.id === sender.id) {
      return res.status(400).json({ error: "Choose another WTF LIVE user to tip" });
    }
    const sku = String(req.body?.sku || "");
    const item = marketState.items.find((candidate) => candidate.sku === sku && candidate.category === "wtf_live");
    if (!item) return res.status(404).json({ error: "That item cannot be used as a WTF LIVE tip" });
    const quantity = Math.max(1, Math.min(10, Number(req.body?.quantity) || 1));
    const owned = harnessInventoryQuantity(sender.id, sku);
    if (owned < quantity) {
      return res.status(409).json({ error: "You do not own that WTF LIVE tip item", reason: "not_owned" });
    }
    setHarnessInventoryQuantity(sender.id, sku, owned - quantity);
    setHarnessInventoryQuantity(receiver.id, sku, harnessInventoryQuantity(receiver.id, sku) + quantity);
    const now = nowIso();
    const transfer = {
      id: marketState.nextTransferId++,
      senderUserId: sender.id,
      receiverUserId: receiver.id,
      sku,
      quantity,
      source: "wtf_live_tip",
      sourceRoomId: req.body?.roomId ? String(req.body.roomId) : null,
      note: req.body?.note ? String(req.body.note) : null,
      status: "completed",
      metadata: {
        itemName: item.name,
        redeemWtf: Number(item.metadata?.redeemWtf ?? 0),
        senderUsername: sender.username,
        receiverUsername: receiver.username,
      },
      redeemedAt: null,
      rewardLedgerId: null,
      createdAt: now,
      updatedAt: now,
    };
    marketState.tipTransfers.push(transfer);
    return res.status(201).json({
      ok: true,
      transfer: serializeHarnessTipTransfer(transfer),
      item: { sku: item.sku, name: item.name, redeemWtf: Number(item.metadata?.redeemWtf ?? 0) },
      receiver,
      senderRemainingQuantity: harnessInventoryQuantity(sender.id, sku),
    });
  }
  if (pathName === "/api/in-app-market/tips/redeem" && req.method === "POST") {
    const user = currentAuthUser();
    if (!user) return res.status(401).json({ error: "Not authenticated" });
    const transferId = Number(req.body?.transferId);
    const transfer = marketState.tipTransfers.find((candidate) => candidate.id === transferId && candidate.receiverUserId === user.id);
    if (!transfer) return res.status(404).json({ error: "Tip transfer was not found", reason: "transfer_not_found" });
    if (transfer.redeemedAt || transfer.status === "redeemed") {
      return res.status(409).json({ error: "That WTF LIVE tip was already redeemed", reason: "already_redeemed" });
    }
    const item = marketState.items.find((candidate) => candidate.sku === transfer.sku);
    const owned = harnessInventoryQuantity(user.id, transfer.sku);
    if (owned < transfer.quantity) {
      return res.status(409).json({ error: "You no longer have that WTF LIVE tip item in inventory", reason: "not_owned" });
    }
    const amountWtf = Number(item?.metadata?.redeemWtf ?? 0) * transfer.quantity;
    const rewardLedgerId = 9000 + transfer.id;
    setHarnessInventoryQuantity(user.id, transfer.sku, owned - transfer.quantity);
    marketState.rewardWtfByUserId[user.id] = (marketState.rewardWtfByUserId[user.id] ?? 0) + amountWtf;
    transfer.status = "redeemed";
    transfer.redeemedAt = nowIso();
    transfer.rewardLedgerId = rewardLedgerId;
    transfer.updatedAt = transfer.redeemedAt;
    transfer.metadata = { ...transfer.metadata, rewardLedgerId, amountWtf };
    return res.json({
      ok: true,
      transfer: serializeHarnessTipTransfer(transfer),
      rewardLedgerId,
      amountWtf,
      remainingQuantity: harnessInventoryQuantity(user.id, transfer.sku),
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
  if (pathName === "/api/ipfs-pinning/policies" && req.method === "POST") {
    return res.status(201).json({
      overview: mockIpfsPinningOverview(req.body),
    });
  }
  if (pathName === "/api/ipfs-pinning/overview") {
    return res.json(mockIpfsPinningOverview());
  }
  if (pathName === "/api/wtf-subdomains/pins/summary") {
    const identity = accountDomainIdentity();
    return res.json({
      binding: state.wtfUserSiteClaimed
        ? {
            host: identity.host,
            status: "active",
            manifestAtUri: `at://${identity.did}/app.wtfos.media.pinManifest/harness`,
          }
        : null,
      manifests: [],
    });
  }
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
  if (pathName === "/api/messages/dms") {
    return res.json([
      {
        id: 77,
        title: null,
        unreadCount: 2,
        conversationType: "direct",
        peers: [
          {
            id: 3,
            userId: 3,
            username: "wim-away",
            displayName: "WIM Away",
            online: false,
          },
        ],
        latestMessage: {
          id: 501,
          senderId: 3,
          content: "Queued WIM ping from the harness.",
          createdAt: nowIso(),
        },
      },
    ]);
  }
  if (pathName === "/api/messages/dms/77/messages") {
    return res.json([
      {
        id: 501,
        senderId: 3,
        username: "wim-away",
        displayName: "WIM Away",
        content: "Queued WIM ping from the harness.",
        createdAt: nowIso(),
      },
    ]);
  }
  if (pathName === "/api/messages/dms/101/messages" && req.method === "POST") {
    return res.status(201).json({
      id: 601,
      senderId: 1,
      username: "admin",
      displayName: "Admin User",
      content: String(req.body?.content || "Harness WIM message"),
      createdAt: nowIso(),
    });
  }
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
        presenceStatus: "active",
        lastActiveAt: nowIso(),
        sessionExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 3,
        username: "wim-away",
        displayName: "WIM Away",
        avatarUrl: null,
        role: "witness",
        experiencePoints: 7,
        online: false,
        presenceStatus: "inactive",
        lastActiveAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        sessionExpiresAt: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000 - 45 * 60 * 1000
        ).toISOString(),
      },
      {
        id: 4,
        username: "wim-offline",
        displayName: "WIM Offline",
        avatarUrl: null,
        role: "witness",
        experiencePoints: 3,
        online: false,
        presenceStatus: "offline",
        lastActiveAt: null,
        sessionExpiresAt: null,
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
        tezosRpcUrl: "https://tezos-mainnet.octez.io/",
      },
      jobs: { ok: true, registered: 7, running: 0, recentErrors: 0 },
    });
  }
  if (pathName === "/api/links" || pathName === "/api/faq") return res.json([]);
  if (pathName.startsWith("/api/leaderboard")) return res.json([]);
  if (/^\/api\/users\/[^/]+$/.test(pathName)) {
    const username = decodeURIComponent(pathName.split("/").pop() || "wtf-admin");
    const isCobwebsaintsProfile = username.toLowerCase() === "cobwebsaints";
    return res.json({
      id: username === "wtf-admin" ? 1 : 2,
      username,
      displayName: username === "wtf-admin" ? "WTF Admin" : isCobwebsaintsProfile ? "Cobweb" : "WTF User",
      role: username === "wtf-admin" ? "admin" : isCobwebsaintsProfile ? COBWEBSAINTS_FULL_USER_ROLE : "user",
      experiencePoints: 420,
      bio: "Inventory harness public profile",
      pfpImageUrl: null,
      twitterHandle: username === "wtf-admin" ? "wtf_admin" : isCobwebsaintsProfile ? "unitedsaints" : null,
      twitterVerified: username === "wtf-admin" || isCobwebsaintsProfile,
      discordHandle: null,
      discordVerified: false,
      wallets: ["tz1-test-wallet"],
      createdAt: "2026-01-01T00:00:00Z",
    });
  }
  if (/^\/api\/users\/[^/]+\/trade-board$/.test(pathName)) {
    return res.json([
      {
        id: 701,
        tokenContract: "KT1-beta-trade",
        tokenId: "7",
        tokenName: "Signal Piece",
        balance: "1",
        creatorName: "WTF Studio",
        collectionName: "Beta Proof",
        tradeBoardQuantity: 1,
      },
    ]);
  }
  if (/^\/api\/users\/[^/]+\/listings$/.test(pathName)) return res.json([]);
  if (/^\/api\/users\/[^/]+\/activity$/.test(pathName)) {
    return res.json([
      {
        id: 8101,
        amount: 15,
        reason: "daily_loop:public_progress_check",
        createdAt: "2026-06-23T12:00:00Z",
      },
    ]);
  }
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
  if (pathName === "/api/wtf-sites/my") return res.json(mockWtfUserSiteState());
  if (pathName === "/api/wtf-sites/claim" && req.method === "POST") {
    state.wtfUserSiteClaimed = true;
    return res.status(201).json(mockWtfUserSiteState());
  }
  if (pathName === "/api/wtf-subdomains/my") return res.json([]);
  if (pathName === "/api/wtf-subdomains/registrar/config") {
    return res.json({
      config: {
        enabled: true,
        network: "ghostnet",
        parentDomain: "wtf.tez",
        registrarAddress: "KT1HarnessRegistrar11111111111111111111",
        rpcUrl: "https://rpc.ghostnet.teztnets.com",
        tzktApi: "https://api.ghostnet.tzkt.io",
        domainsGraphql: "https://api.tezos.domains/graphql",
        tedAppUrl: "https://app.tezos.domains",
        tedCheckAddress: "KT1TedCheck1111111111111111111111111",
        tedSetChildRecord: "KT1TedChild1111111111111111111111111",
        tedUpdateRecord: "KT1TedUpdate11111111111111111111111",
        missingEnv: [],
      },
      storage: {
        minCommitAgeSec: 1,
        maxCommitAgeSec: 86400,
        maxPerWallet: 1,
        paused: false,
        whitelistEnabled: false,
        nameRegistry: "KT1HarnessRegistry11111111111111111111",
      },
    });
  }
  if (pathName.startsWith("/api/wtf-subdomains/registrar/status/")) {
    const address = decodeURIComponent(pathName.split("/").pop() || "");
    return res.json({
      address,
      reverseDomain: null,
      wtfDomains: [],
      hackDomains: [],
      registrar: {
        enabled: true,
        parentDomain: "wtf.tez",
        registrarAddress: "KT1HarnessRegistrar11111111111111111111",
        pendingCommitHash: null,
        registrationCount: 0,
        minCommitAgeSec: 1,
        paused: false,
        canRegister: true,
      },
    });
  }
  if (pathName === "/api/wtf-subdomains/registrar/commit" && req.method === "POST") {
    return res.json(mockWtfDomainPlan(req.body?.label, req.body?.targetAddress, true));
  }
  if (pathName === "/api/wtf-subdomains/registrar/prepare" && req.method === "POST") {
    return res.json(mockWtfDomainPlan(req.body?.label, req.body?.targetAddress, false));
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
  if (pathName === "/api/marketplace/trade-board") {
    return res.json({
      contractAddress: "KT1-beta-market",
      items: [
        {
          ownerWallet: "tz1-test-wallet",
          ownerUsername: "wtf-admin",
          ownerDisplayName: "WTF Admin",
          tokenContract: "KT1-beta-trade",
          tokenId: "7",
          tokenAmount: "1",
          tradeBoardQuantity: 1,
          tokenName: "Signal Piece",
          collectionName: "Beta Proof",
          creatorName: "WTF Studio",
        },
      ],
      pagination: { limit: 4, offset: 0, count: 1, hasMore: false, nextOffset: 1 },
    });
  }
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
        replayScan: {
          requestedWindowHours: Number(url.searchParams.get("windowHours") || 24),
          requestedBlocks: Number(url.searchParams.get("windowHours") || 24) * 600,
          chunkBlocks: 500,
          maxPages: 29,
          pagesScanned: 29,
          fromLevel: 120000,
          toLevel: 134400,
          scannedFromLevel: 120000,
          scannedToLevel: 134400,
          estimatedScannedHours: 24,
          completedWindow: true,
          stopReason: "window-covered",
          replayEventCount: 120,
          collectRecordCount: 2,
          listingSignalRecordCount: 1,
          transferRecordCount: 2,
          pageCapHitCount: 0,
          pageErrorCount: 0,
          oldestEventAt: "2026-05-26T10:17:37.000Z",
          newestEventAt: "2026-05-26T10:17:37.000Z",
          oldestCollectAt: "2026-05-26T10:17:37.000Z",
        },
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
  if (pathName === "/api/admin/roles") return res.json({ roles: harnessRoleCatalog });
  if (pathName === "/api/admin/role-access") return res.json(harnessRoleAccessPayload());
  if (pathName === "/api/admin/role-access/reset") return res.json(harnessRoleAccessPayload({ ok: true }));
  if (pathName === "/api/admin/permissions") {
    return res.json({
      admin: { access_admin_panel: true, manage_roles: true, manage_desktop_apps: true },
      host: {},
      cohost: {},
      [COBWEBSAINTS_FULL_USER_ROLE]: {
        trusted_arcade_creator: true,
        trusted_console_creator: true,
        trusted_tv_creator: true,
        trusted_market_creator: true,
        use_wtfos_pinning: true,
        access_admin_panel: false,
        manage_roles: false,
      },
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

function logHarnessInteraction(eventType, metadata = {}) {
  const authUser = currentAuthUser() || { id: 1 };
  state.interactionLog.push({
    id: `harness_evt_${Date.now()}_${state.interactionLog.length}`,
    eventType,
    userId: authUser.id,
    timestamp: nowIso(),
    source: "inventory-harness",
    metadata,
  });
}

app.post("/api/system/logs/client", (req, res) => {
  const eventType = String(req.body?.eventType || "client_event");
  logHarnessInteraction(eventType, {
    severity: req.body?.severity || "info",
    message: req.body?.message || "",
    url: req.body?.url || "",
    ...(req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {}),
  });
  res.json({ ok: true, eventId: `harness-client-${state.interactionLog.length}` });
});

function cheaseDefaultDropConfig(pkg) {
  return {
    exportTarget: "macaroni",
    layout: "single-page",
    theme: "gallery-white",
    headline: pkg?.title || "Untitled drop",
    intro: pkg?.description || "A wtfOS-staged collection package.",
    callToAction: "View collection",
    modules: {
      dropStory: true,
      mintPanel: true,
      tokenGrid: true,
      recentMints: false,
      mintGallery: true,
      leaderboard: false,
      collectionCompletion: false,
    },
  };
}

function cheasePackageSummary(pkg) {
  const totalBytes = pkg.items.reduce((sum, item) => sum + item.sizeBytes, 0);
  return {
    id: pkg.id,
    title: pkg.title,
    description: pkg.description,
    schemaVersion: 1,
    status: pkg.status,
    itemCount: pkg.items.length,
    totalBytes,
    averageBytes: pkg.items.length ? Math.round(totalBytes / pkg.items.length) : 0,
    csvCid: pkg.csvCid,
    manifestCid: pkg.manifestCid,
    dropConfig: pkg.dropConfig,
    finalizedAt: pkg.finalizedAt,
    createdAt: pkg.createdAt,
    updatedAt: pkg.updatedAt,
  };
}

function cheaseItemPayload(item) {
  const hasMedia = Boolean(item.mediaCid);
  const hasMetadata = Boolean(item.metadataCid || item.tokenName);
  const hasName = Boolean(item.tokenName);
  return {
    id: item.id,
    packageId: item.packageId,
    tokenId: item.tokenId,
    originalFilename: item.originalFilename,
    originalTitle: item.originalTitle,
    normalizedFilename: item.normalizedFilename,
    tokenName: item.tokenName,
    tokenDescription: item.tokenDescription,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    checksumSha256: "harness-checksum",
    mediaCid: item.mediaCid,
    mediaJobId: `media-${item.id}`,
    metadataCid: item.metadataCid,
    metadataJobId: item.metadataCid ? `metadata-${item.id}` : null,
    tags: item.tags,
    attributes: item.attributes,
    metadataJson: null,
    readiness: {
      hasMedia,
      hasMetadata,
      hasName,
      readyForMint: hasMedia && hasMetadata && hasName,
      warnings: [],
    },
    status: hasMedia && hasMetadata && hasName ? "ready" : "needs_metadata",
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function cheasePackageDetail(pkg) {
  return {
    package: cheasePackageSummary(pkg),
    items: pkg.items.map(cheaseItemPayload),
  };
}

function cheasePackageById(id) {
  return state.macaroniPackages.find((pkg) => pkg.id === Number(id));
}

function cheaseCsvForPackage(pkg) {
  const header = "token_id,token_name,original_filename,normalized_filename,tags,attributes\n";
  const rows = pkg.items.map((item) => {
    const attrs = item.attributes.map((attr) => `${attr.name}:${attr.value}`).join(";");
    return [item.tokenId, item.tokenName, item.originalFilename, item.normalizedFilename, item.tags.join(";"), attrs]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(",");
  });
  return `${header}${rows.join("\n")}\n`;
}

function parseCheaseUploadMeta(buffer) {
  const body = Buffer.isBuffer(buffer) ? buffer.toString("latin1") : "";
  const filename = body.match(/filename="([^"]+)"/)?.[1] || "Moon Salad FINAL 04.png";
  const mimeType = body.match(/Content-Type:\s*([^\r\n]+)/i)?.[1]?.trim() || "image/png";
  const ext = filename.includes(".") ? filename.split(".").pop() || "bin" : "bin";
  const originalTitle = filename.replace(/\.[^.]+$/, "");
  return { filename, mimeType, ext, originalTitle };
}

const cheaseUploadBody = express.raw({ type: () => true, limit: "10mb" });

app.get("/api/macaroni/packages", (_req, res) => {
  res.json({ packages: state.macaroniPackages.map(cheasePackageSummary) });
});

app.post("/api/macaroni/packages", (req, res) => {
  const pkg = {
    id: state.macaroniNextPackageId++,
    title: String(req.body?.title || "CH-EASE Package"),
    description: String(req.body?.description || ""),
    status: "draft",
    items: [],
    csvCid: null,
    manifestCid: null,
    dropConfig: null,
    finalizedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  pkg.dropConfig = cheaseDefaultDropConfig(pkg);
  state.macaroniPackages.unshift(pkg);
  logHarnessInteraction("macaroni.package_created", { packageId: pkg.id });
  res.json(cheasePackageDetail(pkg));
});

app.get("/api/macaroni/packages/:packageId", (req, res) => {
  const pkg = cheasePackageById(req.params.packageId);
  if (!pkg) return res.status(404).json({ error: "Macaroni package not found" });
  res.json(cheasePackageDetail(pkg));
});

app.post("/api/macaroni/packages/:packageId/items", cheaseUploadBody, (req, res) => {
  const pkg = cheasePackageById(req.params.packageId);
  if (!pkg) return res.status(404).json({ error: "Macaroni package not found" });
  const upload = parseCheaseUploadMeta(req.body);
  const tokenId = pkg.items.length + 1;
  const item = {
    id: state.macaroniNextItemId++,
    packageId: pkg.id,
    tokenId,
    originalFilename: upload.filename,
    originalTitle: upload.originalTitle,
    normalizedFilename: `${tokenId}.${upload.ext}`,
    tokenName: upload.originalTitle,
    tokenDescription: "",
    mimeType: upload.mimeType,
    sizeBytes: Buffer.isBuffer(req.body) ? req.body.length : 0,
    mediaCid: `bafy-chease-media-${tokenId}`,
    metadataCid: null,
    tags: [],
    attributes: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  pkg.items.push(item);
  pkg.updatedAt = nowIso();
  logHarnessInteraction("macaroni.package_item_uploaded", { packageId: pkg.id, itemId: item.id });
  res.json(cheasePackageDetail(pkg));
});

app.patch("/api/macaroni/packages/:packageId/config", (req, res) => {
  const pkg = cheasePackageById(req.params.packageId);
  if (!pkg) return res.status(404).json({ error: "Macaroni package not found" });
  pkg.dropConfig = { ...cheaseDefaultDropConfig(pkg), ...(req.body || {}) };
  pkg.updatedAt = nowIso();
  logHarnessInteraction("macaroni.package_drop_config_updated", { packageId: pkg.id });
  res.json(cheasePackageDetail(pkg));
});

app.patch("/api/macaroni/packages/:packageId/items/:itemId", (req, res) => {
  const pkg = cheasePackageById(req.params.packageId);
  if (!pkg) return res.status(404).json({ error: "Macaroni package not found" });
  const item = pkg.items.find((candidate) => candidate.id === Number(req.params.itemId));
  if (!item) return res.status(404).json({ error: "Macaroni package item not found" });
  item.tokenName = String(req.body?.tokenName || item.tokenName);
  item.tokenDescription = String(req.body?.tokenDescription || "");
  item.tags = String(req.body?.tags || "")
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  item.attributes = Array.isArray(req.body?.attributes) ? req.body.attributes : [];
  item.metadataCid = `bafy-chease-metadata-${item.id}`;
  item.updatedAt = nowIso();
  pkg.updatedAt = nowIso();
  logHarnessInteraction("macaroni.package_metadata_updated", { packageId: pkg.id, itemId: item.id });
  res.json(cheasePackageDetail(pkg));
});

app.post("/api/macaroni/packages/:packageId/finalize", (req, res) => {
  const pkg = cheasePackageById(req.params.packageId);
  if (!pkg) return res.status(404).json({ error: "Macaroni package not found" });
  pkg.status = "finalized";
  pkg.csvCid = `bafy-chease-csv-${pkg.id}`;
  pkg.manifestCid = `bafy-chease-manifest-${pkg.id}`;
  pkg.finalizedAt = nowIso();
  pkg.updatedAt = nowIso();
  logHarnessInteraction("macaroni.package_finalized", { packageId: pkg.id });
  res.json(cheasePackageDetail(pkg));
});

app.get("/api/macaroni/packages/:packageId/export.csv", (req, res) => {
  const pkg = cheasePackageById(req.params.packageId);
  if (!pkg) return res.status(404).send("Macaroni package not found");
  logHarnessInteraction("macaroni.package_csv_downloaded", { packageId: pkg.id, target: req.query?.target || "macaroni" });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="macaroni-package-${pkg.id}.csv"`);
  res.send(cheaseCsvForPackage(pkg));
});

app.get("/api/macaroni/packages/:packageId/source", (req, res) => {
  const pkg = cheasePackageById(req.params.packageId);
  if (!pkg) return res.status(404).json({ error: "Macaroni package not found" });
  logHarnessInteraction("macaroni.package_source_loaded", { packageId: pkg.id, itemCount: pkg.items.length });
  res.json({
    source: "wtfos-macaroni-package",
    package: cheasePackageSummary(pkg),
    dropConfig: pkg.dropConfig,
    tokens: pkg.items.map((item) => ({
      id: item.tokenId,
      quantity: 1,
      name: item.tokenName,
      title: item.tokenName,
      description: item.tokenDescription,
      tags: item.tags,
      attributes: item.attributes,
      fileName: item.normalizedFilename,
      mediaBytes: item.sizeBytes,
      mediaCid: item.mediaCid,
      mediaMime: item.mimeType,
      metadataCid: item.metadataCid || "",
    })),
  });
});

// Catch-all for unmocked /api/* — returns empty 200 to keep the page from
// surfacing unrelated errors.
app.use("/api", (req, res) => {
  const mocked = apiMock(req, res);
  if (mocked || res.headersSent) return;
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

const livePeers = new Map();
const liveWss = new WebSocketServer({ server, path: "/ws/wtf-live" });
const MAX_LIVE_AVATAR_DATA_URL_LENGTH = Math.ceil(512 * 1024 * 1.4);
const LIVE_CHAT_FONTS = new Set(["classic-95", "terminal", "serif-press"]);
const LIVE_LEGACY_CHAT_FONT_MAP = {
  system: "classic-95",
  "mek-mono": "classic-95",
  "grout-display": "classic-95",
  mono: "terminal",
  serif: "serif-press",
  pixel: "classic-95",
};
const LIVE_CHAT_COLORS = new Set(["ink", "blue", "green", "red", "purple", "amber"]);
const LIVE_ROOM_REACTION_LABELS = {
  "👏": "Applause",
  "🔥": "Fire",
  "😂": "Laugh",
  "😮": "Wow",
  "❤️": "Love",
  "👀": "Watching",
};

function liveSend(ws, payload) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function liveBroadcast(roomId, payload, excludeWs = null) {
  for (const [ws, client] of livePeers) {
    if (ws === excludeWs || client.roomId !== roomId || ws.readyState !== WebSocket.OPEN) continue;
    liveSend(ws, payload);
  }
}

function liveIdentityForGuestName(displayName) {
  const normalized = String(displayName || "").trim().replace(/^@/, "").toLowerCase();
  const authUser = currentAuthUser();
  if (
    authUser &&
    [authUser.username, authUser.displayName].some((value) =>
      String(value || "").trim().replace(/^@/, "").toLowerCase() === normalized
    )
  ) {
    return { userId: authUser.id, username: authUser.username, isWtfUser: true };
  }
  const knownUsers = new Map([
    ["wtf-admin", { userId: 1, username: "wtf-admin", isWtfUser: true }],
    ["wtf admin", { userId: 1, username: "wtf-admin", isWtfUser: true }],
    ["wim-online", { userId: 2, username: "wim-online", isWtfUser: true }],
    ["wim online", { userId: 2, username: "wim-online", isWtfUser: true }],
    ["wim-away", { userId: 3, username: "wim-away", isWtfUser: true }],
    ["wim away", { userId: 3, username: "wim-away", isWtfUser: true }],
  ]);
  return knownUsers.get(normalized) || { userId: null, username: null, isWtfUser: false };
}

function livePeerPayload(client) {
  return {
    peerId: client.peerId,
    guestName: client.guestName,
    userId: client.userId,
    username: client.username,
    isWtfUser: client.isWtfUser,
    mediaState: client.mediaState,
  };
}

function liveSnapshot(roomId, excludeWs) {
  return [...livePeers]
    .filter(([ws, client]) => ws !== excludeWs && client.roomId === roomId)
    .map(([_ws, client]) => livePeerPayload(client));
}

function liveRoomPresence(roomId) {
  const peers = [...livePeers]
    .filter(([ws, client]) => ws.readyState === WebSocket.OPEN && client.roomId === roomId)
    .map(([_ws, client]) => client);
  const audioOpenCount = peers.filter((client) => client.mediaState?.audioOpen).length;
  const cameraShareCount = peers.filter((client) => client.mediaState?.activeVideo === "camera").length;
  const screenShareCount = peers.filter((client) => client.mediaState?.activeVideo === "screen").length;
  return {
    active: peers.length > 0,
    participantCount: peers.length,
    audioOpenCount,
    videoShareCount: cameraShareCount + screenShareCount,
    cameraShareCount,
    screenShareCount,
  };
}

function liveSanitizeTrackId(value) {
  const trackId = String(value || "").trim();
  return trackId && trackId.length <= 160 ? trackId : null;
}

function liveSanitizeMediaName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 96);
  return name || null;
}

function liveNormalizeMediaState(value) {
  const state = value && typeof value === "object" ? value : {};
  const camera = Boolean(state.camera);
  const screen = Boolean(state.screen);
  const requestedActiveVideo = state.activeVideo === "camera" || state.activeVideo === "screen" ? state.activeVideo : null;
  const avatarUrl = typeof state.avatarUrl === "string" &&
    /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(state.avatarUrl) &&
    state.avatarUrl.length <= MAX_LIVE_AVATAR_DATA_URL_LENGTH
    ? state.avatarUrl
    : null;
	  return {
	    mic: Boolean(state.mic),
	    audioOpen: Boolean(state.audioOpen ?? state.mic),
	    camera,
	    screen,
    screenAudio: Boolean(state.screenAudio),
    mediaVideo: Boolean(state.mediaVideo),
    mediaAudio: Boolean(state.mediaAudio),
    mediaName: liveSanitizeMediaName(state.mediaName),
    soundboard: Boolean(state.soundboard),
    activeVideo: requestedActiveVideo === "camera" && camera ? "camera" : requestedActiveVideo === "screen" && screen ? "screen" : null,
    cameraTrackId: liveSanitizeTrackId(state.cameraTrackId),
    screenTrackId: liveSanitizeTrackId(state.screenTrackId),
    mediaVideoTrackId: liveSanitizeTrackId(state.mediaVideoTrackId),
    mediaAudioTrackId: liveSanitizeTrackId(state.mediaAudioTrackId),
    avatarUrl,
  };
}

function liveNormalizeChatStyle(value) {
  if (!value || typeof value !== "object") return undefined;
  const style = value;
  const rawSize = Number(style.size);
  const size = Number.isFinite(rawSize) ? Math.min(14, Math.max(8, Math.round(rawSize))) : 12;
  const font = String(style.font || "");
  const color = String(style.color || "");
  return {
    font: LIVE_CHAT_FONTS.has(font) ? font : LIVE_LEGACY_CHAT_FONT_MAP[font] || "classic-95",
    color: LIVE_CHAT_COLORS.has(color) ? color : "ink",
    size,
    bold: Boolean(style.bold),
    italic: Boolean(style.italic),
  };
}

liveWss.on("connection", (ws) => {
  const client = {
    ws,
    peerId: `peer_${randomUUID().replace(/-/g, "").slice(0, 18)}`,
    roomId: null,
    guestName: "guest",
    userId: null,
    username: null,
    isWtfUser: false,
	    mediaState: {
      mic: false,
      audioOpen: false,
      camera: false,
      screen: false,
      screenAudio: false,
      mediaVideo: false,
      mediaAudio: false,
      mediaName: null,
      soundboard: false,
      activeVideo: null,
      cameraTrackId: null,
      screenTrackId: null,
      mediaVideoTrackId: null,
      mediaAudioTrackId: null,
      avatarUrl: null,
    },
  };
  livePeers.set(ws, client);
  liveSend(ws, { type: "wtf_live_connected", peerId: client.peerId });

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      liveSend(ws, { type: "error", message: "Invalid message" });
      return;
    }

    if (message.type === "wtf_live_join_room") {
      const roomId = String(message.roomId || "wtf-live").trim() || "wtf-live";
      const requestedName = String(message.guestName || "guest").trim() || "guest";
      const identity = liveIdentityForGuestName(requestedName);
      client.roomId = roomId;
      client.userId = identity.userId;
      client.username = identity.username;
      client.isWtfUser = identity.isWtfUser;
      client.guestName = identity.username || requestedName;
      client.mediaState = liveNormalizeMediaState(message.mediaState);
      liveSend(ws, {
        type: "wtf_live_room_snapshot",
        roomId,
        peerId: client.peerId,
        peers: liveSnapshot(roomId, ws),
      });
      liveBroadcast(
        roomId,
        {
          type: "wtf_live_peer_joined",
          roomId,
          peer: livePeerPayload(client),
        },
        ws,
      );
      return;
    }

    if (message.type === "wtf_live_media_state" && client.roomId) {
      client.mediaState = liveNormalizeMediaState(message.mediaState);
      liveBroadcast(client.roomId, {
        type: "wtf_live_media_state",
        roomId: client.roomId,
        peerId: client.peerId,
        guestName: client.guestName,
        userId: client.userId,
        username: client.username,
        isWtfUser: client.isWtfUser,
        mediaState: client.mediaState,
      });
      return;
    }

    if (message.type === "wtf_live_signal" && client.roomId) {
      const targetPeerId = String(message.toPeerId || "");
      const target = [...livePeers].find(([_targetWs, targetClient]) =>
        targetClient.roomId === client.roomId && targetClient.peerId === targetPeerId
      );
      if (!target) return;
      liveSend(target[0], {
        type: "wtf_live_signal",
        roomId: client.roomId,
        fromPeerId: client.peerId,
        signal: message.signal,
      });
      return;
    }

    if (message.type === "wtf_live_soundboard_clip" && client.roomId) {
      liveBroadcast(
        client.roomId,
        {
          type: "wtf_live_soundboard_clip",
          roomId: client.roomId,
          peerId: client.peerId,
          triggeredByName: client.username || client.guestName,
          triggeredByUserId: client.userId,
          soundboardClip: message.clip || message.soundboardClip,
          delivery: message.delivery || "webrtc",
        },
        ws,
      );
      return;
    }

    if (message.type === "wtf_live_chat_message" && client.roomId) {
      const text = String(message.text || "").trim().slice(0, 1200);
      const attachments = Array.isArray(message.attachments) ? message.attachments.slice(0, 4) : [];
      const style = liveNormalizeChatStyle(message.style);
      liveBroadcast(client.roomId, {
        type: "wtf_live_chat_message",
        roomId: client.roomId,
        message: {
          id: `live_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
          peerId: client.peerId,
          guestName: client.guestName,
          text,
          ...(style ? { style } : {}),
          attachments,
          createdAt: new Date().toISOString(),
        },
      });
      return;
    }

    if (message.type === "wtf_live_room_reaction" && client.roomId) {
      const emoji = String(message.emoji || "");
      const label = LIVE_ROOM_REACTION_LABELS[emoji];
      if (!label) {
        liveSend(ws, { type: "error", message: "Unsupported WTF LIVE room reaction" });
        return;
      }
      liveBroadcast(client.roomId, {
        type: "wtf_live_room_reaction",
        roomId: client.roomId,
        reaction: {
          id: `reaction_${Date.now()}_${randomUUID().replace(/-/g, "").slice(0, 8)}`,
          peerId: client.peerId,
          guestName: client.guestName,
          emoji,
          label,
          createdAt: new Date().toISOString(),
        },
      });
    }
  });

  ws.on("close", () => {
    const roomId = client.roomId;
    livePeers.delete(ws);
    if (!roomId) return;
    liveBroadcast(roomId, {
      type: "wtf_live_peer_left",
      roomId,
      peerId: client.peerId,
      guestName: client.guestName,
    });
  });
});

const shutdown = () => {
  liveWss.close(() => {
    server.close(() => process.exit(0));
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
