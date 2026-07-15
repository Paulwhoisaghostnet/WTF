import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const indexSource = readFileSync("server/index.ts", "utf8");

test("all one-shot mutating boot work completes before the HTTP listener opens", () => {
  const startupIndex = indexSource.indexOf("await runRequiredStartupTasks()");
  const jobsIndex = indexSource.indexOf("await startBackgroundJobs()");
  const listenIndex = indexSource.indexOf("await listenForHttp(");

  assert.notEqual(startupIndex, -1, "required startup phase is missing");
  assert.notEqual(jobsIndex, -1, "background job reconciliation is not awaited");
  assert.notEqual(listenIndex, -1, "listener is not represented by the explicit listen phase");
  assert.ok(startupIndex < jobsIndex, "startup mutations must precede scheduler start");
  assert.ok(jobsIndex < listenIndex, "scheduler reconciliation must precede listen");
  assert.doesNotMatch(indexSource, /server\.listen\([^)]*,\s*async\s*\(\)\s*=>/);
  for (const mutation of [
    "runTvBootBackfill",
    "runGameshowBootBackfill",
    "ensureCanonicalDailyLoopChallenges",
    "ensureReggieQuestChallenges",
    "migrateTvCacheKeys",
  ]) {
    assert.doesNotMatch(indexSource, new RegExp(`server\\.listen[\\s\\S]*${mutation}`));
  }
});
