import { test, expect } from "@playwright/test";

const leadWallet = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const offerOnlyWallet = "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79";
const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const season = { key: "current-2026", startsAt: "2026-11-01T00:00:00.000Z", endsAt: null, label: "Neighvember 2026", inferred: false };

function json(route, body) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

const leadOffers = [
  { id: 71, ownerAddress: leadWallet, tokenContract: contract, tokenId: "7", amount: "1", acceptedTokenPolicy: "marshal_only", createdAt: "2026-11-03T12:00:00.000Z", updatedAt: "2026-11-03T12:00:00.000Z", name: "Chestnut Neighvember", image: "/horf-art/horse-gallop-photo.jpg" },
  { id: 72, ownerAddress: leadWallet, tokenContract: contract, tokenId: "8", amount: "2", acceptedTokenPolicy: "any_qualifying", createdAt: "2026-11-03T12:00:00.000Z", updatedAt: "2026-11-03T12:00:00.000Z", name: "Bay Neighvember", image: "/horf-art/horse-beach-photo.jpg" },
];

async function mockPublicHorf(page) {
  await page.route("**/api/horf/season*", (route) => json(route, {
    season, seasons: [season], asOf: "2026-11-03T12:00:00.000Z", status: "ready", error: null,
    nextRefreshAt: null, currentUser: null,
    leaderboard: [{ address: leadWallet, name: "Sir Canter", trades: 7, received: 4, sent: 3 }],
  }));
  await page.route(/\/api\/horf\/open-range\/offers(?:\?.*)?$/, (route) => json(route, {
    offers: [...leadOffers, { ...leadOffers[0], id: 73, ownerAddress: offerOnlyWallet, name: "Mare Force", tokenId: "9" }],
  }));
  await page.route(/\/api\/horf\/open-range\?season=current-2026$/, (route) => json(route, { items: [] }));
  await page.route(/\/api\/horf\/traders\/[^/]+\/offers(?:\?.*)?$/, (route) => {
    const address = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2));
    return json(route, { address, metadataStatus: "ready", offers: address === leadWallet ? leadOffers : [] });
  });
  await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    const address = decodeURIComponent(url.pathname.split("/").at(-2));
    const offset = Number(url.searchParams.get("offset") || 0);
    const items = offset === 0
      ? [{ contract, tokenId: "7", balance: "1", name: "Chestnut Neighvember", image: "/horf-art/horse-gallop-photo.jpg", description: "Horse art", creatorAddress: leadWallet },
        { contract, tokenId: "91", balance: "3", name: "Unlisted Foal", image: "/horf-art/horse-portrait-photo.jpg", description: "Foal", creatorAddress: leadWallet }]
      : [{ contract, tokenId: "92", balance: "1", name: "Older Pony", image: "/horf-art/horse-beach-photo.jpg", description: "Pony", creatorAddress: leadWallet }];
    return json(route, { address, items, pagination: { hasMore: offset === 0, nextOffset: offset === 0 ? 2 : null } });
  });
}

