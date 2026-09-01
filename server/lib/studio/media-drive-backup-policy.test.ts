import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const userDriveSource = readFileSync("server/lib/studio/user-drive.ts", "utf8");
const mediaRouteSource = readFileSync("server/routes/media-library.ts", "utf8");
const myVideosSource = readFileSync("client/src/pages/MyVideos.tsx", "utf8");

test("new uploaded media keeps object storage playback and receives a personal Drive backup", () => {
  assert.match(userDriveSource, /backupUserMediaFileToDrive/);
  assert.match(userDriveSource, /wtfOS My Media/);
  assert.match(mediaRouteSource, /putObjectFromFile/);
  assert.match(mediaRouteSource, /backupUserMediaFileToDrive/);
  assert.match(mediaRouteSource, /media\.drive_backup\.completed/);
  assert.match(mediaRouteSource, /\/api\/media\/:id\/drive-backup/);
  assert.match(mediaRouteSource, /item\.ownerUserId !== user\.id/);
});

test("My Videos explains and controls the shared personal Drive backup", () => {
  assert.match(myVideosSource, /Personal cloud backup/);
  assert.match(myVideosSource, /automatic copy in your wtfOS My Media/);
  assert.match(myVideosSource, /Back up to Google Drive/);
  assert.match(myVideosSource, /object-storage copy remains the playback source/);
});
