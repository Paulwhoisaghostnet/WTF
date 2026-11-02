#!/usr/bin/env node
/** Record real wtfOS actions in the isolated Playwright inventory harness. */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const work = path.join(root, "output/paul-tutorials");
const recordings = path.join(work, "recordings");
const review = path.join(work, "review");
const episodes = JSON.parse(await fs.readFile(path.join(here, "episodes.json"), "utf8"));
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
};
const selected = option("--slug");
const catalog = selected ? episodes.filter((item) => item.slug === selected) : episodes;
if (!catalog.length) throw new Error(`Unknown Paul tutorial: ${selected}`);
await fs.mkdir(recordings, { recursive: true });
await fs.mkdir(review, { recursive: true });

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const harness = spawn(process.execPath, ["tests/playwright/harness.mjs"], {
  cwd: root,
  env: { ...process.env, HARNESS_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});
harness.stderr.on("data", (chunk) => process.stderr.write(chunk));

async function waitForHarness() {
  while (harness.exitCode === null) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch { /* Starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Paul tutorial harness exited with ${harness.exitCode}`);
}

async function setHarnessState(episode) {
  const role = "contestant";
  const ownedAppPasses = episode.slug === "play-arcade" ? ["arcade"]
    : episode.slug === "play-guided-round" ? ["wtfiap"] : [];
  const response = await fetch(`${baseUrl}/__test/state`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "no-wallet",
      userRole: role,
      userId: role === "contestant" ? 42 : 1,
      username: role === "contestant" ? "pauldemo" : "wtf-admin",
      displayName: role === "contestant" ? "Paul Demo" : "WTF Admin",
      ownedAppPasses,
      welcomePending: false,
    }),
  });
  if (!response.ok) throw new Error(`Could not seed Paul tutorial: ${response.status}`);
}

async function installEpisodeFixtures(page, episode) {
  if (episode.slug === "desktop-basics") {
    const quest = {
      questComplete: false,
      completedCount: 0,
      totalCount: 1,
      finale: null,
      steps: [{
        id: 1,
        seedKey: "reggie_profile_tutorial",
        stepKey: "profile",
        title: "Set up your profile",
        description: "Add a display name to your profile.",
        route: "/profile",
        actionLabel: "Open Profile",
        anchorId: "profile",
        category: "identity",
        order: 1,
        prereqStepKeys: [],
        rewards: { xp: 10, wtf: 0 },
        status: "available",
        completedAt: null,
      }],
    };
    await page.route("**/api/reggie/quest", (route) => route.fulfill({
      contentType: "application/json", body: JSON.stringify(quest),
    }));
    await page.route("**/api/reggie/messages", (route) => route.fulfill({
      status: 201, contentType: "application/json",
      body: JSON.stringify({ ok: true, conversationId: 41 }),
    }));
  }
  if (episode.slug === "play-arcade") {
    const game = {
      id: "gamma-breach", slug: "gamma-breach", title: "Gamma Sample",
      description: "Sample game for learning the Arcade.", mimeType: "text/html",
      artifactUri: "/arcade/gamma-breach/index.html", thumbnailUri: null,
      isDemo: false, isPublished: true, kind: "html5", category: "action",
      builderName: "Paul Demo", playCount: 0, playerCount: 0,
      leaderboardEnabled: true, arcadeCreditsRequired: true, arcadeCreditPrice: 2,
    };
    await page.route("**/api/arcade/games", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ demos: [], published: [game], mine: [], all: [game], payment: null }),
    }));
    await page.route("**/api/arcade/discovery**", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ popular: [], newest: [], sourceArcade: [], creator: [], studio: [] }),
    }));
  }
  if (episode.slug === "events") {
    const start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(12, 0, 0, 0);
    const event = {
      id: 627, kind: "x_space", title: "Tutorial Sample: Community Game Night",
      description: "Example event for learning the Calendar controls.",
      startsAt: start.toISOString(),
      endsAt: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
      allDay: false, sourceKind: "manual", sourceId: null, sourceProvider: "wtf",
      sourceRank: 10, visibility: "public", status: "published",
      linksJson: [{ label: "Join event room", url: "https://example.com/calendar-room" }],
      creatorName: "WTF Community", creatorUrl: "/user/wtf-admin",
    };
    await page.route("**/api/calendar/events**", (route) => route.fulfill({
      contentType: "application/json", body: JSON.stringify([event]),
    }));
  }
  if (episode.slug === "shop-safely") {
    await page.route("**/api/in-app-market?category=*", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      payload.config = { ...payload.config, network: "Tutorial sample catalog", contractAddress: "" };
      const category = new URL(route.request().url()).searchParams.get("category");
      if (category === "desktop_fun") payload.items = [{
        id: 9001, sku: "tutorial-desktop-item", name: "Tutorial Sample Accessory",
        description: "Example listing for learning the marketplace. Live offers may differ.",
        category: "desktop_fun", kind: "desktop-accessory", source: "tutorial-fixture",
        priceWtfUnits: "1000000000000000000", priceWtfFormatted: "1.00", priceExp: 0,
        sale: null, contractAddress: null, contractListingId: null,
        metadata: { accent: "#6d8f2f", monogram: "DEMO" },
        stockQuantity: 1, quantityOwned: 0,
        purchaseBlockedReason: "Sample only",
      }];
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
    });
  }
  if (episode.slug === "side-quest-reward") {
    let claimed = false;
    await page.route("**/api/challenge-automation/daily-loops", async (route) => {
      const response = await route.fetch();
      const payload = await response.json();
      if (claimed) {
        payload.loops = payload.loops.map((quest) => quest.id === 101 ? {
          ...quest, claimableToday: false, claimedToday: true,
          completedToday: true, rewardStatus: "completed",
        } : quest);
      }
      await route.fulfill({ contentType: "application/json", body: JSON.stringify(payload) });
    });
    await page.route("**/api/challenge-automation/daily-loops/101/claim", async (route) => {
      const response = await route.fetch();
      if (response.ok()) claimed = true;
      await route.fulfill({ response });
    });
    await page.route("**/api/rewards/account", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        balances: { totalEarnedWtf: claimed ? 1 : 0, availableWtf: claimed ? 1 : 0,
          pendingCashoutWtf: 0, alreadyPaidWtf: 0, marketSpentWtf: 0 },
        cashout: { minimumWtf: 20 }, primaryWallet: null, cashouts: [],
      }),
    }));
  }
}

