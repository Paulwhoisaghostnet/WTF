import { test, expect } from "@playwright/test";

const leadWallet = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const offerOnlyWallet = "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79";
const viewerWallet = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const season = { key: "current-2026", startsAt: "2026-11-01T00:00:00.000Z", endsAt: null, label: "Neighvember 2026", inferred: false };
const archiveSeason = { key: "neighvember-2025", startsAt: "2025-11-01T00:00:00.000Z", endsAt: "2025-12-01T00:00:00.000Z", label: "Neighvember 2025", inferred: true };

function json(route, body) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

const leadOffers = [
  { id: 71, ownerAddress: leadWallet, tokenContract: contract, tokenId: "7", amount: "1", acceptedTokenPolicy: "marshal_only", createdAt: "2026-11-03T12:00:00.000Z", updatedAt: "2026-11-03T12:00:00.000Z", name: "Chestnut Neighvember", image: "/horf-art/horse-gallop-photo.jpg", ownerBalance: "2" },
  { id: 72, ownerAddress: leadWallet, tokenContract: contract, tokenId: "8", amount: "2", acceptedTokenPolicy: "any_qualifying", createdAt: "2026-11-03T12:00:00.000Z", updatedAt: "2026-11-03T12:00:00.000Z", name: "Bay Neighvember", image: "/horf-art/horse-beach-photo.jpg", ownerBalance: "4" },
];

