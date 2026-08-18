import { DESKTOP_APPS, DESKTOP_APP_LABELS, type DesktopAppKey } from "./types";
import { getDocLinksForLabel, type WtfDocLinkSet } from "./wtf-docregistry";

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
  documentation?: WtfDocLinkSet;
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
  operations: { label: "Operations", guide: "docs/domains/operations.md" },
  pastaProtocol: { label: "Pasta Protocol", guide: "docs/domains/pasta-protocol.md" },
} as const;

const desktopDomains: Partial<Record<DesktopAppKey, (typeof domainGuides)[keyof typeof domainGuides]>> = {
  wtfiam: domainGuides.commerceAndWallets,
  wim: domainGuides.identityAndSocial,
  w: domainGuides.identityAndSocial,
  tv: domainGuides.mediaTvStudio,
  dicksword: domainGuides.identityAndSocial,
  "i-hate-telegram": domainGuides.identityAndSocial,
  "dear-diary": domainGuides.identityAndSocial,
  arcade: domainGuides.arcadeConsoleGameStudio,
  casino: domainGuides.commerceAndWallets,
  "dues-manager": domainGuides.commerceAndWallets,
  console: domainGuides.arcadeConsoleGameStudio,
  "game-studio": domainGuides.arcadeConsoleGameStudio,
  dedrooms: domainGuides.wtfOs,
  studio: domainGuides.mediaTvStudio,
  gallery: domainGuides.mediaTvStudio,
  "ch-ease": domainGuides.mediaTvStudio,
  "pasta-protocol": domainGuides.pastaProtocol,
  "ipfs-pinning": domainGuides.mediaTvStudio,
  skywire: domainGuides.identityAndSocial,
  "wtf-live": domainGuides.identityAndSocial,
  tz2at: domainGuides.identityAndSocial,
  "crp-nominations": domainGuides.identityAndSocial,
  "wtf-subdomains": domainGuides.tezosPlatform,
  "rat-race": domainGuides.commerceAndWallets,
  "map-lab": domainGuides.wtfOs,
  agent: domainGuides.wtfOs,
  applications: domainGuides.arcadeConsoleGameStudio,
  mail: domainGuides.identityAndSocial,
  "admin-inbox": domainGuides.identityAndSocial,
  "objkt-operator": domainGuides.operations,
};

const desktopExternalSystems: Partial<Record<DesktopAppKey, readonly string[]>> = {
  wim: [],
  w: ["X API"],
  tv: ["Media storage", "token media sources"],
  dicksword: ["Discord"],
  "i-hate-telegram": ["Telegram import sources"],
  arcade: ["Arcade score services"],
  casino: ["Tezos wallet preflight", "casino contract services"],
  "dues-manager": ["Tezos wallet preflight", "Kiln contract tooling"],
  console: ["static cartridge assets"],
  "game-studio": ["Studio project storage", "arcade publishing queue"],
  dedrooms: ["DedRooms MUD realtime presence", "gameshow Season 3 intro campaign role grants"],
  studio: ["Studio project storage", "media storage"],
  gallery: ["Media storage", "TzKT", "Objkt"],
  "pasta-protocol": ["Tezos wallets", "Tezos RPC", "IPFS pinning providers", "CH-EASE handoff packages"],
  "ipfs-pinning": [
    "AT Protocol",
    "WTFOS PDS",
    "wtfos.me user-site hosts",
    "Hetzner Object Storage",
    "Hosted Porcupin",
    "Hetzner Storage Box manifests",
    "TzKT",
  ],
  skywire: ["AT Protocol", "Bluesky OAuth", "Tezos Domains"],
  "wtf-live": ["AT Protocol", "Skywire OAuth identity", "connected user PDS repos"],
  tz2at: ["AT Protocol", "WTFOS PDS", "tz2at relay/firehose", "tzbsky public records", "Tezos wallets", "Etherlink wallets"],
  "crp-nominations": [
    "AT Protocol",
    "WTFOS PDS spine",
    "Objkt",
    "TzKT",
    "Tezos Domains",
    "tzprofiles",
    "tzbsky public records",
    "Bluesky intent compose",
  ],
  "wtf-subdomains": [
    "Tezos wallets",
    "Tezos Domains",
    "WTF Domains registrar",
    "wtfos.me user-site hosts",
    "AT Protocol DID proofs",
  ],
  "rat-race": ["tz2at rolling market stream", "Objkt metadata/listing-key supplement", "Tezos wallet preflight"],
  "map-lab": ["AT Protocol repo reads", "AT Protocol firehose previews", "WTFOS repo save/restore"],
  agent: ["AI providers (browser-direct BYOK)", "local inference endpoints", "MCP paired agents"],
  applications: ["Hetzner remote application host", "Steam Linux runtime", "WebRTC browser media transport"],
  mail: ["Resend inbound email"],
  "admin-inbox": ["Private media storage for screenshot evidence"],
  "objkt-operator": ["Objkt API", "Kukai", "Tezos mainnet RPC"],
};

