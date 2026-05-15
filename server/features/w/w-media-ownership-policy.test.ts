import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schemaSource = readFileSync("shared/schema-social.ts", "utf8");
const actionRoutesSource = readFileSync("server/features/w/action-routes.ts", "utf8");
const messageRoutesSource = readFileSync("server/features/w/message-routes.ts", "utf8");

test("W media uploads have an owner-bound persistence model", () => {
  assert.match(schemaSource, /export const xWMediaUploads = pgTable\(/);
  assert.match(schemaSource, /"x_w_media_uploads"/);
  assert.match(schemaSource, /ownerUserId:\s*integer\("owner_user_id"\)/);
  assert.match(schemaSource, /xMediaId:\s*varchar\("x_media_id"/);
  assert.match(schemaSource, /uniqueIndex\("x_w_media_uploads_media_unique_idx"\)/);
});

test("W post media IDs are recorded on upload and owner-checked before posting", () => {
  assert.match(actionRoutesSource, /recordWMediaUploadOwnership/);
  assert.match(actionRoutesSource, /await recordWMediaUploadOwnership\(/);
  assert.match(actionRoutesSource, /requireOwnedWMediaIds/);
  assert.match(actionRoutesSource, /await requireOwnedWMediaIds\(\s*\(req\.user as any\)\.id,\s*mediaIds\s*\)/);
  assert.doesNotMatch(
    actionRoutesSource,
    /media_ids:\s*mediaIds/,
    "Post creation must use the owner-validated media id list, not raw request mediaIds"
  );
});

test("W DM media attachments are owner-checked before every X DM send path", () => {
  assert.match(messageRoutesSource, /requireOwnedWMediaId/);

  const sendPaths = [
    "/api/w/groupchat/messages",
    "/api/w/user-dms/:conversationId/messages",
    "/api/w/user-dms/direct",
    "/api/w/direct-messages",
  ];

  for (const path of sendPaths) {
    const pathIndex = messageRoutesSource.indexOf(`router.post("${path}"`);
    assert.notEqual(pathIndex, -1, `${path} must exist`);
    const nextRoute = messageRoutesSource.indexOf("router.", pathIndex + 1);
    const routeSource = messageRoutesSource.slice(
      pathIndex,
      nextRoute === -1 ? messageRoutesSource.length : nextRoute
    );
    if (/sendPersonalDmDisabled\(res\)/.test(routeSource)) {
      continue;
    }
    assert.match(
      routeSource,
      /await requireOwnedWMediaId\(/,
      `${path} must validate mediaId ownership before attaching it to an X DM`
    );
    assert.doesNotMatch(
      routeSource,
      /media_id:\s*mediaId/,
      `${path} must attach the owner-validated media id, not the raw request mediaId`
    );
  }
});
