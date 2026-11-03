import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const wallet = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const season = { key: "current-2026", startsAt: "2026-11-01T00:00:00.000Z", endsAt: null, label: "Neighvember 2026", inferred: false };
const archiveSeason = { key: "neighvember-2025", startsAt: "2025-11-01T00:00:00.000Z", endsAt: "2025-12-01T00:00:00.000Z", label: "Neighvember 2025", inferred: true };
const allTimeSeason = { key: "all-time", startsAt: "2023-07-30T00:00:00.000Z", endsAt: null, label: "All time", inferred: true };
const horsePortrait = readFileSync("public/horf-art/horse-portrait-photo.jpg");

function json(route, body) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockSeason(page, getRiderName = () => null, includeRider = true) {
  await page.route("**/api/horf/season*", (route) => {
    const allTime = new URL(route.request().url()).searchParams.get("season") === "all-time";
    return json(route, {
      season: allTime ? allTimeSeason : season, seasons: [allTimeSeason, season, archiveSeason],
      asOf: "2026-11-03T12:00:00.000Z", status: "ready", error: null,
      nextRefreshAt: null,
      leaderboard: includeRider ? [{ address: wallet, name: getRiderName() || "Trail Rider", trades: allTime ? 12 : 3,
        received: allTime ? 7 : 2, sent: allTime ? 5 : 1 }] : [],
      currentUser: null,
    });
  });
  await page.route(/\/api\/horf\/open-range\?season=current-2026$/, (route) => json(route, { items: [] }));
}

async function mockConnectedWallet(page, onTokenRead = () => {}) {
  await page.addInitScript(({ address }) => {
    window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
  }, { address: wallet });
  await page.route("**/api/wallets", (route) => json(route, [{ walletAddress: wallet }]));
  await page.route(`**/api/wallets/${wallet}/sync`, (route) => json(route, { ok: true }));
  await page.route("**/api/horf/wallet/tokens?*", (route) => {
    onTokenRead(new URL(route.request().url()));
    return json(route, {
      items: [], pagination: { limit: 48, offset: 0, total: 0, hasMore: false, nextOffset: 0 },
    });
  });
  await page.route("**/api/horf/stable-selections?*", (route) => json(route, { selections: [] }));
}

