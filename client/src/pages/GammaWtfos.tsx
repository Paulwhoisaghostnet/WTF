import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import styled, { createGlobalStyle } from "styled-components";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  CalendarDays,
  ChevronRight,
  Crown,
  Gamepad2,
  Hammer,
  Image,
  Inbox,
  LockKeyhole,
  LogOut,
  LogIn,
  Power,
  MessageCircle,
  Monitor,
  Palette,
  RadioTower,
  Search,
  Send,
  Settings,
  Store,
  UserRound,
  UsersRound,
  X,
  Zap,
} from "lucide-react";
import {
  formatRoleLabel,
  normalizeUserRoles,
  isAdmin as roleIsAdmin,
  type DesktopAppKey,
} from "@shared/types";
import {
  WTFOS_APP_CATALOG_ENTRIES,
  formatWtfOsAppPrice,
  type WtfOsAppCatalogEntry,
} from "@shared/wtfos-app-catalog";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import {
  PresentationShellProvider,
  rememberPresentationHost,
} from "../lib/presentation-shell";
import {
  WindowManagerProvider,
  WindowPathContext,
} from "../lib/window-context";
import { PAGE_DEFS, getPageAccessState, matchPage } from "../routes/page-defs";
import { Login } from "./Login";
import { Register } from "./Register";

type GammaXpPeer = {
  rank?: number;
  username?: string | null;
  displayName?: string | null;
  experiencePoints?: number | null;
  role?: string | null;
  xpTierLabel?: string | null;
};

type GammaPeer = {
  id: string;
  name: string;
  role: string;
  motion: string;
  route: string;
  xp: string;
};

type GammaStation = {
  key: string;
  label: string;
  route: string;
  kind: string;
  pull: string;
  icon: typeof Palette;
};

type GammaPassportAction = {
  key: string;
  label: string;
  route: string;
  kind: string;
  detail: string;
  icon: typeof Palette;
};

type GammaCommandEntry = {
  key: string;
  label: string;
  route: string;
  kind: string;
  detail: string;
  icon: typeof Palette;
  locked?: boolean;
};

type GammaRecentEntry = {
  key: string;
  label: string;
  route: string;
  detail: string;
  icon: typeof Palette;
  fallback?: boolean;
};

type GammaSystemState = "checking" | "online" | "degraded";
type GammaNotificationState = "guest" | "checking" | "clear" | "unread" | "degraded";

type GammaWakeQueueItem = {
  key: string;
  label: string;
  route: string;
  detail: string;
  status: string;
  icon: typeof Palette;
  primary?: boolean;
};

type GammaRouteParts = {
  pathname: string;
  search: string;
  hash: string;
};

type GammaNotificationSummary = {
  unreadCount?: number | null;
  items?: Array<{
    id?: number;
    title?: string | null;
    read?: boolean | null;
  }>;
};

type GammaTrayAction = {
  key: string;
  label: string;
  detail: string;
  route: string;
  icon: typeof Palette;
  live: boolean;
  state?: GammaNotificationState;
  unreadCount?: number;
  clock?: boolean;
};

type GammaClockSnapshot = {
  iso: string;
  timeLabel: string;
  dateLabel: string;
};

type GammaNavigationHistory = {
  routes: string[];
  index: number;
};

const GAMMA_RECENT_ROUTES_STORAGE_KEY = "wtfos.gamma.recentRoutes";
const GAMMA_RECENT_ROUTES_LIMIT = 5;
const GAMMA_HISTORY_LIMIT = 12;
const GAMMA_DEFAULT_POST_LOGIN_ROUTE = "/dashboard";
const GAMMA_DEFAULT_LOGIN_ROUTE = `/login?return=${encodeURIComponent(GAMMA_DEFAULT_POST_LOGIN_ROUTE)}`;
const GAMMA_CLOCK_ROUTE = "/calendar";
const GAMMA_CLOCK_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const GAMMA_CLOCK_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});

function buildGammaClockSnapshot(now: Date): GammaClockSnapshot {
  return {
    iso: now.toISOString(),
    timeLabel: GAMMA_CLOCK_TIME_FORMATTER.format(now),
    dateLabel: GAMMA_CLOCK_DATE_FORMATTER.format(now),
  };
}

function useGammaClockSnapshot(): GammaClockSnapshot {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(intervalId);
  }, []);

  return useMemo(() => buildGammaClockSnapshot(now), [now]);
}

const FALLBACK_PEERS: GammaPeer[] = [
  {
    id: "fallback-creator",
    name: "studio.signal",
    role: "creator",
    motion: "sketching a drop",
    route: "/studio",
    xp: "role lit",
  },
  {
    id: "fallback-collector",
    name: "vault.radio",
    role: "collector",
    motion: "watching fresh pieces",
    route: "/gallery",
    xp: "xp hum",
  },
  {
    id: "fallback-builder",
    name: "cabinet.build",
    role: "builder",
    motion: "tuning a playable room",
    route: "/game-studio",
    xp: "level glow",
  },
  {
    id: "fallback-curator",
    name: "floor.curator",
    role: "curator",
    motion: "threading signals",
    route: "/w",
    xp: "quest spark",
  },
  {
    id: "fallback-community",
    name: "live.table",
    role: "community",
    motion: "opening a room",
    route: "/live",
    xp: "party wire",
  },
];

const START_STATIONS: GammaStation[] = [
  {
    key: "desk",
    label: "Desk",
    route: "/dashboard",
    kind: "start",
    pull: "daily cockpit",
    icon: Monitor,
  },
  {
    key: "apps",
    label: "Apps",
    route: "/wtfiam?category=apps",
    kind: "install",
    pull: "unlock tools",
    icon: Store,
  },
  {
    key: "inbox",
    label: "Inbox",
    route: "/mail",
    kind: "inbox",
    pull: "messages and alerts",
    icon: Inbox,
  },
  {
    key: "settings",
    label: "Settings",
    route: "/settings",
    kind: "system",
    pull: "account and OS controls",
    icon: Settings,
  },
];

const MAKE_STATIONS: GammaStation[] = [
  {
    key: "studio",
    label: "Studio",
    route: "/studio",
    kind: "make",
    pull: "draft art, pages, drops",
    icon: Palette,
  },
  {
    key: "broot",
    label: "Broot",
    route: "/tools/broot",
    kind: "make",
    pull: "generate visual matter",
    icon: Hammer,
  },
  {
    key: "macaroni",
    label: "Macaroni",
    route: "/tools/macaroni",
    kind: "publish",
    pull: "package mintable work",
    icon: Zap,
  },
  {
    key: "ipfs",
    label: "IPFS",
    route: "/ipfs-pinning",
    kind: "publish",
    pull: "keep media alive",
    icon: Send,
  },
];

const FLOOR_STATIONS: GammaStation[] = [
  {
    key: "gallery",
    label: "Gallery",
    route: "/gallery",
    kind: "look",
    pull: "fresh objects and profiles",
    icon: Image,
  },
  {
    key: "arcade",
    label: "Arcade",
    route: "/arcade",
    kind: "play",
    pull: "published games and rooms",
    icon: Gamepad2,
  },
  {
    key: "market",
    label: "Market",
    route: "/marketplace",
    kind: "collect",
    pull: "listed pieces and sinks",
    icon: Store,
  },
  {
    key: "leaderboard",
    label: "Levels",
    route: "/leaderboard",
    kind: "signal",
    pull: "visible roles and XP",
    icon: Crown,
  },
];

const COMMS_STATIONS: GammaStation[] = [
  {
    key: "w",
    label: "W",
    route: "/w",
    kind: "talk",
    pull: "public feed",
    icon: MessageCircle,
  },
  {
    key: "wim",
    label: "WIM",
    route: "/wim",
    kind: "talk",
    pull: "instant messages",
    icon: Send,
  },
  {
    key: "live",
    label: "LIVE",
    route: "/live/r/wtf-live",
    kind: "gather",
    pull: "rooms and stages",
    icon: UsersRound,
  },
  {
    key: "skywire",
    label: "Skywire",
    route: "/skywire?standalone=1",
    kind: "relay",
    pull: "broadcast outside",
    icon: RadioTower,
  },
];

const COUNT_STATIONS: GammaStation[] = [
  {
    key: "sidequests",
    label: "Side Quests",
    route: "/side-quests",
    kind: "ops",
    pull: "daily sparks",
    icon: Zap,
  },
  {
    key: "challenges",
    label: "Challenges",
    route: "/challenges",
    kind: "ops",
    pull: "season arcs",
    icon: Gamepad2,
  },
  {
    key: "admin",
    label: "The Count",
    route: "/admin",
    kind: "ops",
    pull: "roles, rewards, markets",
    icon: Crown,
  },
];

const GAMMA_NAV_GROUPS = [
  { label: "Start", stations: START_STATIONS },
  { label: "Make", stations: MAKE_STATIONS },
  { label: "Discover", stations: FLOOR_STATIONS },
  { label: "Comms", stations: COMMS_STATIONS },
  { label: "Count", stations: COUNT_STATIONS },
];

const ALL_GAMMA_STATIONS = GAMMA_NAV_GROUPS.flatMap((group) => group.stations);

const GAMMA_FALLBACK_RECENTS: GammaRecentEntry[] = [
  {
    key: "daily",
    label: "Daily proof",
    route: "/side-quests",
    detail: "default",
    icon: Zap,
    fallback: true,
  },
  {
    key: "people",
    label: "People",
    route: "/w",
    detail: "default",
    icon: UsersRound,
    fallback: true,
  },
  {
    key: "gallery",
    label: "Objects",
    route: "/gallery",
    detail: "default",
    icon: Image,
    fallback: true,
  },
];

function commandNeedle(value: string): string {
  return value.trim().toLowerCase();
}

function staticRouteFromPattern(pattern: string): string | null {
  if (!pattern.startsWith("/") || pattern.includes(":")) return null;
  if (pattern === "/gamma" || pattern === "/beta") return null;
  return pattern;
}

function pushGammaCommand(
  commands: GammaCommandEntry[],
  seenRoutes: Set<string>,
  command: GammaCommandEntry
) {
  const routeKey = routeLocationFromParts(splitRouteLocation(command.route));
  if (seenRoutes.has(routeKey)) return;
  seenRoutes.add(routeKey);
  commands.push(command);
}

function buildGammaCommandEntries(
  appAvailability: Partial<Record<DesktopAppKey, boolean>>,
  appAvailabilityReady: boolean
): GammaCommandEntry[] {
  const commands: GammaCommandEntry[] = [];
  const seenRoutes = new Set<string>();

  for (const station of ALL_GAMMA_STATIONS) {
    pushGammaCommand(commands, seenRoutes, {
      key: `station:${station.key}`,
      label: station.label,
      route: station.route,
      kind: station.kind,
      detail: station.pull,
      icon: station.icon,
    });
  }

  for (const entry of WTFOS_APP_CATALOG_ENTRIES) {
    pushGammaCommand(commands, seenRoutes, {
      key: `app:${entry.key}`,
      label: entry.label,
      route: entry.route,
      kind: entry.placement === "app-store" ? "app pass" : entry.necessity,
      detail: entry.summary,
      icon: Store,
      locked: appAvailabilityReady && entry.placement === "app-store" && !appAvailability[entry.key],
    });
  }

  for (const def of PAGE_DEFS) {
    const route = staticRouteFromPattern(def.pattern);
    if (!route) continue;
    pushGammaCommand(commands, seenRoutes, {
      key: `route:${route}`,
      label: def.title || titleFromRoute(route),
      route,
      kind: def.group || "route",
      detail: def.auth ? "signed-in route" : "public route",
      icon: Search,
    });
  }

  return commands;
}

function scoreGammaCommand(query: string, command: GammaCommandEntry): number | null {
  const needle = commandNeedle(query);
  if (!needle) return null;
  const label = commandNeedle(command.label);
  const route = commandNeedle(command.route);
  const kind = commandNeedle(command.kind);
  const detail = commandNeedle(command.detail);

  if (label === needle) return 0;
  if (label.startsWith(needle)) return 1;
  if (route === needle || route === `/${needle}`) return 2;
  if (route.includes(needle)) return 3;
  if (kind.includes(needle)) return 4;
  if (detail.includes(needle)) return 5;
  return null;
}

function getGammaCommandMatches(query: string, commands: GammaCommandEntry[]): GammaCommandEntry[] {
  return commands
    .map((command) => ({ command, score: scoreGammaCommand(query, command) }))
    .filter((item): item is { command: GammaCommandEntry; score: number } => item.score !== null)
    .sort((a, b) => a.score - b.score || a.command.label.localeCompare(b.command.label))
    .slice(0, 5)
    .map((item) => item.command);
}

function normalizeGammaRecentRoute(routeLocation: string): string | null {
  const parts = splitRouteLocation(routeLocation);
  const pathname = parts.pathname || "/";
  if (
    pathname === "/" ||
    pathname === "/gamma" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/api/")
  ) {
    return null;
  }
  const normalized = routeLocationFromParts(parts);
  return matchPage(normalized) ? normalized : null;
}

function dedupeGammaRecentRoutes(routes: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const route of routes) {
    const normalized = normalizeGammaRecentRoute(route);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
    if (deduped.length >= GAMMA_RECENT_ROUTES_LIMIT) break;
  }
  return deduped;
}

function readGammaRecentRoutes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(GAMMA_RECENT_ROUTES_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? dedupeGammaRecentRoutes(parsed.filter((route) => typeof route === "string")) : [];
  } catch {
    return [];
  }
}

function writeGammaRecentRoutes(routes: string[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GAMMA_RECENT_ROUTES_STORAGE_KEY, JSON.stringify(routes));
  } catch {
    // Recent-route restore is a convenience; storage failures should not block navigation.
  }
}

function mergeGammaRecentRoute(routes: string[], routeLocation: string): string[] {
  const normalized = normalizeGammaRecentRoute(routeLocation);
  if (!normalized) return routes;
  return dedupeGammaRecentRoutes([normalized, ...routes]);
}

function buildGammaRecentEntries(routes: string[]): GammaRecentEntry[] {
  const entries = dedupeGammaRecentRoutes(routes).map((route) => {
    const station = findGammaStation(route);
    return {
      key: `recent:${route}`,
      label: titleFromRoute(route),
      route,
      detail: station?.kind ?? cleanPathname(route),
      icon: station?.icon ?? Search,
    };
  });
  return entries.length ? entries : GAMMA_FALLBACK_RECENTS;
}

function normalizeGammaHistoryRoute(routeLocation: string): string | null {
  const parts = splitRouteLocation(routeLocation);
  const pathname = parts.pathname || "/";
  if (pathname === "/gamma") return "/";
  if (pathname.startsWith("/api/")) return null;
  const normalized = routeLocationFromParts(parts);
  if (pathname === "/") return "/";
  return matchPage(normalized) ? normalized : null;
}

function createGammaHistoryState(routeLocation: string): GammaNavigationHistory {
  const normalized = normalizeGammaHistoryRoute(routeLocation) ?? "/";
  return { routes: [normalized], index: 0 };
}

function mergeGammaHistoryRoute(
  history: GammaNavigationHistory,
  routeLocation: string
): GammaNavigationHistory {
  const normalized = normalizeGammaHistoryRoute(routeLocation);
  if (!normalized) return history;
  if (history.routes[history.index] === normalized) return history;

  const previousIndex = history.index - 1;
  if (previousIndex >= 0 && history.routes[previousIndex] === normalized) {
    return { ...history, index: previousIndex };
  }

  const nextIndex = history.index + 1;
  if (nextIndex < history.routes.length && history.routes[nextIndex] === normalized) {
    return { ...history, index: nextIndex };
  }

  const nextRoutes = [...history.routes.slice(0, history.index + 1), normalized].slice(-GAMMA_HISTORY_LIMIT);
  return { routes: nextRoutes, index: nextRoutes.length - 1 };
}

function gammaHistoryRouteAt(history: GammaNavigationHistory, offset: -1 | 1): string | null {
  return history.routes[history.index + offset] ?? null;
}

function focusGammaCommandInput() {
  if (typeof document === "undefined") return false;
  const shell = document.querySelector("[data-gamma-wtfos]");
  if (!shell) return false;
  const input = Array.from(
    shell.querySelectorAll<HTMLInputElement>('input[data-gamma-command-input="true"]')
  ).find((candidate) => !candidate.disabled && candidate.getClientRects().length > 0);
  if (!input) return false;
  input.focus({ preventScroll: false });
  input.select();
  return true;
}

function focusGammaRouteFrame() {
  if (typeof document === "undefined") return false;
  const target = document.querySelector<HTMLElement>('[data-gamma-route-focus-target="active-app"]');
  if (!target || target.getClientRects().length === 0) return false;
  target.focus({ preventScroll: true });
  return document.activeElement === target;
}

function visibleGammaCommandButtons(surface: Element | null) {
  if (!surface) return [];
  return Array.from(
    surface.querySelectorAll<HTMLButtonElement>("[data-gamma-command-results] button")
  ).filter((candidate) => !candidate.disabled && candidate.getClientRects().length > 0);
}

function focusGammaCommandInputForSurface(surface: Element | null) {
  if (!surface) return false;
  const input = surface.querySelector<HTMLInputElement>('input[data-gamma-command-input="true"]');
  if (!input || input.disabled || input.getClientRects().length === 0) return false;
  input.focus({ preventScroll: false });
  input.select();
  return true;
}

