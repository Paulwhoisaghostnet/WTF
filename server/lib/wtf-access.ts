import type { DesktopAppKey } from "@shared/types";
import type { DesktopAppConfig } from "./desktop-apps";

export type AccessMode =
  | "public"
  | "browser-session"
  | "paired-mcp-agent"
  | "role-gated-session";

export interface WtfBrowserAccessRoute {
  path: string;
  title: string;
  access: AccessMode;
  purpose: string;
  appGate?: DesktopAppKey;
}

export interface WtfApiAccessRoute {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  access: AccessMode;
  purpose: string;
  appGate?: DesktopAppKey;
}

export const WTF_STANDARD_BROWSER_ROUTES: WtfBrowserAccessRoute[] = [
  { path: "/", title: "Landing", access: "public", purpose: "Public entry and login surface." },
  { path: "/login", title: "Login", access: "public", purpose: "Create a browser session." },
  { path: "/register", title: "Register", access: "public", purpose: "Create a WTF account." },
  { path: "/leaderboard", title: "Leaderboard", access: "public", purpose: "WTF holder and XP leaderboards." },
  { path: "/gallery", title: "Gallery", access: "public", purpose: "Public token gallery.", appGate: "gallery" },
  { path: "/links", title: "Links", access: "public", purpose: "Curated public WTF links." },
  { path: "/faq", title: "FAQ", access: "public", purpose: "Public help and project FAQ." },
  { path: "/user/:username", title: "User Profile", access: "public", purpose: "Public profile view." },
  { path: "/messageboard", title: "Message Board", access: "public", purpose: "Public-visible board channels." },
  { path: "/arcade", title: "WTF Arcade", access: "public", purpose: "Public game catalog and play entry.", appGate: "arcade" },
  { path: "/calendar", title: "Calendar", access: "public", purpose: "Published event calendar." },
  { path: "/wtf-recapture", title: "WTF Recapture", access: "public", purpose: "Public WTF Recapture game surface." },
  { path: "/mission-control", title: "Mission Control", access: "browser-session", purpose: "User-first OS status, health, rewards, wallet, and next-action cockpit." },
  { path: "/command-palette", title: "Command Palette", access: "browser-session", purpose: "Searchable command launcher backed by route and workflow gates." },
  { path: "/recovery-mode", title: "Recovery Mode", access: "browser-session", purpose: "User-safe wallet, network, shell-state, and incident recovery surface." },
  { path: "/file-manager", title: "File Manager", access: "browser-session", purpose: "WTF dwelling map for files, projects, media, vaults, apps, chain, archives, and shared spaces." },
  { path: "/settings", title: "Settings", access: "browser-session", purpose: "Central OS settings hub that routes to owner surfaces without bypassing their gates." },
  { path: "/browser", title: "Browser", access: "browser-session", purpose: "Controlled link chamber for approved WTF, Tezos, marketplace, and social URLs." },
  { path: "/browser-boundaries", title: "Browser Boundaries", access: "browser-session", purpose: "Standard browser, API, MCP, CSP, and route-boundary inspection surface." },
  { path: "/terminal", title: "Terminal", access: "browser-session", purpose: "Safe OS command terminal for read-only diagnostics and route launches; no server shell execution." },
  { path: "/cli", title: "CLI", access: "browser-session", purpose: "Full-screen safe CLI/TUI using the same allowlisted command kernel as Terminal; optional default interface mode." },
  { path: "/notification-center", title: "Notification Center", access: "browser-session", purpose: "First-class notification inbox and preference surface." },
  { path: "/notifications", title: "Notifications", access: "browser-session", purpose: "Legacy alias for Notification Center." },
  { path: "/dashboard", title: "Dashboard", access: "browser-session", purpose: "Signed-in user home." },
  { path: "/theme-builder", title: "Theme Builder", access: "browser-session", purpose: "Desktop OS appearance grammar, theme colors, wallpaper, cursor, physics, pet switch, and MCP pairing." },
  { path: "/desktop-settings", title: "System Appearance", access: "browser-session", purpose: "Legacy alias for Theme Builder and desktop appearance." },
  { path: "/profile", title: "Profile", access: "browser-session", purpose: "Profile, wallets, and account settings." },
  { path: "/mail", title: "WTF Mail", access: "browser-session", purpose: "Official user mailbox for wtfOS mail addresses." },
  { path: "/digest", title: "Digest", access: "browser-session", purpose: "Unified communications timeline across normalized source cards." },
  { path: "/wim", title: "WIM", access: "browser-session", purpose: "WTF Instant Messenger view over the canonical DM system." },
  { path: "/dear-diary", title: "Dear Diary", access: "browser-session", purpose: "Private diary, note, search, tag, and cross-reference workspace.", appGate: "dear-diary" },
  { path: "/marketplace", title: "On Chain Market", access: "browser-session", purpose: "Marketplace browsing and listing workflows." },
  { path: "/trade-boards", title: "Trade Boards", access: "browser-session", purpose: "Trade-board management.", appGate: "hoard" },
  { path: "/w", title: "W Feed", access: "browser-session", purpose: "Social feed and posting.", appGate: "w" },
  { path: "/crp-nominate", title: "CRP Nominations", access: "browser-session", purpose: "Tezos Commons Recognition Program nomination AppView.", appGate: "crp-nominations" },
  { path: "/skywire", title: "Skywire", access: "public", purpose: "Standalone AT Protocol login surface plus session-bound Bluesky-compatible Skywire social cockpit.", appGate: "skywire" },
  { path: "/live/r/:roomId", title: "WTF LIVE Room", access: "public", purpose: "Room-only public guest join surface for a public room, or signed-in WTF-user private room entry when the room access list allows it." },
  { path: "/live", title: "WTF LIVE", access: "browser-session", purpose: "Standalone public rooms, private WTF-user rooms, and one-way stage broadcasts via Skywire AT identity.", appGate: "wtf-live" },
  { path: "/tv", title: "WTF TV", access: "browser-session", purpose: "TV creator/player surface.", appGate: "tv" },
  { path: "/console", title: "WTF Console", access: "browser-session", purpose: "Personal stock and owned game cartridges.", appGate: "console" },
  { path: "/game-studio", title: "Game Studio", access: "browser-session", purpose: "Create and submit browser games.", appGate: "game-studio" },
  { path: "/studio", title: "Studio", access: "browser-session", purpose: "Collaborative media workspace.", appGate: "studio" },
  { path: "/tools/broot", title: "Broot", access: "browser-session", purpose: "Tezos-native Fabric editor with local drafts, export formats, IPFS metadata, and FA2 artifact generation." },
  { path: "/tools/particle-painter", title: "Particle Painter", access: "browser-session", purpose: "Audio-reactive particle creation tool embedded from static WTF creation-tool assets." },
  { path: "/tools/industrializer", title: "Industrializer", access: "browser-session", purpose: "Image processing creation tool embedded from static WTF creation-tool assets." },
  { path: "/tools/pauls-particles-v1", title: "Paul's Particles", access: "browser-session", purpose: "Original particle capture creation tool embedded from static WTF creation-tool assets." },
  { path: "/tools/nikshumika-paint", title: "Nikshumika Paint", access: "browser-session", purpose: "Cell-art painting creation tool embedded from static WTF creation-tool assets." },
  { path: "/tools/kandinsky-composer", title: "Kandinsky Composer", access: "browser-session", purpose: "Shape-and-motion composition creation tool embedded from static WTF creation-tool assets." },
  { path: "/tools/pixel-patterns", title: "PixelPatterns", access: "browser-session", purpose: "Procedural tiling pattern creation tool embedded from static WTF creation-tool assets." },
  { path: "/tools/penrose-backgrounds", title: "PenRose Backgrounds", access: "browser-session", purpose: "Aperiodic Penrose tiling background creation tool embedded from static WTF creation-tool assets." },
  { path: "/tools/ch-ease", title: "CH-EASE", access: "role-gated-session", purpose: "Creator handoff, edit, arrange, stage, and export package workflow.", appGate: "ch-ease" },
  { path: "/tools/macaroni-packager", title: "CH-EASE", access: "role-gated-session", purpose: "Legacy route alias for CH-EASE package staging.", appGate: "ch-ease" },
  { path: "/tools/macaroni", title: "Macaroni", access: "role-gated-session", purpose: "Blind-mint Tezos drop studio and creator-owned contract deployment workflow." },
  { path: "/tools/spaghetti", title: "Spaghetti", access: "browser-session", purpose: "Pasta Protocol standard collection publisher for Tezos FA2 contracts.", appGate: "pasta-protocol" },
  { path: "/tools/gnocchi", title: "Gnocchi", access: "browser-session", purpose: "Pasta Protocol open-edition publisher for timed and supply-limited editions.", appGate: "pasta-protocol" },
  { path: "/tools/ravioli", title: "Ravioli", access: "browser-session", purpose: "Pasta Protocol bundle publisher for art packs, redeemables, and wrapped sets.", appGate: "pasta-protocol" },
  { path: "/tools/rotini", title: "Rotini", access: "browser-session", purpose: "Pasta Protocol generative collection publisher.", appGate: "pasta-protocol" },
  { path: "/tools/penne", title: "Penne", access: "browser-session", purpose: "Pasta Protocol distribution publisher.", appGate: "pasta-protocol" },
  { path: "/tools/lasagna", title: "Lasagna", access: "browser-session", purpose: "Pasta Protocol curation and exhibition publisher.", appGate: "pasta-protocol" },
  { path: "/tools/colander", title: "Colander", access: "browser-session", purpose: "Pasta Protocol ownership and package management console.", appGate: "pasta-protocol" },
  { path: "/admin", title: "Admin Panel", access: "role-gated-session", purpose: "Operational and moderation controls." },
  { path: "/backup-manager", title: "Backup Manager", access: "role-gated-session", purpose: "Backup artifact, checksum, and restore-proof inspection." },
  { path: "/control-board", title: "Control Board", access: "role-gated-session", purpose: "Gameshow staff control surface." },
];

