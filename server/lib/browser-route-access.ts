import { findAdminSurfaceForPath } from "../../client/src/features/admin-os/admin-surface-registry";
import {
  evaluateBrowserRouteAccess,
  type BrowserRouteAccessState,
  type DesktopAppAvailability,
} from "@shared/wtf-browser-route-access";
import { BROWSER_ROUTE_META } from "@shared/wtf-browser-routes";
import type { UserRoleInput } from "@shared/types";
import { getDesktopAppConfig } from "./desktop-apps";
import { getWtfOsAccessForRoles } from "./role-surface-access";

function findSurfaceForPath(path: string) {
  const surface = findAdminSurfaceForPath(path);
  if (!surface) return null;
  return { id: surface.id, desktopAppKey: surface.desktopAppKey };
}

export async function evaluateBrowserRouteAccessForUser(
  path: string,
  role: UserRoleInput,
  options?: {
    apps?: DesktopAppAvailability;
    accessSurfaceIds?: readonly string[];
  }
): Promise<BrowserRouteAccessState> {
  const appAvailability = options?.apps ?? (await getDesktopAppConfig());
  const accessSurfaceIds =
    options?.accessSurfaceIds ?? (await getWtfOsAccessForRoles(role)).surfaceIds;
  return evaluateBrowserRouteAccess(path, BROWSER_ROUTE_META, {
    role,
    accessSurfaceIds,
    apps: appAvailability,
    findSurfaceForPath,
  });
}

export async function listAccessibleBrowserRoutesForUser(
  role: UserRoleInput,
  options?: {
    apps?: DesktopAppAvailability;
    accessSurfaceIds?: readonly string[];
  }
) {
  const appAvailability = options?.apps ?? (await getDesktopAppConfig());
  const accessSurfaceIds =
    options?.accessSurfaceIds ?? (await getWtfOsAccessForRoles(role)).surfaceIds;
  return BROWSER_ROUTE_META.flatMap((route) => {
    if (route.pattern.includes(":")) return [];
    const state = evaluateBrowserRouteAccess(route.pattern, BROWSER_ROUTE_META, {
      role,
      accessSurfaceIds,
      apps: appAvailability,
      findSurfaceForPath,
    });
    if (!state.allowed) return [];
    return [{ path: route.pattern, title: route.title ?? route.pattern, auth: route.auth }];
  });
}

export { BROWSER_ROUTE_META };
