import assert from "node:assert/strict";
import test from "node:test";
import {
  ROLE_ORDER,
  canOpenAppsForRole,
  canParticipate,
  isAdmin,
  normalizeUserRoles,
} from "./types";
import { canOpenPageDef, getPageAccessState, PAGE_DEFS } from "../client/src/routes/page-defs";

test("user roles are canonical additive memberships", () => {
  assert.ok(ROLE_ORDER.includes("test_subject"));
  assert.deepEqual(
    normalizeUserRoles(["witness", "admin", "test_subject", "witness"]),
    ["admin", "test_subject", "witness"]
  );
  assert.equal(isAdmin(["witness", "admin"]), true);
  assert.equal(canParticipate(["witness", "contestant"]), true);
  assert.equal(canOpenAppsForRole(["time_out"]), false);
  assert.equal(canOpenAppsForRole(["time_out", "test_subject"]), true);
  assert.deepEqual(
    normalizeUserRoles(["badge:first_win", "witness", "builder_tools"]),
    ["witness", "badge:first_win", "builder_tools"]
  );
});

test("WTF OS surface grants can unlock registered experimental routes", () => {
  const uxLab = PAGE_DEFS.find((def) => def.pattern === "/dev/ux-lab");
  assert.ok(uxLab);
  assert.equal(canOpenPageDef(uxLab, ["test_subject"], []), false);
  assert.equal(canOpenPageDef(uxLab, ["test_subject"], ["ux-lab"]), true);
});

test("desktop app disabled state is a runtime route denial, not only launcher chrome", () => {
  const arcade = PAGE_DEFS.find((def) => def.pattern === "/arcade");
  const missionControl = PAGE_DEFS.find((def) => def.pattern === "/mission-control");
  assert.ok(arcade);
  assert.ok(missionControl);

  const arcadeState = getPageAccessState(arcade, "contestant", [], { arcade: false });
  assert.equal(arcadeState.allowed, false);
  assert.equal(arcadeState.reason, "app-disabled");
  assert.equal(arcadeState.appKey, "arcade");
  assert.equal(canOpenPageDef(arcade, "contestant", [], { arcade: false }), false);
  assert.equal(canOpenPageDef(missionControl, "contestant", [], { arcade: false }), true);
});