export const WTF_STANDARD_API_ROUTES: WtfApiAccessRoute[] = [
  { method: "GET", path: "/api/health", access: "public", purpose: "Kernel readiness snapshot for DB, chain/config, contracts, version, scheduler audit visibility, uptime, and timestamp." },
  { method: "GET", path: "/api/access", access: "public", purpose: "Read-only standard access manifest for browser, API, and MCP clients." },
  { method: "GET", path: "/api/cli/can-open", access: "public", purpose: "Evaluate whether the current browser session (if any) may open a registered browser route using the same gates as the web UI." },
  { method: "GET", path: "/api/cli/routes", access: "public", purpose: "List registered browser routes the current session may open; anonymous callers receive public routes only." },
  { method: "GET", path: "/api/cli/session", access: "browser-session", purpose: "Read signed-in CLI session summary for native @wtfos/cli clients." },
  { method: "GET", path: "/api/apps/desktop", access: "public", purpose: "Current desktop app gate state plus doc-registry/install-key metadata for launcher/MCP parity." },
  { method: "GET", path: "/api/atproto/oauth/start", access: "public", purpose: "Start AT Protocol OAuth for signed-in Skywire/tz2at sessions or the standalone Skywire AT login lane; final account writes remain callback/session-bound." },
  { method: "GET", path: "/api/atproto/oauth/callback", access: "public", purpose: "Receive AT Protocol OAuth callbacks, recover durable app-owned state, and attach the returned DID to the initiating session or standalone Skywire session user." },
  { method: "GET", path: "/api/links", access: "public", purpose: "Curated links." },
  { method: "GET", path: "/api/faq", access: "public", purpose: "FAQ items." },
  { method: "GET", path: "/api/leaderboard", access: "public", purpose: "WTF holder leaderboard." },
  { method: "GET", path: "/api/leaderboard/xp", access: "public", purpose: "XP leaderboard." },
  { method: "GET", path: "/api/arcade/games", access: "public", purpose: "Public WTF Arcade catalog.", appGate: "arcade" },
  { method: "GET", path: "/api/arcade/stats", access: "public", purpose: "Arcade aggregate stats.", appGate: "arcade" },
  { method: "GET", path: "/api/game-studio/templates", access: "public", purpose: "Game Studio templates.", appGate: "game-studio" },
  { method: "GET", path: "/api/game-studio/assets", access: "public", purpose: "Game Studio stock assets.", appGate: "game-studio" },
  { method: "GET", path: "/api/marketplace", access: "public", purpose: "Active public marketplace listings." },
  { method: "GET", path: "/api/marketplace/trade-board", access: "public", purpose: "Public trade-board listing cache." },
  { method: "GET", path: "/api/board/channels", access: "public", purpose: "Public-visible board channels." },
  { method: "GET", path: "/api/telegram-digest/messages", access: "public", purpose: "Public-visible Telegram digest messages." },
  { method: "GET", path: "/api/browser/allowlist", access: "browser-session", purpose: "Controlled browser allowlist." },
  { method: "GET", path: "/api/browser/resolve", access: "browser-session", purpose: "Resolve an internal or external link against the controlled browser policy." },
  { method: "GET", path: "/api/auth/user", access: "browser-session", purpose: "Current signed-in user." },
  { method: "POST", path: "/api/auth/login", access: "public", purpose: "Create browser session." },
  { method: "POST", path: "/api/auth/logout", access: "browser-session", purpose: "End browser session." },
  { method: "GET", path: "/api/diary/entries", access: "browser-session", purpose: "List the signed-in user's private diary entries.", appGate: "dear-diary" },
  { method: "GET", path: "/api/diary/index", access: "browser-session", purpose: "Read the signed-in user's private diary index.", appGate: "dear-diary" },
  { method: "POST", path: "/api/diary/entries", access: "browser-session", purpose: "Create a private diary entry.", appGate: "dear-diary" },
  { method: "PATCH", path: "/api/diary/entries/:id", access: "browser-session", purpose: "Update one owned private diary entry.", appGate: "dear-diary" },
  { method: "DELETE", path: "/api/diary/entries/:id", access: "browser-session", purpose: "Delete one owned private diary entry.", appGate: "dear-diary" },
  { method: "GET", path: "/api/comms/sources", access: "browser-session", purpose: "List enabled communications mesh sources." },
  { method: "GET", path: "/api/comms/items", access: "browser-session", purpose: "List the signed-in user's normalized communications cards." },
  { method: "POST", path: "/api/comms/items/:id/read", access: "browser-session", purpose: "Mark one normalized communications item read for the signed-in user." },
  { method: "GET", path: "/api/comms/route-target", access: "browser-session", purpose: "Resolve a communications item or URL to its WTFOS route target." },
  { method: "GET", path: "/api/mail/status", access: "browser-session", purpose: "Read or provision the signed-in user's WTF Mail mailbox status." },
  { method: "GET", path: "/api/mail/messages", access: "browser-session", purpose: "List the signed-in user's WTF Mail messages." },
  { method: "GET", path: "/api/mail/messages/:id", access: "browser-session", purpose: "Read one owned WTF Mail message." },
  { method: "POST", path: "/api/mail/send", access: "browser-session", purpose: "Send mail from an owned WTF Mail address." },
  { method: "POST", path: "/api/mail/webhooks/resend", access: "public", purpose: "Signed Resend inbound/delivery webhook endpoint." },
  { method: "GET", path: "/api/mcp/tokens", access: "browser-session", purpose: "List paired MCP tokens for the signed-in user." },
  { method: "POST", path: "/api/mcp/tokens", access: "browser-session", purpose: "Create a paired MCP token from browser settings." },
  { method: "DELETE", path: "/api/mcp/tokens/:id", access: "browser-session", purpose: "Revoke a paired MCP token." },
  { method: "GET", path: "/api/crp-nominations/categories", access: "public", purpose: "Official CRP nomination categories.", appGate: "crp-nominations" },
  { method: "GET", path: "/api/crp-nominations/status", access: "public", purpose: "Dedicated CRP nominations repo configuration probe.", appGate: "crp-nominations" },
  { method: "POST", path: "/api/crp-nominations/viewed", access: "browser-session", purpose: "Record CRP Nominations app open for the signed-in user.", appGate: "crp-nominations" },
  { method: "POST", path: "/api/crp-nominations/resolve", access: "browser-session", purpose: "Merge nominee identity sources for CRP nominations.", appGate: "crp-nominations" },
  { method: "POST", path: "/api/crp-nominations/submit", access: "browser-session", purpose: "Publish a CRP nomination for the signed-in user.", appGate: "crp-nominations" },
  { method: "GET", path: "/api/crp-nominations/mine", access: "browser-session", purpose: "List attributed CRP nominations and anonymous credit count.", appGate: "crp-nominations" },
  { method: "GET", path: "/api/crp-nominations/credits", access: "browser-session", purpose: "Read anonymous CRP nomination credit count.", appGate: "crp-nominations" },
  { method: "GET", path: "/api/crp-nominations/share", access: "browser-session", purpose: "Build X/Bluesky share intents for an owned nomination.", appGate: "crp-nominations" },
  { method: "GET", path: "/api/skywire/status", access: "browser-session", purpose: "Read Skywire rollout eligibility and social cockpit metadata.", appGate: "skywire" },
  { method: "GET", path: "/api/wtf-live/status", access: "browser-session", purpose: "Read WTF LIVE rollout eligibility and Skywire identity lane metadata.", appGate: "wtf-live" },
  { method: "GET", path: "/api/wtf-live/public/rooms/:roomId", access: "public", purpose: "Read one public WTF LIVE room for room-only guest access." },
  { method: "GET", path: "/api/wtf-live/public/rooms/:roomId/messages", access: "public", purpose: "Read public AT room messages for one WTF LIVE guest room." },
  { method: "GET", path: "/api/wtf-live/rooms", access: "browser-session", purpose: "List WTF LIVE room definitions.", appGate: "wtf-live" },
  { method: "GET", path: "/api/wtf-live/rooms/mine", access: "browser-session", purpose: "List WTF LIVE rooms owned by the signed-in host.", appGate: "wtf-live" },
  { method: "GET", path: "/api/wtf-live/rooms/private", access: "browser-session", purpose: "List private WTF LIVE rooms available to the signed-in user through ownership or access-list membership.", appGate: "wtf-live" },
  { method: "GET", path: "/api/wtf-live/rooms/:roomId/join", access: "browser-session", purpose: "Read a WTF LIVE room join envelope for a public or private room the signed-in user can access.", appGate: "wtf-live" },
  { method: "GET", path: "/api/wtf-live/rooms/:roomId/access", access: "browser-session", purpose: "List allowed WTF users for one owned private WTF LIVE room.", appGate: "wtf-live" },
  { method: "PATCH", path: "/api/wtf-live/rooms/:roomId/access", access: "browser-session", purpose: "Replace the allowed WTF-user list for one owned private WTF LIVE room.", appGate: "wtf-live" },
  { method: "POST", path: "/api/wtf-live/rooms", access: "browser-session", purpose: "Create a user-owned WTF LIVE room.", appGate: "wtf-live" },
  { method: "PATCH", path: "/api/wtf-live/rooms/:roomId", access: "browser-session", purpose: "Close or reopen one owned WTF LIVE room.", appGate: "wtf-live" },
  { method: "DELETE", path: "/api/wtf-live/rooms/:roomId", access: "browser-session", purpose: "Archive one owned WTF LIVE room.", appGate: "wtf-live" },
  { method: "GET", path: "/api/wtf-live/rooms/:roomId/messages", access: "browser-session", purpose: "Read Skywire public room notes for an accessible public room; private rooms return realtime-only chat metadata.", appGate: "wtf-live" },
  { method: "POST", path: "/api/wtf-live/rooms/:roomId/messages", access: "browser-session", purpose: "Publish a public WTF LIVE room message through the signed-in user's Skywire identity.", appGate: "wtf-live" },
  { method: "GET", path: "/api/wtf-live/stages", access: "browser-session", purpose: "List WTF LIVE stage definitions.", appGate: "wtf-live" },
  { method: "GET", path: "/api/wtf-live/stages/mine", access: "browser-session", purpose: "List WTF LIVE stages owned by the signed-in host.", appGate: "wtf-live" },
  { method: "POST", path: "/api/wtf-live/stages", access: "browser-session", purpose: "Create a user-owned WTF LIVE stage.", appGate: "wtf-live" },
  { method: "PATCH", path: "/api/wtf-live/stages/:stageId", access: "browser-session", purpose: "Close or reopen one owned WTF LIVE stage.", appGate: "wtf-live" },
  { method: "DELETE", path: "/api/wtf-live/stages/:stageId", access: "browser-session", purpose: "Archive one owned WTF LIVE stage.", appGate: "wtf-live" },
  { method: "GET", path: "/api/wtf-live/stages/:stageId/broadcasts", access: "browser-session", purpose: "Read WTF LIVE stage broadcasts from connected Skywire repos.", appGate: "wtf-live" },
  { method: "POST", path: "/api/wtf-live/stages/:stageId/broadcasts", access: "browser-session", purpose: "Publish a WTF LIVE stage broadcast through the signed-in user's Skywire identity.", appGate: "wtf-live" },
];

