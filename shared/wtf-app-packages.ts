import { DESKTOP_APPS, DESKTOP_APP_LABELS, type DesktopAppKey } from "./types";

export const WTF_APP_PACKAGE_ACCEPTANCE_VERSION = 1 as const;

export type WtfAppPackageKind =
  | "desktop-app"
  | "creation-tool"
  | "console-stock-cartridges"
  | "project-bundle"
  | "integration-plugin";

export type WtfAppPackageState =
  | "active"
  | "disabled-by-default"
  | "manifested"
  | "blocked";

export type WtfAppPackageAcceptance = {
  id: string;
  key: string;
  label: string;
  kind: WtfAppPackageKind;
  state: WtfAppPackageState;
  domain: {
    label: string;
    guide: string;
  };
  appKey?: DesktopAppKey;
  toolId?: string;
  routeEvidence: readonly string[];
  provenance: {
    owner: string;
    source: string;
    evidence: readonly string[];
  };
  permissionSummary: {
    userAccess: string;
    adminAccess: string;
    dataTouched: readonly string[];
    externalSystems: readonly string[];
  };
  rollback: {
    method: string;
    evidence: readonly string[];
  };
  uninstall: {
    method: string;
    preservesUserData: boolean;
    evidence: readonly string[];
  };
};

const domainGuides = {
  wtfOs: { label: "WTF OS", guide: "docs/domains/wtf-os.md" },
  identityAndSocial: { label: "Identity And Social", guide: "docs/domains/identity-and-social.md" },
  arcadeConsoleGameStudio: {
    label: "Arcade, Console, And Game Studio",
    guide: "docs/domains/arcade-console-game-studio.md",
  },
  commerceAndWallets: { label: "Commerce And Wallets", guide: "docs/domains/commerce-and-wallets.md" },
  mediaTvStudio: { label: "Media, TV, And Studio", guide: "docs/domains/media-tv-studio.md" },
  tezosPlatform: { label: "Tezos Platform", guide: "docs/domains/tezos-platform.md" },
} as const;

const desktopDomains: Partial<Record<DesktopAppKey, (typeof domainGuides)[keyof typeof domainGuides]>> = {
  wtfiam: domainGuides.commerceAndWallets,
  hoard: domainGuides.tezosPlatform,
  w: domainGuides.identityAndSocial,
  tv: domainGuides.mediaTvStudio,
  dicksword: domainGuides.identityAndSocial,
  "i-hate-telegram": domainGuides.identityAndSocial,
  "dear-diary": domainGuides.wtfOs,
  arcade: domainGuides.arcadeConsoleGameStudio,
  casino: domainGuides.commerceAndWallets,
  "dues-manager": domainGuides.commerceAndWallets,
  console: domainGuides.arcadeConsoleGameStudio,
  "game-studio": domainGuides.arcadeConsoleGameStudio,
  studio: domainGuides.mediaTvStudio,
  gallery: domainGuides.mediaTvStudio,
};

const desktopExternalSystems: Partial<Record<DesktopAppKey, readonly string[]>> = {
  hoard: ["Tezos wallets", "TzKT", "Objkt", "Tezos Domains"],
  w: ["X API"],
  tv: ["Media storage", "token media sources"],
  dicksword: ["Discord"],
  "i-hate-telegram": ["Telegram import sources"],
  arcade: ["Arcade score services"],
  casino: ["Tezos wallet preflight", "casino contract services"],
  "dues-manager": ["Tezos wallet preflight", "Kiln contract tooling"],
  console: ["static cartridge assets"],
  "game-studio": ["Studio project storage", "arcade publishing queue"],
  studio: ["Studio project storage", "media storage"],
  gallery: ["Media storage", "TzKT", "Objkt"],
};

