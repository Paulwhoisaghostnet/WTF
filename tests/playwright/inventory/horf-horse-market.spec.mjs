import { test, expect } from "@playwright/test";

const horse = "KT1L7PSeJpnj79MEaybcEiDtbHM43g5DZe12";
const seller = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const market = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const currency = "KT1E9s2ncE5vXjofmzqwE6gEg9JPruTRBdrM";
const season = { key: "current-2026", startsAt: "2026-11-01T00:00:00.000Z", endsAt: null, label: "Neighvember 2026", inferred: false };

function json(route, body) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockMarket(page, ready) {
  await page.route(/\/api\/horf\/season(?:\?.*)?$/, (route) => json(route, {
    season, seasons: [season], asOf: "2026-11-03T20:00:00Z", status: "ready", error: null,
    nextRefreshAt: null, currentUser: null, leaderboard: [],
  }));
  await page.route("**/api/horf/wallet/session", (route) => json(route, { walletAddress: null, verified: false }));
  await page.route("**/api/horf/horse-market/config", (route) => json(route, {
    status: ready ? "ready" : "unconfigured", network: "mainnet", chainId: "NetXdQprcVkpaWU",
    contractAddress: ready ? market : null, horseContractAddress: ready ? currency : null, permitReady: ready,
  }));
  await page.route("**/api/horf/horse-market/listings", (route) => json(route, { listings: ready ? [{
    id: "2", sellerAddress: seller, tokenContract: horse, tokenId: "7", remaining: "3",
    unitPriceHorseRaw: "123000000", unitPriceHorse: "1.23",
    token: { name: "Neighvember Chestnut", image: "/horf-art/horse-portrait-photo.jpg" },
  }] : [] }));
  await page.route(/\/api\/horf\/horse-market\/objkt-listings(?:\?.*)?$/, (route) => json(route, { listings: [{
    listingId: "8669074", askId: "12802880", marketplaceContract: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
    version: "v6.2", entrypoint: "fulfill_ask", sellerAddress: seller, priceMutez: "12000000",
    amountLeft: "9", tokenContract: horse, tokenId: "7",
  }], nextCursor: null }));
}

test.describe("HORSE market", () => {
  test("shows a clear pending state to a guest before the Mainnet contract is configured", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockMarket(page, false);
    await page.goto("/horf/horse-market");
    await expect(page.locator('[data-horf-app]')).toHaveAttribute("data-horf-page", "horse-market");
    await expect(page.locator('[data-horf-nav="horse-market"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator('[data-horf-region="horse-market"]')).toContainText("being prepared for Mainnet");
    await expect(page.locator('[data-horf-region="horse-market"]')).toContainText("Connect a Tezos wallet to list or buy");
    await expect(page.locator('[data-horf-horse-market-listing]')).toHaveCount(0);
  });

  test("shows separate HORSE and Objkt XTZ purchase choices with exact prices", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockMarket(page, true);
    await page.goto("/horf/horse-market");
    await expect(page.locator('[data-horf-horse-market-listing]')).toHaveCount(1);
    await expect(page.locator('[data-horf-horse-market-listing]')).toContainText("1.23");
    const detail = page.locator('[data-horf-horse-market-details]');
    await expect(detail.getByRole("button", { name: "Buy with HORSE" })).toBeDisabled();
    await expect(detail.getByRole("button", { name: "Buy on Objkt for 12.0 XTZ" })).toBeDisabled();
    await expect(detail).toContainText("Objkt’s contract");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(detail).toBeVisible();
  });
});
