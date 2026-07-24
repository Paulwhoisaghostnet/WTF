import { expect, test } from "@playwright/test";

const fundingWallet = "tz1d85U8FuaqeDzfdjxoUngrNbCiCsFiKJ53";
const profileWallet = "tz1burnburnburnburnburnburnburjAYjjX";
const wtfContract = "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD";

test.beforeEach(async ({ page, request }) => {
  await request.post("/__test/state", {
    data: { userRole: "admin", username: "wtf-admin" },
  });
  await page.addInitScript(
    ({ fundingWallet: payrollAddress, profileWallet: storedProfileWallet }) => {
      localStorage.setItem(
        "wtf:wallet-session",
        JSON.stringify({ address: storedProfileWallet, network: "mainnet" }),
      );
      window.__payrollTransfers = [];
      window.__payrollDisconnects = 0;
      window.__WTF_PAYROLL_WALLET_HARNESS__ = {
        async connect() {
          return payrollAddress;
        },
        async disconnect() {
          window.__payrollDisconnects += 1;
        },
        async getActiveAddress() {
          return payrollAddress;
        },
        async getBalances(expectedAddress) {
          if (expectedAddress !== payrollAddress) throw new Error("Unexpected Payroll balance address.");
          return { xtzMutez: "12500000", wtfAtomic: "5000000000" };
        },
        async transfer(request) {
          window.__payrollTransfers.push(request);
          return `ooPayrollOperationHash${window.__payrollTransfers.length}`;
        },
      };
    },
    { fundingWallet, profileWallet },
  );
});

test("admin connects an isolated funding wallet and reviews exact XTZ and WTF transfers", async ({ page }) => {
  await page.goto("/payroll");

  await expect(page.locator("[data-payroll-surface='payroll']")).toBeVisible();
  await expect(page.getByText("Profile wallet is intentionally not used.")).toBeVisible();
  await expect(page.getByText(/fixed to Tezos mainnet/)).toBeVisible();

  await page.locator("[data-payroll-connect]").click();
  await expect(page.locator("[data-payroll-wallet-address]")).toHaveText(fundingWallet);
  await expect(page.getByText("12.5 XTZ", { exact: true })).toBeVisible();
  await expect(page.getByText("50 WTF", { exact: true })).toBeVisible();

  await page.locator("[data-payroll-amount]").fill("1.25");
  await page.locator("[data-payroll-recipient]").fill(wtfContract);
  await page.locator("[data-payroll-review]").click();
  const xtzReview = page.locator("[data-payroll-review-panel]");
  await expect(xtzReview).toContainText("1.25 XTZ");
  await expect(xtzReview).toContainText(fundingWallet);
  await expect(xtzReview).toContainText(wtfContract);
  await expect(xtzReview).toContainText("NetXdQprcVkpaWU");
  await page.locator("[data-payroll-send]").click();
  await expect(page.getByRole("link", { name: /ooPayrollOperationHash1/ })).toBeVisible();

  await page.locator("[data-payroll-asset]").selectOption("WTF");
  await page.locator("[data-payroll-amount]").fill("2.00000001");
  await page.locator("[data-payroll-recipient]").fill(profileWallet);
  await page.locator("[data-payroll-review]").click();
  const wtfReview = page.locator("[data-payroll-review-panel]");
  await expect(wtfReview).toContainText("2.00000001 WTF");
  await expect(wtfReview).toContainText(`${wtfContract} / token 0`);
  await page.locator("[data-payroll-send]").click();
  await expect(page.getByRole("link", { name: /ooPayrollOperationHash2/ })).toBeVisible();

  const browserState = await page.evaluate(() => ({
    profileSession: localStorage.getItem("wtf:wallet-session"),
    transfers: window.__payrollTransfers,
  }));
  expect(JSON.parse(browserState.profileSession).address).toBe(profileWallet);
  expect(browserState.transfers).toEqual([
    {
      asset: "XTZ",
      from: fundingWallet,
      recipient: wtfContract,
      atomicAmount: "1250000",
    },
    {
      asset: "WTF",
      from: fundingWallet,
      recipient: profileWallet,
      atomicAmount: "200000001",
    },
  ]);
});

test("Payroll blocks overspending and remains usable at narrow desktop widths", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 900 });
  await page.goto("/payroll");
  await page.locator("[data-payroll-connect]").click();

  await page.locator("[data-payroll-amount]").fill("12.500001");
  await page.locator("[data-payroll-recipient]").fill(wtfContract);
  await page.locator("[data-payroll-review]").click();
  await expect(page.getByText(/exceeds the connected wallet's available XTZ balance/)).toBeVisible();
  await expect(page.locator("[data-payroll-review-panel]")).toHaveCount(0);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator("[data-payroll-recipient]")).toBeEditable();
});
