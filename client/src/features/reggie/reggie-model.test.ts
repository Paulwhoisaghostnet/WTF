import assert from "node:assert/strict";
import test from "node:test";
import {
  availableSteps,
  checkpointsForRoute,
  describeAccountState,
  progressPercent,
  recommendedStep,
  REGGIE_ROUTE_CHECKPOINTS,
  selectorsForAnchor,
  shouldShowReggie,
  stepsUnlockedBy,
  type ReggieQuestState,
  type ReggieQuestStepState,
} from "./reggie-quest-model";

function step(overrides: Partial<ReggieQuestStepState>): ReggieQuestStepState {
  return {
    id: 1,
    seedKey: "reggie_x_v1",
    stepKey: "x",
    title: "X",
    description: "d",
    route: "/x",
    actionLabel: "Open",
    anchorId: "start-button",
    category: "intro",
    order: 1,
    prereqStepKeys: [],
    rewards: { xp: 10, wtf: 1 },
    status: "available",
    completedAt: null,
    ...overrides,
  };
}

function state(steps: ReggieQuestStepState[], questComplete = false): ReggieQuestState {
  return {
    questComplete,
    completedCount: steps.filter((item) => item.status === "completed").length,
    totalCount: steps.length,
    steps,
    finale: null,
  };
}

test("recommendedStep picks the lowest-order available step", () => {
  const quest = state([
    step({ stepKey: "a", order: 5, status: "available" }),
    step({ stepKey: "b", order: 2, status: "available" }),
    step({ stepKey: "c", order: 1, status: "completed" }),
    step({ stepKey: "d", order: 0, status: "locked" }),
  ]);
  assert.equal(recommendedStep(quest)?.stepKey, "b");
  assert.deepEqual(
    availableSteps(quest).map((item) => item.stepKey),
    ["b", "a"]
  );
});

test("stepsUnlockedBy reports newly reachable locked steps", () => {
  const quest = state([
    step({ stepKey: "profile", status: "completed" }),
    step({ stepKey: "wallet", status: "available", prereqStepKeys: ["profile"] }),
    step({
      stepKey: "etherlink",
      status: "locked",
      prereqStepKeys: ["wallet"],
    }),
    step({
      stepKey: "live_stage",
      status: "locked",
      prereqStepKeys: ["wallet", "calendar"],
    }),
  ]);
  const unlocked = stepsUnlockedBy(quest, "wallet");
  assert.deepEqual(
    unlocked.map((item) => item.stepKey),
    ["etherlink"]
  );
});

test("shouldShowReggie gates on user, completion, and snooze", () => {
  const quest = state([step({})]);
  assert.equal(shouldShowReggie({ hasUser: false, questState: quest, dismissedUntil: null }), false);
  assert.equal(shouldShowReggie({ hasUser: true, questState: quest, dismissedUntil: null }), true);
  assert.equal(
    shouldShowReggie({ hasUser: true, questState: state([step({})], true), dismissedUntil: null }),
    false
  );
  const now = Date.now();
  assert.equal(
    shouldShowReggie({ hasUser: true, questState: quest, dismissedUntil: now + 60_000, now }),
    false
  );
  assert.equal(
    shouldShowReggie({ hasUser: true, questState: quest, dismissedUntil: now - 1, now }),
    true
  );
  // Quest state not yet loaded: still show Reggie for signed-in users.
  assert.equal(shouldShowReggie({ hasUser: true, questState: null, dismissedUntil: null }), true);
});

test("checkpointsForRoute matches exact routes and subroutes only", () => {
  assert.deepEqual(checkpointsForRoute("/arcade"), [
    { checkpoint: "arcade", stepKey: "arcade" },
  ]);
  assert.deepEqual(checkpointsForRoute("/casino/rug-pull"), [
    { checkpoint: "casino", stepKey: "casino" },
  ]);
  assert.deepEqual(checkpointsForRoute("/casinoville"), []);
  assert.deepEqual(checkpointsForRoute("/"), []);
});

test("every route checkpoint has a selector-resolvable anchor fallback", () => {
  for (const entry of REGGIE_ROUTE_CHECKPOINTS) {
    const selectors = selectorsForAnchor(entry.checkpoint);
    assert.ok(selectors.length > 0, `${entry.checkpoint}: no selectors`);
  }
  // Unknown anchors fall back to the start button.
  assert.deepEqual(selectorsForAnchor("definitely-not-real"), [
    '[data-reggie-anchor="start-button"]',
  ]);
});

test("progressPercent and describeAccountState summarize account state", () => {
  const quest = state([
    step({ stepKey: "a", status: "completed" }),
    step({ stepKey: "b", status: "available" }),
  ]);
  assert.equal(progressPercent(quest), 50);
  const summary = describeAccountState(
    {
      username: "newbie",
      displayName: null,
      bio: null,
      avatarUrl: null,
      pfpImageUrl: null,
      twitterHandle: null,
      twitterVerified: false,
      experiencePoints: 12,
    },
    quest
  );
  assert.match(summary, /@newbie/);
  assert.match(summary, /PFP: missing/);
  assert.match(summary, /X: not linked/);
  assert.match(summary, /1\/2 side quests/);
});
