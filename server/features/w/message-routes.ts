import type { Router } from "express";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { isAuthenticated } from "../../auth/passport";
import { hasPermission } from "../../lib/permissions";
import {
  platformSettings,
  users,
  xDmConversations,
  xDmEvents,
  xDmParticipants,
} from "@shared/schema";
import { classifyDmConversation } from "@shared/x-dm";
import {
  getPlatformXOAuth2AccessToken,
  getPlatformXOAuth2Status,
  getUserXOAuth2AccessToken,
  xOAuth2Request,
} from "../../lib/x-oauth2";
import {
  clearDmCacheByPrefix,
  dmCacheKey,
  getRateLimitedUntil,
  readDmThroughCache,
  setCachedDmRead,
} from "../../lib/x-dm-cache";
import { syncDmEventsFromPayload } from "../../lib/x-dm-sync";
import { getXaaGroupchatStatus } from "../../lib/x-activity-stream";
import {
  canUseXFeature,
  getXUsageBudgetStatus,
  recordXFeatureUsage,
} from "../../lib/x-usage-budget";
import {
  getTimelineStreamBearer,
  getTimelineStreamStatus,
  loadStreamRuleHandleSources,
  listManagedStreamRules,
  normalizeStreamHandles,
  requestTimelineStreamReconnect,
  syncStreamRulesToX,
  W_STREAM_RULE_HANDLES_KEY,
} from "../../lib/timeline-stream";
import { requireOwnedWMediaId } from "./media-ownership";
import { ingestSystemEvent } from "../../challenges/events/ingest";
import type { SystemEventType } from "../../challenges/events/types";
import {
  selectUniqueConnectedWtfUsersByTwitterId,
  type ConnectedWtfUser,
} from "./message-identity";

const W_GAMESHOW_DM_SETTING_KEY = "w.gameshow_dm_conversation_id";
const DEFAULT_W_GAMESHOW_DM_CONVERSATION_ID = "g1934373363226407162";

function emitDmSentEvent(input: {
  userId: number;
  conversationId: string;
  targetUserId?: number | null;
  mediaAttached: boolean;
  sourceModule: string;
  result: unknown;
}): void {
  const resultId =
    typeof input.result === "object" && input.result
      ? String(
          (input.result as any)?.data?.id ||
            (input.result as any)?.event_id ||
            (input.result as any)?.id ||
            ""
        ).trim()
      : "";
  void ingestSystemEvent({
    eventId: `dm.message.sent:${input.userId}:${resultId || Date.now()}`,
    eventType: "dm.message.sent",
    userId: input.userId,
    source: "w",
    sourceModule: input.sourceModule,
    rawRefType: "x_dm_message",
    rawRefId: resultId || input.conversationId,
    metadata: {
      conversationId: input.conversationId,
      targetUserId: input.targetUserId ?? null,
      mediaAttached: input.mediaAttached,
    },
  }).catch((err) => console.warn("[w] failed to emit DM sent event", err));
}

function emitWMessageEvent(input: {
  eventType: SystemEventType;
  userId: number;
  rawRefType: string;
  rawRefId?: string | number | null;
  metadata?: Record<string, unknown>;
}): void {
  void ingestSystemEvent({
    eventType: input.eventType,
    userId: input.userId,
    source: "w",
    sourceModule: "w-messages",
    rawRefType: input.rawRefType,
    rawRefId: input.rawRefId ?? null,
    metadata: input.metadata || null,
  }).catch((err) => console.warn("[w] failed to emit message event", err));
}

function emitWDiagnosticsViewed(userId: number, metadata: Record<string, unknown>): void {
  void ingestSystemEvent({
    eventType: "w.diagnostics.viewed",
    userId,
    source: "w",
    sourceModule: "w-diagnostics",
    rawRefType: "w_diagnostics",
    rawRefId: userId,
    metadata,
  }).catch((err) => console.warn("[w] failed to emit diagnostics event", err));
}

function isDigits(value: string | null | undefined): boolean {
  return /^\d+$/.test(String(value || "").trim());
}

function xApiErrorMessage(err: any, fallback: string): string {
  const msg = String(err?.message || "").trim();
  return msg || fallback;
}

function xOAuthErrorMessage(err: any, fallback: string): string {
  return String(err?.message || err?.payload?.detail || err?.payload?.title || fallback);
}

function isDmConversationId(value: string | null | undefined): boolean {
  const id = String(value || "").trim();
  return /^(?:g[a-z0-9_-]+|\d+|\d+-\d+)$/i.test(id);
}

function normalizeDmConversationId(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase().replace(/^g/i, "");
}

function sameDmConversationId(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = normalizeDmConversationId(a);
  const right = normalizeDmConversationId(b);
  return Boolean(left && right && left === right);
}

function oneToOneParticipantIdsFromConversationId(value: string | null | undefined): string[] {
  const id = String(value || "").trim();
  return /^\d+-\d+$/.test(id) ? id.split("-").filter(isDigits) : [];
}

async function getSettingValue(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .limit(1);
  const value = String(row?.value || "").trim();
  return value || null;
}

async function setSettingValue(key: string, value: string, updatedBy: number) {
  await db
    .insert(platformSettings)
    .values({
      key,
      value,
      updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: {
        value,
        updatedBy,
        updatedAt: new Date(),
      },
    });
}

function parseConversationIds(value: string | null | undefined): string[] {
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return Array.from(new Set(parsed.map((id) => String(id).trim()).filter(isDmConversationId)));
    }
  } catch {
    // Accept legacy single-id and comma-separated env/config values.
  }
  return Array.from(new Set(raw.split(/[,\s]+/).map((id) => id.trim()).filter(isDmConversationId)));
}

async function dmConversationIds(): Promise<string[]> {
  const configured = await getSettingValue(W_GAMESHOW_DM_SETTING_KEY);
  const envConfigured =
    process.env.W_X_GAMESHOW_DM_CONVERSATION_IDS ||
    process.env.W_X_GAMESHOW_DM_CONVERSATION_ID ||
    DEFAULT_W_GAMESHOW_DM_CONVERSATION_ID;
  return parseConversationIds(configured || envConfigured);
}

async function dmConversationId(): Promise<string> {
  return (await dmConversationIds())[0] || "";
}

export async function getWGroupchatConversationIds(): Promise<string[]> {
  return dmConversationIds();
}

