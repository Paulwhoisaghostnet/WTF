import { expect, test } from "@playwright/test";

async function desktopLaunchCount(request, objectId) {
  const state = await (await request.get("/__test/state")).json();
  return state.interactionLog.filter(
    (event) => event.eventType === "desktop.icon.opened" && event.objectId === objectId
  ).length;
}

test.describe("interaction inventory - desktop launch gestures", () => {
  test("desktop shows the distinct accounts signed in during the last 30 days", async ({ page, request }) => {
    const reset = await request.post("/__test/state", { data: { userRole: "admin", welcomePending: false } });
    expect(reset.ok()).toBeTruthy();

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const panel = page.locator('[aria-label="Distinct accounts signed in to wtfOS in the last 30 days"]');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("desktop-login-account-count")).toHaveText("42");
    await expect(panel).toContainText("Last 30 days");
  });

  test("desktop reports unavailable when the login count request fails", async ({ page, request }) => {
    const reset = await request.post("/__test/state", { data: { userRole: "admin", welcomePending: false } });
    expect(reset.ok()).toBeTruthy();
    await page.route("**/api/desktop/login-accounts-30d", (route) =>
      route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Unavailable"}' })
    );

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const panel = page.locator('[aria-label="Distinct accounts signed in to wtfOS in the last 30 days"]');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId("desktop-login-account-count")).toHaveText("—");
    await expect(panel).toContainText("Unavailable");
  });

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