export const WTF_MCP_SCOPE_GROUPS = [
  { scope: "desktop:read", purpose: "Read the paired user's desktop appearance." },
  { scope: "desktop:write", purpose: "Update the paired user's desktop appearance." },
  { scope: "pet:read", purpose: "Read the paired user's desktop pet state." },
  { scope: "pet:write", purpose: "Apply safe pet-care actions for the paired user." },
  { scope: "public-data:read", purpose: "Read public token, TV, and market-derived rows." },
  { scope: "arcade:read", purpose: "Read WTF Arcade catalog, stats, fee, and play status." },
  { scope: "arcade:write", purpose: "Create Arcade play intents and submit Game Studio projects to Arcade." },
  { scope: "console:read", purpose: "Read Console catalog and public score/discovery data." },
  { scope: "game-studio:read", purpose: "Read Game Studio templates, targets, assets, snippets, and saved projects." },
  { scope: "game-studio:write", purpose: "Create, update, build, and submit the paired user's Game Studio projects." },
  { scope: "map-lab:write", purpose: "Create Map Lab documents for the paired user." },
  { scope: "crp-nominations:read", purpose: "Read CRP categories, repo status, nominee resolution, and the paired user's attributed nominations or anonymous credit count." },
  { scope: "crp-nominations:write", purpose: "Submit CRP nominations on behalf of the paired user. The token owner remains liable for agent abuse." },
  { scope: "market:write", purpose: "Create market/play-intent or trusted creator market workflows." },
  { scope: "trade-board:write", purpose: "Mutate the paired user's trade-board rows." },
] as const;

