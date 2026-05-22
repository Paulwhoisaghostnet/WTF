import assert from "node:assert/strict";
import test from "node:test";
import { customerChallengeTitle } from "./challenge-display";

test("customerChallengeTitle hides legacy live puppet headers", () => {
  assert.equal(
    customerChallengeTitle("Live puppet UI readiness live-puppet-ui-ready-mpbtwrnd"),
    "Community Warm-Up Challenge"
  );
  assert.equal(
    customerChallengeTitle("Live puppet show readiness live-puppet-show-ready-mpbs88ct"),
    "Show Readiness Challenge"
  );
});

test("customerChallengeTitle preserves real challenge names", () => {
  assert.equal(customerChallengeTitle("Daily Side Quest Sweep"), "Daily Side Quest Sweep");
  assert.equal(customerChallengeTitle(""), "Untitled Challenge");
});
