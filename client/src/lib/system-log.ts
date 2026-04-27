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

export function createClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { message: String(error ?? "") };
}

export function logClientSystemEvent(event: ClientLogEvent): void {
  if (typeof window === "undefined") return;
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
    error: event.error ? serializeError(event.error) : undefined,
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
