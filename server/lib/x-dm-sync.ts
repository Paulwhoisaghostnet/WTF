/**
 * X DM Sync — background job that persists DM events from X API to the
 * database so reads survive server restarts and reduce API cost.
 *
 * Groupchat-only strategy:
 *
 * Pivot 1 — Conversation Discovery (per token owner)
 *   Platform token reads configured groupchat conversation IDs directly.
 * Personal inbox/user DM sync is intentionally disabled. W only syncs the
 * configured WTF Gameshow groupchat conversation IDs and reads/writes those
 * through explicit user action where required.
 */

import { eq, sql, desc, and } from "drizzle-orm";
import { db } from "../db";
import {
  xDmEvents,
  xDmConversations,
  xDmParticipants,
  platformSettings,
  users,
} from "@shared/schema";
import { classifyDmConversation } from "@shared/x-dm";
import {
  getPlatformXOAuth2Status,
  getUserXOAuth2AccessToken,
  xOAuth2Request,
  rateLimitResetEpochSecondsFromError,
} from "./x-oauth2";
import { register, type JobResult } from "./scheduler";
import { logSystemEvent } from "./system-log";

const GROUPCHAT_SYNC_INTERVAL_MS = Math.max(
  5 * 60_000,
  Number(process.env.W_X_GROUPCHAT_SYNC_INTERVAL_MS || 60 * 60_000)
);
const SETTINGS_KEY_PREFIX = "w.dm_sync_cursor";

const DEFAULT_W_GAMESHOW_DM_CONVERSATION_ID = "g1934373363226407162";

// ── Global DM-endpoint rate-limit circuit breaker ───────────────────
// When ANY DM call returns 429, we record the reset time and ALL sync
// jobs skip until that window passes. X DM endpoints share a per-app
// rate bucket, so one 429 means the whole bucket is drained.
let dmRateLimitedUntil = 0;
let dmApiCallCount = 0;

function isDmRateLimited(): boolean {
  return Date.now() < dmRateLimitedUntil;
}

function recordDmRateLimit(err: any): void {
  const resetEpoch = rateLimitResetEpochSecondsFromError(err);
  const resetMs = resetEpoch ? resetEpoch * 1000 : Date.now() + 15 * 60_000;
  dmRateLimitedUntil = Math.max(dmRateLimitedUntil, resetMs);
  const cooldownSec = Math.round((dmRateLimitedUntil - Date.now()) / 1000);
  logSystemEvent({
    source: "x-dm-sync",
    eventType: "dm_rate_limited",
    severity: "warn",
    message: `DM API rate-limited, all sync paused for ${cooldownSec}s (${dmApiCallCount} calls this cycle)`,
    metadata: {
      resetAt: new Date(dmRateLimitedUntil).toISOString(),
      cooldownSeconds: cooldownSec,
      apiCallsThisCycle: dmApiCallCount,
    },
  });
}

function logAuthError(label: string, err: any, userId?: number | null): void {
  const status = Number(err?.status || 0);
  if (status === 429) return;
  logSystemEvent({
    source: "x-dm-sync",
    eventType: "dm_auth_error",
    severity: "error",
    message: `${label}: HTTP ${status}`,
    userId: userId ?? null,
    statusCode: status,
    metadata: {
      path: err?.path || null,
      payload: err?.payload || null,
      bodyText: typeof err?.bodyText === "string" ? err.bodyText.slice(0, 500) : null,
    },
  });
}

function trackDmApiCall(): void {
  dmApiCallCount++;
}

async function getSyncCursor(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, key));
  return row?.value || null;
}

async function setSyncCursor(key: string, value: string): Promise<void> {
  await db
    .insert(platformSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: platformSettings.key,
      set: { value, updatedAt: sql`NOW()` },
    });
}

