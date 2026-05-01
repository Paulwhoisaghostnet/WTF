/**
 * W timeline — X Filtered Stream ingest (near-real-time posts → `x_timeline_posts`).
 * See https://docs.x.com/x-api/posts/filtered-stream/quickstart
 *
 * Rules are admin-controlled (`w.stream_rule_handles` in platform_settings).
 * One long-lived HTTP connection; reconnect with exponential backoff.
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import { platformSettings } from "@shared/schema";
import { getPlatformXOAuth2AccessToken } from "./x-oauth2";
import {
  getTimelineSearchSinceId,
  maxTweetId,
  setTimelineSearchSinceId,
  upsertTimelinePostMinimal,
} from "./timeline-db";

export const W_STREAM_RULE_HANDLES_KEY = "w.stream_rule_handles";
const RULE_TAG_PREFIX = "wtf_w_timeline";
/** Max rule length for pay-per-use (X docs: 1024). */
const MAX_RULE_VALUE_LEN = 1024;
const SUFFIX = " -is:retweet";
const KEEPALIVE_STALL_MS = 25_000;

const X_API_BASE = (process.env.X_API_BASE || process.env.X_API_BASE_URL || "https://api.x.com/2").replace(/\/$/, "");

function isStreamEnabled(): boolean {
  const v = String(process.env.W_TIMELINE_STREAM_ENABLED ?? "1").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return true;
}

/** Bearer for stream + rules API (app bearer preferred; else platform OAuth2). */
export async function getTimelineStreamBearer(): Promise<string | null> {
  const b = process.env.X_BEARER_TOKEN?.trim() || process.env.TWITTER_BEARER_TOKEN?.trim();
  if (b) return b;
  return getPlatformXOAuth2AccessToken();
}

export function normalizeStreamHandles(handles: string[]): string[] {
  return [
    ...new Set(
      handles
        .map((h) => h.replace(/^@+/, "").trim().toLowerCase())
        .filter((h) => /^[a-z0-9_]{1,15}$/.test(h))
    ),
  ].sort();
}

export async function loadStreamRuleHandlesFromDb(): Promise<string[]> {
  const [row] = await db
    .select({ value: platformSettings.value })
    .from(platformSettings)
    .where(eq(platformSettings.key, W_STREAM_RULE_HANDLES_KEY))
    .limit(1);
  const raw = String(row?.value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return normalizeStreamHandles(parsed.map((x) => String(x || "")));
  } catch {
    // ignore
  }
  return normalizeStreamHandles(raw.split(/[,\s]+/).filter(Boolean));
}

type XStreamRule = { id: string; value: string; tag?: string };

