import { test, expect } from "@playwright/test";

async function setAdmin(request) {
  const res = await request.post("/__test/state", { data: { userRole: "admin" } });
  expect(res.ok()).toBeTruthy();
}

async function setAnonymous(request) {
  const res = await request.post("/__test/state", { data: { userRole: "anonymous" } });
  expect(res.ok()).toBeTruthy();
}

function fatalErrors(errors) {
  return errors.filter((error) => !/(favicon|ResizeObserver|WebGL|wallet|beacon|taquito)/i.test(error));
}

test.describe("interaction inventory — Skywire feed usability", () => {
  test("standalone AT login renders without wtfOS auth and starts Skywire OAuth", async ({
    page,
    request,
  }) => {
    await setAnonymous(request);
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire?standalone=1", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-skywire-standalone-login='true']")).toBeVisible();
    await expect(page.getByRole("button", { name: "Open Stuffs menu" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Skywire" })).toBeVisible();
    await expect(page.getByText("A Tezos-aware AT Protocol client")).toBeVisible();
    await expect(page.getByLabel("Skywire signal examples")).toHaveCount(0);
    await expect(page.getByText("Recent sale")).toHaveCount(0);

    await page.getByLabel("Handle or DID").fill("paulwhoisaghost.bsky.social");
    await Promise.all([
      page.waitForURL(/\/api\/atproto\/oauth\/start/),
      page.getByRole("button", { name: "Continue" }).click(),
    ]);
    const current = new URL(page.url());
    expect(current.searchParams.get("handle")).toBe("paulwhoisaghost.bsky.social");
    expect(current.searchParams.get("returnTo")).toBe("/skywire?tab=account&standalone=1");
    expect(current.searchParams.get("tier")).toBe("be-social");
    expect(current.searchParams.get("chat")).toBe("0");
    expect(current.searchParams.get("standalone")).toBe("1");
    await expect(page.getByText(/Harness Skywire OAuth connect pending/i)).toBeVisible();
    expect(fatalErrors(errors).filter((error) => !/401 \(Unauthorized\)/i.test(error))).toEqual([]);
  });

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
    const quickActions = page.getByLabel("Skywire quick actions");
    await expect(quickActions.getByRole("button", { name: "What's hot" })).toBeVisible();
    await expect(quickActions.getByRole("button", { name: "Market feed" })).toBeVisible();
    await expect(quickActions.getByRole("button", { name: "Go live" })).toHaveCount(0);
    await expect(quickActions.getByRole("button", { name: "Recent sale signal" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Signals/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /WTF Feed/ })).toHaveCount(0);
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

  test("hot topics render Bluesky trends and open a search-backed feed", async ({ page, request }) => {
    await setAdmin(request);
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire?tab=hot", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /Hot/ })).toHaveAttribute("title", "Trending topics");
    await expect(page.getByText("What's Hot")).toBeVisible();
    await expect(page.locator("[data-skywire-hot-topic='true']")).toHaveCount(3);
    await expect(page.locator("[data-skywire-hot-topic='true']").first()).toHaveAttribute(
      "data-skywire-hot-topic-active",
      "true",
    );
    await expect(page.getByText("Tezos art")).toBeVisible();
    await expect(page.getByText("1.3K posts")).toBeVisible();
    await expect(page.getByText(/Reading posts for/)).toBeVisible();
    await expect(page.locator("[data-skywire-feed-card='true']")).toHaveCount(3);

    await page.locator("[data-skywire-hot-topic='true']").filter({ hasText: "#WTFOS" }).click();
    await expect(page.locator("[data-skywire-hot-topic='true']").filter({ hasText: "#WTFOS" })).toHaveAttribute(
      "data-skywire-hot-topic-active",
      "true",
    );
    await expect(page.getByText(/Reading posts for #WTFOS/)).toBeVisible();
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
    await expect(page.getByText("Created-token lookup is deferred.")).toBeVisible();
    await page.getByRole("button", { name: "Load Created Tokens" }).click();
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

  test("signals UI stays hidden while live status remains visible", async ({ page, request }) => {
    await setAdmin(request);
    await request.post("/api/skywire/live-status", {
      data: {
        liveUrl: "https://wtfos.app/live/r/wtf-testing",
        title: "WTF LIVE",
        durationMinutes: 30,
      },
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire?tab=signals", { waitUntil: "domcontentloaded" });
    await expect.poll(() => new URL(page.url()).searchParams.get("tab")).not.toBe("signals");
    await expect(page.getByRole("button", { name: /Signals/ })).toHaveCount(0);
    await expect(page.getByText("Signal Starters")).toHaveCount(0);
    await expect(page.getByText("Bluesky Live Status")).toHaveCount(0);
    await expect(page.locator("[data-skywire-live-badge='active']")).toContainText("Live now");
    await expect(page.locator("[data-skywire-live-banner='active']")).toContainText(
      "Skywire sees your live status",
    );
    await expect(page.getByRole("button", { name: "Update live status" })).toHaveCount(0);
    const state = await (await request.get("/__test/state")).json();
    expect(state.skywireLiveStatus).toMatchObject({
      liveUrl: "https://wtfos.app/live/r/wtf-testing",
      status: "app.bsky.actor.status#live",
    });
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("signal starter publisher stays hidden from the user-facing Skywire UI", async ({ page, request }) => {
    await setAdmin(request);
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire?tab=signals", { waitUntil: "domcontentloaded" });
    await expect.poll(() => new URL(page.url()).searchParams.get("tab")).not.toBe("signals");
    await expect(page.getByText("Signal Starters")).toHaveCount(0);
    await expect(page.locator("[data-skywire-signal-preset='recent-sale']")).toHaveCount(0);
    await expect(page.getByLabel("Skywire signal text")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publish Signal" })).toHaveCount(0);
    const apiResponse = await request.post("/api/skywire/signals", {
      data: {
        text: "Recent sale: Harness Alpha sold for 2.5 tez. Thank you to the collector.",
        signalType: "market.sale",
        tags: ["sale", "collector", "tezos"],
        relatedUri: "https://objkt.com/tokens/KT1AlphaCreatedCollection/2",
      },
    });
    expect(apiResponse.status()).toBe(201);
    const state = await (await request.get("/__test/state")).json();
    expect(state.skywireSignals[0].value).toMatchObject({
      text: "Recent sale: Harness Alpha sold for 2.5 tez. Thank you to the collector.",
      signalType: "market.sale",
      tags: ["sale", "collector", "tezos"],
      relatedUri: "https://objkt.com/tokens/KT1AlphaCreatedCollection/2",
    });
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

  test("chat creates a group conversation when multiple members are entered", async ({ page, request }) => {
    await setAdmin(request);
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire?tab=chat", { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("handle.bsky.social, did:plc:...").fill("harness.bsky.social, second.bsky.social");
    await page.getByPlaceholder("group name").fill("WTF group");
    await page.getByRole("button", { name: "Create Group", exact: true }).click();
    await expect(page.getByRole("button", { name: /WTF group/i })).toBeVisible();
    await expect(page.getByText("This conversation is ready, but the selected history is empty.")).toBeVisible();

    const state = await (await request.get("/__test/state")).json();
    expect(state.skywireGroupPayloads).toHaveLength(1);
    expect(state.skywireGroupPayloads[0]).toMatchObject({
      members: ["harness.bsky.social", "second.bsky.social"],
      groupName: "WTF group",
    });
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("legacy OAuth completion refreshes the account tab chat permission state", async ({ page, request }) => {
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
    await expect(page.getByText("Connection & permissions")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enable Chat Add-on" })).toHaveCount(0);
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("Chat add-on OAuth uses the original window instead of a popup sandbox", async ({
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
    const popupEvents = [];
    page.on("popup", (popup) => popupEvents.push(popup));
    await page.getByRole("button", { name: "Enable Chat Add-on" }).click();
    await expect(page.getByRole("dialog", { name: "Choose Skywire permissions" })).toBeVisible();
    await Promise.all([
      page.waitForURL(/\/api\/atproto\/oauth\/start/),
      page.getByRole("button", { name: "Continue to Bluesky OAuth" }).click(),
    ]);
    expect(popupEvents).toHaveLength(0);
    const current = new URL(page.url());
    expect(current.searchParams.get("popup")).toBeNull();
    expect(current.searchParams.get("handle")).toBe("wtf-admin.bsky.social");
    expect(current.searchParams.get("handle")).not.toBe("wtfgameshow.bsky.social");
    expect(current.searchParams.get("returnTo")).toBe("/skywire?tab=account");
    expect(current.searchParams.get("chat")).toBe("1");
    await expect(page.getByText(/Harness Skywire OAuth chat upgrade pending/i)).toBeVisible();
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("Chat add-on OAuth requires explicit platform actor confirmation before upgrading the shared WTF Gameshow actor", async ({
    page,
    request,
  }) => {
    const res = await request.post("/__test/state", {
      data: { userRole: "admin", skywireChatEnabled: false, skywireHandle: "wtfgameshow.bsky.social" },
    });
    expect(res.ok()).toBeTruthy();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire?tab=account", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("@wtfgameshow.bsky.social").first()).toBeVisible();
    await page.getByRole("button", { name: "Enable Chat Add-on" }).click();

    await expect(page.getByText("Platform actor confirmation")).toBeVisible();
    await expect(page.getByText("This handle is the official shared WTF Gameshow Bluesky actor.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to Bluesky OAuth" })).toBeDisabled();
    await page
      .getByLabel("I understand I am connecting @wtfgameshow.bsky.social as the platform actor.")
      .check();
    await Promise.all([
      page.waitForURL(/\/api\/atproto\/oauth\/start/),
      page.getByRole("button", { name: "Continue to Bluesky OAuth" }).click(),
    ]);
    const current = new URL(page.url());
    expect(current.searchParams.get("popup")).toBeNull();
    expect(current.searchParams.get("handle")).toBe("wtfgameshow.bsky.social");
    expect(current.searchParams.get("returnTo")).toBe("/skywire?tab=account");
    expect(current.searchParams.get("chat")).toBe("1");
    expect(current.searchParams.get("platformActor")).toBe("1");
    await expect(page.getByText(/Harness Skywire OAuth chat upgrade pending for @wtfgameshow\.bsky\.social/i)).toBeVisible();
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("Chat add-on OAuth reports an unresolved Bluesky handle instead of looking stalled", async ({
    page,
    request,
  }) => {
    const res = await request.post("/__test/state", {
      data: { userRole: "admin", skywireChatEnabled: false, skywireHandle: "missing.bsky.social" },
    });
    expect(res.ok()).toBeTruthy();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });

    await page.goto("/skywire?tab=account", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("@missing.bsky.social").first()).toBeVisible();
    await page.getByRole("button", { name: "Enable Chat Add-on" }).click();
    await expect(page.getByRole("dialog", { name: "Choose Skywire permissions" })).toBeVisible();
    await page.getByRole("button", { name: "Continue to Bluesky OAuth" }).click();

    await expect(page.getByText("Bluesky could not find @missing.bsky.social. Check the spelling or connect a real Bluesky account.")).toBeVisible();
    await expect(page.getByText("Connection & permissions")).toBeVisible();
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("same-window OAuth callback keeps settings open and reflects durable chat permission", async ({ page, request }) => {
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

    const callbackUrl =
      "/skywire?tab=account&verified=atproto&handle=wtf-admin.bsky.social&permissionTier=be-bold&chat=1" +
      "&requestedScope=atproto%20transition%3Ageneric%20chat.bsky" +
      "&grantedScope=atproto%20transition%3Ageneric%20chat.bsky&accountId=1";
    await page.goto(callbackUrl, { waitUntil: "domcontentloaded" });

    await expect(page.getByText("Skywire Chat Add-on enabled for @wtf-admin.bsky.social.")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("DM add-on on")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enable Chat Add-on" })).toHaveCount(0);
    await expect(page.getByText("Connection & permissions")).toBeVisible();

    await page.getByRole("button", { name: /Home/ }).click();
    await expect(page.locator("[data-skywire-feed-card='true']")).toHaveCount(3);
    expect(new URL(page.url()).searchParams.get("tab")).not.toBe("account");
    await page.evaluate(() => {
      const message = {
        type: "atproto_oauth_complete",
        app: "skywire",
        ok: true,
        handle: "wtf-admin.bsky.social",
        permissionTier: "be-bold",
        chatEnabled: true,
        requestedScope: "atproto transition:generic chat.bsky",
        grantedScope: "atproto transition:generic chat.bsky",
        accountId: 1,
        at: Date.now(),
      };
      const channel = new BroadcastChannel("skywire:atproto-oauth");
      channel.postMessage(message);
      channel.close();
      window.dispatchEvent(new StorageEvent("storage", { key: "skywire:atproto-linked", newValue: null }));
    });
    await page.waitForTimeout(1200);
    await expect(page.locator("[data-skywire-feed-card='true']")).toHaveCount(3);
    await expect(page.getByText("Connection & permissions")).toHaveCount(0);
    expect(fatalErrors(errors)).toEqual([]);
  });

  test("same-origin OAuth callback broadcasts completion to an already-open Skywire window", async ({
    page,
    request,
  }) => {
    const res = await request.post("/__test/state", {
      data: { userRole: "admin", skywireChatEnabled: false },
    });
    expect(res.ok()).toBeTruthy();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`original pageerror: ${error.message}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`original console: ${message.text()}`);
    });

    await page.goto("/skywire?tab=account", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("DM add-on off")).toBeVisible();
    await expect(page.getByText("Connection & permissions")).toBeVisible();

    const upgraded = await request.post("/__test/state", {
      data: { userRole: "admin", skywireChatEnabled: true },
    });
    expect(upgraded.ok()).toBeTruthy();

    const callbackPage = await page.context().newPage();
    callbackPage.on("pageerror", (error) => errors.push(`callback pageerror: ${error.message}`));
    callbackPage.on("console", (message) => {
      if (message.type() === "error") errors.push(`callback console: ${message.text()}`);
    });
    const callbackUrl =
      "/skywire?tab=account&verified=atproto&handle=wtf-admin.bsky.social&permissionTier=be-bold&chat=1" +
      "&requestedScope=atproto%20transition%3Ageneric%20chat.bsky" +
      "&grantedScope=atproto%20transition%3Ageneric%20chat.bsky&accountId=1";
    await callbackPage.goto(callbackUrl, { waitUntil: "domcontentloaded" });
    await expect(callbackPage.getByText("Skywire Chat Add-on enabled for @wtf-admin.bsky.social.")).toBeVisible({
      timeout: 15000,
    });

    await expect(page.getByText("Skywire Chat Add-on enabled for @wtf-admin.bsky.social.")).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText("DM add-on on")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enable Chat Add-on" })).toHaveCount(0);
    await callbackPage.close();
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
