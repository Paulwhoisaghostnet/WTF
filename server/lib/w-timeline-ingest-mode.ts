export type WTimelineIngestMode = "off" | "digest" | "scraper" | "stream" | "search";

function normalizeMode(raw: string | undefined): WTimelineIngestMode | null {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "off" || value === "disabled" || value === "none") return "off";
  if (value === "digest" || value === "scraper" || value === "scrape" || value === "bot") {
    return "digest";
  }
  if (value === "stream" || value === "filtered-stream" || value === "filtered_stream") {
    return "stream";
  }
  if (value === "search" || value === "recovery" || value === "api-search") return "search";
  return null;
}

/** Primary ingest selector for W timeline posts (defaults to login scraper, not paid stream). */
export function getWTimelineIngestMode(): WTimelineIngestMode {
  const explicit = normalizeMode(process.env.W_TIMELINE_INGEST_MODE);
  if (explicit) return explicit;

  const streamFlag = String(process.env.W_TIMELINE_STREAM_ENABLED ?? "0").trim().toLowerCase();
  if (streamFlag === "1" || streamFlag === "true" || streamFlag === "yes" || streamFlag === "on") {
    return "stream";
  }

  const scraperFlag = String(process.env.W_TIMELINE_SCRAPER_ENABLED ?? "1").trim().toLowerCase();
  if (scraperFlag === "0" || scraperFlag === "false" || scraperFlag === "no" || scraperFlag === "off") {
    return "off";
  }

  return "digest";
}

/** Read-only W Tezos digest (profile URL scrape, no X API). */
export function isWDigestAppActive(): boolean {
  const mode = getWTimelineIngestMode();
  return mode === "digest" || mode === "scraper";
}

export function isWTimelineStreamIngestActive(): boolean {
  return getWTimelineIngestMode() === "stream";
}

export function isWTimelineScraperIngestActive(): boolean {
  return isWDigestAppActive();
}
