import { sql } from "drizzle-orm";
import { challengeAutomationDefinitions } from "@shared/schema";
import type {
  ChallengeRewardAction,
  ConditionTree,
  EventConditionFilters,
  SystemEventType,
} from "../events/types";

export type CanonicalDailyLoop = {
  seedKey: string;
  title: string;
  description: string;
  route: string;
  actionLabel: string;
  order: number;
  category: "social" | "creative";
  requiresClaim?: boolean;
  activeWeekdaysUtc?: number[];
  conditionTree: ConditionTree;
  rewardActions: ChallengeRewardAction[];
};

function eventLoop(input: {
  seedKey: string;
  title: string;
  description: string;
  route: string;
  actionLabel: string;
  order: number;
  category: CanonicalDailyLoop["category"];
  eventType: SystemEventType;
  triggerKey?: string;
  filters?: EventConditionFilters;
  threshold?: number;
  additionalConditions?: ConditionTree[];
  requiresClaim?: boolean;
  activeWeekdaysUtc?: number[];
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
        filters: input.filters,
      },
      ...(input.additionalConditions ?? []),
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
    order: input.order,
    category: input.category,
    requiresClaim: input.requiresClaim,
    activeWeekdaysUtc: input.activeWeekdaysUtc,
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
          reason: `Side quest: ${input.title}`,
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
    order: 1,
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
    order: 2,
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
    order: 3,
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
    order: 4,
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
    order: 5,
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
    order: 6,
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
    order: 7,
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
    order: 8,
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
    order: 9,
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
    order: 10,
    category: "creative",
    eventType: "w.media.uploaded",
    xp: 20,
    wtf: 2,
  }),
  eventLoop({
    seedKey: "mint_art_monday_v1",
    title: "Mint Art Monday!",
    description: "Mint art to a Tezos wallet linked to your wtfOS account on Monday.",
    route: "/mint-portal",
    actionLabel: "Mint art",
    order: 11,
    category: "creative",
    eventType: "blockchain.tezos.token_mint",
    triggerKey: "blockchain.tezos.activity",
    filters: { sourceModule: "wallet-events" },
    additionalConditions: [
      {
        id: "mint_art_monday_v1:monday",
        type: "predicate",
        predicateKey: "time.utc_weekday",
        params: { weekdays: [1], label: "Monday" },
      },
    ],
    requiresClaim: false,
    activeWeekdaysUtc: [1],
    xp: 40,
    wtf: 5,
  }),
];

function activeWeekdaysForMetadata(loop: CanonicalDailyLoop) {
  return Array.isArray(loop.activeWeekdaysUtc) && loop.activeWeekdaysUtc.length > 0
    ? { activeWeekdaysUtc: loop.activeWeekdaysUtc }
    : {};
}

export async function ensureCanonicalDailyLoopChallenges(createdBy?: number | null) {
  const { db } = await import("../../db");
  let created = 0;
  let updated = 0;

  for (const loop of CANONICAL_DAILY_LOOPS) {
    const metadata = {
      seedKey: loop.seedKey,
      canonicalDailyLoop: true,
      requiresClaim: loop.requiresClaim ?? true,
      resetAtUtc: "00:00",
      route: loop.route,
      actionLabel: loop.actionLabel,
      order: loop.order,
      category: loop.category,
      ...activeWeekdaysForMetadata(loop),
    };
    const rewardSummary =
      loop.requiresClaim === false
        ? `${loop.description} WTF OS verifies the linked-wallet mint and distributes the reward automatically for the current UTC day.`
        : `${loop.description} Claim the reward after WTF OS verifies it for the current UTC day.`;
    const payload = {
      title: loop.title,
      description: loop.description,
      status: "active" as const,
      conditionTree: loop.conditionTree as any,
      rewardActions: loop.rewardActions as any,
      repeatability: { mode: "daily" },
      perUserCompletionLimit: 1,
      summary: rewardSummary,
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
