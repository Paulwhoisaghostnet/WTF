#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const catalog = JSON.parse(
  await fs.readFile(path.join(root, "shared/wtfos-promos.json"), "utf8")
);
const selectedSlug = process.argv.find((value) => value.startsWith("--slug="))?.slice(7);
const promos = selectedSlug
  ? catalog.filter((promo) => promo.slug === selectedSlug)
  : catalog;
if (!promos.length) throw new Error(`Unknown wtfOS promo slug: ${selectedSlug}`);

const outputRoot = path.join(root, "output/wtfos-promos");
const recordingDir = path.join(outputRoot, "recordings");
const reviewDir = path.join(outputRoot, "review");
const port = 4201;
const baseUrl = `http://127.0.0.1:${port}`;
const accountName = "TommyTezos";
const forbiddenAccounts = /WTF Admin|wtf[-_]admin|WTF User|wtf[-_]user/gi;
let harness = null;

await fs.mkdir(recordingDir, { recursive: true });
await fs.mkdir(reviewDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHarness() {
  while (true) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch {}
    if (harness?.exitCode !== null) {
      throw new Error(`Promo recording harness exited before ${baseUrl} became ready`);
    }
    await sleep(250);
  }
}

async function setHarnessState() {
  const response = await fetch(`${baseUrl}/__test/state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "normal",
      userRole: "admin",
      userId: 42,
      username: accountName,
      displayName: accountName,
      skywireHandle: "tommytezos.bsky.social",
      welcomePending: false,
      driveConnected: true,
    }),
  });
  if (!response.ok) throw new Error(`Could not set promo harness state: ${response.status}`);
}

async function normalizeAccountText(page) {
  await page.evaluate(({ accountName }) => {
    const forbidden = /WTF Admin|wtf[-_]admin|WTF User|wtf[-_]user/gi;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const value = node.nodeValue || "";
      if (forbidden.test(value)) node.nodeValue = value.replace(forbidden, accountName);
      forbidden.lastIndex = 0;
    }
  }, { accountName });
}

async function firstVisible(locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function clickVisible(page, locator, label) {
  await locator.first().waitFor({ state: "visible" }).catch(() => undefined);
  const target = await firstVisible(locator);
  if (!target) throw new Error(`Missing visible promo target: ${label}`);
  await target.scrollIntoViewIfNeeded().catch(() => undefined);
  const box = await target.boundingBox();
  if (!box) throw new Error(`Promo target has no box: ${label}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
  await target.click({ force: true });
  await sleep(420);
}

async function tuneGuideChannel(page) {
  await clickVisible(
    page,
    page.getByRole("button", { name: "Turn TV power on" }),
    "Turn TV power on"
  );
  await clickVisible(
    page,
    page.getByRole("button", { name: "Open TV menu" }),
    "Open TV menu"
  );
  await clickVisible(page, page.getByText("CHANNELS", { exact: true }), "CHANNELS");
  await clickVisible(
    page,
    page.getByText("wtfOS Guide TV", { exact: true }),
    "wtfOS Guide TV"
  );
}

async function installPromoFrame(page, promo, scene, sceneIndex) {
  await page.addStyleTag({ content: `
    [data-wtf-promo-frame] { position: fixed; z-index: 2147483647; inset: 0; pointer-events: none;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif; color: #fff; }
    [data-wtf-promo-brand] { position: absolute; top: 22px; left: 24px; display: flex; gap: 10px;
      align-items: center; padding: 9px 13px; background: rgba(5,7,10,.91); border: 2px solid #00d2ff;
      border-radius: 999px; box-shadow: 0 10px 34px rgba(0,0,0,.38); font-weight: 900; letter-spacing: .06em; }
    [data-wtf-promo-brand] span { color: #d6ff3f; }
    [data-wtf-promo-account] { position: absolute; top: 22px; right: 24px; padding: 9px 13px;
      background: rgba(5,7,10,.91); border: 2px solid #d6ff3f; border-radius: 999px; font-weight: 800; }
    [data-wtf-promo-copy] { position: absolute; left: 24px; right: 24px; bottom: 24px; max-width: 780px;
      padding: 17px 20px; background: linear-gradient(115deg, rgba(5,7,10,.97), rgba(8,24,31,.94));
      border-left: 7px solid #d6ff3f; border-bottom: 2px solid #00d2ff; border-radius: 7px;
      box-shadow: 0 16px 48px rgba(0,0,0,.55); }
    [data-wtf-promo-copy] strong { display: block; margin-bottom: 5px; color: #00d2ff;
      font: 900 13px ui-monospace, monospace; letter-spacing: .1em; text-transform: uppercase; }
    [data-wtf-promo-copy] h1 { margin: 0 0 5px; color: #fff; font-size: 29px; line-height: 1.05; }
    [data-wtf-promo-copy] p { margin: 0; color: #f2ead9; font-size: 17px; line-height: 1.35; }
    [data-wtf-promo-highlight] { outline: 4px solid #d6ff3f !important; outline-offset: 5px !important;
      box-shadow: 0 0 0 9999px rgba(0,0,0,.16) !important; position: relative; z-index: 2147483646 !important; }
    [data-wtf-demo-cursor] { position: fixed; z-index: 2147483647; left: 70px; top: 80px;
      width: 22px; height: 30px; pointer-events: none; transform: translate(-3px, -2px);
      filter: drop-shadow(0 2px 2px rgba(0,0,0,.8)); }
    [data-wtf-demo-cursor]::before { content: ""; display: block; width: 22px; height: 30px;
      background: #fff; clip-path: polygon(0 0, 0 82%, 28% 63%, 43% 100%, 58% 93%, 42% 57%, 78% 55%); }
    [data-wtf-demo-cursor][data-clicking="true"] { filter: drop-shadow(0 0 7px #d6ff3f); }
  ` });
  await page.evaluate(({ promo, scene, sceneIndex, accountName }) => {
    document.querySelectorAll("[data-wtf-promo-frame],[data-wtf-demo-cursor]").forEach((node) => node.remove());
    const frame = document.createElement("section");
    frame.dataset.wtfPromoFrame = "true";
    frame.setAttribute("aria-label", "wtfOS promotional narration card");
    frame.innerHTML = `
      <div data-wtf-promo-brand><span>wtfOS</span> ${promo.category}</div>
      <div data-wtf-promo-account>Account · ${accountName}</div>
      <div data-wtf-promo-copy>
        <strong>${String(sceneIndex + 1).padStart(2, "0")} / ${String(promo.scenes.length).padStart(2, "0")} · ${promo.title}</strong>
        <h1>${scene.label}</h1>
        <p>${scene.copy}</p>
      </div>`;
    const cursor = document.createElement("div");
    cursor.dataset.wtfDemoCursor = "true";
    document.addEventListener("mousemove", (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    });
    document.body.append(frame, cursor);
  }, { promo, scene, sceneIndex, accountName });

  if (scene.highlight) {
    const target = page.getByText(scene.highlight, { exact: false }).first();
    if (await target.count()) {
      await target.scrollIntoViewIfNeeded().catch(() => undefined);
      await target.evaluate((node) => node.setAttribute("data-wtf-promo-highlight", "true"))
        .catch(() => undefined);
      const box = await target.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 26 });
        await page.evaluate(() => {
          document.querySelector("[data-wtf-demo-cursor]")?.setAttribute("data-clicking", "true");
        });
        await page.mouse.down();
        await sleep(100);
        await page.mouse.up();
        await page.evaluate(() => {
          document.querySelector("[data-wtf-demo-cursor]")?.removeAttribute("data-clicking");
        });
      }
    }
  }
}

