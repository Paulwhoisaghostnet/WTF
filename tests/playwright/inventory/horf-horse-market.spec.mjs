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

async function mockMarket(page, ready, token = { name: "Neighvember Chestnut", image: "/horf-art/horse-portrait-photo.jpg" }, marketListings = null) {
  await page.route(/\/api\/horf\/season(?:\?.*)?$/, (route) => json(route, {
    season, seasons: [season], asOf: "2026-11-03T20:00:00Z", status: "ready", error: null,
    nextRefreshAt: null, currentUser: null, leaderboard: [],
  }));
  await page.route("**/api/horf/wallet/session", (route) => json(route, { walletAddress: null, verified: false }));
  await page.route("**/api/horf/horse-market/config", (route) => json(route, {
    status: ready ? "ready" : "unconfigured", network: "mainnet", chainId: "NetXdQprcVkpaWU",
    contractAddress: ready ? market : null, horseContractAddress: ready ? currency : null, permitReady: ready,
  }));
  await page.route("**/api/horf/horse-market/listings", (route) => json(route, { listings: ready ? marketListings ?? [{
    id: "2", sellerAddress: seller, tokenContract: horse, tokenId: "7", remaining: "3",
    unitPriceHorseRaw: "123000000", unitPriceHorse: "1.23",
    token,
  }] : [] }));
  await page.route(/\/api\/horf\/horse-market\/objkt-listings(?:\?.*)?$/, (route) => json(route, { listings: [{
    listingId: "8669074", askId: "12802880", marketplaceContract: "KT1SwbTqhSKF6Pdokiu1K4Fpi17ahPPzmt1X",
    version: "v6.2", entrypoint: "fulfill_ask", sellerAddress: seller, priceMutez: "12000000",
    amountLeft: "9", tokenContract: horse, tokenId: "7",
  }], nextCursor: null }));
}

