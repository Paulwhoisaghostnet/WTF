/**
 * Resolve the token's primary (artifact) MIME type from FA2 / TZIP-12 style metadata.
 *
 * Indexers and marketplaces often add image/webp previews in `formats` or `displayUri`
 * while the on-chain artifact is PNG/JPEG/etc. We must not treat CDN preview types as
 * the artifact type.
 */

export function ipfsContentPath(uri: string): string {
  const raw = String(uri || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower.startsWith("ipfs://")) {
    return raw.slice(7).split("?")[0]!.replace(/^\/+/, "").toLowerCase();
  }
  try {
    const url = new URL(raw);
    const m = url.pathname.match(/\/ipfs\/(.+)$/i);
    if (m?.[1]) {
      return decodeURIComponent(m[1]).split("?")[0]!.toLowerCase();
    }
    const host = url.hostname.toLowerCase();
    const sub = host.match(/^([a-z0-9]+)\.ipfs\./i);
    if (sub?.[1]) {
      const tail = url.pathname.replace(/^\/+/, "");
      return `${sub[1].toLowerCase()}${tail ? `/${tail}` : ""}`.split("?")[0]!;
    }
  } catch {
    /* ignore */
  }
  return raw.split("?")[0]!.toLowerCase();
}

export function resourceUrisLikelySame(a: string, b: string): boolean {
  const pa = ipfsContentPath(a);
  const pb = ipfsContentPath(b);
  if (pa && pb && pa === pb) return true;
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  return na.length > 0 && na === nb;
}

function mimeFromArtifactPathOnly(artifactLower: string): string | null {
  if (artifactLower.endsWith(".mp4")) return "video/mp4";
  if (artifactLower.endsWith(".webm")) return "video/webm";
  if (artifactLower.endsWith(".mov")) return "video/quicktime";
  if (artifactLower.endsWith(".gif")) return "image/gif";
  if (artifactLower.endsWith(".png")) return "image/png";
  if (artifactLower.endsWith(".jpg") || artifactLower.endsWith(".jpeg")) return "image/jpeg";
  if (artifactLower.endsWith(".svg")) return "image/svg+xml";
  if (artifactLower.endsWith(".webp")) return "image/webp";
  return null;
}

type FormatRow = { uri: string; mime: string };

function parseFormats(meta: Record<string, unknown>): FormatRow[] {
  const formats = Array.isArray(meta.formats) ? meta.formats : [];
  const out: FormatRow[] = [];
  for (const row of formats) {
    const r = row as Record<string, unknown>;
    const uri = String(r?.uri || "").trim();
    const mime = String(r?.mimeType || r?.mime_type || "").trim().toLowerCase();
    if (uri && mime) out.push({ uri, mime });
  }
  return out;
}

/**
 * MIME type of the primary media (artifact), not preview/CDN variants.
 */
export function resolveArtifactMimeType(
  metadata: Record<string, unknown> | null | undefined
): string | null {
  const meta =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)
      : {};
  const artifactUri = String(meta.artifactUri || "").trim();
  const formats = parseFormats(meta);

  if (artifactUri && formats.length > 0) {
    const hit = formats.find((f) => resourceUrisLikelySame(f.uri, artifactUri));
    if (hit) return hit.mime;
  }

  const root = String(meta.mimeType || meta.mime_type || "").trim();
  if (root) return root.toLowerCase();

  if (formats.length === 1) return formats[0]!.mime;

  const nonWebp = formats.filter((f) => f.mime !== "image/webp");
  if (formats.some((f) => f.mime === "image/webp") && nonWebp.length > 0) {
    return nonWebp[0]!.mime;
  }

  if (formats.length > 0) return formats[0]!.mime;

  if (artifactUri) {
    const key = ipfsContentPath(artifactUri);
    const fromPath = mimeFromArtifactPathOnly(key);
    if (fromPath) return fromPath;
  }

  return null;
}