function moveGammaCommandResultFocus(
  event: ReactKeyboardEvent<HTMLElement>,
  direction: "first" | "previous" | "next"
) {
  const surface = event.currentTarget.closest("[data-gamma-command-surface]");
  const buttons = visibleGammaCommandButtons(surface);
  if (!buttons.length) return false;

  const currentIndex =
    event.currentTarget instanceof HTMLButtonElement ? buttons.indexOf(event.currentTarget) : -1;
  const targetIndex =
    direction === "first"
      ? 0
      : direction === "previous"
        ? (Math.max(currentIndex, 0) - 1 + buttons.length) % buttons.length
        : (currentIndex + 1) % buttons.length;
  buttons[targetIndex]?.focus({ preventScroll: false });
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function handleGammaCommandInputKeyDown(
  event: ReactKeyboardEvent<HTMLInputElement>,
  query: string,
  setQuery: (value: string) => void
) {
  if (event.key === "ArrowDown") {
    moveGammaCommandResultFocus(event, "first");
    return;
  }
  if (event.key !== "Escape") return;
  if (query) setQuery("");
  HTMLInputElement.prototype.blur.call(event.currentTarget);
  event.preventDefault();
  event.stopPropagation();
}

function handleGammaCommandResultKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
  if (event.key === "ArrowDown") {
    moveGammaCommandResultFocus(event, "next");
    return;
  }
  if (event.key === "ArrowUp") {
    moveGammaCommandResultFocus(event, "previous");
    return;
  }
  if (event.key === "Escape") {
    const didFocusInput = focusGammaCommandInputForSurface(
      event.currentTarget.closest("[data-gamma-command-surface]")
    );
    if (!didFocusInput) return;
    event.preventDefault();
    event.stopPropagation();
  }
}

function isGammaEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === "input" || tagName === "textarea" || tagName === "select";
}

function isGammaInteractiveShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (isGammaEditableShortcutTarget(target)) return true;
  return Boolean(target.closest("button, a, [role='button'], [role='link'], [role='menuitem']"));
}

const GAMMA_PASSPORT_ACTIONS: GammaPassportAction[] = [
  {
    key: "sidequests",
    label: "Side quests",
    route: "/side-quests",
    kind: "daily",
    detail: "small wins and repeatable discovery",
    icon: Zap,
  },
  {
    key: "challenges",
    label: "Challenges",
    route: "/challenges",
    kind: "proof",
    detail: "role-readiness and season arcs",
    icon: Gamepad2,
  },
  {
    key: "apps",
    label: "App unlocks",
    route: "/wtfiam?category=apps",
    kind: "store",
    detail: "ranked optional tools and passes",
    icon: Store,
  },
  {
    key: "levels",
    label: "Levels",
    route: "/leaderboard",
    kind: "signal",
    detail: "visible EXP and role context",
    icon: Crown,
  },
];

const GAMMA_DAILY_ACTIONS: GammaPassportAction[] = [
  {
    key: "sidequests",
    label: "Pick a side quest",
    route: "/side-quests",
    kind: "daily",
    detail: "small repeatable proof",
    icon: Zap,
  },
  {
    key: "challenges",
    label: "Check challenges",
    route: "/challenges",
    kind: "season",
    detail: "larger arcs and rewards",
    icon: Gamepad2,
  },
  {
    key: "people",
    label: "Find active people",
    route: "/w",
    kind: "social",
    detail: "public feed and signals",
    icon: UsersRound,
  },
  {
    key: "notifications",
    label: "Read signals",
    route: "/notifications",
    kind: "inbox",
    detail: "replies, updates, tasks",
    icon: Bell,
  },
];

const GAMMA_COUNT_ACTIONS: GammaPassportAction[] = [
  {
    key: "users",
    label: "Triage users",
    route: "/admin",
    kind: "users",
    detail: "roles, access, abuse notes",
    icon: UserRound,
  },
  {
    key: "loops",
    label: "Audit loops",
    route: "/challenges",
    kind: "proof",
    detail: "challenge, sidequest, reward safety",
    icon: Settings,
  },
  {
    key: "market",
    label: "Tune market",
    route: "/wtfiam",
    kind: "market",
    detail: "items, rewards, app passes",
    icon: Store,
  },
];

function splitRouteLocation(location: string): GammaRouteParts {
  const hashIndex = location.indexOf("#");
  const beforeHash = hashIndex >= 0 ? location.slice(0, hashIndex) : location;
  const hash = hashIndex >= 0 ? location.slice(hashIndex) : "";
  const queryIndex = beforeHash.indexOf("?");
  const pathname = queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash;
  const search = queryIndex >= 0 ? beforeHash.slice(queryIndex) : "";
  return {
    pathname: pathname || "/",
    search,
    hash,
  };
}

function routeLocationFromParts(parts: GammaRouteParts): string {
  return `${parts.pathname || "/"}${parts.search}${parts.hash}`;
}

function isGammaHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "gamma.wtfos.app";
}

function isGammaHarnessLocation(location: string): boolean {
  const { pathname } = splitRouteLocation(location);
  return pathname === "/gamma" || pathname.startsWith("/gamma/");
}

function gammaRouteFromLocation(location: string): string {
  const parts = splitRouteLocation(location);
  if (parts.pathname === "/gamma") return `/${parts.search}${parts.hash}`;
  if (parts.pathname.startsWith("/gamma/")) {
    return routeLocationFromParts({
      ...parts,
      pathname: parts.pathname.slice("/gamma".length) || "/",
    });
  }
  return routeLocationFromParts(parts);
}

function gammaNavigationTarget(route: string, currentLocation: string): string {
  const raw = route.trim() || "/";
  const parts = splitRouteLocation(raw.startsWith("/") ? raw : `/${raw}`);
  const routeLocation = routeLocationFromParts(parts);
  if (isGammaHost()) return routeLocation;
  if (!isGammaHarnessLocation(currentLocation)) return routeLocation;
  if (parts.pathname === "/") return `/gamma${parts.search}${parts.hash}`;
  return `/gamma${routeLocation}`;
}

function cleanPathname(routeLocation: string): string {
  return splitRouteLocation(routeLocation).pathname || "/";
}

function findGammaStation(routeLocation: string): GammaStation | null {
  const pathname = cleanPathname(routeLocation);
  return (
    ALL_GAMMA_STATIONS.find((station) => {
      const stationPathname = cleanPathname(station.route);
      return pathname === stationPathname || pathname.startsWith(`${stationPathname}/`);
    }) ?? null
  );
}

function titleFromRoute(routeLocation: string): string {
  const station = findGammaStation(routeLocation);
  if (station) return station.label;
  const match = matchPage(routeLocation);
  if (match?.def.title) return match.def.title;
  const pathname = cleanPathname(routeLocation);
  if (pathname === "/" || pathname === "/gamma") return "Gamma Home";
  return pathname
    .split("/")
    .filter(Boolean)
    .slice(-1)[0]
    ?.replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? "WTFOS Route";
}

function routeSummary(routeLocation: string): string {
  const station = findGammaStation(routeLocation);
  if (station) return station.pull;
  const match = matchPage(routeLocation);
  if (match?.def.group) return `${match.def.group} surface routed through Gamma shell`;
  return "registered route content stays inside Gamma chrome";
}

function interfaceHref(host: "classic" | "beta" | "gamma", routeLocation: string): string {
  const pathname = cleanPathname(routeLocation);
  const normalized = pathname === "/gamma" ? "/" : routeLocation || "/";
  const route = normalized === "/gamma" ? "/" : normalized;
  if (host === "classic") return `https://wtfos.app${route === "/" ? "/" : route}`;
  if (host === "beta") return `https://beta.wtfos.app${route === "/" ? "/" : route}`;
  return `https://gamma.wtfos.app${route === "/" ? "/" : route}`;
}

function routeFromInterceptableLink(anchor: HTMLAnchorElement): string | null {
  const rawHref = anchor.getAttribute("href") || "";
  if (!rawHref || rawHref.startsWith("#")) return null;
  if (/^(mailto|tel|data|blob|javascript):/i.test(rawHref)) return null;
  if (anchor.hasAttribute("download")) return null;
  const target = anchor.getAttribute("target");
  if (target && target.toLowerCase() !== "_self") return null;
  if (anchor.closest("[data-gamma-interface-switch='true']")) return null;

  let url: URL;
  try {
    url = new URL(anchor.href);
  } catch {
    return null;
  }

  const currentOrigin =
    typeof window !== "undefined" ? window.location.origin : "https://gamma.wtfos.app";
  const sameOrigin = url.origin === currentOrigin;
  const knownWtfHost =
    url.protocol === "https:" &&
    ["wtfos.app", "beta.wtfos.app", "gamma.wtfos.app"].includes(url.hostname);
  if (!sameOrigin && !knownWtfHost) return null;

  const route = `${url.pathname || "/"}${url.search}${url.hash}`;
  const routePath = cleanPathname(route);
  if (routePath.startsWith("/api/")) return null;
  const normalizedRoute = isGammaHarnessLocation(route) ? gammaRouteFromLocation(route) : route;
  const normalizedPath = cleanPathname(normalizedRoute);
  if (normalizedPath === "/") return "/";
  return matchPage(normalizedRoute) ? normalizedRoute : null;
}

function peerName(peer: GammaXpPeer): string {
  const displayName = String(peer.displayName || "").trim();
  if (displayName) return displayName;
  const username = String(peer.username || "").trim();
  if (username) return username;
  return `wallet ${peer.rank ?? "signal"}`;
}

function peerRoute(peer: GammaXpPeer): string {
  const username = String(peer.username || "").trim();
  return username ? `/user/${encodeURIComponent(username)}` : "/leaderboard";
}

function peerMotion(peer: GammaXpPeer): string {
  const tier = String(peer.xpTierLabel || "").trim();
  if (tier) return tier;
  const role = String(peer.role || "").trim();
  return role ? `${role} signal` : "visible on-chain pulse";
}

function mapPeers(rows: GammaXpPeer[] | undefined): GammaPeer[] {
  const liveRows = Array.isArray(rows) ? rows.filter((row) => peerName(row).trim()) : [];
  const mapped = liveRows.slice(0, 8).map((row, index) => ({
    id: `xp-${row.username || row.rank || index}`,
    name: peerName(row),
    role: String(row.role || "member"),
    motion: peerMotion(row),
    route: peerRoute(row),
    xp:
      typeof row.experiencePoints === "number"
        ? `${row.experiencePoints.toLocaleString()} XP`
        : row.xpTierLabel || "XP trail",
  }));
  return mapped.length >= 3 ? mapped : FALLBACK_PEERS;
}

function GammaLoadingBlock({ label }: { label: string }) {
  return (
    <GammaNotice data-gamma-route-loading>
      <b>{label}</b>
      <span>Loading shared WTFOS route surface.</span>
    </GammaNotice>
  );
}

function GammaCommandResults({
  query,
  commands,
  onLaunch,
}: {
  query: string;
  commands: GammaCommandEntry[];
  onLaunch: (route: string) => void;
}) {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const matches = getGammaCommandMatches(trimmed, commands);
  const fallbackRoute = `/gallery?search=${encodeURIComponent(trimmed)}`;

  return (
    <CommandResults data-gamma-command-results aria-label="Gamma command search results">
      {matches.map((command) => (
        <button
          key={command.key}
          type="button"
          onClick={() => onLaunch(command.route)}
          onKeyDown={handleGammaCommandResultKeyDown}
          data-gamma-command-result={command.key}
          data-gamma-command-route={command.route}
          data-gamma-command-locked={command.locked ? "true" : "false"}
        >
          <command.icon size={15} aria-hidden="true" />
          <span>
            <b>{command.label}</b>
            <small>{command.detail}</small>
          </span>
          <strong>{command.locked ? "Unlock" : command.kind}</strong>
        </button>
      ))}
      {matches.length === 0 ? (
        <button
          type="button"
          onClick={() => onLaunch(fallbackRoute)}
          onKeyDown={handleGammaCommandResultKeyDown}
          data-gamma-command-result="gallery-search"
          data-gamma-command-route={fallbackRoute}
          data-gamma-command-locked="false"
        >
          <Search size={15} aria-hidden="true" />
          <span>
            <b>Search Gallery</b>
            <small>No route match for "{trimmed}"</small>
          </span>
          <strong>public</strong>
        </button>
      ) : null}
    </CommandResults>
  );
}

function GammaRouteGate({
  title,
  reason,
  appKey,
  appLabel,
  returnRoute,
  onLaunch,
}: {
  title: string;
  reason: string;
  appKey?: DesktopAppKey | null;
  appLabel?: string | null;
  returnRoute?: string | null;
  onLaunch: (route: string) => void;
}) {
  const isAuth = reason === "auth-required";
  const isLockedApp = reason === "app-disabled";
  const lockedAppLabel = appLabel || title;
  const loginRoute = returnRoute ? `/login?return=${encodeURIComponent(returnRoute)}` : "/login";
  return (
    <GammaNotice data-gamma-route-gate={reason} data-gamma-route-gate-app={appKey || undefined}>
      <b>{title}</b>
      <span>
        {isAuth
          ? "Sign in to continue through the same WTFOS permission gate."
          : isLockedApp
            ? `${lockedAppLabel} is not installed for this session. Unlock the app pass in WTFIAM Apps, then come back to this Gamma route.`
          : "This route is protected by the shared WTFOS permission model."}
      </span>
      <GammaNoticeActions>
        {isAuth ? (
          <button
            type="button"
            autoFocus
            onClick={() => onLaunch(loginRoute)}
            data-gamma-launch={loginRoute}
            data-gamma-auth-primary-action="enter-return"
            data-gamma-auth-return={returnRoute || undefined}
          >
            Enter and return
          </button>
        ) : null}
        {isLockedApp ? (
          <button
            type="button"
            onClick={() => onLaunch("/wtfiam?category=apps")}
            data-gamma-launch="/wtfiam?category=apps"
            data-gamma-locked-app-action="apps"
          >
            Open Apps
          </button>
        ) : null}
        <button type="button" onClick={() => onLaunch("/")} data-gamma-launch="/">
          Gamma home
        </button>
      </GammaNoticeActions>
    </GammaNotice>
  );
}

function gammaRoleSummary(user: ReturnType<typeof useAuth>["user"]): string {
  if (!user) return "Guest preview";
  const roles = normalizeUserRoles(user.roles ?? user.role ?? null);
  if (!roles.length) return "Signed in";
  return roles.map(formatRoleLabel).join(" / ");
}

function gammaExpSummary(user: ReturnType<typeof useAuth>["user"]): string {
  if (!user) return "Sign in to save EXP";
  const points =
    typeof user.experiencePoints === "number" ? user.experiencePoints.toLocaleString() : "0";
  const tier = user.xpTier?.label ?? "EXP tier syncing";
  return `${points} EXP · ${tier}`;
}

function gammaNextXpSummary(user: ReturnType<typeof useAuth>["user"]): string {
  if (!user) return "Progress starts with a side quest or challenge after login.";
  const nextTier = user.xpTier?.nextTierMinXp;
  if (typeof nextTier === "number") {
    return `Next tier begins at ${nextTier.toLocaleString()} EXP.`;
  }
  return "EXP is evidence for recommendations and review, not automatic authority.";
}

function gammaCatalogPrice(entry: WtfOsAppCatalogEntry): string {
  if (BigInt(entry.priceWtfUnits) <= 0n) return "Included";
  return `${formatWtfOsAppPrice(entry.priceWtfUnits)} WTF`;
}

function buildGammaWakeQueue({
  user,
  isAuthLoading,
  recentEntries,
  peers,
  appAvailability,
  appAvailabilityReady,
}: {
  user: ReturnType<typeof useAuth>["user"];
  isAuthLoading: boolean;
  recentEntries: GammaRecentEntry[];
  peers: GammaPeer[];
  appAvailability: Partial<Record<DesktopAppKey, boolean>>;
  appAvailabilityReady: boolean;
}): GammaWakeQueueItem[] {
  const firstStoredRecent = recentEntries.find((entry) => !entry.fallback) ?? null;
  const appStoreEntries = WTFOS_APP_CATALOG_ENTRIES.filter((entry) => entry.placement === "app-store");
  const unlockedApps = appAvailabilityReady
    ? appStoreEntries.filter((entry) => appAvailability[entry.key]).length
    : null;
  const resumeRoute = user
    ? firstStoredRecent?.route ?? GAMMA_DEFAULT_POST_LOGIN_ROUTE
    : GAMMA_DEFAULT_LOGIN_ROUTE;
  const resumeLabel = isAuthLoading ? "Checking" : user ? "Resume" : "Log in";
  const resumeDetail = user
    ? firstStoredRecent?.label ?? "Dashboard"
    : "Dashboard return";

  return [
    {
      key: user ? "resume" : "login",
      label: resumeLabel,
      route: resumeRoute,
      detail: resumeDetail,
      status: user ? (firstStoredRecent ? "recent" : "desk") : "account",
      icon: user ? Monitor : LogIn,
      primary: true,
    },
    {
      key: "inbox",
      label: "Inbox",
      route: "/messages",
      detail: "Messages",
      status: "check",
      icon: Inbox,
    },
    {
      key: "daily",
      label: "Daily",
      route: "/side-quests",
      detail: "Side quests",
      status: user ? "ready" : "preview",
      icon: Zap,
    },
    {
      key: "people",
      label: "People",
      route: "/w",
      detail: "Active floor",
      status: `${peers.slice(0, 5).length} visible`,
      icon: UsersRound,
    },
    {
      key: "apps",
      label: "Apps",
      route: "/wtfiam?category=apps",
      detail: "Unlock tools",
      status: appAvailabilityReady ? `${unlockedApps ?? 0}/${appStoreEntries.length}` : "checking",
      icon: Store,
    },
  ];
}