const desktopDataTouched: Partial<Record<DesktopAppKey, readonly string[]>> = {
  wtfiam: ["in_app_market_*", "inventory_items", "xp_events"],
  wim: ["dm_conversations", "dm_messages", "system_events"],
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
  dedrooms: ["green_room_* backing tables", "dedrooms world flag state", "season_contestants", "user_roles", "system_events"],
  studio: ["studio_projects", "studio_files", "media_items"],
  gallery: ["media_items", "token media cache", "user media libraries"],
  "pasta-protocol": ["Pasta Protocol browser drafts", "system_events", "client-exported contract package artifacts"],
  "ipfs-pinning": [
    "ipfs_pinning_policies",
    "ipfs_pinning_jobs",
    "ipfs_pinning_manifests",
    "ipfs_pinning_subdomain_bindings",
    "wtfos_atproto_outbox",
    "wtf_user_sites",
  ],
  skywire: ["atproto_accounts", "oauth_sessions", "users.tezos_identity"],
  "wtf-live": ["wtf_live_rooms", "wtf_live_room_access_members", "wtf_live_stages", "atproto_accounts", "challenge_system_events"],
  tz2at: ["atproto_accounts", "wtfos_atproto_identities", "wtfos_atproto_outbox", "tz2at_identity_links", "user_wallets", "user_etherlink_wallets"],
  "crp-nominations": [
    "wtfos_atproto_outbox",
    "wtfos_appview_records",
    "crp_appview_nomination_credits",
    "challenge_system_events",
  ],
  "wtf-subdomains": [
    "wtf_subdomain_grants",
    "wtf_user_sites",
    "wtfos_atproto_identities",
    "wtfos_atproto_outbox",
  ],
  "rat-race": ["token_sales", "token_mint_events", "token_listings", "token_metadata", "contract_activity_logs"],
  "map-lab": ["system map documents", "local repo drafts", "read-only ingested path summaries", "system_events"],
  agent: [
    "agent browser workspace state",
    "wtfos.agent.filesystem.projects.v1",
    "browser session provider credentials",
    "mcp_agent_tokens",
    "Agent knowledge base and extension manifests",
    "wtfOS project memory",
    "Agent project plans and generated action queue",
    "Agent native git branches, staged paths, and commit history",
  ],
  applications: [
    "remote application manifests",
    "active apphost session state",
    "remote desktop input events",
    "transient WebRTC stream lifecycle",
  ],
  mail: ["mailboxes", "mail_messages", "comms_items"],
  "admin-inbox": ["admin_inbox_messages", "admin_inbox_replies", "user_media_library", "comms_items", "user_notifications"],
  "objkt-operator": ["objkt_operator_states", "desktop_app_settings"],
};

