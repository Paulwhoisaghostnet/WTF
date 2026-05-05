export function shortAddress(address: string | null | undefined): string {
  const v = String(address || "");
  return v.length < 12 ? v : `${v.slice(0, 7)}...${v.slice(-5)}`;
}

export function isGif(mimeType: string): boolean {
  return String(mimeType || "").toLowerCase() === "image/gif";
}

export function buildTvCacheUrl(uri: string | null | undefined): string | null {
  const value = String(uri || "").trim();
  if (!value) return null;
  return `/api/tv/cache/media?url=${encodeURIComponent(value)}`;
}
