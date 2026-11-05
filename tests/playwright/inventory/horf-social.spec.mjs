import { test, expect } from "@playwright/test";

const traderWallet = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const leadWallet = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const thirdWallet = "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79";
const horseToken = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const horseCurrency = "KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P";
const chainId = "NetXdQprcVkpaWU";
const season = { key: "current-2026", startsAt: "2026-11-01T00:00:00.000Z", endsAt: null, label: "November 2026 season", inferred: false };

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function seedTrader(request) {
  const response = await request.post("/__test/state", { data: { userRole: "admin" } });
  expect(response.ok()).toBeTruthy();
}

async function mockHorf(page, { readyHorse = false, initialPosse = [], initialGifts = [], ownedBalance = "2", seasonRiders = [], openRangeOffers = [] } = {}) {
  let partners = [...initialPosse];
  let gifts = [...initialGifts];
  const marks = [];
  await page.addInitScript(({ address }) => {
    window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
  }, { address: traderWallet });
  await page.route("**/api/horf/season*", (route) => json(route, {
    season, seasons: [season], asOf: "2026-11-03T12:00:00.000Z", error: null,
    nextRefreshAt: null, status: "ready", leaderboard: seasonRiders, currentUser: null,
  }));
  await page.route(/\/api\/horf\/stables(?:\?.*)?$/, (route) => json(route, {
    network: "mainnet", chainId, contractAddress: null, status: "unconfigured",
    permitReady: false, asOf: null, reciprocalCredits: "0", groupCredits: "0", listings: [],
  }));
  await page.route(/\/api\/horf\/horse\/config(?:\?.*)?$/, (route) => json(route, {
    status: readyHorse ? "ready" : "unconfigured", network: "mainnet", chainId,
    token: readyHorse ? { contract: horseCurrency, tokenId: "0", decimals: 8, symbol: "HORSE" } : null,
    balanceRaw: readyHorse ? "250000000" : null,
    asOf: readyHorse ? "2026-11-03T12:00:00.000Z" : null,
  }));
  await page.route(/\/api\/horf\/horse\/activity(?:\?.*)?$/, (route) => json(route, {
    status: "ready", network: "mainnet", chainId,
    token: { contract: horseCurrency, tokenId: "0", decimals: 8, symbol: "HORSE" },
    receivedRaw: "3500000000", awardedRaw: "2500000000", sentRaw: "100000000",
    asOf: "2026-11-03T12:00:00.000Z",
  }));
  await page.route(/\/api\/horf\/horse\/rewards(?:\?.*)?$/, (route) => json(route, {
    season: "current-2026", rateHorse: "10", rateRaw: "1000000000",
    countedUnits: readyHorse ? "3" : "0",
    accruedRaw: readyHorse ? "3000000000" : "0",
    totalRaw: readyHorse ? "3000000000" : "0",
    claimableRaw: readyHorse ? "2000000000" : "0",
    claimedRaw: readyHorse ? "1000000000" : "0",
    asOf: readyHorse ? "2026-11-03T12:00:00.000Z" : null,
    status: readyHorse ? "ready" : "syncing", sourceDiscrepancies: "0",
    vaultAddress: null, claimReady: false, sourceComplete: readyHorse,
  }));
  await page.route("**/api/wallets", (route) => json(route, [{ walletAddress: traderWallet }]));
  await page.route(`**/api/wallets/${traderWallet}/sync`, (route) => json(route, { ok: true }));
  await page.route("**/api/horf/wallet/tokens?*", (route) => json(route, {
    items: [{ contract: horseToken, tokenId: "7", name: "Neighvember Seven", balance: ownedBalance, walletAddress: traderWallet }],
    pagination: { limit: 48, offset: 0, total: 1, hasMore: false, nextOffset: 1 },
  }));
  await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => json(route, {
    address: traderWallet,
    items: [{ contract: horseToken, tokenId: "7", name: "Neighvember Seven", balance: ownedBalance, image: "/horf-art/horse-gallop-photo.jpg" }],
    pagination: { limit: 48, offset: 0, total: 1, hasMore: false, nextOffset: 1 },
  }));
  await page.route(/\/api\/horf\/open-range\/offers(?:\?.*)?$/, (route) => json(route, { offers: openRangeOffers }));
  await page.route(/\/api\/horf\/posse(?:\?.*)?$/, (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON();
      expect(body.ownerAddress).toBe(traderWallet);
      const partner = { id: 91, address: body.address, nickname: body.nickname ?? null, createdAt: "2026-11-03T12:00:00.000Z" };
      partners = [...partners.filter((item) => item.address !== body.address), partner];
      return json(route, partner);
    }
    expect(new URL(route.request().url()).searchParams.get("address")).toBe(traderWallet);
    return json(route, { partners });
  });
  await page.route(/\/api\/horf\/posse\/\d+$/, (route) => {
    const id = Number(new URL(route.request().url()).pathname.split("/").at(-1));
    partners = partners.filter((item) => item.id !== id);
    return route.fulfill({ status: 204, body: "" });
  });
  await page.route(/\/api\/horf\/traders\/[^/]+\/offers(?:\?.*)?$/, (route) => {
    const address = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2));
    return json(route, {
      address, metadataStatus: "ready",
      offers: address === leadWallet ? [
        { id: 401, ownerAddress: address, tokenContract: horseToken, tokenId: "7", amount: "1", acceptedTokenPolicy: "marshal_only", createdAt: "2026-11-03T12:00:00.000Z", updatedAt: "2026-11-03T12:00:00.000Z", name: "Canter's Chestnut", image: "/horf-art/horse-gallop-photo.jpg" },
        { id: 402, ownerAddress: address, tokenContract: horseToken, tokenId: "8", amount: "2", acceptedTokenPolicy: "any_qualifying", createdAt: "2026-11-03T12:00:00.000Z", updatedAt: "2026-11-03T12:00:00.000Z", name: "Canter's Bay", image: "/horf-art/horse-beach-photo.jpg" },
      ] : [],
    });
  });
  await page.route(/\/api\/horf\/gifts(?:\?.*)?$/, (route) => json(route, { gifts }));
  await page.route(/\/api\/horf\/gifts\/\d+\/returned$/, (route) => {
    const id = Number(new URL(route.request().url()).pathname.split("/").at(-2));
    const returnedFavor = route.request().postDataJSON().returnedFavor;
    marks.push(returnedFavor);
    gifts = gifts.map((gift) => gift.id === id ? {
      ...gift, returnedFavor, returnedAt: returnedFavor ? "2026-11-03T12:30:00.000Z" : null,
    } : gift);
    return json(route, gifts.find((gift) => gift.id === id));
  });
  await page.route("**/api/horf/token-eligibility?*", (route) => json(route, {
    eligible: false, error: "This token is not qualifying horse art.",
  }, 422));
  return { marks };
}