const desktopDataTouched: Partial<Record<DesktopAppKey, readonly string[]>> = {
  wtfiam: ["in_app_market_*", "inventory_items", "xp_events"],
  hoard: ["wallets", "token ownership caches", "profile inventory views"],
  w: ["w_posts", "w_stream_rules", "x_dm_events"],
  tv: ["media_items", "tv_playlist", "system_events"],
  dicksword: ["discord_links", "role grants", "system_events"],
  "i-hate-telegram": ["telegram_digest_items", "system_events"],
  "dear-diary": ["diary_entries", "system_events"],
  arcade: ["arcade_games", "arcade_sessions", "scores"],
  casino: ["casino_sessions", "casino_audit_events", "membership intents"],
  "dues-manager": ["club_dues_contracts", "club_dues_memberships", "system_events"],
  console: ["console_sessions", "console_scores", "installed cartridge manifest"],
  "game-studio": ["game_studio_projects", "arcade submissions", "studio projects"],
  studio: ["studio_projects", "studio_files", "media_items"],
  gallery: ["media_items", "token media cache", "user media libraries"],
};

function desktopPackage(appKey: DesktopAppKey): WtfAppPackageAcceptance {
  return {
    id: `desktop:${appKey}`,
    key: appKey,
    label: DESKTOP_APP_LABELS[appKey],
    kind: "desktop-app",
    state: appKey === "dues-manager" ? "disabled-by-default" : "active",
    domain: desktopDomains[appKey] ?? domainGuides.wtfOs,
    appKey,
    routeEvidence: [
      "shared/types.ts#DESKTOP_APPS",
      "server/lib/desktop-apps.ts#DEFAULT_DESKTOP_APP_CONFIG",
      "client/src/features/admin-os/admin-surface-registry.ts#ADMIN_SURFACES",
    ],
    provenance: {
      owner: "WTF OS",
      source: "live desktop app registry",
      evidence: [
        "shared/types.ts",
        "client/src/routes/page-defs.ts",
        "client/src/components/layout/start-menu-app-gates.ts",
      ],
    },
    permissionSummary: {
      userAccess:
        "Browser session plus route-specific auth/role gates declared by page definitions and server routes.",
      adminAccess:
        "Admins with manage_desktop_apps can show or hide the launcher gate without deleting user data.",
      dataTouched: desktopDataTouched[appKey] ?? ["desktop_app_settings", "system_events"],
      externalSystems: desktopExternalSystems[appKey] ?? [],
    },
    rollback: {
      method:
        "Restore the previous app gate value through PUT /api/admin/apps/desktop/:appKey or roll back the deployed commit.",
      evidence: ["server/routes/desktop-apps.ts", "docs/public-access.md"],
    },
    uninstall: {
      method:
        "Disable the desktop launcher gate and preserve owned records; destructive removal requires a future migration plan.",
      preservesUserData: true,
      evidence: ["server/lib/desktop-apps.ts", "client/src/components/layout/Desktop.tsx"],
    },
  };
}

export const WTF_DESKTOP_APP_PACKAGE_ACCEPTANCE =
  DESKTOP_APPS.map(desktopPackage) as readonly WtfAppPackageAcceptance[];

