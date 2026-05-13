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
  assert(ids.has("route:/file-manager"));
  assert(ids.has("app:/file-manager"));
  assert(ids.has("route:/settings"));
  assert(ids.has("app:/settings"));
  assert(ids.has("route:/browser-boundaries"));
  assert(ids.has("app:/browser-boundaries"));
  assert(ids.has("route:/terminal"));
  assert(ids.has("app:/terminal"));
  assert(ids.has("route:/theme-builder"));
  assert(ids.has("app:/theme-builder"));
  assert(ids.has("route:/notification-center"));
  assert(ids.has("app:/notification-center"));
  assert(ids.has("route:/notifications"));
  assert(ids.has("reward:claimable"));
  assert(ids.has("wallet:activity"));
  assert(ids.has("media:library"));
  assert(ids.has("media:ipfs"));
  assert(ids.has("project:bundles"));
  assert(ids.has("system:checks"));
  assert(ids.has("system:run-checks"));
  assert(ids.has("system:recovery"));
  assert(ids.has("system:export-logs"));
  assert(ids.has("system:restore-backup"));
  assert(ids.has("system:settings"));
  assert(ids.has("system:notification-center"));
  assert(ids.has("system:appearance"));
  assert(ids.has("system:browser-boundaries"));
  assert(ids.has("system:terminal"));
});

test("command palette hides admin-only commands from normal users", () => {
  const userCommands = buildCommandPaletteCommands(PAGE_DEFS, "contestant");
  const adminCommands = buildCommandPaletteCommands(PAGE_DEFS, "admin");

  assert.equal(userCommands.some((command) => command.path === "/admin"), false);
  assert.equal(userCommands.some((command) => command.path === "/backup-manager"), false);
  assert.equal(adminCommands.some((command) => command.path === "/admin"), true);
  assert.equal(adminCommands.some((command) => command.path === "/backup-manager"), true);
});

test("command palette does not promote admin tools as desktop apps", () => {
  const adminCommands = buildCommandPaletteCommands(PAGE_DEFS, "admin");

  assert.equal(adminCommands.some((command) => command.id === "app:/control-board"), false);
  assert.equal(adminCommands.some((command) => command.id === "route:/control-board"), true);
});

test("command palette search matches aliases and keeps stable priority", () => {
  const commands = buildCommandPaletteCommands(PAGE_DEFS, "contestant");
  const rewardMatches = filterCommandPaletteCommands(commands, "claim reward");
  const healthMatches = filterCommandPaletteCommands(commands, "failed jobs");
  const recoveryMatches = filterCommandPaletteCommands(commands, "wallet repair");
  const fileMatches = filterCommandPaletteCommands(commands, "file manager");
  const settingsMatches = filterCommandPaletteCommands(commands, "system settings");
  const themeMatches = filterCommandPaletteCommands(commands, "theme colors");
  const boundaryMatches = filterCommandPaletteCommands(commands, "browser csp");
  const terminalMatches = filterCommandPaletteCommands(commands, "terminal jobs");
  const notificationMatches = filterCommandPaletteCommands(commands, "notification center");
  const ipfsMatches = filterCommandPaletteCommands(commands, "pin ipfs");
  const backupMatches = filterCommandPaletteCommands(commands, "restore backup");
  const logsMatches = filterCommandPaletteCommands(commands, "export logs");
  const adminCommands = buildCommandPaletteCommands(PAGE_DEFS, "admin");
  const backupManagerMatches = filterCommandPaletteCommands(adminCommands, "backup manager");

  assert.equal(rewardMatches[0]?.id, "reward:claimable");
  assert.equal(healthMatches[0]?.id, "system:checks");
  assert.equal(recoveryMatches[0]?.id, "system:recovery");
  assert.equal(fileMatches[0]?.id, "app:/file-manager");
  assert.equal(settingsMatches[0]?.id, "system:settings");
  assert.equal(themeMatches[0]?.id, "system:appearance");
  assert.equal(boundaryMatches[0]?.id, "system:browser-boundaries");
  assert.equal(terminalMatches[0]?.id, "system:terminal");
  assert.equal(notificationMatches[0]?.id, "system:notification-center");
  assert.equal(ipfsMatches[0]?.id, "media:ipfs");
  assert.equal(backupMatches[0]?.id, "system:restore-backup");
  assert.equal(backupManagerMatches[0]?.id, "admin:backup-manager");
  assert.equal(logsMatches[0]?.id, "system:export-logs");
});
