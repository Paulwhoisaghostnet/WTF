import { test, expect } from "@playwright/test";

test("Create starts with outcomes and honestly catalogs every specialist tool", async ({ page, request }) => {
  await request.post("/__test/state", { data: { userRole: "admin" } });
  await page.goto("/create", { waitUntil: "domcontentloaded" });
  const runway = page.locator("[data-create-runway]");
  await expect(runway).toBeVisible();
  await expect(runway.getByRole("heading", { name: "What do you want to make?" })).toBeVisible();
  for (const outcome of ["Make an image", "Make an animation", "Make 3D art", "Build a game"]) {
    await expect(runway.getByRole("heading", { name: outcome, exact: true })).toBeVisible();
  }
  for (const next of ["Continue a project", "Preserve or export", "Mint or publish", "Challenge minting"]) {
    await expect(runway.getByRole("heading", { name: next, exact: true })).toBeVisible();
  }

  const toolCards = runway.locator("[data-create-tool-card]");
  await expect(toolCards).toHaveCount(16);
  for (const card of await toolCards.all()) {
    await expect(card.getByText("Makes", { exact: true })).toBeVisible();
    await expect(card.getByText("Exports to", { exact: true })).toBeVisible();
    await expect(card.getByRole("button", { name: /^Open / })).toBeVisible();
  }

  await runway.getByRole("region", { name: "Choose an outcome" }).getByRole("button", { name: "Open PixAlerce", exact: true }).click();
  await expect(page).toHaveURL(/\/tools\/pixalerce$/);
  await expect(page.locator('[data-creation-tool-id="pixalerce"]')).toContainText("wtfOS Media exports");

  await page.goto("/create", { waitUntil: "domcontentloaded" });
  const spaghetti = page.locator('[data-create-tool-card="spaghetti"]');
  await expect(spaghetti).toContainText("portable collector-site ZIP");
  await spaghetti.getByRole("button", { name: "Open Spaghetti", exact: true }).click();
  await expect(page).toHaveURL(/\/tools\/spaghetti$/);
  await expect(page.locator('[data-creation-tool-id="spaghetti"]')).toBeVisible();
});
