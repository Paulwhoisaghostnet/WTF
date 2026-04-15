import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  type ComponentType,
  type LazyExoticComponent,
} from "react";
import { ThemeProvider } from "styled-components";
import original from "react95/dist/themes/original";
import { QueryClientProvider } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient } from "./lib/query-client";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { WalletProvider } from "./lib/wallet-context";
import { GlobalStyles } from "./global-styles";
import { Desktop } from "./components/layout/Desktop";
import {
  WindowManagerProvider,
  useWindowManager,
  WindowPathContext,
} from "./lib/window-context";
import { Hourglass } from "react95";

import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import type { UserRole } from "@shared/types";

const DashboardPage = lazy(() =>
  import("./pages/Dashboard").then((m) => ({ default: m.Dashboard }))
);
const RoundsPage = lazy(() =>
  import("./pages/Rounds").then((m) => ({ default: m.Rounds }))
);
const RoundDetailPage = lazy(() =>
  import("./pages/RoundDetail").then((m) => ({ default: m.RoundDetail }))
);
const ChallengesPage = lazy(() =>
  import("./pages/Challenges").then((m) => ({ default: m.Challenges }))
);
const SideQuestsPage = lazy(() =>
  import("./pages/SideQuests").then((m) => ({ default: m.SideQuests }))
);
const MessagesPage = lazy(() =>
  import("./pages/Messages").then((m) => ({ default: m.Messages }))
);
const MessageBoardPage = lazy(() =>
  import("./pages/MessageBoard").then((m) => ({ default: m.MessageBoard }))
);
const MarketplacePage = lazy(() =>
  import("./pages/Marketplace").then((m) => ({ default: m.Marketplace }))
);
const TradeBoardsPage = lazy(() =>
  import("./pages/TradeBoards").then((m) => ({ default: m.TradeBoards }))
);
const WPage = lazy(() => import("./pages/W").then((m) => ({ default: m.W })));
const TVPage = lazy(() => import("./pages/TV").then((m) => ({ default: m.TV })));
const SwapPage = lazy(() =>
  import("./pages/Swap").then((m) => ({ default: m.Swap }))
);
const LeaderboardPage = lazy(() =>
  import("./pages/Leaderboard").then((m) => ({ default: m.Leaderboard }))
);
const GalleryPage = lazy(() =>
  import("./pages/Gallery").then((m) => ({ default: m.Gallery }))
);
const LinksPage = lazy(() =>
  import("./pages/Links").then((m) => ({ default: m.Links }))
);
const FaqPage = lazy(() => import("./pages/Faq").then((m) => ({ default: m.Faq })));
const ProfilePage = lazy(() =>
  import("./pages/Profile").then((m) => ({ default: m.Profile }))
);
const PublicProfilePage = lazy(() =>
  import("./pages/PublicProfile").then((m) => ({ default: m.PublicProfile }))
);
const AdminPage = lazy(() =>
  import("./pages/Admin").then((m) => ({ default: m.Admin }))
);
const HoardPage = lazy(() =>
  import("./pages/Hoard").then((m) => ({ default: m.Hoard }))
);
const MyVideosPage = lazy(() =>
  import("./pages/MyVideos").then((m) => ({ default: m.MyVideos }))
);
const MyPhotosPage = lazy(() =>
  import("./pages/MyPhotos").then((m) => ({ default: m.MyPhotos }))
);

/* ═══ Page registry ══════════════════════════════════ */

interface PageDef {
  pattern: string;
  component: ComponentType<any> | LazyExoticComponent<ComponentType<any>>;
  mapProps?: (params: Record<string, string>) => Record<string, any>;
  auth: boolean;
  roles?: UserRole[];
}