async function ensureGuide(page) {
  await page.evaluate(() => {
    if (!document.querySelector("#paul-tutorial-style")) {
      const style = document.createElement("style");
      style.id = "paul-tutorial-style";
      style.textContent = `
        [data-desktop-ambient="paulwhoisaclippy"] { visibility: hidden !important; }
        [data-desktop-cursor] { visibility: hidden !important; }
        [data-paul-tour] { position: fixed; z-index: 2147483646; right: 12px; top: 14px;
          width: 260px; box-sizing: border-box; padding: 10px 12px; pointer-events: none;
          border: 2px solid #8de6d3; background: rgba(11, 22, 42, .95); color: #f3f9f7;
          box-shadow: 0 6px 0 rgba(0,0,0,.36); font: 16px Arial, sans-serif; }
        [data-paul-tour] strong { display: block; color: #8de6d3; font-size: 13px;
          letter-spacing: 1.5px; margin-bottom: 4px; text-transform: uppercase; }
        [data-paul-tour] span { display: block; font-weight: 700; line-height: 1.25; }
        [data-paul-sprite] { position: fixed; z-index: 2147483645; width: 98px; height: 76px;
          pointer-events: none; transition: left .42s ease, top .42s ease;
          filter: drop-shadow(2px 4px 0 rgba(0,0,0,.5)); }
        [data-paul-sprite] img { width: 100%; height: 100%; object-fit: contain;
          image-rendering: pixelated; animation: paulTourFloat 2s ease-in-out infinite; }
        [data-paul-target] { outline: 5px solid #ff5965 !important; outline-offset: 5px !important; }
        [data-paul-focus] { position: fixed; z-index: 2147483644; pointer-events: none;
          border: 5px solid #ff5965; box-sizing: border-box; }
        [data-paul-cursor] { position: fixed; z-index: 2147483647; left: 70px; top: 180px;
          width: 23px; height: 31px; pointer-events: none; transform: translate(-2px,-2px);
          transition: left .16s ease, top .16s ease;
          filter: drop-shadow(1px 2px 2px #08101f); }
        [data-paul-cursor]::before { content: ""; display: block; width: 23px; height: 31px;
          background: #fff; clip-path: polygon(0 0, 0 84%, 28% 64%, 45% 100%, 60% 93%, 42% 56%, 79% 55%); }
        [data-paul-click] { position: fixed; z-index: 2147483645; width: 18px; height: 18px;
          border: 3px solid #ff5965; border-radius: 50%; pointer-events: none;
          animation: paulTourClick .48s ease-out forwards; }
        @keyframes paulTourFloat { 50% { transform: translateY(-5px); } }
        @keyframes paulTourClick { to { opacity: 0; transform: scale(3); } }
      `;
      document.head.append(style);
    }
    if (!document.querySelector("[data-paul-tour]")) {
      const tour = document.createElement("div");
      tour.dataset.paulTour = "true";
      tour.innerHTML = "<strong></strong><span></span>";
      document.body.append(tour);
      const sprite = document.createElement("div");
      sprite.dataset.paulSprite = "true";
      sprite.style.left = "795px";
      sprite.style.top = "120px";
      const image = document.createElement("img");
      image.src = "/desktop/paulwhoisaclippy.svg";
      image.alt = "";
      sprite.append(image);
      document.body.append(sprite);
      const cursor = document.createElement("div");
      cursor.dataset.paulCursor = "true";
      document.addEventListener("mousemove", (event) => {
        cursor.style.left = `${event.clientX}px`;
        cursor.style.top = `${event.clientY}px`;
      });
      document.body.append(cursor);
    }
  });
}

