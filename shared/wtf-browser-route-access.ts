import {
  userEligibleForSkywireRollout,
  userEligibleForWtfLive,
} from "./skywire-rollout";
import {
  DESKTOP_APP_LABELS,
  canOpenAppsForRole,
  normalizeUserRoles,
  type DesktopAppKey,
  type UserRole,
  type UserRoleInput,
} from "./types";

export type BrowserRouteMeta = {
  pattern: string;
  auth: boolean;
  roles?: UserRole[];
  title?: string;
};

export type DesktopAppAvailability = Partial<Record<DesktopAppKey, boolean>>;

export type BrowserRouteAccessDeniedReason =
  | "unknown-route"
  | "time-out"
  | "auth-required"
  | "app-disabled"
  | "role-denied";

export type BrowserRouteAccessState =
  | {
      allowed: true;
      path: string;
      pattern: string;
      surfaceId: string | null;
      appKey: DesktopAppKey | null;
      title?: string;
    }
  | {
      allowed: false;
      path: string;
      pattern: string;
      reason: BrowserRouteAccessDeniedReason;
      surfaceId: string | null;
      appKey: DesktopAppKey | null;
      appLabel?: string;
      title?: string;
    };

export type BrowserRouteSurfaceLookup = (
  path: string
) => { id: string; desktopAppKey?: DesktopAppKey } | null;

function canBypassDesktopAppGate(role: UserRoleInput): boolean {
  const roles = normalizeUserRoles(role);
  return roles.includes("admin") || roles.includes("trusted_creator");
}

function patternToRegex(pattern: string): RegExp {
  const regexStr = pattern.replace(/:(\w+)/g, "[^/]+");
  return new RegExp(`^${regexStr}$`);
}

export function matchBrowserRouteMeta(
  path: string,
  routes: readonly BrowserRouteMeta[]
): BrowserRouteMeta | null {
  const cleanPath = path.split("?")[0]?.split("#")[0] ?? path;
  for (const route of routes) {
    if (patternToRegex(route.pattern).test(cleanPath)) return route;
  }
  return null;
}

export function evaluateBrowserRouteAccess(
  path: string,
  routes: readonly BrowserRouteMeta[],
  input: {
    role: UserRoleInput;
    accessSurfaceIds: readonly string[];
    apps: DesktopAppAvailability;
    findSurfaceForPath: BrowserRouteSurfaceLookup;
  }
): BrowserRouteAccessState {
  const cleanPath = path.startsWith("/") ? path.split("?")[0]?.split("#")[0] ?? path : `/${path}`;
  const route = matchBrowserRouteMeta(cleanPath, routes);
  if (!route) {
    return {
      allowed: false,
      path: cleanPath,
      pattern: cleanPath,
      reason: "unknown-route",
      surfaceId: null,
      appKey: null,
    };
  }

  const roles = normalizeUserRoles(input.role);
  const surface = input.findSurfaceForPath(cleanPath);
  const surfaceId = surface?.id ?? null;
  const appKey = surface?.desktopAppKey ?? null;

  if (!canOpenAppsForRole(roles)) {
    return {
      allowed: false,
      path: cleanPath,
      pattern: route.pattern,
      reason: "time-out",
      surfaceId,
      appKey,
      title: route.title,
    };
  }

  if (route.auth && roles.length === 0) {
    return {
      allowed: false,
      path: cleanPath,
      pattern: route.pattern,
      reason: "auth-required",
      surfaceId,
      appKey,
      title: route.title,
    };
  }

  if (appKey && input.apps[appKey] === false && !canBypassDesktopAppGate(roles)) {
    return {
      allowed: false,
      path: cleanPath,
      pattern: route.pattern,
      reason: "app-disabled",
      surfaceId,
      appKey,
      appLabel: DESKTOP_APP_LABELS[appKey],
      title: route.title,
    };
  }

  if (cleanPath === "/skywire" && !userEligibleForSkywireRollout(roles)) {
    return {
      allowed: false,
      path: cleanPath,
      pattern: route.pattern,
      reason: "role-denied",
      surfaceId,
      appKey,
      title: route.title,
    };
  }

  if (cleanPath === "/live" && !userEligibleForWtfLive(roles)) {
    return {
      allowed: false,
      path: cleanPath,
      pattern: route.pattern,
      reason: "role-denied",
      surfaceId,
      appKey,
      title: route.title,
    };
  }

  if (surfaceId && input.accessSurfaceIds.includes(surfaceId)) {
    return {
      allowed: true,
      path: cleanPath,
      pattern: route.pattern,
      surfaceId,
      appKey,
      title: route.title,
    };
  }

  if (route.roles && !route.roles.some((required) => roles.includes(required))) {
    return {
      allowed: false,
      path: cleanPath,
      pattern: route.pattern,
      reason: "role-denied",
      surfaceId,
      appKey,
      title: route.title,
    };
  }

  return {
    allowed: true,
    path: cleanPath,
    pattern: route.pattern,
    surfaceId,
    appKey,
    title: route.title,
  };
}

export function formatBrowserRouteAccessDenied(state: Extract<BrowserRouteAccessState, { allowed: false }>) {
  switch (state.reason) {
    case "unknown-route":
      return `Not a registered wtfOS browser route: ${state.path}`;
    case "auth-required":
      return "Sign in required. Use `wtfos login` or open the web UI.";
    case "time-out":
      return "This account is timed out and cannot open wtfOS routes.";
    case "app-disabled":
      return `${state.appLabel ?? state.appKey ?? "This app"} is disabled by admin.`;
    case "role-denied":
      return `Your account cannot open ${state.title ?? state.path}. Same gate as the browser UI.`;
    default:
      return `Access denied for ${state.path}.`;
  }
}
