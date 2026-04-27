import type { NextFunction, Request, Response } from "express";
import type { Pool } from "pg";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

type SystemLogSeverity = "debug" | "info" | "warn" | "error" | "fatal";

export interface SystemLogContext {
  requestId?: string;
  userId?: number | null;
  suppressDbLog?: boolean;
}

export interface SerializedSystemLogError {
  name: string;
  message: string;
  stack?: string;
  cause?: SerializedSystemLogError | unknown;
}

export interface SystemLogInput {
  source: string;
  eventType: string;
  severity?: SystemLogSeverity;
  message?: string;
  requestId?: string | null;
  userId?: number | null;
  method?: string | null;
  path?: string | null;
  statusCode?: number | null;
  durationMs?: number | null;
  ip?: string | null;
  userAgent?: string | null;
  metadata?: unknown;
  error?: unknown;
}

export interface SystemLogEntry {
  eventId: string;
  requestId: string | null;
  source: string;
  eventType: string;
  severity: SystemLogSeverity;
  message: string | null;
  userId: number | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  durationMs: number | null;
  ip: string | null;
  userAgent: string | null;
  metadata: unknown;
  errorName: string | null;
  errorMessage: string | null;
  errorStack: string | null;
  createdAt: string;
}

const REDACTED = "[redacted]";
const CIRCULAR = "[circular]";
const MAX_STRING_LENGTH = 1_999;
const MAX_ARRAY_LENGTH = 50;
const MAX_DEPTH = 8;

const SECRET_KEY_PATTERN =
  /pass(word)?|secret|token|cookie|authorization|auth|credential|session|csrf|xsrf|private|refresh|access[_-]?token|oauth|api[_-]?key/i;

const rawConsole = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const contextStore = new AsyncLocalStorage<SystemLogContext>();
const hostname = os.hostname();
const pid = process.pid;
const logFilePath = path.join(
  process.env.SYSTEM_LOG_DIR || path.join(process.cwd(), "logs"),
  "system.log.jsonl"
);

let dbUnavailableUntil = 0;
let dbFailureLoggedAt = 0;
let consoleInstalled = false;
let processHandlersInstalled = false;
let fetchInstalled = false;
let poolInstalled = false;
const inflightWrites = new Set<Promise<void>>();

export function getSystemLogContext(): SystemLogContext {
  return contextStore.getStore() ?? {};
}

export function runWithSystemLogContext<T>(
  context: SystemLogContext,
  fn: () => T
): T {
  const current = getSystemLogContext();
  return contextStore.run({ ...current, ...context }, fn);
}

function runWithDbLoggingSuppressed<T>(fn: () => T): T {
  const current = getSystemLogContext();
  return contextStore.run({ ...current, suppressDbLog: true }, fn);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function truncateString(value: string, limit = MAX_STRING_LENGTH): string {
  if (value.length <= limit) return value;
  const remaining = value.length - limit;
  return `${value.slice(0, limit)}[truncated ${remaining} chars]`;
}

export function sanitizeForSystemLog(
  value: unknown,
  opts: {
    depth?: number;
    seen?: WeakSet<object>;
    key?: string;
  } = {}
): unknown {
  const depth = opts.depth ?? 0;
  const key = opts.key ?? "";

  if (key && SECRET_KEY_PATTERN.test(key)) return REDACTED;
  if (value == null) return value;

  if (typeof value === "string") return truncateString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function") return `[function ${value.name || "anonymous"}]`;
  if (typeof value === "symbol") return value.toString();

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return serializeErrorForSystemLog(value);

  if (depth >= MAX_DEPTH) return "[max-depth]";

  const seen = opts.seen ?? new WeakSet<object>();
  if (typeof value === "object") {
    if (seen.has(value)) return CIRCULAR;
    seen.add(value);
  }

  if (Array.isArray(value)) {
    const out = value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item) =>
        sanitizeForSystemLog(item, { depth: depth + 1, seen })
      );
    if (value.length > MAX_ARRAY_LENGTH) {
      out.push(`[truncated ${value.length - MAX_ARRAY_LENGTH} items]`);
    }
    return out;
  }

  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      out[childKey] = sanitizeForSystemLog(childValue, {
        depth: depth + 1,
        seen,
        key: childKey,
      });
    }
    return out;
  }

  return String(value);
}

export function serializeErrorForSystemLog(
  error: unknown
): SerializedSystemLogError {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    return {
      name: error.name || "Error",
      message: truncateString(error.message || String(error)),
      stack: error.stack,
      ...(cause !== undefined
        ? { cause: serializeErrorForSystemLog(cause) }
        : {}),
    };
  }

  return {
    name: typeof error,
    message: truncateString(String(error)),
  };
}

