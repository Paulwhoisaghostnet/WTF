import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const messagesSource = readFileSync("client/src/pages/Messages.tsx", "utf8");

test("Notification Center emits shell events for view and user actions", () => {
  for (const eventType of [
    "notification_center.viewed",
    "notification_center.mark_read",
    "notification_center.mark_all_read",
    "notification_center.preferences_saved",
    "notification_center.notification_opened",
    "notification_center.filter_changed",
  ]) {
    assert.match(messagesSource, new RegExp(`eventType:\\s*"${eventType}"`));
  }
});
