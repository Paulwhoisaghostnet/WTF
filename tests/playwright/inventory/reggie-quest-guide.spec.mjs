import { expect, test } from "@playwright/test";

const QUEST = {
  questComplete: false,
  completedCount: 0,
  totalCount: 2,
  finale: null,
  steps: [
    {
      id: 1,
      seedKey: "reggie_profile_v1",
      stepKey: "profile",
      title: "Set up your profile",
      description: "Add a display name to your profile.",
      route: "/profile",
      actionLabel: "Open Profile",
      anchorId: "profile",
      category: "identity",
      order: 1,
      prereqStepKeys: [],
      rewards: { xp: 10, wtf: 0 },
      status: "available",
      completedAt: null,
    },
    {
      id: 2,
      seedKey: "reggie_wallet_v1",
      stepKey: "wallet",
      title: "Connect a Tezos wallet",
      description: "Connect a wallet after your profile is ready.",
      route: "/profile",
      actionLabel: "Open Profile",
      anchorId: "profile",
      category: "identity",
      order: 2,
      prereqStepKeys: ["profile"],
      rewards: { xp: 20, wtf: 0 },
      status: "locked",
      completedAt: null,
    },
  ],
};

async function enterWithQuest(page, request) {
  const response = await request.post("/__test/state", {
    data: {
      userRole: "contestant",
      username: "quest-guide-player",
      welcomePending: false,
    },
  });
  expect(response.ok()).toBeTruthy();

  await page.route("**/api/reggie/quest", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(QUEST) })
  );
  await page.route("**/api/reggie/messages", (route) =>
    route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, conversationId: 41 }) })
  );
  const questResponse = page.waitForResponse((result) =>
    new URL(result.url()).pathname === "/api/reggie/quest" && result.status() === 200
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await questResponse;
  return page.getByRole("button", { name: "Reggie the quest guide hamster" });
}

