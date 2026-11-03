import { test, expect } from "@playwright/test";

const traderWallet = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const leadWallet = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const thirdWallet = "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79";
const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";

const season = {
  key: "current-2026",
  startsAt: "2026-11-01T00:00:00.000Z",
  endsAt: null,
  label: "November 2026 season",
  inferred: false,
};

const archivedSeason = {
  key: "neighvember-2025",
  startsAt: "2025-11-01T00:00:00.000Z",
  endsAt: "2025-12-01T00:00:00.000Z",
  label: "Neighvember 2025",
  inferred: true,
};

const seasons = [season, archivedSeason];

const leaderboard = [
  { address: thirdWallet, name: "Mare Force", trades: 2, received: 1, sent: 1 },
  { address: leadWallet, name: "Sir Canter", trades: 7, received: 4, sent: 3 },
  { address: traderWallet, name: "You", trades: 3, received: 2, sent: 1 },
];

function seasonResponse(address, seasonKey) {
  if (seasonKey === archivedSeason.key) {
    return {
      season: archivedSeason,
      seasons,
      asOf: "2026-11-03T12:00:00.000Z",
      status: "ready",
      leaderboard: [
        { address: thirdWallet, name: "Mare Force", trades: 6, received: 4, sent: 2 },
        { address: traderWallet, name: "You", trades: 1, received: 1, sent: 0 },
        { address: leadWallet, name: "Sir Canter", trades: 1, received: 0, sent: 1 },
      ],
      currentUser: address === traderWallet ? {
        address: traderWallet,
        received: 1,
        sent: 0,
        trades: 1,
        waitingHorses: [{
          id: 4,
          timestamp: "2025-11-03T10:00:00.000Z",
          from: thirdWallet,
          token: { contract, tokenId: "4", name: "Neighvember 2025 #4", image: null },
          amount: 1,
        }],
        owedTo: [{ address: thirdWallet, name: "Mare Force", count: 1 }],
        owedBy: [],
        recent: [{
          id: "horse-in-2025-4",
          timestamp: "2025-11-03T10:00:00.000Z",
          direction: "in",
          counterparty: thirdWallet,
          token: { contract, tokenId: "4", name: "Neighvember 2025 #4", image: null },
          amount: 1,
        }],
      } : null,
    };
  }
  return {
    season,
    seasons,
    asOf: "2026-11-03T12:00:00.000Z",
    status: "ready",
    leaderboard,
    currentUser: address === traderWallet ? {
      address: traderWallet,
      received: 2,
      sent: 1,
      trades: 3,
      waitingHorses: [{
        id: 7,
        timestamp: "2026-11-03T10:00:00.000Z",
        from: leadWallet,
        token: { contract, tokenId: "7", name: "Neighvember 2026 #7", image: null },
        amount: 2,
      }],
      owedTo: [{ address: leadWallet, name: "Sir Canter", count: 2 }],
      owedBy: [{ address: thirdWallet, name: "Mare Force", count: 1 }],
      recent: [
        {
          id: "horse-in-7",
          timestamp: "2026-11-03T10:00:00.000Z",
          direction: "in",
          counterparty: leadWallet,
          token: { contract, tokenId: "7", name: "Neighvember 2026 #7", image: null },
          amount: 2,
        },
        {
          id: "horse-out-3",
          timestamp: "2026-11-02T10:00:00.000Z",
          direction: "out",
          counterparty: thirdWallet,
          token: { contract, tokenId: "3", name: "Horse of July 2026 #3", image: null },
          amount: 1,
        },
      ],
    } : null,
  };
}

async function seedTrader(request) {
  const response = await request.post("/__test/state", { data: { userRole: "admin" } });
  expect(response.ok()).toBeTruthy();
}

async function mockSeason(page, observedAddresses, observedSeasons = []) {
  await page.route("**/api/horf/season*", (route) => {
    const url = new URL(route.request().url());
    const address = url.searchParams.get("address");
    const seasonKey = url.searchParams.get("season");
    observedAddresses.push(address);
    observedSeasons.push(seasonKey);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(seasonResponse(address, seasonKey)),
    });
  });
}

