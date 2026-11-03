import { test, expect } from "@playwright/test";

const owner = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const now = "2026-11-03T12:00:00.000Z";
const current = { key: "current-2026", label: "November 2026 season", startsAt: "2026-11-01T00:00:00.000Z", endsAt: null, inferred: false };
const archive = { key: "neighvember-2025", label: "Neighvember 2025", startsAt: "2025-11-01T00:00:00.000Z", endsAt: "2025-12-01T00:00:00.000Z", inferred: true };
const modes = [current, archive];

function horse(tokenId, overrides = {}) {
  return {
    contract, tokenId, name: `Horse #${tokenId}`, description: null, image: null,
    mintedAt: now, creatorAddress: owner,
    tradedThroughHorf: false, activelyForTradeOnHorf: false,
    approvedForMarshalsMarket: false, offers: [], ...overrides,
  };
}

async function mockSeasons(page) {
  await page.route("**/api/horf/season?*", (route) => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ season: current, seasons: modes, status: "ready", asOf: now,
      error: null, nextRefreshAt: null, leaderboard: [], currentUser: null }),
  }));
}

test.describe("Horf Open Range", () => {
  test("lets a guest page through untraded mints and switch all range modes", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockSeasons(page);
    const reads = [];
    await page.route("**/api/horf/open-range?*", (route) => {
      const url = new URL(route.request().url());
      const mode = url.searchParams.get("season");
      const cursor = url.searchParams.get("cursor");
      reads.push({ mode, cursor });
      const items = mode === current.key
        ? cursor ? [horse("2", { tradedThroughHorf: true })] : [horse("1")]
        : mode === "all-seasons" ? [horse("3", { activelyForTradeOnHorf: true })]
          : mode === "all-horse-search" ? [horse("4", {
            mintedAt: null, tradedThroughHorf: true, activelyForTradeOnHorf: true,
            approvedForMarshalsMarket: true,
            offers: [{ id: 12, ownerAddress: owner, amount: "2" }],
          })] : [horse("5")];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        season: mode === archive.key ? archive : current, items,
        nextCursor: mode === current.key && !cursor ? "next-1" : null,
        hasMore: mode === current.key && !cursor, asOf: now,
      }) });
    });

    await page.goto("/horf/open-range");
    const range = page.locator("[data-horf-open-range]");
    await expect(range).toContainText("The Open Range");
    await expect(range.locator("[data-horf-open-range-horse]")).toHaveCount(1);
    const first = range.locator("[data-horf-open-range-horse]").first();
    await expect(first).toContainText("Horse #1");
    await expect(first.locator('[data-horf-open-range-status="traded"]')).toHaveText("No Horf trade yet");
    await expect(first.locator('[data-horf-open-range-status="offered"]')).toHaveText("No active Horf offer");
    await expect(first.locator('[data-horf-open-range-status="approved"]')).toHaveText("Not Marshal approved");
    await expect(first).toHaveAttribute("data-horf-frame-traded", "false");
    await expect(first).toHaveAttribute("data-horf-frame-offered", "false");
    await expect(first).toHaveAttribute("data-horf-frame-approved", "false");
    const inactiveBorder = await first.locator('[data-horf-open-range-status="traded"]').evaluate((node) => getComputedStyle(node).borderTopColor);
    await expect(first.getByRole("button", { name: "Offer this horse from my wallet" })).toBeDisabled();
    await range.locator("[data-horf-open-range-more]").click();
    await expect(range.locator("[data-horf-open-range-horse]")).toHaveCount(2);
    expect(reads).toContainEqual({ mode: current.key, cursor: "next-1" });

    await range.locator('[data-horf-open-range-mode="all-seasons"]').check();
    await expect(page).toHaveURL(/\/horf\/open-range\?season=all-seasons$/);
    await expect(range.locator("[data-horf-open-range-horse]")).toHaveCount(1);
    await expect(range.locator("[data-horf-open-range-horse]")).toContainText("Horse #3");
    await expect(range).toContainText("All known campaign windows only");

    await range.locator('[data-horf-open-range-mode="all-horse-search"]').check();
    await expect(page).toHaveURL(/\/horf\/open-range\?season=all-horse-search$/);
    const undated = range.locator("[data-horf-open-range-horse]");
    await expect(undated).toContainText("Mint date unknown");
    await expect(undated.locator('[data-horf-open-range-status="traded"]')).toHaveText("Traded through Horf");
    await expect(undated.locator('[data-horf-open-range-status="offered"]')).toHaveText("For direct trade now");
    await expect(undated.locator('[data-horf-open-range-status="approved"]')).toHaveText("Marshal approved");
    await expect(undated).toHaveAttribute("data-horf-frame-traded", "true");
    await expect(undated).toHaveAttribute("data-horf-frame-offered", "true");
    await expect(undated).toHaveAttribute("data-horf-frame-approved", "true");
    const activeBorder = await undated.locator('[data-horf-open-range-status="traded"]').evaluate((node) => getComputedStyle(node).borderTopColor);
    expect(activeBorder).not.toBe(inactiveBorder);
    await range.locator(`[data-horf-open-range-mode="${archive.key}"]`).check();
    await expect(page).toHaveURL(new RegExp(`/horf/open-range\\?season=${archive.key}$`));
    await expect(range.locator("[data-horf-open-range-horse]")).toContainText("Horse #5");
    expect(reads).toContainEqual({ mode: archive.key, cursor: null });
    await page.screenshot({ path: "test-results/horf-open-range-archive.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await range.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  });

  test("posts and removes a wallet-owned direct offer without moving the horse", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await page.addInitScript(({ address }) => {
      window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
    }, { address: owner });
    await page.route("**/api/wallets", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify([{ walletAddress: owner }]),
    }));
    await page.route(`**/api/wallets/${owner}/sync`, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }),
    }));
    await mockSeasons(page);
    let offered = false;
    let posted = null;
    let removed = false;
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ season: current, items: [horse("7", {
        activelyForTradeOnHorf: offered,
        offers: offered ? [{ id: 99, ownerAddress: owner, amount: "2" }] : [],
      })], nextCursor: null, hasMore: false, asOf: now }),
    }));
    await page.route("**/api/horf/open-range/offers?*", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ offers: offered ? [{ id: 99, ownerAddress: owner,
        tokenContract: contract, tokenId: "7", amount: "2", createdAt: now }] : [] }),
    }));
    await page.route("**/api/horf/open-range/offers", (route) => {
      posted = route.request().postDataJSON();
      offered = true;
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ id: 99, ownerAddress: owner, tokenContract: contract,
          tokenId: "7", amount: "2", createdAt: now, updatedAt: now }) });
    });
    await page.route("**/api/horf/open-range/offers/99", (route) => {
      removed = true;
      offered = false;
      return route.fulfill({ status: 204, body: "" });
    });

    await page.goto("/horf/open-range");
    const range = page.locator("[data-horf-open-range]");
    await expect(range.locator("[data-horf-open-range-horse]")).toContainText("Horse #7");
    await range.getByRole("button", { name: "Offer this horse from my wallet" }).click();
    await range.locator("[data-horf-open-range-offer-amount]").fill("2");
    await range.locator("[data-horf-open-range-offer-post]").click();
    expect(posted).toEqual({ address: owner, tokenContract: contract, tokenId: "7", amount: "2" });
    await expect(range.locator("[data-horf-open-range-my-offer]")).toHaveCount(1);
    await expect(range).toContainText("It stays in your wallet until you sign a transfer");
    await range.locator("[data-horf-open-range-offer-remove]").click();
    expect(removed).toBe(true);
    await expect(range.locator("[data-horf-open-range-my-offer]")).toHaveCount(0);
    await expect(range).toContainText("The horse never left your wallet");
  });
});
