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
