type ClientLogSeverity = "debug" | "info" | "warn" | "error" | "fatal";

interface ClientLogEvent {
  eventType: string;
  severity?: ClientLogSeverity;
  message?: string;
  metadata?: Record<string, unknown>;
  error?: unknown;
  url?: string;
}

let installed = false;
const recentClientLogKeys = new Map<string, { at: number; count: number }>();
const CLIENT_LOG_DEDUPE_MS = 5_000;
const MAX_CLIENT_LOG_KEYS = 80;

export function createClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toLogValue(value: unknown, depth = 0): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "undefined") return undefined;
  if (depth > 4) return "[Max depth]";
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => toLogValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 50)) {
      const serialized = toLogValue(entry, depth + 1);
      if (typeof serialized !== "undefined") result[key] = serialized;
    }
    return result;
  }
  return String(value);
}

export function serializeClientErrorForSystemLog(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const details: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (key === "name" || key === "message" || key === "stack") continue;
      const serialized = toLogValue(value);
      if (typeof serialized !== "undefined") details[key] = serialized;
    }
    return {
      name: typeof record.name === "string" ? record.name : undefined,
      message:
        typeof record.message === "string"
          ? record.message
          : JSON.stringify(toLogValue(error)),
      stack: typeof record.stack === "string" ? record.stack : undefined,
      ...(Object.keys(details).length > 0 ? { details } : {}),
    };
  }
  return { message: String(error ?? "") };
}

function errorText(error: unknown): string {
  if (!error) return "";
  if (error instanceof Error) return `${error.name}\n${error.message}\n${error.stack ?? ""}`;
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    return [record.name, record.message, record.stack]
      .filter((value) => typeof value === "string")
      .join("\n");
  }
  return String(error);
}

export function shouldSkipClientSystemLog(event: ClientLogEvent): boolean {
  const text = [event.eventType, event.message, errorText(event.error)].join("\n");
  if (
    text.includes("/@vite/client") &&
    (text.includes("Cannot read properties of undefined (reading 'send')") ||
      text.includes("[vite] failed to connect to websocket") ||
      text.includes("WebSocket connection"))
  ) {
    return true;
  }
  return false;
}

function shouldThrottleClientSystemLog(event: ClientLogEvent): boolean {
  const serializedError =
    typeof event.error === "undefined"
      ? {}
      : serializeClientErrorForSystemLog(event.error);
  const key = JSON.stringify({
    type: event.eventType,
    message: event.message,
    errorName: serializedError.name,
    errorMessage: serializedError.message,
  }).slice(0, 1_000);
  const now = Date.now();
  const current = recentClientLogKeys.get(key);
  if (current && now - current.at < CLIENT_LOG_DEDUPE_MS) {
    current.count += 1;
    return true;
  }
  recentClientLogKeys.set(key, { at: now, count: 1 });
  if (recentClientLogKeys.size > MAX_CLIENT_LOG_KEYS) {
    const oldestKey = recentClientLogKeys.keys().next().value;
    if (oldestKey) recentClientLogKeys.delete(oldestKey);
  }
  return false;
}

export function logClientSystemEvent(event: ClientLogEvent): void {
  if (typeof window === "undefined") return;
  if (shouldSkipClientSystemLog(event) || shouldThrottleClientSystemLog(event)) return;
  const payload = {
    eventType: event.eventType,
    severity: event.severity ?? "info",
    message: event.message,
    url: event.url ?? window.location.href,
    metadata: {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      userAgent: navigator.userAgent,
      ...event.metadata,
    },
    error:
      typeof event.error === "undefined"
        ? undefined
        : serializeClientErrorForSystemLog(event.error),
  };

  fetch("/api/system/logs/client", {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {
    // Logging must never create user-visible failures.
  });
}

export function installClientSystemLogging(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event) => {
    logClientSystemEvent({
      eventType: "window_error",
      severity: "error",
      message: event.message,
      metadata: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
      error: event.error,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    logClientSystemEvent({
      eventType: "unhandled_rejection",
      severity: "error",
      message: String(event.reason?.message ?? event.reason ?? "Unhandled rejection"),
      error: event.reason,
    });
  });
}
