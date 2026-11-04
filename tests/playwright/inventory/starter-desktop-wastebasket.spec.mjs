import { expect, test } from "@playwright/test";

async function enterStarterDesktop(page, request) {
  const reset = await request.post("/__test/state", {
    data: { userRole: "witness", username: "starter-wastebasket-user", welcomePending: false },
  });
  expect(reset.ok()).toBeTruthy();
  const settings = await (await request.get("/api/desktop/settings")).json();
  await page.route("**/api/desktop/settings", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      ...settings,
      appearance: { ...settings.appearance, desktopIconMode: "starter" },
    }),
  }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByTitle("starter-wastebasket-user")).toBeVisible();
  await expect(page.locator('[data-desktop-icon-key="recycle-bin"]')).toBeVisible();
  await expect(page.locator('[data-desktop-icon-key="mail"]')).toBeVisible();
}

test.describe("interaction inventory - starter desktop and Wastebasket", () => {
  test("new accounts see a small desktop while Stuffs retains the other apps", async ({ page, request }) => {
    await enterStarterDesktop(page, request);
    const nativeKeys = await page.locator('[data-desktop-icon-root="true"]:not([data-desktop-icon-key^="shortcut:"])')
      .evaluateAll((icons) => icons.map((icon) => icon.getAttribute("data-desktop-icon-key")).sort());
    expect(nativeKeys).toEqual(["mail", "recycle-bin"]);
    await expect(page.getByRole("button", { name: "Open Stuffs menu" })).toBeVisible();
    await page.getByRole("button", { name: "Open Stuffs menu" }).click();
    await page.getByText("Account", { exact: true }).click();
    await expect(page.getByText("Mission Control", { exact: true }).last()).toBeVisible();
  });

  test("Wastebasket moves shortcuts, restores them, and confirms permanent emptying", async ({ page, request }) => {
    await enterStarterDesktop(page, request);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("wtf-os:create-desktop-shortcut", {
      detail: { label: "Profile", path: "/profile", icon: "P" },
    })));
    const shortcut = page.locator('[data-desktop-icon-key^="shortcut:"]');
    await expect(shortcut).toBeVisible();

    await shortcut.click({ button: "right" });
    await page.getByText("Move to Wastebasket", { exact: true }).click();
    await expect(shortcut).toHaveCount(0);
    const basketIcon = page.locator('[data-desktop-icon-key="recycle-bin"]');
    await basketIcon.dblclick();
    const basket = page.getByTestId("wastebasket");
    await expect(basket.locator("[data-wastebasket-shortcut]")).toContainText("Profile");
    await basket.getByRole("button", { name: "Restore Profile" }).click();
    await expect(shortcut).toBeVisible();

    await page.getByRole("button", { name: "Close Wastebasket" }).click();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(shortcut).toBeVisible();
    const from = await shortcut.boundingBox();
    const to = await basketIcon.boundingBox();
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(shortcut).toHaveCount(0);

    await basketIcon.dblclick();
    await expect(basket.locator("[data-wastebasket-shortcut]")).toContainText("Profile");
    await basket.getByRole("button", { name: "Empty Wastebasket" }).click();
    await expect(basket.getByText(/Permanently delete all shortcuts/)).toBeVisible();
    await basket.getByRole("button", { name: "Permanently empty Wastebasket" }).click();
    await expect(basket).toContainText("Wastebasket is empty");
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("wastebasket")).toContainText("Wastebasket is empty");
  });
});
