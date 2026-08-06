import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const route = readFileSync("server/routes/admin-inbox.ts", "utf8");
const schema = readFileSync("shared/schema-admin-inbox.ts", "utf8");
const comms = readFileSync("server/routes/comms.ts", "utf8");

test("admin inbox keeps sender identity, global reads, and attachments server-authoritative", () => {
  assert.match(route, /router\.post\("\/api\/admin-inbox\/messages", isAuthenticated, submitRateLimit/);
  assert.match(route, /if \(userIsAdmin\(req\.user\)\)/);
  assert.match(route, /senderUserId: user\.id/);
  assert.match(route, /eq\(userMediaLibrary\.ownerUserId, userId\)/);
  assert.match(route, /row\.sourceType !== "upload"/);
  assert.match(route, /!row\.mimeType\.toLowerCase\(\)\.startsWith\("image\/"\)/);
  assert.match(route, /router\.get\("\/api\/admin-inbox\/messages", isAuthenticated, requireAdmin/);
});

test("admin inbox persists two-way threads with separate user and admin read paths", () => {
  assert.match(schema, /adminInboxMessages = pgTable/);
  assert.match(schema, /senderReadAt: timestamp\("sender_read_at"\)/);
  assert.match(schema, /adminInboxReplies = pgTable/);
  assert.match(route, /router\.get\("\/api\/admin-inbox\/threads", isAuthenticated/);
  assert.match(route, /eq\(adminInboxMessages\.senderUserId, user\.id\)/);
  assert.match(route, /router\.post\("\/api\/admin-inbox\/messages\/:id\/replies", isAuthenticated/);
  assert.match(route, /senderKind === "user" && thread\.senderUserId !== user\.id/);
  assert.match(route, /router\.patch\("\/api\/admin-inbox\/messages\/:id\/read", isAuthenticated, requireAdmin/);
  assert.match(route, /router\.patch\("\/api\/admin-inbox\/messages\/:id\/user-read", isAuthenticated/);
  assert.match(comms, /adminInboxUnread/);
  assert.match(comms, /total: notifications \+ dms \+ mail \+ adminInbox/);
});

test("admin messages expose raw, email, and agent-readable formats", () => {
  assert.match(route, /rawFields/);
  assert.match(route, /const email = \[/);
  assert.match(route, /const agentMarkdown = \[/);
  assert.match(route, /## Raw form data/);
  assert.match(route, /## Conversation/);
});
