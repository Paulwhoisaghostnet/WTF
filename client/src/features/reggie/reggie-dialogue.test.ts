import assert from "node:assert/strict";
import test from "node:test";
import {
  assistantStateLine,
  pickLine,
  questCompleteLine,
  REGGIE_ASSISTANT_SCRIPT,
  REGGIE_STEP_DIALOGUE,
  stepLine,
} from "./reggie-dialogue";

const EXPECTED_STEP_KEYS = [
  "profile",
  "quest_hq",
  "pfp",
  "x_link",
  "bsky_link",
  "wallet",
  "did_claim",
  "wtf_tez",
  "multi_wallet",
  "etherlink",
  "appearance",
  "navigator",
  "pet_adopt",
  "pet_care",
  "wim",
  "live_room",
  "calendar",
  "live_stage",
  "skywire",
  "tz2at",
  "broot",
  "studio",
  "macaroni",
  "earn_exp",
  "earn_wtf",
  "market",
  "titles_roles",
  "arcade",
  "casino",
  "finale",
];

test("every quest step has intro, nudge, and congrats dialogue", () => {
  for (const stepKey of EXPECTED_STEP_KEYS) {
    const dialogue = REGGIE_STEP_DIALOGUE[stepKey];
    assert.ok(dialogue, `missing dialogue for step: ${stepKey}`);
    assert.ok(dialogue.intro.length >= 4, `${stepKey}: needs several intro lines`);
    assert.ok(dialogue.nudge.length >= 4, `${stepKey}: needs several nudge lines`);
    assert.ok(dialogue.congrats.length >= 4, `${stepKey}: needs several congrats lines`);
    for (const pool of [dialogue.intro, dialogue.nudge, dialogue.congrats]) {
      assert.equal(new Set(pool).size, pool.length, `${stepKey}: duplicate dialogue lines`);
      for (const line of pool) {
        assert.ok(line.trim().length > 10, `${stepKey}: line too short: "${line}"`);
      }
    }
  }
});

test("dialogue selection is deterministic for the same seed", () => {
  assert.equal(
    stepLine("wallet", "intro", "user-1:0"),
    stepLine("wallet", "intro", "user-1:0")
  );
  assert.equal(
    assistantStateLine("summon", "user-1"),
    assistantStateLine("summon", "user-1")
  );
  assert.ok(questCompleteLine("user-1").length > 0);
});

test("avoid parameter prevents back-to-back repeats", () => {
  const first = stepLine("wallet", "intro", "seed-a");
  const second = stepLine("wallet", "intro", "seed-a", first);
  assert.notEqual(first, second);
});

test("assistant state scripts have varied sassy copy without losing placeholders", () => {
  for (const [kind, pool] of Object.entries(REGGIE_ASSISTANT_SCRIPT)) {
    assert.ok(pool.length >= 3, `${kind}: state script pool too shallow`);
    assert.equal(new Set(pool).size, pool.length, `${kind}: duplicate state lines`);
  }
  assert.equal(
    assistantStateLine("locked", "seed-1", { title: "Connect Wallet" }).includes("{title}"),
    false
  );
  assert.match(
    assistantStateLine("progress", "seed-2", { completed: 7, total: 30, percent: 23 }),
    /7\/30|23%/
  );
  assert.notEqual(
    assistantStateLine("summon", "same-seed"),
    assistantStateLine("summon", "same-seed", {}, assistantStateLine("summon", "same-seed"))
  );
});

test("summon and navigation quest scripts keep Reggie on quest guidance", () => {
  for (const line of REGGIE_ASSISTANT_SCRIPT.summon) {
    assert.match(line, /quest|step/i);
  }
  for (const line of REGGIE_STEP_DIALOGUE.navigator.intro) {
    assert.match(line, /Paul/);
    assert.match(line, /desktop icon/);
    assert.match(line, /Dashboard/);
  }
});

test("pickLine handles degenerate pools", () => {
  assert.equal(pickLine([], "seed"), "");
  assert.equal(pickLine(["only"], "seed"), "only");
  assert.equal(pickLine(["only"], "seed", "only"), "only");
});

test("unknown step keys fall back to quest guidance rather than crashing", () => {
  const line = stepLine("not_a_step", "intro", "seed");
  assert.match(line, /quest step/);
});
