#!/usr/bin/env node

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const allTutorials = JSON.parse(
  await fs.readFile(path.join(root, "shared/faq-tutorials.json"), "utf8")
);
const catalog = process.env.FAQ_TUTORIAL_SLUG
  ? allTutorials.filter((tutorial) => tutorial.slug === process.env.FAQ_TUTORIAL_SLUG)
  : allTutorials;
if (!catalog.length) throw new Error(`Unknown FAQ tutorial slug: ${process.env.FAQ_TUTORIAL_SLUG}`);

const outputRoot = path.join(root, "output/faq-tutorials");
const outputDir = path.join(outputRoot, "recordings");
const reviewDir = path.join(outputRoot, "review");
const port = Number(process.env.FAQ_TUTORIAL_HARNESS_PORT || 4199);
const baseUrl = process.env.FAQ_TUTORIAL_BASE_URL || `http://127.0.0.1:${port}`;
const accountName = "TommyTezos";
const demoPassword = "TommyTezosDemo!";
const forbiddenAccounts = /WTF Admin|wtf[-_]admin|WTF User|wtf[-_]user/gi;

await fs.mkdir(outputDir, { recursive: true });
await fs.mkdir(reviewDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function waitForHarness() {
  while (true) {
    try {
      const response = await fetch(`${baseUrl}/`);
      if (response.ok) return;
    } catch {}
    if (harness && harness.exitCode !== null) {
      throw new Error(`FAQ recording harness exited before ${baseUrl} became ready`);
    }
    await sleep(250);
  }
}

async function setHarnessState(role = "admin", driveConnected = false, demoState = {}) {
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
      ...demoState,
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
      const value = node.nodeValue || "";
      if (forbidden.test(value)) node.nodeValue = value.replace(forbidden, accountName);
      forbidden.lastIndex = 0;
    }
  }, { accountName });
}

async function installTourFrame(page, tutorial, index) {
  await page.addStyleTag({ content: `
    [data-wtf-faq-tour] { position: fixed; z-index: 2147483647; left: 24px; top: 22px;
      display: flex; gap: 10px; align-items: center; padding: 9px 13px; color: #f2ead9;
      background: rgba(7,7,6,.93); border: 2px solid #00d2ff; border-radius: 999px;
      box-shadow: 0 10px 34px rgba(0,0,0,.38); font: 800 14px Inter, system-ui, sans-serif; }
    [data-wtf-faq-tour] strong { color: #d6ff3f; letter-spacing: .05em; }
    [data-wtf-faq-account] { position: fixed; z-index: 2147483647; right: 24px; top: 22px;
      padding: 9px 13px; color: #071017; background: #d6ff3f; border: 2px solid #8fa52e;
      border-radius: 999px; font: 900 14px Inter, system-ui, sans-serif; }
    [data-wtf-faq-highlight] { outline: 4px solid #d6ff3f !important; outline-offset: 5px !important;
      position: relative; z-index: 2147483645 !important; }
    [data-wtf-demo-cursor] { position: fixed; z-index: 2147483647; left: 70px; top: 80px;
      width: 22px; height: 30px; pointer-events: none; transform: translate(-3px, -2px);
      filter: drop-shadow(0 2px 2px rgba(0,0,0,.8)); transition: filter .12s ease; }
    [data-wtf-demo-cursor]::before { content: ""; display: block; width: 22px; height: 30px;
      background: #fff; clip-path: polygon(0 0, 0 82%, 28% 63%, 43% 100%, 58% 93%, 42% 57%, 78% 55%); }
    [data-wtf-demo-cursor][data-clicking="true"] { filter: drop-shadow(0 0 7px #d6ff3f); }
    [data-wtf-demo-click] { position: fixed; z-index: 2147483646; width: 16px; height: 16px;
      margin: -8px 0 0 -8px; border: 3px solid #d6ff3f; border-radius: 50%; pointer-events: none;
      animation: wtf-demo-click .45s ease-out forwards; }
    @keyframes wtf-demo-click { to { opacity: 0; transform: scale(3); } }
  ` });
  await page.evaluate(({ title, accountName, index, total }) => {
    document.querySelectorAll("[data-wtf-faq-tour],[data-wtf-faq-account],[data-wtf-demo-cursor]")
      .forEach((node) => node.remove());
    const frame = document.createElement("section");
    frame.dataset.wtfFaqTour = "true";
    frame.innerHTML = `<strong>wtfOS HOW-TO</strong><span>${title}</span><span>${index + 1}/${total}</span>`;
    const account = document.createElement("div");
    account.dataset.wtfFaqAccount = "true";
    account.textContent = `Tommy · ${accountName}`;
    const cursor = document.createElement("div");
    cursor.dataset.wtfDemoCursor = "true";
    document.addEventListener("mousemove", (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    });
    document.body.append(frame, account, cursor);
  }, { title: tutorial.title, accountName, index, total: tutorial.steps.length });
}