function dmEventsQuery(maxResults: number, opts?: { sinceId?: string | null; paginationToken?: string | null }): URLSearchParams {
  const params = new URLSearchParams({
    max_results: String(Math.max(10, Math.min(maxResults, 100))),
    "dm_event.fields": "created_at,dm_conversation_id,event_type,participant_ids,sender_id,text,attachments",
    expansions: "sender_id,participant_ids,attachments.media_keys",
    "user.fields": "name,username,profile_image_url",
    "media.fields": "media_key,type,url,preview_image_url,variants,height,width,alt_text",
  });
  if (opts?.sinceId) params.set("since_id", opts.sinceId);
  if (opts?.paginationToken) params.set("pagination_token", opts.paginationToken);
  return params;
}

type SyncResult = { eventsStored: number; conversationsUpdated: number };

function parseEventsFromPayload(payload: any) {
  const events = Array.isArray(payload?.data) ? payload.data : [];
  const usersById = new Map<string, any>();
  for (const u of Array.isArray(payload?.includes?.users) ? payload.includes.users : []) {
    if (u?.id) usersById.set(String(u.id), u);
  }
  const mediaByKey = new Map<string, any>();
  for (const m of Array.isArray(payload?.includes?.media) ? payload.includes.media : []) {
    if (m?.media_key) mediaByKey.set(m.media_key, m);
  }
  return { events, usersById, mediaByKey };
}

function oneToOneParticipantIdsFromConversationId(value: string | null | undefined): string[] {
  const id = String(value || "").trim();
  return /^\d+-\d+$/.test(id) ? id.split("-").filter((part) => /^\d+$/.test(part)) : [];
}

function buildEventRow(event: any, usersById: Map<string, any>, mediaByKey: Map<string, any>, tokenOwnerId: string) {
  const eventId = String(event?.id || "");
  if (!eventId) return null;

  const conversationId = String(event?.dm_conversation_id || "").trim();
  const senderTwitterId = String(event?.sender_id || "").trim();
  const text = event?.text || "";
  const createdAt = event?.created_at || null;

  const mediaKeys: string[] = Array.isArray(event?.attachments?.media_keys) ? event.attachments.media_keys : [];
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
        width: m.width ?? null,
        height: m.height ?? null,
        altText: m.alt_text || null,
      };
    });

  const sender = usersById.get(senderTwitterId);
  const senderData = sender
    ? { id: sender.id, username: sender.username, name: sender.name, profileImageUrl: sender.profile_image_url }
    : { id: senderTwitterId };

  if (!createdAt || (!text && media.length === 0)) return null;

  return {
    eventId,
    conversationId,
    senderTwitterId,
    eventType: String(event?.event_type || "MessageCreate"),
    text: text || null,
    media: media as any,
    senderData: senderData as any,
    createdAt: new Date(createdAt),
    fetchedByTokenOwner: tokenOwnerId,
  };
}

function extractConversationMeta(events: any[], tokenOwnerId = "") {
  const map = new Map<string, { participantIds: Set<string>; lastEventId: string; lastEventAt: string }>();
  for (const event of events) {
    const conversationId = String(event?.dm_conversation_id || "").trim();
    if (!conversationId) continue;
    const senderTwitterId = String(event?.sender_id || "").trim();
    const createdAt = event?.created_at || "";
    const eventId = String(event?.id || "");

    const existing = map.get(conversationId) || {
      participantIds: new Set<string>(),
      lastEventId: eventId,
      lastEventAt: createdAt,
    };
    if (senderTwitterId) existing.participantIds.add(senderTwitterId);
    const pIds = Array.isArray(event?.participant_ids) ? event.participant_ids : [];
    for (const pid of pIds) {
      const id = String(pid).trim();
      if (/^\d+$/.test(id)) existing.participantIds.add(id);
    }
    const oneToOneIds = oneToOneParticipantIdsFromConversationId(conversationId);
    if (
      oneToOneIds.includes(tokenOwnerId) &&
      senderTwitterId === tokenOwnerId &&
      existing.participantIds.size < 2
    ) {
      for (const pid of oneToOneIds) existing.participantIds.add(pid);
    }
    if (createdAt && createdAt > existing.lastEventAt) {
      existing.lastEventAt = createdAt;
      existing.lastEventId = eventId;
    }
    map.set(conversationId, existing);
  }
  return map;
}