async function mockOfficialCrpPrefill(page, nomineeAddress) {
  const resolvedQueries = [];
  await page.route("**/api/crp-nominations/viewed", (route) => json(route, { ok: true }));
  await page.route("**/api/crp-nominations/categories", (route) => json(route, {
    categories: [
      { id: "helping-hand", label: "Helping Hand Award", hashtag: "TezosCRP", description: "Helping people onboard and use Tezos." },
      { id: "influencer", label: "Influencer Award", hashtag: "TezosCRP", description: "Social engagement, awareness, and education." },
    ],
  }));
  await page.route("**/api/crp-nominations/mine", (route) => json(route, { nominations: [], anonymousNominationCredits: 0 }));
  await page.route("**/api/crp-nominations/resolve", (route) => {
    const query = route.request().postDataJSON()?.query;
    resolvedQueries.push(query);
    const bundle = { id: "horse-helper", tezosAddress: nomineeAddress, tezosDomain: null,
      displayName: "Sir Canter", xHandle: null, bskyHandle: null, sources: ["tzkt"] };
    return json(route, {
      query, kind: "wallet", wallets: [{ address: nomineeAddress, displayName: "Sir Canter", tezosDomain: null, sources: ["tzkt"] }],
      xHandles: [], bskyHandles: [], bundles: [bundle],
    });
  });
  return resolvedQueries;
}

