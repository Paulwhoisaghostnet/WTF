import assert from "node:assert/strict";
import test from "node:test";
import { canOpenPageDef, getPageAccessState, PAGE_DEFS } from "../client/src/routes/page-defs";

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
