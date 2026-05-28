import { db } from "../../db";
import { ingestSystemEvent } from "../../challenges/events/ingest";
import { atprotoEvents } from "@shared/schema";
import { sourceUrlForAtUri } from "./identity";

export type SkywireEventType =
  | "atproto.account.registered"
  | "atproto.account.linked"
  | "atproto.account.unlinked"
  | "atproto.permission_tier.selected"
  | "atproto.chat_permission.toggled"
  | "atproto.chat.message_sent"
  | "atproto.profile.updated"
  | "atproto.actor.searched"
  | "atproto.actor.followed"
  | "atproto.handle.claimed"
  | "atproto.handle.verified"
  | "atproto.signal.published"
  | "atproto.room.message_sent"
  | "atproto.stage.broadcast_sent"
  | "atproto.post.created"
  | "atproto.post.claimed"
  | "atproto.post.replied"
  | "atproto.post.quoted"
  | "atproto.thread.viewed"
  | "atproto.post.liked"
  | "atproto.post.reposted"
  | "atproto.notification.received";

export function skywireEventId(
  eventType: SkywireEventType,
  key: string | number | null | undefined
): string {
  return `${eventType}:${String(key || "unknown").replace(/\s+/g, "_")}`;
}

export async function emitAtprotoSystemEvent(input: {
  eventId?: string;
  eventType: SkywireEventType;
  userId?: number | null;
  did: string;
  handle?: string | null;
  uri?: string | null;
  cid?: string | null;
  text?: string | null;
  challengeId?: number | null;
  tezosAlias?: string | null;
  walletAddress?: string | null;
  rawRefType?: string | null;
  rawRefId?: string | number | null;
  source?: "bluesky" | "atproto";
  raw?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}) {
  const eventId =
    input.eventId ?? skywireEventId(input.eventType, input.uri ?? input.rawRefId ?? input.cid);
  const textExcerpt = input.text ? input.text.slice(0, 280) : null;
  const [row] = await db
    .insert(atprotoEvents)
    .values({
      stableEventId: eventId,
      source: input.source ?? "atproto",
      eventType: input.eventType,
      userId: input.userId ?? null,
      actorDid: input.did,
      actorHandle: input.handle ?? null,
      uri: input.uri ?? null,
      cid: input.cid ?? null,
      text: textExcerpt,
      raw: input.raw ?? {},
      processedAt: new Date(),
      challengeRelevant: Boolean(input.challengeId),
    })
    .onConflictDoNothing()
    .returning();

  const result = await ingestSystemEvent({
    eventId,
    eventType: input.eventType,
    userId: input.userId ?? null,
    walletAddress: input.walletAddress ?? null,
    source: input.source ?? "atproto",
    sourceModule: "skywire",
    rawRefType: input.rawRefType ?? null,
    rawRefId: input.rawRefId ?? input.uri ?? null,
    metadata: {
      did: input.did,
      handle: input.handle ?? null,
      uri: input.uri ?? null,
      cid: input.cid ?? null,
      text: textExcerpt,
      sourceUrl: input.uri ? sourceUrlForAtUri(input.uri) : null,
      challengeId: input.challengeId ?? null,
      tezosAlias: input.tezosAlias ?? null,
      walletAddress: input.walletAddress ?? null,
      atprotoEventRowId: row?.id ?? null,
      ...(input.metadata ?? {}),
    },
  });

  return { atprotoEvent: row ?? null, systemEvent: result.event, deduped: result.deduped };
}
