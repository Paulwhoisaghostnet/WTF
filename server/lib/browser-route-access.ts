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
  apps?: DesktopAppAvailability
): Promise<BrowserRouteAccessState> {
  const appAvailability = apps ?? (await getDesktopAppConfig());
  const access = await getWtfOsAccessForRoles(role);
  return evaluateBrowserRouteAccess(path, BROWSER_ROUTE_META, {
    role,
    accessSurfaceIds: access.surfaceIds,
    apps: appAvailability,
    findSurfaceForPath,
  });
}

export async function listAccessibleBrowserRoutesForUser(
  role: UserRoleInput,
  apps?: DesktopAppAvailability
) {
  const appAvailability = apps ?? (await getDesktopAppConfig());
  const access = await getWtfOsAccessForRoles(role);
  return BROWSER_ROUTE_META.flatMap((route) => {
    if (route.pattern.includes(":")) return [];
    const state = evaluateBrowserRouteAccess(route.pattern, BROWSER_ROUTE_META, {
      role,
      accessSurfaceIds: access.surfaceIds,
      apps: appAvailability,
      findSurfaceForPath,
    });
    if (!state.allowed) return [];
    return [{ path: route.pattern, title: route.title ?? route.pattern, auth: route.auth }];
  });
}

export { BROWSER_ROUTE_META };
