import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("server/routes/messages.ts", "utf8");

test("legacy channel routes load the legacy channel and enforce audience plus permission gates", () => {
  assert.match(source, /listRolesForUserSnapshot\(req\.user as any\)/u);
  assert.match(source, /canAccessLegacyChannel\(channel\.accessLevel, roles\)/u);
  assert.match(source, /hasPermission\(roles, "read_message_board"\)/u);
  assert.match(source, /hasPermission\(roles, "post_message_board"\)/u);
  assert.match(source, /where\(eq\(channels\.id, channelId\)\)/u);
  assert.match(source, /Channel not found/u);
});

test("legacy threaded replies cannot point across channels", () => {
  assert.match(
    source,
    /eq\(messages\.id, parsed\.data\.threadParentId\)[\s\S]*eq\(messages\.channelId, channelId\)/u,
  );
  assert.match(source, /Parent message not found/u);
});
