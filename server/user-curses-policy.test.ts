import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("admin user routes expose durable curse assignment controls", () => {
  const source = read("server/features/admin/users/identity-profile-routes.ts");
  assert.match(source, /\/api\/admin\/users\/:id\/curses\/:curseKey/);
  assert.match(source, /requirePermission\("manage_roles"\)/);
  assert.match(source, /admin\.user\.curse_assigned/);
  assert.match(source, /admin\.user\.curse_lifted/);
});

test("WTF reward embargo blocks platform WTF reward ledger grants", () => {
  const sideQuests = read("server/routes/side-quests.ts");
  const crpVerifier = read("server/lib/verifiers/crp-nomination-watcher.ts");
  const rewards = read("server/routes/rewards.ts");

  assert.match(sideQuests, /hasActiveUserCurse\(userId,\s*"wtf_reward_embargo"\)/);
  assert.match(crpVerifier, /hasActiveUserCurse\(nominatorUserId,\s*"wtf_reward_embargo"\)/);
  assert.match(rewards, /reason:\s*"wtf_reward_embargo"/);
});

test("desktop shell renders cursed OS effects from auth status", () => {
  const desktop = read("client/src/components/layout/Desktop.tsx");
  const effects = read("client/src/features/desktop/CursedDesktopEffects.tsx");

  assert.match(desktop, /normalizeWtfCurseStatuses\(user\?\.curses\)/);
  assert.match(desktop, /<CursedDesktopEffects curses=\{activeCurses\}/);
  assert.match(effects, /green_lens/);
  assert.match(effects, /inverted_click_mouse/);
  assert.match(effects, /liability_waiver/);
});
