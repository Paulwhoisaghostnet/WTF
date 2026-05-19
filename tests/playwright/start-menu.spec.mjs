import { expect, test } from "@playwright/test";

test("Stuffs menu group clicks reveal populated flyout columns", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open Stuffs menu" }).click();
  await page.getByText("Apps", { exact: true }).click();

  await expect(page.getByText("File Manager", { exact: true }).last()).toBeVisible();
  await expect(page.getByText("Terminal", { exact: true }).last()).toBeVisible();
});

test("Mission Control and Command Palette live as named desktop icons, not tray codes", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("Mission Control", { exact: true })).toBeVisible();
  await expect(page.getByText("Command Palette", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Mission Control" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Command Palette" })).toHaveCount(0);
});
