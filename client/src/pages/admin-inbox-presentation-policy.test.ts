import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const page = readFileSync("client/src/pages/AdminInbox.tsx", "utf8");
const mail = readFileSync("client/src/pages/Mail.tsx", "utf8");
const icons = readFileSync("client/src/features/desktop/DesktopIcons.tsx", "utf8");

test("Contact Admin uses one desktop app with role-aware compose and inbox surfaces", () => {
  assert.match(page, /data-admin-inbox-surface=\{isAdmin \? "inbox" : "compose"\}/);
  assert.match(page, /Would you like to attach some screenshots\?/);
  assert.match(page, /Evidence notes/);
  assert.match(page, /Steps to reproduce/);
  assert.match(page, /Raw form table/);
  assert.match(page, /Agent Markdown/);
  assert.match(page, /Send admin reply/);
  assert.match(icons, /key: "admin-inbox"/);
  assert.match(icons, /label: "Contact Admin"/);
  assert.match(icons, /openPath: "\/admin-inbox"/);
});

test("Inbox provides a secondary admin-contact conversation and unread path", () => {
  assert.match(mail, /type InboxView = .*"admin_contact"/);
  assert.match(mail, /"Admin contact", adminContactQuery\.data\?\.unreadCount/);
  assert.match(mail, /\/api\/admin-inbox\/threads/);
  assert.match(mail, /\/api\/admin-inbox\/messages/);
  assert.match(mail, /Reply in admin conversation/);
  assert.match(mail, /cards\.filter\(\(card\) => !card\.read\)\.length \+ \(adminContactQuery\.data\?\.unreadCount \?\? 0\)/);
});
