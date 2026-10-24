import { expect, test } from "@playwright/test";

const surface = (page) => page.locator('[data-wtfiap-surface="true"]:visible');

async function hostFrame(page) {
  const iframe = surface(page).locator('iframe[title="WTFIAP-v0.01"]');
  await expect(iframe).toBeVisible();
  const frame = await (await iframe.elementHandle()).contentFrame();
  await frame.waitForLoadState("domcontentloaded");
  return frame;
}

async function gameFrame(host, selector) {
  const iframe = host.locator(selector);
  await expect(iframe).toBeVisible();
  const frame = await (await iframe.elementHandle()).contentFrame();
  await frame.waitForFunction(() => document.documentElement.dataset.ready === "true" && window.AB_UI && window.AB_MATCH());
  return frame;
}

async function gameState(frame) {
  return frame.evaluate(() => JSON.parse(window.render_game_to_text()));
}

async function clickGamePoint(page, frame, point) {
  const canvas = frame.locator("#game");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  const resolution = await canvas.evaluate((element) => ({ width: element.width, height: element.height }));
  await page.mouse.click(bounds.x + point.x * bounds.width / resolution.width, bounds.y + point.y * bounds.height / resolution.height);
}

async function hit(page, frame, id) {
  await frame.waitForFunction((target) => window.AB_UI.hitRegions().some((item) => item.id === target), id);
  const point = await frame.evaluate((target) => {
    const item = window.AB_UI.hitRegions().find((hit) => hit.id === target);
    return { x: item.x + item.w / 2, y: item.y + item.h / 2 };
  }, id);
  await clickGamePoint(page, frame, point);
}

async function buyAndDeploy(page, frame) {
  await hit(page, frame, "shop-buy-0");
  await frame.waitForFunction(() => window.AB_GAME().bench.length === 1);
  if ((await gameState(frame)).shop.visible) await hit(page, frame, "shop-toggle");
  const unitId = await frame.evaluate(() => window.AB_GAME().bench[0].id);
  if ((await gameState(frame)).selected !== unitId) await hit(page, frame, `bench-${unitId}`);
  const tile = await frame.evaluate(() => window.AB_UI.grid().tiles.find((tile) => tile.col === 0 && tile.row === window.AB_GAME().board.rows - 1));
  await clickGamePoint(page, frame, tile);
  await frame.waitForFunction(() => window.AB_GAME().field.length === 1);
  return unitId;
}

