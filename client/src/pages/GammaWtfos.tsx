import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import styled, { createGlobalStyle } from "styled-components";
import {
  Bell,
  ChevronRight,
  Crown,
  Gamepad2,
  Hammer,
  Image,
  MessageCircle,
  Palette,
  RadioTower,
  Search,
  Send,
  Settings,
  Store,
  UserRound,
  UsersRound,
  Zap,
} from "lucide-react";
import type { DesktopAppKey } from "@shared/types";
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
import { getPageAccessState, matchPage } from "../routes/page-defs";
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

type GammaRouteParts = {
  pathname: string;
  search: string;
  hash: string;
};

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
    label: "Sidequests",
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
  { label: "Make", stations: MAKE_STATIONS },
  { label: "Discover", stations: FLOOR_STATIONS },
  { label: "Comms", stations: COMMS_STATIONS },
  { label: "Count", stations: COUNT_STATIONS },
];

const ALL_GAMMA_STATIONS = GAMMA_NAV_GROUPS.flatMap((group) => group.stations);

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

function GammaRouteGate({
  title,
  reason,
  onLaunch,
}: {
  title: string;
  reason: string;
  onLaunch: (route: string) => void;
}) {
  const isAuth = reason === "auth-required";
  return (
    <GammaNotice data-gamma-route-gate={reason}>
      <b>{title}</b>
      <span>
        {isAuth
          ? "Sign in to continue through the same WTFOS permission gate."
          : "This route is protected by the shared WTFOS permission model."}
      </span>
      <GammaNoticeActions>
        {isAuth ? (
          <button type="button" onClick={() => onLaunch("/login")} data-gamma-launch="/login">
            Enter
          </button>
        ) : null}
        <button type="button" onClick={() => onLaunch("/")} data-gamma-launch="/">
          Gamma home
        </button>
      </GammaNoticeActions>
    </GammaNotice>
  );
}

function GammaRouteWorkspace({
  routeLocation,
  peers,
  onLaunch,
  signedLabel,
  user,
  isAuthLoading,
  appAvailability,
  appAvailabilityReady,
}: {
  routeLocation: string;
  peers: GammaPeer[];
  onLaunch: (route: string) => void;
  signedLabel: string;
  user: ReturnType<typeof useAuth>["user"];
  isAuthLoading: boolean;
  appAvailability: Partial<Record<DesktopAppKey, boolean>>;
  appAvailabilityReady: boolean;
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

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchText.trim();
    if (!query) return;
    onLaunch(`/gallery?search=${encodeURIComponent(query)}`);
  };

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
        <GammaBreadcrumbs aria-label="Gamma breadcrumbs" data-gamma-breadcrumbs>
          <button type="button" onClick={() => onLaunch("/")} data-gamma-launch="/">
            Gamma
          </button>
          <ChevronRight size={14} aria-hidden="true" />
          <span>{title}</span>
        </GammaBreadcrumbs>
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
          <GammaSearchForm onSubmit={submitSearch} data-gamma-search>
            <Search size={17} aria-hidden="true" />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search gallery, people, routes"
              aria-label="Search WTFOS from Gamma"
            />
          </GammaSearchForm>
          <GammaToolButton
            type="button"
            onClick={() => onLaunch(user?.username ? `/user/${encodeURIComponent(user.username)}` : "/login")}
            data-gamma-launch={user?.username ? `/user/${encodeURIComponent(user.username)}` : "/login"}
          >
            <UserRound size={17} aria-hidden="true" />
            {signedLabel}
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
  const { user, isLoading } = useAuth();
  useEffect(() => {
    rememberPresentationHost("gamma");
  }, []);
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
  const peers = useMemo(() => mapPeers(xpQuery.data), [xpQuery.data]);
  const routeLocation = gammaRouteFromLocation(location);
  const routePathname = cleanPathname(routeLocation);
  const isHomeRoute = routePathname === "/" || routePathname === "/gamma";
  const handleLaunch = (route: string) => navigate(gammaNavigationTarget(route, location));
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
  const identityRoute = user?.username ? `/user/${encodeURIComponent(user.username)}` : "/login";
  const appAvailability = desktopAppsQuery.data?.apps ?? {};
  const appAvailabilityReady = Boolean(desktopAppsQuery.data?.apps);

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
            <GammaRouteWorkspace
              routeLocation={routeLocation}
              peers={peers}
              onLaunch={handleLaunch}
              signedLabel={signedLabel}
              user={user}
              isAuthLoading={isLoading}
              appAvailability={appAvailability}
              appAvailabilityReady={appAvailabilityReady}
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
  grid-template-columns: minmax(14rem, 1fr) repeat(3, auto);
  align-items: center;
  gap: 0.65rem;
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
    ${GammaToolRow} {
      grid-template-columns: 1fr;
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
