import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const runner = readFileSync("scripts/run-unit-tests.mjs", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

test("aggregate unit runner discovers every product unit-test root deterministically", () => {
  for (const root of ["client", "server", "shared", "extensions", "scripts", "tests/unit", "tests/e2e/inventory"]) {
    assert.match(runner, new RegExp(`"${root.replace("/", "\\/")}"`));
  }
  assert.match(runner, /entries\.sort\(\(a, b\) => a\.name\.localeCompare\(b\.name\)\)/);
  assert.match(runner, /--test-concurrency=4/);
  assert.match(runner, /WTF_UNIT_TEST_REPORTER/);
  assert.equal(packageJson.scripts["test:unit"], "node scripts/run-unit-tests.mjs");
});

test("aggregate unit runner keeps browser and live actor suites in their dedicated lanes", () => {
  assert.match(runner, /tests\/playwright/);
  assert.match(runner, /tests\/e2e\/puppets/);
  assert.match(runner, /\.spec\./);
});

test("aggregate unit runner excludes local dependency and generated-output trees at every depth", () => {
  for (const directory of ["node_modules", "dist", "build", "coverage", ".cache"]) {
    assert.match(runner, new RegExp(`"${directory.replace(".", "\\.")}"`));
  }
  assert.match(runner, /entry\.isDirectory\(\) && EXCLUDED_DIRECTORIES\.has\(entry\.name\)/);
});
