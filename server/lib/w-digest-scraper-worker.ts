import { register, type JobResult } from "./scheduler";
import { isWDigestAppActive } from "./w-timeline-ingest-mode";
import { runDigestScraperIngest } from "../features/w/digest/scraper";
import {
  getDigestScraperIntervalMs,
  isDigestScraperConfigured,
} from "../features/w/digest/scraper-env";

export async function runDigestScraperJob(): Promise<JobResult> {
  if (!isWDigestAppActive()) {
    return { itemsIn: 0, itemsOut: 0, cursorAfter: { skipped: "digest_mode_inactive" } };
  }
  if (!isDigestScraperConfigured()) {
    console.warn(
      "[w-digest-scraper] Set W_X_SCRAPER_STORAGE_STATE or W_X_SCRAPER_USERNAME + W_X_SCRAPER_PASSWORD"
    );
    return { itemsIn: 0, itemsOut: 0, cursorAfter: { skipped: "missing_scraper_config" } };
  }

  const result = await runDigestScraperIngest();
  return {
    itemsIn: result.handles,
    itemsOut: result.stored,
    cursorAfter: result.skippedReason ? { skipped: result.skippedReason } : undefined,
  };
}

export function registerDigestScraperWorker(): void {
  if (!isWDigestAppActive()) {
    console.log("[w-digest-scraper] disabled (W digest mode inactive)");
    return;
  }
  register({
    name: "w-digest-scraper",
    fn: runDigestScraperJob,
    intervalMs: getDigestScraperIntervalMs(),
    initialDelayMs: 60_000,
    scope: "w-digest",
  });
  console.log(
    `[w-digest-scraper] scheduled every ${Math.round(getDigestScraperIntervalMs() / 1000)}s (profile URL scrape only)`
  );
}
