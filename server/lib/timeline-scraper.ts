/**
 * W timeline ingest via logged-in X web scrape (no Filtered Stream / Search API credits).
 *
 * Requires a Playwright storage-state file from a one-time login export
 * (`scripts/w-x-timeline-scraper.mjs --save-session`).
 */

import { loadStreamRuleHandleSources } from "./timeline-stream";
import { upsertTimelinePostMinimal } from "./timeline-db";
import { logSystemEvent } from "./system-log";

export type ScrapedTimelinePost = {
  id: string;
  authorHandle: string;
  text: string | null;
  displayText: string | null;
  createdAt: Date;
};

const STATUS_ID_RE = /\/status\/(\d+)(?:\?|#|$)/i;

function scraperIntervalMs(): number {
  return Math.max(120_000, Number(process.env.W_TIMELINE_SCRAPER_INTERVAL_MS || 600_000));
}

function maxHandlesPerRun(): number {
  return Math.max(1, Math.min(500, Number(process.env.W_TIMELINE_SCRAPER_MAX_HANDLES || 80)));
}

function maxPostsPerHandle(): number {
  return Math.max(1, Math.min(40, Number(process.env.W_TIMELINE_SCRAPER_MAX_POSTS_PER_HANDLE || 12)));
}

export function getTimelineScraperStorageStatePath(): string {
  return String(process.env.W_X_SCRAPER_STORAGE_STATE || "").trim();
}

export function isTimelineScraperConfigured(): boolean {
  return Boolean(getTimelineScraperStorageStatePath());
}

export function parseStatusUrl(href: string): { id: string; handle: string } | null {
  try {
    const url = new URL(href, "https://x.com");
    const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/i);
    if (!match) return null;
    const handle = match[1]!.replace(/^@+/, "").toLowerCase();
    const id = match[2]!;
    if (!/^[a-z0-9_]{1,15}$/.test(handle) || !/^\d+$/.test(id)) return null;
    return { id, handle };
  } catch {
    const match = String(href).match(STATUS_ID_RE);
    if (!match) return null;
    return { id: match[1]!, handle: "" };
  }
}

