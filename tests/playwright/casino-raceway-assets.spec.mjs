import { expect, test } from "@playwright/test";

test("Guinea Pig Raceway static asset preview loads racers, tracks, and GLB files", async ({ page }) => {
  await page.goto("/games/casino/guinea-pig-raceway/assets/preview.html");
  await expect(page.getByRole("heading", { name: "Guinea Pig Raceway Asset Pack" })).toBeVisible();
  await expect(page.locator(".card")).toHaveCount(8);
  await expect(page.locator(".track")).toHaveCount(5);
  await expect(page.locator("#summary")).toContainText("8 racers");
  await expect(page.locator("#summary")).toContainText("5 tracks");
  await expect(page.getByText("Miso Missile")).toBeVisible();
  await expect(page.getByText("Hazel Havoc")).toBeVisible();
  await expect(page.getByText("Kimchi Comet")).toBeVisible();

  const thumbnailsReady = await page.locator(".card img").evaluateAll((images) =>
    images.every((image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0)
  );
  expect(thumbnailsReady).toBe(true);

  const response = await page.request.get(
    "/games/casino/guinea-pig-raceway/assets/models/racers/miso-missile.glb"
  );
  expect(response.ok()).toBe(true);
  const body = await response.body();
  expect(body.toString("utf8", 0, 4)).toBe("glTF");
});
