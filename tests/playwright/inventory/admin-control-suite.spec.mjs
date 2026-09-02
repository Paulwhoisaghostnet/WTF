import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

async function setAdminState(request) {
  const response = await request.post("/__test/state", {
    data: {
      userRole: "admin",
      username: "wtf-admin",
      displayName: "WTF Admin",
      ownedAppPasses: "all",
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function openAdmin(page, path = "/admin?section=overview") {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-admin-surface="control-suite"]')).toBeVisible({ timeout: 30_000 });
}

test.describe("interaction inventory - admin broad and acute control suite", () => {
  test.beforeEach(async ({ request }) => {
    await setAdminState(request);
  });

  test("opens Automation against the production-shaped harness registry", async ({ page }) => {
    await openAdmin(page, "/admin?section=automation");

    await expect(page.getByText("Challenge automation registry", { exact: true })).toBeVisible();
    await expect(page.getByText("0 triggers", { exact: true })).toBeVisible();
    await expect(page.getByText("0 predicates", { exact: true })).toBeVisible();
    await expect(page.getByText("0 reward actions", { exact: true })).toBeVisible();
  });

  test("reviews every user by highest role and opens a complete WTF Passport", async ({ page, request }) => {
    await openAdmin(page, "/admin?section=users");

    const roster = page.getByRole("table", {
      name: "All users with highest assigned role and level",
    });
    await expect(roster).toBeVisible();
    for (const heading of ["User", "Highest role", "Level", "EXP", "Curses", "Signals"]) {
      await expect(roster.getByRole("columnheader", { name: heading })).toBeVisible();
    }
    await expect(roster.getByRole("row")).toHaveCount(4);
    await expect(roster).toContainText("Complaint User");
    await expect(roster).toContainText("Host");
    await expect(roster).toContainText("L80");
    await expect(page.locator("[data-admin-detail-pane]")).toBeHidden();
    const broadScope = await page.locator("[data-admin-scope-workspace]").evaluate((workspace) => ({
      workspaceWidth: workspace.getBoundingClientRect().width,
      scopeWidth: workspace.querySelector("[data-admin-scope-pane]")?.getBoundingClientRect().width ?? 0,
    }));
    expect(broadScope.scopeWidth).toBeGreaterThan(broadScope.workspaceWidth * 0.95);

    await page.getByRole("button", { name: "Open WTF Passport for complaint-user" }).click();
    await expect(page).toHaveURL(/section=users.*user=2/);
    const passport = page.locator('[data-admin-user-passport][data-admin-user-id="2"]');
    await expect(passport).toBeVisible();
    await expect(passport).toContainText("Complaint User · WTF Passport");
    await expect(passport).toContainText("Highest role · level 80");
    await expect(passport).toContainText("Account health");

    await page.mouse.move(480, 650);
    await page.waitForTimeout(100);
    const rendered = PNG.sync.read(await page.screenshot());
    for (const [x, y] of [[100, 100], [1100, 100]]) {
      const index = (rendered.width * y + x) << 2;
      const brightness = rendered.data[index] + rendered.data[index + 1] + rendered.data[index + 2];
      expect(brightness, `custom cursor compositor tile at ${x},${y}`).toBeGreaterThan(100);
    }

    await passport.getByRole("tab", { name: "Access & curses" }).click();
    await expect(passport).toContainText("Green Lens");
    await expect(passport).toContainText("Effective permissions");
    await expect(passport).toContainText("Effective wtfOS access");

    await passport.getByRole("tab", { name: "wtfOS settings" }).click();
    await expect(passport).toContainText("Complete settings snapshot");
    await passport.getByLabel("Color scheme").selectOption("arcade-carpet");
    const saveResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/users/2/passport/desktop-settings") &&
        response.request().method() === "PUT"
    );
    await passport.getByRole("button", { name: "Save wtfOS settings" }).click();
    await expect((await saveResponse).ok()).toBeTruthy();
    await expect(passport.getByLabel("Color scheme")).toHaveValue("arcade-carpet");

    await passport.getByRole("tab", { name: "Recovery" }).click();
    await expect(passport.getByText("Delete account", { exact: true })).toBeVisible();
    await expect(passport.getByText("Account deletion restricted", { exact: true })).toHaveCount(0);

    const state = await request.get("/__test/state").then((response) => response.json());
    expect(state.interactionLog.some((event) => event.eventType === "admin.user.passport.viewed")).toBe(true);
    expect(state.interactionLog.some((event) => event.eventType === "admin.user.desktop_settings.updated")).toBe(true);
  });

  test("uses sortable role and curse scopes before narrowing into assigned users", async ({ page }) => {
    await openAdmin(page, "/admin?section=roles");
    const roleTable = page.getByRole("table", {
      name: "Role catalog with access level and assigned user counts",
    });
    await expect(roleTable).toBeVisible();
    await expect(roleTable).toContainText("Admin");
    await expect(roleTable).toContainText("Host");
    await page.getByLabel("Search role catalog").fill("host");
    await expect(roleTable.getByRole("row")).toHaveCount(2);
    await roleTable.getByText("Host", { exact: true }).click();
    const assignedUsers = page.getByRole("table", { name: "Users assigned the Host role" });
    await expect(assignedUsers).toContainText("Complaint User");

    await page
      .getByRole("navigation", { name: "Admin suite panels" })
      .getByRole("button", { name: /^Curses\b/ })
      .click();
    await expect(page).toHaveURL(/section=curses/);
    const curseTable = page.getByRole("table", {
      name: "Curse definitions and active user assignment counts",
    });
    await expect(curseTable).toBeVisible();
    await expect(curseTable).toContainText("Green Lens");
    await curseTable.getByText("Green Lens", { exact: true }).click();
    await expect(page.locator('[data-admin-curse-detail="green_lens"]')).toBeVisible();
    await expect(page.getByRole("table", { name: "Users assigned Green Lens" })).toContainText("Complaint User");
  });

  test("help index ranks human symptoms and exposes the agent contract", async ({ page, request }) => {
    await openAdmin(page, "/admin?section=help");
    await expect(page.getByText("Exhaustive admin help index")).toBeVisible();
    const search = page.getByLabel("Search all admin help topics");
    await search.fill("screen is green");

    const topics = page.getByRole("table", { name: "Ranked admin help topics" });
    await expect(topics).toContainText("Green Lens");
    await topics.getByText("Green Lens", { exact: true }).click();
    const topic = page.locator('[data-admin-help-topic="curse:green_lens"]');
    await expect(topic).toContainText("Final WTF OS rendering is tinted green");
    await expect(topic.getByRole("button", { name: /Curses/ })).toBeVisible();
    await topic.getByRole("tab", { name: "Agent contract" }).click();
    await expect(topic).toContainText('"stableId": "curse:green_lens"');
    await expect(topic).toContainText("GET /api/admin/help-index");

    const apiResponse = await request.get("/api/admin/help-index?q=green%20lens");
    expect(apiResponse.ok()).toBeTruthy();
    const apiIndex = await apiResponse.json();
    expect(apiIndex.schemaVersion).toBe("1.0.0");
    expect(apiIndex.query).toBe("green lens");
    expect(apiIndex.topics.some((entry) => entry.id === "curse:green_lens")).toBe(true);
  });

  test("makes app registrations permanent and refreshes every app without changing launchers", async ({ page }) => {
    await openAdmin(page, "/admin?section=desktop-apps");

    const duesRow = page.getByRole("row").filter({ hasText: "dues-manager" });
    await expect(duesRow).toContainText("Hidden");

    const permanentCheckbox = page
      .getByRole("checkbox", {
        name: /license, docs, and install key do not expire/i,
      })
      .first();
    await expect(permanentCheckbox).not.toBeChecked();
    const permanenceResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/admin/apps/desktop/") &&
        !response.url().endsWith("/refresh-all") &&
        response.request().method() === "PUT",
    );
    await page
      .getByText("License, docs, and install key do not expire", { exact: true })
      .first()
      .click();
    await expect((await permanenceResponse).ok()).toBeTruthy();
    await expect(permanentCheckbox).toBeChecked();

    const bulkResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/admin/apps/desktop/refresh-all") &&
        response.request().method() === "POST",
    );
    await page
      .getByRole("button", { name: "Refresh all app registrations" })
      .click();
    await expect((await bulkResponse).ok()).toBeTruthy();
    await expect(page.getByRole("status")).toContainText(
      "app registrations refreshed",
    );
    await expect(duesRow).toContainText("Hidden");
  });

  test("shows a retryable error when app registrations cannot load", async ({ page }) => {
    let failRegistrationRead = true;
    await page.route("**/api/admin/apps/desktop", async (route) => {
      if (route.request().method() === "GET" && failRegistrationRead) {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({ error: "Database schema missing" }),
        });
        return;
      }
      await route.continue();
    });

    await openAdmin(page, "/admin?section=desktop-apps");
    await expect(page.getByRole("alert")).toContainText("Could not load app registrations");

    failRegistrationRead = false;
    await page.getByRole("button", { name: "Retry app registrations" }).click();
    await expect(page.getByRole("row").filter({ hasText: "admin-inbox" })).toContainText("Shown");
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("keeps master-detail controls usable at a narrow viewport", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 740 });
    await openAdmin(page, "/admin?section=users");
    const roster = page.getByRole("table", { name: "All users with highest assigned role and level" });
    await expect(roster).toBeVisible();
    await page.getByRole("button", { name: "Open WTF Passport for complaint-user" }).click();
    const passport = page.locator('[data-admin-user-passport][data-admin-user-id="2"]');
    await expect(passport).toBeVisible();
    await expect(passport.getByRole("button", { name: "Back to scope view" })).toBeVisible();
    await expect(page.locator("[data-admin-scope-pane]")).toBeHidden();

    const overflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      detailWidth: document.querySelector("[data-admin-detail-pane]")?.getBoundingClientRect().width ?? 0,
    }));
    expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
    expect(overflow.detailWidth).toBeLessThanOrEqual(overflow.viewportWidth);

    await passport.getByRole("button", { name: "Back to scope view" }).click();
    await expect(roster).toBeVisible();
  });
});