test.describe("HORSE market", () => {
  test("uses one Horse Market nav item for three tabs and preserves legacy trade links", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockMarket(page, true);
    await page.route("**/api/horf/open-range/offers", (route) => json(route, { offers: [{
      id: 71, ownerAddress: seller, ownerName: "Sir Canter", tokenContract: horse, tokenId: "7",
      amount: "2", acceptedTokenPolicy: "any_qualifying", name: "Neighvember Chestnut",
      image: "/horf-art/horse-portrait-photo.jpg", creatorAddress: buyer, creatorName: "Mare Force",
      createdAt: "2026-11-03T12:00:00.000Z",
    }] }));

    await page.goto("/horf/horse-market?season=current-2026");
    const nav = page.locator("[data-horf-left-nav]");
    await expect(nav.locator('[data-horf-nav="horse-market"]')).toHaveCount(1);
    await expect(nav.locator('[data-horf-nav="marshal"], [data-horf-nav="outlaw"]')).toHaveCount(0);
    const tabs = page.getByRole("tablist", { name: "Horse market areas" });
    await expect(tabs.getByRole("tab")).toHaveCount(3);
    const horse4horse = tabs.getByRole("tab", { name: /Horse4HORSE/ });
    const marshals = tabs.getByRole("tab", { name: /Marshal’s Market/ });
    const outlaw = tabs.getByRole("tab", { name: /Outlaw Corral/ });
    await expect(horse4horse).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-horf-region="horse-market"]')).toBeVisible();
    await expect(page.locator('[data-horf-region="marshals-market"], [data-horf-region="outlaw-corral"]')).toHaveCount(0);

    await marshals.click();
    await expect(page).toHaveURL(/\/horf\/horse-market\?season=current-2026&market=marshals$/);
    await expect(marshals).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-horf-region="marshals-market"]')).toBeVisible();
    await expect(page.locator('[data-horf-region="horse-market"], [data-horf-region="outlaw-corral"]')).toHaveCount(0);
    await outlaw.click();
    await expect(page).toHaveURL(/\/horf\/horse-market\?season=current-2026&market=outlaw&outlaw=rooms$/);
    await expect(outlaw).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-horf-outlaw-tab="rooms"]')).toHaveAttribute("aria-selected", "true");
    await page.locator('[data-horf-outlaw-tab="available"]').click();
    await expect(page).toHaveURL(/\/horf\/horse-market\?season=current-2026&market=outlaw&outlaw=available$/);
    await expect(page.locator('[data-horf-region="outlaw-corral"] [data-horf-outlaw-offer]')).toHaveCount(1);
    await expect(page.locator('[data-horf-region="horse-market"], [data-horf-region="marshals-market"]')).toHaveCount(0);
    await horse4horse.click();
    await expect(page).toHaveURL(/\/horf\/horse-market\?season=current-2026&market=horse4horse$/);
    await expect(horse4horse).toHaveAttribute("aria-selected", "true");

    await page.goto("/horf/outlaw-corral?season=current-2026&offer=71");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/horf/horse-market");
    expect(new URL(page.url()).searchParams.get("market")).toBe("outlaw");
    expect(new URL(page.url()).searchParams.get("outlaw")).toBe("available");
    expect(new URL(page.url()).searchParams.get("offer")).toBe("71");
    const featured = page.locator('[data-horf-outlaw-offer-id="71"]');
    await expect(featured).toHaveAttribute("data-horf-outlaw-featured", "");
    await expect(page.locator('[data-horf-proposal-dialog]')).toBeVisible();
    await expect(page.locator('[data-horf-proposal-dialog]')).toContainText("Offer your horse");
    await page.goto("/horf/marshals-market?season=current-2026");
    await expect.poll(() => new URL(page.url()).pathname).toBe("/horf/horse-market");
    expect(new URL(page.url()).searchParams.get("market")).toBe("marshals");
    await expect(page.locator('[data-horf-region="marshals-market"]')).toBeVisible();
  });

  test("shows a clear pending state to a guest before the Mainnet contract is configured", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockMarket(page, false);
    await page.goto("/horf/horse-market");
    await expect(page.locator('[data-horf-app]')).toHaveAttribute("data-horf-page", "horse-market");
    await expect(page.locator('[data-horf-nav="horse-market"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator('[data-horf-region="horse-market"]')).toContainText("being prepared for Mainnet");
    await expect(page.locator('[data-horf-horse-market-list-form]').getByRole("button", { name: "Connect to list" })).toBeVisible();
    await expect(page.locator('[data-horf-horse-market-listing]')).toHaveCount(0);
  });

  test("features a live listing mint before the sale cards and opens its artwork by keyboard", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockMarket(page, true, { name: "Galloping Mare", image: "/horf-art/horse-gallop-photo.jpg" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/horf/horse-market");
    const featured = page.locator("[data-horf-horse-market-featured-mint]");
    await expect(featured).toBeVisible();
    await expect(featured.locator("img")).toHaveAttribute("src", /horse-gallop-photo\.jpg/);
    await expect(page.locator("[data-horf-horse-market-listing]").first()).toBeInViewport({ ratio: 0.1 });
    await featured.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-horf-horse-market-art-modal]")).toContainText("Galloping Mare");
    await page.keyboard.press("Escape");
    await expect(page.locator("[data-horf-horse-market-art-modal]")).toBeHidden();
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

  test("focuses an exact active HORSE listing link and explains a missing listing", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockMarket(page, true, undefined, [
      { id: "2", sellerAddress: seller, tokenContract: horse, tokenId: "7", remaining: "3", unitPriceHorseRaw: "123000000", token: { name: "First Chestnut" } },
      { id: "9", sellerAddress: seller, tokenContract: horse, tokenId: "8", remaining: "1", unitPriceHorseRaw: "250000000", token: { name: "Linked Mare" } },
      { id: "10", sellerAddress: seller, tokenContract: horse, tokenId: "9", remaining: "0", unitPriceHorseRaw: "250000000", token: { name: "Sold Horse" } },
    ]);
    await page.setViewportSize({ width: 390, height: 600 });
    await page.goto("/horf/horse-market?market=horse4horse&listing=9");
    const linked = page.locator('[data-horf-horse-market-listing-id="9"]');
    await expect(linked).toHaveAttribute("data-horf-horse-market-featured", "");
    await expect(linked).toBeFocused();
    await expect(linked).toBeInViewport({ ratio: 0.4 });
    const detail = page.locator("[data-horf-horse-market-details]");
    await expect(detail).toContainText("Linked Mare");
    await expect(detail).toContainText("Token #8");

    await page.goto("/horf/horse-market?market=horse4horse&listing=10");
    await expect(page.locator('[data-horf-region="horse-market"]')).toContainText("Listing #10 is no longer active");
    await expect(page.locator('[data-horf-horse-market-listing-id="10"]')).toHaveCount(0);
    await expect(detail).toContainText("Select a horse from the corral");
    await page.locator('[data-horf-horse-market-listing-id="2"]').getByRole("button", { name: /View buying options/ }).click();
    await expect(detail).toContainText("First Chestnut");
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

  test("opens exact token artwork and details in a full-screen viewer with every close control", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockMarket(page, true);
    await page.goto("/horf/horse-market");
    const open = page.locator("[data-horf-horse-market-art-trigger]");
    const viewer = page.locator("[data-horf-horse-market-art-modal]");
    await open.click();
    await expect(viewer).toBeVisible();
    const bounds = await viewer.boundingBox();
    expect(bounds).toMatchObject({ x: 0, y: 0 });
    expect(bounds.width).toBe(page.viewportSize().width);
    expect(bounds.height).toBe(page.viewportSize().height);
    await expect(viewer).toContainText("Neighvember Chestnut");
    await expect(viewer).toContainText(horse);
    await expect(viewer).toContainText("#7");
    await expect(viewer).toContainText("HORSE price");
    await expect(viewer).toContainText("1.23 per edition");
    await expect(viewer.locator("[data-horf-horse-market-art-image]")).toBeVisible();
    await expect(viewer.locator("[data-horf-horse-market-art-image]")).toHaveAttribute("src", /horse-portrait-photo\.jpg/);
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();

    await open.click();
    await viewer.getByRole("button", { name: "Close horse artwork" }).click();
    await expect(viewer).toBeHidden();

    await open.click();
    await viewer.getByText("Close this popup").click();
    await expect(viewer).toBeHidden();

    await open.click();
    await page.locator("[data-horf-horse-market-art-backdrop]").click({ position: { x: 5, y: 5 } });
    await expect(viewer).toBeHidden();
  });

  test("keeps animated GIFs on cards and plays video art in the full-screen viewer", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockMarket(page, true, {
      name: "Galloping GIF",
      image: "/creation-tools/industrializer/background.gif",
      artifactUri: "/creation-tools/industrializer/background.gif",
      mime: "image/gif",
    });
    await page.goto("/horf/horse-market");
    const card = page.locator("[data-horf-horse-market-listing]");
    await expect(card.locator("[data-horf-horse-market-card-gif]")).toHaveAttribute("src", /background\.gif/);
    await card.locator("[data-horf-horse-market-art-trigger]").click();
    const viewer = page.locator("[data-horf-horse-market-art-modal]");
    await expect(viewer.locator("[data-horf-horse-market-art-image]")).toHaveAttribute("src", /background\.gif/);
    await page.keyboard.press("Escape");

    await mockMarket(page, true, {
      name: "Video Mare",
      image: "/horf-art/horse-portrait-photo.jpg",
      artifactUri: "/desktop/paul-tutorials/talk.mp4",
      mime: "video/mp4",
    });
    await page.reload();
    const cardVideo = card.locator("[data-horf-horse-market-card-video]");
    await expect(cardVideo).toBeVisible();
    await cardVideo.scrollIntoViewIfNeeded();
    await expect(cardVideo).toHaveAttribute("src", /talk\.mp4/);
    await expect(cardVideo).toHaveAttribute("autoplay", "");
    expect(await cardVideo.evaluate((video) => video.muted)).toBe(true);
    await expect(cardVideo).toHaveAttribute("loop", "");
    await expect.poll(() => cardVideo.evaluate(
      (video) => !video.paused && video.readyState >= 2,
    )).toBe(true);
    await card.locator("[data-horf-horse-market-art-trigger]").click();
    await expect(viewer.locator("[data-horf-horse-market-art-video]")).toBeVisible();
    await expect(viewer.locator("[data-horf-horse-market-art-video]")).toHaveAttribute("controls", "");
    await expect(viewer.locator("[data-horf-horse-market-art-video]")).toHaveAttribute("src", /talk\.mp4/);
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
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses\?.*$/, (route) => {
      const offset = Number(new URL(route.request().url()).searchParams.get("offset") || "0");
      return json(route, {
        address: seller,
        items: offset === 0
          ? [{ contract: horse, tokenId: "8", name: "Uninspected Foal", balance: "1", approvedForMarshalsMarket: false }]
          : [{ contract: horse, tokenId: "7", name: "Neighvember Chestnut", balance: "5", approvedForMarshalsMarket: true }],
        pagination: { hasMore: offset === 0, nextOffset: offset === 0 ? 48 : 49 },
      });
    });
    await page.route(/\/api\/horf\/wallet\/tokens\?.*$/, (route) => json(route, {
      items: [{ contract: horse, tokenId: "9", name: "Unrelated Wallet Token", balance: "7", walletAddress: seller }],
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
    await expect(form.locator("[data-horf-horse-market-owned] option")).toHaveCount(1);
    await form.getByRole("button", { name: "More horses from this wallet" }).click();
    await expect(form.locator("[data-horf-horse-market-owned] option")).toHaveCount(2);
    await expect(form.locator("[data-horf-horse-market-owned]")).not.toContainText("Uninspected Foal");
    await expect(form.locator("[data-horf-horse-market-owned]")).not.toContainText("Unrelated Wallet Token");
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
