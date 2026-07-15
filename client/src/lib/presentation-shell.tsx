import { createContext, useContext, type ReactNode } from "react";

export type PresentationHost = "classic" | "beta" | "gamma";

export const CANONICAL_PRESENTATION_HOST = "classic" as const;

export const PRESENTATION_SHELL_POLICY = {
  classic: {
    role: "canonical-production",
    evolution: "active",
    route: "/",
  },
  gamma: {
    role: "successor-preview",
    evolution: "compatibility-and-convergence-only",
    route: "/gamma",
  },
  beta: {
    role: "frozen-research",
    evolution: "critical-fixes-only",
    route: "/beta",
  },
} as const satisfies Record<
  PresentationHost,
  { role: string; evolution: string; route: string }
>;

export const PRESENTATION_HOST_SESSION_KEY = "wtfos:presentation-host";

export interface PresentationShellContextValue {
  host: PresentationHost;
}

const PresentationShellContext = createContext<PresentationShellContextValue>({
  host: CANONICAL_PRESENTATION_HOST,
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

function presentationRuntimeHost(host?: PresentationHost): Exclude<PresentationHost, "classic"> | null {
  if (host === "beta" || host === "gamma") return host;
  if (typeof window === "undefined") return null;
  const pathname = window.location.pathname || "/";
  if (window.location.hostname === "beta.wtfos.app") return "beta";
  if (pathname === "/beta" || pathname.startsWith("/beta/")) return "beta";
  if (window.location.hostname === "gamma.wtfos.app") return "gamma";
  if (pathname === "/gamma" || pathname.startsWith("/gamma/")) return "gamma";
  const stored = readPresentationHostFromSession();
  return stored === "beta" || stored === "gamma" ? stored : null;
}

function localPresentationHref(url: URL, host: Exclude<PresentationHost, "classic">): string {
  const route = `${url.pathname || "/"}${url.search}${url.hash}`;
  const prefix = `/${host}`;
  if (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)) {
    return route;
  }
  if (url.pathname === "/") {
    return `${prefix}${url.search}${url.hash}`;
  }
  return `${prefix}${route}`;
}

export function presentationRouteHref(route: string, host?: PresentationHost): string {
  if (typeof window === "undefined") return route;
  const presentationHost = presentationRuntimeHost(host);
  if (!presentationHost) return route;

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
  if (window.location.hostname === `${presentationHost}.wtfos.app`) {
    return routeHref;
  }
  return localPresentationHref(url, presentationHost);
}
