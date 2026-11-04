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
    await expect(panel).toContainText("Unique users served (30 days):");
    await expect(panel.getByTestId("desktop-login-account-count")).toHaveText("42");

    const desktop = await page.locator('[data-wtf-desktop-content="true"]').boundingBox();
    const sign = await panel.boundingBox();
    expect(desktop).not.toBeNull();
    expect(sign).not.toBeNull();
    expect(sign.y + sign.height).toBeLessThan(desktop.y + desktop.height / 2);
    expect(sign.x + sign.width / 2).toBeGreaterThan(desktop.x + desktop.width / 2);

    await page.setViewportSize({ width: 320, height: 640 });
    const narrowSign = await panel.boundingBox();
    const wastebasket = await page.locator('[data-desktop-icon-key="recycle-bin"]').boundingBox();
    const nextIconRow = await page.locator('[data-desktop-icon-key="wtfiam"]').boundingBox();
    expect(narrowSign).not.toBeNull();
    expect(wastebasket).not.toBeNull();
    expect(nextIconRow).not.toBeNull();
    expect(narrowSign.x).toBeGreaterThanOrEqual(wastebasket.x + wastebasket.width);
    expect(narrowSign.y + narrowSign.height).toBeLessThan(nextIconRow.y);
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
    await expect(panel).toContainText("Unique users served (30 days):");
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
