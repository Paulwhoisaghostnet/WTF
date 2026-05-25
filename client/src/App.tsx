import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ComponentType,
} from "react";
import isPropValid from "@emotion/is-prop-valid";
import { StyleSheetManager, ThemeProvider } from "styled-components";
import original from "react95/dist/themes/original";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { DESKTOP_APPS, type DesktopAppKey } from "@shared/types";
import { queryClient } from "./lib/query-client";
import { api } from "./lib/api";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { MusicPlayerProvider } from "./features/music/MusicPlayerContext";
import { WalletProvider } from "./lib/wallet-context";
import { EtherlinkWalletProvider } from "./lib/etherlink";
import { GlobalStyles } from "./global-styles";
import { Desktop } from "./components/layout/Desktop";
import { CommandPalette } from "./components/layout/CommandPalette";
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
  getPageAccessState,
  type DesktopAppAvailability,
  FULLSCREEN_ROUTES,
  matchPage,
} from "./routes/page-defs";
import { logClientSystemEvent } from "./lib/system-log";
export { PAGE_DEFS, isWindowedRoute, type PageDef } from "./routes/page-defs";

const EMPTY_DESKTOP_APP_AVAILABILITY: DesktopAppAvailability = {};
const DISABLED_DESKTOP_APP_AVAILABILITY = Object.fromEntries(
  DESKTOP_APPS.map((key) => [key, false])
) as Record<DesktopAppKey, boolean>;

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

function AdminDisabledAppFallback({
  appLabel,
  onClose,
}: {
  appLabel: string;
  onClose: () => void;
}) {
  return (
    <AppWindow title={`${appLabel} disabled`}>
      <div
        role="alert"
        style={{
          display: "grid",
          gap: 10,
          maxWidth: 520,
          padding: 8,
        }}
      >
        <strong>{appLabel} has been disabled by admin.</strong>
        <span>
          This app is currently unavailable. Ask an admin to re-enable it or
          adjust your role access before trying again.
        </span>
        <div>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </AppWindow>
  );
}

function WindowRenderer({
  appAvailability,
  appAvailabilityReady,
}: {
  appAvailability: DesktopAppAvailability;
  appAvailabilityReady: boolean;
}) {
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
        }
        const preliminaryState = getPageAccessState(def, user?.role ?? null);
        if (!appAvailabilityReady && preliminaryState.appKey) {
          return (
            <WindowPathContext.Provider key={path} value={path}>
              <AppWindow title={def.title ?? "App"}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    minHeight: 180,
                  }}
                >
                  <Hourglass size={32} />
                </div>
              </AppWindow>
            </WindowPathContext.Provider>
          );
        }

        const accessState = getPageAccessState(
          def,
          user?.role ?? null,
          [],
          appAvailability
        );
        if (!accessState.allowed) {
          if (accessState.reason === "app-disabled") {
            return (
              <WindowPathContext.Provider key={path} value={path}>
                <AdminDisabledAppFallback
                  appLabel={accessState.appLabel ?? def.title ?? "This app"}
                  onClose={() => wm.close(path)}
                />
              </WindowPathContext.Provider>
            );
          }
          return null;
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

function URLSync({ appAvailability }: { appAvailability: DesktopAppAvailability }) {
  const [location, setLocation] = useLocation();
  const wm = useWindowManager();
  const { user, isLoading } = useAuth();
  const initialised = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    for (const path of wm.openPages) {
      const match = matchPage(path);
      if (!match) continue;
      const accessState = getPageAccessState(
        match.def,
        user?.role ?? null,
        [],
        appAvailability
      );
      if (!accessState.allowed && accessState.reason !== "app-disabled") {
        wm.close(path);
      }
    }
  }, [appAvailability, isLoading, user?.role, wm.openPages]);

  useEffect(() => {
    if (isLoading) return;
    if (FULLSCREEN_ROUTES.has(location)) return;

    const match = matchPage(location);
    if (!match) return;

    const accessState = getPageAccessState(
      match.def,
      user?.role ?? null,
      [],
      appAvailability
    );
    if (!accessState.allowed && accessState.reason !== "app-disabled") {
      setLocation("/", { replace: true });
      return;
    }

    if (!wm.openPages.includes(location)) {
      wm.openPage(location);
    } else if (wm.focusedPath !== location) {
      wm.focus(location);
    }
    initialised.current = true;
  }, [appAvailability, isLoading, location, setLocation, user?.role]);

  return null;
}

/* ═══ AppContent ═════════════════════════════════════ */

function AppContent() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const desktopAppsQuery = useQuery({
    queryKey: ["desktop", "apps"],
    queryFn: () =>
      api.get<{ apps: Record<DesktopAppKey, boolean> }>("/api/apps/desktop"),
    staleTime: 30_000,
  });

  const appAvailabilityReady = Boolean(desktopAppsQuery.data?.apps);
  const appAvailability = useMemo<DesktopAppAvailability>(
    () =>
      appAvailabilityReady
        ? desktopAppsQuery.data?.apps ?? EMPTY_DESKTOP_APP_AVAILABILITY
        : DISABLED_DESKTOP_APP_AVAILABILITY,
    [appAvailabilityReady, desktopAppsQuery.data?.apps]
  );

  useEffect(() => {
    if (!appAvailabilityReady) return;
    const match = matchPage(location);
    if (!match) return;
    const accessState = getPageAccessState(
      match.def,
      user?.role ?? null,
      [],
      appAvailability
    );
    if (accessState.allowed || accessState.reason !== "app-disabled") return;
    logClientSystemEvent({
      eventType: "desktop.app.disabled_by_admin",
      metadata: {
        path: location,
        appKey: accessState.appKey,
        appLabel: accessState.appLabel,
      },
    });
  }, [appAvailability, appAvailabilityReady, location, user?.role]);

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
      <URLSync appAvailability={appAvailability} />
      <Desktop>
        <WindowRenderer
          appAvailability={appAvailability}
          appAvailabilityReady={appAvailabilityReady}
        />
        <WelcomeMessage />
        <CommandPalette
          role={user?.role ?? null}
          navigate={setLocation}
          appAvailability={appAvailability}
        />
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
                <MusicPlayerProvider>
                  <AppContent />
                </MusicPlayerProvider>
              </EtherlinkWalletProvider>
            </WalletProvider>
          </AuthProvider>
        </ThemeProvider>
      </StyleSheetManager>
    </QueryClientProvider>
  );
}
