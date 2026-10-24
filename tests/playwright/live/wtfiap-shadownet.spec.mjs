import { expect, test } from "@playwright/test";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { actorById, readPuppetCredentials } from "../../e2e/puppets/runtime.mjs";
import { gameshowActor, gameshowJson } from "../../e2e/puppets/gameshow-stage.mjs";
import { installWtfiapPuppetWallet } from "../../e2e/puppets/wtfiap-wallet.mjs";
import { playAuthoritativeTournament, roomView, waitForRoomView } from "../../e2e/puppets/wtfiap-match-driver.mjs";
import { startWtfiapProofApp } from "../../e2e/puppets/wtfiap-proof-app.mjs";

// Explicit local/Shadownet lane. This uses real account sessions and contract
// operations, with only the wallet provider supplied by our isolated keyring.
// It never targets Mainnet or exports credentials, cookies, keys or traces.
test.skip(process.env.WTF_E2E_WTFIAP_CHAIN_WRITES !== "1", "Explicit coordinated Shadownet operation handoff is required.");
test.use({ trace: "off", video: "off" });
let app;
test.beforeAll(async () => {
  test.setTimeout(0);
  if (process.env.WTF_E2E_WTFIAP_CHAIN_WRITES !== "1") return;
  expect(process.env.WTF_E2E_WTFIAP_ENVIRONMENT).toBeTruthy();
  expect(process.env.WTF_E2E_START_SERVER).not.toBe("1");
  app = await startWtfiapProofApp({ environmentPath: process.env.WTF_E2E_WTFIAP_ENVIRONMENT });
});
test.afterAll(async () => { test.setTimeout(0); await app?.close(); });
const actorIds = ["bert", "ernie", "elmo", "bigbird", "thecount", "snuffaluffagus", "grover", "cookiemonster"];
const surface = page => page.locator('[data-wtfiap-surface="true"]:visible');
const panelFor = page => surface(page).getByRole("region", { name: "Tournament funding" });
async function openFunding(page, roomCode) {
  await page.goto(`/wtfiap?room=${roomCode}&funding=1`);
  await expect(panelFor(page)).toContainText(roomCode);
}
async function refresh(page) {
  const completed = page.waitForResponse(response => response.url().endsWith("/reconcile"), { timeout: 0 });
  await panelFor(page).getByRole("button", { name: "Recheck status" }).click();
  expect((await completed).ok()).toBe(true);
  await expect(panelFor(page)).toHaveAttribute("aria-busy", "false");
  await expect(panelFor(page).getByRole("alert")).toHaveCount(0);
}
async function waitForFundingOperation(entrant, roomCode, hash, configuration) {
  async function check() {
    const data = await gameshowJson(await entrant.write("post", `/api/wtfiap/funding/rooms/${roomCode}/reconcile`, {}));
    const observation = data.room.self.pendingOperations.find(item => item.operationHash === hash);
    expect(observation?.status).not.toBe("failed");
    return observation?.status === "applied";
  }
  if (await check()) return;
  // A reconcile request can coalesce with a worker read already in flight.
  // Recheck on actual chain heads; no arbitrary sleep/retry window or resend.
  const controller = new AbortController(); let reader;
  try {
    const response = await fetch(new URL("monitor/heads/main", configuration.rpcUrl.endsWith("/") ? configuration.rpcUrl : configuration.rpcUrl + "/"), { signal: controller.signal });
    expect(response.ok).toBe(true); reader = response.body.getReader();
    const decoder = new TextDecoder(); let pending = "";
    for (;;) {
      const value = await reader.read(); expect(value.done).toBe(false); pending += decoder.decode(value.value, { stream: true });
      let boundary;
      while ((boundary = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, boundary).trim(); pending = pending.slice(boundary + 1);
        if (line) { JSON.parse(line); if (await check()) return; }
      }
    }
  } finally { controller.abort(); await reader?.cancel().catch(() => {}); }
}
async function sendWallet(page, wallet, roomCode, kind, name, entrant, configuration) {
  wallet.arm(roomCode, kind);
  const response = page.waitForResponse(response => response.url().endsWith(`/funding/rooms/${roomCode}/observe`), { timeout: 0 });
  await panelFor(page).getByRole("button", { name, exact: true }).click();
  expect((await response).ok()).toBe(true);
  const hash = await wallet.finalized();
  await waitForFundingOperation(entrant, roomCode, hash, configuration);
  await refresh(page);
  return hash;
}

