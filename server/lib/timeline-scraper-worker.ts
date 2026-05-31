import { register, type JobResult } from "./scheduler";
import { isWTimelineScraperIngestActive } from "./w-timeline-ingest-mode";
import {
  getTimelineScraperIntervalMs,
  isTimelineScraperConfigured,
  runTimelineScraperIngest,
} from "./timeline-scraper";

export async function runTimelineScraperJob(): Promise<JobResult> {
  if (!isWTimelineScraperIngestActive()) {
    return { itemsIn: 0, itemsOut: 0, cursorAfter: { skipped: "scraper_mode_inactive" } };
  }
  if (!isTimelineScraperConfigured()) {
    console.warn(
      "[timeline-scraper] W_TIMELINE_INGEST_MODE=scraper but W_X_SCRAPER_STORAGE_STATE is unset; " +
        "run `npx tsx scripts/w-x-timeline-scraper.mjs --save-session` once, then point env at the file."
    );
    return { itemsIn: 0, itemsOut: 0, cursorAfter: { skipped: "missing_storage_state" } };
  }

  const result = await runTimelineScraperIngest();
  return {
    itemsIn: result.handles,
    itemsOut: result.stored,
    cursorAfter: result.skippedReason ? { skipped: result.skippedReason } : undefined,
  };
}

export function registerTimelineScraperWorker(): void {
  if (!isWTimelineScraperIngestActive()) {
    console.log("[timeline-scraper] ingest disabled (W_TIMELINE_INGEST_MODE is not scraper)");
    return;
  }
  register({
    name: "w-timeline-scraper",
    fn: runTimelineScraperJob,
    intervalMs: getTimelineScraperIntervalMs(),
    initialDelayMs: 60_000,
    scope: "w-timeline",
  });
  console.log(
    `[timeline-scraper] scheduled every ${Math.round(getTimelineScraperIntervalMs() / 1000)}s (no X API stream credits)`
  );
}