async function streamApiGet(path: string, bearer: string): Promise<any> {
  const url = `${X_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${bearer}` } });
  const text = await res.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }
  if (!res.ok) {
    const err: any = new Error(`X Stream API ${res.status}: ${payload?.detail || payload?.title || payload?.error || text || res.statusText}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

async function streamApiPost(path: string, bearer: string, body: unknown): Promise<any> {
  const url = `${X_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let payload: any = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }
  if (!res.ok) {
    const err: any = new Error(`X Stream API ${res.status}: ${payload?.detail || payload?.title || payload?.error || text || res.statusText}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

function buildRuleAdds(handles: string[]): Array<{ value: string; tag: string }> {
  const unique = normalizeStreamHandles(handles);
  const adds: Array<{ value: string; tag: string }> = [];
  let chunk = "";
  let chunkIdx = 0;
  for (const h of unique) {
    const piece = chunk ? ` OR from:${h}` : `from:${h}`;
    const trial = chunk + piece + SUFFIX;
    if (trial.length > MAX_RULE_VALUE_LEN && chunk) {
      adds.push({ value: chunk + SUFFIX, tag: `${RULE_TAG_PREFIX}_${chunkIdx++}` });
      chunk = `from:${h}`;
    } else {
      chunk += piece;
    }
  }
  if (chunk) adds.push({ value: chunk + SUFFIX, tag: `${RULE_TAG_PREFIX}_${chunkIdx++}` });
  return adds;
}

export async function listManagedStreamRules(bearer: string): Promise<XStreamRule[]> {
  const payload = await streamApiGet(`/tweets/search/stream/rules`, bearer);
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data
    .filter((r: any) => String(r?.tag || "").startsWith(RULE_TAG_PREFIX))
    .map((r: any) => ({ id: String(r.id), value: String(r.value || ""), tag: r.tag ? String(r.tag) : undefined }));
}

/** Replace W-managed rules on X with rules derived from handles. */
export async function syncStreamRulesToX(bearer: string, handles: string[]): Promise<{ deleted: number; added: number }> {
  const existing = await listManagedStreamRules(bearer);
  const ids = existing.map((r) => r.id).filter(Boolean);
  let deleted = 0;
  if (ids.length > 0) {
    await streamApiPost(`/tweets/search/stream/rules`, bearer, { delete: { ids } });
    deleted = ids.length;
  }
  const normalized = normalizeStreamHandles(handles);
  let added = 0;
  if (normalized.length === 0) {
    return { deleted, added: 0 };
  }
  const add = buildRuleAdds(normalized);
  if (add.length > 0) {
    await streamApiPost(`/tweets/search/stream/rules`, bearer, { add });
    added = add.length;
  }
  return { deleted, added };
}

async function maybeAdvanceSearchCursor(tweetId: string): Promise<void> {
  const prev = await getTimelineSearchSinceId();
  const merged = maxTweetId([...(prev ? [prev] : []), tweetId]);
  if (merged && merged !== prev) await setTimelineSearchSinceId(merged);
}

async function ingestStreamPayload(obj: Record<string, unknown>): Promise<void> {
  const data = obj.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== "object") return;
  const id = String(data.id || "").trim();
  const authorId = String(data.author_id || "").trim();
  if (!/^\d+$/.test(id) || !/^\d+$/.test(authorId)) return;
  const createdAt = data.created_at ? new Date(String(data.created_at)) : new Date();
  const includes = obj.includes as { users?: Array<{ id?: string; username?: string }> } | undefined;
  const users = Array.isArray(includes?.users) ? includes.users : [];
  let handle = "";
  for (const u of users) {
    if (String(u.id) === authorId && u.username) {
      handle = String(u.username).replace(/^@/, "").toLowerCase();
      break;
    }
  }
  if (!handle) return;

  const text = typeof data.text === "string" ? data.text : null;
  await upsertTimelinePostMinimal({
    id,
    authorTwitterId: authorId,
    authorHandle: handle,
    createdAt,
    text,
    displayText: text,
  });
  await maybeAdvanceSearchCursor(id).catch(() => {});
}

const timelineStreamState = {
  connected: false,
  reconnecting: false,
  startedAt: null as number | null,
  lastEventAt: null as number | null,
  postsReceived: 0,
  lastError: null as string | null,
  lastConnectAt: null as number | null,
  backoffMs: 1000,
};

export function getTimelineStreamStatus() {
  return {
    enabled: isStreamEnabled(),
    ...timelineStreamState,
    startedAtIso: timelineStreamState.startedAt ? new Date(timelineStreamState.startedAt).toISOString() : null,
    lastEventAtIso: timelineStreamState.lastEventAt ? new Date(timelineStreamState.lastEventAt).toISOString() : null,
    lastConnectAtIso: timelineStreamState.lastConnectAt ? new Date(timelineStreamState.lastConnectAt).toISOString() : null,
  };
}

let stopping = false;
let runPromise: Promise<void> | null = null;
let connectionAbort: AbortController | null = null;

function getMaxBackoffMs(): number {
  return Math.max(1000, Math.min(300_000, Number(process.env.W_TIMELINE_STREAM_RECONNECT_MAX_MS || 64_000)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function signalReconnect(): void {
  try {
    connectionAbort?.abort();
  } catch {
    // ignore
  }
}

/** Call after admin updates rules so the next connection uses fresh rules (current connection still valid for new rules on X, but reconnect is safe). */
export function requestTimelineStreamReconnect(): void {
  signalReconnect();
}

async function consumeFilteredStream(bearer: string): Promise<void> {
  const query = new URLSearchParams({
    "tweet.fields": "id,created_at,author_id,text",
    expansions: "author_id",
    "user.fields": "id,username",
  });
  const url = `${X_API_BASE}/tweets/search/stream?${query.toString()}`;

  connectionAbort = new AbortController();
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
    signal: connectionAbort.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let payload: any = {};
    try {
      payload = JSON.parse(text);
    } catch {
      payload = {};
    }
    const err: any = new Error(`Stream HTTP ${res.status}: ${payload?.detail || payload?.title || text || res.statusText}`);
    err.status = res.status;
    throw err;
  }

  if (!res.body) throw new Error("Stream response has no body");

  timelineStreamState.connected = true;
  timelineStreamState.reconnecting = false;
  timelineStreamState.lastConnectAt = Date.now();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastActivity = Date.now();

  const stallCheck = setInterval(() => {
    if (Date.now() - lastActivity > KEEPALIVE_STALL_MS) {
      console.warn("[timeline-stream] no data/keepalive; forcing reconnect");
      signalReconnect();
    }
  }, 5000);

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
          const obj = JSON.parse(trimmed) as Record<string, unknown>;
          if (Array.isArray(obj.errors)) {
            timelineStreamState.lastError = JSON.stringify(obj.errors);
            continue;
          }
          await ingestStreamPayload(obj);
          timelineStreamState.lastEventAt = Date.now();
          timelineStreamState.postsReceived += 1;
        } catch (e) {
          console.warn("[timeline-stream] skipped line:", trimmed.slice(0, 200), e);
        }
      }
    }
  } finally {
    clearInterval(stallCheck);
    timelineStreamState.connected = false;
    try {
      reader.releaseLock();
    } catch {
      // ignore
    }
  }
}

async function runTimelineStreamLoop(): Promise<void> {
  const maxBackoff = getMaxBackoffMs();
  timelineStreamState.startedAt = Date.now();
  while (!stopping) {
    if (!isStreamEnabled()) {
      timelineStreamState.lastError = "disabled via W_TIMELINE_STREAM_ENABLED";
      await sleep(30_000);
      continue;
    }
    const bearer = await getTimelineStreamBearer();
    if (!bearer) {
      timelineStreamState.lastError = "no X_BEARER_TOKEN and no platform OAuth token";
      await sleep(60_000);
      continue;
    }
    const handles = await loadStreamRuleHandlesFromDb();
    if (handles.length === 0) {
      timelineStreamState.lastError = "configure handles in W Admin → stream rules";
      await sleep(30_000);
      continue;
    }
    try {
      await syncStreamRulesToX(bearer, handles);
      timelineStreamState.backoffMs = 1000;
      timelineStreamState.reconnecting = true;
      timelineStreamState.lastError = null;
      await consumeFilteredStream(bearer);
    } catch (err: any) {
      if (err?.name === "AbortError") {
        timelineStreamState.lastError = null;
        if (stopping) break;
        await sleep(500);
        continue;
      }
      const msg = String(err?.message || err);
      timelineStreamState.lastError = msg;
      console.warn("[timeline-stream]", msg);
      const st = Number(err?.status || 0);
      const mult = st >= 400 && st < 500 && st !== 429 ? 4 : 2;
      timelineStreamState.backoffMs = Math.min(maxBackoff, Math.max(1000, timelineStreamState.backoffMs * mult));
      await sleep(timelineStreamState.backoffMs);
    }
  }
  timelineStreamState.connected = false;
  timelineStreamState.reconnecting = false;
}

export function startTimelineStream(): void {
  if (!isStreamEnabled()) {
    console.log("[timeline-stream] disabled (W_TIMELINE_STREAM_ENABLED=0)");
    return;
  }
  if (runPromise) return;
  stopping = false;
  runPromise = runTimelineStreamLoop().finally(() => {
    runPromise = null;
  });
  console.log("[timeline-stream] background loop started");
}

export function stopTimelineStream(): void {
  stopping = true;
  signalReconnect();
}
