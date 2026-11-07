import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const wallet = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const firstReturnWallet = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const secondReturnWallet = "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79";
const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const season = { key: "current-2026", startsAt: "2026-11-01T00:00:00.000Z", endsAt: null, label: "Neighvember 2026", inferred: false };
const archiveSeason = { key: "neighvember-2025", startsAt: "2025-11-01T00:00:00.000Z", endsAt: "2025-12-01T00:00:00.000Z", label: "Neighvember 2025", inferred: true };
const allTimeSeason = { key: "all-time", startsAt: "2023-07-30T00:00:00.000Z", endsAt: null, label: "All time", inferred: true };
const horsePortrait = readFileSync("public/horf-art/horse-portrait-photo.jpg");

function json(route, body, status = 200) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function mockSeason(page, getRiderName = () => null, includeRider = true) {
  await page.route("**/api/horf/season*", (route) => {
    const allTime = new URL(route.request().url()).searchParams.get("season") === "all-time";
    return json(route, {
      season: allTime ? allTimeSeason : season, seasons: [allTimeSeason, season, archiveSeason],
      asOf: "2026-11-03T12:00:00.000Z", status: "ready", error: null,
      nextRefreshAt: null,
      leaderboard: includeRider ? [{ address: wallet, name: getRiderName() || "Trail Rider", trades: allTime ? 12 : 3,
        received: allTime ? 7 : 2, sent: allTime ? 5 : 1 }] : [],
      currentUser: null,
    });
  });
  await page.route(/\/api\/horf\/open-range\?season=current-2026$/, (route) => json(route, { items: [] }));
}

async function mockConnectedWallet(page, onTokenRead = () => {}) {
  await page.addInitScript(({ address }) => {
    window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
  }, { address: wallet });
  await page.route("**/api/wallets", (route) => json(route, [{ walletAddress: wallet }]));
  await page.route(`**/api/wallets/${wallet}/sync`, (route) => json(route, { ok: true }));
  await page.route("**/api/horf/wallet/tokens?*", (route) => {
    onTokenRead(new URL(route.request().url()));
    return json(route, {
      items: [], pagination: { limit: 48, offset: 0, total: 0, hasMore: false, nextOffset: 0 },
    });
  });
  await page.route("**/api/horf/stable-selections?*", (route) => json(route, { selections: [] }));
  await page.route(/\/api\/horf\/horse-holders(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    return json(route, {
      address: url.searchParams.get("address"), contract: url.searchParams.get("contract"),
      tokenId: url.searchParams.get("tokenId"), checkedAt: new Date().toISOString(),
      members: url.searchParams.getAll("recipient").map((address) => ({ address, owns: false })),
    });
  });
}

async function mockReturnStable(page, owedTo, ownedBalance = "2") {
  await page.route("**/api/horf/season*", (route) => json(route, {
    season, seasons: [allTimeSeason, season, archiveSeason],
    asOf: "2026-11-05T12:00:00.000Z", status: "ready", error: null, nextRefreshAt: null,
    leaderboard: [{ address: wallet, name: "Trail Rider", trades: 4, received: 2, sent: 2 }],
    currentUser: {
      address: wallet, received: 2, sent: 2, trades: 4, completedTrades: 0,
      giftHorsesReceived: 0, tradeHorsesReceived: 2,
      owedTo, owedBy: [], waitingHorses: [], recent: [],
    },
  }));
  await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => json(route, {
    address: wallet,
    items: [{ contract, tokenId: "7", balance: ownedBalance, name: "Neighvember Seven",
      image: "/horf-art/horse-gallop-photo.jpg", mintedAt: season.startsAt, creatorAddress: wallet }],
    pagination: { hasMore: false, nextOffset: 1 },
  }));
  await page.route("**/api/horf/wallet/tokens?*", (route) => json(route, {
    items: [{ contract, tokenId: "7", balance: ownedBalance, walletAddress: wallet, name: "Neighvember Seven" }],
    pagination: { limit: 48, offset: 0, total: 1, hasMore: false, nextOffset: 1 },
  }));
}