export const WTF_CREATION_TOOL_PACKAGE_ACCEPTANCE = [
  {
    id: "creation-tool:particle-painter",
    key: "particle-painter",
    label: "PArticle Painter",
    kind: "creation-tool",
    state: "active",
    domain: domainGuides.mediaTvStudio,
    toolId: "particle-painter",
    routeEvidence: ["/tools/particle-painter", "/creation-tools/particle-painter/index.html"],
    provenance: {
      owner: "WTF OS",
      source: "local WTF/PP build vendored as a static creation tool",
      evidence: ["client/src/features/creation-tools/tool-registry.ts", "public/creation-tools/particle-painter"],
    },
    permissionSummary: {
      userAccess: "Authenticated browser route; static iframe tool assets served from the WTF app origin.",
      adminAccess: "Admin observability through the Creation Tools admin surface and Content/Automation tabs.",
      dataTouched: ["creation tool interaction events", "download/export artifacts in the browser"],
      externalSystems: [],
    },
    rollback: {
      method: "Restore the previous static asset package and tool registry entry from the deployed commit.",
      evidence: ["scripts/check-creation-tool-assets.ts"],
    },
    uninstall: {
      method: "Remove the route from the tool registry only after preserving any documented provenance and exports.",
      preservesUserData: true,
      evidence: ["client/src/features/creation-tools/tool-registry.ts"],
    },
  },
  {
    id: "creation-tool:industrializer",
    key: "industrializer",
    label: "INDUSTR1ALIZER",
    kind: "creation-tool",
    state: "active",
    domain: domainGuides.mediaTvStudio,
    toolId: "industrializer",
    routeEvidence: ["/tools/industrializer", "/creation-tools/industrializer/index.html"],
    provenance: {
      owner: "JACK INDUSTRIES / WTF OS",
      source: "vendored Objkt/IPFS static asset package",
      evidence: ["client/src/features/creation-tools/tool-registry.ts", "public/creation-tools/industrializer"],
    },
    permissionSummary: {
      userAccess: "Authenticated browser route; static iframe tool assets served from the WTF app origin.",
      adminAccess: "Admin observability through the Creation Tools admin surface and Content/Automation tabs.",
      dataTouched: ["creation tool interaction events", "download/export artifacts in the browser"],
      externalSystems: ["Objkt/IPFS provenance reference"],
    },
    rollback: {
      method: "Restore the previous static asset package and tool registry entry from the deployed commit.",
      evidence: ["scripts/check-creation-tool-assets.ts"],
    },
    uninstall: {
      method: "Remove the route from the tool registry only after preserving any documented provenance and exports.",
      preservesUserData: true,
      evidence: ["client/src/features/creation-tools/tool-registry.ts"],
    },
  },
  {
    id: "creation-tool:pauls-particles-v1",
    key: "pauls-particles-v1",
    label: "Paul's Particles V1.0",
    kind: "creation-tool",
    state: "active",
    domain: domainGuides.mediaTvStudio,
    toolId: "pauls-particles-v1",
    routeEvidence: ["/tools/pauls-particles-v1", "/creation-tools/pauls-particles-v1/index.html"],
    provenance: {
      owner: "WTF OS",
      source: "vendored Objkt/IPFS static particle tool",
      evidence: ["client/src/features/creation-tools/tool-registry.ts", "public/creation-tools/pauls-particles-v1"],
    },
    permissionSummary: {
      userAccess: "Authenticated browser route; static iframe tool assets served from the WTF app origin.",
      adminAccess: "Admin observability through the Creation Tools admin surface and Content/Automation tabs.",
      dataTouched: ["creation tool interaction events", "download/export artifacts in the browser"],
      externalSystems: ["Objkt/IPFS provenance reference"],
    },
    rollback: {
      method: "Restore the previous static asset package and tool registry entry from the deployed commit.",
      evidence: ["scripts/check-creation-tool-assets.ts"],
    },
    uninstall: {
      method: "Remove the route from the tool registry only after preserving any documented provenance and exports.",
      preservesUserData: true,
      evidence: ["client/src/features/creation-tools/tool-registry.ts"],
    },
  },
  {
    id: "creation-tool:nikshumika-paint",
    key: "nikshumika-paint",
    label: "Nikshumika Paint",
    kind: "creation-tool",
    state: "active",
    domain: domainGuides.mediaTvStudio,
    toolId: "nikshumika-paint",
    routeEvidence: ["/tools/nikshumika-paint", "/creation-tools/nikshumika-paint/index.html"],
    provenance: {
      owner: "Greg Nikshumika / WTF OS",
      source: "creator-attributed Tezos token tool package",
      evidence: [
        "client/src/features/creation-tools/tool-registry.ts",
        "https://tzkt.io/KT1BXjCyRFrti1n9ErYJb2JAPfCxqGL1FjmT/tokens/39",
      ],
    },
    permissionSummary: {
      userAccess: "Authenticated browser route; static iframe tool assets served from the WTF app origin.",
      adminAccess: "Admin observability through the Creation Tools admin surface and Content/Automation tabs.",
      dataTouched: ["creation tool interaction events", "download/export artifacts in the browser"],
      externalSystems: ["Tezos provenance reference", "Objkt/TzKT"],
    },
    rollback: {
      method: "Restore the previous static asset package and tool registry entry from the deployed commit.",
      evidence: ["scripts/check-creation-tool-assets.ts"],
    },
    uninstall: {
      method: "Remove the route from the tool registry only after preserving any documented provenance and exports.",
      preservesUserData: true,
      evidence: ["client/src/features/creation-tools/tool-registry.ts"],
    },
  },
  {
    id: "creation-tool:kandinsky-composer",
    key: "kandinsky-composer",
    label: "Kandinsky Composer",
    kind: "creation-tool",
    state: "active",
    domain: domainGuides.mediaTvStudio,
    toolId: "kandinsky-composer",
    routeEvidence: ["/tools/kandinsky-composer", "/creation-tools/kandinsky-composer/index.html"],
    provenance: {
      owner: "Greg Nikshumika / WTF OS",
      source: "creator-attributed Tezos token tool package",
      evidence: [
        "client/src/features/creation-tools/tool-registry.ts",
        "https://tzkt.io/KT1PXuvCEiabZePZcAm5Qmtebt15v3yEqgha/tokens/3",
      ],
    },
    permissionSummary: {
      userAccess: "Authenticated browser route; static iframe tool assets served from the WTF app origin.",
      adminAccess: "Admin observability through the Creation Tools admin surface and Content/Automation tabs.",
      dataTouched: ["creation tool interaction events", "download/export artifacts in the browser"],
      externalSystems: ["Tezos provenance reference", "Objkt/TzKT"],
    },
    rollback: {
      method: "Restore the previous static asset package and tool registry entry from the deployed commit.",
      evidence: ["scripts/check-creation-tool-assets.ts"],
    },
    uninstall: {
      method: "Remove the route from the tool registry only after preserving any documented provenance and exports.",
      preservesUserData: true,
      evidence: ["client/src/features/creation-tools/tool-registry.ts"],
    },
  },
  {
    id: "creation-tool:pixel-patterns",
    key: "pixel-patterns",
    label: "PixelPatterns",
    kind: "creation-tool",
    state: "active",
    domain: domainGuides.mediaTvStudio,
    toolId: "pixel-patterns",
    routeEvidence: ["/tools/pixel-patterns", "/creation-tools/pixel-patterns/index.html"],
    provenance: {
      owner: "skllzrmy / FAFOlab",
      source: "skullzarmy/pixelpatterns",
      evidence: ["client/src/features/creation-tools/tool-registry.ts", "public/creation-tools/pixel-patterns"],
    },
    permissionSummary: {
      userAccess: "Authenticated browser route; static iframe tool.",
      adminAccess: "Creation Tools admin surface.",
      dataTouched: ["creation tool interaction events"],
      externalSystems: [],
    },
    rollback: {
      method: "Remove tool registry entry and static assets.",
      evidence: ["client/src/features/creation-tools/tool-registry.ts"],
    },
    uninstall: {
      method: "Remove route from tool registry.",
      preservesUserData: true,
      evidence: ["client/src/features/creation-tools/tool-registry.ts"],
    },
  },
  {
    id: "creation-tool:penrose-backgrounds",
    key: "penrose-backgrounds",
    label: "PenRose Backgrounds",
    kind: "creation-tool",
    state: "active",
    domain: domainGuides.mediaTvStudio,
    toolId: "penrose-backgrounds",
    routeEvidence: ["/tools/penrose-backgrounds", "/creation-tools/penrose-backgrounds/index.html"],
    provenance: {
      owner: "skllzrmy / FAFOlab",
      source: "skullzarmy/penrose",
      evidence: ["client/src/features/creation-tools/tool-registry.ts", "public/creation-tools/penrose-backgrounds"],
    },
    permissionSummary: {
      userAccess: "Authenticated browser route; static iframe tool.",
      adminAccess: "Creation Tools admin surface.",
      dataTouched: ["creation tool interaction events"],
      externalSystems: [],
    },
    rollback: {
      method: "Remove tool registry entry and static assets.",
      evidence: ["client/src/features/creation-tools/tool-registry.ts"],
    },
    uninstall: {
      method: "Remove route from tool registry.",
      preservesUserData: true,
      evidence: ["client/src/features/creation-tools/tool-registry.ts"],
    },
  },
] as const satisfies readonly WtfAppPackageAcceptance[];

