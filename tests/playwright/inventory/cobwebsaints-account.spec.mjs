import { test, expect } from "@playwright/test";

const HARNESS_WALLET = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const HARNESS_WALLET_PROVIDER = "octez.connect";
const COBWEBSAINTS_FULL_USER_ROLE = "cobwebsaints_full_user";

async function seedCobwebsaints(request, { wtfUserSiteClaimed = false } = {}) {
  const res = await request.post("/__test/state", {
    data: {
      userId: 4242,
      userRole: COBWEBSAINTS_FULL_USER_ROLE,
      username: "cobwebsaints",
      displayName: "Cobweb",
      wtfUserSiteClaimed,
    },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe("interaction inventory - cobwebsaints account readiness", () => {
  test("domain claiming and bespoke full-user surfaces stay account-specific", async ({
    page,
    request,
  }) => {
    await seedCobwebsaints(request);
    const authUser = await request.get("/api/auth/user").then((res) => res.json());
    expect(authUser.role).toBe(COBWEBSAINTS_FULL_USER_ROLE);
    expect(authUser.roles).toContain(COBWEBSAINTS_FULL_USER_ROLE);
    expect(authUser.twitterHandle).toBe("unitedsaints");
    expect(authUser.twitterVerified).toBe(true);
    expect(authUser.effectivePermissions.trusted_market_creator).toBe(true);
    expect(authUser.effectivePermissions.use_wtfos_pinning).toBe(true);
    expect(authUser.effectivePermissions.access_admin_panel).toBe(false);

    const atprotoMe = await request.get("/api/atproto/me").then((res) => res.json());
    expect(atprotoMe.account.handle).toBe("cobwebsaints.bsky.social");
    expect(atprotoMe.account.did).toBe("did:plc:hlwiidixnd2bcc65tkvsmfs2");

    await page.addInitScript(({ walletAddress, providerName }) => {
      window.localStorage.setItem(
        "wtf:wallet-session",
        JSON.stringify({ address: walletAddress, providerName }),
      );
    }, { walletAddress: HARNESS_WALLET, providerName: HARNESS_WALLET_PROVIDER });

    await page.goto("/settings", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open Subdomain Setup" }).click();

    const applet = page.getByTestId("subdomain-setup-applet");
    await expect(applet).toBeVisible();
    await expect(applet.getByText("cobwebsaints.wtfos.me", { exact: true })).toBeVisible();
    await expect(applet.getByText("cobwebsaints.wtf.tez", { exact: true })).toBeVisible();
    await expect(applet.getByLabel("wtf.tez label")).toHaveValue("cobwebsaints");
    await expect(applet.getByLabel("wtf.tez target wallet")).toHaveValue(HARNESS_WALLET);

    await applet.getByRole("button", { name: "Claim cobwebsaints.wtfos.me" }).click();
    await expect(applet.getByRole("button", { name: "Open cobwebsaints.wtfos.me" })).toBeVisible();
    await expect(applet.getByText("Macaroni can publish drop pages under this host.")).toBeVisible();

    await applet.getByRole("button", { name: "Build commit plan" }).click();
    await expect(applet.getByText("Salt: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")).toBeVisible();
    await expect(applet.getByRole("button", { name: "Build register plan" })).toBeEnabled({
      timeout: 3_000,
    });
    await applet.getByRole("button", { name: "Build register plan" }).click();
    await expect(applet.getByText("Register operations")).toBeVisible();

    await applet.getByRole("button", { name: "Open WTF Domains" }).click();
    await expect(page).toHaveURL(/\/wtf-subdomains$/);
    await expect(page.getByText("username.wtfos.me Sites")).toBeVisible();
    await expect(page.getByText("cobwebsaints.wtfos.me").first()).toBeVisible();

    await page.goto("/ipfs-pinning", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "IPFS Pinning Manager" })).toBeVisible();
    await expect(page.getByText("did:web:cobwebsaints.wtfos.me").first()).toBeVisible();
    await expect(page.getByText("cobwebsaints.wtfos.me").first()).toBeVisible();
    await expect(page.getByText("cobwebsaints.wtf.tez").first()).toBeVisible();

    const walletBackup = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Wallet Backup" }),
    });
    const enableButton = page.getByRole("button", { name: /enable wallet backup/i });
    await expect(enableButton).toBeDisabled();
    await walletBackup.locator('input[placeholder="tz1..."]').fill(HARNESS_WALLET);
    await page
      .getByLabel(/I understand pin policies, manifests, and item records are public AT records/i)
      .check();
    await expect(enableButton).toBeEnabled();
    await enableButton.click();
    await expect(page.getByText("Wallet backup policy queued for PDS publishing.")).toBeVisible();

    await page.goto("/tools/macaroni", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Macaroni").first()).toBeVisible();
    const macaroniFrame = page.frameLocator('iframe[title="Macaroni"]');
    await macaroniFrame.getByRole("link", { name: /Open Studio/ }).click();
    await expect(macaroniFrame.locator("#pinAccessHint")).toContainText(
      "wtfOS pinning and wtfOS subdomain publishing are enabled",
    );
    await macaroniFrame.getByRole("tab", { name: "Drop Page Designer" }).click();
    await expect(macaroniFrame.locator("#btnPublishWtfOS")).toBeVisible();
  });
});