async function showStep(page, episode, index) {
  await ensureGuide(page);
  await page.evaluate(({ title, step, index, count }) => {
    const tour = document.querySelector("[data-paul-tour]");
    tour.querySelector("strong").textContent = `PAUL'S FIELD GUIDE · ${title} · ${index + 1}/${count}`;
    tour.querySelector("span").textContent = step;
    document.querySelectorAll("[data-paul-target]").forEach((node) =>
      node.removeAttribute("data-paul-target"));
    document.querySelectorAll("[data-paul-focus]").forEach((node) => node.remove());
  }, { title: episode.title, step: episode.steps[index], index, count: episode.steps.length });
}

async function focusBox(page, box) {
  await page.evaluate(({ x, y, width, height }) => {
    document.querySelectorAll("[data-paul-focus]").forEach((node) => node.remove());
    const focus = document.createElement("div");
    focus.dataset.paulFocus = "true";
    focus.style.left = `${x - 5}px`;
    focus.style.top = `${y - 5}px`;
    focus.style.width = `${width + 10}px`;
    focus.style.height = `${height + 10}px`;
    document.body.append(focus);
  }, box);
}

async function parkGuide(page) {
  await page.evaluate(() => {
    const sprite = document.querySelector("[data-paul-sprite]");
    sprite.style.left = "1080px";
    sprite.style.top = "145px";
  });
  await page.waitForTimeout(450);
}

async function setGuideCursor(page, x, y) {
  await page.evaluate(({ x, y }) => {
    const cursor = document.querySelector("[data-paul-cursor]");
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
  }, { x, y });
}

