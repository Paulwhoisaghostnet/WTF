/**
 * X DM Sync — background job that persists DM events from X API to the
 * database so reads survive server restarts and reduce API cost.
 *
 * Two-pivot strategy:
 *
 * Pivot 1 — Conversation Discovery (per token owner)
 *   Platform token: bulk /dm_events discovers conversation IDs but only
 *   stores events for designated groupchat IDs. Other conversation metadata
 *   (IDs, participants, type) is stored but events are discarded to avoid
 *   leaking private DMs.
 *   User tokens: bulk /dm_events discovers conversation IDs and stores ALL
 *   events tagged with fetched_by_token_owner = user's twitter ID.
 *
 * Pivot 2 — Event Backfill (per known conversation)
 *   For each conversation, check the oldest stored event. If we don't have
 *   enough history (7 days for users, Jan 1 2026 for groupchat), paginate
 *   backwards to fill gaps. Runs during idle periods.
 *
 * Token isolation: platform token NEVER stores events for non-groupchat
 * conversations. User data is always tagged with user's twitter ID.
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
import {
  getPlatformXOAuth2Status,
  getUserXOAuth2AccessToken,
  xOAuth2Request,
} from "./x-oauth2";
import { register, type JobResult } from "./scheduler";

const GROUPCHAT_SYNC_INTERVAL_MS = 3 * 60_000;
const USER_SYNC_INTERVAL_MS = 60_000;
const BACKFILL_INTERVAL_MS = 5 * 60_000;
const SETTINGS_KEY_PREFIX = "w.dm_sync_cursor";

const GROUPCHAT_BACKFILL_FLOOR = new Date("2026-01-01T00:00:00Z");
const USER_BACKFILL_DAYS = 7;

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

function extractConversationMeta(events: any[]) {
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
    const convoType = participantIds.length > 2 ? "group" : "direct";
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
          conversationType: convoType,
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

  const conversationMap = extractConversationMeta(events);
  await upsertConversationMeta(conversationMap);
  await upsertParticipants(usersById);

  return { eventsStored: eventRows.length, conversationsUpdated: conversationMap.size };
}

// ---------------------------------------------------------------------------
// Pivot 1A — Platform groupchat sync
// Uses platform token. Fetches per designated conversation ID so we never
// store events from Paul's private DMs.
// ---------------------------------------------------------------------------

async function getDesignatedGroupchatIds(): Promise<string[]> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, "w.gameshow_dm_conversation_ids"));
  const configured = row?.value || "";
  const fromEnv =
    process.env.W_X_GAMESHOW_DM_CONVERSATION_IDS ||
    process.env.W_X_GAMESHOW_DM_CONVERSATION_ID || "";
  const raw = configured || fromEnv;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch { /* legacy format */ }
  return raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
}

