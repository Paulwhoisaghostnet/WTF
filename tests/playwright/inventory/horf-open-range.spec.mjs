import { test, expect } from "@playwright/test";

const owner = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const now = "2026-11-03T12:00:00.000Z";
const current = { key: "current-2026", label: "Neighvember 2026", startsAt: "2026-11-01T00:00:00.000Z", endsAt: null, inferred: false };
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
  await page.route(/\/api\/horf\/horse-market\/objkt-listings(?:\?.*)?$/, (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ listings: [], nextCursor: null }),
  }));
}

test.describe("Horf Open Range", () => {
  test("prioritizes the first horse preview and defers later artwork", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockSeasons(page);
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: false, role: null }),
    }));
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        season: current,
        items: [
          horse("1", { image: "/horf-art/horse-gallop-photo.jpg" }),
          horse("2", { image: "/horf-art/horse-portrait-photo.jpg" }),
          horse("3", { image: "ipfs://QmSharedThumbnail", artifactUri: "ipfs://QmExactFirst", mime: "image/jpeg" }),
          horse("4", { image: "https://nftstorage.link/ipfs/QmSharedThumbnail", artifactUri: "ipfs://QmExactSecond", mime: "image/jpeg" }),
          horse("5", { image: "ipfs://QmUniqueThumbnail", artifactUri: "ipfs://QmLargeArtifact", mime: "image/jpeg" }),
        ],
        nextCursor: null, hasMore: false, asOf: now,
      }),
    }));
    await page.route(/\/api\/cache\/(?:media|artifact)\?/, (route) => route.fulfill({
      status: 200, contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>',
    }));
    await page.goto("/horf/open-range");
    const previews = page.locator("[data-horf-open-range-horse] [data-horf-open-range-view-horse] img");
    await expect(previews).toHaveCount(5);
    await expect(previews.first()).toHaveAttribute("loading", "eager");
    await expect(previews.first()).toHaveAttribute("fetchpriority", "high");
    await expect(previews.nth(1)).toHaveAttribute("loading", "lazy");
    await expect(previews.nth(1)).toHaveAttribute("decoding", "async");
    await expect(previews.nth(2)).toHaveAttribute("src", /^\/api\/cache\/artifact\?/);
    await expect(previews.nth(3)).toHaveAttribute("src", /^\/api\/cache\/artifact\?/);
    expect(await previews.nth(2).getAttribute("src")).not.toBe(await previews.nth(3).getAttribute("src"));
    await expect(previews.nth(4)).toHaveAttribute("src", /^\/api\/cache\/media\?/);
  });

  test("shows a Marshal rejection as a reviewed horse card", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockSeasons(page);
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: false, role: null }),
    }));
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        season: current, items: [horse("77", { inspectionStatus: "rejected" })],
        nextCursor: null, hasMore: false, asOf: now,
      }),
    }));
    await page.goto("/horf/open-range");
    await expect(page.locator("[data-horf-open-range-horse]")).toContainText("Marshal reviewed · rejected for trade");
  });

  test("lets a guest report a suspected non-horse for Marshal review", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockSeasons(page);
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: false, role: null }),
    }));
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        season: current, items: [horse("77")], nextCursor: null, hasMore: false, asOf: now,
      }),
    }));
    const reports = [];
    await page.route("**/api/horf/reports/not-a-horse", (route) => {
      reports.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, contentType: "application/json",
        body: JSON.stringify({ status: "pending", inspectionId: 77 }) });
    });

    await page.goto("/horf/open-range");
    const card = page.locator("[data-horf-open-range-horse]");
    await card.locator("[data-horf-open-range-not-horse]").click();
    await expect(card.locator("[data-horf-open-range-not-horse]")).toHaveText("Sent to Marshal review");
    await expect(card.locator("[data-horf-open-range-not-horse]")).toBeDisabled();
    await expect(page.locator("[data-horf-right-rail]")).toContainText("sent to a HORF Marshal for horse review");
    await card.locator("[data-horf-open-range-view-horse]").click();
    await expect(page.locator("[data-horf-open-range-detail-not-horse]")).toBeDisabled();
    expect(reports).toEqual([{ tokenContract: contract, tokenId: "77" }]);
    await expect(card).toBeVisible();
  });

  test("a Marshal removes a non-horse from the range with one click", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await mockSeasons(page);
    let hidden = false;
    const directHides = [];
    let releaseDecision;
    const decisionGate = new Promise((resolve) => { releaseDecision = resolve; });
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: true, role: "horf_marshal" }),
    }));
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        season: current, items: hidden ? [horse("78")] : [horse("77"), horse("78")],
        nextCursor: null, hasMore: false, asOf: now,
      }),
    }));
    await page.route("**/api/horf/reports/not-a-horse/direct", async (route) => {
      directHides.push(route.request().postDataJSON());
      await decisionGate;
      hidden = true;
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ status: "hidden", inspectionId: 77, tokenContract: contract, tokenId: "77" }) });
    });

    await page.goto("/horf/open-range");
    await expect(page.locator("[data-horf-open-range-horse]")).toHaveCount(2);
    await page.locator("[data-horf-open-range-horse]").first().locator("[data-horf-open-range-not-horse]").click();
    await expect.poll(() => directHides.length).toBe(1);
    expect(hidden).toBe(false);
    await expect(page.locator("[data-horf-open-range-horse]")).toHaveCount(1);
    await expect(page.locator("[data-horf-open-range-horse]")).toContainText("Horse #78");
    releaseDecision();
    await expect(page.locator("[data-horf-right-rail]")).toContainText("hidden from Horf");
    expect(directHides).toEqual([{ tokenContract: contract, tokenId: "77" }]);

    await page.reload();
    await expect(page.locator("[data-horf-open-range-horse]")).toHaveCount(1);
    await expect(page.locator("[data-horf-open-range-horse]")).toContainText("Horse #78");
  });

  test("restores a Marshal-hidden card if its direct decision fails", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await mockSeasons(page);
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: true, role: "horf_marshal" }),
    }));
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        season: current, items: [horse("77"), horse("78")], nextCursor: null, hasMore: false, asOf: now,
      }),
    }));
    let releaseDecision;
    const decisionGate = new Promise((resolve) => { releaseDecision = resolve; });
    let attempts = 0;
    await page.route("**/api/horf/reports/not-a-horse/direct", async (route) => {
      attempts += 1;
      await decisionGate;
      return route.fulfill({ status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "Marshal decision unavailable" }) });
    });
    await page.goto("/horf/open-range");
    await expect(page.locator("[data-horf-open-range-horse]")).toHaveCount(2);
    await page.locator("[data-horf-open-range-horse]").first().locator("[data-horf-open-range-not-horse]").click();
    await expect.poll(() => attempts).toBe(1);
    await expect(page.locator("[data-horf-open-range-horse]")).toHaveCount(1);
    releaseDecision();
    await expect(page.locator("[data-horf-open-range-horse]")).toHaveCount(2);
    await expect(page.getByRole("alert").first()).toContainText("Marshal decision unavailable");
  });

  test("tells a rate-limited horse reporter to hold their horses", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockSeasons(page);
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: false, role: null }),
    }));
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        season: current, items: [horse("77")], nextCursor: null, hasMore: false, asOf: now,
      }),
    }));
    await page.route("**/api/horf/reports/not-a-horse", (route) => route.fulfill({
      status: 429, contentType: "application/json", body: JSON.stringify({ error: "Try again when the review desk has room." }),
    }));
    await page.goto("/horf/open-range");
    const reportButton = page.locator("[data-horf-open-range-not-horse]");
    await reportButton.click();
    await expect(page.getByRole("alert").first()).toContainText("Hold Your Horses");
    await expect(reportButton).toBeEnabled();
  });

  test("lets a Marshal approve a horse from its card without opening evidence", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await mockSeasons(page);
    let approved = false;
    const prepared = [];
    const decisions = [];
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: true, role: "horf_marshal" }),
    }));
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        season: current, items: [horse("77", { approvedForMarshalsMarket: approved })],
        nextCursor: null, hasMore: false, asOf: now,
      }),
    }));
    await page.route("**/api/horf/inspections/marshal", (route) => {
      prepared.push(route.request().postDataJSON());
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: 77 }) });
    });
    await page.route("**/api/horf/inspections/77/decision", (route) => {
      decisions.push(route.request().postDataJSON());
      approved = true;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: 77, status: "approved" }) });
    });

    await page.goto("/horf/open-range");
    const card = page.locator("[data-horf-open-range-horse]");
    await expect(card.locator("[data-horf-open-range-approve]")).toBeVisible();
    await card.locator("[data-horf-open-range-approve]").click();
    await expect(card).toHaveAttribute("data-horf-frame-approved", "true");
    await expect(card.locator("[data-horf-open-range-approve]")).toHaveCount(0);
    await expect(page.locator("[data-horf-open-range-detail]")).not.toBeVisible();
    expect(prepared).toEqual([{ tokenContract: contract, tokenId: "77" }]);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ decision: "approve" });
    expect(decisions[0].reason).toMatch(/direct approval without detailed evidence review/i);
  });

  test("restores a submitted Objkt intent and retries season proof after reload", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    const pending = { intentId: "intent-7", opHash: "oo-submitted-7", buyerAddress: owner, tokenContract: contract, tokenId: "77" };
    await page.addInitScript(({ address, record }) => {
      window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
      window.localStorage.setItem("horf:objkt-pending-purchases", JSON.stringify([record]));
    }, { address: owner, record: pending });
    await page.route("**/api/wallets", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify([{ walletAddress: owner }]),
    }));
    await mockSeasons(page);
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        season: current, items: [horse("77")], nextCursor: null, hasMore: false, asOf: now,
      }),
    }));
    let confirmedBody = null;
    await page.route("**/api/horf/horse-market/objkt-confirm", (route) => {
      confirmedBody = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        status: "verified", operationHash: pending.opHash, tradeCounted: true,
      }) });
    });
    await page.goto("/horf/open-range");
    await page.locator("[data-horf-open-range-view-horse]").click();
    const buy = page.locator("[data-horf-open-range-objkt-buy]");
    await expect(buy).toContainText("Trade proof is pending");
    await buy.locator("[data-horf-open-range-retry-objkt]").click();
    expect(confirmedBody).toEqual({ buyerAddress: owner, intentId: pending.intentId, opHash: pending.opHash });
    await expect(buy).toContainText("seller’s 10 HORSE reward");
    await expect(buy.locator("[data-horf-open-range-retry-objkt]")).toHaveCount(0);
  });

  test("offers an in-page Objkt XTZ buy for a qualifying horse with no HORSE Market listing", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await page.addInitScript(({ address }) => {
      window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
    }, { address: owner });
    await page.route("**/api/wallets", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify([{ walletAddress: owner }]),
    }));
    await mockSeasons(page);
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        season: current, items: [horse("77")], nextCursor: null, hasMore: false, asOf: now,
      }),
    }));
    await page.route(/\/api\/horf\/horse-market\/objkt-listings(?:\?.*)?$/, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ listings: [{
        listingId: "8669074", askId: "12802880", marketplaceContract: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
        version: "v6.2", entrypoint: "fulfill_ask", sellerAddress: owner, priceMutez: "12000000",
        amountLeft: "9", tokenContract: contract, tokenId: "77",
      }], nextCursor: null }),
    }));

    await page.goto("/horf/open-range");
    await page.locator("[data-horf-open-range-view-horse]").click();
    const detail = page.locator("[data-horf-open-range-detail]");
    await expect(detail).toContainText("Horse #77");
    await expect(detail.locator("[data-horf-open-range-objkt-buy]")).toContainText("12.0 XTZ");
    await expect(detail.locator("[data-horf-open-range-buy-xtz]")).toBeVisible();
    await expect(detail.locator("[data-horf-open-range-buy-xtz]")).toBeEnabled();
  });

  test("lets a guest page through untraded mints and switch all range modes", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockSeasons(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const reads = [];
    await page.route("**/api/horf/open-range?*", (route) => {
      const url = new URL(route.request().url());
      const mode = url.searchParams.get("season");
      const cursor = url.searchParams.get("cursor");
      reads.push({ mode, cursor, refresh: url.searchParams.get("refresh"), viewer: url.searchParams.get("viewer") });
      const items = mode === current.key
        ? cursor ? [horse("2", { tradedThroughHorf: true })] : [horse("1", { viewerBalance: "2" })]
        : mode === "all-seasons" ? [horse("3", { activelyForTradeOnHorf: true })]
          : mode === "all-horse-search" ? [horse("4", {
            mintedAt: null, tradedThroughHorf: true, activelyForTradeOnHorf: true,
            approvedForMarshalsMarket: true,
            offers: [{ id: 12, ownerAddress: owner, amount: "2", acceptedTokenPolicy: "marshal_only" }],
          })] : [horse("5")];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        season: mode === archive.key ? archive : current, items,
        nextCursor: mode === current.key && !cursor ? "next-1" : null,
        hasMore: mode === current.key && !cursor, asOf: now,
      }) });
    });

    await page.goto("/horf/open-range");
    const range = page.locator("[data-horf-open-range]");
    const frame = page.locator("[data-horf-frame]");
    const leftNav = frame.locator("[data-horf-left-nav]");
    const primary = frame.locator("[data-horf-primary]");
    const rightRail = frame.locator("[data-horf-right-rail]");
    await expect(frame).toBeVisible();
    const wtfHome = leftNav.locator("[data-horf-wtf-home]");
    await expect(wtfHome).toBeVisible();
    await expect(wtfHome).toHaveAttribute("href", "/");
    await expect(wtfHome).toContainText("Brought to you by wtfOS.app");
    await expect(leftNav.getByRole("link", { name: "Open Range" })).toHaveAttribute("aria-current", "page");
    await expect(rightRail).toContainText("Range report");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    await expect(page.locator("[data-bug-report-trigger]")).toHaveCount(0);
    const layout = await frame.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const left = element.querySelector("[data-horf-left-nav]").getBoundingClientRect();
      const center = element.querySelector("[data-horf-primary]").getBoundingClientRect();
      const right = element.querySelector("[data-horf-right-rail]").getBoundingClientRect();
      return { width: bounds.width, leftRight: left.right, centerLeft: center.left,
        centerRight: center.right, centerWidth: center.width, rightLeft: right.left };
    });
    expect(layout.leftRight).toBeLessThanOrEqual(layout.centerLeft + 1);
    expect(layout.centerWidth).toBeGreaterThanOrEqual(layout.width * 0.75 - 1);
    expect(layout.rightLeft).toBeGreaterThanOrEqual(layout.centerRight - 1);
    await expect(range).toContainText("The Open Range");
    await expect(range.locator("[data-horf-open-range-horse]")).toHaveCount(1);
    const first = range.locator("[data-horf-open-range-horse]").first();
    await expect(first).toContainText("Horse #1");
    await expect(first.locator('[data-horf-open-range-status="traded"]')).toHaveText("No Horf trade yet");
    await expect(first.locator('[data-horf-open-range-status="offered"]')).toHaveText("No active Horf offer");
    await expect(first.locator('[data-horf-open-range-status="approved"]')).toHaveText("Not Marshal approved");
    await expect(first.locator("[data-horf-open-range-approve]")).toHaveCount(0);
    await expect(first.locator("[data-horf-open-range-trade-owned]")).toHaveCount(0);
    await expect(first).toHaveAttribute("data-horf-frame-traded", "false");
    await expect(first).toHaveAttribute("data-horf-frame-offered", "false");
    await expect(first).toHaveAttribute("data-horf-frame-approved", "false");
    await first.locator("[data-horf-open-range-view-horse]").click();
    const detail = range.locator("[data-horf-open-range-detail]");
    await expect(detail).toBeVisible();
    await expect(detail).toContainText("Horse #1");
    await expect(rightRail).toContainText("Horse in your sights");
    await expect(rightRail).toContainText("Horse #1");
    await expect(detail.getByRole("link", { name: "View this horse on Objkt" })).toHaveAttribute("href", `https://objkt.com/tokens/${contract}/1`);
    await page.keyboard.press("Escape");
    await expect(detail).not.toBeVisible();
    const inactiveBorder = await first.locator('[data-horf-open-range-status="traded"]').evaluate((node) => getComputedStyle(node).borderTopColor);
    await range.locator("[data-horf-open-range-more]").click();
    await expect(range.locator("[data-horf-open-range-horse]")).toHaveCount(2);
    expect(reads).toContainEqual({ mode: current.key, cursor: "next-1", refresh: null, viewer: null });

    await expect(range.locator('[data-horf-open-range-mode="all-seasons"]').locator("..")).toContainText("Tracked seasons");
    await expect(range.locator('[data-horf-open-range-mode="all-horse-search"]').locator("..")).toContainText("All time · every horse");
    await range.locator('[data-horf-open-range-mode="all-seasons"]').check();
    await expect(page).toHaveURL(/\/horf\/open-range\?season=all-seasons$/);
    await expect(range.locator("[data-horf-open-range-horse]")).toHaveCount(1);
    await expect(range.locator("[data-horf-open-range-horse]")).toContainText("Horse #3");
    await expect(range).toContainText("Horse trading season windows.");

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
    await undated.locator("[data-horf-open-range-view-horse]").click();
    await expect(detail).toContainText("Wants Marshal-approved horses");
    await detail.getByRole("button", { name: "Close details" }).click();
    await page.screenshot({ path: "test-results/horf-open-range-art-feed.png", fullPage: true });
    await range.locator(`[data-horf-open-range-mode="${archive.key}"]`).check();
    await expect(page).toHaveURL(new RegExp(`/horf/open-range\\?season=${archive.key}$`));
    await expect(range.locator("[data-horf-open-range-horse]")).toContainText("Horse #5");
    expect(reads).toContainEqual({ mode: archive.key, cursor: null, refresh: null, viewer: null });
    await page.screenshot({ path: "test-results/horf-open-range-archive.png", fullPage: true });
    expect(reads.every((read) => read.refresh === null)).toBe(true);
    await range.getByRole("button", { name: "Refresh horses" }).click();
    await expect.poll(() => reads.some((read) => read.mode === archive.key && read.refresh === "1")).toBe(true);
    await expect(range.getByRole("button", { name: "Refresh horses" })).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await range.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    await expect(leftNav).toBeVisible();
    await expect(wtfHome).toBeVisible();
    await expect(wtfHome).toHaveAccessibleName(/wtf.*home/i);
    await expect(rightRail).toBeHidden();
    const updates = primary.getByRole("button", { name: "Trail updates" });
    await updates.focus();
    await page.keyboard.press("Enter");
    await expect(updates).toHaveAttribute("aria-expanded", "true");
    await expect(rightRail).toContainText("Range report");
    await expect(rightRail).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(rightRail).toBeHidden();
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
    const viewers = [];
    await page.route("**/api/horf/open-range?*", (route) => {
      viewers.push(new URL(route.request().url()).searchParams.get("viewer"));
      return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ season: current, items: [horse("7", {
        viewerBalance: "2",
        activelyForTradeOnHorf: offered,
        offers: offered ? [{ id: 99, ownerAddress: owner, amount: "2", acceptedTokenPolicy: "marshal_only" }] : [],
      }), horse("8", { viewerBalance: "0" }), horse("9", { viewerBalance: null })], nextCursor: null, hasMore: false, asOf: now }),
      });
    });
    await page.route("**/api/horf/open-range/offers?*", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ offers: offered ? [{ id: 99, ownerAddress: owner,
        tokenContract: contract, tokenId: "7", amount: "2", acceptedTokenPolicy: "marshal_only", createdAt: now }] : [] }),
    }));
    await page.route("**/api/horf/open-range/offers", (route) => {
      posted = route.request().postDataJSON();
      offered = true;
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ id: 99, ownerAddress: owner, tokenContract: contract,
          tokenId: "7", amount: "2", acceptedTokenPolicy: "marshal_only", createdAt: now, updatedAt: now }) });
    });
    await page.route("**/api/horf/open-range/offers/99", (route) => {
      removed = true;
      offered = false;
      return route.fulfill({ status: 204, body: "" });
    });

    await page.goto("/horf/open-range");
    const range = page.locator("[data-horf-open-range]");
    const owned = range.locator("[data-horf-open-range-horse]").filter({ hasText: "Horse #7" });
    const unowned = range.locator("[data-horf-open-range-horse]").filter({ hasText: "Horse #8" });
    const unavailable = range.locator("[data-horf-open-range-horse]").filter({ hasText: "Horse #9" });
    await expect(owned).toBeVisible();
    expect(viewers).toContain(owner);
    await expect(owned.locator("[data-horf-open-range-trade-owned]")).toHaveText("Trade horse from wallet");
    await expect(unowned.locator("[data-horf-open-range-trade-owned]")).toHaveCount(0);
    await expect(unavailable.locator("[data-horf-open-range-trade-owned]")).toHaveCount(0);
    await expect(range.locator("[data-horf-open-range-offer-amount]")).toHaveCount(0);
    await owned.locator("[data-horf-open-range-trade-owned]").click();
    await expect(range.locator("[data-horf-open-range-offer-amount]")).toBeVisible();
    await range.locator("[data-horf-open-range-offer-amount]").fill("2");
    await range.locator('[data-horf-open-range-policy] input[value="marshal_only"]').check();
    await range.locator("[data-horf-open-range-offer-post]").click();
    expect(posted).toEqual({ address: owner, tokenContract: contract, tokenId: "7", amount: "2", acceptedTokenPolicy: "marshal_only" });
    await expect(range.locator("[data-horf-open-range-my-offer]")).toHaveCount(1);
    await expect(range.locator("[data-horf-open-range-my-offer]")).toContainText("Wants Marshal-approved horses");
    await expect(range).toContainText("It stays in your wallet until you sign a transfer");
    await range.locator("[data-horf-open-range-offer-remove]").click();
    expect(removed).toBe(true);
    await expect(range.locator("[data-horf-open-range-my-offer]")).toHaveCount(0);
    await expect(range).toContainText("The horse never left your wallet");
  });
});
