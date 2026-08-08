/**
 * Bounded retry support for Pasta proof reads.
 *
 * This module intentionally does not export a general `retry(callback)` API.
 * Callers must deliberately declare a read-only reader, or use the HTTP wrapper
 * whose request method is fixed to GET. Signer submissions, contract calls,
 * originations, pins, and other writes must remain outside this module.
 */

const READ_ONLY_READER_BRAND: unique symbol = Symbol("pasta-read-only-reader");
const readerImplementations = new WeakMap<object, ReadOnlyImplementation<unknown>>();

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_DEADLINE_MS = 30_000;
const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 4_000;
const DEFAULT_MAX_RETRY_AFTER_MS = 5_000;
const DEFAULT_JITTER_RATIO = 0.2;

const MAX_ATTEMPTS_LIMIT = 10;
const MAX_DEADLINE_MS_LIMIT = 120_000;
const MAX_DELAY_MS_LIMIT = 30_000;
const MAX_RETRY_AFTER_MS_LIMIT = 30_000;

const TRANSIENT_NETWORK_CODES = new Set([
  "EAI_AGAIN",
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTDOWN",
  "EHOSTUNREACH",
  "ENETDOWN",
  "ENETRESET",
  "ENETUNREACH",
  "ENOTFOUND",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const METHOD_OVERRIDE_HEADERS = new Set([
  "x-http-method",
  "x-http-method-override",
  "x-method-override",
]);

export type ReadOnlyLane = "primary" | "fallback";

export type ReadOnlyAttemptContext = Readonly<{
  /** One-based count across both primary and fallback readers. */
  attempt: number;
  lane: ReadOnlyLane;
  /** Aborted when the shared deadline expires or the caller cancels. */
  signal: AbortSignal;
}>;

type ReadOnlyImplementation<T> = (context: ReadOnlyAttemptContext) => Promise<T>;

/**
 * An opaque capability accepted by `readWithBoundedRetry`.
 *
 * It cannot be constructed structurally because its brand and implementation
 * registry are private to this module. Use `declareReadOnlyReader` only after
 * confirming that the callback performs no external mutation.
 */
export type ReadOnlyReader<T> = Readonly<{
  label: string;
  [READ_ONLY_READER_BRAND]: true;
}>;

export type ReadOnlySources<T> = Readonly<{
  primary: ReadOnlyReader<T>;
  fallback?: ReadOnlyReader<T>;
}>;

export type ReadOnlyRetryOptions = Readonly<{
  /** Total invocations across both lanes. Hard limited to 10. */
  maxAttempts?: number;
  /** Overall wall/logical-clock budget. Hard limited to two minutes. */
  deadlineMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Upper bound applied to either Retry-After representation. */
  maxRetryAfterMs?: number;
  /** Symmetric proportional jitter from 0 through 1. */
  jitterRatio?: number;
  /** Injectable clock for deterministic tests. */
  now?: () => number;
  /** Injectable random source for deterministic jitter tests. */
  random?: () => number;
  /** Injectable wait implementation for deterministic tests. */
  sleep?: (milliseconds: number) => Promise<void>;
  /** Cancels without retrying. */
  signal?: AbortSignal;
}>;

export type ReadOnlyFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type HttpGetReaderOptions<T> = Readonly<{
  label: string;
  url: string | URL;
  headers?: Readonly<Record<string, string>>;
  redirect?: RequestRedirect;
  fetchImpl?: ReadOnlyFetch;
  /** Parse a successful 2xx response inside the bounded read attempt. */
  parse: (response: Response) => Promise<T> | T;
}>;

type NormalizedPolicy = Readonly<{
  maxAttempts: number;
  deadlineMs: number;
  baseDelayMs: number;
  maxDelayMs: number;
  maxRetryAfterMs: number;
  jitterRatio: number;
  now: () => number;
  random: () => number;
  sleep: (milliseconds: number) => Promise<void>;
  signal?: AbortSignal;
}>;

export class ReadOnlyHttpStatusError extends Error {
  readonly status: number;
  readonly retryAfter: string | null;
  readonly url?: string;

  constructor(
    message: string,
    status: number,
    options: Readonly<{ retryAfter?: string | null; url?: string; cause?: unknown }> = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ReadOnlyHttpStatusError";
    this.status = status;
    this.retryAfter = options.retryAfter ?? null;
    this.url = options.url;
  }
}

export class ReadOnlyRetryExhaustedError extends Error {
  readonly attempts: number;

  constructor(label: string, attempts: number, cause: unknown) {
    super(`${label} could not be read after ${attempts} attempts`, { cause });
    this.name = "ReadOnlyRetryExhaustedError";
    this.attempts = attempts;
  }
}

export class ReadOnlyDeadlineError extends Error {
  readonly attempts: number;

  constructor(label: string, attempts: number, cause?: unknown) {
    super(
      `${label} exceeded its bounded read deadline after ${attempts} attempt${attempts === 1 ? "" : "s"}`,
      cause === undefined ? undefined : { cause },
    );
    this.name = "ReadOnlyDeadlineError";
    this.attempts = attempts;
  }
}

class ReadOnlyCancelledError extends Error {
  constructor(label: string, cause?: unknown) {
    super(`${label} read was cancelled`, cause === undefined ? undefined : { cause });
    this.name = "ReadOnlyCancelledError";
  }
}

function assertFiniteInteger(
  value: number,
  label: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be a bounded integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function assertRatio(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be between 0 and 1`);
  }
  return value;
}

function normalizeLabel(label: string): string {
  const normalized = label.trim();
  if (!normalized || normalized.length > 200) {
    throw new TypeError("read-only reader label must contain 1 through 200 characters");
  }
  return normalized;
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizePolicy(options: ReadOnlyRetryOptions): NormalizedPolicy {
  const maxAttempts = assertFiniteInteger(
    options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    "maxAttempts",
    1,
    MAX_ATTEMPTS_LIMIT,
  );
  const deadlineMs = assertFiniteInteger(
    options.deadlineMs ?? DEFAULT_DEADLINE_MS,
    "deadlineMs",
    1,
    MAX_DEADLINE_MS_LIMIT,
  );
  const baseDelayMs = assertFiniteInteger(
    options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    "baseDelayMs",
    0,
    MAX_DELAY_MS_LIMIT,
  );
  const maxDelayMs = assertFiniteInteger(
    options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    "maxDelayMs",
    0,
    MAX_DELAY_MS_LIMIT,
  );
  if (baseDelayMs > maxDelayMs) {
    throw new RangeError("baseDelayMs cannot exceed maxDelayMs");
  }
  const maxRetryAfterMs = assertFiniteInteger(
    options.maxRetryAfterMs ?? DEFAULT_MAX_RETRY_AFTER_MS,
    "maxRetryAfterMs",
    0,
    MAX_RETRY_AFTER_MS_LIMIT,
  );
  const jitterRatio = assertRatio(options.jitterRatio ?? DEFAULT_JITTER_RATIO, "jitterRatio");
  if (options.now !== undefined && typeof options.now !== "function") throw new TypeError("now must be a function");
  if (options.random !== undefined && typeof options.random !== "function") throw new TypeError("random must be a function");
  if (options.sleep !== undefined && typeof options.sleep !== "function") throw new TypeError("sleep must be a function");
  return {
    maxAttempts,
    deadlineMs,
    baseDelayMs,
    maxDelayMs,
    maxRetryAfterMs,
    jitterRatio,
    now: options.now ?? Date.now,
    random: options.random ?? Math.random,
    sleep: options.sleep ?? defaultSleep,
    signal: options.signal,
  };
}

function readImplementation<T>(reader: ReadOnlyReader<T>, lane: ReadOnlyLane): ReadOnlyImplementation<T> {
  if (!reader || typeof reader !== "object" || reader[READ_ONLY_READER_BRAND] !== true) {
    throw new TypeError(`${lane} must be created by declareReadOnlyReader or createHttpGetReader`);
  }
  const implementation = readerImplementations.get(reader) as ReadOnlyImplementation<T> | undefined;
  if (!implementation) {
    throw new TypeError(`${lane} must be created by declareReadOnlyReader or createHttpGetReader`);
  }
  return implementation;
}

/**
 * Deliberately labels a callback as read-only before it can be retried.
 *
 * Never wrap a signer, wallet request, operation submission, contract call,
 * origination, IPFS pin, file write, or any other mutating function here.
 */
export function declareReadOnlyReader<T>(
  label: string,
  read: (context: ReadOnlyAttemptContext) => Promise<T> | T,
): ReadOnlyReader<T> {
  if (typeof read !== "function") throw new TypeError("read-only reader implementation must be a function");
  const reader = Object.freeze({
    label: normalizeLabel(label),
    [READ_ONLY_READER_BRAND]: true as const,
  });
  readerImplementations.set(reader, async (context) => read(context));
  return reader;
}

/**
 * Creates a declared reader whose transport is always an HTTP GET.
 * No arbitrary RequestInit, method, or body is accepted by this API.
 */
export function createHttpGetReader<T>(options: HttpGetReaderOptions<T>): ReadOnlyReader<T> {
  if (typeof options.parse !== "function") throw new TypeError("HTTP GET reader parse must be a function");
  const parsedUrl = new URL(String(options.url));
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    throw new TypeError("HTTP GET reader URL must use http: or https:");
  }
  const url = parsedUrl.toString();
  const headers: Record<string, string> = {};
  for (const [rawName, value] of Object.entries(options.headers ?? {})) {
    const name = rawName.toLowerCase();
    if (METHOD_OVERRIDE_HEADERS.has(name)) {
      throw new TypeError(`${rawName} is forbidden because this reader is GET-only`);
    }
    headers[rawName] = value;
  }
  Object.freeze(headers);
  const redirect = options.redirect ?? "follow";
  if (!(["follow", "error", "manual"] as const).includes(redirect)) {
    throw new TypeError("HTTP GET redirect must be follow, error, or manual");
  }
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new TypeError("HTTP GET reader requires fetch");

  return declareReadOnlyReader(options.label, async ({ signal }) => {
    const response = await fetchImpl(url, {
      method: "GET",
      headers,
      redirect,
      signal,
    });
    if (!response || !Number.isInteger(response.status)) {
      throw new TypeError(`${options.label} GET returned an invalid Response`);
    }
    if (response.status < 200 || response.status > 299) {
      throw new ReadOnlyHttpStatusError(
        `${options.label} GET returned HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`,
        response.status,
        {
          retryAfter: response.headers?.get?.("retry-after") ?? null,
          url,
        },
      );
    }
    return options.parse(response);
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && (typeof value === "object" || typeof value === "function")
    ? value as Record<string, unknown>
    : undefined;
}

function httpStatus(error: unknown): number | undefined {
  const visited = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 8 && current != null && !visited.has(current); depth += 1) {
    visited.add(current);
    if (current instanceof ReadOnlyHttpStatusError) return current.status;
    const direct = asRecord(current);
    const response = asRecord(direct?.response);
    for (const candidate of [direct?.status, direct?.statusCode, response?.status]) {
      const number = Number(candidate);
      if (Number.isInteger(number) && number >= 100 && number <= 999) return number;
    }
    current = direct?.cause;
  }
  return undefined;
}

function headerValue(headers: unknown, name: string): string | null {
  const record = asRecord(headers);
  if (!record) return null;
  if (typeof record.get === "function") {
    const value = (record.get as (key: string) => unknown)(name);
    return value == null ? null : String(value);
  }
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() === name && value != null) return String(value);
  }
  return null;
}

function retryAfterValue(error: unknown): string | null {
  if (error instanceof ReadOnlyHttpStatusError) return error.retryAfter;
  const direct = asRecord(error);
  const response = asRecord(direct?.response);
  const explicit = direct?.retryAfter;
  if (typeof explicit === "string") return explicit;
  return headerValue(direct?.headers, "retry-after") ?? headerValue(response?.headers, "retry-after");
}

function isTransientNetworkError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;
  let matchedTransient = false;
  for (let depth = 0; depth < 8 && current != null && !visited.has(current); depth += 1) {
    visited.add(current);
    const record = asRecord(current);
    const code = typeof record?.code === "string" ? record.code.toUpperCase() : "";
    if (TRANSIENT_NETWORK_CODES.has(code)) matchedTransient = true;
    const name = typeof record?.name === "string" ? record.name : "";
    if (name === "TimeoutError") matchedTransient = true;
    if (name === "AbortError") return false;
    if (current instanceof TypeError) {
      const message = current.message.trim().toLowerCase();
      if (message === "fetch failed" || message === "network error" || message === "network request failed") {
        matchedTransient = true;
      }
    }
    current = record?.cause;
  }
  return matchedTransient;
}

function isRetryableReadFailure(error: unknown): boolean {
  if (error instanceof ReadOnlyDeadlineError || error instanceof ReadOnlyCancelledError) return false;
  const status = httpStatus(error);
  if (status !== undefined) return status === 429 || (status >= 500 && status <= 599);
  return isTransientNetworkError(error);
}

function boundedRetryAfterMs(raw: string | null, now: number, maximum: number): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const deltaSeconds = Number(trimmed);
  if (Number.isFinite(deltaSeconds) && deltaSeconds >= 0) {
    return Math.min(maximum, Math.max(0, Math.ceil(deltaSeconds * 1_000)));
  }
  const timestamp = Date.parse(trimmed);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.min(maximum, Math.max(0, Math.ceil(timestamp - now)));
}

function backoffDelayMs(policy: NormalizedPolicy, failedAttempt: number): number {
  const exponential = Math.min(
    policy.maxDelayMs,
    policy.baseDelayMs * (2 ** Math.max(0, failedAttempt - 1)),
  );
  if (policy.jitterRatio === 0) return exponential;
  const random = policy.random();
  if (!Number.isFinite(random) || random < 0 || random > 1) {
    throw new RangeError("random must return a value between 0 and 1");
  }
  const multiplier = 1 + policy.jitterRatio * ((2 * random) - 1);
  return Math.min(policy.maxDelayMs, Math.max(0, Math.round(exponential * multiplier)));
}

function cancellationError(label: string, signal: AbortSignal): ReadOnlyCancelledError {
  return new ReadOnlyCancelledError(label, signal.reason);
}

async function runWithinDeadline<T>(input: Readonly<{
  label: string;
  attempts: number;
  remainingMs: number;
  externalSignal?: AbortSignal;
  controller?: AbortController;
  run: () => Promise<T>;
}>): Promise<T> {
  if (input.remainingMs <= 0) throw new ReadOnlyDeadlineError(input.label, input.attempts);
  if (input.externalSignal?.aborted) throw cancellationError(input.label, input.externalSignal);

  let timeout: ReturnType<typeof setTimeout> | undefined;
  let removeAbortListener: (() => void) | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      const error = new ReadOnlyDeadlineError(input.label, input.attempts);
      input.controller?.abort(error);
      reject(error);
    }, Math.max(1, Math.ceil(input.remainingMs)));
  });
  const candidates: Promise<T | never>[] = [Promise.resolve().then(input.run), deadline];
  if (input.externalSignal) {
    candidates.push(new Promise<never>((_resolve, reject) => {
      const onAbort = () => {
        const error = cancellationError(input.label, input.externalSignal!);
        input.controller?.abort(error);
        reject(error);
      };
      input.externalSignal!.addEventListener("abort", onAbort, { once: true });
      removeAbortListener = () => input.externalSignal!.removeEventListener("abort", onAbort);
      if (input.externalSignal!.aborted) onAbort();
    }));
  }
  try {
    return await Promise.race(candidates);
  } finally {
    if (timeout) clearTimeout(timeout);
    removeAbortListener?.();
  }
}

/**
 * Runs declared read-only sources under one bounded attempt/deadline budget.
 *
 * With a fallback, retryable failures alternate primary/fallback. A terminal
 * failure is returned immediately and never consults the other lane.
 */
export async function readWithBoundedRetry<T>(
  sources: ReadOnlySources<T>,
  options: ReadOnlyRetryOptions = {},
): Promise<T> {
  const primary = readImplementation<T>(sources.primary, "primary");
  const fallback = sources.fallback ? readImplementation<T>(sources.fallback, "fallback") : undefined;
  const policy = normalizePolicy(options);
  const logicalStartedAt = policy.now();
  if (!Number.isFinite(logicalStartedAt)) throw new RangeError("now must return a finite millisecond timestamp");
  const wallStartedAt = Date.now();

  const remainingMs = (): number => {
    const current = policy.now();
    if (!Number.isFinite(current) || current < logicalStartedAt) {
      throw new RangeError("now must return finite, non-decreasing millisecond timestamps");
    }
    const logicalElapsed = current - logicalStartedAt;
    const wallElapsed = Math.max(0, Date.now() - wallStartedAt);
    return policy.deadlineMs - Math.max(logicalElapsed, wallElapsed);
  };

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    const lane: ReadOnlyLane = fallback && attempt % 2 === 0 ? "fallback" : "primary";
    const implementation: ReadOnlyImplementation<T> = lane === "fallback" ? fallback! : primary;
    const reader: ReadOnlyReader<T> = lane === "fallback" ? sources.fallback! : sources.primary;
    const remaining = remainingMs();
    if (remaining <= 0) throw new ReadOnlyDeadlineError(reader.label, attempt - 1);
    const controller = new AbortController();

    try {
      const result = await runWithinDeadline({
        label: reader.label,
        attempts: attempt,
        remainingMs: remaining,
        externalSignal: policy.signal,
        controller,
        run: () => Promise.resolve().then(() => implementation({ attempt, lane, signal: controller.signal })),
      });
      if (remainingMs() <= 0) throw new ReadOnlyDeadlineError(reader.label, attempt);
      return result;
    } catch (error) {
      if (!isRetryableReadFailure(error)) throw error;
      if (attempt === policy.maxAttempts) {
        throw new ReadOnlyRetryExhaustedError(reader.label, attempt, error);
      }

      const current = policy.now();
      if (!Number.isFinite(current) || current < logicalStartedAt) {
        throw new RangeError("now must return finite, non-decreasing millisecond timestamps");
      }
      const retryAfter = boundedRetryAfterMs(retryAfterValue(error), current, policy.maxRetryAfterMs);
      const delay = Math.max(backoffDelayMs(policy, attempt), retryAfter ?? 0);
      const beforeSleep = remainingMs();
      if (delay >= beforeSleep) {
        throw new ReadOnlyDeadlineError(reader.label, attempt, error);
      }
      if (delay > 0) {
        await runWithinDeadline({
          label: reader.label,
          attempts: attempt,
          remainingMs: beforeSleep,
          externalSignal: policy.signal,
          run: () => policy.sleep(delay),
        });
      }
    }
  }

  throw new Error("unreachable bounded read state");
}
