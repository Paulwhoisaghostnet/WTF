import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = readFileSync("playwright.config.mjs", "utf8");

test("inventory Playwright never reuses another worktree's mutable harness", () => {
  assert.match(config, /HARNESS_PORT/u);
  assert.match(config, /reuseExistingServer:\s*false/u);
  assert.doesNotMatch(config, /reuseExistingServer:\s*!process\.env\.CI/u);
});
