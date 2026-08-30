import assert from "node:assert/strict";
import test from "node:test";
import { normalizePracticeOutcomes } from "./practice-games";

test("practice outcomes preserve creator labels and remove empty entries", () => {
  assert.deepEqual(
    normalizePracticeOutcomes(["Sun", "  Moon  ", "", null, "Star"]),
    ["Sun", "Moon", "Star"]
  );
});

test("practice outcomes reject non-array payloads", () => {
  assert.deepEqual(normalizePracticeOutcomes("Sun, Moon"), []);
  assert.deepEqual(normalizePracticeOutcomes(null), []);
});
