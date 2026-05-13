import assert from "node:assert/strict";
import test from "node:test";
import { PAGE_DEFS } from "../../routes/page-defs";
import {
  buildCommandPaletteCommands,
  filterCommandPaletteCommands,
} from "./command-palette-model";

test("command palette exposes live registry and sacred workflow commands", () => {
  const commands = buildCommandPaletteCommands(PAGE_DEFS, "contestant");
  const ids = new Set(commands.map((command) => command.id));

  assert(ids.has("route:/mission-control"));
  assert(ids.has("app:/mission-control"));
  assert(ids.has("reward:claimable"));
  assert(ids.has("wallet:activity"));
  assert(ids.has("media:library"));
  assert(ids.has("system:checks"));
  assert(ids.has("system:recovery"));
});

test("command palette hides admin-only commands from normal users", () => {
  const userCommands = buildCommandPaletteCommands(PAGE_DEFS, "contestant");
  const adminCommands = buildCommandPaletteCommands(PAGE_DEFS, "admin");

  assert.equal(userCommands.some((command) => command.path === "/admin"), false);
  assert.equal(adminCommands.some((command) => command.path === "/admin"), true);
});

test("command palette search matches aliases and keeps stable priority", () => {
  const commands = buildCommandPaletteCommands(PAGE_DEFS, "contestant");
  const rewardMatches = filterCommandPaletteCommands(commands, "claim reward");
  const healthMatches = filterCommandPaletteCommands(commands, "failed jobs");
  const recoveryMatches = filterCommandPaletteCommands(commands, "wallet repair");

  assert.equal(rewardMatches[0]?.id, "reward:claimable");
  assert.equal(healthMatches[0]?.id, "system:checks");
  assert.equal(recoveryMatches[0]?.id, "system:recovery");
});