// New WTF rooms use the independently pinned Mainnet lane. Existing Shadownet
// WTF rooms remain recoverable, but new Shadownet admission is XTZ only.
for (const currency of ["XTZ"]) test(`native ${currency} Shadownet tournament deposits, withdrawal, replay and claims reconcile with real escrow`, async ({ playwright, browser, baseURL }, testInfo) => {
  test.setTimeout(0); // A complete authoritative match has no artificial round/time cap.
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(new URL(baseURL).hostname);
  expect(process.env.WTF_E2E_WTFIAP_ESCROW).toMatch(/^KT1/);
  const credentials = await readPuppetCredentials(), entrants = [], contexts = [], browserErrors = [], receipts = [];
  const journalPath = testInfo.outputPath("wallet-operation-journal.jsonl");
  const record = async receipt => { receipts.push(structuredClone(receipt)); await appendFile(journalPath, JSON.stringify(receipt) + "\n"); };
  let configuration, roomCode;
  const seatsPath = path.join(path.dirname(process.env.WTF_E2E_WTFIAP_ENVIRONMENT), `native-seats-${currency}.json`);
  let savedSeats;
  try { savedSeats = JSON.parse(await readFile(seatsPath, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
  if (savedSeats) expect(savedSeats.currency).toBe(currency);
  const priorRecovery = currency === "XTZ" && process.env.WTF_E2E_WTFIAP_PRIOR_XTZ_PROOF
    ? JSON.parse(await readFile(process.env.WTF_E2E_WTFIAP_PRIOR_XTZ_PROOF, "utf8")) : null;
  if (priorRecovery) { expect(priorRecovery.network).toBe("shadownet"); expect(priorRecovery.heldAtomic).toBe("0"); expect(priorRecovery.withdrawalAndRedepositVerified).toBe(false); }
  try {
    for (const id of actorIds) {
      const actor = actorById(credentials, id), session = await gameshowActor(playwright, baseURL, actor);
      entrants.push({ actor, ...session });
    }
    configuration = (await gameshowJson(await entrants[0].request.get("/api/wtfiap/funding/config"))).config;
    expect(configuration.enabled).toBe(true); expect(configuration.network).toBe("shadownet");
    expect(configuration.chainId).toBe("NetXsqzbfFenSTS"); expect(configuration.escrowContract).toBe(process.env.WTF_E2E_WTFIAP_ESCROW);
    expect(configuration.currencyQuantaAtomic).toEqual({ XTZ: "10000", WTF: "1000000" });
    expect(configuration.refundPolicy).toBe("prestart-withdrawal;technical-void-full-refund-v1");
    expect(configuration.prizeRoundingPolicy).toBe("floor-each-prize-to-quantum;remainder-to-wtf.tez-v1");
    expect(configuration.treasuryAddress).toMatch(/^tz[1-4]/);
    for (const entrant of entrants) {
      const context = await browser.newContext({ baseURL, storageState: await entrant.request.storageState() }); contexts.push(context);
      entrant.wallet = await installWtfiapPuppetWallet({ context, actor: entrant.actor, session: entrant, baseURL, configuration, record, connected: Boolean(savedSeats) || entrant !== entrants[0] });
      entrant.page = await context.newPage(); entrant.page.on("pageerror", error => browserErrors.push(error.message));
    }
    const host = entrants[0], page = host.page;
    if (savedSeats) {
      roomCode = savedSeats.roomCode;
      for (const entrant of entrants) {
        const saved = savedSeats.entrants.find(item => item.actorId === entrant.actor.id); expect(saved).toBeTruthy();
        Object.assign(entrant, { playerId: saved.playerId, sessionToken: saved.sessionToken });
      }
    } else {
    await page.goto("/wtfiap?mode=party");
    const frame = await (await surface(page).locator('iframe[title="coLILseum"]').elementHandle()).contentFrame();
    await frame.locator("#room-type").selectOption("tournament"); await frame.locator("#create-name").fill(`Shadownet ${currency} browser proof`);
    await frame.locator("#prep-time").selectOption("ready"); await frame.locator("#entry-currency").selectOption(currency); await frame.locator("#entry-fee").fill("0.01");
    await frame.locator("#create-room").click(); await expect(frame.locator("#invite-code")).not.toHaveValue(""); roomCode = await frame.locator("#invite-code").inputValue();
    const seat = await frame.evaluate(code => JSON.parse(localStorage.getItem("autobattler:party-session:" + code)), roomCode);
    Object.assign(host, { playerId: seat.playerId, sessionToken: seat.sessionToken });
    for (const entrant of entrants.slice(1)) {
      const joined = await gameshowJson(await entrant.write("post", `/api/wtfiap/party/rooms/${roomCode}/join`, { name: entrant.actor.displayName }));
      Object.assign(entrant, { playerId: joined.playerId, sessionToken: joined.sessionToken });
    }
    await writeFile(seatsPath, JSON.stringify({ roomCode, currency, entrants: entrants.map(({ actor, playerId, sessionToken }) => ({ actorId: actor.id, playerId, sessionToken })) }, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    }
    for (const entrant of entrants) {
      await openFunding(entrant.page, roomCode);
      if (!savedSeats) await panelFor(entrant.page).getByRole("button", { name: entrant === host ? "Connect and bind wallet" : "Bind connected wallet", exact: true }).click();
      await expect(panelFor(entrant.page)).toContainText(savedSeats ? entrant.actor.walletAddress : "Wallet bound to your seat");
      await expect(panelFor(entrant.page)).toContainText("Tezos mainnet selected in wtfOS");
      await panelFor(entrant.page).getByRole("button", { name: "Use shadownet for wallet operations" }).click();
      await expect(panelFor(entrant.page)).toContainText("No wallet operation was sent");
    }
    await refresh(page);
    await expect(panelFor(page)).toContainText("0.01 " + currency);
    const beforeOpening = (await gameshowJson(await host.request.get(`/api/wtfiap/funding/rooms/${roomCode}`))).room;
    if (beforeOpening.self.canOpen) await panelFor(page).getByRole("button", { name: "Freeze eight wallets & open escrow" }).click();
    await waitForRoomView({ baseURL, roomCode, entrant: host, predicate: view => view.tournament?.funding?.status === "funding" });
    await refresh(page);

    let depositedHash;
    if (priorRecovery) {
      // The earlier room's full entry is already refunded. Preserve its completed
      // recovery case and do not repeat its sends in this separate full game.
      depositedHash = await sendWallet(page, host.wallet, roomCode, "deposit", `Deposit 0.01 ${currency}`, host, configuration);
    } else {
    // Drop only the response after the real server persists the submitted hash.
    // The app must preserve its hash across reload and recheck without a resend.
    let interceptedHash, acknowledgeDroppedResponse;
    const droppedResponse = new Promise(resolve => { acknowledgeDroppedResponse = resolve; });
    await page.route(`**/api/wtfiap/funding/rooms/${roomCode}/observe`, async route => {
      interceptedHash = route.request().postDataJSON().operationHash;
      const response = await route.fetch(); expect(response.ok()).toBe(true);
      await route.abort("failed"); acknowledgeDroppedResponse();
    }, { times: 1 });
    host.wallet.arm(roomCode, "deposit");
    await panelFor(page).getByRole("button", { name: `Deposit 0.01 ${currency}`, exact: true }).click();
    await expect(panelFor(page)).toContainText("Verification pending");
    await droppedResponse;
    depositedHash = await host.wallet.finalized(); expect(interceptedHash).toBe(depositedHash);
    await waitForFundingOperation(host, roomCode, depositedHash, configuration);
    await page.reload(); await expect(panelFor(page)).toContainText(depositedHash); await refresh(page);
    await expect(panelFor(page)).toContainText("1 / 8 deposits verified");
    expect(host.wallet.providerNetworks()).toContain("mainnet"); expect(host.wallet.providerNetworks().at(-1)).toBe("shadownet");
    expect(host.wallet.receipts().filter(receipt => receipt.action === "deposit")).toHaveLength(1);
    await sendWallet(page, host.wallet, roomCode, "refund", "Withdraw full entry to bound wallet", host, configuration);
    await expect(panelFor(page)).toContainText("0 / 8 deposits verified");
    await expect(panelFor(page).getByRole("button", { name: `Redeposit 0.01 ${currency}` })).toBeEnabled();
    await sendWallet(page, host.wallet, roomCode, "deposit", `Redeposit 0.01 ${currency}`, host, configuration);
    }
    for (const entrant of entrants.slice(1)) {
      await refresh(entrant.page);
      await sendWallet(entrant.page, entrant.wallet, roomCode, "deposit", `Deposit 0.01 ${currency}`, entrant, configuration);
    }
    await refresh(page); await expect(panelFor(page)).toContainText("8 / 8 deposits verified");
    await panelFor(page).getByRole("button", { name: "Start funded tournament" }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("all-deposits-verified.png"), fullPage: true });
    await panelFor(page).getByRole("button", { name: "Start funded tournament" }).click();
    await waitForRoomView({ baseURL, roomCode, entrant: host, predicate: view => view.phase === "preparation" });
    let restartProof;
    const match = await playAuthoritativeTournament({ baseURL, roomCode, entrants, onRound: async ({ roundNumber, survivors }) => {
      console.log(`${currency} authoritative round ${roundNumber}: ${survivors} commanders`);
      if (restartProof) return;
      const durableState = view => ({ phase: view.phase, roundNumber: view.roundNumber, players: view.players, self: view.self, nextCommandSequence: view.nextCommandSequence, board: view.board });
      const before = durableState(await roomView(roomCode, host));
      const fundingBefore = (await gameshowJson(await host.request.get(`/api/wtfiap/funding/rooms/${roomCode}`))).room;
      const lifecycle = await app.restart();
      const after = durableState(await roomView(roomCode, host));
      const fundingAfter = (await gameshowJson(await host.request.get(`/api/wtfiap/funding/rooms/${roomCode}`))).room;
      expect(after).toEqual(before);
      expect(fundingAfter.roomId).toBe(fundingBefore.roomId);
      expect(fundingAfter.termsHash).toBe(fundingBefore.termsHash);
      expect(fundingAfter.depositedCount).toBe(8);
      expect(fundingAfter.chainStatus).toBe("active");
      await openFunding(page, roomCode); await refresh(page);
      await expect(panelFor(page)).toContainText("8 / 8 deposits verified");
      restartProof = { roundNumber, lifecycle, durableGameStateSha256: createHash("sha256").update(JSON.stringify(before)).digest("hex"), roomId: fundingAfter.roomId, termsHash: fundingAfter.termsHash, unchangedGameState: true, nativeReconnectVerified: true };
    } });
    const settled = await waitForRoomView({ baseURL, roomCode, entrant: host, predicate: view => view.tournament?.funding?.status === "settled" });
    const funding = settled.tournament.funding, quantum = BigInt(configuration.currencyQuantaAtomic[currency]);
    expect(BigInt(funding.prizeSummary.allocatedPlayerPrizesAtomic) + BigInt(funding.prizeSummary.treasuryRemainderAtomic)).toBe(8n * quantum);
    expect(funding.treasuryAddress).toBe(configuration.treasuryAddress);
    const claimProof = [];
    for (const payout of funding.payouts) {
      expect(BigInt(payout.amountAtomic) % quantum).toBe(0n);
      if (payout.amountAtomic === "0") continue;
      const entrant = entrants.find(candidate => candidate.playerId === payout.playerId); expect(entrant).toBeTruthy();
      await openFunding(entrant.page, roomCode);
      const hash = await sendWallet(entrant.page, entrant.wallet, roomCode, "claim", "Claim prize to bound wallet", entrant, configuration);
      await expect(panelFor(entrant.page)).toContainText("Claim verified");
      await panelFor(entrant.page).getByText("Your prize", { exact: true }).scrollIntoViewIfNeeded();
      await entrant.page.screenshot({ path: testInfo.outputPath(`verified-prize-${claimProof.length + 1}.png`), fullPage: true });
      claimProof.push({ playerId: entrant.playerId, walletAddress: entrant.actor.walletAddress, amountAtomic: payout.amountAtomic, operationHash: hash });
    }
    for (const entrant of entrants) entrant.wallet.assertUsed();
    expect(browserErrors).toEqual([]);
    const proof = { kind: "actual-local-app-shadownet-tournament", network: configuration.network, chainId: configuration.chainId, escrowContract: configuration.escrowContract, currency, entryAtomic: quantum.toString(), roomCode,
      walletBoundary: "The existing native Octez/Taquito app path uses an isolated test DAppClient backed by Node's existing puppet keyring; commercial extension UI is not exercised.",
      walletProviderNetworks: entrants.map(entrant => ({ actorId: entrant.actor.id, networks: entrant.wallet.providerNetworks() })),
      chainOperationsReal: true, matchStateInjected: false, commercialExtensionUXTested: false,
      recovery: { responseDroppedAfterServerCheckpoint: true, operationHash: priorRecovery?.depositOperationHash || depositedHash, depositsBeforeRecovery: 1, withdrawalAndRedepositVerified: !priorRecovery, priorCompletedRecoveryCase: priorRecovery, appRestart: restartProof },
      match: match.summary, prizeSummary: funding.prizeSummary, claims: claimProof,
      replaySha256: createHash("sha256").update(JSON.stringify(match.replay.replay)).digest("hex"), operations: receipts, browserErrors };
    await writeFile(testInfo.outputPath("chain-proof.json"), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
  } finally {
    for (const context of contexts) await context.close();
    for (const entrant of entrants) await entrant.request.dispose();
  }
});
