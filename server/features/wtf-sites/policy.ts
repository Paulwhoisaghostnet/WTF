import { createHash } from "crypto";
import {
  WTF_USER_SITE_HOME_SLUG,
  WTF_USER_SITE_PARENT_DOMAIN,
  type WtfUserSiteDidSource,
} from "@shared/wtf-user-sites";
import { RESERVED_HANDLES } from "../atproto-spine/config";

export const WTF_USER_SITE_DID_ROLES = new Set([
  "admin",
  "host",
  "cohost",
  "resident_wizard",
  "trusted_creator",
]);

const EXTRA_RESERVED_LABELS = [
  "app",
  "auth",
  "cdn",
  "mail",
  "root",
  "status",
  "support",
  "help",
  "static",
  "assets",
  "well-known",
];

export const USER_SITE_RESERVED_LABELS = new Set(
  [...RESERVED_HANDLES, ...EXTRA_RESERVED_LABELS].map((label) =>
    label.toLowerCase()
  )
);

const BLOCKED_PATH_PREFIXES = [
  "/api",
  "/auth",
  "/xrpc",
  "/admin",
  "/internal",
  "/desktop",
  "/wtf-subdomains",
  "/service-worker",
  "/sw.js",
  "/manifest.webmanifest",
  "/favicon",
  "/assets",
  "/@vite",
];

const RESERVED_SLUGS = new Set([
  "api",
  "auth",
  "xrpc",
  "admin",
  "internal",
  "desktop",
  ".well-known",
  "service-worker",
  "service-worker.js",
  "sw.js",
  "manifest.webmanifest",
  "assets",
  "@vite",
]);

export interface UserSiteHostClassification {
  isUserSiteHost: boolean;
  host: string;
  label: string | null;
  reason?: string;
}

export interface DidTargetSnapshot {
  did: string;
  source: WtfUserSiteDidSource;
  handle: string | null;
  pdsUrl: string | null;
  atprotoAccountId?: number | null;
  wtfosIdentityId?: number | null;
}

export interface ManifestPageSnapshot {
  slug: string;
  title: string;
  html: string;
}

export interface UserSiteManifestInput {
  host: string;
  url: string;
  didTarget: DidTargetSnapshot;
  pages: ManifestPageSnapshot[];
  assetMediaIds: number[];
  versionNumber: number;
  publishedAt: string;
}

export function canIssueWtfDidForRoles(roles: readonly string[]): boolean {
  return roles.some((role) => WTF_USER_SITE_DID_ROLES.has(role));
}

export function normalizeUserSiteLabel(username: string | null | undefined): string | null {
  const label = String(username || "").trim().toLowerCase();
  if (!label) return null;
  return label;
}

export function validateUserSiteLabel(
  username: string | null | undefined,
  networkDomain = WTF_USER_SITE_PARENT_DOMAIN
): { ok: true; label: string; host: string } | { ok: false; reason: string } {
  const label = normalizeUserSiteLabel(username);
  if (!label) return { ok: false, reason: "missing username" };
  if (label.length < 3 || label.length > 63) {
    return { ok: false, reason: "username label must be 3-63 characters" };
  }
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)) {
    return { ok: false, reason: "username must be a valid DNS label" };
  }
  if (USER_SITE_RESERVED_LABELS.has(label)) {
    return { ok: false, reason: "username label is reserved" };
  }
  return { ok: true, label, host: `${label}.${networkDomain}` };
}

export function classifyUserSiteHost(
  rawHost: string | null | undefined,
  networkDomain = WTF_USER_SITE_PARENT_DOMAIN
): UserSiteHostClassification {
  const host = String(rawHost || "")
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  if (!host) return { isUserSiteHost: false, host, label: null, reason: "missing host" };

  const base = networkDomain.toLowerCase();
  const suffix = `.${base}`;
  if (!host.endsWith(suffix) || host === base) {
    return { isUserSiteHost: false, host, label: null, reason: "outside site domain" };
  }

  const label = host.slice(0, -suffix.length);
  if (!label || label.includes(".")) {
    return { isUserSiteHost: false, host, label: null, reason: "not a single label" };
  }
  if (USER_SITE_RESERVED_LABELS.has(label)) {
    return { isUserSiteHost: false, host, label, reason: "reserved label" };
  }
  if (!validateUserSiteLabel(label, networkDomain).ok) {
    return { isUserSiteHost: false, host, label, reason: "invalid label" };
  }
  return { isUserSiteHost: true, host, label };
}

export function isBlockedUserSitePath(pathname: string): boolean {
  const path = `/${String(pathname || "/").replace(/^\/+/, "")}`.toLowerCase();
  if (path === "/.well-known/atproto-did" || path === "/.well-known/wtfos-pins") return false;
  return BLOCKED_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function normalizeUserSiteSlug(input: string | null | undefined): string | null {
  const raw = String(input || "").trim().toLowerCase();
  if (!raw || raw === "/" || raw === WTF_USER_SITE_HOME_SLUG) {
    return WTF_USER_SITE_HOME_SLUG;
  }
  const slug = raw.replace(/^\/+|\/+$/g, "");
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) return null;
  if (slug.length > 80) return null;
  if (RESERVED_SLUGS.has(slug)) return null;
  return slug;
}

export function pageSlugForRequestPath(pathname: string): string | null {
  const clean = String(pathname || "/").split("?", 1)[0] || "/";
  if (clean === "/") return WTF_USER_SITE_HOME_SLUG;
  const slug = clean.replace(/^\/+|\/+$/g, "");
  if (!slug || slug.includes("/")) return null;
  return normalizeUserSiteSlug(slug);
}

export function buildUserSiteManifest(input: UserSiteManifestInput): Record<string, unknown> {
  const pageSlugs = input.pages.map((page) => page.slug);
  return {
    schemaVersion: 1,
    host: input.host,
    url: input.url,
    versionNumber: input.versionNumber,
    pageSlugs,
    assetMediaIds: input.assetMediaIds,
    didTarget: {
      did: input.didTarget.did,
      source: input.didTarget.source,
      handle: input.didTarget.handle,
    },
    publishedAt: input.publishedAt,
    pages: input.pages.map((page) => ({
      slug: page.slug,
      title: page.title,
      htmlSha256: createHash("sha256").update(page.html).digest("hex"),
    })),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function digestUserSiteManifest(manifest: Record<string, unknown>): string {
  return createHash("sha256")
    .update(stableStringify(manifest))
    .digest("hex");
}
