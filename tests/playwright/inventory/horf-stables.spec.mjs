import { test, expect } from "@playwright/test";

const traderWallet = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const otherTrader = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const tokenContract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const stableContract = "KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P";
const chainId = "NetXdQprcVkpaWU";

const season = {
  key: "current-2026",
  startsAt: "2026-11-01T00:00:00.000Z",
  endsAt: null,
  label: "November 2026 season",
  inferred: false,
};

const listings = [
  { id: "1", mode: 0, owner: otherTrader, tokenContract, tokenId: "1", submitted: "2", remaining: "2", claimedByWallet: null },
  { id: "2", mode: 0, owner: traderWallet, tokenContract, tokenId: "2", submitted: "2", remaining: "2", claimedByWallet: null },
  { id: "3", mode: 1, owner: otherTrader, tokenContract, tokenId: "3", submitted: "2", remaining: "2", claimedByWallet: null },
  { id: "4", mode: 1, owner: traderWallet, tokenContract, tokenId: "4", submitted: "2", remaining: "2", claimedByWallet: null },
  { id: "5", mode: 2, owner: otherTrader, tokenContract, tokenId: "5", submitted: "2", remaining: "2", claimedByWallet: true },
  { id: "6", mode: 2, owner: otherTrader, tokenContract, tokenId: "6", submitted: "2", remaining: "2", claimedByWallet: false },
  { id: "7", mode: 2, owner: traderWallet, tokenContract, tokenId: "7", submitted: "2", remaining: "2", claimedByWallet: false },
];

function stableSnapshot(permitReady) {
  return {
    network: "mainnet",
    chainId,
    contractAddress: stableContract,
    status: "ready",
    permitReady,
    custodyReady: true,
    asOf: "2026-11-03T12:00:00.000Z",
    reciprocalCredits: "0",
    groupCredits: "30",
    listings,
  };
}

async function seedTrader(request) {
  const response = await request.post("/__test/state", { data: { userRole: "admin" } });
  expect(response.ok()).toBeTruthy();
}

async function mockSeason(page) {
  await page.route("**/api/horf/season*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      season,
      seasons: [season],
      asOf: "2026-11-03T12:00:00.000Z",
      error: null,
      nextRefreshAt: null,
      status: "ready",
      leaderboard: [],
      currentUser: null,
    }),
  }));
}

async function mockLinkedWallet(page) {
  await page.addInitScript(({ address }) => {
    window.localStorage.setItem("wtf:wallet-session", JSON.stringify({
      address,
      providerName: "octez.connect",
    }));
  }, { address: traderWallet });
  await page.route("**/api/wallets", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify([{ walletAddress: traderWallet }]),
  }));
  await page.route(`**/api/wallets/${traderWallet}/sync`, (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true }),
  }));
  await page.route("**/api/horf/stable-selections?*", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ selections: [] }),
  }));
}

