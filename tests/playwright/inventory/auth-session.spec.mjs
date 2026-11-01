import { expect, test } from "@playwright/test";

async function setHarnessState(request, state = {}) {
  const res = await request.post("/__test/state", { data: state });
  expect(res.ok()).toBeTruthy();
}

async function harnessEventTypes(request) {
  const state = await (await request.get("/__test/state")).json();
  return state.interactionLog.map((event) => event.eventType);
}

test.describe("interaction inventory - auth session recovery", () => {
  test("classic welcome and help expose the same commissioned task map", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, {
      userRole: "contestant",
      username: "firsttimer",
      displayName: "First Timer",
      welcomePending: true,
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const welcome = page.getByRole("dialog");
    const welcomeVideo = welcome.getByLabel("paulwhoisaclippy's welcome and wtfOS navigation video");
    await expect(welcomeVideo).toBeVisible();
    await expect(welcomeVideo.locator('source[type="video/mp4"]')).toHaveAttribute(
      "src",
      "/desktop/paulwhoisaclippy-welcome.mp4"
    );
    await expect(welcomeVideo.locator('track[kind="captions"]')).toHaveAttribute(
      "src",
      "/desktop/paulwhoisaclippy-welcome.vtt"
    );
    await expect
      .poll(() => welcomeVideo.evaluate((video) => video.readyState >= 1 && video.duration > 40))
      .toBe(true);
    await expect(welcome.getByRole("button", { name: "Open Mission Control" })).toBeVisible();
    await expect(welcome.getByRole("button", { name: "Skip and enter desktop" })).toBeVisible();

    await welcome.getByText("More places to go", { exact: true }).click();
    for (const label of ["Play", "Create", "Shop", "Events", "Talk"]) {
      const taskButton = welcome.getByRole("button", { name: label });
      await expect(taskButton).toBeVisible();
      const taskBox = await taskButton.boundingBox();
      expect(taskBox?.height).toBeGreaterThanOrEqual(78);
    }

    await welcome.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/create$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => harnessEventTypes(request)).toContain("auth.welcome.completed");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/faq", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Replay paulwhoisaclippy's welcome" }).click();
    await expect(page.getByLabel("paulwhoisaclippy's welcome and wtfOS navigation video")).toBeVisible();
    const helpTaskMap = page
      .getByRole("heading", { name: "What do you want to do?" })
      .locator("..");
    await expect(helpTaskMap).toBeVisible();
    for (const label of ["Play", "Create", "Shop", "Events", "Talk"]) {
      const taskButton = helpTaskMap.getByRole("button", { name: new RegExp(label) });
      await expect(taskButton).toBeVisible();
      const taskBox = await taskButton.boundingBox();
      expect(taskBox?.width).toBeGreaterThan(300);
      expect(taskBox?.height).toBeGreaterThanOrEqual(92);
    }
  });

  test("welcome 401 clears stale cached user instead of trapping the modal", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, {
      userRole: "admin",
      username: "cobwebsaints",
      displayName: "Cobweb Saints",
      welcomePending: true,
      welcomeCompleteUnauthorized: true,
    });

    const walletWarnings = [];
    page.on("console", (message) => {
      const text = message.text();
      if (text.includes("[WTF] wallet link attempt failed")) {
        walletWarnings.push(text);
      }
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });

    const welcome = page.getByRole("dialog");
    await expect(welcome).toContainText("Welcome to wtfOS, cobwebsaints");

    await expect(welcome.getByLabel("paulwhoisaclippy's welcome and wtfOS navigation video")).toBeVisible();
    await welcome.getByRole("button", { name: "Skip and enter desktop" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();
    await expect(page.getByText("Not authenticated")).toHaveCount(0);
    await expect
      .poll(() => harnessEventTypes(request))
      .toContain("auth.session.invalidated");
    expect(walletWarnings).toEqual([]);
  });

  test("first welcome opens Mission Control and does not repeat after completion", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, {
      userRole: "contestant",
      username: "new-player",
      welcomePending: true,
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const welcome = page.getByRole("dialog");
    await expect(welcome.getByLabel("paulwhoisaclippy's welcome and wtfOS navigation video")).toBeVisible();
    await welcome.getByRole("button", { name: "Open Mission Control" }).click();
    await expect(page).toHaveURL(/\/mission-control$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const state = await (await request.get("/__test/state")).json();
    expect(state.interactionLog.filter((event) => event.eventType === "auth.welcome.completed")).toHaveLength(1);
  });

  test("the welcome also appears on a direct full-screen wtfOS entry", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, {
      userRole: "contestant",
      username: "direct-entry",
      welcomePending: true,
    });

    await page.goto("/gamma", { waitUntil: "domcontentloaded" });
    const welcome = page.getByRole("dialog");
    await expect(welcome.getByLabel("paulwhoisaclippy's welcome and wtfOS navigation video")).toBeVisible();
    await welcome.getByRole("button", { name: "Skip and enter desktop" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => harnessEventTypes(request)).toContain("auth.welcome.completed");
  });

  test("the first challenge action remains visible with today's GM artwork", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, {
      userRole: "contestant",
      username: "gm-new-player",
      welcomePending: true,
      gmWelcome: {
        shouldShow: true,
        utcDay: "2026-11-01",
        projectId: 1,
        projectName: "WTF Gallery",
        collectionUrl: "https://example.com/gallery",
        authorName: "Example Artist",
        authorAddress: "tz1example",
        asset: {
          id: "paul-example",
          name: "The Ghost",
          onChainId: null,
          iteration: null,
          imageUrl: "/desktop/paulwhoisaclippy.svg",
          width: 720,
          height: 720,
        },
      },
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const welcome = page.getByRole("dialog");
    await expect(welcome.getByText("Today's GM artwork")).toBeVisible();
    const missionAction = welcome.getByRole("button", { name: "Open Mission Control" });
    await expect(missionAction).toBeInViewport();
  });

  test("Casino app pass exposes the launcher while membership stays fail-closed", async ({
    page,
    request,
  }) => {
    await setHarnessState(request, {
      userRole: "contestant",
      username: "casino-pass-holder",
      casinoAppPassOwned: true,
      casinoCanEnter: false,
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open Stuffs menu" }).click();
    await page.getByText("Games", { exact: true }).last().click();

    const casinoItem = page.getByText("WTF Casino", { exact: true }).locator("..");
    await expect(casinoItem).toBeVisible();
    await expect(casinoItem).toHaveAttribute("title", "Casino membership card required");
    await casinoItem.click();
    await expect(page).toHaveURL(/\/$/);
  });
});
