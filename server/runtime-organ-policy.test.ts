import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const routes = readFileSync("server/routes.ts", "utf8");
const sessions = readFileSync("server/features/arcade/sessions.ts", "utf8");

test("each route organ is mounted once", () => {
  assert.equal((routes.match(/app\.use\(accessRoutes\);/g) || []).length, 1);
});

test("creator payout intent is connected to successful paid Arcade sessions", () => {
  const payout = readFileSync("server/features/arcade/creator-payout.ts", "utf8");
  assert.match(sessions, /import \{ onArcadePlayConsumed \} from "\.\/creator-payout"/);
  assert.match(sessions, /if \(ticket\.consumed\)[\s\S]*await onArcadePlayConsumed\(/);
  assert.match(payout, /action: "arcade\.creator_payout\.pending"/);
});

test("superseded disconnected prototypes are removed", () => {
  for (const file of [
    "server/lib/external-listings.ts",
    "server/lib/external-listings.test.ts",
    "server/features/discovery/discord-commands.ts",
  ]) {
    assert.equal(existsSync(file), false, `${file} is still a disconnected organ`);
  }
});