async function upsertConversationMeta(conversationMap: Map<string, { participantIds: Set<string>; lastEventId: string; lastEventAt: string }>) {
  for (const [conversationId, meta] of conversationMap.entries()) {
    const participantIds = Array.from(meta.participantIds);
    const convoType = classifyDmConversation({ conversationId, participantIds }).type;
    await db
      .insert(xDmConversations)
      .values({
        conversationId,
        conversationType: convoType,
        participantIds: participantIds as any,
        lastEventId: meta.lastEventId,
        lastEventAt: meta.lastEventAt ? new Date(meta.lastEventAt) : null,
      })
      .onConflictDoUpdate({
        target: xDmConversations.conversationId,
        set: {
          participantIds: sql`CASE WHEN COALESCE(jsonb_array_length(${xDmConversations.participantIds}), 0) < ${participantIds.length} THEN ${JSON.stringify(participantIds)}::jsonb ELSE ${xDmConversations.participantIds} END`,
          conversationType: sql`CASE WHEN ${xDmConversations.conversationType} = 'group' OR COALESCE(jsonb_array_length(${xDmConversations.participantIds}), 0) >= 3 OR ${convoType} = 'group' THEN 'group' ELSE 'direct' END`,
          lastEventId: sql`CASE WHEN ${xDmConversations.lastEventAt} IS NULL OR ${xDmConversations.lastEventAt} < ${meta.lastEventAt ? new Date(meta.lastEventAt).toISOString() : new Date(0).toISOString()}::timestamp THEN ${meta.lastEventId} ELSE ${xDmConversations.lastEventId} END`,
          lastEventAt: sql`GREATEST(${xDmConversations.lastEventAt}, ${meta.lastEventAt ? new Date(meta.lastEventAt).toISOString() : null}::timestamp)`,
          fetchedAt: sql`NOW()`,
        },
      });
  }
}

async function upsertParticipants(usersById: Map<string, any>) {
  const rows: Array<typeof xDmParticipants.$inferInsert> = [];
  for (const [id, user] of usersById.entries()) {
    rows.push({
      twitterId: id,
      username: user.username || null,
      displayName: user.name || null,
      profileImageUrl: user.profile_image_url || null,
    });
  }
  if (rows.length > 0) {
    await db
      .insert(xDmParticipants)
      .values(rows)
      .onConflictDoUpdate({
        target: xDmParticipants.twitterId,
        set: {
          username: sql`EXCLUDED.username`,
          displayName: sql`EXCLUDED.display_name`,
          profileImageUrl: sql`EXCLUDED.profile_image_url`,
          updatedAt: sql`NOW()`,
        },
      });
  }
}

// kept for the routes that still call syncDmEventsFromPayload
export async function syncDmEventsFromPayload(
  payload: any,
  tokenOwnerId: string
): Promise<SyncResult> {
  const { events, usersById, mediaByKey } = parseEventsFromPayload(payload);
  if (events.length === 0) return { eventsStored: 0, conversationsUpdated: 0 };

  const eventRows: Array<typeof xDmEvents.$inferInsert> = [];
  for (const event of events) {
    const row = buildEventRow(event, usersById, mediaByKey, tokenOwnerId);
    if (row) eventRows.push(row);
  }

  if (eventRows.length > 0) {
    await db.insert(xDmEvents).values(eventRows).onConflictDoNothing();
  }

  const conversationMap = extractConversationMeta(events, tokenOwnerId);
  await upsertConversationMeta(conversationMap);
  await upsertParticipants(usersById);

  return { eventsStored: eventRows.length, conversationsUpdated: conversationMap.size };
}

