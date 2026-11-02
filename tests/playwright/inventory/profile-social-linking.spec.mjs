import { expect, test } from "@playwright/test";

test.describe("interaction inventory - Profile social network linking", () => {
  test("groups X, Discord, and AT Protocol identity links apart from contact email", async ({ page, request }) => {
    const setup = await request.post("/__test/state", {
      data: { userRole: "contestant", username: "social-link-profile" },
    });
    expect(setup.ok()).toBeTruthy();

    await page.goto("/profile", { waitUntil: "domcontentloaded" });

    const linking = page.locator('[data-profile-section="social-network-linking"]');
    await expect(linking).toBeVisible();
    await expect(linking.getByRole("heading", { name: "Social network linking" })).toBeVisible();
    await expect(linking.getByRole("textbox", { name: "Twitter handle" })).toBeVisible();
    await expect(linking.getByRole("textbox", { name: "Discord username" })).toBeVisible();
    await expect(linking.getByRole("textbox", { name: "AT Protocol handle" })).toBeVisible();
    await expect(linking.getByRole("button", { name: "Enter a Discord username" })).toBeDisabled();
    await expect(linking.getByRole("button", { name: "Enter an AT handle" })).toBeDisabled();
    await expect(page.getByText("Email:", { exact: true })).toBeVisible();
    await expect(linking.getByText("Email:", { exact: true })).toHaveCount(0);
  });

  test("Discord account change sends the intended username and preserves the link on mismatch", async ({ page, request }) => {
    const setup = await request.post("/__test/state", {
      data: {
        userRole: "contestant",
        username: "discord-link-profile",
        profileSocialConnected: "discord",
      },
    });
    expect(setup.ok()).toBeTruthy();

    let startUrl = null;
    await page.route("**/api/auth/discord?*", async (route) => {
      startUrl = new URL(route.request().url());
      await route.fulfill({
        status: 302,
        headers: { location: "/profile?error=discord_account_mismatch" },
        body: "",
      });
    });

    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    const linking = page.locator('[data-profile-section="social-network-linking"]');
    const usernameInput = linking.getByRole("textbox", { name: "Discord username" });
    await expect(usernameInput).toHaveValue("TommyTezos");
    await usernameInput.fill("new_discord");

    await linking.getByRole("button", { name: "Change to new_discord" }).click();

    await expect.poll(() => startUrl?.searchParams.get("expectedHandle")).toBe("new_discord");
    await expect(page.getByText(/Discord signed in to a different account/)).toBeVisible();
    await expect(usernameInput).toHaveValue("TommyTezos");
  });

  test("AT Protocol account change starts Profile proof and preserves the link on mismatch", async ({ page, request }) => {
    const setup = await request.post("/__test/state", {
      data: {
        userRole: "contestant",
        username: "atproto-link-profile",
        profileSocialConnected: "skywire",
      },
    });
    expect(setup.ok()).toBeTruthy();

    let startUrl = null;
    await page.route("**/api/atproto/oauth/start?*", async (route) => {
      startUrl = new URL(route.request().url());
      await route.fulfill({
        status: 302,
        headers: { location: "/profile?error=atproto_account_mismatch" },
        body: "",
      });
    });

    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    const linking = page.locator('[data-profile-section="social-network-linking"]');
    const handleInput = linking.getByRole("textbox", { name: "AT Protocol handle" });
    await expect(handleInput).toHaveValue("tommytezos.bsky.social");
    await handleInput.fill("new.bsky.social");

    await linking.getByRole("button", { name: "Change to @new.bsky.social" }).click();

    await expect.poll(() => startUrl?.searchParams.get("app")).toBe("profile");
    expect(startUrl?.searchParams.get("handle")).toBe("new.bsky.social");
    expect(startUrl?.searchParams.get("returnTo")).toBe("/profile");
    await expect(page.getByText(/AT Protocol signed in to a different account/)).toBeVisible();
    await expect(handleInput).toHaveValue("tommytezos.bsky.social");
  });
});
