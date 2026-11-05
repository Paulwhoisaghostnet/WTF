import { test, expect } from "@playwright/test";

const wallet = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const firstSender = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const secondSender = "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79";
const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const current = { key: "current-2026", startsAt: "2026-11-01T00:00:00.000Z", endsAt: null, label: "Neighvember 2026", inferred: false };
const archive = { key: "neighvember-2025", startsAt: "2025-11-01T00:00:00.000Z", endsAt: "2025-12-01T00:00:00.000Z", label: "Neighvember 2025", inferred: true };
const allTime = { key: "all-time", startsAt: "2023-07-30T00:00:00.000Z", endsAt: null, label: "All time", inferred: true };

function json(route, body) {
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
}

const recent = [
  { id: 11, timestamp: "2026-11-03T14:00:00.000Z", direction: "in", counterparty: firstSender,
    token: { contract, tokenId: "11", name: "Midnight Mare", image: "/horf-art/horse-gallop-photo.jpg" }, amount: 2 },
  { id: 12, timestamp: "2026-11-03T13:00:00.000Z", direction: "in", counterparty: firstSender,
    token: { contract, tokenId: "12", name: "Blue Ribbon", image: "/horf-art/horse-gallop-photo.jpg" }, amount: 1, settlement: "stable", stableMode: 0 },
  { id: 13, timestamp: "2025-11-04T10:00:00.000Z", direction: "in", counterparty: secondSender,
    token: { contract, tokenId: "13", name: "Crimson Canter", image: "/horf-art/horse-gallop-photo.jpg" }, amount: 1 },
  { id: 14, timestamp: "2025-11-03T10:00:00.000Z", direction: "out", counterparty: secondSender,
    token: { contract, tokenId: "14", name: "Sent Stallion", image: "/horf-art/horse-gallop-photo.jpg" }, amount: 2 },
];

async function mockSharing(page) {
  await page.addInitScript(({ address }) => {
    if (window.localStorage.getItem("horf-share-test-guest") !== "1") {
      window.localStorage.setItem("wtf:wallet-session", JSON.stringify({ address, providerName: "octez.connect" }));
    }
  }, { address: wallet });
  await page.route("**/api/wallets", (route) => json(route, [{ walletAddress: wallet }]));
  await page.route(`**/api/wallets/${wallet}/sync`, (route) => json(route, { ok: true }));
  await page.route("**/api/horf/season*", (route) => {
    const url = new URL(route.request().url());
    const season = url.searchParams.get("season") === "all-time" ? allTime : current;
    const personal = url.searchParams.get("address") === wallet;
    const all = season.key === "all-time";
    return json(route, {
      season, seasons: [allTime, current, archive], asOf: "2026-11-04T10:00:00.000Z",
      status: "ready", error: null, nextRefreshAt: null,
      leaderboard: [
        { address: firstSender, name: "The Lead Rider", trades: 10, received: 5, sent: 5 },
        { address: wallet, name: "Saddle Scout", trades: all ? 6 : 3, received: all ? 4 : 3, sent: all ? 2 : 0 },
        { address: secondSender, name: "Crimson Rider", trades: 3, received: 2, sent: 1 },
      ],
      currentUser: personal ? {
        address: wallet, name: "Saddle Scout", trades: all ? 6 : 3, received: all ? 4 : 3, sent: all ? 2 : 0,
        owedTo: [{ address: firstSender, name: "The Lead Rider", count: 1 }], owedBy: [],
        waitingHorses: [{ id: 11, timestamp: recent[0].timestamp, from: firstSender, token: recent[0].token, amount: 1 }],
        recent: all ? recent : recent.filter((receipt) => receipt.timestamp >= current.startsAt),
      } : null,
    });
  });
  await page.route(/\/api\/horf\/traders\/[^/]+\/profile\?season=[^&]+$/, (route) => json(route, {
    address: wallet, seasonKey: new URL(route.request().url()).searchParams.get("season"),
    imageUrl: null, description: "Trading across the seasons.", updatedAt: null,
    username: "Saddle Scout", displayName: "Saddle Scout", usernameSource: "horf", canEditUsername: true,
  }));
  await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => json(route, {
    address: wallet, items: [], pagination: { hasMore: false, nextOffset: 0 },
  }));
  await page.route(/\/api\/horf\/traders\/[^/]+\/offers(?:\?.*)?$/, (route) => json(route, { address: wallet, metadataStatus: "ready", offers: [] }));
  await page.route("**/api/horf/open-range/offers*", (route) => json(route, { offers: [] }));
  await page.route("**/api/horf/wallet/tokens?*", (route) => json(route, {
    items: [], pagination: { limit: 48, offset: 0, total: 0, hasMore: false, nextOffset: 0 },
  }));
  await page.route("**/api/horf/stable-selections?*", (route) => json(route, { selections: [] }));
}