async function loadGroupchatFromDb(conversationId: string, limit: number) {
  const convoDigits = normalizeDmConversationId(conversationId);
  const rows = await db
    .select()
    .from(xDmEvents)
    .where(sql`REPLACE(LOWER(${xDmEvents.conversationId}), 'g', '') = ${convoDigits}`)
    .orderBy(desc(xDmEvents.createdAt))
    .limit(limit);
  if (rows.length === 0) return null;

  // Get the real participant list from x_dm_conversations if available
  const [convoMeta] = await db
    .select()
    .from(xDmConversations)
    .where(sql`REPLACE(LOWER(${xDmConversations.conversationId}), 'g', '') = ${convoDigits}`)
    .limit(1);
  const knownParticipantIds: string[] = Array.isArray(convoMeta?.participantIds)
    ? (convoMeta.participantIds as string[])
    : [];

  const senderSet = new Set<string>();
  const messages = rows.map((row) => {
    senderSet.add(row.senderTwitterId);
    const senderData = (row.senderData || {}) as Record<string, any>;
    return {
      id: row.eventId,
      eventType: row.eventType,
      text: row.text || "",
      createdAt: row.createdAt?.toISOString() || null,
      media: (row.media || []) as any[],
      sender: {
        id: row.senderTwitterId,
        username: senderData.username || null,
        name: senderData.name || null,
        profileImageUrl: senderData.profileImageUrl || null,
      },
    };
  });

  // Merge senders from events with known participants from conversation metadata
  const allIds = new Set([...senderSet, ...knownParticipantIds]);
  const participantIds = Array.from(allIds);
  const classification = classifyDmConversation({
    conversationId,
    conversationType: convoMeta?.conversationType,
    participantIds,
  });
  const convoType = classification.type;

  const participants = await db
    .select()
    .from(xDmParticipants)
    .where(inArray(xDmParticipants.twitterId, participantIds.length > 0 ? participantIds : ["__none__"]));
  const participantLookup = new Map(participants.map(p => [p.twitterId, p]));

  return {
    summary: {
      id: conversationId,
      type: convoType,
      name: null,
      createdAt: rows[rows.length - 1]?.createdAt?.toISOString() || null,
      participantCount: participantIds.length,
      participants: participantIds.map(id => {
        const p = participantLookup.get(id);
        return { id, username: p?.username || null, name: p?.displayName || null, profileImageUrl: p?.profileImageUrl || null };
      }),
    },
    messages,
  };
}

async function loadUserDmConversationsFromDb(tokenOwnerId: string, _excludeConvoDigits: Set<string>) {
  if (!tokenOwnerId || !/^\d+$/.test(tokenOwnerId)) return null;

  // Find conversation IDs that have either been discovered by this user's live
  // inbox scan or have events fetched by this user's token. `event_id` is
  // globally unique, so fetched_by_token_owner can only record the first owner
  // that wrote an event; the persisted ID list keeps owner recall stable.
  const cachedConvoIds = await loadCachedXConversationIds(tokenOwnerId);
  const userConvoRows = await db
    .select({ conversationId: xDmEvents.conversationId })
    .from(xDmEvents)
    .where(eq(xDmEvents.fetchedByTokenOwner, tokenOwnerId))
    .groupBy(xDmEvents.conversationId)
    .limit(100);

  const userConvoIds = Array.from(
    new Set([...cachedConvoIds, ...userConvoRows.map((r) => r.conversationId)].filter(isDmConversationId))
  );
  if (userConvoIds.length === 0) return null;
  const normalizedConvoIds = Array.from(new Set(userConvoIds.map(normalizeDmConversationId)));

  const convos = await db
    .select()
    .from(xDmConversations)
    .where(inArray(sql<string>`REPLACE(LOWER(${xDmConversations.conversationId}), 'g', '')`, normalizedConvoIds))
    .orderBy(desc(xDmConversations.lastEventAt))
    .limit(100);
  if (convos.length === 0) return null;

  const ownerSentRows = await db
    .select({ conversationId: xDmEvents.conversationId })
    .from(xDmEvents)
    .where(
      and(
        eq(xDmEvents.fetchedByTokenOwner, tokenOwnerId),
        eq(xDmEvents.senderTwitterId, tokenOwnerId),
        inArray(sql<string>`REPLACE(LOWER(${xDmEvents.conversationId}), 'g', '')`, normalizedConvoIds)
      )
    )
    .groupBy(xDmEvents.conversationId);
  const ownerSentConvoIds = new Set(ownerSentRows.map((row) => normalizeDmConversationId(row.conversationId)));

  const allParticipantIds = new Set<string>();
  for (const c of convos) {
    const rawPids = Array.isArray(c.participantIds) ? c.participantIds : [];
    const pids = Array.from(new Set(rawPids.map(String).filter(isDigits)));
    const oneToOneIds = oneToOneParticipantIdsFromConversationId(c.conversationId);
    if (
      pids.length < 2 &&
      oneToOneIds.includes(tokenOwnerId) &&
      (pids.includes(tokenOwnerId) || ownerSentConvoIds.has(normalizeDmConversationId(c.conversationId)))
    ) {
      for (const pid of oneToOneIds) pids.push(pid);
    }
    for (const pid of pids) allParticipantIds.add(String(pid));
  }

  const participants = allParticipantIds.size > 0
    ? await db.select().from(xDmParticipants).where(inArray(xDmParticipants.twitterId, Array.from(allParticipantIds)))
    : [];
  const participantLookup = new Map(participants.map(p => [p.twitterId, p]));

  return convos
    .map((c) => {
    const rawPids: string[] = Array.isArray(c.participantIds) ? c.participantIds as string[] : [];
    const oneToOneIds = oneToOneParticipantIdsFromConversationId(c.conversationId);
    const pids: string[] = Array.from(new Set(rawPids.map(String).filter(isDigits)));
    if (
      pids.length < 2 &&
      oneToOneIds.includes(tokenOwnerId) &&
      (pids.includes(tokenOwnerId) || ownerSentConvoIds.has(normalizeDmConversationId(c.conversationId)))
    ) {
      for (const pid of oneToOneIds) {
        if (!pids.includes(pid)) pids.push(pid);
      }
    }
    const peerIds = pids.filter(id => id !== tokenOwnerId);
    const classification = classifyDmConversation({
      conversationId: c.conversationId,
      conversationType: c.conversationType,
      participantIds: pids,
      participantCount: pids.length,
    });
    const conversation = {
      id: c.conversationId,
      type: classification.type,
      name: null,
      createdAt: c.lastEventAt?.toISOString() || null,
      participantCount: classification.participantCount,
    };
    if (isMessageRequestConversation(conversation, tokenOwnerId)) return null;
    return {
      ...conversation,
      peers: peerIds.map((twitterId) => {
        const p = participantLookup.get(twitterId);
        return {
          userId: null,
          username: null,
          displayName: p?.displayName || null,
          twitterId,
          twitterHandle: p?.username || null,
          xUsername: p?.username || null,
          xName: p?.displayName || null,
          isWtfUser: false,
        };
      }),
    };
    })
    .filter((conversation) => conversation !== null)
    .filter((conversation) => conversation !== null && (conversation.type === "group" || conversation.participantCount >= 2));
}

async function loadDmThreadFromDb(conversationId: string, limit: number, tokenOwnerId?: string) {
  if (tokenOwnerId && !(await userCanReadCachedDmConversation(tokenOwnerId, conversationId))) return null;
  const convoDigits = normalizeDmConversationId(conversationId);
  const rows = await db
    .select()
    .from(xDmEvents)
    .where(sql`REPLACE(LOWER(${xDmEvents.conversationId}), 'g', '') = ${convoDigits}`)
    .orderBy(desc(xDmEvents.createdAt))
    .limit(limit);
  if (rows.length === 0) return null;
  return rows.map((row) => {
    const senderData = (row.senderData || {}) as Record<string, any>;
    return {
      id: row.eventId,
      eventType: row.eventType,
      text: row.text || "",
      createdAt: row.createdAt?.toISOString() || null,
      media: (row.media || []) as any[],
      sender: {
        id: row.senderTwitterId,
        username: senderData.username || null,
        name: senderData.name || null,
        profileImageUrl: senderData.profileImageUrl || null,
      },
    };
  });
}