test.describe("Horf horse trading", () => {
  test("welcomes a direct guest and keeps personal horse records behind wallet proof", async ({ page, request }) => {
    const response = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(response.ok()).toBeTruthy();
    await page.route("**/api/horf/wallet/session", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ walletAddress: null, verified: false }),
    }));
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ active: false, role: null }),
    }));
    await mockSeason(page, []);
    await page.goto("/horf");

    const app = page.locator("[data-horf-app]");
    await expect(app).toBeVisible();
    await expect(app.locator('[data-horf-region="intro"]')).toContainText("No WTF OS account is needed");
    await expect(app.locator("[data-horf-wallet-status]")).toContainText("watch the race without signing in");
    await expect(app.locator('[data-horf-region="race"] [data-horf-lane]')).toHaveCount(3);
    await expect(app.locator("[data-horf-wallet-connect]")).toHaveText("Connect and verify wallet");
    await expect(app.locator('[data-horf-region="personal-stable"]')).toContainText("Connect and verify your Tezos wallet");
    await expect(app.locator('[data-horf-region="personal-stable"] [data-horf-personal-token]')).toBeDisabled();
    await expect(app.locator('[data-horf-region="inspector-desk"]')).toContainText("HORF MARSHAL role");
    await expect(app.locator('[data-horf-region="inspector-desk"] [data-horf-inspection-queue]')).toHaveCount(0);
    await expect(app.locator('[data-horf-region="trader-ledger"]')).toContainText("Connect and verify your Tezos wallet");
    await expect(page).toHaveURL(/\/horf(?:\?season=current-2026)?$/);
  });

  test("keeps a guest on Horf when a wallet proof expires", async ({ page, request }) => {
    const response = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(response.ok()).toBeTruthy();
    await page.addInitScript(({ address }) => {
      window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
    }, { address: traderWallet });
    let verified = true;
    await page.route("**/api/horf/wallet/session", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ walletAddress: verified ? traderWallet : null, verified }),
    }));
    await page.route(/\/api\/horf\/posse(?:\?.*)?$/, (route) => route.fulfill({
      status: 403, contentType: "application/json",
      body: JSON.stringify({ error: "Verify this wallet to use its private Horf features" }),
    }));
    await page.route("**/api/horf/gifts?*", (route) => route.fulfill({
      status: 403, contentType: "application/json",
      body: JSON.stringify({ error: "Verify this wallet to use its private Horf features" }),
    }));
    await mockSeason(page, []);
    await page.goto("/horf");

    const app = page.locator("[data-horf-app]");
    await expect(app.locator("[data-horf-wallet-status]")).toContainText("Horf wallet verified");
    await expect(app.locator('[data-horf-region="horse-send"]')).toContainText("Your Horf wallet proof is missing or expired");
    await expect(app.locator('[data-horf-region="gifts"]')).toContainText("Your Horf wallet proof is missing or expired");
    verified = false;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(app.locator("[data-horf-wallet-status]")).toContainText("Verify it to unlock your Horf ledger");
    await expect(app.locator("[data-horf-wallet-connect]")).toHaveText("Connect and verify wallet");
    await expect(page).toHaveURL(/\/horf(?:\?season=current-2026)?$/);
  });

  test("shows a blacklisted rider's public reason to guests without moderation controls", async ({ page, request }) => {
    const response = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(response.ok()).toBeTruthy();
    await page.route("**/api/horf/wallet/session", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ walletAddress: null, verified: false }),
    }));
    await page.route("**/api/horf/season*", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        ...seasonResponse(null, season.key),
        leaderboard: leaderboard.map((row) => ({ ...row, blacklisted: row.address === leadWallet })),
      }),
    }));
    await page.route("**/api/horf/trader-status?*", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        address: new URL(route.request().url()).searchParams.get("address"),
        blacklisted: true,
        reason: "Repeated failed horse handoffs",
        evidenceUrl: "https://example.org/horf-evidence",
        listedAt: "2026-11-03T12:00:00.000Z",
      }),
    }));
    await page.goto("/horf");

    const app = page.locator("[data-horf-app]");
    const badge = app.locator("[data-horf-blacklist-badge]");
    await expect(badge).toHaveCount(1);
    await badge.click();
    const standing = app.locator('[data-horf-region="trader-status"]');
    await expect(standing.locator("[data-horf-status-address]")).toHaveValue(leadWallet);
    await expect(standing.locator("[data-horf-status-result]")).toContainText("Repeated failed horse handoffs");
    await expect(standing.locator("[data-horf-status-result] a")).toHaveAttribute("href", "https://example.org/horf-evidence");
    await expect(standing.locator("[data-horf-admin-blacklist]")).toHaveCount(0);
    await standing.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-blacklisted-guest.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await standing.scrollIntoViewIfNeeded();
    expect(await standing.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  });

  test("lets a signed-in admin add and clear a trader blacklist entry", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page, []);
    let entries = [];
    await page.route("**/api/horf/admin/blacklist", (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        const entry = {
          address: body.address, active: true, reason: body.reason, evidenceUrl: body.evidenceUrl,
          listedAt: "2026-11-03T12:00:00.000Z", listedByUserId: 1,
          clearedAt: null, clearedByUserId: null,
        };
        entries = [entry];
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(entry) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries }) });
    });
    await page.route(/\/api\/horf\/admin\/blacklist\/tz[1-5][^/]+$/, (route) => {
      const entry = { ...entries[0], active: false, clearedAt: "2026-11-03T12:30:00.000Z", clearedByUserId: 1 };
      entries = [entry];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(entry) });
    });
    await page.route("**/api/horf/trader-status?*", (route) => {
      const address = new URL(route.request().url()).searchParams.get("address");
      const listed = entries.find((entry) => entry.address === address && entry.active);
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          address, blacklisted: Boolean(listed), reason: listed?.reason ?? null,
          evidenceUrl: listed?.evidenceUrl ?? null, listedAt: listed?.listedAt ?? null,
        }),
      });
    });
    await page.goto("/horf");

    const standing = page.locator('[data-horf-region="trader-status"]');
    const admin = standing.locator("[data-horf-admin-blacklist]");
    await expect(admin).toBeVisible();
    await admin.locator("[data-horf-admin-blacklist-address]").fill(leadWallet);
    await admin.locator("[data-horf-admin-blacklist-reason]").fill("Repeated failed horse handoffs");
    await admin.locator("[data-horf-admin-blacklist-evidence]").fill("https://example.org/horf-evidence");
    await admin.locator("[data-horf-admin-blacklist-submit]").click();
    await expect(admin.locator("[data-horf-admin-blacklist-entry]")).toContainText("Repeated failed horse handoffs");
    await expect(standing.locator("[data-horf-status-result]")).toContainText("Blacklisted by Horf moderation");
    await admin.locator("[data-horf-admin-blacklist-remove]").click();
    await expect(admin.locator("[data-horf-admin-blacklist-entry]")).toHaveCount(0);
    await expect(standing.locator("[data-horf-status-result]")).toContainText("No active Horf blacklist entry");
  });

  test("keeps the race open when the season API returns malformed data", async ({ page, request }) => {
    await seedTrader(request);
    await page.route("**/api/horf/season*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    }));

    await page.goto("/horf");

    const app = page.locator("[data-horf-app]");
    await expect(app).toBeVisible();
    await expect(app.getByRole("alert")).toContainText("could not finish reading the season");
    await expect(app.locator('[data-horf-region="race"]')).toContainText("Race board unavailable");
    await expect(page.locator("[data-app-error]")).toHaveCount(0);
  });

  test("welcomes traders and orders the season horse race before wallet connection", async ({ page, request }) => {
    await seedTrader(request);
    const observedAddresses = [];
    await mockSeason(page, observedAddresses);

    await page.goto("/horf");

    const app = page.locator("[data-horf-app]");
    await expect(app).toBeVisible();
    await expect(app.locator('[data-horf-region="intro"]')).toContainText(/horse trader/i);
    await expect(app.locator('[data-horf-region="intro"]')).toContainText("Find other riders");
    await expect(app.locator('[data-horf-region="intro"]')).toContainText("recent trades");
    await expect(app.locator('[data-horf-region="intro"]')).toContainText("November 2026 season");
    await expect(app.getByRole("button", { name: "Browse Trade Boards" })).toBeVisible();
    await expect(app.locator("[data-horf-open-range-open]")).toHaveText("Browse the Open Range");
    await expect(app.locator("[data-horf-wallet-connect]")).toBeVisible();
    await expect(app.locator('[data-horf-region="race"]')).toBeVisible();
    await expect(app.locator("[data-horf-lane]")).toHaveCount(3);
    await expect(app.locator("[data-horf-lane]")).toContainText([
      "Sir Canter",
      "You",
      "Mare Force",
    ]);
    await expect(app.locator("[data-horf-lane]").first()).toHaveAttribute("data-horf-trades", "7");
    expect(observedAddresses).toContain(null);
    await page.screenshot({ path: "test-results/horf-race-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/horf-race-narrow.png", fullPage: true });
    expect(await app.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    const firstLane = app.locator("[data-horf-lane]").first();
    await expect(firstLane).not.toBeInViewport();
    await app.getByRole("button", { name: "Find horse traders" }).focus();
    await page.keyboard.press("Enter");
    await expect(firstLane).toBeInViewport();
    await page.screenshot({ path: "test-results/horf-race-narrow-lanes.png", fullPage: true });
  });

  test("shows the connected trader's receipts, return ledger, and Objkt token links", async ({ page, request }) => {
    await seedTrader(request);
    await page.addInitScript(({ address }) => {
      window.localStorage.setItem("wtf:wallet-session", JSON.stringify({
        address,
        providerName: "octez.connect",
      }));
    }, { address: traderWallet });
    const observedAddresses = [];
    const observedSeasons = [];
    await mockSeason(page, observedAddresses, observedSeasons);
    await page.route("**/api/wallets", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ walletAddress: traderWallet }]),
    }));
    await page.route(`**/api/wallets/${traderWallet}/sync`, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }));
    await page.route("**/api/horf/wallet/tokens?*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        pagination: { limit: 48, offset: 0, total: 0, hasMore: false, nextOffset: 0 },
      }),
    }));

    await page.goto("/horf");

    const app = page.locator("[data-horf-app]");
    await expect(app.locator('[data-horf-region="trader-ledger"]')).toContainText("2");
    await expect(app.locator('[data-horf-region="waiting-horses"]')).toContainText("Neighvember 2026 #7");
    await expect(app.locator('[data-horf-region="waiting-horses"]')).toContainText("2 horses");
    await expect(app.locator('[data-horf-region="waiting-horses"] a[href="https://objkt.com/tokens/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/7"]')).toBeVisible();
    await expect(app.locator('[data-horf-region="owed-to"]')).toContainText("Sir Canter");
    await expect(app.locator('[data-horf-region="owed-to"]')).toContainText("2 horses");
    await expect(app.locator('[data-horf-region="owed-by"]')).toContainText("Mare Force");
    await expect(app.locator('[data-horf-region="owed-by"]')).toContainText("1");
    await expect(app.locator('[data-horf-region="recent"]')).toContainText("Neighvember 2026 #7");
    await expect(app.locator('[data-horf-region="recent"]')).toContainText("Horse of July 2026 #3");
    await expect(app.locator('[data-horf-region="recent"] a[href="https://objkt.com/tokens/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/7"]')).toBeVisible();
    expect(observedAddresses).toContain(traderWallet);
    await app.locator('[data-horf-region="waiting-horses"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-trader-waiting-desktop.png", fullPage: true });
    await app.locator('[data-horf-region="owed-to"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-trader-ledger-desktop.png", fullPage: true });
    await app.locator('[data-horf-region="recent"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-trader-recent-desktop.png", fullPage: true });

    const seasonSelect = app.locator("[data-horf-season-select]");
    await expect(seasonSelect).toHaveValue("current-2026");
    await seasonSelect.selectOption("neighvember-2025");
    await expect(page).toHaveURL(/\?season=neighvember-2025$/);
    await expect(app.locator("[data-horf-lane]").first()).toContainText("Mare Force");
    await expect(app.locator("[data-horf-lane]").first()).toHaveAttribute("data-horf-trades", "6");
    await expect(app.locator('[data-horf-region="season"]')).toContainText("Archive dates are inferred");
    await expect(app.locator('[data-horf-region="waiting-horses"]')).toContainText("Neighvember 2025 #4");
    await expect(app.locator('[data-horf-region="owed-to"]')).toContainText("Mare Force");
    await expect(app.locator('[data-horf-region="recent"]')).toContainText("Neighvember 2025 #4");
    expect(observedAddresses.at(-1)).toBe(traderWallet);
    expect(observedSeasons).toContain("neighvember-2025");
    await seasonSelect.scrollIntoViewIfNeeded();
    await expect(app.locator('[data-horf-region="intro"]')).toContainText("Neighvember 2025");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: "test-results/horf-archive-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await seasonSelect.scrollIntoViewIfNeeded();
    await expect(seasonSelect).toBeInViewport();
    expect(await app.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/horf-archive-narrow.png", fullPage: true });

    await seasonSelect.selectOption("current-2026");
    await expect(page).toHaveURL(/\?season=current-2026$/);
    await expect(app.locator("[data-horf-lane]").first()).toContainText("Sir Canter");
    await expect(app.locator('[data-horf-region="waiting-horses"]')).toContainText("Neighvember 2026 #7");
    expect(observedAddresses.at(-1)).toBe(traderWallet);
    expect(observedSeasons).toContain("current-2026");
  });
});
