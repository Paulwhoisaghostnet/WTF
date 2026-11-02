import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const catalog = JSON.parse(
  readFileSync(new URL("../../../public/desktop/paul-tutorials/catalog.json", import.meta.url), "utf8")
);

async function setTutorialPlayer(request) {
  const response = await request.post("/__test/state", {
    data: {
      userRole: "contestant",
      username: "paul-tutorial-player",
      welcomePending: false,
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function loggedTutorialEvents(request) {
  const state = await (await request.get("/__test/state")).json();
  return state.interactionLog.filter((event) =>
    ["faq.tutorial.selected", "faq.tutorial.played", "faq.tutorial.completed"].includes(event.eventType)
  );
}

test.describe("interaction inventory - Paul tutorial series", () => {
  test("the first-entry welcome leads directly to Paul's step-by-step videos", async ({
    page,
    request,
  }) => {
    const response = await request.post("/__test/state", {
      data: {
        userRole: "contestant",
        username: "paul-first-timer",
        welcomePending: true,
      },
    });
    expect(response.ok()).toBeTruthy();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const welcome = page.getByRole("dialog");
    const openGuide = welcome.getByRole("button", { name: "Watch Paul's step-by-step videos" });
    const guideBox = await openGuide.boundingBox();
    expect(guideBox?.y).toBeGreaterThanOrEqual(0);
    expect(guideBox.y + guideBox.height).toBeLessThanOrEqual(844);
    await openGuide.click();
    await page.waitForURL((url) => url.pathname === "/faq");
    await expect(welcome).toHaveCount(0);
    await expect(page.locator('[data-paul-tutorial-series="true"]')).toBeVisible();
    const chooser = page.locator('[data-paul-tutorial-mobile-chooser="true"]');
    await expect(chooser).toBeVisible();
    const chooserBox = await chooser.boundingBox();
    expect(chooserBox?.y).toBeGreaterThanOrEqual(0);
    expect(chooserBox.y + chooserBox.height).toBeLessThanOrEqual(844);
    await expect.poll(async () => {
      const state = await (await request.get("/__test/state")).json();
      return state.interactionLog.some((event) => event.eventType === "auth.welcome.completed");
    }).toBe(true);
  });

  test("every episode has a playable, captioned walkthrough and a route to try", async ({
    page,
    request,
  }) => {
    await setTutorialPlayer(request);
    await page.goto("/faq", { waitUntil: "domcontentloaded" });

    const series = page.locator('[data-paul-tutorial-series="true"]');
    await expect(series).toBeVisible();
    await expect(series.locator('[data-paul-tutorial-mobile-chooser="true"]')).toBeHidden();
    await expect(series.locator("[data-paul-tutorial-card]")).toHaveCount(catalog.length);

    for (const episode of catalog) {
      const card = series.locator(`[data-paul-tutorial-card="${episode.slug}"]`);
      await card.click();
      await expect(card).toHaveAttribute("aria-pressed", "true");
      const video = series.locator(`[data-paul-tutorial-player="${episode.slug}"]`);
      await expect(video).toBeVisible();
      await expect(video.locator('source[type="video/mp4"]')).toHaveAttribute("src", episode.videoUrl);
      await expect(video.locator('track[kind="captions"]')).toHaveAttribute("src", episode.captionsUrl);
      await expect(video).toHaveAttribute("poster", episode.posterUrl);
      await expect(series.locator(`[data-paul-tutorial-steps="${episode.slug}"] li`)).toHaveCount(
        episode.steps.length
      );
      await video.evaluate((player) => player.load());
      await expect.poll(() => video.evaluate((player) =>
        player.readyState >= 1 && Number.isFinite(player.duration) && player.duration > 0))
        .toBe(true);
      const poster = await request.get(episode.posterUrl);
      const captions = await request.get(episode.captionsUrl);
      expect(poster.ok(), `${episode.slug} poster`).toBeTruthy();
      expect(captions.ok(), `${episode.slug} captions`).toBeTruthy();
      expect(await captions.text()).toContain("WEBVTT");
    }

    await series.locator(`[data-paul-tutorial-card="${catalog[0].slug}"]`).click();
    await series.locator(`[data-paul-tutorial-next="${catalog[1].slug}"]`).click();
    await expect(series.locator(`[data-paul-tutorial-card="${catalog[1].slug}"]`))
      .toHaveAttribute("aria-pressed", "true");

    const chosen = catalog.find((episode) => episode.route === "/mission-control") ?? catalog[0];
    await series.locator(`[data-paul-tutorial-card="${chosen.slug}"]`).click();
    await series.getByText("Read the full video transcript").click();
    await expect(series.locator("details p")).toHaveText(chosen.transcript);

    const player = series.locator(`[data-paul-tutorial-player="${chosen.slug}"]`);
    await player.evaluate(async (video) => {
      video.muted = true;
      await video.play();
    });
    await expect.poll(async () => (await loggedTutorialEvents(request)).some((event) =>
      event.eventType === "faq.tutorial.played" &&
      event.metadata?.tutorialSlug === chosen.slug &&
      event.metadata?.series === "paulwhoisaclippy"
    )).toBe(true);
    await player.evaluate((video) => {
      video.currentTime = Math.max(0, video.duration - 0.3);
    });
    await expect.poll(async () => (await loggedTutorialEvents(request)).some((event) =>
      event.eventType === "faq.tutorial.completed" &&
      event.metadata?.tutorialSlug === chosen.slug &&
      event.metadata?.series === "paulwhoisaclippy"
    )).toBe(true);

    await series.getByRole("button", { name: "Try this in wtfOS" }).click();
    await page.waitForURL((url) => url.pathname === chosen.route);
  });

  test("episodes and player remain reachable in a narrow Help window", async ({ page, request }) => {
    await setTutorialPlayer(request);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/faq", { waitUntil: "domcontentloaded" });

    const series = page.locator('[data-paul-tutorial-series="true"]');
    await expect(series).toBeVisible();
    const last = catalog.at(-1);
    const chooser = series.locator('[data-paul-tutorial-mobile-chooser="true"]');
    await expect(chooser).toBeVisible();
    await expect(chooser.locator("option")).toHaveCount(catalog.length);
    const chooserBox = await chooser.boundingBox();
    expect(chooserBox?.y).toBeGreaterThanOrEqual(0);
    expect(chooserBox.y + chooserBox.height).toBeLessThanOrEqual(844);
    await chooser.selectOption(last.slug);
    const card = series.locator(`[data-paul-tutorial-card="${last.slug}"]`);
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(series.locator(`[data-paul-tutorial-player="${last.slug}"]`)).toBeVisible();
    await expect(series.getByRole("button", { name: "Try this in wtfOS" })).toBeVisible();
    await expect(page.locator('[data-reggie-assistant="true"]')).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await series.getByRole("button", { name: "Try this in wtfOS" }).click();
    await page.waitForURL((url) => url.pathname === last.route);
    await expect(page.locator('[data-reggie-assistant="true"]')).toBeVisible();
  });

  test("trying the desktop episode returns to the desktop", async ({ page, request }) => {
    await setTutorialPlayer(request);
    await page.goto("/faq", { waitUntil: "domcontentloaded" });
    const desktop = catalog.find((episode) => episode.route === "/");
    expect(desktop).toBeTruthy();
    const series = page.locator('[data-paul-tutorial-series="true"]');
    await series.locator(`[data-paul-tutorial-card="${desktop.slug}"]`).click();
    await series.getByRole("button", { name: "Try this in wtfOS" }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(series).toBeHidden();
    await expect(page.getByRole("button", { name: "Open Stuffs menu" })).toBeVisible();
  });
});