function filterPayloadToConversation(payload: any, convoDigits: string): any {
  if (!payload?.data) return payload;
  const filtered = (payload.data as any[]).filter((event: any) => {
    const id = String(
      event?.dm_conversation_id || event?.dm_conversation_id_str || ""
    ).trim().replace(/^g/i, "");
    return id === convoDigits;
  });
  return { ...payload, data: filtered };
}

function normalizeDmEvents(payload: any) {
  const usersById = new Map<string, any>();
  for (const row of Array.isArray(payload?.includes?.users) ? payload.includes.users : []) {
    if (row?.id) usersById.set(String(row.id), row);
  }

  const mediaByKey = new Map<string, any>();
  for (const m of Array.isArray(payload?.includes?.media) ? payload.includes.media : []) {
    if (m?.media_key) mediaByKey.set(m.media_key, m);
  }

  return (Array.isArray(payload?.data) ? payload.data : [])
    .map((event: any) => {
      const senderId = String(event?.sender_id || event?.sender_id_str || "");
      const sender = usersById.get(senderId) || null;
      const text =
        event?.text ||
        event?.message_create?.message_data?.text ||
        event?.dm_event_data?.text ||
        "";

      const mediaKeys: string[] = Array.isArray(event?.attachments?.media_keys)
        ? event.attachments.media_keys
        : [];
      const media = mediaKeys
        .map((key: string) => mediaByKey.get(key))
        .filter(Boolean)
        .map((m: any) => {
          const variants: any[] = Array.isArray(m.variants) ? m.variants : [];
          const mp4 = variants
            .filter((v: any) => v.content_type === "video/mp4" && v.url)
            .sort((a: any, b: any) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0));
          const bestVariant = mp4[0]?.url || null;

          const isPlayable = m.type === "animated_gif" || m.type === "video";
          return {
            type: m.type || "photo",
            url: isPlayable ? (bestVariant || m.url || null) : (m.url || null),
            previewUrl: m.preview_image_url || null,
            videoUrl: isPlayable ? bestVariant : null,
            width: typeof m.width === "number" ? m.width : null,
            height: typeof m.height === "number" ? m.height : null,
            altText: m.alt_text || null,
          };
        });

      return {
        id: String(event?.id || ""),
        eventType: String(event?.event_type || event?.type || "message"),
        text: String(text || ""),
        createdAt: event?.created_at || event?.created_timestamp || null,
        media,
        sender: sender
          ? {
              id: String(sender.id),
              username: sender.username || null,
              name: sender.name || null,
              profileImageUrl: sender.profile_image_url || null,
            }
          : { id: senderId || null, username: null, name: null, profileImageUrl: null },
      };
    })
    .filter((event: any) => event.id && (event.text || event.media.length > 0));
}

function normalizeDmConversations(payload: any) {
  const usersById = new Map<string, any>();
  for (const row of Array.isArray(payload?.includes?.users) ? payload.includes.users : []) {
    if (row?.id) usersById.set(String(row.id), row);
  }

  return (Array.isArray(payload?.data) ? payload.data : [])
    .map((conversation: any) => {
      const participantIds = Array.isArray(conversation?.participant_ids)
        ? conversation.participant_ids.map((id: unknown) => String(id))
        : [];
      const participants = participantIds.map((id: string) => {
        const user = usersById.get(id);
        return {
          id,
          username: user?.username || null,
          name: user?.name || null,
          profileImageUrl: user?.profile_image_url || null,
        };
      });
      return {
        id: String(conversation?.id || conversation?.dm_conversation_id || ""),
        type: conversation?.dm_conversation_type || conversation?.type || null,
        name: conversation?.name || conversation?.title || null,
        createdAt: conversation?.created_at || null,
        participantCount: participantIds.length,
        participants,
      };
    })
    .filter((conversation: any) => conversation.id);
}

function mergeConversationParticipants(target: Set<string>, ids: unknown) {
  if (!Array.isArray(ids)) return;
  for (const id of ids) {
    const normalized = String(id || "").trim();
    if (isDigits(normalized)) target.add(normalized);
  }
}

function normalizeDmConversationsFromEvents(payload: any) {
  const usersById = new Map<string, any>();
  for (const row of Array.isArray(payload?.includes?.users) ? payload.includes.users : []) {
    if (row?.id) usersById.set(String(row.id), row);
  }

  const byConversation = new Map<
    string,
    {
      id: string;
      createdAt: string | null;
      participantIds: Set<string>;
    }
  >();

  for (const event of Array.isArray(payload?.data) ? payload.data : []) {
    const conversationId = String(
      event?.dm_conversation_id ||
        event?.dm_conversation_id_str ||
        event?.dm_event_data?.dm_conversation_id ||
        ""
    ).trim();
    if (!isDmConversationId(conversationId)) continue;

    const existing =
      byConversation.get(conversationId) ||
      {
        id: conversationId,
        createdAt: event?.created_at || null,
        participantIds: new Set<string>(),
      };

    mergeConversationParticipants(existing.participantIds, event?.participant_ids);
    const senderId = String(event?.sender_id || event?.sender_id_str || "").trim();
    if (isDigits(senderId)) existing.participantIds.add(senderId);

    if (event?.created_at && (!existing.createdAt || event.created_at > existing.createdAt)) {
      existing.createdAt = event.created_at;
    }
    byConversation.set(conversationId, existing);
  }

  return Array.from(byConversation.values()).map((conversation) => {
    const participantIds = Array.from(conversation.participantIds);
    const participants = participantIds.map((id) => {
      const user = usersById.get(id);
      return {
        id,
        username: user?.username || null,
        name: user?.name || null,
        profileImageUrl: user?.profile_image_url || null,
      };
    });
    const classification = classifyDmConversation({
      conversationId: conversation.id,
      participantIds,
      participantCount: participantIds.length,
    });
    return {
      id: conversation.id,
      type: classification.type,
      name: null,
      createdAt: conversation.createdAt,
      participantCount: classification.participantCount,
      participants,
    };
  });
}

function dmEventsQuery(maxResults: number, paginationToken?: string) {
  const query = new URLSearchParams({
    max_results: String(Math.max(10, Math.min(maxResults, 100))),
    "dm_event.fields": "created_at,dm_conversation_id,event_type,participant_ids,sender_id,text,attachments",
    expansions: "sender_id,participant_ids,attachments.media_keys",
    "user.fields": "name,username,profile_image_url",
    "media.fields": "media_key,type,url,preview_image_url,variants,height,width,alt_text",
  });
  if (paginationToken) query.set("pagination_token", paginationToken);
  return query;
}

// Cache /users/me result for the platform token to avoid redundant API calls.
let _platformMeCache: { id: string; expiresAt: number } | null = null;
async function resolveTokenOwnerId(accessToken: string, fallback: string): Promise<string> {
  if (_platformMeCache && _platformMeCache.expiresAt > Date.now()) {
    return _platformMeCache.id;
  }
  try {
    const me = await xOAuth2Request({ method: "GET", path: "/users/me", accessToken });
    const id = String(me?.data?.id || "");
    if (id) {
      _platformMeCache = { id, expiresAt: Date.now() + 10 * 60_000 };
      return id;
    }
  } catch { /* fall through */ }
  return fallback;
}

