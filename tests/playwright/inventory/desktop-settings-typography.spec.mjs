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
    const globalSave = page.getByTestId("desktop-settings-global-save");
    await expect(globalSave).toHaveAttribute("data-save-state", "recorded");

    await page.getByTestId("desktop-settings-tab-font").click();
    await expect(page.getByRole("tabpanel", { name: "Font" })).toBeVisible();
    await expect(page.getByText("System typography", { exact: true })).toBeVisible();
    await expect(page.getByText("Chat defaults", { exact: true })).toBeVisible();

    await expect(page.getByTestId("font-pack-wtfos-soft-system")).toBeVisible();
    await expect(page.getByTestId("font-pack-wtfos-soft-system")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByTestId("font-pack-mek-type")).toBeVisible();
    await page.getByRole("button", { name: "Chat typography preset Friendly Room" }).click();
    await expect(globalSave).toHaveAttribute("data-save-state", "unsaved");

    await expect(page.getByLabel("Default WIM font", { exact: true })).toHaveValue("Comic Sans MS");
    await expect(page.getByLabel("Default WIM font size")).toHaveValue("14");
    await expect(page.getByLabel("Default WTF LIVE chat font", { exact: true })).toHaveValue("classic-95");
    await expect(page.getByLabel("Default WTF LIVE chat font size")).toHaveValue("12");

    const wimSizeOptions = await page
      .locator('select[aria-label="Default WIM font size"] option')
      .evaluateAll((options) => options.map((option) => option.value));
    const liveSizeOptions = await page
      .locator('select[aria-label="Default WTF LIVE chat font size"] option')
      .evaluateAll((options) => options.map((option) => option.value));
    const liveFontOptions = await page
      .locator('select[aria-label="Default WTF LIVE chat font"] option')
      .evaluateAll((options) => options.map((option) => option.value));
    expect(wimSizeOptions).toEqual(["10", "12", "14", "18", "24"]);
    expect(liveSizeOptions).toEqual(["8", "9", "10", "11", "12", "13", "14"]);
    expect(liveFontOptions).toEqual(["classic-95", "terminal", "serif-press"]);

    await page.getByLabel("Default WTF LIVE chat font size").selectOption("14");
    await expect(globalSave).toHaveAttribute("data-save-state", "unsaved");
    await globalSave.click();

    await expect
      .poll(async () => {
        const response = await request.get("/api/desktop/settings");
        const body = await response.json();
        return body.appearance.wtfLiveChatStyle;
      })
      .toMatchObject({ font: "classic-95", color: "purple", size: 14 });
    await expect(globalSave).toHaveAttribute("data-save-state", "recorded");

    const state = await (await request.get("/__test/state")).json();
    expect(state.interactionLog.map((event) => event.eventType)).toContain(
      "desktop.chat_typography.updated"
    );
  });
});