test.describe("interaction inventory - WTFIAP native game", () => {
  test.beforeEach(async ({ request }) => {
    expect((await request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
  });

  test("desktop launch runs the real practice shop and preserves the standalone game control", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const icon = page.locator('[data-desktop-icon-key="wtfiap"]');
    await expect(icon).toContainText("WTFIAP-v0.01");
    await icon.dblclick();
    await expect(surface(page)).toHaveAttribute("aria-label", "WTFIAP-v0.01");
    await expect(surface(page).getByRole("link", { name: "Meet the heroes" })).toBeVisible();
    const practice = await hostFrame(page);
    const game = await gameFrame(practice, "#frame");
    expect(await game.evaluate(() => window.AB.FACTIONS.map(faction => faction.name))).toContain("The Cookout");
    expect(await game.evaluate(() => window.AB.ROSTER.length)).toBe(50);
    expect((await gameState(game)).match.players.player.gold).toBe(1);
    expect((await gameState(game)).shop.visible).toBe(true);
    expect(await game.evaluate(() => window.AB_UI.hitRegions().some(hit => hit.id.startsWith("tile-")))).toBe(false);
    await hit(page, game, "shop-preview-1");
    expect((await gameState(game)).shop.previewIndex).toBe(1);
    await hit(page, game, "shop-preview-0");
    const unitId = await buyAndDeploy(page, game);
    const state = await gameState(game);
    expect(state.match.players.player.gold).toBe(0);
    expect(state.match.shops.player[0]).toBeNull();
    expect(state.field[0].id).toBe(unitId);
    expect(state.projection).toBe("side");
    expect(state.facing.find(unit => unit.id === unitId)?.mirrored).toBe(true);
    expect(state.shop.visible).toBe(false);
    expect(state.panels).toMatchObject({ traitsOpen: false, detailsOpen: false, unreadTraits: true });
    expect(await game.evaluate(() => window.AB_UI.hitRegions().filter(hit => hit.id.startsWith("synergy-")).length)).toBe(0);
    await game.locator("#traits-icon").click();
    expect((await gameState(game)).panels.unreadTraits).toBe(false);
    expect(await game.evaluate(() => window.AB_UI.hitRegions().filter(hit => hit.id.startsWith("synergy-")).length)).toBe(
      state.synergies.factions.filter(trait => trait.count > 0).length + state.synergies.classes.filter(trait => trait.count > 0).length,
    );
    await page.screenshot({ path: test.info().outputPath("desktop-practice.png"), fullPage: true });

    const popupEvent = page.waitForEvent("popup");
    await practice.locator("#standalone").click();
    const popup = await popupEvent;
    await popup.waitForFunction(() => document.documentElement.dataset.ready === "true" && window.AB_GAME);
    await expect(popup).toHaveURL(/\/games\/installed\/wtfiap\/generator\.html\?/);
    await popup.close();
    expect(errors).toEqual([]);
  });

  test("preparation hints wait 30 seconds and can be disabled across reloads", async ({ page }) => {
    await page.clock.install();
    await page.goto("/wtfiap", { waitUntil: "domcontentloaded" });
    const host = await hostFrame(page);
    let game = await gameFrame(host, "#frame");
    expect((await gameState(game)).help.visible).toBe(false);
    await page.clock.fastForward(30_001);
    expect((await gameState(game)).help.visible).toBe(true);
    await hit(page, game, "help-tip");
    expect((await gameState(game)).help.visible).toBe(false);
    await hit(page, game, "tips-toggle");
    expect((await gameState(game)).help.automaticTipsEnabled).toBe(false);
    await page.clock.fastForward(30_001);
    expect((await gameState(game)).help.visible).toBe(false);
    await game.evaluate(() => location.reload());
    game = await gameFrame(host, "#frame");
    expect((await gameState(game)).help.automaticTipsEnabled).toBe(false);
  });

  test("touch phones prompt for landscape and reveal changed information through icons", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/games/installed/wtfiap/generator.html?mode=match&seed=mobile-landscape-check", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    await expect(page.locator("#orientation-prompt")).toBeVisible();
    expect(await page.locator("main").evaluate(element => element.inert)).toBe(true);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator("#orientation-prompt")).toBeHidden();
    expect(await page.locator("main").evaluate(element => element.inert)).toBe(false);
    await page.locator("#quick-actions button").filter({ hasText: "Recruit preview" }).click();
    await expect(page.locator("#details-icon")).toHaveClass(/unread/);
    expect(await page.locator("#details-icon").evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    await page.locator("#details-icon").click();
    await expect(page.locator("#details-panel")).toBeVisible();
    await context.close();
  });

  test("Stuffs Play opens Party, creates a real room and reloads its purchased formation", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open Stuffs menu" }).click();
    await page.getByText("Play", { exact: true }).last().click();
    const menuEntry = page.getByText("WTFIAP-v0.01", { exact: true }).last();
    await expect(menuEntry).toBeVisible();
    const flyout = page.locator('[data-start-menu-flyout="gaming"]');
    await expect.poll(async () => {
      const bounds = await flyout.boundingBox();
      return bounds.y >= 0 && bounds.y + bounds.height <= page.viewportSize().height;
    }).toBe(true);
    await page.screenshot({ path: test.info().outputPath("stuffs-play.png"), fullPage: true });
    await menuEntry.click();
    await surface(page).getByRole("link", { name: "Party", exact: true }).click();
    let party = await hostFrame(page);
    await expect(party.locator("#create-name")).toBeVisible();
    await party.locator("#create-name").fill("WTFIAP Browser Host");
    await party.locator("#prep-time").selectOption("ready");
    await party.locator("#create-room").click();
    await expect(party.locator("#invite-code")).not.toHaveValue("");
    const code = await party.locator("#invite-code").inputValue();
    await expect(party.locator("#invite-url")).toHaveValue(new RegExp(`/wtfiap\\?room=${code}`));
    await party.locator("#fill-ai").check();
    await party.locator("#start-room").click();
    const game = await gameFrame(party, "#arena-frame");
    expect(await game.evaluate(() => window.AB.ROSTER.find(hero => hero.id === "ember-vanguard")?.name)).toBe("Briq");
    const unitId = await buyAndDeploy(page, game);
    await page.screenshot({ path: test.info().outputPath("party-formation.png"), fullPage: true });

    // Reload the native invitation URL, not an intercepted/mock room response.
    await page.goto(`/wtfiap?room=${encodeURIComponent(code)}`, { waitUntil: "domcontentloaded" });
    party = await hostFrame(page);
    await expect(party.locator("#invite-code")).toHaveValue(code);
    const recovered = await gameFrame(party, "#arena-frame");
    await recovered.waitForFunction((id) => window.AB_GAME().field.some((unit) => unit.id === id), unitId);
    const state = await gameState(recovered);
    expect(state.field).toHaveLength(1);
    expect(state.bench).toHaveLength(0);
    expect(state.match.shops.player[0]).toBeNull();
    expect(state.match.players.player.gold).toBe(0);
    expect(state.projection).toBe("side");
    expect(state.facing.find(unit => unit.id === unitId)?.mirrored).toBe(true);
    // Hosted room identity comes from the authenticated account, not form text.
    await expect(party.locator("#standings")).toContainText("WTF Admin · you");
    await page.screenshot({ path: test.info().outputPath("party-recovered.png"), fullPage: true });
    expect(errors).toEqual([]);
  });

  test("native tournament invitations show unfunded terms before joining on mobile", async ({ page, browser }) => {
    await page.goto("/wtfiap?mode=party", { waitUntil: "domcontentloaded" });
    const party = await hostFrame(page);
    await party.locator("#room-type").selectOption("tournament");
    await party.locator("#create-name").fill("WTFIAP Tournament Host");
    await party.locator("#prep-time").selectOption("ready");
    await party.locator("#entry-currency").selectOption("XTZ");
    await party.locator("#entry-fee").fill("10");
    await expect(party.locator("#create-prize-preview")).toContainText("80 XTZ");
    await expect(party.locator("#tournament-fields")).toContainText("No funds collected or paid");
    await party.locator("#create-room").click();
    await expect(party.locator("#invite-code")).not.toHaveValue("");
    const code = await party.locator("#invite-code").inputValue();
    await expect(party.locator("#ai-fill-controls")).toBeHidden();
    await expect(party.locator("#start-room")).toBeDisabled();
    await page.screenshot({ path: test.info().outputPath("tournament-lobby.png"), fullPage: true });

    const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobile = await guest.newPage();
    await mobile.goto(new URL(`/wtfiap?room=${encodeURIComponent(code)}`, page.url()).href, { waitUntil: "domcontentloaded" });
    const invitation = await hostFrame(mobile);
    await expect(invitation.locator("#join-tournament-preview")).toBeVisible();
    await invitation.locator("#join-tournament-preview").scrollIntoViewIfNeeded();
    await expect(invitation.locator("#join-tournament-preview")).toContainText("No funds collected or paid");
    await expect(invitation.locator("#join-prize-preview")).toContainText("80 XTZ");
    await expect(invitation.locator("#join-room")).toHaveText("Join tournament preview");
    expect(await invitation.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await mobile.screenshot({ path: test.info().outputPath("mobile-tournament-invitation.png"), fullPage: true });
    await guest.close();
  });

  test("two people can create and start a free Lil Guys duel", async ({ page, browser }) => {
    await page.goto("/wtfiap", { waitUntil: "domcontentloaded" });
    await surface(page).getByRole("link", { name: "Duel" }).click();
    const host = await hostFrame(page);
    await expect(host.locator("#room-type")).toHaveValue("duel");
    await host.locator("#create-name").fill("Duel host");
    await host.locator("#prep-time").selectOption("ready");
    await host.locator("#create-room").click();
    await expect(host.locator("#invite-code")).not.toHaveValue("");
    const code = await host.locator("#invite-code").inputValue();
    await expect(host.locator("#alive-count")).toContainText("1 / 2 seats");

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    try {
      expect((await guestPage.request.post("/__test/state", { data: { userRole: "contestant" } })).ok()).toBeTruthy();
      await guestPage.goto(new URL(`/wtfiap?room=${code}`, page.url()).href, { waitUntil: "domcontentloaded" });
      const guest = await hostFrame(guestPage);
      await guest.locator("#join-name").fill("Duel guest");
      await guest.locator("#join-room").click();
      await expect(guest.locator("#alive-count")).toContainText("2 / 2 seats");
      await expect(host.locator("#alive-count")).toContainText("2 / 2 seats");
      expect((await page.request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
      await host.locator("#start-room").click();
      const arena = await gameFrame(host, "#arena-frame");
      expect(await arena.evaluate(() => window.AB.ROSTER.find(hero => hero.id === "ember-vanguard")?.name)).toBe("Briq");
      expect((await gameState(arena)).projection).toBe("side");
      await expect(host.locator("#alive-count")).toContainText("2 alive");
    } finally { await guestContext.close(); }
  });

  test("watchers follow the shared arena and room chat keeps whispers private", async ({ page, browser }) => {
    await page.goto("/games/installed/wtfiap/party.html?mode=duel", { waitUntil: "domcontentloaded" });
    await page.locator("#create-name").fill("Host");
    await page.locator("#prep-time").selectOption("ready");
    await page.locator("#create-room").click();
    await expect(page.locator("#invite-code")).not.toHaveValue("");
    const code = await page.locator("#invite-code").inputValue();
    expect(code).not.toBe("");

    const guestContext = await browser.newContext();
    const guest = await guestContext.newPage();
    const watcherContext = await browser.newContext();
    const watcher = await watcherContext.newPage();
    try {
      expect((await guest.request.post("/__test/state", { data: { userRole: "contestant" } })).ok()).toBeTruthy();
      await guest.goto(`/games/installed/wtfiap/party.html?room=${code}`);
      await guest.locator("#join-name").fill("Guest");
      await guest.locator("#join-room").click();
      await expect(guest.locator("#alive-count")).toContainText("2 / 2 seats");
      const guestId = await guest.evaluate(() => JSON.parse(window.render_game_to_text()).viewer.id);

      expect((await page.request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
      await page.locator("#start-room").click();
      await gameFrame(page, "#arena-frame");
      await expect(page.locator("#standings-panel")).toBeHidden();
      await page.locator("#standings-panel-toggle").click();
      await expect(page.locator("#standings-panel")).toBeVisible();
      await page.locator("#standings-panel-toggle").click();

      expect((await watcher.request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
      await watcher.goto(`/games/installed/wtfiap/party.html?room=${code}`);
      await watcher.locator("#join-name").fill("Watcher");
      await watcher.locator("#watch-room").click();
      const watchedArena = await gameFrame(watcher, "#arena-frame");
      expect((await gameState(watchedArena)).party.spectating).toBe(true);
      expect((await gameState(watchedArena)).match.shops.player).toEqual([null, null, null, null]);
      expect(await watchedArena.evaluate(() => window.AB_UI.hitRegions().some(hit => hit.id.startsWith("shop-buy-")))).toBe(false);
      await watcher.locator("#standings-panel-toggle").click();
      await watcher.locator("#scout-player").selectOption(guestId);
      await expect.poll(async () => (await watcher.evaluate(() => JSON.parse(window.render_game_to_text()))).watchingPlayerId).toBe(guestId);
      const followedName = await watcher.evaluate(id => JSON.parse(window.render_game_to_text()).players.find(player => player.playerId === id).name, guestId);
      await expect.poll(async () => (await gameState(watchedArena)).message).toContain(`Watching ${followedName}.`);
      await watcher.locator("#standings-panel-toggle").click();

      expect((await page.request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
      await page.locator("#chat-panel-toggle").click();
      await page.locator("#chat-text").fill("Hello room");
      await page.locator("#chat-form button").click();
      await expect(page.locator("#chat-messages")).toContainText("Hello room");
      await expect(watcher.locator("#chat-panel-toggle")).toHaveClass(/updated/);
      await watcher.locator("#chat-panel-toggle").click();
      await expect(watcher.locator("#chat-messages")).toContainText("Hello room");
      await guest.locator("#chat-panel-toggle").click();
      await expect(guest.locator("#chat-messages")).toContainText("Hello room");

      await page.locator("#chat-target").selectOption(guestId);
      await page.locator("#chat-text").fill("Only for guest");
      await page.locator("#chat-form button").click();
      await expect(guest.locator("#chat-messages")).toContainText("Only for guest");
      await expect(watcher.locator("#chat-messages")).not.toContainText("Only for guest");

      expect((await watcher.request.post("/__test/state", { data: { userRole: "anonymous" } })).ok()).toBeTruthy();
      await watcher.locator("#chat-target").selectOption(guestId);
      await watcher.locator("#chat-text").fill("Watcher to guest");
      await watcher.locator("#chat-form button").click();
      await expect(guest.locator("#chat-messages")).toContainText("Watcher to guest");
      await expect(page.locator("#chat-messages")).not.toContainText("Watcher to guest");
      await watcher.screenshot({ path: test.info().outputPath("watcher-chat.png"), fullPage: true });
      await watcher.setViewportSize({ width: 600, height: 340 });
      await expect(watcher.locator("#chat-panel-toggle .rail-label")).toBeHidden();
      const compactChat = await watcher.locator("#chat-panel").boundingBox();
      const compactToggle = await watcher.locator("#chat-panel-toggle").boundingBox();
      expect(compactChat).toBeTruthy();
      expect(compactToggle).toBeTruthy();
      expect(compactChat.x).toBeGreaterThanOrEqual(0);
      expect(compactChat.x + compactChat.width).toBeLessThanOrEqual(600);
      expect(compactChat.y + compactChat.height).toBeLessThanOrEqual(340);
      expect(compactToggle.x + compactToggle.width).toBeLessThanOrEqual(600);
      await watcher.setViewportSize({ width: 1280, height: 720 });
      await watcher.reload();
      await expect(watcher.locator("#phase-label")).toContainText("Round 1");
      const recoveredArena = await gameFrame(watcher, "#arena-frame");
      await expect.poll(async () => (await gameState(recoveredArena)).party.spectating).toBe(true);
      await expect.poll(async () => (await watcher.evaluate(() => JSON.parse(window.render_game_to_text()))).watchingPlayerId).toBe(guestId);
      await watcher.screenshot({ path: test.info().outputPath("watcher-arena.png"), fullPage: true });

      expect((await page.request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
      const hostArena = await gameFrame(page, "#arena-frame");
      await buyAndDeploy(page, hostArena);
      expect((await guest.request.post("/__test/state", { data: { userRole: "contestant" } })).ok()).toBeTruthy();
      const guestArena = await gameFrame(guest, "#arena-frame");
      await buyAndDeploy(guest, guestArena);
      expect((await page.request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
      await hit(page, hostArena, "battle");
      expect((await guest.request.post("/__test/state", { data: { userRole: "contestant" } })).ok()).toBeTruthy();
      await hit(guest, guestArena, "battle");
      await expect.poll(async () => (await gameState(recoveredArena)).match.phase).toBe("combat");
      expect((await gameState(recoveredArena)).battle.units.length).toBeGreaterThan(0);
      await watcher.screenshot({ path: test.info().outputPath("watcher-combat.png"), fullPage: true });
    } finally { await guestContext.close(); await watcherContext.close(); }
  });
});