const X_DM_CACHE_PREFIX = "w.x_dm_conversations.";

async function loadCachedXConversationIds(twitterId: string): Promise<string[]> {
  const key = `${X_DM_CACHE_PREFIX}${twitterId}`;
  const row = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key))
    .then((rows) => rows[0]);
  if (!row?.value) return [];
  try {
    const ids = JSON.parse(row.value);
    return Array.isArray(ids) ? ids.filter((id: any) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

async function persistXConversationIds(twitterId: string, conversationIds: string[]) {
  const key = `${X_DM_CACHE_PREFIX}${twitterId}`;
  const existingIds = await loadCachedXConversationIds(twitterId);
  const byNormalizedId = new Map<string, string>();
  for (const id of [...existingIds, ...conversationIds].filter(isDmConversationId)) {
    byNormalizedId.set(normalizeDmConversationId(id), id);
  }
  const value = JSON.stringify(Array.from(byNormalizedId.values()).slice(0, 250));
  await db
    .insert(platformSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

async function userCanReadCachedDmConversation(tokenOwnerId: string, conversationId: string): Promise<boolean> {
  if (!isDigits(tokenOwnerId) || !isDmConversationId(conversationId)) return false;
  const cachedIds = await loadCachedXConversationIds(tokenOwnerId);
  if (cachedIds.some((cachedId) => sameDmConversationId(cachedId, conversationId))) return true;

  const convoDigits = normalizeDmConversationId(conversationId);
  const [ownedEvent] = await db
    .select({ eventId: xDmEvents.eventId })
    .from(xDmEvents)
    .where(
      and(
        eq(xDmEvents.fetchedByTokenOwner, tokenOwnerId),
        sql`REPLACE(LOWER(${xDmEvents.conversationId}), 'g', '') = ${convoDigits}`
      )
    )
    .limit(1);
  return Boolean(ownedEvent);
}

async function fetchDmConversationList(accessToken: string, maxResults = 50, persistTokenOwnerId = "") {
  const conversations = new Map<string, ReturnType<typeof normalizeDmConversationsFromEvents>[number]>();
  let nextToken = "";

  for (let page = 0; page < 3; page += 1) {
    let payload: any;
    try {
      payload = await xOAuth2Request({
        method: "GET",
        path: `/dm_events?${dmEventsQuery(maxResults, nextToken).toString()}`,
        accessToken,
      });
      if (persistTokenOwnerId) {
        await syncDmEventsFromPayload(payload, persistTokenOwnerId).catch((err) => {
          console.warn("[w] failed to persist user DM inbox payload:", err);
        });
      }
    } catch (err: any) {
      if (page === 0) throw err;
      break;
    }
    for (const conversation of normalizeDmConversationsFromEvents(payload)) {
      const existing = conversations.get(conversation.id);
      if (!existing) {
        conversations.set(conversation.id, conversation);
        continue;
      }
      const participantsById = new Map(
        [...existing.participants, ...conversation.participants].map((participant: any) => [
          participant.id,
          participant,
        ])
      );
      existing.participants = Array.from(participantsById.values());
      const classification = classifyDmConversation({
        ...existing,
        participantCount: existing.participants.length,
      });
      existing.participantCount = classification.participantCount;
      existing.type = classification.type;
      if (conversation.createdAt && (!existing.createdAt || conversation.createdAt > existing.createdAt)) {
        existing.createdAt = conversation.createdAt;
      }
    }
    nextToken = String(payload?.meta?.next_token || "");
    if (!nextToken || conversations.size >= maxResults) break;
  }

  return Array.from(conversations.values())
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, maxResults);
}

function xDmReadFailurePayload(err: any, fallback: string) {
  const upstreamStatus = Number(err?.status || 0);
  const upstreamPath = typeof err?.path === "string" ? err.path : null;
  const upstreamBody = typeof err?.bodyText === "string" ? err.bodyText.slice(0, 1000) : undefined;
  const error =
    upstreamStatus === 404
      ? "X did not expose the Direct Messages endpoint for your token. Go to Settings and reconnect with the Full W participation (messages) tier."
      : upstreamStatus === 401
        ? "Your X connection has expired. Go to Settings and reconnect with the Full W participation (messages) tier."
        : upstreamStatus === 402
          ? "X Pay-Per-Use billing issue. The DM endpoints require paid credits — check your app billing at console.x.com."
          : upstreamStatus === 403
            ? "X rejected DM access for your account. Go to Settings and reconnect with the Full W participation (messages) tier to grant dm.read + dm.write."
            : upstreamStatus === 429
              ? "X is rate-limiting DM lookups. Try again in a few minutes — W will throttle automatically."
              : fallback;
  return {
    error,
    upstreamStatus: upstreamStatus || null,
    upstreamPath,
    upstreamBody,
    rateLimitedUntil: Number(err?.rateLimitedUntil) || null,
  };
}

function xDmReadFailureStatus(err: any) {
  const upstreamStatus = Number(err?.status || 0);
  if (upstreamStatus === 401 || upstreamStatus === 403) return 403;
  if (upstreamStatus === 402) return 402;
  if (upstreamStatus === 404) return 424;
  if (upstreamStatus === 429) return 429;
  if (upstreamStatus >= 500) return 502;
  return upstreamStatus || 500;
}

function sendPersonalDmDisabled(res: any) {
  return res.status(410).json({
    error:
      "Personal X DMs are disabled in W. W now supports only the configured WTF Gameshow groupchat mirror and explicit user-authorized groupchat sends.",
    policy: "w_groupchat_only",
  });
}

/**
 * Convert a thrown 429 from a DM read into a 200 with `rateLimitedUntil` so
 * the React Query client throttles instead of error-looping. Returns true if
 * it handled the response (caller should not write further), false otherwise.
 */
function trySendSoft429(res: any, err: any, payload: Record<string, unknown>): boolean {
  if (Number(err?.status) !== 429) return false;
  const rateLimitedUntil = Number(err?.rateLimitedUntil) || Date.now() + 15 * 60_000;
  res.status(200).json({
    ...payload,
    rateLimitedUntil,
    diagnostics: {
      message: formatRateLimitMessage(rateLimitedUntil, false),
      rateLimited: true,
    },
  });
  return true;
}

function isGroupDmConversation(conversation: {
  id?: string | null;
  type?: string | null;
  participantCount?: number;
  participants?: unknown[];
}): boolean {
  return classifyDmConversation(conversation).isGroup;
}

function isMessageRequestConversation(
  conversation: {
    type?: string | null;
    participantCount?: number | null;
    peers?: { twitterId?: string | null }[] | null;
    participants?: { id?: string | null }[] | null;
  },
  viewerTwitterId: string
) {
  if (String(conversation?.type || "") === "group") return false;
  const participantCount = Number(conversation?.participantCount);
  if (!Number.isFinite(participantCount) || participantCount > 1) return false;
  const peerIds = Array.isArray(conversation.peers)
    ? conversation.peers.map((peer) => String(peer?.twitterId || "").trim()).filter(isDigits)
    : Array.isArray(conversation.participants)
      ? conversation.participants.map((participant) => String(participant?.id || "").trim()).filter(isDigits)
      : [];
  return isDigits(viewerTwitterId) ? !peerIds.includes(viewerTwitterId) : true;
}

async function connectedWtfUsersByTwitterId(twitterIds: string[]) {
  const ids = Array.from(new Set(twitterIds.filter(isDigits)));
  if (ids.length === 0) return new Map<string, ConnectedWtfUser>();

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      twitterId: users.twitterId,
      twitterHandle: users.twitterHandle,
    })
    .from(users)
    .where(
      and(
        inArray(users.twitterId, ids),
        eq(users.twitterVerified, true),
        isNotNull(users.twitterOauth2AccessToken)
      )
    );

  return selectUniqueConnectedWtfUsersByTwitterId(rows);
}

async function enrichConversation(conversation: any, viewerTwitterId: string) {
  const participantIds = (conversation.participants || [])
    .map((participant: any) => String(participant?.id || ""))
    .filter(isDigits);

  const [convoMeta] = await db
    .select({
      conversationType: xDmConversations.conversationType,
      participantIds: xDmConversations.participantIds,
    })
    .from(xDmConversations)
    .where(eq(xDmConversations.conversationId, conversation.id))
    .limit(1);
  const dbParticipantIds = Array.isArray(convoMeta?.participantIds)
    ? convoMeta.participantIds.map((id: unknown) => String(id)).filter(isDigits)
    : [];
  const mergedParticipantIds = Array.from(new Set([...dbParticipantIds, ...participantIds]));
  const oneToOneIds = oneToOneParticipantIdsFromConversationId(conversation.id);
  if (
    mergedParticipantIds.length < 2 &&
    oneToOneIds.includes(viewerTwitterId) &&
    mergedParticipantIds.includes(viewerTwitterId)
  ) {
    for (const pid of oneToOneIds) {
      if (!mergedParticipantIds.includes(pid)) mergedParticipantIds.push(pid);
    }
  }

  const peerIds = mergedParticipantIds.filter((id: string) => id !== viewerTwitterId);
  const peersByTwitterId = peerIds.length > 0
    ? await connectedWtfUsersByTwitterId(peerIds)
    : new Map<string, any>();
  const storedParticipants = peerIds.length > 0
    ? await db.select().from(xDmParticipants).where(inArray(xDmParticipants.twitterId, peerIds))
    : [];
  const storedParticipantsByTwitterId = new Map(storedParticipants.map((p) => [p.twitterId, p]));

  const participantsLookup = new Map<string, any>(
    (conversation.participants || []).map((p: any) => [String(p?.id || ""), p])
  );

  const classification = classifyDmConversation({
    id: conversation.id,
    type: conversation.type,
    conversationType: convoMeta?.conversationType,
    participants: conversation.participants,
    participantIds: mergedParticipantIds,
    participantCount: mergedParticipantIds.length,
  });
  if (!classification.isGroup && classification.participantCount < 2) return null;

  return {
    id: conversation.id,
    type: classification.type,
    name: conversation.name,
    createdAt: conversation.createdAt,
    participantCount: classification.participantCount,
    peers: peerIds.map((twitterId: string) => {
      const wtfUser = peersByTwitterId.get(twitterId);
      const xParticipant = participantsLookup.get(twitterId);
      const storedParticipant = storedParticipantsByTwitterId.get(twitterId);
      return {
        userId: wtfUser?.id ?? null,
        username: wtfUser?.username ?? null,
        displayName: wtfUser?.displayName ?? null,
        twitterId,
        twitterHandle: wtfUser?.twitterHandle ?? xParticipant?.username ?? storedParticipant?.username ?? null,
        xUsername: xParticipant?.username ?? storedParticipant?.username ?? null,
        xName: xParticipant?.name ?? storedParticipant?.displayName ?? null,
        isWtfUser: Boolean(wtfUser),
      };
    }),
  };
}

async function fetchDmConversationSummary(accessToken: string, conversationId: string) {
  const payload = await xOAuth2Request({
    method: "GET",
    path: `/dm_conversations/${encodeURIComponent(conversationId)}/dm_events?${dmEventsQuery(100).toString()}`,
    accessToken,
  });
  return normalizeDmConversationsFromEvents(payload).find(
    (conversation) => sameDmConversationId(conversation.id, conversationId)
  ) || null;
}

async function fetchDmConversationWithParticipant(accessToken: string, participantId: string) {
  const payload = await xOAuth2Request({
    method: "GET",
    path: `/dm_conversations/with/${encodeURIComponent(participantId)}/dm_events?${dmEventsQuery(100).toString()}`,
    accessToken,
  });
  return normalizeDmConversationsFromEvents(payload)[0] || null;
}

export async function canUseWAdminControls(user: any): Promise<boolean> {
  if (!user?.role) return false;
  return (
    (await hasPermission(user.role, "access_admin_panel")) &&
    (await hasPermission(user.role, "manage_roles"))
  );
}

// X's DM lookup endpoints are heavily rate-limited (often 1 req / 15 min on
// PPU/Basic). We cache by (token-hash, conversationId) and surface
// `rateLimitedUntil` to the client so polling can back off.
const GROUPCHAT_FRESH_TTL_MS = Math.max(
  60_000,
  Number(process.env.W_GROUPCHAT_CACHE_MS || 60_000)
);
const GROUPCHAT_STALE_TTL_MS = 4 * 60 * 60_000; // 4 hours stale OK for public mirror - credit efficient

function cacheKeyForAccessToken(accessToken: string): string {
  // Use a short, stable digest so we don't store the bearer in the cache key
  // and so the same upstream token shares a single cached payload across
  // viewers.
  let hash = 0;
  for (let i = 0; i < accessToken.length; i++) {
    hash = (hash * 31 + accessToken.charCodeAt(i)) | 0;
  }
  return `t${(hash >>> 0).toString(36)}`;
}

async function fetchGameshowGroupchat(accessToken: string | null, conversationId: string, maxResults = 50) {
  if (!conversationId) {
    return {
      configured: false,
      conversationId: null,
      conversation: null,
      messages: [],
      diagnostics: {
        message: "Select at least one X group DM conversation for W to mirror.",
      },
      rateLimitedUntil: null as number | null,
      cachedAt: Date.now(),
    };
  }

  const cap = Math.max(10, Math.min(maxResults, 100));
  const tokenKey = accessToken ? cacheKeyForAccessToken(accessToken) : "db-only";
  const cacheKey = dmCacheKey(["groupchat", tokenKey, conversationId, cap]);

  type GroupchatPayload = {
    summary: any;
    messages: any[];
  };

  const convoDigits = conversationId.replace(/^g/i, "");

  // DB-first: always check persisted events before touching in-memory cache or X API.
  // The dm-sync background worker keeps this populated; the route never needs a live call.
  const dbResult = await loadGroupchatFromDb(conversationId, cap);
  if (dbResult && dbResult.messages && dbResult.messages.length > 0) {
    setCachedDmRead(cacheKey, dbResult);
    return {
      configured: true,
      conversationId,
      conversation: dbResult.summary,
      messages: dbResult.messages,
      diagnostics: null,
      rateLimitedUntil: getRateLimitedUntil(cacheKey),
      cachedAt: Date.now(),
    };
  }

  // DB empty — try in-memory cache, then X API bootstrap (first-run only)
  const result = await readDmThroughCache<GroupchatPayload>({
    key: cacheKey,
    ttlMs: GROUPCHAT_FRESH_TTL_MS,
    staleTtlMs: GROUPCHAT_STALE_TTL_MS,
    loader: async () => {
      if (!accessToken) {
        return { summary: null, messages: [] };
      }

      const query = new URLSearchParams({
        max_results: String(cap),
        "dm_event.fields": "created_at,dm_conversation_id,event_type,participant_ids,sender_id,text,attachments",
        expansions: "sender_id,participant_ids,attachments.media_keys",
        "user.fields": "name,username,profile_image_url",
        "media.fields": "media_key,type,url,preview_image_url,variants,height,width,alt_text",
      });

      const payload = await xOAuth2Request({
        method: "GET",
        path: `/dm_conversations/${encodeURIComponent(conversationId)}/dm_events?${query.toString()}`,
        accessToken,
      });

      const summary =
        normalizeDmConversationsFromEvents(payload).find(
          (c) => c.id.replace(/^g/i, "") === convoDigits
        ) || null;
      const messages = normalizeDmEvents(payload);
      return { summary, messages };
    },
  });

  const summary = result.payload.summary;
  if (!summary || !isGroupDmConversation(summary)) {
    return {
      configured: false,
      conversationId,
      conversation: summary,
      messages: [],
      diagnostics: {
        message:
          accessToken
            ? "The configured X DM conversation is not a group conversation visible to the WTF Gameshow account. W will not mirror it."
            : "No cached groupchat data is available and the platform X token is unavailable. W will show cached messages again once sync has data or the token is restored.",
      },
      rateLimitedUntil: result.rateLimitedUntil,
      cachedAt: result.cachedAt,
    };
  }

  return {
    configured: true,
    conversationId,
    conversation: summary,
    messages: result.payload.messages,
    diagnostics: result.rateLimitedUntil
      ? {
          message: formatRateLimitMessage(result.rateLimitedUntil, true),
          rateLimited: true,
        }
      : null,
    rateLimitedUntil: result.rateLimitedUntil,
    cachedAt: result.cachedAt,
  };
}

function formatRateLimitMessage(rateLimitedUntil: number, hasCachedData: boolean): string {
  const seconds = Math.max(1, Math.round((rateLimitedUntil - Date.now()) / 1000));
  const minutes = Math.ceil(seconds / 60);
  const human = seconds < 90 ? `${seconds}s` : `${minutes}m`;
  return hasCachedData
    ? `X DM lookup is rate-limited; showing cached messages. Auto-resumes in ~${human}.`
    : `X DM lookup is rate-limited. Try again in ~${human}.`;
}

async function fetchGameshowGroupchats(accessToken: string | null, maxResults = 50) {
  const conversationIds = await dmConversationIds();
  if (conversationIds.length === 0) {
    return [
      await fetchGameshowGroupchat(accessToken, "", maxResults),
    ];
  }
  return Promise.all(
    conversationIds.map((conversationId) =>
      fetchGameshowGroupchat(accessToken, conversationId, maxResults)
    )
  );
}

export function registerWMessageRoutes(router: Router): void {
// Comprehensive DM diagnostics for troubleshooting 500/403/402 errors
router.get("/api/w/dm-diagnostics", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!(await canUseWAdminControls(user))) {
      return res.status(403).json({ error: "Only gameshow admins can access DM diagnostics" });
    }

    const platformStatus = await getPlatformXOAuth2Status();
    const groupchatIds = await dmConversationIds();
    const diagnostics: any = {
      platform: platformStatus,
      groupchatIds,
      xaa: getXaaGroupchatStatus(),
      xUsage: await getXUsageBudgetStatus(),
      env: {
        hasDefaultHandle: Boolean(process.env.W_X_DEFAULT_ACCOUNT_HANDLE),
        hasEncryptedToken: Boolean(process.env.W_X_DEFAULT_ACCOUNT_OAUTH2_ACCESS_TOKEN),
        hasRawToken: Boolean(process.env.W_X_DEFAULT_ACCOUNT_ACCESS_TOKEN),
        hasXOAuth2AccessToken: Boolean(process.env.X_OAUTH2_ACCESS_TOKEN),
        hasXOAuth2RefreshToken: Boolean(process.env.X_OAUTH2_REFRESH_TOKEN),
        hasXActivityBearer: Boolean(
          process.env.X_ACTIVITY_BEARER_TOKEN ||
          process.env.X_BEARER_TOKEN ||
          process.env.TWITTER_BEARER_TOKEN
        ),
        hasXaaUserIds: Boolean(
          process.env.W_XAA_GROUPCHAT_USER_IDS ||
          process.env.W_X_DEFAULT_ACCOUNT_USER_ID ||
          process.env.W_X_DEFAULT_ACCOUNT_HANDLE
        ),
        hasGameshowDmId: Boolean(
          process.env.W_X_GAMESHOW_DM_CONVERSATION_ID ||
          process.env.W_X_GAMESHOW_DM_CONVERSATION_IDS
        ),
        tokenSource: platformStatus.source || "none",
      },
      tests: {},
    };

    // Test platform token with a lightweight call
    if (platformStatus.token) {
      try {
        const testPayload = await xOAuth2Request({
          method: "GET",
          path: "/users/me?user.fields=name,username",
          accessToken: platformStatus.token,
        });
        diagnostics.tests.platformToken = { ok: true, username: testPayload?.data?.username };
      } catch (err: any) {
        diagnostics.tests.platformToken = {
          ok: false,
          error: xOAuthErrorMessage(err, "Platform token test failed"),
          status: err?.status,
        };
      }

      diagnostics.tests.personalDmEndpoint = {
        ok: true,
        disabled: true,
        policy: "w_groupchat_only",
      };
    }

    // Test specific groupchat if configured
    if (groupchatIds.length > 0 && platformStatus.token) {
      for (const conversationId of groupchatIds) {
        try {
          const summary = await fetchDmConversationSummary(platformStatus.token, conversationId);
          diagnostics.tests[`groupchat_${conversationId}`] = {
            ok: Boolean(summary),
            isGroup: summary ? isGroupDmConversation(summary) : false,
            participantCount: summary?.participantCount || 0,
          };
        } catch (err: any) {
          diagnostics.tests[`groupchat_${conversationId}`] = {
            ok: false,
            error: xDmReadFailurePayload(err, "Groupchat test failed"),
            status: err?.status,
          };
        }
      }
    }

    emitWDiagnosticsViewed(user.id, {
      groupchatCount: groupchatIds.length,
      platformStatus: diagnostics.platformStatus,
      testKeys: Object.keys(diagnostics.tests || {}),
    });
    res.json(diagnostics);
  } catch (err: any) {
    console.error("[w] dm diagnostics failed:", err);
    res.status(500).json({
      error: "DM diagnostics failed",
      details: String(err?.message || err),
    });
  }
});