async function recordPromo(browser, promo) {
  const timing = JSON.parse(
    await fs.readFile(path.join(outputRoot, "narration", `${promo.slug}.timings.json`), "utf8")
  );
  if (timing.segments.length !== promo.scenes.length) {
    throw new Error(`${promo.slug} narration segments do not match promo scenes`);
  }
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: recordingDir, size: { width: 1280, height: 720 } },
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  for (let index = 0; index < promo.scenes.length; index += 1) {
    const scene = promo.scenes[index];
    const startedAt = Date.now();
    if (index > 0) {
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      }).catch(() => undefined);
    }
    await page.goto(`${baseUrl}${scene.route}`, { waitUntil: "domcontentloaded" });
    await sleep(1000);
    if (scene.route === "/tv") await tuneGuideChannel(page);
    await normalizeAccountText(page);
    await installPromoFrame(page, promo, scene, index);
    await sleep(800);
    await page.screenshot({
      path: path.join(reviewDir, `${promo.slug}-scene-${String(index + 1).padStart(2, "0")}.png`),
    });
    const targetMs = Math.round(timing.segments[index].durationSeconds * 1000) + 220;
    await sleep(Math.max(320, targetMs - (Date.now() - startedAt)));
  }

  const bodyText = await page.locator("body").innerText();
  if (!bodyText.includes(accountName)) throw new Error(`${promo.slug} did not show ${accountName}`);
  if (forbiddenAccounts.test(bodyText)) {
    forbiddenAccounts.lastIndex = 0;
    throw new Error(`${promo.slug} leaked a non-TommyTezos fixture account`);
  }
  forbiddenAccounts.lastIndex = 0;
  if (pageErrors.length) throw new Error(`${promo.slug} page errors: ${pageErrors.join(" | ")}`);

  const video = page.video();
  await context.close();
  if (!video) throw new Error(`Playwright did not create a video for ${promo.slug}`);
  const source = await video.path();
  const destination = path.join(recordingDir, `${promo.slug}.webm`);
  await fs.copyFile(source, destination);
  if (source !== destination) await fs.unlink(source).catch(() => undefined);
  console.log(`[promo recording] ${promo.slug} -> ${destination}`);
}

try {
  harness = spawn(process.execPath, ["tests/playwright/harness.mjs"], {
    cwd: root,
    env: { ...process.env, HARNESS_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  harness.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await waitForHarness();
  await setHarnessState();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const promo of promos) await recordPromo(browser, promo);
  } finally {
    await browser.close();
  }
} finally {
  harness?.kill("SIGTERM");
}
