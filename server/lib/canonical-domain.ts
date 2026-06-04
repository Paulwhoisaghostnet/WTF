import type { NextFunction, Request, Response } from "express";
import {
  WTFOS_GAMESHOW_DOMAIN,
  WTFOS_PLATFORM_DOMAIN,
  WTFOS_PLATFORM_ORIGIN,
} from "@shared/platform-branding";

type EnvLike = Record<string, string | undefined>;

const DEFAULT_LOCAL_PUBLIC_ORIGIN = "http://127.0.0.1:3000";
const CANONICAL_WWW_HOST = `www.${WTFOS_PLATFORM_DOMAIN}`;
const LEGACY_PLATFORM_HOSTS = new Set([
  WTFOS_GAMESHOW_DOMAIN,
  `www.${WTFOS_GAMESHOW_DOMAIN}`,
  `new.${WTFOS_GAMESHOW_DOMAIN}`,
]);

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseHttpUrl(value: string | null | undefined): URL | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hostNameFromHeader(value: unknown): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const first = String(raw || "").split(",")[0]?.trim().toLowerCase() || "";
  if (!first) return "";
  if (first.startsWith("[")) {
    const end = first.indexOf("]");
    return end > 0 ? first.slice(1, end) : first;
  }
  return first.split(":")[0] || "";
}

export function isLegacyPlatformHost(hostname: string | null | undefined): boolean {
  return LEGACY_PLATFORM_HOSTS.has(String(hostname || "").trim().toLowerCase());
}

export function canonicalizePlatformUrl(value: string | null | undefined): string | null {
  const parsed = parseHttpUrl(value);
  if (!parsed) return null;
  if (isLegacyPlatformHost(parsed.hostname) || parsed.hostname.toLowerCase() === CANONICAL_WWW_HOST) {
    const canonical = new URL(WTFOS_PLATFORM_ORIGIN);
    parsed.protocol = canonical.protocol;
    parsed.host = canonical.host;
  }
  return trimTrailingSlashes(parsed.toString());
}

export function canonicalizePlatformOrigin(value: string | null | undefined): string | null {
  const canonical = canonicalizePlatformUrl(value);
  if (!canonical) return null;
  return new URL(canonical).origin;
}

export function resolveCanonicalPublicOrigin(
  env: EnvLike = process.env,
  fallbackOrigin?: string | null
): string {
  for (const value of [
    env.WTFOS_PUBLIC_BASE_URL,
    env.CANONICAL_PUBLIC_ORIGIN,
    env.ATPROTO_PUBLIC_BASE_URL,
    env.PUBLIC_SITE_URL,
  ]) {
    const origin = canonicalizePlatformOrigin(value);
    if (origin) return origin;
  }
  const fallback = canonicalizePlatformOrigin(fallbackOrigin);
  if (fallback) return fallback;
  return env.NODE_ENV === "production" ? WTFOS_PLATFORM_ORIGIN : DEFAULT_LOCAL_PUBLIC_ORIGIN;
}

export function resolveCanonicalPlatformOrigin(env: EnvLike = process.env): string {
  for (const value of [env.WTFOS_PUBLIC_BASE_URL, env.CANONICAL_PUBLIC_ORIGIN]) {
    const origin = canonicalizePlatformOrigin(value);
    if (origin) return origin;
  }
  return WTFOS_PLATFORM_ORIGIN;
}

export function canonicalDomainRedirectTarget(
  req: Pick<Request, "method" | "originalUrl" | "url" | "headers">,
  env: EnvLike = process.env
): string | null {
  if (env.WTFOS_CANONICAL_DOMAIN_REDIRECT_DISABLED === "1") return null;
  const method = String(req.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;
  const host = hostNameFromHeader(req.headers?.["x-forwarded-host"]) || hostNameFromHeader(req.headers?.host);
  if (!isLegacyPlatformHost(host)) return null;
  const target = new URL(String(req.originalUrl || req.url || "/"), resolveCanonicalPlatformOrigin(env));
  return target.toString();
}

export function canonicalDomainRedirectMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const target = canonicalDomainRedirectTarget(req);
  if (target) return res.redirect(308, target);
  return next();
}
