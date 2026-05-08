import { GroupBox } from "react95";
import styled from "styled-components";
import type { ChallengeBuilderState, TriggerDefinition } from "./types";
import { buildConditionTree, buildRewardActions } from "./builder-utils";

const PreviewText = styled.p`
  margin: 0;
  line-height: 1.45;
`;

function describeCondition(condition: any, triggers: TriggerDefinition[]): string {
  const trigger = triggers.find((item) => item.key === condition.triggerKey);
  const label = trigger?.label.toLowerCase() || condition.triggerKey;
  if (condition.triggerKey.startsWith("tezos.")) {
    const params = condition.params || {};
    return `own token ${params.tokenId || "ID"} from ${params.contractAddress || "the configured contract"}`;
  }
  const count = Number(condition.threshold || 1);
  const filters = condition.filters?.metadata || {};
  const channel = filters.channelId ? ` in channel ${filters.channelId}` : "";
  const window = condition.window
    ? ` within ${condition.window.amount} ${condition.window.unit}${Number(condition.window.amount) === 1 ? "" : "s"}`
    : "";
  if (condition.comparator === "exists") return `${label}${channel}`;
  return `${label}${channel} at least ${count} time${count === 1 ? "" : "s"}${window}`;
}

function describeAction(action: any): string {
  if (action.key === "award_exp") return `${action.params.amount || 0} EXP`;
  if (action.key === "queue_wtf_reward") return `${action.params.amountWtf || 0} WTF`;
  if (action.key === "unlock_inventory_item") {
    return `unlock ${action.params.sku || "inventory item"}`;
  }
  if (action.key === "create_notification") return "send a notification";
  return action.key;
}

export function ChallengePreview({
  state,
  triggers,
}: {
  state: ChallengeBuilderState;
  triggers: TriggerDefinition[];
}) {
  const tree = buildConditionTree(state, triggers);
  const joiner = tree.operator === "any" ? " or " : " and ";
  const conditionText = tree.children.map((condition) => describeCondition(condition, triggers)).join(joiner);
  const rewards = buildRewardActions(state).map(describeAction).join(" and ");
  return (
    <GroupBox label="Rule Preview">
      <PreviewText>
        Complete this challenge by {conditionText || "satisfying the configured rule"}.
        {" "}Reward: {rewards || "configured reward"}.
      </PreviewText>
    </GroupBox>
  );
}
