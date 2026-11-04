import { expect, test } from "@playwright/test";

const welcomeBody = [
  "Welcome to wtfOS. Here are a few easy first steps:",
  "1. Open Profile and make it yours with a name and avatar.",
  "2. In Profile, verify a Tezos wallet or a social account to prove the identity you want to use.",
  "3. Open Mission Control to find verified actions that can earn EXP. Your EXP tier and title update as you progress.",
  "4. When the Green Room is active and you meet its milestones, completing it can unlock the contestant role and more challenges.",
  "Find the rest of your apps in Stuffs on the bottom bar. Click Paul if you need help using the desktop.",
].join("\n");

async function mountStarterWelcome(page, request) {
  const reset = await request.post("/__test/state", {
    data: {
      userRole: "witness",
      userId: 2,
      username: "new-starter",
      displayName: "New Starter",
      welcomePending: false,
    },
  });
  expect(reset.ok()).toBeTruthy();
  const settings = await (await request.get("/api/desktop/settings")).json();
  let unread = true;
  let historyFetches = 0;
  let explicitReads = 0;
  const receivedAt = "2026-11-03T12:00:00.000Z";
  const reply = (route, data) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(data),
  });

  await page.route("**/api/desktop/settings", (route) => reply(route, {
    ...settings,
    appearance: { ...settings.appearance, desktopIconMode: "starter" },
  }));
  await page.route("**/api/comms/unread-count", (route) => reply(route, {
    total: unread ? 1 : 0,
    dms: unread ? 1 : 0,
    notifications: 0,
    mail: 0,
    adminInbox: 0,
  }));
  await page.route(/\/api\/messages\/dms(?:\?.*)?$/, (route) => reply(route, [{
    id: 501,
    title: "WTF Admin",
    conversationType: "direct",
    lastMessageAt: receivedAt,
    unreadCount: unread ? 1 : 0,
    peers: [{ id: 1, userId: 1, username: "wtf-admin", displayName: "WTF Admin" }],
    latestMessage: {
      id: 7001,
      senderId: 1,
      content: welcomeBody,
      createdAt: receivedAt,
    },
  }]));
  await page.route(/\/api\/messages\/dms\/501\/messages(?:\?.*)?$/, (route) => {
    historyFetches += 1;
    unread = false; // The production GET marks this participant read.
    return reply(route, [{
      id: 7001,
      conversationId: 501,
      senderId: 1,
      username: "wtf-admin",
      displayName: "WTF Admin",
      content: welcomeBody,
      messageType: "text",
      metadata: { source: "wtfos-starter-welcome", system: true },
      createdAt: receivedAt,
    }]);
  });
  await page.route("**/api/messages/dms/501/read", (route) => {
    explicitReads += 1;
    unread = false;
    return reply(route, { ok: true });
  });
  await page.route(/\/api\/messages\/users(?:\?.*)?$/, (route) => reply(route, [{
    id: 1,
    username: "wtf-admin",
    displayName: "WTF Admin",
    role: "admin",
    online: true,
    presenceStatus: "active",
  }]));
  await page.route(/\/api\/comms\/items(?:\?.*)?$/, (route) => reply(route, { items: [] }));
  await page.route("**/api/mail/status", (route) => reply(route, { eligible: false, mailbox: null }));
  await page.route("**/api/mail/messages", (route) => reply(route, { messages: [] }));
  await page.route(/\/api\/notifications(?:\?.*)?$/, (route) => reply(route, { items: [], unreadCount: 0 }));
  await page.route("**/api/admin-inbox/threads", (route) => reply(route, { messages: [], unreadCount: 0 }));

  return {
    historyFetches: () => historyFetches,
    explicitReads: () => explicitReads,
  };
}

test.describe("interaction inventory - starter welcome WIM message", () => {
  test("Inbox keeps the welcome unread until its card is opened and shows every first step", async ({ page, request }) => {
    const dm = await mountStarterWelcome(page, request);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const inboxIcon = page.locator('[data-desktop-icon-key="mail"]');
    await expect(inboxIcon).toBeVisible();
    await expect(inboxIcon.getByLabel("1 unread messages")).toBeVisible();
    await inboxIcon.dblclick();

    const inbox = page.locator('[data-mail-surface="inbox"]');
    await expect(inbox).toBeVisible();
    const welcomeCard = inbox.getByRole("button", { name: "Open WIM message: WTF Admin" });
    await expect(welcomeCard).toContainText("Welcome to wtfOS");
    await expect(welcomeCard.locator("..")).toHaveAttribute("data-mail-active", "true");
    await expect(inboxIcon.getByLabel("1 unread messages")).toBeVisible();
    expect(dm.historyFetches(), "Inbox preview must not consume the unread DM").toBe(0);
    expect(dm.explicitReads()).toBe(0);

    await welcomeCard.click();
    await expect(inbox).toContainText("verify a Tezos wallet or a social account");
    await expect(inbox).toContainText("verified actions that can earn EXP");
    await expect(inbox).toContainText("Green Room is active and you meet its milestones");
    await expect(inbox).toContainText("Click Paul if you need help");
    await expect.poll(dm.historyFetches).toBeGreaterThan(0);
    await expect.poll(dm.explicitReads).toBe(1);
    await expect(inboxIcon.getByLabel("1 unread messages")).toHaveCount(0);
  });

  test("WIM shows the admin's unread welcome and opens its complete message", async ({ page, request }) => {
    const dm = await mountStarterWelcome(page, request);
    await page.goto("/wim", { waitUntil: "domcontentloaded" });

    const buddyWindow = page.locator('[data-wim-window-kind="buddy"]');
    await expect(buddyWindow).toBeVisible();
    await expect(buddyWindow).toContainText("Unread");
    await expect(buddyWindow.getByText("1", { exact: true }).last()).toBeVisible();
    const popup = page.locator('[data-wim-offline-popup="true"]');
    await expect(popup).toContainText("Instant Message from WTF Admin");
    await expect(popup).toContainText("1 unread");
    expect(dm.historyFetches(), "WIM roster must not consume the unread DM").toBe(0);

    await popup.getByRole("button", { name: "Open WIM message from WTF Admin" }).click();
    const chat = page.locator('[data-wim-window-kind="chat"]');
    await expect(chat).toBeVisible();
    await expect(chat.getByRole("log", { name: /WIM messages with WTF Admin/ })).toContainText(
      "verify a Tezos wallet or a social account"
    );
    await expect(chat).toContainText("contestant role and more challenges");
    await expect.poll(dm.historyFetches).toBeGreaterThan(0);
  });
});
