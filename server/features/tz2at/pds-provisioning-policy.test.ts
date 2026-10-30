import assert from "node:assert/strict";
import test from "node:test";
import { wtfosPdsProvisioningEnabledForUser } from "./pds-provisioning-policy";

test("PDS provisioning is closed by default and an exact user ID allowlist stays narrow", () => {
  assert.equal(wtfosPdsProvisioningEnabledForUser(42, {}), false);
  const scoped = { WTFOS_PDS_PROVISIONING_ALLOWED_USER_IDS: "7, 42,invalid,042,0" };
  assert.equal(wtfosPdsProvisioningEnabledForUser(42, scoped), true);
  assert.equal(wtfosPdsProvisioningEnabledForUser(43, scoped), false);
  assert.equal(wtfosPdsProvisioningEnabledForUser(0, scoped), false);
  assert.equal(wtfosPdsProvisioningEnabledForUser(Number.MAX_SAFE_INTEGER + 1, scoped), false);
});

test("the existing global rollout flag retains its meaning", () => {
  const global = { WTFOS_PDS_PROVISIONING_ENABLED: "true" };
  assert.equal(wtfosPdsProvisioningEnabledForUser(42, global), true);
  assert.equal(wtfosPdsProvisioningEnabledForUser(43, global), true);
  assert.equal(wtfosPdsProvisioningEnabledForUser(43, { WTFOS_PDS_PROVISIONING_ENABLED: "false" }), false);
});
