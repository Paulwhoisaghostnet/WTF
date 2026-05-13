/**
 * X Activity API bridge for W Gameshow chat.
 *
 * XAA does not replace the DM lookup API; it wakes us when an encrypted
 * XChat/DM event happens. We then hydrate only the configured Gameshow
 * groupchat conversation(s) through the existing x_dm_events cache path.
 */

import { logSystemEvent } from "./system-log";
import {
  getDesignatedGroupchatIds,
  syncConfiguredGroupchatFromActivity,
  syncConfiguredGroupchatsFromActivity,
} from "./x-dm-sync";

const X_API_BASE = (process.env.X_ACTIVITY_API_BASE || process.env.X_API_BASE_URL || "https://api.x.com/2").replace(/\/$/, "");
const CHAT_EVENT_TYPES = new Set(["chat.received", "chat.sent", "62", "63"]);
const SUBSCRIPTION_EVENT_TYPES = ["chat.received", "chat.sent"] as const;
const TAG_PREFIX = "wtf_groupchat_";
const KEEPALIVE_STALL_MS = Math.max(30_000, Number(process.env.W_XAA_KEEPALIVE_STALL_MS || 120_000));

let stopping = false;
let runPromise: Promise<void> | null = null;
let connectionAbort: AbortController | null = null;
let lastHydrateAt = 0;
const seenEventIds = new Set<string>();

const activityState = {
  enabled: false,
  connected: false,
  reconnecting: false,
  startedAt: null as number | null,
  lastConnectAt: null as number | null,
  lastEventAt: null as number | null,
  lastHydrateAt: null as number | null,
  lastSubscriptionSyncAt: null as number | null,
  eventsReceived: 0,
  chatEventsReceived: 0,
  hydrateRuns: 0,
  lastHydrateEventType: null as string | null,
  lastConversationIds: [] as string[],
  lastError: null as string | null,
  subscriptionCount: 0,
  backoffMs: 1000,
};

function isEnabled(): boolean {
  const raw = String(process.env.W_XAA_GROUPCHAT_ENABLED ?? "1").trim().toLowerCase();
  return !(raw === "0" || raw === "false" || raw === "no" || raw === "off");
}

function getBearer(): string | null {
  return (
    process.env.X_ACTIVITY_BEARER_TOKEN?.trim() ||
    process.env.X_BEARER_TOKEN?.trim() ||
    process.env.TWITTER_BEARER_TOKEN?.trim() ||
    null
  );
}

function getMaxBackoffMs(): number {
  return Math.max(1000, Math.min(300_000, Number(process.env.W_XAA_RECONNECT_MAX_MS || 64_000)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeConversationId(value: string): string {
  return String(value || "").trim().replace(/^g/i, "");
}

function normalizeUserIds(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,\s]+/)
        .map((id) => id.trim())
        .filter((id) => /^\d{1,19}$/.test(id))
    )
  ).sort();
}

function managedTag(eventType: string, userId: string): string {
  return `${TAG_PREFIX}${eventType.replace(/\W+/g, "_")}_${userId}`;
}