test.describe("Horf trader discovery and horse test", () => {
  test("opens a rider profile from the directory and shows offered versus all held horses", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(state.ok()).toBeTruthy();
    await mockPublicHorf(page);
    await page.goto("/horf/traders?season=current-2026");

    const directory = page.locator('[data-horf-region="trader-directory"]');
    await expect(page.locator("[data-horf-app]")).toHaveAttribute("data-horf-page", "traders");
    await expect(directory.locator("[data-horf-trader-card]")).toHaveCount(2);
    await expect(directory).toContainText("Sir Canter");
    await expect(directory).toContainText("Rider with a trade sign");
    await expect(directory).toContainText(`${offerOnlyWallet.slice(0, 8)}…${offerOnlyWallet.slice(-6)}`);
    await expect(page.locator('[data-horf-region="race"]')).toHaveCount(0);
    const leadCard = directory.locator("[data-horf-trader-card]").filter({ hasText: "Sir Canter" });
    const carousel = leadCard.locator("[data-horf-trader-offer-carousel]");
    await carousel.scrollIntoViewIfNeeded();
    await expect(carousel.locator("[data-horf-trader-offer-card]")).toContainText("Chestnut Neighvember");
    await expect(carousel.locator("[data-horf-trader-offer-image]")).toHaveAttribute("src", "/horf-art/horse-gallop-photo.jpg");
    await carousel.locator("[data-horf-trader-offer-next]").click();
    await expect(carousel.locator("[data-horf-trader-offer-card]")).toContainText("Bay Neighvember");
    await expect(carousel.locator("[data-horf-trader-offer-image]")).toHaveAttribute("src", "/horf-art/horse-beach-photo.jpg");
    await carousel.locator("[data-horf-trader-offer-prev]").click();
    await expect(carousel.locator("[data-horf-trader-offer-card]")).toContainText("Chestnut Neighvember");
    await expect(carousel.locator("[data-horf-trader-profile-link]")).toHaveAttribute("href", `/horf/traders/${leadWallet}?season=current-2026`);
    await leadCard.locator("[data-horf-trader-profile-link]").first().click();

    await expect(page).toHaveURL(new RegExp(`/horf/traders/${leadWallet}\\?season=current-2026$`));
    const profile = page.locator('[data-horf-region="trader-profile"]');
    await expect(page.locator("[data-horf-app]")).toHaveAttribute("data-horf-page", "profile");
    await expect(profile.locator('[data-horf-profile-tab="for-trade"]')).toHaveAttribute("aria-selected", "true");
    await expect(profile.locator("[data-horf-profile-horse]")).toHaveCount(2);
    await expect(profile).toContainText("Bay Neighvember");
    await expect(profile).not.toContainText("Unlisted Foal");
    await profile.locator('[data-horf-profile-tab="all-horses"]').click();
    await expect(profile.locator('[data-horf-profile-tab="all-horses"]')).toHaveAttribute("aria-selected", "true");
    await expect(profile.locator("[data-horf-profile-horse]")).toHaveCount(2);
    await expect(profile).toContainText("Unlisted Foal");
    await expect(profile).not.toContainText("Bay Neighvember");
    await profile.getByRole("button", { name: "Load more horses" }).click();
    await expect(profile.locator("[data-horf-profile-horse]")).toHaveCount(3);
    await expect(profile).toContainText("Older Pony");
    await expect(page.locator('[data-horf-region="trader-directory"]')).toHaveCount(0);
  });

  test("explains the exact Is It a Horse rules on its own route", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(state.ok()).toBeTruthy();
    await mockPublicHorf(page);
    await page.goto("/horf/info?season=current-2026");

    const info = page.locator('[data-horf-region="horse-test-info"]');
    await expect(page.locator("[data-horf-app]")).toHaveAttribute("data-horf-page", "info");
    await expect(info.getByRole("heading", { name: "Is It a Horse?" })).toBeVisible();
    await expect(info).toContainText("Tezos Mainnet FA2");
    await expect(info).toContainText("indexed by Objkt");
    await expect(info).toContainText("zero or unset decimals");
    await expect(info).toContainText("horseart");
    await expect(info).toContainText("Neighvember and Horse of July");
    await expect(info).toContainText("more than five tokens");
    await expect(info).toContainText("horsepower");
    await expect(info).toContainText("different wallets");
    await expect(info).toContainText("transfer date chooses which race season");
    await expect(info).toContainText("Marshal inspection is a separate approval");
    await expect(page.locator('[data-horf-region="race"]')).toHaveCount(0);
    await expect(page.locator('[data-horf-region="trader-directory"]')).toHaveCount(0);
  });

  test("keeps the next-page control when a scanned balance page has no matching horses", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(state.ok()).toBeTruthy();
    await mockPublicHorf(page);
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => {
      const offset = Number(new URL(route.request().url()).searchParams.get("offset") || 0);
      return json(route, {
        address: leadWallet,
        items: offset === 0 ? [] : [{ contract, tokenId: "91", balance: "1", name: "Hidden Filly", image: "/horf-art/horse-portrait-photo.jpg", description: "Horse", creatorAddress: leadWallet }],
        pagination: { hasMore: offset === 0, nextOffset: offset === 0 ? 2 : null },
      });
    });
    await page.goto(`/horf/traders/${leadWallet}?season=current-2026`);
    const profile = page.locator('[data-horf-region="trader-profile"]');
    await profile.locator('[data-horf-profile-tab="all-horses"]').click();
    await expect(profile).toContainText("No qualifying horses on the scanned pages");
    await profile.getByRole("button", { name: "Load more horses" }).click();
    await expect(profile.locator("[data-horf-profile-horse]")).toContainText("Hidden Filly");
  });
});