async function firstVisible(locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function targetByText(page, pattern) {
  return firstVisible(page.getByText(pattern));
}

async function targetButton(page, pattern) {
  return (
    await firstVisible(page.getByRole("button", { name: pattern }))
  ) || (
    await firstVisible(page.getByRole("link", { name: pattern }))
  ) || targetByText(page, pattern);
}

async function moveTo(page, locator, options = {}) {
  if (!locator) {
    if (options.required) throw new Error(`Missing required target: ${options.label || "unknown"}`);
    await page.mouse.move(640, 360, { steps: 12 });
    return false;
  }
  await locator.scrollIntoViewIfNeeded().catch(() => undefined);
  const box = await locator.boundingBox();
  if (!box) {
    if (options.required) throw new Error(`Target has no visible box: ${options.label || "unknown"}`);
    return false;
  }
  await page.evaluate(() => {
    document.querySelectorAll("[data-wtf-faq-highlight]")
      .forEach((node) => node.removeAttribute("data-wtf-faq-highlight"));
  });
  await locator.evaluate((node) => node.setAttribute("data-wtf-faq-highlight", "true"))
    .catch(() => undefined);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 24 });
  return true;
}

async function clickTarget(page, locator, options = {}) {
  const moved = await moveTo(page, locator, options);
  if (!moved) return false;
  if (options.preventNavigation) {
    await locator.evaluate((node) => {
      node.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      }, { capture: true, once: true });
    });
  }
  await page.evaluate(() => {
    document.querySelector("[data-wtf-demo-cursor]")?.setAttribute("data-clicking", "true");
  });
  await page.mouse.down();
  await sleep(110);
  await page.mouse.up();
  await page.evaluate(() => {
    const cursor = document.querySelector("[data-wtf-demo-cursor]");
    if (!cursor) return;
    cursor.removeAttribute("data-clicking");
    const box = cursor.getBoundingClientRect();
    const ring = document.createElement("div");
    ring.dataset.wtfDemoClick = "true";
    ring.style.left = `${box.left}px`;
    ring.style.top = `${box.top}px`;
    document.body.appendChild(ring);
    setTimeout(() => ring.remove(), 500);
  });
  await sleep(380);
  return true;
}

async function typeInto(page, locator, value, options = {}) {
  const moved = await moveTo(page, locator, options);
  if (!moved) return false;
  await locator.click().catch(() => undefined);
  await locator.fill("").catch(() => undefined);
  await page.keyboard.type(value, { delay: 85 });
  return true;
}

async function restoreVisuals(page, tutorial, index) {
  await sleep(600);
  await normalizeAccountText(page);
  await installTourFrame(page, tutorial, index);
}

async function gotoPage(page, tutorial, index, route) {
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
  await restoreVisuals(page, tutorial, index);
}

async function performAccountStep(page, tutorial, index) {
  if (index === 0) {
    await gotoPage(page, tutorial, index, "/login");
    await clickTarget(page, await targetButton(page, /create account/i), {
      required: true,
      label: "Create Account",
    });
    await restoreVisuals(page, tutorial, index);
  } else if (index === 1) {
    const username = await firstVisible(page.locator('input[autocomplete="username"]'));
    await typeInto(page, username, accountName, { required: true, label: "username" });
  } else if (index === 2) {
    const passwordFields = page.locator('input[type="password"]');
    const count = await passwordFields.count();
    for (let field = 0; field < Math.min(2, count); field += 1) {
      await typeInto(page, passwordFields.nth(field), demoPassword, {
        required: true,
        label: `password field ${field + 1}`,
      });
    }
    await clickTarget(page, await targetButton(page, /^create account$/i), {
      required: true,
      label: "Create Account",
      preventNavigation: true,
    });
  } else {
    await setHarnessState("admin");
    await gotoPage(page, tutorial, index, "/");
    await moveTo(page, await targetButton(page, /open stuffs menu|stuffs/i), {
      required: true,
      label: "Stuffs",
    });
  }
}

