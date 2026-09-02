import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const faqTutorials = require("../../../shared/faq-tutorials.json");
const promos = require("../../../shared/wtfos-promos.json");

async function useTommyTezos(page) {
  await page.request.post("/__test/state", {
    data: {
      mode: "normal",
      userRole: "admin",
      userId: 42,
      username: "TommyTezos",
      displayName: "TommyTezos",
    },
  });
}

test("wtfOS Guide TV contains only promos and TommyTezos FAQ videos", async ({ page }) => {
  await useTommyTezos(page);

  const channelsResponse = await page.request.get("/api/tv/channels");
  expect(channelsResponse.ok()).toBeTruthy();
  const channels = await channelsResponse.json();
  const guideChannel = channels.find((channel) => channel.slug === "wtfos-guide-tv");
  expect(guideChannel).toMatchObject({ title: "wtfOS Guide TV", videosPerBumper: 0 });

  const streamResponse = await page.request.get(`/api/tv/channels/${guideChannel.id}/stream`);
  expect(streamResponse.ok()).toBeTruthy();
  const stream = await streamResponse.json();
  expect(stream.scheduleLabel).toBeNull();
  expect(stream.queue).toHaveLength(promos.length + faqTutorials.length);
  expect(stream.queue.every((item) => /^\/api\/faq\/(?:promos|tutorials)\//.test(item.sourceUri)))
    .toBeTruthy();
  expect(stream.queue.every((item) => item.addedByUsername === "TommyTezos")).toBeTruthy();

  await page.goto("/tv");
  await page.getByRole("button", { name: "Turn TV power on" }).click();
  await page.getByRole("button", { name: "Open TV menu" }).click();
  await page.getByText("CHANNELS", { exact: true }).click();
  await page.getByText("wtfOS Guide TV", { exact: true }).click();
  await expect(page.locator('[data-tv-region="osd"]')).toContainText("CH 77");
});

test("canonical TV explains a broken clip, reports it, and advances to healthy media", async ({
  page,
}) => {
  await useTommyTezos(page);

  const channel = {
    id: 53,
    ownerUserId: 42,
    slug: "resilience-proof",
    title: "Resilience Proof",
    description: "Synthetic broken-clip recovery channel",
    isPublic: true,
    ownerUsername: "TommyTezos",
    ownerDisplayName: "TommyTezos",
    dialNumber: 53,
    videosPerBumper: 0,
  };
  const brokenItem = {
    queueIndex: 0,
    playlistIndex: 0,
    itemId: 701,
    videoId: 701,
    title: "Broken Clip",
    mimeType: "video/mp4",
    thumbnailUri: null,
    sourceUri: "",
    cacheUrl: "/__test/tv/broken.mp4",
    durationSeconds: 30,
    assetDurationSeconds: 30,
    offsetSeconds: 0,
    kind: "video",
  };
  const recoveryItem = {
    queueIndex: 1,
    playlistIndex: 1,
    itemId: 702,
    videoId: 702,
    title: "Recovery Clip",
    mimeType: "text/html",
    thumbnailUri: null,
    sourceUri: "/__test/tv/recovery",
    cacheUrl: "/__test/tv/recovery",
    durationSeconds: 30,
    assetDurationSeconds: 30,
    offsetSeconds: 0,
    kind: "embed",
  };
  const telemetryPayloads = [];

  await page.route(/\/api\/tv\/channels(?:\?[^#]*)?$/, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([channel]),
    });
  });
  await page.route("**/api/tv/channels/53/stream", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        channel,
        playlist: { id: 53, name: "Recovery queue", transitionSeconds: 0 },
        scheduleLabel: "LIVE",
        generatedAt: "2026-09-02T00:00:00.000Z",
        loopDurationSeconds: 60,
        queue: [brokenItem, recoveryItem],
        current: brokenItem,
        offline: false,
        message: null,
      }),
    });
  });
  await page.route("**/api/tv/bumpers/pool**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: "[]" });
  });
  await page.route("**/api/tv/telemetry/item-end", async (route) => {
    telemetryPayloads.push(JSON.parse(route.request().postData() || "{}"));
    await route.fulfill({ contentType: "application/json", body: '{"ok":true}' });
  });
  await page.route("**/api/tv/playback/events", async (route) => {
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: '{"kept":1}',
    });
  });
  await page.route("**/__test/tv/broken.mp4", async (route) => {
    await route.abort("failed");
  });
  await page.route("**/__test/tv/recovery", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body>Healthy recovery media</body></html>",
    });
  });

  await page.goto("/tv");
  await page.getByRole("button", { name: "Turn TV power on" }).click();

  await expect(page.getByRole("status")).toHaveText("Skipping broken clip...");
  await expect(page.locator('iframe[title="Recovery Clip"]')).toBeVisible();
  await expect.poll(() => telemetryPayloads.length).toBe(1);
  expect(telemetryPayloads[0]).toMatchObject({
    videoId: 701,
    bumperId: null,
    reason: "error",
  });
  expect(telemetryPayloads[0].sessionId).toEqual(expect.any(String));
  expect(telemetryPayloads[0].sessionId.length).toBeGreaterThan(0);
});
