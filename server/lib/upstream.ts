/**
 * Shared rate-limited HTTP layer for every third-party API WTF talks
 * to (TzKT, Objkt, etc.).
 *
 * Up to now each caller rolled its own `fetch()` with no global
 * coordination: the indexer surveillance sweep, the contract-metadata
 * refresher, the portfolio sync, and random route handlers were all
 * competing for the same upstream quota with no awareness of each
 * other.  That works fine at low volume but falls apart the moment a
 * backfill job runs wide — TzKT starts returning 429 and the entire
 * page of data gets silently dropped.
 *
 * This module gives us:
 *   • A token-bucket limiter per host so we stay inside each
 *     upstream's published rate.
 *   • Retry-After-aware handling of 429s.
 *   • Exponential + jittered backoff on 5xx / transient network
 *     errors with a hard retry cap.
 *   • A consistent JSON helper with per-host User-Agent.
 *
 * Explicitly NOT included (on purpose):
 *   • No external dependencies.  Everything here is Node built-ins.
 *   • No global fetch monkey-patching.  Callers opt in by importing
 *     one of the named clients below.
 *   • No caching.  Caching is a caller concern; this layer is
 *     deliberately stateless beyond the limiter.
 */

/* eslint-disable no-console */

/** Configuration for a single upstream client. */
export interface UpstreamConfig {
  /** Human-readable tag used in logs: `"tzkt"`, `"objkt"`, etc. */
  label: string;
  /** Optional base URL.  When set, `get(path)` joins onto it. */
  baseUrl?: string;
  /** Sustained rate in requests per second. */
  requestsPerSecond: number;
  /** Burst capacity — how many tokens the bucket holds at rest. */
  burst: number;
  /** Per-request timeout, ms.  Default 20 s. */
  timeoutMs?: number;
  /** Max number of retries for retriable failures (429 / 5xx). */
  maxRetries?: number;
  /** Extra headers merged onto every request (User-Agent, auth, …). */
  headers?: Record<string, string>;
}

interface Bucket {
  tokens: number;
  capacity: number;
  refillRatePerMs: number;
  lastRefillMs: number;
}

/** Simple token-bucket limiter, one bucket per client. */
function createBucket(capacity: number, perSecond: number): Bucket {
  return {
    tokens: capacity,
    capacity,
    refillRatePerMs: perSecond / 1000,
    lastRefillMs: Date.now(),
  };
}

async function acquire(bucket: Bucket): Promise<void> {
  // Tight loop that sleeps the exact amount of time it would take
  // for the bucket to accumulate at least one token, then re-checks.
  // Serialised implicitly by Node's single-threaded runtime, so no
  // lock needed: whichever awaiter reaches the `-=1` first wins.
  // Callers queue naturally at the event loop level.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const now = Date.now();
    const elapsed = now - bucket.lastRefillMs;
    if (elapsed > 0) {
      const refill = elapsed * bucket.refillRatePerMs;
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + refill);
      bucket.lastRefillMs = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }

    // Sleep just long enough for +1 token, capped to 5s so a runaway
    // config never blocks a request for minutes.
    const waitMs = Math.min(5000, Math.ceil((1 - bucket.tokens) / bucket.refillRatePerMs));
    await new Promise((r) => setTimeout(r, Math.max(1, waitMs)));
  }
}

/** Parse a Retry-After header (seconds *or* HTTP date) into ms. */
function parseRetryAfter(header: string | null, fallbackMs: number): number {
  if (!header) return fallbackMs;
  const asNum = Number(header);
  if (Number.isFinite(asNum) && asNum >= 0) return Math.ceil(asNum * 1000);
  const when = Date.parse(header);
  if (!Number.isNaN(when)) {
    const delta = when - Date.now();
    return delta > 0 ? delta : fallbackMs;
  }
  return fallbackMs;
}

/** Thrown when all retries are exhausted or a non-retriable error fires. */
export class UpstreamError extends Error {
  readonly status?: number;
  readonly url: string;
  readonly label: string;
  readonly attempt: number;
  readonly body?: string;

  constructor(opts: {
    message: string;
    status?: number;
    url: string;
    label: string;
    attempt: number;
    body?: string;
  }) {
    super(opts.message);
    this.name = "UpstreamError";
    this.status = opts.status;
    this.url = opts.url;
    this.label = opts.label;
    this.attempt = opts.attempt;
    this.body = opts.body;
  }
}

/** Single upstream client bound to one host + one rate budget. */
export class UpstreamClient {
  private bucket: Bucket;
  private label: string;
  private baseUrl: string;
  private timeoutMs: number;
  private maxRetries: number;
  private defaultHeaders: Record<string, string>;

  constructor(cfg: UpstreamConfig) {
    this.bucket = createBucket(cfg.burst, cfg.requestsPerSecond);
    this.label = cfg.label;
    this.baseUrl = (cfg.baseUrl ?? "").replace(/\/+$/, "");
    this.timeoutMs = cfg.timeoutMs ?? 20_000;
    this.maxRetries = cfg.maxRetries ?? 4;
    this.defaultHeaders = {
      "user-agent": `wtf-indexer/${this.label}`,
      ...cfg.headers,
    };
  }

  /** Join a possibly-relative path with the configured base URL. */
  resolve(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    if (!this.baseUrl) return path;
    if (!path.startsWith("/")) path = `/${path}`;
    return `${this.baseUrl}${path}`;
  }

  /**
   * Core: acquire a token, fire the request with timeout, retry on
   * 429 / 5xx / transient network.  Returns the raw Response on
   * success; callers decide how to decode it.
   */
  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const url = this.resolve(path);
    const headers = { ...this.defaultHeaders, ...(init.headers as any) };

