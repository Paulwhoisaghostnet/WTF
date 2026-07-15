import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";

const ACCOUNT = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const CONTRACT = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";

test.describe("Pasta Suite Desktop native Colander", () => {
  test.beforeAll(() => {
    execFileSync(process.execPath, ["apps/pasta-suite-desktop/scripts/prepare-assets.mjs"], { cwd: process.cwd() });
  });

  test("persists a project, detects a local contract, configures its sale, and attaches it", async ({ page }) => {
    const runtimeErrors = [];
    page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`);
    });
    const nativeHtml = readFileSync("apps/pasta-suite-desktop/pasta/index.html", "utf8");
    await page.route("**/pasta-suite-native/index.html", (route) => route.fulfill({ contentType: "text/html", body: nativeHtml }));
    await page.route("**/api/pasta/sites", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, sites: [{ title: "Native direct sale page", app: "spaghetti", url: "/sites/spaghetti-proof/", fileCount: 8 }] }),
    }));
    await page.route("**/creation-tools/spaghetti/js/common.js", async (route) => {
      const response = await route.fetch();
      const source = await response.text();
      const harness = `
        (() => {
          const operations = [];
          const methodsObject = {
            set_sale(payload) { return { async send() { operations.push({ entrypoint: "set_sale", payload }); return { async confirmation() { operations.push({ entrypoint: "set_sale", confirmed: true }); } }; } }; },
            set_sale_active(payload) { return { async send() { operations.push({ entrypoint: "set_sale_active", payload }); return { async confirmation() {} }; } }; }
          };
          const contract = {
            entrypoints: { entrypoints: { transfer:{}, create_token:{}, mint:{}, set_sale:{}, set_sale_active:{}, transfer_administration:{}, accept_administration:{} } },
            methodsObject,
            async storage() { return { administrator: "${ACCOUNT}", next_token_id: 1 }; }
          };
          const toolkit = { contract: { async at() { return contract; } }, wallet: { async at() { return contract; } } };
          window.__nativeColanderProof = { operations };
          MD.setupToolkit = () => toolkit;
          MD.getToolkit = () => toolkit;
          MD.connectWallet = async () => "${ACCOUNT}";
          MD.assertOperationSafety = async () => "${ACCOUNT}";
        })();
      `;
      await route.fulfill({ response, body: `${source}\n${harness}` });
    });

    await page.goto("/pasta-suite-native/index.html", { waitUntil: "domcontentloaded" });
    await expect.poll(() => runtimeErrors).toEqual([]);
    await expect(page.locator("#local-sites")).toContainText("Native direct sale page");
    await expect(page.getByRole("button", { name: "Open local page" })).toBeVisible();
    await page.locator("#project-title").fill("Native direct sale");
    await page.locator("#project-tool").selectOption("spaghetti");
    await page.locator("#create-project").click();
    await expect(page.locator("#project-list")).toContainText("Native direct sale");

    await page.locator("#contract-network").selectOption("shadownet");
    await page.locator("#contract-kt").fill(CONTRACT);
    await page.locator("#open-contract").click();
    await expect(page.locator("#contract-facts")).toContainText("Spaghetti / Rotini collection");
    await expect(page.locator('[data-action="set_sale"]')).toBeVisible();
    await expect(page.locator("#project-list")).toContainText("deployed · 1 contracts");

    const sale = page.locator('[data-action="set_sale"]');
    await sale.locator('[name="token_id"]').fill("0");
    await sale.locator('[name="price"]').fill("2500000");
    await sale.locator('[name="remaining"]').fill("4");
    await sale.getByRole("button", { name: "Submit Configure direct sale" }).click();
    await expect(page.locator("#contract-facts")).toContainText("Configure direct sale confirmed on Tezos");

    const proof = await page.evaluate(() => window.__nativeColanderProof.operations);
    expect(proof).toEqual([
      {
        entrypoint: "set_sale",
        payload: {
          token_id: 0,
          sale: { active: true, seller: ACCOUNT, treasury: ACCOUNT, price: 2500000, remaining: 4, start: null, end: null },
        },
      },
      { entrypoint: "set_sale", confirmed: true },
    ]);
  });
});