export const WTF_SYSTEM_PACKAGE_ACCEPTANCE = [
  {
    id: "package:console-stock-cartridges",
    key: "console-stock-cartridges",
    label: "Console Stock Cartridges",
    kind: "console-stock-cartridges",
    state: "manifested",
    domain: domainGuides.arcadeConsoleGameStudio,
    routeEvidence: ["/console", "public/games/installed/manifest.json"],
    provenance: {
      owner: "WTF OS",
      source: "installed cartridge manifest with per-cartridge source fields",
      evidence: ["public/games/installed/manifest.json", "scripts/install-games.mjs"],
    },
    permissionSummary: {
      userAccess: "Authenticated Console route with cartridge launch and score submission boundaries.",
      adminAccess: "Arcade/System Logs/Automation admin surfaces observe reports, score policy, and cartridge state.",
      dataTouched: ["console_sessions", "console_scores", "public installed game assets"],
      externalSystems: [],
    },
    rollback: {
      method: "Restore the prior installed manifest and public game asset package from the deployed commit.",
      evidence: ["public/games/installed/manifest.json"],
    },
    uninstall: {
      method: "Remove or disable individual cartridge manifest entries only after preserving score/report history.",
      preservesUserData: true,
      evidence: ["client/src/features/admin-os/admin-surface-registry.ts#console"],
    },
  },
  {
    id: "package:project-bundles",
    key: "project-bundles",
    label: "WTF Project Bundles",
    kind: "project-bundle",
    state: "manifested",
    domain: domainGuides.mediaTvStudio,
    routeEvidence: ["shared/wtf-project-bundles.ts", "shared/wtf-dwellings.ts"],
    provenance: {
      owner: "WTF OS",
      source: "Law-required project bundle manifest",
      evidence: ["shared/wtf-project-bundles.ts", "docs/domains/media-tv-studio.md"],
    },
    permissionSummary: {
      userAccess: "Authenticated Studio, Game Studio, Gallery, TV, and export routes according to route policy.",
      adminAccess: "Studio/Content/Media Storage admin surfaces observe bundle state and publish handoffs.",
      dataTouched: ["studio_projects", "media_items", "project bundle manifests", "export artifacts"],
      externalSystems: ["IPFS/provenance destinations when explicitly published"],
    },
    rollback: {
      method: "Restore bundle manifest, dwelling mapping, and deploy notes from the previous accepted commit.",
      evidence: ["shared/wtf-project-bundles.test.ts"],
    },
    uninstall: {
      method: "Do not delete bundles as cleanup; archive or disable publish paths while preserving manifests and media.",
      preservesUserData: true,
      evidence: ["shared/wtf-project-bundles.ts"],
    },
  },
] as const satisfies readonly WtfAppPackageAcceptance[];

