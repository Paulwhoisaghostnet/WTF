import { test, expect } from "@playwright/test";
import { getAllHandles, parseInteractionInventory } from "../../e2e/inventory/parser.mjs";
import { SYSTEM_WORKFLOWS } from "../../e2e/inventory/domain-workflows.mjs";

async function setRole(request, userRole) {
  const res = await request.post("/__test/state", { data: { userRole } });
  expect(res.ok()).toBeTruthy();
}

test.describe("interaction inventory — system integration", () => {
  test("strict admin users see native app admin tooling and central automation", async ({
    page,
    request,
  }) => {
    await setRole(request, "admin");

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Dashboard").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "ADM" }).first().click();
    await expect(page.getByText("Dashboard Admin").first()).toBeVisible();
    await expect(page.getByText("Automation").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Users" }).first()).toBeVisible();

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByTitle("OS Admin").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTitle("Automation").first()).toBeVisible();
  });

  test("host/cohost-style staff roles do not see strict-admin screens", async ({
    page,
    request,
  }) => {
    await setRole(request, "host");

    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Dashboard").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "ADM" })).toHaveCount(0);

    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Admin Panel").first()).toHaveCount(0);
    await expect(page.getByTitle("OS Admin").first()).toHaveCount(0);
  });

  test("every inventory handle can be represented by the normalized event spine", async ({
    request,
  }) => {
    await setRole(request, "admin");
    const handles = getAllHandles(parseInteractionInventory());
    expect(handles.length).toBeGreaterThan(150);

    for (const handle of handles) {
      const response = await request.post("/__test/e2e/interaction", {
        data: {
          domain: "system",
          subdomain: "normalized-event-spine",
          handle,
          metadata: { systemLevel: true },
        },
      });
      expect(response.ok(), handle).toBeTruthy();
      const payload = await response.json();
      expect(payload.event.eventType).toBe(handle);
      expect(payload.event).toHaveProperty("id");
      expect(payload.event).toHaveProperty("timestamp");
      expect(payload.event).toHaveProperty("metadata");
      expect(payload.event).toHaveProperty("rawReferenceId");
    }
  });

  for (const workflow of SYSTEM_WORKFLOWS) {
    test(`system workflow: ${workflow.name}`, async ({ page, request }) => {
      await setRole(request, "admin");
      for (const route of workflow.routes) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await expect(page.locator("body")).toBeVisible();
      }
      for (const handle of workflow.eventHandles) {
        const response = await request.post("/__test/e2e/interaction", {
          data: {
            domain: "system",
            subdomain: workflow.name,
            handle,
          },
        });
        expect(response.ok(), `${workflow.name} -> ${handle}`).toBeTruthy();
      }
    });
  }
});
