import test from "node:test";
import assert from "node:assert/strict";
import {
  getSkywireRolloutConfig,
  userEligibleForSkywireRollout,
  userEligibleForWtfLive,
} from "../../../shared/skywire-rollout";

test("skywire rollout defaults to staff alpha with WTF LIVE enabled", () => {
  const config = getSkywireRolloutConfig({});
  assert.equal(config.rolloutMode, "staff_alpha");
  assert.equal(config.wtfLiveEnabled, true);
  assert.equal(config.atprotoEnabled, true);
});

test("staff alpha eligibility covers operator and test roles", () => {
  const config = getSkywireRolloutConfig({});
  for (const role of ["admin", "host", "cohost", "resident_wizard", "test_subject"] as const) {
    assert.equal(userEligibleForSkywireRollout(role, config), true, role);
    assert.equal(userEligibleForWtfLive(role, config), true, role);
  }
  assert.equal(userEligibleForSkywireRollout("witness", config), false);
  assert.equal(userEligibleForSkywireRollout("contestant", config), false);
});

test("all_users rollout opens skywire to signed-in community roles", () => {
  const config = getSkywireRolloutConfig({ SKYWIRE_ROLLOUT_MODE: "all_users" });
  assert.equal(userEligibleForSkywireRollout("witness", config), true);
  assert.equal(userEligibleForSkywireRollout("contestant", config), true);
});

test("disabled rollout keeps admin repair access only", () => {
  const config = getSkywireRolloutConfig({ SKYWIRE_ROLLOUT_MODE: "disabled" });
  assert.equal(userEligibleForSkywireRollout("admin", config), true);
  assert.equal(userEligibleForSkywireRollout("host", config), false);
  assert.equal(userEligibleForWtfLive("host", config), false);
});
