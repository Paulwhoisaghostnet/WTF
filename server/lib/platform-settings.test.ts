import assert from "node:assert/strict";
import test from "node:test";
import {
  PlatformSettingConflictError,
  PlatformSettingValidationError,
  validatePlatformSettingValue,
} from "./platform-settings";

test("validatePlatformSettingValue rejects oversized payloads", () => {
  assert.throws(
    () => validatePlatformSettingValue("x".repeat(40_000)),
    PlatformSettingValidationError
  );
});

test("validatePlatformSettingValue accepts bounded payloads", () => {
  assert.equal(validatePlatformSettingValue("ok"), "ok");
});

test("PlatformSettingConflictError identifies optimistic-lock failures", () => {
  const err = new PlatformSettingConflictError();
  assert.equal(err.name, "PlatformSettingConflictError");
  assert.match(err.message, /changed since last read/);
});
