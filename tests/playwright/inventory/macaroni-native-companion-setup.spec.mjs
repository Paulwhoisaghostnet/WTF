import { expect, test } from "@playwright/test";

test.describe("interaction inventory — Macaroni native Companion setup", () => {
  test("guides a local creator to setup resources and explicitly rechecks readiness", async ({ page }) => {
    let readinessRequests = 0;
    await page.addInitScript(() => {
      window.__macaroniNativeSetupActions = [];
      window.MACARONI_DESKTOP = {
        native: true,
        version: "3.5-test",
        openCompanionSetupGuide: async () => {
          window.__macaroniNativeSetupActions.push("open-guide");
          return { ok: true, action: "open-guide" };
        },
        openCompanionConfigFolder: async () => {
          window.__macaroniNativeSetupActions.push("open-config-folder");
          return { ok: true, action: "open-config-folder" };
        },
      };
    });
    await page.route("**/api/macaroni/v35/companion/readiness", async (route) => {
      readinessRequests += 1;
      if (readinessRequests === 1) {
        return route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            schema: "wtfos.macaroni-v35-companion-readiness.v1",
            ready: false,
            studioApiReady: false,
            code: "companion_setup_required",
            reason: "Companion configuration is incomplete.",
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          schema: "wtfos.macaroni-v35-companion-readiness.v1",
          ready: true,
          studioApiReady: true,
          code: "ready",
          reason: "Local Companion safety checks and the private Studio adapter are ready.",
          network: "shadownet",
          assetStrategies: ["pin_on_claim", "public_prepin_private_manifest"],
          managementUrl: "http://127.0.0.1:30771/studio.html#secure-v35-companion",
          publicCollectorReady: false,
          publicCollectorCode: "companion_public_endpoint_unverified",
          publicCollectorReason: "Configure and verify the public HTTPS collector endpoint before activation or export.",
          publicBaseUrl: "",
          collectorOrigin: "",
          localDevelopmentOnly: true,
        }),
      });
    });

    await page.goto("/creation-tools/macaroni/studio.html", { waitUntil: "domcontentloaded" });

    const setup = page.locator("#nativeCompanionSetup");
    await expect(setup).toBeVisible();
    await expect(page.locator("#nativeCompanionSetupTitle")).toHaveText("Finish Companion setup");
    await expect(page.locator("#nativeCompanionSetupReason")).toContainText("Companion configuration is incomplete");
    await expect(page.locator("#nativeCompanionSetupReason")).toContainText("Open the guide");
    await expect(page.locator("#advancedOptions")).not.toHaveAttribute("open", "");

    await page.locator("#btnOpenCompanionSetupGuide").click();
    await expect(page.locator("#nativeCompanionActionStatus")).toContainText("did not copy generated keys");
    await page.locator("#btnOpenCompanionConfigFolder").click();
    await expect(page.locator("#nativeCompanionActionStatus")).toContainText("active .env selected");
    expect(await page.evaluate(() => window.__macaroniNativeSetupActions)).toEqual([
      "open-guide",
      "open-config-folder",
    ]);

    await page.locator("#btnCheckCompanionAgain").click();
    await expect(page.locator("#nativeCompanionSetupTitle")).toHaveText("Companion is ready");
    await expect(page.locator("#nativeCompanionSetupBadge")).toHaveText("Ready");
    await expect(page.locator("#nativeCompanionActionStatus")).toContainText("creation and launch steps are unlocked");
    expect(readinessRequests).toBe(2);
  });

  test("shows chain-checked operator recovery without exposing private journal data", async ({ page }) => {
    const dropRef = "4b576a3e-e443-4c6e-b9e3-97c889502cc4";
    await page.addInitScript((id) => {
      window.MACARONI_DESKTOP = { native: true, version: "3.5-test" };
      localStorage.setItem("macaroni.studio.v1", JSON.stringify({
        network: "shadownet",
        drop: { profileId: "macaroni-secure-v35" },
        infrastructure: { kind: "companion", manuallySelected: true, privateInventory: { projectId: id } },
      }));
    }, dropRef);
    await page.route("**/api/macaroni/v35/companion/readiness", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        schema: "wtfos.macaroni-v35-companion-readiness.v1", ready: true, studioApiReady: true,
        code: "ready", network: "shadownet", assetStrategies: ["pin_on_claim"],
        publicCollectorReady: false, publicCollectorCode: "companion_public_endpoint_unverified",
        publicCollectorReason: "Public endpoint is not configured.",
      }),
    }));
    let checks = 0;
    await page.route(`**/api/macaroni/v35/companion/projects/${dropRef}/attention`, (route) => {
      checks += 1;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        schema: "pasta.macaroni-companion-attention.v1",
        items: checks === 3 ? [] : checks > 3 ? [{ id: 8, claimId: 0, workType: "publish_artifact_car", state: "retry_wait",
          attemptNumber: 2, operationHash: null, chainState: "publication_retrying", diagnostic: "pinning_retrying",
          retrySafe: false }] : [{ id: 7, claimId: 0, workType: "settle_claim", state: "manual_review",
          attemptNumber: 1, operationHash: "operation-immutable", chainState: checks === 1 ? "fifo_cursor_changed" : "chain_included",
          retrySafe: checks !== 1 }],
      }) });
    });
    await page.route(`**/api/macaroni/v35/companion/projects/${dropRef}/attention/7/retry`, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        schema: "pasta.macaroni-companion-attention-retry.v1", accepted: true, item: null,
      }),
    }));
    await page.goto("/creation-tools/macaroni/studio.html", { waitUntil: "domcontentloaded" });
    const panel = page.locator("#nativeCompanionAttention");
    await expect(panel).toBeVisible();
    await page.locator("#btnCheckCompanionAttention").click();
    await expect(panel).toContainText("fifo_cursor_changed");
    await expect(panel.getByRole("button", { name: "Retry verified work" })).toHaveCount(0);
    await page.locator("#btnCheckCompanionAttention").click();
    await expect(panel).toContainText("chain_included");
    await panel.getByRole("button", { name: "Retry verified work" }).click();
    await expect(panel).toContainText("No claim or publication work currently needs attention");
    await page.locator("#btnCheckCompanionAttention").click();
    await expect(panel).toContainText("artwork publication");
    await expect(panel).toContainText("Publication is retrying automatically");
    await expect(panel.getByRole("button", { name: "Retry verified work" })).toHaveCount(0);
    await expect(panel).not.toContainText("signedBytesPath");
  });
});
