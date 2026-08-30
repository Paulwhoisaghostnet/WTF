import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const config = readFileSync("playwright.config.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

test("inventory Playwright never reuses another worktree's mutable harness", () => {
  assert.match(config, /HARNESS_PORT/u);
  assert.match(config, /reuseExistingServer:\s*false/u);
  assert.doesNotMatch(config, /reuseExistingServer:\s*!process\.env\.CI/u);
});

test("the phased live command delegates to the maintained actor-backed suite", () => {
  assert.equal(
    packageJson.scripts["test:e2e:live:phases"],
    "npm run test:e2e:live:puppets",
  );
});
