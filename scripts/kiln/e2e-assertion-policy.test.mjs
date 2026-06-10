import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rerunScript = readFileSync("scripts/wtf-in-app-market/e2e-shadownet-kiln.ts", "utf8");
const deployScript = readFileSync("scripts/wtf-in-app-market/deploy-shadownet-kiln.ts", "utf8");
const helper = readFileSync("scripts/kiln/e2e-assertions.ts", "utf8");

test("Kiln in-app market E2E requires storage, balance, and big-map assertion evidence", () => {
  for (const source of [rerunScript, deployScript]) {
    assert.match(source, /buildInAppMarketAssertions/);
    assert.match(source, /const assertions = buildInAppMarketAssertions/);
    assert.match(source, /assertions/);
    assert.match(source, /summarizeKilnAssertionResult\(e2e\.json\)/);
    assert.match(source, /e2e\.json\?\.success && assertionSummary\.ok/);
    assert.match(source, /missing assertion kinds/);
  }
  assert.match(deployScript, /buildInAppRedemptionAssertions/);
  assert.match(deployScript, /redemptionAssertions/);

  assert.match(helper, /"storage"/);
  assert.match(helper, /"balance"/);
  assert.match(helper, /"big_map"/);
  assert.match(helper, /missingKinds/);
});