async function mockPublicHorf(page) {
  await page.route("**/api/horf/season*", (route) => json(route, {
    season, seasons: [season, archiveSeason], asOf: "2026-11-03T12:00:00.000Z", status: "ready", error: null,
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
      ? [{ contract, tokenId: "7", balance: "1", mintedAt: "2026-11-02T12:00:00.000Z", name: "Chestnut Neighvember", image: "/horf-art/horse-gallop-photo.jpg", description: "Horse art", creatorAddress: leadWallet },
        { contract, tokenId: "91", balance: "3", mintedAt: null, name: "Unlisted Foal", image: "/horf-art/horse-portrait-photo.jpg", description: "Foal", creatorAddress: leadWallet }]
      : [{ contract, tokenId: "92", balance: "1", mintedAt: "2025-11-03T12:00:00.000Z", name: "Older Pony", image: "/horf-art/horse-beach-photo.jpg", description: "Pony", creatorAddress: leadWallet }];
    return json(route, { address, items, pagination: { hasMore: offset === 0, nextOffset: offset === 0 ? 2 : null } });
  });
}

test.describe("Horf trader discovery and horse test", () => {
  test("lets a Marshal approve one profile horse or scan every held-horse page for batch approval", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await mockPublicHorf(page);
    const approved = new Set(["91"]);
    const reads = [];
    const prepared = [];
    const decisions = [];
    await page.route("**/api/horf/inspectors/status", (route) => json(route, { active: true, role: "horf_marshal" }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset") || 0);
      reads.push({ offset, refresh: url.searchParams.get("refresh") });
      const ids = offset === 0 ? ["7", "91"] : ["92", "93"];
      return json(route, { address: leadWallet, items: ids.map((tokenId) => ({
        contract, tokenId, balance: "1", mintedAt: "2026-11-03T12:00:00.000Z",
        name: `Horse #${tokenId}`, image: null, description: null, creatorAddress: leadWallet,
        approvedForMarshalsMarket: approved.has(tokenId),
      })), pagination: { hasMore: offset === 0, nextOffset: offset === 0 ? 2 : 4 } });
    });
    await page.route("**/api/horf/inspections/marshal", (route) => {
      const body = route.request().postDataJSON();
      prepared.push(body);
      return json(route, { id: Number(body.tokenId) });
    });
    await page.route(/\/api\/horf\/inspections\/\d+\/decision$/, (route) => {
      const id = Number(new URL(route.request().url()).pathname.split("/").at(-2));
      decisions.push({ id, ...route.request().postDataJSON() });
      if (id === 93) return route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "FA2 identity changed" }) });
      approved.add(String(id));
      return json(route, { id, status: "approved" });
    });

    await page.goto(`/horf/traders/${leadWallet}?season=current-2026`);
    const profile = page.locator('[data-horf-region="trader-profile"]');
    await profile.locator('[data-horf-profile-tab="all-horses"]').click();
    const first = profile.locator('[data-horf-profile-horse]').filter({ hasText: "Horse #7" });
    const already = profile.locator('[data-horf-profile-horse]').filter({ hasText: "Horse #91" });
    await expect(first.locator('[data-horf-profile-approve-horse]')).toBeVisible();
    await expect(already.locator('[data-horf-profile-approved]')).toBeVisible();
    await expect(already.locator('[data-horf-profile-approve-horse]')).toHaveCount(0);
    await first.locator('[data-horf-profile-approve-horse]').click();
    await expect(first.locator('[data-horf-profile-approved]')).toBeVisible();
    await profile.locator('[data-horf-profile-approve-all]').click();
    await expect(profile.locator('[data-horf-profile-approval-progress]')).toContainText("Checked all 4 held horses: 1 approved, 2 already approved, 1 failed.");
    await expect(profile.locator('[data-horf-profile-approval-failure]')).toContainText(`${contract}/93: FA2 identity changed`);
    expect(reads).toEqual(expect.arrayContaining([{ offset: 0, refresh: "1" }, { offset: 2, refresh: "1" }]));
    expect(prepared.map((item) => item.tokenId)).toEqual(["7", "92", "93"]);
    expect(decisions.map((item) => item.id)).toEqual([7, 92, 93]);
    expect(decisions.every((item) => item.decision === "approve" && /direct approval/i.test(item.reason))).toBe(true);
  });

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
    await expect(profile.locator("[data-horf-mint-badge]")).toHaveCount(0);
    await expect(profile.locator("[data-horf-profile-horse]").first().locator("[data-horf-edition-holdings]")).toHaveText("Trader owns 2 editions");
    await expect(profile.locator("[data-horf-edition-holdings]").first()).not.toContainText("You own");
    await expect(profile).toContainText("Bay Neighvember");
    await expect(profile).not.toContainText("Unlisted Foal");
    await profile.locator("[data-horf-profile-horse]").first().locator("[data-horf-profile-view-horse]").click();
    await expect(profile.locator("[data-horf-profile-horse-detail]")).toBeVisible();
    await expect(profile.locator("[data-horf-profile-horse-detail]")).toContainText(`${contract} / #7`);
    await profile.locator("[data-horf-profile-horse-detail]").getByRole("button", { name: "Close horse card" }).click();
    await profile.locator('[data-horf-profile-tab="all-horses"]').click();
    await expect(profile.locator('[data-horf-profile-tab="all-horses"]')).toHaveAttribute("aria-selected", "true");
    await expect(profile.locator("[data-horf-profile-horse]")).toHaveCount(2);
    await expect(profile.locator("[data-horf-profile-horse]").first().locator("[data-horf-edition-holdings]")).toHaveText("Trader owns 1 edition");
    await expect(profile.locator("[data-horf-profile-horse]").first().locator("[data-horf-mint-badge]")).toHaveText(season.label);
    await expect(profile.locator("[data-horf-profile-horse]").last().locator("[data-horf-mint-badge]")).toHaveCount(0);
    await expect(profile).toContainText("Unlisted Foal");
    await expect(profile).not.toContainText("Bay Neighvember");
    await profile.locator("[data-horf-profile-horse]").filter({ hasText: "Unlisted Foal" }).getByRole("button", { name: "View Unlisted Foal horse card" }).click();
    await expect(profile.locator("[data-horf-profile-horse-detail]")).toContainText(`${contract} / #91`);
    await profile.locator("[data-horf-profile-horse-detail]").getByRole("button", { name: "Close horse card" }).click();
    await profile.getByRole("button", { name: "Load more horses" }).click();
    await expect(profile.locator("[data-horf-profile-horse]")).toHaveCount(3);
    await expect(profile).toContainText("Older Pony");
    await expect(profile.locator("[data-horf-profile-horse]").last().locator("[data-horf-mint-badge]")).toHaveText(archiveSeason.label);
    await profile.locator("[data-horf-profile-horse]").filter({ hasText: "Older Pony" }).locator("[data-horf-profile-view-horse]").click();
    await expect(profile.locator("[data-horf-profile-horse-detail]")).toContainText(`${contract} / #92`);
    await profile.locator("[data-horf-profile-horse-detail]").getByRole("button", { name: "Close horse card" }).click();
    await expect(page.locator('[data-horf-region="trader-directory"]')).toHaveCount(0);
  });

  test("shows both traders' edition counts to a connected viewer on trade and held tabs", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "admin" } });
    expect(state.ok()).toBeTruthy();
    await page.addInitScript(({ address }) => {
      window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
    }, { address: viewerWallet });
    await page.route("**/api/wallets", (route) => json(route, [{ walletAddress: viewerWallet }]));
    await mockPublicHorf(page);
    const offerViewers = [];
    const horseViewers = [];
    await page.route(/\/api\/horf\/traders\/[^/]+\/profile\?season=current-2026$/, (route) => json(route, {
      address: leadWallet, seasonKey: season.key, imageUrl: null, description: "", updatedAt: null,
      username: null, displayName: "Sir Canter", usernameSource: "wtf", canEditUsername: false,
    }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/offers(?:\?.*)?$/, (route) => {
      offerViewers.push(new URL(route.request().url()).searchParams.get("viewer"));
      return json(route, { address: leadWallet, metadataStatus: "ready", offers: [
        { ...leadOffers[0], viewerBalance: "1" },
        { ...leadOffers[1], ownerBalance: null, viewerBalance: null },
      ] });
    });
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => {
      horseViewers.push(new URL(route.request().url()).searchParams.get("viewer"));
      return json(route, { address: leadWallet, items: [
        { contract, tokenId: "7", balance: "2", viewerBalance: "1", name: "Chestnut Neighvember", image: "/horf-art/horse-gallop-photo.jpg", description: "Horse art", creatorAddress: leadWallet },
        { contract, tokenId: "91", balance: "3", viewerBalance: "0", name: "Unlisted Foal", image: "/horf-art/horse-portrait-photo.jpg", description: "Foal", creatorAddress: leadWallet },
      ], pagination: { hasMore: false, nextOffset: 2 } });
    });

    await page.goto(`/horf/traders/${leadWallet}?season=current-2026`);
    const profile = page.locator('[data-horf-region="trader-profile"]');
    await expect(profile.locator("[data-horf-profile-horse]")).toHaveCount(2);
    expect(offerViewers).toContain(viewerWallet);
    await expect(profile.locator("[data-horf-profile-horse]").first().locator("[data-horf-edition-holdings]")).toHaveText("Trader owns 2 editions · You own 1 edition");
    await expect(profile.locator("[data-horf-profile-horse]").last().locator("[data-horf-edition-holdings]")).toHaveText("Trader holdings unavailable · Your holdings unavailable");
    await profile.locator('[data-horf-profile-tab="all-horses"]').click();
    await expect(profile.locator("[data-horf-profile-horse]")).toHaveCount(2);
    expect(horseViewers).toContain(viewerWallet);
    await expect(profile.locator("[data-horf-profile-horse]").first().locator("[data-horf-edition-holdings]")).toHaveText("Trader owns 2 editions · You own 1 edition");
    await expect(profile.locator("[data-horf-profile-horse]").last().locator("[data-horf-edition-holdings]")).toHaveText("Trader owns 3 editions · You own 0 editions");
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
