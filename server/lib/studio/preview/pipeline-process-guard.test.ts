import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.STUDIO_PREVIEW_PROCESS_TIMEOUT_MS = "1000";
process.env.STUDIO_PREVIEW_PROCESS_CONCURRENCY = "1";
process.env.STUDIO_PREVIEW_QUEUE_WAIT_MS = "1000";

const { studioPreviewProcessTestHooks: hooks } = await import("./pipeline");
const uploadRoutes = readFileSync("server/routes/studio-files.ts", "utf8");
const previewJobs = readFileSync("server/lib/studio/preview/jobs.ts", "utf8");

test("Studio uploads enqueue bounded background derivatives instead of awaiting preview work", () => {
  assert.match(uploadRoutes, /enqueueStudioPreview\(inserted\.id\);[\s\S]*res\.status\(201\)\.json/);
  assert.doesNotMatch(uploadRoutes, /generatePreview\(/);
  assert.match(previewJobs, /STUDIO_PREVIEW_BATCH_SIZE = Math\.max\([\s\S]*Math\.min\(25,/);
  assert.match(previewJobs, /\.limit\(limit\)/);
  assert.match(previewJobs, /name: STUDIO_PREVIEW_JOB_NAME,[\s\S]*fn: runStudioPreviewDerivativeJob/);
});

test("preview subprocesses are killed and rejected at the configured deadline", async () => {
  await assert.rejects(
    hooks.runProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"]),
    new RegExp(`${process.execPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} timed out after 1000ms`)
  );
});

test("preview process slots reject a saturated queue and recover after release", async () => {
  let releaseFirst!: () => void;
  let firstStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    firstStarted = resolve;
  });
  const held = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });

  const first = hooks.withPreviewProcessSlot(async () => {
    firstStarted();
    await held;
    return "first";
  });
  await started;
  assert.equal(hooks.processesInFlight(), 1);

  await assert.rejects(
    hooks.withPreviewProcessSlot(async () => "second"),
    /Studio preview queue was busy for longer than 1000ms/
  );
  assert.equal(hooks.queuedProcesses(), 0);

  releaseFirst();
  assert.equal(await first, "first");
  assert.equal(hooks.processesInFlight(), 0);
  assert.equal(await hooks.withPreviewProcessSlot(async () => "recovered"), "recovered");
  assert.equal(hooks.processesInFlight(), 0);
});
