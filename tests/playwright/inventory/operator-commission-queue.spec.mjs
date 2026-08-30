import { expect, test } from "@playwright/test";

async function openOverview(page) {
  await page.goto("/admin?section=overview", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "What needs attention?" })).toBeVisible();
  return page.locator("[data-admin-commission-queue]");
}

test("operator summary counts commissioned queues and hands review back to each owning app", async ({ page }) => {
  let queue = await openOverview(page);
  await expect(page.getByText("This summary only shows what is waiting and takes you there.")).toBeVisible();

  for (const [domain, count] of [["store", 2], ["arcade", 1], ["casino", 3], ["calendar", 1]]) {
    const card = queue.locator(`[data-admin-commission-queue-domain="${domain}"]`);
    await expect(card).toBeVisible();
    await expect(card.getByLabel(`${count} pending`)).toBeVisible();
  }

  await queue.getByRole("button", { name: "Review Store submissions" }).click();
  await expect(page).toHaveURL(/\/admin\?section=in-app-market$/);
  await expect(page.locator('[data-admin-active-section="In-App Market"]')).toBeVisible();

  queue = await openOverview(page);
  await queue.getByRole("button", { name: "Review Arcade submissions" }).click();
  await expect(page).toHaveURL(/\/admin\?section=arcade$/);
  await expect(page.locator('[data-admin-active-section="Arcade"]')).toBeVisible();

  queue = await openOverview(page);
  await queue.getByRole("button", { name: "Review Casino submissions" }).click();
  await expect(page).toHaveURL(/\/casino$/);

  queue = await openOverview(page);
  await queue.getByRole("button", { name: "Review Calendar submissions" }).click();
  await expect(page).toHaveURL(/\/control-board$/);
});
