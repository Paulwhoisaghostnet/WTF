import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(".github/workflows/quality-gates.yml", "utf8");

test("quality gates run inventory coverage and Playwright smoke checks", () => {
  assert.match(workflow, /Install Playwright browsers[\s\S]*npx playwright install --with-deps chromium/);
  assert.match(workflow, /Inventory coverage[\s\S]*npm run test:e2e:inventory:coverage/);
  assert.match(workflow, /Inventory Playwright smoke[\s\S]*npx playwright test tests\/playwright\/inventory/);
  assert.match(workflow, /Build[\s\S]*npm run build[\s\S]*Inventory Playwright smoke/);
});
