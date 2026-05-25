import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_LABELS,
  ROLE_ORDER,
  canOpenAppsForRole,
  canParticipate,
  canCreateTvChannels,
  canManageMultipleTvChannels,
  hasAtLeastRole,
} from "./types";

test("trusted creator role grants creator bypass lanes without admin powers", () => {
  assert.ok(ROLE_ORDER.includes("trusted_creator"));
  assert.equal(ROLE_LABELS.trusted_creator, "Trusted Creator");
  assert.ok(DEFAULT_ROLE_PERMISSIONS.trusted_creator.includes("trusted_arcade_creator"));
  assert.ok(DEFAULT_ROLE_PERMISSIONS.trusted_creator.includes("trusted_console_creator"));
  assert.ok(DEFAULT_ROLE_PERMISSIONS.trusted_creator.includes("trusted_tv_creator"));
  assert.ok(DEFAULT_ROLE_PERMISSIONS.trusted_creator.includes("trusted_market_creator"));
  assert.equal(DEFAULT_ROLE_PERMISSIONS.trusted_creator.includes("manage_roles"), false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS.trusted_creator.includes("access_admin_panel"), false);
  assert.equal(canParticipate("trusted_creator"), true);
});

test("trusted creator can create and manage multiple TV channels", () => {
  assert.equal(canCreateTvChannels("trusted_creator"), true);
  assert.equal(canManageMultipleTvChannels("trusted_creator"), true);
});

test("time out role can exist without app or participation access", () => {
  assert.ok(ROLE_ORDER.includes("time_out"));
  assert.equal(ROLE_LABELS.time_out, "time out");
  assert.deepEqual(DEFAULT_ROLE_PERMISSIONS.time_out, []);
  assert.equal(canParticipate("time_out"), false);
  assert.equal(canOpenAppsForRole("time_out"), false);
  assert.equal(hasAtLeastRole("time_out", "witness"), false);
});
