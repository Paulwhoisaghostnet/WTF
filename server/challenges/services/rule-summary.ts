import type { ChallengeRewardAction, ConditionTree } from "../events/types";
import { getRewardActionDefinition } from "../registries/actions";
import { getTriggerDefinition } from "../registries/triggers";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function describeEventCondition(node: Record<string, unknown>) {
  const triggerKey = String(node.triggerKey || "");
  const trigger = triggerKey ? getTriggerDefinition(triggerKey) : null;
  const eventTypes = Array.isArray(node.eventTypes)
    ? node.eventTypes.map(String).join(", ")
    : "tracked event";
  const label = trigger?.label.toLowerCase() ?? eventTypes;
  const comparator = String(node.comparator || "exists");
  const threshold = Number(node.threshold ?? 1);
  const filters = isRecord(node.filters) ? node.filters : {};
  const metadata = isRecord(filters.metadata) ? filters.metadata : {};
  const channel = metadata.channelId ? ` in channel ${metadata.channelId}` : "";
  const window = isRecord(node.window)
    ? ` within ${node.window.amount} ${node.window.unit}${Number(node.window.amount) === 1 ? "" : "s"}`
    : "";

  if (comparator === "exists") return `${label}${channel}`;
  if (comparator === "not_exists") return `no ${label}${channel}`;
  if (comparator === "count_gte") {
    return `${label}${channel} at least ${threshold} time${threshold === 1 ? "" : "s"}${window}`;
  }
  if (comparator === "count_eq") {
    return `${label}${channel} exactly ${threshold} time${threshold === 1 ? "" : "s"}${window}`;
  }
  if (comparator === "count_lte") {
    return `${label}${channel} no more than ${threshold} time${threshold === 1 ? "" : "s"}${window}`;
  }
  return `${label}${channel}${window}`;
}

function describePredicate(node: Record<string, unknown>) {
  const params = isRecord(node.params) ? node.params : {};
  switch (node.predicateKey) {
    case "tezos.owns_any_token_from_contract":
    case "tezos.owns_contract":
      return `own any FA2 token from ${params.contractAddress || "the configured contract"}`;
    case "tezos.owns_specific_token_id":
      return `own token ${params.tokenId || "ID"} from ${params.contractAddress || "the configured contract"}`;
    case "tezos.owns_minimum_quantity":
      return `own at least ${params.minimumQuantity || 1} of token ${params.tokenId || "ID"}`;
    case "tezos.owns_one_of_contracts":
      return "own a token from one of the configured contracts";
    case "tezos.owns_one_of_token_ids":
      return "own one of the configured token IDs";
    case "tezos.owns_all_token_ids":
      return "own all configured token IDs";
    case "user.has_role":
      return `have the ${params.role || "configured"} role`;
    case "user.is_contestant":
      return "be in the contestant role";
    case "reward.not_already_claimed":
      return "not have already claimed this reward";
    case "time.utc_weekday": {
      const rawDays = Array.isArray(params.weekdays)
        ? params.weekdays
        : Array.isArray(params.days)
          ? params.days
          : [params.weekday ?? params.day].filter((value) => value !== undefined);
      const days =
        typeof params.label === "string" && params.label.trim()
          ? params.label.trim()
          : rawDays.length > 0
            ? rawDays.map(String).join(", ")
            : "the configured day";
      return `act on UTC weekday ${days}`;
    }
    default:
      return `satisfy ${String(node.predicateKey || "a configured predicate")}`;
  }
}

function describeCondition(tree: unknown): string {
  if (!isRecord(tree)) return "satisfy the configured rule";
  const node = tree as unknown as ConditionTree;
  if (node.type === "group") {
    const children = Array.isArray(node.children)
      ? node.children.map(describeCondition).filter(Boolean)
      : [];
    const joiner = node.operator === "any" ? " or " : " and ";
    return children.length > 0 ? children.join(joiner) : "satisfy the configured rule";
  }
  if (node.type === "event") {
    return describeEventCondition(node as unknown as Record<string, unknown>);
  }
  if (node.type === "predicate") {
    return describePredicate(node as unknown as Record<string, unknown>);
  }
  return "satisfy the configured rule";
}

function describeAction(action: ChallengeRewardAction) {
  const def = getRewardActionDefinition(action.key);
  const params = action.params ?? {};
  if (action.key === "award_exp") return `${params.amount || 0} EXP`;
  if (action.key === "queue_wtf_reward") return `${params.amountWtf || 0} WTF`;
  if (action.key === "unlock_inventory_item") {
    return `unlock ${params.sku || "an inventory item"}`;
  }
  if (action.key === "create_notification") return "send a notification";
  return def?.label.toLowerCase() ?? action.key;
}

export function renderChallengeRuleSummary(input: {
  conditionTree: unknown;
  rewardActions: ChallengeRewardAction[];
}) {
  const condition = describeCondition(input.conditionTree);
  const rewards = input.rewardActions.map(describeAction).filter(Boolean);
  return `Complete this challenge by ${condition}. Reward: ${rewards.length > 0 ? rewards.join(" and ") : "configured reward"}.`;
}