function withGateState<T extends { appGate?: DesktopAppKey }>(
  entries: T[],
  apps: DesktopAppConfig
): Array<T & { enabled: boolean }> {
  return entries.map((entry) => ({
    ...entry,
    enabled: entry.appGate ? apps[entry.appGate] !== false : true,
  }));
}

export function buildWtfAccessManifest(input: {
  origin: string;
  mcpEndpoint: string;
  apps: DesktopAppConfig;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  return {
    ok: true,
    service: "wtf-gameshow",
    generatedAt: now.toISOString(),
    origin: input.origin,
    guarantees: [
      "Browser access continues to use the normal connect.sid session cookie.",
      "MCP access uses Authorization: Bearer wtf_mcp_... only on /mcp.",
      "/mcp never accepts browser cookies as MCP auth and never sends Set-Cookie.",
      "MCP requests are rate limited separately from standard browser/API traffic.",
      "Public JSON routes expose public or public-derived rows only.",
      "Paired MCP tools act only for the user who created the token, honor admin app gates, and cap token scopes to the user's WTF account role.",
    ],
    browserRoutes: withGateState(WTF_STANDARD_BROWSER_ROUTES, input.apps),
    apiRoutes: withGateState(WTF_STANDARD_API_ROUTES, input.apps),
    mcp: {
      endpoint: input.mcpEndpoint,
      tokenManagementApi: "/api/mcp/tokens",
      authentication: "Authorization: Bearer wtf_mcp_...",
      rateLimitPerMinute: Number(process.env.MCP_AGENT_RATE_LIMIT_PER_MINUTE || 60),
      scopes: WTF_MCP_SCOPE_GROUPS,
    },
  };
}
