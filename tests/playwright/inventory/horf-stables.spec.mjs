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
    await expect(marshalsMarket).toContainText("including Honor");
    await expect(marshalsMarket).toContainText("claim or cancel");
    await expect(stables).toBeVisible();
    await expect(stables.locator("[data-horf-stable-trust-note]")).toContainText("not proof that an arbitrary FA2 transfers honestly");
    await expect(stables).toContainText("no Mainnet stable contract is deployed or configured yet");
    await expect(stables.locator("[data-horf-stable-mode]")).toHaveCount(3);
    await expect(stables.locator('[data-horf-stable-mode="reciprocal"]')).toHaveAttribute("aria-pressed", "true");
    await expect(stables.locator("[data-horf-stable-submit]")).toBeDisabled();
    await expect(stables.locator("[data-horf-stable-listings]")).toContainText("Listings will appear once the Mainnet contract is deployed");
    await stables.locator('[data-horf-stable-mode="honor"]').click();
    await expect(stables.locator('[data-horf-stable-mode="honor"]')).toHaveAttribute("aria-pressed", "true");
    await expect(stables.locator("[data-horf-stable-deposit]")).toContainText("No horse deposit required to claim");
    await stables.locator('[data-horf-stable-mode="group"]').click();
    await expect(stables.locator('[data-horf-stable-mode="group"]')).toHaveAttribute("aria-pressed", "true");
    await expect(stables.locator("[data-horf-stable-deposit]")).toContainText("Each deposited edition earns 30 claims");
    await expect(stables.locator("[data-horf-stable-submit]")).toBeDisabled();
    await stables.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/horf-stables-unconfigured-desktop.png", fullPage: true });
  });

  test("saves an owned horse in the personal stable before requesting inspection", async ({ page, request }) => {
    await seedTrader(request);
    await mockSeason(page);
    await mockLinkedWallet(page);
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
    await personal.locator("[data-horf-personal-token]").selectOption(`${tokenContract}:7`);
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
    await inspectedStables.locator("[data-horf-owned-select]").selectOption(`${tokenContract}:7`);
    await inspectedStables.getByRole("button", { name: "Add owned horse" }).click();
    await expect(inspectedStables.locator("[data-horf-stable-deposit-row]")).toContainText("Inspection required · pending");
    await expect(inspectedStables.locator("[data-horf-stable-submit]")).toBeDisabled();
    await expect(page.locator('[data-horf-region="personal-stable"]')).toHaveCount(0);
    await page.goto("/horf/outlaw-corral");
    const outlawCorral = page.locator('[data-horf-region="outlaw-corral"]');
    await expect(outlawCorral).toContainText("Outlaw Corral");
    await expect(outlawCorral).toContainText("without inspection");
    await expect(outlawCorral).toContainText("no Horf escrow");
    await page.goto("/horf/gifts");
    const directTrade = page.locator('[data-horf-region="gifts"]');
    await directTrade.locator("[data-horf-gift-owned]").selectOption(`${tokenContract}:7`);
    await directTrade.locator('[data-horf-art-send-kind] input[value="trade"]').check();
    await directTrade.locator("[data-horf-gift-recipient]").fill(otherTrader);
    await expect(directTrade.locator("[data-horf-gift-submit]")).toHaveText("Trade this horse");
    await expect(directTrade.locator("[data-horf-gift-submit]")).toBeEnabled();
    await expect(directTrade).toContainText("Direct trades count when the season ledger scans the transfer");
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

    await page.goto("/horf/marshals-market");
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
    await expect(desk).toContainText("Approval revoked for new Stable permits");
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
    await expect(stables.locator("[data-horf-owned-select] option")).toHaveCount(2);
    await stables.locator("[data-horf-owned-select]").selectOption(`${tokenContract}:7`);
    await stables.getByRole("button", { name: "Add owned horse" }).click();
    await stables.locator("[data-horf-objkt-input]").fill(`https://objkt.com/tokens/${tokenContract}/8`);
    await stables.getByRole("button", { name: "Add Objkt token" }).click();
    await expect(stables.locator("[data-horf-stable-deposit-row]")).toHaveCount(2);
    await stables.getByRole("textbox", { name: "Editions of Neighvember Seven" }).fill("2");
    await expect(stables.locator("[data-horf-stable-submit]")).toBeEnabled();
    await stables.locator("[data-horf-stable-submit]").click();
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
