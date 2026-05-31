/**
 * Innocuous X profile scrape: visit public profile pages and record /status/ URLs only.
 * Uses Playwright with storage state and/or W_X_SCRAPER_USERNAME + W_X_SCRAPER_PASSWORD login.
 */

import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { logSystemEvent } from "../../../lib/system-log";
import { parseStatusUrl } from "../../../lib/timeline-scraper";
import { listEnabledDigestHandles } from "./handles";
import { buildXPostUrl, ingestScrapedDigestPosts, markDigestHandleScrapeFailed } from "./posts";
import {
  getDigestScraperCredentials,
  getDigestScraperStorageStatePath,
  isDigestScraperConfigured,
} from "./scraper-env";

export type ScrapedDigestPost = {
  id: string;
  postUrl: string;
  postedAt: Date | null;
};

const INITIAL_SCRAPE_LIMIT = Math.max(
  1,
  Math.min(25, Number(process.env.W_DIGEST_INITIAL_POSTS_PER_HANDLE || 25))
);

function scrapeLimitForHandle(initialScrapeCompleted: boolean): number {
  if (!initialScrapeCompleted) return INITIAL_SCRAPE_LIMIT;
  return Math.max(
    5,
    Math.min(40, Number(process.env.W_DIGEST_INCREMENTAL_POSTS_PER_HANDLE || 20))
  );
}

export {
  getDigestScraperCredentials,
  getDigestScraperIntervalMs,
  getDigestScraperStorageStatePath,
  isDigestScraperConfigured,
} from "./scraper-env";

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (err) {
    const message =
      "Playwright is required for W digest scraper. Install: npm install playwright && npx playwright install chromium";
    const wrapped = new Error(message);
    (wrapped as Error & { cause?: unknown }).cause = err;
    throw wrapped;
  }
}

async function resolveScraperStorageStatePath(): Promise<string | null> {
  const storagePath = getDigestScraperStorageStatePath();
  if (!storagePath) return null;
  if (!existsSync(storagePath)) return null;
  return storagePath;
}

async function ensureScraperContext(browser: import("playwright").Browser) {
  const storagePath = await resolveScraperStorageStatePath();
  if (storagePath) {
    return browser.newContext({ storageState: storagePath });
  }

  const creds = getDigestScraperCredentials();
  if (!creds) {
    throw new Error("missing_W_X_SCRAPER_STORAGE_STATE_or_credentials");
  }

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  await page.goto("https://x.com/i/flow/login", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(2_000);

  const userInput = page.locator(
    'input[name="username_or_email"], input[autocomplete="username"], input[name="text"]'
  );
  await userInput.first().fill(creds.username, { timeout: 30_000 });

  const passwordInput = page.locator('input[type="password"], input[name="password"]');
  if (await passwordInput.count()) {
    await passwordInput.first().fill(creds.password, { timeout: 20_000 });
  } else {
    const nextBtn = page.getByRole("button", { name: /next/i });
    if (await nextBtn.count()) await nextBtn.first().click();
    await passwordInput.first().fill(creds.password, { timeout: 20_000 });
  }

  const loginBtn = page.getByRole("button", { name: /log in|sign in/i });
  if (await loginBtn.count()) {
    await loginBtn.first().click();
  } else {
    await page.keyboard.press("Enter");
  }
  await page
    .waitForURL(/x\.com\/(home|i\/(?!flow)|[^/]+)/, { timeout: 90_000 })
    .catch(() => undefined);
  await page.waitForTimeout(3_000);

  const persistPath = getDigestScraperStorageStatePath();
  if (persistPath) {
    await mkdir(path.dirname(persistPath), { recursive: true });
    await context.storageState({ path: persistPath });
  }

  await page.close();
  return context;
}

export async function scrapeDigestHandleProfile(
  handle: string,
  limit: number,
  context: import("playwright").BrowserContext
): Promise<ScrapedDigestPost[]> {
  const page = await context.newPage();
  try {
    await page.goto(`https://x.com/${handle}`, {
      waitUntil: "domcontentloaded",
      timeout: Math.max(15_000, Number(process.env.W_TIMELINE_SCRAPER_NAV_TIMEOUT_MS || 45_000)),
    });
    await page.waitForTimeout(1_500);
    try {
      await page.waitForSelector('article[data-testid="tweet"]', { timeout: 8_000 });
    } catch {
      // empty or layout change
    }
    await page.evaluate(() => window.scrollBy(0, 1400));
    await page.waitForTimeout(900);

    const rows = await page.evaluate((maxRows) => {
      const out: Array<{ href: string; createdAt: string | null }> = [];
      const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      for (const article of articles) {
        const link = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
        if (!link?.href) continue;
        const time = article.querySelector("time") as HTMLTimeElement | null;
        out.push({
          href: link.href,
          createdAt: time?.getAttribute("datetime") || null,
        });
        if (out.length >= maxRows) break;
      }
      return out;
    }, limit);

    const posts: ScrapedDigestPost[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const parsed = parseStatusUrl(row.href);
      if (!parsed || seen.has(parsed.id)) continue;
      const authorHandle = (parsed.handle || handle).toLowerCase();
      if (authorHandle !== handle) continue;
      seen.add(parsed.id);
      const postedAt = row.createdAt ? new Date(row.createdAt) : null;
      if (postedAt && Number.isNaN(postedAt.getTime())) continue;
      posts.push({
        id: parsed.id,
        postUrl: buildXPostUrl(handle, parsed.id),
        postedAt,
      });
    }
    return posts;
  } finally {
    await page.close();
  }
}

export async function runDigestScraperIngest(): Promise<{
  handles: number;
  stored: number;
  skippedReason?: string;
}> {
  if (!isDigestScraperConfigured()) {
    return {
      handles: 0,
      stored: 0,
      skippedReason: "missing_scraper_session_or_credentials",
    };
  }

  const handleRows = await listEnabledDigestHandles();
  if (handleRows.length === 0) {
    return { handles: 0, stored: 0, skippedReason: "no_enabled_handles" };
  }

  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: String(process.env.W_TIMELINE_SCRAPER_HEADLESS ?? "1") !== "0",
  });

  let stored = 0;
  try {
    const context = await ensureScraperContext(browser);
    for (const row of handleRows) {
      const limit = scrapeLimitForHandle(row.initialScrapeCompleted);
      try {
        const scraped = await scrapeDigestHandleProfile(row.handle, limit, context);
        const result = await ingestScrapedDigestPosts(row.handle, scraped);
        stored += result.inserted;
      } catch (err: any) {
        console.warn(`[w-digest-scraper] ${row.handle}:`, err?.message || err);
        await markDigestHandleScrapeFailed(row.handle);
        logSystemEvent({
          source: "w-digest-scraper",
          eventType: "w.digest.scrape.handle_failed",
          severity: "warn",
          message: String(err?.message || err),
          metadata: { handle: row.handle },
        });
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }

  if (stored > 0) {
    console.log(`[w-digest-scraper] stored ${stored} new post URL(s) across ${handleRows.length} handle(s)`);
  }

  return { handles: handleRows.length, stored };
}

