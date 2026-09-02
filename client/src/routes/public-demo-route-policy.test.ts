import assert from "node:assert/strict";
import test from "node:test";
import { getPageAccessState, PAGE_DEFS } from "./page-defs";

test("Map Lab direct route keeps its public demo visible without an app-store entitlement", () => {
  const mapLab = PAGE_DEFS.find((def) => def.pattern === "/map-lab");
  assert.ok(mapLab);
  assert.equal(mapLab.auth, false);
  assert.equal(mapLab.publicDemoWhenAppUnavailable, true);
  assert.deepEqual(getPageAccessState(mapLab, null, [], { "map-lab": false }), {
    allowed: true,
    surfaceId: "map-lab",
    appKey: "map-lab",
  });
});

test("public demo exception does not unlock unrelated app-store routes", () => {
  const tv = PAGE_DEFS.find((def) => def.pattern === "/tv");
  assert.ok(tv);
  const state = getPageAccessState(tv, null, [], { tv: false });
  assert.equal(state.allowed, false);
});
