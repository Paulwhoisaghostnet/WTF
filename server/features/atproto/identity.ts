import { randomBytes } from "crypto";
import { resolveTxt } from "dns/promises";

const HANDLE_RE = /^(?=.{3,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/;

export function normalizeAtHandle(handle: string): string {
  return String(handle || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
    .replace(/\.$/, "");
}

export function normalizeRegistrationHandle(handle: string, defaultSuffix?: string | null): string {
  const normalized = normalizeAtHandle(handle);
  const suffix = normalizeAtHandle(defaultSuffix || "");
  if (normalized && !normalized.includes(".") && suffix) {
    return normalizeAtHandle(`${normalized}.${suffix}`);
  }
  return normalized;
}

export function isValidAtHandle(handle: string): boolean {
  const normalized = normalizeAtHandle(handle);
  if (!HANDLE_RE.test(normalized)) return false;
  if (normalized.endsWith(".tez")) return false;
  if (normalized.endsWith(".local")) return false;
  if (normalized.endsWith(".arpa")) return false;
  if (normalized.split(".").some((part) => part.length > 63)) return false;
  return true;
}

export function isTezosAlias(value: string | null | undefined): boolean {
  const alias = String(value || "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9-_.]{0,250}\.tez$/.test(alias);
}

export function randomProofToken(): string {
  return randomBytes(24).toString("base64url");
}

export function buildBskyIntentUrl(text: string): string {
  const url = new URL("https://bsky.app/intent/compose");
  url.searchParams.set("text", text.slice(0, 3000));
  return url.toString();
}

export function parseBskyPostRef(input: string): {
  uri: string;
  actor: string;
  rkey: string;
} {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Post URL or AT URI is required");

  if (raw.startsWith("at://")) {
    const match = raw.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/?#]+)$/);
    if (!match) throw new Error("Unsupported AT URI");
    return { uri: raw, actor: match[1], rkey: match[2] };
  }

  const url = new URL(raw);
  if (!["bsky.app", "staging.bsky.app"].includes(url.hostname)) {
    throw new Error("Only Bluesky post URLs are supported");
  }
  const parts = url.pathname.split("/").filter(Boolean);
  const profileIdx = parts.indexOf("profile");
  const postIdx = parts.indexOf("post");
  if (profileIdx === -1 || postIdx === -1 || !parts[profileIdx + 1] || !parts[postIdx + 1]) {
    throw new Error("Unsupported Bluesky post URL");
  }
  const actor = decodeURIComponent(parts[profileIdx + 1]);
  const rkey = decodeURIComponent(parts[postIdx + 1]);
  return {
    uri: `at://${actor}/app.bsky.feed.post/${rkey}`,
    actor,
    rkey,
  };
}

export function atUriParts(uri: string): {
  didOrHandle: string;
  collection: string | null;
  rkey: string | null;
} {
  const match = String(uri || "").match(/^at:\/\/([^/]+)(?:\/([^/]+)\/([^/?#]+))?/);
  return {
    didOrHandle: match?.[1] ?? "",
    collection: match?.[2] ?? null,
    rkey: match?.[3] ?? null,
  };
}

export function sourceUrlForAtUri(uri: string, preferredActor?: string | null): string | null {
  const parts = atUriParts(uri);
  if (!parts.didOrHandle || !parts.rkey) return null;
  const actor = normalizeAtHandle(preferredActor || parts.didOrHandle) || parts.didOrHandle;
  return `https://bsky.app/profile/${actor}/post/${parts.rkey}`;
}

export async function resolveDidViaDnsTxt(handle: string): Promise<string | null> {
  const normalized = normalizeAtHandle(handle);
  const rows = await resolveTxt(`_atproto.${normalized}`).catch(() => []);
  for (const row of rows) {
    const value = row.join("").trim();
    const did = value.replace(/^did=/, "");
    if (did.startsWith("did:")) return did;
  }
  return null;
}

export async function resolveDidViaHttpsWellKnown(
  handle: string,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  const normalized = normalizeAtHandle(handle);
  const response = await fetchImpl(`https://${normalized}/.well-known/atproto-did`, {
    redirect: "follow",
  }).catch(() => null);
  if (!response || !response.ok) return null;
  const text = (await response.text()).trim();
  return text.startsWith("did:") ? text : null;
}

export async function resolveAtprotoHandleViaPublicResolver(
  handle: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ did: string | null; error: "unresolved" | "unavailable" | "invalid_response" | null }> {
  const normalized = normalizeAtHandle(handle);
  const url = new URL("/xrpc/com.atproto.identity.resolveHandle", "https://bsky.social");
  url.searchParams.set("handle", normalized);
  const response = await fetchImpl(url.toString(), { redirect: "follow" }).catch(() => null);
  if (!response) return { did: null, error: "unavailable" };
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (response.status === 400 && /unable to resolve handle/i.test(text)) {
      return { did: null, error: "unresolved" };
    }
    return { did: null, error: "unavailable" };
  }
  const payload = await response.json().catch(() => null);
  const did = typeof payload?.did === "string" ? payload.did : "";
  return did.startsWith("did:") ? { did, error: null } : { did: null, error: "invalid_response" };
}
