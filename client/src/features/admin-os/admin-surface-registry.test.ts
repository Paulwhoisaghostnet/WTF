import assert from "node:assert/strict";
import test from "node:test";
import { DESKTOP_APPS } from "@shared/types";
import { ALL_ADMIN_SURFACES, ADMIN_SURFACES, findAdminSurfaceForPath } from "./admin-surface-registry";

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
    "file-manager",
  ]) {
    assert(surfaceById(id), `${id} should be registered for admin observability`);
  }
});

test("admin registry resolves Mission Control and Recovery Mode routes", () => {
  assert.equal(findAdminSurfaceForPath("/mission-control")?.id, "mission-control");
  assert.equal(findAdminSurfaceForPath("/recovery-mode")?.id, "recovery-mode");
  assert.equal(findAdminSurfaceForPath("/browser-boundaries")?.id, "browser-boundaries");
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
