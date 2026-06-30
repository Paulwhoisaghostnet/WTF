import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const messagesSource = readFileSync(new URL("./Messages.tsx", import.meta.url), "utf8");

test("Messages and Notification Center chrome is presentation-host aware", () => {
  assert.match(messagesSource, /usePresentationShell/);
  assert.match(messagesSource, /data-messages-presentation-host=\{presentation\.host\}/);
  assert.match(messagesSource, /data-messages-surface=\{initialTab === "notifications" \? "notifications" : "inbox"\}/);
  assert.match(messagesSource, /data-messages-region="surface"/);
  assert.match(messagesSource, /data-messages-region="layout"/);
  assert.match(messagesSource, /data-messages-region="conversation-button"/);
  assert.match(messagesSource, /data-messages-region="message-list"/);
  assert.match(messagesSource, /data-messages-region="input-row"/);
  assert.match(messagesSource, /data-messages-region="notification-row"/);
  assert.match(messagesSource, /data-messages-region="preference-row"/);
  assert.match(messagesSource, /\[data-messages-presentation-host="gamma"\]/);
  assert.match(messagesSource, /\[data-messages-presentation-host="gamma"\][\s\S]*?background-image:\s*none/);
  assert.match(messagesSource, /\[data-messages-presentation-host="gamma"\][\s\S]*?box-shadow:\s*none/);
  assert.match(messagesSource, /\[data-messages-presentation-host="gamma"\][\s\S]*?border-radius:\s*6px/);
  assert.match(messagesSource, /letter-spacing:\s*0/);
});

test("Messages Studio handoffs preserve the Gamma presentation route", () => {
  assert.match(messagesSource, /const openStudioProject = \(projectId: number\) =>/);
  assert.match(messagesSource, /presentation\.host === "gamma"/);
  assert.match(messagesSource, /setLocation\(presentationRouteHref\(route, presentation\.host\)\)/);
  assert.match(messagesSource, /wm\.openPage\(route\)/);
  assert.match(messagesSource, /openStudioProject\(projectId\)/);
  assert.match(messagesSource, /openStudioProject\(currentStudioProjectId\)/);
  assert.doesNotMatch(messagesSource, /wm\.openPage\(`\/studio\/\$\{projectId\}`\)/);
  assert.doesNotMatch(messagesSource, /wm\.openPage\(`\/studio\/\$\{currentStudioProjectId\}`\)/);
});

test("Messages keeps shared communication APIs unchanged", () => {
  for (const apiPath of [
    "/api/messages/users?limit=200",
    "/api/messages/dms",
    "/api/notifications/preferences",
    "/api/notifications/read-all",
  ]) {
    assert.match(messagesSource, new RegExp(apiPath.replace(/[/?]/g, "\\$&")));
  }
  assert.match(messagesSource, /`\/api\/messages\/dms\/\$\{activeConversationId\}\/messages\?limit=100`/);
  assert.match(messagesSource, /`\/api\/notifications\?limit=200\$\{notificationsUnreadOnly \? "&unreadOnly=true" : ""\}`/);
  assert.match(messagesSource, /`\/api\/notifications\/\$\{notificationId\}\/read`/);
  assert.match(messagesSource, /`\/api\/notifications\/\$\{item\.id\}\/opened`/);
  assert.doesNotMatch(messagesSource, /\/api\/gamma/);
});