async function syncGroupchat(): Promise<SyncResult> {
  const platformStatus = await getPlatformXOAuth2Status();
  if (!platformStatus.token) return { eventsStored: 0, conversationsUpdated: 0 };

  const groupchatIds = await getDesignatedGroupchatIds();
  if (groupchatIds.length === 0) return { eventsStored: 0, conversationsUpdated: 0 };

  let totalEvents = 0;
  let totalConvos = 0;

  for (const conversationId of groupchatIds) {
    const cursorKey = `${SETTINGS_KEY_PREFIX}.groupchat.${conversationId}`;
    const sinceId = await getSyncCursor(cursorKey);

    const query = dmEventsQuery(100, { sinceId });
    let payload: any;
    try {
      payload = await xOAuth2Request({
        method: "GET",
        path: `/dm_conversations/${encodeURIComponent(conversationId)}/dm_events?${query.toString()}`,
        accessToken: platformStatus.token,
      });
    } catch (err: any) {
      if ([401, 403].includes(Number(err?.status))) {
        // Conversation-specific endpoint failed, try bulk and filter
        try {
          const bulkQuery = dmEventsQuery(100, { sinceId });
          const bulkPayload = await xOAuth2Request({
            method: "GET",
            path: `/dm_events?${bulkQuery.toString()}`,
            accessToken: platformStatus.token,
          });
          // Filter to only this conversation's events
          const convoDigits = conversationId.replace(/^g/i, "");
          const filtered = (Array.isArray(bulkPayload?.data) ? bulkPayload.data : [])
            .filter((e: any) => {
              const eid = String(e?.dm_conversation_id || "").replace(/^g/i, "");
              return eid === convoDigits;
            });
          payload = { ...bulkPayload, data: filtered };
        } catch (bulkErr: any) {
          if (Number(bulkErr?.status) === 429) {
            console.log(`[dm-sync] groupchat ${conversationId} rate-limited, skipping`);
            continue;
          }
          throw bulkErr;
        }
      } else if (Number(err?.status) === 429) {
        console.log(`[dm-sync] groupchat ${conversationId} rate-limited, skipping`);
        continue;
      } else {
        console.error(`[dm-sync] groupchat ${conversationId} fetch failed:`, err?.status || err);
        continue;
      }
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

// ---------------------------------------------------------------------------
// Pivot 1B — User conversation discovery + event sync
// Uses each connected user's own token. Stores ALL their events.
// ---------------------------------------------------------------------------

async function getConnectedDmUsers(): Promise<Array<{ id: number; twitterId: string; twitterHandle: string | null; twitterOauth2AccessToken: string | null; twitterOauth2Scopes: string | null }>> {
  const rows = await db
    .select({
      id: users.id,
      twitterId: users.twitterId,
      twitterHandle: users.twitterHandle,
      twitterOauth2AccessToken: users.twitterOauth2AccessToken,
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
  const dmUsers = await getConnectedDmUsers();
  if (dmUsers.length === 0) return { eventsStored: 0, conversationsUpdated: 0 };

  let totalEvents = 0;
  let totalConvos = 0;

  for (const dmUser of dmUsers) {
    const userObj = { twitterOauth2AccessToken: dmUser.twitterOauth2AccessToken, twitterOauth2Scopes: dmUser.twitterOauth2Scopes } as any;
    const accessToken = await getUserXOAuth2AccessToken(userObj, ["dm.read"]);
    if (!accessToken) continue;

    const cursorKey = `${SETTINGS_KEY_PREFIX}.user.${dmUser.twitterId}`;
    const sinceId = await getSyncCursor(cursorKey);

    const query = dmEventsQuery(100, { sinceId });
    let payload: any;
    try {
      payload = await xOAuth2Request({
        method: "GET",
        path: `/dm_events?${query.toString()}`,
        accessToken,
      });
    } catch (err: any) {
      if (Number(err?.status) === 429) {
        console.log(`[dm-sync] user ${dmUser.twitterHandle || dmUser.twitterId} rate-limited, skipping`);
        continue;
      }
      console.error(`[dm-sync] user ${dmUser.twitterHandle || dmUser.twitterId} sync failed:`, err?.status || err);
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
  const oldest = await getOldestEventDate(conversationId);
  if (oldest && oldest <= floorDate) return 0;

  let totalStored = 0;
  let paginationToken: string | null = null;
  const maxPages = 5; // limit per backfill cycle to stay under rate limits

  for (let page = 0; page < maxPages; page++) {
    const query = dmEventsQuery(100, { paginationToken });
    let payload: any;
    try {
      payload = await xOAuth2Request({
        method: "GET",
        path: `/dm_conversations/${encodeURIComponent(conversationId)}/dm_events?${query.toString()}`,
        accessToken,
      });
    } catch (err: any) {
      if (Number(err?.status) === 429) {
        console.log(`[dm-sync] backfill ${conversationId} rate-limited at page ${page}`);
        break;
      }
      console.error(`[dm-sync] backfill ${conversationId} failed:`, err?.status || err);
      break;
    }

    const result = await syncDmEventsFromPayload(payload, tokenOwnerId);
    totalStored += result.eventsStored;

    // Check if we've reached the floor
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
  const platformStatus = await getPlatformXOAuth2Status();
  let totalEvents = 0;

  // Backfill designated groupchats using platform token
  if (platformStatus.token) {
    const groupchatIds = await getDesignatedGroupchatIds();
    for (const id of groupchatIds) {
      const stored = await backfillConversation(id, platformStatus.token, "platform", GROUPCHAT_BACKFILL_FLOOR);
      totalEvents += stored;
      if (stored > 0) console.log(`[dm-sync] backfill groupchat ${id}: ${stored} events`);
    }
  }

  // Backfill user conversations using their tokens
  const dmUsers = await getConnectedDmUsers();
  const userFloor = new Date(Date.now() - USER_BACKFILL_DAYS * 24 * 60 * 60 * 1000);

  for (const dmUser of dmUsers) {
    const userObj = { twitterOauth2AccessToken: dmUser.twitterOauth2AccessToken, twitterOauth2Scopes: dmUser.twitterOauth2Scopes } as any;
    const accessToken = await getUserXOAuth2AccessToken(userObj, ["dm.read"]);
    if (!accessToken) continue;

    // Get conversations this user has events for
    const userConvos = await db
      .select({ conversationId: xDmEvents.conversationId })
      .from(xDmEvents)
      .where(eq(xDmEvents.fetchedByTokenOwner, dmUser.twitterId))
      .groupBy(xDmEvents.conversationId)
      .limit(50);

    for (const { conversationId } of userConvos) {
      const stored = await backfillConversation(conversationId, accessToken, dmUser.twitterId, userFloor);
      totalEvents += stored;
      if (stored > 0) console.log(`[dm-sync] backfill user ${dmUser.twitterHandle || dmUser.twitterId} convo ${conversationId}: ${stored} events`);
    }
  }

  return { eventsStored: totalEvents, conversationsUpdated: 0 };
}

// ---------------------------------------------------------------------------
// Exported runners + registration
// ---------------------------------------------------------------------------

export async function runDmSync(): Promise<JobResult | void> {
  try {
    const gcResult = await syncGroupchat();
    console.log(`[dm-sync] groupchat: ${gcResult.eventsStored} events, ${gcResult.conversationsUpdated} conversations`);
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
  try {
    const result = await syncUserDms();
    if (result.eventsStored > 0 || result.conversationsUpdated > 0) {
      console.log(`[dm-sync] users: ${result.eventsStored} events, ${result.conversationsUpdated} conversations`);
    }
    return {
      itemsIn: result.eventsStored + result.conversationsUpdated,
      itemsOut: result.eventsStored,
    } satisfies JobResult;
  } catch (err) {
    console.error("[dm-sync] user sync failed:", err);
    return { itemsIn: 0, itemsOut: 0 };
  }
}

export async function runDmBackfill(): Promise<JobResult | void> {
  try {
    const result = await runBackfill();
    if (result.eventsStored > 0) {
      console.log(`[dm-sync] backfill: ${result.eventsStored} events stored`);
    }
    return { itemsIn: result.eventsStored, itemsOut: result.eventsStored } satisfies JobResult;
  } catch (err) {
    console.error("[dm-sync] backfill failed:", err);
    return { itemsIn: 0, itemsOut: 0 };
  }
}

export function registerDmSync(): void {
  register({
    name: "x-dm-sync-groupchat",
    fn: runDmSync,
    intervalMs: GROUPCHAT_SYNC_INTERVAL_MS,
    initialDelayMs: 15_000,
  });

  register({
    name: "x-dm-sync-users",
    fn: runUserDmSync,
    intervalMs: USER_SYNC_INTERVAL_MS,
    initialDelayMs: 30_000,
  });

  register({
    name: "x-dm-backfill",
    fn: runDmBackfill,
    intervalMs: BACKFILL_INTERVAL_MS,
    initialDelayMs: 60_000,
  });
}
