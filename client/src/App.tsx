import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  type ComponentType,
} from "react";
import isPropValid from "@emotion/is-prop-valid";
import { StyleSheetManager } from "styled-components";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { DESKTOP_APPS, type DesktopAppKey } from "@shared/types";
import { queryClient } from "./lib/query-client";
import { api } from "./lib/api";
import { AuthProvider, useAuth } from "./lib/auth-context";
import { LocalizationProvider, useLocalization } from "./lib/localization";
import { logClientSystemEvent } from "./lib/system-log";
import { MusicPlayerProvider } from "./features/music/MusicPlayerContext";
import { WalletProvider } from "./lib/wallet-context";
import { EtherlinkWalletProvider } from "./lib/etherlink";
import { GlobalStyles } from "./global-styles";
import { WtfOsAppearanceProvider } from "./features/appearance/WtfOsAppearanceProvider";
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
import { readPresentationHostFromSession } from "./lib/presentation-shell";
import {
  getPageAccessState,
  type DesktopAppAvailability,
  isFullscreenRoute,
  matchPage,
} from "./routes/page-defs";
export { PAGE_DEFS, isWindowedRoute, type PageDef } from "./routes/page-defs";

const EMPTY_DESKTOP_APP_AVAILABILITY: DesktopAppAvailability = {};
const DISABLED_DESKTOP_APP_AVAILABILITY = Object.fromEntries(
  DESKTOP_APPS.map((key) => [key, false])
) as DesktopAppAvailability;

function isSkywireStandaloneHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "skywire.wtfos.app";
}

function isBetaHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "beta.wtfos.app";
}

function isGammaHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "gamma.wtfos.app";
}

function isObjktOperatorHost(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === "operator.wtfos.app";
}

function isGammaShellLocation(location: string): boolean {
  if (isGammaHost()) return true;
  if (isBetaHost()) return false;
  const pathname = location.split("?")[0]?.split("#")[0] ?? location;
  if (pathname === "/gamma" || pathname.startsWith("/gamma/")) return true;
  if (pathname === "/beta" || pathname.startsWith("/beta/")) return false;
  if (readPresentationHostFromSession() !== "gamma") return false;
  if (pathname === "/") return true;
  return Boolean(matchPage(location));
}

function isBetaShellLocation(location: string): boolean {
  if (isBetaHost()) return true;
  if (isGammaHost()) return false;
  const pathname = location.split("?")[0]?.split("#")[0] ?? location;
  if (pathname === "/beta" || pathname.startsWith("/beta/")) return true;
  if (pathname === "/gamma" || pathname.startsWith("/gamma/")) return false;
  if (readPresentationHostFromSession() !== "beta") return false;
  if (pathname === "/") return true;
  return Boolean(matchPage(location));
}

function locationHasSkywireStandaloneFlag(location: string): boolean {
  const query =
    location.split("?")[1]?.split("#")[0] ||
    (typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "");
  return new URLSearchParams(query).get("standalone") === "1";
}

function skywireStandaloneRouteLocation(location: string): string | null {
  if (isSkywireStandaloneHost()) {
    return location.startsWith("/skywire") ? location : "/skywire";
  }
  if (location.startsWith("/skywire") && locationHasSkywireStandaloneFlag(location)) {
    return location;
  }
  return null;
}

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
  const { t, translateSystemText } = useLocalization();
  const localizedTitle = translateSystemText(title);

  return (
    <AppWindow title={t("appWindow.crashedTitle", { title: localizedTitle })}>
      <div
        role="alert"
        style={{
          display: "grid",
          gap: 10,
          maxWidth: 680,
          padding: 8,
        }}
      >
        <strong>{t("appWindow.renderErrorTitle")}</strong>
        <span>
          {t("appWindow.renderErrorBody")}
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
            {t("common.retry")}
          </button>
          <button type="button" onClick={onClose}>
            {t("appWindow.close", { title: path })}
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
  const { t, translateSystemText } = useLocalization();
  const localizedTitle = translateSystemText(title);
  const localizedLabel = translateSystemText(appLabel);

  useEffect(() => {
    logClientSystemEvent({
      eventType: "desktop.app.disabled_by_admin",
      metadata: { appKey, appLabel, title },
    });
  }, [appKey, appLabel, title]);

  return (
    <AppWindow title={t("appWindow.disabledTitle", { title: localizedTitle })}>
      <div
        role="alert"
        style={{
          display: "grid",
          gap: 10,
          maxWidth: 520,
          padding: 8,
        }}
      >
        <strong>{t("appWindow.disabledHeading", { label: localizedLabel })}</strong>
        <span>{t("appWindow.disabledBody")}</span>
        <div>
          <button type="button" onClick={onClose}>
            {t("common.close")}
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
        contain: "layout paint style",
        isolation: "isolate",
      }}
    >
      {children}
    </div>
  );
}

