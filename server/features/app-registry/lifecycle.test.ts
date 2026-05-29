import test from "node:test";
import assert from "node:assert/strict";
import {
  appearsInCommandPalette,
  canTransitionLifecycle,
  isActiveLifecycleState,
  isInstallable,
  isLifecycleState,
  lifecycleAfterReregister,
  type InstallableInput,
} from "./lifecycle";

test("lifecycle happy path: draft → registered → alpha → published", () => {
  assert.equal(canTransitionLifecycle("draft", "registered"), true);
  assert.equal(canTransitionLifecycle("registered", "alpha"), true);
  assert.equal(canTransitionLifecycle("alpha", "published"), true);
});

test("lifecycle blocks illegal jumps", () => {
  assert.equal(canTransitionLifecycle("draft", "published"), false);
  assert.equal(canTransitionLifecycle("draft", "alpha"), false);
  assert.equal(canTransitionLifecycle("published", "alpha"), false);
});

test("auto + admin states are reachable and recoverable", () => {
  assert.equal(canTransitionLifecycle("published", "needs-reregister"), true);
  assert.equal(canTransitionLifecycle("needs-reregister", "registered"), true);
  assert.equal(canTransitionLifecycle("alpha", "disabled"), true);
  assert.equal(canTransitionLifecycle("disabled", "registered"), true);
  assert.equal(canTransitionLifecycle("registered", "revoked"), true);
  assert.equal(canTransitionLifecycle("revoked", "registered"), true);
});

test("isLifecycleState validates membership", () => {
  assert.equal(isLifecycleState("published"), true);
  assert.equal(isLifecycleState("nope"), false);
});

test("isActiveLifecycleState only alpha + published", () => {
  assert.equal(isActiveLifecycleState("alpha"), true);
  assert.equal(isActiveLifecycleState("published"), true);
  assert.equal(isActiveLifecycleState("registered"), false);
  assert.equal(isActiveLifecycleState("needs-reregister"), false);
});

const baseInstall: InstallableInput = {
  state: "published",
  appRegistryEnabled: true,
  enabled: true,
  keyValid: true,
  fingerprintMatches: true,
  isAlphaCohortMember: false,
};

test("isInstallable requires flag, enabled, key, fingerprint", () => {
  assert.equal(isInstallable(baseInstall), true);
  assert.equal(isInstallable({ ...baseInstall, appRegistryEnabled: false }), false);
  assert.equal(isInstallable({ ...baseInstall, enabled: false }), false);
  assert.equal(isInstallable({ ...baseInstall, keyValid: false }), false);
  assert.equal(isInstallable({ ...baseInstall, fingerprintMatches: false }), false);
});

test("alpha apps installable only for cohort members", () => {
  const alpha = { ...baseInstall, state: "alpha" as const };
  assert.equal(isInstallable({ ...alpha, isAlphaCohortMember: false }), false);
  assert.equal(isInstallable({ ...alpha, isAlphaCohortMember: true }), true);
});

test("only published apps appear in the public command palette", () => {
  assert.equal(appearsInCommandPalette(baseInstall), true);
  assert.equal(appearsInCommandPalette({ ...baseInstall, state: "alpha" }), false);
  assert.equal(appearsInCommandPalette({ ...baseInstall, state: "registered" }), false);
});

test("lifecycleAfterReregister restores active states", () => {
  assert.equal(lifecycleAfterReregister("published"), "published");
  assert.equal(lifecycleAfterReregister("alpha"), "alpha");
  assert.equal(lifecycleAfterReregister("needs-reregister"), "registered");
  assert.equal(lifecycleAfterReregister("draft"), "registered");
});
