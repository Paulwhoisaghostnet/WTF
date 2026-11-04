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

  test("shows three modes and an honest no-contract state before deployment", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    await page.route(/\/api\/horf\/stables(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        network: "mainnet", chainId, contractAddress: null, status: "unconfigured",
        permitReady: false, asOf: null, reciprocalCredits: "0", groupCredits: "0", listings: [],
      }),
    }));

    await page.goto("/horf/marshals-market");
    const stables = page.locator('[data-horf-region="stables"]');
    const marshalsMarket = page.locator('[data-horf-region="marshals-market"]');
    await expect(marshalsMarket).toContainText("Marshal’s Market");
    await expect(marshalsMarket).toContainText("Browse approved horses currently listed for swap");
    await expect(stables).toBeVisible();
    await expect(stables.locator("[data-horf-stable-trust-note]")).toContainText("not proof that an arbitrary FA2 transfers honestly");
    await expect(stables).toContainText("no Mainnet stable contract is deployed or configured yet");
    await expect(stables.locator("[data-horf-stable-mode]")).toHaveCount(3);
    await expect(stables.locator('[data-horf-stable-mode="reciprocal"]')).toHaveAttribute("aria-pressed", "true");
    await expect(stables.locator("[data-horf-stable-deposit]")).toHaveCount(0);
    await stables.locator("[data-horf-stable-manage-toggle]").click();
    await expect(stables.locator("[data-horf-stable-submit]")).toBeDisabled();
    await expect(stables.locator("[data-horf-stable-listings]")).toContainText("Listings will appear once the Mainnet contract is deployed");
    await stables.locator('[data-horf-stable-mode="honor"]').click();
    await expect(stables.locator('[data-horf-stable-mode="honor"]')).toHaveAttribute("aria-pressed", "true");
    await expect(stables.locator("[data-horf-stable-deposit]")).toContainText("No horse deposit required to claim");
    await stables.locator('[data-horf-stable-mode="group"]').click();
    await expect(stables.locator('[data-horf-stable-mode="group"]')).toHaveAttribute("aria-pressed", "true");
    await expect(stables.locator("[data-horf-stable-deposit]")).toContainText("Each distinct FA2 horse token earns 30 claims, however many editions you deposit");
    await expect(stables.locator("[data-horf-stable-submit]")).toBeDisabled();
    await stables.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-stables-unconfigured-desktop.png", fullPage: true });
  });

  test("shows only filtered market listings while keeping a revoked owner's cancel control", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    await mockLinkedWallet(page);
    const reads = [];
    await page.route(/\/api\/horf\/stables(?:\?.*)?$/, (route) => {
      const params = new URL(route.request().url()).searchParams;
      reads.push({ market: params.get("market"), address: params.get("address") });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        ...stableSnapshot(true), listings: params.get("market") === "1" ? [listings[0]] : [listings[0], listings[1]],
      }) });
    });
    await page.goto("/horf/marshals-market");
    const stables = page.locator('[data-horf-region="stables"]');
    await expect(stables.locator('[data-horf-stable-listing-id="1"]')).toBeVisible();
    await expect(stables.locator('[data-horf-stable-listing-id="2"]')).toHaveCount(0);
    await expect(stables.locator("[data-horf-stable-deposit]")).toHaveCount(0);
    expect(reads).toContainEqual({ market: "1", address: traderWallet });
    await stables.locator("[data-horf-stable-manage-toggle]").click();
    await expect(stables.locator('[data-horf-stable-owner-listing-id="2"]')).toContainText("Off the public market");
    await expect(stables.locator('[data-horf-stable-owner-listing-id="2"] [data-horf-stable-owner-cancel]')).toBeEnabled();
    expect(reads).toContainEqual({ market: null, address: traderWallet });
    await stables.getByRole("textbox", { name: "Return my editions from listing 2" }).fill("3");
    await stables.locator('[data-horf-stable-owner-listing-id="2"] [data-horf-stable-owner-cancel]').click();
    await expect(stables.getByRole("alert")).toContainText("Cancel amount exceeds the editions still listed");
  });

  test("saves an owned horse in the personal stable before requesting inspection", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    await mockLinkedWallet(page);
    await page.setViewportSize({ width: 900, height: 600 });
    let selections = [];
    let inspectionStatus = "none";
    const selection = {
      id: 31, ownerAddress: traderWallet, tokenContract, tokenId: "7",
      token: { name: "Neighvember Seven", image: null },
      selectedAt: "2026-11-03T12:00:00.000Z", inspectionStatus: "none", inspectionId: null,
    };
    const submissions = [];
    await page.route(/\/api\/horf\/stables(?:\?.*)?$/, (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(stableSnapshot(true)),
    }));
    await page.route("**/api/horf/wallet/tokens?*", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        items: [{ contract: tokenContract, tokenId: "7", name: "Neighvember Seven", balance: "2", walletAddress: traderWallet }],
        pagination: { hasMore: false, nextOffset: 1 },
      }),
    }));
    await page.route(/\/api\/horf\/traders\/[^/]+\/horses(?:\?.*)?$/, (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        address: traderWallet,
        items: [{ contract: tokenContract, tokenId: "7", name: "Neighvember Seven", balance: "2", image: null, artifactUri: null, mime: "image/png", mintedAt: "2026-11-03T12:00:00.000Z" }],
        pagination: { hasMore: false, nextOffset: 1 },
      }),
    }));
    await page.route("**/api/horf/stable-selections", (route) => {
      const body = route.request().postDataJSON();
      expect(body).toEqual({ address: traderWallet, tokenContract, tokenId: "7" });
      selections = [selection];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(selection) });
    });
    await page.route("**/api/horf/stable-selections?*", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ selections: selections.map((item) => ({ ...item, inspectionStatus, inspectionId: inspectionStatus === "pending" ? 42 : null })) }),
    }));
    await page.route(/\/api\/horf\/stable-selections\/31$/, (route) => {
      selections = [];
      return route.fulfill({ status: 204, body: "" });
    });
    await page.route("**/api/horf/token-eligibility?*", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ eligible: true, token: { contract: tokenContract, tokenId: "7", name: "Neighvember Seven", image: null } }),
    }));
    await page.route("**/api/horf/inspections/status?*", (route) => route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ contract: tokenContract, tokenId: "7", status: inspectionStatus, inspectionId: inspectionStatus === "pending" ? 42 : null, reason: null }),
    }));
    await page.route("**/api/horf/inspections", (route) => {
      const body = route.request().postDataJSON();
      submissions.push(body);
      inspectionStatus = "pending";
      return route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ id: 42, submitterAddress: traderWallet, tokenContract, tokenId: "7", status: "pending" }),
      });
    });

    await page.goto("/horf/stable");
    const personal = page.locator('[data-horf-region="personal-stable"]');
    await expect(personal.locator("[data-horf-personal-token] option")).toHaveCount(2);
    await personal.getByRole("button", { name: "Select for inspection" }).click();
    await expect(personal.locator("[data-horf-personal-token]")).toHaveValue(`${tokenContract}:7`);
    await expect(personal.locator("[data-horf-personal-selection]")).toBeInViewport();
    await expect(personal.locator("[data-horf-personal-selection]")).toContainText("Neighvember Seven");
    await expect(personal.locator("[data-horf-personal-selection]")).toContainText("qualifying metadata found");
    await personal.locator("[data-horf-personal-add]").click();
    await expect(personal.locator("[data-horf-personal-saved-row]")).toHaveCount(1);
    await expect(personal.locator("[data-horf-inspection-submit]")).toBeEnabled();
    await personal.locator("[data-horf-inspection-submit]").click();
    expect(submissions).toEqual([{ address: traderWallet, tokenContract, tokenId: "7" }]);
    await expect(personal).toContainText("An inspector has this token in the review queue");
    await expect(personal.locator("[data-horf-inspection-submit]")).toBeDisabled();
    await expect(page.locator('[data-horf-region="stables"]')).toHaveCount(0);
    await page.goto("/horf/marshals-market");
    const inspectedStables = page.locator('[data-horf-region="stables"]');
    await inspectedStables.locator("[data-horf-stable-manage-toggle]").click();
    await inspectedStables.locator("[data-horf-owned-select]").selectOption(`${tokenContract}:7`);
    await inspectedStables.getByRole("button", { name: "Add owned horse" }).click();
    await expect(inspectedStables.locator("[data-horf-stable-deposit-row]")).toContainText("Inspection required · pending");
    await expect(inspectedStables.locator("[data-horf-stable-submit]")).toBeDisabled();
    await expect(page.locator('[data-horf-region="personal-stable"]')).toHaveCount(0);
    await page.goto("/horf/outlaw-corral");
    const outlawCorral = page.locator('[data-horf-region="outlaw-corral"]');
    await expect(outlawCorral).toContainText("Outlaw Corral");
    await expect(outlawCorral).toContainText("without inspection");
    await expect(outlawCorral).toContainText("without inspection or escrow");
    await page.goto("/horf/gifts");
    const directTrade = page.locator('[data-horf-region="gifts"]');
    await directTrade.locator("[data-horf-gift-owned]").selectOption(`${tokenContract}:7`);
    await directTrade.locator('[data-horf-art-send-kind] input[value="trade"]').check();
    await directTrade.locator("[data-horf-gift-recipient]").fill(otherTrader);
    await expect(directTrade.locator("[data-horf-gift-submit]")).toHaveText("Review horse send");
    await expect(directTrade.locator("[data-horf-gift-submit]")).toBeEnabled();
    await expect(directTrade).toContainText("Direct trades count when the season ledger scans each transfer");
    await page.goto("/horf/stable");
    await expect(personal.locator("[data-horf-personal-saved-row]")).toHaveCount(1);
    await personal.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-personal-stable-pending.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await personal.scrollIntoViewIfNeeded();
    expect(await personal.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await personal.locator("[data-horf-personal-saved-row]").getByRole("button", { name: "Remove selection" }).click();
    await expect(personal.locator("[data-horf-personal-saved-row]")).toHaveCount(0);
  });

  test("shows a signed-in marshal's evidence and records an admin inspection decision", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    const now = "2026-11-03T12:00:00.000Z";
    const inspection = {
      id: 42,
      submitterAddress: traderWallet,
      token: { contract: tokenContract, tokenId: "7" },
      status: "pending",
      objktMetadata: {
        source: "objkt", checkedAt: now, name: "Neighvember Seven",
        description: "Horse token awaiting a marshal", image: null, decimals: 0,
        tags: [{ name: "neighvember", tokenCount: 12 }],
      },
      chainEvidence: {
        source: "TzKT Mainnet", checkedAt: now, ownerAddress: traderWallet, ownerBalance: "2",
        identity: { contract: tokenContract, creatorAddress: traderWallet, codeHash: 964496845,
          codeSha256: "ab".repeat(32), asOf: now, source: "TzKT Mainnet" },
        recentTransfers: [{ id: 121, transactionId: 11, from: otherTrader, to: traderWallet,
          amount: "2", timestamp: now }],
        note: "Review the FA2 identity before allowing escrow.",
      },
      submittedAt: now, reviewedByWalletAddress: null, reviewedByUserId: null,
      reviewedAt: null, reviewReason: null,
    };
    let pending = [inspection];
    const decisions = [];
    const revocations = [];
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: true, role: "admin" }),
    }));
    await page.route("**/api/horf/inspections/pending", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ inspections: pending }),
    }));
    await page.route("**/api/horf/inspections/42", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(inspection),
    }));
    await page.route("**/api/horf/inspections/42/decision", (route) => {
      decisions.push(route.request().postDataJSON());
      pending = [];
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ ...inspection, status: "approved", reviewedByUserId: 1,
          reviewedAt: now, reviewReason: "Identity and transfers reviewed" }) });
    });
    await page.route(`**/api/horf/admin/inspection-approvals/${tokenContract}/7/revoke`, (route) => {
      revocations.push(route.request().postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ contract: tokenContract, tokenId: "7", status: "revoked", inspectionId: 42,
          reason: "New custody concern", existingPermitsMayRemainValid: true }) });
    });

    await page.goto("/horf/inspection-desk");
    const desk = page.locator('[data-horf-region="inspector-desk"]');
    await expect(desk.locator("[data-horf-inspection-queue-row]")).toHaveCount(1);
    await desk.locator("[data-horf-inspection-open]").click();
    const detail = desk.locator("[data-horf-inspection-detail]");
    await expect(detail).toContainText("Neighvember Seven");
    await expect(detail).toContainText("Code hash 964496845");
    await expect(detail).toContainText("neighvember (12)");
    await expect(desk.locator("[data-horf-inspection-decide]")).toBeDisabled();
    await desk.locator("[data-horf-inspection-reason]").fill("Identity and transfers reviewed");
    await desk.locator("[data-horf-inspection-decide]").click();
    expect(decisions).toEqual([{ decision: "approve", reason: "Identity and transfers reviewed" }]);
    await expect(desk.locator("[data-horf-inspection-queue-row]")).toHaveCount(0);
    await expect(desk).toContainText("Inspection approved for token #7");
    await expect(desk.locator("[data-horf-marshal-roles-open]")).toBeVisible();
    await desk.locator("[data-horf-approval-link]").fill(`https://objkt.com/tokens/${tokenContract}/7`);
    await desk.locator("[data-horf-approval-reason]").fill("New custody concern");
    await desk.locator("[data-horf-approval-revoke]").click();
    expect(revocations).toEqual([{ reason: "New custody concern" }]);
    await expect(desk).toContainText("Approval revoked for new Stable and HORSE Market listings");
  });

  test("separates Marshal reports, unapproved horses, and approved horses and hides without notes", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    const now = "2026-11-03T12:00:00.000Z";
    const candidate = (tokenId, approvedForMarshalsMarket = false) => ({
      contract: tokenContract, tokenId, name: `Horse #${tokenId}`, description: null,
      image: null, artifactUri: null, mime: "image/png", mintedAt: now,
      creatorAddress: traderWallet, approvedForMarshalsMarket, offers: [],
    });
    const report = {
      id: 93, source: "community_report", submitterAddress: null,
      token: { contract: tokenContract, tokenId: "14" }, status: "pending",
      objktMetadata: { source: "Objkt", checkedAt: now, name: "Horse #14",
        description: null, image: null, artifactUri: null, mime: "image/png", decimals: 0,
        tags: [{ name: "horse", tokenCount: 12 }] },
      chainEvidence: { source: "TzKT Mainnet", checkedAt: now, ownerAddress: null,
        ownerBalance: null, identity: { contract: tokenContract, creatorAddress: traderWallet,
          codeHash: 1, codeSha256: "ab".repeat(32), asOf: now, source: "TzKT Mainnet" },
        recentTransfers: [], note: "Review this token's horse identity.",
        communityReport: { source: "rider", reportedAt: now, resolution: "pending" } },
      submittedAt: now, reviewedByWalletAddress: null, reviewedAt: null, reviewReason: null,
    };
    const inspection = { ...report, id: 94, source: "owner_submission",
      submitterAddress: traderWallet, token: { contract: tokenContract, tokenId: "15" },
      objktMetadata: { ...report.objktMetadata, name: "Horse #15" },
      chainEvidence: { ...report.chainEvidence, communityReport: undefined } };
    let pending = [report, inspection];
    let hidden = false;
    const decisions = [];
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: true, role: "horf_marshal" }),
    }));
    await page.route("**/api/horf/inspections/pending", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ inspections: pending }),
    }));
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ season,
        items: [candidate("12"), candidate("13", true), ...hidden ? [] : [candidate("14")]],
        nextCursor: null, hasMore: false, asOf: now }),
    }));
    await page.route("**/api/horf/inspections/93", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(report),
    }));
    await page.route("**/api/horf/reports/not-a-horse/93/decision", (route) => {
      decisions.push(route.request().postDataJSON());
      pending = [inspection];
      hidden = true;
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ status: "hidden", inspectionId: 93, tokenContract, tokenId: "14" }) });
    });

    await page.goto("/horf/inspection-desk");
    const desk = page.locator('[data-horf-region="inspector-desk"]');
    await expect(desk.locator('[data-horf-marshal-filter="awaiting"]')).toHaveAttribute("aria-pressed", "true");
    await expect(desk.locator("[data-horf-marshal-candidate]")).toHaveCount(1);
    await expect(desk.locator("[data-horf-marshal-candidate]")).toContainText("Horse #12");
    await expect(desk.locator("[data-horf-inspection-queue-row]")).toHaveCount(1);
    await expect(desk.locator("[data-horf-inspection-queue-row]")).toContainText("Horse #15");
    await desk.locator('[data-horf-marshal-filter="reports"]').click();
    await expect(desk.locator("[data-horf-marshal-candidate]")).toHaveCount(0);
    await expect(desk.locator("[data-horf-inspection-queue-row]")).toContainText("Horse #14");
    await desk.locator("[data-horf-inspection-open]").click();
    await expect(desk.locator("[data-horf-inspection-decide]")).toBeEnabled();
    await desk.locator("[data-horf-inspection-decide]").click();
    expect(decisions).toHaveLength(1);
    expect(decisions[0].decision).toBe("hide");
    expect(decisions[0].reason || "").toBe("");
    await expect(desk.locator("[data-horf-inspection-queue-row]")).toHaveCount(0);
    await expect(desk).toContainText("hidden from Horf horse displays");
    await desk.locator('[data-horf-marshal-filter="approved"]').click();
    await expect(desk.locator("[data-horf-marshal-candidate]")).toContainText("Horse #13");
    await expect(desk).toContainText("loaded Open Range pages");
    await desk.locator('[data-horf-marshal-filter="awaiting"]').click();
    await expect(desk.locator("[data-horf-marshal-candidate]")).toContainText("Horse #12");
  });

  test("a Marshal hides a candidate and a rider report from their cards without opening evidence", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    const now = "2026-11-03T12:00:00.000Z";
    const hidden = new Set();
    let reports = [{
      id: 93, source: "community_report", submitterAddress: null,
      token: { contract: tokenContract, tokenId: "14" }, status: "pending",
      objktMetadata: { source: "Objkt", checkedAt: now, name: "Horse #14",
        description: null, image: null, artifactUri: null, mime: "image/png", decimals: 0,
        tags: [{ name: "horse", tokenCount: 12 }] },
      chainEvidence: { source: "not_fetched", checkedAt: null, ownerAddress: null,
        ownerBalance: null, identity: null, recentTransfers: [], note: "Rider report",
        communityReport: { source: "rider", reportedAt: now, resolution: "pending" } },
      submittedAt: now, reviewedByWalletAddress: null, reviewedAt: null, reviewReason: null,
    }];
    reports.push({ ...reports[0], id: 94, source: "owner_submission",
      token: { contract: tokenContract, tokenId: "15" },
      objktMetadata: { ...reports[0].objktMetadata, name: "Horse #15" },
      chainEvidence: { ...reports[0].chainEvidence, communityReport: undefined } });
    const directHides = [];
    let detailReads = 0;
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: true, role: "horf_marshal" }),
    }));
    await page.route("**/api/horf/inspections/pending", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ inspections: reports }),
    }));
    await page.route("**/api/horf/inspections/93", (route) => {
      detailReads++;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reports[0]) });
    });
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ season,
        items: ["12", "14"].filter((id) => !hidden.has(id)).map((tokenId) => ({
          contract: tokenContract, tokenId, name: `Horse #${tokenId}`, description: null,
          image: null, artifactUri: null, mime: "image/png", mintedAt: now,
          creatorAddress: traderWallet, approvedForMarshalsMarket: false, offers: [],
        })), nextCursor: null, hasMore: false, asOf: now }),
    }));
    await page.route("**/api/horf/reports/not-a-horse/direct", (route) => {
      const body = route.request().postDataJSON();
      directHides.push(body);
      hidden.add(body.tokenId);
      reports = reports.filter((item) => item.token.tokenId !== body.tokenId);
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ status: "hidden", inspectionId: 93,
          tokenContract: body.tokenContract, tokenId: body.tokenId }) });
    });

    await page.goto("/horf/inspection-desk");
    const desk = page.locator('[data-horf-region="inspector-desk"]');
    await expect(desk.locator("[data-horf-marshal-candidate]")).toContainText("Horse #12");
    await desk.locator("[data-horf-marshal-candidate-hide]").click();
    await expect(desk.locator("[data-horf-marshal-candidate]")).toHaveCount(0);
    await expect(desk).toContainText("Horse #12 is hidden from Horf horse displays");
    await expect(desk.locator("[data-horf-inspection-queue-row]")).toContainText("Horse #15");
    await desk.locator("[data-horf-inspection-hide-now]").click();
    await expect(desk.locator("[data-horf-inspection-queue-row]")).toHaveCount(0);
    await expect(desk).toContainText("Horse #15 is hidden from Horf horse displays");
    await desk.locator('[data-horf-marshal-filter="reports"]').click();
    await expect(desk.locator("[data-horf-inspection-queue-row]")).toContainText("Horse #14");
    await desk.locator("[data-horf-inspection-hide-now]").click();
    await expect(desk.locator("[data-horf-inspection-queue-row]")).toHaveCount(0);
    await expect(desk).toContainText("Horse #14 is hidden from Horf horse displays");
    expect(directHides).toEqual([
      { tokenContract, tokenId: "12" },
      { tokenContract, tokenId: "15" },
      { tokenContract, tokenId: "14" },
    ]);
    expect(detailReads).toBe(0);
  });

  test("restores an exact horse card when direct Marshal Hide fails", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    const now = "2026-11-03T12:00:00.000Z";
    let releaseHide;
    let hideRequest = null;
    const holdHide = new Promise((resolve) => { releaseHide = resolve; });
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: true, role: "horf_marshal" }),
    }));
    await page.route("**/api/horf/inspections/pending", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ inspections: [] }),
    }));
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ season,
        items: [{ contract: tokenContract, tokenId: "16", name: "Horse #16", description: null,
          image: null, artifactUri: null, mime: "image/png", mintedAt: now,
          creatorAddress: traderWallet, approvedForMarshalsMarket: false, offers: [] }],
        nextCursor: null, hasMore: false, asOf: now }),
    }));
    await page.route("**/api/horf/reports/not-a-horse/direct", async (route) => {
      hideRequest = route.request().postDataJSON();
      await holdHide;
      return route.fulfill({ status: 503, contentType: "application/json",
        body: JSON.stringify({ error: "Marshal decision unavailable" }) });
    });

    await page.goto("/horf/inspection-desk");
    const desk = page.locator('[data-horf-region="inspector-desk"]');
    await expect(desk.locator("[data-horf-marshal-candidate]")).toContainText("Horse #16");
    await desk.locator("[data-horf-marshal-candidate-hide]").click();
    try {
      await expect.poll(() => hideRequest).toEqual({ tokenContract, tokenId: "16" });
      await expect(desk.locator("[data-horf-marshal-candidate]")).toHaveCount(0);
    } finally { releaseHide(); }
    await expect(desk.locator("[data-horf-marshal-candidate]")).toContainText("Horse #16");
    await expect(desk.getByRole("alert")).toContainText("Marshal decision unavailable");
  });

  test("a Marshal patrols every Open Range page and approves one horse after reviewing evidence", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    const now = "2026-11-03T12:00:00.000Z";
    const candidate = {
      contract: tokenContract, tokenId: "7", name: "Neighvember Seven",
      description: "A horse from the Open Range", image: null, mintedAt: now,
      creatorAddress: traderWallet, tradedThroughHorf: false, activelyForTradeOnHorf: false,
      approvedForMarshalsMarket: false, offers: [],
    };
    const inspection = {
      id: 77, source: "open_range", submitterAddress: null,
      token: { contract: tokenContract, tokenId: "7" }, status: "pending",
      objktMetadata: { source: "Objkt", checkedAt: now, name: candidate.name,
        description: candidate.description, image: null, decimals: 0,
        tags: [{ name: "neighvember", tokenCount: 12 }] },
      chainEvidence: { source: "TzKT Mainnet", checkedAt: now, ownerAddress: null,
        ownerBalance: null, identity: { contract: tokenContract, creatorAddress: traderWallet,
          codeHash: 964496845, codeSha256: "ab".repeat(32), asOf: now, source: "TzKT Mainnet" },
        recentTransfers: [], note: "Marshal patrol evidence, without an owner assertion." },
      submittedAt: now, reviewedByWalletAddress: null, reviewedByUserId: null,
      reviewedAt: null, reviewReason: null,
    };
    let pending = [];
    let approved = false;
    const prepared = [];
    const decisions = [];
    const rangeReads = [];
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: true, role: "horf_marshal" }),
    }));
    await page.route("**/api/horf/open-range?*", (route) => {
      const url = new URL(route.request().url());
      const mode = url.searchParams.get("season");
      const cursor = url.searchParams.get("cursor") || "0";
      rangeReads.push({ mode, cursor, refresh: url.searchParams.get("refresh") });
      const items = mode === "all-horse-search" && cursor === "0" ? [] : [{ ...candidate, approvedForMarshalsMarket: approved }];
      const hasMore = mode === "all-horse-search" && cursor === "0";
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        season, items, nextCursor: hasMore ? "after-1" : null, hasMore, asOf: now,
      }) });
    });
    await page.route("**/api/horf/horse-market/objkt-listings?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ listings: [] }),
    }));
    await page.route("**/api/horf/inspections/pending", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ inspections: pending }),
    }));
    await page.route("**/api/horf/inspections/status?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        contract: tokenContract, tokenId: "7", status: approved ? "approved" : pending.length ? "pending" : "none",
        inspectionId: pending.length || approved ? 77 : null, reason: null,
      }),
    }));
    await page.route("**/api/horf/inspections/marshal", (route) => {
      prepared.push(route.request().postDataJSON());
      pending = [inspection];
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(inspection) });
    });
    await page.route("**/api/horf/inspections/77", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify(inspection),
    }));
    await page.route("**/api/horf/inspections/77/decision", (route) => {
      decisions.push(route.request().postDataJSON());
      approved = true;
      pending = [];
      return route.fulfill({ status: 200, contentType: "application/json",
        body: JSON.stringify({ ...inspection, status: "approved", reviewedAt: now,
          reviewReason: "Horse tags, code and transfers reviewed" }) });
    });

    await page.goto("/horf/open-range");
    await page.locator("[data-horf-open-range-view-horse]").click();
    const detail = page.locator("[data-horf-open-range-detail]");
    await expect(detail.locator("[data-horf-open-range-inspect]")).toBeVisible();
    await detail.locator("[data-horf-open-range-inspect]").click();
    const desk = page.locator('[data-horf-region="inspector-desk"]');
    await expect(desk.locator("[data-horf-marshal-handoff]")).toContainText(`${tokenContract} / #7`);
    expect(prepared).toEqual([]);
    await expect(desk.locator("[data-horf-marshal-candidate]")).toHaveCount(0);
    await desk.locator("[data-horf-marshal-load-more]").click();
    await expect(desk.locator("[data-horf-marshal-candidate]")).toHaveCount(1);
    expect(rangeReads.every((read) => read.refresh === null)).toBe(true);
    await desk.getByRole("button", { name: "Refresh desk" }).click();
    await expect.poll(() => rangeReads.some((read) => read.mode === "all-horse-search" && read.refresh === "1")).toBe(true);
    await expect(desk.getByRole("button", { name: "Refresh desk" })).toBeEnabled();
    await desk.locator("[data-horf-marshal-handoff-review]").click();
    expect(prepared).toEqual([{ tokenContract, tokenId: "7" }]);
    await expect(desk.locator("[data-horf-inspection-detail]")).toContainText("No owner assertion for Open Range patrol");
    if (process.env.HORF_VISUAL_CAPTURE === "1") {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: "/tmp/horf-marshal-patrol-desktop.png", fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("[data-horf-right-rail]")).toBeHidden();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await desk.locator("[data-horf-inspection-detail]").scrollIntoViewIfNeeded();
    await expect(desk.locator("[data-horf-inspection-detail]")).toBeInViewport();
    if (process.env.HORF_VISUAL_CAPTURE === "1") await page.screenshot({ path: "/tmp/horf-marshal-patrol-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(desk.locator("[data-horf-inspection-decide]")).toBeDisabled();
    await desk.locator("[data-horf-inspection-reason]").fill("Horse tags, code and transfers reviewed");
    await desk.locator("[data-horf-inspection-decide]").click();
    expect(decisions).toEqual([{ decision: "approve", reason: "Horse tags, code and transfers reviewed" }]);
    await desk.locator('[data-horf-marshal-filter="approved"]').click();
    await expect(desk.locator("[data-horf-marshal-candidate]")).toContainText("Marshal approved");
  });

  test("lets a Marshal approve a queued horse without opening the evidence panel", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    const candidate = {
      contract: tokenContract, tokenId: "8", name: "Neighvember Eight",
      description: "A horse at the gate", image: null, mintedAt: "2026-11-03T12:00:00.000Z",
      creatorAddress: traderWallet, approvedForMarshalsMarket: false,
    };
    const inspection = {
      id: 88, source: "owner_submission", submitterAddress: traderWallet,
      token: { contract: tokenContract, tokenId: "8" }, status: "pending",
      objktMetadata: { name: candidate.name }, submittedAt: "2026-11-03T12:00:00.000Z",
    };
    let approved = false;
    let pending = [inspection];
    const prepared = [];
    const decisions = [];
    await page.route("**/api/horf/inspectors/status", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ active: true, role: "horf_marshal" }),
    }));
    await page.route("**/api/horf/open-range?*", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({
        season, items: [{ ...candidate, approvedForMarshalsMarket: approved }],
        nextCursor: null, hasMore: false, asOf: "2026-11-03T12:00:00.000Z",
      }),
    }));
    await page.route("**/api/horf/inspections/pending", (route) => route.fulfill({
      status: 200, contentType: "application/json", body: JSON.stringify({ inspections: pending }),
    }));
    await page.route("**/api/horf/inspections/marshal", (route) => {
      prepared.push(route.request().postDataJSON());
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Existing queue must be reused" }) });
    });
    await page.route("**/api/horf/inspections/88/decision", (route) => {
      decisions.push(route.request().postDataJSON());
      approved = true;
      pending = [];
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...inspection, status: "approved" }) });
    });

    await page.goto("/horf/inspection-desk");
    const desk = page.locator('[data-horf-region="inspector-desk"]');
    await expect(desk.locator("[data-horf-marshal-candidate]")).toHaveCount(0);
    await expect(desk.locator("[data-horf-inspection-queue-row]")).toContainText("Neighvember Eight");
    await desk.locator("[data-horf-inspection-approve-now]").click();
    await desk.locator('[data-horf-marshal-filter="approved"]').click();
    const card = desk.locator("[data-horf-marshal-candidate]");
    await expect(card).toContainText("Marshal approved");
    await expect(desk.locator("[data-horf-inspection-queue-row]")).toHaveCount(0);
    await expect(desk.locator("[data-horf-inspection-detail]")).toContainText("Choose a horse to review its papers");
    expect(prepared).toEqual([]);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({ decision: "approve" });
    expect(decisions[0].reason).toMatch(/direct approval without detailed evidence review/i);
  });

  test("prepares owned and Objkt deposits, then shows credit, claim, and cancel rules", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    await mockLinkedWallet(page);
    let permitReady = true;
    const permitRequests = [];
    await page.route(/\/api\/horf\/stables(?:\?.*)?$/, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(stableSnapshot(permitReady)),
    }));
    await page.route("**/api/horf/wallet/tokens?*", (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        items: [{ contract: tokenContract, tokenId: "7", name: "Neighvember Seven", balance: "2", walletAddress: traderWallet }],
        pagination: { hasMore: false, nextOffset: 1 },
      }),
    }));
    await page.route("**/api/horf/inspections/status?*", (route) => {
      const params = new URL(route.request().url()).searchParams;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          contract: params.get("contract"), tokenId: params.get("tokenId"),
          status: "approved", inspectionId: 17, reason: null,
        }),
      });
    });
    await page.route("**/api/horf/stables/permit", (route) => {
      const body = route.request().postDataJSON();
      permitRequests.push(body);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...body,
          mode: 0, // Deliberate mismatch: prove the client rejects a permit before wallet submission.
          contractAddress: stableContract,
          chainId,
          nonce: `0x${"ab".repeat(32)}`,
          signature: "edsig-fixture",
          oracleEpoch: "0",
          token: { contract: body.tokenContract, tokenId: body.tokenId, name: "Horse fixture", image: null },
        }),
      });
    });

    await page.goto("/horf/marshals-market");
    const stables = page.locator('[data-horf-region="stables"]');
    await expect(stables).toBeVisible();
    await expect(stables.locator("[data-horf-stable-credits]")).toContainText("Reciprocal claims: 0");
    await expect(stables.locator("[data-horf-stable-credits]")).toContainText("Group claims: 30");
    await expect(stables.locator('[data-horf-stable-listing-id="1"] [data-horf-stable-claim]')).toBeDisabled();
    await expect(stables.locator('[data-horf-stable-listing-id="2"] [data-horf-stable-cancel]')).toBeEnabled();

    await stables.locator('[data-horf-stable-mode="honor"]').click();
    await expect(stables.locator('[data-horf-stable-listing-id="3"] [data-horf-stable-claim]')).toBeEnabled();
    await expect(stables.locator('[data-horf-stable-listing-id="4"] [data-horf-stable-cancel]')).toBeEnabled();
    await stables.locator("[data-horf-stable-manage-toggle]").click();
    await expect(stables.locator("[data-horf-owned-select] option")).toHaveCount(2);
    await stables.locator("[data-horf-owned-select]").selectOption(`${tokenContract}:7`);
    await stables.getByRole("button", { name: "Add owned horse" }).click();
    await stables.locator("[data-horf-objkt-input]").fill(`https://objkt.com/tokens/${tokenContract}/8`);
    await stables.getByRole("button", { name: "Add Objkt token" }).click();
    await expect(stables.locator("[data-horf-stable-deposit-row]")).toHaveCount(2);
    await expect(stables.getByRole("textbox", { name: "Editions of Neighvember Seven" })).toHaveValue("0");
    await expect(stables.getByRole("textbox", { name: "Editions of Token #8" })).toHaveValue("0");
    await stables.locator("[data-horf-stable-submit]").click();
    await expect(stables.getByRole("alert")).toContainText("Edition amount must be greater than zero");
    await expect(stables.locator("[data-horf-stable-review]")).toHaveCount(0);
    expect(permitRequests).toEqual([]);
    await stables.getByRole("textbox", { name: "Editions of Neighvember Seven" }).fill("2");
    await stables.getByRole("textbox", { name: "Editions of Token #8" }).fill("1");
    await expect(stables.locator("[data-horf-stable-submit]")).toBeEnabled();
    await stables.locator("[data-horf-stable-submit]").click();
    await expect(stables.locator("[data-horf-stable-review]")).toContainText("Honor Stable · Tezos Mainnet");
    await expect(stables.locator("[data-horf-stable-review-row]")).toHaveCount(2);
    await expect(stables.locator("[data-horf-stable-review-row]").first()).toContainText(`${tokenContract} / #7`);
    await expect(stables.locator("[data-horf-stable-review-row]").first()).toContainText("2 editions");
    await expect(stables.locator("[data-horf-stable-review-row]").last()).toContainText(`${tokenContract} / #8`);
    await expect(stables.locator("[data-horf-stable-review-row]").last()).toContainText("1 edition");
    expect(permitRequests).toEqual([]);
    await stables.getByRole("textbox", { name: "Editions of Neighvember Seven" }).fill("1");
    await expect(stables.locator("[data-horf-stable-review]")).toHaveCount(0);
    await stables.getByRole("textbox", { name: "Editions of Neighvember Seven" }).fill("2");
    await stables.locator("[data-horf-stable-submit]").click();
    await stables.locator("[data-horf-stable-review-confirm]").click();
    await expect(stables.getByRole("alert")).toContainText("permit does not match this horse deposit");
    expect(permitRequests).toEqual([
      { address: traderWallet, mode: 1, tokenContract, tokenId: "7", amount: "2" },
      { address: traderWallet, mode: 1, tokenContract, tokenId: "8", amount: "1" },
    ]);
    await expect(stables.locator("[data-horf-stable-deposit-row]")).toHaveCount(2);

    await stables.locator('[data-horf-stable-mode="group"]').click();
    await expect(stables.locator('[data-horf-stable-listing-id="5"] [data-horf-stable-claim]')).toBeDisabled();
    await expect(stables.locator('[data-horf-stable-listing-id="5"]')).toContainText("Already claimed this token ID");
    await expect(stables.locator('[data-horf-stable-listing-id="6"] [data-horf-stable-claim]')).toBeEnabled();
    await expect(stables.locator('[data-horf-stable-listing-id="7"] [data-horf-stable-cancel]')).toBeEnabled();
    await stables.locator("[data-horf-owned-select]").selectOption(`${tokenContract}:7`);
    await stables.getByRole("button", { name: "Add owned horse" }).click();
    await stables.getByRole("textbox", { name: "Editions of Neighvember Seven" }).fill("2");
    await stables.locator("[data-horf-stable-submit]").click();
    const groupReview = stables.locator("[data-horf-stable-review]");
    await expect(groupReview).toContainText("Neighvember Seven · 2 editions");
    await expect(groupReview.locator("[data-horf-group-credit-rule]")).toContainText("Each distinct FA2 token earns 30 claims, regardless of editions");
    await expect(groupReview.locator("[data-horf-group-credit-rule]")).toContainText("More editions of a token already credited in Group Stable add no claims");
    await expect(groupReview).not.toContainText("60 claims");
    await stables.locator("[data-horf-stable-review-back]").click();
    await stables.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-stables-ready-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await stables.scrollIntoViewIfNeeded();
    expect(await stables.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/horf-stables-ready-narrow.png", fullPage: true });

    permitReady = false;
    await stables.getByRole("button", { name: "Refresh stables" }).click();
    await expect(stables).toContainText("Deposits are paused while the eligibility signer is unavailable");
    await expect(stables.locator("[data-horf-stable-submit]")).toBeDisabled();
    await expect(stables.locator('[data-horf-stable-listing-id="6"] [data-horf-stable-claim]')).toBeEnabled();
    await expect(stables.locator('[data-horf-stable-listing-id="7"] [data-horf-stable-cancel]')).toBeEnabled();
    await stables.getByRole("textbox", { name: "Return editions from listing 7" }).fill("3");
    await stables.locator('[data-horf-stable-listing-id="7"] [data-horf-stable-cancel]').click();
    await expect(stables.getByRole("alert")).toContainText("Cancel amount exceeds the editions still listed");
  });
});
