import { test, expect } from "@playwright/test";

const traderWallet = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const leadWallet = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const thirdWallet = "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79";
const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";

const season = {
  key: "current-2026",
  startsAt: "2026-11-01T00:00:00.000Z",
  endsAt: null,
  label: "Neighvember 2026",
  inferred: false,
};

const archivedSeason = {
  key: "neighvember-2025",
  startsAt: "2025-11-01T00:00:00.000Z",
  endsAt: "2025-12-01T00:00:00.000Z",
  label: "Neighvember 2025",
  inferred: true,
};

const seasons = [season, archivedSeason];

const leaderboard = [
  { address: thirdWallet, name: "Mare Force", trades: 2, sentInteractions: 2, receivedInteractions: 1,
    riderLinks: 3, completedTrades: 8, received: 1, sent: 10 },
  { address: leadWallet, name: "Sir Canter", trades: 7, sentInteractions: 7, receivedInteractions: 4,
    riderLinks: 5, completedTrades: 3, received: 4, sent: 3 },
  { address: traderWallet, name: "You", trades: 3, sentInteractions: 3, receivedInteractions: 2,
    riderLinks: 2, completedTrades: 1, received: 2, sent: 1 },
];

function seasonResponse(address, seasonKey) {
  if (seasonKey === archivedSeason.key) {
    return {
      season: archivedSeason,
      seasons,
      asOf: "2026-11-03T12:00:00.000Z",
      status: "ready",
      leaderboard: [
        { address: thirdWallet, name: "Mare Force", trades: 6, received: 4, sent: 2 },
        { address: traderWallet, name: "You", trades: 1, received: 1, sent: 0 },
        { address: leadWallet, name: "Sir Canter", trades: 1, received: 0, sent: 1 },
      ],
      currentUser: address === traderWallet ? {
        address: traderWallet,
        received: 1,
        sent: 0,
        trades: 1,
        waitingHorses: [{
          id: 4,
          timestamp: "2025-11-03T10:00:00.000Z",
          from: thirdWallet,
          token: { contract, tokenId: "4", name: "Neighvember 2025 #4", image: null },
          amount: 1,
        }],
        owedTo: [{ address: thirdWallet, name: "Mare Force", count: 1 }],
        owedBy: [],
        recent: [{
          id: "horse-in-2025-4",
          timestamp: "2025-11-03T10:00:00.000Z",
          direction: "in",
          counterparty: thirdWallet,
          token: { contract, tokenId: "4", name: "Neighvember 2025 #4", image: null },
          amount: 1,
        }],
      } : null,
    };
  }
  return {
    season,
    seasons,
    asOf: "2026-11-03T12:00:00.000Z",
    status: "ready",
    leaderboard,
    currentUser: address === traderWallet ? {
      address: traderWallet,
      received: 2,
      sent: 1,
      trades: 3,
      waitingHorses: [{
        id: 7,
        timestamp: "2026-11-03T10:00:00.000Z",
        from: leadWallet,
        token: { contract, tokenId: "7", name: "Neighvember 2026 #7", image: null },
        amount: 2,
      }],
      owedTo: [{ address: leadWallet, name: "Sir Canter", count: 2 }],
      owedBy: [{ address: thirdWallet, name: "Mare Force", count: 1 }],
      recent: [
        {
          id: "horse-in-7",
          timestamp: "2026-11-03T10:00:00.000Z",
          direction: "in",
          counterparty: leadWallet,
          token: { contract, tokenId: "7", name: "Neighvember 2026 #7", image: null },
          amount: 2,
        },
        {
          id: "horse-out-3",
          timestamp: "2026-11-02T10:00:00.000Z",
          direction: "out",
          counterparty: thirdWallet,
          token: { contract, tokenId: "3", name: "Horse of July 2026 #3", image: null },
          amount: 1,
        },
      ],
    } : null,
  };
}

async function seedTrader(request) {
  const response = await request.post("/__test/state", { data: { userRole: "admin" } });
  expect(response.ok()).toBeTruthy();
}

async function mockSeason(page, observedAddresses, observedSeasons = []) {
  await page.route(/\/api\/horf\/horse-holders(?:\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      address: url.searchParams.get("address"), contract: url.searchParams.get("contract"),
      tokenId: url.searchParams.get("tokenId"), checkedAt: new Date().toISOString(),
      members: url.searchParams.getAll("recipient").map((address) => ({ address, owns: false })),
    }) });
  });
  await page.route(/\/api\/horf\/open-range\?season=current-2026$/, (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }),
  }));
  await page.route("**/api/horf/season*", (route) => {
    const url = new URL(route.request().url());
    const address = url.searchParams.get("address");
    const seasonKey = url.searchParams.get("season");
    observedAddresses.push(address);
    observedSeasons.push(seasonKey);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(seasonResponse(address, seasonKey)),
    });
  });
}

