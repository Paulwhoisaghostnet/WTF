import {
  Suspense,
  useEffect,
  useRef,
  type ComponentType,
} from "react";
import isPropValid from "@emotion/is-prop-valid";
import { StyleSheetManager, ThemeProvider } from "styled-components";
import original from "react95/dist/themes/original";
import { QueryClientProvider } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { queryClient } from "./lib/query-client";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { WalletProvider } from "./lib/wallet-context";
import { EtherlinkWalletProvider } from "./lib/etherlink";
import { GlobalStyles } from "./global-styles";
import { Desktop } from "./components/layout/Desktop";
import { AppWindow } from "./components/layout/AppWindow";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WelcomeMessage } from "./components/WelcomeMessage";
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

function WindowCrashFallback({
  title,
  path,
  error,
  onReset,
  onClose,
}: {
  title: string;
  path: string;
  error: Error | null;
  onReset: () => void;
  onClose: () => void;
}) {
  const isDev = import.meta.env.DEV;

  return (
    <AppWindow title={`${title} - crashed`}>
      <div
        role="alert"
        style={{
          display: "grid",
          gap: 10,
          maxWidth: 680,
          padding: 8,
        }}
      >
        <strong>This app hit a render error.</strong>
        <span>
          The rest of WTF OS is still running. You can retry this window or close
          it and keep working.
        </span>
        {isDev && error ? (
          <pre
            style={{
              maxHeight: 260,
              overflow: "auto",
              margin: 0,
              padding: 8,
              background: "#111",
              color: "#f4f4f4",
              fontSize: 11,
              whiteSpace: "pre-wrap",
            }}
          >
            {error.stack || String(error)}
          </pre>
        ) : null}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" onClick={onReset}>
            Retry
          </button>
          <button type="button" onClick={onClose}>
            Close {path}
          </button>
        </div>
      </div>
    </AppWindow>
  );
}

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
        const title = def.title ?? (path.replace(/^\//, "") || "App");
        return (
          <WindowPathContext.Provider key={path} value={path}>
            <ErrorBoundary
              resetKey={path}
              fallback={(error, reset) => (
                <WindowCrashFallback
                  title={title}
                  path={path}
                  error={error}
                  onReset={reset}
                  onClose={() => wm.close(path)}
                />
              )}
            >
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
            </ErrorBoundary>
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

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.location.hostname === "dues.wtfgameshow.app" &&
      location === "/"
    ) {
      setLocation("/dues", { replace: true });
    }
  }, [location, setLocation]);

  const showLogin = location === "/login";
  const showRegister = location === "/register";
  const showLanding = location === "/" && !user;

  return (
    <WindowManagerProvider navigate={setLocation} currentLocation={location}>
      <URLSync />
      <Desktop>
        <WindowRenderer />
        <WelcomeMessage />
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
      <StyleSheetManager
        shouldForwardProp={(prop, target) =>
          typeof target === "string" ? isPropValid(prop) : true
        }
      >
        <ThemeProvider theme={original}>
          <GlobalStyles />
          <AuthProvider>
            <WalletProvider>
              <EtherlinkWalletProvider>
                <AppContent />
              </EtherlinkWalletProvider>
            </WalletProvider>
          </AuthProvider>
        </ThemeProvider>
      </StyleSheetManager>
    </QueryClientProvider>
  );
}