test("a rider shares three editable received-horse stories and visitors see the receipt history", async ({ page, request }) => {
  expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
  await mockSharing(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/horf/stable?season=all-time");
  const stable = page.locator('[data-horf-region="personal-stable"]');
  await expect(stable).toBeVisible();
  await stable.locator("[data-horf-share-open]").click();
  const dialog = page.locator("[data-horf-share-dialog]");
  await expect(dialog).toBeVisible();
  const draft = dialog.locator("[data-horf-share-draft]");
  await expect(dialog.locator('label.story:has([data-horf-share-story="herd"]) li')).toHaveText([
    "4 received editions", "3 distinct horses", "2 sending riders",
  ]);
  await expect(dialog.locator('label.story:has([data-horf-share-story="return"]) li')).toHaveText([
    "3 direct receipts", "2 answered", "1 waiting", "67% reciprocation",
  ]);
  await expect(dialog.locator('label.story:has([data-horf-share-story="race"]) li')).toHaveText([
    "2 sent", "4 received", "6 horse transfers", "#2 standing",
  ]);
  const herdDraft = await draft.inputValue();
  expect(herdDraft).toContain("4");
  expect(herdDraft).toContain("3");
  expect(herdDraft).toContain("2");
  const publicUrl = new URL(`/horf/traders/${wallet}?season=all-time&tab=received`, page.url()).toString();
  expect(herdDraft).toContain(publicUrl);

  await dialog.locator('[data-horf-share-story="return"]').check();
  const returnDraft = await draft.inputValue();
  expect(returnDraft).not.toBe(herdDraft);
  expect(returnDraft).toContain(publicUrl);
  expect(returnDraft).toMatch(/return|answered|waiting|recipro/i);
  await dialog.locator('[data-horf-share-story="race"]').check();
  const raceDraft = await draft.inputValue();
  expect(raceDraft).not.toBe(returnDraft);
  expect(raceDraft).toContain(publicUrl);
  expect(raceDraft).toMatch(/race|trades|standing/i);

  const customDraft = `My riders sent four horses 🐎 ${publicUrl}`;
  await draft.fill(customDraft);
  const xUrl = new URL(await dialog.locator("[data-horf-share-x]").getAttribute("href"));
  expect(["x.com", "twitter.com"]).toContain(xUrl.hostname);
  expect(xUrl.pathname).toBe("/intent/tweet");
  expect(xUrl.searchParams.get("text")).toBe(customDraft);
  const bskyUrl = new URL(await dialog.locator("[data-horf-share-bsky]").getAttribute("href"));
  expect(bskyUrl.origin).toBe("https://bsky.app");
  expect(bskyUrl.pathname).toBe("/intent/compose");
  expect(bskyUrl.searchParams.get("text")).toBe(customDraft);

  const objkt = dialog.locator("[data-horf-share-objkt]");
  await expect(objkt).toHaveAttribute("href", "https://objkt.com/social");
  await page.context().route("https://objkt.com/social", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "Objkt Social test destination" }));
  const popupPromise = page.waitForEvent("popup");
  await objkt.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL("https://objkt.com/social");
  await popup.close();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(customDraft);

  await page.goto("/horf/stable?season=current-2026");
  await page.locator('[data-horf-region="personal-stable"] [data-horf-share-open]').click();
  await expect(page.locator("[data-horf-share-draft]")).toHaveValue(new RegExp(`/horf/traders/${wallet}\\?season=current-2026&tab=received`));

  expect((await request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
  await page.evaluate(() => {
    localStorage.setItem("horf-share-test-guest", "1");
    localStorage.removeItem("wtf:wallet-session");
  });
  await page.goto(publicUrl);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("wtf:wallet-session"))).toBeNull();
  await expect(page.locator("[data-horf-header-wallet]")).toHaveAttribute("data-horf-header-wallet-connect", "true");
  const profile = page.locator('[data-horf-region="trader-profile"]');
  await expect(profile).toBeVisible();
  await expect(profile.locator('[data-horf-profile-tab="received"]')).toHaveAttribute("aria-selected", "true");
  const receivedHorses = profile.locator("[data-horf-profile-received-horse]");
  await expect(receivedHorses).toHaveCount(3);
  await expect(receivedHorses.filter({ hasText: "Midnight Mare" })).toHaveCount(1);
  await expect(receivedHorses.filter({ hasText: "Blue Ribbon" })).toHaveCount(1);
  await expect(receivedHorses.filter({ hasText: "Crimson Canter" })).toHaveCount(1);
  await expect(receivedHorses.filter({ hasText: "Sent Stallion" })).toHaveCount(0);
  await profile.locator('[data-horf-profile-tab="all-horses"]').click();
  await expect(profile.locator("[data-horf-profile-horse]")).toHaveCount(0);
});