const PAGE_DEFS: PageDef[] = [
  { pattern: "/dashboard", component: DashboardPage, auth: true },
  {
    pattern: "/rounds/:id",
    component: RoundDetailPage,
    mapProps: (p) => ({ roundId: p.id }),
    auth: true,
  },
  { pattern: "/rounds", component: RoundsPage, auth: true },
  { pattern: "/challenges", component: ChallengesPage, auth: true },
  { pattern: "/side-quests", component: SideQuestsPage, auth: true },
  { pattern: "/messages", component: MessagesPage, auth: true },
  { pattern: "/marketplace", component: MarketplacePage, auth: true },
  { pattern: "/trade-boards", component: TradeBoardsPage, auth: true },
  { pattern: "/w", component: WPage, auth: true },
  { pattern: "/tv", component: TVPage, auth: true },
  { pattern: "/swap", component: SwapPage, auth: true },
  { pattern: "/profile", component: ProfilePage, auth: true },
  {
    pattern: "/admin",
    component: AdminPage,
    auth: true,
    roles: ["admin", "host", "cohost"],
  },
  { pattern: "/hoard", component: HoardPage, auth: true },
  { pattern: "/my-videos", component: MyVideosPage, auth: true },
  { pattern: "/my-photos", component: MyPhotosPage, auth: true },
  { pattern: "/leaderboard", component: LeaderboardPage, auth: false },
  { pattern: "/gallery", component: GalleryPage, auth: false },
  { pattern: "/links", component: LinksPage, auth: false },
  { pattern: "/faq", component: FaqPage, auth: false },
  {
    pattern: "/user/:username",
    component: PublicProfilePage,
    mapProps: (p) => ({ username: p.username }),
    auth: false,
  },
  { pattern: "/messageboard", component: MessageBoardPage, auth: false },
];

const FULLSCREEN_ROUTES = new Set(["/", "/login", "/register"]);

function patternToRegex(pattern: string): {
  regex: RegExp;
  paramNames: string[];
} {
  const paramNames: string[] = [];
  const regexStr = pattern.replace(/:(\w+)/g, (_, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

function matchPage(path: string) {
  for (const def of PAGE_DEFS) {
    const { regex, paramNames } = patternToRegex(def.pattern);
    const match = path.match(regex);
    if (match) {
      const params: Record<string, string> = {};
      paramNames.forEach((name, i) => {
        params[name] = match[i + 1];
      });
      const props = def.mapProps ? def.mapProps(params) : {};
      return { def, params, props };
    }
  }
  return null;
}

export function isWindowedRoute(path: string): boolean {
  return matchPage(path) !== null;
}

/* ═══ WindowRenderer ═════════════════════════════════ */

function WindowRenderer() {
  const wm = useWindowManager();
  const { user, isLoading } = useAuth();

  return (
    <>
      {wm.openPages.map((path) => {
        const match = matchPage(path);
        if (!match) return null;

        const { def, props } = match;

        if (def.auth) {
          if (isLoading) {
            return (
              <WindowPathContext.Provider key={path} value={path}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "100%",
                  }}
                >
                  <Hourglass size={32} />
                </div>
              </WindowPathContext.Provider>
            );
          }
          if (!user) return null;
          if (def.roles && !def.roles.includes(user.role)) return null;
        }

        const Comp = def.component as ComponentType<any>;
        return (
          <WindowPathContext.Provider key={path} value={path}>
            <Suspense
              fallback={
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "100%",
                  }}
                >
                  <Hourglass size={32} />
                </div>
              }
            >
              <Comp {...props} />
            </Suspense>
          </WindowPathContext.Provider>
        );
      })}
    </>
  );
}

/* ═══ FullScreenOverlay ══════════════════════════════ */

function FullScreenOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        background: "#008080",
      }}
    >
      {children}
    </div>
  );
}

/* ═══ URL ↔ WindowManager sync ═══════════════════════ */

function URLSync() {
  const [location] = useLocation();
  const wm = useWindowManager();
  const { user } = useAuth();
  const initialised = useRef(false);

  useEffect(() => {
    if (FULLSCREEN_ROUTES.has(location)) return;

    const match = matchPage(location);
    if (!match) return;

    if (match.def.auth && !user) return;
    if (match.def.roles && user && !match.def.roles.includes(user.role)) return;

    if (!wm.openPages.includes(location)) {
      wm.openPage(location);
    } else if (wm.focusedPath !== location) {
      wm.focus(location);
    }
    initialised.current = true;
  }, [location, user]);

  return null;
}

/* ═══ AppContent ═════════════════════════════════════ */

function AppContent() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();

  const showLogin = location === "/login";
  const showRegister = location === "/register";
  const showLanding = location === "/" && !user;

  return (
    <WindowManagerProvider navigate={setLocation} currentLocation={location}>
      <URLSync />
      <Desktop>
        <WindowRenderer />
        {showLogin && (
          <FullScreenOverlay>
            <Login />
          </FullScreenOverlay>
        )}
        {showRegister && (
          <FullScreenOverlay>
            <Register />
          </FullScreenOverlay>
        )}
        {showLanding && (
          <FullScreenOverlay>
            <Landing />
          </FullScreenOverlay>
        )}
      </Desktop>
    </WindowManagerProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={original}>
        <GlobalStyles />
        <AuthProvider>
          <WalletProvider>
            <AppContent />
          </WalletProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