router.get("/api/w/groupchat", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    const platformStatus = await getPlatformXOAuth2Status();
    // Force DB-first for public mirror - empty token string triggers cached path in fetchGameshowGroupchats
    const chats = await fetchGameshowGroupchats("", Number(req.query.limit || 50));
    const primary = chats.find((chat) => chat.configured) || chats[0] || null;
    const userCanWrite = Boolean(await getUserXOAuth2AccessToken(user, ["dm.write"]));
    const rateLimitedUntil = chats.reduce<number | null>((latest, chat) => {
      const value = (chat as any).rateLimitedUntil ?? null;
      if (value === null) return latest;
      if (latest === null) return value;
      return Math.max(latest, value);
    }, null);
    emitWMessageEvent({
      eventType: "w.groupchat.viewed",
      userId: user.id,
      rawRefType: "w_groupchat",
      rawRefId: primary?.conversationId || null,
      metadata: {
        chatCount: chats.length,
        configuredCount: chats.filter((chat: any) => Boolean(chat?.configured)).length,
        messageCount: Number((primary as any)?.messages?.length || 0),
        readonly: !userCanWrite,
        rateLimited: Boolean(rateLimitedUntil),
      },
    });
    res.json({
      ...(primary || { configured: false, conversationId: null, messages: [], diagnostics: null }),
      chats,
      readonly: !userCanWrite,
      canWrite: userCanWrite,
      defaultAccountHandle: process.env.W_X_DEFAULT_ACCOUNT_HANDLE || "wtf_gameshow",
      rateLimitedUntil,
      diagnostics: {
        ...((primary as any)?.diagnostics || {}),
        platform: {
          tokenUnavailable: !platformStatus.token,
          reason: platformStatus.reason || null,
          handle: platformStatus.handle || null,
          source: platformStatus.source,
        },
        note: "Public gameshow groupchat served from DB cache for all users. Personal X inboxes are disabled in W.",
      },
    });
  } catch (err: any) {
    console.error("[w] groupchat fetch failed:", err);
    // 429 with no cached payload: respond 200 + rateLimitedUntil so the
    // client throttles instead of treating it as a hard error and looping.
    if (
      trySendSoft429(res, err, {
        configured: false,
        conversationId: null,
        messages: [],
        chats: [],
        readonly: true,
        canWrite: false,
      })
    ) {
      return;
    }
    res
      .status(xDmReadFailureStatus(err))
      .json(xDmReadFailurePayload(err, "Failed to load groupchat"));
  }
});

