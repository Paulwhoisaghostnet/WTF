import {
  createClientRequestId,
  logClientSystemEvent,
} from "./system-log";

const BASE = "";
const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const PUBLIC_AUTH_401_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/wallet/challenge",
  "/api/auth/wallet/verify",
  "/api/auth/wallet/register",
]);
export const AUTH_SESSION_INVALID_EVENT = "wtf:auth-session-invalid";
let csrfToken: string | null = null;
let csrfBoundaryInstalled = false;

export class ApiRequestError extends Error {
  status: number;
  path: string;
  requestId: string;

  constructor(message: string, status: number, path: string, requestId: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.path = path;
    this.requestId = requestId;
  }
}

export function isApiRequestError(err: unknown): err is ApiRequestError {
  return err instanceof ApiRequestError;
}

export function isAuthSessionInvalidError(err: unknown): boolean {
  return isApiRequestError(err) && err.status === 401 && shouldSignalAuthSessionInvalid(err.path, err.status);
}

function shouldSignalAuthSessionInvalid(path: string, status: number): boolean {
  if (status !== 401) return false;
  const normalizedPath = path.split("?", 1)[0] || path;
  return !PUBLIC_AUTH_401_PATHS.has(normalizedPath);
}

function signalAuthSessionInvalid(path: string, requestId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(AUTH_SESSION_INVALID_EVENT, {
      detail: { path, requestId },
    })
  );
}

async function getCsrfToken(fetchImpl: typeof fetch = fetch): Promise<string> {
  if (csrfToken) return csrfToken;
  const res = await fetchImpl(`${BASE}/api/auth/csrf-token`, {
    credentials: "include",
    headers: { "X-Request-Id": createClientRequestId() },
  });
  if (!res.ok) {
    throw new Error("Failed to load CSRF token");
  }
  const body = await res.json();
  csrfToken = typeof body?.csrfToken === "string" ? body.csrfToken : "";
  if (!csrfToken) {
    throw new Error("CSRF token response was empty");
  }
  return csrfToken;
}

function isSameOriginApiRequest(input: RequestInfo | URL): boolean {
  if (typeof window === "undefined") return false;
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const url = new URL(raw, window.location.origin);
  return url.origin === window.location.origin && url.pathname.startsWith("/api/");
}

export async function fetchWithCsrf(
  input: RequestInfo | URL,
  options: RequestInit = {}
): Promise<Response> {
  const method = String(options.method || "GET").toUpperCase();
  const headers = new Headers(options.headers || {});
  if (UNSAFE_METHODS.has(method) && isSameOriginApiRequest(input)) {
    headers.set("X-CSRF-Token", await getCsrfToken());
  }
  return fetch(input, {
    ...options,
    credentials: options.credentials ?? "include",
    headers,
  });
}

export function installCsrfFetchBoundary() {
  if (csrfBoundaryInstalled || typeof window === "undefined") return;
  csrfBoundaryInstalled = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, options: RequestInit = {}) => {
    const method =
      options.method ||
      (typeof Request !== "undefined" && input instanceof Request
        ? input.method
        : "GET");
    const normalizedMethod = String(method || "GET").toUpperCase();
    if (!UNSAFE_METHODS.has(normalizedMethod) || !isSameOriginApiRequest(input)) {
      return originalFetch(input, options);
    }
    const headers = new Headers(options.headers || {});
    if (!headers.has("X-CSRF-Token")) {
      headers.set("X-CSRF-Token", await getCsrfToken(originalFetch));
    }
    const response = await originalFetch(input, {
      ...options,
      method: normalizedMethod,
      credentials: options.credentials ?? "include",
      headers,
    });
    if (response.status !== 403) return response;

    csrfToken = null;
    const retryHeaders = new Headers(options.headers || {});
    retryHeaders.set("X-CSRF-Token", await getCsrfToken(originalFetch));
    return originalFetch(input, {
      ...options,
      method: normalizedMethod,
      credentials: options.credentials ?? "include",
      headers: retryHeaders,
    });
  };
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const requestId = createClientRequestId();
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  headers.set("X-Request-Id", requestId);
  const res = await fetchWithCsrf(`${BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    const message = err.error || `Request failed: ${res.status}`;
    if (shouldSignalAuthSessionInvalid(path, res.status)) {
      signalAuthSessionInvalid(path, requestId);
    }
    logClientSystemEvent({
      eventType: "api_error",
      severity: res.status >= 500 ? "error" : "warn",
      message,
      metadata: {
        requestId,
        path,
        method: options.method || "GET",
        status: res.status,
      },
    });
    throw new ApiRequestError(message, res.status, path, requestId);
  }

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: any) =>
    request<T>(path, { method: "POST", body: JSON.stringify(data) }),
  put: <T>(path: string, data?: any) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  patch: <T>(path: string, data?: any) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
