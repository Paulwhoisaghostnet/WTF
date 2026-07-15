import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync("server/challenges/routes/reggie.ts", "utf8");

test("Reggie WIM messages are server-authored and durable", () => {
  assert.match(routeSource, /router\.post\("\/api\/reggie\/messages", isAuthenticated/);
  assert.match(routeSource, /REGGIE_ASSISTANT_USERNAME = "reggie-assistant"/);
  assert.match(routeSource, /ensureReggieAssistantUser/);
  assert.match(routeSource, /writeReggieWimMessage/);
  assert.match(routeSource, /insert\(dmConversations\)/);
  assert.match(routeSource, /insert\(dmConversationParticipants\)/);
  assert.match(routeSource, /insert\(dmMessages\)/);
  assert.match(routeSource, /senderId: reggieUserId/);
  assert.match(routeSource, /targetUserId: user\.id/);
  assert.match(routeSource, /source: "reggie-assistant"/);
  assert.match(routeSource, /publishCommunicationItemBestEffort/);
  assert.doesNotMatch(routeSource, /senderId:\s*req\.body/);
  assert.doesNotMatch(routeSource, /targetUserId:\s*req\.body/);
});
