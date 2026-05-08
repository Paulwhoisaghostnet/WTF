export type TriggerDefinition = {
  key: string;
  label: string;
  description: string;
  sourceModule: string;
  requiredParameters: Array<{ key: string; label: string; type: string }>;
  optionalParameters: Array<{ key: string; label: string; type: string }>;
  eventTypes: string[];
  comparisonModes: string[];
  timingMode: string;
};

export type RewardActionDefinition = {
  key: string;
  label: string;
  description: string;
  sourceModule: string;
  requiredParameters: Array<{ key: string; label: string; type: string }>;
  optionalParameters: Array<{ key: string; label: string; type: string }>;
  idempotent: boolean;
};

export type ChallengeAutomationRegistry = {
  triggers: TriggerDefinition[];
  rewardActions: RewardActionDefinition[];
  predicates: string[];
};

export type ConditionDraft = {
  id: string;
  triggerKey: string;
  comparator: string;
  threshold: string;
  channelId: string;
  objectId: string;
  action: string;
  roundId: string;
  windowAmount: string;
  windowUnit: "minute" | "hour" | "day";
  contractAddress: string;
  tokenId: string;
  minimumQuantity: string;
  role: string;
};

export type RewardActionDraft = {
  id: string;
  key: string;
  amount: string;
  amountWtf: string;
  reason: string;
  sku: string;
  quantity: string;
  title: string;
  body: string;
};

export type ChallengeBuilderState = {
  id?: number | null;
  title: string;
  description: string;
  status: string;
  groupOperator: "all" | "any";
  startTime: string;
  endTime: string;
  repeatabilityMode: "once" | "daily" | "weekly" | "per_event";
  perUserCompletionLimit: string;
  globalCompletionLimit: string;
  conditions: ConditionDraft[];
  rewardActions: RewardActionDraft[];
  metadataJson: string;
};

export type AutomationChallenge = {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  conditionTree: any;
  rewardActions: any[];
  repeatability: any;
  perUserCompletionLimit: number;
  globalCompletionLimit?: number | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
  startTime?: string | null;
  endTime?: string | null;
  updatedAt: string;
  completionCount?: number;
  progressCount?: number;
};
