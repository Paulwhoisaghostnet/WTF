import type {
  AutomationChallenge,
  ChallengeBuilderState,
  ConditionDraft,
  RewardActionDraft,
  TriggerDefinition,
} from "./types";

export function newConditionDraft(): ConditionDraft {
  return {
    id: crypto.randomUUID(),
    triggerKey: "messageboard.post.created",
    comparator: "count_gte",
    threshold: "1",
    channelId: "",
    objectId: "",
    action: "",
    roundId: "",
    windowAmount: "",
    windowUnit: "hour",
    contractAddress: "",
    tokenId: "",
    minimumQuantity: "1",
    role: "contestant",
  };
}

export function newRewardActionDraft(): RewardActionDraft {
  return {
    id: crypto.randomUUID(),
    key: "award_exp",
    amount: "50",
    amountWtf: "10",
    reason: "",
    sku: "",
    quantity: "1",
    title: "",
    body: "",
  };
}

export function emptyBuilderState(): ChallengeBuilderState {
  return {
    id: null,
    title: "",
    description: "",
    status: "draft",
    groupOperator: "all",
    startTime: "",
    endTime: "",
    repeatabilityMode: "once",
    perUserCompletionLimit: "1",
    globalCompletionLimit: "",
    conditions: [newConditionDraft()],
    rewardActions: [newRewardActionDraft()],
    metadataJson: "{}",
  };
}

function toLocalDateTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function triggerForKey(triggers: TriggerDefinition[], key: string) {
  return triggers.find((trigger) => trigger.key === key);
}

function conditionFromNode(node: any): ConditionDraft {
  const draft = newConditionDraft();
  if (node?.type === "predicate") {
    const params = node.params || {};
    return {
      ...draft,
      triggerKey: node.predicateKey || "tezos.owns_specific_token_id",
      comparator: node.comparator || "exists",
      contractAddress: params.contractAddress || "",
      tokenId: params.tokenId || "",
      minimumQuantity: String(params.minimumQuantity || "1"),
      role: params.role || "contestant",
    };
  }
  const filters = node?.filters || {};
  const metadata = filters.metadata || {};
  const window = node?.window || {};
  return {
    ...draft,
    triggerKey: node?.triggerKey || node?.eventTypes?.[0] || "messageboard.post.created",
    comparator: node?.comparator || "exists",
    threshold: String(node?.threshold || 1),
    channelId: metadata.channelId ? String(metadata.channelId) : "",
    objectId: metadata.objectId ? String(metadata.objectId) : "",
    action: metadata.action ? String(metadata.action) : "",
    roundId: metadata.roundId ? String(metadata.roundId) : "",
    windowAmount: window.amount ? String(window.amount) : "",
    windowUnit: window.unit || "hour",
  };
}

function rewardFromAction(action: any): RewardActionDraft {
  const draft = newRewardActionDraft();
  const params = action?.params || {};
  return {
    ...draft,
    key: action?.key || "award_exp",
    amount: String(params.amount || draft.amount),
    amountWtf: String(params.amountWtf || draft.amountWtf),
    reason: params.reason || "",
    sku: params.sku || "",
    quantity: String(params.quantity || draft.quantity),
    title: params.title || "",
    body: params.body || "",
  };
}

export function challengeToBuilderState(challenge: AutomationChallenge) {
  const tree = challenge.conditionTree || {};
  const children =
    tree.type === "group" && Array.isArray(tree.children) ? tree.children : [tree];
  return {
    id: challenge.id,
    title: challenge.title || "",
    description: challenge.description || "",
    status: challenge.status || "draft",
    groupOperator: tree.operator === "any" ? "any" : "all",
    startTime: toLocalDateTime(challenge.startTime),
    endTime: toLocalDateTime(challenge.endTime),
    repeatabilityMode: challenge.repeatability?.mode || "once",
    perUserCompletionLimit: String(challenge.perUserCompletionLimit || 1),
    globalCompletionLimit: challenge.globalCompletionLimit
      ? String(challenge.globalCompletionLimit)
      : "",
    conditions: children.map(conditionFromNode),
    rewardActions: Array.isArray(challenge.rewardActions)
      ? challenge.rewardActions.map(rewardFromAction)
      : [newRewardActionDraft()],
    metadataJson: JSON.stringify(challenge.metadata || {}, null, 2),
  } satisfies ChallengeBuilderState;
}

