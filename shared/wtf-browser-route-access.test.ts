import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateBrowserRouteAccess,
  formatAnonymousCliRouteAccessDenied,
  matchBrowserRouteMeta,
} from "./wtf-browser-route-access.ts";
import { BROWSER_ROUTE_META } from "./wtf-browser-routes.ts";

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

test("formatAnonymousCliRouteAccessDenied uses generic copy for all reasons", () => {
  const unknown = formatAnonymousCliRouteAccessDenied({
    allowed: false,
    path: "/secret-path",
    pattern: "/secret-path",
    reason: "unknown-route",
  });
  const auth = formatAnonymousCliRouteAccessDenied({
    allowed: false,
    path: "/admin",
    pattern: "/admin",
    reason: "auth-required",
    title: "Admin Panel",
  });
  assert.equal(unknown, auth);
  assert.doesNotMatch(unknown, /secret-path|Admin Panel/);
});
