import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const backgroundJobs = readFileSync("server/lib/background-jobs.ts", "utf8");
const scheduler = readFileSync("server/lib/scheduler.ts", "utf8");
const healthJob = readFileSync("server/lib/db-health-completion.ts", "utf8");
const dashboard = readFileSync("client/src/pages/Dashboard.tsx", "utf8");
const cockpitQueries = readFileSync(
  "client/src/features/cockpit/cockpit-queries.ts",
  "utf8"
);
const packageJson = readFileSync("package.json", "utf8");

test("db health completion is an operator-visible scheduler job", () => {
  assert.match(backgroundJobs, /DB_HEALTH_COMPLETION_JOB_NAME/);
  assert.match(backgroundJobs, /runDbHealthCompletion/);
  assert.match(backgroundJobs, /name: DB_HEALTH_COMPLETION_JOB_NAME/);
  assert.match(backgroundJobs, /skipInitialRun: true/);
  assert.match(backgroundJobs, /scope: "public-schema"/);
  assert.match(healthJob, /export const DB_HEALTH_COMPLETION_JOB_NAME = "db-health-completion"/);
  assert.match(healthJob, /totalPublicTables/);
  assert.match(healthJob, /zeroRowTables/);
  assert.match(healthJob, /fullReportCommand: "npm run db:health:completion"/);
});

test("scheduler honors skipInitialRun so the DB scan does not fire on deploy boot", () => {
  assert.match(scheduler, /skipInitialRun: boolean/);
  assert.match(scheduler, /skipInitialRun: opts\.skipInitialRun === true/);
  assert.match(scheduler, /if \(job\.skipInitialRun\)/);
});

test("dashboard sync tab and package script expose DB completion evidence", () => {
  assert.match(dashboard, /useCockpitSyncStatusQuery\(\)/);
  assert.match(cockpitQueries, /\/api\/cockpit\/sync\/status/);
  assert.match(dashboard, /syncStatus\.jobs\?\.map/);
  assert.match(packageJson, /"db:health:completion": "node scripts\/run-db-health-completion\.mjs"/);
});
