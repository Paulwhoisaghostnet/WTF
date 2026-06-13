import { test, expect } from "@playwright/test";

async function setHarnessRole(request, role) {
  const res = await request.post("/__test/state", { data: { userRole: role } });
  expect(res.ok()).toBeTruthy();
}

test.describe("interaction inventory — IPFS Pinning Manager", () => {
  test("whole-wallet backup requires public PDS disclosure before queueing policy", async ({
    page,
    request,
  }) => {
    await setHarnessRole(request, "admin");

    await page.goto("/ipfs-pinning", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "IPFS Pinning Manager" })).toBeVisible();
    await expect(page.getByText("did:plc:harnesspins").first()).toBeVisible();
    await expect(page.getByText("pincollector.wtfos.me").first()).toBeVisible();
    await expect(page.getByText("/mnt/wtf-data/workers/porcupin").first()).toBeVisible();

    const enableButton = page.getByRole("button", { name: /enable wallet backup/i });
    await expect(enableButton).toBeDisabled();

    await page.getByPlaceholder("tz1...").fill("tz1HarnessWallet");
    await expect(enableButton).toBeDisabled();

    await page
      .getByLabel(/I understand pin policies, manifests, and item records are public AT records/i)
      .check();
    await expect(enableButton).toBeEnabled();

    await enableButton.click();
    await expect(page.getByText("Wallet backup policy queued for PDS publishing.")).toBeVisible();
  });
});
