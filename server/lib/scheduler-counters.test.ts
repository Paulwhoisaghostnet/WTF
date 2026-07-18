import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSyncRunCounter } from "./scheduler-counters";

test("scheduler audit counters preserve representable whole numbers", () => {
  assert.equal(normalizeSyncRunCounter(0), 0);
  assert.equal(normalizeSyncRunCounter(2_449), 2_449);
  assert.equal(normalizeSyncRunCounter(-32), -32);
});

test("scheduler audit counters truncate fractions", () => {
  assert.equal(normalizeSyncRunCounter(12.9), 12);
  assert.equal(normalizeSyncRunCounter(-12.9), -12);
});

test("scheduler audit counters clamp values outside PostgreSQL integer range", () => {
  assert.equal(normalizeSyncRunCounter(17_200_859_982), 2_147_483_647);
  assert.equal(normalizeSyncRunCounter(-17_200_859_982), -2_147_483_648);
});

test("scheduler audit counters normalize missing and non-finite values", () => {
  assert.equal(normalizeSyncRunCounter(undefined), 0);
  assert.equal(normalizeSyncRunCounter(Number.NaN), 0);
  assert.equal(normalizeSyncRunCounter(Number.POSITIVE_INFINITY), 0);
  assert.equal(normalizeSyncRunCounter(Number.NEGATIVE_INFINITY), 0);
});
