import { sql } from "drizzle-orm";
import { challengeAutomationDefinitions } from "@shared/schema";
import { renderChallengeRuleSummary } from "./rule-summary";
import type { ChallengeRewardAction, ConditionTree, SystemEventType } from "../events/types";

export type CanonicalDailyLoop = {
  seedKey: string;
  title: string;
  description: string;
  route: string;
  actionLabel: string;
  category: "social" | "creative";
  conditionTree: ConditionTree;
  rewardActions: ChallengeRewardAction[];
};

function eventLoop(input: {
  seedKey: string;
  title: string;
  description: string;
  route: string;
  actionLabel: string;
  category: CanonicalDailyLoop["category"];
  eventType: SystemEventType;
  triggerKey?: string;
  threshold?: number;
  xp: number;
  wtf: number;
}): CanonicalDailyLoop {
  const conditionTree: ConditionTree = {
    id: "root",
    type: "group",
    operator: "all",
    children: [
      {
        id: `${input.seedKey}:event`,
        type: "event",
        triggerKey: input.triggerKey ?? input.eventType,
        eventTypes: [input.eventType],
        comparator: input.threshold && input.threshold > 1 ? "count_gte" : "exists",
        threshold: input.threshold,
      },
      {
        id: `${input.seedKey}:daily-dedupe`,
        type: "predicate",
        predicateKey: "reward.not_already_claimed",
      },
    ],
  };

  return {
    seedKey: input.seedKey,
    title: input.title,
    description: input.description,
    route: input.route,
    actionLabel: input.actionLabel,
    category: input.category,
    conditionTree,
    rewardActions: [
      {
        key: "award_exp",
        params: { amount: input.xp, reason: `daily_loop:${input.seedKey}` },
      },
      {
        key: "queue_wtf_reward",
        params: {
          amountWtf: input.wtf,
          reason: `Daily loop: ${input.title}`,
        },
      },
    ],
  };
}

export const CANONICAL_DAILY_LOOPS: CanonicalDailyLoop[] = [
  eventLoop({
    seedKey: "daily_social_check_in_v1",
    title: "Daily Social Check-In",
    description: "Post once on the message board.",
    route: "/messageboard",
    actionLabel: "Post",
    category: "social",
    eventType: "messageboard.post.created",
    xp: 15,
    wtf: 1,
  }),
  eventLoop({
    seedKey: "daily_conversation_starter_v1",
    title: "Conversation Starter",
    description: "Make two message board posts or replies today.",
    route: "/messageboard",
    actionLabel: "Reply",
    category: "social",
    eventType: "messageboard.post.created",
    threshold: 2,
    xp: 25,
    wtf: 2,
  }),
  eventLoop({
    seedKey: "daily_reaction_spark_v1",
    title: "Reaction Spark",
    description: "React to another message board post.",
    route: "/messageboard",
    actionLabel: "React",
    category: "social",
    eventType: "messageboard.reaction.added",
    xp: 10,
    wtf: 1,
  }),
  eventLoop({
    seedKey: "daily_w_post_v1",
    title: "W Timeline Pulse",
    description: "Create one W timeline post.",
    route: "/w",
    actionLabel: "Post",
    category: "social",
    eventType: "w.post.created",
    xp: 20,
    wtf: 2,
  }),
  eventLoop({
    seedKey: "daily_w_reply_v1",
    title: "W Reply Loop",
    description: "Reply to a W post.",
    route: "/w",
    actionLabel: "Reply",
    category: "social",
    eventType: "w.reply.created",
    xp: 15,
    wtf: 1,
  }),
  eventLoop({
    seedKey: "daily_w_like_v1",
    title: "W Signal Tap",
    description: "Like a W post.",
    route: "/w",
    actionLabel: "Like",
    category: "social",
    eventType: "w.like.created",
    xp: 10,
    wtf: 1,
  }),
  eventLoop({
    seedKey: "daily_w_repost_v1",
    title: "W Signal Boost",
    description: "Repost something from the W timeline.",
    route: "/w",
    actionLabel: "Repost",
    category: "social",
    eventType: "w.repost.created",
    xp: 12,
    wtf: 1,
  }),
  eventLoop({
    seedKey: "daily_w_quote_v1",
    title: "W Quote Spark",
    description: "Quote a W post with your own note.",
    route: "/w",
    actionLabel: "Quote",
    category: "creative",
    eventType: "w.quote.created",
    xp: 18,
    wtf: 2,
  }),
  eventLoop({
    seedKey: "daily_diary_entry_v1",
    title: "Daily Studio Note",
    description: "Create a Dear Diary entry.",
    route: "/dear-diary",
    actionLabel: "Write",
    category: "creative",
    eventType: "diary.entry.created",
    xp: 20,
    wtf: 1,
  }),
  eventLoop({
    seedKey: "daily_media_upload_v1",
    title: "Media Spark",
    description: "Upload media to a W post.",
    route: "/w",
    actionLabel: "Upload",
    category: "creative",
    eventType: "w.media.uploaded",
    xp: 20,
    wtf: 2,
  }),
];

export async function ensureCanonicalDailyLoopChallenges(createdBy?: number | null) {
  const { db } = await import("../../db");
  let created = 0;
  let updated = 0;

  for (const loop of CANONICAL_DAILY_LOOPS) {
    const metadata = {
      seedKey: loop.seedKey,
      canonicalDailyLoop: true,
      route: loop.route,
      actionLabel: loop.actionLabel,
      category: loop.category,
    };
    const payload = {
      title: loop.title,
      description: loop.description,
      status: "active" as const,
      conditionTree: loop.conditionTree as any,
      rewardActions: loop.rewardActions as any,
      repeatability: { mode: "daily" },
      perUserCompletionLimit: 1,
      summary: renderChallengeRuleSummary(loop),
      metadata,
      updatedAt: new Date(),
    };

    const existing = await db
      .select({ id: challengeAutomationDefinitions.id })
      .from(challengeAutomationDefinitions)
      .where(sql`${challengeAutomationDefinitions.metadata}->>'seedKey' = ${loop.seedKey}`)
      .limit(1);

    if (existing[0]) {
      await db
        .update(challengeAutomationDefinitions)
        .set(payload)
        .where(sql`${challengeAutomationDefinitions.metadata}->>'seedKey' = ${loop.seedKey}`);
      updated += 1;
      continue;
    }

    await db.insert(challengeAutomationDefinitions).values({
      ...payload,
      createdBy: createdBy ?? null,
    } as any);
    created += 1;
  }

  return { created, updated, total: CANONICAL_DAILY_LOOPS.length };
}