router.get("/api/w/admin/dm-conversations", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!(await canUseWAdminControls(user))) {
      return res.status(403).json({ error: "Only gameshow admins can inspect platform X DMs" });
    }

    const currentConversationIds = await dmConversationIds();
    const configuredConversations: any[] = [];
    for (const conversationId of currentConversationIds) {
      const cached = await loadGroupchatFromDb(conversationId, 1);
      if (cached?.summary) configuredConversations.push(cached.summary);
    }
    res.json({
      currentConversationId: currentConversationIds[0] || null,
      currentConversationIds,
      conversations: configuredConversations.filter(isGroupDmConversation),
      directConversations: [],
      totalDiscovered: configuredConversations.length,
      diagnostics:
        "W admin shows only configured gameshow groupchat IDs from local DB/cache. Broad X DM discovery is disabled.",
    });
  } catch (err: any) {
    console.error("[w] dm conversation list failed:", err);
    res
      .status(xDmReadFailureStatus(err))
      .json(xDmReadFailurePayload(err, "Failed to load X DM conversations"));
  }
});

router.put("/api/w/admin/groupchat", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!(await canUseWAdminControls(user))) {
      return res.status(403).json({ error: "Only gameshow admins can select gameshow groupchats" });
    }

    if (!user.twitterOauth2AccessToken || !user.twitterVerified) {
      return res.status(403).json({
        error: "Admins must connect X OAuth2 before selecting W groupchats",
      });
    }

    const requestedIds = Array.isArray(req.body?.conversationIds)
      ? req.body.conversationIds
      : [req.body?.conversationId];
    const conversationIds: string[] = Array.from(
      new Set(requestedIds.map((id: unknown) => String(id || "").trim()).filter(isDmConversationId))
    );
    if (conversationIds.length === 0) {
      return res.status(400).json({ error: "At least one valid X DM conversation id is required" });
    }

    const accessToken = await getPlatformXOAuth2AccessToken();
    if (!accessToken) {
      return res.status(500).json({
        error: "Default WTF Gameshow X account OAuth2 token is not configured",
      });
    }

    const summaries = [];
    for (const conversationId of conversationIds) {
      const summary = await fetchDmConversationSummary(accessToken, conversationId);
      if (!summary || !isGroupDmConversation(summary)) {
        return res.status(400).json({
          error: "Only group DM conversations can be selected as W groupchats",
        });
      }
      summaries.push(summary);
    }

    await setSettingValue(W_GAMESHOW_DM_SETTING_KEY, JSON.stringify(conversationIds), user.id);
    res.json({
      ok: true,
      conversationId: conversationIds[0] || null,
      conversationIds,
      conversations: summaries,
    });
  } catch (err: any) {
    console.error("[w] groupchat selection failed:", err);
    res
      .status(xDmReadFailureStatus(err))
      .json(xDmReadFailurePayload(err, "Failed to save gameshow groupchat selection"));
  }
});

