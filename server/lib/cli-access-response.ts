import {
  formatAnonymousCliRouteAccessDenied,
  formatBrowserRouteAccessDenied,
  type BrowserRouteAccessState,
} from "@shared/wtf-browser-route-access";

/** Public-safe payload for native/in-browser CLI route gate checks. */
export function toPublicCanOpenResponse(state: BrowserRouteAccessState, signedIn: boolean) {
  if (state.allowed) {
    return { allowed: true as const, path: state.path, title: state.title };
  }
  const message = signedIn
    ? formatBrowserRouteAccessDenied(state)
    : formatAnonymousCliRouteAccessDenied(state);
  if (!signedIn) {
    return { allowed: false as const, message };
  }
  return {
    allowed: false as const,
    path: state.path,
    title: state.title,
    reason: state.reason,
    message,
  };
}