function GammaWakeQueue({
  user,
  isAuthLoading,
  recentEntries,
  peers,
  appAvailability,
  appAvailabilityReady,
  onLaunch,
}: {
  user: ReturnType<typeof useAuth>["user"];
  isAuthLoading: boolean;
  recentEntries: GammaRecentEntry[];
  peers: GammaPeer[];
  appAvailability: Partial<Record<DesktopAppKey, boolean>>;
  appAvailabilityReady: boolean;
  onLaunch: (route: string) => void;
}) {
  const wakeState = isAuthLoading ? "checking" : user ? "signed-in" : "guest";
  const queue = buildGammaWakeQueue({
    user,
    isAuthLoading,
    recentEntries,
    peers,
    appAvailability,
    appAvailabilityReady,
  });

  return (
    <WakeQueue data-gamma-wake-queue data-gamma-wake-state={wakeState} aria-label="Gamma wake queue">
      <WakeQueueHeader>
        <Kicker>Wake queue</Kicker>
        <strong>{user ? "Pick up the session in order." : "Enter, then pick up the session."}</strong>
      </WakeQueueHeader>
      <WakeQueueActions>
        {queue.map((item, index) => (
          <WakeQueueAction
            key={item.key}
            type="button"
            onClick={() => onLaunch(item.route)}
            data-gamma-wake-action={item.key}
            data-gamma-wake-rank={index + 1}
            data-gamma-launch={item.route}
            $primary={item.primary}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <item.icon size={16} aria-hidden="true" />
            <b>{item.label}</b>
            <small>{item.detail}</small>
            <em>{item.status}</em>
          </WakeQueueAction>
        ))}
      </WakeQueueActions>
    </WakeQueue>
  );
}

function GammaDailyReturnStrip({
  peers,
  onLaunch,
}: {
  peers: GammaPeer[];
  onLaunch: (route: string) => void;
}) {
  return (
    <DailyReturnStrip data-gamma-daily-return aria-label="Gamma daily return loop">
      <DailyReturnIntro>
        <Kicker>Today</Kicker>
        <strong>Return for a small proof, a visible person, or a live signal.</strong>
        <span>{peers.slice(0, 5).length} people visible from the current EXP pulse.</span>
      </DailyReturnIntro>
      <DailyReturnActions>
        {GAMMA_DAILY_ACTIONS.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => onLaunch(action.route)}
            data-gamma-daily-action={action.key}
            data-gamma-launch={action.route}
          >
            <action.icon size={17} aria-hidden="true" />
            <span>
              <b>{action.label}</b>
              <small>{action.detail}</small>
            </span>
            <em>{action.kind}</em>
          </button>
        ))}
      </DailyReturnActions>
    </DailyReturnStrip>
  );
}

function GammaAccessPassport({
  user,
  appAvailability,
  appAvailabilityReady,
  onLaunch,
}: {
  user: ReturnType<typeof useAuth>["user"];
  appAvailability: Partial<Record<DesktopAppKey, boolean>>;
  appAvailabilityReady: boolean;
  onLaunch: (route: string) => void;
}) {
  const roleInput = user?.roles ?? user?.role ?? null;
  const isCountOperator = roleIsAdmin(roleInput);
  const appStoreEntries = WTFOS_APP_CATALOG_ENTRIES.filter((entry) => entry.placement === "app-store");
  const unlockedApps = appAvailabilityReady
    ? appStoreEntries.filter((entry) => appAvailability[entry.key]).length
    : null;
  const standardUnlocks = appStoreEntries
    .filter((entry) => entry.necessityRank <= 3 && !entry.requiredRoles?.length)
    .slice(0, 3);
  const roleGatedUnlocks = appStoreEntries
    .filter((entry) => entry.requiredRoles?.length || entry.requiredInventorySkus?.length)
    .slice(0, 3);

  return (
    <AccessPassport data-gamma-access-passport aria-label="Gamma access passport">
      <PassportHeader>
        <div>
          <Kicker>Access Passport</Kicker>
          <h2>Unlock WTFOS without guessing.</h2>
        </div>
        <PassportState data-gamma-passport-app-count>
          {appAvailabilityReady
            ? `${unlockedApps ?? 0}/${appStoreEntries.length} app-store tools open`
            : "checking app access"}
        </PassportState>
      </PassportHeader>

      <PassportBody>
        <PassportIdentity data-gamma-passport-identity>
          <PassportMetric data-gamma-passport-role>
            <small>Role</small>
            <strong>{gammaRoleSummary(user)}</strong>
            <span>
              {isCountOperator
                ? "Count operator controls stay explicit."
                : "Roles explain access; EXP does not grant power by itself."}
            </span>
          </PassportMetric>
          <PassportMetric data-gamma-passport-exp>
            <small>Level</small>
            <strong>{gammaExpSummary(user)}</strong>
            <span>{gammaNextXpSummary(user)}</span>
          </PassportMetric>
        </PassportIdentity>

        <PassportActionGrid data-gamma-passport-actions>
          {GAMMA_PASSPORT_ACTIONS.map((action) => (
            <PassportAction
              key={action.key}
              type="button"
              onClick={() => onLaunch(action.route)}
              data-gamma-passport-action={action.key}
              data-gamma-launch={action.route}
            >
              <action.icon size={17} aria-hidden="true" />
              <span>{action.label}</span>
              <small>{action.detail}</small>
              <b>{action.kind}</b>
            </PassportAction>
          ))}
        </PassportActionGrid>
      </PassportBody>

      <PassportUnlocks data-gamma-passport-unlocks>
        <PassportList data-gamma-passport-unlock-list="standard">
          <small>Good next unlocks</small>
          {standardUnlocks.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => onLaunch("/wtfiam?category=apps")}
              data-gamma-passport-app={entry.key}
              data-gamma-launch="/wtfiam?category=apps"
            >
              <span>{entry.label}</span>
              <b>{gammaCatalogPrice(entry)}</b>
            </button>
          ))}
        </PassportList>
        <PassportList data-gamma-passport-unlock-list="gated">
          <small>Role-gated examples</small>
          {roleGatedUnlocks.map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => onLaunch("/wtfiam?category=apps")}
              data-gamma-passport-role-gate={entry.key}
              data-gamma-launch="/wtfiam?category=apps"
            >
              <span>{entry.label}</span>
              <b>{entry.prerequisite ?? "Requires review"}</b>
            </button>
          ))}
        </PassportList>
      </PassportUnlocks>

      {isCountOperator ? (
        <CountAdminLane data-gamma-count-admin-lane>
          <div>
            <Kicker>The Count</Kicker>
            <strong>Manage the game without changing the rules here.</strong>
            <span>
              Use existing admin surfaces for users, roles, sidequests, challenges, rewards,
              market items, app gates, and automation audits.
            </span>
          </div>
          <CountAdminActions>
            {GAMMA_COUNT_ACTIONS.map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={() => onLaunch(action.route)}
                data-gamma-count-action={action.key}
                data-gamma-launch={action.route}
              >
                <action.icon size={16} aria-hidden="true" />
                <span>{action.label}</span>
              </button>
            ))}
          </CountAdminActions>
        </CountAdminLane>
      ) : null}
    </AccessPassport>
  );
}

function GammaBootDesk({
  user,
  isAuthLoading,
  signedLabel,
  appAvailability,
  appAvailabilityReady,
  recentEntries,
  onLaunch,
}: {
  user: ReturnType<typeof useAuth>["user"];
  isAuthLoading: boolean;
  signedLabel: string;
  appAvailability: Partial<Record<DesktopAppKey, boolean>>;
  appAvailabilityReady: boolean;
  recentEntries: GammaRecentEntry[];
  onLaunch: (route: string) => void;
}) {
  const [searchText, setSearchText] = useState("");
  const sessionState = isAuthLoading ? "checking" : user ? "signed-in" : "guest";
  const firstRecent = recentEntries.find((entry) => !entry.fallback) ?? null;
  const continueRoute = user ? firstRecent?.route ?? GAMMA_DEFAULT_POST_LOGIN_ROUTE : GAMMA_DEFAULT_LOGIN_ROUTE;
  const continueLabel = user ? (firstRecent ? "Continue" : "Open desk") : "Log in";
  const identityRoute = user?.username ? `/user/${encodeURIComponent(user.username)}` : GAMMA_DEFAULT_LOGIN_ROUTE;
  const resumeTargetRoute = user ? firstRecent?.route ?? GAMMA_DEFAULT_POST_LOGIN_ROUTE : GAMMA_DEFAULT_POST_LOGIN_ROUTE;
  const accountStatus = isAuthLoading ? "Checking account" : user ? "Signed in" : "Guest session";
  const accountTitle = isAuthLoading ? "Checking" : user ? signedLabel : "Guest";
  const accountDetail = user ? gammaRoleSummary(user) : "Log in to restore Dashboard";
  const accountAriaLabel = user
    ? `Open ${signedLabel} profile in Gamma`
    : "Log in to WTFOS Gamma and return to Dashboard";
  const appStoreEntries = WTFOS_APP_CATALOG_ENTRIES.filter((entry) => entry.placement === "app-store");
  const unlockedApps = appAvailabilityReady
    ? appStoreEntries.filter((entry) => appAvailability[entry.key]).length
    : null;
  const commandEntries = useMemo(
    () => buildGammaCommandEntries(appAvailability, appAvailabilityReady),
    [appAvailability, appAvailabilityReady]
  );
  const sessionChecks = [
    {
      key: "apps",
      label: "App access",
      state: appAvailabilityReady
        ? `${unlockedApps ?? 0}/${appStoreEntries.length}`
        : "Checking",
      detail: "Installed app passes and unlocks.",
      route: "/wtfiam?category=apps",
      icon: Store,
    },
    {
      key: "daily",
      label: "Daily loop",
      state: user ? "Ready" : "Preview",
      detail: "Side quests and challenge progress.",
      route: "/side-quests",
      icon: Zap,
    },
    {
      key: "people",
      label: "People visible",
      state: "Live",
      detail: "Open the public W feed.",
      route: "/w",
      icon: UsersRound,
    },
  ];

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchText.trim();
    if (!query) return;
    const command = getGammaCommandMatches(query, commandEntries)[0];
    if (command) {
      onLaunch(command.route);
      return;
    }
    onLaunch(`/gallery?search=${encodeURIComponent(query)}`);
  };

  return (
    <BootDesk data-gamma-boot-desk data-gamma-session-state={sessionState} aria-label="Gamma start desk">
      <BootSessionPanel data-gamma-session-panel>
        <Kicker>OS ready</Kicker>
        <h2>Start WTFOS</h2>
        <BootAccountTile
          type="button"
          onClick={() => onLaunch(identityRoute)}
          data-gamma-boot-account
          data-gamma-boot-account-state={sessionState}
          data-gamma-boot-resume-target={resumeTargetRoute}
          data-gamma-launch={identityRoute}
          aria-label={accountAriaLabel}
        >
          {user ? <UserRound size={18} aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
          <span>
            <small>{accountStatus}</small>
            <b>{accountTitle}</b>
          </span>
          <strong>{accountDetail}</strong>
        </BootAccountTile>
        <CommandSearchBox data-gamma-command-surface data-gamma-boot-command-search>
          <BootSearchForm onSubmit={submitSearch} data-gamma-boot-search>
            <Search size={17} aria-hidden="true" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={(event) => handleGammaCommandInputKeyDown(event, searchText, setSearchText)}
              placeholder="Search apps, tools, objects"
              aria-label="Search WTFOS apps, tools, and objects from the Gamma start desk"
              data-gamma-command-input="true"
            />
          </BootSearchForm>
          <GammaCommandResults query={searchText} commands={commandEntries} onLaunch={onLaunch} />
        </CommandSearchBox>
        <BootSessionChecklist data-gamma-session-checklist aria-label="Gamma login checklist">
          {sessionChecks.map((check) => (
            <button
              key={check.key}
              type="button"
              onClick={() => onLaunch(check.route)}
              data-gamma-session-check={check.key}
              data-gamma-launch={check.route}
            >
              <check.icon size={16} aria-hidden="true" />
              <span>
                <b>{check.label}</b>
                <small>{check.detail}</small>
              </span>
              <strong>{check.state}</strong>
            </button>
          ))}
        </BootSessionChecklist>
      </BootSessionPanel>

      <BootStartMenu data-gamma-start-menu aria-label="Gamma start menu">
        <BootAction
          type="button"
          onClick={() => onLaunch(continueRoute)}
          autoFocus
          data-gamma-primary-boot-action={continueRoute}
          data-gamma-start-action="continue"
          data-gamma-launch={continueRoute}
          $primary
        >
          {user ? <Monitor size={18} aria-hidden="true" /> : <LogIn size={18} aria-hidden="true" />}
          <span>{continueLabel}</span>
          <small>{user ? firstRecent?.label ?? "session" : "desk"}</small>
        </BootAction>
        <BootAction
          type="button"
          onClick={() => onLaunch("/gallery")}
          data-gamma-start-action="gallery"
          data-gamma-launch="/gallery"
        >
          <Image size={18} aria-hidden="true" />
          <span>Gallery</span>
          <small>public</small>
        </BootAction>
        {START_STATIONS.slice(1).map((station) => (
          <BootAction
            key={station.key}
            type="button"
            onClick={() => onLaunch(station.route)}
            data-gamma-start-action={station.key}
            data-gamma-launch={station.route}
          >
            <station.icon size={18} aria-hidden="true" />
            <span>{station.label}</span>
            <small>{station.kind}</small>
          </BootAction>
        ))}
      </BootStartMenu>
    </BootDesk>
  );
}

function GammaSessionConsole({
  user,
  isAuthLoading,
  signedLabel,
  peers,
  appAvailability,
  appAvailabilityReady,
  recentEntries,
  onLaunch,
}: {
  user: ReturnType<typeof useAuth>["user"];
  isAuthLoading: boolean;
  signedLabel: string;
  peers: GammaPeer[];
  appAvailability: Partial<Record<DesktopAppKey, boolean>>;
  appAvailabilityReady: boolean;
  recentEntries: GammaRecentEntry[];
  onLaunch: (route: string) => void;
}) {
  const sessionState = isAuthLoading ? "checking" : user ? "signed-in" : "guest";
  const profileRoute = user?.username ? `/user/${encodeURIComponent(user.username)}` : GAMMA_DEFAULT_LOGIN_ROUTE;
  const appStoreEntries = WTFOS_APP_CATALOG_ENTRIES.filter((entry) => entry.placement === "app-store");
  const unlockedApps = appAvailabilityReady
    ? appStoreEntries.filter((entry) => appAvailability[entry.key]).length
    : null;
  const shortcuts = [
    {
      key: "home",
      label: user ? "Home" : "Enter",
      route: user ? GAMMA_DEFAULT_POST_LOGIN_ROUTE : GAMMA_DEFAULT_LOGIN_ROUTE,
      detail: user ? "Desk" : "Account",
      icon: user ? Monitor : LogIn,
      primary: true,
    },
    {
      key: "inbox",
      label: "Inbox",
      route: "/messages",
      detail: "Messages",
      icon: Inbox,
      primary: false,
    },
    {
      key: "apps",
      label: "Apps",
      route: "/wtfiam?category=apps",
      detail: appAvailabilityReady ? `${unlockedApps ?? 0} open` : "Checking",
      icon: Store,
      primary: false,
    },
    {
      key: "settings",
      label: "Settings",
      route: "/settings",
      detail: "System",
      icon: Settings,
      primary: false,
    },
  ];
  const recents = recentEntries;
  const hasStoredRecents = recents.some((recent) => !recent.fallback);
  const firstStoredRecent = recents.find((recent) => !recent.fallback) ?? null;
  const sessionDockKeyboardRoute = firstStoredRecent?.route ?? null;
  const workspaceTargetRoute = user
    ? firstStoredRecent?.route ?? GAMMA_DEFAULT_POST_LOGIN_ROUTE
    : GAMMA_DEFAULT_POST_LOGIN_ROUTE;
  const workspaceLaunchRoute = user ? workspaceTargetRoute : GAMMA_DEFAULT_LOGIN_ROUTE;
  const workspaceLabel = user ? firstStoredRecent?.label ?? "Dashboard" : "Dashboard";
  const mountState = isAuthLoading ? "checking" : user ? "mounted" : "locked";
  const mountRows = [
    {
      key: "account",
      label: "Account",
      value: user ? signedLabel : "Guest",
      detail: user ? gammaRoleSummary(user) : "Login required",
      route: profileRoute,
      icon: user ? UserRound : LogIn,
    },
    {
      key: "workspace",
      label: "Workspace",
      value: workspaceLabel,
      detail: user ? (firstStoredRecent ? "Restored route" : "Default desk") : "Login return",
      route: workspaceLaunchRoute,
      icon: Monitor,
    },
    {
      key: "apps",
      label: "App passes",
      value: appAvailabilityReady ? `${unlockedApps ?? 0}/${appStoreEntries.length}` : "Checking",
      detail: appAvailabilityReady ? "Unlock state" : "Reading access",
      route: "/wtfiam?category=apps",
      icon: Store,
    },
    {
      key: "shell",
      label: "Shell",
      value: "Gamma",
      detail: "Active skin",
      route: "/",
      icon: RadioTower,
    },
  ];

  useEffect(() => {
    if (!sessionDockKeyboardRoute) return;
    const handleGammaSessionDockShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isGammaEditableShortcutTarget(event.target)) return;
      const ctrlTab = event.key === "Tab" && (event.ctrlKey || event.metaKey) && !event.altKey;
      const altPageDown =
        event.key === "PageDown" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
      if (!ctrlTab && !altPageDown) return;
      event.preventDefault();
      event.stopPropagation();
      onLaunch(sessionDockKeyboardRoute);
    };
    window.addEventListener("keydown", handleGammaSessionDockShortcut);
    return () => window.removeEventListener("keydown", handleGammaSessionDockShortcut);
  }, [sessionDockKeyboardRoute, onLaunch]);

  return (
    <SessionConsole
      data-gamma-session-console
      data-gamma-session-console-state={sessionState}
      aria-label="Gamma session console"
    >
      <SessionConsoleIdentity data-gamma-session-console-identity>
        <Kicker>{user ? "Signed in" : "Preview session"}</Kicker>
        <strong>{isAuthLoading ? "Checking account" : signedLabel}</strong>
        <span>{gammaRoleSummary(user)}</span>
        <button type="button" onClick={() => onLaunch(profileRoute)} data-gamma-launch={profileRoute}>
          <UserRound size={16} aria-hidden="true" />
          <span>{user ? "Profile" : "Log in"}</span>
        </button>
      </SessionConsoleIdentity>

      <SessionShortcutGrid data-gamma-session-shortcuts>
        {shortcuts.map((shortcut) => (
          <SessionShortcut
            key={shortcut.key}
            type="button"
            onClick={() => onLaunch(shortcut.route)}
            data-gamma-session-shortcut={shortcut.key}
            data-gamma-launch={shortcut.route}
            $primary={shortcut.primary}
          >
            <shortcut.icon size={18} aria-hidden="true" />
            <span>{shortcut.label}</span>
            <small>{shortcut.detail}</small>
          </SessionShortcut>
        ))}
      </SessionShortcutGrid>

      <SessionMountTable
        data-gamma-session-mount
        data-gamma-session-mount-state={mountState}
        data-gamma-session-mount-workspace={workspaceTargetRoute}
        aria-label="Gamma mounted workspace"
      >
        <span>{user ? "Workspace mounted" : "Workspace locked"}</span>
        {mountRows.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => onLaunch(row.route)}
            data-gamma-session-mount-row={row.key}
            data-gamma-launch={row.route}
          >
            <row.icon size={15} aria-hidden="true" />
            <span>
              <b>{row.label}</b>
              <small>{row.detail}</small>
            </span>
            <strong>{row.value}</strong>
          </button>
        ))}
      </SessionMountTable>

      <SessionResumeList
        data-gamma-session-resume
        data-gamma-session-dock
        data-gamma-session-recents-state={hasStoredRecents ? "stored" : "fallback"}
        data-gamma-session-dock-state={hasStoredRecents ? "open" : "pinned"}
        data-gamma-session-dock-keyboard-target={sessionDockKeyboardRoute ?? undefined}
        aria-label={hasStoredRecents ? "Open Gamma apps" : "Pinned Gamma starts"}
      >
        <span>{hasStoredRecents ? "Open apps" : "Pinned starts"}</span>
        {recents.map((recent, index) => (
          <button
            key={recent.key}
            type="button"
            onClick={() => onLaunch(recent.route)}
            data-gamma-session-resume-action={recent.key}
            data-gamma-session-dock-route={recent.route}
            data-gamma-session-dock-front={hasStoredRecents && index === 0 ? "true" : "false"}
            data-gamma-session-recent-route={recent.route}
            data-gamma-session-recent-fallback={recent.fallback ? "true" : "false"}
            data-gamma-launch={recent.route}
          >
            <recent.icon size={15} aria-hidden="true" />
            <b>{recent.label}</b>
            <small>{recent.detail}</small>
          </button>
        ))}
      </SessionResumeList>
    </SessionConsole>
  );
}

