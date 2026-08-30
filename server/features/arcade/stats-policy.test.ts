import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("server/features/arcade/catalog.ts", "utf8");

test("Arcade creator statistics are derived from persisted games and Game Studio versions", () => {
  assert.match(source, /cgv\.bundle_metadata->>'source'\s*=\s*'game_studio_project'/);
  assert.match(source, /pending_games\.status\s*=\s*'pending'/);
  assert.match(source, /pendingGames:\s*Number\(row\.pending_games/);
  assert.match(source, /gameStudioGames:\s*Number\(row\.game_studio_games/);
  assert.doesNotMatch(source, /pendingGames:\s*0/);
  assert.doesNotMatch(source, /gameStudioGames:\s*0/);
});