router.get("/api/w/admin/stream-rules", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!(await canUseWAdminControls(user))) {
      return res.status(403).json({ error: "Only gameshow admins can manage W timeline stream rules" });
    }

    const sources = await loadStreamRuleHandleSources();
    const handles = sources.handles;
    const bearer = await getTimelineStreamBearer();

    let managedRulesOnX: Array<{ id: string; value: string; tag?: string }> = [];
    let xRulesError: string | null = null;

    if (bearer) {
      try {
        managedRulesOnX = await listManagedStreamRules(bearer);
      } catch (e: any) {
        xRulesError = e?.message ? String(e.message) : String(e);
      }
    } else {
      xRulesError = "Configure X_BEARER_TOKEN/TWITTER_BEARER_TOKEN or platform OAuth2 — required for filtered stream.";
    }

    res.json({
      handles,
      manifestHandles: sources.settingsHandles,
      handleSources: {
        eligibleCount: sources.eligibleHandles.length,
        fileCount: sources.fileHandles.length,
        manifestCount: sources.settingsHandles.length,
        settingsCount: sources.settingsHandles.length,
        skippedEligibleHandles: sources.skippedEligibleHandles,
        filePath: sources.filePath,
        fileMissing: sources.fileMissing,
        fileError: sources.fileError,
      },
      managedRulesOnX,
      ...(xRulesError ? { xRulesError } : {}),
    });
  } catch (err: any) {
    console.error("[w] admin stream-rules get failed:", err);
    res.status(500).json({ error: "Failed to load stream rules" });
  }
});

