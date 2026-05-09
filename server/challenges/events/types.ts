export type SystemEventType =
  | "messageboard.post.created"
  | "messageboard.channel.post.created"
  | "auth.register.succeeded"
  | "auth.login.succeeded"
  | "auth.welcome.event"
  | "auth.welcome.completed"
  | "auth.gm_welcome.event"
  | "auth.gm_welcome.completed"
  | "user.login"
  | "user.wallet.connected"
  | "user.profile.updated"
  | "desktop.object.clicked"
  | "desktop.pet.interacted"
  | "map.node.visited"
  | "gameshow.round.joined"
  | "gameshow.challenge.completed"
  | "xp.awarded"
  | "wtf.awarded"
  | "nft.ownership.verified"
  | "token.contract.owned"
  | "token.id.owned"
  | "app.interaction.tracked"
  | string;

export interface NormalizedSystemEventInput {
  eventId?: string;
  eventType: SystemEventType;
  userId?: number | null;
  walletAddress?: string | null;
  occurredAt?: Date;
  source: string;
  sourceModule?: string | null;
  metadata?: Record<string, unknown> | null;
  rawRefType?: string | null;
  rawRefId?: string | number | null;
}

export type TriggerTimingMode =
  | "instant"
  | "counted"
  | "time_windowed"
  | "externally_verified";

export interface TriggerDefinition {
  key: string;
  label: string;
  description: string;
  sourceModule: string;
  requiredParameters: Array<TriggerParameterDefinition>;
  optionalParameters: Array<TriggerParameterDefinition>;
  eventTypes: SystemEventType[];
  comparisonModes: Array<"exists" | "not_exists" | "count_gte" | "count_eq" | "count_lte">;
  timingMode: TriggerTimingMode;
}

export interface TriggerParameterDefinition {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "datetime" | "json";
  description?: string;
}

export interface RewardActionDefinition {
  key: string;
  label: string;
  description: string;
  sourceModule: string;
  requiredParameters: Array<TriggerParameterDefinition>;
  optionalParameters: Array<TriggerParameterDefinition>;
  idempotent: boolean;
}

export type ConditionComparator =
  | "exists"
  | "not_exists"
  | "count_gte"
  | "count_eq"
  | "count_lte";

export type ConditionTree = ConditionGroupNode | EventConditionNode | PredicateConditionNode;

export interface ConditionGroupNode {
  id: string;
  type: "group";
  operator: "all" | "any";
  children: ConditionTree[];
}

export interface EventConditionNode {
  id: string;
  type: "event";
  triggerKey?: string;
  eventTypes: SystemEventType[];
  comparator: ConditionComparator;
  threshold?: number;
  filters?: EventConditionFilters;
  window?: {
    amount: number;
    unit: "minute" | "hour" | "day";
  };
}

export interface PredicateConditionNode {
  id: string;
  type: "predicate";
  predicateKey: string;
  comparator?: ConditionComparator;
  params?: Record<string, unknown>;
}

export interface EventConditionFilters {
  source?: string;
  sourceModule?: string;
  walletAddress?: string;
  rawRefType?: string;
  rawRefId?: string | number;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface ChallengeRewardAction {
  key: string;
  params?: Record<string, unknown>;
}
