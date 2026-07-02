import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const messagesRoute = readFileSync("server/routes/messages.ts", "utf8");

test("message user search supports WIM roster presence without exposing self", () => {
  assert.match(messagesRoute, /req\.query\.excludeSelf === "1"/);
  assert.match(messagesRoute, /\$\{users\.id\} <> \$\{\(req\.user as any\)\.id\}/);
  assert.equal(
    (messagesRoute.match(/\$\{users\.id\} <> \$\{\(req\.user as any\)\.id\}/g) || [])
      .length,
    1
  );
  assert.match(messagesRoute, /\$\{sessions\.expire\} > now\(\)/);
  assert.match(messagesRoute, /WIM_ACTIVE_PRESENCE_WINDOW_MS/);
  assert.match(messagesRoute, /presenceStatus: presence\.status/);
  assert.match(messagesRoute, /lastActiveAt: presence\.lastActiveAt\?\.toISOString\(\) \?\? null/);
  assert.match(messagesRoute, /sessionExpiresAt: presence\.sessionExpiresAt\?\.toISOString\(\) \?\? null/);
  assert.match(messagesRoute, /online: presence\.status === "active"/);
});

test("DM conversation payload keeps participant id available to clients", () => {
  assert.match(messagesRoute, /id: users\.id,\s+userId: users\.id/s);
});

test("DM comms cards are indexed per participant, not as global digest items", () => {
  assert.match(messagesRoute, /for \(const participant of participants\)/);
  assert.match(messagesRoute, /externalRef: `dm:\$\{message\.id\}:user:\$\{participant\.userId\}`/);
  assert.match(messagesRoute, /targetUserId: participant\.userId/);
  assert.doesNotMatch(messagesRoute, /targetUserId:\s*null,\s*metadata:\s*\{\s*conversationId/s);
});
