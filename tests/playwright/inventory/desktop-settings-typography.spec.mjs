import { test, expect } from "@playwright/test";

async function setAdmin(request) {
  const res = await request.post("/__test/state", { data: { userRole: "admin" } });
  expect(res.ok()).toBeTruthy();
}

test.describe("interaction inventory - Theme Builder typography", () => {
  test("chat typography presets stay inside WIM and WTF LIVE constraint windows", async ({
    page,
    request,
  }) => {
    await setAdmin(request);

    await page.goto("/desktop-settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("System typography", { exact: true })).toBeVisible();
    await expect(page.getByText("Chat defaults", { exact: true })).toBeVisible();

    await expect(page.getByTestId("font-pack-wtfos-soft-system")).toBeVisible();
    await expect(page.getByTestId("font-pack-wtfos-soft-system")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByTestId("font-pack-mek-type")).toHaveCount(0);
    await page.getByRole("button", { name: "Chat typography preset Friendly Room" }).click();

    await expect(page.getByLabel("Default WIM font", { exact: true })).toHaveValue("wtfOS Soft Sans");
    await expect(page.getByLabel("Default WIM font size")).toHaveValue("14");
    await expect(page.getByLabel("Default WTF LIVE chat font", { exact: true })).toHaveValue("wtfos-soft-system");
    await expect(page.getByLabel("Default WTF LIVE chat font size")).toHaveValue("12");

    const wimFontOptions = await page
      .locator('select[aria-label="Default WIM font"] option')
      .evaluateAll((options) => options.map((option) => option.value));
    const liveFontOptions = await page
      .locator('select[aria-label="Default WTF LIVE chat font"] option')
      .evaluateAll((options) => options.map((option) => option.value));
    const wimSizeOptions = await page
      .locator('select[aria-label="Default WIM font size"] option')
      .evaluateAll((options) => options.map((option) => option.value));
    const liveSizeOptions = await page
      .locator('select[aria-label="Default WTF LIVE chat font size"] option')
      .evaluateAll((options) => options.map((option) => option.value));
    expect(wimFontOptions).toEqual(["wtfOS Soft Sans"]);
    expect(liveFontOptions).toEqual(["wtfos-soft-system"]);
    expect(wimSizeOptions).toEqual(["10", "12", "14", "18", "24"]);
    expect(liveSizeOptions).toEqual(["8", "9", "10", "11", "12", "13", "14"]);

    await page.getByLabel("Default WTF LIVE chat font size").selectOption("14");
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect
      .poll(async () => {
        const response = await request.get("/api/desktop/settings");
        const body = await response.json();
        return body.appearance.wtfLiveChatStyle;
      })
      .toMatchObject({ font: "wtfos-soft-system", color: "purple", size: 14 });

    const state = await (await request.get("/__test/state")).json();
    expect(state.interactionLog.map((event) => event.eventType)).toContain(
      "desktop.chat_typography.updated"
    );
  });
});
