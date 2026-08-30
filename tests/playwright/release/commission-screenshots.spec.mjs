import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

const evidenceDirectory = resolve("artifacts/commission-2026-09/screenshots");

const journeys = [
  {
    id: "J-01",
    route: "/",
    state: { userRole: "contestant", welcomePending: true },
    ready: (page) => page.getByRole("dialog"),
  },
  {
    id: "J-02",
    route: "/wtfiam?category=desktop_fun",
    ready: (page) => page.locator('[data-wtfiam-surface="marketplace"]'),
    prepare: async (page) => {
      await page.getByRole("button", { name: "Sell something" }).click();
      await expect(page.getByLabel("Creator item name")).toBeVisible();
      await page.getByLabel("Creator item name").scrollIntoViewIfNeeded();
    },
  },
  {
    id: "J-03",
    route: "/wtfiam?category=desktop_fun",
    ready: (page) => page.locator('[data-wtfiam-surface="marketplace"]'),
  },
  {
    id: "J-04",
    route: "/game-studio",
    ready: (page) => page.locator('[data-game-studio-surface="workspace"]'),
  },
  {
    id: "J-05",
    route: "/arcade",
    ready: (page) => page.locator("[data-arcade-console-surface]"),
  },
  {
    id: "J-06",
    route: "/casino",
    state: { casinoCanEnter: true },
    ready: (page) => page.locator('[data-casino-region="practice-creator-desk"]'),
    prepare: async (page) => {
      await page.locator('[data-casino-region="practice-creator-desk"]').scrollIntoViewIfNeeded();
    },
  },
  {
    id: "J-07",
    route: "/casino",
    state: { casinoCanEnter: true },
    ready: (page) => page.locator('[data-casino-region="practice-notice"]'),
  },
  {
    id: "J-08",
    route: "/calendar",
    ready: (page) => page.locator('[data-calendar-surface="calendar"]'),
  },
  {
    id: "J-09",
    route: "/messages",
    ready: (page) => page.locator('[data-messages-surface="messages"]'),
  },
  {
    id: "J-10",
    route: "/create",
    ready: (page) => page.locator("[data-create-runway]"),
  },
  {
    id: "J-11",
    route: "/admin?section=overview",
    ready: (page) => page.locator("[data-admin-commission-queue]"),
  },
  {
    id: "J-12",
    route: "/faq",
    ready: (page) => page.getByRole("heading", { name: "What do you want to do?" }),
  },
];

for (const viewport of [
  { name: "desktop", width: 1280, height: 800 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`captures ${viewport.name} commission journey evidence`, async ({ page, request }) => {
    test.setTimeout(180_000);
    await mkdir(evidenceDirectory, { recursive: true });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    for (const journey of journeys) {
      const response = await request.post("/__test/state", {
        data: {
          mode: "normal",
          userRole: "admin",
          authUser: { id: 1, username: "wtf-admin", displayName: "WTF Admin" },
          username: "wtf-admin",
          displayName: "WTF Admin",
          welcomePending: false,
          casinoCanEnter: false,
          ...journey.state,
        },
      });
      expect(response.ok()).toBeTruthy();
      await page.goto(journey.route, { waitUntil: "domcontentloaded" });
      await expect(journey.ready(page)).toBeVisible();
      await journey.prepare?.(page);
      await page.screenshot({
        path: resolve(evidenceDirectory, `${journey.id}-${viewport.name}.png`),
        animations: "disabled",
      });
    }
  });
}
