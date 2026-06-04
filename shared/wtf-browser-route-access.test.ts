import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateBrowserRouteAccess,
  formatAnonymousCliRouteAccessDenied,
  matchBrowserRouteMeta,
} from "./wtf-browser-route-access";
import { BROWSER_ROUTE_META } from "./wtf-browser-routes";

const findSurface = (path: string) => {
  if (path.startsWith("/admin")) return { id: "admin", desktopAppKey: undefined };
  if (path.startsWith("/arcade")) return { id: "arcade", desktopAppKey: "arcade" as const };
  if (path.startsWith("/mission-control")) return { id: "mission-control", desktopAppKey: undefined };
  return null;
};

test("matchBrowserRouteMeta resolves parameterized routes", () => {
  assert.equal(matchBrowserRouteMeta("/rounds/42", BROWSER_ROUTE_META)?.pattern, "/rounds/:id");
});

test("evaluateBrowserRouteAccess requires auth for session routes", () => {
  const state = evaluateBrowserRouteAccess("/mission-control", BROWSER_ROUTE_META, {
    role: null,
    accessSurfaceIds: [],
    apps: {},
    findSurfaceForPath: findSurface,
  });
  assert.equal(state.allowed, false);
  if (!state.allowed) assert.equal(state.reason, "auth-required");
});

test("evaluateBrowserRouteAccess denies admin routes for contestants", () => {
  const state = evaluateBrowserRouteAccess("/admin", BROWSER_ROUTE_META, {
    role: "contestant",
    accessSurfaceIds: [],
    apps: {},
    findSurfaceForPath: findSurface,
  });
  assert.equal(state.allowed, false);
  if (!state.allowed) assert.equal(state.reason, "role-denied");
});

test("evaluateBrowserRouteAccess honors disabled desktop apps", () => {
  const state = evaluateBrowserRouteAccess("/arcade", BROWSER_ROUTE_META, {
    role: "contestant",
    accessSurfaceIds: [],
    apps: { arcade: false },
    findSurfaceForPath: findSurface,
  });
  assert.equal(state.allowed, false);
  if (!state.allowed) assert.equal(state.reason, "app-disabled");
});

test("evaluateBrowserRouteAccess allows public routes anonymously", () => {
  const state = evaluateBrowserRouteAccess("/leaderboard", BROWSER_ROUTE_META, {
    role: null,
    accessSurfaceIds: [],
    apps: {},
    findSurfaceForPath: findSurface,
  });
  assert.equal(state.allowed, true);
});

test("evaluateBrowserRouteAccess allows anonymous WTF LIVE room links only on the public room route", () => {
  const publicRoom = evaluateBrowserRouteAccess("/live/r/wtf-live", BROWSER_ROUTE_META, {
    role: null,
    accessSurfaceIds: [],
    apps: {},
    findSurfaceForPath: findSurface,
  });
  const hostDashboard = evaluateBrowserRouteAccess("/live", BROWSER_ROUTE_META, {
    role: null,
    accessSurfaceIds: [],
    apps: {},
    findSurfaceForPath: findSurface,
  });
  assert.equal(publicRoom.allowed, true);
  assert.equal(hostDashboard.allowed, false);
  if (!hostDashboard.allowed) assert.equal(hostDashboard.reason, "auth-required");
});

test("formatAnonymousCliRouteAccessDenied uses generic copy for all reasons", () => {
  const unknown = formatAnonymousCliRouteAccessDenied({
    allowed: false,
    path: "/secret-path",
    pattern: "/secret-path",
    reason: "unknown-route",
    surfaceId: null,
    appKey: null,
  });
  const auth = formatAnonymousCliRouteAccessDenied({
    allowed: false,
    path: "/admin",
    pattern: "/admin",
    reason: "auth-required",
    surfaceId: "admin",
    appKey: null,
    title: "Admin Panel",
  });
  assert.equal(unknown, auth);
  assert.doesNotMatch(unknown, /secret-path|Admin Panel/);
});
