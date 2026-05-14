import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const browserBoundariesSource = readFileSync(
  "client/src/pages/BrowserBoundaries.tsx",
  "utf8"
);

test("Browser Boundaries declares the Law-required browser modes", () => {
  for (const label of [
    "Normal browsing",
    "Wallet-safe mode",
    "Local development",
    "Media capture",
    "Archive/save-to-project",
    "Admin surfaces",
  ]) {
    assert.match(browserBoundariesSource, new RegExp(label));
  }
});

test("Browser Boundaries emits shell events for boundary actions", () => {
  assert.match(browserBoundariesSource, /eventType:\s*"browser_boundaries\.viewed"/);
  assert.match(browserBoundariesSource, /eventType:\s*"browser_boundaries\.action_opened"/);
  assert.match(
    browserBoundariesSource,
    /metadata:\s*\{\s*path,\s*action\s*\}/,
    "boundary actions should preserve the target and reason for system observability"
  );
});
