/**
 * X DM Sync — background job that persists DM events from X API to the
 * database so reads survive server restarts and reduce API cost.
 *
 * Sync strategy:
 * - Platform groupchat: every 3 minutes using platform token
 * - User inboxes: every 15 minutes per connected user with dm.read
 *
 * Uses cursor-based pagination (since_id from last stored event) to
 * only fetch new events.
 */

import { eq, sql, desc, and, inArray } from "drizzle-orm";
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
const USER_DM_SYNC_INTERVAL_MS = 15 * 60_000;
const SETTINGS_KEY_PREFIX = "w.dm_sync_cursor";

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

function dmEventsQuery(maxResults: number, sinceId?: string | null): URLSearchParams {
  const params = new URLSearchParams({
    max_results: String(Math.max(10, Math.min(maxResults, 100))),
    "dm_event.fields": "created_at,dm_conversation_id,event_type,participant_ids,sender_id,text,attachments",
    expansions: "sender_id,participant_ids,attachments.media_keys",
    "user.fields": "name,username,profile_image_url",
    "media.fields": "media_key,type,url,preview_image_url,variants,height,width,alt_text",
  });
  if (sinceId) params.set("since_id", sinceId);
  return params;
}

type SyncResult = { eventsStored: number; conversationsUpdated: number };

async function syncDmEventsFromPayload(
  payload: any,
  tokenOwnerId: string
): Promise<SyncResult> {
  const events = Array.isArray(payload?.data) ? payload.data : [];
  if (events.length === 0) return { eventsStored: 0, conversationsUpdated: 0 };

  const usersById = new Map<string, any>();
  for (const u of Array.isArray(payload?.includes?.users) ? payload.includes.users : []) {
    if (u?.id) usersById.set(String(u.id), u);
  }

  const mediaByKey = new Map<string, any>();
  for (const m of Array.isArray(payload?.includes?.media) ? payload.includes.media : []) {
    if (m?.media_key) mediaByKey.set(m.media_key, m);
  }

  const conversationMap = new Map<string, { participantIds: Set<string>; lastEventId: string; lastEventAt: string }>();
  const eventRows: Array<typeof xDmEvents.$inferInsert> = [];

  for (const event of events) {
    const eventId = String(event?.id || "");
    if (!eventId) continue;

    const conversationId = String(
      event?.dm_conversation_id || event?.dm_conversation_id_str || ""
    ).trim();
    const senderTwitterId = String(event?.sender_id || event?.sender_id_str || "").trim();
    const text = event?.text || event?.message_create?.message_data?.text || "";
    const createdAt = event?.created_at || null;

    const mediaKeys: string[] = Array.isArray(event?.attachments?.media_keys)
      ? event.attachments.media_keys : [];
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

    if (createdAt && (text || media.length > 0)) {
      eventRows.push({
        eventId,
        conversationId,
        senderTwitterId,
        eventType: String(event?.event_type || "MessageCreate"),
        text: text || null,
        media: media as any,
        senderData: senderData as any,
        createdAt: new Date(createdAt),
        fetchedByTokenOwner: tokenOwnerId,
      });
    }

    if (conversationId) {
      const existing = conversationMap.get(conversationId) || {
        participantIds: new Set<string>(),
        lastEventId: eventId,
        lastEventAt: createdAt || "",
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
      conversationMap.set(conversationId, existing);
    }
  }

  if (eventRows.length > 0) {
    await db
      .insert(xDmEvents)
      .values(eventRows)
      .onConflictDoNothing();
  }

  for (const [conversationId, meta] of conversationMap.entries()) {
    const participantIds = Array.from(meta.participantIds);
    const convoType = participantIds.length >= 3 ? "group" : "direct";
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

  const participantUpserts: Array<typeof xDmParticipants.$inferInsert> = [];
  for (const [id, user] of usersById.entries()) {
    participantUpserts.push({
      twitterId: id,
      username: user.username || null,
      displayName: user.name || null,
      profileImageUrl: user.profile_image_url || null,
    });
  }
  if (participantUpserts.length > 0) {
    await db
      .insert(xDmParticipants)
      .values(participantUpserts)
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

  return { eventsStored: eventRows.length, conversationsUpdated: conversationMap.size };
}

async function getLastStoredEventId(conversationId?: string): Promise<string | null> {
  const conditions = conversationId
    ? [eq(xDmEvents.conversationId, conversationId)]
    : [];
  const [row] = await db
    .select({ eventId: xDmEvents.eventId })
    .from(xDmEvents)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(xDmEvents.createdAt))
    .limit(1);
  return row?.eventId || null;
}

async function syncGroupchat(): Promise<SyncResult> {
  const platformStatus = await getPlatformXOAuth2Status();
  if (!platformStatus.token) return { eventsStored: 0, conversationsUpdated: 0 };

  const settingKey = `${SETTINGS_KEY_PREFIX}.groupchat`;
  const sinceId = await getSyncCursor(settingKey) || await getLastStoredEventId();

  const query = dmEventsQuery(100, sinceId);
  let payload: any;
  try {
    payload = await xOAuth2Request({
      method: "GET",
      path: `/dm_events?${query.toString()}`,
      accessToken: platformStatus.token,
    });
  } catch (err: any) {
    if (Number(err?.status) === 429) {
      console.log("[dm-sync] groupchat sync rate-limited, skipping cycle");
      return { eventsStored: 0, conversationsUpdated: 0 };
    }
    throw err;
  }

  const result = await syncDmEventsFromPayload(payload, "platform");

  const events = Array.isArray(payload?.data) ? payload.data : [];
  if (events.length > 0) {
    const newestId = String(events[0]?.id || "");
    if (newestId) await setSyncCursor(settingKey, newestId);
  }

  return result;
}

export async function runDmSync(): Promise<JobResult | void> {
  try {
    const result = await syncGroupchat();
    console.log(`[dm-sync] groupchat: ${result.eventsStored} events stored, ${result.conversationsUpdated} conversations updated`);
    return {
      itemsIn: result.eventsStored + result.conversationsUpdated,
      itemsOut: result.eventsStored,
    } satisfies JobResult;
  } catch (err) {
    console.error("[dm-sync] failed:", err);
    return { itemsIn: 0, itemsOut: 0 };
  }
}

export function registerDmSync(): void {
  register({
    name: "x-dm-sync",
    fn: runDmSync,
    intervalMs: GROUPCHAT_SYNC_INTERVAL_MS,
    initialDelayMs: 15_000,
  });
}