test.describe("Horf Stable and trader profile", () => {
  test("gives a disconnected rider clear Stable directions and retains a separate public race", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(state.ok()).toBeTruthy();
    await mockSeason(page);
    await page.goto("/horf/stable?season=current-2026");
    const stable = page.locator('[data-horf-region="personal-stable"]');
    await expect(stable).toBeVisible();
    await expect(stable.locator("[data-horf-profile-connect]")).toBeVisible();
    await expect(stable.locator("[data-horf-profile-connect]")).toContainText(/connect/i);
    await page.goto("/horf/race?season=current-2026");
    await expect(page.locator('[data-horf-region="race"]')).toBeVisible();
  });

  test("lands a connected rider in their Stable and publishes their seasonal picture and note", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "admin" } });
    expect(state.ok()).toBeTruthy();
    const tokenRefreshes = [];
    await mockConnectedWallet(page, (url) => tokenRefreshes.push(url.searchParams.get("refresh")));
    let saved = { address: wallet, seasonKey: season.key, imageUrl: null, description: "", updatedAt: null,
      username: null, displayName: null, usernameSource: "wallet", canEditUsername: true };
    await mockSeason(page, () => saved.displayName);
    const writes = [];
    let pictureUploads = 0;
    const offsets = [];
    const horseRefreshes = [];
    await page.route(/\/api\/horf\/traders\/[^/]+\/profile\?season=current-2026$/, (route) => {
      expect(new URL(route.request().url()).pathname).toBe(`/api/horf/traders/${wallet}/profile`);
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        writes.push(body);
        saved = { ...saved, ...body, displayName: body.username || null,
          usernameSource: body.username ? "horf" : "wallet", updatedAt: "2026-11-03T12:01:00.000Z" };
      }
      return json(route, saved);
    });
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => {
      const offset = Number(new URL(route.request().url()).searchParams.get("offset") || 0);
      offsets.push(offset);
      horseRefreshes.push(new URL(route.request().url()).searchParams.get("refresh"));
      return json(route, {
        address: wallet,
        items: offset === 0 ? [] : [{ contract, tokenId: "7", balance: "2", viewerBalance: "2", name: "Neighvember Seven", image: "/horf-art/horse-gallop-photo.jpg", description: "Horse art", creatorAddress: wallet }],
        pagination: { hasMore: offset === 0, nextOffset: offset === 0 ? 48 : 49 },
      });
    });
    await page.route(/\/api\/horf\/traders\/[^/]+\/offers(?:\?.*)?$/, (route) => json(route, { address: wallet, metadataStatus: "ready", offers: [] }));
    await page.route(/\/api\/horf\/open-range\/offers(?:\?.*)?$/, (route) => json(route, { offers: [] }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/profile-picture(?:\?.*)?$/, (route) => {
      if (route.request().method() === "POST") {
        pictureUploads += 1;
        expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
        saved = { ...saved, imageUrl: `/api/horf/traders/${wallet}/profile-picture?v=abcdef123456` };
        return json(route, saved);
      }
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: horsePortrait });
    });

    await page.goto("/horf?season=current-2026");
    const app = page.locator("[data-horf-app]");
    await expect(app).toHaveAttribute("data-horf-page", "stable");
    const headerWallet = page.locator("[data-horf-header-wallet]");
    await expect(headerWallet).toBeVisible();
    await expect(headerWallet).toHaveAttribute("title", new RegExp(wallet));
    const stable = page.locator('[data-horf-region="personal-stable"]');
    await expect(stable).toBeVisible();
    await expect(stable.locator("[data-horf-profile-editor]")).toBeVisible();
    await expect(stable.locator("[data-horf-stable-wallet-status]")).toContainText("WTF OS linked · browser wallet selected");
    await expect(stable.locator("[data-horf-stable-wallet-status] code")).toHaveAttribute("title", wallet);
    await expect(stable.locator("[data-horf-stable-reconnect]")).toBeVisible();
    await expect(stable.locator("[data-horf-profile-wallet]")).toContainText(wallet);
    await expect.poll(() => offsets).toContain(48);
    await expect(stable.locator("[data-horf-stable-horse]")).toContainText("Neighvember Seven");
    await expect(stable.locator("[data-horf-stable-scan-complete]")).toContainText("Showing 1 horse · scan complete");
    await expect(stable.locator("[data-horf-stable-horse] [data-horf-edition-holdings]")).toContainText("You own 2 editions");
    expect(tokenRefreshes.every((value) => value === null)).toBe(true);
    expect(horseRefreshes.every((value) => value === null)).toBe(true);
    await stable.locator("[data-horf-stable-refresh]").click();
    await expect.poll(() => tokenRefreshes.includes("1")).toBe(true);
    await expect.poll(() => horseRefreshes.includes("1")).toBe(true);
    await expect(stable.locator("[data-horf-stable-scan-complete]")).toContainText("Showing 1 horse · scan complete");

    const picture = "https://cdn.objkt.com/test/horf-profile.jpg";
    await page.route(picture, (route) => route.fulfill({ status: 200, contentType: "image/jpeg", body: horsePortrait }));
    await stable.locator("[data-horf-profile-photo-input]").fill(picture);
    await stable.locator("[data-horf-profile-username]").fill("Saddle Scout");
    await stable.locator("[data-horf-profile-description]").fill("Riding the Neighvember trail with every pony in the posse.");
    await stable.locator("[data-horf-profile-save]").click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toEqual({ imageUrl: picture, username: "Saddle Scout",
      description: "Riding the Neighvember trail with every pony in the posse." });
    await expect(stable.locator("[data-horf-profile-name]")).toHaveText("Saddle Scout");
    await expect(stable.locator("[data-horf-profile-description-preview]")).toHaveText("Riding the Neighvember trail with every pony in the posse.");
    await expect(stable.locator("[data-horf-profile-description]")).toHaveCount(0);
    await stable.locator("[data-horf-profile-edit]").click();
    await stable.locator("[data-horf-profile-description]").fill("An unsaved trail note still in my saddlebag.");
    await stable.locator("[data-horf-profile-upload]").setInputFiles({
      name: "trail-horse.jpg", mimeType: "image/jpeg", buffer: horsePortrait,
    });
    await expect.poll(() => pictureUploads).toBe(1);
    await expect(stable.locator("[data-horf-profile-description]")).toHaveValue("An unsaved trail note still in my saddlebag.");
    await stable.getByRole("button", { name: "Cancel" }).click();
    await expect(stable.locator("[data-horf-profile-description-preview]")).toHaveText("Riding the Neighvember trail with every pony in the posse.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("[data-horf-primary]").evaluate((node) => { node.scrollTop = 0; });
    await page.screenshot({ path: "/tmp/horf-stable-profile-desktop.png", fullPage: true });
    await page.screenshot({ path: "/tmp/horf-stable-profile-desktop-viewport.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-horf-primary]").evaluate((node) => { node.scrollTop = 0; });
    await expect(page.locator("[data-horf-right-rail]")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "/tmp/horf-stable-profile-mobile.png", fullPage: true });
    await page.screenshot({ path: "/tmp/horf-stable-profile-mobile-viewport.png" });

    await page.goto(`/horf/traders/${wallet}?season=current-2026`);
    const publicProfile = page.locator('[data-horf-region="trader-profile"]');
    await expect(publicProfile.locator("[data-horf-profile-name]")).toHaveText("Saddle Scout");
    await expect(publicProfile.locator("[data-horf-profile-wallet]")).toContainText(wallet);
    await expect(publicProfile.locator("[data-horf-profile-wallet]").getByRole("button", { name: /Copy Tezos wallet/ })).toBeVisible();
    await expect(publicProfile).toContainText("Riding the Neighvember trail with every pony in the posse.");
    await expect(publicProfile.locator("[data-horf-profile-picture]")).toHaveAttribute("src", saved.imageUrl);
    await publicProfile.locator('[data-horf-profile-tab="all-horses"]').click();
    await expect(publicProfile.locator("[data-horf-profile-horse]")).toHaveCount(0);
    await publicProfile.getByRole("button", { name: "Load more horses" }).click();
    await expect(publicProfile.locator("[data-horf-profile-horse]")).toContainText("Neighvember Seven");
    await expect(publicProfile.locator("[data-horf-profile-horse] [data-horf-edition-holdings]")).toHaveText("Trader owns 2 editions · You own 2 editions");
    await page.goto("/horf/traders?season=current-2026");
    await expect(page.locator('[data-horf-region="trader-directory"]')).toContainText("Saddle Scout");
    await page.goto("/horf/race?season=current-2026");
    await expect(page.locator('[data-horf-region="race"]')).toContainText("Saddle Scout");
    await page.goto(`/horf/traders/${wallet}?season=current-2026`);
    const seasonSelect = page.locator("[data-horf-season-select]");
    await expect(seasonSelect.locator('option[value="all-time"]')).toHaveText("All time · tracked seasons");
    await seasonSelect.selectOption("all-time");
    await expect(page).toHaveURL(new RegExp(`/horf/traders/${wallet}\\?season=all-time$`));
    await expect(page.locator("#horf-season-boundary")).toContainText("Tracked seasons combined");
    await expect(publicProfile).toContainText("Riding the Neighvember trail with every pony in the posse.");
    await page.goto("/horf/race?season=all-time");
    await expect(page.locator('[data-horf-region="race"] [data-horf-lane]')).toHaveAttribute("data-horf-trades", "12");
    await page.goto("/horf?season=all-time");
    await expect(page.locator('[data-horf-app]')).toHaveAttribute("data-horf-page", "stable");
    await expect(page.locator("#horf-season-boundary")).toContainText("Tracked seasons combined");
    await expect(page.locator("[data-horf-profile-description-preview]")).toHaveText("Riding the Neighvember trail with every pony in the posse.");
  });

  test("pauses a failed later horse page and resumes without claiming the stable is empty", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "admin" } });
    expect(state.ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockSeason(page);
    let failLaterPage = true;
    const offsets = [];
    const refreshes = [];
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset") || 0);
      offsets.push(offset);
      refreshes.push({ offset, refresh: url.searchParams.get("refresh") });
      if (offset === 48 && failLaterPage) return route.fulfill({
        status: 503, contentType: "application/json", body: JSON.stringify({ error: "Horse index is resting" }),
      });
      return json(route, { address: wallet,
        items: offset === 0 ? [] : [{ contract, tokenId: "7", balance: "1", name: "Trail Pony", image: null, description: "Horse art", creatorAddress: wallet }],
        pagination: { hasMore: offset === 0, nextOffset: offset === 0 ? 48 : 49 },
      });
    });
    await page.goto("/horf/stable?season=current-2026");
    const stable = page.locator('[data-horf-region="personal-stable"]');
    const retry = stable.locator("[data-horf-stable-scan-retry]");
    await expect(retry).toBeVisible();
    await expect(stable.locator("[data-horf-qualifying-horses]")).toContainText("Horse scan paused after 1 page");
    await expect(stable.locator("[data-horf-stable-scan-complete]")).toHaveCount(0);
    await expect(stable).not.toContainText("No qualifying horses found in this wallet");
    expect(offsets).toContain(48);
    expect(refreshes.every((read) => read.refresh === null)).toBe(true);
    failLaterPage = false;
    await retry.click();
    await expect.poll(() => refreshes.some((read) => read.offset === 48 && read.refresh === "1")).toBe(true);
    await expect(stable.locator("[data-horf-stable-horse]")).toContainText("Trail Pony");
    await expect(stable.locator("[data-horf-stable-scan-complete]")).toContainText("Showing 1 horse · scan complete");
    await expect(retry).toHaveCount(0);
  });

  test("guides a signed-in rider whose WTF OS linked wallet is not selected in this browser", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "admin" } });
    expect(state.ok()).toBeTruthy();
    await page.route("**/api/wallets", (route) => json(route, [{ walletAddress: wallet }]));
    await mockSeason(page);
    await page.goto("/horf/stable?season=current-2026");
    const stable = page.locator('[data-horf-region="personal-stable"]');
    const status = stable.locator("[data-horf-stable-wallet-status]");
    await expect(status).toContainText("No wallet selected");
    await expect(status).toContainText("1 linked wallet");
    await expect(status).toContainText("none is selected in this browser");
    await expect(status.locator("[data-horf-profile-connect]")).toHaveText("Connect a linked wallet");
    await expect(stable.locator("[data-horf-profile-editor]")).toHaveCount(0);
    await expect(stable.locator("[data-horf-qualifying-horses]")).toHaveCount(0);
  });

  test("shows every held horse by default and filters only by mint season", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "admin" } });
    expect(state.ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockSeason(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route(/\/api\/horf\/traders\/[^/]+\/profile\?season=current-2026$/, (route) => json(route, {
      address: wallet, seasonKey: season.key, imageUrl: null, description: "Horse art for the whole trail.",
      updatedAt: "2026-11-03T12:00:00.000Z", username: "Trail Keeper", displayName: "Trail Keeper",
      usernameSource: "horf", canEditUsername: true,
    }));
    const offsets = [];
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => {
      const offset = Number(new URL(route.request().url()).searchParams.get("offset") || 0);
      offsets.push(offset);
      return json(route, { address: wallet,
        items: offset === 0 ? [
          { contract, tokenId: "7", balance: "1", mintedAt: "2026-11-02T12:00:00.000Z", name: "Current Colt", image: "/horf-art/horse-gallop-photo.jpg", description: "Current horse art", creatorAddress: wallet },
          { contract, tokenId: "8", balance: "2", mintedAt: "2025-11-02T12:00:00.000Z", name: "Old Mare", image: "/horf-art/horse-beach-photo.jpg", description: "Old horse art", creatorAddress: wallet },
        ] : [
          { contract, tokenId: "9", balance: "1", mintedAt: null, name: "Mystery Foal", image: "/horf-art/horse-portrait-photo.jpg", description: "Undated horse art", creatorAddress: wallet },
          { contract, tokenId: "10", balance: "1", mintedAt: "2026-06-15T12:00:00.000Z", name: "Between Seasons", image: "/horf-art/horse-gallop-photo.jpg", description: "Horse art outside tracked campaigns", creatorAddress: wallet },
        ],
        pagination: { hasMore: offset === 0, nextOffset: offset === 0 ? 48 : 49 },
      });
    });

    await page.goto("/horf?season=current-2026");
    const stable = page.locator('[data-horf-region="personal-stable"]');
    const filter = stable.locator("[data-horf-mint-season]");
    await expect(filter).toHaveValue("all");
    await expect(stable.locator("[data-horf-stable-scan-complete]")).toContainText("Showing 4 horses · scan complete");
    expect(offsets).toContain(48);
    const cards = stable.locator("[data-horf-stable-horse]");
    await expect(cards).toHaveCount(4);
    await expect(cards.filter({ hasText: "Current Colt" }).locator("[data-horf-mint-badge]")).toHaveText(season.label);
    await expect(cards.filter({ hasText: "Current Colt" }).locator("[data-horf-mint-badge] img")).toHaveAttribute("src", "/horf-art/horseshoe.svg");
    await expect(cards.filter({ hasText: "Old Mare" }).locator("[data-horf-mint-badge]")).toHaveText(archiveSeason.label);
    await expect(cards.filter({ hasText: "Mystery Foal" }).locator("[data-horf-mint-badge]")).toHaveCount(0);
    await expect(cards.filter({ hasText: "Between Seasons" }).locator("[data-horf-mint-badge]")).toHaveCount(0);
    await expect(stable).toContainText("Mystery Foal");
    await expect(stable).toContainText("Between Seasons");
    await page.locator("[data-horf-primary]").evaluate((node) => { node.scrollTop = 0; });
    await expect(cards.first().locator(".art > img")).toBeInViewport();
    await page.screenshot({ path: "/tmp/horf-stable-all-horses-entry-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-horf-primary]").evaluate((node) => { node.scrollTop = 0; });
    await expect(page.locator("[data-horf-right-rail]")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "/tmp/horf-stable-all-horses-entry-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 900 });

    await filter.selectOption(season.key);
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Current Colt");
    await expect(stable).not.toContainText("Old Mare");
    await expect(stable).not.toContainText("Mystery Foal");
    await expect(stable).not.toContainText("Between Seasons");
    await filter.selectOption(archiveSeason.key);
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Old Mare");
    await filter.selectOption("all");
    await expect(cards).toHaveCount(4);
    await expect(stable).toContainText("Mystery Foal");
    await expect(stable).toContainText("Between Seasons");
  });

  test("shows a linked WTF OS username as the rider name and keeps the Horf alias read-only", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "admin" } });
    expect(state.ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockSeason(page, () => "WTF Rider", false);
    await page.route(/\/api\/horf\/traders\/[^/]+\/profile\?season=current-2026$/, (route) => json(route, {
      address: wallet, seasonKey: season.key, imageUrl: null, description: "Trading paints and ponies.",
      updatedAt: "2026-11-03T12:00:00.000Z", username: "Old Horf Alias", displayName: "WTF Rider",
      usernameSource: "wtf", canEditUsername: false,
    }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => json(route, {
      address: wallet, items: [], pagination: { hasMore: false, nextOffset: 0 },
    }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/offers(?:\?.*)?$/, (route) => json(route, { address: wallet, metadataStatus: "ready", offers: [] }));
    await page.goto("/horf?season=current-2026");
    const editor = page.locator("[data-horf-profile-editor]");
    await expect(editor.locator("[data-horf-profile-name]")).toHaveText("WTF Rider");
    await expect(editor).toContainText("WTF OS username");
    await expect(editor.locator("[data-horf-profile-username]")).toHaveCount(0);
    await page.goto(`/horf/traders/${wallet}?season=current-2026`);
    const publicCard = page.locator("[data-horf-public-profile]");
    await expect(publicCard.locator("[data-horf-profile-name]")).toHaveText("WTF Rider");
    await expect(page.locator('[data-horf-region="trader-profile"] > h2')).toHaveText("WTF Rider");
    await expect(publicCard).toContainText("Trading paints and ponies.");
  });
});