async function performStuffsStep(page, tutorial, index) {
  const stuffs = () => targetButton(page, /open stuffs menu|stuffs/i);
  if (index === 0) {
    await moveTo(page, await stuffs(), { required: true, label: "Stuffs" });
  } else if (index === 1) {
    for (let click = 0; click < 5; click += 1) {
      await clickTarget(page, await stuffs(), { required: true, label: "Stuffs" });
      await sleep(260);
    }
  } else if (index === 2) {
    await clickTarget(page, await targetButton(page, /^play$/i), {
      required: true,
      label: "Play",
    });
  } else if (index === 3) {
    await typeInto(page, await firstVisible(page.getByRole("textbox")), "Studio", {
      required: true,
      label: "Stuffs search",
    });
  } else {
    const applications = await targetButton(page, /applications/i);
    if (applications) await clickTarget(page, applications, { preventNavigation: true });
    await gotoPage(page, tutorial, index, "/applications");
    await moveTo(page, await targetByText(page, /applications/i), { label: "Applications" });
  }
}

async function performDriveStep(page, tutorial, index) {
  if (index === 0) {
    await moveTo(page, await targetByText(page, /your drive/i), { required: true, label: "Your Drive" });
  } else if (index === 1) {
    await clickTarget(page, await targetButton(page, /connect google drive/i), {
      required: true,
      label: "Connect Google Drive",
      preventNavigation: true,
    });
  } else if (index === 2) {
    await moveTo(page, await targetByText(page, /drive\.file/i), { required: true, label: "drive.file" });
  } else if (index === 3) {
    await setHarnessState("admin", true);
    await gotoPage(page, tutorial, index, "/studio");
    await moveTo(page, await targetByText(page, /^connected$/i), { required: true, label: "Connected" });
  } else {
    await gotoPage(page, tutorial, index, "/my-videos");
    const upload = await targetButton(page, /^upload$/i);
    if (upload) await clickTarget(page, upload);
    await moveTo(page, await targetByText(page, /drive|backup/i), { label: "Drive backup" });
  }
}

async function performConnectionStep(page, tutorial, index) {
  const patterns = {
    "connect-tezos-wallet": [
      /profile/i,
      /linked wallets/i,
      /connect wallet to link/i,
      /ownership|sign/i,
      /tz1-test-wallet|linked wallets/i,
    ],
    "connect-etherlink-wallet": [
      /etherlink wallets/i,
      /connect temple|connect metamask/i,
      /etherlink mainnet|42793/i,
      /link connected|ownership/i,
      /etherlink wallets|sync/i,
    ],
    "connect-x-identity": [
      /social/i,
      /x handle|connect x/i,
      /connect x/i,
      /verified/i,
      /save social info/i,
    ],
    "connect-discord-identity": [
      /social/i,
      /connect discord/i,
      /discord/i,
      /verified/i,
      /save social info/i,
    ],
    "connect-skywire-bluesky": [
      /skywire|account/i,
      /handle|d i d|bluesky/i,
      /permission|be safe|be social|be heard|be bold/i,
      /continue|connect|authorize/i,
      /tommytezos\.bsky\.social|connected/i,
    ],
  };
  const pattern = patterns[tutorial.slug]?.[index];
  if (!pattern) return;

  if (tutorial.slug === "connect-skywire-bluesky" && index === 1) {
    await typeInto(page, await firstVisible(page.getByRole("textbox")), "tommytezos.bsky.social", {
      required: true,
      label: "Bluesky handle",
    });
    return;
  }

  if (tutorial.slug === "connect-x-identity") {
    if (index === 1) {
      await typeInto(
        page,
        await firstVisible(page.getByRole("textbox", { name: /twitter handle/i })),
        "TommyTezos",
        { required: true, label: "Twitter handle" }
      );
      return;
    }
    if (index === 2) {
      await clickTarget(page, await targetButton(page, /connect @tommytezos|connect x/i), {
        required: true,
        label: "Connect X",
        preventNavigation: true,
      });
      return;
    }
    if (index === 3) {
      await setHarnessState("admin", false, { profileSocialConnected: "twitter" });
      await gotoPage(page, tutorial, index, "/profile?verified=twitter_oauth2");
      await moveTo(page, await targetByText(page, /^verified$/i), {
        required: true,
        label: "X Verified badge",
      });
      return;
    }
    if (index === 4) {
      await clickTarget(
        page,
        await firstVisible(page.getByRole("checkbox", { name: /make twitter public/i })),
        { required: true, label: "Make Twitter public" }
      );
      await clickTarget(page, await targetButton(page, /save social info/i), {
        required: true,
        label: "Save social info",
      });
      return;
    }
  }

  if (tutorial.slug === "connect-discord-identity") {
    if (index === 1) {
      await clickTarget(page, await targetButton(page, /connect discord/i), {
        required: true,
        label: "Connect Discord",
        preventNavigation: true,
      });
      return;
    }
    if (index === 3) {
      await setHarnessState("admin", false, { profileSocialConnected: "discord" });
      await gotoPage(page, tutorial, index, "/profile?verified=discord");
      await moveTo(page, await targetByText(page, /^verified$/i), {
        required: true,
        label: "Discord Verified badge",
      });
      return;
    }
    if (index === 4) {
      await clickTarget(
        page,
        await firstVisible(page.getByRole("checkbox", { name: /make discord public/i })),
        { required: true, label: "Make Discord public" }
      );
      await clickTarget(page, await targetButton(page, /save social info/i), {
        required: true,
        label: "Save social info",
      });
      return;
    }
  }

  if (tutorial.slug === "connect-etherlink-wallet") {
    if (index === 1) {
      await clickTarget(page, await targetButton(page, /connect temple/i), {
        required: true,
        label: "Connect Temple",
        preventNavigation: true,
      });
      return;
    }
    if (index === 2) {
      await page.evaluate(() => {
        localStorage.setItem("wtf:etherlink-wallet-session", JSON.stringify({
          address: "0x7e205e0000000000000000000000000000000077",
          chainId: 42793,
          network: "Etherlink Mainnet",
          providerKey: "temple",
          providerName: "Temple Wallet",
          connectedAt: new Date().toISOString(),
        }));
      });
      await gotoPage(page, tutorial, index, "/profile");
      await moveTo(page, await targetByText(page, /Etherlink Mainnet \(42793\)/i), {
        required: true,
        label: "Etherlink Mainnet chain",
      });
      return;
    }
    if (index === 3) {
      await setHarnessState("admin", false, { etherlinkLinked: true });
      await gotoPage(page, tutorial, index, "/profile");
      await clickTarget(page, await targetButton(page, /link connected/i), {
        required: true,
        label: "Link Connected",
      });
      return;
    }
    if (index === 4) {
      await moveTo(page, await targetByText(page, /Tommy's Etherlink Proof/i), {
        required: true,
        label: "synced Etherlink asset",
      });
      return;
    }
  }

  const target = await targetByText(page, pattern) || await targetButton(page, pattern);
  const clickSteps = new Set([2, 3]);
  if (clickSteps.has(index)) {
    await clickTarget(page, target, { label: pattern.source, preventNavigation: true });
  } else {
    await moveTo(page, target, { label: pattern.source });
  }
}

