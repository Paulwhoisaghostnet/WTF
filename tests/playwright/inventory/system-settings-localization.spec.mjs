import { test, expect } from "@playwright/test";

async function setAdmin(request, desktopLocalization = { locale: "en-US", region: "US" }) {
  const res = await request.post("/__test/state", {
    data: { userRole: "admin", desktopLocalization },
  });
  expect(res.ok()).toBeTruthy();
}

async function htmlLocaleState(page) {
  return page.locator("html").evaluate((html) => ({
    lang: html.getAttribute("lang"),
    dir: html.getAttribute("dir"),
    dataLocale: html.getAttribute("data-wtf-locale"),
  }));
}

function displayLanguageSelect(page) {
  return page.locator("select").first();
}

test.describe("interaction inventory - System Settings localization", () => {
  test("Language & Region persists Spanish and localizes shell-owned text", async ({
    page,
    request,
  }) => {
    await setAdmin(request);

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Language & Region", { exact: true })).toBeVisible();

    await displayLanguageSelect(page).selectOption("es-ES");
    await expect(page.getByText("Idioma y región", { exact: true })).toBeVisible();
    await expect(page.getByText("Elige tu idioma", { exact: true })).toBeVisible();
    await expect.poll(() => htmlLocaleState(page)).toMatchObject({
      lang: "es-ES",
      dir: "ltr",
      dataLocale: "es-ES",
    });

    await expect
      .poll(async () => {
        const response = await request.get("/api/desktop/settings");
        const body = await response.json();
        return body.localization;
      })
      .toMatchObject({ locale: "es-ES", region: "ES" });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText("Idioma y región", { exact: true })).toBeVisible();
    await expect(displayLanguageSelect(page)).toHaveValue("es-ES");

    await page.goto("/desktop-settings", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Constructor de temas", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Valores de chat", { exact: true })).toBeVisible();
  });

  test("Language & Region applies RTL document direction for Arabic", async ({
    page,
    request,
  }) => {
    await setAdmin(request);

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await displayLanguageSelect(page).selectOption("ar");

    await expect.poll(() => htmlLocaleState(page)).toMatchObject({
      lang: "ar",
      dir: "rtl",
      dataLocale: "ar",
    });
    await expect(page.getByText("اللغة والمنطقة", { exact: true })).toBeVisible();
  });

  test("pseudo-locale renders expanded OS text for layout smoke coverage", async ({
    page,
    request,
  }) => {
    await setAdmin(request);

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await displayLanguageSelect(page).selectOption("en-XA");

    await expect.poll(() => htmlLocaleState(page)).toMatchObject({
      lang: "en-XA",
      dir: "ltr",
      dataLocale: "en-XA",
    });
    await expect(page.locator("body")).toContainText("[!!");
    await expect(displayLanguageSelect(page)).toHaveValue("en-XA");
  });
});