async function activityApiRequest(
  method: "GET" | "POST" | "DELETE",
  path: string,
  bearer: string,
  body?: unknown
): Promise<any> {
  const url = `${X_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text().catch(() => "");
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }
  if (!response.ok) {
    const err: any = new Error(
      `X Activity API ${response.status}: ${payload?.detail || payload?.title || payload?.error || text || response.statusText}`
    );
    err.status = response.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

export async function resolveXaaSubscriptionUserIds(bearer = getBearer()): Promise<string[]> {
  const explicit = normalizeUserIds(
    `${process.env.W_XAA_GROUPCHAT_USER_IDS || ""} ${process.env.W_X_DEFAULT_ACCOUNT_USER_ID || ""}`
  );
  if (explicit.length > 0 || !bearer) return explicit;

  const handle = String(process.env.W_X_DEFAULT_ACCOUNT_HANDLE || "").replace(/^@/, "").trim();
  if (!/^[a-zA-Z0-9_]{1,15}$/.test(handle)) return [];
  try {
    const payload = await activityApiRequest("GET", `/users/by/username/${encodeURIComponent(handle)}`, bearer);
    const id = String(payload?.data?.id || "").trim();
    return normalizeUserIds(id);
  } catch (err: any) {
    activityState.lastError = String(err?.message || err);
    return [];
  }
}

async function listSubscriptions(bearer: string): Promise<any[]> {
  const payload = await activityApiRequest("GET", "/activity/subscriptions?max_results=100", bearer);
  return Array.isArray(payload?.data) ? payload.data : [];
}

export async function syncXaaGroupchatSubscriptions(bearer = getBearer()): Promise<{
  ok: boolean;
  created: number;
  existing: number;
  skipped: string | null;
  userIds: string[];
}> {
  if (!bearer) return { ok: false, created: 0, existing: 0, skipped: "missing_bearer", userIds: [] };
  const userIds = await resolveXaaSubscriptionUserIds(bearer);
  if (userIds.length === 0) return { ok: false, created: 0, existing: 0, skipped: "missing_user_id", userIds };

  const subscriptions = await listSubscriptions(bearer);
  const existingTags = new Set(subscriptions.map((sub) => String(sub?.tag || "")));
  let created = 0;
  let existing = 0;

  for (const userId of userIds) {
    for (const eventType of SUBSCRIPTION_EVENT_TYPES) {
      const tag = managedTag(eventType, userId);
      if (existingTags.has(tag)) {
        existing++;
        continue;
      }
      await activityApiRequest("POST", "/activity/subscriptions", bearer, {
        event_type: eventType,
        filter: { user_id: userId },
        tag,
      });
      created++;
    }
  }

  activityState.subscriptionCount = existing + created;
  activityState.lastSubscriptionSyncAt = Date.now();
  return { ok: true, created, existing, skipped: null, userIds };
}

function collectStringValues(input: unknown, keys: Set<string>, output: Set<string>, depth = 0): void {
  if (!input || depth > 8) return;
  if (Array.isArray(input)) {
    for (const item of input) collectStringValues(item, keys, output, depth + 1);
    return;
  }
  if (typeof input !== "object") return;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const normalizedKey = key.replace(/[-_]/g, "").toLowerCase();
    if (keys.has(normalizedKey)) {
      if (typeof value === "string" || typeof value === "number") output.add(String(value));
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === "string" || typeof item === "number") output.add(String(item));
        }
      }
    }
    collectStringValues(value, keys, output, depth + 1);
  }
}

export function extractXaaConversationIds(event: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  collectStringValues(
    event,
    new Set(["conversationid", "dmconversationid", "groupid", "chatid"]),
    ids
  );
  return Array.from(ids).filter((id) => /^[gG]?\d{5,64}$/.test(id) || /^\d{1,19}-\d{1,19}$/.test(id));
}

function extractActivityEventId(event: Record<string, unknown>): string | null {
  const ids = new Set<string>();
  collectStringValues(event, new Set(["eventuuid", "eventid", "messageid", "id"]), ids);
  return Array.from(ids).sort()[0] || null;
}

function eventTypeOf(event: Record<string, unknown>): string {
  const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : event;
  return String(data.event_type || event.event_type || "").trim();
}

export async function handleXaaActivityEvent(event: Record<string, unknown>): Promise<{
  handled: boolean;
  hydrated: boolean;
  conversationIds: string[];
  reason?: string;
}> {
  const type = eventTypeOf(event);
  if (!CHAT_EVENT_TYPES.has(type)) return { handled: false, hydrated: false, conversationIds: [], reason: "not_chat_event" };

  const eventId = extractActivityEventId(event);
  if (eventId) {
    if (seenEventIds.has(eventId)) return { handled: true, hydrated: false, conversationIds: [], reason: "duplicate" };
    seenEventIds.add(eventId);
    const oldest = seenEventIds.values().next().value;
    if (seenEventIds.size > 500 && oldest) seenEventIds.delete(oldest);
  }

  activityState.chatEventsReceived++;
  activityState.lastEventAt = Date.now();
  activityState.lastHydrateEventType = type;

  const configured = (await getDesignatedGroupchatIds()).map(normalizeConversationId);
  const conversationIds = extractXaaConversationIds(event);
  activityState.lastConversationIds = conversationIds;

  const matched = conversationIds.filter((id) => configured.includes(normalizeConversationId(id)));
  if (conversationIds.length > 0 && matched.length === 0) {
    return { handled: true, hydrated: false, conversationIds, reason: "not_configured_groupchat" };
  }

  const minGapMs = Math.max(1000, Number(process.env.W_XAA_HYDRATE_MIN_GAP_MS || 5000));
  if (Date.now() - lastHydrateAt < minGapMs) {
    return { handled: true, hydrated: false, conversationIds, reason: "coalesced" };
  }
  lastHydrateAt = Date.now();
  activityState.hydrateRuns++;
  activityState.lastHydrateAt = Date.now();

  if (matched.length > 0) {
    for (const conversationId of matched) {
      await syncConfiguredGroupchatFromActivity(conversationId, "xaa");
    }
  } else {
    await syncConfiguredGroupchatsFromActivity("xaa");
  }

  return { handled: true, hydrated: true, conversationIds: matched.length > 0 ? matched : conversationIds };
}

async function consumeActivityStream(bearer: string): Promise<void> {
  const query = new URLSearchParams({ backfill_minutes: "0" });
  connectionAbort = new AbortController();
  const response = await fetch(`${X_API_BASE}/activity/stream?${query.toString()}`, {
    headers: { Authorization: `Bearer ${bearer}` },
    signal: connectionAbort.signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const err: any = new Error(`X Activity stream HTTP ${response.status}: ${text || response.statusText}`);
    err.status = response.status;
    throw err;
  }
  if (!response.body) throw new Error("X Activity stream response has no body");

  activityState.connected = true;
  activityState.reconnecting = false;
  activityState.lastConnectAt = Date.now();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastActivity = Date.now();
  const stallCheck = setInterval(() => {
    if (Date.now() - lastActivity > KEEPALIVE_STALL_MS) {
      console.warn("[xaa] no activity keepalive; reconnecting");
      signalReconnect();
    }
  }, 10_000);
  stallCheck.unref?.();

  try {
    while (!stopping) {
      const { done, value } = await reader.read();
      if (done) break;
      lastActivity = Date.now();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          if (Array.isArray(parsed.errors)) {
            activityState.lastError = JSON.stringify(parsed.errors);
            continue;
          }
          activityState.eventsReceived++;
          await handleXaaActivityEvent(parsed);
        } catch (err: any) {
          console.warn("[xaa] skipped activity line:", trimmed.slice(0, 200), err);
        }
      }
    }
  } finally {
    clearInterval(stallCheck);
    activityState.connected = false;
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

function signalReconnect(): void {
  try {
    connectionAbort?.abort();
  } catch {
    // ignore
  }
}

async function runActivityLoop(): Promise<void> {
  activityState.startedAt = Date.now();
  const maxBackoff = getMaxBackoffMs();
  while (!stopping) {
    const bearer = getBearer();
    if (!bearer) {
      activityState.lastError = "missing X_ACTIVITY_BEARER_TOKEN/X_BEARER_TOKEN";
      await sleep(60_000);
      continue;
    }
    try {
      await syncXaaGroupchatSubscriptions(bearer);
      activityState.backoffMs = 1000;
      activityState.lastError = null;
      activityState.reconnecting = true;
      await consumeActivityStream(bearer);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        if (stopping) break;
        await sleep(500);
        continue;
      }
      const msg = String(err?.message || err);
      activityState.lastError = msg;
      console.warn("[xaa]", msg);
      const status = Number(err?.status || 0);
      const mult = status >= 400 && status < 500 && status !== 429 ? 4 : 2;
      activityState.backoffMs = Math.min(maxBackoff, Math.max(1000, activityState.backoffMs * mult));
      await sleep(activityState.backoffMs);
    }
  }
  activityState.connected = false;
  activityState.reconnecting = false;
}

export function getXaaGroupchatStatus() {
  return {
    ...activityState,
    enabled: isEnabled(),
    bearerConfigured: Boolean(getBearer()),
    startedAtIso: activityState.startedAt ? new Date(activityState.startedAt).toISOString() : null,
    lastConnectAtIso: activityState.lastConnectAt ? new Date(activityState.lastConnectAt).toISOString() : null,
    lastEventAtIso: activityState.lastEventAt ? new Date(activityState.lastEventAt).toISOString() : null,
    lastHydrateAtIso: activityState.lastHydrateAt ? new Date(activityState.lastHydrateAt).toISOString() : null,
    lastSubscriptionSyncAtIso: activityState.lastSubscriptionSyncAt ? new Date(activityState.lastSubscriptionSyncAt).toISOString() : null,
  };
}

export function startXaaGroupchatStream(): void {
  activityState.enabled = isEnabled();
  if (!activityState.enabled) {
    console.log("[xaa] groupchat stream disabled (W_XAA_GROUPCHAT_ENABLED=0)");
    return;
  }
  if (runPromise) return;
  stopping = false;
  runPromise = runActivityLoop().finally(() => {
    runPromise = null;
  });
  console.log("[xaa] groupchat activity stream started");
}

export function stopXaaGroupchatStream(): void {
  stopping = true;
  signalReconnect();
}