test.describe("Horf horse trading", () => {
  test("shows a compact Neighvember banner across Horf during November", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await page.clock.setFixedTime(new Date("2026-11-05T12:00:00.000Z"));
    await mockSeason(page, []);
    await page.goto("/horf?season=current-2026");
    const banner = page.locator("[data-horf-neighvember-banner]");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Neighvember 2026 is live!");
    await expect(banner).toContainText("November 1st–30th");
    await expect(page.locator('[data-horf-nav="race"]')).toHaveCount(0);
    await page.goto("/horf/race?season=current-2026");
    await expect(page.locator('[data-horf-region="race-closed"]')).toBeVisible();
    await expect(banner).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(banner).toBeInViewport();
    await page.clock.setFixedTime(new Date("2026-12-01T00:00:00.000Z"));
    await page.reload();
    await expect(banner).toHaveCount(0);
  });

  test("keeps HORF controls visually consistent across WTF OS appearances", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockSeason(page, []);
    await page.goto("/horf?season=current-2026");
    const horseMarketButton = page.locator("[data-horf-horse-market-open]");
    const walletButton = page.locator("[data-horf-frame] button.wallet-state");
    await expect(horseMarketButton).toBeVisible();
    await expect(walletButton).toBeVisible();
    await page.evaluate(() => document.documentElement.removeAttribute("data-wtf-appearance-style"));
    const controlStyles = () => page.evaluate(() => {
      const read = (selector) => {
        const node = document.querySelector(selector);
        if (!node) throw new Error(`Missing HORF control: ${selector}`);
        const style = getComputedStyle(node);
        return {
          radius: style.borderTopLeftRadius,
          border: style.borderTopWidth,
          shadow: style.boxShadow,
          backgroundImage: style.backgroundImage,
          textTransform: style.textTransform,
        };
      };
      return {
        horseMarket: read("[data-horf-horse-market-open]"),
        wallet: read("[data-horf-frame] button.wallet-state"),
        season: read("[data-horf-season-select]"),
      };
    });
    const defaultStyles = await controlStyles();
    for (const appearance of ["wtf-zine", "wtf-xp", "wtf-aqua"]) {
      await page.evaluate((value) => document.documentElement.setAttribute("data-wtf-appearance-style", value), appearance);
      expect(await controlStyles()).toEqual(defaultStyles);
    }
  });

  test("keeps the Inspection Desk out of a non-Marshal rider's trails", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "user" } })).ok()).toBeTruthy();
    await mockSeason(page, []);
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: false, role: null }),
    }));
    await page.goto("/horf/marshals-market");
    await expect(page.locator('[data-horf-region="marshals-market"]')).toBeVisible();
    await expect(page.locator('[data-horf-nav="inspection-desk"]')).toHaveCount(0);
    await expect(page.locator('[data-horf-region="inspector-desk"]')).toHaveCount(0);
    await page.goto("/horf/inspection-desk");
    await expect(page.getByRole("alert")).toContainText("Marshal badge required");
    await expect(page.locator('[data-horf-region="inspector-desk"]')).toHaveCount(0);
  });

  test("keeps Race and Horse4HORSE behind the relaunch gate for public riders", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
    await mockSeason(page, []);
    await page.goto("/horf?season=current-2026");
    await expect(page.locator('[data-horf-nav="race"]')).toHaveCount(0);

    await page.goto("/horf/race?season=current-2026");
    await expect(page.locator('[data-horf-region="race-closed"]')).toBeVisible();
    await expect(page.locator('[data-horf-region="race"]')).toHaveCount(0);

    await page.goto("/horf/horse-market?season=current-2026&market=horse4horse&sell=KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton%3A7");
    await expect(page).toHaveURL(/\/horf\/horse-market\?season=current-2026&market=marshals$/);
    await expect(page.getByRole("tab", { name: /Horse4HORSE/ })).toHaveCount(0);
    await expect(page.locator('[data-horf-region="marshals-market"]')).toBeVisible();
    await expect(page.locator('[data-horf-region="horse-market"]')).toHaveCount(0);
  });

  test("opens a separate Inspection Desk trail after Marshal role verification", async ({ page, request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
    await mockSeason(page, []);
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: true, role: "admin" }),
    }));
    await page.goto("/horf/marshals-market");
    const deskLink = page.locator('[data-horf-nav="inspection-desk"]');
    await expect(deskLink).toBeVisible();
    await expect(page.locator('[data-horf-region="inspector-desk"]')).toHaveCount(0);
    await deskLink.click();
    await expect(page).toHaveURL(/\/horf\/inspection-desk\?season=current-2026$/);
    await expect(page.locator('[data-horf-region="inspector-desk"]')).toBeVisible();
    await expect(page.locator('[data-horf-region="marshals-market"]')).toHaveCount(0);
  });

  test("uses separate trail routes instead of scrolling one long page", async ({ page, request }) => {
    const response = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(response.ok()).toBeTruthy();
    await mockSeason(page, []);
    await page.goto("/horf?season=current-2026");
    await expect(page.locator('[data-horf-region="intro"]')).toBeVisible();

    const links = page.locator("[data-horf-left-nav] [data-horf-nav]");
    const targets = [
      ["traders", "/horf/traders", "trader-directory"],
      ["range", "/horf/open-range", null],
      ["stable", "/horf/stable", "personal-stable"],
      ["horse", "/horf/send-horse", "horse-send"],
      ["horse-market", "/horf/horse-market", "market-tabs"],
      ["haha", "/horf/haha-crp", null],
      ["gifts", "/horf/gifts", "gifts"],
      ["posse", "/horf/posse", null],
      ["info", "/horf/info", "horse-test-info"],
    ];
    await expect(links).toHaveCount(targets.length);
    await expect(page.locator('[data-horf-nav="race"]')).toHaveCount(0);
    for (const [section, path, region] of targets) {
      const link = page.locator(`[data-horf-left-nav] [data-horf-nav="${section}"]`);
      await expect(link).toHaveAttribute("href", `${path}?season=current-2026`);
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}\\?season=current-2026$`));
      if (section === "range") await expect(page.locator("[data-horf-open-range]")).toBeVisible();
      else if (section === "haha") await expect(page.locator("[data-haha-crp]")).toBeVisible();
      else if (section === "posse") await expect(page.locator("[data-horf-posse]")).toBeVisible();
      else await expect(page.locator(`[data-horf-region="${region}"]`)).toBeVisible();
      await expect(page.locator('[data-horf-region="intro"]')).toHaveCount(0);
      if (section !== "stable") await expect(page.locator('[data-horf-region="trader-ledger"]')).toHaveCount(0);
      await expect(page.locator('[data-horf-region="inspector-desk"]')).toHaveCount(0);
    }
  });

  test("features real season horse art with manual rotation and a working Objkt link", async ({ page, request }) => {
    const response = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(response.ok()).toBeTruthy();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockSeason(page, []);
    await page.route(/\/api\/horf\/open-range\?season=current-2026$/, (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ items: [
        { contract, tokenId: "7", name: "Neighvember Chestnut", image: "/horf-art/horse-gallop-photo.jpg", creatorAddress: leadWallet },
        { contract, tokenId: "8", name: "Neighvember Bay", image: "/horf-art/horse-beach-photo.jpg", creatorAddress: thirdWallet },
        { contract, tokenId: "7", name: "Neighvember Chestnut", image: "/horf-art/horse-gallop-photo.jpg", creatorAddress: leadWallet },
      ] }),
    }));
    await page.goto("/horf?season=current-2026");

    const feature = page.locator("[data-horf-season-art]");
    await expect(feature).toBeVisible();
    await expect(feature).toContainText("Neighvember 2026");
    await expect(feature.locator("[data-horf-season-art-token]")).toHaveText("Neighvember Chestnut");
    await expect(feature.locator(".controls .count")).toHaveText("1 / 2");
    await expect(feature.locator('[data-horf-season-art-image][alt="Neighvember Chestnut token artwork"]')).toBeVisible();
    await expect(feature.locator(".photo-layer")).toHaveCount(0);
    await expect(feature.locator("[data-horf-season-art-objkt]")).toHaveAttribute("href", `https://objkt.com/tokens/${contract}/7`);
    const wantedArt = page.locator("[data-horf-wanted-poster] [data-horf-wanted-mint]");
    await expect(wantedArt).toHaveAttribute("href", `https://objkt.com/tokens/${contract}/8`);
    await expect(wantedArt.locator("img")).toHaveAttribute("alt", "Neighvember Bay horse artwork");
    await expect(page.locator("[data-horf-wanted-poster] .photo-fallback")).toHaveCount(0);
    await feature.locator("[data-horf-season-art-next]").click();
    await expect(feature.locator("[data-horf-season-art-token]")).toHaveText("Neighvember Bay");
    await expect(feature.locator('[data-horf-season-art-image][alt="Neighvember Bay token artwork"]')).toBeVisible();
    await expect(feature.locator("[data-horf-season-art-objkt]")).toHaveAttribute("href", `https://objkt.com/tokens/${contract}/8`);
    await feature.locator("[data-horf-season-art-prev]").click();
    await expect(feature.locator("[data-horf-season-art-token]")).toHaveText("Neighvember Chestnut");
    await expect(feature.locator("[data-horf-season-art-toggle]")).toHaveAttribute("aria-label", "Pause horse art rotation");
    await feature.locator("[data-horf-season-art-toggle]").click();
    await expect(feature.locator("[data-horf-season-art-toggle]")).toHaveAttribute("aria-label", "Resume horse art rotation");
    await feature.locator("[data-horf-season-art-toggle]").click();
    await expect(feature.locator("[data-horf-season-art-toggle]")).toHaveAttribute("aria-label", "Pause horse art rotation");
    await expect(page.locator("[data-horf-wanted-poster]")).toContainText("10 $HORSE");
    await expect(page.locator("[data-horf-wanted-poster]")).toContainText("Neighvember 2026");
  });

  test("tries another minted horse before the wanted poster photo fallback", async ({ page, request }) => {
    const response = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(response.ok()).toBeTruthy();
    await mockSeason(page, []);
    await page.route("**/horf-art/broken-mint.jpg", (route) => route.fulfill({ status: 404, body: "" }));
    await page.route(/\/api\/horf\/open-range\?season=current-2026$/, (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ items: [
        { contract, tokenId: "7", name: "Available mint", image: "/horf-art/horse-gallop-photo.jpg", creatorAddress: leadWallet },
        { contract, tokenId: "8", name: "Broken mint", image: "/horf-art/broken-mint.jpg", creatorAddress: thirdWallet },
      ] }),
    }));
    await page.goto("/horf?season=current-2026");
    const wanted = page.locator("[data-horf-wanted-poster]");
    await expect(wanted.locator("[data-horf-wanted-mint]")).toHaveAttribute("href", `https://objkt.com/tokens/${contract}/7`);
    await expect(wanted.locator(".photo-fallback")).toHaveCount(0);
  });

  test("welcomes a direct guest and keeps personal horse records behind wallet proof", async ({ page, request }) => {
    const response = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(response.ok()).toBeTruthy();
    await page.route("**/api/horf/wallet/session", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ walletAddress: null, verified: false }),
    }));
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ active: false, role: null }),
    }));
    await mockSeason(page, []);
    await page.goto("/horf");

    const app = page.locator("[data-horf-app]");
    await expect(app).toBeVisible();
    const wtfHome = page.locator("[data-horf-left-nav] [data-horf-wtf-home]");
    await expect(wtfHome).toBeVisible();
    await expect(wtfHome).toHaveAttribute("href", "/");
    await expect(wtfHome).toContainText("Brought to you by wtfOS.app");
    await expect(app.locator('[data-horf-region="intro"]')).toContainText("No WTF OS sign-in needed");
    await expect(app.locator("[data-horf-wallet-status]")).toContainText("Browse horses without signing in");
    await expect(app.locator('[data-horf-region="race"]')).toHaveCount(0);
    await expect(app.locator("[data-horf-wallet-connect-intro]")).toHaveText("Connect and verify wallet");
    await expect(app).toHaveAttribute("data-horf-page", "home");
    await expect(app.locator('[data-horf-region="personal-stable"]')).toHaveCount(0);
    await expect(app.locator('[data-horf-region="inspector-desk"]')).toHaveCount(0);
    await expect(app.locator('[data-horf-region="trader-ledger"]')).toHaveCount(0);
    await app.locator("[data-horf-horse-market-open]").click();
    await expect(page).toHaveURL(/\/horf\/horse-market\?season=current-2026$/);
    await expect(app.locator('[data-horf-region="market-tabs"]')).toBeVisible();
    await expect(page.getByRole("tab", { name: /Horse4HORSE/ })).toHaveCount(0);
    await page.goto("/horf");
    await page.locator('[data-horf-left-nav] a[href^="/horf/stable"]').click();
    await expect(page).toHaveURL(/\/horf\/stable\?season=current-2026$/);
    await expect(app).toHaveAttribute("data-horf-page", "stable");
    await expect(app.locator('[data-horf-region="personal-stable"] [data-horf-stable-wallet-status]')).toContainText("No wallet selected");
    await expect(app.locator('[data-horf-region="personal-stable"] [data-horf-profile-connect]')).toHaveText("Connect and verify wallet");
    await expect(app.locator('[data-horf-region="personal-stable"] [data-horf-personal-token]')).toBeDisabled();
    await expect(app.locator('[data-horf-region="trader-ledger"]')).toContainText("Connect and verify your Tezos wallet");
    await expect(app.locator('[data-horf-region="race"]')).toHaveCount(0);
    await page.locator('[data-horf-left-nav] a[href^="/horf/horse-market"]').click();
    await expect(page).toHaveURL(/\/horf\/horse-market\?season=current-2026$/);
    await expect(page.getByRole("tab", { name: /Horse4HORSE/ })).toHaveCount(0);
    await page.getByRole("tab", { name: /Marshal’s Market/ }).click();
    await expect(page.getByRole("tab", { name: /Marshal’s Market/ })).toHaveAttribute("aria-selected", "true");
    await expect(app).toHaveAttribute("data-horf-page", "horse-market");
    await expect(app.locator('[data-horf-region="marshals-market"]')).toBeVisible();
    await expect(app.locator('[data-horf-region="inspector-desk"]')).toHaveCount(0);
    await expect(page.locator('[data-horf-nav="inspection-desk"]')).toHaveCount(0);
    await expect(app.locator('[data-horf-region="personal-stable"]')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(wtfHome).toBeVisible();
    await expect(wtfHome).toHaveAccessibleName(/wtf.*home/i);
    await wtfHome.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("keeps a guest on Horf when a wallet proof expires", async ({ page, request }) => {
    const response = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(response.ok()).toBeTruthy();
    await page.addInitScript(({ address }) => {
      window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
    }, { address: traderWallet });
    let verified = true;
    await page.route("**/api/horf/wallet/session", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ walletAddress: verified ? traderWallet : null, verified }),
    }));
    await page.route(/\/api\/horf\/posse(?:\?.*)?$/, (route) => route.fulfill({
      status: 403, contentType: "application/json",
      body: JSON.stringify({ error: "Verify this wallet to use its private Horf features" }),
    }));
    await page.route("**/api/horf/gifts?*", (route) => route.fulfill({
      status: 403, contentType: "application/json",
      body: JSON.stringify({ error: "Verify this wallet to use its private Horf features" }),
    }));
    await mockSeason(page, []);
    await page.goto("/horf/gifts");

    const app = page.locator("[data-horf-app]");
    await expect(app.locator("[data-horf-wallet-status]")).toContainText("Horf wallet verified");
    await expect(app.locator('[data-horf-region="gifts"]')).toContainText("Your Horf wallet proof is missing or expired");
    verified = false;
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(app.locator("[data-horf-wallet-status]")).toContainText("Verify it to open your stable");
    await expect(app.locator('[data-horf-region="gifts"]').getByRole("button", { name: "Connect and verify wallet" })).toBeVisible();
    await expect(page).toHaveURL(/\/horf\/gifts(?:\?season=current-2026)?$/);
  });

  test("shows a blacklisted rider's public reason to guests without moderation controls", async ({ page, request }) => {
    const response = await request.post("/__test/state", { data: { userRole: "anonymous" } });
    expect(response.ok()).toBeTruthy();
    await page.route("**/api/horf/wallet/session", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ walletAddress: null, verified: false }),
    }));
    await page.route("**/api/horf/season*", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        ...seasonResponse(null, season.key),
        leaderboard: leaderboard.map((row) => ({ ...row, blacklisted: row.address === leadWallet })),
      }),
    }));
    await page.route("**/api/horf/trader-status?*", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        address: new URL(route.request().url()).searchParams.get("address"),
        blacklisted: true,
        reason: "Repeated failed horse handoffs",
        evidenceUrl: "https://example.org/horf-evidence",
        listedAt: "2026-11-03T12:00:00.000Z",
      }),
    }));
    await page.goto(`/horf/horse-market?season=current-2026&market=outlaw&outlaw=available&trader=${leadWallet}`);

    const app = page.locator("[data-horf-app]");
    const standing = app.locator('[data-horf-region="trader-status"]');
    await expect(standing.locator("[data-horf-status-address]")).toHaveValue(leadWallet);
    await expect(standing.locator("[data-horf-status-result]")).toContainText("Repeated failed horse handoffs");
    await expect(standing.locator("[data-horf-status-result] a")).toHaveAttribute("href", "https://example.org/horf-evidence");
    await expect(standing.locator("[data-horf-admin-blacklist]")).toHaveCount(0);
    await standing.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-blacklisted-guest.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await standing.scrollIntoViewIfNeeded();
    expect(await standing.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  });

  test("lets a signed-in admin add and clear a trader blacklist entry", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page, []);
    let entries = [];
    await page.route("**/api/horf/admin/blacklist", (route) => {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        const entry = {
          address: body.address, active: true, reason: body.reason, evidenceUrl: body.evidenceUrl,
          listedAt: "2026-11-03T12:00:00.000Z", listedByUserId: 1,
          clearedAt: null, clearedByUserId: null,
        };
        entries = [entry];
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(entry) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries }) });
    });
    await page.route(/\/api\/horf\/admin\/blacklist\/tz[1-5][^/]+$/, (route) => {
      const entry = { ...entries[0], active: false, clearedAt: "2026-11-03T12:30:00.000Z", clearedByUserId: 1 };
      entries = [entry];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(entry) });
    });
    await page.route("**/api/horf/trader-status?*", (route) => {
      const address = new URL(route.request().url()).searchParams.get("address");
      const listed = entries.find((entry) => entry.address === address && entry.active);
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({
          address, blacklisted: Boolean(listed), reason: listed?.reason ?? null,
          evidenceUrl: listed?.evidenceUrl ?? null, listedAt: listed?.listedAt ?? null,
        }),
      });
    });
    await page.goto("/horf/horse-market?season=current-2026&market=outlaw&outlaw=available");

    const standing = page.locator('[data-horf-region="trader-status"]');
    const admin = standing.locator("[data-horf-admin-blacklist]");
    await expect(admin).toBeVisible();
    await admin.locator("[data-horf-admin-blacklist-address]").fill(leadWallet);
    await admin.locator("[data-horf-admin-blacklist-reason]").fill("Repeated failed horse handoffs");
    await admin.locator("[data-horf-admin-blacklist-evidence]").fill("https://example.org/horf-evidence");
    await admin.locator("[data-horf-admin-blacklist-submit]").click();
    await expect(admin.locator("[data-horf-admin-blacklist-entry]")).toContainText("Repeated failed horse handoffs");
    await expect(standing.locator("[data-horf-status-result]")).toContainText("Blacklisted by Horf moderation");
    await admin.locator("[data-horf-admin-blacklist-remove]").click();
    await expect(admin.locator("[data-horf-admin-blacklist-entry]")).toHaveCount(0);
    await expect(standing.locator("[data-horf-status-result]")).toContainText("No active Horf blacklist entry");
  });

  test("keeps the race open when the season API returns malformed data", async ({ page, request }) => {
    await seedTrader(request);
    await page.route("**/api/horf/season*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    }));

    await page.goto("/horf/race");

    const app = page.locator("[data-horf-app]");
    await expect(app).toBeVisible();
    await expect(app.getByRole("alert")).toContainText("The race did not update");
    await expect(app.locator('[data-horf-region="race"]')).toContainText("Race board unavailable");
    await expect(page.locator("[data-app-error]")).toHaveCount(0);
  });

test("lets riders compare sent and received rides, edition volume, reach, and returns", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page, []);
    await page.goto("/horf/race?season=current-2026");
    const race = page.locator('[data-horf-region="race"]');
    const lanes = race.locator("[data-horf-lane]");
    await expect(lanes.first()).toContainText("Sir Canter");
    await expect(lanes.first()).toHaveAttribute("data-horf-race-score", "7");

    await race.locator('[data-horf-race-story="received"]').click();
    await expect(race.locator("[data-horf-race-story-note]")).toContainText("Inbound horse interactions");
    await expect(lanes.first()).toContainText("Sir Canter");
    await expect(lanes.first()).toHaveAttribute("data-horf-race-score", "4");

    await race.locator('[data-horf-race-story="volume"]').click();
    await expect(race.locator("[data-horf-race-story-note]")).toContainText("Raw editions sent");
    await expect(lanes.first()).toContainText("Mare Force");
    await expect(lanes.first()).toHaveAttribute("data-horf-race-score", "10");

    await race.locator('[data-horf-race-story="returns"]').click();
    await expect(race.locator("[data-horf-race-story-note]")).toContainText("matched by a return");
    await expect(lanes.first()).toContainText("Mare Force");
    await expect(lanes.first()).toHaveAttribute("data-horf-race-score", "8");
  });

  test("welcomes traders and orders the season horse race before wallet connection", async ({ page, request }) => {
    await seedTrader(request);
    const observedAddresses = [];
    await mockSeason(page, observedAddresses);
    await page.setViewportSize({ width: 1440, height: 900 });

    await page.goto("/horf");

    const app = page.locator("[data-horf-app]");
    await expect(app).toBeVisible();
    const frame = page.locator("[data-horf-frame]");
    const leftNav = frame.locator("[data-horf-left-nav]");
    const primary = frame.locator("[data-horf-primary]");
    const rightRail = frame.locator("[data-horf-right-rail]");
    await expect(frame).toBeVisible();
    await expect(leftNav.getByRole("link", { name: "Open Range" })).toBeVisible();
    await expect(rightRail).toContainText("Race leader");
    await expect(page.locator("[data-wtf-desktop]")).toHaveCount(0);
    await expect(page.locator("[data-bug-report-trigger]")).toHaveCount(0);
    const layout = await frame.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const left = element.querySelector("[data-horf-left-nav]").getBoundingClientRect();
      const center = element.querySelector("[data-horf-primary]").getBoundingClientRect();
      const right = element.querySelector("[data-horf-right-rail]").getBoundingClientRect();
      return { width: bounds.width, leftRight: left.right, centerLeft: center.left,
        centerRight: center.right, centerWidth: center.width, rightLeft: right.left };
    });
    expect(layout.leftRight).toBeLessThanOrEqual(layout.centerLeft + 1);
    expect(layout.centerWidth).toBeGreaterThanOrEqual(layout.width * 0.75 - 1);
    expect(layout.rightLeft).toBeGreaterThanOrEqual(layout.centerRight - 1);
    await expect(app.locator('[data-horf-region="intro"]')).toContainText(/horse trader/i);
    await expect(app.locator('[data-horf-region="intro"]')).toContainText("Find a horse, meet a trader, and make a return ride");
    await expect(app.locator('[data-horf-region="intro"]')).toContainText("Connect a wallet to open your stable");
    const poster = app.locator("[data-horf-wanted-poster]");
    await expect(poster).toContainText("Wanted");
    await expect(poster).toContainText("Horse traders · all riders welcome");
    await expect(poster).toContainText("Neighvember 2026");
    await expect(poster).toContainText("10 $HORSE");
    await expect(poster).toContainText("Sender earns the reward");
    await expect(app.getByRole("button", { name: "Browse Horse Market" })).toBeVisible();
    await expect(app.locator("[data-horf-open-range-open]")).toHaveText("Browse the Open Range");
    await expect(app.locator("[data-horf-wallet-connect-intro]")).toBeVisible();
    await expect(app).toHaveAttribute("data-horf-page", "home");
    await expect(app.locator('[data-horf-region="race"]')).toHaveCount(0);
    await app.locator("[data-horf-horse-market-open]").click();
    await expect(page).toHaveURL(/\/horf\/horse-market\?season=current-2026$/);
    await page.goto("/horf?season=current-2026");
    await leftNav.locator('[data-horf-nav="race"]').click();
    await expect(page).toHaveURL(/\/horf\/race\?season=current-2026$/);
    await expect(app.locator('[data-horf-region="intro"]')).toHaveCount(0);
    await expect(app.locator("[data-horf-wanted-poster]")).toHaveCount(0);
    await expect(app.locator('[data-horf-region="race"]')).toBeVisible();
    await expect(app.locator("[data-horf-lane]")).toHaveCount(3);
    await expect(app.locator("[data-horf-lane]")).toContainText(["Sir Canter", "You", "Mare Force"]);
    await expect(app.locator("[data-horf-lane]").first()).toHaveAttribute("data-horf-trades", "7");
    await expect(app.locator("[data-horf-lane]").first()).toBeInViewport();
    expect(observedAddresses).toContain(null);
    await page.screenshot({ path: "test-results/horf-race-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(rightRail).toBeHidden();
    await page.screenshot({ path: "test-results/horf-race-narrow.png", fullPage: true });
    expect(await app.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expect(leftNav).toBeVisible();
    const updates = primary.getByRole("button", { name: "Trail updates" });
    await updates.focus();
    await page.keyboard.press("Enter");
    await expect(updates).toHaveAttribute("aria-expanded", "true");
    await expect(rightRail).toContainText("Race leader");
    await expect(rightRail).not.toContainText("Guest rider");
    await expect(rightRail).toBeVisible();
    await page.screenshot({ path: "test-results/horf-race-narrow-rail.png" });
    await page.keyboard.press("Escape");
    await expect(rightRail).toBeHidden();
    await leftNav.locator('[data-horf-nav="traders"]').click();
    await expect(page).toHaveURL(/\/horf\/traders\?season=current-2026$/);
    await expect(app).toHaveAttribute("data-horf-page", "traders");
    await expect(app.locator('[data-horf-region="trader-directory"]')).toBeVisible();
    await expect(app.locator('[data-horf-region="race"]')).toHaveCount(0);
    await page.screenshot({ path: "test-results/horf-traders-narrow.png", fullPage: true });
    await leftNav.getByRole("link", { name: "Open Range" }).click();
    await expect(page).toHaveURL(/\/horf\/open-range\?season=current-2026$/);
    await expect(page.locator("[data-horf-open-range]")).toBeVisible();
  });

  test("shows the connected trader's receipts, return ledger, and Objkt token links", async ({ page, request }) => {
    await seedTrader(request);
    await page.addInitScript(({ address }) => {
      window.localStorage.setItem("wtf:wallet-session", JSON.stringify({
        address,
        providerName: "octez.connect",
      }));
    }, { address: traderWallet });
    const observedAddresses = [];
    const observedSeasons = [];
    await mockSeason(page, observedAddresses, observedSeasons);
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
    await page.route("**/api/horf/wallet/tokens?*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        pagination: { limit: 48, offset: 0, total: 0, hasMore: false, nextOffset: 0 },
      }),
    }));

    await page.goto("/horf?season=current-2026");

    const app = page.locator("[data-horf-app]");
    await expect(app).toHaveAttribute("data-horf-page", "stable");
    await expect(app.locator('[data-horf-region="personal-stable"]')).toBeVisible();
    await expect(app.locator('[data-horf-region="trader-ledger"]')).toContainText("2");
    const waitingDetails = app.locator("[data-horf-waiting-details]");
    const recentDetails = app.locator("[data-horf-recent-details]");
    await expect(waitingDetails).not.toHaveAttribute("open", "");
    await expect(recentDetails).not.toHaveAttribute("open", "");
    await expect(app.locator('[data-horf-region="owed-to"]')).toBeInViewport();
    await waitingDetails.locator("summary").click();
    await recentDetails.locator("summary").click();
    await expect(app.locator('[data-horf-region="waiting-horses"]')).toContainText("Neighvember 2026 #7");
    await expect(app.locator('[data-horf-region="waiting-horses"]')).toContainText("2 horses");
    await expect(app.locator('[data-horf-region="waiting-horses"] a[href="https://objkt.com/tokens/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/7"]')).toBeVisible();
    await expect(app.locator('[data-horf-region="owed-to"]')).toContainText("Sir Canter");
    await expect(app.locator('[data-horf-region="owed-to"]')).toContainText("2 horses");
    await expect(app.locator('[data-horf-region="owed-by"]')).toContainText("Mare Force");
    await expect(app.locator('[data-horf-region="owed-by"]')).toContainText("1");
    await expect(app.locator('[data-horf-region="recent"]')).toContainText("Neighvember 2026 #7");
    await expect(app.locator('[data-horf-region="recent"]')).toContainText("Horse of July 2026 #3");
    await expect(app.locator('[data-horf-region="recent"] a[href="https://objkt.com/tokens/KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton/7"]')).toBeVisible();
    expect(observedAddresses).toContain(traderWallet);
    await app.locator('[data-horf-region="waiting-horses"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-trader-waiting-desktop.png", fullPage: true });
    await app.locator('[data-horf-region="owed-to"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-trader-ledger-desktop.png", fullPage: true });
    await app.locator('[data-horf-region="recent"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-trader-recent-desktop.png", fullPage: true });

    await page.goto("/horf/race?season=current-2026");
    const seasonSelect = app.locator("[data-horf-season-select]");
    await expect(seasonSelect).toHaveValue("current-2026");
    await seasonSelect.selectOption("neighvember-2025");
    await expect(page).toHaveURL(/\?season=neighvember-2025$/);
    await expect(app.locator("[data-horf-lane]").first()).toContainText("Mare Force");
    await expect(app.locator("[data-horf-lane]").first()).toHaveAttribute("data-horf-trades", "6");
    await expect(app.locator('[data-horf-region="season"]')).toContainText("Archive dates estimated from mint tags and event posts");
    await expect(app.locator('[data-horf-region="race"]')).toContainText("Neighvember 2025");
    await expect(app.locator("[data-horf-wanted-poster]")).toHaveCount(0);
    await page.locator('[data-horf-left-nav] a[href^="/horf/stable"]').click();
    await expect(page).toHaveURL(/\/horf\/stable\?season=neighvember-2025$/);
    await app.locator("[data-horf-waiting-details] summary").click();
    await app.locator("[data-horf-recent-details] summary").click();
    await expect(app.locator('[data-horf-region="waiting-horses"]')).toContainText("Neighvember 2025 #4");
    await expect(app.locator('[data-horf-region="owed-to"]')).toContainText("Mare Force");
    await expect(app.locator('[data-horf-region="recent"]')).toContainText("Neighvember 2025 #4");
    expect(observedAddresses.at(-1)).toBe(traderWallet);
    expect(observedSeasons).toContain("neighvember-2025");
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: "test-results/horf-archive-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await app.locator('[data-horf-region="waiting-horses"]').scrollIntoViewIfNeeded();
    expect(await app.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/horf-archive-narrow.png", fullPage: true });

    await page.goto("/horf/race?season=neighvember-2025");
    await seasonSelect.selectOption("current-2026");
    await expect(page).toHaveURL(/\?season=current-2026$/);
    await expect(app.locator("[data-horf-lane]").first()).toContainText("Sir Canter");
    await expect(app.locator('[data-horf-region="race"]')).toContainText("Neighvember 2026");
    await page.locator('[data-horf-left-nav] a[href^="/horf/stable"]').click();
    await expect(page).toHaveURL(/\/horf\/stable\?season=current-2026$/);
    await app.locator("[data-horf-waiting-details] summary").click();
    await expect(app.locator('[data-horf-region="waiting-horses"]')).toContainText("Neighvember 2026 #7");
    expect(observedAddresses.at(-1)).toBe(traderWallet);
    expect(observedSeasons).toContain("current-2026");
  });

  test("sends a return horse from the ledger without leaving the Stable", async ({ page, request }) => {
    await seedTrader(request);
    await page.addInitScript(({ address }) => {
      window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
    }, { address: traderWallet });
    await mockSeason(page, []);
    await page.route("**/api/wallets", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify([{ walletAddress: traderWallet }]),
    }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => {
      const owner = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        address: owner,
        items: owner === traderWallet ? [{
          contract, tokenId: "7", name: "Neighvember 2026 #7", balance: "3",
          mintedAt: "2026-11-02T12:00:00.000Z", image: "/horf-art/horse-gallop-photo.jpg", creatorAddress: traderWallet,
        }] : [],
        pagination: { hasMore: false, nextOffset: owner === traderWallet ? 1 : 0 },
      }) });
    });
    await page.route("**/api/horf/wallet/tokens?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        items: [{ contract, tokenId: "7", name: "Neighvember 2026 #7", balance: "3", walletAddress: traderWallet }],
        pagination: { hasMore: false, nextOffset: 1 },
      }),
    }));

    await page.goto("/horf/stable?season=current-2026");
    const stableUrl = page.url();
    await page.locator("[data-horf-waiting-details] summary").click();
    const waiting = page.locator('[data-horf-region="waiting-horses"]');
    const returnButton = waiting.locator('[data-horf-waiting-horse] [data-horf-return-send]');
    await expect(returnButton).toHaveCount(1);
    await expect(returnButton).toHaveAccessibleName("Send a return horse to Sir Canter");
    await returnButton.click();
    const dialog = page.locator("[data-horf-quick-send-dialog]");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Send a horse to Sir Canter");
    await expect(dialog).toContainText(leadWallet);
    await expect(page).toHaveURL(stableUrl);

    await dialog.locator("[data-horf-gift-owned]").selectOption(`${contract}:7`);
    await dialog.locator("[data-horf-gift-amount]").fill("1");
    await dialog.locator("[data-horf-gift-submit]").click();
    await expect(dialog.locator("[data-horf-gift-review]")).toContainText(leadWallet);
    await expect(dialog.locator("[data-horf-gift-review]")).toContainText("1 of 3 owned editions");
    await dialog.locator("[data-horf-quick-send-close]").click();
    await expect(dialog).not.toBeVisible();
    await expect(returnButton).toBeFocused();
    await expect(page).toHaveURL(stableUrl);

    const owedTo = page.locator('[data-horf-region="owed-to"]');
    const owedToButton = owedTo.locator('[data-horf-owed-to-row] [data-horf-owed-to-send]');
    await expect(owedToButton).toHaveCount(1);
    await owedToButton.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(leadWallet);
    await dialog.locator("[data-horf-quick-send-close]").click();
    await expect(owedToButton).toBeFocused();
    await expect(page).toHaveURL(stableUrl);
    await expect(page.locator('[data-horf-region="owed-by"] [data-horf-owed-to-send]')).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await returnButton.scrollIntoViewIfNeeded();
    await expect(returnButton).toBeVisible();
    expect(await page.locator("[data-horf-app]").evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
  });
});
