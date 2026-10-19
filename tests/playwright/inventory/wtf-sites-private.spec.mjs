import { test, expect, devices } from "@playwright/test";

test("contestant creates and publishes a private page with an explicit audience and protected handoff", async ({ page, context, request }, testInfo) => {
  await request.post("/__test/state", { data: { userRole: "contestant", username: "page-player", wtfUserSiteClaimed: true, ownedAppPasses: ["wtf-subdomains"] } });
  const state = await request.get("/api/wtf-sites/my").then((response) => response.json());
  state.site.pages = state.site.pages.map((item) => ({ ...item, visibility: "public", privatePublishedAt: null }));
  let revision = 0;
  let privatePublishes = 0;
  let publicPublishes = 0;
  await page.route("**/api/wtf-sites/**", async (route) => {
    const url = new URL(route.request().url());
    const body = route.request().method() === "GET" ? null : route.request().postDataJSON();
    if (url.pathname.endsWith("/private-access")) {
      expect(body).toEqual({ host: state.site.host, slug: "round-notes" });
      return route.fulfill({ json: { url: `https://${state.site.host}/_private/access`, token: "fixture-page-ticket" } });
    }
    if (url.pathname.endsWith("/publish-private")) {
      privatePublishes += 1;
      const item = state.site.pages.find((item) => item.slug === "round-notes");
      item.privatePublishedAt = new Date().toISOString();
    } else if (url.pathname === "/api/wtf-sites/publish") {
      publicPublishes += 1;
    } else if (url.pathname === "/api/wtf-sites/pages" && body) {
      expect(body.visibility).toBe("private");
      expect(body.html).toContain("&lt;round proof&gt;");
      state.site.pages.push({ id: 900, slug: body.slug, title: body.title, draftHtml: body.html, visibility: body.visibility, privatePublishedAt: null, sortOrder: 1, updatedAt: String(++revision) });
    }
    return route.fulfill({ json: state });
  });
  await context.route(`https://${state.site.host}/_private/access`, async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(new URLSearchParams(route.request().postData()).get("token")).toBe("fixture-page-ticket");
    return route.fulfill({ contentType: "text/html", body: "<h1>Private fixture preview</h1>" });
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/gamma/wtf-subdomains", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "Content-Security-Policy": "form-action 'self' https://*.wtfos.me" } });
  });
  await page.goto("/gamma/wtf-subdomains", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("username.wtfos.me Sites", { exact: true })).toBeVisible();
  await expect(page.getByLabel("New page audience")).toHaveValue("private");
  await page.getByLabel("New page text").fill("My <round proof> stays private.");
  await page.getByPlaceholder("project", { exact: true }).fill("round-notes");
  await page.getByPlaceholder("Project", { exact: true }).fill("Round notes");
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Page draft created");
  await expect(page.getByLabel("Selected page audience")).toHaveValue("private");
  await expect(page.getByRole("button", { name: "Open private page", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Publish private page", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Private page published");
  expect(privatePublishes).toBe(1);
  expect(publicPublishes).toBe(0);
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open private page", exact: true }).click();
  const popup = await popupPromise;
  await expect(popup.getByRole("heading", { name: "Private fixture preview" })).toBeVisible();
  await popup.close();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /\/round-notes/ }).click();
  await expect(page.getByRole("button", { name: "Open private page", exact: true })).toBeEnabled();
  await page.setViewportSize(devices["iPhone 13"].viewport);
  await page.getByLabel("Selected page audience").scrollIntoViewIfNeeded();
  const workbench = page.locator("fieldset").filter({ hasText: "username.wtfos.me Sites" }).first();
  await expect.poll(() => workbench.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("private-page-narrow.png") });
  expect(errors).toEqual([]);
});
