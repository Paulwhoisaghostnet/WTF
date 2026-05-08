import type { RewardActionDefinition } from "../events/types";

export const rewardActionRegistry: RewardActionDefinition[] = [
  {
    key: "award_exp",
    label: "Award EXP",
    description: "Uses the existing XP service and writes an xp.awarded SystemEvent.",
    sourceModule: "rewards",
    requiredParameters: [
      {
        key: "amount",
        label: "EXP amount",
        type: "number",
      },
    ],
    optionalParameters: [
      {
        key: "reason",
        label: "Reason",
        type: "string",
      },
    ],
    idempotent: true,
  },
  {
    key: "queue_wtf_reward",
    label: "Queue WTF reward",
    description: "Creates a reward ledger entry for operator payout and emits wtf.awarded.",
    sourceModule: "rewards",
    requiredParameters: [
      {
        key: "amountWtf",
        label: "WTF amount",
        type: "number",
      },
    ],
    optionalParameters: [
      {
        key: "reason",
        label: "Reason",
        type: "string",
      },
    ],
    idempotent: true,
  },
  {
    key: "create_notification",
    label: "Create notification",
    description: "Creates an in-app notification for the completing user.",
    sourceModule: "notifications",
    requiredParameters: [
      {
        key: "title",
        label: "Title",
        type: "string",
      },
    ],
    optionalParameters: [
      {
        key: "body",
        label: "Body",
        type: "string",
      },
    ],
    idempotent: true,
  },
  {
    key: "unlock_inventory_item",
    label: "Unlock inventory item",
    description: "Adds an item to the existing in-app inventory table.",
    sourceModule: "in_app_market",
    requiredParameters: [
      {
        key: "sku",
        label: "SKU",
        type: "string",
      },
    ],
    optionalParameters: [
      {
        key: "quantity",
        label: "Quantity",
        type: "number",
      },
      {
        key: "metadata",
        label: "Metadata",
        type: "json",
      },
    ],
    idempotent: true,
  },
  {
    key: "mark_challenge_complete",
    label: "Mark challenge complete",
    description: "Records automation completion and can emit a gameshow challenge completion event.",
    sourceModule: "gameshow",
    requiredParameters: [],
    optionalParameters: [
      {
        key: "legacyChallengeId",
        label: "Legacy challenge ID",
        type: "number",
      },
    ],
    idempotent: true,
  },
];

const registryByKey = new Map(
  rewardActionRegistry.map((action) => [action.key, action])
);

export function getRewardActionDefinition(key: string) {
  return registryByKey.get(key) ?? null;
}
