import { expect, test } from "@playwright/test";

async function useTommyTezos(page) {
  await page.request.post("/__test/state", {
    data: {
      mode: "normal",
      userRole: "admin",
      userId: 42,
      username: "TommyTezos",
      displayName: "TommyTezos",
    },
  });
}

test("FAQ previews all registration videos with captions and the TommyTezos account", async ({ page }) => {
  await useTommyTezos(page);
  await page.goto("/faq");

  const viewer = page.locator('[data-faq-tutorial-viewer="true"]');
  await expect(page.getByRole("heading", { name: "Finish registration with TommyTezos" })).toBeVisible();
  await expect(page.locator("[data-faq-tutorial-card]")).toHaveCount(8);
  await expect(viewer.getByText("Account: TommyTezos")).toBeVisible();
  await expect(viewer.locator("video")).toHaveAttribute("preload", "none");
  await expect(viewer.locator('track[kind="captions"]')).toHaveAttribute("srclang", "en");

  await page.getByRole("button", { name: "Watch Connect and prove an Etherlink wallet" }).click();
  await expect(viewer.getByRole("heading", { name: "Connect and prove an Etherlink wallet" })).toBeVisible();
  await expect(viewer.locator("video")).toHaveAttribute(
    "aria-label",
    "Connect and prove an Etherlink wallet tutorial video using TommyTezos"
  );
  await expect(viewer.locator("source")).toHaveAttribute(
    "src",
    "/api/faq/tutorials/connect-etherlink-wallet/video"
  );
});

test("FAQ tutorial gallery stays within a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await useTommyTezos(page);
  await page.goto("/faq");
  await expect(page.locator('[data-faq-tutorial-viewer="true"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
