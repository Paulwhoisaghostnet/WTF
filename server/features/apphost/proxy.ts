import http from "node:http";
import { existsSync, readFileSync } from "node:fs";

const DEFAULT_APPHOST_URL = "http://127.0.0.1:8765";
export const DEFAULT_APPHOST_SOCKET_PATH = "/run/wtf/apphost/apphost.sock";
export const DEFAULT_APPHOST_CLIENT_ENV_FILE = "/run/wtf/apphost/wtfos-apphost.env";
const APPHOST_PATH_RE =
  /^\/(?:health|apps(?:\/[a-z0-9][a-z0-9._-]{1,80}(?:(?:\/(?:launch|stop|status|session|snapshot|input))|(?:\/stream\/(?:offer|status|stop)))?)?)$/;

type AppHostTransport =
  | { type: "http"; baseUrl: string }
  | { type: "unix"; socketPath: string };

function isLoopbackHostname(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1" || hostname === "[::1]";
}

function parseAppHostEnvFile(path: string): Record<string, string> {
  if (!path || !existsSync(path)) return {};
  const values: Record<string, string> = {};
  const source = readFileSync(path, "utf8");
  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equals = trimmed.indexOf("=");
    if (equals <= 0) continue;
    const key = trimmed.slice(0, equals).trim();
    const value = trimmed.slice(equals + 1).trim().replace(/^['"]|['"]$/g, "");
    if (/^WTFOS_APPHOST_[A-Z0-9_]+$/.test(key)) {
      values[key] = value;
    }
  }
  return values;
}

export function resolveAppHostEnv(env: Record<string, string | undefined> = process.env): Record<string, string | undefined> {
  const envFile = (env.WTFOS_APPHOST_CLIENT_ENV_FILE || DEFAULT_APPHOST_CLIENT_ENV_FILE).trim();
  return {
    ...parseAppHostEnvFile(envFile),
    ...env,
  };
}

export function resolveAppHostBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const resolvedEnv = resolveAppHostEnv(env);
  const raw = (resolvedEnv.WTFOS_APPHOST_URL || DEFAULT_APPHOST_URL).trim();
  const url = new URL(raw);
  if (url.protocol !== "http:") {
    throw new Error("wtfOS apphost proxy only supports http loopback upstreams");
  }
  if (!isLoopbackHostname(url.hostname)) {
    throw new Error("wtfOS apphost proxy upstream must be loopback");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function resolveAppHostTransport(env: Record<string, string | undefined> = process.env): AppHostTransport {
  const resolvedEnv = resolveAppHostEnv(env);
  const socketPath = (resolvedEnv.WTFOS_APPHOST_SOCKET_PATH || "").trim();
  if (socketPath) {
    if (!socketPath.startsWith("/")) {
      throw new Error("wtfOS apphost socket path must be absolute");
    }
    return { type: "unix", socketPath };
  }
  const sharedSocketPath = (resolvedEnv.WTFOS_APPHOST_SHARED_SOCKET_PATH || DEFAULT_APPHOST_SOCKET_PATH).trim();
  const configuredUrl = (resolvedEnv.WTFOS_APPHOST_URL || "").trim();
  if (!configuredUrl && sharedSocketPath) {
    if (!sharedSocketPath.startsWith("/")) {
      throw new Error("wtfOS apphost shared socket path must be absolute");
    }
    if (existsSync(sharedSocketPath)) {
      return { type: "unix", socketPath: sharedSocketPath };
    }
  }
  return { type: "http", baseUrl: resolveAppHostBaseUrl(resolvedEnv) };
}

export function appHostProxyPath(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (!APPHOST_PATH_RE.test(normalized)) {
    throw new Error(`Unsupported apphost proxy path: ${path}`);
  }
  return normalized;
}

export async function fetchAppHostJson(path: string, init: RequestInit = {}) {
  const upstreamPath = appHostProxyPath(path);
  const resolvedEnv = resolveAppHostEnv();
  const transport = resolveAppHostTransport(resolvedEnv);
  const timeoutMs = Number(resolvedEnv.WTFOS_APPHOST_TIMEOUT_MS || 15_000);
  if (transport.type === "unix") {
    return fetchAppHostJsonOverSocket(transport.socketPath, upstreamPath, init, timeoutMs);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${transport.baseUrl}${upstreamPath}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(init.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({
      ok: false,
      error: response.statusText || "Invalid apphost response",
    }));
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function fetchAppHostJsonOverSocket(
  socketPath: string,
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const requestBody =
      typeof init.body === "string"
        ? init.body
        : init.body instanceof Uint8Array
          ? Buffer.from(init.body)
          : null;
    const headers: http.OutgoingHttpHeaders = {
      Accept: "application/json",
      ...(init.headers || {}),
    } as http.OutgoingHttpHeaders;
    if (requestBody != null) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      headers["Content-Length"] = Buffer.byteLength(requestBody);
    }
    const request = http.request(
      {
        socketPath,
        path,
        method: init.method || "GET",
        headers,
      },
      (response) => {
        response.setEncoding("utf8");
        let raw = "";
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          const status = response.statusCode || 502;
          try {
            resolve({
              status,
              body: raw ? JSON.parse(raw) : { ok: false, error: response.statusMessage || "Empty apphost response" },
            });
          } catch {
            resolve({
              status,
              body: { ok: false, error: response.statusMessage || "Invalid apphost response" },
            });
          }
        });
      },
    );
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("apphost socket request timed out"));
    });
    request.on("error", reject);
    if (requestBody != null) {
      request.write(requestBody);
    }
    request.end();
  });
}
