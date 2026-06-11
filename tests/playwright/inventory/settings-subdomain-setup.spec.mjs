import { test, expect } from "@playwright/test";

const HARNESS_WALLET = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";

async function seedHarness(request) {
  const res = await request.post("/__test/state", {
    data: {
      userRole: "admin",
      username: "macaroni",
      displayName: "Macaroni Creator",
      wtfUserSiteClaimed: false,
    },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe("interaction inventory - settings subdomain setup", () => {
  test("settings opens a windowed setup applet that claims wtfos.me and builds wtf.tez plans", async ({
    page,
    request,
  }) => {
    await seedHarness(request);
    await page.addInitScript((walletAddress) => {
      window.localStorage.setItem(
        "wtf:wallet-session",
        JSON.stringify({ address: walletAddress, providerName: "beacon" }),
      );
    }, HARNESS_WALLET);

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("system-settings")).toBeVisible();
    await expect(page.getByTestId("subdomain-setup-applet")).toHaveCount(0);
    await page.getByRole("button", { name: "Open Subdomain Setup" }).click();
    await expect(page).toHaveURL(/\/wtf-subdomains\/setup$/);
    await expect(page.getByText("Subdomain Setup", { exact: true }).first()).toBeVisible();

    const applet = page.getByTestId("subdomain-setup-applet");
    await expect(applet).toBeVisible();
    await expect(applet.getByText("macaroni.wtfos.me", { exact: true })).toBeVisible();
    await expect(applet.getByText("macaroni.wtf.tez", { exact: true })).toBeVisible();
    await expect(applet.getByLabel("wtf.tez label")).toHaveValue("macaroni");
    await expect(applet.getByLabel("wtf.tez target wallet")).toHaveValue(HARNESS_WALLET);

    await applet.getByRole("button", { name: "Claim macaroni.wtfos.me" }).click();
    await expect(applet.getByRole("button", { name: "Open macaroni.wtfos.me" })).toBeVisible();
    await expect(applet.getByText("Macaroni can publish drop pages under this host.")).toBeVisible();

    await applet.getByRole("button", { name: "Build commit plan" }).click();
    await expect(applet.getByText("Salt: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBeVisible();
    await expect(applet.getByRole("button", { name: "Build register plan" })).toBeEnabled({
      timeout: 3_000,
    });
    await applet.getByRole("button", { name: "Build register plan" }).click();
    await expect(applet.getByText("Register operations")).toBeVisible();
    await expect(applet.getByText("commit -> register")).toBeVisible();
  });
});