/** DOM extraction for X profile timelines (unit-testable without Playwright). */
export function extractPostsFromProfileHtml(
  html: string,
  expectedHandle: string
): ScrapedTimelinePost[] {
  const handle = expectedHandle.replace(/^@+/, "").toLowerCase();
  const posts: ScrapedTimelinePost[] = [];
  const seen = new Set<string>();

  const articleChunks = html.split(/data-testid=["']tweet["']/i).slice(1);
  for (const chunk of articleChunks) {
    const statusMatch =
      chunk.match(/href=["']([^"']*\/status\/\d+[^"']*)["']/i) ||
      chunk.match(/href=([^ >]*\/status\/\d+[^ >]*)/i);
    if (!statusMatch) continue;
    const parsed = parseStatusUrl(statusMatch[1]!);
    if (!parsed || seen.has(parsed.id)) continue;
    if (parsed.handle && parsed.handle !== handle) continue;
    seen.add(parsed.id);

    const timeMatch = chunk.match(/datetime=["']([^"']+)["']/i);
    const createdAt = timeMatch ? new Date(timeMatch[1]!) : new Date();
    if (Number.isNaN(createdAt.getTime())) continue;

    const textMatch = chunk.match(/data-testid=["']tweetText["'][^>]*>([\s\S]*?)<\/div>/i);
    const rawText = textMatch
      ? textMatch[1]!
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
      : null;

    posts.push({
      id: parsed.id,
      authorHandle: handle,
      text: rawText,
      displayText: rawText,
      createdAt,
    });
    if (posts.length >= maxPostsPerHandle()) break;
  }

  return posts;
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (err) {
    const message =
      "Playwright is required for W timeline scraper mode. Install it on the host " +
      "(`npm install playwright && npx playwright install chromium`) or run " +
      "`npx tsx scripts/w-x-timeline-scraper.mjs` from a machine with browsers.";
    const wrapped = new Error(message);
    (wrapped as Error & { cause?: unknown }).cause = err;
    throw wrapped;
  }
}

async function scrapeHandleWithPlaywright(
  handle: string,
  storageStatePath: string
): Promise<ScrapedTimelinePost[]> {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: String(process.env.W_TIMELINE_SCRAPER_HEADLESS ?? "1") !== "0",
  });
  try {
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();
    await page.goto(`https://x.com/${handle}`, {
      waitUntil: "domcontentloaded",
      timeout: Math.max(15_000, Number(process.env.W_TIMELINE_SCRAPER_NAV_TIMEOUT_MS || 45_000)),
    });
    await page.waitForTimeout(1_500);
    try {
      await page.waitForSelector('article[data-testid="tweet"]', { timeout: 8_000 });
    } catch {
      // Profile may be empty or layout changed; still attempt DOM parse.
    }
    await page.evaluate(() => window.scrollBy(0, 1200));
    await page.waitForTimeout(800);

    const scraped = await page.evaluate((limit) => {
      const rows: Array<{
        id: string;
        href: string;
        text: string | null;
        createdAt: string | null;
      }> = [];
      const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
      for (const article of articles) {
        const link = article.querySelector('a[href*="/status/"]') as HTMLAnchorElement | null;
        if (!link?.href) continue;
        const time = article.querySelector("time") as HTMLTimeElement | null;
        const textNode = article.querySelector('[data-testid="tweetText"]');
        rows.push({
          id: "",
          href: link.href,
          text: textNode?.textContent?.trim() || null,
          createdAt: time?.getAttribute("datetime") || null,
        });
        if (rows.length >= limit) break;
      }
      return rows;
    }, maxPostsPerHandle());

    const posts: ScrapedTimelinePost[] = [];
    for (const row of scraped) {
      const parsed = parseStatusUrl(row.href);
      if (!parsed) continue;
      const authorHandle = parsed.handle || handle;
      if (authorHandle !== handle) continue;
      const createdAt = row.createdAt ? new Date(row.createdAt) : new Date();
      if (Number.isNaN(createdAt.getTime())) continue;
      posts.push({
        id: parsed.id,
        authorHandle: handle,
        text: row.text,
        displayText: row.text,
        createdAt,
      });
    }
    await context.close();
    return posts;
  } finally {
    await browser.close();
  }
}

export async function loadTimelineScrapeHandles(): Promise<string[]> {
  const sources = await loadStreamRuleHandleSources();
  return sources.handles.slice(0, maxHandlesPerRun());
}

export async function runTimelineScraperIngest(): Promise<{
  handles: number;
  stored: number;
  skippedReason?: string;
}> {
  const storageStatePath = getTimelineScraperStorageStatePath();
  if (!storageStatePath) {
    return {
      handles: 0,
      stored: 0,
      skippedReason: "missing_W_X_SCRAPER_STORAGE_STATE",
    };
  }

  const handles = await loadTimelineScrapeHandles();
  if (handles.length === 0) {
    return { handles: 0, stored: 0, skippedReason: "no_handles" };
  }

  let stored = 0;
  for (const handle of handles) {
    try {
      const posts = await scrapeHandleWithPlaywright(handle, storageStatePath);
      for (const post of posts) {
        await upsertTimelinePostMinimal({
          id: post.id,
          authorTwitterId: `web-${post.authorHandle}`,
          authorHandle: post.authorHandle,
          createdAt: post.createdAt,
          text: post.text,
          displayText: post.displayText,
        });
        stored += 1;
      }
    } catch (err: any) {
      console.warn(`[timeline-scraper] ${handle}:`, err?.message || err);
      logSystemEvent({
        source: "timeline-scraper",
        eventType: "w.timeline_scrape.handle_failed",
        severity: "warn",
        message: String(err?.message || err),
        metadata: { handle },
      });
    }
  }

  if (stored > 0) {
    console.log(`[timeline-scraper] stored ${stored} post(s) across ${handles.length} handle(s)`);
  }

  return { handles: handles.length, stored };
}

export function getTimelineScraperIntervalMs(): number {
  return scraperIntervalMs();
}
