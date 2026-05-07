import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeConsoleReportCategory,
  normalizeConsoleReportReason,
} from "./moderation";

test("normalizeConsoleReportCategory keeps only known categories", () => {
  assert.equal(normalizeConsoleReportCategory("score abuse"), "score-abuse");
  assert.equal(normalizeConsoleReportCategory("unsafe"), "unsafe");
  assert.equal(normalizeConsoleReportCategory("totally-new"), "other");
});

test("normalizeConsoleReportReason requires useful text", () => {
  assert.throws(() => normalizeConsoleReportReason("bad"), /at least 8/i);
  assert.equal(
    normalizeConsoleReportReason("  scoring   seems broken here  "),
    "scoring seems broken here"
  );
});
