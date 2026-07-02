import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mailSource = readFileSync(new URL("./Mail.tsx", import.meta.url), "utf8");

test("Inbox app chrome is presentation-host aware", () => {
  assert.match(mailSource, /usePresentationShell/);
  assert.match(mailSource, /data-mail-presentation-host=\{presentation\.host\}/);
  assert.match(mailSource, /data-mail-surface="inbox"/);
  assert.match(mailSource, /data-mail-region="surface"/);
  assert.match(mailSource, /data-mail-region="nav-panel"/);
  assert.match(mailSource, /data-mail-region="mailbox-panel"/);
  assert.match(mailSource, /data-mail-region="workspace"/);
  assert.match(mailSource, /data-mail-region="messages-panel"/);
  assert.match(mailSource, /data-mail-region="message-row"/);
  assert.match(mailSource, /data-mail-region="compose-panel"/);
  assert.match(mailSource, /data-mail-region="selected-panel"/);
  assert.match(mailSource, /data-mail-region="reader"/);
  assert.match(mailSource, /data-mail-region="send-button"/);
  assert.match(mailSource, /data-mail-region="conversation-compose"/);
});

test("Inbox Gamma chrome is scoped to presentation styling only", () => {
  assert.match(mailSource, /data-mail-presentation-host="gamma"/);
  assert.match(mailSource, /background-image:\s*none\s*!important/);
  assert.match(mailSource, /box-shadow:\s*none\s*!important/);
  assert.match(mailSource, /border-width:\s*1px\s*!important/);
  assert.match(mailSource, /border-radius:\s*6px\s*!important/);
  assert.match(mailSource, /letter-spacing:\s*0\s*!important/);
  assert.match(mailSource, /#070706/);
  assert.match(mailSource, /#11110f/);
  assert.match(mailSource, /#00d2ff/);
  assert.match(mailSource, /#f2ead9/);
});

test("Inbox keeps shared mailbox, comms, WIM, and notification APIs separate", () => {
  assert.match(mailSource, /api\.get<MailStatus>\("\/api\/mail\/status"\)/);
  assert.match(mailSource, /api\.get<\{ messages: MailMessage\[\] \}>\("\/api\/mail\/messages"\)/);
  assert.match(mailSource, /api\.get<\{ items: CommunicationCard\[\] \}>\("\/api\/comms\/items\?limit=120"\)/);
  assert.match(mailSource, /api\.get<DmConversation\[\]>\("\/api\/messages\/dms"\)/);
  assert.match(mailSource, /api\.get<NotificationListResponse>\("\/api\/notifications\?limit=200"\)/);
  assert.match(mailSource, /api\.post\("\/api\/mail\/send"/);
  assert.match(mailSource, /api\.post<\{ id: number \}>\("\/api\/messages\/dms", \{ targetUserId \}\)/);
  assert.match(mailSource, /api\.post\(`\/api\/messages\/dms\/\$\{input\.conversationId\}\/messages`, \{ content: input\.body \}\)/);
  assert.match(mailSource, /api\.post\(`\/api\/comms\/items\/\$\{id\}\/read`, \{\}\)/);
  assert.match(mailSource, /api\.put\(`\/api\/notifications\/\$\{id\}\/read`, \{ read: true \}\)/);
  assert.match(mailSource, /api\.put\(`\/api\/messages\/dms\/\$\{id\}\/read`, \{\}\)/);
  assert.match(mailSource, /qc\.invalidateQueries\(\{ queryKey: \["mail", "messages"\] \}\)/);
  assert.match(mailSource, /qc\.invalidateQueries\(\{ queryKey: \["comms"\] \}\)/);
  assert.match(mailSource, /qc\.invalidateQueries\(\{ queryKey: \["inbox", "unread-count"\] \}\)/);
  assert.doesNotMatch(mailSource, /\/api\/gamma/);
});

test("Inbox exposes first-class compose and WIM conversation reply controls", () => {
  for (const expected of [
    "startNewDraft",
    "New message",
    "New mail",
    "ConversationComposer",
    'activeKind = active?.conversationType === "studio" ? "Studio" : "WIM"',
    "`${activeKind} conversation reply`",
    "Send {activeKind}",
    "Save as draft",
    "sendConversationDraft",
    "conversationDrafts",
    "primeConversationReply",
    'eventType: "mail.message.sent"',
    'eventType: "dm.message.sent"',
  ]) {
    assert.match(mailSource, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Inbox exposes the required message-center categories and local actions", () => {
  for (const key of [
    "system",
    "admin",
    "user_mail",
    "wim",
    "invite",
    "notification_subscription",
    "studio",
  ]) {
    assert.match(mailSource, new RegExp(`${key}: \\{`));
  }

  for (const eventType of [
    "inbox.viewed",
    "inbox.message.read",
    "inbox.message.flagged",
    "inbox.message.starred",
    "inbox.message.bookmarked",
    "inbox.message.reacted",
    "inbox.message.replied",
    "inbox.message.forwarded",
    "inbox.draft.saved",
  ]) {
    assert.match(mailSource, new RegExp(eventType.replace(/[.]/g, "\\.")));
  }
});
