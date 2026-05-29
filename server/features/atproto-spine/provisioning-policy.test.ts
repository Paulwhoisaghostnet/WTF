import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  trackingHandleLabel,
  planProvision,
  repoAccountIdentity,
  REPO_MODES,
} from "./provisioning-policy";

test("identity state machine allows forward progress and blocks regressions", () => {
  assert.equal(canTransition("offered", "provisioning"), true);
  assert.equal(canTransition("provisioning", "active"), true);
  assert.equal(canTransition("failed", "requested"), true);
  assert.equal(canTransition("active", "offered"), false);
  assert.equal(canTransition("active", "failed"), false);
});

test("trackingHandleLabel is a valid 3+ char DNS label", () => {
  assert.equal(trackingHandleLabel(7), "u-7");
  assert.match(trackingHandleLabel(123), /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
});

test("planProvision: tracking holds keys, hosted does not, byo never mints", () => {
  const env = { WTFOS_PDS_USERS_INTERNAL_URL: "http://users-pds:3000" } as NodeJS.ProcessEnv;
  const tracking = planProvision("tracking", env);
  assert.equal(tracking.mintsRepo, true);
  assert.equal(tracking.wtfHoldsKeys, true);
  assert.equal(tracking.pdsUrl, "http://users-pds:3000");

  const hosted = planProvision("hosted", env);
  assert.equal(hosted.mintsRepo, true);
  assert.equal(hosted.wtfHoldsKeys, false);

  const byo = planProvision("byo", env);
  assert.equal(byo.mintsRepo, false);
  assert.equal(byo.pdsUrl, undefined);
});

test("repoAccountIdentity derives handle + email under the network domain", () => {
  const id = repoAccountIdentity(42, undefined, { WTFOS_ATPROTO_NETWORK_DOMAIN: "wtfos.me" } as NodeJS.ProcessEnv);
  assert.equal(id.label, "u-42");
  assert.equal(id.handle, "u-42.wtfos.me");
  assert.equal(id.email, "u-42@users.wtfos.me");
});

test("REPO_MODES enumerates the three documented modes", () => {
  assert.deepEqual([...REPO_MODES].sort(), ["byo", "hosted", "tracking"]);
});
