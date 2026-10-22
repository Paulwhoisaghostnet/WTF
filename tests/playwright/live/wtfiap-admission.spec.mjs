import { expect, test } from "@playwright/test";
import { actorById, readPuppetCredentials } from "../../e2e/puppets/runtime.mjs";
import { gameshowActor, gameshowJson } from "../../e2e/puppets/gameshow-stage.mjs";

// Local, authenticated admission rehearsal only. No escrow creation, wallet
// signatures, deposits, start, settlement or claims are performed by this spec.
test.skip(process.env.WTF_E2E_WTFIAP_ADMISSION !== "1", "Enable the local WTFIAP admission rehearsal explicitly.");
test.use({ trace: "off", video: "off" });
const entrantIds = ["bert", "ernie", "elmo", "bigbird", "thecount", "snuffaluffagus", "grover", "cookiemonster"];
function decimalAtomic(atomic, decimals) {
  const scale = 10n ** BigInt(decimals), value = BigInt(atomic);
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${value / scale}${fraction ? `.${fraction}` : ""}`;
}

test("eight account-owned tournament seats expose the native funding bridge and reject outsider admission", async ({ playwright, browser, baseURL }, testInfo) => {
  expect(["localhost", "127.0.0.1", "[::1]"], "This rehearsal cannot mutate a production room").toContain(new URL(baseURL).hostname);
  const credentials = await readPuppetCredentials();
  const sessions = [], browsers = [];
  try {
    for (const id of [...entrantIds, "oscar"]) {
      const actor = actorById(credentials, id);
      const session = await gameshowActor(playwright, baseURL, actor);
      sessions.push({ id, actor, ...session });
    }
    const host = sessions[0];
    const configuration = (await gameshowJson(await host.request.get("/api/wtfiap/funding/config"))).config;
    const hostContext = await browser.newContext({ baseURL, storageState: await host.request.storageState() });
    browsers.push(hostContext);
    const page = await hostContext.newPage(), errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/wtfiap?mode=party");
    const surface = page.locator('[data-wtfiap-surface="true"]:visible');
    const party = await (await surface.locator('iframe[title="WTFIAP-v0.01"]').elementHandle()).contentFrame();
    await party.locator("#room-type").selectOption("tournament");
    await party.locator("#create-name").fill("Local admission rehearsal");
    await party.locator("#prep-time").selectOption("ready");
    await party.locator("#entry-currency").selectOption("XTZ");
    await party.locator("#entry-fee").fill(decimalAtomic(configuration.currencyQuantaAtomic.XTZ, 6));
    await party.locator("#create-room").click();
    await expect(party.locator("#invite-code")).not.toHaveValue("");
    const roomCode = await party.locator("#invite-code").inputValue();
    for (const entrant of sessions.slice(1, 8)) {
      const result = await gameshowJson(await entrant.write("post", `/api/wtfiap/party/rooms/${roomCode}/join`, { name: entrant.actor.displayName }));
      expect(result.ok).toBe(true);
    }
    const lobby = await gameshowJson(await host.request.get(`/api/wtfiap/party/rooms/${roomCode}/lobby`));
    expect(lobby.view.players).toHaveLength(8);
    expect(lobby.view.players.every(player => !player.isAI)).toBe(true);
    await surface.getByRole("button", { name: "Room funding", exact: true }).click();
    const panel = surface.getByRole("region", { name: "Tournament funding" });
    await expect(panel).toContainText(roomCode);
    await expect(panel).toContainText("0 / 8 deposits verified");
    const anonymous = await playwright.request.newContext({ baseURL });
    try {
      const { csrfToken } = await (await anonymous.get("/api/auth/csrf-token")).json();
      const denied = await anonymous.post(`/api/wtfiap/funding/rooms/${roomCode}/bind-wallet`, { data: { walletAddress: "tz1untrusted" }, headers: { "X-CSRF-Token": csrfToken } });
      expect(denied.status()).toBe(401);
    } finally { await anonymous.dispose(); }
    const outsider = sessions[8];
    expect((await outsider.write("post", `/api/wtfiap/funding/rooms/${roomCode}/reconcile`)).status()).toBe(403);

    const report = { kind: "local-account-admission-only", roomCode, humanSeats: 8, fundingEnabled: configuration.enabled, bindingsExercised: false, fundsMoved: false, chainOperationsRequested: false };
    if (configuration.enabled) {
      expect(configuration.network, "This rehearsal only binds wallets for an explicitly configured testnet room").toBe("shadownet");
      expect(configuration.chainId).toBe("NetXsqzbfFenSTS");
      expect(configuration.escrowContract).toMatch(/^KT1/);
      expect(configuration.currencyQuantaAtomic).toEqual({ XTZ: "10000", WTF: "1000000" });
      expect(configuration.refundPolicy).toBeTruthy();
      const seen = new Set();
      for (const entrant of sessions.slice(0, 8)) {
        const wallets = await gameshowJson(await entrant.request.get("/api/wallets"));
        expect(wallets.some(wallet => wallet.walletAddress === entrant.actor.walletAddress), "Each existing puppet wallet must already be verified for its exact account").toBe(true);
        expect(seen.has(entrant.actor.walletAddress)).toBe(false); seen.add(entrant.actor.walletAddress);
        const bound = await gameshowJson(await entrant.write("post", `/api/wtfiap/funding/rooms/${roomCode}/bind-wallet`, { walletAddress: entrant.actor.walletAddress }));
        expect(bound.room.self.walletAddress).toBe(entrant.actor.walletAddress);
        expect(bound.room.depositedCount).toBe(0);
      }
      expect((await outsider.write("post", `/api/wtfiap/funding/rooms/${roomCode}/bind-wallet`, { walletAddress: outsider.actor.walletAddress })).status()).toBe(403);
      await panel.getByRole("button", { name: "Recheck status" }).click();
      await expect(panel.getByRole("button", { name: "Freeze eight wallets & open escrow" })).toBeVisible();
      await expect(panel.getByRole("button", { name: /^Deposit/ })).toHaveCount(0);
      report.bindingsExercised = true;
    } else {
      await expect(panel).toContainText(configuration.reason || "New tournament funding is unavailable");
      await expect(panel.getByRole("button", { name: /Connect and bind wallet|Bind connected wallet|Freeze eight wallets|Deposit|Claim prize/ })).toHaveCount(0);
    }
    await page.screenshot({ path: testInfo.outputPath("native-admission.png"), fullPage: true });
    await testInfo.attach("admission-evidence", { body: JSON.stringify(report, null, 2), contentType: "application/json" });
    expect(errors).toEqual([]);
  } finally {
    for (const context of browsers) await context.close();
    for (const session of sessions) await session.request.dispose();
  }
});
