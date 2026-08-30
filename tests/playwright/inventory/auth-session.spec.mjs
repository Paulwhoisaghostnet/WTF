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
    for (const label of ["Play", "Create", "Shop", "Events", "Talk"]) {
      await expect(welcome.getByRole("button", { name: label })).toBeVisible();
    }

    await welcome.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/game-studio$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => harnessEventTypes(request)).toContain("auth.welcome.completed");

    await page.goto("/faq", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "What do you want to do?" })).toBeVisible();
    for (const label of ["Play", "Create", "Shop", "Events", "Talk"]) {
      await expect(page.getByRole("button", { name: new RegExp(label) })).toBeVisible();
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

    await expect(welcome.getByRole("button", { name: "Play" })).toBeVisible();
    await expect(welcome.getByRole("button", { name: "Create" })).toBeVisible();
    await expect(welcome.getByRole("button", { name: "Shop" })).toBeVisible();
    await expect(welcome.getByRole("button", { name: "Events" })).toBeVisible();
    await expect(welcome.getByRole("button", { name: "Talk" })).toBeVisible();

    await welcome.getByRole("button", { name: "Explore Desktop" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Log In" })).toBeVisible();
    await expect(page.getByText("Not authenticated")).toHaveCount(0);
    await expect
      .poll(() => harnessEventTypes(request))
      .toContain("auth.session.invalidated");
    expect(walletWarnings).toEqual([]);
  });
});
