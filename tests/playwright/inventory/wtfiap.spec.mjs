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
    await expect(surface(page).getByRole("link", { name: "Cast v2" })).toBeVisible();
    const practice = await hostFrame(page);
    const game = await gameFrame(practice, "#frame");
    expect(await game.evaluate(() => window.AB.FACTIONS.map(faction => faction.name))).toContain("The Cookout");
    expect(await game.evaluate(() => window.AB.ROSTER.length)).toBe(50);
    expect((await gameState(game)).match.players.player.gold).toBe(1);
    const unitId = await buyAndDeploy(page, game);
    const state = await gameState(game);
    expect(state.match.players.player.gold).toBe(0);
    expect(state.match.shops.player[0]).toBeNull();
    expect(state.field[0].id).toBe(unitId);
    expect(state.projection).toBe("side");
    expect(state.facing.find(unit => unit.id === unitId)?.mirrored).toBe(true);
    await page.screenshot({ path: test.info().outputPath("desktop-practice.png"), fullPage: true });

    const popupEvent = page.waitForEvent("popup");
    await practice.locator("#standalone").click();
    const popup = await popupEvent;
    await popup.waitForFunction(() => document.documentElement.dataset.ready === "true" && window.AB_GAME);
    await expect(popup).toHaveURL(/\/games\/installed\/wtfiap\/generator\.html\?/);
    await popup.close();
    expect(errors).toEqual([]);
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
    await surface(page).getByRole("link", { name: "Party & Tournament" }).click();
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
});