export const WTF_INTEGRATION_PLUGIN_ACCEPTANCE = [
  {
    id: "integration:kiln",
    key: "kiln",
    label: "Kiln Contract Tooling",
    kind: "integration-plugin",
    state: "active",
    domain: domainGuides.tezosPlatform,
    routeEvidence: ["scripts/*kiln*.ts", "server/features/club-dues/service.ts"],
    provenance: {
      owner: "WTF OS host tooling",
      source: "host-side contract tooling, never a mock-provider clearance",
      evidence: ["package.json#contract:*:kiln", "docs/constitutional-acceptance.md"],
    },
    permissionSummary: {
      userAccess: "No direct browser credential access; user actions must pass wallet/contract preflight where value is touched.",
      adminAccess: "Operator/admin execution only through host-side scripts, contract routes, and audited admin surfaces.",
      dataTouched: ["contract deploy artifacts", "club dues contracts", "system_events"],
      externalSystems: ["Kiln", "Tezos RPC", "TzKT"],
    },
    rollback: {
      method: "Disable the host script or restore prior contract artifact/runbook; do not mark mock-only proof accepted.",
      evidence: ["package.json", "docs/domains/tezos-platform.md"],
    },
    uninstall: {
      method: "Remove host tooling only after contract artifacts, deploy notes, and affected memberships are archived.",
      preservesUserData: true,
      evidence: ["docs/domains/operations.md"],
    },
  },
  {
    id: "integration:shadowbox",
    key: "shadowbox",
    label: "Shadowbox Contract Path",
    kind: "integration-plugin",
    state: "blocked",
    domain: domainGuides.tezosPlatform,
    routeEvidence: ["scripts/check-shadowbox-scope.mjs", "docs/constitutional-acceptance.md"],
    provenance: {
      owner: "WTF OS",
      source: "blocked until concrete host/tooling proof exists in the correct live repo",
      evidence: ["scripts/check-shadowbox-scope.mjs", "docs/constitutional-acceptance.md"],
    },
    permissionSummary: {
      userAccess: "No production user access while blocked.",
      adminAccess: "Blocked state only; no admin UI should imply live contract readiness.",
      dataTouched: [],
      externalSystems: ["Tezos contract tooling"],
    },
    rollback: {
      method: "Keep blocked and remove any launcher/admin affordance that claims readiness without proof.",
      evidence: ["docs/constitutional-acceptance.md"],
    },
    uninstall: {
      method: "Delete only unreferenced debris after verifying no live route, reward, contract, or doctrine role depends on it.",
      preservesUserData: true,
      evidence: ["docs/constitutional-acceptance.md"],
    },
  },
  {
    id: "integration:tezosbeats-music",
    key: "tezosbeats-music",
    label: "TezosBeats Music Player",
    kind: "integration-plugin",
    state: "active",
    domain: domainGuides.mediaTvStudio,
    routeEvidence: ["/music", "/tezamp", "/api/music/playlists"],
    provenance: {
      owner: "skllzrmy / FAFOlab",
      source: "skullzarmy/tezosbeats",
      evidence: ["client/src/features/music", "server/routes/music.ts"],
    },
    permissionSummary: {
      userAccess: "Session + wallet for NFT audio discovery.",
      adminAccess: "Media admin surfaces.",
      dataTouched: ["music_playlists", "music_now_playing", "music_listening_history"],
      externalSystems: ["TzKT", "Objkt"],
    },
    rollback: {
      method: "Remove /music route and music API routes.",
      evidence: ["client/src/routes/page-defs.ts"],
    },
    uninstall: {
      method: "Drop music schema tables after export.",
      preservesUserData: true,
      evidence: ["shared/schema-music.ts"],
    },
  },
  {
    id: "integration:mastodon-tusk",
    key: "mastodon-tusk",
    label: "Mastodon Fediverse (Tusk)",
    kind: "integration-plugin",
    state: "active",
    domain: domainGuides.identityAndSocial,
    routeEvidence: ["/api/mastodon/account", "/api/mastodon/timeline", "/w"],
    provenance: {
      owner: "skllzrmy / FAFOlab",
      source: "skullzarmy/Tusk",
      evidence: ["server/features/mastodon", "server/routes/mastodon.ts"],
    },
    permissionSummary: {
      userAccess: "Session; user-provided instance token.",
      adminAccess: "Control Board social status.",
      dataTouched: ["mastodon_accounts", "mastodon_cached_toots"],
      externalSystems: ["Mastodon instances"],
    },
    rollback: {
      method: "Disable mastodon routes and W feed panel.",
      evidence: ["server/routes/mastodon.ts"],
    },
    uninstall: {
      method: "Drop mastodon schema after user export.",
      preservesUserData: true,
      evidence: ["shared/schema-mastodon.ts"],
    },
  },
  {
    id: "integration:porcupin",
    key: "porcupin",
    label: "Porcupin IPFS Client",
    kind: "integration-plugin",
    state: "active",
    domain: domainGuides.mediaTvStudio,
    routeEvidence: ["/apps/porcupin-setup", "/apps/porcupin-dashboard", "/api/porcupin/connect"],
    provenance: {
      owner: "skllzrmy / FAFOlab",
      source: "skullzarmy/porcupin-ipfs-backup-node",
      evidence: ["client/src/features/porcupin", "server/routes/porcupin.ts"],
    },
    permissionSummary: {
      userAccess: "Session; connects to user's own node.",
      adminAccess: "Premium pinning worker observability.",
      dataTouched: ["porcupin_connections"],
      externalSystems: ["User Porcupin remote API"],
    },
    rollback: {
      method: "Remove porcupin routes and setup wizard.",
      evidence: ["client/src/routes/page-defs.ts"],
    },
    uninstall: {
      method: "Drop porcupin_connections after export.",
      preservesUserData: true,
      evidence: ["shared/schema-porcupin.ts"],
    },
  },
  {
    id: "integration:mindwalk",
    key: "mindwalk",
    label: "MindWalk Arcade",
    kind: "integration-plugin",
    state: "active",
    domain: domainGuides.arcadeConsoleGameStudio,
    routeEvidence: ["/games/mindwalk/index.html", "/arcade"],
    provenance: {
      owner: "skllzrmy / FAFOlab",
      source: "skullzarmy/mindwalk",
      evidence: ["public/games/mindwalk", "server/features/arcade/mindwalk-catalog.ts"],
    },
    permissionSummary: {
      userAccess: "Arcade credits; BYOK AI client-side.",
      adminAccess: "Arcade catalog admin.",
      dataTouched: ["arcade_sessions", "reward_ledger"],
      externalSystems: ["Gemini", "OpenAI", "Anthropic (client-direct)"],
    },
    rollback: {
      method: "Remove catalog entry and public/games/mindwalk.",
      evidence: ["server/features/arcade/mindwalk-catalog.ts"],
    },
    uninstall: {
      method: "Remove static game bundle.",
      preservesUserData: true,
      evidence: ["public/games/mindwalk"],
    },
  },
  {
    id: "integration:discovery-engine",
    key: "discovery-engine",
    label: "NFT Discovery Engine",
    kind: "integration-plugin",
    state: "active",
    domain: domainGuides.commerceAndWallets,
    routeEvidence: ["/api/discovery/random-artist", "/api/discovery/random-nft", "/dashboard"],
    provenance: {
      owner: "skllzrmy / FAFOlab",
      source: "skullzarmy discovery tooling",
      evidence: ["server/features/discovery"],
    },
    permissionSummary: {
      userAccess: "Public read endpoints with cache.",
      adminAccess: "Control Board discovery panel.",
      dataTouched: [],
      externalSystems: ["TzKT"],
    },
    rollback: {
      method: "Disable discovery routes.",
      evidence: ["server/features/discovery/routes.ts"],
    },
    uninstall: {
      method: "Remove discovery feature module.",
      preservesUserData: true,
      evidence: ["server/features/discovery"],
    },
  },
  {
    id: "integration:jstz",
    key: "jstz",
    label: "jstz Adapter",
    kind: "integration-plugin",
    state: "disabled-by-default",
    domain: domainGuides.tezosPlatform,
    routeEvidence: [
      "scripts/check-jstz-adapter.mjs",
      ".agents/docs/archive/contracts/jstz-local-sandbox-proof.md",
      "docs/constitutional-acceptance.md",
    ],
    provenance: {
      owner: "WTF OS",
      source: "local sandbox proof exists; production jstz remains local/configurable until stable endpoints exist",
      evidence: [
        "scripts/check-jstz-adapter.mjs",
        ".agents/docs/archive/contracts/jstz-local-sandbox-proof.json",
        "docs/constitutional-acceptance.md",
      ],
    },
    permissionSummary: {
      userAccess: "No production user access by default; local proof requires explicit host configuration.",
      adminAccess: "Admin/tooling surfaces may show local proof status but must not imply production-network readiness.",
      dataTouched: [],
      externalSystems: ["jstz", "Docker local sandbox"],
    },
    rollback: {
      method: "Unset KILN_JSTZ_ENABLED or remove the proof command env; the guard returns planned_disabled or blocked_required.",
      evidence: ["scripts/check-jstz-adapter.mjs", "docs/constitutional-acceptance.md"],
    },
    uninstall: {
      method: "Delete only unreferenced debris after verifying no live route, reward, contract, or doctrine role depends on it.",
      preservesUserData: true,
      evidence: ["docs/constitutional-acceptance.md", ".agents/docs/archive/contracts/jstz-local-sandbox-proof.md"],
    },
  },
] as const satisfies readonly WtfAppPackageAcceptance[];

export const WTF_APP_PACKAGE_ACCEPTANCE = [
  ...WTF_DESKTOP_APP_PACKAGE_ACCEPTANCE,
  ...WTF_CREATION_TOOL_PACKAGE_ACCEPTANCE,
  ...WTF_SYSTEM_PACKAGE_ACCEPTANCE,
  ...WTF_INTEGRATION_PLUGIN_ACCEPTANCE,
] as const satisfies readonly WtfAppPackageAcceptance[];

export function getWtfAppPackageAcceptance(id: string): WtfAppPackageAcceptance | undefined {
  return WTF_APP_PACKAGE_ACCEPTANCE.find((entry) => entry.id === id);
}
