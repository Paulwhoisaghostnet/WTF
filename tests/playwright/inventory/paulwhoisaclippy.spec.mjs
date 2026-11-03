import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const atlas = JSON.parse(
  readFileSync(new URL("../../../public/desktop/paulwhoisaclippy-poses.json", import.meta.url), "utf8")
);
const poseUrl = `${atlas.imageUrl}?v=ghost-portrait-20261103`;

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
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await enterDesktop(page, request);

    const paul = page.getByRole("button", {
      name: "paulwhoisaclippy, the desktop ghost",
    });
    await expect(paul).toBeVisible();
    await expect(paul).toContainText("paulwhoisaclippy");
    expect(atlas.imageUrl).toBe("/desktop/paulwhoisaclippy-poses.svg");
    expect(atlas.frameHeight).toBeGreaterThan(atlas.frameWidth);
    expect(atlas.frameCount).toBe(90);
    expect(atlas.frames).toHaveLength(atlas.frameCount);
    expect(new Set(atlas.frames.map((frame) => frame.sha256)).size).toBe(atlas.frameCount);
    const pose = paul.locator('[data-paul-pose="true"]');
    await expect(pose).toBeVisible();
    expect(await pose.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain(poseUrl);
    const sheet = await page.evaluate(async (url) => {
      const image = new Image();
      image.src = url;
      await image.decode();
      return { width: image.naturalWidth, height: image.naturalHeight };
    }, poseUrl);
    expect(sheet).toEqual({ width: atlas.columns * atlas.frameWidth, height: atlas.rows * atlas.frameHeight });
    const portrait = await pose.boundingBox();
    expect(portrait).not.toBeNull();
    expect(portrait.height).toBeGreaterThan(portrait.width);
    const initialFrame = await pose.evaluate((element) => getComputedStyle(element).backgroundPosition);
    await expect
      .poll(() => pose.evaluate((element) => getComputedStyle(element).backgroundPosition))
      .not.toBe(initialFrame);

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
    const pose = paul.locator('[data-paul-pose="true"]');
    await expect(pose).toHaveCSS("animation-name", "none");
    await expect(pose).toHaveCSS("background-position", "0px 0px");
    const firstFrame = await pose.evaluate((element) => getComputedStyle(element).backgroundPosition);
    // The atlas runs at eight poses per second; this spans more than three pose intervals.
    await page.waitForTimeout(450);
    expect(await pose.evaluate((element) => getComputedStyle(element).backgroundPosition)).toBe(firstFrame);
  });
});
