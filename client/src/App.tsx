import { useEffect, useRef, type ComponentType } from "react";
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
import { Dashboard } from "./pages/Dashboard";
import { Rounds } from "./pages/Rounds";
import { RoundDetail } from "./pages/RoundDetail";
import { Challenges } from "./pages/Challenges";
import { SideQuests } from "./pages/SideQuests";
import { Messages } from "./pages/Messages";
import { MessageBoard } from "./pages/MessageBoard";
import { Marketplace } from "./pages/Marketplace";
import { TradeBoards } from "./pages/TradeBoards";
import { Swap } from "./pages/Swap";
import { Leaderboard } from "./pages/Leaderboard";
import { Gallery } from "./pages/Gallery";
import { Links } from "./pages/Links";
import { Faq } from "./pages/Faq";
import { Profile } from "./pages/Profile";
import { PublicProfile } from "./pages/PublicProfile";
import { Admin } from "./pages/Admin";
import { Hoard } from "./pages/Hoard";
import type { UserRole } from "@shared/types";

/* ═══ Page registry ══════════════════════════════════ */

interface PageDef {
  pattern: string;
  component: ComponentType<any>;
  mapProps?: (params: Record<string, string>) => Record<string, any>;
  auth: boolean;
  roles?: UserRole[];
}

const PAGE_DEFS: PageDef[] = [
  { pattern: "/dashboard", component: Dashboard, auth: true },
  {
    pattern: "/rounds/:id",
    component: RoundDetail,
    mapProps: (p) => ({ roundId: p.id }),
    auth: true,
  },
  { pattern: "/rounds", component: Rounds, auth: true },
  { pattern: "/challenges", component: Challenges, auth: true },
  { pattern: "/side-quests", component: SideQuests, auth: true },
  { pattern: "/messages", component: Messages, auth: true },
  { pattern: "/marketplace", component: Marketplace, auth: true },
  { pattern: "/trade-boards", component: TradeBoards, auth: true },
  { pattern: "/swap", component: Swap, auth: true },
  { pattern: "/profile", component: Profile, auth: true },
  {
    pattern: "/admin",
    component: Admin,
    auth: true,
    roles: ["admin", "host", "cohost"],
  },
  { pattern: "/hoard", component: Hoard, auth: true },
  { pattern: "/leaderboard", component: Leaderboard, auth: false },
  { pattern: "/gallery", component: Gallery, auth: false },
  { pattern: "/links", component: Links, auth: false },
  { pattern: "/faq", component: Faq, auth: false },
  {
    pattern: "/user/:username",
    component: PublicProfile,
    mapProps: (p) => ({ username: p.username }),
    auth: false,
  },
  { pattern: "/messageboard", component: MessageBoard, auth: false },
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

        const Comp = def.component;
        return (
          <WindowPathContext.Provider key={path} value={path}>
            <Comp {...props} />
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
