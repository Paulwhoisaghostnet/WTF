import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pixalerceSpec = readFileSync("tests/playwright/inventory/pixalerce.spec.mjs", "utf8");
const playwrightConfig = readFileSync("playwright.config.mjs", "utf8");
const qualityWorkflow = readFileSync(".github/workflows/quality-gates.yml", "utf8");

test("PixAlerce keeps every action and the complete encoder journey bounded by repository contracts", () => {
  assert.match(playwrightConfig, /timeout:\s*60_000/u);
  assert.match(qualityWorkflow, /timeout-minutes:\s*30/u);
  assert.match(pixalerceSpec, /PIXALERCE_ACTION_TIMEOUT_MS = 60_000/u);
  assert.match(pixalerceSpec, /PIXALERCE_JOURNEY_TIMEOUT_MS = 30 \* 60_000/u);
  assert.match(pixalerceSpec, /test\.setTimeout\(PIXALERCE_JOURNEY_TIMEOUT_MS\)/u);
  assert.match(pixalerceSpec, /page\.setDefaultTimeout\(PIXALERCE_ACTION_TIMEOUT_MS\)/u);
  assert.match(pixalerceSpec, /page\.setDefaultNavigationTimeout\(PIXALERCE_ACTION_TIMEOUT_MS\)/u);
  assert.doesNotMatch(pixalerceSpec, /test\.setTimeout\(0\)/u);
});
