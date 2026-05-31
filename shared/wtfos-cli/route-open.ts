import {
  formatBrowserRouteAccessDenied,
  type BrowserRouteAccessState,
} from "../wtf-browser-route-access";
import type { WtfOsCliBrowserRouteAccess, WtfOsCliRemote } from "./types";

function toCliAccess(state: BrowserRouteAccessState): WtfOsCliBrowserRouteAccess {
  if (state.allowed) {
    return {
      allowed: true,
      path: state.path,
      pattern: state.pattern,
      title: state.title,
    };
  }
  return {
    allowed: false,
    path: state.path,
    pattern: state.pattern,
    reason: state.reason,
    title: state.title,
    message: formatBrowserRouteAccessDenied(state),
  };
}

export async function guardedBrowserRouteOpen(
  remote: WtfOsCliRemote,
  navigate: (path: string) => string,
  path: string
): Promise<string> {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const access = await remote.checkBrowserRoute(normalized);
  if (!access.allowed) {
    return access.message ?? `Access denied for ${normalized}.`;
  }
  return navigate(normalized);
}

export function mapBrowserRouteAccess(state: BrowserRouteAccessState): WtfOsCliBrowserRouteAccess {
  return toCliAccess(state);
}