test.describe("Horf Stables", () => {
  test("HAHA-only art waits at the Marshal desk before entering public Open Range", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    const candidate = { contract: tokenContract, tokenId: "19", name: "HAHA mystery",
      description: "Tagged HAHA, awaiting human review", image: null, artifactUri: null,
      mime: "image/png", mintedAt: "2026-11-03T12:00:00.000Z", creatorAddress: null,
      eligibility: "marshal-review", tradedThroughHorf: false, activelyForTradeOnHorf: false,
      approvedForMarshalsMarket: false, offers: [] };
    const reads = [];
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: true, role: "horf_marshal" }),
    }));
    await page.route("**/api/horf/inspections/pending", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ inspections: [] }),
    }));
    await page.route("**/api/horf/open-range?*", (route) => {
      const marshal = new URL(route.request().url()).searchParams.get("marshal") === "1";
      reads.push(marshal);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        season, items: marshal ? [candidate] : [], nextCursor: null, hasMore: false,
        asOf: "2026-11-03T12:00:00.000Z",
      }) });
    });
    await page.goto("/horf/open-range");
    await expect.poll(() => reads.includes(false)).toBe(true);
    await expect(page.locator("[data-horf-open-range-view-horse]")).toHaveCount(0);
    await page.goto("/horf/inspection-desk");
    await expect(page.locator("[data-horf-marshal-candidate]")).toContainText("HAHA mystery");
    await expect(page.locator("[data-horf-marshal-candidate-review]")).toBeVisible();
    expect(reads).toContain(false);
    expect(reads).toContain(true);
  });

  test("Marshal previews keep distinct token artwork when Objkt thumbnails match", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    const shared = "https://ipfs.fileship.xyz/QmSharedCollectionThumbnail";
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: true, role: "horf_marshal" }),
    }));
    await page.route("**/api/horf/inspections/pending", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ inspections: [] }),
    }));
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        items: ["1", "2"].map((tokenId) => ({ contract: tokenContract, tokenId,
          name: `Horse artwork ${tokenId}`, description: null, image: shared,
          artifactUri: `https://ipfs.fileship.xyz/QmDistinctHorse${tokenId}`, mime: "image/png",
          mintedAt: "2026-11-03T12:00:00Z", creatorAddress: null,
          approvedForMarshalsMarket: false })),
        nextCursor: null, hasMore: false,
      }),
    }));
    await page.route("**/api/cache/artifact?*", (route) => {
      const source = new URL(route.request().url()).searchParams.get("url") || "";
      const first = source.endsWith("QmDistinctHorse1");
      return route.fulfill({ status: 200, contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="${first ? "#d8764b" : "#4b80b0"}"/></svg>` });
    });

    await page.goto("/horf/inspection-desk");
    const previews = page.locator("[data-horf-marshal-token-preview]");
    await expect(previews).toHaveCount(2);
    const images = previews.locator("img");
    await expect(images).toHaveCount(2);
    await expect(images.nth(0)).toHaveAttribute("src", /\/api\/cache\/artifact\?.*QmDistinctHorse1/);
    await expect(images.nth(1)).toHaveAttribute("src", /\/api\/cache\/artifact\?.*QmDistinctHorse2/);
    await images.nth(0).scrollIntoViewIfNeeded();
    await expect(images.nth(0)).toHaveJSProperty("naturalWidth", 180);
    await images.nth(1).scrollIntoViewIfNeeded();
    await expect(images.nth(1)).toHaveJSProperty("naturalWidth", 180);
    if (process.env.HORF_VISUAL_CAPTURE === "1") await page.locator("[data-horf-inspection-open-range]").screenshot({ path: "/tmp/horf-marshal-distinct-artifacts.png" });
  });

  test("shows new inspected rooms without reopening the former Group stable", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    await page.route(/\/api\/horf\/rooms(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        network: "mainnet", chainId, contractAddress: null, status: "unconfigured",
        permitReady: false, asOf: null, reciprocalCredits: "0", listings: [],
      }),
    }));

    await page.goto("/horf/marshals-market");
    const stables = page.locator('[data-horf-rooms-market="marshal"]');
    const marshalsMarket = page.locator('[data-horf-region="marshals-market"]');
    await expect(marshalsMarket).toContainText("Marshal’s Market");
    await expect(stables).toBeVisible();
    await expect(stables).toContainText("The new escrow contract is being connected");
    await expect(stables.locator("[data-horf-room-deposit]")).toHaveCount(0);
    await expect(stables).not.toContainText("Group stable");
  });

  test("shows exact horse artwork cards in Reciprocal, Honor, and Outlaw escrow rooms", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    const shared = "https://ipfs.fileship.xyz/QmOneCollectionThumbnail";
    const roomListings = [
      { id: "11", mode: 0, tokenId: "11", name: "Reciprocal Mare", photo: "horse-portrait-photo.jpg" },
      { id: "12", mode: 1, tokenId: "12", name: "Honor Pony", photo: "horse-beach-photo.jpg" },
      { id: "13", mode: 2, tokenId: "13", name: "Outlaw Mustang", photo: "horse-gallop-photo.jpg" },
    ];
    await page.route(/\/api\/horf\/rooms(?:\?.*)?$/, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        network: "mainnet", chainId, contractAddress: stableContract, status: "ready",
        permitReady: true, balanceStatus: null, onChainBlacklisted: null,
        reciprocalCredits: "0", listings: roomListings.map((item) => ({
          id: item.id, mode: item.mode, owner: otherTrader, ownerName: "Mare Force",
          tokenContract, tokenId: item.tokenId, submitted: "2", remaining: "2",
          claimedByWallet: null, ownedByWallet: null, publicVisible: true,
          approvedForMarshalsMarket: item.mode !== 2,
          token: { name: item.name, image: shared,
            artifactUri: `https://ipfs.fileship.xyz/QmExactHorse${item.tokenId}`, mime: "image/png" },
        })),
      }),
    }));
    await page.route("**/api/cache/artifact?*", (route) => {
      const source = new URL(route.request().url()).searchParams.get("url") || "";
      const token = roomListings.find((item) => source.endsWith(`QmExactHorse${item.tokenId}`));
      return route.fulfill({ status: 200, contentType: "image/jpeg",
        path: `${process.cwd()}/public/horf-art/${token?.photo || "horse-gallop-photo.jpg"}` });
    });

    await page.goto("/horf/horse-market?market=marshals");
    const inspected = page.locator('[data-horf-rooms-market="marshal"]');
    for (const item of roomListings.slice(0, 2)) {
      const card = inspected.locator(`[data-horf-room-id="${item.id}"]`);
      await expect(card).toContainText(item.name);
      await expect(card.locator("[data-horf-room-art] img")).toHaveAttribute("src", new RegExp(`api/cache/artifact.*QmExactHorse${item.tokenId}`));
      await card.locator("[data-horf-room-art] img").scrollIntoViewIfNeeded();
      await expect.poll(() => card.locator("[data-horf-room-art] img").evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
      await expect(card.locator("[data-horf-room-claim]")).toBeVisible();
    }
    await expect(inspected.locator('[data-horf-room-id="13"]')).toHaveCount(0);
    if (process.env.HORF_VISUAL_CAPTURE === "1") await inspected.screenshot({ path: "/tmp/horf-inspected-room-cards.png" });

    await page.goto("/horf/horse-market?market=outlaw&outlaw=rooms");
    const outlaw = page.locator('[data-horf-rooms-market="outlaw"] [data-horf-room-id="13"]');
    await expect(outlaw).toContainText("Outlaw Mustang");
    await expect(outlaw.locator("[data-horf-room-art] img")).toHaveAttribute("src", /api\/cache\/artifact.*QmExactHorse13/);
    await outlaw.locator("[data-horf-room-art] img").scrollIntoViewIfNeeded();
    await expect.poll(() => outlaw.locator("[data-horf-room-art] img").evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    await expect(outlaw.locator("[data-horf-room-swap]")).toBeVisible();
  });

  test("shows the pinned horse art in private escrow while keeping return available", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    await mockLinkedWallet(page);
    await page.route("**/api/horf/trade-offers?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ offers: [] }),
    }));
    await page.route(/\/api\/horf\/rooms(?:\?.*)?$/, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        network: "mainnet", chainId, contractAddress: stableContract, status: "ready",
        permitReady: true, balanceStatus: "ready", onChainBlacklisted: false,
        reciprocalCredits: "0", listings: [],
      }),
    }));
    const privateEntry = { listing: { id: "19", mode: 3, owner: traderWallet,
      tokenContract, tokenId: "19", remaining: "1" },
      terms: { offerer: otherTrader, inputTokenContract: tokenContract, inputTokenId: "20" } };
    await page.route("**/api/horf/rooms/private?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ listings: [privateEntry] }),
    }));
    await page.route("**/api/horf/rooms/private/19?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ ...privateEntry,
        token: { name: "Pinned Palomino", image: "https://ipfs.fileship.xyz/QmPinnedPalomino", mime: "image/png" },
      }),
    }));
    await page.route("**/api/cache/media?*", (route) => route.fulfill({
      status: 200, contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#d3a84d"/></svg>',
    }));
    await page.goto("/horf/stable?private-listing=19");
    const detail = page.locator("[data-horf-private-detail]");
    await expect(detail).toContainText("Pinned Palomino");
    await expect(detail.locator("[data-horf-private-art] img")).toHaveAttribute("src", /api\/cache\/media.*QmPinnedPalomino/);
    await detail.locator("[data-horf-private-art] img").scrollIntoViewIfNeeded();
    await expect(detail.locator("[data-horf-private-art] img")).toHaveJSProperty("naturalWidth", 180);
    await expect(detail.locator("[data-horf-private-return]")).toBeVisible();
  });

  test("keeps old V2 escrow claims and owner returns reachable without reopening deposits", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    await mockLinkedWallet(page);
    const marketFilters = [];
    await page.route(/\/api\/horf\/stables(?:\?.*)?$/, (route) => {
      marketFilters.push(new URL(route.request().url()).searchParams.get("market"));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        ...stableSnapshot(true), reciprocalCredits: "1",
        listings: listings.map((listing) => listing.id === "1" ? { ...listing,
          token: { contract: tokenContract, tokenId: "1", name: "Legacy Reciprocal Mare",
            image: "https://ipfs.fileship.xyz/QmLegacyMare", artifactUri: null, mime: "image/jpeg" },
        } : listing),
      }) });
    });
    await page.route("**/api/cache/media?*", (route) => route.fulfill({ status: 200,
      contentType: "image/jpeg", path: `${process.cwd()}/public/horf-art/horse-portrait-photo.jpg` }));
    let permitRequests = 0;
    await page.route("**/api/horf/stables/permit", (route) => {
      permitRequests += 1;
      return route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
    });

    await page.goto("/horf/legacy-stables");
    const recovery = page.locator('#horf-legacy-stables[data-horf-region="legacy-stables"]');
    await expect(recovery).toBeVisible();
    await expect(recovery).toContainText("New deposits are closed");
    await expect(recovery.locator("[data-horf-legacy-listing]")).toHaveCount(7);
    await expect(recovery.locator("[data-horf-legacy-credits]")).toContainText("Unused Reciprocal claims: 1");
    await expect(recovery.locator("[data-horf-legacy-credits]")).toContainText("Unused former Group claims: 30");
    await expect(recovery.locator('[data-horf-legacy-listing-id="1"] [data-horf-legacy-claim]')).toBeEnabled();
    const legacyArt = recovery.locator('[data-horf-legacy-listing-id="1"] [data-horf-stable-preview] img');
    await expect(legacyArt).toHaveAttribute("src", /api\/cache\/media.*QmLegacyMare/);
    await legacyArt.scrollIntoViewIfNeeded();
    await expect.poll(() => legacyArt.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
    await expect(recovery.locator('[data-horf-legacy-listing-id="3"] [data-horf-legacy-claim]')).toBeEnabled();
    await expect(recovery.locator('[data-horf-legacy-listing-id="5"]')).toContainText("Already claimed this token");
    await expect(recovery.locator('[data-horf-legacy-listing-id="6"] [data-horf-legacy-claim]')).toBeEnabled();
    await expect(recovery.locator('[data-horf-legacy-listing-id="2"] [data-horf-legacy-cancel]')).toBeEnabled();
    await expect(recovery.locator('[data-horf-legacy-listing-id="7"] [data-horf-legacy-cancel]')).toBeEnabled();
    await expect(recovery.locator("[data-horf-stable-deposit]")).toHaveCount(0);
    await expect(recovery.locator("[data-horf-stable-mode]")).toHaveCount(0);
    await expect(recovery).not.toContainText("30 claims per distinct token");
    expect(marketFilters).toContain(null);
    expect(marketFilters).not.toContain("1");
    expect(permitRequests).toBe(0);
  });


  test("shows Outlaw escrow rooms apart from wallet-held availability and warns before swaps", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    await page.route(/\/api\/horf\/rooms(?:\?.*)?$/, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        network: "mainnet", chainId, contractAddress: stableContract, status: "ready",
        permitReady: true, balanceStatus: null, onChainBlacklisted: null,
        reciprocalCredits: "0", listings: [{
          id: "9", mode: 2, owner: otherTrader, ownerName: "Mare Force",
          tokenContract, tokenId: "19", submitted: "3", remaining: "2",
          claimedByWallet: null, ownedByWallet: null, publicVisible: true,
          approvedForMarshalsMarket: false,
          token: { name: "Outlaw Mustang", image: "/horf-art/horse-gallop-photo.jpg" },
        }],
      }),
    }));
    await page.route("**/api/horf/open-range/offers", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ offers: [{
        id: 71, ownerAddress: otherTrader, tokenContract, tokenId: "19", amount: "1",
        acceptedTokenPolicy: "any_qualifying", name: "Wallet Mustang",
      }] }),
    }));
    await page.goto("/horf/horse-market?season=current-2026&market=outlaw&outlaw=rooms&listing=9");
    const corral = page.locator('[data-horf-region="outlaw-corral"]');
    const room = corral.locator('[data-horf-room-id="9"]');
    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute("data-horf-room-featured", "");
    await expect(room).toContainText("Outlaw Mustang");
    await expect(room.locator("[data-horf-room-art] img")).toHaveAttribute("src", "/horf-art/horse-gallop-photo.jpg");
    await expect(room).toContainText("2 of 3 editions in escrow");
    await expect(room.locator("[data-horf-room-swap]")).toBeDisabled();
    await expect(corral.locator("[data-horf-outlaw-risk]")).toContainText("malicious contract");
    await expect(corral.locator("[data-horf-outlaw-offer]")).toHaveCount(0);
    await corral.locator('[data-horf-outlaw-tab="available"]').click();
    await expect(corral.locator("[data-horf-outlaw-offer]")).toHaveCount(1);
    await expect(corral.locator("[data-horf-room-listing]")).toHaveCount(0);
  });

  test("requires a chosen horse and explicit positive edition quantity before escrow deposit", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    await mockLinkedWallet(page);
    await page.route(/\/api\/horf\/rooms(?:\?.*)?$/, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        network: "mainnet", chainId, contractAddress: stableContract, status: "ready",
        permitReady: true, balanceStatus: "ready", onChainBlacklisted: false,
        reciprocalCredits: "0", listings: [],
      }),
    }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        address: traderWallet, items: [{
          contract: tokenContract, tokenId: "23", balance: "5", name: "Five Hooves",
          image: "/horf-art/horse-gallop-photo.jpg", approvedForMarshalsMarket: false,
        }], pagination: { hasMore: false, nextOffset: 1 },
      }),
    }));
    await page.goto("/horf/horse-market?season=current-2026&market=outlaw&outlaw=rooms");
    const deposit = page.locator("[data-horf-room-deposit]");
    await expect(deposit).toBeVisible();
    await expect(deposit.locator("[data-horf-room-deposit-confirm]")).toBeDisabled();
    await deposit.locator("[data-horf-owned-horse-select]").selectOption(`${tokenContract}:23`);
    await expect(deposit.locator("[data-horf-room-deposit-quantity]")).toHaveValue("0");
    await expect(deposit.locator("[data-horf-room-add]")).toBeDisabled();
    await deposit.locator("[data-horf-room-deposit-quantity]").fill("6");
    await expect(deposit.locator("[data-horf-room-add]")).toBeDisabled();
    await deposit.locator("[data-horf-room-deposit-quantity]").fill("5");
    await deposit.locator("[data-horf-room-add]").click();
    await expect(deposit.locator("[data-horf-room-staged]")).toContainText("Five Hooves · 5 editions");
    await expect(deposit.locator("[data-horf-room-staged-card] img")).toHaveAttribute("src", "/horf-art/horse-gallop-photo.jpg");
    await expect(deposit.locator("[data-horf-room-deposit-confirm]")).toHaveText("Deposit 5 editions in wallet");
    await expect(deposit).toContainText("malicious token contract");
  });
});