function GammaSystemTray({
  user,
  isAuthLoading,
  isSigningOut,
  signedLabel,
  clock,
  peers,
  appAvailability,
  appAvailabilityReady,
  systemState,
  notificationState,
  notificationUnreadCount,
  onLaunch,
  onLogout,
}: {
  user: ReturnType<typeof useAuth>["user"];
  isAuthLoading: boolean;
  isSigningOut: boolean;
  signedLabel: string;
  clock: GammaClockSnapshot;
  peers: GammaPeer[];
  appAvailability: Partial<Record<DesktopAppKey, boolean>>;
  appAvailabilityReady: boolean;
  systemState: GammaSystemState;
  notificationState: GammaNotificationState;
  notificationUnreadCount: number;
  onLaunch: (route: string) => void;
  onLogout: () => void;
}) {
  const identityRoute = user?.username ? `/user/${encodeURIComponent(user.username)}` : GAMMA_DEFAULT_LOGIN_ROUTE;
  const appStoreEntries = WTFOS_APP_CATALOG_ENTRIES.filter((entry) => entry.placement === "app-store");
  const unlockedApps = appAvailabilityReady
    ? appStoreEntries.filter((entry) => appAvailability[entry.key]).length
    : null;
  const statusLabel =
    systemState === "degraded"
      ? "Gamma session degraded"
      : systemState === "checking"
        ? "Gamma session checking"
        : user
          ? "Gamma session online"
          : "Gamma preview online";
  const networkLabel =
    systemState === "degraded" ? "Degraded" : systemState === "checking" ? "Checking" : "Online";
  const networkDetail =
    systemState === "degraded" ? "Settings" : systemState === "checking" ? "Syncing" : "Shared APIs";
  const notificationDetail =
    notificationState === "guest"
      ? "Login"
      : notificationState === "checking"
        ? "Checking"
        : notificationState === "degraded"
          ? "Check"
          : notificationUnreadCount > 0
            ? `${notificationUnreadCount} unread`
            : "Clear";
  const trayActions: GammaTrayAction[] = [
    {
      key: "session",
      label: isAuthLoading ? "Checking" : user ? signedLabel : "Guest",
      detail: user ? gammaRoleSummary(user) : "Open desk",
      route: identityRoute,
      icon: user ? UserRound : LogIn,
      live: Boolean(user),
    },
    {
      key: "clock",
      label: clock.timeLabel,
      detail: clock.dateLabel,
      route: GAMMA_CLOCK_ROUTE,
      icon: CalendarDays,
      live: false,
      clock: true,
    },
    {
      key: "network",
      label: networkLabel,
      detail: networkDetail,
      route: "/settings",
      icon: RadioTower,
      live: systemState === "online",
    },
    {
      key: "signals",
      label: "Signals",
      detail: notificationDetail,
      route: "/notifications",
      icon: Bell,
      live: notificationState === "unread",
      state: notificationState,
      unreadCount: notificationUnreadCount,
    },
    {
      key: "daily",
      label: "Daily",
      detail: user ? "Ready" : "Preview",
      route: "/side-quests",
      icon: Zap,
      live: Boolean(user),
    },
    {
      key: "apps",
      label: "Apps",
      detail: appAvailabilityReady ? `${unlockedApps ?? 0}/${appStoreEntries.length}` : "Checking",
      route: "/wtfiam?category=apps",
      icon: Store,
      live: Boolean(unlockedApps),
    },
    {
      key: "people",
      label: "People",
      detail: `${peers.slice(0, 5).length} visible`,
      route: "/w",
      icon: UsersRound,
      live: peers.length > 0,
    },
  ];
  const powerActions = [
    {
      key: "desk",
      label: "Desk",
      detail: "Home",
      route: "/",
      icon: Monitor,
    },
    {
      key: "settings",
      label: "Settings",
      detail: "System",
      route: "/settings",
      icon: Settings,
    },
    ...(user
      ? [
          {
            key: "lock",
            label: "Lock",
            detail: "Keep session",
            route: "/",
            icon: LockKeyhole,
          },
        ]
      : []),
  ];

  return (
    <SystemTray data-gamma-system-tray data-gamma-system-state={systemState} aria-label="Gamma system tray">
      <SystemTrayStatus data-gamma-tray-status={systemState}>
        <SignalDot aria-hidden="true" />
        <span>{statusLabel}</span>
      </SystemTrayStatus>
      <SystemTrayActions>
        {trayActions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => onLaunch(action.route)}
            data-gamma-tray-action={action.key}
            data-gamma-launch={action.route}
            data-gamma-live={action.live ? "true" : "false"}
            data-gamma-tray-action-state={action.state ?? undefined}
            data-gamma-system-clock={action.clock ? "tray" : undefined}
            data-gamma-clock-iso={action.clock ? clock.iso : undefined}
            data-gamma-clock-time={action.clock ? clock.timeLabel : undefined}
            data-gamma-clock-date={action.clock ? clock.dateLabel : undefined}
            data-gamma-tray-unread-count={
              typeof action.unreadCount === "number" ? String(action.unreadCount) : undefined
            }
          >
            <action.icon size={15} aria-hidden="true" />
            <span>{action.label}</span>
            <small>{action.detail}</small>
          </button>
        ))}
      </SystemTrayActions>
      <SystemTrayPower
        data-gamma-power-menu
        data-gamma-power-state={user ? "signed-in" : "guest"}
        aria-label="Gamma session controls"
      >
        <span>
          <Power size={14} aria-hidden="true" />
          Session
        </span>
        {powerActions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => onLaunch(action.route)}
            data-gamma-power-action={action.key}
            data-gamma-launch={action.route}
            data-gamma-power-session={action.key === "lock" ? "retained" : undefined}
          >
            <action.icon size={15} aria-hidden="true" />
            <b>{action.label}</b>
            <small>{action.detail}</small>
          </button>
        ))}
        <button
          type="button"
          onClick={user ? onLogout : () => onLaunch(GAMMA_DEFAULT_LOGIN_ROUTE)}
          data-gamma-power-action={user ? "signout" : "login"}
          data-gamma-launch={user ? "/" : GAMMA_DEFAULT_LOGIN_ROUTE}
          data-gamma-power-pending={isSigningOut ? "true" : "false"}
          disabled={isSigningOut}
        >
          {user ? <LogOut size={15} aria-hidden="true" /> : <LogIn size={15} aria-hidden="true" />}
          <b>{isSigningOut ? "Signing out" : user ? "Sign out" : "Log in"}</b>
          <small>{user ? "Desk" : "Account"}</small>
        </button>
      </SystemTrayPower>
    </SystemTray>
  );
}

