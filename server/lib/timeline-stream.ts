/**
 * W timeline — X Filtered Stream ingest (near-real-time posts → `x_timeline_posts`).
 * See https://docs.x.com/x-api/posts/filtered-stream/quickstart
 *
 * Rules are derived from verified WTF user handles plus an optional server-side
 * allowlist file (`W_TIMELINE_STREAM_HANDLES_FILE`).
 * One long-lived HTTP connection; reconnect with exponential backoff.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { platformSettings, users } from "@shared/schema";
import { getPlatformXOAuth2AccessToken } from "./x-oauth2";
import {
  getTimelineSearchSinceId,
  maxTweetId,
  setTimelineSearchSinceId,
  upsertTimelinePostMinimal,
} from "./timeline-db";
import { canUseXFeature, recordXFeatureUsage } from "./x-usage-budget";

export const W_STREAM_RULE_HANDLES_KEY = "w.stream_rule_handles";
const RULE_TAG_PREFIX = "wtf_users";
/** Max rule length for pay-per-use (X docs: 1024). */
const MAX_RULE_VALUE_LEN = 1024;
const SUFFIX = " -is:retweet";
const KEEPALIVE_STALL_MS = 25_000;
const MAX_STREAM_HANDLES = Math.max(1, Number(process.env.W_TIMELINE_STREAM_MAX_HANDLES || 5000));
const DEFAULT_STREAM_HANDLES_FILE = process.env.NODE_ENV === "production"
  ? "/app/config/w-stream-handles.txt"
  : path.join(process.cwd(), "config", "w-stream-handles.txt");

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

function normalizeStreamHandlesInOrder(handles: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of handles) {
    const handle = raw.replace(/^@+/, "").trim().toLowerCase();
    if (!/^[a-z0-9_]{1,15}$/.test(handle) || seen.has(handle)) continue;
    seen.add(handle);
    normalized.push(handle);
  }
  return normalized;
}

function getMaxStreamRules(): number {
  return Math.max(1, Number(process.env.W_TIMELINE_STREAM_MAX_RULES || 25));
}

export function getStreamHandlesFilePath(): string {
  return String(process.env.W_TIMELINE_STREAM_HANDLES_FILE || DEFAULT_STREAM_HANDLES_FILE).trim();
}

