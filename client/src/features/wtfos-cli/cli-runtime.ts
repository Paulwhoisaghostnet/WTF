import {
  mapBrowserRouteAccess,
  type WtfOsAccessManifest,
  type WtfOsHealthResponse,
} from "@shared/wtfos-cli";
import { evaluateBrowserRouteAccess } from "@shared/wtf-browser-route-access";
import { BROWSER_ROUTE_META } from "@shared/wtf-browser-routes";
import { findAdminSurfaceForPath } from "../../features/admin-os/admin-surface-registry";
import {
  type DesktopAppAvailability,
  getPageAccessState,
  matchPage,
} from "../../routes/page-defs";
import type { UserRoleInput } from "@shared/types";
import { api } from "../../lib/api";

function findSurfaceForPath(path: string) {
  const surface = findAdminSurfaceForPath(path);
  if (!surface) return null;
  return { id: surface.id, desktopAppKey: surface.desktopAppKey };
}

export function createBrowserRemote(input: {
  role: UserRoleInput;
  accessSurfaceIds: readonly string[];
  apps: DesktopAppAvailability;
}) {
  return {
    async getHealth(): Promise<WtfOsHealthResponse> {
      return api.get<WtfOsHealthResponse>("/api/health/diagnostics");
    },
    async getAccess(): Promise<WtfOsAccessManifest> {
      return api.get<WtfOsAccessManifest>("/api/access");
    },
    async checkBrowserRoute(path: string) {
      const state = evaluateBrowserRouteAccess(path, BROWSER_ROUTE_META, {
        role: input.role,
        accessSurfaceIds: input.accessSurfaceIds,
        apps: input.apps,
        findSurfaceForPath,
      });
      return mapBrowserRouteAccess(state);
    },
    async listAccessibleBrowserRoutes() {
      return BROWSER_ROUTE_META.flatMap((route) => {
        if (route.pattern.includes(":")) return [];
        const match = matchPage(route.pattern);
        if (!match) return [];
        const access = getPageAccessState(
          match.def,
          input.role,
          input.accessSurfaceIds,
          input.apps
        );
        if (!access.allowed) return [];
        return [
          {
            path: route.pattern,
            title: route.title ?? route.pattern,
            auth: route.auth,
          },
        ];
      });
    },
  };
}

export { buildBrowserWtfOsCliCommands, indexWtfOsCliCommands } from "./browser-cli-commands";
