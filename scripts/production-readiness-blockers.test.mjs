import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assessProductionReadiness } from "./production-readiness-blockers.mjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

function healthy(commitRef = "abcdef1234567890") {
  return {
    liveness: { ok: true },
    readiness: {
      ok: true,
      status: "ready",
      version: { nodeEnv: "production", commitRef },
    },
  };
}

test("production readiness package command owns an existing executable gate", () => {
  assert.equal(
    packageJson.scripts["production:readiness"],
    "node scripts/production-readiness-blockers.mjs"
  );
  assert.match(readFileSync("scripts/production-readiness-blockers.mjs", "utf8"), /api\/health\/ready/);
});

test("production readiness accepts healthy production with a matching commit", () => {
  const input = healthy();
  const report = assessProductionReadiness({ ...input, expectedCommit: "abcdef1" });
  assert.equal(report.ok, true);
  assert.equal(report.blockers.length, 0);
});

test("production readiness rejects placeholder, stale, and degraded releases", () => {
  assert.equal(assessProductionReadiness(healthy("dev")).ok, false);
  assert.equal(
    assessProductionReadiness({ ...healthy(), expectedCommit: "1234567" }).ok,
    false
  );
  assert.equal(
    assessProductionReadiness({
      liveness: { ok: true },
      readiness: { ok: false, status: "degraded", version: { nodeEnv: "production", commitRef: "abcdef1" } },
    }).ok,
    false
  );
});