    let attempt = 0;
    let lastErr: unknown = null;

    while (attempt <= this.maxRetries) {
      attempt += 1;
      await acquire(this.bucket);

      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);

      try {
        const res = await fetch(url, {
          ...init,
          headers,
          signal: ctrl.signal,
        });
        clearTimeout(timer);

        if (res.status === 429) {
          const wait = parseRetryAfter(res.headers.get("retry-after"), 1_000 * attempt);
          if (attempt > this.maxRetries) {
            const body = await safeText(res);
            throw new UpstreamError({
              message: `${this.label}: 429 after ${attempt} attempts`,
              status: 429,
              url,
              label: this.label,
              attempt,
              body,
            });
          }
          console.warn(
            `[upstream:${this.label}] 429 retry in ${wait}ms (attempt ${attempt}/${this.maxRetries + 1})`
          );
          await sleep(wait);
          continue;
        }

        if (res.status >= 500 && res.status <= 599) {
          if (attempt > this.maxRetries) {
            const body = await safeText(res);
            throw new UpstreamError({
              message: `${this.label}: ${res.status} after ${attempt} attempts`,
              status: res.status,
              url,
              label: this.label,
              attempt,
              body,
            });
          }
          const wait = backoffMs(attempt);
          console.warn(
            `[upstream:${this.label}] ${res.status} retry in ${wait}ms (attempt ${attempt}/${this.maxRetries + 1})`
          );
          await sleep(wait);
          continue;
        }

        if (!res.ok) {
          // 4xx other — not retriable; surface body for diagnostics.
          const body = await safeText(res);
          throw new UpstreamError({
            message: `${this.label}: ${res.status}`,
            status: res.status,
            url,
            label: this.label,
            attempt,
            body,
          });
        }

        return res;
      } catch (err: any) {
        clearTimeout(timer);
        const retriable =
          err?.name === "AbortError" ||
          err?.code === "ECONNRESET" ||
          err?.code === "ETIMEDOUT" ||
          err?.code === "ECONNREFUSED" ||
          err?.code === "EAI_AGAIN" ||
          err?.code === "EPIPE" ||
          err instanceof TypeError; // node fetch wraps network errors as TypeError

        lastErr = err;
        if (err instanceof UpstreamError) throw err;

        if (!retriable || attempt > this.maxRetries) {
          throw new UpstreamError({
            message: `${this.label}: ${err?.message ?? "network error"}`,
            url,
            label: this.label,
            attempt,
          });
        }

        const wait = backoffMs(attempt);
        console.warn(
          `[upstream:${this.label}] network error (${err?.code ?? err?.name ?? "?"}) retry in ${wait}ms (attempt ${attempt}/${this.maxRetries + 1})`
        );
        await sleep(wait);
      }
    }

    throw new UpstreamError({
      message: `${this.label}: exhausted retries (${this.maxRetries})`,
      url: this.resolve(path),
      label: this.label,
      attempt,
      body: lastErr ? String((lastErr as any)?.message ?? lastErr) : undefined,
    });
  }

  /** GET + JSON in one call.  `params` rendered deterministically. */
  async getJson<T>(path: string, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
    const url = renderParams(path, params);
    const res = await this.fetch(url, { method: "GET" });
    return (await res.json()) as T;
  }

  /** POST JSON body + return JSON.  Used for GraphQL. */
  async postJson<T>(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
    const res = await this.fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...extraHeaders },
      body: JSON.stringify(body),
    });
    return (await res.json()) as T;
  }

  /** Escape hatch for callers that need the raw Response. */
  raw(path: string, init?: RequestInit): Promise<Response> {
    return this.fetch(path, init);
  }
}

/** Exponential backoff with ±20% jitter, capped at 10s. */
function backoffMs(attempt: number): number {
  const base = Math.min(10_000, 200 * Math.pow(2, attempt - 1));
  const jitter = base * 0.2 * (Math.random() * 2 - 1);
  return Math.max(50, Math.round(base + jitter));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeText(res: Response): Promise<string | undefined> {
  try {
    const t = await res.text();
    return t.length > 2_000 ? t.slice(0, 2_000) + "…" : t;
  } catch {
    return undefined;
  }
}

function renderParams(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>
): string {
  if (!params) return path;
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
  if (!q) return path;
  return path.includes("?") ? `${path}&${q}` : `${path}?${q}`;
}

// ---------------------------------------------------------------------
// Pre-configured clients — import one of these instead of rolling your
// own fetch.
// ---------------------------------------------------------------------

// TzKT free tier nominal cap is ~10 req/s per IP with a 30-token burst.
// We stay at 8 sustained / 16 burst to leave headroom for the ad-hoc
// routes that haven't migrated yet + the occasional Retry-After wait.
export const tzkt = new UpstreamClient({
  label: "tzkt",
  baseUrl: (process.env.TZKT_API_URL || "https://api.tzkt.io/v1").replace(/\/+$/, ""),
  requestsPerSecond: 8,
  burst: 16,
  timeoutMs: 25_000,
  maxRetries: 5,
});

// Objkt GraphQL has no published per-IP quota but the endpoint is
// single-writer-flavoured — be polite.
export const objkt = new UpstreamClient({
  label: "objkt",
  baseUrl: (process.env.OBJKT_GRAPHQL_URL || "https://data.objkt.com/v3/graphql").replace(/\/+$/, ""),
  requestsPerSecond: 4,
  burst: 8,
  timeoutMs: 25_000,
  maxRetries: 4,
});
