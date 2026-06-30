import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/pages/DesktopSettings.tsx", "utf8");

test("Theme Builder exposes Gamma presentation ownership without forking settings logic", () => {
  assert.match(source, /usePresentationShell/, "Theme Builder must read the active presentation host");
  assert.match(source, /const presentation = usePresentationShell\(\)/);
  assert.match(source, /data-desktop-settings-surface="theme-builder"/);
  assert.match(
    source,
    /data-desktop-settings-presentation-host=\{presentation\.host\}/,
    "Theme Builder must expose the active presentation host"
  );
  assert.match(source, /data-desktop-settings-region="surface"/);
  assert.match(
    source,
    /\[data-desktop-settings-presentation-host="gamma"\]/,
    "Gamma styling must be host scoped"
  );
});

test("Theme Builder marks the settings surface regions the Gamma harness measures", () => {
  for (const region of [
    "appearance-panel",
    "style-button",
    "style-preview",
    "font-pack-button",
    "chat-preset-button",
    "color-preset-button",
    "desktop-panel",
    "source-button",
    "segment-button",
    "toolbar-button",
    "pet-panel",
    "stat-bar",
    "agent-panel",
    "token-row",
  ]) {
    assert.match(
      source,
      new RegExp(`data-desktop-settings-region="${region}"`),
      `missing Theme Builder region marker: ${region}`
    );
  }
  assert.match(
    source,
    /data-desktop-settings-thumb="true"/,
    "media thumbnails must use a marker that does not trigger background-image removal"
  );
});

test("Theme Builder Gamma chrome follows the presentation style budget", () => {
  assert.match(source, /background-image:\s*none\s*!important/);
  assert.match(source, /box-shadow:\s*none\s*!important/);
  assert.match(source, /text-shadow:\s*none\s*!important/);
  assert.match(source, /border-radius:\s*6px\s*!important/);
  assert.match(source, /border:\s*1px solid rgba\(242,\s*234,\s*217,\s*0\.16\)\s*!important/);
  assert.match(source, /#070706/);
  assert.match(source, /#11110f/);
  assert.match(source, /#00d2ff/);
  assert.match(source, /#f2ead9/);
});

test("Theme Builder keeps shared desktop, media, profile, pet, and MCP APIs", () => {
  for (const endpoint of [
    "/api/desktop/events",
    "/api/desktop/settings",
    "/api/desktop/pet",
    "/api/desktop/pet/actions",
    "/api/media/mine?category=image",
    "/api/profile/tokens?limit=500&sortBy=lastSeenAt&sortDir=desc&createdByMe=true",
    "/api/profile/tokens?limit=500&sortBy=lastSeenAt&sortDir=desc&createdByMe=false",
    "/api/mcp/tokens",
    "/api/media/upload",
  ]) {
    assert.match(source, new RegExp(endpoint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.doesNotMatch(source, /\/api\/gamma/i, "Gamma must not introduce presentation-specific APIs");
  assert.doesNotMatch(source, /gamma\/api/i, "Gamma must not rewrite shared API paths");
});

test("Theme Builder preserves localization inside desktop settings cache updates", () => {
  assert.match(source, /type LocalizationSettings/);
  assert.match(source, /localization: LocalizationSettings/);
  assert.match(source, /DEFAULT_LOCALIZATION_SETTINGS/);
  assert.match(source, /current\?\.localization/);
  assert.match(source, /settingsQuery\.data\?\.localization/);
});
