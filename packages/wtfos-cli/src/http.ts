import type {
  WtfOsAccessManifest,
  WtfOsCliAccessibleRoute,
  WtfOsCliBrowserRouteAccess,
  WtfOsHealthResponse,
} from "../../../shared/wtfos-cli/types.ts";
import { loadConfig, loadSession } from "./config.js";
import { sanitizeApiError } from "./http-sanitize.js";

export class WtfOsHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "WtfOsHttpError";
  }
}

export async function wtfosFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { baseUrl } = loadConfig();
  const session = loadSession();
  const headers = new Headers(init.headers);
  if (!headers.has("accept")) headers.set("accept", "application/json");
  if (session?.cookie) headers.set("cookie", session.cookie);

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  return response;
}

export async function wtfosJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await wtfosFetch(path, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new WtfOsHttpError(sanitizeApiError(body, response.status), response.status);
  }
  return (await response.json()) as T;
}

export function extractSessionCookie(response: Response): string | null {
  const setCookies =
    typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];
  for (const raw of setCookies) {
    const match = raw.match(/^(connect\.sid=[^;]+)/);
    if (match?.[1]) return match[1];
  }
  const single = response.headers.get("set-cookie");
  if (single) {
    const match = single.match(/^(connect\.sid=[^;]+)/);
    if (match?.[1]) return match[1];
  }
  return null;
}

export function createRemoteClient() {
  return {
    async getHealth(): Promise<WtfOsHealthResponse> {
      return wtfosJson<WtfOsHealthResponse>("/api/health");
    },
    async getAccess(): Promise<WtfOsAccessManifest> {
      return wtfosJson<WtfOsAccessManifest>("/api/access");
    },
    async checkBrowserRoute(path: string): Promise<WtfOsCliBrowserRouteAccess> {
      const encoded = encodeURIComponent(path);
      return wtfosJson<WtfOsCliBrowserRouteAccess>(`/api/cli/can-open?path=${encoded}`);
    },
    async listAccessibleBrowserRoutes(): Promise<WtfOsCliAccessibleRoute[]> {
      const payload = await wtfosJson<{ routes: WtfOsCliAccessibleRoute[] }>("/api/cli/routes");
      return payload.routes;
    },
  };
}

export async function fetchCurrentUser(): Promise<{
  username: string;
  displayName?: string | null;
} | null> {
  try {
    const user = await wtfosJson<{ username?: string; displayName?: string; name?: string }>(
      "/api/auth/user"
    );
    if (!user?.username) return null;
    return {
      username: user.username,
      displayName: user.displayName ?? user.name ?? null,
    };
  } catch (error) {
    if (error instanceof WtfOsHttpError && error.status === 401) return null;
    throw error;
  }
}
