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

async function mockHorf(page, { readyHorse = false, initialPosse = [], initialGifts = [] } = {}) {
  let partners = [...initialPosse];
  let gifts = [...initialGifts];
  const marks = [];
  await page.addInitScript(({ address }) => {
    window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
  }, { address: traderWallet });
  await page.route("**/api/horf/season*", (route) => json(route, {
    season, seasons: [season], asOf: "2026-11-03T12:00:00.000Z", error: null,
    nextRefreshAt: null, status: "ready", leaderboard: [], currentUser: null,
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
    items: [{ contract: horseToken, tokenId: "7", name: "Neighvember Seven", balance: "2", walletAddress: traderWallet }],
    pagination: { limit: 48, offset: 0, total: 1, hasMore: false, nextOffset: 1 },
  }));
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

test.describe("Horf HORSE, posse, and horse gifts", () => {
  test("allows posse and CSV preparation while HORSE sends are unconfigured", async ({ page, request }) => {
    await seedTrader(request);
    await mockHorf(page);
    await page.goto("/horf");

    const send = page.locator('[data-horf-region="horse-send"]');
    await expect(send.locator("[data-horf-horse-rewards]")).toContainText("first indexed snapshot");
    await expect(send.locator("[data-horf-horse-rewards]")).not.toContainText("0 HORSE claimable");
    await expect(send.locator("[data-horf-horse-claim]")).toBeDisabled();
    await expect(send).toContainText("has not been verified and configured yet");
    await expect(send.locator("[data-horf-horse-send]")).toBeDisabled();
    await send.locator("[data-horf-posse-address]").fill(leadWallet);
    await send.getByRole("textbox", { name: "Nickname (optional)" }).fill("Sir Canter");
    await send.locator("[data-horf-posse-add]").click();
    await expect(send.locator("[data-horf-posse-member]")).toContainText("Sir Canter");
    await send.getByRole("combobox", { name: "Choose posse trader for recipient 1" }).selectOption(leadWallet);
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
    await send.locator("[data-horf-posse-member]").getByRole("button", { name: "Remove" }).click();
    await expect(send.locator("[data-horf-posse-member]")).toHaveCount(0);
    await send.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-horse-unconfigured-desktop.png", fullPage: true });
  });

  test("shows verified HORSE balance and cumulative receipts, and checks precision before signing", async ({ page, request }) => {
    await seedTrader(request);
    await mockHorf(page, { readyHorse: true });
    await page.goto("/horf");

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
    await expect(page.locator("[data-horf-claim-alert]")).toContainText("20 HORSE is shown as earned from this wallet’s qualifying horse sends");
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
    await page.setViewportSize({ width: 390, height: 844 });
    await send.scrollIntoViewIfNeeded();
    expect(await send.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/horf-horse-ready-narrow.png", fullPage: true });
    await send.locator("[data-horf-crp-open]").click();
    await expect(page).toHaveURL(/\/crp-nominate$/);
  });

  test("chooses an owned horse, blocks ineligible gifts, and toggles a received favor note", async ({ page, request }) => {
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
    await page.goto("/horf");

    const gifts = page.locator('[data-horf-region="gifts"]');
    await expect(gifts.locator("[data-horf-gift-row]")).toContainText("Neighvember Seven");
    await gifts.locator("[data-horf-gift-owned]").selectOption(`${horseToken}:7`);
    await expect(gifts.locator('[data-horf-art-send-kind] input[value="gift"]')).toBeChecked();
    await gifts.locator('[data-horf-art-send-kind] input[value="trade"]').check();
    await expect(gifts.locator("[data-horf-gift-submit]")).toHaveText("Trade this horse");
    await expect(gifts).toContainText("Direct trades count when the season ledger scans the transfer");
    await gifts.locator('[data-horf-art-send-kind] input[value="gift"]').check();
    await expect(gifts.locator("[data-horf-gift-submit]")).toHaveText("Gift this horse");
    await gifts.getByRole("combobox", { name: "Choose gift recipient from posse" }).selectOption(leadWallet);
    await expect(gifts.locator("[data-horf-gift-recipient]")).toHaveValue(leadWallet);
    await expect(gifts.locator("[data-horf-gift-submit]")).toBeEnabled();
    await gifts.locator("[data-horf-gift-submit]").click();
    await expect(gifts.getByRole("alert")).toContainText("not qualifying horse art");

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
  });

  test("retains a pending gift after reload and retries its hash without another wallet send", async ({ page, request }) => {
    await seedTrader(request);
    await mockHorf(page);
    const opHash = `o${"C".repeat(50)}`;
    const pending = {
      address: traderWallet, opHash,
      gifts: [{ recipient: leadWallet, tokenContract: horseToken, tokenId: "7", amount: "1" }],
    };
    await page.addInitScript(({ address, value }) => {
      window.localStorage.setItem(`horf:pending-gift-confirmation:${address}`, JSON.stringify([value]));
    }, { address: traderWallet, value: pending });
    const confirmations = [];
    await page.route("**/api/horf/gifts/confirm", (route) => {
      confirmations.push(route.request().postDataJSON());
      return json(route, { status: "pending", opHash }, 202);
    });

    await page.goto("/horf");
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
      trades: [{ recipient: leadWallet, tokenContract: horseToken, tokenId: "7", amount: "1" }],
    };
    await page.addInitScript(({ address, value }) => {
      window.localStorage.setItem(`horf:pending-trade-confirmation:${address}`, JSON.stringify([value]));
    }, { address: traderWallet, value: pending });
    const confirmations = [];
    await page.route("**/api/horf/trades/confirm", (route) => {
      confirmations.push(route.request().postDataJSON());
      return json(route, confirmations.length === 1 ? { status: "pending", opHash }
        : { trades: [{ id: 61, opHash, ...pending.trades[0] }] }, confirmations.length === 1 ? 202 : 200);
    });

    await page.goto("/horf");
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
    await expect(gifts).toContainText("Direct horse trade verified in Horf");
    await expect(gifts.locator("[data-horf-trade-retry]")).toHaveCount(0);
    expect(confirmations).toEqual([pending, pending]);
    expect(await page.evaluate((address) => window.localStorage.getItem(`horf:pending-trade-confirmation:${address}`), traderWallet)).toBeNull();
  });
});
