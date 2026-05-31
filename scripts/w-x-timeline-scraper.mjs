#!/usr/bin/env node
/**
 * One-shot W timeline scrape using a logged-in X session (Playwright).
 *
 * Setup (once):
 *   npx tsx scripts/w-x-timeline-scraper.mjs --save-session
 *
 * Cron / manual ingest:
 *   W_X_SCRAPER_STORAGE_STATE=./.secrets/x-scraper-storage.json \
 *   DATABASE_URL=postgresql://... \
 *   npx tsx scripts/w-x-timeline-scraper.mjs
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const saveSession = args.has("--save-session");
const storagePath =
  process.env.W_X_SCRAPER_STORAGE_STATE ||
  path.join(process.cwd(), ".secrets", "x-scraper-storage.json");

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (err) {
    console.error(
      "[w-x-scraper] Install Playwright first: npm install playwright && npx playwright install chromium"
    );
    throw err;
  }
}

async function saveScraperSession() {
  const { chromium } = await loadPlaywright();
  await mkdir(path.dirname(storagePath), { recursive: true });
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  console.log("[w-x-scraper] Log into X in the opened browser window, then press Enter here.");
  await page.goto("https://x.com/login", { waitUntil: "domcontentloaded" });
  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", resolve);
  });
  await context.storageState({ path: storagePath });
  await browser.close();
  await writeFile(
    path.join(path.dirname(storagePath), "README-x-scraper.txt"),
    [
      "X scraper session for W timeline ingest.",
      `File: ${storagePath}`,
      "Set W_X_SCRAPER_STORAGE_STATE to this path in production .env.",
      "Re-run --save-session when X forces a fresh login.",
      "",
    ].join("\n"),
    "utf8"
  );
  console.log(`[w-x-scraper] saved session → ${storagePath}`);
}

async function runIngest() {
  if (existsSync(storagePath)) {
    process.env.W_X_SCRAPER_STORAGE_STATE = storagePath;
  }
  const { runDigestScraperIngest } = await import("../server/features/w/digest/scraper.ts");
  const result = await runDigestScraperIngest();
  console.log("[w-x-scraper] done", result);
  if (result.skippedReason) process.exitCode = 1;
}

if (saveSession) {
  await saveScraperSession();
} else {
  await runIngest();
}
