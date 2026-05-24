import { sql } from "drizzle-orm";
import { challengeAutomationDefinitions } from "@shared/schema";
import { db } from "../../db";
import { renderChallengeRuleSummary } from "./rule-summary";
import type { ChallengeRewardAction, ConditionTree } from "../events/types";

const exampleDefinitions: Array<{
  title: string;
  description: string;
  conditionTree: ConditionTree;
  rewardActions: ChallengeRewardAction[];
  repeatability: Record<string, unknown>;
  metadata: Record<string, unknown>;
}> = [
  {
    title: "Example: Messageboard Regular",
    description:
      "Post 10 times on the messageboard and at least once in the configured channel, then award EXP.",
    conditionTree: {
      id: "root",
      type: "group",
      operator: "all",
      children: [
        {
          id: "board-posts-10",
          type: "event",
          triggerKey: "messageboard.post.created",
          eventTypes: ["messageboard.post.created"],
          comparator: "count_gte",
          threshold: 10,
        },
        {
          id: "board-channel-once",
          type: "event",
          triggerKey: "messageboard.channel.post.created",
          eventTypes: ["messageboard.channel.post.created"],
          comparator: "exists",
          filters: { metadata: { channelId: 1 } },
        },
      ],
    },
    rewardActions: [
      {
        key: "award_exp",
        params: { amount: 50, reason: "messageboard_regular_challenge" },
      },
    ],
    repeatability: { mode: "once" },
    metadata: { seedKey: "messageboard_regular_v1", example: true },
  },
  {
    title: "Example: FA2 Token Holder Unlock",
    description:
      "Own a specific FA2 token id, then unlock a configured inventory reward.",
    conditionTree: {
      id: "root",
      type: "group",
      operator: "all",
      children: [
        {
          id: "owns-fa2-token",
          type: "predicate",
          predicateKey: "tezos.owns_specific_token_id",
          params: {
            contractAddress: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
            tokenId: "3",
            minimumQuantity: 1,
          },
        },
      ],
    },
    rewardActions: [
      {
        key: "unlock_inventory_item",
        params: {
          sku: "fa2-holder-unlock",
          quantity: 1,
          metadata: { source: "challenge_automation_seed" },
        },
      },
      {
        key: "create_notification",
        params: {
          title: "Challenge reward unlocked",
          body: "Your FA2 ownership challenge reward has been unlocked.",
        },
      },
    ],
    repeatability: { mode: "once" },
    metadata: { seedKey: "fa2_specific_token_unlock_v1", example: true },
  },
  {
    title: "Example: 3 Interactions In 24 Hours",
    description:
      "Complete any 3 tracked app interactions within 24 hours, then award WTF and EXP.",
    conditionTree: {
      id: "root",
      type: "group",
      operator: "all",
      children: [
        {
          id: "three-tracked-interactions",
          type: "event",
          triggerKey: "app.interaction.tracked",
          eventTypes: ["app.interaction.tracked"],
          comparator: "count_gte",
          threshold: 3,
          window: { amount: 24, unit: "hour" },
        },
      ],
    },
    rewardActions: [
      {
        key: "award_exp",
        params: { amount: 50, reason: "daily_interaction_challenge" },
      },
      {
        key: "queue_wtf_reward",
        params: {
          amountWtf: 10,
          reason: "3 tracked interactions in 24 hours",
        },
      },
    ],
    repeatability: { mode: "daily" },
    metadata: { seedKey: "three_interactions_24h_v1", example: true },
  },
  {
    title: "Example: First Music Play",
    description: "Play your first track in TezosBeats Music Player.",
    conditionTree: {
      id: "root",
      type: "group",
      operator: "all",
      children: [
        {
          id: "music-first-play",
          type: "event",
          triggerKey: "music.first_play",
          eventTypes: ["music.first_play"],
          comparator: "exists",
        },
      ],
    },
    rewardActions: [{ key: "award_exp", params: { amount: 25, reason: "music_first_play" } }],
    repeatability: { mode: "once" },
    metadata: { seedKey: "music_first_play_v1", example: true },
  },
  {
    title: "Example: MindWalk Journey",
    description: "Complete a MindWalk arcade session.",
    conditionTree: {
      id: "root",
      type: "group",
      operator: "all",
      children: [
        {
          id: "mindwalk-complete",
          type: "event",
          triggerKey: "arcade.mindwalk.journey_complete",
          eventTypes: ["arcade.mindwalk.journey_complete"],
          comparator: "exists",
        },
      ],
    },
    rewardActions: [{ key: "award_exp", params: { amount: 30, reason: "mindwalk_journey" } }],
    repeatability: { mode: "once" },
    metadata: { seedKey: "mindwalk_journey_v1", example: true },
  },
];

export async function ensureExampleAutomationChallenges(createdBy?: number | null) {
  let created = 0;
  for (const example of exampleDefinitions) {
    const seedKey = String(example.metadata.seedKey);
    const existing = await db
      .select({ id: challengeAutomationDefinitions.id })
      .from(challengeAutomationDefinitions)
      .where(sql`${challengeAutomationDefinitions.metadata}->>'seedKey' = ${seedKey}`)
      .limit(1);
    if (existing.length > 0) continue;

    await db.insert(challengeAutomationDefinitions).values({
      title: example.title,
      description: example.description,
      status: "draft",
      createdBy: createdBy ?? null,
      conditionTree: example.conditionTree as any,
      rewardActions: example.rewardActions as any,
      repeatability: example.repeatability,
      perUserCompletionLimit: 1,
      summary: renderChallengeRuleSummary(example),
      metadata: example.metadata,
    } as any);
    created += 1;
  }
  return { created };
}
