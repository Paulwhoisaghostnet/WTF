/**
 * Fail-closed guardrail: AT Protocol data must never drive WTFOS kernel events unless
 * explicitly authorized here. Prevents firehose/replay/XRPC passthrough from becoming an
 * attack vector into rewards, challenges, or other side effects.
 *
 * See docs/atproto/03-inbound-event-guardrail.md
 */

const BRIDGE_MARK = "__wtfos_atproto_bridge_v1__" as const;

export type AtprotoBridgeKind =
  | "skywire.adapter"
  | "skywire.notifications.sync"
  | "skywire.pipeline";

export interface AtprotoBridgeCredential {
  readonly [BRIDGE_MARK]: AtprotoBridgeKind;
  readonly eventType: string;
}

export class AtprotoEventAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtprotoEventAuthorizationError";
  }
}

export const ATPROTO_KERNEL_EVENT_SOURCES = new Set(["atproto", "bluesky"]);

export function isAtprotoKernelEventSource(source: string): boolean {
  return ATPROTO_KERNEL_EVENT_SOURCES.has(source);
}

const SKYWIRE_ADAPTER_EVENT_TYPES = [
  "atproto.account.registered",
  "atproto.account.linked",
  "atproto.account.unlinked",
  "atproto.permission_tier.selected",
  "atproto.chat_permission.toggled",
  "atproto.chat.message_sent",
  "atproto.profile.updated",
  "atproto.actor.searched",
  "atproto.actor.followed",
  "atproto.handle.claimed",
  "atproto.handle.verified",
  "atproto.signal.published",
  "atproto.room.message_sent",
  "atproto.stage.broadcast_sent",
  "atproto.post.created",
  "atproto.post.claimed",
  "atproto.post.replied",
  "atproto.post.quoted",
  "atproto.thread.viewed",
  "atproto.post.liked",
  "atproto.post.reposted",
] as const;

const SKYWIRE_NOTIFICATION_SYNC_EVENT_TYPES = ["atproto.notification.received"] as const;

const SKYWIRE_PIPELINE_EVENT_TYPES = [
  "skywire.pipeline.reward_queued",
  "skywire.pipeline.tv_queued",
  "skywire.pipeline.studio_queued",
  "skywire.pipeline.rat_race_queued",
  "skywire.pipeline.live_queued",
  "app.interaction.tracked",
] as const;

const AUTHORIZED_EVENT_TYPES: Record<AtprotoBridgeKind, readonly string[]> = {
  "skywire.adapter": SKYWIRE_ADAPTER_EVENT_TYPES,
  "skywire.notifications.sync": SKYWIRE_NOTIFICATION_SYNC_EVENT_TYPES,
  "skywire.pipeline": SKYWIRE_PIPELINE_EVENT_TYPES,
};

export function bridgeKindForAtprotoEventType(eventType: string): AtprotoBridgeKind {
  if ((SKYWIRE_NOTIFICATION_SYNC_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return "skywire.notifications.sync";
  }
  return "skywire.adapter";
}

export function issueAtprotoBridgeCredential(
  bridge: AtprotoBridgeKind,
  eventType: string
): AtprotoBridgeCredential {
  const allowed = AUTHORIZED_EVENT_TYPES[bridge];
  if (!allowed.includes(eventType)) {
    throw new AtprotoEventAuthorizationError(
      `Event type "${eventType}" is not authorized for AT bridge "${bridge}"`
    );
  }
  return { [BRIDGE_MARK]: bridge, eventType };
}

export function assertAtprotoBridgeCredential(input: {
  source: string;
  eventType: string;
  bridge?: AtprotoBridgeCredential | null;
}): void {
  if (!isAtprotoKernelEventSource(input.source)) return;

  const bridge = input.bridge;
  if (!bridge || bridge[BRIDGE_MARK] === undefined) {
    throw new AtprotoEventAuthorizationError(
      `AT-sourced kernel events require an explicit bridge credential (eventType=${input.eventType})`
    );
  }
  if (bridge.eventType !== input.eventType) {
    throw new AtprotoEventAuthorizationError(
      `AT bridge credential eventType mismatch (expected ${input.eventType}, got ${bridge.eventType})`
    );
  }
  const allowed = AUTHORIZED_EVENT_TYPES[bridge[BRIDGE_MARK]];
  if (!allowed.includes(input.eventType)) {
    throw new AtprotoEventAuthorizationError(
      `Event type "${input.eventType}" is not authorized for AT bridge "${bridge[BRIDGE_MARK]}"`
    );
  }
}