test.describe("interaction inventory - Reggie quest guide", () => {
  for (const role of ["witness", "admin"]) {
    test(`${role} accounts do not see or summon Reggie`, async ({ page, request }) => {
      const response = await request.post("/__test/state", {
        data: { userRole: role, username: `reggie-${role}`, welcomePending: false },
      });
      expect(response.ok()).toBeTruthy();

      let questRequests = 0;
      await page.route("**/api/reggie/quest", (route) => {
        questRequests += 1;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(QUEST) });
      });
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await expect(page.getByTitle(`reggie-${role}`)).toBeVisible();
      await expect(page.locator('[data-wtf-desktop-content="true"]')).toBeVisible();
      await expect(page.getByRole("button", { name: "Reggie the quest guide hamster" })).toHaveCount(0);
      await expect(page.getByRole("dialog", { name: "Reggie quest guide" })).toHaveCount(0);

      await page.locator('[data-wtf-desktop-content="true"]').click({
        button: "right",
        position: { x: 580, y: 420 },
      });
      await expect(page.getByText("Summon Reggie", { exact: true })).toHaveCount(0);
      expect(questRequests).toBe(0);
    });
  }

  test("Paul's Help replay introduces Reggie's quest role", async ({ page, request }) => {
    const response = await request.post("/__test/state", {
      data: { userRole: "contestant", username: "paul-and-reggie-player", welcomePending: false },
    });
    expect(response.ok()).toBeTruthy();
    await page.goto("/faq", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Replay paulwhoisaclippy's welcome" }).click();
    await page.getByText("Read the navigation steps", { exact: true }).click();
    await expect(page.getByText(/Reggie tracks your progress along the Reggie quest path/)).toBeVisible();
    await expect(page.getByText(/Paul explains how the desktop works/)).toBeVisible();

    const captions = await request.get("/desktop/paulwhoisaclippy-welcome.vtt");
    expect(captions.ok()).toBeTruthy();
    expect(await captions.text()).toMatch(/Reggie, your quiet quest guide/i);
  });

  test("Reggie stays quiet until asked and offers only quest guidance", async ({ page, request }) => {
    await page.clock.install();
    const reggie = await enterWithQuest(page, request);
    await expect(reggie).toBeVisible();
    const bubble = page.getByRole("dialog", { name: "Reggie quest guide" });
    await expect(bubble).toHaveCount(0);

    // The former nag interval opened a speech bubble after four minutes.
    await page.clock.fastForward(4 * 60 * 1000 + 1000);
    await expect(bubble).toHaveCount(0);
    const idleState = await (await request.get("/__test/state")).json();
    expect(idleState.interactionLog.some((event) =>
      event.eventType === "reggie.message.sent" || event.objectId === "reggie.nag"
    )).toBe(false);

    await reggie.click({ force: true });
    await expect(bubble).toBeVisible();
    await expect(bubble).toContainText(/Profile|display name/i);
    await expect(bubble.getByRole("button", { name: "What's next?" })).toBeVisible();
    await expect(bubble.getByRole("button", { name: "Take me there" })).toBeVisible();
    await expect(bubble.getByRole("button", { name: "Check progress" })).toBeVisible();
    await expect(bubble.getByRole("button", { name: "Quest HQ" })).toBeVisible();
    await expect(bubble.getByRole("textbox")).toHaveCount(0);
    await expect(bubble.getByRole("button", { name: "Ask", exact: true })).toHaveCount(0);
    await expect(bubble.getByTitle("Snooze Reggie for 10 minutes")).toBeVisible();

    await bubble.getByTitle("Quest log").click();
    await expect(bubble).toContainText("Connect a Tezos wallet");
    await bubble.getByRole("button", { name: /Connect a Tezos wallet/ }).click();
    await expect(bubble).toContainText("Connect a Tezos wallet");
    await expect(bubble.getByRole("textbox")).toHaveCount(0);

    const state = await (await request.get("/__test/state")).json();
    expect(state.interactionLog.some((event) => event.eventType === "reggie.question.asked")).toBe(false);
    expect(state.interactionLog.some((event) => event.objectId === "reggie.nag")).toBe(false);

    await bubble.getByTitle("Snooze Reggie for 10 minutes").click();
    await expect(reggie).toHaveCount(0);
    await page.clock.fastForward(10 * 60 * 1000 + 1000);
    await expect(reggie).toBeVisible();
    await expect(bubble).toHaveCount(0);
  });

  test("Reggie can be hidden, summoned, and lead the player to an active quest", async ({ page, request }) => {
    const reggie = await enterWithQuest(page, request);
    await expect(reggie).toBeVisible();
    await reggie.click({ force: true });
    const bubble = page.getByRole("dialog", { name: "Reggie quest guide" });
    await expect(bubble.getByRole("button", { name: "Take me there" })).toBeVisible();

    await bubble.getByTitle("Hide Reggie until summoned").click();
    await expect(reggie).toHaveCount(0);
    await page.locator('[data-wtf-desktop-content="true"]').click({
      button: "right",
      position: { x: 580, y: 420 },
    });
    await page.getByText("Summon Reggie", { exact: true }).click();
    await expect(reggie).toBeVisible();
    await expect(bubble).toBeVisible();
    await expect(bubble.getByRole("textbox")).toHaveCount(0);

    await bubble.getByRole("button", { name: "What's next?" }).click();
    await expect(bubble.getByRole("button", { name: "Take me there" })).toBeVisible();
    await bubble.getByRole("button", { name: "Take me there" }).click();
    await page.waitForURL((url) => url.pathname === "/profile");

    const state = await (await request.get("/__test/state")).json();
    expect(state.interactionLog.some((event) => event.eventType === "reggie.assistant.summoned")).toBe(true);
    expect(state.interactionLog.some((event) => event.eventType === "reggie.assistant.dismissed")).toBe(true);
  });
});
