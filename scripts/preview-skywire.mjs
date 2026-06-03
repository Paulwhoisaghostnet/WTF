#!/usr/bin/env node
/**
 * Interactive Skywire UI preview (no WTF login required).
 *
 * Serves the built client through the Playwright inventory harness with mocked
 * Skywire APIs, then opens the browser. Dev server (:3000) returns 401 for /skywire
 * until you log into WTF OS — use this script instead for layout review.
 */
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const distIndex = path.join(root, "dist/public/index.html");
const previewDir = path.join(root, "docs/skywire-ui-preview");
const imageDir = path.join(previewDir, "images");
const port = Number(process.env.HARNESS_PORT || 4173);
const base = `http://127.0.0.1:${port}`;

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function portOpen() {
  try {
    const res = await fetch(`${base}/`);
    return res.ok;
  } catch {
    return false;
  }
}

async function ensureBuild() {
  if (existsSync(distIndex)) return;
  console.log("[preview:skywire] dist/public missing — running vite build…");
  execSync("npx vite build", { cwd: root, stdio: "inherit" });
}

async function ensureHarness() {
  if (await portOpen()) {
    console.log(`[preview:skywire] reusing harness on ${base}`);
    return null;
  }
  console.log(`[preview:skywire] starting harness on ${base}`);
  const child = spawn(
    process.execPath,
    ["-e", "import('./tests/playwright/harness.mjs'); setInterval(() => {}, 1000)"],
    {
      cwd: root,
      env: { ...process.env, HARNESS_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    },
  );
  child.unref();

  for (let i = 0; i < 40; i += 1) {
    if (await portOpen()) return child;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Harness did not start on ${base}`);
}

async function captureScreenshots() {
  mkdirSync(imageDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.request.post(`${base}/__test/state`, { data: { userRole: "admin" } });

  const shots = [
    { path: "/skywire", file: "01-home.png", nav: null },
    { path: "/skywire", file: "02-settings.png", nav: "Settings" },
    { path: "/skywire", file: "03-search.png", nav: "Search" },
    { path: "/live", file: "04-wtf-live.png", nav: null },
  ];

  for (const shot of shots) {
    await page.goto(`${base}${shot.path}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    if (shot.nav) {
      const btn = page
        .locator('nav[aria-label="Skywire navigation"] button')
        .filter({ hasText: shot.nav })
        .first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(700);
      }
    }
    const target = path.join(imageDir, shot.file);
    await page.screenshot({ path: target, fullPage: false });
    console.log(`[preview:skywire] wrote ${path.relative(root, target)}`);
  }

  await browser.close();
}

function writeGallery() {
  mkdirSync(previewDir, { recursive: true });
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Skywire UI Preview</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; background: #0b1e3d; color: #eef; }
    h1 { margin-bottom: 8px; }
    p, li { line-height: 1.5; max-width: 72ch; }
    a { color: #7ee8ff; }
    .live { display: inline-block; margin: 12px 0 24px; padding: 10px 16px; background: #008080; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; }
    .grid { display: grid; gap: 20px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
    figure { margin: 0; background: #132a52; padding: 12px; border-radius: 8px; }
    img { width: 100%; border: 1px solid #2a4a7a; border-radius: 4px; }
    figcaption { margin-top: 8px; font-size: 14px; color: #bcd; }
    code { background: #1a3358; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>Skywire UI Preview</h1>
  <p>Static captures from the inventory harness. For the interactive mock (no WTF login), use:</p>
  <a class="live" href="${base}/skywire" target="_blank" rel="noopener">Open live mock → ${base}/skywire</a>
  <p><strong>Note:</strong> <code>http://localhost:3000/skywire</code> requires a logged-in WTF session. Use port ${port} for layout preview.</p>
  <div class="grid">
    <figure><img src="images/01-home.png" alt="Skywire Home" /><figcaption>Home — sidebar + inline composer</figcaption></figure>
    <figure><img src="images/02-settings.png" alt="Skywire Settings" /><figcaption>Settings — connection &amp; permission tiers</figcaption></figure>
    <figure><img src="images/03-search.png" alt="Skywire Search" /><figcaption>Search / Discover</figcaption></figure>
    <figure><img src="images/04-wtf-live.png" alt="WTF LIVE" /><figcaption>WTF LIVE — rooms-focused nav</figcaption></figure>
  </div>
</body>
</html>`;
  const indexPath = path.join(previewDir, "index.html");
  const indexContent = html;
  writeFileSync(indexPath, indexContent, "utf8");
  console.log(`[preview:skywire] gallery ${path.relative(root, indexPath)}`);
  return indexPath;
}

async function openTargets(indexPath, liveUrl) {
  if (process.env.PREVIEW_NO_OPEN === "1") return;
  try {
    execSync(`open "${liveUrl}"`, { stdio: "ignore" });
    execSync(`open "${indexPath}"`, { stdio: "ignore" });
  } catch {
    console.log(`[preview:skywire] open manually:\n  ${liveUrl}\n  file://${indexPath}`);
  }
}

await ensureBuild();
await ensureHarness();
await captureScreenshots();
const indexPath = writeGallery();
console.log(`\nSkywire preview ready:\n  Live mock: ${base}/skywire\n  Gallery:   file://${indexPath}\n`);
await openTargets(indexPath, `${base}/skywire`);
