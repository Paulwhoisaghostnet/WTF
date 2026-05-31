import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { DESKTOP_APPS } from "@shared/types";
import {
  ALL_ADMIN_SURFACES,
  ADMIN_SURFACES,
  findAdminSurfaceForPath,
  getAdminSurfaceDoctrineDomain,
} from "./admin-surface-registry";

function surfaceById(id: string) {
  return ADMIN_SURFACES.find((surface) => surface.id === id);
}

test("admin registry includes every canonical Phase 4 shell surface", () => {
  for (const id of [
    "mission-control",
    "command-palette",
    "notifications",
    "recovery-mode",
    "backup-manager",
    "desktop-appearance",
    "system-settings",
    "browser-boundaries",
    "terminal",
    "cli",
    "file-manager",
  ]) {
    assert(surfaceById(id), `${id} should be registered for admin observability`);
  }
});

test("admin registry resolves Mission Control and Recovery Mode routes", () => {
  assert.equal(findAdminSurfaceForPath("/mission-control")?.id, "mission-control");
  assert.equal(findAdminSurfaceForPath("/recovery-mode")?.id, "recovery-mode");
  assert.equal(findAdminSurfaceForPath("/browser-boundaries")?.id, "browser-boundaries");
  assert.equal(findAdminSurfaceForPath("/digest")?.id, "digest");
});

test("admin registry tracks current shell event handles", () => {
  assert(surfaceById("mission-control")?.automationHandles.includes("mission_control.action_opened"));
  assert(surfaceById("recovery-mode")?.automationHandles.includes("recovery_mode.action_opened"));
  assert(surfaceById("recovery-mode")?.automationHandles.includes("recovery_mode.filesystem_checked"));
  assert(surfaceById("browser-boundaries")?.automationHandles.includes("browser_boundaries.action_opened"));
  assert(surfaceById("notifications")?.automationHandles.includes("notification_center.viewed"));
});

test("admin registry covers every desktop app key", () => {
  for (const appKey of DESKTOP_APPS) {
    const surface = ALL_ADMIN_SURFACES.find((candidate) => candidate.desktopAppKey === appKey);
    assert(surface, `${appKey} should have admin observability`);
    assert(surface.routePatterns.length > 0, `${appKey} should have route patterns`);
    assert(surface.nativeSettings.length > 0, `${appKey} should have native settings`);
  }
});

test("admin registry exact app routes resolve to their owning app surface", () => {
  for (const surface of ADMIN_SURFACES) {
    if (surface.kind !== "app" && surface.kind !== "public-surface") continue;
    for (const routePattern of surface.routePatterns) {
      if (!routePattern.startsWith("/") || routePattern.includes(":")) continue;
      assert.equal(
        findAdminSurfaceForPath(routePattern)?.id,
        surface.id,
        `${routePattern} should resolve to ${surface.id}`
      );
    }
  }
});

test("desktop app admin surface bindings are one-to-one", () => {
  const counts = new Map<string, number>();
  for (const surface of ALL_ADMIN_SURFACES) {
    if (!surface.desktopAppKey) continue;
    counts.set(surface.desktopAppKey, (counts.get(surface.desktopAppKey) ?? 0) + 1);
  }

  for (const appKey of DESKTOP_APPS) {
    assert.equal(counts.get(appKey), 1, `${appKey} should have exactly one admin surface`);
  }
});

test("admin registry maps every surface to a doctrine domain guide", () => {
  for (const surface of ALL_ADMIN_SURFACES) {
    const doctrine = getAdminSurfaceDoctrineDomain(surface);
    assert(doctrine.label.length > 0, `${surface.id} needs a doctrine domain`);
    assert.match(doctrine.guide, /^docs\/domains\/.+\.md$/, `${surface.id} needs a doctrine guide`);
    assert.equal(existsSync(doctrine.guide), true, `${surface.id} doctrine guide must exist`);
  }

  assert.equal(getAdminSurfaceDoctrineDomain(surfaceById("w")!).label, "Identity And Social");
  assert.equal(getAdminSurfaceDoctrineDomain(surfaceById("tv")!).label, "Media, TV, And Studio");
  assert.equal(getAdminSurfaceDoctrineDomain(surfaceById("operator-tools")!).label, "Operations");
  assert.equal(getAdminSurfaceDoctrineDomain(surfaceById("hoard")!).label, "Tezos Platform");
});
