import { expect, test } from "@playwright/test";

async function desktopLaunchCount(request, objectId) {
  const state = await (await request.get("/__test/state")).json();
  return state.interactionLog.filter(
    (event) => event.eventType === "desktop.icon.opened" && event.objectId === objectId
  ).length;
}

test.describe("interaction inventory - desktop launch gestures", () => {
  test("a desktop double-click persists one app launch", async ({ page, request }) => {
    const reset = await request.post("/__test/state", { data: { userRole: "admin" } });
    expect(reset.ok()).toBeTruthy();

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const icon = page.locator('[data-desktop-icon-key="mission-control"]');
    await expect(icon).toBeVisible();

    await icon.dblclick();
    await expect.poll(() => desktopLaunchCount(request, "mission-control")).toBe(1);
  });
});
