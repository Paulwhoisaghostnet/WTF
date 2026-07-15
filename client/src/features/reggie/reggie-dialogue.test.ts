import assert from "node:assert/strict";
import test from "node:test";
import {
  assistantStateLine,
  emptyQuestionReply,
  greeting,
  nag,
  pickLine,
  questCompleteLine,
  REGGIE_ASSISTANT_SCRIPT,
  REGGIE_EMPTY_QUESTION_REPLIES,
  REGGIE_SMARTASS_REPLIES,
  REGGIE_STEP_DIALOGUE,
  smartAssReply,
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
  assert.equal(greeting("user-1:day-1"), greeting("user-1:day-1"));
  assert.equal(
    stepLine("wallet", "intro", "user-1:0"),
    stepLine("wallet", "intro", "user-1:0")
  );
  assert.equal(smartAssReply("user-1:q1"), smartAssReply("user-1:q1"));
  assert.ok(questCompleteLine("user-1").length > 0);
});

test("avoid parameter prevents back-to-back repeats", () => {
  const first = nag("seed-a");
  const second = nag("seed-a", first);
  assert.notEqual(first, second);

  const reply = smartAssReply("seed-b");
  const next = smartAssReply("seed-b", reply);
  assert.notEqual(reply, next);
});

test("smart-ass pool is deep enough to feel endless", () => {
  assert.ok(
    REGGIE_SMARTASS_REPLIES.length >= 40,
    `smart-ass pool too shallow: ${REGGIE_SMARTASS_REPLIES.length}`
  );
  assert.equal(
    new Set(REGGIE_SMARTASS_REPLIES).size,
    REGGIE_SMARTASS_REPLIES.length,
    "duplicate smart-ass replies"
  );
});

test("empty question replies have more than one bit of attitude", () => {
  assert.ok(REGGIE_EMPTY_QUESTION_REPLIES.length >= 5);
  assert.equal(
    new Set(REGGIE_EMPTY_QUESTION_REPLIES).size,
    REGGIE_EMPTY_QUESTION_REPLIES.length,
    "duplicate empty-question replies"
  );
  const first = emptyQuestionReply("blank-seed");
  assert.notEqual(emptyQuestionReply("blank-seed", first), first);
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

test("different seeds walk the pools", () => {
  const lines = new Set<string>();
  for (let i = 0; i < 40; i += 1) {
    lines.add(smartAssReply(`walk:${i}`));
  }
  assert.ok(lines.size >= 10, `pool walk too narrow: ${lines.size}`);
});

test("pickLine handles degenerate pools", () => {
  assert.equal(pickLine([], "seed"), "");
  assert.equal(pickLine(["only"], "seed"), "only");
  assert.equal(pickLine(["only"], "seed", "only"), "only");
});

test("unknown step keys fall back to nags rather than crashing", () => {
  const line = stepLine("not_a_step", "intro", "seed");
  assert.ok(line.length > 0);
});
