import { expect, test } from "@playwright/test";

test.describe("interaction inventory - Profile X identity proof", () => {
  test("first-time X link starts proof without requiring a typed handle", async ({ page, request }) => {
    const setup = await request.post("/__test/state", {
      data: { userRole: "contestant", username: "new-x-proof-profile" },
    });
    expect(setup.ok()).toBeTruthy();

    let proofStartUrl = null;
    await page.route("**/api/auth/twitter-proof*", async (route) => {
      proofStartUrl = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>X authorization handoff</title><h1>X authorization handoff</h1>",
      });
    });

    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("textbox", { name: "Twitter handle" })).toHaveValue("");
    const connectButton = page.getByRole("button", { name: "Connect X" });
    await expect(connectButton).toBeEnabled();
    await connectButton.click();

    await expect.poll(() => proofStartUrl?.pathname).toBe("/api/auth/twitter-proof");
    expect(proofStartUrl?.searchParams.has("expectedHandle")).toBe(false);
    await expect(page.getByRole("heading", { name: "X authorization handoff" })).toBeVisible();
  });

  test("changing the linked handle starts fresh proof and preserves the old link on a mismatch", async ({ page, request }) => {
    const setup = await request.post("/__test/state", {
      data: {
        userRole: "contestant",
        username: "x-proof-profile",
        profileSocialConnected: "twitter",
      },
    });
    expect(setup.ok()).toBeTruthy();

    let proofStartUrl = null;
    await page.route("**/api/auth/twitter-proof?*", async (route) => {
      proofStartUrl = new URL(route.request().url());
      await route.fulfill({
        status: 302,
        headers: {
          location: "/profile?error=twitter_proof_wrong_account&expected=new_account&actual=other_account",
        },
        body: "",
      });
    });

    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    const handleInput = page.getByRole("textbox", { name: "Twitter handle" });
    await expect(handleInput).toHaveValue("TommyTezos");
    await handleInput.fill("new_account");

    const changeButton = page.getByRole("button", { name: "Change to @new_account" });
    await expect(changeButton).toBeEnabled();
    await changeButton.click();

    await expect.poll(() => proofStartUrl?.searchParams.get("expectedHandle")).toBe("new_account");
    await expect(page.getByText(/X signed in as @other_account, but this profile expected @new_account/)).toBeVisible();
    await expect(handleInput).toHaveValue("TommyTezos");
  });
});
