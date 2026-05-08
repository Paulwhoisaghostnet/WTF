import { test, expect } from "@playwright/test";
import { ROUTE_FIXTURES } from "../../e2e/inventory/route-fixtures.mjs";

async function setHarnessRole(request, role) {
  const res = await request.post("/__test/state", { data: { userRole: role } });
  expect(res.ok()).toBeTruthy();
}

function fatalErrors(errors) {
  return errors.filter((error) => !/(favicon|ResizeObserver|WebGL|wallet|beacon|taquito)/i.test(error));
}

test.describe("interaction inventory — route surfaces", () => {
  for (const fixture of ROUTE_FIXTURES) {
    test(`${fixture.domain} / ${fixture.subdomain} / ${fixture.pattern}`, async ({
      page,
      request,
    }) => {
      await setHarnessRole(request, fixture.adminOnly ? "admin" : "admin");
      const errors = [];
      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });

      await page.goto(fixture.path, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(250);
      await expect(page.locator("body")).toBeVisible();
      await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);

      expect(fatalErrors(errors), `fatal browser errors on ${fixture.path}`).toEqual([]);
    });
  }
});
