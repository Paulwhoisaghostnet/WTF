import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/quality-gates.yml", "utf8");

test("quality gates run inventory coverage and Playwright smoke checks", () => {
  assert.match(workflow, /Install Playwright browsers[\s\S]*npx playwright install --with-deps chromium/);
  assert.match(workflow, /Inventory registry coverage \(skeleton, not feature completeness\)[\s\S]*npm run test:e2e:inventory:coverage/);
  assert.match(workflow, /Inventory route smoke \(reachability, not durable behavior\)[\s\S]*npx playwright test tests\/playwright\/inventory/);
  assert.match(workflow, /Build[\s\S]*npm run build[\s\S]*Inventory route smoke/);
});

test("quality gates run aggregate unit, production audit, environment, CSP, and supply-chain policy lanes", () => {
  assert.match(workflow, /Aggregate unit tests[\s\S]*npm run test:unit/);
  assert.match(workflow, /Production dependency audit[\s\S]*npm run security:audit/);
  assert.match(workflow, /Environment inventory[\s\S]*npm run env:inventory:check/);
  assert.match(workflow, /Supply-chain policy[\s\S]*npm run security:supply-chain/);
  assert.match(workflow, /Generate CycloneDX SBOM[\s\S]*npm run security:sbom/);
  assert.match(workflow, /Upload SBOM[\s\S]*actions\/upload-artifact@/);
});

test("inventory lane names do not claim route reachability is feature-complete behavior coverage", () => {
  assert.match(workflow, /Inventory registry coverage \(skeleton, not feature completeness\)/);
  assert.match(workflow, /Inventory route smoke \(reachability, not durable behavior\)/);
});
