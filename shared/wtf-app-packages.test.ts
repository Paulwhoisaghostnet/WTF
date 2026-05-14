import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ALL_ADMIN_SURFACES } from "../client/src/features/admin-os/admin-surface-registry";
import { CREATION_TOOLS } from "../client/src/features/creation-tools/tool-registry";
import {
  WTF_APP_PACKAGE_ACCEPTANCE,
  WTF_APP_PACKAGE_ACCEPTANCE_VERSION,
  WTF_CREATION_TOOL_PACKAGE_ACCEPTANCE,
  WTF_DESKTOP_APP_PACKAGE_ACCEPTANCE,
  WTF_INTEGRATION_PLUGIN_ACCEPTANCE,
  WTF_SYSTEM_PACKAGE_ACCEPTANCE,
  getWtfAppPackageAcceptance,
} from "./wtf-app-packages";
import { DESKTOP_APPS } from "./types";

test("app package acceptance manifest has required acceptance fields on every entry", () => {
  assert.equal(WTF_APP_PACKAGE_ACCEPTANCE_VERSION, 1);
  assert.equal(new Set(WTF_APP_PACKAGE_ACCEPTANCE.map((entry) => entry.id)).size, WTF_APP_PACKAGE_ACCEPTANCE.length);

  for (const entry of WTF_APP_PACKAGE_ACCEPTANCE) {
    assert(entry.label.length > 0, `${entry.id} needs a label`);
    assert(entry.routeEvidence.length > 0, `${entry.id} needs route evidence`);
    assert(entry.provenance.owner.length > 0, `${entry.id} needs a provenance owner`);
    assert(entry.provenance.source.length > 0, `${entry.id} needs a provenance source`);
    assert(entry.provenance.evidence.length > 0, `${entry.id} needs provenance evidence`);
    assert(entry.permissionSummary.userAccess.length > 0, `${entry.id} needs user permission summary`);
    assert(entry.permissionSummary.adminAccess.length > 0, `${entry.id} needs admin permission summary`);
    assert(entry.rollback.method.length > 0, `${entry.id} needs rollback method`);
    assert(entry.rollback.evidence.length > 0, `${entry.id} needs rollback evidence`);
    assert(entry.uninstall.method.length > 0, `${entry.id} needs uninstall method`);
    assert.equal(entry.uninstall.preservesUserData, true, `${entry.id} uninstall must preserve user data`);
    assert.equal(getWtfAppPackageAcceptance(entry.id)?.id, entry.id);
  }
});

test("every canonical desktop app has package acceptance and admin observability", () => {
  assert.deepEqual(
    WTF_DESKTOP_APP_PACKAGE_ACCEPTANCE.map((entry) => entry.appKey),
    DESKTOP_APPS
  );

  for (const appKey of DESKTOP_APPS) {
    const entry = WTF_DESKTOP_APP_PACKAGE_ACCEPTANCE.find((candidate) => candidate.appKey === appKey);
    assert(entry, `${appKey} needs package acceptance`);
    const surface = ALL_ADMIN_SURFACES.find((candidate) => candidate.desktopAppKey === appKey);
    assert(surface, `${appKey} needs an admin surface`);
    assert(surface.routePatterns.length > 0, `${appKey} admin surface needs route patterns`);
    assert(surface.adminPanelTabs.length > 0, `${appKey} admin surface needs admin tabs`);
    assert(surface.nativeSettings.length > 0, `${appKey} admin surface needs native settings`);
    assert(surface.automationHandles.length > 0, `${appKey} admin surface needs automation handles`);
  }
});

test("every creation tool route has package acceptance and static asset provenance", () => {
  assert.deepEqual(
    WTF_CREATION_TOOL_PACKAGE_ACCEPTANCE.map((entry) => entry.toolId),
    CREATION_TOOLS.map((tool) => tool.id)
  );

  const creationSurface = ALL_ADMIN_SURFACES.find((surface) => surface.id === "creation-tools");
  assert(creationSurface, "creation tools need an admin surface");
  const creationSurfaceRoutes = new Set<string>(creationSurface.routePatterns);

  for (const tool of CREATION_TOOLS) {
    const entry = WTF_CREATION_TOOL_PACKAGE_ACCEPTANCE.find((candidate) => candidate.toolId === tool.id);
    assert(entry, `${tool.id} needs package acceptance`);
    assert.equal(entry?.label, tool.title);
    assert(creationSurfaceRoutes.has(tool.routePath), `${tool.id} route is not admin observable`);
    assert(new Set<string>(entry.routeEvidence).has(tool.routePath), `${tool.id} package needs route evidence`);
    assert(tool.requiredAssets.length > 0, `${tool.id} needs required assets`);
  }
});

test("console and project bundle packages remain explicitly manifested", () => {
  assert(WTF_SYSTEM_PACKAGE_ACCEPTANCE.find((entry) => entry.id === "package:console-stock-cartridges"));
  assert(WTF_SYSTEM_PACKAGE_ACCEPTANCE.find((entry) => entry.id === "package:project-bundles"));

  const consoleManifest = JSON.parse(readFileSync("public/games/installed/manifest.json", "utf8")) as {
    cartridges: Array<{ id?: string; slug?: string; artifactUri?: string; source?: string }>;
  };

  assert(consoleManifest.cartridges.length > 0, "console cartridge manifest should not be empty");
  for (const cartridge of consoleManifest.cartridges) {
    assert(cartridge.id, "cartridge needs id");
    assert(cartridge.slug, "cartridge needs slug");
    assert(cartridge.artifactUri, `${cartridge.id} needs artifactUri`);
    assert(cartridge.source, `${cartridge.id} needs source provenance`);
  }
});

test("integration plugins have explicit active or blocked states", () => {
  const states = new Map(WTF_INTEGRATION_PLUGIN_ACCEPTANCE.map((entry) => [entry.key, entry.state]));
  assert.equal(states.get("kiln"), "active");
  assert.equal(states.get("shadowbox"), "blocked");
  assert.equal(states.get("jstz"), "blocked");
});
