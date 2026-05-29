import test from "node:test";
import assert from "node:assert/strict";
import {
  isAlphaCohortMember,
  resolveAvailability,
  type RegistrationAvailabilityInput,
} from "./availability";

const FP = "fp-1";

function baseInput(overrides: Partial<RegistrationAvailabilityInput> = {}): RegistrationAvailabilityInput {
  return {
    appRegistryEnabled: true,
    state: "published",
    enabled: true,
    integrityFingerprint: FP,
    currentFingerprint: FP,
    key: { revokedAt: null, disabledAt: null, boundFingerprint: FP },
    requesterRoles: [],
    ...overrides,
  };
}

test("alpha cohort = test_subject / trusted_creator (admin & host override)", () => {
  assert.equal(isAlphaCohortMember(["test_subject"]), true);
  assert.equal(isAlphaCohortMember(["trusted_creator"]), true);
  assert.equal(isAlphaCohortMember(["admin"]), true);
  assert.equal(isAlphaCohortMember(["host"]), true);
  assert.equal(isAlphaCohortMember(["witness"]), false);
  assert.equal(isAlphaCohortMember([]), false);
});

test("flag OFF → registry does not govern (legacy passthrough)", () => {
  const view = resolveAvailability(baseInput({ appRegistryEnabled: false }));
  assert.equal(view.governed, false);
  assert.equal(view.installable, true); // reflects enabled only
  assert.equal(view.reason, "registry_disabled");
});

test("published + valid key + matching fingerprint → installable & in palette", () => {
  const view = resolveAvailability(baseInput());
  assert.equal(view.governed, true);
  assert.equal(view.installable, true);
  assert.equal(view.inCommandPalette, true);
  assert.equal(view.reason, "ok");
});

test("disabled app is not installable", () => {
  const view = resolveAvailability(baseInput({ enabled: false }));
  assert.equal(view.installable, false);
  assert.equal(view.reason, "app_disabled");
});

test("integrity drift → not installable, reason integrity_changed", () => {
  const view = resolveAvailability(baseInput({ currentFingerprint: "fp-2" }));
  assert.equal(view.fingerprintMatches, false);
  assert.equal(view.installable, false);
  assert.equal(view.reason, "integrity_changed");
});

test("revoked/disabled key → no valid key", () => {
  const view = resolveAvailability(
    baseInput({ key: { revokedAt: new Date(), disabledAt: null, boundFingerprint: FP } }),
  );
  assert.equal(view.keyValid, false);
  assert.equal(view.installable, false);
  assert.equal(view.reason, "no_valid_key");
});

test("alpha app: cohort installs, public is restricted and not in palette", () => {
  const member = resolveAvailability(baseInput({ state: "alpha", requesterRoles: ["test_subject"] }));
  assert.equal(member.installable, true);
  assert.equal(member.inCommandPalette, false);
  assert.equal(member.reason, "ok");

  const outsider = resolveAvailability(baseInput({ state: "alpha", requesterRoles: ["witness"] }));
  assert.equal(outsider.installable, false);
  assert.equal(outsider.reason, "alpha_restricted");
});

test("draft/registered apps are not installable", () => {
  const view = resolveAvailability(baseInput({ state: "registered" }));
  assert.equal(view.installable, false);
  assert.equal(view.reason, "not_published");
});
