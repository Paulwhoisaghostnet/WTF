import {
  WTFOS_GAMESHOW_ORIGIN,
  WTFOS_LEGACY_PLATFORM_ORIGINS,
  WTFOS_PLATFORM_DOMAIN,
  WTFOS_PLATFORM_ORIGIN,
} from "@shared/platform-branding";
import type cors from "cors";
import { classifyUserSiteHost } from "../features/wtf-sites/policy";
import { getSpineConfig } from "../features/atproto-spine/config";

type EnvLike = Record<string, string | undefined>;

export function normalizeOrigin(value: string): string | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function allowedOriginsForRuntime(env: EnvLike = process.env): Set<string> {
  const allowed = new Set<string>();

  const fromEnv = String(env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => normalizeOrigin(value))
    .filter((value): value is string => Boolean(value));
  fromEnv.forEach((origin) => allowed.add(origin));

  [
    env.PUBLIC_SITE_URL,
    env.COLLEKT_MODULE_URL,
    env.VITE_COLLEKT_MODULE_URL,
    env.DUES_MODULE_URL,
    env.VITE_DUES_MODULE_URL,
  ].forEach((value) => {
    const origin = normalizeOrigin(value || "");
    if (origin) allowed.add(origin);
  });

  if (env.NODE_ENV !== "production") {
    const localPorts = new Set(["3000", "3001", "5173"]);
    const runtimePort = String(env.PORT || "").trim();
    if (/^\d+$/.test(runtimePort)) localPorts.add(runtimePort);
    [
      ...[...localPorts].map((port) => `http://localhost:${port}`),
      ...[...localPorts].map((port) => `http://127.0.0.1:${port}`),
    ].forEach((origin) => allowed.add(origin));
  }

  if (env.NODE_ENV === "production") {
    allowed.add(WTFOS_PLATFORM_ORIGIN);
    allowed.add(`https://operator.${WTFOS_PLATFORM_DOMAIN}`);
    allowed.add(`https://skywire.${WTFOS_PLATFORM_DOMAIN}`);
    allowed.add(`https://gamma.${WTFOS_PLATFORM_DOMAIN}`);
    allowed.add(`https://beta.${WTFOS_PLATFORM_DOMAIN}`);
    allowed.add(`https://dues.${WTFOS_PLATFORM_DOMAIN}`);
    allowed.add(`https://dues.wtfgameshow.app`);
    for (const legacyOrigin of WTFOS_LEGACY_PLATFORM_ORIGINS) {
      allowed.add(legacyOrigin);
    }
    allowed.add(WTFOS_GAMESHOW_ORIGIN);
  }

  return allowed;
}

export function isArcadeSourceAssetPath(value: string): boolean {
  const raw = String(value || "");
  const path = raw.split("?", 1)[0] || raw;
  return (
    path.startsWith("/api/arcade/source/") ||
    path.startsWith("/api/console/hackcade/")
  );
}

export function shouldAllowNullOriginArcadeSource(
  origin: string | undefined,
  path: string
): boolean {
  return origin === "null" && isArcadeSourceAssetPath(path);
}

export function isPrivatePageFormHandoff(input: {
  origin: string | undefined;
  method: string;
  path: string;
  host: string;
  networkDomain: string;
}): boolean {
  return input.origin === "null" && input.method === "POST" && input.path === "/_private/access"
    && classifyUserSiteHost(input.host, input.networkDomain).isUserSiteHost;
}

function requestPath(req: any): string {
  const rawUrl = String(req.originalUrl || req.url || req.path || "");
  return rawUrl.split("?", 1)[0] || rawUrl;
}

function shouldAllowMacaroniPublicOrigin(origin: string | undefined, path: string): boolean {
  if (/^\/api\/macaroni\/v35\/(?:status|wake)\//.test(path)) return true;
  if (path === "/api/macaroni/reveal-request") return true;
  if (!origin || ![
    "/api/macaroni/reveal-operator",
    "/api/macaroni/reveal-automation",
    "/api/macaroni/reveal-automation/challenge",
  ].includes(path)) return false;
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch (_) {
    return false;
  }
}

/** Shared by the app and HTTP tests so production middleware order is exercised. */
export function corsOptionsFor(allowedOrigins: Set<string>): Parameters<typeof cors>[0] {
  const arcadeSourceNullOriginOptions: Parameters<typeof cors>[0] = {
    origin: "*",
    credentials: false,
  };
  const privatePageFormOptions: Parameters<typeof cors>[0] = {
    // A native form navigation needs no CORS read permission. The signed ticket
    // still binds the destination host/page to a live owner/admin session.
    origin: false,
    credentials: false,
  };
  const isPrivateHandoff = (req: any) => isPrivatePageFormHandoff({
    origin: req.headers.origin,
    method: req.method,
    path: requestPath(req),
    host: String(req.headers["x-forwarded-host"] || req.headers.host || req.hostname || ""),
    networkDomain: getSpineConfig().networkDomain,
  });

  if (allowedOrigins.size === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[cors] No allowed origins resolved in production. Set PUBLIC_SITE_URL or CORS_ALLOWED_ORIGINS before boot."
      );
    }
    console.warn("[cors] No allowed origins resolved; allowing all origins outside production.");
    const permissiveOptions: Parameters<typeof cors>[0] = { origin: true, credentials: true };
    return (req, callback) => {
      if (isPrivateHandoff(req)) return callback(null, privatePageFormOptions);
      if (shouldAllowNullOriginArcadeSource(req.headers.origin, requestPath(req))) {
        return callback(null, arcadeSourceNullOriginOptions);
      }
      callback(null, permissiveOptions);
    };
  }

  const protectedOptions: Parameters<typeof cors>[0] = {
    credentials: true,
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void
    ) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.has(origin)) return callback(null, true);
      return callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
  };

  return (req, callback) => {
    if (isPrivateHandoff(req)) return callback(null, privatePageFormOptions);
    if (shouldAllowMacaroniPublicOrigin(req.headers.origin, requestPath(req))) {
      return callback(null, { origin: true, credentials: false });
    }
    if (shouldAllowNullOriginArcadeSource(req.headers.origin, requestPath(req))) {
      return callback(null, arcadeSourceNullOriginOptions);
    }
    callback(null, protectedOptions);
  };
}
