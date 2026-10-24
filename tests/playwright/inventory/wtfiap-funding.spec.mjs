import { expect, test } from "@playwright/test";

// Funding responses below are explicit read-only fixtures, not proof of a chain payment.
// The outer app, embedded game, room creation, bridge, controls and recovery UI are real.
const surface = page => page.locator('[data-wtfiap-surface="true"]:visible');
async function partyFrame(page) {
  const element = await surface(page).locator('iframe[title="coLILseum"]').elementHandle();
  const frame = await element.contentFrame();
  await frame.waitForLoadState("domcontentloaded");
  return frame;
}
async function createPreview(page) {
  await page.goto("/wtfiap?mode=party", { waitUntil: "domcontentloaded" });
  const frame = await partyFrame(page);
  await frame.locator("#room-type").selectOption("tournament");
  await frame.locator("#create-name").fill("Funding UI fixture host");
  await frame.locator("#prep-time").selectOption("ready");
  await frame.locator("#entry-currency").selectOption("XTZ");
  await frame.locator("#entry-fee").fill("1");
  await frame.locator("#create-room").click();
  await expect(frame.locator("#invite-code")).not.toHaveValue("");
  return { frame, roomCode: await frame.locator("#invite-code").inputValue() };
}
const fixtureConfig = { enabled: true, network: "shadownet", chainId: "NetXsqzbfFenSTS", rpcUrl: "https://tezos-shadownet.octez.io/", escrowContract: "KT1ReadOnlyFixtureEscrow", wtfToken: { contract: "KT1ReadOnlyFixtureWTF", tokenId: "0", decimals: 8 }, currencyDecimals: { XTZ: 6, WTF: 8 }, currencyQuantaAtomic: { XTZ: "10000", WTF: "1000000" }, treasuryAddress: "tz1ReadOnlyFixtureTreasury", refundPolicy: "prestart-withdrawal;technical-void-full-refund-v1", prizeRoundingPolicy: "floor-each-prize-to-quantum;remainder-to-wtf.tez-v1" };
function fixtureRoom(code) {
  return { roomCode: code, roomId: "a".repeat(64), termsHash: "b".repeat(64), status: "funding", feeQuantumAtomic: "10000", refundPolicy: fixtureConfig.refundPolicy, treasuryAddress: fixtureConfig.treasuryAddress, prizeRoundingPolicy: fixtureConfig.prizeRoundingPolicy, prizeSummary: null, network: fixtureConfig.network, chainId: fixtureConfig.chainId, escrowContract: fixtureConfig.escrowContract, wtfToken: fixtureConfig.wtfToken,
    terms: { currency: "XTZ", entryFee: "1", entryAtomic: "1000000", decimals: 6, prizePercentages: ["50", "35", "15"] },
    roster: [{ playerId: "fixture-seat", name: "Fixture entrant", walletAddress: "tz1ReadOnlyFixtureWallet", deposited: false }], depositedCount: 0, potAtomic: "0", chainStatus: "funding", finalizedBlock: { hash: "fixture-finalized-block", level: 42 }, lastReconciledAt: null, operations: [],
    self: { playerId: "fixture-seat", walletAddress: "tz1ReadOnlyFixtureWallet", canBind: false, canOpen: false, canStart: false, actions: {}, payout: null, pendingOperations: [{ playerId: "fixture-seat", action: "deposit", operationHash: "ooReadOnlyFixtureSubmitted", observedAt: "2026-10-19T00:00:00Z" }] },
    health: { lastAttemptAt: null, lastSuccessAt: null, error: null, headStreamConnected: true } };
}