// ---------------------------------------------------------------------------
// Pivot 1A — Platform groupchat sync
// Uses platform token. Fetches per designated conversation ID so we never
// store events from Paul's private DMs.
// ---------------------------------------------------------------------------

function normalizeConversationId(value: string): string {
  return value.replace(/^g/i, "");
}

export async function getDesignatedGroupchatIds(): Promise<string[]> {
  const rows = await db
    .select({ key: platformSettings.key, value: platformSettings.value })
    .from(platformSettings)
    .where(sql`${platformSettings.key} IN ('w.gameshow_dm_conversation_ids', 'w.gameshow_dm_conversation_id')`);
  const configured =
    rows.find((row) => row.key === "w.gameshow_dm_conversation_ids")?.value ||
    rows.find((row) => row.key === "w.gameshow_dm_conversation_id")?.value ||
    "";
  const fromEnv =
    process.env.W_X_GAMESHOW_DM_CONVERSATION_IDS ||
    process.env.W_X_GAMESHOW_DM_CONVERSATION_ID ||
    DEFAULT_W_GAMESHOW_DM_CONVERSATION_ID;
  const raw = configured || fromEnv;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch { /* legacy format */ }
  return raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
}

async function syncGroupchat(conversationIds?: string[]): Promise<SyncResult> {
  if (isDmRateLimited()) return { eventsStored: 0, conversationsUpdated: 0 };

  const platformStatus = await getPlatformXOAuth2Status();
  if (!platformStatus.token) return { eventsStored: 0, conversationsUpdated: 0 };

  const groupchatIds = conversationIds ?? await getDesignatedGroupchatIds();
  if (groupchatIds.length === 0) return { eventsStored: 0, conversationsUpdated: 0 };

  let totalEvents = 0;
  let totalConvos = 0;

  for (const conversationId of groupchatIds) {
    if (isDmRateLimited()) break;

    const cursorKey = `${SETTINGS_KEY_PREFIX}.groupchat.${conversationId}`;
    const sinceId = await getSyncCursor(cursorKey);

    const query = dmEventsQuery(100, { sinceId });
    let payload: any;
    try {
      trackDmApiCall();
      payload = await xOAuth2Request({
        method: "GET",
        path: `/dm_conversations/${encodeURIComponent(conversationId)}/dm_events?${query.toString()}`,
        accessToken: platformStatus.token,
      });
    } catch (err: any) {
      if (Number(err?.status) === 429) {
        recordDmRateLimit(err);
        break;
      }
      logAuthError(`groupchat ${conversationId}`, err);
      continue;
    }

    const result = await syncDmEventsFromPayload(payload, "platform");
    totalEvents += result.eventsStored;
    totalConvos += result.conversationsUpdated;

    const events = Array.isArray(payload?.data) ? payload.data : [];
    if (events.length > 0) {
      const newestId = String(events[0]?.id || "");
      if (newestId) await setSyncCursor(cursorKey, newestId);
    }
  }

  return { eventsStored: totalEvents, conversationsUpdated: totalConvos };
}

export async function syncConfiguredGroupchatsFromActivity(reason = "xaa"): Promise<SyncResult> {
  dmApiCallCount = 0;
  const result = await syncGroupchat();
  if (result.eventsStored > 0 || result.conversationsUpdated > 0) {
    console.log(
      `[dm-sync] ${reason}: ${result.eventsStored} events, ${result.conversationsUpdated} conversations (${dmApiCallCount} API calls)`
    );
  }
  return result;
}

export async function syncConfiguredGroupchatFromActivity(
  conversationId: string,
  reason = "xaa"
): Promise<SyncResult & { skipped?: string }> {
  const configured = await getDesignatedGroupchatIds();
  const wanted = normalizeConversationId(conversationId);
  const match = configured.find((id) => normalizeConversationId(id) === wanted);
  if (!match) {
    return { eventsStored: 0, conversationsUpdated: 0, skipped: "not_configured_groupchat" };
  }
  dmApiCallCount = 0;
  const result = await syncGroupchat([match]);
  if (result.eventsStored > 0 || result.conversationsUpdated > 0) {
    console.log(
      `[dm-sync] ${reason}: ${result.eventsStored} events, ${result.conversationsUpdated} conversations (${dmApiCallCount} API calls)`
    );
  }
  return result;
}

