import { test, expect } from "@playwright/test";

async function setHarnessRole(request, role) {
  const response = await request.post("/__test/state", { data: { userRole: role } });
  expect(response.ok()).toBeTruthy();
}

async function getPixAlerceFrame(page) {
  const iframe = await page.locator('iframe[title="PixAlerce"]').elementHandle();
  const frame = await iframe.contentFrame();
  expect(frame).toBeTruthy();
  return frame;
}

test.describe("interaction inventory - PixAlerce", () => {
  test("creates and persists a local project inside the wtfOS shell", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    const errors = [];
    const failedRequests = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("requestfailed", (request) => failedRequests.push(`${request.method()} ${request.url()}`));

    await page.addInitScript(() => {
      window.localStorage.removeItem("wtf-os.window-session.v1");
    });

    await page.goto("/tools/pixalerce", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/tools\/pixalerce$/);
    await expect(page.locator('[data-creation-tool-id="pixalerce"]')).toBeVisible();
    await expect(page.getByRole("link", { name: "Source" })).toHaveAttribute(
      "href",
      "https://github.com/NikoAlerce/3dpixelstudio",
    );

    let frame = await getPixAlerceFrame(page);
    await expect(frame.getByRole("button", { name: /Blank canvas/i })).toBeVisible({ timeout: 20_000 });
    await frame.getByRole("button", { name: /Blank canvas/i }).click();
    await expect(frame.getByRole("dialog", { name: "New Canvas" })).toBeVisible();
    await frame.getByRole("button", { name: "Create", exact: true }).click();
    await expect(frame.getByRole("banner")).toContainText("PixAlerce", { timeout: 20_000 });

    await frame.getByRole("button", { name: "App Menu" }).click();
    await frame.getByRole("menu").getByText("Save project", { exact: true }).click();
    const saveDialog = frame.getByRole("heading", { name: "Save to gallery" }).locator("..");
    await expect(saveDialog).toBeVisible();
    await frame.getByPlaceholder("Project name").fill("wtfOS alpha cube");
    await saveDialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect(frame.getByText("Project saved ✓", { exact: true })).toBeVisible({ timeout: 20_000 });

    await page.reload({ waitUntil: "domcontentloaded" });
    frame = await getPixAlerceFrame(page);
    await expect(frame.getByRole("button", { name: /My projects/i })).toBeVisible({ timeout: 20_000 });
    await frame.getByRole("button", { name: /My projects/i }).click();
    await expect(frame.getByText("wtfOS alpha cube", { exact: true })).toBeVisible({ timeout: 20_000 });

    expect(failedRequests.filter((entry) => entry.includes("/creation-tools/pixalerce/"))).toEqual([]);
    expect(errors.filter((message) => !/(WebGL|favicon|ResizeObserver)/i.test(message))).toEqual([]);
  });
});
