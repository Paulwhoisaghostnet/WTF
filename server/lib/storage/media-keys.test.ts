import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMediaObjectKey,
  safeFilenameFromUpload,
  validateUploadMimeAndExtension,
} from "./media-keys";

test("safeFilenameFromUpload removes path traversal and dangerous characters", () => {
  assert.equal(safeFilenameFromUpload("../../evil name<script>.MP4"), "evil-name-script.mp4");
  assert.equal(safeFilenameFromUpload(""), "upload.bin");
});

test("buildMediaObjectKey creates stable owner-scoped keys without path traversal", () => {
  const key = buildMediaObjectKey({
    ownerUserId: 42,
    mediaId: 99,
    originalFilename: "../clip.mov",
    createdAt: new Date("2026-05-03T12:34:56Z"),
    checksumSha256: "abcdef0123456789",
  });

  assert.equal(key, "media/users/42/2026/05/99-abcdef012345-clip.mov");
  assert.equal(key.includes(".."), false);
  assert.equal(key.startsWith("/"), false);
});

test("validateUploadMimeAndExtension rejects mismatched or dangerous uploads", () => {
  assert.equal(validateUploadMimeAndExtension("clip.mp4", "video/mp4").ok, true);
  assert.equal(validateUploadMimeAndExtension("clip.html", "text/html").ok, false);
  assert.equal(validateUploadMimeAndExtension("clip.jpg", "video/mp4").ok, false);
});
