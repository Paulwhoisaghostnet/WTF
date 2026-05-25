import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const messagesRoute = readFileSync("server/routes/messages.ts", "utf8");

test("message user search supports WIM roster presence without exposing self", () => {
  assert.match(messagesRoute, /req\.query\.excludeSelf === "1"/);
  assert.match(messagesRoute, /\$\{users\.id\} <> \$\{\(req\.user as any\)\.id\}/);
  assert.match(messagesRoute, /\$\{sessions\.expire\} > now\(\)/);
  assert.match(messagesRoute, /online: onlineUserIds\.has\(row\.id\)/);
});

test("DM conversation payload keeps participant id available to clients", () => {
  assert.match(messagesRoute, /id: users\.id,\s+userId: users\.id/s);
});