function desktopPackage(appKey: DesktopAppKey): WtfAppPackageAcceptance {
  return {
    id: `desktop:${appKey}`,
    key: appKey,
    label: DESKTOP_APP_LABELS[appKey],
    kind: "desktop-app",
    state: appKey === "dues-manager" ? "disabled-by-default" : "active",
    domain: desktopDomains[appKey] ?? domainGuides.wtfOs,
    documentation: getDocLinksForLabel((desktopDomains[appKey] ?? domainGuides.wtfOs).label),
    appKey,
    routeEvidence: [
      "shared/types.ts#DESKTOP_APPS",
      "shared/desktop-apps.ts#DEFAULT_DESKTOP_APP_CONFIG",
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
        "Browser session plus route-specific auth/role gates declared by page definitions and server routes. Static browser routes also expose `open /path` in Terminal, /cli, and @wtfos/cli when registered per docs/wtfos-cli-builder-obligations.md.",
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

const PASTA_CREATION_TOOLS = [
  {
    id: "spaghetti",
    label: "Spaghetti",
    contractEvidence: "public/creation-tools/spaghetti/contract/pasta-standard-collection.contract.json",
  },
  {
    id: "gnocchi",
    label: "Gnocchi",
    contractEvidence: "public/creation-tools/gnocchi/contract/pasta-open-edition.contract.json",
  },
  {
    id: "ravioli",
    label: "Ravioli",
    contractEvidence: "public/creation-tools/ravioli/contract/pasta-bundle.contract.json",
  },
  {
    id: "rotini",
    label: "Rotini",
    contractEvidence: "public/creation-tools/rotini/contract/pasta-generative-collection.contract.json",
  },
  {
    id: "penne",
    label: "Penne",
    contractEvidence: "public/creation-tools/penne/contract/pasta-distribution.contract.json",
  },
  {
    id: "lasagna",
    label: "Lasagna",
    contractEvidence: "public/creation-tools/lasagna/contract/pasta-exhibition.contract.json",
  },
] as const;

const PASTA_CREATION_TOOL_PACKAGE_ACCEPTANCE = PASTA_CREATION_TOOLS.map((tool) => ({
  id: `creation-tool:${tool.id}`,
  key: tool.id,
  label: tool.label,
  kind: "creation-tool",
  state: "active",
  domain: domainGuides.pastaProtocol,
  toolId: tool.id,
  routeEvidence: [`/tools/${tool.id}`, `/creation-tools/${tool.id}/index.html`],
  provenance: {
    owner: "WTF OS / Pasta Protocol",
    source: "Pasta Protocol static Tezos publisher package",
    evidence: [
      "client/src/features/creation-tools/tool-registry.ts",
      `public/creation-tools/${tool.id}`,
      tool.contractEvidence,
    ],
  },
  permissionSummary: {
    userAccess:
      "Signed-in wtfOS users can open the embedded Pasta publisher; hosted wtfOS pinner actions require trusted_market_creator capability inside the platform iframe, while Pinata and own-node paths remain self-managed.",
    adminAccess:
      "Pasta Protocol admin surface observes route availability, CH-EASE handoffs, Colander context handoffs, publisher events, and desktop app gate state.",
    dataTouched: [
      "Pasta Protocol browser drafts",
      "download/export artifacts in the browser",
      "system_events",
      "creator-originated Tezos contract operations",
    ],
    externalSystems: ["Tezos wallets", "Tezos RPC", "IPFS pinning providers", "CH-EASE handoff packages"],
  },
  rollback: {
    method:
      "Restore the previous static asset package and Pasta Protocol route/app-gate ownership from the deployed commit.",
    evidence: ["scripts/check-creation-tool-assets.ts", `public/creation-tools/${tool.id}`],
  },
  uninstall: {
    method:
      "Remove the static route only after preserving browser-exported package artifacts and documenting already-originated on-chain contracts.",
    preservesUserData: true,
    evidence: ["client/src/features/creation-tools/tool-registry.ts", "docs/domains/pasta-protocol-registry.md"],
  },
})) satisfies readonly WtfAppPackageAcceptance[];

export const WTF_CREATION_TOOL_PACKAGE_ACCEPTANCE = [
  {
    id: "creation-tool:broot",
    key: "broot",
    label: "Broot",
    kind: "creation-tool",
    state: "active",
    domain: domainGuides.mediaTvStudio,
    toolId: "broot",
    routeEvidence: ["/tools/broot", "/creation-tools/broot/index.html"],
    provenance: {
      owner: "WTF OS",
      source: "Tezos-native Photoshop alternative integrated as a static creation tool",
      evidence: ["client/src/features/creation-tools/tool-registry.ts", "public/creation-tools/broot"],
    },
    permissionSummary: {
      userAccess: "Authenticated browser route; static iframe tool assets served from the WTF app origin.",
      adminAccess: "Admin observability through the Creation Tools admin surface and Content/Automation tabs.",
      dataTouched: ["Broot local project documents", "creation tool interaction events", "download/export artifacts in the browser"],
      externalSystems: ["Tezos wallets", "IPFS pinning providers", "HEN FA2 mint contract"],
    },
    rollback: {
      method: "Restore the previous static asset package and tool registry entry from the deployed commit.",
      evidence: ["scripts/check-creation-tool-assets.ts"],
    },
    uninstall: {
      method: "Remove the route from the tool registry only after preserving documented provenance and user exports.",
      preservesUserData: true,
      evidence: ["client/src/features/creation-tools/tool-registry.ts"],
    },
  },
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
    id: "creation-tool:pixalerce",
    key: "pixalerce",
    label: "PixAlerce",
    kind: "creation-tool",
    state: "active",
    domain: domainGuides.mediaTvStudio,
    toolId: "pixalerce",
    routeEvidence: ["/tools/pixalerce", "/creation-tools/pixalerce/index.html"],
    provenance: {
      owner: "Niko Alerce",
      source: "NikoAlerce/3dpixelstudio at 99e243a34a509477e203a6dd7a5a1d18ed83f9fa; alpha-test distribution pending creator license and complete included-asset provenance",
      evidence: [
        "client/src/features/creation-tools/tool-registry.ts",
        "public/creation-tools/pixalerce/provenance.json",
        "docs/domains/pixalerce-intake.md",
      ],
    },
    permissionSummary: {
      userAccess: "Authenticated wtfOS route; sandboxed same-origin static iframe with camera, microphone, clipboard, download, fullscreen, and local browser-project capabilities.",
      adminAccess: "Creation Tools admin surface observes route/package availability; public release remains gated on the recorded creator license and complete stamp provenance.",
      dataTouched: ["PixAlerce IndexedDB/localForage projects", "session autosave", "browser download/export artifacts"],
      externalSystems: ["Device camera and microphone when the user explicitly invokes them"],
    },
    rollback: {
      method: "Restore the previous tool registry and static package from the deployed commit; no server-owned project data is mutated.",
      evidence: ["scripts/check-creation-tool-assets.ts", "public/creation-tools/pixalerce/provenance.json"],
    },
    uninstall: {
      method: "Remove the route and static package only after warning testers to export browser-local PixAlerce projects.",
      preservesUserData: true,
      evidence: ["client/src/features/creation-tools/tool-registry.ts", "docs/domains/pixalerce-intake.md"],
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
  {
    id: "creation-tool:macaroni",
    key: "macaroni",
    label: "Macaroni",
    kind: "creation-tool",
    state: "active",
    domain: domainGuides.tezosPlatform,
    toolId: "macaroni",
    routeEvidence: ["/tools/macaroni", "/creation-tools/macaroni/index.html"],
    provenance: {
      owner: "WTF OS / MyDrop",
      source: "MyDrop blind-mint app package integrated as the Macaroni creation tool",
      evidence: [
        "client/src/features/creation-tools/tool-registry.ts",
        "public/creation-tools/macaroni",
        "server/routes/macaroni.ts",
      ],
    },
    permissionSummary: {
      userAccess:
        "Authenticated wtfOS users can create, deploy, sync, and export blind drops; hosted wtfOS IPFS pinning and wtfOS subdomain publishing require trusted_market_creator server-side.",
      adminAccess:
        "Creation Tools admin surface observes availability, contract origination access, trusted-creator hosted pinning/publishing, installer artifact manifest, and drop publishing.",
      dataTouched: [
        "Macaroni localStorage drafts",
        "wtf_user_site_pages",
        "wtf_user_site_versions",
        "wtf_user_site_audit_events",
        "IPFS pinned token media and metadata",
        "creator-originated Tezos blind-mint contracts",
      ],
      externalSystems: ["Tezos wallets", "Tezos RPC", "TzKT", "Pinata/IPFS", "wtfOS user-site subdomains"],
    },
    rollback: {
      method: "Remove the Macaroni tool registry entry, Macaroni routes, and static asset package; preserve already-published user-site pages and on-chain contracts.",
      evidence: ["scripts/check-creation-tool-assets.ts", "server/routes/macaroni.ts"],
    },
    uninstall: {
      method:
        "Disable the route and server pin/publish endpoints only after preserving user-site versions, IPFS CIDs, and creator contract addresses.",
      preservesUserData: true,
      evidence: ["client/src/features/creation-tools/tool-registry.ts", "server/features/wtf-sites/service.ts"],
    },
  },
  ...PASTA_CREATION_TOOL_PACKAGE_ACCEPTANCE,
] as const satisfies readonly WtfAppPackageAcceptance[];

export const WTF_SYSTEM_PACKAGE_ACCEPTANCE = [
  {
    id: "package:wtfos-cli-kernel",
    key: "wtfos-cli-kernel",
    label: "wtfOS CLI / Terminal Kernel",
    kind: "integration-plugin",
    state: "active",
    domain: domainGuides.wtfOs,
    routeEvidence: ["/terminal", "/cli", "GET /api/cli/can-open", "GET /api/cli/routes"],
    provenance: {
      owner: "WTF OS",
      source: "Shared allowlisted CLI kernel, browser shells, and native @wtfos/cli client",
      evidence: [
        "shared/wtfos-cli",
        "shared/wtfos-cli-builder-obligations.ts",
        "packages/wtfos-cli",
        "server/routes/cli-access.ts",
        "docs/wtfos-cli-builder-obligations.md",
      ],
    },
    permissionSummary: {
      userAccess:
        "Browser session for /terminal and /cli; optional native @wtfos/cli with stored connect.sid. Route opens use gate parity — never the public access manifest alone.",
      adminAccess: "Terminal and CLI admin surfaces; Desktop Apps gate for interface mode.",
      dataTouched: ["system_events", "desktop_app_settings"],
      externalSystems: [],
    },
    rollback: {
      method: "Restore prior shared/wtfos-cli kernel, cli-access routes, and package build from deployed commit.",
      evidence: ["shared/wtfos-cli", "server/routes/cli-access.ts"],
    },
    uninstall: {
      method: "Shell surfaces are core WTF OS; disable desktop app gates only — do not remove kernel without migration plan.",
      preservesUserData: true,
      evidence: ["docs/wtfos-cli-builder-obligations.md"],
    },
  },
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
    routeEvidence: [
      "/ipfs-pinning",
      "/apps/porcupin-setup",
      "/apps/porcupin-dashboard",
      "/api/porcupin/connect",
      "/api/ipfs-pinning/overview",
    ],
    provenance: {
      owner: "skllzrmy / FAFOlab",
      source: "skullzarmy/porcupin-ipfs-backup-node",
      evidence: ["client/src/features/porcupin", "client/src/features/ipfs-pinning", "server/routes/porcupin.ts", "server/routes/ipfs-pinning.ts"],
    },
    permissionSummary: {
      userAccess: "Session for own-node routes; WTF Pin Collector for hosted wtfOS pinning.",
      adminAccess: "Hosted Porcupin worker, provider health, S3 staging, PDS publish, and quota observability.",
      dataTouched: [
        "porcupin_connections",
        "ipfs_pinning_policies",
        "ipfs_pinning_jobs",
        "ipfs_pinning_manifests",
        "ipfs_pinning_subdomain_bindings",
      ],
      externalSystems: ["User Porcupin remote API", "Hosted Porcupin", "Hetzner Object Storage", "WTFOS PDS"],
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
