import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { CANONICAL_DAILY_LOOPS } from "./daily-loop-challenges";

test("canonical side quests ship at least ten active social/creative earn paths", () => {
  assert(CANONICAL_DAILY_LOOPS.length >= 10);
  const seedKeys = new Set(CANONICAL_DAILY_LOOPS.map((loop) => loop.seedKey));
  assert.equal(seedKeys.size, CANONICAL_DAILY_LOOPS.length);

  for (const loop of CANONICAL_DAILY_LOOPS) {
    assert(loop.order >= 1);
    assert(["social", "creative"].includes(loop.category));
    assert(loop.route.startsWith("/"));
    assert(loop.actionLabel.length > 0);
    assert.equal(loop.conditionTree.type, "group");
    assert.equal(loop.conditionTree.operator, "all");
    assert(
      loop.rewardActions.some(
        (action) => action.key === "award_exp" && Number(action.params?.amount) > 0
      )
    );
    assert(
      loop.rewardActions.some(
        (action) => action.key === "queue_wtf_reward" && Number(action.params?.amountWtf) > 0
      )
    );
  }
});

test("canonical side quests keep the easy social check-in first", () => {
  const sorted = [...CANONICAL_DAILY_LOOPS].sort((a, b) => a.order - b.order);
  assert.equal(sorted[0]?.seedKey, "daily_social_check_in_v1");
  assert.deepEqual(
    sorted.map((loop) => loop.order),
    Array.from({ length: CANONICAL_DAILY_LOOPS.length }, (_value, index) => index + 1)
  );
});

test("canonical daily social check-in requires a messageboard post", () => {
  const checkIn = CANONICAL_DAILY_LOOPS.find(
    (loop) => loop.seedKey === "daily_social_check_in_v1"
  );
  assert(checkIn);
  const root = checkIn.conditionTree;
  assert.equal(root.type, "group");
  const eventNode = root.children.find((node) => node.type === "event");
  assert(eventNode && eventNode.type === "event");
  assert.deepEqual(eventNode.eventTypes, ["messageboard.post.created"]);
});

test("canonical Mint Art Monday completes from linked-wallet Tezos mints with automatic WTF", () => {
  const mintMonday = CANONICAL_DAILY_LOOPS.find(
    (loop) => loop.seedKey === "mint_art_monday_v1"
  );
  assert(mintMonday);
  assert.equal(mintMonday.title, "Mint Art Monday!");
  assert.equal(mintMonday.route, "/mint-portal");
  assert.equal(mintMonday.requiresClaim, false);
  assert.deepEqual(mintMonday.activeWeekdaysUtc, [1]);

  const root = mintMonday.conditionTree;
  assert.equal(root.type, "group");
  const eventNode = root.children.find((node) => node.type === "event");
  assert(eventNode && eventNode.type === "event");
  assert.deepEqual(eventNode.eventTypes, ["blockchain.tezos.token_mint"]);
  assert.equal(eventNode.triggerKey, "blockchain.tezos.activity");
  assert.deepEqual(eventNode.filters, { sourceModule: "wallet-events" });

  const weekdayNode = root.children.find(
    (node) => node.type === "predicate" && node.predicateKey === "time.utc_weekday"
  );
  assert(weekdayNode && weekdayNode.type === "predicate");
  assert.deepEqual(weekdayNode.params?.weekdays, [1]);

  assert(
    mintMonday.rewardActions.some(
      (action) => action.key === "queue_wtf_reward" && Number(action.params?.amountWtf) === 5
    )
  );
});

test("challenge automation exposes UTC weekday predicates for Monday-gated side quests", () => {
  const evaluator = readFileSync("server/challenges/predicates/evaluator.ts", "utf8");
  const adminRoute = readFileSync("server/challenges/routes/admin.ts", "utf8");
  assert.match(evaluator, /case "time\.utc_weekday"/);
  assert.match(evaluator, /getUTCDay\(\)/);
  assert.match(adminRoute, /"time\.utc_weekday"/);
});
