import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schedulerSource = readFileSync("server/lib/scheduler.ts", "utf8");
const jobsSource = readFileSync("server/lib/background-jobs.ts", "utf8");

test("scheduler reconciles abandoned durable runs before arming jobs", () => {
  assert.match(schedulerSource, /export async function reconcileAbandonedRuns/);
  assert.match(schedulerSource, /status:\s*"error"/);
  assert.match(schedulerSource, /abandoned by process restart/);
  assert.match(schedulerSource, /eq\(syncRuns\.status, "running"\)/);
  assert.match(schedulerSource, /isNull\(syncRuns\.finishedAt\)/);
  assert.match(jobsSource, /export async function startBackgroundJobs\(\): Promise<void>/);
  assert.match(jobsSource, /await reconcileAbandonedRuns\(\);[\s\S]*startScheduler\(\);/);
});
