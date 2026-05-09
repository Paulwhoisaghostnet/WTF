import { test, expect } from "@playwright/test";
import { DOMAIN_WORKFLOWS } from "../../e2e/inventory/domain-workflows.mjs";
async function setAdmin(request) {
  const res = await request.post("/__test/state", { data: { userRole: "admin" } });
  expect(res.ok()).toBeTruthy();
}

async function probe(request, probe) {
  const method = probe.method.toLowerCase();
  const options = probe.body ? { data: probe.body } : undefined;
  return request[method](probe.path, options);
}

function probeAccepted(response, probeSpec) {
  return response.ok() || (probeSpec.expectedStatuses ?? []).includes(response.status());
}

test.describe("interaction inventory — domain interoperability", () => {
  for (const workflow of DOMAIN_WORKFLOWS) {
    test(workflow.name, async ({ page, request }) => {
      await setAdmin(request);

      for (const probeSpec of workflow.apiProbes) {
        const response = await probe(request, probeSpec);
        expect(probeAccepted(response, probeSpec), `${probeSpec.method} ${probeSpec.path}`).toBeTruthy();
      }

      for (const handle of workflow.eventHandles) {
        const response = await request.post("/__test/e2e/interaction", {
          data: {
            domain: workflow.domain,
            subdomain: "domain-interoperability",
            handle,
            metadata: { workflow: workflow.name },
          },
        });
        expect(response.ok(), `${workflow.name} -> ${handle}`).toBeTruthy();
      }

      for (const route of workflow.routes) {
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(200);
        await expect(page.locator("body")).toBeVisible();
        await expect(page.getByText(/something went wrong|application error/i)).toHaveCount(0);
      }
    });
  }
});
