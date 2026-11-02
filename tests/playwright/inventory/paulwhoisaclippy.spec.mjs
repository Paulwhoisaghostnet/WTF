import { expect, test } from "@playwright/test";

async function enterDesktop(page, request) {
  const response = await request.post("/__test/state", {
    data: { userRole: "contestant", username: "ghost-visitor", welcomePending: false },
  });
  expect(response.ok()).toBeTruthy();
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

test.describe("interaction inventory - paulwhoisaclippy", () => {
  test("the red-glasses ghost haunts open desktop space and whispers on click", async ({
    page,
    request,
  }) => {
    await enterDesktop(page, request);

    const paul = page.getByRole("button", {
      name: "paulwhoisaclippy, the desktop ghost",
    });
    await expect(paul).toBeVisible();
    await expect(paul).toContainText("paulwhoisaclippy");
    await expect(paul.locator("img")).toHaveAttribute(
      "src",
      "/desktop/paulwhoisaclippy.svg?v=ghost-red-glasses-20261102"
    );
    await expect
      .poll(() => paul.locator("img").evaluate((image) => image.complete && image.naturalWidth > 0))
      .toBe(true);

    await paul.click();
    const whisper = page.locator('[data-desktop-ambient="paulwhoisaclippy"] [role="status"]');
    await expect(whisper).toContainText("paulwhoisaclippy");
    await expect
      .poll(async () => {
        const state = await (await request.get("/__test/state")).json();
        return state.interactionLog.some(
          (event) =>
            event.eventType === "desktop.object.clicked" &&
            event.objectId === "paulwhoisaclippy" &&
            event.objectKind === "ambient_ghost"
        );
      })
      .toBe(true);

    await paul.press("Escape");
    await expect(whisper).toHaveCount(0);

    const missionControl = page.locator('[data-desktop-icon-key="mission-control"]');
    await expect(missionControl).toBeVisible();
    await missionControl.click();
    await expect(page).toHaveURL(/\/mission-control$/);
  });

  test("Paul stays within narrow wallpaper space and honors reduced motion", async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await enterDesktop(page, request);

    const paul = page.getByRole("button", {
      name: "paulwhoisaclippy, the desktop ghost",
    });
    await expect(paul).toBeVisible();

    const sprite = await paul.boundingBox();
    const content = await page.locator('[data-wtf-desktop-content="true"]').boundingBox();
    expect(sprite).not.toBeNull();
    expect(content).not.toBeNull();
    expect(sprite.x).toBeGreaterThanOrEqual(content.x);
    expect(sprite.y).toBeGreaterThanOrEqual(content.y);
    expect(sprite.x + sprite.width).toBeLessThanOrEqual(content.x + content.width);
    expect(sprite.y + sprite.height).toBeLessThanOrEqual(content.y + content.height);

    const overlappingIcons = await page.locator('[data-desktop-icon-root="true"]').evaluateAll(
      (icons, box) => icons.filter((icon) => {
        const rect = icon.getBoundingClientRect();
        return box.x < rect.right && box.x + box.width > rect.left &&
          box.y < rect.bottom && box.y + box.height > rect.top;
      }).length,
      sprite
    );
    expect(overlappingIcons).toBe(0);
    await expect(paul.locator("img")).toHaveCSS("animation-name", "none");
  });
});
