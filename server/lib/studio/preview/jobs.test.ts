import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStudioPreviewMetadata,
  markStudioPreviewQueued,
} from "./metadata";

test("markStudioPreviewQueued preserves existing metadata and adds queued state", () => {
  const result = markStudioPreviewQueued({ width: 800, custom: "keep" });

  assert.equal(result.width, 800);
  assert.equal(result.custom, "keep");
  assert.deepEqual(
    {
      status: (result.studioPreview as any).status,
      attempts: (result.studioPreview as any).attempts,
      source: (result.studioPreview as any).source,
      previewUri: (result.studioPreview as any).previewUri,
      thumbnailUri: (result.studioPreview as any).thumbnailUri,
    },
    {
      status: "queued",
      attempts: 0,
      source: "upload",
      previewUri: null,
      thumbnailUri: null,
    }
  );
  assert.match(String((result.studioPreview as any).queuedAt), /^\d{4}-/);
});

test("buildStudioPreviewMetadata merges generated media metadata into preview state", () => {
  const result = buildStudioPreviewMetadata(
    {
      studioPreview: {
        status: "queued",
        queuedAt: "2026-05-14T00:00:00.000Z",
        attempts: 0,
      },
    },
    {
      status: "ready",
      attempts: 1,
      finishedAt: "2026-05-14T00:01:00.000Z",
      previewUri: "disk://preview.webp",
      thumbnailUri: "disk://thumb.webp",
    },
    {
      width: 1280,
      height: 720,
    }
  );

  assert.equal(result.width, 1280);
  assert.equal(result.height, 720);
  assert.deepEqual(result.studioPreview, {
    status: "ready",
    queuedAt: "2026-05-14T00:00:00.000Z",
    attempts: 1,
    finishedAt: "2026-05-14T00:01:00.000Z",
    previewUri: "disk://preview.webp",
    thumbnailUri: "disk://thumb.webp",
  });
});
