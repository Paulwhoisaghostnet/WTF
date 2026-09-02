import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const harnessSource = readFileSync("tests/playwright/harness.mjs", "utf8");
const productionSource = readFileSync("server/challenges/routes/admin.ts", "utf8");
const adminTabSource = readFileSync(
  "client/src/features/admin/tabs/ChallengeAutomationAdminTab.tsx",
  "utf8"
);

function registryResponseBlock(source, routeMarker) {
  const start = source.indexOf(routeMarker);
  assert.notEqual(start, -1, `missing route marker: ${routeMarker}`);
  const nextRoute = source.indexOf("challenge-automation/challenges", start);
  assert.notEqual(nextRoute, -1, "missing challenges route after registry route");
  return source.slice(start, nextRoute);
}

test("Playwright automation registry fixture matches the production response key", () => {
  const harnessRegistry = registryResponseBlock(
    harnessSource,
    "/api/admin/challenge-automation/registry"
  );
  const productionRegistry = registryResponseBlock(
    productionSource,
    "/api/admin/challenge-automation/registry"
  );

  assert.match(productionRegistry, /rewardActions:\s*rewardActionRegistry/);
  assert.match(harnessRegistry, /rewardActions:\s*\[\]/);
  assert.doesNotMatch(harnessRegistry, /\bactions:\s*\[\]/);
  assert.match(adminTabSource, /registry\.rewardActions\.length/);
});