export function parseStreamHandlesFile(contents: string): string[] {
  return normalizeStreamHandles(
    contents
      .split(/\r?\n/)
      .flatMap((line) => line.replace(/#.*/, "").split(/[,\s]+/))
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

export async function loadStreamRuleHandlesFromFile(): Promise<{
  path: string;
  handles: string[];
  missing: boolean;
  error: string | null;
}> {
  const filePath = getStreamHandlesFilePath();
  if (!filePath) return { path: filePath, handles: [], missing: true, error: null };
  try {
    const contents = await readFile(filePath, "utf8");
    return { path: filePath, handles: parseStreamHandlesFile(contents), missing: false, error: null };
  } catch (err: any) {
    if (err?.code === "ENOENT") return { path: filePath, handles: [], missing: true, error: null };
    return { path: filePath, handles: [], missing: false, error: String(err?.message || err) };
  }
}

export async function loadStreamRuleHandleSources(): Promise<{
  handles: string[];
  eligibleHandles: string[];
  fileHandles: string[];
  settingsHandles: string[];
  skippedEligibleHandles: number;
  filePath: string;
  fileMissing: boolean;
  fileError: string | null;
}> {
  const eligible = await loadEligibleWtfStreamHandles();
  const file = await loadStreamRuleHandlesFromFile();
  const settingsHandles = await loadStreamRuleHandlesFromSettings();
  const handles = normalizeStreamHandlesInOrder([...eligible.handles, ...file.handles, ...settingsHandles]);
  return {
    handles,
    eligibleHandles: eligible.handles,
    fileHandles: file.handles,
    settingsHandles,
    skippedEligibleHandles: eligible.skipped,
    filePath: file.path,
    fileMissing: file.missing,
    fileError: file.error,
  };
}

export async function loadStreamRuleHandlesFromDb(): Promise<string[]> {
  const sources = await loadStreamRuleHandleSources();
  return sources.handles;
}

async function loadStreamRuleHandlesFromSettings(): Promise<string[]> {
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

export async function loadEligibleWtfStreamHandles(limit = MAX_STREAM_HANDLES): Promise<{
  handles: string[];
  skipped: number;
}> {
  const rows = await db
    .select({
      twitterHandle: users.twitterHandle,
      hasOauth2: sql<boolean>`${users.twitterOauth2AccessToken} IS NOT NULL`,
    })
    .from(users)
    .where(
      sql`${users.twitterVerified} = true
        AND ${users.twitterHandle} IS NOT NULL
        AND length(trim(${users.twitterHandle})) > 0`
    )
    .orderBy(sql`${users.twitterOauth2AccessToken} IS NOT NULL DESC`, desc(users.updatedAt), desc(users.id))
    .limit(limit + 1);

  const handles = normalizeStreamHandlesInOrder(rows.slice(0, limit).map((row) => row.twitterHandle || ""));
  return {
    handles,
    skipped: Math.max(0, rows.length - limit),
  };
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

function assertStreamRuleMutationAccepted(payload: any, phase: string): void {
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];
  const summary = payload?.meta?.summary || {};
  const invalid = Number(summary.invalid || 0);
  const notCreated = Number(summary.not_created || 0);
  if (errors.length > 0 || invalid > 0 || notCreated > 0) {
    const err: any = new Error(`X Stream API ${phase} rejected W managed rules`);
    err.payload = { summary, errors };
    throw err;
  }
}

export function buildStreamRulePlan(handles: string[], maxRules = getMaxStreamRules()): {
  add: Array<{ value: string; tag: string }>;
  includedHandles: string[];
  skippedHandles: string[];
} {
  const unique = normalizeStreamHandlesInOrder(handles);
  const adds: Array<{ value: string; tag: string }> = [];
  const includedHandles: string[] = [];
  const skippedHandles: string[] = [];
  let chunk = "";
  let chunkHandles: string[] = [];
  let chunkIdx = 0;
  for (let i = 0; i < unique.length; i++) {
    const h = unique[i];
    const piece = chunk ? ` OR from:${h}` : `from:${h}`;
    const trial = chunk + piece + SUFFIX;
    if (trial.length > MAX_RULE_VALUE_LEN && chunk) {
      if (adds.length >= maxRules) {
        skippedHandles.push(...chunkHandles, ...unique.slice(i));
        chunk = "";
        chunkHandles = [];
        break;
      }
      adds.push({ value: chunk + SUFFIX, tag: `${RULE_TAG_PREFIX}_${String(chunkIdx++).padStart(4, "0")}` });
      includedHandles.push(...chunkHandles);
      chunk = `from:${h}`;
      chunkHandles = [h];
    } else {
      chunk += piece;
      chunkHandles.push(h);
    }
  }
  if (chunk) {
    if (adds.length < maxRules) {
      adds.push({ value: chunk + SUFFIX, tag: `${RULE_TAG_PREFIX}_${String(chunkIdx++).padStart(4, "0")}` });
      includedHandles.push(...chunkHandles);
    } else {
      skippedHandles.push(...chunkHandles);
    }
  }
  return { add: adds, includedHandles, skippedHandles };
}

export function buildStreamRuleAdds(handles: string[]): Array<{ value: string; tag: string }> {
  return buildStreamRulePlan(handles).add;
}

export async function listManagedStreamRules(bearer: string): Promise<XStreamRule[]> {
  const payload = await streamApiGet(`/tweets/search/stream/rules`, bearer);
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return data
    .filter((r: any) => String(r?.tag || "").startsWith(RULE_TAG_PREFIX))
    .map((r: any) => ({ id: String(r.id), value: String(r.value || ""), tag: r.tag ? String(r.tag) : undefined }));
}

/** Replace W-managed rules on X with rules derived from handles. */
export async function syncStreamRulesToX(bearer: string, handles: string[]): Promise<{ deleted: number; added: number; skippedHandles: number }> {
  const existing = await listManagedStreamRules(bearer);
  const ids = existing.map((r) => r.id).filter(Boolean);

  const plan = buildStreamRulePlan(handles);
  const add = plan.add;
  if (add.length > 0) {
    const dryRun = await streamApiPost(`/tweets/search/stream/rules?dry_run=true`, bearer, { add });
    assertStreamRuleMutationAccepted(dryRun, "dry-run add");
  }

  let deleted = 0;
  if (ids.length > 0) {
    const deletedPayload = await streamApiPost(`/tweets/search/stream/rules`, bearer, { delete: { ids } });
    assertStreamRuleMutationAccepted(deletedPayload, "delete");
    deleted = ids.length;
  }
  let added = 0;
  if (add.length > 0) {
    const addedPayload = await streamApiPost(`/tweets/search/stream/rules`, bearer, { add });
    assertStreamRuleMutationAccepted(addedPayload, "add");
    added = add.length;
  }
  return { deleted, added, skippedHandles: plan.skippedHandles.length };
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
  lastRuleSyncAt: null as number | null,
  lastRuleSyncReason: null as string | null,
  lastRuleHandleCount: 0,
  lastRuleSkippedHandleCount: 0,
  backoffMs: 1000,
};

export function getTimelineStreamStatus() {
  return {
    enabled: isStreamEnabled(),
    ...timelineStreamState,
    startedAtIso: timelineStreamState.startedAt ? new Date(timelineStreamState.startedAt).toISOString() : null,
    lastEventAtIso: timelineStreamState.lastEventAt ? new Date(timelineStreamState.lastEventAt).toISOString() : null,
    lastConnectAtIso: timelineStreamState.lastConnectAt ? new Date(timelineStreamState.lastConnectAt).toISOString() : null,
    lastRuleSyncAtIso: timelineStreamState.lastRuleSyncAt ? new Date(timelineStreamState.lastRuleSyncAt).toISOString() : null,
  };
}

let stopping = false;
let runPromise: Promise<void> | null = null;
let connectionAbort: AbortController | null = null;
let ruleRefreshTimer: NodeJS.Timeout | null = null;
let lastSyncedRuleSignature: string | null = null;

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
          const budgetState = await recordXFeatureUsage("timeline_stream_posts", 1);
          timelineStreamState.lastEventAt = Date.now();
          timelineStreamState.postsReceived += 1;
          if (budgetState.hardExceeded) {
            timelineStreamState.lastError = "timeline_stream_posts_monthly_budget_exceeded";
            signalReconnect();
          }
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
      timelineStreamState.lastError = `configure handles in W Admin or ${getStreamHandlesFilePath()}`;
      await sleep(30_000);
      continue;
    }
    const budget = await canUseXFeature("timeline_stream_posts", 1);
    if (!budget.allowed) {
      timelineStreamState.lastError = budget.reason;
      await sleep(60_000);
      continue;
    }
    try {
      await syncCurrentStreamRules("connect", { force: true, bearer, handles });
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

function getRuleRefreshIntervalMs(): number {
  return Math.max(30_000, Math.min(3_600_000, Number(process.env.W_TIMELINE_STREAM_RULE_REFRESH_MS || 60_000)));
}

async function syncCurrentStreamRules(
  reason: string,
  options: { force?: boolean; bearer?: string; handles?: string[] } = {}
): Promise<void> {
  const bearer = options.bearer ?? await getTimelineStreamBearer();
  if (!bearer) return;
  const handles = options.handles ?? await loadStreamRuleHandlesFromDb();
  if (handles.length === 0) return;
  const signature = handles.join(",");
  if (!options.force && signature === lastSyncedRuleSignature) return;
  const result = await syncStreamRulesToX(bearer, handles);
  lastSyncedRuleSignature = signature;
  timelineStreamState.lastRuleSyncAt = Date.now();
  timelineStreamState.lastRuleSyncReason = reason;
  timelineStreamState.lastRuleHandleCount = handles.length;
  timelineStreamState.lastRuleSkippedHandleCount = result.skippedHandles;
  if (result.skippedHandles > 0) {
    console.warn(
      `[timeline-stream] skipped ${result.skippedHandles} handles beyond W_TIMELINE_STREAM_MAX_RULES=${getMaxStreamRules()}`
    );
  }
}

function startRuleRefreshLoop(): void {
  if (ruleRefreshTimer || !isStreamEnabled()) return;
  ruleRefreshTimer = setInterval(() => {
    syncCurrentStreamRules("poll").catch((err: any) => {
      const msg = String(err?.message || err);
      timelineStreamState.lastError = msg;
      console.warn("[timeline-stream] rule refresh failed:", msg);
    });
  }, getRuleRefreshIntervalMs());
  ruleRefreshTimer.unref?.();
}

export function startTimelineStream(): void {
  if (!isStreamEnabled()) {
    console.log("[timeline-stream] disabled (W_TIMELINE_STREAM_ENABLED=0)");
    return;
  }
  startRuleRefreshLoop();
  if (runPromise) return;
  stopping = false;
  runPromise = runTimelineStreamLoop().finally(() => {
    runPromise = null;
  });
  console.log("[timeline-stream] background loop started");
}

export function stopTimelineStream(): void {
  stopping = true;
  if (ruleRefreshTimer) {
    clearInterval(ruleRefreshTimer);
    ruleRefreshTimer = null;
  }
  signalReconnect();
}
