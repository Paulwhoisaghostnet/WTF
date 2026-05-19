import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PAGE_DEFS } from "../routes/page-defs";
import { ALL_ADMIN_SURFACES } from "../features/admin-os/admin-surface-registry";

const missionControlSource = readFileSync("client/src/pages/MissionControl.tsx", "utf8");
const commandPaletteSource = readFileSync(
  "client/src/features/command-palette/command-palette-model.ts",
  "utf8"
);
const browserBoundariesSource = readFileSync(
  "client/src/pages/BrowserBoundaries.tsx",
  "utf8"
);
const recoveryModeModelSource = readFileSync(
  "client/src/pages/recovery-mode-model.ts",
  "utf8"
);
const interactionInventory = readFileSync(
  ".agents/docs/live/user-interaction-inventory.md",
  "utf8"
);

const phase4Surfaces = [
  { title: "Mission Control", route: "/mission-control", adminId: "mission-control" },
  { title: "File Manager", route: "/file-manager", adminId: "file-manager" },
  { title: "Settings", route: "/settings", adminId: "system-settings" },
  { title: "Terminal", route: "/terminal", adminId: "terminal" },
  { title: "Command Palette", route: "/command-palette", adminId: "command-palette" },
  { title: "Notification Center", route: "/notification-center", adminId: "notifications" },
  { title: "Backup Manager", route: "/backup-manager", adminId: "backup-manager" },
  { title: "Browser Boundaries", route: "/browser-boundaries", adminId: "browser-boundaries" },
  { title: "Recovery Mode", route: "/recovery-mode", adminId: "recovery-mode" },
  { title: "Theme Builder", route: "/theme-builder", adminId: "desktop-appearance" },
];

test("Phase 4 shell surfaces are route-backed and admin observable", () => {
  for (const surface of phase4Surfaces) {
    assert(
      PAGE_DEFS.some((def) => def.pattern === surface.route),
      `${surface.title} must be a registered route`
    );
    assert(
      ALL_ADMIN_SURFACES.some((entry) => entry.id === surface.adminId),
      `${surface.title} must be visible to admin observability`
    );
  }
});

test("Mission Control answers the Law-required user questions without admin routing", () => {
  for (const text of [
    "Where am I?",
    "Active wallet",
    "What counts",
    "Rewards",
    "What failed",
    "What changed",
    "What happens next",
    "Side Quests",
    "Transaction costs",
  ]) {
    assert.match(missionControlSource, new RegExp(text.replace("?", "\\?")));
  }

  assert.doesNotMatch(
    missionControlSource,
    /openMissionRoute\("\/admin"/,
    "Mission Control should not send normal users into admin tools"
  );
});

test("Command palette covers required Phase 4 recovery and workflow commands", () => {
  for (const label of [
    "Open Active Rounds",
    "Find Claimable Rewards",
    "Show Wallet Activity",
    "Prepare Media for IPFS",
    "Open Project Bundles",
    "Review Running Checks",
    "Export Recovery Report",
    "Restore or Prove Backup",
  ]) {
    assert.match(commandPaletteSource, new RegExp(label));
  }
});

test("Browser Boundaries and Recovery Mode cover the required safety modes", () => {
  for (const label of [
    "Normal browsing",
    "Wallet-safe mode",
    "Local development",
    "Media capture",
    "Archive/save-to-project",
    "Admin surfaces",
  ]) {
    assert.match(browserBoundariesSource, new RegExp(label));
  }

  for (const action of [
    "disconnect-wallets",
    "reset-networks",
    "check-filesystem",
    "export-report",
    "open-emergency-shell",
    "permissions-reset",
    "app-rollback",
    "restore-proof",
    "disable-drivers",
  ]) {
    assert.match(recoveryModeModelSource, new RegExp(action));
  }
});

test("Interaction inventory names the Phase 4 shell surfaces and event spine", () => {
  for (const handle of [
    "mission_control.viewed",
    "mission_control.action_opened",
    "command_palette.opened",
    "file_manager.viewed",
    "system_settings.viewed",
    "browser_boundaries.action_opened",
    "terminal.command_executed",
    "notification_center.viewed",
    "recovery_mode.action_opened",
    "desktop.settings.viewed",
    "backup_manager.viewed",
  ]) {
    assert.match(interactionInventory, new RegExp(`\\\`${handle}\\\``));
  }
});