function GammaRouteWorkspace({
  routeLocation,
  peers,
  onLaunch,
  historyBackRoute,
  historyForwardRoute,
  onHistoryBack,
  onHistoryForward,
  signedLabel,
  user,
  isAuthLoading,
  appAvailability,
  appAvailabilityReady,
  recentEntries,
}: {
  routeLocation: string;
  peers: GammaPeer[];
  onLaunch: (route: string) => void;
  historyBackRoute: string | null;
  historyForwardRoute: string | null;
  onHistoryBack: () => void;
  onHistoryForward: () => void;
  signedLabel: string;
  user: ReturnType<typeof useAuth>["user"];
  isAuthLoading: boolean;
  appAvailability: Partial<Record<DesktopAppKey, boolean>>;
  appAvailabilityReady: boolean;
  recentEntries: GammaRecentEntry[];
}) {
  const [searchText, setSearchText] = useState("");
  const routeMatch = matchPage(routeLocation);
  const title = titleFromRoute(routeLocation);
  const summary = routeSummary(routeLocation);
  const roleInput = user?.roles ?? user?.role ?? null;
  const accessSurfaceIds = user?.wtfOsAccess?.surfaceIds ?? [];
  const preliminaryAccess = routeMatch
    ? getPageAccessState(routeMatch.def, roleInput, accessSurfaceIds)
    : null;
  const accessState = routeMatch
    ? getPageAccessState(routeMatch.def, roleInput, accessSurfaceIds, appAvailability)
    : null;
  const Comp = routeMatch?.def.component as ComponentType<any> | undefined;
  const routePathname = cleanPathname(routeLocation);
  const desktopRoute = interfaceHref("classic", routeLocation);
  const AuthComp =
    routePathname === "/login" ? Login : routePathname === "/register" ? Register : null;
  const commandEntries = useMemo(
    () => buildGammaCommandEntries(appAvailability, appAvailabilityReady),
    [appAvailability, appAvailabilityReady]
  );

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchText.trim();
    if (!query) return;
    const command = getGammaCommandMatches(query, commandEntries)[0];
    if (command) {
      onLaunch(command.route);
      return;
    }
    onLaunch(`/gallery?search=${encodeURIComponent(query)}`);
  };
  const taskbarActions = [
    { key: "close", label: "Close app", route: "/", detail: "Desk", icon: X },
    {
      key: "desk",
      label: user ? "Desk" : "Enter",
      route: user ? GAMMA_DEFAULT_POST_LOGIN_ROUTE : GAMMA_DEFAULT_LOGIN_ROUTE,
      detail: user ? "Home" : "Login",
      icon: user ? Monitor : LogIn,
    },
    { key: "inbox", label: "Inbox", route: "/messages", detail: "Messages", icon: Inbox },
    { key: "daily", label: "Daily", route: "/side-quests", detail: "Proof", icon: Zap },
    { key: "apps", label: "Apps", route: "/wtfiam?category=apps", detail: "Unlocks", icon: Store },
    { key: "settings", label: "Settings", route: "/settings", detail: "System", icon: Settings },
  ];
  const storedSwitchEntries = recentEntries
    .filter((entry) => !entry.fallback && cleanPathname(entry.route) !== routePathname)
    .slice(0, 3);
  const taskbarSwitchEntries = (
    storedSwitchEntries.length
      ? storedSwitchEntries
      : GAMMA_FALLBACK_RECENTS.filter((entry) => cleanPathname(entry.route) !== routePathname).slice(0, 3)
  ).slice(0, 3);
  const hasStoredSwitchEntries = storedSwitchEntries.length > 0;
  const keyboardSwitchRoute = taskbarSwitchEntries[0]?.route ?? null;
  const shouldFocusRouteFrame = Boolean(!AuthComp && routeMatch && Comp && accessState?.allowed);

  useEffect(() => {
    if (!shouldFocusRouteFrame) return;
    const frameId = window.requestAnimationFrame(() => {
      focusGammaRouteFrame();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [routeLocation, shouldFocusRouteFrame]);
  useEffect(() => {
    if (!keyboardSwitchRoute) return;
    const handleGammaAppSwitchShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (isGammaEditableShortcutTarget(event.target)) return;
      const ctrlTab = event.key === "Tab" && (event.ctrlKey || event.metaKey) && !event.altKey;
      const altPageDown =
        event.key === "PageDown" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
      if (!ctrlTab && !altPageDown) return;
      event.preventDefault();
      event.stopPropagation();
      onLaunch(keyboardSwitchRoute);
    };
    window.addEventListener("keydown", handleGammaAppSwitchShortcut);
    return () => window.removeEventListener("keydown", handleGammaAppSwitchShortcut);
  }, [keyboardSwitchRoute, onLaunch]);

  let routeContent: ReactNode;
  if (AuthComp) {
    routeContent = (
      <WindowManagerProvider navigate={onLaunch} currentLocation={routeLocation}>
        <WindowPathContext.Provider value={routeLocation}>
          <GammaApplicationContent data-gamma-application-content data-gamma-auth-content>
            <AuthComp />
          </GammaApplicationContent>
        </WindowPathContext.Provider>
      </WindowManagerProvider>
    );
  } else if (!routeMatch || !Comp) {
    routeContent = (
      <GammaNotice data-gamma-route-missing>
        <b>{routePathname}</b>
        <span>No registered WTFOS route matches this path.</span>
        <GammaNoticeActions>
          <button type="button" onClick={() => onLaunch("/gallery")} data-gamma-launch="/gallery">
            Gallery
          </button>
          <button type="button" onClick={() => onLaunch("/")} data-gamma-launch="/">
            Gamma home
          </button>
        </GammaNoticeActions>
      </GammaNotice>
    );
  } else if (isAuthLoading && routeMatch.def.auth) {
    routeContent = <GammaLoadingBlock label={title} />;
  } else if (!appAvailabilityReady && preliminaryAccess?.appKey) {
    routeContent = <GammaLoadingBlock label={title} />;
  } else if (accessState && !accessState.allowed) {
    routeContent = (
      <GammaRouteGate
        title={title}
        reason={accessState.reason}
        appKey={accessState.appKey}
        appLabel={accessState.appLabel}
        returnRoute={routeLocation}
        onLaunch={onLaunch}
      />
    );
  } else {
    routeContent = (
      <WindowManagerProvider navigate={onLaunch} currentLocation={routeLocation}>
        <WindowPathContext.Provider value={routeLocation}>
          <ErrorBoundary
            resetKey={routeLocation}
            fallback={(error) => (
              <GammaNotice role="alert" data-gamma-route-error>
                <b>{title} crashed</b>
                <span>{error?.message || "Render error"}</span>
              </GammaNotice>
            )}
          >
            <Suspense fallback={<GammaLoadingBlock label={title} />}>
              <GammaApplicationContent data-gamma-application-content>
                <Comp {...routeMatch.props} />
              </GammaApplicationContent>
            </Suspense>
          </ErrorBoundary>
        </WindowPathContext.Provider>
      </WindowManagerProvider>
    );
  }

  return (
    <GammaWorkspace data-gamma-workspace data-gamma-route={routePathname}>
      <GammaWorkspaceChrome>
        <GammaRouteNavBar>
          <GammaBreadcrumbs aria-label="Gamma breadcrumbs" data-gamma-breadcrumbs>
            <button type="button" onClick={() => onLaunch("/")} data-gamma-launch="/">
              Gamma
            </button>
            <ChevronRight size={14} aria-hidden="true" />
            <span>{title}</span>
          </GammaBreadcrumbs>
          <GammaHistoryControls
            data-gamma-history-controls
            data-gamma-history-back-target={historyBackRoute ?? undefined}
            data-gamma-history-forward-target={historyForwardRoute ?? undefined}
            aria-label="Gamma route history"
          >
            <button
              type="button"
              onClick={onHistoryBack}
              disabled={!historyBackRoute}
              data-gamma-history-action="back"
              data-gamma-history-target={historyBackRoute ?? undefined}
              aria-label={historyBackRoute ? `Back to ${titleFromRoute(historyBackRoute)}` : "No previous Gamma route"}
            >
              <ArrowLeft size={15} aria-hidden="true" />
              <span>Back</span>
            </button>
            <button
              type="button"
              onClick={onHistoryForward}
              disabled={!historyForwardRoute}
              data-gamma-history-action="forward"
              data-gamma-history-target={historyForwardRoute ?? undefined}
              aria-label={historyForwardRoute ? `Forward to ${titleFromRoute(historyForwardRoute)}` : "No next Gamma route"}
            >
              <ArrowRight size={15} aria-hidden="true" />
              <span>Forward</span>
            </button>
            <button
              type="button"
              onClick={() => onLaunch("/")}
              data-gamma-history-action="desk"
              data-gamma-history-target="/"
              data-gamma-launch="/"
              aria-label="Return to Gamma desk"
            >
              <Monitor size={15} aria-hidden="true" />
              <span>Desk</span>
            </button>
          </GammaHistoryControls>
        </GammaRouteNavBar>
        <GammaRouteHeader>
          <div>
            <Kicker>{routeMatch?.def.group ?? "wtfos route"}</Kicker>
            <h1>{title}</h1>
            <p>{summary}</p>
          </div>
          <GammaUxSwitch data-gamma-ux-switcher aria-label="Switch WTFOS interface">
            <a href={interfaceHref("classic", routeLocation)} data-gamma-interface-switch="true">Classic</a>
            <a href={interfaceHref("beta", routeLocation)} data-gamma-interface-switch="true">Beta</a>
            <a
              href={interfaceHref("gamma", routeLocation)}
              data-gamma-interface-switch="true"
              aria-current="page"
            >
              Gamma
            </a>
          </GammaUxSwitch>
        </GammaRouteHeader>
        <GammaToolRow>
          <CommandSearchBox data-gamma-command-surface data-gamma-route-command-search>
            <GammaSearchForm onSubmit={submitSearch} data-gamma-search>
              <Search size={17} aria-hidden="true" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={(event) => handleGammaCommandInputKeyDown(event, searchText, setSearchText)}
                placeholder="Search apps, tools, routes"
                aria-label="Search WTFOS apps, tools, and routes from Gamma"
                data-gamma-command-input="true"
              />
            </GammaSearchForm>
            <GammaCommandResults query={searchText} commands={commandEntries} onLaunch={onLaunch} />
          </CommandSearchBox>
          <GammaToolButton
            type="button"
            onClick={() => onLaunch(user?.username ? `/user/${encodeURIComponent(user.username)}` : GAMMA_DEFAULT_LOGIN_ROUTE)}
            data-gamma-launch={user?.username ? `/user/${encodeURIComponent(user.username)}` : GAMMA_DEFAULT_LOGIN_ROUTE}
          >
            <UserRound size={17} aria-hidden="true" />
            {signedLabel}
          </GammaToolButton>
          <GammaToolButton type="button" onClick={() => onLaunch("/wtfiam?category=apps")} data-gamma-launch="/wtfiam?category=apps">
            <Store size={17} aria-hidden="true" />
            Apps
          </GammaToolButton>
          <GammaToolButton type="button" onClick={() => onLaunch("/notifications")} data-gamma-launch="/notifications">
            <Bell size={17} aria-hidden="true" />
            Signals
          </GammaToolButton>
          <GammaToolButton type="button" onClick={() => onLaunch("/settings")} data-gamma-launch="/settings">
            <Settings size={17} aria-hidden="true" />
            Settings
          </GammaToolButton>
        </GammaToolRow>
        <GammaAppTaskbar data-gamma-app-taskbar aria-label="Gamma app taskbar">
          <GammaTaskbarCurrent
            data-gamma-taskbar-current-app
            data-gamma-route-focus-target={shouldFocusRouteFrame ? "active-app" : undefined}
            tabIndex={shouldFocusRouteFrame ? -1 : undefined}
            role={shouldFocusRouteFrame ? "group" : undefined}
            aria-label={shouldFocusRouteFrame ? `Active Gamma app: ${title} at ${routePathname}` : undefined}
          >
            <span>Active app</span>
            <strong>{title}</strong>
            <small>{routePathname}</small>
          </GammaTaskbarCurrent>
          <GammaTaskbarActions>
            {taskbarActions.map((action) => {
              const active = cleanPathname(action.route) === routePathname;
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={() => onLaunch(action.route)}
                  data-gamma-taskbar-action={action.key}
                  data-gamma-launch={action.route}
                  aria-current={active ? "page" : undefined}
                >
                  <action.icon size={16} aria-hidden="true" />
                  <span>{action.label}</span>
                  <small>{action.detail}</small>
                </button>
              );
            })}
          </GammaTaskbarActions>
          <GammaTaskbarSwitcher
            data-gamma-taskbar-switcher
            data-gamma-taskbar-switcher-state={hasStoredSwitchEntries ? "stored" : "fallback"}
            data-gamma-taskbar-keyboard-switch={keyboardSwitchRoute ?? undefined}
            aria-label="Switch recent Gamma apps"
          >
            <span>{hasStoredSwitchEntries ? "Switch" : "Quick switch"}</span>
            {taskbarSwitchEntries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => onLaunch(entry.route)}
                data-gamma-taskbar-switch-route={entry.route}
                data-gamma-taskbar-switch-fallback={entry.fallback ? "true" : "false"}
                data-gamma-launch={entry.route}
              >
                <entry.icon size={15} aria-hidden="true" />
                <b>{entry.label}</b>
                <small>{entry.detail}</small>
              </button>
            ))}
          </GammaTaskbarSwitcher>
        </GammaAppTaskbar>
      </GammaWorkspaceChrome>

      <GammaWorkspaceGrid>
        <GammaSideRail data-gamma-side-rail>
          {GAMMA_NAV_GROUPS.map((group) => (
            <GammaNavCluster key={group.label}>
              <span>{group.label}</span>
              {group.stations.map((station) => {
                const active = cleanPathname(station.route) === routePathname;
                return (
                  <button
                    key={station.key}
                    type="button"
                    onClick={() => onLaunch(station.route)}
                    data-gamma-launch={station.route}
                    aria-current={active ? "page" : undefined}
                  >
                    <station.icon size={15} aria-hidden="true" />
                    <b>{station.label}</b>
                    <small>{station.kind}</small>
                  </button>
                );
              })}
            </GammaNavCluster>
          ))}
        </GammaSideRail>

        <GammaMainRegion>
          <GammaRouteMeta data-gamma-route-meta>
            <span>{routePathname}</span>
            <a href={desktopRoute} data-gamma-interface-switch="true">Open Classic route</a>
          </GammaRouteMeta>
          {routeContent}
        </GammaMainRegion>

        <GammaActivityRail data-gamma-activity-rail>
          <LaneHeader>
            <span>Active people</span>
            <small>EXP pulse</small>
          </LaneHeader>
          <PeerStack>
            {peers.slice(0, 5).map((peer) => (
              <PeerLine key={`workspace-${peer.id}`}>
                <button type="button" onClick={() => onLaunch(peer.route)} data-gamma-launch={peer.route}>
                  {peer.name}
                </button>
                <span>{peer.xp}</span>
              </PeerLine>
            ))}
          </PeerStack>
        </GammaActivityRail>
      </GammaWorkspaceGrid>
    </GammaWorkspace>
  );
}

export function GammaWtfos() {
  const [location, navigate] = useLocation();
  const { user, isLoading, logout } = useAuth();
  const routeLocation = gammaRouteFromLocation(location);
  const routePathname = cleanPathname(routeLocation);
  const gammaClock = useGammaClockSnapshot();
  const [isGammaSigningOut, setIsGammaSigningOut] = useState(false);
  const [recentRoutes, setRecentRoutes] = useState<string[]>(readGammaRecentRoutes);
  const [gammaHistory, setGammaHistory] = useState<GammaNavigationHistory>(() =>
    createGammaHistoryState(routeLocation)
  );
  useEffect(() => {
    rememberPresentationHost("gamma");
  }, []);
  useEffect(() => {
    const handleGammaCommandShortcut = (event: KeyboardEvent) => {
      if (event.altKey || event.shiftKey) return;
      if (!event.metaKey && !event.ctrlKey) return;
      if (event.key.toLowerCase() !== "k") return;
      if (!focusGammaCommandInput()) return;
      event.preventDefault();
    };
    window.addEventListener("keydown", handleGammaCommandShortcut);
    return () => window.removeEventListener("keydown", handleGammaCommandShortcut);
  }, []);
  useEffect(() => {
    const handleGammaDeskShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (event.key !== "Home") return;
      if (isGammaEditableShortcutTarget(event.target)) return;
      if (routePathname === "/" || routePathname === "/gamma") return;
      event.preventDefault();
      navigate(gammaNavigationTarget("/", location));
    };
    window.addEventListener("keydown", handleGammaDeskShortcut);
    return () => window.removeEventListener("keydown", handleGammaDeskShortcut);
  }, [location, navigate, routePathname]);
  const xpQuery = useQuery({
    queryKey: ["gamma-wtfos", "xp-peers"],
    queryFn: () => api.get<GammaXpPeer[]>("/api/leaderboard/rewards/exp?limit=8"),
    staleTime: 45_000,
    retry: false,
  });
  const desktopAppsQuery = useQuery({
    queryKey: ["desktop", "apps"],
    queryFn: () =>
      api.get<{ apps: Record<DesktopAppKey, boolean> }>("/api/apps/desktop"),
    staleTime: 30_000,
  });
  const notificationsQuery = useQuery({
    queryKey: ["gamma-wtfos", "notifications"],
    queryFn: () => api.get<GammaNotificationSummary>("/api/notifications?limit=6"),
    enabled: Boolean(user),
    staleTime: 30_000,
    retry: false,
  });
  const peers = useMemo(() => mapPeers(xpQuery.data), [xpQuery.data]);
  const isHomeRoute = routePathname === "/" || routePathname === "/gamma";
  const handleLaunch = (route: string) => navigate(gammaNavigationTarget(route, location));
  const gammaHistoryBackRoute = gammaHistoryRouteAt(gammaHistory, -1);
  const gammaHistoryForwardRoute = gammaHistoryRouteAt(gammaHistory, 1);
  const navigateGammaHistoryRoute = (route: string | null, offset: -1 | 1) => {
    if (!route) return;
    setGammaHistory((currentHistory) => {
      const targetIndex = currentHistory.index + offset;
      if (currentHistory.routes[targetIndex] !== route) return currentHistory;
      return { ...currentHistory, index: targetIndex };
    });
    navigate(gammaNavigationTarget(route, location));
  };
  const handleGammaHistoryBack = () => navigateGammaHistoryRoute(gammaHistoryBackRoute, -1);
  const handleGammaHistoryForward = () => navigateGammaHistoryRoute(gammaHistoryForwardRoute, 1);
  const handleGammaLogout = async () => {
    if (!user || isGammaSigningOut) {
      handleLaunch(GAMMA_DEFAULT_LOGIN_ROUTE);
      return;
    }
    setIsGammaSigningOut(true);
    try {
      await logout();
      navigate(gammaNavigationTarget("/", location));
    } finally {
      setIsGammaSigningOut(false);
    }
  };
  const handleGammaLock = () => {
    navigate(gammaNavigationTarget("/", location));
  };
  const handleShellClick = (event: MouseEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const anchor = target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    const route = routeFromInterceptableLink(anchor);
    if (!route) return;
    event.preventDefault();
    event.stopPropagation();
    handleLaunch(route);
  };
  const signedLabel = user?.username ? `@${user.username}` : "guest signal";
  const identityRoute = user?.username ? `/user/${encodeURIComponent(user.username)}` : GAMMA_DEFAULT_LOGIN_ROUTE;
  const appAvailability = desktopAppsQuery.data?.apps ?? {};
  const appAvailabilityReady = Boolean(desktopAppsQuery.data?.apps);
  const notificationUnreadCount =
    typeof notificationsQuery.data?.unreadCount === "number"
      ? Math.max(0, notificationsQuery.data.unreadCount)
      : 0;
  const notificationState: GammaNotificationState = !user
    ? "guest"
    : notificationsQuery.isError
      ? "degraded"
      : notificationsQuery.isLoading
        ? "checking"
        : notificationUnreadCount > 0
          ? "unread"
          : "clear";
  const gammaSystemState: GammaSystemState =
    xpQuery.isError || desktopAppsQuery.isError
      ? "degraded"
      : isLoading || xpQuery.isLoading || desktopAppsQuery.isLoading
        ? "checking"
        : "online";
  const recentEntries = useMemo(() => buildGammaRecentEntries(recentRoutes), [recentRoutes]);
  const gammaPrimaryBootRoute = isLoading
    ? null
    : user
      ? recentEntries.find((entry) => !entry.fallback)?.route ?? GAMMA_DEFAULT_POST_LOGIN_ROUTE
      : GAMMA_DEFAULT_LOGIN_ROUTE;

  useEffect(() => {
    const handleGammaHomeEnterShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key !== "Enter") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (routePathname !== "/" && routePathname !== "/gamma") return;
      if (!gammaPrimaryBootRoute) return;
      if (isGammaInteractiveShortcutTarget(event.target)) return;
      event.preventDefault();
      navigate(gammaNavigationTarget(gammaPrimaryBootRoute, location));
    };
    window.addEventListener("keydown", handleGammaHomeEnterShortcut);
    return () => window.removeEventListener("keydown", handleGammaHomeEnterShortcut);
  }, [gammaPrimaryBootRoute, location, navigate, routePathname]);

  useEffect(() => {
    const handleGammaHistoryShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
      if (isGammaEditableShortcutTarget(event.target)) return;
      const direction = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : null;
      if (!direction) return;
      const targetRoute = direction === -1 ? gammaHistoryBackRoute : gammaHistoryForwardRoute;
      if (!targetRoute) return;
      event.preventDefault();
      event.stopPropagation();
      navigateGammaHistoryRoute(targetRoute, direction);
    };
    window.addEventListener("keydown", handleGammaHistoryShortcut);
    return () => window.removeEventListener("keydown", handleGammaHistoryShortcut);
  }, [gammaHistoryBackRoute, gammaHistoryForwardRoute, location, navigate]);

  useEffect(() => {
    const handleGammaLockShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!user) return;
      if (!event.ctrlKey || !event.altKey || event.metaKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "l") return;
      if (isGammaEditableShortcutTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      handleGammaLock();
    };
    window.addEventListener("keydown", handleGammaLockShortcut);
    return () => window.removeEventListener("keydown", handleGammaLockShortcut);
  }, [location, navigate, user]);

  useEffect(() => {
    setGammaHistory((currentHistory) => mergeGammaHistoryRoute(currentHistory, routeLocation));
  }, [routeLocation]);

  useEffect(() => {
    const normalized = normalizeGammaRecentRoute(routeLocation);
    if (!normalized) return;
    setRecentRoutes((currentRoutes) => {
      const nextRoutes = mergeGammaRecentRoute(currentRoutes, normalized);
      if (nextRoutes.join("\n") === currentRoutes.join("\n")) return currentRoutes;
      writeGammaRecentRoutes(nextRoutes);
      return nextRoutes;
    });
  }, [routeLocation]);

  if (!isHomeRoute) {
    return (
      <PresentationShellProvider host="gamma">
        <GammaShell
          data-gamma-wtfos
          data-gamma-style-contract
          data-color-budget="5"
          data-gradient-budget="0"
          data-hard-lines="thin-operational"
          data-radius-max="6"
          data-theme="gamma-editorial-os"
          onClickCapture={handleShellClick}
        >
          <GammaResponsiveStyle />
          <GammaFrame>
            <TopStrip data-gamma-top-strip>
              <BrandLockup>
                <SignalDot />
                <div>
                  <Kicker>WTFOS.GAMMA</Kicker>
                  <BrandTitle data-gamma-wordmark>WTFOS</BrandTitle>
                </div>
              </BrandLockup>
              <IdentityCluster>
                <span>{signedLabel}</span>
                <GhostButton
                  type="button"
                  onClick={() => handleLaunch(identityRoute)}
                  data-gamma-launch={identityRoute}
                >
                {user ? "Profile" : "Enter"}
              </GhostButton>
            </IdentityCluster>
          </TopStrip>
            <GammaSystemTray
              user={user}
              isAuthLoading={isLoading}
              isSigningOut={isGammaSigningOut}
              signedLabel={signedLabel}
              clock={gammaClock}
              peers={peers}
              appAvailability={appAvailability}
              appAvailabilityReady={appAvailabilityReady}
              systemState={gammaSystemState}
              notificationState={notificationState}
              notificationUnreadCount={notificationUnreadCount}
              onLaunch={handleLaunch}
              onLogout={handleGammaLogout}
            />
            <GammaRouteWorkspace
              routeLocation={routeLocation}
              peers={peers}
              onLaunch={handleLaunch}
              historyBackRoute={gammaHistoryBackRoute}
              historyForwardRoute={gammaHistoryForwardRoute}
              onHistoryBack={handleGammaHistoryBack}
              onHistoryForward={handleGammaHistoryForward}
              signedLabel={signedLabel}
              user={user}
              isAuthLoading={isLoading}
              appAvailability={appAvailability}
              appAvailabilityReady={appAvailabilityReady}
              recentEntries={recentEntries}
            />
          </GammaFrame>
        </GammaShell>
      </PresentationShellProvider>
    );
  }

  return (
    <PresentationShellProvider host="gamma">
      <GammaShell
        data-gamma-wtfos
        data-gamma-style-contract
        data-color-budget="5"
        data-gradient-budget="0"
        data-hard-lines="thin-operational"
        data-radius-max="6"
        data-theme="gamma-editorial-os"
        onClickCapture={handleShellClick}
      >
        <GammaResponsiveStyle />
        <GammaFrame>
        <TopStrip data-gamma-top-strip>
          <BrandLockup>
            <SignalDot />
            <div>
              <Kicker>WTFOS.GAMMA</Kicker>
              <BrandTitle data-gamma-wordmark>WTFOS</BrandTitle>
            </div>
          </BrandLockup>
          <IdentityCluster>
            <span>{signedLabel}</span>
            <GhostButton
              type="button"
              onClick={() => handleLaunch(identityRoute)}
              data-gamma-launch={identityRoute}
            >
              {user ? "Profile" : "Enter"}
            </GhostButton>
          </IdentityCluster>
        </TopStrip>

        <GammaBootDesk
          user={user}
          isAuthLoading={isLoading}
          signedLabel={signedLabel}
          appAvailability={appAvailability}
          appAvailabilityReady={appAvailabilityReady}
          recentEntries={recentEntries}
          onLaunch={handleLaunch}
        />

        <GammaSystemTray
          user={user}
          isAuthLoading={isLoading}
          isSigningOut={isGammaSigningOut}
          signedLabel={signedLabel}
          clock={gammaClock}
          peers={peers}
          appAvailability={appAvailability}
          appAvailabilityReady={appAvailabilityReady}
          systemState={gammaSystemState}
          notificationState={notificationState}
          notificationUnreadCount={notificationUnreadCount}
          onLaunch={handleLaunch}
          onLogout={handleGammaLogout}
        />

        <GammaSessionConsole
          user={user}
          isAuthLoading={isLoading}
          signedLabel={signedLabel}
          peers={peers}
          appAvailability={appAvailability}
          appAvailabilityReady={appAvailabilityReady}
          recentEntries={recentEntries}
          onLaunch={handleLaunch}
        />

        <GammaWakeQueue
          user={user}
          isAuthLoading={isLoading}
          recentEntries={recentEntries}
          peers={peers}
          appAvailability={appAvailability}
          appAvailabilityReady={appAvailabilityReady}
          onLaunch={handleLaunch}
        />

        <GammaDailyReturnStrip peers={peers} onLaunch={handleLaunch} />

        <GammaAccessPassport
          user={user}
          appAvailability={appAvailability}
          appAvailabilityReady={appAvailabilityReady}
          onLaunch={handleLaunch}
        />

        <HeroGrid data-gamma-copy>
          <HeroStatement>
            <HeroEyebrow>Tezos arcade operating floor</HeroEyebrow>
            <h1>Make art. Publish it. Find the room where people are already moving.</h1>
            <HeroCopy>
              WTFOS is a live Tezos workspace where creation tools, galleries, arcade projects,
              rewards, roles, and conversation share the same floor.
            </HeroCopy>
            <HeroLiveLine data-gamma-live-summary>
              <i aria-hidden="true" />
              <span>{peers.slice(0, 5).length} visible people</span>
              <span>rooms open</span>
              <span>XP moving</span>
            </HeroLiveLine>
            <HeroArcadeStrip data-gamma-hero-arcade>
              {["Studio", "Broot", "Gallery", "Arcade", "WIM", "LIVE"].map((label) => (
                <span key={label}>{label}</span>
              ))}
            </HeroArcadeStrip>
            <HeroCommands data-gamma-primary-actions>
              <CommandButton
                type="button"
                onClick={() => handleLaunch("/gallery")}
                data-gamma-launch="/gallery"
              >
                <Image size={18} aria-hidden="true" />
                Gallery floor
              </CommandButton>
              <CommandButton
                type="button"
                onClick={() => handleLaunch("/tools/broot")}
                data-gamma-launch="/tools/broot"
              >
                <Hammer size={18} aria-hidden="true" />
                Start Broot
              </CommandButton>
              <CommandButton
                type="button"
                onClick={() => handleLaunch("/w")}
                data-gamma-comms-action
                data-gamma-launch="/w"
              >
                <MessageCircle size={18} aria-hidden="true" />
                Tune to W
              </CommandButton>
            </HeroCommands>
          </HeroStatement>

          <PeerOrbit data-gamma-peer-cloud>
            {peers.slice(0, 5).map((peer, index) => (
              <PeerSignal
                key={peer.id}
                type="button"
                onClick={() => handleLaunch(peer.route)}
                data-gamma-peer
                data-gamma-launch={peer.route}
              >
                <span>{peer.name}</span>
                <small>{peer.motion}</small>
                <b>{peer.xp}</b>
              </PeerSignal>
            ))}
          </PeerOrbit>
        </HeroGrid>

        <ArcadeFloor data-gamma-arcade>
          <ArcadeLane data-gamma-lane="make">
            <LaneHeader>
              <span>Make / Publish</span>
              <small>tools become drops</small>
            </LaneHeader>
            <StationRibbon>
              {MAKE_STATIONS.map((station) => (
                <StationButton
                  key={station.key}
                  type="button"
                  onClick={() => handleLaunch(station.route)}
                  data-gamma-cabinet={station.key}
                  data-gamma-launch={station.route}
                >
                  <station.icon size={19} aria-hidden="true" />
                  <span>{station.label}</span>
                  <small>{station.pull}</small>
                  <b>{station.kind}</b>
                </StationButton>
              ))}
            </StationRibbon>
          </ArcadeLane>

          <ArcadeLane data-gamma-lane="floor">
            <LaneHeader>
              <span>Look / Collect / Play</span>
              <small>public proof before gates</small>
            </LaneHeader>
            <StationRibbon>
              {FLOOR_STATIONS.map((station) => (
                <StationButton
                  key={station.key}
                  type="button"
                  onClick={() => handleLaunch(station.route)}
                  data-gamma-cabinet={station.key}
                  data-gamma-launch={station.route}
                >
                  <station.icon size={19} aria-hidden="true" />
                  <span>{station.label}</span>
                  <small>{station.pull}</small>
                  <b>{station.kind}</b>
                </StationButton>
              ))}
            </StationRibbon>
          </ArcadeLane>

          <ArcadeLane data-gamma-lane="comms">
            <LaneHeader>
              <span>Talk / Gather / Relay</span>
              <small>communication in the floor plan</small>
            </LaneHeader>
            <StationRibbon>
              {COMMS_STATIONS.map((station) => (
                <StationButton
                  key={station.key}
                  type="button"
                  onClick={() => handleLaunch(station.route)}
                  data-gamma-cabinet={station.key}
                  data-gamma-comms-action
                  data-gamma-launch={station.route}
                >
                  <station.icon size={19} aria-hidden="true" />
                  <span>{station.label}</span>
                  <small>{station.pull}</small>
                  <b>{station.kind}</b>
                </StationButton>
              ))}
            </StationRibbon>
          </ArcadeLane>
        </ArcadeFloor>

        <LowerBand>
          <ProgressionVeil data-gamma-buried-progression>
            <VeilPulse aria-hidden="true" />
            <div>
              <span>XP rings</span>
              <strong>Witness / Make / Relay / Host</strong>
            </div>
            <p>
              Levels, roles, rewards, sidequests, and challenges sit under the cabinets as signal
              lights. The route you open decides which gates appear.
            </p>
          </ProgressionVeil>

          <CommsSpine data-gamma-social-spine>
            <SpineHeader>
              <UsersRound size={20} aria-hidden="true" />
              <span>People are part of the interface</span>
            </SpineHeader>
            <PeerStack>
              {peers.slice(0, 4).map((peer) => (
                <PeerLine key={`line-${peer.id}`}>
                  <button type="button" onClick={() => handleLaunch(peer.route)} data-gamma-launch={peer.route}>
                    {peer.name}
                  </button>
                  <span>{peer.role}</span>
                </PeerLine>
              ))}
            </PeerStack>
          </CommsSpine>

          <CountBooth data-gamma-count-booth>
            <LaneHeader>
              <span>The Count booth</span>
              <small>admin gates stay admin gates</small>
            </LaneHeader>
            {COUNT_STATIONS.map((station) => (
              <CountButton
                key={station.key}
                type="button"
                onClick={() => handleLaunch(station.route)}
                data-gamma-cabinet={station.key}
                data-gamma-launch={station.route}
              >
                <station.icon size={17} aria-hidden="true" />
                <span>{station.label}</span>
                <small>{station.pull}</small>
              </CountButton>
            ))}
          </CountBooth>
        </LowerBand>
        </GammaFrame>
      </GammaShell>
    </PresentationShellProvider>
  );
}