export function getSeverityForStatus(statusCode: number): SystemLogSeverity {
  if (statusCode >= 500) return "error";
  if (statusCode >= 400) return "warn";
  return "info";
}

function normalizeMessage(input: SystemLogInput, serializedError: SerializedSystemLogError | null) {
  if (input.message) return truncateString(input.message);
  if (serializedError?.message) return serializedError.message;
  return null;
}

function normalizeUserId(userId: unknown): number | null {
  const parsed = Number(userId);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildSystemLogEntry(input: SystemLogInput): SystemLogEntry {
  const context = getSystemLogContext();
  const serializedError = input.error
    ? serializeErrorForSystemLog(input.error)
    : null;
  const requestId = input.requestId ?? context.requestId ?? null;
  const userId = normalizeUserId(input.userId ?? context.userId ?? null);

  return {
    eventId: randomUUID(),
    requestId,
    source: truncateString(input.source || "server", 80),
    eventType: truncateString(input.eventType || "event", 120),
    severity:
      input.severity ||
      (input.statusCode ? getSeverityForStatus(input.statusCode) : "info"),
    message: normalizeMessage(input, serializedError),
    userId,
    method: input.method ? truncateString(input.method, 16) : null,
    path: input.path ? truncateString(input.path, 2_000) : null,
    statusCode: input.statusCode ?? null,
    durationMs: input.durationMs ?? null,
    ip: input.ip ? truncateString(input.ip, 120) : null,
    userAgent: input.userAgent ? truncateString(input.userAgent, 1_000) : null,
    metadata: sanitizeForSystemLog({
      ...(isRecord(input.metadata) ? input.metadata : { value: input.metadata }),
      process: {
        pid,
        hostname,
        nodeEnv: process.env.NODE_ENV ?? null,
        commitRef: process.env.COMMIT_REF ?? null,
      },
    }),
    errorName: serializedError?.name ?? null,
    errorMessage: serializedError?.message ?? null,
    errorStack: serializedError?.stack ? truncateString(serializedError.stack, 8_000) : null,
    createdAt: new Date().toISOString(),
  };
}

async function appendEntryToFile(entry: SystemLogEntry): Promise<void> {
  await mkdir(path.dirname(logFilePath), { recursive: true });
  await appendFile(logFilePath, `${JSON.stringify(entry)}\n`, "utf8");
}

async function appendEntryToDatabase(entry: SystemLogEntry): Promise<void> {
  if (process.env.SYSTEM_LOG_DB === "0") return;
  if (Date.now() < dbUnavailableUntil) return;

  try {
    await runWithDbLoggingSuppressed(async () => {
      const [{ db }, { systemEventLogs }] = await Promise.all([
        import("../db"),
        import("@shared/schema"),
      ]);
      await db.insert(systemEventLogs).values({
        eventId: entry.eventId,
        requestId: entry.requestId,
        source: entry.source,
        eventType: entry.eventType,
        severity: entry.severity,
        message: entry.message,
        userId: entry.userId,
        method: entry.method,
        path: entry.path,
        statusCode: entry.statusCode,
        durationMs: entry.durationMs,
        ip: entry.ip,
        userAgent: entry.userAgent,
        metadata: entry.metadata as any,
        errorName: entry.errorName,
        errorMessage: entry.errorMessage,
        errorStack: entry.errorStack,
        createdAt: new Date(entry.createdAt),
      });
    });
  } catch (err) {
    dbUnavailableUntil = Date.now() + 30_000;
    if (Date.now() - dbFailureLoggedAt > 30_000) {
      dbFailureLoggedAt = Date.now();
      rawConsole.warn("[system-log] database sink unavailable:", err);
    }
  }
}

async function persistSystemLogEntry(entry: SystemLogEntry): Promise<void> {
  await Promise.allSettled([
    appendEntryToFile(entry),
    appendEntryToDatabase(entry),
  ]);
}

export function logSystemEvent(input: SystemLogInput): SystemLogEntry {
  const entry = buildSystemLogEntry(input);
  const write = persistSystemLogEntry(entry)
    .catch((err) => rawConsole.warn("[system-log] write failed:", err))
    .finally(() => inflightWrites.delete(write));
  inflightWrites.add(write);
  return entry;
}

export async function flushSystemLog(): Promise<void> {
  await Promise.allSettled(Array.from(inflightWrites));
}

function normalizeHeader(value: unknown): string | null {
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "string") return value;
  return null;
}

