import assert from "node:assert/strict";
import test from "node:test";

import { buildWtfOsRegisteredInventory } from "./wtfos-inventory";
import { DEFAULT_DESKTOP_APP_CONFIG } from "../../shared/desktop-apps";
import { WTF_APP_PACKAGE_ACCEPTANCE } from "../../shared/wtf-app-packages";

const apps = {
  ...DEFAULT_DESKTOP_APP_CONFIG,
  wtfiam: true,
  hoard: true,
  wim: true,
  w: true,
  tv: false,
  dicksword: true,
  "i-hate-telegram": true,
  "dear-diary": true,
  arcade: true,
  console: true,
  "game-studio": true,
  studio: true,
  gallery: true,
  skywire: true,
  tz2at: true,
  "crp-nominations": true,
  "rat-race": true,
  "map-lab": true,
  mail: true,
  casino: true,
  "dues-manager": true,
} as const;

test("WTFOS registered inventory exposes standardized pathways and witness metadata", () => {
  const inventory = buildWtfOsRegisteredInventory({
    origin: "https://wtfos.app",
    mcpEndpoint: "https://wtfos.app/mcp",
    apps,
    now: new Date("2026-05-29T12:00:00.000Z"),
  });

  assert.equal(inventory.schemaVersion, "wtfos.inventory.v1");
  assert.equal(inventory.artifacts.length, WTF_APP_PACKAGE_ACCEPTANCE.length);
  assert.equal(inventory.discoveryTools.includes("wtf_get_registered_inventory"), true);
  assert.equal(inventory.summary.totalArtifacts, WTF_APP_PACKAGE_ACCEPTANCE.length);
  assert.equal(inventory.summary.enabledArtifacts > 0, true);
  assert.equal(inventory.summary.kindCounts.app > 0, true);
  assert.equal(inventory.summary.pathwayCounts.browser > 0, true);

  const arcade = inventory.artifacts.find((entry) => entry.key === "arcade");
  assert(arcade, "arcade inventory entry must exist");
  assert.equal(arcade?.enabled, true);
  assert.ok(arcade?.pathways.browser.includes("/arcade"));
  assert.equal(arcade?.capabilities[0]?.pathways.includes("browser"), true);
  assert.equal(arcade?.witness.preview, "/arcade");

  const tv = inventory.artifacts.find((entry) => entry.key === "tv");
  assert(tv, "tv inventory entry must exist");
  assert.equal(tv?.enabled, false);
});
