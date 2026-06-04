import { test, expect } from "@playwright/test";

async function setAdmin(request) {
  const res = await request.post("/__test/state", { data: { userRole: "admin" } });
  expect(res.ok()).toBeTruthy();
}

function fatalErrors(errors) {
  return errors.filter((error) => !/(favicon|ResizeObserver|WebGL|wallet|beacon|taquito)/i.test(error));
}

test.describe("interaction inventory — Skywire feed usability", () => {
  test("feed cards self-expand, keep readable spacing, and contain media/token previews", async ({
    page,
    request,
  }) => {
    await setAdmin(request);
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-skywire-feed-card='true']")).toHaveCount(3);
    await expect(page.locator("[data-skywire-token-preview='true']")).toHaveCount(3);
    const firstCard = page.locator("[data-skywire-feed-card='true']").first();
    await expect(firstCard.getByPlaceholder("reply")).toHaveCount(0);
    await firstCard.getByRole("button", { name: "Reply", exact: true }).click();
    await expect(firstCard.getByPlaceholder("reply")).toBeVisible();

    const cards = await page.locator("[data-skywire-feed-card='true']").evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          clientHeight: node.clientHeight,
          scrollHeight: node.scrollHeight,
        };
      }),
    );

    for (const [index, card] of cards.entries()) {
      expect(card.height, `Skywire card ${index + 1} should be tall enough to read`).toBeGreaterThan(180);
      expect(card.scrollHeight, `Skywire card ${index + 1} should not clip content`).toBeLessThanOrEqual(
        card.clientHeight + 2,
      );
      if (index > 0) {
        expect(card.top - cards[index - 1].bottom, `Skywire card ${index + 1} should have visible negative space`).toBeGreaterThanOrEqual(18);
      }
    }

    const mediaFrames = await page.locator("[data-skywire-feed-media='true']").evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        const image = node.querySelector("img");
        const imageRect = image?.getBoundingClientRect();
        return {
          frameHeight: rect.height,
          frameWidth: rect.width,
          imageHeight: imageRect?.height ?? 0,
          imageWidth: imageRect?.width ?? 0,
          imageContained:
            Boolean(imageRect) &&
            imageRect.top >= rect.top - 1 &&
            imageRect.left >= rect.left - 1 &&
            imageRect.right <= rect.right + 1 &&
            imageRect.bottom <= rect.bottom + 1,
        };
      }),
    );

    expect(mediaFrames).toHaveLength(2);
    for (const [index, frame] of mediaFrames.entries()) {
      expect(frame.frameHeight, `Skywire media frame ${index + 1} should not collapse into a strip`).toBeGreaterThan(300);
      expect(frame.imageHeight, `Skywire media image ${index + 1} should be visible`).toBeGreaterThan(280);
      expect(frame.imageWidth, `Skywire media image ${index + 1} should be visible`).toBeGreaterThan(280);
      expect(frame.imageContained, `Skywire media image ${index + 1} should stay inside its frame`).toBe(true);
    }

    await expect(page.getByText("Harness Open Edition")).toBeVisible();
    await expect(page.getByText("Harness Teia Token")).toBeVisible();
    const teiaPreview = page.locator("[data-skywire-token-preview='true']").filter({ hasText: "Harness Teia Token" });
    await expect(teiaPreview.getByText("Teia", { exact: true })).toBeVisible();
    await expect(teiaPreview.getByRole("button", { name: "Buy 0.25 tez" })).toBeVisible();

    await firstCard.getByRole("button", { name: /Harness Skywire/i }).click();
    await expect(page.getByText("Mocked Skywire feed actor")).toBeVisible();
    const followButton = page.locator("[data-skywire-actor-follow='true']");
    await expect(followButton).toBeVisible();
    await expect(followButton).toBeEnabled();
    await followButton.click();
    await expect(followButton).toContainText("Following");
    const state = await (await request.get("/__test/state")).json();
    expect(state.skywireFollowPayloads).toEqual([{ did: "did:plc:harness" }]);
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("market feed channel renders posts with supported marketplace href overlays", async ({ page, request }) => {
    await setAdmin(request);
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire?tab=market", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Market Feed/ })).toHaveAttribute("title", "Objkt/Teia links");
    await expect(page.locator("[data-skywire-feed-card='true']")).toHaveCount(3);
    await expect(page.locator("[data-skywire-token-preview='true']")).toHaveCount(3);
    await expect(page.getByText("Harness Token")).toBeVisible();
    await expect(page.getByText("Harness Teia Token")).toBeVisible();
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("vault separates owned tokens from created collections and prefills Bluesky token shares", async ({
    page,
    request,
  }) => {
    await setAdmin(request);
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire?tab=vault", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("Owned Tokens", { exact: true })).toBeVisible();
    await expect(page.locator("[data-skywire-vault-section='owned'] [data-skywire-vault-token='owned']")).toHaveCount(1);
    const createdGroups = page.locator("[data-skywire-vault-created-group='true']");
    await expect(createdGroups).toHaveCount(2);

    const alphaGroup = createdGroups.first();
    await alphaGroup.scrollIntoViewIfNeeded();
    await expect(alphaGroup.getByText("Harness Alpha Collection").first()).toBeVisible();
    await expect(alphaGroup.locator("[data-skywire-vault-token='created']")).toHaveCount(2);
    await expect(createdGroups.nth(1).getByText("Harness Beta Collection").first()).toBeVisible();
    const alphaToken = alphaGroup.locator("[data-skywire-vault-token='created']").first();
    await expect(alphaToken.getByText("Title", { exact: true })).toBeVisible();
    await expect(alphaToken.getByText("Creator", { exact: true })).toBeVisible();
    await expect(alphaToken.getByText("Harness Creator")).toBeVisible();
    await expect(alphaToken.getByText("Date Minted", { exact: true })).toBeVisible();
    await expect(alphaToken.getByText("Apr 5, 2024")).toBeVisible();
    await expect(alphaToken.getByText("https://objkt.com/tokens/KT1AlphaCreatedCollection/2")).toBeVisible();
    await expect(alphaToken.locator("img")).toBeVisible();

    await alphaGroup.locator("[data-skywire-vault-share='created']").first().click();
    const draft = page.locator("[data-skywire-vault-share-draft='true']");
    await expect(draft).toBeVisible();
    await expect(draft.getByLabel("Bluesky token share draft")).not.toHaveValue(/I created|I own/);
    await expect(draft.getByLabel("Bluesky token share draft")).toHaveValue(/^Harness Alpha Token/);
    await expect(draft.getByLabel("Bluesky token share draft")).toHaveValue(/Creator: Harness Creator/);
    await expect(draft.getByLabel("Bluesky token share draft")).toHaveValue(/Collection: Harness Alpha Collection/);
    await expect(draft.getByLabel("Bluesky token share draft")).toHaveValue(/Date Minted: Apr 5, 2024/);
    await expect(draft.getByLabel("Bluesky token share draft")).toHaveValue(/https:\/\/objkt\.com\/tokens\/KT1AlphaCreatedCollection\/2/);
    await draft.getByRole("button", { name: /Post to Bluesky/ }).click();
    await expect(draft.getByText("at://did:plc:skywiretest/app.bsky.feed.post/vault-share")).toBeVisible();
    const state = await (await request.get("/__test/state")).json();
    expect(state.skywirePostPayloads).toHaveLength(1);
    expect(state.skywirePostPayloads[0]).toMatchObject({
      embedUrl: "https://objkt.com/tokens/KT1AlphaCreatedCollection/2",
      embedTitle: "Harness Alpha Token",
      embedDescription: "Harness Creator · Harness Alpha Collection · Minted Apr 5, 2024",
    });
    expect(state.skywirePostPayloads[0].embedThumbUrl).toMatch(/\/__test\/media\/harness-alpha-token\.png$/);
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("chat renders quoted replies and GIF media attachments", async ({ page, request }) => {
    await setAdmin(request);
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire?tab=chat", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /harness\.bsky\.social/i }).click();

    await expect(page.locator("[data-skywire-chat-quote='true']")).toContainText(
      "\"Original post text for quoted chat reply.\"",
    );
    await expect(page.locator("[data-skywire-chat-media='true'] img")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open media" })).toBeVisible();
    await expect(page.getByText("This GIF should render in chat.")).toBeVisible();
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("OAuth popup completion refreshes the original window chat permission state", async ({ page, request }) => {
    const res = await request.post("/__test/state", {
      data: { userRole: "admin", skywireChatEnabled: false },
    });
    expect(res.ok()).toBeTruthy();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire?tab=account", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("DM add-on off")).toBeVisible();
    await expect(page.getByText("Skywire Chat Add-on")).toBeVisible();

    const upgraded = await request.post("/__test/state", {
      data: { userRole: "admin", skywireChatEnabled: true },
    });
    expect(upgraded.ok()).toBeTruthy();
    await page.evaluate(() => {
      const message = {
        type: "atproto_oauth_complete",
        app: "skywire",
        ok: true,
        handle: "wtf-admin.bsky.social",
        permissionTier: "be-bold",
        chatEnabled: true,
        requestedScope: "atproto transition:generic transition:chat.bsky",
        grantedScope: "atproto transition:generic transition:chat.bsky",
        accountId: 1,
        at: Date.now(),
      };
      const channel = new BroadcastChannel("skywire:atproto-oauth");
      channel.postMessage(message);
      channel.close();
    });

    await expect(page.getByText("Skywire Chat Add-on enabled for @wtf-admin.bsky.social.")).toBeVisible();
    await expect(page.getByText("DM add-on on")).toBeVisible();
    await expect(page.getByText("Chats", { exact: true })).toBeVisible();
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("OAuth popup canonical state polling refreshes the original window and closes a stranded popup", async ({
    page,
    request,
  }) => {
    const res = await request.post("/__test/state", {
      data: { userRole: "admin", skywireChatEnabled: false },
    });
    expect(res.ok()).toBeTruthy();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire?tab=account", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("DM add-on off")).toBeVisible();
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Enable Chat Add-on" }).click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    await expect(popup.getByText(/Harness Skywire OAuth chat upgrade pending/i)).toBeVisible();

    const upgraded = await request.post("/__test/state", {
      data: { userRole: "admin", skywireChatEnabled: true },
    });
    expect(upgraded.ok()).toBeTruthy();

    await expect(page.getByText("Skywire Chat Add-on enabled for @wtf-admin.bsky.social.")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("DM add-on on")).toBeVisible();
    await expect(page.getByText("Chats", { exact: true })).toBeVisible();
    await expect.poll(() => popup.isClosed(), { timeout: 15000 }).toBe(true);
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("OAuth popup Skywire fallback broadcasts completion and closes itself", async ({ page, request }) => {
    const res = await request.post("/__test/state", {
      data: { userRole: "admin", skywireChatEnabled: false },
    });
    expect(res.ok()).toBeTruthy();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire?tab=account", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("DM add-on off")).toBeVisible();
    const upgraded = await request.post("/__test/state", {
      data: { userRole: "admin", skywireChatEnabled: true },
    });
    expect(upgraded.ok()).toBeTruthy();

    const fallbackUrl =
      "/skywire?verified=atproto&handle=wtf-admin.bsky.social&permissionTier=be-bold&chat=1" +
      "&requestedScope=atproto%20transition%3Ageneric%20chat.bsky" +
      "&grantedScope=atproto%20transition%3Ageneric%20chat.bsky&accountId=1";
    const popupPromise = page.waitForEvent("popup");
    await page.evaluate((url) => {
      window.open(url, "skywire-atproto-oauth", "width=520,height=760");
    }, fallbackUrl);
    const popup = await popupPromise;

    await expect(page.getByText("Skywire Chat Add-on enabled for @wtf-admin.bsky.social.")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("DM add-on on")).toBeVisible();
    await expect(page.getByText("Chats", { exact: true })).toBeVisible();
    await expect.poll(() => popup.isClosed(), { timeout: 15000 }).toBe(true);
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("OAuth popup completion cannot fake chat enabled without canonical account permission", async ({
    page,
    request,
  }) => {
    const res = await request.post("/__test/state", {
      data: { userRole: "admin", skywireChatEnabled: false },
    });
    expect(res.ok()).toBeTruthy();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire?tab=account", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("DM add-on off")).toBeVisible();

    await page.evaluate(() => {
      const message = {
        type: "atproto_oauth_complete",
        app: "skywire",
        ok: true,
        handle: "wtf-admin.bsky.social",
        permissionTier: "be-bold",
        chatEnabled: true,
        requestedScope: "atproto transition:generic transition:chat.bsky",
        grantedScope: "atproto transition:generic transition:chat.bsky",
        accountId: 1,
        at: Date.now(),
      };
      const channel = new BroadcastChannel("skywire:atproto-oauth");
      channel.postMessage(message);
      channel.close();
    });

    await expect(page.getByText("Skywire has not received the durable chat permission yet.")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("DM add-on off")).toBeVisible();
    await expect(page.getByText("Skywire Chat Add-on enabled for @wtf-admin.bsky.social.")).toHaveCount(0);
    expect(fatalErrors(errors)).toEqual([]);
  });
});
