import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isStarterDesktopAppearance,
  starterWelcomeMessage,
  STARTER_WELCOME_DM_SOURCE,
} from "./welcome-dm-policy";

test("only new starter desktop accounts receive the welcome DM", () => {
  assert.equal(isStarterDesktopAppearance({ desktopIconMode: "starter" }), true);
  assert.equal(isStarterDesktopAppearance({ desktopIconMode: "classic" }), false);
  assert.equal(isStarterDesktopAppearance({}), false);
  assert.equal(isStarterDesktopAppearance(null), false);
  assert.equal(isStarterDesktopAppearance([]), false);
});

test("welcome steps use real profile, EXP, and role milestones", () => {
  const message = starterWelcomeMessage();
  assert.match(message, /Open Profile/);
  assert.match(message, /verify a Tezos wallet or a social account/);
  assert.match(message, /verified actions that can earn EXP/);
  assert.match(message, /EXP tier and title update/);
  assert.match(message, /Green Room/);
  assert.match(message, /completing it can unlock the contestant role/);
  assert.match(message, /Stuffs on the bottom bar/);
  assert.match(message, /Click Paul/);
  assert.doesNotMatch(message, /EXP alone (?:grants|unlocks)|automatically (?:grants|unlocks) (?:a )?role/i);
});

test("delivery retries after welcome completion and persists a single unread DM", () => {
  const hook = readFileSync("server/auth/welcome-event.ts", "utf8");
  const delivery = readFileSync("server/auth/welcome-dm.ts", "utf8");
  assert.ok(hook.indexOf("ensureStarterWelcomeDm(user.id)") < hook.indexOf("if (!shouldRunWelcomeEvent(user)) return"));
  assert.match(delivery, /pg_advisory_xact_lock/);
  assert.match(delivery, /dmMessages\.metadata\}->>'source'/);
  assert.match(delivery, /if \(existing\) return \{ created: false \}/);
  assert.match(delivery, /lastReadAt: null/);
  assert.match(delivery, /publishCommunicationItemBestEffort/);
  assert.match(delivery, /ADMIN_USERNAME = "wtf-admin"/);
  assert.match(delivery, /if \(!admin \|\| admin\.id === targetUserId\) return false/);
  assert.equal(STARTER_WELCOME_DM_SOURCE, "wtfos-starter-welcome");
});
