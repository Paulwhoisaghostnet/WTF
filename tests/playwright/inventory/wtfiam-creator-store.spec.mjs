import { expect, test } from "@playwright/test";

async function setHarnessState(request, state = {}) {
  const response = await request.post("/__test/state", { data: state });
  expect(response.ok()).toBeTruthy();
}

async function eventTypes(request) {
  const state = await (await request.get("/__test/state")).json();
  return state.interactionLog.map((event) => event.eventType);
}

test("creator submits, operator approves, and buyer completes an EXP Store purchase", async ({
  page,
  request,
}) => {
  await setHarnessState(request, {
    userRole: "admin",
    username: "store-creator",
    displayName: "Store Creator",
  });

  await page.goto("/wtfiam?category=desktop_fun", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Sell something" }).click();
  await page.getByLabel("Creator item name").fill("Community Cursor Pack");
  await page.getByLabel("Creator item description").fill("A community-made cursor set for the classic desktop.");
  await page.getByLabel("Creator item EXP price").fill("75");
  await page.getByLabel("Creator item available quantity").fill("12");
  await page.getByRole("button", { name: "Submit for review" }).click();

  await expect(page.getByText(/submitted for operator review/i)).toBeVisible();
  await expect(page.getByLabel("My Store submissions")).toContainText("Community Cursor Pack");
  await expect(page.getByLabel("My Store submissions")).toContainText("submitted");
  await expect(
    page.locator('[data-wtfiam-region="item-card"]', { hasText: "Community Cursor Pack" })
  ).toHaveCount(0);

  await page.goto("/admin?section=in-app-market", { waitUntil: "domcontentloaded" });
  const itemRow = page.getByRole("row", { name: /Community Cursor Pack/ });
  await expect(itemRow).toContainText("creator submitted");
  await expect(itemRow).toContainText("store-creator");
  await itemRow.getByLabel("Review note for Community Cursor Pack").fill("Approved for the community shelf.");
  await itemRow.getByRole("button", { name: "Approve creator item" }).click();
  await expect(itemRow).toContainText("creator approved");

  await page.goto("/wtfiam?category=desktop_fun", { waitUntil: "domcontentloaded" });
  const store = page.locator('[data-wtfiam-surface="marketplace"]');
  const itemCard = page.locator('[data-wtfiam-region="item-card"]', { hasText: "Community Cursor Pack" });
  await expect(itemCard).toBeVisible();
  await itemCard.getByRole("button", { name: "Add", exact: true }).click();
  await store.getByRole("button", { name: "EXP", exact: true }).click();
  await store.getByRole("button", { name: "Checkout", exact: true }).click();
  await expect(store.getByText("Purchase confirmed.")).toBeVisible();

  await expect.poll(() => eventTypes(request)).toEqual(
    expect.arrayContaining([
      "wtfiam.creator_item.created",
      "wtfiam.creator_item.reviewed",
      "wtfiam.cart_intent.created",
      "wtfiam.exp_checkout.completed",
    ])
  );
});

test("ordinary members get an explained Store creator gate and recovery path", async ({
  page,
  request,
}) => {
  await setHarnessState(request, {
    userRole: "witness",
    username: "store-member",
    displayName: "Store Member",
  });

  await page.goto("/wtfiam", { waitUntil: "domcontentloaded" });
  const store = page.locator('[data-wtfiam-surface="marketplace"]');
  await store.getByRole("button", { name: "Sell something" }).click();
  await expect(store.getByText(/Trusted Market Creator permission/)).toBeVisible();
  await store.getByRole("button", { name: "Contact Admin to request access" }).click();
  await expect(page).toHaveURL(/\/admin-inbox$/);
});
