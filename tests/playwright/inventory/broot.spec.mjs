import { test, expect } from "@playwright/test";

async function setHarnessRole(request, role) {
  const res = await request.post("/__test/state", { data: { userRole: role } });
  expect(res.ok()).toBeTruthy();
}

function fatalErrors(errors) {
  return errors.filter((message) => !/(favicon|ResizeObserver|WebGL|wallet|beacon|taquito|status of 401)/i.test(message));
}

test.describe("interaction inventory - Broot", () => {
  test("loads the Tezos-native Fabric editor and exports a PNG", async ({ page, request }) => {
    await setHarnessRole(request, "admin");
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });

    await page.addInitScript(() => {
      indexedDB.deleteDatabase("broot");
      window.localStorage.removeItem("wtf-os.window-session.v1");
    });

    await page.goto("/tools/broot", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/tools\/broot$/);
    await expect(page.locator('iframe[title="Broot"]')).toBeVisible();

    const frame = page.frameLocator('iframe[title="Broot"]');
    await expect(frame.getByLabel("Broot editor")).toBeVisible();
    await expect(frame.getByRole("status")).toContainText("Broot ready");
    await expect(frame.getByLabel("Broot Fabric canvas")).toBeVisible();
    await expect(frame.getByLabel("Broot layers and Tezos")).toContainText("Layers");

    await frame.getByRole("button", { name: "Rect", exact: true }).click();
    await frame.getByRole("button", { name: "Text", exact: true }).click();
    await expect(frame.getByLabel("Broot layers and Tezos")).toContainText("Rectangle");
    await expect(frame.getByLabel("Broot layers and Tezos")).toContainText("Text");

    await frame.getByLabel("Project name").fill("Broot Harness Artifact");
    await frame.getByRole("button", { name: "Draft", exact: true }).click();
    await expect(frame.getByRole("status")).toContainText("Saved IndexedDB draft");

    const download = page.waitForEvent("download");
    await frame.getByRole("button", { name: "PNG", exact: true }).click();
    const png = await download;
    expect(png.suggestedFilename()).toBe("broot-harness-artifact.png");
    await expect(frame.getByRole("status")).toContainText("PNG exported");

    expect(fatalErrors(errors)).toEqual([]);
  });
});
