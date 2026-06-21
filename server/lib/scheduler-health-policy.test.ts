import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schedulerSource = readFileSync(new URL("./scheduler.ts", import.meta.url), "utf8");
const migrationSource = readFileSync(
  new URL("../../drizzle/0105_sync_runs_latest_job_index.sql", import.meta.url),
  "utf8"
);

test("health scheduler audit does not sweep the whole sync_runs table", () => {
  assert.doesNotMatch(
    schedulerSource,
    /SELECT DISTINCT ON \(job_name\)[\s\S]*FROM sync_runs/,
    "latestPerJob should not use a whole-table DISTINCT ON scan for health"
  );
  assert.match(
    schedulerSource,
    /LEFT JOIN LATERAL/,
    "latestPerJob should fetch the latest audit row per registered scheduler job"
  );
  assert.match(
    schedulerSource,
    /VALUES \$\{registeredJobs\}/,
    "latestPerJob should constrain the audit query to registered scheduler job names"
  );
});

test("sync_runs has an index for latest row lookups by job", () => {
  assert.match(
    migrationSource,
    /idx_sync_runs_job_started_desc/,
    "production migrations should install the latest-row scheduler audit index"
  );
  assert.match(
    migrationSource,
    /ON sync_runs \(job_name, started_at DESC\)/,
    "the index must match the lateral latest-per-job order"
  );
});