test.describe("interaction inventory - WTFIAP funding safety", () => {
  test.beforeEach(async ({ request }) => { expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy(); });

  test("native funding panel recovers a submitted fixture without opening a wallet and resets on leaving", async ({ page }) => {
    const errors = [], observed = [];
    page.on("pageerror", error => errors.push(error.message));
    const { frame, roomCode } = await createPreview(page);
    const room = fixtureRoom(roomCode);
    await page.route("**/api/wtfiap/funding/**", async route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/config")) return route.fulfill({ json: { ok: true, config: fixtureConfig } });
      if (route.request().method() === "POST") {
        observed.push({ path, body: route.request().postDataJSON() });
        expect(path).toBe(`/api/wtfiap/funding/rooms/${roomCode}/reconcile`);
        room.roster[0].deposited = true; room.depositedCount = 1; room.potAtomic = "1000000";
      }
      return route.fulfill({ json: { ok: true, room } });
    });
    await surface(page).getByRole("button", { name: "Room funding", exact: true }).click();
    const panel = surface(page).getByRole("region", { name: "Tournament funding" });
    await expect(panel).toContainText("Tezos shadownet");
    await expect(panel).toContainText("Server verification pending");
    await expect(panel).toContainText("ooReadOnlyFixtureSubmitted");
    await expect(panel.getByRole("button", { name: /^Deposit/ })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("funding-pending-fixture.png"), fullPage: true });
    await panel.getByRole("button", { name: "Recheck status" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("funding-pending-controls-fixture.png"), fullPage: true });
    await panel.getByRole("button", { name: "Recheck status" }).click();
    await expect(panel).toContainText("1 / 8 deposits verified");
    await expect(panel).not.toContainText("Server verification pending");
    expect(observed).toHaveLength(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(panel).toBeVisible();
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("funding-mobile-fixture.png"), fullPage: true });
    await panel.getByRole("button", { name: "Return to game" }).click();
    // Exercise funded disclosure with explicit public-metadata fixtures. The
    // real local room remains an unfunded preview throughout this test.
    await page.route(`**/api/wtfiap/party/rooms/${roomCode}`, async route => {
      const response = await route.fetch(), body = await response.json();
      body.view.tournament.mode = "escrow";
      body.view.tournament.collectedAtomic = "1000000";
      body.view.tournament.funding = { network: "shadownet", status: "funding", collectedAtomic: "1000000", escrowContract: fixtureConfig.escrowContract, feeQuantumAtomic: room.feeQuantumAtomic, treasuryAddress: room.treasuryAddress, prizeRoundingPolicy: room.prizeRoundingPolicy, refundPolicy: room.refundPolicy };
      await route.fulfill({ json: body });
    });
    await page.route(`**/api/wtfiap/party/rooms/${roomCode}/events`, route => route.fulfill({ status: 200, contentType: "text/event-stream", body: ": fixture stream closed\n\n" }));
    await frame.goto(frame.url());
    await expect(frame.locator("#tournament-terms")).toContainText("Escrow tournament · Tezos shadownet");
    await expect(frame.locator("#tournament-terms")).toContainText("Verified deposits: 1 XTZ");
    await expect(frame.locator("#tournament-terms")).not.toContainText("No funds collected or paid");
    await expect(frame.locator("#start-room")).toHaveText("Use Room funding to start");
    await expect(frame.locator("#start-room")).toBeDisabled();
    await frame.locator("#other-room").click();
    await expect(surface(page).getByRole("button", { name: "Room funding", exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });

  test("untrusted window messages cannot select a funding room or expose payment controls", async ({ page }) => {
    const { roomCode } = await createPreview(page);
    const button = surface(page).getByRole("button", { name: "Room funding", exact: true });
    await expect(button).toBeVisible();
    await surface(page).getByRole("link", { name: "Practice" }).click();
    await expect(button).toHaveCount(0);
    await page.evaluate(code => window.postMessage({ type: "wtfiap:room", roomCode: code, roomType: "tournament" }, location.origin), roomCode);
    await expect(button).toHaveCount(0);
  });

  test("terminal funding recovery remains reachable when the battlefield cannot restore", async ({ page }) => {
    const roomCode = "11111111-1111-4111-8111-111111111111", room = fixtureRoom(roomCode);
    room.status = "settled"; room.chainStatus = "settled"; room.depositedCount = 8; room.potAtomic = "8000000";
    room.prizeSummary = { quantumAtomic: "10000", allocatedPlayerPrizesAtomic: "8000000", treasuryRemainderAtomic: "0", treasuryClaimed: true };
    room.self.pendingOperations = []; room.self.payout = { amount: "4000000", claimed: false };
    room.self.actions.claim = { entrypoint: "claim", params: room.roomId, expectedWallet: room.self.walletAddress, contract: room.escrowContract, amountMutez: "0", network: room.network, chainId: room.chainId };
    let walletMutations = 0;
    await page.route("**/api/wtfiap/party/**", route => route.fulfill({ status: 503, json: { ok: false, reason: "Explicit fixture: battlefield restoration unavailable" } }));
    await page.route("**/api/wtfiap/funding/**", route => {
      if (route.request().method() !== "GET") walletMutations++;
      return route.fulfill({ json: route.request().url().endsWith("/config") ? { ok: true, config: { ...fixtureConfig, enabled: false, reason: "New funding disabled in this read-only fixture." } } : { ok: true, room } });
    });
    await page.goto(`/wtfiap?room=${roomCode}&funding=1`);
    const panel = surface(page).getByRole("region", { name: "Tournament funding" });
    await expect(panel).toContainText("4 XTZ · Available to claim");
    await expect(panel).toContainText("Existing verified prize claims and eligible full entry refunds remain available");
    await expect(panel).toContainText("Tezos mainnet selected in wtfOS");
    await expect(panel.getByRole("button", { name: "Claim prize to bound wallet" })).toBeDisabled();
    await panel.getByRole("button", { name: "Use shadownet for wallet operations" }).click();
    await expect(panel).toContainText("No wallet operation was sent");
    await expect(panel.getByRole("button", { name: "Claim prize to bound wallet" })).toBeEnabled();
    await expect(panel.getByRole("link", { name: "Open this room’s funding recovery page" })).toHaveAttribute("href", `/wtfiap?room=${roomCode}&funding=1`);
    expect(walletMutations).toBe(0);
    await page.screenshot({ path: test.info().outputPath("funding-terminal-recovery-fixture.png"), fullPage: true });
    await panel.getByRole("button", { name: "Claim prize to bound wallet" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("funding-terminal-claim-controls-fixture.png"), fullPage: true });
  });
  test("funded entry terms show both currency increments and reject an invalid fee before escrow opens", async ({ page }) => {
    const roomCode = "22222222-2222-4222-8222-222222222222", room = fixtureRoom(roomCode);
    room.self.pendingOperations = []; room.self.canOpen = true; room.chainStatus = null; room.status = "binding";
    room.terms.entryAtomic = "10001"; room.terms.entryFee = "0.010001";
    let opens = 0;
    await page.route("**/api/wtfiap/funding/**", route => {
      if (route.request().url().endsWith("/open")) opens++;
      return route.fulfill({ json: route.request().url().endsWith("/config") ? { ok: true, config: fixtureConfig } : { ok: true, room } });
    });
    await page.goto(`/wtfiap?room=${roomCode}&funding=1`);
    const panel = surface(page).getByRole("region", { name: "Tournament funding" }), open = panel.getByRole("button", { name: "Freeze eight wallets & open escrow" });
    await expect(open).toBeDisabled();
    await expect(panel).toContainText("positive multiple of 0.01 XTZ");
    await expect(panel).toContainText("all remaining room currency goes to wtf.tez");
    await expect(panel).toContainText("tz1ReadOnlyFixtureTreasury");
    await expect(panel).toContainText("An ordinary loss is not refundable");
    room.terms = { ...room.terms, currency: "WTF", decimals: 8, entryAtomic: "1000000", entryFee: "0.01" }; room.feeQuantumAtomic = "1000000";
    await panel.getByRole("button", { name: "Recheck status" }).click();
    await expect(open).toBeEnabled(); await expect(panel).toContainText("0.01 WTF");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await panel.getByText("wtf.tez treasury", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("funded-terms-mobile-fixture.png"), fullPage: true });
    expect(opens).toBe(0);
  });

  test("withdrawal recovery permits redeposit and technical-void refunds survive disabled new funding", async ({ page }) => {
    const roomCode = "33333333-3333-4333-8333-333333333333", room = fixtureRoom(roomCode);
    room.terms = { ...room.terms, currency: "WTF", decimals: 8, entryAtomic: "1000000", entryFee: "0.01" }; room.feeQuantumAtomic = "1000000";
    room.roster[0].deposited = true; room.depositedCount = 1; room.potAtomic = "1000000";
    const refund = { entrypoint: "refund", params: room.roomId, expectedWallet: room.self.walletAddress, contract: room.escrowContract, amountMutez: "0", network: room.network, chainId: room.chainId };
    room.self.actions.refund = refund;
    room.self.pendingOperations = [{ playerId: room.self.playerId, action: "refund", operationHash: "ooReadOnlyFixtureRefund", status: "pending", observedAt: "2026-10-22" }];
    const settings = { ...fixtureConfig }; let reconciles = 0;
    await page.route("**/api/wtfiap/funding/**", route => {
      if (route.request().method() !== "GET") { expect(route.request().url()).toContain("/reconcile"); reconciles++; room.self.pendingOperations[0].status = "applied"; room.roster[0].deposited = false; room.depositedCount = 0; room.potAtomic = "0"; delete room.self.actions.refund;
        if (room.chainStatus === "funding") room.self.actions.deposit = { ...refund, entrypoint: "join_room", params: { room_id: room.roomId, expected_terms_hash: room.termsHash }, fa2Operator: { contract: room.wtfToken.contract, tokenId: room.wtfToken.tokenId, owner: room.self.walletAddress, operator: room.escrowContract } };
      }
      return route.fulfill({ json: route.request().url().endsWith("/config") ? { ok: true, config: settings } : { ok: true, room } });
    });
    await page.goto(`/wtfiap?room=${roomCode}&funding=1`);
    const panel = surface(page).getByRole("region", { name: "Tournament funding" });
    await expect(panel.getByRole("button", { name: "Withdraw full entry to bound wallet" })).toBeDisabled();
    await expect(panel).toContainText("Server verification pending");
    await panel.getByRole("button", { name: "Use shadownet for wallet operations" }).click();
    await panel.getByRole("button", { name: "Recheck status" }).click();
    await expect(panel.getByRole("button", { name: "Redeposit 0.01 WTF" })).toBeEnabled();
    await expect(panel).toContainText("Your full entry withdrawal is verified");
    await panel.getByRole("button", { name: "Redeposit 0.01 WTF" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("withdrawal-redeposit-fixture.png"), fullPage: true });
    room.chainStatus = "voided"; room.status = "voided"; room.roster[0].deposited = true; room.depositedCount = 1; room.potAtomic = "1000000";
    room.self.actions = { refund }; room.self.pendingOperations = []; settings.enabled = false;
    await page.reload();
    await expect(panel).toContainText("This match was technically voided");
    await expect(panel.getByRole("button", { name: "Claim full refund to bound wallet" })).toBeEnabled();
    await expect(panel.getByRole("button", { name: /Deposit|Redeposit|Start funded/ })).toHaveCount(0);
    await panel.getByRole("button", { name: "Claim full refund to bound wallet" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("technical-void-refund-fixture.png"), fullPage: true });
    expect(reconciles).toBe(1);
  });

  test("funded battlefield results show rounded chain prizes and treasury remainder, and voided rooms keep refund guidance", async ({ page }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const { frame, roomCode } = await createPreview(page); let voided = false;
    await page.route(`**/api/wtfiap/party/rooms/${roomCode}`, async route => {
      const response = await route.fetch(), body = await response.json(), tournament = body.view.tournament;
      const ids = [body.view.players[0].playerId, "fixture-second", "fixture-third", "fixture-fourth"];
      body.view.players = ids.map((playerId, index) => ({ playerId, name: "Fixture place " + (index + 1), isAI: false }));
      if (voided) body.view.phase = "voided";
      tournament.mode = "escrow"; tournament.collectedAtomic = "80000";
      tournament.terms = { ...tournament.terms, entryAtomic: "10000", entryFee: "0.01" };
      const quote = { potAtomic: "80000", prizes: [{ place: 1, percentage: "50", amountAtomic: "40000" }, { place: 2, percentage: "35", amountAtomic: "28000" }, { place: 3, percentage: "15", amountAtomic: "12000" }] };
      tournament.fullRoomQuote = quote;
      tournament.funding = { network: "shadownet", status: voided ? "voided" : "settled", feeQuantumAtomic: "10000", treasuryAddress: fixtureConfig.treasuryAddress, prizeRoundingPolicy: fixtureConfig.prizeRoundingPolicy, refundPolicy: fixtureConfig.refundPolicy,
        payouts: ids.map((playerId, i) => ({ playerId, amountAtomic: ["40000", "20000", "0", "0"][i], claimed: i === 0 })),
        prizeSummary: { quantumAtomic: "10000", allocatedPlayerPrizesAtomic: "60000", treasuryRemainderAtomic: "20000", treasuryClaimed: true } };
      tournament.accounting = { completion: { quote, allocations: [], groups: [
        { placeFrom: 1, placeTo: 1, playerIds: [ids[0]], eliminatedRound: null },
        { placeFrom: 2, placeTo: 2, playerIds: [ids[1]], eliminatedRound: 10, finalHP: -1, finalGold: 20, fieldedMaxHP: 1000 },
        { placeFrom: 3, placeTo: 4, playerIds: ids.slice(2), eliminatedRound: 9, finalHP: -5, finalGold: 10, fieldedMaxHP: 900 },
      ] } };
      await route.fulfill({ json: body });
    });
    await page.route(`**/api/wtfiap/party/rooms/${roomCode}/events`, route => route.fulfill({ status: 200, contentType: "text/event-stream", body: ": explicit synthetic settlement fixture\n\n" }));
    await frame.goto(frame.url());
    const result = frame.locator("#tournament-result");
    await expect(result).toContainText("0.04 XTZ · Claim verified"); await expect(result).toContainText("0.02 XTZ · Available to claim");
    await expect(result.locator('[data-place-from="3"]')).toContainText("3rd–4th · tied");
    await expect(result.locator('[data-place-from="3"] .prize-amount')).toHaveText(["0 XTZ · No payable prize", "0 XTZ · No payable prize"]);
    await expect(result).toContainText("wtf.tez remainder: 0.02 XTZ");
    await expect(result).not.toContainText("Fractional shares");
    await result.scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath("funded-rounded-results-fixture.png"), fullPage: true });
    voided = true; await frame.goto(frame.url());
    await expect(frame.locator("#phase-label")).toHaveText("Tournament voided · full entry refunds");
    await expect(frame.locator("#tournament-result")).toBeHidden();
    await expect(frame.locator("#tournament-terms")).toContainText("full refunds after a verified technical void");
    await expect(frame.locator("#arena")).toBeHidden();
    expect(errors).toEqual([]);
  });

  test("native room network selection explicitly returns from Shadownet to Mainnet without a wallet operation", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("wtf:network", "shadownet"));
    const roomCode = "44444444-4444-4444-8444-444444444444", room = fixtureRoom(roomCode);
    room.network = "mainnet"; room.chainId = "NetXdQprcVkpaWU"; room.self.pendingOperations = [];
    room.self.actions.deposit = { entrypoint: "join_room", params: { room_id: room.roomId, expected_terms_hash: room.termsHash }, amountMutez: "1000000", expectedWallet: room.self.walletAddress, contract: room.escrowContract, network: room.network, chainId: room.chainId };
    let writes = 0;
    await page.route("**/api/wtfiap/funding/**", route => { if (route.request().method() !== "GET") writes++; return route.fulfill({ json: route.request().url().endsWith("/config") ? { ok: true, config: { ...fixtureConfig, network: room.network, chainId: room.chainId } } : { ok: true, room } }); });
    await page.goto(`/wtfiap?room=${roomCode}&funding=1`);
    const panel = surface(page).getByRole("region", { name: "Tournament funding" });
    await expect(panel).toContainText("Tezos shadownet selected in wtfOS");
    await expect(panel.getByRole("button", { name: "Deposit 1 XTZ" })).toBeDisabled();
    await panel.getByRole("button", { name: "Use mainnet for wallet operations" }).click();
    await expect(panel).toContainText("Tezos mainnet selected in wtfOS");
    await expect(panel.getByRole("button", { name: "Deposit 1 XTZ" })).toBeEnabled();
    expect(await page.evaluate(() => localStorage.getItem("wtf:network"))).toBe("mainnet");
    expect(writes).toBe(0);
  });

});