async function performTutorialStep(page, tutorial, index) {
  if (tutorial.slug === "create-account-and-sign-in") {
    await performAccountStep(page, tutorial, index);
  } else if (tutorial.slug === "find-and-open-tools") {
    await performStuffsStep(page, tutorial, index);
  } else if (tutorial.slug === "connect-google-drive") {
    await performDriveStep(page, tutorial, index);
  } else {
    await performConnectionStep(page, tutorial, index);
  }
}

async function preparePage(page, tutorial) {
  if (tutorial.slug === "create-account-and-sign-in") {
    await setHarnessState("anonymous");
    await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  } else {
    await setHarnessState("admin", false);
    await page.goto(`${baseUrl}${tutorial.route}`, { waitUntil: "domcontentloaded" });
  }
  await sleep(700);
  await normalizeAccountText(page);
}

async function recordTutorial(browser, tutorial) {
  const timing = JSON.parse(
    await fs.readFile(path.join(outputRoot, "narration", `${tutorial.slug}.timings.json`), "utf8")
  );
  if (timing.segments.length !== tutorial.steps.length) {
    throw new Error(`${tutorial.slug} narration segments do not match visible steps`);
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: outputDir, size: { width: 1280, height: 720 } },
    colorScheme: "dark",
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await preparePage(page, tutorial);

  for (let index = 0; index < tutorial.steps.length; index += 1) {
    await installTourFrame(page, tutorial, index);
    const startedAt = Date.now();
    await performTutorialStep(page, tutorial, index);
    await normalizeAccountText(page);
    await page.screenshot({
      path: path.join(reviewDir, `${tutorial.slug}-step-${String(index + 1).padStart(2, "0")}.png`),
    });
    const targetMs = Math.round(timing.segments[index].durationSeconds * 1000) + 220;
    await sleep(Math.max(320, targetMs - (Date.now() - startedAt)));
  }

  const text = await page.locator("body").innerText();
  if (!text.includes(accountName)) throw new Error(`${tutorial.slug} did not show ${accountName}`);
  if (forbiddenAccounts.test(text)) {
    forbiddenAccounts.lastIndex = 0;
    throw new Error(`${tutorial.slug} leaked a non-TommyTezos fixture account`);
  }
  forbiddenAccounts.lastIndex = 0;
  if (pageErrors.length) throw new Error(`${tutorial.slug} page errors: ${pageErrors.join(" | ")}`);

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
  harness?.kill("SIGTERM");
}