test.describe("Horf HORSE, posse, and horse gifts", () => {
  test("shows a selected known trader's name on the saved posse card after reload", async ({ page, request }) => {
    await seedTrader(request);
    await mockHorf(page, { seasonRiders: [
      { address: leadWallet, name: "PixelSushiRobot 💫", trades: 4, received: 3, sent: 4 },
    ] });
    await page.goto("/horf/posse?season=current-2026");
    const posse = page.locator("[data-horf-posse]");
    const picker = posse.locator("[data-horf-posse-trader-picker]");
    await expect(picker.locator(`option[value="${leadWallet}"]`)).toContainText("PixelSushiRobot 💫");
    await picker.selectOption(leadWallet);
    await expect(posse.locator("[data-horf-posse-address]")).toHaveValue(leadWallet);
    await expect(posse.getByRole("textbox", { name: "Nickname (optional)" })).toHaveValue("");
    await posse.locator("[data-horf-posse-add]").click();
    const member = posse.locator("[data-horf-posse-member]");
    await expect(member.locator(".member-name")).toHaveText("PixelSushiRobot 💫");
    await expect(member.locator(".member-head small")).toHaveText(leadWallet);
    await page.reload();
    await expect(page.locator("[data-horf-posse-member] .member-name")).toHaveText("PixelSushiRobot 💫");
  });

  test("adds a directory rider to posse and removes them from their profile", async ({ page, request }) => {
    await seedTrader(request);
    await mockHorf(page, { seasonRiders: [
      { address: traderWallet, name: "My Stable", trades: 3, received: 2, sent: 3 },
      { address: leadWallet, name: "Sir Canter", trades: 2, received: 2, sent: 2 },
    ] });
    await page.route(/\/api\/horf\/traders\/[^/]+\/profile\?season=current-2026$/, (route) => json(route, {
      address: leadWallet, seasonKey: season.key, imageUrl: null, description: "", updatedAt: null,
      username: "Sir Canter", displayName: "Sir Canter", usernameSource: "horf", canEditUsername: true,
    }));
    await page.goto("/horf/traders?season=current-2026");
    const myCard = page.locator("[data-horf-trader-card]").filter({ hasText: "My Stable" });
    const riderCard = page.locator("[data-horf-trader-card]").filter({ hasText: "Sir Canter" });
    await expect(myCard.locator("[data-horf-trader-posse-actions]")).toHaveCount(0);
    await riderCard.locator("[data-horf-trader-posse-add]").click();
    await expect(riderCard.locator("[data-horf-trader-in-posse]")).toBeVisible();

    await page.goto("/horf/posse?season=current-2026");
    await expect(page.locator("[data-horf-posse-member]")).toContainText("Sir Canter");
    await page.goto(`/horf/traders/${leadWallet}?season=current-2026`);
    const profile = page.locator('[data-horf-region="trader-profile"]');
    await expect(profile.locator("[data-horf-trader-in-posse]")).toBeVisible();
    await profile.locator("[data-horf-trader-posse-remove]").click();
    await expect(profile.locator("[data-horf-trader-posse-add]")).toBeVisible();
    await page.goto("/horf/posse?season=current-2026");
    await expect(page.locator("[data-horf-posse-member]")).toHaveCount(0);
  });

  test("offers an active Open Range rider in the gift recipient picker", async ({ page, request }) => {
    await seedTrader(request);
    await mockHorf(page, {
      seasonRiders: [{ address: leadWallet, name: "Sir Canter", trades: 2, received: 2, giftHorsesReceived: 1, tradeHorsesReceived: 1, sent: 2 }],
      openRangeOffers: [{ ownerAddress: thirdWallet, ownerName: "Prairie Pony" }],
    });
    await page.goto("/horf/gifts");
    const gift = page.locator('[data-horf-region="gifts"]');
    await expect(gift.locator("[data-horf-gift-trader-picker] option[value='" + leadWallet + "']"))
      .toContainText("received 2 (🎁 1 gift / 🤝 1 trade)");
    await expect(gift.locator("[data-horf-gift-trader-picker] option[value='" + thirdWallet + "']")).toContainText("Prairie Pony");
    await expect(gift.locator("[data-horf-gift-trader-picker] option[value='" + thirdWallet + "']"))
      .not.toContainText("received");
    await gift.locator("[data-horf-gift-trader-picker]").selectOption(thirdWallet);
    await expect(gift.locator("[data-horf-gift-recipient]")).toHaveValue(thirdWallet);
  });

  test("allows posse and CSV preparation while HORSE sends are unconfigured", async ({ page, request }) => {
    await seedTrader(request);
    await mockHorf(page);
    await page.goto("/horf/posse");

    const posse = page.locator("[data-horf-posse]");
    await posse.locator("[data-horf-posse-address]").fill(leadWallet);
    await posse.getByRole("textbox", { name: "Nickname (optional)" }).fill("Sir Canter");
    await posse.locator("[data-horf-posse-add]").click();
    const partner = posse.locator("[data-horf-posse-member]");
    await expect(partner).toContainText("Sir Canter");
    const carousel = partner.locator("[data-horf-trader-offer-carousel]");
    await carousel.scrollIntoViewIfNeeded();
    await expect(carousel.locator("[data-horf-trader-offer-card]")).toContainText("Canter's Chestnut");
    await expect(carousel.locator("[data-horf-trader-offer-image]")).toHaveAttribute("src", "/horf-art/horse-gallop-photo.jpg");
    await carousel.locator("[data-horf-trader-offer-next]").click();
    await expect(carousel.locator("[data-horf-trader-offer-card]")).toContainText("Canter's Bay");
    await expect(carousel.locator("[data-horf-trader-offer-image]")).toHaveAttribute("src", "/horf-art/horse-beach-photo.jpg");
    await carousel.locator("[data-horf-trader-offer-prev]").click();
    await expect(carousel.locator("[data-horf-trader-offer-card]")).toContainText("Canter's Chestnut");
    await expect(carousel.locator("[data-horf-trader-profile-link]")).toHaveAttribute("href", `/horf/traders/${leadWallet}?season=current-2026`);
    await page.locator('[data-horf-nav="horse"]').click();
    await expect(page).toHaveURL(/\/horf\/send-horse\?season=current-2026$/);

    const send = page.locator('[data-horf-region="horse-send"]');
    await expect(send.locator("[data-horf-horse-rewards]")).toContainText("first indexed snapshot");
    await expect(send.locator("[data-horf-horse-rewards]")).not.toContainText("0 HORSE claimable");
    await expect(send.locator("[data-horf-horse-claim]")).toBeDisabled();
    await expect(send).toContainText("has not been verified and configured yet");
    await expect(send.locator("[data-horf-horse-send]")).toBeDisabled();
    await send.locator("[data-horf-horse-posse-picker]").first().selectOption(leadWallet);
    await expect(send.locator("[data-horf-horse-row] [data-horf-horse-address]")).toHaveValue(leadWallet);

    await send.locator("[data-horf-horse-csv]").setInputFiles({
      name: "horses.csv", mimeType: "text/csv", buffer: Buffer.from(`address,amount\n${thirdWallet},0.5\n`),
    });
    await expect(send.locator("[data-horf-horse-row]")).toHaveCount(2);
    await expect(send.locator("[data-horf-horse-row]").nth(1).locator("[data-horf-horse-address]")).toHaveValue(thirdWallet);
    await expect(send.locator("[data-horf-horse-row]").nth(1).locator("[data-horf-horse-amount]")).toHaveValue("0.5");
    await expect(send.locator("[data-horf-horse-same-amount]")).not.toBeChecked();
    await expect(send.locator("[data-horf-horse-row]").nth(1).locator("[data-horf-horse-amount]")).toBeEnabled();
    await expect(send.locator("[data-horf-horse-send]")).toBeDisabled();
    await expect(send.locator("[data-horf-posse-member]")).toHaveCount(0);
    await send.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-horse-unconfigured-desktop.png", fullPage: true });
    await page.locator('[data-horf-nav="posse"]').click();
    await posse.locator("[data-horf-posse-remove]").click();
    await expect(posse.locator("[data-horf-posse-member]")).toHaveCount(0);
  });

  test("shows verified HORSE balance and cumulative receipts, and checks precision before signing", async ({ page, request }) => {
    await seedTrader(request);
    await mockHorf(page, { readyHorse: true });
    await page.goto("/horf/send-horse");

    const send = page.locator('[data-horf-region="horse-send"]');
    await expect(send).toContainText("2.5 HORSE indexed in this wallet");
    await expect(send.locator("[data-horf-horse-activity]")).toContainText("35");
    await expect(send.locator("[data-horf-horse-activity]")).toContainText("25");
    await expect(send.locator("[data-horf-horse-activity]")).toContainText("1");
    await expect(send.locator("[data-horf-horse-rewards]")).toContainText("10 HORSE per qualifying horse sent");
    await expect(send.locator("[data-horf-horse-rewards]")).toContainText("3 rewardable outbound horse trades");
    await expect(send.locator("[data-horf-horse-rewards]")).toContainText("20 HORSE claimable");
    await expect(send.locator("[data-horf-horse-rewards]")).toContainText("10 HORSE claimed on-chain");
    await expect(send.locator("[data-horf-horse-claim]")).toBeDisabled();
    await expect(send.locator("[data-horf-horse-rewards]")).toContainText("20 HORSE claimable");
    await expect(send.locator("[data-horf-horse-same-amount]")).toBeChecked();
    await expect(send.locator("[data-horf-horse-shared-amount]")).toHaveValue("1");
    await expect(send.locator("[data-horf-horse-amount]")).toBeDisabled();
    await send.locator("[data-horf-horse-shared-amount]").fill("2.25");
    await expect(send.locator("[data-horf-horse-amount]")).toHaveValue("2.25");
    await send.locator("[data-horf-horse-add-row]").click();
    await expect(send.locator("[data-horf-horse-row]")).toHaveCount(2);
    await expect(send.locator("[data-horf-horse-row]").nth(1).locator("[data-horf-horse-amount]")).toHaveValue("2.25");
    await send.locator("[data-horf-horse-same-amount]").uncheck();
    await send.locator("[data-horf-horse-row]").nth(1).locator("[data-horf-horse-amount]").fill("0.5");
    await expect(send.locator("[data-horf-horse-row]").nth(1).locator("[data-horf-horse-amount]")).toHaveValue("0.5");
    await send.locator("[data-horf-horse-same-amount]").check();
    await expect(send.locator("[data-horf-horse-row]").nth(1).locator("[data-horf-horse-amount]")).toHaveValue("2.25");
    await send.locator("[data-horf-horse-address]").first().fill(leadWallet);
    await send.locator("[data-horf-horse-address]").nth(1).fill(thirdWallet);
    await send.locator("[data-horf-horse-shared-amount]").fill("3.000000001");
    await expect(send.locator("[data-horf-horse-send]")).toBeEnabled();
    await send.locator("[data-horf-horse-send]").click();
    await expect(send.getByRole("alert")).toContainText("$HORSE supports up to 8 decimal places");
    await send.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-horse-ready-desktop.png", fullPage: true });
    await send.locator('[data-horf-crp-awards]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-crp-awards-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await send.locator('[data-horf-crp-awards]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-horf-right-rail]')).toBeHidden();
    expect(await send.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/horf-horse-ready-narrow.png", fullPage: true });
    await page.screenshot({ path: "test-results/horf-crp-awards-narrow.png" });
    const resolvedQueries = await mockOfficialCrpPrefill(page, leadWallet);
    await send.locator("[data-horf-crp-open]").click();
    await expect(page).toHaveURL(new RegExp(`/crp-nominate\\?category=helping-hand&nominee=${leadWallet}$`));
    await expect(page.locator('[data-crp-surface="nomination-appview"]')).toHaveCount(1);
    await expect(page.locator('[data-crp-region="query-input"]')).toHaveValue(leadWallet);
    await expect(page.locator('[data-crp-region="category-select"]')).toHaveValue("helping-hand");
    await expect(page.locator('[data-crp-region="card"]')).toContainText("Sir Canter");
    expect(resolvedQueries).toContain(leadWallet);
  });

  test("keeps a completed HORSE claim available while the next Mainnet scan starts", async ({ page, request }) => {
    await seedTrader(request);
    await mockHorf(page, { readyHorse: true });
    await page.route(/\/api\/horf\/horse\/rewards(?:\?.*)?$/, (route) => json(route, {
      season: "current-2026", rateHorse: "10", rateRaw: "1000000000",
      countedUnits: "3", accruedRaw: "3000000000", totalRaw: "3000000000",
      claimableRaw: "2000000000", claimedRaw: "1000000000",
      asOf: "2026-11-03T12:00:00.000Z", status: "syncing", sourceComplete: true,
      claimReady: true, vaultAddress: "KT1KH1xShHGtNpfqwK8SsdfMxGZTPYs8aDpT",
      sourceDiscrepancies: "0",
    }));
    await page.goto("/horf/send-horse");
    const rewards = page.locator("[data-horf-horse-rewards]");
    await expect(rewards).toContainText("20 HORSE claimable");
    await expect(rewards).toContainText("Counts are provisional while Horf scans Mainnet");
    await expect(rewards.locator("[data-horf-horse-claim]")).toBeEnabled();
  });

  test("opens the official Influencer Award with the selected trader prefilled", async ({ page, request }) => {
    await seedTrader(request);
    await mockHorf(page);
    const resolvedQueries = await mockOfficialCrpPrefill(page, leadWallet);
    await page.goto("/horf/send-horse");
    await page.locator('[data-horf-horse-row] [data-horf-horse-address]').first().fill(leadWallet);
    await page.locator('[data-horf-crp-influencer-open]').click();
    await expect(page).toHaveURL(new RegExp(`/crp-nominate\\?category=influencer&nominee=${leadWallet}$`));
    await expect(page.locator('[data-crp-surface="nomination-appview"]')).toHaveCount(1);
    await expect(page.locator('[data-crp-region="query-input"]')).toHaveValue(leadWallet);
    await expect(page.locator('[data-crp-region="category-select"]')).toHaveValue("influencer");
    await expect(page.locator('[data-crp-region="card"]')).toContainText("Sir Canter");
    expect(resolvedQueries).toContain(leadWallet);
  });

  test("keeps a guest's award and nominee through WTF OS sign-in", async ({ page, request }) => {
    await seedTrader(request);
    const logout = await request.post("/api/auth/logout");
    expect(logout.ok()).toBeTruthy();
    await mockHorf(page);
    await mockOfficialCrpPrefill(page, leadWallet);
    await page.goto("/horf/send-horse");
    await page.locator('[data-horf-horse-row] [data-horf-horse-address]').first().fill(leadWallet);
    const target = `/crp-nominate?category=influencer&nominee=${leadWallet}`;
    const signInLink = page.locator('[data-horf-crp-influencer-sign-in]');
    await expect(signInLink).toHaveAttribute("href", `/login?return=${encodeURIComponent(target)}`);
    await signInLink.click();
    await expect(page).toHaveURL(new RegExp(`/login\\?return=${encodeURIComponent(target)}$`));
    await page.getByLabel("Username").fill("wtf-admin");
    await page.getByLabel("Password").fill("any-password");
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page).toHaveURL(new RegExp(`/crp-nominate\\?category=influencer&nominee=${leadWallet}$`));
    await expect(page.locator('[data-crp-surface="nomination-appview"]')).toHaveCount(1);
    await expect(page.locator('[data-crp-region="query-input"]')).toHaveValue(leadWallet);
    await expect(page.locator('[data-crp-region="category-select"]')).toHaveValue("influencer");
  });

  test("rejects an outside return target during award sign-in", async ({ page, request }) => {
    await seedTrader(request);
    const logout = await request.post("/api/auth/logout");
    expect(logout.ok()).toBeTruthy();
    await page.goto("/login?return=%2F%2Fevil.example");
    await page.getByLabel("Username").fill("wtf-admin");
    await page.getByLabel("Password").fill("any-password");
    await page.getByRole("button", { name: "Log In" }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(new URL(page.url()).hostname).toBe("127.0.0.1");
  });

  test("reviews an owned horse, requires a live signer, and toggles a received favor note", async ({ page, request }) => {
    test.slow(); // Octez's missing-signer prompt can consume its configured wallet timeout.
    await seedTrader(request);
    const { marks } = await mockHorf(page, {
      initialPosse: [{ id: 4, address: leadWallet, nickname: "Sir Canter", createdAt: "2026-11-03T12:00:00.000Z" }],
      initialGifts: [{
        id: 8, from: thirdWallet, to: traderWallet,
        token: { contract: horseToken, tokenId: "7", name: "Neighvember Seven", image: null },
        amount: 1, timestamp: "2026-11-02T12:00:00.000Z", opHash: `o${"B".repeat(50)}`,
        returnedFavor: false, returnedAt: null,
      }],
    });
    await page.goto("/horf/gifts");

    const gifts = page.locator('[data-horf-region="gifts"]');
    await expect(gifts.locator("[data-horf-gift-row]")).toContainText("Neighvember Seven");
    await gifts.locator("[data-horf-gift-owned]").selectOption(`${horseToken}:7`);
    await expect(gifts.locator('[data-horf-art-send-kind] input[value="gift"]')).toBeChecked();
    await gifts.locator('[data-horf-art-send-kind] input[value="trade"]').check();
    await expect(gifts.locator("[data-horf-gift-submit]")).toHaveText("Review horse send");
    await expect(gifts).toContainText("Sends count in the race; reciprocal trades complete when a rider sends a horse back.");
    await gifts.locator('[data-horf-art-send-kind] input[value="gift"]').check();
    await expect(gifts.locator("[data-horf-gift-submit]")).toHaveText("Review horse send");
    await gifts.getByRole("combobox", { name: "Choose gift recipient from posse" }).selectOption(leadWallet);
    await expect(gifts.locator("[data-horf-gift-recipient]")).toHaveValue(leadWallet);
    await expect(gifts.locator("[data-horf-gift-submit]")).toBeEnabled();
    await gifts.locator("[data-horf-gift-row] [data-horf-gift-returned]").click();
    await expect(gifts.locator("[data-horf-gift-row] [data-horf-gift-returned]")).toContainText("Returned the favor");
    await gifts.locator("[data-horf-gift-row] [data-horf-gift-returned]").click();
    await expect(gifts.locator("[data-horf-gift-row] [data-horf-gift-returned]")).toContainText("Mark returned the favor");
    expect(marks).toEqual([true, false]);
    await gifts.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-gifts-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await gifts.scrollIntoViewIfNeeded();
    expect(await gifts.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/horf-gifts-narrow.png", fullPage: true });
    await gifts.locator("[data-horf-gift-submit]").click();
    await expect(gifts.locator("[data-horf-gift-review]")).toContainText(leadWallet);
    await gifts.locator("[data-horf-gift-confirm]").click();
    await expect(gifts.locator("[data-horf-gift-reconnect]")).toBeVisible({ timeout: 45_000 });
  });

  test("reviews a multi-rider horse trade with explicit editions from posse and known traders", async ({ page, request }) => {
    test.slow(); // The no-signer Confirm path waits for Octez's configured wallet timeout.
    await seedTrader(request);
    await mockHorf(page, {
      ownedBalance: "30",
      initialPosse: [{ id: 4, address: leadWallet, nickname: "Sir Canter", createdAt: "2026-11-03T12:00:00.000Z" }],
      seasonRiders: [
        { address: leadWallet, name: "Sir Canter", trades: 18, received: 18, sent: 18 },
        { address: thirdWallet, name: "Steady Rider", trades: 12, received: 12, sent: 12 },
      ],
    });
    let eligibilityCalls = 0;
    await page.route("**/api/horf/token-eligibility?*", (route) => {
      eligibilityCalls += 1;
      return json(route, { eligible: false, error: "This token is not qualifying horse art." }, 422);
    });
    await page.goto("/horf/gifts");
    const gifts = page.locator('[data-horf-region="gifts"]');
    await gifts.locator("[data-horf-gift-owned]").selectOption(`${horseToken}:7`);
    await gifts.locator('[data-horf-art-send-kind] input[value="trade"]').check();
    await expect(gifts.locator("[data-horf-gift-recipient-row]")).toHaveCount(1);
    await gifts.locator("[data-horf-gift-recipient-row]").first().locator("[data-horf-gift-posse-picker]").selectOption(leadWallet);
    await expect(gifts.locator("[data-horf-gift-recipient-row]").first().locator("[data-horf-gift-recipient]")).toHaveValue(leadWallet);

    await gifts.locator("[data-horf-gift-add-recipient]").click();
    const rows = gifts.locator("[data-horf-gift-recipient-row]");
    await expect(rows).toHaveCount(2);
    await rows.nth(1).locator("[data-horf-gift-trader-picker]").selectOption(thirdWallet);
    await expect(rows.nth(1).locator("[data-horf-gift-recipient]")).toHaveValue(thirdWallet);
    await rows.first().locator("[data-horf-gift-amount]").fill("2");
    await rows.nth(1).locator("[data-horf-gift-amount]").fill("29");
    await gifts.locator("[data-horf-gift-submit]").click();
    await expect(gifts.getByRole("alert")).toContainText("30");
    await expect(gifts.locator("[data-horf-gift-review]")).toHaveCount(0);

    await rows.first().locator("[data-horf-gift-amount]").fill("1");
    await gifts.locator("[data-horf-gift-submit]").click();
    const review = gifts.locator("[data-horf-gift-review]");
    await expect(review).toContainText(leadWallet);
    await expect(review).toContainText(thirdWallet);
    await expect(review).toContainText("30 of 30 owned editions");
    await expect(review.locator("[data-horf-gift-confirm]")).toBeEnabled();
    expect(eligibilityCalls).toBe(0);

    await rows.nth(1).locator("[data-horf-gift-amount]").fill("28");
    await expect(review).toHaveCount(0);
    await gifts.locator("[data-horf-gift-submit]").click();
    await expect(review).toContainText("29 of 30 owned editions");
    await review.locator("[data-horf-gift-confirm]").click();
    await expect(gifts.locator("[data-horf-gift-reconnect]")).toBeVisible({ timeout: 45_000 });
    expect(eligibilityCalls).toBe(0);
  });

  test("retains a pending gift after reload and retries its hash without another wallet send", async ({ page, request }) => {
    await seedTrader(request);
    await mockHorf(page);
    const opHash = `o${"C".repeat(50)}`;
    const pending = {
      address: traderWallet, opHash,
      gifts: [
        { recipient: leadWallet, tokenContract: horseToken, tokenId: "7", amount: "1" },
        { recipient: thirdWallet, tokenContract: horseToken, tokenId: "7", amount: "2" },
      ],
    };
    await page.addInitScript(({ address, value }) => {
      window.localStorage.setItem(`horf:pending-gift-confirmation:${address}`, JSON.stringify([value]));
    }, { address: traderWallet, value: pending });
    const confirmations = [];
    await page.route("**/api/horf/gifts/confirm", (route) => {
      confirmations.push(route.request().postDataJSON());
      return json(route, { status: "pending", opHash }, 202);
    });

    await page.goto("/horf/gifts");
    const gifts = page.locator('[data-horf-region="gifts"]');
    await expect(gifts.locator("[data-horf-gift-retry]")).toHaveCount(1);
    await page.reload();
    await expect(gifts.locator("[data-horf-gift-retry]")).toHaveCount(1);
    expect(confirmations).toHaveLength(0);
    await gifts.locator("[data-horf-gift-retry]").click();
    await expect(gifts).toContainText("Gift indexing is still catching up");
    expect(confirmations).toEqual([pending]);
    await expect(gifts.locator("[data-horf-gift-retry]")).toHaveCount(1);
  });

  test("keeps a direct trade pending until indexed proof returns a verified receipt", async ({ page, request }) => {
    await seedTrader(request);
    await mockHorf(page);
    const opHash = `o${"D".repeat(50)}`;
    const pending = {
      address: traderWallet, opHash,
      trades: [
        { recipient: leadWallet, tokenContract: horseToken, tokenId: "7", amount: "1" },
        { recipient: thirdWallet, tokenContract: horseToken, tokenId: "7", amount: "2" },
      ],
    };
    await page.addInitScript(({ address, value }) => {
      window.localStorage.setItem(`horf:pending-trade-confirmation:${address}`, JSON.stringify([value]));
    }, { address: traderWallet, value: pending });
    const confirmations = [];
    await page.route("**/api/horf/trades/confirm", (route) => {
      confirmations.push(route.request().postDataJSON());
      return json(route, confirmations.length === 1 ? { status: "pending", opHash }
        : { trades: pending.trades.map((trade, index) => ({ id: 61 + index, opHash, ...trade })) }, confirmations.length === 1 ? 202 : 200);
    });

    await page.goto("/horf/gifts");
    const gifts = page.locator('[data-horf-region="gifts"]');
    await expect(gifts.locator("[data-horf-trade-retry]")).toHaveCount(1);
    await page.reload();
    await expect(gifts.locator("[data-horf-trade-retry]")).toHaveCount(1);
    expect(confirmations).toHaveLength(0);
    await gifts.locator("[data-horf-trade-retry]").click();
    await expect(gifts).toContainText("TzKT indexing is catching up");
    await expect(gifts).not.toContainText("Direct horse trade verified in Horf");
    await expect(gifts.locator("[data-horf-trade-retry]")).toHaveCount(1);
    await gifts.locator("[data-horf-trade-retry]").click();
    await expect(gifts).toContainText("2 direct horse sends verified in Horf");
    await expect(gifts.locator("[data-horf-trade-retry]")).toHaveCount(0);
    expect(confirmations).toEqual([pending, pending]);
    expect(await page.evaluate((address) => window.localStorage.getItem(`horf:pending-trade-confirmation:${address}`), traderWallet)).toBeNull();
  });
});
