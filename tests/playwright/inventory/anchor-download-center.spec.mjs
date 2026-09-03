import { test, expect } from "@playwright/test";

async function setHarnessUser(request) {
  const response = await request.post("/__test/state", {
    data: {
      userRole: "contestant",
      username: "anchor-user",
      displayName: "Anchor User",
      wtfUserSiteClaimed: false,
    },
  });
  expect(response.ok()).toBeTruthy();
}

test.describe("interaction inventory — Anchor preservation appliance", () => {
  test("offers verified source without granting hosted Porcupin access", async ({ page, request }) => {
    await setHarnessUser(request);
    const authUser = await request.get("/api/auth/user").then((response) => response.json());
    expect(authUser.effectivePermissions.use_wtfos_pinning).not.toBe(true);
    await page.goto("/apps/anchor", { waitUntil: "domcontentloaded" });

    const surface = page.locator('[data-anchor-surface="download-center"]');
    await expect(surface).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Anchor", exact: true })).toBeVisible();
    await expect(page.getByText("No wallet keys, signatures, funds, or wtfOS Pin Collector permission required.")).toBeVisible();
    await expect(page.getByText("Hosted Porcupin", { exact: true })).toBeVisible();
    await expect(page.getByText("Built and maintained by zabuxx and daggiedee.")).toBeVisible();
    await expect(page.getByRole("link", { name: "View the Anchor source on GitLab" })).toHaveAttribute(
      "href",
      "https://gitlab.com/anchor-permanent-by-design/anchor",
    );
    await expect(page.getByText("Licensed AGPL-3.0-or-later.")).toBeVisible();
    await expect(page.getByText("Awaiting verified image")).toBeVisible();

    const source = page.getByRole("link", { name: "Download Verified source bundle" });
    await expect(source).toHaveAttribute(
      "href",
      "https://gitlab.com/anchor-permanent-by-design/anchor/-/archive/v0.2.4/anchor-v0.2.4.tar.gz",
    );
    await expect(page.getByText("daf0759eff05b699b5197ec5d81ca9d68efc5750cd866ce5c064b1e5286fcaa0")).toBeVisible();
    await expect(page.getByText("The installer ISO is unattended")).toBeVisible();
  });

  test("keeps download controls reachable in a narrow app window", async ({ page, request }) => {
    await setHarnessUser(request);
    await page.setViewportSize({ width: 420, height: 760 });
    await page.goto("/apps/anchor", { waitUntil: "domcontentloaded" });

    const surface = page.locator('[data-anchor-surface="download-center"]');
    await expect(surface).toBeVisible();
    await expect(page.getByRole("link", { name: "Download Verified source bundle" })).toBeVisible();
    const overflow = await surface.evaluate((element) => element.scrollWidth > element.clientWidth + 1);
    expect(overflow).toBe(false);
  });
});
