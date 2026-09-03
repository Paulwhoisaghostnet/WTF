import { normalizeIpfsUri } from "@shared/ipfs-gateways";
import { isPrivateOrLocalHost, parseHostAllowlist } from "./network-safety";

/**
 * Allowlist for thumbnail host names that the marketplace / barter /
 * profile routes will echo back to clients.  We can't point the
 * allowlist at arbitrary user-chosen hosts because those URLs are then
 * rendered inside other users' browsers — a phishing image at
 * `https://evil.example.com/track.png` would leak IP + referrer and
 * could abuse cookies if served from a matching domain.  IPFS gateways
 * plus a handful of well-known Tezos/NFT CDNs cover every legitimate
 * case we've seen.
 */
const DEFAULT_ALLOWED_HOSTS = [
  "ipfs.io",
  "gateway.ipfs.io",
  "cloudflare-ipfs.com",
  "dweb.link",
  "w3s.link",
  "nftstorage.link",
  "ipfs.fileship.xyz",
  "gateway.pinata.cloud",
  "pinata.cloud",
  "cf-ipfs.com",
  "cdn.objkt.com",
  "assets.objkt.media",
  "static.objkt.com",
  "objkt.com",
  "img.objkt.media",
  "d1gwr65d5f82a3.cloudfront.net", // versum
  "fxhash2.xyz",
  "gateway.fxhash.xyz",
  "media.fxhash.xyz",
  "onchfs.com",
  "assets.tezos.marketplace",
  "tezos-nft.dev.objkt.com",
  "data.tezos.domains",
  "teztok.com",
  "api.teztok.com",
];

let cachedAllowlist: string[] | null = null;
function getAllowlist(): string[] {
  if (cachedAllowlist) return cachedAllowlist;
  const fromEnv = parseHostAllowlist(process.env.THUMBNAIL_ALLOWED_HOSTS);
  const merged = new Set<string>([
    ...DEFAULT_ALLOWED_HOSTS.map((h) => h.toLowerCase()),
    ...fromEnv,
  ]);
  cachedAllowlist = Array.from(merged);
  return cachedAllowlist;
}

function hostMatches(host: string, allowlist: string[]): boolean {
  const normalized = host.toLowerCase();
  return allowlist.some(
    (allowed) => normalized === allowed || normalized.endsWith(`.${allowed}`)
  );
}

/**
 * Accepts string-ish input (ipfs://, https://, http://) and returns an
 * https:// URL that points at one of the allowlisted hosts, or `null`
 * if the input is missing, private/loopback, disallowed, or malformed.
 *
 * `ipfs://` values are rewritten through the shared WTF gateway policy
 * rather than silently dropped so existing data (token metadata.thumbnailUri
 * etc.) keeps working.
 */
export function sanitizeThumbnailUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;

  if (value.startsWith("ipfs://")) {
    const normalized = normalizeIpfsUri(value);
    return normalized.startsWith("https://") ? normalized : null;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (isPrivateOrLocalHost(parsed.hostname)) return null;

  const allowlist = getAllowlist();
  if (!hostMatches(parsed.hostname, allowlist)) return null;

  // Force https — every host on the allowlist serves https.
  if (parsed.protocol === "http:") parsed.protocol = "https:";
  parsed.username = "";
  parsed.password = "";
  return parsed.toString();
}

export function getThumbnailAllowlistSnapshot(): string[] {
  return [...getAllowlist()];
}