function requestUserId(req: Request): number | null {
  return normalizeUserId((req.user as { id?: unknown } | undefined)?.id);
}

function requestPath(req: Request): string {
  return req.originalUrl || req.url || req.path || "/";
}

export function createSystemLogMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = Date.now();
    const incomingRequestId = normalizeHeader(req.headers["x-request-id"]);
    const requestId = incomingRequestId || randomUUID();
    res.setHeader("X-Request-Id", requestId);

    const context: SystemLogContext = {
      requestId,
      userId: requestUserId(req),
    };

    contextStore.run(context, () => {
      let finished = false;
      const logResponse = (eventType: "http_response" | "http_aborted") => {
        if (finished) return;
        finished = true;
        context.userId = requestUserId(req);
        runWithSystemLogContext(context, () => {
          logSystemEvent({
            source: "http",
            eventType,
            severity:
              eventType === "http_aborted"
                ? "warn"
                : getSeverityForStatus(res.statusCode),
            message: `${req.method} ${requestPath(req)} -> ${res.statusCode}`,
            requestId,
            userId: context.userId,
            method: req.method,
            path: requestPath(req),
            statusCode: res.statusCode,
            durationMs: Date.now() - startedAt,
            ip: req.ip,
            userAgent: normalizeHeader(req.headers["user-agent"]),
            metadata: {
              routePath: req.route?.path ?? null,
              query: req.query,
              body: req.body,
              contentLength: normalizeHeader(req.headers["content-length"]),
              referer: normalizeHeader(req.headers.referer),
              origin: normalizeHeader(req.headers.origin),
              responseContentLength: normalizeHeader(res.getHeader("content-length")),
            },
          });
        });
      };

      res.on("finish", () => logResponse("http_response"));
      res.on("close", () => {
        if (!res.writableEnded) logResponse("http_aborted");
      });

      next();
    });
  };
}

export function createSystemLogUserMiddleware() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const context = contextStore.getStore();
    if (context) context.userId = requestUserId(req);
    next();
  };
}

export function logExpressError(req: Request, error: unknown, statusCode = 500) {
  logSystemEvent({
    source: "express",
    eventType: "request_error",
    severity: getSeverityForStatus(statusCode),
    message: `Unhandled request error on ${req.method} ${requestPath(req)}`,
    userId: requestUserId(req),
    method: req.method,
    path: requestPath(req),
    statusCode,
    ip: req.ip,
    userAgent: normalizeHeader(req.headers["user-agent"]),
    metadata: {
      query: req.query,
      body: req.body,
      headers: {
        accept: req.headers.accept,
        "content-type": req.headers["content-type"],
        referer: req.headers.referer,
        origin: req.headers.origin,
      },
    },
    error,
  });
}

function consoleSeverity(method: string): SystemLogSeverity {
  if (method === "error") return "error";
  if (method === "warn") return "warn";
  if (method === "debug") return "debug";
  return "info";
}

function consoleMessage(args: unknown[]): string {
  return truncateString(
    args
      .map((arg) => {
        if (typeof arg === "string") return arg;
        if (arg instanceof Error) return arg.stack || arg.message;
        try {
          return JSON.stringify(sanitizeForSystemLog(arg));
        } catch {
          return String(arg);
        }
      })
      .join(" ")
  );
}

export function installConsoleSystemLogBridge(): void {
  if (consoleInstalled || process.env.SYSTEM_LOG_CAPTURE_CONSOLE === "0") return;
  consoleInstalled = true;

  for (const method of ["debug", "info", "log", "warn", "error"] as const) {
    console[method] = (...args: unknown[]) => {
      rawConsole[method](...args);
      logSystemEvent({
        source: "console",
        eventType: `console_${method}`,
        severity: consoleSeverity(method),
        message: consoleMessage(args),
        metadata: { args },
        error: args.find((arg) => arg instanceof Error),
      });
    };
  }
}

export function installProcessSystemLogHandlers(): void {
  if (processHandlersInstalled) return;
  processHandlersInstalled = true;

  process.on("warning", (warning) => {
    logSystemEvent({
      source: "process",
      eventType: "process_warning",
      severity: "warn",
      message: warning.message,
      error: warning,
    });
  });

  process.on("unhandledRejection", (reason) => {
    logSystemEvent({
      source: "process",
      eventType: "unhandled_rejection",
      severity: "fatal",
      message: "Unhandled promise rejection",
      error: reason,
    });
  });

  process.on("uncaughtException", (error) => {
    logSystemEvent({
      source: "process",
      eventType: "uncaught_exception",
      severity: "fatal",
      message: "Uncaught exception",
      error,
    });
  });
}

