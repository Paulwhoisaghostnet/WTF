#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const allTutorials = JSON.parse(await fs.readFile(path.join(root, "shared/faq-tutorials.json"), "utf8"));
const catalog = process.env.FAQ_TUTORIAL_SLUG
  ? allTutorials.filter((tutorial) => tutorial.slug === process.env.FAQ_TUTORIAL_SLUG)
  : allTutorials;
if (!catalog.length) throw new Error(`Unknown FAQ tutorial slug: ${process.env.FAQ_TUTORIAL_SLUG}`);
const outputDir = path.join(root, "output/faq-tutorials/recordings");
const port = Number(process.env.FAQ_TUTORIAL_HARNESS_PORT || 4199);
const baseUrl = process.env.FAQ_TUTORIAL_BASE_URL || `http://127.0.0.1:${port}`;
const accountName = "TommyTezos";
const forbiddenAccounts = /WTF Admin|wtf[-_]admin|WTF User|wtf[-_]user/gi;

await fs.mkdir(outputDir, { recursive: true });

async function waitForHarness() {
  while (true) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch {}
    if (harness && harness.exitCode !== null) {
      throw new Error(`FAQ recording harness exited before ${baseUrl} became ready`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

let harness = null;
if (!process.env.FAQ_TUTORIAL_BASE_URL) {
  harness = spawn(process.execPath, ["tests/playwright/harness.mjs"], {
    cwd: root,
    env: { ...process.env, HARNESS_PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  harness.stderr.on("data", (chunk) => process.stderr.write(chunk));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function setHarnessState(role = "admin", driveConnected = false) {
  const response = await fetch(`${baseUrl}/__test/state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "normal",
      userRole: role,
      userId: 42,
      username: accountName,
      displayName: accountName,
      skywireHandle: "tommytezos.bsky.social",
      welcomePending: false,
      driveConnected,
    }),
  });
  if (!response.ok) throw new Error(`Could not set harness state: ${response.status}`);
}

async function normalizeAccountText(page) {
  await page.evaluate(({ accountName }) => {
    const forbidden = /WTF Admin|wtf[-_]admin|WTF User|wtf[-_]user/gi;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (forbidden.test(node.nodeValue || "")) {
        node.nodeValue = (node.nodeValue || "").replace(forbidden, accountName);
      }
      forbidden.lastIndex = 0;
    }
  }, { accountName });
}

async function installTourFrame(page, tutorial) {
  await page.addStyleTag({ content: `
    [data-wtf-faq-tour] { position: fixed; z-index: 2147483647; left: 24px; right: 24px; bottom: 22px;
      display: grid; grid-template-columns: auto 1fr; gap: 16px; align-items: center; padding: 15px 18px;
      color: #f2ead9; background: rgba(7,7,6,.94); border: 2px solid #00d2ff; border-radius: 8px;
      box-shadow: 0 12px 40px rgba(0,0,0,.48); font-family: Inter, system-ui, sans-serif; }
    [data-wtf-faq-tour] strong { color: #d6ff3f; font-size: 14px; letter-spacing: .04em; }
    [data-wtf-faq-tour] h1 { margin: 0 0 4px; color: #fff; font-size: 21px; line-height: 1.15; }
    [data-wtf-faq-tour] p { margin: 0; font-size: 15px; line-height: 1.35; }
    [data-wtf-faq-step] { min-width: 76px; text-align: center; font: 700 18px ui-monospace, monospace; color: #00d2ff; }
    [data-wtf-faq-highlight] { outline: 4px solid #d6ff3f !important; outline-offset: 5px !important;
      box-shadow: 0 0 0 9999px rgba(0,0,0,.24) !important; position: relative; z-index: 2147483646 !important; }
  ` });
  await page.evaluate(({ title, accountName }) => {
    const frame = document.createElement("section");
    frame.dataset.wtfFaqTour = "true";
    frame.setAttribute("aria-label", "Tutorial narration card");
    frame.innerHTML = `<div data-wtf-faq-step>START</div><div><strong>ACCOUNT · ${accountName}</strong><h1>${title}</h1><p>Follow the highlighted controls in wtfOS.</p></div>`;
    document.body.appendChild(frame);
  }, { title: tutorial.title, accountName });
}

async function showStep(page, tutorial, index) {
  const step = tutorial.steps[index];
  if (tutorial.slug === "connect-google-drive" && index === 3) {
    await setHarnessState("admin", true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await sleep(800);
    await normalizeAccountText(page);
    await installTourFrame(page, tutorial);
  }
  if (tutorial.slug === "connect-google-drive" && index === 4) {
    await page.goto(`${baseUrl}/my-videos`, { waitUntil: "domcontentloaded" });
    await sleep(800);
    await normalizeAccountText(page);
    const uploadTab = page.getByText("Upload", { exact: true }).last();
    if (await uploadTab.count()) await uploadTab.click().catch(() => undefined);
    await sleep(500);
    await installTourFrame(page, tutorial);
  }
  await page.evaluate(({ index, total, step }) => {
    document.querySelectorAll("[data-wtf-faq-highlight]").forEach((node) => node.removeAttribute("data-wtf-faq-highlight"));
    const frame = document.querySelector("[data-wtf-faq-tour]");
    if (!frame) return;
    frame.querySelector("[data-wtf-faq-step]").textContent = `${index + 1} / ${total}`;
    frame.querySelector("p").textContent = step;
  }, { index, total: tutorial.steps.length, step });

  const hints = {
    "create-account-and-sign-in": [/create account/i, /username/i, /password/i, /log in|sign in/i],
    "find-and-open-tools": [/start/i, /play|create|shop|events|talk/i, /search/i, /applications/i],
    "connect-tezos-wallet": [/profile/i, /linked wallets/i, /connect wallet to link/i, /sign/i, /linked wallets/i],
    "connect-etherlink-wallet": [/etherlink wallets/i, /connect temple|connect metamask/i, /etherlink mainnet/i, /link connected/i, /etherlink wallets/i],
    "connect-x-identity": [/social/i, /x handle|connect x/i, /connect x/i, /verified/i, /save social info/i],
    "connect-discord-identity": [/social/i, /connect discord/i, /discord/i, /verified/i, /save social info/i],
    "connect-skywire-bluesky": [/connect skywire|skywire/i, /bluesky|handle|d i d/i, /permission|tier/i, /authorize|connect/i, /account|handle/i],
    "connect-google-drive": [/your drive/i, /connect google drive/i, /drive.file/i, /connected/i, /my media|my videos/i],
  };
  const pattern = hints[tutorial.slug]?.[index];
  if (pattern) {
    const locator = page.getByText(pattern).first();
    if (await locator.count()) {
      await locator.scrollIntoViewIfNeeded().catch(() => undefined);
      await locator.evaluate((node) => node.setAttribute("data-wtf-faq-highlight", "true")).catch(() => undefined);
    }
  }
  await normalizeAccountText(page);
  await sleep(1850);
}

async function preparePage(page, tutorial) {
  if (tutorial.slug === "create-account-and-sign-in") {
    await setHarnessState("anonymous");
  } else {
    await setHarnessState();
  }
  await page.goto(`${baseUrl}${tutorial.route}`, { waitUntil: "networkidle" });
  await sleep(500);
  await normalizeAccountText(page);

  if (tutorial.slug === "create-account-and-sign-in") {
    const username = page.locator('input[autocomplete="username"]').first();
    if (await username.count()) await username.fill(accountName).catch(() => undefined);
  }
  if (tutorial.slug === "find-and-open-tools") {
    const start = page.getByRole("button", { name: /open start menu|start/i }).first();
    if (await start.count()) await start.click().catch(() => undefined);
  }
}

async function recordTutorial(browser, tutorial) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: outputDir, size: { width: 1280, height: 720 } },
    colorScheme: "dark",
  });
  const page = await context.newPage();
  await preparePage(page, tutorial);
  await installTourFrame(page, tutorial);
  for (let index = 0; index < tutorial.steps.length; index += 1) {
    await showStep(page, tutorial, index);
  }
  const text = await page.locator("body").innerText();
  if (!text.includes(accountName)) throw new Error(`${tutorial.slug} did not show ${accountName}`);
  if (forbiddenAccounts.test(text)) throw new Error(`${tutorial.slug} leaked a non-TommyTezos fixture account`);
  forbiddenAccounts.lastIndex = 0;
  const video = page.video();
  await context.close();
  if (!video) throw new Error(`Playwright did not create a video for ${tutorial.slug}`);
  const source = await video.path();
  const destination = path.join(outputDir, `${tutorial.slug}.webm`);
  await fs.copyFile(source, destination);
  if (source !== destination) await fs.unlink(source).catch(() => undefined);
  console.log(`[recording] ${tutorial.slug} -> ${destination}`);
}

try {
  await waitForHarness();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const tutorial of catalog) await recordTutorial(browser, tutorial);
  } finally {
    await browser.close();
  }
} finally {
  if (harness) harness.kill("SIGTERM");
}
