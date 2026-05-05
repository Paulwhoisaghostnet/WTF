import {
  Suspense,
  useEffect,
  useRef,
  type ComponentType,
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
import {
  FULLSCREEN_ROUTES,
  matchPage,
} from "./routes/page-defs";
export { PAGE_DEFS, isWindowedRoute, type PageDef } from "./routes/page-defs";

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
