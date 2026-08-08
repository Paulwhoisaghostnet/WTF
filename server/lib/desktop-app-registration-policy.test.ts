import assert from "node:assert/strict";
import test from "node:test";
import {
  isDesktopAppDocsFresh,
  isDesktopAppInstallKeyActive,
  registrationExpiryFor,
} from "./desktop-app-registration-policy";

const now = new Date("2026-08-05T12:00:00.000Z");
const expired = new Date("2026-08-04T12:00:00.000Z");

test("ordinary desktop app registration credentials expire", () => {
  assert.equal(
    isDesktopAppDocsFresh(
      {
        docStatus: "registered",
        docsUpdatedAt: expired,
        docsExpiresAt: expired,
        registrationNeverExpires: false,
      },
      now,
    ),
    false,
  );
  assert.equal(
    isDesktopAppInstallKeyActive(
      {
        installKeyHash: "hash",
        installKeyRevokedAt: null,
        installKeyExpiresAt: expired,
        registrationNeverExpires: false,
      },
      now,
    ),
    false,
  );
});

test("permanent registration ignores timed docs and key expiry", () => {
  assert.equal(
    isDesktopAppDocsFresh(
      {
        docStatus: "registered",
        docsUpdatedAt: expired,
        docsExpiresAt: expired,
        registrationNeverExpires: true,
      },
      now,
    ),
    true,
  );
  assert.equal(
    isDesktopAppInstallKeyActive(
      {
        installKeyHash: "hash",
        installKeyRevokedAt: null,
        installKeyExpiresAt: expired,
        registrationNeverExpires: true,
      },
      now,
    ),
    true,
  );
  assert.equal(registrationExpiryFor(now, true), null);
});

test("manual stale and revoked states still win over permanent registration", () => {
  assert.equal(
    isDesktopAppDocsFresh(
      {
        docStatus: "stale",
        docsUpdatedAt: now,
        docsExpiresAt: null,
        registrationNeverExpires: true,
      },
      now,
    ),
    false,
  );
  assert.equal(
    isDesktopAppInstallKeyActive(
      {
        installKeyHash: "hash",
        installKeyRevokedAt: now,
        installKeyExpiresAt: null,
        registrationNeverExpires: true,
      },
      now,
    ),
    false,
  );
});
