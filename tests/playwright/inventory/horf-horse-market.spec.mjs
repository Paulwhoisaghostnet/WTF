import { test, expect } from "@playwright/test";

const horse = "KT1L7PSeJpnj79MEaybcEiDtbHM43g5DZe12";
const seller = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const buyer = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
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

  test("opens the first horse's payment choices where the rider can see them", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockMarket(page, true);
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto("/horf/horse-market");
    const card = page.locator("[data-horf-horse-market-listing]");
    const detail = page.locator("[data-horf-horse-market-details]");
    await expect(card).toHaveCount(1);
    await expect(card.getByRole("link", { name: "View full artwork on Objkt" })).toHaveAttribute("href", `https://objkt.com/tokens/${horse}/7`);
    await card.getByRole("button", { name: /View buying options for Neighvember Chestnut/ }).click();
    await expect(detail).toBeInViewport({ ratio: 0.4 });
    await expect(detail).toBeFocused();
    await expect(detail).toContainText("1.23 HORSE per edition");
    await expect(detail.getByRole("button", { name: "Connect wallet for HORSE" })).toBeVisible();
  });

  test("lets a connected buyer reach the exact HORSE purchase control and validates quantity", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await page.addInitScript(({ address }) => {
      window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
    }, { address: buyer });
    await mockMarket(page, true);
    await page.route("**/api/horf/wallet/session", (route) => json(route, { walletAddress: buyer, verified: true }));
    await page.goto("/horf/horse-market");
    await page.locator("[data-horf-horse-market-listing]").getByRole("button", { name: /View buying options for Neighvember Chestnut/ }).click();
    const detail = page.locator("[data-horf-horse-market-details]");
    await expect(detail).toContainText("Neighvember Chestnut");
    await expect(detail).toContainText("Token #7");
    await expect(detail).toContainText("1.23 HORSE per edition");
    const buy = detail.getByRole("button", { name: "Buy with HORSE" });
    await expect(buy).toBeEnabled();
    await detail.locator("[data-horf-horse-market-buy-quantity]").fill("4");
    await buy.click();
    await expect(page.locator('[data-horf-region="horse-market"]').getByRole("alert")).toContainText("Choose an available edition quantity");
    await detail.locator("[data-horf-horse-market-buy-quantity]").fill("2");
    await buy.click();
    await expect(page.getByText("Checking your wallet and Tezos Mainnet…")).toBeVisible();
    await expect(buy).toBeDisabled();
  });

  test("starts at zero editions and reviews an exact listing before requesting a permit", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await page.addInitScript(({ address }) => {
      window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
    }, { address: seller });
    await mockMarket(page, true);
    await page.route("**/api/horf/wallet/session", (route) => json(route, { walletAddress: seller, verified: true }));
    await page.route(/\/api\/horf\/wallet\/tokens\?.*$/, (route) => json(route, {
      items: [{ contract: horse, tokenId: "7", name: "Neighvember Chestnut", balance: "5", walletAddress: seller }],
      pagination: { hasMore: false, nextOffset: 1 },
    }));
    await page.route(/\/api\/horf\/inspections\/status\?.*$/, (route) => json(route, { status: "approved", reason: null }));
    let permitCalls = 0;
    await page.route("**/api/horf/horse-market/permit", (route) => {
      permitCalls++;
      expect(route.request().postDataJSON()).toMatchObject({
        address: seller, tokenContract: horse, tokenId: "7", quantity: "3", unitPriceHorseRaw: "2500000000",
      });
      return json(route, { address: seller, tokenContract: horse, tokenId: "7", quantity: "4",
        unitPriceHorseRaw: "2500000000", contractAddress: market, chainId: "NetXdQprcVkpaWU",
        nonce: `0x${"a".repeat(64)}`, signature: "sig", oracleEpoch: "1" });
    });
    await page.goto("/horf/horse-market");
    const form = page.locator("[data-horf-horse-market-list-form]");
    await expect(form.locator("[data-horf-horse-market-quantity]")).toHaveValue("0");
    await form.locator("[data-horf-horse-market-owned]").selectOption(`${horse}:7`);
    await expect(form.getByRole("button", { name: "Review listing" })).toBeDisabled();
    await form.locator("[data-horf-horse-market-quantity]").fill("3");
    await form.locator("[data-horf-horse-market-price]").fill("25");
    await form.getByRole("button", { name: "Review listing" }).click();
    const review = form.locator("[data-horf-horse-market-list-review]");
    await expect(review).toContainText(horse);
    await expect(review).toContainText("#7");
    await expect(review).toContainText("3 editions");
    await expect(review).toContainText("25 HORSE per edition");
    expect(permitCalls).toBe(0);
    await review.locator("[data-horf-horse-market-list-confirm]").click();
    await expect(page.getByRole("alert")).toContainText("permit changed the reviewed horse");
    expect(permitCalls).toBe(1);
  });
});
