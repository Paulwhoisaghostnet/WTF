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
    await expect(linking.getByRole("button", { name: "Connect Discord" })).toBeEnabled();
    await expect(linking.getByRole("button", { name: "Connect AT Protocol" })).toBeEnabled();
    await expect(page.getByText("Email:", { exact: true })).toBeVisible();
    await expect(linking.getByText("Email:", { exact: true })).toHaveCount(0);
  });

  test("blank Discord first link opens provider sign-in without a username", async ({ page, request }) => {
    const setup = await request.post("/__test/state", {
      data: { userRole: "contestant", username: "new-discord-link-profile" },
    });
    expect(setup.ok()).toBeTruthy();

    let startUrl = null;
    await page.route("**/api/auth/discord*", async (route) => {
      startUrl = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>Discord sign-in handoff</title><h1>Discord sign-in handoff</h1>",
      });
    });

    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    const linking = page.locator('[data-profile-section="social-network-linking"]');
    await expect(linking.getByRole("textbox", { name: "Discord username" })).toHaveValue("");
    await linking.getByRole("button", { name: "Connect Discord" }).click();

    await expect.poll(() => startUrl?.pathname).toBe("/api/auth/discord");
    expect(startUrl?.searchParams.has("expectedHandle")).toBe(false);
    await expect(page.getByRole("heading", { name: "Discord sign-in handoff" })).toBeVisible();
  });

  test("blank Discord reverify keeps an existing link when another account signs in", async ({ page, request }) => {
    const setup = await request.post("/__test/state", {
      data: {
        userRole: "contestant",
        username: "discord-reverify-profile",
        profileSocialConnected: "discord",
      },
    });
    expect(setup.ok()).toBeTruthy();

    let startUrl = null;
    await page.route("**/api/auth/discord*", async (route) => {
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
    await usernameInput.fill("");
    await linking.getByRole("button", { name: "Reverify Discord" }).click();

    await expect.poll(() => startUrl?.pathname).toBe("/api/auth/discord");
    expect(startUrl?.searchParams.has("expectedHandle")).toBe(false);
    await expect(page.getByText(/Discord signed in to a different account/)).toBeVisible();
    await expect(usernameInput).toHaveValue("TommyTezos");
  });

  test("blank AT Protocol first link opens provider sign-in without a handle", async ({ page, request }) => {
    const setup = await request.post("/__test/state", {
      data: { userRole: "contestant", username: "new-atproto-link-profile" },
    });
    expect(setup.ok()).toBeTruthy();

    let startUrl = null;
    await page.route("**/api/atproto/oauth/start?*", async (route) => {
      startUrl = new URL(route.request().url());
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>AT Protocol sign-in handoff</title><h1>AT Protocol sign-in handoff</h1>",
      });
    });

    await page.goto("/profile", { waitUntil: "domcontentloaded" });
    const linking = page.locator('[data-profile-section="social-network-linking"]');
    await expect(linking.getByRole("textbox", { name: "AT Protocol handle" })).toHaveValue("");
    await linking.getByRole("button", { name: "Connect AT Protocol" }).click();

    await expect.poll(() => startUrl?.pathname).toBe("/api/atproto/oauth/start");
    expect(startUrl?.searchParams.get("app")).toBe("profile");
    expect(startUrl?.searchParams.get("returnTo")).toBe("/profile");
    expect(startUrl?.searchParams.has("handle")).toBe(false);
    await expect(page.getByRole("heading", { name: "AT Protocol sign-in handoff" })).toBeVisible();
  });

  test("blank AT Protocol reverify keeps an existing link when another account signs in", async ({ page, request }) => {
    const setup = await request.post("/__test/state", {
      data: {
        userRole: "contestant",
        username: "atproto-reverify-profile",
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
    await handleInput.fill("");
    await linking.getByRole("button", { name: "Reverify AT Protocol" }).click();

    await expect.poll(() => startUrl?.pathname).toBe("/api/atproto/oauth/start");
    expect(startUrl?.searchParams.get("app")).toBe("profile");
    expect(startUrl?.searchParams.get("returnTo")).toBe("/profile");
    expect(startUrl?.searchParams.has("handle")).toBe(false);
    await expect(page.getByText(/AT Protocol signed in to a different account/)).toBeVisible();
    await expect(handleInput).toHaveValue("tommytezos.bsky.social");
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
