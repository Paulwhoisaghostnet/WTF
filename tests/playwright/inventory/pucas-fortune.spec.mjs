import { test, expect } from "@playwright/test";

const cartridgePath = "/games/installed/pucas-fortune/index.html";

test("Púca’s Fortune cartridge boots and enters a playable Rummy encounter", async ({ page }) => {
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(`console: ${message.text()}`);
  });

  await page.goto(cartridgePath, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle("Púca’s Fortune");
  await expect(page.getByTestId("button-new-run")).toBeVisible();

  await page.getByTestId("button-new-run").click();
  await expect(page.getByRole("button", { name: /Rummy/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Cribbage/ })).toBeVisible();
  await page.getByRole("button", { name: /Rummy/ }).click();

  await expect(page.getByRole("heading", { name: "Choose the next path" })).toBeVisible();
  const routeState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(routeState.screen).toBe("route");

  await page.locator("main button").first().click();
  await expect(page.getByText("Books")).toBeVisible();
  await expect(page.getByText("Discards")).toBeVisible();
  const playState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  expect(playState.screen).toBe("game");
  expect(playState.hand).toHaveLength(10);
  expect(playState.encounter.books).toBe(5);
  expect(playState.encounter.discards).toBe(4);
  expect(browserErrors).toEqual([]);
});
