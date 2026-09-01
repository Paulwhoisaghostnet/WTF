import assert from "node:assert/strict";
import test from "node:test";
import {
  PlatformSettingConflictError,
  PlatformSettingValidationError,
  upsertPlatformSetting,
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

test("concurrent unversioned creates cannot overwrite the winning value", async () => {
  let stored: { key: string; value: string; updatedAt: Date; updatedBy: number | null } | null = null;
  const fakeDb = {
    insert: () => ({
      values: (values: typeof stored) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            if (stored) return [];
            stored = values;
            return [values];
          },
        }),
      }),
    }),
  } as any;

  const results = await Promise.allSettled([
    upsertPlatformSetting(fakeDb, { key: "shared", value: "first", updatedBy: 1 }),
    upsertPlatformSetting(fakeDb, { key: "shared", value: "second", updatedBy: 2 }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  const fulfilled = results.find((result) => result.status === "fulfilled");
  assert.ok(rejected?.status === "rejected");
  assert.ok(fulfilled?.status === "fulfilled");
  assert.ok(rejected.reason instanceof PlatformSettingConflictError);
  assert.ok(fulfilled.value.value === "first" || fulfilled.value.value === "second");
});

test("concurrent updates with one revision allow exactly one writer", async () => {
  const initialUpdatedAt = new Date("2026-09-01T12:00:00.000Z");
  let stored = {
    key: "shared",
    value: "initial",
    updatedAt: initialUpdatedAt,
    updatedBy: null as number | null,
  };
  const fakeDb = {
    update: () => ({
      set: (values: Partial<typeof stored>) => ({
        where: () => ({
          returning: async () => {
            if (stored.updatedAt.getTime() !== initialUpdatedAt.getTime()) return [];
            stored = { ...stored, ...values };
            return [stored];
          },
        }),
      }),
    }),
  } as any;

  const results = await Promise.allSettled([
    upsertPlatformSetting(fakeDb, {
      key: "shared",
      value: "first",
      updatedBy: 1,
      expectedUpdatedAt: initialUpdatedAt,
    }),
    upsertPlatformSetting(fakeDb, {
      key: "shared",
      value: "second",
      updatedBy: 2,
      expectedUpdatedAt: initialUpdatedAt,
    }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  const rejected = results.find((result) => result.status === "rejected");
  assert.ok(rejected?.status === "rejected");
  assert.ok(rejected.reason instanceof PlatformSettingConflictError);
  assert.ok(stored.updatedAt.getTime() > initialUpdatedAt.getTime());
  assert.ok(stored.value === "first" || stored.value === "second");
});

test("invalid revision tokens fail validation instead of becoming unversioned writes", async () => {
  await assert.rejects(
    upsertPlatformSetting({} as any, {
      key: "shared",
      value: "next",
      expectedUpdatedAt: "not-a-timestamp",
    }),
    PlatformSettingValidationError
  );
});
