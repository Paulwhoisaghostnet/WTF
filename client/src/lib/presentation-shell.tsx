import { createContext, useContext, type ReactNode } from "react";

export type PresentationHost = "classic" | "beta" | "gamma";

export const PRESENTATION_HOST_SESSION_KEY = "wtfos:presentation-host";

export interface PresentationShellContextValue {
  host: PresentationHost;
}

const PresentationShellContext = createContext<PresentationShellContextValue>({
  host: "classic",
});

export function PresentationShellProvider({
  host,
  children,
}: {
  host: PresentationHost;
  children: ReactNode;
}) {
  return (
    <PresentationShellContext.Provider value={{ host }}>
      {children}
    </PresentationShellContext.Provider>
  );
}

export function usePresentationShell() {
  return useContext(PresentationShellContext);
}

export function readPresentationHostFromSession(): PresentationHost | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(PRESENTATION_HOST_SESSION_KEY);
    return stored === "classic" || stored === "beta" || stored === "gamma"
      ? stored
      : null;
  } catch {
    return null;
  }
}

export function rememberPresentationHost(host: PresentationHost) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PRESENTATION_HOST_SESSION_KEY, host);
  } catch {
    // Session storage can be unavailable in hardened browser contexts.
  }
}

function isGammaRuntime(host?: PresentationHost): boolean {
  if (host === "gamma") return true;
  if (typeof window === "undefined") return false;
  if (window.location.hostname === "beta.wtfos.app") return false;
  if (window.location.pathname === "/beta" || window.location.pathname.startsWith("/beta/")) {
    return false;
  }
  if (window.location.hostname === "gamma.wtfos.app") return true;
  return readPresentationHostFromSession() === "gamma";
}

function localGammaHref(url: URL): string {
  const route = `${url.pathname || "/"}${url.search}${url.hash}`;
  if (url.pathname === "/gamma" || url.pathname.startsWith("/gamma/")) {
    return route;
  }
  if (url.pathname === "/") {
    return `/gamma${url.search}${url.hash}`;
  }
  return `/gamma${route}`;
}

export function presentationRouteHref(route: string, host?: PresentationHost): string {
  if (typeof window === "undefined" || !isGammaRuntime(host)) return route;

  let url: URL;
  try {
    url = new URL(route, window.location.origin);
  } catch {
    return route;
  }

  const sameOrigin = url.origin === window.location.origin;
  const knownWtfHost =
    url.protocol === "https:" &&
    ["wtfos.app", "beta.wtfos.app", "gamma.wtfos.app"].includes(url.hostname);
  if (!sameOrigin && !knownWtfHost) return route;
  if (url.pathname.startsWith("/api/")) return route;

  const routeHref = `${url.pathname || "/"}${url.search}${url.hash}`;
  if (window.location.hostname === "gamma.wtfos.app") {
    return routeHref;
  }
  return localGammaHref(url);
}
