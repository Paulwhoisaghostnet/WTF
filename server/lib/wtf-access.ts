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
  { path: "/dashboard", title: "Dashboard", access: "browser-session", purpose: "Signed-in user home." },
  { path: "/desktop-settings", title: "System Appearance", access: "browser-session", purpose: "Desktop appearance and MCP pairing." },
  { path: "/profile", title: "Profile", access: "browser-session", purpose: "Profile, wallets, and account settings." },
  { path: "/dear-diary", title: "Dear Diary", access: "browser-session", purpose: "Private diary, note, search, tag, and cross-reference workspace.", appGate: "dear-diary" },
  { path: "/marketplace", title: "On Chain Market", access: "browser-session", purpose: "Marketplace browsing and listing workflows." },
  { path: "/trade-boards", title: "Trade Boards", access: "browser-session", purpose: "Trade-board management.", appGate: "hoard" },
  { path: "/w", title: "W Feed", access: "browser-session", purpose: "Social feed and posting.", appGate: "w" },
  { path: "/tv", title: "WTF TV", access: "browser-session", purpose: "TV creator/player surface.", appGate: "tv" },
  { path: "/console", title: "WTF Console", access: "browser-session", purpose: "Personal stock and owned game cartridges.", appGate: "console" },
  { path: "/game-studio", title: "Game Studio", access: "browser-session", purpose: "Create and submit browser games.", appGate: "game-studio" },
  { path: "/studio", title: "Studio", access: "browser-session", purpose: "Collaborative media workspace.", appGate: "studio" },
  { path: "/admin", title: "Admin Panel", access: "role-gated-session", purpose: "Operational and moderation controls." },
  { path: "/control-board", title: "Control Board", access: "role-gated-session", purpose: "Gameshow staff control surface." },
];

export const WTF_STANDARD_API_ROUTES: WtfApiAccessRoute[] = [
  { method: "GET", path: "/api/health", access: "public", purpose: "Service health, commit, uptime, and timestamp." },
  { method: "GET", path: "/api/access", access: "public", purpose: "Read-only standard access manifest for browser, API, and MCP clients." },
  { method: "GET", path: "/api/apps/desktop", access: "public", purpose: "Current admin app-gate state for launcher/MCP parity." },
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
  { method: "GET", path: "/api/auth/user", access: "browser-session", purpose: "Current signed-in user." },
  { method: "POST", path: "/api/auth/login", access: "public", purpose: "Create browser session." },
  { method: "POST", path: "/api/auth/logout", access: "browser-session", purpose: "End browser session." },
  { method: "GET", path: "/api/diary/entries", access: "browser-session", purpose: "List the signed-in user's private diary entries.", appGate: "dear-diary" },
  { method: "GET", path: "/api/diary/index", access: "browser-session", purpose: "Read the signed-in user's private diary index.", appGate: "dear-diary" },
  { method: "POST", path: "/api/diary/entries", access: "browser-session", purpose: "Create a private diary entry.", appGate: "dear-diary" },
  { method: "PATCH", path: "/api/diary/entries/:id", access: "browser-session", purpose: "Update one owned private diary entry.", appGate: "dear-diary" },
  { method: "DELETE", path: "/api/diary/entries/:id", access: "browser-session", purpose: "Delete one owned private diary entry.", appGate: "dear-diary" },
  { method: "GET", path: "/api/mcp/tokens", access: "browser-session", purpose: "List paired MCP tokens for the signed-in user." },
  { method: "POST", path: "/api/mcp/tokens", access: "browser-session", purpose: "Create a paired MCP token from browser settings." },
  { method: "DELETE", path: "/api/mcp/tokens/:id", access: "browser-session", purpose: "Revoke a paired MCP token." },
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
