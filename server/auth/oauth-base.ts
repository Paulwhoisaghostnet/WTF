import { resolvePublicSiteOrigin } from "@shared/platform-branding";

/**
 * OAuth providers require callback URLs that match the app origin exactly.
 * Set PUBLIC_SITE_URL to the canonical public origin with no trailing slash.
 * Legacy platform aliases are normalized so stale production env does not leak
 * into OAuth callback URLs.
 */
export function getPublicSiteOrigin(): string {
  const u = process.env.PUBLIC_SITE_URL?.trim();
  if (u) return resolvePublicSiteOrigin(u).replace(/\/$/, "");
  return "";
}

export function canonicalizeOAuthProviderUrl(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    const canonicalOrigin = resolvePublicSiteOrigin(parsed.origin);
    return new URL(`${parsed.pathname}${parsed.search}${parsed.hash}`, canonicalOrigin).toString();
  } catch {
    return raw;
  }
}

/** Full callback URL for Passport (Twitter/Discord require exact match in developer consoles). */
export function oauthCallbackUrl(path: string): string {
  const base = getPublicSiteOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (base) return `${base}${p}`;
  return p;
}
