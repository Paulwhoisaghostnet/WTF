import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("client/src/pages/ContractFactory.tsx", "utf8");
const route = readFileSync("server/routes/collection-factory.ts", "utf8");

test("contract factory exposes browser-authored Kiln simulation steps", () => {
  assert.match(source, /GroupBox label="3\. Browser Kiln test"/);
  assert.match(source, /SIMULATION_WALLET_OPTIONS/);
  assert.match(source, /Bert test wallet/);
  assert.match(source, /Ernie test wallet/);
  assert.match(source, /Add Step/);
  assert.match(source, /Compile & Test in Kiln/);
  assert.match(source, /JSON\.parse\(step\.argsJson\)/);
  assert.match(source, /simulationSteps: buildSimulationSteps\(\)/);
});

test("contract factory keeps simulation execution server-side through Kiln", () => {
  assert.match(route, /simulationSteps: z/);
  assert.match(route, /wallet: z\.enum\(\["bert", "ernie", "user"\]\)/);
  assert.match(route, /kilnFetch\("\/api\/kiln\/workflow\/run"/);
  assert.match(route, /sourceType: "smartpy"/);
  assert.match(route, /simulationSteps,/);
});