export function buildConditionTree(
  state: ChallengeBuilderState,
  triggers: TriggerDefinition[]
) {
  return {
    id: "root",
    type: "group",
    operator: state.groupOperator,
    children: state.conditions.map((condition) => {
      const trigger = triggerForKey(triggers, condition.triggerKey);
      if (condition.triggerKey.startsWith("tezos.")) {
        return {
          id: condition.id,
          type: "predicate",
          predicateKey: condition.triggerKey,
          params: {
            contractAddress: condition.contractAddress || undefined,
            tokenId: condition.tokenId || undefined,
            minimumQuantity: Number(condition.minimumQuantity || 1),
          },
        };
      }
      if (condition.triggerKey === "user.has_role") {
        return {
          id: condition.id,
          type: "predicate",
          predicateKey: "user.has_role",
          params: { role: condition.role },
        };
      }
      const metadata: Record<string, string | number> = {};
      if (condition.channelId) metadata.channelId = Number(condition.channelId);
      if (condition.objectId) metadata.objectId = condition.objectId;
      if (condition.action) metadata.action = condition.action;
      if (condition.roundId) metadata.roundId = Number(condition.roundId);
      const eventNode: Record<string, unknown> = {
        id: condition.id,
        type: "event",
        triggerKey: condition.triggerKey,
        eventTypes: trigger?.eventTypes || [condition.triggerKey],
        comparator: condition.comparator,
        threshold: Number(condition.threshold || 1),
      };
      if (Object.keys(metadata).length > 0) eventNode.filters = { metadata };
      if (condition.windowAmount) {
        eventNode.window = {
          amount: Number(condition.windowAmount),
          unit: condition.windowUnit,
        };
      }
      return eventNode;
    }),
  };
}

export function buildRewardActions(state: ChallengeBuilderState) {
  return state.rewardActions.map((action) => {
    if (action.key === "award_exp") {
      return {
        key: action.key,
        params: {
          amount: Number(action.amount || 0),
          reason: action.reason || undefined,
        },
      };
    }
    if (action.key === "queue_wtf_reward") {
      return {
        key: action.key,
        params: {
          amountWtf: Number(action.amountWtf || 0),
          reason: action.reason || undefined,
        },
      };
    }
    if (action.key === "unlock_inventory_item") {
      return {
        key: action.key,
        params: {
          sku: action.sku,
          quantity: Number(action.quantity || 1),
        },
      };
    }
    if (action.key === "create_notification") {
      return {
        key: action.key,
        params: {
          title: action.title,
          body: action.body,
        },
      };
    }
    return { key: action.key, params: {} };
  });
}

export function buildChallengePayload(
  state: ChallengeBuilderState,
  triggers: TriggerDefinition[]
) {
  const metadata = state.metadataJson.trim()
    ? JSON.parse(state.metadataJson)
    : {};
  return {
    title: state.title,
    description: state.description,
    status: state.status,
    startTime: state.startTime ? new Date(state.startTime).toISOString() : null,
    endTime: state.endTime ? new Date(state.endTime).toISOString() : null,
    conditionTree: buildConditionTree(state, triggers),
    rewardActions: buildRewardActions(state),
    repeatability: { mode: state.repeatabilityMode },
    perUserCompletionLimit: Number(state.perUserCompletionLimit || 1),
    globalCompletionLimit: state.globalCompletionLimit
      ? Number(state.globalCompletionLimit)
      : null,
    metadata,
  };
}
