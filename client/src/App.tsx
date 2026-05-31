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
import { logClientSystemEvent } from "./lib/system-log";
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
import { WtfOsCliShell } from "./features/wtfos-cli/WtfOsCliShell";
import { getInterfaceMode } from "./features/wtfos-cli/interface-mode";
import {
  getPageAccessState,
  type DesktopAppAvailability,
  FULLSCREEN_ROUTES,
  matchPage,
} from "./routes/page-defs";
export { PAGE_DEFS, isWindowedRoute, type PageDef } from "./routes/page-defs";

const EMPTY_DESKTOP_APP_AVAILABILITY: DesktopAppAvailability = {};
const DISABLED_DESKTOP_APP_AVAILABILITY = Object.fromEntries(
  DESKTOP_APPS.map((key) => [key, false])
) as DesktopAppAvailability;

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
  title,
  appLabel,
  appKey,
  onClose,
}: {
  title: string;
  appLabel: string;
  appKey: DesktopAppKey | null;
  onClose: () => void;
}) {
  useEffect(() => {
    logClientSystemEvent({
      eventType: "desktop.app.disabled_by_admin",
      metadata: { appKey, appLabel, title },
    });
  }, [appKey, appLabel, title]);

  return (
    <AppWindow title={`${title} - disabled`}>
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
          adjust role access before trying again.
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
  const roleInput = user?.roles ?? user?.role ?? null;
  const accessSurfaceIds = user?.wtfOsAccess?.surfaceIds ?? [];

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
        const preliminaryState = getPageAccessState(def, roleInput, accessSurfaceIds);
        if (!appAvailabilityReady && preliminaryState.appKey) {
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
        const accessState = getPageAccessState(
          def,
          roleInput,
          accessSurfaceIds,
          appAvailability
        );
        if (!accessState.allowed) {
          if (accessState.reason === "app-disabled") {
            const title = def.title ?? (path.replace(/^\//, "") || "App");
            return (
              <WindowPathContext.Provider key={path} value={path}>
                <AdminDisabledAppFallback
                  title={title}
                  appLabel={accessState.appLabel ?? title}
                  appKey={accessState.appKey}
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
  const roleInput = user?.roles ?? user?.role ?? null;
  const accessSurfaceIds = user?.wtfOsAccess?.surfaceIds ?? [];

  useEffect(() => {
    if (isLoading) return;
    for (const path of wm.openPages) {
      const match = matchPage(path);
      if (!match) continue;
      const accessState = getPageAccessState(
        match.def,
        roleInput,
        accessSurfaceIds,
        appAvailability
      );
      if (!accessState.allowed && accessState.reason !== "app-disabled") {
        wm.close(path);
      }
    }
  }, [accessSurfaceIds, appAvailability, isLoading, roleInput, wm.openPages]);

  useEffect(() => {
    if (isLoading) return;
    if (FULLSCREEN_ROUTES.has(location)) return;

    const match = matchPage(location);
    if (!match) return;

    const accessState = getPageAccessState(
      match.def,
      roleInput,
      accessSurfaceIds,
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
  }, [accessSurfaceIds, appAvailability, isLoading, location, roleInput, setLocation]);

  return null;
}

/* ═══ AppContent ═════════════════════════════════════ */

function AppContent() {
  const [location, setLocation] = useLocation();
  const { user, isLoading } = useAuth();
  const roleInput = user?.roles ?? user?.role ?? null;
  const desktopAppsQuery = useQuery({
    queryKey: ["desktop", "apps"],
    queryFn: () =>
      api.get<{ apps: Record<DesktopAppKey, boolean> }>("/api/apps/desktop"),
    staleTime: 30_000,
  });
  const appAvailabilityReady = Boolean(desktopAppsQuery.data?.apps);
  const appAvailability = appAvailabilityReady
    ? desktopAppsQuery.data?.apps ?? EMPTY_DESKTOP_APP_AVAILABILITY
    : DISABLED_DESKTOP_APP_AVAILABILITY;

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
  const authOverlayActive = showLogin || showRegister || showLanding;
  useEffect(() => {
    if (isLoading) return;
    if (location === "/cli" && !user) {
      setLocation("/login", { replace: true });
      return;
    }
    if (!user || authOverlayActive) return;
    if (getInterfaceMode() === "cli" && location !== "/cli") {
      setLocation("/cli", { replace: true });
    }
  }, [authOverlayActive, isLoading, location, setLocation, user]);

  if (location === "/cli") {
    if (isLoading || !user) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            background: "#050505",
            color: "#d8ffd0",
            fontFamily: "monospace",
          }}
        >
          Loading wtfOS CLI…
        </div>
      );
    }
    return <WtfOsCliShell />;
  }

  return (
    <WindowManagerProvider navigate={setLocation} currentLocation={location}>
      <URLSync appAvailability={appAvailability} />
      <Desktop showTaskbar={!authOverlayActive}>
        <WindowRenderer
          appAvailability={appAvailability}
          appAvailabilityReady={appAvailabilityReady}
        />
        <WelcomeMessage />
        <CommandPalette
          role={roleInput}
          accessSurfaceIds={user?.wtfOsAccess?.surfaceIds ?? []}
          appAvailability={appAvailability}
          navigate={setLocation}
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
