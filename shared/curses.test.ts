import assert from "node:assert/strict";
import test from "node:test";
import {
  WTF_CURSE_DEFINITIONS,
  hasWtfCurse,
  normalizeWtfCurseStatuses,
} from "./curses";

test("WTF curse definitions cover the gameshow status effects", () => {
  const keys = WTF_CURSE_DEFINITIONS.map((curse) => curse.key);
  assert.deepEqual(keys, [
    "green_lens",
    "inverted_click_mouse",
    "liability_waiver",
    "wtf_reward_embargo",
    "blangs",
  ]);
});

test("curse status normalization drops unknown or duplicate modifiers", () => {
  const curses = normalizeWtfCurseStatuses([
    { key: "green_lens", reason: "too much non-green" },
    { key: "green_lens", reason: "duplicate" },
    { key: "not_real" },
    null,
    { key: "blangs" },
  ]);

  assert.equal(curses.length, 2);
  assert.equal(curses[0].label, "Green Lens");
  assert.equal(curses[0].reason, "too much non-green");
  assert.equal(hasWtfCurse(curses, "blangs"), true);
  assert.equal(hasWtfCurse(curses, "wtf_reward_embargo"), false);
});