// ---------------------------------------------------------------------------
// Pivot 1B — User conversation discovery + event sync
// Uses each connected user's own token. Stores ALL their events.
// ---------------------------------------------------------------------------

async function getConnectedDmUsers() {
  const rows = await db
    .select({
      id: users.id,
      twitterId: users.twitterId,
      twitterHandle: users.twitterHandle,
      twitterOauth2AccessToken: users.twitterOauth2AccessToken,
      twitterOauth2RefreshToken: users.twitterOauth2RefreshToken,
      twitterOauth2ExpiresAt: users.twitterOauth2ExpiresAt,
      twitterOauth2Scopes: users.twitterOauth2Scopes,
    })
    .from(users)
    .where(
      and(
        sql`${users.twitterId} IS NOT NULL`,
        sql`${users.twitterOauth2AccessToken} IS NOT NULL`,
        sql`${users.twitterVerified} = true`
      )
    );

  return rows.filter(r => {
    const scopes = String(r.twitterOauth2Scopes || "").split(/[\s,]+/);
    return scopes.includes("dm.read") && r.twitterId;
  }).map(r => ({
    ...r,
    twitterId: r.twitterId!,
  }));
}

async function syncUserDms(): Promise<SyncResult> {
  if (isDmRateLimited()) return { eventsStored: 0, conversationsUpdated: 0 };

  const dmUsers = await getConnectedDmUsers();
  if (dmUsers.length === 0) return { eventsStored: 0, conversationsUpdated: 0 };

  let totalEvents = 0;
  let totalConvos = 0;

  for (const dmUser of dmUsers) {
    if (isDmRateLimited()) break;

    const accessToken = await getUserXOAuth2AccessToken(dmUser, ["dm.read"]);
    if (!accessToken) {
      logSystemEvent({
        source: "x-dm-sync",
        eventType: "user_token_unavailable",
        severity: "warn",
        message: `No valid token for @${dmUser.twitterHandle || dmUser.twitterId}, skipping sync`,
        userId: dmUser.id,
        metadata: { twitterHandle: dmUser.twitterHandle, twitterId: dmUser.twitterId },
      });
      continue;
    }

    const cursorKey = `${SETTINGS_KEY_PREFIX}.user.${dmUser.twitterId}`;
    const sinceId = await getSyncCursor(cursorKey);

    const query = dmEventsQuery(100, { sinceId });
    let payload: any;
    try {
      trackDmApiCall();
      payload = await xOAuth2Request({
        method: "GET",
        path: `/dm_events?${query.toString()}`,
        accessToken,
      });
    } catch (err: any) {
      if (Number(err?.status) === 429) {
        recordDmRateLimit(err);
        break;
      }
      logAuthError(`user @${dmUser.twitterHandle || dmUser.twitterId}`, err, dmUser.id);
      continue;
    }

    const result = await syncDmEventsFromPayload(payload, dmUser.twitterId);
    totalEvents += result.eventsStored;
    totalConvos += result.conversationsUpdated;

    const events = Array.isArray(payload?.data) ? payload.data : [];
    if (events.length > 0) {
      const newestId = String(events[0]?.id || "");
      if (newestId) await setSyncCursor(cursorKey, newestId);
    }
  }

  return { eventsStored: totalEvents, conversationsUpdated: totalConvos };
}

// ---------------------------------------------------------------------------
// Pivot 2 — Backfill older events for known conversations
// Walks backwards via pagination_token until we reach the floor date.
// ---------------------------------------------------------------------------

