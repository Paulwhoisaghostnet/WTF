import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const envExample = readFileSync(".env.example", "utf8");
const backgroundJobs = readFileSync("server/lib/background-jobs.ts", "utf8");
const wRoutes = readFileSync("server/routes/w.ts", "utf8");
const streamSource = readFileSync("server/lib/timeline-stream.ts", "utf8");

test("W defaults to read-only digest ingest (no paid X API)", () => {
  assert.match(envExample, /W_TIMELINE_INGEST_MODE=digest/);
  assert.match(envExample, /W_TIMELINE_STREAM_ENABLED=0/);
  assert.match(envExample, /W_X_SCRAPER_USERNAME/);
  assert.match(envExample, /W_DIGEST_INITIAL_POSTS_PER_HANDLE=25/);
  assert.match(backgroundJobs, /registerDigestScraperWorker/);
  assert.match(backgroundJobs, /isWDigestAppActive/);
  assert.match(wRoutes, /registerWDigestRoutes/);
  assert.match(streamSource, /isWTimelineStreamIngestActive/);
  assert.match(streamSource, /W_TIMELINE_STREAM_ENABLED \?\? "0"/);
});
