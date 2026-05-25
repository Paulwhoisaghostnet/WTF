import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const aimSource = readFileSync("client/src/pages/Aim.tsx", "utf8");
const inventory = readFileSync(
  ".agents/docs/live/user-interaction-inventory.md",
  "utf8"
);
const workflows = readFileSync("tests/e2e/inventory/domain-workflows.mjs", "utf8");

test("WIM roster is user-driven and keeps Studio rooms out of buddies", () => {
  assert.match(aimSource, /\/api\/messages\/dms\?type=direct/);
  assert.match(aimSource, /\/api\/messages\/users\?limit=100&excludeSelf=1/);
  assert.match(aimSource, /conversation\.conversationType \?\? "direct"/);
  assert.match(aimSource, /conversation\.peers\.length === 1/);

  for (const label of [
    "My Friends",
    "Online WTF Users",
    "All WTF Users",
    "Recent Direct Chats",
  ]) {
    assert.match(aimSource, new RegExp(label));
  }

  assert.match(aimSource, /onDoubleClickCapture=\{\(\) => openDirectChat\(item\)\}/);
});

test("WIM friend list is browser-local and covered by interaction inventory", () => {
  assert.match(aimSource, /friendStorageKey/);
  assert.match(aimSource, /friendsReady/);
  assert.match(aimSource, /window\.localStorage\.setItem\(key, JSON\.stringify\(friendIds\)\)/);
  assert.match(aimSource, /eventType: "wim\.friend\.added"/);

  assert.match(inventory, /`wim\.friend\.added`/);
  assert.match(inventory, /Studio project rooms stay out of the WIM buddy roster/);
  assert.match(workflows, /"wim\.friend\.added"/);
  assert.match(workflows, /\/api\/messages\/users\?limit=100&excludeSelf=1/);
});
