import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_REGGIE_STEPS,
  REGGIE_FINALE_STEP_KEY,
  REGGIE_QUEST_STEPS,
  reggieRewardActions,
  reggieStepMetadata,
} from "./reggie-quest";

function collectNodes(tree: unknown): Array<Record<string, unknown>> {
  const nodes: Array<Record<string, unknown>> = [];
  function walk(node: unknown) {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const record = node as Record<string, unknown>;
    nodes.push(record);
    if (Array.isArray(record.children)) {
      for (const child of record.children) walk(child);
    }
  }
  walk(tree);
  return nodes;
}

test("reggie quest covers every mandated user story", () => {
  const stepKeys = new Set(REGGIE_QUEST_STEPS.map((step) => step.stepKey));
  const requiredStories = [
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
  ];
  for (const story of requiredStories) {
    assert.ok(stepKeys.has(story), `missing side quest for user story: ${story}`);
  }
});

test("seed keys, step keys, and orders are unique", () => {
  const seedKeys = ALL_REGGIE_STEPS.map((step) => step.seedKey);
  const stepKeys = ALL_REGGIE_STEPS.map((step) => step.stepKey);
  const orders = ALL_REGGIE_STEPS.map((step) => step.order);
  assert.equal(new Set(seedKeys).size, seedKeys.length, "duplicate seedKey");
  assert.equal(new Set(stepKeys).size, stepKeys.length, "duplicate stepKey");
  assert.equal(new Set(orders).size, orders.length, "duplicate order");
  for (const seedKey of seedKeys) {
    assert.match(seedKey, /^reggie_[a-z0-9_]+_v\d+$/, `bad seedKey shape: ${seedKey}`);
  }
});

test("every prerequisite references an existing step and is enforced in the condition tree", () => {
  const stepKeys = new Set(ALL_REGGIE_STEPS.map((step) => step.stepKey));
  for (const step of ALL_REGGIE_STEPS) {
    const nodes = collectNodes(step.proof);
    const treePrereqs = new Set(
      nodes
        .filter(
          (node) =>
            node.type === "predicate" && node.predicateKey === "reggie.step_completed"
        )
        .map((node) => {
          const params = node.params as Record<string, unknown> | undefined;
          return String(params?.stepKey ?? "");
        })
    );
    for (const prereq of step.prereqStepKeys) {
      assert.ok(stepKeys.has(prereq), `${step.stepKey}: unknown prereq ${prereq}`);
      assert.notEqual(prereq, step.stepKey, `${step.stepKey}: self prereq`);
      assert.ok(
        treePrereqs.has(prereq),
        `${step.stepKey}: prereq ${prereq} not enforced in condition tree`
      );
    }
  }
});

test("prerequisite graph is acyclic and reachable from the intro step", () => {
  const byKey = new Map(ALL_REGGIE_STEPS.map((step) => [step.stepKey, step]));
  const visiting = new Set<string>();
  const done = new Set<string>();
  function visit(stepKey: string) {
    if (done.has(stepKey)) return;
    assert.ok(!visiting.has(stepKey), `cycle detected through ${stepKey}`);
    visiting.add(stepKey);
    for (const prereq of byKey.get(stepKey)?.prereqStepKeys ?? []) {
      visit(prereq);
    }
    visiting.delete(stepKey);
    done.add(stepKey);
  }
  for (const step of ALL_REGGIE_STEPS) visit(step.stepKey);

  // Exactly one root: Reggie's intro profile lesson.
  const roots = REGGIE_QUEST_STEPS.filter((step) => step.prereqStepKeys.length === 0);
  assert.equal(roots.length, 1, "quest must have exactly one entry step");
  assert.equal(roots[0].stepKey, "profile");
});

test("finale requires completion of every regular step", () => {
  const finale = ALL_REGGIE_STEPS.find((step) => step.stepKey === REGGIE_FINALE_STEP_KEY);
  assert.ok(finale, "finale step missing");
  const nodes = collectNodes(finale!.proof);
  const required = new Set(
    nodes
      .filter(
        (node) =>
          node.type === "predicate" && node.predicateKey === "reggie.step_completed"
      )
      .map((node) => String((node.params as Record<string, unknown>)?.stepKey ?? ""))
  );
  for (const step of REGGIE_QUEST_STEPS) {
    assert.ok(required.has(step.stepKey), `finale missing requirement: ${step.stepKey}`);
  }
});

test("every step ships rewards and reggie metadata", () => {
  for (const step of ALL_REGGIE_STEPS) {
    const actions = reggieRewardActions(step);
    const keys = actions.map((action) => action.key);
    assert.ok(keys.includes("award_exp"), `${step.stepKey}: missing award_exp`);
    assert.ok(keys.includes("create_notification"), `${step.stepKey}: missing notification`);
    assert.ok(step.xp > 0, `${step.stepKey}: xp must be positive`);

    const metadata = reggieStepMetadata(step);
    assert.equal(metadata.reggieQuest, true);
    assert.equal(metadata.seedKey, step.seedKey);
    assert.equal(metadata.stepKey, step.stepKey);
    assert.ok(metadata.route.startsWith("/"), `${step.stepKey}: route must be a path`);
    assert.ok(metadata.anchorId.length > 0, `${step.stepKey}: anchorId required`);
  }
  const finale = ALL_REGGIE_STEPS.find((step) => step.stepKey === REGGIE_FINALE_STEP_KEY)!;
  const finaleKeys = reggieRewardActions(finale).map((action) => action.key);
  assert.ok(
    finaleKeys.includes("unlock_inventory_item"),
    "finale must unlock the graduation item"
  );
});

test("event proofs only use checkpoint metadata the desktop event route can carry", () => {
  for (const step of ALL_REGGIE_STEPS) {
    const nodes = collectNodes(step.proof);
    for (const node of nodes) {
      if (node.type !== "event") continue;
      const eventTypes = node.eventTypes as string[];
      for (const eventType of eventTypes) {
        if (eventType === "reggie.checkpoint.reached") {
          const filters = node.filters as Record<string, unknown> | undefined;
          const metadata = filters?.metadata as Record<string, unknown> | undefined;
          assert.ok(
            typeof metadata?.checkpoint === "string" && metadata.checkpoint.length > 0,
            `${step.stepKey}: checkpoint event needs metadata.checkpoint filter`
          );
        }
      }
    }
  }
});
