import assert from "node:assert/strict";
import test from "node:test";
import { canAccessLegacyChannel } from "./legacy-channel-permissions";

test("legacy all-audience channels still require a known signed-in role", () => {
  assert.equal(canAccessLegacyChannel("all", ["witness"]), true);
  assert.equal(canAccessLegacyChannel("all", []), false);
});

test("legacy restricted channels admit only their audience plus staff", () => {
  assert.equal(canAccessLegacyChannel("contestants", ["contestant"]), true);
  assert.equal(canAccessLegacyChannel("contestants", ["season_3_contestant"]), true);
  assert.equal(canAccessLegacyChannel("contestants", ["witness"]), false);
  assert.equal(canAccessLegacyChannel("hosts", ["host"]), true);
  assert.equal(canAccessLegacyChannel("hosts", ["cohost"]), true);
  assert.equal(canAccessLegacyChannel("hosts", ["contestant"]), false);
  assert.equal(canAccessLegacyChannel("witnesses", ["witness"]), true);
  assert.equal(canAccessLegacyChannel("witnesses", ["contestant"]), false);
  assert.equal(canAccessLegacyChannel("witnesses", ["admin"]), true);
});

test("legacy channel access fails closed for an unknown access level", () => {
  assert.equal(canAccessLegacyChannel("surprise", ["admin"]), false);
});