async function getOldestEventDate(conversationId: string): Promise<Date | null> {
  const convoDigits = conversationId.replace(/^g/i, "");
  const [row] = await db
    .select({ createdAt: xDmEvents.createdAt })
    .from(xDmEvents)
    .where(sql`REPLACE(LOWER(${xDmEvents.conversationId}), 'g', '') = ${convoDigits}`)
    .orderBy(xDmEvents.createdAt)
    .limit(1);
  return row?.createdAt || null;
}

async function backfillConversation(
  conversationId: string,
  accessToken: string,
  tokenOwnerId: string,
  floorDate: Date
): Promise<number> {
  if (isDmRateLimited()) return 0;

  const oldest = await getOldestEventDate(conversationId);
  if (oldest && oldest <= floorDate) return 0;

  let totalStored = 0;
  let paginationToken: string | null = null;
  const maxPages = 5;

  for (let page = 0; page < maxPages; page++) {
    if (isDmRateLimited()) break;

    const query = dmEventsQuery(100, { paginationToken });
    let payload: any;
    try {
      trackDmApiCall();
      payload = await xOAuth2Request({
        method: "GET",
        path: `/dm_conversations/${encodeURIComponent(conversationId)}/dm_events?${query.toString()}`,
        accessToken,
      });
    } catch (err: any) {
      if (Number(err?.status) === 429) {
        recordDmRateLimit(err);
        break;
      }
      logAuthError(`backfill ${conversationId} page ${page}`, err);
      break;
    }

    const result = await syncDmEventsFromPayload(payload, tokenOwnerId);
    totalStored += result.eventsStored;

    const events = Array.isArray(payload?.data) ? payload.data : [];
    if (events.length > 0) {
      const oldestInPage = events[events.length - 1]?.created_at;
      if (oldestInPage && new Date(oldestInPage) <= floorDate) break;
    }

    paginationToken = payload?.meta?.next_token || null;
    if (!paginationToken) break;
  }

  return totalStored;
}

async function runBackfill(): Promise<SyncResult> {
  return { eventsStored: 0, conversationsUpdated: 0 };
}

// ---------------------------------------------------------------------------
// Exported runners + registration
// ---------------------------------------------------------------------------

export async function runDmSync(): Promise<JobResult | void> {
  dmApiCallCount = 0;
  if (isDmRateLimited()) {
    const sec = Math.round((dmRateLimitedUntil - Date.now()) / 1000);
    console.log(`[dm-sync] groupchat: rate-limited, ${sec}s remaining`);
    return { itemsIn: 0, itemsOut: 0 };
  }
  try {
    const gcResult = await syncGroupchat();
    if (gcResult.eventsStored > 0 || gcResult.conversationsUpdated > 0) {
      console.log(`[dm-sync] groupchat: ${gcResult.eventsStored} events, ${gcResult.conversationsUpdated} conversations (${dmApiCallCount} API calls)`);
    }
    return {
      itemsIn: gcResult.eventsStored + gcResult.conversationsUpdated,
      itemsOut: gcResult.eventsStored,
    } satisfies JobResult;
  } catch (err) {
    console.error("[dm-sync] groupchat sync failed:", err);
    return { itemsIn: 0, itemsOut: 0 };
  }
}

export async function runUserDmSync(): Promise<JobResult | void> {
  return { itemsIn: 0, itemsOut: 0, cursorAfter: { skipped: "personal_dm_sync_disabled" } };
}

export async function runDmBackfill(): Promise<JobResult | void> {
  return { itemsIn: 0, itemsOut: 0, cursorAfter: { skipped: "dm_backfill_disabled" } };
}

export function registerDmSync(): void {
  register({
    name: "x-dm-sync-groupchat",
    fn: runDmSync,
    intervalMs: GROUPCHAT_SYNC_INTERVAL_MS,
    initialDelayMs: 15_000,
  });

  console.log("[dm-sync] personal DM sync/backfill disabled; only configured gameshow groupchat sync is registered");
}