router.put("/api/w/admin/stream-rules", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!(await canUseWAdminControls(user))) {
      return res.status(403).json({ error: "Only gameshow admins can manage W timeline stream rules" });
    }

    const requestedHandles = Array.isArray(req.body?.handles)
      ? req.body.handles
      : String(req.body?.handles || "").split(/[,\s]+/);
    const manifestHandles = normalizeStreamHandles(
      requestedHandles.map((handle: unknown) => String(handle || ""))
    );

    await setSettingValue(W_STREAM_RULE_HANDLES_KEY, JSON.stringify(manifestHandles), user.id);

    const sources = await loadStreamRuleHandleSources();
    const normalized = sources.handles;
    if (normalized.length === 0) {
      return res.status(400).json({ error: "No verified WTF user X handles or server allowlist handles are available for stream rules" });
    }

    const bearer = await getTimelineStreamBearer();
    if (!bearer) {
      return res.status(500).json({
        error: "No bearer or platform OAuth token for X filtered stream APIs",
      });
    }

    const syncResult = await syncStreamRulesToX(bearer, normalized);
    requestTimelineStreamReconnect();

    emitWMessageEvent({
      eventType: "w.admin.stream_rule.updated",
      userId: user.id,
      rawRefType: "w_stream_rules",
      rawRefId: W_STREAM_RULE_HANDLES_KEY,
      metadata: {
        handleCount: normalized.length,
        skippedHandleCount: sources.skippedEligibleHandles,
        deletedRuleCount: syncResult.deleted,
        addedRuleCount: syncResult.added,
        xRuleSkippedHandleCount: syncResult.skippedHandles,
        handleFilePath: sources.filePath,
        handleFileCount: sources.fileHandles.length,
        manifestHandleCount: sources.settingsHandles.length,
      },
    });
    res.json({
      ok: true,
      handles: normalized,
      manifestHandles: sources.settingsHandles,
      skippedHandles: syncResult.skippedHandles,
      handleSources: {
        eligibleCount: sources.eligibleHandles.length,
        fileCount: sources.fileHandles.length,
        manifestCount: sources.settingsHandles.length,
        settingsCount: sources.settingsHandles.length,
        skippedEligibleHandles: sources.skippedEligibleHandles,
        filePath: sources.filePath,
        fileMissing: sources.fileMissing,
        fileError: sources.fileError,
      },
      deletedRules: syncResult.deleted,
      addedRules: syncResult.added,
    });
  } catch (err: any) {
    console.error("[w] admin stream-rules put failed:", err);
    res.status(Number(err?.status) || 500).json({
      error: String(err?.message || err || "Failed to sync stream rules"),
    });
  }
});

router.get("/api/w/admin/stream-status", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as any;
    if (!(await canUseWAdminControls(user))) {
      return res.status(403).json({ error: "Only gameshow admins can view timeline stream status" });
    }

    const bearerConfigured = Boolean(await getTimelineStreamBearer());
    res.json({
      bearerConfigured,
      ...(getTimelineStreamStatus() as Record<string, unknown>),
    });
  } catch (err: any) {
    console.error("[w] admin stream-status failed:", err);
    res.status(500).json({ error: "Failed to load stream status" });
  }
});

router.post("/api/w/groupchat/messages", isAuthenticated, async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    const mediaId = String(req.body?.mediaId || "").trim() || undefined;
    if (!text) return res.status(400).json({ error: "Message text is required" });
    if (text.length > 1000) return res.status(400).json({ error: "Message text is too long" });
    if (mediaId && !isDigits(mediaId)) return res.status(400).json({ error: "Invalid mediaId" });

    const configuredIds = await dmConversationIds();
    const requestedConversationId = String(req.body?.conversationId || "").trim();
    const conversationId =
      requestedConversationId && configuredIds.includes(requestedConversationId)
        ? requestedConversationId
        : configuredIds[0] || "";
    if (!conversationId) {
      return res.status(500).json({ error: "No W groupchat is configured" });
    }
    if (requestedConversationId && !configuredIds.includes(requestedConversationId)) {
      return res.status(403).json({ error: "That X groupchat is not visible in W" });
    }

    const user = req.user as any;
    const ownedMediaId = await requireOwnedWMediaId(user.id, mediaId);
    const accessToken = await getUserXOAuth2AccessToken(user, ["dm.write"]);
    if (!accessToken) {
      const hasToken = Boolean(user?.twitterOauth2AccessToken);
      const storedScopes = String(user?.twitterOauth2Scopes || "");
      const hasDmWrite = storedScopes.split(/[\s,]+/).includes("dm.write");
      console.warn(
        `[w] groupchat send 403: wtfUser=${user?.id}(${user?.username}) ` +
        `hasToken=${hasToken} scopes="${storedScopes}" hasDmWrite=${hasDmWrite}`
      );
      return res.status(403).json({
        error: !hasToken
          ? "Connect X with the Full W participation (messages) tier in Settings to send groupchat messages."
          : !hasDmWrite
            ? `Your X connection is missing dm.write scope (current: ${storedScopes || "none"}). Go to Settings → Connect X, select "Full W participation" tier, and reconnect.`
            : "Your X token may have expired. Go to Settings → Connect X → Full W participation and reconnect.",
      });
    }

    console.log(
      `[w] groupchat send: wtfUser=${user.id}(${user.username}) xAccount=@${user.twitterHandle}(${user.twitterId}) convo=${conversationId} textLen=${text.length}`
    );

    const budget = await canUseXFeature("groupchat_dm_writes", 1);
    if (!budget.allowed) {
      return res.status(429).json({
        error: "W groupchat writes are paused because the monthly X write budget is exhausted.",
        reason: budget.reason,
        budget: budget.state,
      });
    }

    const result = await xOAuth2Request({
      method: "POST",
      path: `/dm_conversations/${encodeURIComponent(conversationId)}/messages`,
      accessToken,
      body: {
        text,
        ...(ownedMediaId ? { attachments: [{ media_id: ownedMediaId }] } : {}),
      },
    });
    await recordXFeatureUsage("groupchat_dm_writes", 1);
    clearDmCacheByPrefix("groupchat::");
    emitWMessageEvent({
      eventType: "w.groupchat.message_sent",
      userId: user.id,
      rawRefType: "w_groupchat_message",
      rawRefId: conversationId,
      metadata: {
        conversationId,
        mediaAttached: Boolean(ownedMediaId),
      },
    });
    res.status(201).json({ ok: true, result });
  } catch (err: any) {
    console.error("[w] groupchat send failed:", err);
    res.status(xDmReadFailureStatus(err)).json(xDmReadFailurePayload(err, "Failed to send groupchat message"));
  }
});

router.get("/api/w/user-dms", isAuthenticated, async (_req, res) => {
  return sendPersonalDmDisabled(res);
});

router.get("/api/w/user-dms/:conversationId/messages", isAuthenticated, async (_req, res) => {
  return sendPersonalDmDisabled(res);
});

router.post("/api/w/user-dms/:conversationId/messages", isAuthenticated, async (_req, res) => {
  return sendPersonalDmDisabled(res);
});

router.post("/api/w/user-dms/direct", isAuthenticated, async (_req, res) => {
  return sendPersonalDmDisabled(res);
});

router.post("/api/w/direct-messages", isAuthenticated, async (_req, res) => {
  return sendPersonalDmDisabled(res);
});

}