function parseFetchInput(input: RequestInfo | URL, init?: RequestInit) {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const method =
    init?.method ||
    (typeof input === "object" && "method" in input ? input.method : undefined) ||
    "GET";
  return { url, method: String(method).toUpperCase() };
}

export function installFetchSystemLogBridge(): void {
  if (fetchInstalled || process.env.SYSTEM_LOG_CAPTURE_FETCH === "0") return;
  if (typeof globalThis.fetch !== "function") return;
  fetchInstalled = true;

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const { url, method } = parseFetchInput(input, init);
    const startedAt = Date.now();
    try {
      const response = await originalFetch(input, init);
      logSystemEvent({
        source: "fetch",
        eventType: "outbound_http_response",
        severity: getSeverityForStatus(response.status),
        message: `${method} ${url} -> ${response.status}`,
        method,
        path: url,
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
        metadata: {
          ok: response.ok,
          redirected: response.redirected,
          contentType: response.headers.get("content-type"),
          contentLength: response.headers.get("content-length"),
        },
      });
      return response;
    } catch (error) {
      logSystemEvent({
        source: "fetch",
        eventType: "outbound_http_error",
        severity: "error",
        message: `${method} ${url} failed`,
        method,
        path: url,
        durationMs: Date.now() - startedAt,
        error,
      });
      throw error;
    }
  }) as typeof fetch;
}

function extractQueryDetails(args: unknown[]): {
  text: string | null;
  values: unknown;
} {
  const first = args[0] as any;
  if (typeof first === "string") {
    return { text: first, values: Array.isArray(args[1]) ? args[1] : null };
  }
  if (first && typeof first === "object") {
    return {
      text: typeof first.text === "string" ? first.text : null,
      values: Array.isArray(first.values) ? first.values : null,
    };
  }
  return { text: null, values: null };
}

function summarizeQueryValues(values: unknown) {
  if (!Array.isArray(values)) return null;
  if (process.env.SYSTEM_LOG_CAPTURE_DB_VALUES === "1") {
    return sanitizeForSystemLog(values);
  }
  return {
    captured: false,
    count: values.length,
    types: values.slice(0, MAX_ARRAY_LENGTH).map((value) => {
      if (value == null) return "null";
      if (value instanceof Date) return "date";
      if (Buffer.isBuffer(value)) return "buffer";
      return typeof value;
    }),
  };
}

export function installPgPoolSystemLogBridge(pool: Pool): void {
  if (poolInstalled || process.env.SYSTEM_LOG_CAPTURE_DB === "0") return;
  poolInstalled = true;

  pool.on("error", (error) => {
    logSystemEvent({
      source: "db",
      eventType: "pool_error",
      severity: "error",
      message: "Postgres pool error",
      error,
    });
  });

  const originalQuery = pool.query.bind(pool) as (...args: any[]) => any;
  (pool as any).query = (...args: any[]) => {
    if (getSystemLogContext().suppressDbLog) {
      return originalQuery(...args);
    }

    const { text, values } = extractQueryDetails(args);
    const startedAt = Date.now();
    const callbackIndex = args.findIndex((arg) => typeof arg === "function");

    const finish = (error: unknown, result?: { rowCount?: number | null; rows?: unknown[] }) => {
      logSystemEvent({
        source: "db",
        eventType: error ? "query_error" : "query_success",
        severity: error ? "error" : "debug",
        message: error ? "Database query failed" : "Database query completed",
        durationMs: Date.now() - startedAt,
        metadata: {
          query: text,
          values: summarizeQueryValues(values),
          rowCount: result?.rowCount ?? null,
          rowsReturned: Array.isArray(result?.rows) ? result.rows.length : null,
        },
        error,
      });
    };

    if (callbackIndex >= 0) {
      const nextArgs = [...args];
      const callback = nextArgs[callbackIndex];
      nextArgs[callbackIndex] = (error: unknown, result: unknown) => {
        finish(error, result as any);
        callback(error, result);
      };
      return originalQuery(...nextArgs);
    }

    const result = originalQuery(...args);
    if (result && typeof result.then === "function") {
      return result.then(
        (resolved: unknown) => {
          finish(null, resolved as any);
          return resolved;
        },
        (error: unknown) => {
          finish(error);
          throw error;
        }
      );
    }

    return result;
  };
}

export function installSystemLogging(): void {
  installConsoleSystemLogBridge();
  installProcessSystemLogHandlers();
  installFetchSystemLogBridge();
}