test.describe("Horf Stable and trader profile", () => {
  test("marks created and received horses available with an explicit quantity and handles proposal replies", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockSeason(page);
    await page.route(/\/api\/horf\/traders\/[^/]+\/profile\?season=current-2026$/, (route) => json(route, {
      address: wallet, seasonKey: season.key, imageUrl: null, description: "", updatedAt: null,
      username: null, displayName: null, usernameSource: "wallet", canEditUsername: true,
    }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => json(route, {
      address: wallet, items: [
        { contract, tokenId: "41", balance: "3", name: "My Mare", image: "/horf-art/horse-gallop-photo.jpg", creatorAddress: wallet },
        { contract, tokenId: "42", balance: "2", name: "Received Pinto", image: "/horf-art/horse-beach-photo.jpg", creatorAddress: firstReturnWallet },
      ], pagination: { hasMore: false, nextOffset: 2 },
    }));
    const posts = [];
    await page.route("**/api/horf/open-range/offers?*", (route) => json(route, { offers: posts.map((post, index) => ({ ...post, id: index + 1 })) }));
    await page.route("**/api/horf/open-range/offers", (route) => {
      if (route.request().method() !== "POST") return json(route, { offers: [] });
      posts.push(route.request().postDataJSON());
      return json(route, { id: posts.length });
    });
    await page.route("**/api/horf/open-range/offers/1", (route) => {
      posts.splice(0, 1);
      return route.fulfill({ status: 204, body: "" });
    });
    await page.route("**/api/horf/rooms?*", (route) => json(route, { status: "ready", network: "mainnet", chainId: "NetXdQprcVkpaWU",
      contractAddress: "KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P", permitReady: true,
      listings: [{ id: "5", mode: 2, tokenContract: contract, tokenId: "41", publicVisible: true }] }));
    await page.route("**/api/horf/horse-market/listings", (route) => json(route, { listings: [{ id: "8", tokenContract: contract, tokenId: "42" }] }));
    await page.route("**/api/horf/wallet/tokens?*", (route) => {
      const tokenId = new URL(route.request().url()).searchParams.get("q")?.match(/\b(41|42)\b/)?.[1] ?? "41";
      return json(route, { items: [{ contract, tokenId, balance: tokenId === "41" ? "3" : "2", walletAddress: wallet, name: tokenId === "41" ? "My Mare" : "Received Pinto" }], pagination: { hasMore: false, nextOffset: 1 } });
    });
    await page.route("**/api/horf/inspections/status?*", (route) => json(route, { contract, tokenId: "41", status: "none", inspectionId: null, reason: null }));
    await page.route("**/api/horf/stable-selections", (route) => route.request().method() === "POST"
      ? json(route, { id: 12 }) : json(route, { selections: [] }));
    await page.route("**/api/horf/inspections", (route) => json(route, { status: "pending" }));
    const incoming = [{ id: 9, signId: 1, offererAddress: firstReturnWallet, ownerAddress: wallet,
      requestedTokenContract: contract, requestedTokenId: "41", offeredTokenContract: contract,
      offeredTokenId: "77", message: "Trade, pardner?", status: "proposed", signActive: true,
      privateListingId: null, acceptOperationHash: null, fulfillOperationHash: null, declineReason: null,
      createdAt: "2026-11-05T12:00:00Z", updatedAt: "2026-11-05T12:00:00Z" }];
    const outgoing = [{ ...incoming[0], id: 10, ownerAddress: secondReturnWallet, offererAddress: wallet,
      signId: 2, status: "proposed" }];
    await page.route("**/api/horf/trade-offers?*", (route) => json(route, {
      offers: new URL(route.request().url()).searchParams.get("box") === "incoming" ? incoming : outgoing,
    }));
    await page.route("**/api/horf/trade-offers/9/decline", (route) => {
      expect(route.request().postDataJSON()).toEqual({ address: wallet });
      incoming[0].status = "declined"; return json(route, { offer: incoming[0] });
    });
    await page.route("**/api/horf/trade-offers/10/cancel", (route) => {
      expect(route.request().postDataJSON()).toEqual({ address: wallet });
      outgoing[0].status = "cancelled"; return json(route, { offer: outgoing[0] });
    });

    await page.goto("/horf/stable?season=current-2026");
    const stable = page.locator('[data-horf-region="personal-stable"]');
    const created = stable.locator('[data-horf-stable-created] [data-horf-stable-horse]');
    const received = stable.locator('[data-horf-stable-received] [data-horf-stable-horse]');
    await expect(created).toHaveCount(1);
    await expect(received).toHaveCount(1);
    await expect(created.locator('[data-horf-stable-for-trade-now]')).toHaveAttribute("href", /market=outlaw&outlaw=rooms&listing=5$/);
    await expect(received.locator('[data-horf-stable-for-trade-now]')).toHaveAttribute("href", /market=horse4horse&listing=8$/);
    await expect(created.locator("[data-horf-stable-sell-horse]")).toHaveAttribute("href", /market=horse4horse&sell=KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton%3A41$/);
    await expect(created.locator("[data-horf-stable-room-horse]")).toHaveAttribute("href", /market=outlaw&outlaw=rooms&deposit=KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton%3A41$/);
    await created.locator("[data-horf-stable-direct-send]").click();
    const quickSend = page.locator("[data-horf-quick-send-dialog]");
    await expect(quickSend).toBeVisible();
    await expect(quickSend.locator("[data-horf-gift-owned]")).toHaveValue(`${contract}:41`);
    await expect(quickSend.locator("[data-horf-quick-direct-recipient]")).toHaveCount(1);
    await quickSend.locator("[data-horf-quick-direct-wallet]").fill(firstReturnWallet);
    await expect(quickSend.locator("[data-horf-gift-submit]")).toBeEnabled();
    await quickSend.locator("[data-horf-gift-submit]").click();
    const oneRiderReview = quickSend.locator("[data-horf-gift-review]");
    await expect(oneRiderReview).toContainText(firstReturnWallet);
    await expect(oneRiderReview).toContainText("1 rider");
    await oneRiderReview.getByRole("button", { name: "Edit horse or quantity" }).click();
    await quickSend.locator("[data-horf-quick-direct-add-recipient]").click();
    await expect(quickSend.locator("[data-horf-quick-direct-recipient]")).toHaveCount(2);
    await quickSend.locator("[data-horf-quick-direct-wallet]").nth(1).fill(secondReturnWallet);
    await expect(quickSend.locator("[data-horf-gift-submit]")).toBeEnabled();
    await quickSend.locator("[data-horf-gift-submit]").click();
    await expect(quickSend.locator("[data-horf-gift-review]")).toContainText(firstReturnWallet);
    await expect(quickSend.locator("[data-horf-gift-review]")).toContainText(secondReturnWallet);
    await quickSend.locator("[data-horf-quick-send-close]").click();
    await created.locator("[data-horf-stable-request-inspection]").click();
    await expect(created.locator("[data-horf-stable-inspection-result]")).toContainText("Sent to the Marshal’s review queue");
    await expect(created.locator("[data-horf-stable-approval-status]")).toContainText("Marshal review pending");
    await created.locator('[data-horf-stable-mark-available]').click();
    const form = stable.locator('[data-horf-stable-availability]');
    await expect(form.locator('[data-horf-stable-available-amount]')).toHaveValue("0");
    await form.locator('[data-horf-stable-available-amount]').fill("2");
    await form.locator('input[value="marshal_only"]').check();
    await form.locator('[data-horf-stable-availability-submit]').click();
    await expect(stable).toContainText("My Mare marked available");
    await expect(created.locator('[data-horf-stable-available-status]')).toContainText("Available · 2 editions");
    await received.locator('[data-horf-stable-mark-available]').click();
    await form.locator('[data-horf-stable-available-amount]').fill("1");
    await form.locator('[data-horf-stable-availability-submit]').click();
    expect(posts).toEqual([
      { address: wallet, tokenContract: contract, tokenId: "41", amount: "2", acceptedTokenPolicy: "marshal_only" },
      { address: wallet, tokenContract: contract, tokenId: "42", amount: "1", acceptedTokenPolicy: "any_qualifying" },
    ]);
    await created.locator('[data-horf-stable-remove-availability]').click();
    await expect(created.locator('[data-horf-stable-available-status]')).toHaveCount(0);
    const inbox = stable.locator('[data-horf-trade-inbox]');
    await expect(inbox.locator('[data-horf-trade-incoming] [data-horf-trade-offer]')).toHaveCount(1);
    await inbox.locator('[data-horf-trade-incoming] [data-horf-trade-decline]').click();
    await expect(inbox.locator('[data-horf-trade-incoming] [data-horf-trade-offer]')).toContainText("declined");
    await inbox.locator('[data-horf-trade-outgoing] [data-horf-trade-cancel]').click();
    await expect(inbox.locator('[data-horf-trade-outgoing] [data-horf-trade-offer]')).toContainText("cancelled");
  });

  test("restores a confirmed private escrow proof and opens its pinned horse terms", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockSeason(page);
    await page.addInitScript(({ address }) => window.localStorage.setItem(`horf:confirmed-trade-proof:${address}`,
      JSON.stringify([{ id: 9, kind: "accept", operationHash: "ooConfirmedHorseDeposit" }])), { address: wallet });
    const incoming = { id: 9, signId: 1, offererAddress: firstReturnWallet, ownerAddress: wallet,
      requestedTokenContract: contract, requestedTokenId: "41", offeredTokenContract: contract,
      offeredTokenId: "77", message: null, status: "proposed", signActive: true,
      privateListingId: null, acceptOperationHash: null, fulfillOperationHash: null, declineReason: null,
      createdAt: "2026-11-05T12:00:00Z", updatedAt: "2026-11-05T12:00:00Z" };
    await page.route("**/api/horf/trade-offers?*", (route) => json(route, {
      offers: new URL(route.request().url()).searchParams.get("box") === "incoming" ? [incoming] : [],
    }));
    let proofCalls = 0;
    await page.route("**/api/horf/trade-offers/9/accept", (route) => {
      proofCalls += 1;
      expect(route.request().postDataJSON()).toEqual({ address: wallet, operationHash: "ooConfirmedHorseDeposit" });
      if (proofCalls === 1) return json(route, { error: "Indexer is catching up" }, 409);
      incoming.status = "accepted"; incoming.privateListingId = "19";
      return json(route, { offer: incoming });
    });
    const privateEntry = { listing: { id: "19", mode: 3, owner: wallet, tokenContract: contract,
      tokenId: "41", submitted: "1", remaining: "1", claimedByWallet: false },
      terms: { offerer: firstReturnWallet, inputTokenContract: contract, inputTokenId: "77" } };
    await page.route("**/api/horf/rooms/private?*", (route) => json(route, { contractAddress: "KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P",
      chainId: "NetXdQprcVkpaWU", listings: [privateEntry] }));
    await page.route("**/api/horf/rooms/private/19?*", (route) => json(route, { ...privateEntry,
      token: { name: "My Mare", image: "/horf-art/horse-gallop-photo.jpg" } }));
    await page.route("**/api/horf/rooms?*", (route) => json(route, { status: "ready", network: "mainnet", chainId: "NetXdQprcVkpaWU",
      contractAddress: "KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P", permitReady: true, listings: [] }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => json(route, {
      address: wallet, items: [], pagination: { hasMore: false, nextOffset: 0 },
    }));

    await page.goto("/horf/stable?season=current-2026");
    const inbox = page.locator('[data-horf-trade-inbox]');
    await expect.poll(() => proofCalls).toBe(1);
    await expect(inbox.locator('[data-horf-trade-record-proof]')).toBeVisible();
    await expect(inbox.locator('[data-horf-private-unmatched]')).toHaveCount(1);
    await expect.poll(() => page.evaluate((address) => JSON.parse(window.localStorage.getItem(`horf:confirmed-trade-proof:${address}`) || "[]").length, wallet)).toBe(1);
    await inbox.locator('[data-horf-trade-record-proof]').click();
    await expect.poll(() => proofCalls).toBe(2);
    await expect(inbox.locator('[data-horf-private-unmatched]')).toHaveCount(0);
    const privateLink = inbox.locator('[data-horf-private-link]');
    await expect(privateLink).toBeVisible();
    await privateLink.click();
    await expect(inbox.locator('[data-horf-private-detail]')).toContainText("Only horse #77");
    await expect(inbox.locator('[data-horf-private-return]')).toBeVisible();
    await expect.poll(() => page.evaluate((address) => window.localStorage.getItem(`horf:confirmed-trade-proof:${address}`), wallet)).toBeNull();
  });

  test("waits to attach a Stable video source until its horse card is visible", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await page.setViewportSize({ width: 390, height: 480 });
    await mockConnectedWallet(page);
    await mockSeason(page);
    await page.route(/\/api\/horf\/traders\/[^/]+\/profile\?season=current-2026$/, (route) => json(route, {
      address: wallet, seasonKey: season.key, imageUrl: null, description: "", updatedAt: null,
      username: null, displayName: null, usernameSource: "wallet", canEditUsername: true,
    }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => json(route, {
      address: wallet,
      items: [
        ...Array.from({ length: 4 }, (_, index) => ({
          contract, tokenId: String(index + 1), balance: "1", name: `Horse ${index + 1}`,
          image: "/horf-art/horse-gallop-photo.jpg", mintedAt: season.startsAt,
        })),
        { contract, tokenId: "5", balance: "1", name: "Video Horse", image: null,
          artifactUri: "/horf-art/horse-gallop-photo.jpg", mime: "video/mp4", mintedAt: season.startsAt },
      ],
      pagination: { hasMore: false, nextOffset: 5 },
    }));
    await page.goto("/horf/stable?season=current-2026");
    const video = page.locator("[data-horf-stable-horse]").filter({ hasText: "Video Horse" }).locator("video");
    await expect(video).toHaveAttribute("preload", "none");
    await expect(video).not.toHaveAttribute("src", /.+/);
    await video.scrollIntoViewIfNeeded();
    await expect(video).toHaveAttribute("src", "/horf-art/horse-gallop-photo.jpg");
    await expect(video).toHaveAttribute("preload", "metadata");
  });

  test("gives a disconnected rider clear Stable directions and retains a separate public race", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(state.ok()).toBeTruthy();
    await mockSeason(page);
    await page.goto("/horf/stable?season=current-2026");
    const stable = page.locator('[data-horf-region="personal-stable"]');
    await expect(stable).toBeVisible();
    await expect(stable.locator("[data-horf-profile-connect]")).toBeVisible();
    await expect(stable.locator("[data-horf-profile-connect]")).toContainText(/connect/i);
    await page.goto("/horf/race?season=current-2026");
    await expect(page.locator('[data-horf-region="race"]')).toBeVisible();
  });

  test("shows completed trades in My Stable while the race counts all horse transfers", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockSeason(page);
    const recent = [
      ...Array.from({ length: 6 }, (_, index) => ({ id: index + 1, timestamp: `2026-11-05T10:00:${String(index).padStart(2, "0")}.000Z`,
        direction: "out", counterparty: firstReturnWallet, token: { contract, tokenId: "4", name: "Return Mare" }, amount: 1 })),
      ...Array.from({ length: 6 }, (_, index) => ({ id: index + 7, timestamp: `2026-11-05T11:00:${String(index).padStart(2, "0")}.000Z`,
        direction: "in", counterparty: firstReturnWallet, token: { contract, tokenId: "5", name: "Bay Pony" }, amount: 1 })),
      { id: 13, timestamp: "2026-11-05T12:00:00.000Z", direction: "in", counterparty: secondReturnWallet,
        token: { contract, tokenId: "6", name: "Gift Filly" }, amount: 1, settlement: "gift" },
    ];
    await page.route("**/api/horf/horse/rewards?*", (route) => json(route, {
      season: "current-2026", rateHorse: "10", countedUnits: "6",
      accruedRaw: "6000000000", claimedRaw: "5000000000", claimableRaw: "1000000000",
      sourceDiscrepancies: "0", sourceComplete: true, asOf: "2026-11-05T12:00:00.000Z",
      status: "ready", claimReady: true,
      bySource: [{ kind: "direct", units: "5", amountRaw: "5000000000" },
        { kind: "market", units: "1", amountRaw: "1000000000" }],
    }));
    await page.route("**/api/horf/season*", (route) => json(route, {
      season, seasons: [allTimeSeason, season, archiveSeason],
      asOf: "2026-11-05T12:00:00.000Z", status: "ready", error: null, nextRefreshAt: null,
      leaderboard: [{ address: wallet, name: "Trail Rider", trades: 13, received: 7, giftHorsesReceived: 1, tradeHorsesReceived: 6, sent: 6 }],
      currentUser: {
        address: wallet, received: 7, giftHorsesReceived: 1, tradeHorsesReceived: 6,
        sent: 6, trades: 13, completedTrades: 6,
        owedTo: [], owedBy: [], waitingHorses: [], recent,
      },
    }));

    await page.goto("/horf/stable?season=current-2026");
    const ledger = page.locator('[data-horf-region="trader-ledger"]');
    await expect(ledger.getByText("Horses received", { exact: true }).locator("..").locator("strong")).toHaveText("7");
    await expect(ledger.getByText("Horses sent", { exact: true }).locator("..").locator("strong")).toHaveText("6");
    await expect(ledger.getByText("Completed trades", { exact: true }).locator("..").locator("strong")).toHaveText("6");
    const receivedBreakdown = ledger.locator("[data-horf-received-breakdown]");
    const giftChip = receivedBreakdown.getByRole("note", { name: "1 gift horses received" });
    const tradeChip = receivedBreakdown.getByRole("note", { name: "6 trade horses received" });
    await expect(giftChip).toContainText("🎁1");
    await expect(tradeChip).toContainText("🤝6");
    await expect(giftChip).toHaveAccessibleDescription(/no return ride is expected/i);
    await expect(tradeChip).toHaveAccessibleDescription(/does not mean the return trade is complete/i);

    await page.goto("/horf/race?season=current-2026");
    const lane = page.locator('[data-horf-region="race"] [data-horf-lane]');
    await expect(lane).toHaveAttribute("data-horf-trades", "13");
    await expect(lane).toContainText(/13\s*transfers/);
    await expect(lane.locator("[data-horf-race-split]")).toContainText("6 sent · ↓ 7 received");

    await page.route(/\/api\/horf\/traders\/[^/]+\/profile\?season=current-2026$/, (route) => json(route, {
      address: wallet, seasonKey: season.key, imageUrl: null, description: "", updatedAt: null,
      username: "Trail Rider", displayName: "Trail Rider", usernameSource: "horf", canEditUsername: true,
    }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/offers(?:\?.*)?$/, (route) => json(route, {
      address: wallet, metadataStatus: "ready", offers: [],
    }));
    await page.goto(`/horf/traders/${wallet}?season=current-2026`);
    const profile = page.locator('[data-horf-region="trader-profile"]');
    const activity = profile.locator("[data-horf-profile-activity]");
    await expect(activity.locator('[data-horf-profile-stat="rank"] strong')).toHaveText("#1");
    await expect(activity.locator('[data-horf-profile-stat="sent"] strong')).toHaveText("6");
    await expect(activity.locator('[data-horf-profile-stat="received"] strong')).toHaveText("7");
    await expect(activity.locator('[data-horf-profile-stat="completed"] strong')).toHaveText("6");
    const rewards = activity.locator("[data-horf-profile-rewards]");
    await expect(rewards.locator('[data-horf-reward="sends"] strong')).toHaveText("6");
    await expect(rewards.locator('[data-horf-reward="accrued"] strong')).toHaveText("60");
    await expect(rewards.locator('[data-horf-reward="claimed"] strong')).toHaveText("50");
    await expect(rewards.locator('[data-horf-reward="claimable"] strong')).toHaveText("10");
    await expect(rewards).toContainText("HORSE Market sales · 1 edition · 10 HORSE");
    await activity.locator("[data-horf-profile-trail] summary").click();
    await expect(activity.locator("[data-horf-profile-trail]")).toContainText("Gift Filly");
    await expect(activity.locator("[data-horf-profile-trail]")).toContainText("Gift · From");
    await profile.locator('[data-horf-profile-tab="received"]').click();
    await expect(profile.locator("[data-horf-profile-received-summary]")).toContainText("7 horse editions received");
    const profileBreakdown = profile.locator("#horf-profile-panel > [data-horf-received-breakdown]");
    await expect(profileBreakdown.getByRole("note", { name: "1 gift horses received" })).toContainText("🎁1");
    await expect(profileBreakdown.getByRole("note", { name: "6 trade horses received" })).toContainText("🤝6");
    await expect(profileBreakdown.getByRole("note", { name: "1 gift horses received" })).toHaveAccessibleDescription(/no return ride is expected/i);
    await expect(profileBreakdown.getByRole("note", { name: "6 trade horses received" })).toHaveAccessibleDescription(/does not mean the return trade is complete/i);
  });

  test("reviews one horse edition for each rider awaiting a return in one wallet operation", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockReturnStable(page, [
      { address: firstReturnWallet, name: "Sir Canter", count: 1 },
      { address: secondReturnWallet, name: "Mare Force", count: 1 },
    ]);
    await page.route(/\/api\/horf\/horse-holders(?:\?.*)?$/, (route) => {
      const url = new URL(route.request().url());
      expect(url.searchParams.get("address")).toBe(wallet);
      expect(url.searchParams.get("contract")).toBe(contract);
      expect(url.searchParams.get("tokenId")).toBe("7");
      expect(url.searchParams.getAll("recipient")).toEqual([firstReturnWallet, secondReturnWallet]);
      return json(route, { address: wallet, contract, tokenId: "7", checkedAt: new Date().toISOString(), members: [
        { address: firstReturnWallet, owns: false }, { address: secondReturnWallet, owns: false },
      ] });
    });

    await page.goto("/horf/stable?season=current-2026");
    const ledger = page.locator('[data-horf-region="trader-ledger"]');
    const stable = page.locator('[data-horf-region="personal-stable"]');
    await expect(ledger.locator("[data-horf-received-breakdown]")).toContainText("🤝2");
    expect(await ledger.evaluate((element, horseGallery) => Boolean(element.compareDocumentPosition(document.querySelector(horseGallery)) & Node.DOCUMENT_POSITION_FOLLOWING), '[data-horf-region="personal-stable"]')).toBeTruthy();
    await expect(stable.locator("[data-horf-stable-inspection-workroom]")).not.toHaveAttribute("open", "");
    const batchReturn = ledger.locator("[data-horf-batch-return]");
    await expect(batchReturn).toBeVisible();
    await batchReturn.click();
    const dialog = page.locator("[data-horf-quick-send-dialog]");
    await expect(dialog).toBeVisible();
    const riders = dialog.locator("[data-horf-quick-batch-recipient]");
    await expect(riders).toHaveCount(2);
    await expect(riders.nth(0)).toContainText(firstReturnWallet);
    await expect(riders.nth(1)).toContainText(secondReturnWallet);
    await expect(dialog).toContainText("single Mainnet wallet transaction");

    await dialog.locator("[data-horf-gift-owned]").selectOption(`${contract}:7`);
    await dialog.locator("[data-horf-gift-submit]").click();
    const review = dialog.locator("[data-horf-gift-review]");
    await expect(review).toContainText("Neighvember Seven");
    await expect(review.locator("li")).toHaveCount(2);
    await expect(review.locator("li").nth(0)).toContainText("1 edition");
    await expect(review.locator("li").nth(0)).toContainText(firstReturnWallet);
    await expect(review.locator("li").nth(1)).toContainText("1 edition");
    await expect(review.locator("li").nth(1)).toContainText(secondReturnWallet);
    await expect(review).toContainText("2 of 2 owned editions · 2 riders");
    await expect(review).toContainText("one Mainnet transfer");
    await expect(review.locator("[data-horf-gift-confirm]")).toBeEnabled();
  });

  test("warns when a batch recipient already owns the chosen horse and lets the rider choose a safe subset", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockReturnStable(page, [
      { address: firstReturnWallet, name: "Sir Canter", count: 1 },
      { address: secondReturnWallet, name: "Mare Force", count: 1 },
    ]);
    await page.route(/\/api\/horf\/horse-holders(?:\?.*)?$/, (route) => {
      const url = new URL(route.request().url());
      return json(route, { address: wallet, contract, tokenId: "7", checkedAt: new Date().toISOString(),
        members: url.searchParams.getAll("recipient").map((address) => ({ address, owns: address === secondReturnWallet })) });
    });

    await page.goto("/horf/stable?season=current-2026");
    await page.locator("[data-horf-batch-return]").click();
    const dialog = page.locator("[data-horf-quick-send-dialog]");
    await dialog.locator("[data-horf-gift-owned]").selectOption(`${contract}:7`);
    await expect(dialog.locator("[data-horf-return-holder-warning]")).toContainText("already owns this horse");
    const riders = dialog.locator("[data-horf-quick-batch-recipient]");
    await expect(riders.nth(1).locator("[data-horf-return-holder-owned]")).toContainText("Send anyway");
    await expect(dialog.locator("[data-horf-gift-submit]")).toBeDisabled();

    await riders.nth(1).locator("[data-horf-return-recipient-toggle]").uncheck();
    await expect(dialog.locator("[data-horf-return-holder-warning]")).toHaveCount(0);
    await expect(dialog.locator("[data-horf-gift-submit]")).toBeEnabled();
    await dialog.locator("[data-horf-gift-submit]").click();
    const review = dialog.locator("[data-horf-gift-review]");
    await expect(review.locator("li")).toHaveCount(1);
    await expect(review).toContainText(firstReturnWallet);
    await expect(review).not.toContainText(secondReturnWallet);
  });

  test("shows the batch return action for one owed rider and requires consent for a horse they own", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockReturnStable(page, [{ address: firstReturnWallet, name: "Sir Canter", count: 1 }], "1");
    await page.route(/\/api\/horf\/horse-holders(?:\?.*)?$/, (route) => json(route, {
      address: wallet, contract, tokenId: "7", checkedAt: new Date().toISOString(),
      members: [{ address: firstReturnWallet, owns: true }],
    }));

    await page.goto("/horf/stable?season=current-2026");
    const batchReturn = page.locator("[data-horf-batch-return]");
    await expect(batchReturn).toBeVisible();
    await batchReturn.click();
    const dialog = page.locator("[data-horf-quick-send-dialog]");
    await expect(dialog.locator("[data-horf-quick-batch-recipient]")).toHaveCount(1);
    await dialog.locator("[data-horf-gift-owned]").selectOption(`${contract}:7`);
    await expect(dialog.locator("[data-horf-return-holder-warning]")).toContainText("already owns this horse");
    await expect(dialog.locator("[data-horf-gift-submit]")).toBeDisabled();
    await dialog.locator("[data-horf-return-holder-owned] input[type=checkbox]").check();
    await expect(dialog.locator("[data-horf-return-holder-warning]")).toHaveCount(0);
    await dialog.locator("[data-horf-gift-submit]").click();
    await expect(dialog.locator("[data-horf-gift-review]")).toContainText(firstReturnWallet);
    await expect(dialog.locator("[data-horf-gift-review]")).toContainText("1 of 1 owned editions · 1 rider");
  });

  test("prioritizes selected-season mints and receipts in a return picker without hiding other held horses", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await mockConnectedWallet(page);
    const archiveWithoutExplicitEnd = { ...archiveSeason, endsAt: null };
    await page.route("**/api/horf/season*", (route) => json(route, {
      season: archiveWithoutExplicitEnd, seasons: [allTimeSeason, season, archiveWithoutExplicitEnd],
      asOf: "2026-11-05T12:00:00.000Z", status: "ready", error: null, nextRefreshAt: null,
      leaderboard: [{ address: wallet, name: "Trail Rider", trades: 2, received: 1, sent: 1 }],
      currentUser: { address: wallet, received: 1, sent: 1, trades: 2, completedTrades: 0,
        giftHorsesReceived: 0, tradeHorsesReceived: 1,
        owedTo: [{ address: firstReturnWallet, name: "Sir Canter", count: 1 }],
        owedBy: [], waitingHorses: [], recent: [{ id: "archive-receipt", timestamp: "2025-11-09T12:00:00.000Z",
          direction: "in", counterparty: firstReturnWallet,
          token: { contract, tokenId: "73", name: "Archive Pinto", image: "/horf-art/horse-beach-photo.jpg" },
          amount: 1, settlement: "stable", stableMode: 0 }] },
    }));
    const observedOffsets = [];
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => {
      const offset = Number(new URL(route.request().url()).searchParams.get("offset") || 0);
      observedOffsets.push(offset);
      return json(route, { address: wallet, items: offset === 0 ? [
        { contract, tokenId: "70", balance: "2", name: "Current Colt", mintedAt: "2026-11-02T12:00:00.000Z", creatorAddress: wallet, image: "/horf-art/horse-gallop-photo.jpg" },
        { contract, tokenId: "71", balance: "1", name: "Undated Pony", mintedAt: null, creatorAddress: wallet, image: "/horf-art/horse-beach-photo.jpg" },
      ] : [
        { contract, tokenId: "72", balance: "2", name: "Archive Mare", mintedAt: "2025-11-08T12:00:00.000Z", creatorAddress: wallet, image: "/horf-art/horse-portrait-photo.jpg" },
        { contract, tokenId: "73", balance: "1", name: "Archive Pinto", mintedAt: "2024-07-09T12:00:00.000Z", creatorAddress: secondReturnWallet, image: "/horf-art/horse-beach-photo.jpg" },
      ], pagination: { hasMore: offset === 0, nextOffset: offset === 0 ? 48 : 50 } });
    });
    await page.route("**/api/horf/wallet/tokens?*", (route) => {
      const chosen = new URL(route.request().url()).searchParams.get("q")?.match(/\b(70|71|72|73)\b/)?.[1] ?? "72";
      return json(route, { items: [{ contract, tokenId: chosen, balance: "2", walletAddress: wallet, name: "Archive Mare" }],
        pagination: { hasMore: false, nextOffset: 1 } });
    });

    await page.goto("/horf/stable?season=neighvember-2025");
    await page.locator("[data-horf-batch-return]").click();
    const dialog = page.locator("[data-horf-quick-send-dialog]");
    const picker = dialog.locator("[data-horf-gift-owned]");
    await expect(picker.locator("option")).toHaveCount(5);
    expect(observedOffsets).toContain(48);
    await expect(picker.locator("optgroup").nth(0)).toHaveAttribute("label", /Created.*Neighvember 2025/);
    await expect(picker.locator("optgroup").nth(0).locator("option")).toHaveAttribute("value", `${contract}:72`);
    await expect(picker.locator("optgroup").nth(1)).toHaveAttribute("label", /Received.*Neighvember 2025/);
    await expect(picker.locator("optgroup").nth(1).locator("option")).toHaveAttribute("value", `${contract}:73`);
    await expect(picker).toContainText("Current Colt");
    await expect(picker).toContainText("Undated Pony");
    await picker.selectOption(`${contract}:72`);
    await dialog.locator("[data-horf-gift-submit]").click();
    await expect(dialog.locator("[data-horf-gift-review]")).toContainText("Archive Mare");
    await expect(dialog.locator("[data-horf-gift-review]")).toContainText(firstReturnWallet);
  });

  test("disconnects a signed-in rider from the header and starts reconnecting from the same chip", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockSeason(page);
    await page.goto("/horf/stable?season=current-2026");
    const chip = page.locator("[data-horf-header-wallet]");
    await expect(chip).toHaveAttribute("data-horf-header-wallet-disconnect", "true");
    await expect(chip).toHaveAccessibleName(`Disconnect Tezos Mainnet wallet ${wallet}`);
    await expect(chip).toContainText("Disconnect");
    await chip.click();
    await expect(chip).toHaveAttribute("data-horf-header-wallet-connect", "true");
    await expect(chip).toHaveText("Reconnect & sync wallet");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("wtf:wallet-session"))).toBeNull();
    await expect(page.locator("[data-horf-profile-connect]")).toBeVisible();
    await chip.click();
    await expect(chip).toHaveText("Connecting…");
  });

  test("disconnects a verified guest from the header and offers reconnect", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockSeason(page);
    let verified = true;
    let disconnects = 0;
    await page.route("**/api/horf/wallet/session", (route) => json(route, {
      walletAddress: verified ? wallet : null, verified,
    }));
    await page.route("**/api/horf/wallet/disconnect", (route) => {
      verified = false;
      disconnects += 1;
      return json(route, { ok: true });
    });
    await page.goto("/horf/stable?season=current-2026");
    const chip = page.locator("[data-horf-header-wallet]");
    await expect(chip).toHaveAttribute("data-horf-header-wallet-disconnect", "true");
    await chip.click();
    await expect(chip).toHaveText("Reconnect & sync wallet");
    expect(disconnects).toBe(1);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("wtf:wallet-session"))).toBeNull();
  });

  test("lands a connected rider in their Stable and publishes their seasonal picture and note", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "admin" } });
    expect(state.ok()).toBeTruthy();
    await mockConnectedWallet(page);
    let saved = { address: wallet, seasonKey: season.key, imageUrl: null, description: "", updatedAt: null,
      username: null, displayName: null, usernameSource: "wallet", canEditUsername: true };
    await mockSeason(page, () => saved.displayName);
    const writes = [];
    let pictureUploads = 0;
    const offsets = [];
    const horseRefreshes = [];
    await page.route(/\/api\/horf\/traders\/[^/]+\/profile\?season=current-2026$/, (route) => {
      expect(new URL(route.request().url()).pathname).toBe(`/api/horf/traders/${wallet}/profile`);
      if (route.request().method() === "PUT") {
        const body = route.request().postDataJSON();
        writes.push(body);
        saved = { ...saved, ...body, displayName: body.username || null,
          usernameSource: body.username ? "horf" : "wallet", updatedAt: "2026-11-03T12:01:00.000Z" };
      }
      return json(route, saved);
    });
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => {
      const offset = Number(new URL(route.request().url()).searchParams.get("offset") || 0);
      offsets.push(offset);
      horseRefreshes.push(new URL(route.request().url()).searchParams.get("refresh"));
      return json(route, {
        address: wallet,
        items: offset === 0 ? [] : [{ contract, tokenId: "7", balance: "2", viewerBalance: "2", name: "Neighvember Seven", image: "/horf-art/horse-gallop-photo.jpg", description: "Horse art", creatorAddress: wallet }],
        pagination: { hasMore: offset === 0, nextOffset: offset === 0 ? 48 : 49 },
      });
    });
    await page.route(/\/api\/horf\/traders\/[^/]+\/offers(?:\?.*)?$/, (route) => json(route, { address: wallet, metadataStatus: "ready", offers: [] }));
    await page.route(/\/api\/horf\/open-range\/offers(?:\?.*)?$/, (route) => json(route, { offers: [] }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/profile-picture(?:\?.*)?$/, (route) => {
      if (route.request().method() === "POST") {
        pictureUploads += 1;
        expect(route.request().headers()["content-type"]).toContain("multipart/form-data");
        saved = { ...saved, imageUrl: `/api/horf/traders/${wallet}/profile-picture?v=abcdef123456` };
        return json(route, saved);
      }
      return route.fulfill({ status: 200, contentType: "image/jpeg", body: horsePortrait });
    });

    await page.goto("/horf?season=current-2026");
    const app = page.locator("[data-horf-app]");
    await expect(app).toHaveAttribute("data-horf-page", "stable");
    const headerWallet = page.locator("[data-horf-header-wallet]");
    await expect(headerWallet).toBeVisible();
    await expect(headerWallet).toHaveAttribute("title", new RegExp(wallet));
    const stable = page.locator('[data-horf-region="personal-stable"]');
    await expect(stable).toBeVisible();
    await expect(stable.locator("[data-horf-profile-editor]")).toBeVisible();
    await expect(stable.locator("[data-horf-stable-wallet-status]")).toContainText("WTF OS linked · browser wallet selected");
    await expect(stable.locator("[data-horf-stable-wallet-status] code")).toHaveAttribute("title", wallet);
    await expect(stable.locator("[data-horf-stable-reconnect]")).toBeVisible();
    await expect(stable.locator("[data-horf-profile-wallet]")).toContainText(wallet);
    await expect.poll(() => offsets).toContain(48);
    await expect(stable.locator("[data-horf-stable-horse]")).toContainText("Neighvember Seven");
    await expect(stable.locator("[data-horf-stable-scan-complete]")).toContainText("Showing 1 horse · scan complete");
    await expect(stable.locator("[data-horf-stable-horse] [data-horf-edition-holdings]")).toContainText("You own 2 editions");
    expect(horseRefreshes.every((value) => value === null)).toBe(true);
    await stable.locator("[data-horf-stable-refresh]").click();
    await expect.poll(() => horseRefreshes.includes("1")).toBe(true);
    await expect(stable.locator("[data-horf-stable-scan-complete]")).toContainText("Showing 1 horse · scan complete");

    const picture = "https://cdn.objkt.com/test/horf-profile.jpg";
    await page.route(picture, (route) => route.fulfill({ status: 200, contentType: "image/jpeg", body: horsePortrait }));
    await stable.locator("[data-horf-profile-photo-input]").fill(picture);
    await stable.locator("[data-horf-profile-username]").fill("Saddle Scout");
    await stable.locator("[data-horf-profile-description]").fill("Riding the Neighvember trail with every pony in the posse.");
    await stable.locator("[data-horf-profile-save]").click();
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0]).toEqual({ imageUrl: picture, username: "Saddle Scout",
      description: "Riding the Neighvember trail with every pony in the posse." });
    await expect(stable.locator("[data-horf-profile-name]")).toHaveText("Saddle Scout");
    await expect(stable.locator("[data-horf-profile-description-preview]")).toHaveText("Riding the Neighvember trail with every pony in the posse.");
    await expect(stable.locator("[data-horf-profile-description]")).toHaveCount(0);
    await stable.locator("[data-horf-profile-edit]").click();
    await stable.locator("[data-horf-profile-description]").fill("An unsaved trail note still in my saddlebag.");
    await stable.locator("[data-horf-profile-upload]").setInputFiles({
      name: "trail-horse.jpg", mimeType: "image/jpeg", buffer: horsePortrait,
    });
    await expect.poll(() => pictureUploads).toBe(1);
    await expect(stable.locator("[data-horf-profile-description]")).toHaveValue("An unsaved trail note still in my saddlebag.");
    await stable.getByRole("button", { name: "Cancel" }).click();
    await expect(stable.locator("[data-horf-profile-description-preview]")).toHaveText("Riding the Neighvember trail with every pony in the posse.");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator("[data-horf-primary]").evaluate((node) => { node.scrollTop = 0; });
    await page.screenshot({ path: "/tmp/horf-stable-profile-desktop.png", fullPage: true });
    await page.screenshot({ path: "/tmp/horf-stable-profile-desktop-viewport.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator("[data-horf-primary]").evaluate((node) => { node.scrollTop = 0; });
    await expect(page.locator("[data-horf-right-rail]")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "/tmp/horf-stable-profile-mobile.png", fullPage: true });
    await page.screenshot({ path: "/tmp/horf-stable-profile-mobile-viewport.png" });

    await page.goto(`/horf/traders/${wallet}?season=current-2026`);
    const publicProfile = page.locator('[data-horf-region="trader-profile"]');
    await expect(publicProfile.locator("[data-horf-profile-name]")).toHaveText("Saddle Scout");
    await expect(publicProfile.locator("[data-horf-profile-wallet]")).toContainText(wallet);
    await expect(publicProfile.locator("[data-horf-profile-wallet]").getByRole("button", { name: /Copy Tezos wallet/ })).toBeVisible();
    await expect(publicProfile).toContainText("Riding the Neighvember trail with every pony in the posse.");
    await expect(publicProfile.locator("[data-horf-profile-picture]")).toHaveAttribute("src", saved.imageUrl);
    await publicProfile.locator('[data-horf-profile-tab="all-horses"]').click();
    await expect(publicProfile.locator("[data-horf-profile-horse]")).toHaveCount(0);
    await publicProfile.getByRole("button", { name: "Load more horses" }).click();
    await expect(publicProfile.locator("[data-horf-profile-horse]")).toContainText("Neighvember Seven");
    await expect(publicProfile.locator("[data-horf-profile-horse] [data-horf-edition-holdings]")).toHaveText("Trader owns 2 editions · You own 2 editions");
    await page.goto("/horf/traders?season=current-2026");
    await expect(page.locator('[data-horf-region="trader-directory"]')).toContainText("Saddle Scout");
    await page.goto("/horf/race?season=current-2026");
    await expect(page.locator('[data-horf-region="race"]')).toContainText("Saddle Scout");
    await page.goto(`/horf/traders/${wallet}?season=current-2026`);
    const seasonSelect = page.locator("[data-horf-season-select]");
    await expect(seasonSelect.locator('option[value="all-time"]')).toHaveText("All time · tracked seasons");
    await seasonSelect.selectOption("all-time");
    await expect(page).toHaveURL(new RegExp(`/horf/traders/${wallet}\\?season=all-time$`));
    await expect(page.locator("#horf-season-boundary")).toContainText("Tracked seasons combined");
    await expect(publicProfile).toContainText("Riding the Neighvember trail with every pony in the posse.");
    await page.goto("/horf/race?season=all-time");
    await expect(page.locator('[data-horf-region="race"] [data-horf-lane]')).toHaveAttribute("data-horf-trades", "12");
    await page.goto("/horf?season=all-time");
    await expect(page.locator('[data-horf-app]')).toHaveAttribute("data-horf-page", "stable");
    await expect(page.locator("#horf-season-boundary")).toContainText("Tracked seasons combined");
    await expect(page.locator("[data-horf-profile-description-preview]")).toHaveText("Riding the Neighvember trail with every pony in the posse.");
  });

  test("pauses a failed later horse page and resumes without claiming the stable is empty", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "admin" } });
    expect(state.ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockSeason(page);
    let failLaterPage = true;
    const offsets = [];
    const refreshes = [];
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => {
      const url = new URL(route.request().url());
      const offset = Number(url.searchParams.get("offset") || 0);
      offsets.push(offset);
      refreshes.push({ offset, refresh: url.searchParams.get("refresh") });
      if (offset === 48 && failLaterPage) return route.fulfill({
        status: 503, contentType: "application/json", body: JSON.stringify({ error: "Horse index is resting" }),
      });
      return json(route, { address: wallet,
        items: offset === 0 ? [] : [{ contract, tokenId: "7", balance: "1", name: "Trail Pony", image: null, description: "Horse art", creatorAddress: wallet }],
        pagination: { hasMore: offset === 0, nextOffset: offset === 0 ? 48 : 49 },
      });
    });
    await page.goto("/horf/stable?season=current-2026");
    const stable = page.locator('[data-horf-region="personal-stable"]');
    const retry = stable.locator("[data-horf-stable-scan-retry]");
    await expect(retry).toBeVisible();
    await expect(stable.locator("[data-horf-qualifying-horses]")).toContainText("Horse search paused");
    await expect(stable.locator("[data-horf-stable-scan-complete]")).toHaveCount(0);
    await expect(stable).not.toContainText("No qualifying horses found in this wallet");
    expect(offsets).toContain(48);
    expect(refreshes.every((read) => read.refresh === null)).toBe(true);
    failLaterPage = false;
    await retry.click();
    await expect.poll(() => refreshes.some((read) => read.offset === 48 && read.refresh === "1")).toBe(true);
    await expect(stable.locator("[data-horf-stable-horse]")).toContainText("Trail Pony");
    await expect(stable.locator("[data-horf-stable-scan-complete]")).toContainText("Showing 1 horse · scan complete");
    await expect(retry).toHaveCount(0);
  });

  test("guides a signed-in rider whose WTF OS linked wallet is not selected in this browser", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "admin" } });
    expect(state.ok()).toBeTruthy();
    await page.route("**/api/wallets", (route) => json(route, [{ walletAddress: wallet }]));
    await mockSeason(page);
    await page.goto("/horf/stable?season=current-2026");
    const stable = page.locator('[data-horf-region="personal-stable"]');
    const status = stable.locator("[data-horf-stable-wallet-status]");
    await expect(status).toContainText("No wallet selected");
    await expect(status).toContainText("1 linked wallet");
    await expect(status).toContainText("none is selected in this browser");
    await expect(status.locator("[data-horf-profile-connect]")).toHaveText("Connect a linked wallet");
    await expect(stable.locator("[data-horf-profile-editor]")).toHaveCount(0);
    await expect(stable.locator("[data-horf-qualifying-horses]")).toHaveCount(0);
  });

  test("shows every held horse by default and filters only by mint season", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "admin" } });
    expect(state.ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockSeason(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route(/\/api\/horf\/traders\/[^/]+\/profile\?season=current-2026$/, (route) => json(route, {
      address: wallet, seasonKey: season.key, imageUrl: null, description: "Horse art for the whole trail.",
      updatedAt: "2026-11-03T12:00:00.000Z", username: "Trail Keeper", displayName: "Trail Keeper",
      usernameSource: "horf", canEditUsername: true,
    }));
    const offsets = [];
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => {
      const offset = Number(new URL(route.request().url()).searchParams.get("offset") || 0);
      offsets.push(offset);
      return json(route, { address: wallet,
        items: offset === 0 ? [
          { contract, tokenId: "7", balance: "1", mintedAt: "2026-11-02T12:00:00.000Z", name: "Current Colt", image: "/horf-art/horse-gallop-photo.jpg", description: "Current horse art", creatorAddress: wallet },
          { contract, tokenId: "8", balance: "2", mintedAt: "2025-11-02T12:00:00.000Z", name: "Old Mare", image: "/horf-art/horse-beach-photo.jpg", description: "Old horse art", creatorAddress: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" },
        ] : [
          { contract, tokenId: "9", balance: "1", mintedAt: null, name: "Mystery Foal", image: "/horf-art/horse-portrait-photo.jpg", description: "Undated horse art", creatorAddress: null },
          { contract, tokenId: "10", balance: "1", mintedAt: "2026-06-15T12:00:00.000Z", name: "Between Seasons", image: "/horf-art/horse-gallop-photo.jpg", description: "Horse art outside tracked campaigns", creatorAddress: wallet },
        ],
        pagination: { hasMore: offset === 0, nextOffset: offset === 0 ? 48 : 49 },
      });
    });

    await page.goto("/horf?season=current-2026");
    const stable = page.locator('[data-horf-region="personal-stable"]');
    const filter = stable.locator("[data-horf-mint-season]");
    await expect(filter).toHaveValue("all");
    await expect(stable.locator("[data-horf-stable-scan-complete]")).toContainText("Showing 4 horses · scan complete");
    expect(offsets).toContain(48);
    const cards = stable.locator("[data-horf-stable-horse]");
    await expect(cards).toHaveCount(4);
    await expect(stable.locator("[data-horf-stable-created] [data-horf-stable-horse]")).toHaveCount(2);
    await expect(stable.locator("[data-horf-stable-received] [data-horf-stable-horse]")).toHaveCount(1);
    await expect(stable.locator("[data-horf-stable-uncredited] [data-horf-stable-horse]")).toHaveCount(1);
    await expect(cards.nth(0)).toContainText("Current Colt");
    await expect(cards.nth(1)).toContainText("Between Seasons");
    await expect(cards.nth(2)).toContainText("Old Mare");
    await expect(cards.nth(3)).toContainText("Mystery Foal");
    await expect(cards.filter({ hasText: "Current Colt" }).locator("[data-horf-mint-badge]")).toHaveText(season.label);
    await expect(cards.filter({ hasText: "Current Colt" }).locator("[data-horf-mint-badge] img")).toHaveAttribute("src", "/horf-art/horseshoe.svg");
    await expect(cards.filter({ hasText: "Old Mare" }).locator("[data-horf-mint-badge]")).toHaveText(archiveSeason.label);
    await expect(cards.filter({ hasText: "Mystery Foal" }).locator("[data-horf-mint-badge]")).toHaveCount(0);
    await expect(cards.filter({ hasText: "Between Seasons" }).locator("[data-horf-mint-badge]")).toHaveCount(0);
    await expect(stable).toContainText("Mystery Foal");
    await expect(stable).toContainText("Between Seasons");
    await cards.filter({ hasText: "Mystery Foal" }).locator("[data-horf-stable-view-horse]").click();
    const horseCard = stable.locator("[data-horf-stable-horse-detail]");
    await expect(horseCard).toBeVisible();
    await expect(horseCard).toContainText("Mystery Foal");
    await expect(horseCard).toContainText(`${contract} / #9`);
    await horseCard.getByRole("button", { name: "Close horse card" }).click();
    await expect(horseCard).toBeHidden();
    await cards.first().locator(".art img").scrollIntoViewIfNeeded();
    await expect(cards.first().locator(".art img")).toBeInViewport();
    await page.screenshot({ path: "/tmp/horf-stable-all-horses-entry-desktop.png" });
    await page.setViewportSize({ width: 390, height: 844 });
    await cards.first().locator(".art img").scrollIntoViewIfNeeded();
    await expect(cards.first().locator(".art img")).toBeInViewport();
    await expect(page.locator("[data-horf-right-rail]")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "/tmp/horf-stable-all-horses-entry-mobile.png" });
    await page.setViewportSize({ width: 1440, height: 900 });

    await filter.selectOption(season.key);
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Current Colt");
    await expect(stable.locator("[data-horf-stable-created] [data-horf-stable-horse]")).toHaveCount(1);
    await expect(stable.locator("[data-horf-stable-received] [data-horf-stable-horse]")).toHaveCount(0);
    await expect(cards).not.toContainText("Old Mare");
    await expect(cards).not.toContainText("Mystery Foal");
    await expect(cards).not.toContainText("Between Seasons");
    await filter.selectOption(archiveSeason.key);
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Old Mare");
    await expect(stable.locator("[data-horf-stable-received] [data-horf-stable-horse]")).toHaveCount(1);
    await filter.selectOption("all");
    await expect(cards).toHaveCount(4);
    await expect(stable).toContainText("Mystery Foal");
    await expect(stable).toContainText("Between Seasons");
    await cards.filter({ hasText: "Old Mare" }).locator("[data-horf-stable-select-inspection]").click();
    await expect(stable.locator("[data-horf-stable-inspection-workroom]")).toHaveAttribute("open", "");
    await expect(stable.locator("[data-horf-personal-selection]")).toContainText("Old Mare");
  });

  test("keeps the inspection picker to qualifying horses and groups created horses first", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockSeason(page);
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => json(route, {
      address: wallet,
      items: [
        { contract, tokenId: "40", balance: "1", name: "Borrowed Pinto", image: "/horf-art/horse-beach-photo.jpg", mintedAt: season.startsAt, creatorAddress: firstReturnWallet },
        { contract, tokenId: "41", balance: "2", name: "My Mare", image: "/horf-art/horse-gallop-photo.jpg", mintedAt: season.startsAt, creatorAddress: wallet },
      ],
      pagination: { hasMore: false, nextOffset: 2 },
    }));
    await page.route("**/api/horf/wallet/tokens?*", (route) => json(route, {
      items: [
        { contract, tokenId: "40", balance: "1", walletAddress: wallet, name: "Borrowed Pinto" },
        { contract, tokenId: "41", balance: "2", walletAddress: wallet, name: "My Mare" },
        { contract, tokenId: "42", balance: "1", walletAddress: wallet, name: "Clown GIF", tags: ["clown", "gif"] },
        { contract, tokenId: "43", balance: "1", walletAddress: wallet, name: "HAHA Candidate", tags: ["HAHA"] },
      ],
      pagination: { limit: 48, offset: 0, total: 4, hasMore: false, nextOffset: 4 },
    }));
    await page.route("**/api/horf/inspections/status?*", (route) => json(route, { status: "none", reason: null }));
    await page.route("**/api/horf/token-eligibility?*", (route) => json(route, {
      eligible: true, token: { name: "My Mare", image: null },
    }));

    await page.goto("/horf/stable?season=current-2026");
    const stable = page.locator('[data-horf-region="personal-stable"]');
    const picker = stable.locator("[data-horf-personal-token]");
    await expect(stable.locator("[data-horf-stable-scan-complete]")).toContainText("Showing 2 horses · scan complete");
    const inspection = stable.locator("[data-horf-stable-inspection-workroom]");
    await expect(inspection).not.toHaveAttribute("open", "");
    await inspection.locator("summary").click();
    await expect(picker.locator("optgroup")).toHaveCount(2);
    await expect(picker.locator("optgroup").nth(0)).toHaveAttribute("label", "Created by you");
    await expect(picker.locator("optgroup").nth(0).locator("option")).toHaveAttribute("value", `${contract}:41`);
    await expect(picker.locator("optgroup").nth(1)).toHaveAttribute("label", "Received horses");
    await expect(picker.locator("optgroup").nth(1).locator("option")).toHaveAttribute("value", `${contract}:40`);
    await expect(picker.locator("option")).toHaveCount(3);
    await expect(picker).not.toContainText("Clown GIF");
    await expect(picker).not.toContainText("HAHA Candidate");
    await picker.selectOption(`${contract}:41`);
    await expect(stable.locator("[data-horf-personal-selection]")).toContainText("My Mare");
  });

  test("shows a linked WTF OS username as the rider name and keeps the Horf alias read-only", async ({ page, request }) => {
    const state = await request.post("/__test/state", { data: { userRole: "admin" } });
    expect(state.ok()).toBeTruthy();
    await mockConnectedWallet(page);
    await mockSeason(page, () => "WTF Rider", false);
    await page.route(/\/api\/horf\/traders\/[^/]+\/profile\?season=current-2026$/, (route) => json(route, {
      address: wallet, seasonKey: season.key, imageUrl: null, description: "Trading paints and ponies.",
      updatedAt: "2026-11-03T12:00:00.000Z", username: "Old Horf Alias", displayName: "WTF Rider",
      usernameSource: "wtf", canEditUsername: false,
    }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => json(route, {
      address: wallet, items: [], pagination: { hasMore: false, nextOffset: 0 },
    }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/offers(?:\?.*)?$/, (route) => json(route, { address: wallet, metadataStatus: "ready", offers: [] }));
    await page.goto("/horf?season=current-2026");
    const editor = page.locator("[data-horf-profile-editor]");
    await expect(editor.locator("[data-horf-profile-name]")).toHaveText("WTF Rider");
    await expect(editor).toContainText("WTF OS username");
    await expect(editor.locator("[data-horf-profile-username]")).toHaveCount(0);
    await page.goto(`/horf/traders/${wallet}?season=current-2026`);
    const publicCard = page.locator("[data-horf-public-profile]");
    await expect(publicCard.locator("[data-horf-profile-name]")).toHaveText("WTF Rider");
    await expect(page.locator('[data-horf-region="trader-profile"] > h2')).toHaveText("WTF Rider");
    await expect(publicCard).toContainText("Trading paints and ponies.");
  });
});
