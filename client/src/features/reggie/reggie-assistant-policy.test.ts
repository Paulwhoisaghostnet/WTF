import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const assistantSource = readFileSync("client/src/features/reggie/ReggieAssistant.tsx", "utf8");
const desktopSource = readFileSync("client/src/components/layout/Desktop.tsx", "utf8");
const customCursorSource = readFileSync("client/src/features/desktop/CustomCursor.tsx", "utf8");
const wimSource = readFileSync("client/src/pages/Wim.tsx", "utf8");
const localizationSource = readFileSync("client/src/lib/localization-catalogs.ts", "utf8");

test("Reggie can be dismissed, summoned, and persisted into WIM", () => {
  assert.match(assistantSource, /REGGIE_SUMMON_EVENT/);
  assert.match(assistantSource, /window\.addEventListener\(REGGIE_SUMMON_EVENT/);
  assert.match(assistantSource, /setDismissed\(true\)/);
  assert.match(assistantSource, /setSnoozedUntil\(null\)/);
  assert.match(assistantSource, /TRANSIENT_BUBBLE_MS/);
  assert.match(assistantSource, /hideAfter/);
  assert.match(assistantSource, /\/api\/reggie\/messages/);
  assert.match(assistantSource, /"reggie\.assistant\.summoned"/);
  assert.match(assistantSource, /"reggie\.assistant\.dismissed"/);
  assert.match(assistantSource, /"reggie\.message\.sent"/);
});

test("Reggie positions the bubble away from a guided control and inside the viewport", () => {
  assert.match(assistantSource, /placementForAnchor\(rect, currentViewport\(\)\)/);
  assert.match(assistantSource, /<Bubble \$side=\{bubbleSide\}/);
  assert.match(assistantSource, /max-height: min\(320px, calc\(100vh - 24px\)\)/);
});

test("custom cursor remains above Reggie's interactive speech bubble", () => {
  assert.match(assistantSource, /const REGGIE_Z_INDEX = 9100/);
  assert.match(customCursorSource, /const CUSTOM_CURSOR_Z_INDEX = 9200/);
  assert.match(customCursorSource, /pointer-events: none/);
});

test("desktop context menu exposes Summon Reggie through the shared event", () => {
  assert.match(desktopSource, /t\("desktop\.context\.summonReggie"\)/);
  assert.match(desktopSource, /new CustomEvent\(REGGIE_SUMMON_EVENT/);
  assert.match(desktopSource, /source: "desktop-context-menu"/);
  assert.match(localizationSource, /"desktop\.context\.summonReggie": "Summon Reggie"/);
  assert.match(localizationSource, /"desktop\.context\.summonReggie": "Invocar a Reggie"/);
});

test("WIM preserves Reggie assistant message identity from metadata", () => {
  assert.match(wimSource, /isReggieAssistantMessage/);
  assert.match(wimSource, /metadata\?\.assistant === "reggie"/);
  assert.match(wimSource, /metadata\?\.source === "reggie-assistant"/);
  assert.match(wimSource, /data-wim-reggie-message/);
});