async function pointAt(page, locator, label) {
  await locator.waitFor({ state: "visible" });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No visible box for ${label}`);
  await focusBox(page, box);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.evaluate(({ x, y }) => {
    const sprite = document.querySelector("[data-paul-sprite]");
    sprite.style.left = `${Math.max(12, Math.min(1160, x + 25))}px`;
    sprite.style.top = `${Math.max(112, Math.min(610, y - 83))}px`;
  }, { x, y });
  await page.mouse.move(x, y, { steps: 20 });
  await setGuideCursor(page, x, y);
}

async function fillAt(page, locator, value, label) {
  await pointAt(page, locator, label);
  await locator.fill(value);
  await parkGuide(page);
}

async function selectAt(page, locator, value, label) {
  await pointAt(page, locator, label);
  await locator.selectOption(value);
  await parkGuide(page);
}

async function pointGameHit(page, game, idOrPoint) {
  const canvas = game.locator("#game");
  await canvas.waitFor({ state: "visible" });
  const bounds = await canvas.boundingBox();
  const size = await canvas.evaluate((element) => ({ width: element.width, height: element.height }));
  const point = typeof idOrPoint === "string"
    ? await game.evaluate((target) => {
        const hit = window.AB_UI.hitRegions().find((item) => item.id === target);
        if (!hit) throw new Error(`Missing game control ${target}`);
        return { x: hit.x + hit.w / 2, y: hit.y + hit.h / 2, w: hit.w, h: hit.h };
      }, idOrPoint)
    : { ...idOrPoint, w: 38, h: 38 };
  const x = bounds.x + point.x * bounds.width / size.width;
  const y = bounds.y + point.y * bounds.height / size.height;
  await focusBox(page, {
    x: x - Math.max(18, point.w * bounds.width / size.width) / 2,
    y: y - Math.max(18, point.h * bounds.height / size.height) / 2,
    width: Math.max(18, point.w * bounds.width / size.width),
    height: Math.max(18, point.h * bounds.height / size.height),
  });
  await page.mouse.move(x, y, { steps: 20 });
  await setGuideCursor(page, x, y);
  return { x, y };
}

async function clickGameHit(page, game, idOrPoint) {
  const { x, y } = await pointGameHit(page, game, idOrPoint);
  await page.mouse.click(x, y);
  await page.evaluate(({ x, y }) => {
    const ring = document.createElement("div");
    ring.dataset.paulClick = "true";
    ring.style.left = `${x - 9}px`;
    ring.style.top = `${y - 9}px`;
    document.body.append(ring);
    setTimeout(() => ring.remove(), 500);
  }, { x, y });
  await page.waitForTimeout(450);
}

async function clickAt(page, locator, label) {
  await pointAt(page, locator, label);
  const box = await locator.boundingBox();
  await locator.click();
  await page.evaluate(({ x, y }) => {
    const ring = document.createElement("div");
    ring.dataset.paulClick = "true";
    ring.style.left = `${x - 9}px`;
    ring.style.top = `${y - 9}px`;
    document.body.append(ring);
    setTimeout(() => ring.remove(), 500);
  }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  await parkGuide(page);
}

async function performDesktopBasics(page, index) {
  if (index === 0) {
    await pointAt(page, page.locator('[data-desktop-icon-key="mission-control"]'), "Mission Control icon");
  } else if (index === 1) {
    await clickAt(page, page.locator('[data-desktop-icon-key="mission-control"]'), "Mission Control icon");
    await page.getByText("Where am I?", { exact: true }).waitFor({ state: "visible" });
    await pointAt(page, page.getByTestId("mission-control-next"), "Mission Control next move");
    await parkGuide(page);
  } else if (index === 2) {
    const reggie = page.locator('[data-reggie-assistant="true"]');
    await clickAt(page, reggie.locator('button[aria-label^="Reggie"]').first(), "Reggie side-quest guide");
    const bubble = reggie.locator('[role="dialog"]');
    await bubble.waitFor({ state: "visible" });
    await pointAt(page, bubble.getByRole("button", { name: "Take me there" }), "Route to next side quest");
    await parkGuide(page);
  } else if (index === 3) {
    await clickAt(page, page.locator('[data-reggie-assistant="true"] [role="dialog"] button[title="Close"]'), "Close Reggie bubble");
    await clickAt(page, page.getByRole("button", { name: "Minimize Mission Control" }), "Minimize Mission Control");
    await page.locator('button[title^="Mission Control - click"]').waitFor({ state: "visible" });
    await pointAt(page, page.locator('button[title^="Mission Control - click"]'), "Minimized window on taskbar");
    await parkGuide(page);
  } else if (index === 4) {
    await clickAt(page, page.locator('button[title^="Mission Control - click"]'), "Mission Control taskbar button");
    await page.getByText("Where am I?", { exact: true }).waitFor({ state: "visible" });
    await pointAt(page, page.getByTestId("mission-control-next"), "Restored Mission Control window");
    await parkGuide(page);
  } else if (index === 5) {
    await clickAt(page, page.getByRole("button", { name: "Open Stuffs menu" }), "Stuffs menu");
    await page.getByText("Games", { exact: true }).first().waitFor({ state: "visible" });
  }
}

async function performMissionControl(page, index) {
  const mission = page.locator('[data-testid="mission-control"]');
  await mission.waitFor({ state: "visible" });
  if (index === 0) {
    await pointAt(page, mission.getByTestId("mission-control-next"), "Mission Control next move");
    await parkGuide(page);
  } else if (index === 1) {
    await clickAt(page, mission.getByRole("button", { name: "Open challenges" }).first(), "Open challenges");
    await page.locator('[data-progression-surface="challenges"]').waitFor({ state: "visible" });
    await pointAt(page, page.locator('[data-progression-region="challenge-card"]').first(), "Available challenge");
    await parkGuide(page);
  } else if (index === 2) {
    const card = page.locator('[data-progression-region="challenge-card"]').first();
    await card.waitFor({ state: "visible" });
    await clickAt(page, card.getByRole("button", { name: "View Details" }), "View challenge details");
    await pointAt(page, card, "Challenge description and response");
    await parkGuide(page);
  }
}

async function performSideQuest(page, index) {
  const quests = page.locator('[data-progression-surface="side-quests"]');
  await quests.waitFor({ state: "visible" });
  const card = quests.locator('[data-progression-region="quest-card"]')
    .filter({ hasText: "Daily Social Check-In" }).first();
  if (index === 0) {
    await clickAt(page, quests.getByText("Today", { exact: true }).first(), "Today tab");
    await card.waitFor({ state: "visible" });
  } else if (index === 1) {
    await card.getByText("Verified by WTF OS. Your reward is waiting.").waitFor({ state: "visible" });
    await pointAt(page, card, "Verified side quest");
    await parkGuide(page);
  } else if (index === 2) {
    await clickAt(page, card.getByRole("button", { name: "Claim", exact: true }), "Claim reward");
    await card.getByText(/You earned WTF!/).waitFor({ state: "visible" });
    await quests.getByText("1/2 claimed", { exact: true }).waitFor({ state: "visible" });
    await quests.locator('[data-progression-region="reward-account"]')
      .getByText("1 WTF", { exact: true }).first().waitFor({ state: "visible" });
  } else if (index === 3) {
    await pointAt(page, card.getByRole("link", { name: /Market/ }), "Market link after claim");
    await parkGuide(page);
  }
}

async function performArcade(page, index) {
  const search = page.getByPlaceholder("Search games");
  await search.waitFor({ state: "visible" });
  const card = page.locator('[data-arcade-console-region="game-card"]').filter({ hasText: "Gamma Sample" }).first();
  if (index === 0) {
    await pointAt(page, search, "Search games");
  } else if (index === 1) {
    await fillAt(page, search, "Gamma", "Search games");
    await card.waitFor({ state: "visible" });
    await pointAt(page, card, "Gamma Sample cartridge");
    await parkGuide(page);
  } else if (index === 2) {
    await card.getByText("2 CR", { exact: true }).waitFor({ state: "visible" });
    await pointAt(page, card.getByText("2 CR", { exact: true }), "Arcade credit badge");
    await parkGuide(page);
    await page.evaluate(() => {
      const detail = document.createElement("div");
      detail.dataset.paulDetail = "true";
      detail.textContent = "SAMPLE COST · 2 CR";
      Object.assign(detail.style, { position: "fixed", right: "23px", top: "245px",
        zIndex: "2147483645", padding: "10px", background: "#101936", color: "#fff",
        border: "2px solid #ff5965", font: "bold 14px Arial, sans-serif" });
      document.body.append(detail);
    });
  }
}

async function performEvents(page, index) {
  const calendar = page.locator('[data-calendar-surface="calendar"]');
  await calendar.waitFor({ state: "visible" });
  if (index === 0) {
    await clickAt(page, calendar.getByRole("button", { name: "Agenda", exact: true }), "Agenda view");
    await calendar.locator('[data-calendar-view="agenda"]').waitFor({ state: "visible" });
  } else if (index === 1) {
    await clickAt(page, calendar.getByRole("button", { name: /Tutorial Sample: Community Game Night/ }).first(), "Tutorial sample event");
    const details = calendar.locator('[data-calendar-region="event-detail"]');
    await details.waitFor({ state: "visible" });
    await pointAt(page, details, "Event details");
    await parkGuide(page);
  } else if (index === 2) {
    const details = calendar.locator('[data-calendar-region="event-detail"]');
    await clickAt(page, details.getByRole("button", { name: "Going", exact: true }), "Going");
    await details.getByText("You are going. Task-tray reminders are on.").waitFor({ state: "visible" });
    const dismiss = page.getByRole("button", { name: "Dismiss calendar reminder" });
    await dismiss.waitFor({ state: "visible" });
    await clickAt(page, dismiss, "Dismiss calendar reminder popup");
    await pointAt(page, details.getByText("You are going. Task-tray reminders are on."), "Going confirmation");
    await parkGuide(page);
  } else if (index === 3) {
    await clickAt(page, calendar.getByRole("tab", { name: "My plans" }), "My plans");
    const plan = calendar.locator('[data-calendar-region="plan-card"]').filter({ hasText: "Tutorial Sample: Community Game Night" });
    await plan.waitFor({ state: "visible" });
    await pointAt(page, plan.locator('[data-calendar-region="meta"]').last(), "Saved event reminder");
    await parkGuide(page);
  }
}

async function performTalk(page, index) {
  const mail = page.locator('[data-mail-surface="inbox"]');
  await mail.waitFor({ state: "visible" });
  const compose = mail.locator('[data-mail-region="compose-panel"]');
  if (index === 0) {
    await clickAt(page, mail.getByRole("button", { name: /New message/ }), "New message");
    await compose.waitFor({ state: "visible" });
  } else if (index === 1) {
    await selectAt(page, compose.getByLabel("Draft destination type"), "dm", "WTF user through WIM");
    await selectAt(page, compose.getByLabel("Select WTF user recipient"), "2", "WIM Online recipient");
  } else if (index === 2) {
    await fillAt(page, compose.getByLabel("Message body"), "See you at Community Game Night!", "Message body");
  } else if (index === 3) {
    await clickAt(page, compose.getByRole("button", { name: "Send message" }), "Send message");
    await compose.getByText("Message sent.", { exact: true }).waitFor({ state: "visible" });
    await pointAt(page, compose.getByText("Message sent.", { exact: true }), "Message sent confirmation");
    await parkGuide(page);
  }
}

async function performShop(page, index) {
  const market = page.locator('[data-wtfiam-surface="marketplace"]');
  await market.waitFor({ state: "visible" });
  const category = (key) => market.locator(`[data-wtfiam-category="${key}"]`);
  if (index === 0) {
    await clickAt(page, category("apps"), "Apps category");
    await category("apps").waitFor({ state: "visible" });
  } else if (index === 1) {
    await clickAt(page, category("desktop_fun"), "Desktop Items category");
    await category("desktop_fun").waitFor({ state: "visible" });
    await market.locator('[data-wtfiam-region="item-card"]').first().waitFor({ state: "visible" });
    await pointAt(page, market.locator('[data-wtfiam-region="item-card"]').first(), "Sample desktop accessory");
    await parkGuide(page);
  } else if (index === 2) {
    const card = market.locator('[data-wtfiam-region="item-card"]').first();
    await card.waitFor({ state: "visible" });
    await pointAt(page, card.locator('[data-wtfiam-region="item-badge"]'), "Listing status");
    await page.waitForTimeout(300);
    await pointAt(page, card.locator('[data-wtfiam-region="item-price-line"]'), "Listing price");
    await parkGuide(page);
  } else if (index === 3) {
    await clickAt(page, category("system_appearance"), "System Appearance category");
    const staged = market.locator('[data-wtfiam-region="item-card"]').first();
    await staged.waitFor({ state: "visible" });
    await pointAt(page, staged.locator('[data-wtfiam-region="item-badge"]'), "Coming soon badge");
    await parkGuide(page);
  }
}

async function performPersonalize(page, index) {
  const theme = page.locator('[data-desktop-settings-surface="theme-builder"]');
  await theme.waitFor({ state: "visible" });
  const save = page.getByTestId("desktop-settings-global-save");
  if (index === 0) {
    await clickAt(page, page.getByTestId("desktop-settings-tab-appearance"), "Appearance tab");
  } else if (index === 1) {
    const style = theme.locator('[data-desktop-settings-region="style-button"][aria-pressed="false"]').first();
    await clickAt(page, style, "Alternative desktop style");
    await save.waitFor({ state: "visible" });
    if (await save.getAttribute("data-save-state") !== "unsaved") throw new Error("Theme selection did not become unsaved");
  } else if (index === 2) {
    await clickAt(page, save, "Save appearance");
    await page.waitForFunction(() => document.querySelector('[data-testid="desktop-settings-global-save"]')?.getAttribute("data-save-state") === "recorded");
  } else if (index === 3) {
    if (await save.getAttribute("data-save-state") !== "recorded") throw new Error("Theme was not recorded");
    await pointAt(page, save, "Saved appearance");
    await parkGuide(page);
  }
}

async function pixAlerceFrame(page) {
  const iframe = page.locator('iframe[title="PixAlerce"]');
  await iframe.waitFor({ state: "visible" });
  const frame = await (await iframe.elementHandle()).contentFrame();
  if (!frame) throw new Error("PixAlerce frame unavailable");
  return frame;
}

async function performCreate(page, index) {
  if (index === 0) {
    const open = page.getByRole("region", { name: "Choose an outcome" })
      .getByRole("button", { name: "Open PixAlerce", exact: true });
    await clickAt(page, open, "Open PixAlerce");
    await page.locator('[data-creation-tool-id="pixalerce"]').waitFor({ state: "visible" });
    const frame = await pixAlerceFrame(page);
    await frame.getByRole("button", { name: /Blank canvas/i }).waitFor({ state: "visible" });
    await pointAt(page, frame.getByRole("button", { name: /Blank canvas/i }), "Blank canvas entry");
    await parkGuide(page);
  } else if (index === 1) {
    const frame = await pixAlerceFrame(page);
    await clickAt(page, frame.getByRole("button", { name: /Blank canvas/i }), "Blank canvas");
    await clickAt(page, frame.getByRole("button", { name: "32 × 32", exact: true }), "32 by 32 canvas");
    await clickAt(page, frame.getByRole("button", { name: "Create", exact: true }), "Create canvas");
    await frame.getByRole("button", { name: "Brush", exact: true }).first().waitFor({ state: "visible" });
    await pointAt(page, frame.locator("canvas").first(), "New blank canvas");
    await parkGuide(page);
  } else if (index === 2) {
    const frame = await pixAlerceFrame(page);
    await clickAt(page, frame.getByRole("button", { name: "#e53935 — slot 2", exact: true }), "Red color");
    await clickAt(page, frame.getByRole("button", { name: "Brush", exact: true }).first(), "Brush tool");
    const canvas = frame.locator("canvas").first();
    await pointAt(page, canvas, "Pixel canvas");
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.38, box.y + box.height * 0.42);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.48, { steps: 12 });
    await page.mouse.up();
    await setGuideCursor(page, box.x + box.width * 0.52, box.y + box.height * 0.48);
    await parkGuide(page);
  } else if (index === 3) {
    const frame = await pixAlerceFrame(page);
    await clickAt(page, frame.getByRole("button", { name: "App Menu" }), "App Menu");
    await clickAt(page, frame.getByRole("menuitem", { name: /Export Animation/ }), "Export Animation");
    await clickAt(page, frame.getByRole("button", { name: "PNG", exact: true }), "PNG export format");
  } else if (index === 4) {
    const frame = await pixAlerceFrame(page);
    await clickAt(page, frame.getByRole("button", { name: "Device download", exact: true }), "Device download");
    await clickAt(page, frame.getByRole("button", { name: "Raw", exact: true }), "Raw PNG preset");
    const exportButton = frame.getByRole("button", { name: "Export PNG", exact: true });
    await pointAt(page, exportButton, "Export PNG");
    const [download] = await Promise.all([page.waitForEvent("download"), exportButton.click()]);
    if (!download.suggestedFilename().toLowerCase().endsWith(".png")) {
      throw new Error("PixAlerce did not export a PNG");
    }
    await parkGuide(page);
    await page.evaluate((name) => {
      const notice = document.createElement("div");
      notice.dataset.paulResult = "true";
      notice.textContent = `PAUL CHECKED · Downloaded ${name}`;
      Object.assign(notice.style, { position: "fixed", left: "24px", bottom: "60px",
        zIndex: "2147483645", background: "#123d2d", color: "white", padding: "10px 14px",
        border: "2px solid #93e2bb", font: "bold 16px Arial, sans-serif" });
      document.body.append(notice);
    }, download.suggestedFilename());
    await pointAt(page, page.locator('[data-paul-result="true"]'), "Verified PNG download");
    await parkGuide(page);
  }
}

async function coLILseumFrames(page) {
  const iframe = page.locator('[data-wtfiap-surface="true"]:visible iframe[title="coLILseum"]');
  await iframe.waitFor({ state: "visible" });
  const host = await (await iframe.elementHandle()).contentFrame();
  if (!host) throw new Error("coLILseum host frame unavailable");
  const arena = host.locator("#arena");
  const game = await (await arena.elementHandle()).contentFrame();
  if (!game) throw new Error("coLILseum arena frame unavailable");
  await game.waitForFunction(() => document.documentElement.dataset.ready === "true" && window.AB_UI && window.AB_MATCH());
  return { host, game };
}

async function coLILseumHost(page) {
  const iframe = page.locator('[data-wtfiap-surface="true"]:visible iframe[title="coLILseum"]');
  await iframe.waitFor({ state: "visible" });
  const host = await (await iframe.elementHandle()).contentFrame();
  if (!host) throw new Error("coLILseum host frame unavailable");
  return host;
}

async function performGuidedRound(page, index) {
  if (index === 0) {
    const host = await coLILseumHost(page);
    const skip = host.locator("#skip");
    if (await skip.isVisible()) await clickAt(page, skip, "Skip introduction");
    await pointAt(page, host.locator('.choices a[href="learn.html"]'), "Learn guided round");
  } else if (index === 1) {
    const host = await coLILseumHost(page);
    await clickAt(page, host.locator('.choices a[href="learn.html"]'), "Learn guided round");
    await host.getByText("Welcome to the arena", { exact: true }).waitFor({ state: "visible" });
    await clickAt(page, host.locator("#next"), "Start lesson");
    const { game } = await coLILseumFrames(page);
    await clickGameHit(page, game, "shop-preview-0");
    await host.getByText("Recruit your first hero", { exact: true }).waitFor({ state: "visible" });
  } else if (index === 2) {
    const { host, game } = await coLILseumFrames(page);
    await clickGameHit(page, game, "shop-card-buy-0");
    await host.getByText("Place your hero", { exact: true }).waitFor({ state: "visible" });
    await game.waitForFunction(() => window.AB_GAME().bench.length === 1);
    const heroId = await game.evaluate(() => window.AB_GAME().bench[0].id);
    await pointGameHit(page, game, `bench-${heroId}`);
  } else if (index === 3) {
    const { host, game } = await coLILseumFrames(page);
    const tile = await game.evaluate(() => window.AB_UI.grid().tiles.find((item) =>
      item.col === 0 && item.row === window.AB_GAME().board.rows - 1));
    if (!tile) throw new Error("No open tutorial board tile");
    await clickGameHit(page, game, tile);
    await host.getByText("Reveal the whole board", { exact: true }).waitFor({ state: "visible" });
  } else if (index === 4) {
    const { host, game } = await coLILseumFrames(page);
    await clickGameHit(page, game, "shop-toggle");
    await host.getByText("Read team bonuses", { exact: true }).waitFor({ state: "visible" });
    await clickAt(page, game.locator("#traits-icon"), "Team bonuses");
    await host.getByText("Read hero details", { exact: true }).waitFor({ state: "visible" });
    await clickAt(page, game.locator("#details-icon"), "Hero details");
    await host.getByText("Explore items", { exact: true }).waitFor({ state: "visible" });
    await clickAt(page, game.locator("#items-toggle"), "Items");
    await host.getByText("Return to the arena", { exact: true }).waitFor({ state: "visible" });
  } else if (index === 5) {
    const { host, game } = await coLILseumFrames(page);
    await clickAt(page, game.locator("#items-panel .items-head button"), "Close items");
    await host.getByText("Find named controls", { exact: true }).waitFor({ state: "visible" });
    await clickAt(page, game.locator("#accessible-controls summary"), "Named controls");
    await host.getByText("Close the control panel", { exact: true }).waitFor({ state: "visible" });
    await clickAt(page, game.locator("#accessible-controls summary"), "Close controls");
    await host.getByText("Plan your economy", { exact: true }).waitFor({ state: "visible" });
    await clickAt(page, host.locator("#next"), "Continue lesson");
    await clickGameHit(page, game, "battle");
    await host.getByText("You know the basics", { exact: true }).waitFor({ state: "visible" });
    await pointAt(page, host.getByText("You know the basics", { exact: true }), "Guided round complete");
    await parkGuide(page);
  }
}

async function performStep(page, episode, index) {
  switch (episode.slug) {
    case "desktop-basics": return performDesktopBasics(page, index);
    case "mission-control": return performMissionControl(page, index);
    case "side-quest-reward": return performSideQuest(page, index);
    case "play-arcade": return performArcade(page, index);
    case "play-guided-round": return performGuidedRound(page, index);
    case "create-something": return performCreate(page, index);
    case "events": return performEvents(page, index);
    case "talk": return performTalk(page, index);
    case "shop-safely": return performShop(page, index);
    case "personalize": return performPersonalize(page, index);
    default: throw new Error(`No real UI walkthrough recorder for ${episode.slug}`);
  }
}

async function recordEpisode(browser, episode) {
  const timing = JSON.parse(await fs.readFile(
    path.join(work, "narration", `${episode.slug}.timings.json`), "utf8"));
  if (timing.segments.length !== episode.steps.length ||
      episode.spokenSteps.length !== episode.steps.length) {
    throw new Error(`${episode.slug}: step and narration counts differ`);
  }
  await setHarnessState(episode);
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: recordings, size: { width: 1280, height: 720 } },
    reducedMotion: "reduce",
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await installEpisodeFixtures(page, episode);
  await page.goto(`${baseUrl}${episode.route}`, { waitUntil: "domcontentloaded" });
  if (episode.route === "/") {
    await page.locator('[data-wtf-desktop="true"]').waitFor({ state: "visible" });
  }
  const stepDurationsMs = [];
  for (let index = 0; index < episode.steps.length; index += 1) {
    const startedAt = Date.now();
    await showStep(page, episode, index);
    try {
      await performStep(page, episode, index);
    } catch (error) {
      await page.screenshot({ path: path.join(review, `${episode.slug}-failed-${index + 1}.png`) }).catch(() => undefined);
      throw new Error(`${episode.slug} step ${index + 1}: ${error.message}`, { cause: error });
    }
    await page.screenshot({ path: path.join(review,
      `${episode.slug}-step-${String(index + 1).padStart(2, "0")}.png`) });
    const nextStart = timing.segments[index + 1]?.startSeconds ?? timing.totalDurationSeconds;
    const wantedMs = Math.round((nextStart - timing.segments[index].startSeconds) * 1000);
    const elapsed = Date.now() - startedAt;
    if (elapsed < wantedMs) await new Promise((resolve) => setTimeout(resolve, wantedMs - elapsed));
    stepDurationsMs.push(Date.now() - startedAt);
  }
  if (pageErrors.length) throw new Error(`${episode.slug}: page errors: ${pageErrors.join(" | ")}`);
  const video = page.video();
  await context.close();
  if (!video) throw new Error(`${episode.slug}: Playwright did not record video`);
  const source = await video.path();
  const destination = path.join(recordings, `${episode.slug}.webm`);
  await fs.copyFile(source, destination);
  if (source !== destination) await fs.unlink(source).catch(() => undefined);
  await fs.writeFile(path.join(recordings, `${episode.slug}.capture.json`),
    JSON.stringify({ slug: episode.slug, stepDurationsMs }, null, 2) + "\n");
  console.log(`[paul record] ${episode.slug}: ${destination}`);
}

try {
  await waitForHarness();
  const browser = await chromium.launch({ headless: true });
  try {
    for (const episode of catalog) await recordEpisode(browser, episode);
  } finally {
    await browser.close();
  }
} finally {
  harness.kill("SIGTERM");
}
