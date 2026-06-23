import assert from "node:assert/strict";
import test from "node:test";

import {
  COBWEBSAINTS_FULL_USER_ROLE,
  DEFAULT_ROLE_CATALOG,
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_LABELS,
  ROLE_ORDER,
  canOpenAppsForRole,
  canParticipate,
  canCreateTvChannels,
  canManageMultipleTvChannels,
  hasAtLeastRole,
  isAdmin,
  normalizeUserRoles,
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

test("cobwebsaints full user role grants full non-admin user permissions", () => {
  assert.equal(ROLE_LABELS[COBWEBSAINTS_FULL_USER_ROLE], "Cobwebsaints Full User");
  const roleDefinition = DEFAULT_ROLE_CATALOG.find((role) => role.slug === COBWEBSAINTS_FULL_USER_ROLE);
  assert.equal(roleDefinition?.defaultWtfOsAccess, true);
  assert.equal(roleDefinition?.isSystem, false);
  assert.equal(roleDefinition?.isAssignable, false);
  assert.ok(DEFAULT_ROLE_PERMISSIONS[COBWEBSAINTS_FULL_USER_ROLE].includes("trusted_arcade_creator"));
  assert.ok(DEFAULT_ROLE_PERMISSIONS[COBWEBSAINTS_FULL_USER_ROLE].includes("trusted_console_creator"));
  assert.ok(DEFAULT_ROLE_PERMISSIONS[COBWEBSAINTS_FULL_USER_ROLE].includes("trusted_tv_creator"));
  assert.ok(DEFAULT_ROLE_PERMISSIONS[COBWEBSAINTS_FULL_USER_ROLE].includes("trusted_market_creator"));
  assert.ok(DEFAULT_ROLE_PERMISSIONS[COBWEBSAINTS_FULL_USER_ROLE].includes("use_wtfos_pinning"));
  assert.equal(DEFAULT_ROLE_PERMISSIONS[COBWEBSAINTS_FULL_USER_ROLE].includes("pin_threads"), false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS[COBWEBSAINTS_FULL_USER_ROLE].includes("access_admin_panel"), false);
  assert.equal(DEFAULT_ROLE_PERMISSIONS[COBWEBSAINTS_FULL_USER_ROLE].includes("manage_roles"), false);
  assert.equal(isAdmin(COBWEBSAINTS_FULL_USER_ROLE), false);
  assert.equal(canParticipate(COBWEBSAINTS_FULL_USER_ROLE), true);
  assert.equal(hasAtLeastRole(COBWEBSAINTS_FULL_USER_ROLE, "trusted_creator"), true);
  assert.equal(hasAtLeastRole(COBWEBSAINTS_FULL_USER_ROLE, "cohost"), false);
  assert.equal(canCreateTvChannels(COBWEBSAINTS_FULL_USER_ROLE), true);
  assert.equal(canManageMultipleTvChannels(COBWEBSAINTS_FULL_USER_ROLE), true);
  assert.deepEqual(
    normalizeUserRoles(["badge:first_win", "contestant", COBWEBSAINTS_FULL_USER_ROLE]),
    [COBWEBSAINTS_FULL_USER_ROLE, "contestant", "badge:first_win"]
  );
});

test("time out role can exist without app or participation access", () => {
  assert.ok(ROLE_ORDER.includes("time_out"));
  assert.equal(ROLE_LABELS.time_out, "time out");
  assert.deepEqual(DEFAULT_ROLE_PERMISSIONS.time_out, []);
  assert.equal(canParticipate("time_out"), false);
  assert.equal(canOpenAppsForRole("time_out"), false);
  assert.equal(hasAtLeastRole("time_out", "witness"), false);
});
