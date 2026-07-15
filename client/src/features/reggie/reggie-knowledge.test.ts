import assert from "node:assert/strict";
import test from "node:test";
import { REGGIE_SMARTASS_REPLIES } from "./reggie-dialogue";
import {
  answerQuestion,
  REGGIE_KNOWLEDGE_TOPICS,
  type ReggieAnswerContext,
} from "./reggie-knowledge";
import type {
  ReggieQuestState,
  ReggieQuestStepState,
} from "./reggie-quest-model";

function questState(): ReggieQuestState {
  const steps: ReggieQuestStepState[] = [
    {
      id: 1,
      seedKey: "reggie_wallet_v1",
      stepKey: "wallet",
      title: "Connect a Tezos Wallet",
      description: "Connect a wallet.",
      route: "/profile",
      actionLabel: "Connect",
      anchorId: "profile",
      category: "wallets",
      order: 6,
      prereqStepKeys: [],
      rewards: { xp: 50, wtf: 3 },
      status: "available",
      completedAt: null,
    },
    {
      id: 2,
      seedKey: "reggie_pfp_v1",
      stepKey: "pfp",
      title: "Assign a PFP",
      description: "Set a PFP.",
      route: "/profile",
      actionLabel: "Set PFP",
      anchorId: "profile",
      category: "identity",
      order: 3,
      prereqStepKeys: [],
      rewards: { xp: 30, wtf: 1 },
      status: "completed",
      completedAt: new Date().toISOString(),
    },
  ];
  return {
    questComplete: false,
    completedCount: 1,
    totalCount: 2,
    steps,
    finale: null,
  };
}

function context(overrides?: Partial<ReggieAnswerContext>): ReggieAnswerContext {
  return {
    account: {
      username: "tester",
      displayName: "Tester",
      bio: "bio",
      avatarUrl: "http://x/a.png",
      pfpImageUrl: null,
      twitterHandle: "tester",
      twitterVerified: true,
      experiencePoints: 120,
    },
    quest: questState(),
    seed: "tester",
    ...overrides,
  };
}

test("answers in-scope wtfOS questions with topic knowledge", () => {
  const cases: Array<{ question: string; topicId: string; expect: RegExp }> = [
    { question: "How do I connect a wallet?", topicId: "wallet", expect: /signed?|challenge/i },
    { question: "what is macaroni?", topicId: "macaroni", expect: /blind mint/i },
    { question: "tell me about skywire and bluesky", topicId: "bluesky", expect: /bluesky/i },
    { question: "how do I earn wtf currency?", topicId: "wtf-currency", expect: /reward/i },
    { question: "what is the casino?", topicId: "casino", expect: /guinea pig/i },
    { question: "how do desktop pets work", topicId: "pet", expect: /care|feed/i },
    { question: "what are roles and titles?", topicId: "roles", expect: /role/i },
    { question: "how do I unlock an app from the app store?", topicId: "app-store", expect: /Apps tab|desktop shortcut/i },
    { question: "who are you?", topicId: "reggie", expect: /not AI/i },
  ];
  for (const item of cases) {
    const result = answerQuestion(item.question, context());
    assert.equal(result.matched, true, `expected match for: ${item.question}`);
    assert.equal(result.topicId, item.topicId, `wrong topic for: ${item.question}`);
    assert.match(result.answer, item.expect);
  }
});

test("mixes quest progress into topical answers", () => {
  const walletAnswer = answerQuestion("how do I connect a tezos wallet", context());
  assert.match(walletAnswer.answer, /open side quest|quest log/i);
  const pfpAnswer = answerQuestion("how do I set a pfp?", context());
  assert.match(pfpAnswer.answer, /already finished/i);
});

test("answers quest progress questions from account state", () => {
  const result = answerQuestion("what should i do next?", context());
  assert.equal(result.topicId, "quest");
  assert.match(result.answer, /1 of 2 side quests/);
  assert.match(result.answer, /Connect a Tezos Wallet/);
});

test("out-of-scope questions get smart-ass replies from the pool", () => {
  const pool = new Set(REGGIE_SMARTASS_REPLIES);
  const result = answerQuestion("what is the meaning of life?", context());
  assert.equal(result.matched, false);
  assert.ok(pool.has(result.answer), "fallback must come from the smart-ass pool");

  const followUp = answerQuestion("what is the meaning of life?", {
    ...context(),
    lastReply: result.answer,
  });
  assert.notEqual(followUp.answer, result.answer, "no immediate repeats");
});

test("empty questions get a nudge instead of a crash", () => {
  const result = answerQuestion("   ", context());
  assert.equal(result.matched, false);
  assert.match(result.answer, /ask/i);
});

test("knowledge base covers the core app surface", () => {
  const ids = new Set(REGGIE_KNOWLEDGE_TOPICS.map((topic) => topic.id));
  for (const required of [
    "wtfos",
    "quest",
    "account",
    "sidequests",
    "wallet",
    "etherlink",
    "did",
    "bluesky",
    "x",
    "pfp",
    "wim",
    "wtflive",
    "broot",
    "studio",
    "macaroni",
    "wtf-currency",
    "exp",
    "market",
    "app-store",
    "roles",
    "arcade",
    "casino",
    "calendar",
    "pet",
    "appearance",
    "navigation",
    "tz2at",
  ]) {
    assert.ok(ids.has(required), `knowledge base missing topic: ${required}`);
  }
});
