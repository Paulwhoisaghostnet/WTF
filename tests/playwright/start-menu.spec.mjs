import { expect, test } from "@playwright/test";

test("Stuffs menu group clicks reveal populated flyout columns", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Stuffs menu" }).click();
  await page.getByText("Apps", { exact: true }).click();

  await expect(page.getByText("File Manager", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Terminal", { exact: true }).last()).toBeVisible();
});