function FullscreenRouteRenderer({
  match,
}: {
  match: NonNullable<ReturnType<typeof matchPage>>;
}) {
  const Comp = match.def.component as ComponentType<any>;
  return (
    <FullScreenOverlay>
      <ErrorBoundary
        resetKey={match.def.pattern}
        fallback={(error) => (
          <div role="alert" style={{ padding: 16, background: "#ececec", color: "#050505" }}>
            <strong>This page hit a render error.</strong>
            <pre style={{ whiteSpace: "pre-wrap" }}>{error?.message || String(error)}</pre>
          </div>
        )}
      >
        <Suspense
          fallback={
            <div
              style={{
                minHeight: "100vh",
                display: "grid",
                placeItems: "center",
                background: "#008080",
              }}
            >
              <Hourglass size={32} />
            </div>
          }
        >
          <Comp {...match.props} />
        </Suspense>
      </ErrorBoundary>
    </FullScreenOverlay>
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
    if (isFullscreenRoute(location)) return;

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
    } else if (wm.focusedPath !== location || wm.isMinimized(location)) {
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
  const { t } = useLocalization();
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

  useEffect(() => {
    if (isObjktOperatorHost() && location === "/") {
      setLocation("/objkt-operator", { replace: true });
    }
  }, [location, setLocation]);

  const showLogin = location === "/login";
  const showRegister = location === "/register";
  const showLanding = location === "/" && !user;
  const authOverlayActive = showLogin || showRegister || showLanding;
  const gammaShellMatch = isGammaShellLocation(location) ? matchPage("/gamma") : null;
  const betaShellMatch = isBetaShellLocation(location) ? matchPage("/beta") : null;
  const skywireStandaloneLocation = skywireStandaloneRouteLocation(location);
  const skywireStandaloneMatch = skywireStandaloneLocation
    ? matchPage(skywireStandaloneLocation)
    : null;
  const fullscreenMatch = matchPage(location);
  const routeOnlyFullscreen =
    fullscreenMatch &&
    isFullscreenRoute(location) &&
    location !== "/" &&
    location !== "/login" &&
    location !== "/register" &&
    location !== "/cli";
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

  if (gammaShellMatch) {
    return <FullscreenRouteRenderer match={gammaShellMatch} />;
  }

  if (betaShellMatch) {
    return <FullscreenRouteRenderer match={betaShellMatch} />;
  }

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
            fontFamily: "var(--wtf-mono-font)",
          }}
        >
          {t("common.loadingCli")}
        </div>
      );
    }
    return <WtfOsCliShell />;
  }

  if (skywireStandaloneMatch) {
    return <FullscreenRouteRenderer match={skywireStandaloneMatch} />;
  }

  if (routeOnlyFullscreen) {
    return <FullscreenRouteRenderer match={fullscreenMatch} />;
  }

  return (
    <WindowManagerProvider navigate={setLocation} currentLocation={location}>
      <URLSync appAvailability={appAvailability} />
      <Desktop
        showTaskbar={!authOverlayActive}
        suspendDesktopEffects={authOverlayActive}
      >
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
        <AuthProvider>
          <LocalizationProvider>
            <WtfOsAppearanceProvider>
              <GlobalStyles />
              <WalletProvider>
                <EtherlinkWalletProvider>
                  <MusicPlayerProvider>
                    <AppContent />
                  </MusicPlayerProvider>
                </EtherlinkWalletProvider>
              </WalletProvider>
            </WtfOsAppearanceProvider>
          </LocalizationProvider>
        </AuthProvider>
      </StyleSheetManager>
    </QueryClientProvider>
  );
}