const GammaWorkspace = styled.section`
  display: grid;
  gap: 1.2rem;
  padding: 1.15rem 0 0;
`;

const GammaWorkspaceChrome = styled.div`
  display: grid;
  gap: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--gamma-line);
`;

const GammaRouteNavBar = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
`;

const GammaBreadcrumbs = styled.nav`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--gamma-muted);
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.78rem;
  text-transform: uppercase;

  button,
  span {
    color: inherit;
  }

  button {
    appearance: none;
    min-height: 2.2rem;
    padding: 0;
    background: transparent;
    border: 0;
    font: inherit;
  }

  button:hover {
    color: var(--gamma-cyan);
  }

  svg {
    color: var(--gamma-cyan);
  }
`;

const GammaHistoryControls = styled.div`
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, auto));
  gap: 0.38rem;
  align-items: center;
  justify-content: end;
  min-width: 0;

  button {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.34rem;
    min-height: 2.75rem;
    padding: 0 0.65rem;
    color: var(--gamma-milk);
    background: transparent;
    border: 1px solid var(--gamma-line);
    border-radius: 5px;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.68rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  button:hover:not(:disabled) {
    color: var(--gamma-cyan);
    border-color: var(--gamma-cyan);
  }

  button:disabled {
    color: color-mix(in srgb, var(--gamma-muted) 62%, transparent);
    border-color: color-mix(in srgb, var(--gamma-line) 62%, transparent);
    cursor: not-allowed;
  }

  svg {
    color: var(--gamma-cyan);
  }
`;

const GammaRouteHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 1rem;

  h1 {
    margin: 0.25rem 0 0;
    color: var(--gamma-milk);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: clamp(2rem, 5vw, 4.6rem);
    line-height: 0.95;
    letter-spacing: 0;
  }

  p {
    max-width: 44rem;
    margin: 0.85rem 0 0;
    color: var(--gamma-muted);
    font-size: 1rem;
    line-height: 1.55;
  }
`;

const GammaUxSwitch = styled.div`
  display: inline-grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  overflow: hidden;

  a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.35rem;
    padding: 0 0.7rem;
    color: var(--gamma-muted);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.75rem;
    font-weight: 900;
    text-decoration: none;
    text-transform: uppercase;
    border-left: 1px solid var(--gamma-line);
  }

  a:first-child {
    border-left: 0;
  }

  a[aria-current="page"] {
    color: var(--gamma-cyan);
  }
`;

const GammaToolRow = styled.div`
  display: grid;
  grid-template-columns: minmax(14rem, 1fr) repeat(4, auto);
  align-items: center;
  gap: 0.65rem;
`;

const CommandSearchBox = styled.div`
  display: grid;
  gap: 0.45rem;
  min-width: 0;
`;

const GammaSearchForm = styled.form`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.65rem;
  min-height: 2.75rem;
  padding: 0 0.8rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;

  svg {
    color: var(--gamma-cyan);
  }

  input {
    width: 100%;
    min-width: 0;
    color: var(--gamma-milk);
    background: transparent;
    border: 0;
    outline: 0;
    font: inherit;
  }

  input::placeholder {
    color: var(--gamma-muted);
  }
`;

const CommandResults = styled.div`
  display: grid;
  gap: 0.35rem;
  min-width: 0;

  button {
    appearance: none;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
    min-height: 2.62rem;
    padding: 0.46rem 0.58rem;
    color: var(--gamma-milk);
    background: color-mix(in srgb, var(--gamma-panel) 64%, transparent);
    border: 1px solid var(--gamma-line);
    border-radius: 5px;
    font: inherit;
    text-align: left;
  }

  button:hover {
    border-color: var(--gamma-cyan);
  }

  svg {
    color: var(--gamma-cyan);
  }

  span {
    display: grid;
    gap: 0.08rem;
    min-width: 0;
  }

  b,
  small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  b {
    font-size: 0.86rem;
  }

  small,
  strong {
    color: var(--gamma-muted);
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
  }

  button[data-gamma-command-locked="true"] strong {
    color: var(--gamma-lime);
  }
`;

const GammaToolButton = styled.button`
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.48rem;
  min-height: 2.75rem;
  padding: 0 0.75rem;
  background: transparent;
  color: var(--gamma-milk);
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 780;

  svg {
    color: var(--gamma-cyan);
  }

  &:hover {
    color: var(--gamma-cyan);
  }
`;

const GammaAppTaskbar = styled.div`
  display: grid;
  grid-template-columns: minmax(12rem, 0.22fr) minmax(28rem, 1fr) minmax(13rem, 0.28fr);
  gap: 0.65rem;
  align-items: stretch;
  min-width: 0;
  padding: 0.65rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--gamma-panel) 64%, var(--gamma-ink));
`;

const GammaTaskbarCurrent = styled.div`
  display: grid;
  gap: 0.16rem;
  min-width: 0;
  align-content: center;
  border-radius: 5px;
  outline: 2px solid transparent;
  outline-offset: 3px;

  &[data-gamma-route-focus-target="active-app"]:focus {
    outline-color: var(--gamma-cyan);
  }

  span,
  small {
    color: var(--gamma-muted);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.66rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  strong {
    min-width: 0;
    color: var(--gamma-milk);
    font-size: 0.98rem;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }
`;

const GammaTaskbarActions = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.45rem;
  min-width: 0;

  button {
    appearance: none;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-content: center;
    align-items: center;
    gap: 0.12rem 0.42rem;
    min-width: 0;
    min-height: 2.8rem;
    padding: 0.42rem 0.5rem;
    color: var(--gamma-milk);
    background: transparent;
    border: 1px solid var(--gamma-line);
    border-radius: 5px;
    font: inherit;
    text-align: left;
  }

  button[aria-current="page"] {
    border-color: var(--gamma-cyan);
  }

  button:hover {
    border-color: var(--gamma-cyan);
  }

  svg {
    color: var(--gamma-cyan);
  }

  span {
    min-width: 0;
    color: inherit;
    font-size: 0.78rem;
    font-weight: 880;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }

  small {
    grid-column: 2;
    color: var(--gamma-muted);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.6rem;
    font-weight: 900;
    text-transform: uppercase;
  }
`;

const GammaTaskbarSwitcher = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.35rem;
  min-width: 0;
  align-content: stretch;

  > span {
    grid-column: 1 / -1;
    color: var(--gamma-muted);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.6rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  button {
    appearance: none;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-content: center;
    align-items: center;
    gap: 0.12rem 0.36rem;
    min-width: 0;
    min-height: 2.8rem;
    padding: 0.38rem 0.45rem;
    color: var(--gamma-milk);
    background: transparent;
    border: 1px solid var(--gamma-line);
    border-radius: 5px;
    font: inherit;
    text-align: left;
  }

  button:hover {
    border-color: var(--gamma-cyan);
  }

  svg {
    color: var(--gamma-cyan);
  }

  b {
    min-width: 0;
    color: inherit;
    font-size: 0.74rem;
    font-weight: 880;
    line-height: 1.05;
    overflow-wrap: anywhere;
  }

  small {
    grid-column: 2;
    color: var(--gamma-muted);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.56rem;
    font-weight: 900;
    line-height: 1.05;
    text-transform: uppercase;
  }
`;

const GammaWorkspaceGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(12rem, 0.25fr) minmax(0, 1fr) minmax(16rem, 0.28fr);
  gap: 1rem;
  align-items: start;
`;

const GammaSideRail = styled.aside`
  position: sticky;
  top: 0.8rem;
  z-index: 3;
  display: grid;
  gap: 1rem;
  max-height: calc(100svh - 2rem);
  overflow: auto;
  padding-right: 0.25rem;
`;

const GammaNavCluster = styled.div`
  display: grid;
  gap: 0.45rem;

  > span {
    color: var(--gamma-cyan);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.72rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  button {
    appearance: none;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    min-height: 2.7rem;
    padding: 0 0.65rem;
    background: transparent;
    color: var(--gamma-muted);
    border: 1px solid var(--gamma-line);
    border-radius: 5px;
    font: inherit;
  }

  button[aria-current="page"] {
    color: var(--gamma-milk);
    border-color: var(--gamma-cyan);
  }

  svg {
    color: var(--gamma-cyan);
  }

  b {
    min-width: 0;
    overflow-wrap: anywhere;
    font-size: 0.88rem;
  }

  small {
    color: var(--gamma-muted);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.68rem;
    text-transform: uppercase;
  }
`;

const GammaMainRegion = styled.main`
  position: relative;
  z-index: 1;
  display: grid;
  gap: 0.75rem;
  min-width: 0;
`;

const GammaRouteMeta = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: var(--gamma-muted);
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.76rem;
  text-transform: uppercase;

  a {
    color: var(--gamma-cyan);
    text-decoration: none;
  }
`;

const GammaApplicationContent = styled.div`
  min-width: 0;
  color: var(--gamma-milk);
`;

const GammaActivityRail = styled.aside`
  position: sticky;
  top: 0.8rem;
  display: grid;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
`;

const GammaNotice = styled.div`
  display: grid;
  gap: 0.85rem;
  min-height: 14rem;
  align-content: center;
  padding: 1rem;
  color: var(--gamma-milk);
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--gamma-panel) 78%, var(--gamma-ink));

  b {
    font-size: 1.4rem;
  }

  span {
    color: var(--gamma-muted);
    line-height: 1.5;
  }
`;

const GammaNoticeActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.7rem;

  button {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.65rem;
    padding: 0 0.8rem;
    background: transparent;
    color: var(--gamma-cyan);
    border: 1px solid var(--gamma-line);
    border-radius: 5px;
    font: inherit;
    font-weight: 900;
  }
`;

const GammaShell = styled.main`
  --gamma-ink: #070706;
  --gamma-panel: #11110f;
  --gamma-milk: #f2ead9;
  --gamma-cyan: #00d2ff;
  --gamma-live: #d6ff3f;
  --gamma-line: color-mix(in srgb, var(--gamma-milk) 18%, transparent);
  --gamma-muted: color-mix(in srgb, var(--gamma-milk) 68%, transparent);
  height: 100svh;
  min-height: 100svh;
  overflow-x: clip;
  overflow-y: auto;
  position: relative;
  background: var(--gamma-ink);
  color: var(--gamma-milk);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  letter-spacing: 0;

  :where(button) {
    font: inherit;
  }

  :where(button):not(:disabled) {
    cursor: pointer;
  }

  :where(button):focus-visible {
    outline: 2px solid var(--gamma-cyan);
    outline-offset: 0.35rem;
  }
`;

const GammaFrame = styled.div`
  position: relative;
  width: min(88rem, calc(100% - 2rem));
  margin: 0 auto;
  padding: 1rem 0 3.5rem;
`;

const TopStrip = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 4rem;
  gap: 1rem;
  border-bottom: 1px solid var(--gamma-line);
`;

const SystemTray = styled.nav`
  display: grid;
  grid-template-columns: minmax(12rem, 0.22fr) minmax(0, 1fr) minmax(16rem, 0.34fr);
  gap: 0.65rem;
  align-items: stretch;
  min-width: 0;
  padding: 0.65rem 0;
  border-bottom: 1px solid var(--gamma-line);
`;

const SystemTrayStatus = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.58rem;
  min-width: 0;
  min-height: 2.65rem;
  padding: 0 0.7rem;
  color: var(--gamma-live);
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.72rem;
  font-weight: 900;
  text-transform: uppercase;

  span {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  &[data-gamma-tray-status="checking"] {
    color: var(--gamma-muted);
  }

  &[data-gamma-tray-status="degraded"] {
    color: var(--gamma-cyan);
    border-color: var(--gamma-cyan);
  }
`;

const SystemTrayActions = styled.div`
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 0.45rem;
  min-width: 0;

  button {
    appearance: none;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-content: center;
    align-items: center;
    gap: 0.12rem 0.42rem;
    min-width: 0;
    min-height: 2.65rem;
    padding: 0.36rem 0.48rem;
    color: var(--gamma-milk);
    background: transparent;
    border: 1px solid var(--gamma-line);
    border-radius: 5px;
    font: inherit;
    text-align: left;
  }

  button:hover {
    border-color: var(--gamma-cyan);
  }

  button[data-gamma-live="true"] small {
    color: var(--gamma-live);
  }

  button[data-gamma-tray-action-state="unread"] {
    border-color: color-mix(in srgb, var(--gamma-live) 68%, var(--gamma-line));
  }

  button[data-gamma-tray-action-state="degraded"] small {
    color: var(--gamma-cyan);
  }

  svg {
    color: var(--gamma-cyan);
  }

  span {
    min-width: 0;
    color: inherit;
    font-size: 0.78rem;
    font-weight: 880;
    line-height: 1.06;
    overflow-wrap: anywhere;
  }

  small {
    grid-column: 2;
    color: var(--gamma-muted);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.6rem;
    font-weight: 900;
    text-transform: uppercase;
  }
`;

const SystemTrayPower = styled.div`
  display: grid;
  grid-template-columns: auto repeat(3, minmax(0, 1fr));
  gap: 0.45rem;
  min-width: 0;

  &[data-gamma-power-state="signed-in"] {
    grid-template-columns: auto repeat(4, minmax(0, 1fr));
  }

  > span,
  button {
    min-height: 2.65rem;
    border: 1px solid var(--gamma-line);
    border-radius: 5px;
  }

  > span {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    padding: 0 0.58rem;
    color: var(--gamma-cyan);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.64rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  button {
    appearance: none;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-content: center;
    align-items: center;
    gap: 0.12rem 0.42rem;
    min-width: 0;
    padding: 0.36rem 0.48rem;
    color: var(--gamma-milk);
    background: transparent;
    font: inherit;
    text-align: left;
  }

  button:hover:not(:disabled) {
    border-color: var(--gamma-cyan);
  }

  button:disabled {
    color: var(--gamma-muted);
  }

  svg {
    color: var(--gamma-cyan);
  }

  b {
    min-width: 0;
    font-size: 0.78rem;
    line-height: 1.06;
    overflow-wrap: anywhere;
  }

  small {
    grid-column: 2;
    color: var(--gamma-muted);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.6rem;
    font-weight: 900;
    text-transform: uppercase;
  }
`;

const BrandLockup = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const SignalDot = styled.span`
  width: 0.72rem;
  height: 0.72rem;
  background: var(--gamma-live);
  transform: rotate(45deg);
`;

const Kicker = styled.div`
  color: var(--gamma-cyan);
  font-size: 0.75rem;
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  text-transform: uppercase;
`;

const BrandTitle = styled.div`
  color: var(--gamma-milk);
  font-family: var(--wtf-pixel-font, "Pixelify Sans", var(--wtf-mono-font, ui-monospace, monospace));
  font-size: 1rem;
  font-weight: 900;
`;

const IdentityCluster = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  color: var(--gamma-milk);
  font-size: 0.9rem;
`;

const GhostButton = styled.button`
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.75rem;
  padding: 0;
  background: transparent;
  color: var(--gamma-cyan);
  border: 0;
  font: inherit;
  font-weight: 800;
`;

const BootDesk = styled.section`
  display: grid;
  grid-template-columns: minmax(18rem, 0.62fr) minmax(0, 1fr);
  gap: 1rem;
  align-items: stretch;
  padding: 1rem 0;
  border-bottom: 1px solid var(--gamma-line);
`;

const BootSessionPanel = styled.div`
  display: grid;
  gap: 0.75rem;
  align-content: start;
  min-width: 0;
  padding: 1rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--gamma-panel) 72%, var(--gamma-ink));

  h2 {
    margin: 0;
    color: var(--gamma-milk);
    font-size: 1.65rem;
    line-height: 1.04;
    letter-spacing: 0;
  }
`;

const BootAccountTile = styled.button`
  appearance: none;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
  min-height: 3.25rem;
  padding: 0.6rem 0.68rem;
  color: var(--gamma-milk);
  background: transparent;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  font: inherit;
  text-align: left;

  svg {
    color: var(--gamma-cyan);
  }

  span {
    display: grid;
    gap: 0.12rem;
    min-width: 0;
  }

  small,
  strong {
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.67rem;
    font-weight: 900;
    line-height: 1.15;
    text-transform: uppercase;
  }

  small {
    color: var(--gamma-muted);
  }

  b {
    min-width: 0;
    color: var(--gamma-milk);
    font-size: 0.95rem;
    line-height: 1.08;
    overflow-wrap: anywhere;
  }

  strong {
    min-width: 0;
    color: var(--gamma-live);
    overflow-wrap: anywhere;
    text-align: right;
  }

  &:hover {
    border-color: var(--gamma-cyan);
  }

  @media (max-width: 620px) {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    min-height: 3rem;

    strong {
      grid-column: 2;
      text-align: left;
    }
  }
`;

const BootSearchForm = styled.form`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 0.65rem;
  min-height: 2.75rem;
  padding: 0 0.8rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;

  svg {
    color: var(--gamma-cyan);
  }

  input {
    width: 100%;
    min-width: 0;
    color: var(--gamma-milk);
    background: transparent;
    border: 0;
    outline: 0;
    font: inherit;
  }

  input::placeholder {
    color: var(--gamma-muted);
  }
`;

const BootSessionChecklist = styled.div`
  display: grid;
  gap: 0.45rem;
  min-width: 0;

  button {
    appearance: none;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
    min-height: 2.62rem;
    padding: 0.5rem 0.62rem;
    color: var(--gamma-milk);
    background: transparent;
    border: 1px solid var(--gamma-line);
    border-radius: 5px;
    font: inherit;
    text-align: left;
  }

  button:hover {
    border-color: var(--gamma-cyan);
  }

  svg {
    color: var(--gamma-cyan);
  }

  span {
    display: grid;
    gap: 0.1rem;
    min-width: 0;
  }

  b {
    color: var(--gamma-milk);
    font-size: 0.83rem;
    line-height: 1.1;
  }

  small,
  strong {
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.66rem;
    font-weight: 900;
    line-height: 1.15;
    text-transform: uppercase;
  }

  small {
    color: var(--gamma-muted);
  }

  strong {
    color: var(--gamma-live);
    text-align: right;
    overflow-wrap: anywhere;
  }

  @media (max-width: 620px) {
    button {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      min-height: 3.1rem;
    }

    strong {
      grid-column: 2;
      text-align: left;
    }
  }
`;

const BootStartMenu = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.65rem;
  min-width: 0;
`;

const BootAction = styled.button<{ $primary?: boolean }>`
  appearance: none;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  align-content: start;
  justify-items: start;
  gap: 0.46rem;
  min-width: 0;
  min-height: 7.15rem;
  padding: 0.78rem;
  color: ${({ $primary }) => ($primary ? "var(--gamma-ink)" : "var(--gamma-milk)")};
  background: ${({ $primary }) => ($primary ? "var(--gamma-cyan)" : "transparent")};
  border: 1px solid ${({ $primary }) => ($primary ? "var(--gamma-cyan)" : "var(--gamma-line)")};
  border-radius: 6px;
  font: inherit;
  overflow-wrap: anywhere;

  svg {
    color: ${({ $primary }) => ($primary ? "var(--gamma-ink)" : "var(--gamma-cyan)")};
  }

  span {
    min-width: 0;
    color: inherit;
    font-size: 1.02rem;
    font-weight: 860;
    line-height: 1.08;
  }

  small {
    color: ${({ $primary }) =>
      $primary
        ? "color-mix(in srgb, var(--gamma-ink) 74%, transparent)"
        : "var(--gamma-muted)"};
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.7rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  &:hover {
    border-color: var(--gamma-cyan);
  }
`;

const SessionConsole = styled.section`
  display: grid;
  grid-template-columns:
    minmax(14rem, 0.28fr)
    minmax(0, 0.82fr)
    minmax(15rem, 0.34fr)
    minmax(15rem, 0.32fr);
  gap: 0.8rem;
  align-items: stretch;
  min-width: 0;
  padding: 1rem 0;
  border-bottom: 1px solid var(--gamma-line);
`;

const SessionConsoleIdentity = styled.div`
  display: grid;
  gap: 0.42rem;
  min-width: 0;
  padding: 0.86rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--gamma-panel) 70%, var(--gamma-ink));

  strong {
    min-width: 0;
    color: var(--gamma-milk);
    font-size: 1.16rem;
    line-height: 1.08;
    overflow-wrap: anywhere;
  }

  span {
    color: var(--gamma-muted);
    font-size: 0.82rem;
    line-height: 1.3;
  }

  button {
    appearance: none;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5rem;
    min-height: 2.75rem;
    margin-top: 0.25rem;
    padding: 0 0.7rem;
    color: var(--gamma-cyan);
    background: transparent;
    border: 1px solid var(--gamma-line);
    border-radius: 5px;
    font: inherit;
    font-weight: 850;
  }

  svg {
    color: var(--gamma-cyan);
  }
`;

const SessionShortcutGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;
  min-width: 0;
`;

const SessionShortcut = styled.button<{ $primary?: boolean }>`
  appearance: none;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  align-content: start;
  justify-items: start;
  gap: 0.4rem;
  min-width: 0;
  min-height: 5.8rem;
  padding: 0.72rem;
  color: ${({ $primary }) => ($primary ? "var(--gamma-ink)" : "var(--gamma-milk)")};
  background: ${({ $primary }) => ($primary ? "var(--gamma-cyan)" : "transparent")};
  border: 1px solid ${({ $primary }) => ($primary ? "var(--gamma-cyan)" : "var(--gamma-line)")};
  border-radius: 6px;
  font: inherit;
  text-align: left;
  overflow-wrap: anywhere;

  svg {
    color: ${({ $primary }) => ($primary ? "var(--gamma-ink)" : "var(--gamma-cyan)")};
  }

  span {
    min-width: 0;
    color: inherit;
    font-size: 1rem;
    font-weight: 880;
    line-height: 1.08;
  }

  small {
    color: ${({ $primary }) =>
      $primary
        ? "color-mix(in srgb, var(--gamma-ink) 74%, transparent)"
        : "var(--gamma-muted)"};
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.68rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  &:hover {
    border-color: var(--gamma-cyan);
  }
`;

const SessionMountTable = styled.div`
  display: grid;
  gap: 0.45rem;
  min-width: 0;
  padding: 0.74rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--gamma-panel) 58%, transparent);

  > span {
    color: var(--gamma-cyan);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.68rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  button {
    appearance: none;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.48rem;
    min-width: 0;
    min-height: 2.55rem;
    padding: 0;
    color: var(--gamma-milk);
    background: transparent;
    border: 0;
    border-top: 1px solid var(--gamma-line);
    font: inherit;
    text-align: left;
  }

  button:first-of-type {
    border-top: 0;
  }

  button:hover {
    color: var(--gamma-cyan);
  }

  svg {
    color: var(--gamma-cyan);
  }

  span:not(:first-child) {
    display: grid;
    gap: 0.08rem;
    min-width: 0;
  }

  b {
    min-width: 0;
    color: var(--gamma-milk);
    font-size: 0.82rem;
    line-height: 1.08;
    overflow-wrap: anywhere;
  }

  small,
  strong {
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.64rem;
    font-weight: 900;
    line-height: 1.12;
    text-transform: uppercase;
  }

  small {
    color: var(--gamma-muted);
  }

  strong {
    min-width: 0;
    color: var(--gamma-live);
    overflow-wrap: anywhere;
    text-align: right;
  }
`;

const SessionResumeList = styled.div`
  display: grid;
  gap: 0.45rem;
  min-width: 0;
  padding: 0.74rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;

  > span {
    color: var(--gamma-cyan);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.68rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  button {
    appearance: none;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.48rem;
    min-width: 0;
    min-height: 2.55rem;
    padding: 0;
    color: var(--gamma-milk);
    background: transparent;
    border: 0;
    border-top: 1px solid var(--gamma-line);
    font: inherit;
    text-align: left;
  }

  button:first-of-type {
    border-top: 0;
  }

  svg {
    color: var(--gamma-cyan);
  }

  b {
    min-width: 0;
    font-size: 0.86rem;
    line-height: 1.1;
    overflow-wrap: anywhere;
  }

  small {
    color: var(--gamma-live);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.66rem;
    font-weight: 900;
    text-align: right;
    text-transform: uppercase;
  }
`;

const WakeQueue = styled.section`
  display: grid;
  grid-template-columns: minmax(15rem, 0.3fr) minmax(0, 1fr);
  gap: 0.8rem;
  align-items: stretch;
  min-width: 0;
  padding: 1rem 0;
  border-bottom: 1px solid var(--gamma-line);
`;

const WakeQueueHeader = styled.div`
  display: grid;
  gap: 0.34rem;
  align-content: center;
  min-width: 0;
  padding: 0.82rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--gamma-panel) 66%, var(--gamma-ink));

  strong {
    color: var(--gamma-milk);
    font-size: 1rem;
    line-height: 1.18;
    overflow-wrap: anywhere;
  }
`;

const WakeQueueActions = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.65rem;
  min-width: 0;
`;

const WakeQueueAction = styled.button<{ $primary?: boolean }>`
  appearance: none;
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-content: start;
  align-items: center;
  gap: 0.16rem 0.44rem;
  min-width: 0;
  min-height: 5.2rem;
  padding: 0.68rem;
  color: ${({ $primary }) => ($primary ? "var(--gamma-ink)" : "var(--gamma-milk)")};
  background: ${({ $primary }) => ($primary ? "var(--gamma-cyan)" : "transparent")};
  border: 1px solid ${({ $primary }) => ($primary ? "var(--gamma-cyan)" : "var(--gamma-line)")};
  border-radius: 6px;
  font: inherit;
  text-align: left;

  span,
  small,
  em {
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-weight: 900;
    line-height: 1.08;
    text-transform: uppercase;
  }

  span {
    color: ${({ $primary }) =>
      $primary ? "color-mix(in srgb, var(--gamma-ink) 72%, transparent)" : "var(--gamma-cyan)"};
    font-size: 0.64rem;
  }

  svg {
    color: ${({ $primary }) => ($primary ? "var(--gamma-ink)" : "var(--gamma-cyan)")};
  }

  b {
    min-width: 0;
    color: inherit;
    font-size: 0.94rem;
    line-height: 1.08;
    overflow-wrap: anywhere;
  }

  small {
    grid-column: 2 / -1;
    color: ${({ $primary }) =>
      $primary
        ? "color-mix(in srgb, var(--gamma-ink) 76%, transparent)"
        : "var(--gamma-muted)"};
    font-size: 0.66rem;
  }

  em {
    grid-column: 1 / -1;
    color: ${({ $primary }) => ($primary ? "var(--gamma-ink)" : "var(--gamma-live)")};
    font-size: 0.64rem;
    font-style: normal;
  }

  &:hover {
    border-color: var(--gamma-cyan);
  }
`;

const DailyReturnStrip = styled.section`
  display: grid;
  grid-template-columns: minmax(16rem, 0.38fr) minmax(0, 1fr);
  gap: 0.8rem;
  align-items: stretch;
  min-width: 0;
  padding: 1rem 0;
  border-bottom: 1px solid var(--gamma-line);
`;

const DailyReturnIntro = styled.div`
  display: grid;
  gap: 0.36rem;
  min-width: 0;
  padding: 0.82rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--gamma-panel) 66%, var(--gamma-ink));

  strong {
    color: var(--gamma-milk);
    font-size: 1.02rem;
    line-height: 1.22;
  }

  span {
    color: var(--gamma-muted);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.7rem;
    font-weight: 900;
    text-transform: uppercase;
  }
`;

const DailyReturnActions = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;
  min-width: 0;

  button {
    appearance: none;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-content: start;
    align-items: start;
    gap: 0.35rem 0.52rem;
    min-width: 0;
    min-height: 5.35rem;
    padding: 0.72rem;
    color: var(--gamma-milk);
    background: transparent;
    border: 1px solid var(--gamma-line);
    border-radius: 6px;
    font: inherit;
    text-align: left;
  }

  button:hover {
    border-color: var(--gamma-cyan);
  }

  svg {
    color: var(--gamma-cyan);
  }

  span {
    display: grid;
    gap: 0.18rem;
    min-width: 0;
  }

  b {
    color: var(--gamma-milk);
    font-size: 0.92rem;
    line-height: 1.08;
  }

  small {
    color: var(--gamma-muted);
    font-size: 0.76rem;
    line-height: 1.22;
  }

  em {
    grid-column: 1 / -1;
    color: var(--gamma-live);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.66rem;
    font-style: normal;
    font-weight: 900;
    text-transform: uppercase;
  }
`;

const AccessPassport = styled.section`
  display: grid;
  gap: 1rem;
  padding: 1rem 0;
  border-bottom: 1px solid var(--gamma-line);
`;

const PassportHeader = styled.div`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  min-width: 0;

  h2 {
    margin: 0.15rem 0 0;
    color: var(--gamma-milk);
    font-size: 1.55rem;
    line-height: 1.08;
    letter-spacing: 0;
  }
`;

const PassportState = styled.div`
  flex: 0 0 auto;
  color: var(--gamma-live);
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.74rem;
  font-weight: 900;
  text-align: right;
  text-transform: uppercase;
`;

const PassportBody = styled.div`
  display: grid;
  grid-template-columns: minmax(19rem, 0.68fr) minmax(0, 1fr);
  gap: 0.8rem;
  min-width: 0;
`;

const PassportIdentity = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
  min-width: 0;
`;

const PassportMetric = styled.div`
  display: grid;
  gap: 0.42rem;
  min-width: 0;
  padding: 0.85rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--gamma-panel) 68%, var(--gamma-ink));

  small {
    color: var(--gamma-cyan);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.68rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  strong {
    color: var(--gamma-milk);
    font-size: 1rem;
    line-height: 1.12;
  }

  span {
    color: var(--gamma-muted);
    font-size: 0.83rem;
    line-height: 1.35;
  }
`;

const PassportActionGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.65rem;
  min-width: 0;
`;

const PassportAction = styled.button`
  appearance: none;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-content: start;
  align-items: start;
  gap: 0.34rem 0.52rem;
  min-width: 0;
  min-height: 6.1rem;
  padding: 0.78rem;
  color: var(--gamma-milk);
  background: transparent;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  font: inherit;
  text-align: left;

  svg {
    color: var(--gamma-cyan);
  }

  span {
    min-width: 0;
    color: var(--gamma-milk);
    font-size: 0.95rem;
    font-weight: 850;
    line-height: 1.08;
  }

  small {
    grid-column: 1 / -1;
    color: var(--gamma-muted);
    font-size: 0.78rem;
    line-height: 1.25;
  }

  b {
    grid-column: 1 / -1;
    color: var(--gamma-live);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.66rem;
    text-transform: uppercase;
  }

  &:hover {
    border-color: var(--gamma-cyan);
  }
`;

const PassportUnlocks = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.8rem;
  min-width: 0;
`;

const PassportList = styled.div`
  display: grid;
  gap: 0.45rem;
  min-width: 0;
  padding-top: 0.15rem;

  > small {
    color: var(--gamma-cyan);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.68rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  button {
    appearance: none;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(7rem, auto);
    gap: 0.75rem;
    align-items: center;
    min-width: 0;
    min-height: 2.8rem;
    padding: 0.62rem 0.75rem;
    color: var(--gamma-milk);
    background: transparent;
    border: 1px solid var(--gamma-line);
    border-radius: 6px;
    font: inherit;
    text-align: left;
  }

  button:hover {
    border-color: var(--gamma-cyan);
  }

  span {
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 800;
  }

  b {
    color: var(--gamma-muted);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.68rem;
    font-weight: 900;
    text-align: right;
    text-transform: uppercase;
  }
`;

const CountAdminLane = styled.div`
  display: grid;
  grid-template-columns: minmax(18rem, 0.72fr) minmax(0, 1fr);
  gap: 0.8rem;
  align-items: stretch;
  min-width: 0;
  padding: 0.88rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;

  strong {
    display: block;
    margin-top: 0.16rem;
    color: var(--gamma-milk);
    line-height: 1.15;
  }

  span {
    display: block;
    margin-top: 0.42rem;
    color: var(--gamma-muted);
    font-size: 0.86rem;
    line-height: 1.38;
  }
`;

const CountAdminActions = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
  min-width: 0;

  button {
    appearance: none;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
    min-height: 3rem;
    padding: 0.62rem 0.72rem;
    color: var(--gamma-milk);
    background: transparent;
    border: 1px solid var(--gamma-line);
    border-radius: 6px;
    font: inherit;
    font-weight: 820;
    text-align: left;
  }

  svg {
    color: var(--gamma-cyan);
  }

  button:hover {
    border-color: var(--gamma-cyan);
  }
`;

const HeroGrid = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(22rem, 0.92fr);
  align-items: center;
  gap: 3rem;
  min-height: calc(65svh - 4rem);
  padding: 2.25rem 0 3rem;
`;

const HeroStatement = styled.div`
  max-width: 48rem;

  h1 {
    margin: 0;
    color: var(--gamma-milk);
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 4.35rem;
    line-height: 0.98;
    letter-spacing: 0;
    font-weight: 850;
  }
`;

const HeroEyebrow = styled.div`
  color: var(--gamma-cyan);
  font-size: 0.9rem;
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  text-transform: uppercase;
  margin-bottom: 1.1rem;
`;

const HeroCopy = styled.p`
  max-width: 39rem;
  margin: 1.35rem 0 0;
  color: var(--gamma-muted);
  font-size: 1.08rem;
  line-height: 1.65;
`;

const HeroLiveLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem 0.8rem;
  margin-top: 1rem;
  color: var(--gamma-muted);
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.82rem;
  text-transform: uppercase;

  i {
    width: 0.5rem;
    height: 0.5rem;
    background: var(--gamma-live);
    transform: rotate(45deg);
  }
`;

const HeroCommands = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1.4rem;
  margin-top: 1.6rem;
`;

const CommandButton = styled.button`
  appearance: none;
  display: inline-flex;
  align-items: center;
  gap: 0.7rem;
  background: transparent;
  color: var(--gamma-milk);
  font: inherit;
  font-size: 1rem;
  font-weight: 780;
  padding: 0.62rem 0.85rem;
  border: 1px solid var(--gamma-line);
  border-radius: 4px;

  svg {
    color: var(--gamma-cyan);
  }

  &:hover {
    color: var(--gamma-cyan);
  }
`;

const HeroArcadeStrip = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 1.55rem;
  color: var(--gamma-muted);
  font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
  font-size: 0.82rem;
  font-weight: 800;
  text-transform: uppercase;

  span {
    color: var(--gamma-muted);
    border: 1px solid var(--gamma-line);
    border-radius: 3px;
    padding: 0.32rem 0.45rem;
  }

  span:last-child {
    color: var(--gamma-live);
  }
`;

const PeerOrbit = styled.div`
  display: grid;
  gap: 0;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--gamma-panel) 86%, var(--gamma-ink));
`;

const PeerSignal = styled.button`
  appearance: none;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  column-gap: 1rem;
  row-gap: 0.18rem;
  min-width: 0;
  min-height: 4.65rem;
  background: transparent;
  color: var(--gamma-milk);
  padding: 0.75rem 0.9rem;
  overflow-wrap: anywhere;
  border: 0;
  border-bottom: 1px solid var(--gamma-line);
  font: inherit;

  span {
    color: var(--gamma-cyan);
    font-size: 1rem;
    font-weight: 780;
  }

  small {
    grid-column: 1 / -1;
    color: var(--gamma-muted);
    font-size: 0.86rem;
  }

  b {
    color: var(--gamma-cyan);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.72rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  &:last-child {
    border-bottom: 0;
  }
`;

const ArcadeFloor = styled.section`
  display: grid;
  gap: 2.25rem;
  padding: 0 0 3rem;
`;

const ArcadeLane = styled.section`
  display: grid;
  gap: 1.4rem;
`;

const LaneHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;

  span {
    color: var(--gamma-milk);
    font-size: 1.35rem;
    font-weight: 900;
  }

  small {
    color: var(--gamma-cyan);
    font-size: 0.82rem;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    text-transform: uppercase;
  }
`;

const StationRibbon = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2.2rem;
`;

const StationButton = styled.button`
  appearance: none;
  min-height: 9.2rem;
  min-width: 0;
  display: grid;
  align-content: start;
  gap: 0.62rem;
  color: var(--gamma-milk);
  padding: 0.9rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
  background: color-mix(in srgb, var(--gamma-panel) 72%, var(--gamma-ink));
  overflow-wrap: anywhere;
  font: inherit;

  svg {
    color: var(--gamma-cyan);
  }

  span {
    font-size: 1.28rem;
    font-weight: 820;
  }

  small {
    color: var(--gamma-muted);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  b {
    color: var(--gamma-cyan);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.72rem;
    text-transform: uppercase;
  }

  &:hover span {
    color: var(--gamma-cyan);
  }
`;

const LowerBand = styled.section`
  display: grid;
  grid-template-columns: 1.1fr 0.9fr 0.78fr;
  gap: 1rem;
  align-items: start;
  padding: 1.25rem 0 1rem;
`;

const ProgressionVeil = styled.div`
  display: grid;
  gap: 1rem;
  min-height: 100%;
  padding: 1rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;

  div {
    display: grid;
    gap: 0.35rem;
  }

  span {
    color: var(--gamma-cyan);
    font-size: 0.85rem;
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    text-transform: uppercase;
  }

  strong {
    color: var(--gamma-milk);
    font-size: 1.65rem;
    line-height: 1.12;
  }

  p {
    max-width: 32rem;
    margin: 0;
    color: var(--gamma-muted);
    line-height: 1.65;
  }
`;

const VeilPulse = styled.i`
  display: block;
  width: 7.5rem;
  height: 0.72rem;
  background: var(--gamma-cyan);
  transform: skewX(-22deg);
`;

const CommsSpine = styled.div`
  display: grid;
  gap: 1.2rem;
  min-height: 100%;
  padding: 1rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
`;

const SpineHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: var(--gamma-milk);
  font-weight: 900;

  svg {
    color: var(--gamma-cyan);
  }
`;

const PeerStack = styled.div`
  display: grid;
  gap: 1rem;
`;

const PeerLine = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--gamma-line);

  button {
    appearance: none;
    min-height: 2.2rem;
    padding: 0;
    background: transparent;
    color: var(--gamma-cyan);
    border: 0;
    font: inherit;
    font-weight: 780;
  }

  span {
    color: var(--gamma-muted);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.82rem;
    text-transform: uppercase;
  }
`;

const CountBooth = styled.aside`
  display: grid;
  gap: 1.1rem;
  min-height: 100%;
  padding: 1rem;
  border: 1px solid var(--gamma-line);
  border-radius: 6px;
`;

const CountButton = styled.button`
  appearance: none;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  column-gap: 0.7rem;
  row-gap: 0.12rem;
  min-width: 0;
  background: transparent;
  color: var(--gamma-milk);
  padding-top: 0.7rem;
  border: 0;
  border-top: 1px solid var(--gamma-line);
  font: inherit;
  overflow-wrap: anywhere;

  svg {
    color: var(--gamma-cyan);
  }

  span {
    font-weight: 900;
  }

  small {
    grid-column: 2;
    color: var(--gamma-muted);
  }
`;

const GammaResponsiveStyle = createGlobalStyle`
  @media (max-width: 980px) {
    ${HeroGrid} {
      grid-template-columns: 1fr;
      min-height: auto;
      padding: 2rem 0 4rem;
      gap: 2.5rem;
    }

    ${HeroStatement} h1 {
      font-size: 3.2rem;
      line-height: 0.96;
    }

    ${StationRibbon},
    ${LowerBand},
    ${GammaRouteHeader},
    ${GammaWorkspaceGrid},
    ${GammaToolRow},
    ${GammaAppTaskbar},
    ${SystemTray},
    ${BootDesk},
    ${SessionConsole},
    ${WakeQueue},
    ${DailyReturnStrip},
    ${PassportBody},
    ${PassportUnlocks},
    ${CountAdminLane} {
      grid-template-columns: 1fr;
    }

    ${BootStartMenu} {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    ${PassportActionGrid},
    ${SessionShortcutGrid},
    ${SystemTrayActions},
    ${SystemTrayPower},
    ${GammaTaskbarActions},
    ${GammaTaskbarSwitcher},
    ${WakeQueueActions},
    ${DailyReturnActions} {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    ${GammaSideRail},
    ${GammaActivityRail} {
      position: static;
      max-height: none;
    }

    ${GammaSideRail} {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 620px) {
    ${GammaFrame} {
      width: min(100% - 1.1rem, 92rem);
      padding-top: 0.8rem;
    }

    ${LaneHeader} {
      align-items: flex-start;
      flex-direction: column;
    }

    ${IdentityCluster} {
      align-items: flex-end;
      flex-direction: column;
      gap: 0.35rem;
    }

    ${PassportHeader} {
      align-items: flex-start;
      flex-direction: column;
    }

    ${PassportState} {
      text-align: left;
    }

    ${PassportIdentity},
    ${PassportActionGrid},
    ${SessionShortcutGrid},
    ${WakeQueueActions},
    ${DailyReturnActions},
    ${CountAdminActions} {
      grid-template-columns: 1fr;
    }

    ${PassportList} button {
      grid-template-columns: 1fr;
      gap: 0.3rem;
    }

    ${PassportList} b {
      text-align: left;
    }

    ${HeroStatement} h1 {
      font-size: 2.42rem;
    }

    ${HeroCopy} {
      font-size: 0.98rem;
    }

    ${HeroCommands} {
      flex-direction: column;
      gap: 0.85rem;
    }

    ${CommandButton},
    ${StationButton},
    ${CountButton},
    ${GammaToolButton} {
      min-height: 3rem;
    }

    ${GammaUxSwitch},
    ${GammaSideRail} {
      grid-template-columns: 1fr;
    }

    ${GammaToolRow} {
      gap: 0.5rem;
    }

    ${GammaTaskbarActions} {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    ${GammaTaskbarSwitcher} {
      grid-template-columns: 1fr;
    }

    ${GammaTaskbarActions} button,
    ${GammaTaskbarSwitcher} button {
      min-height: 3rem;
    }

    ${SystemTrayActions} {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    ${SystemTrayActions} button,
    ${SystemTrayPower} button,
    ${SystemTrayPower} > span,
    ${SystemTrayStatus} {
      min-height: 3rem;
    }

    ${BootStartMenu} {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    ${BootAction} {
      min-height: 4.8rem;
    }

    ${SessionShortcut} {
      min-height: 3.8rem;
    }

    ${WakeQueueAction} {
      min-height: 3.2rem;
    }

    ${SessionMountTable} button,
    ${SessionResumeList} button {
      grid-template-columns: auto minmax(0, 1fr);
      align-items: start;
      min-height: 3rem;
      padding-top: 0.45rem;
    }

    ${SessionMountTable} strong,
    ${SessionResumeList} small {
      grid-column: 2;
      text-align: left;
    }

    ${GammaRouteHeader} h1 {
      font-size: 2.35rem;
    }

    ${GammaRouteMeta} {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.35rem;
    }

    ${StationButton} span {
      font-size: 1.25rem;
    }
  }
`;
