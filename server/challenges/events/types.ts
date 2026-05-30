export type SystemEventType =
  | "messageboard.post.created"
  | "messageboard.channel.post.created"
  | "messageboard.reaction.added"
  | "messageboard.reaction.removed"
  | "board.message.edited"
  | "board.message.deleted"
  | "board.message.pinned"
  | "board.webhook_received"
  | "profile.updated"
  | "profile.social.unlinked"
  | "profile.public_visibility.updated"
  | "profile.public.viewed"
  | "profile.dm_lookup.opened"
  | "notification.viewed"
  | "notification.opened"
  | "notification.read"
  | "notification.read_all"
  | "notification.preference.updated"
  | "w.post.created"
  | "w.media.uploaded"
  | "w.reply.created"
  | "w.like.created"
  | "w.repost.created"
  | "w.quote.created"
  | "dm.message.sent"
  | "leaderboard.viewed"
  | "leaderboard.xp.viewed"
  | "leaderboard.transfers.viewed"
  | "w.follow.created"
  | "w.spaces.viewed"
  | "w.capabilities.viewed"
  | "w.diagnostics.viewed"
  | "w.groupchat.viewed"
  | "w.groupchat.message_sent"
  | "w.admin.stream_rule.updated"
  | "auth.register.succeeded"
  | "auth.login.succeeded"
  | "auth.welcome.event"
  | "auth.welcome.completed"
  | "auth.gm_welcome.event"
  | "auth.gm_welcome.completed"
  | "diary.index.viewed"
  | "diary.entry.created"
  | "diary.entry.updated"
  | "diary.entry.deleted"
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

import type { AtprotoBridgeCredential } from "../../features/atproto/event-bridge";

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
  /** Required when source is atproto/bluesky; see docs/atproto/03-inbound-event-guardrail.md */
  atprotoBridge?: AtprotoBridgeCredential | null;
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
