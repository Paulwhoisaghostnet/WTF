import { test, expect } from "@playwright/test";

const wallet = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";

const scanResponse = {
  walletAddress: wallet,
  items: [
    {
      key: `${contract}:42`, contract, tokenId: "42", ownerAddress: wallet,
      name: "Two of a Kind", collectionName: "Small Editions", creatorAddress: "tz1creator", creatorName: "A. Collector",
      thumbnailUri: null, artifactUri: null, mimeType: "image/png", balance: 3, totalSupply: 100, decimals: 0,
      acquiredAt: "2025-03-14T12:00:00.000Z", acquisitionType: "purchase", acquisitionMarketplace: "objkt",
      acquisitionEditions: 3, acquisitionCostMutez: "6000000", acquisitionUnitCostMutez: "2000000",
      lastSaleMutez: "3500000", lastSaleAt: "2026-06-10T12:00:00.000Z", deltaMutez: "1500000", deltaPercent: 75,
      currentFloorMutez: "4000000", saleCount: 8, activeListingCount: 2, uniqueOwnersCount: 47,
      firstHeldAt: "2025-03-14T12:00:00.000Z", lastChangedAt: "2025-03-14T12:00:00.000Z",
      provenance: { holdings: "tzkt", acquisition: "wtfos-index", market: "wtfos-index" },
    },
  ],
  summary: { duplicateArtTokens: 1, duplicateEditions: 3, knownAcquisitionPrices: 1, knownLastSales: 1, excluded: { decimals: 2, supply: 1, malformed: 1 } },
  filters: { minimumBalance: 2, maximumSupply: 5000, decimals: 0, standard: "fa2" },
  source: { holdings: "tzkt", pricing: "wtfos-index", network: "tezos-mainnet", fetchedAt: "2026-07-18T12:00:00.000Z", staleAfter: "2026-07-18T12:02:00.000Z", truncated: false },
};

test("colleKT scans duplicate art and previews exact wallet offer terms", async ({ page }) => {
  const events = [];
  await page.route("**/api/collekt/session", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ user: { id: 1, username: "wtf-admin", displayName: "WTF Admin" }, wallets: [], gallery: { id: "wtf:me", path: "/wtf", moduleUrl: null } }),
  }));
  await page.route("**/api/collekt/duplicates**", route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(scanResponse) }));
  await page.route("**/api/collekt/events", async route => {
    events.push((await route.request().postDataJSON()).eventType);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });

  await page.goto("/collekt");
  await expect(page.getByRole("heading", { name: "Double Take" })).toBeVisible();
  await page.getByLabel("Wallet address").fill(wallet);
  await page.getByRole("button", { name: "Scan duplicates" }).click();

  await expect(page.getByRole("heading", { name: "Two of a Kind" })).toBeVisible();
  await expect(page.getByText("3 of 100 editions")).toBeVisible();
  await expect(page.getByText("2 ꜩ")).toBeVisible();
  await expect(page.getByText("3.5 ꜩ")).toBeVisible();
  await expect(page.getByText("+1.5 ꜩ")).toBeVisible();
  await expect.poll(() => events).toContain("collekt.duplicates.scanned");

  await page.getByRole("button", { name: "Make offer" }).click();
  await expect(page.getByRole("dialog")).toContainText(`${contract} / #42`);
  await expect(page.getByRole("dialog")).toContainText(wallet);
  await expect(page.getByRole("dialog")).toContainText("1 edition");
  await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible();
  await expect.poll(() => events).toContain("collekt.offer.terms_previewed");

  await page.setViewportSize({ width: 430, height: 820 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole("dialog")).toBeInViewport();
  await page.screenshot({ path: "test-results/collekt-duplicates-narrow.png", fullPage: true });
});
