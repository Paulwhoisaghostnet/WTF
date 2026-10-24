import { expect, test } from "@playwright/test";

const surface = (page) => page.locator('[data-wtfiap-surface="true"]:visible');

async function hostFrame(page) {
  const iframe = surface(page).locator('iframe[title="coLILseum"]');
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

async function hoverHit(page, frame, id) {
  const canvas = frame.locator("#game");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  const resolution = await canvas.evaluate(element => ({ width: element.width, height: element.height }));
  const point = await frame.evaluate(target => {
    const region = window.AB_UI.hitRegions().find(hit => hit.id === target);
    if (!region) throw new Error(`Missing hover region ${target}`);
    return { x: region.x + region.w / 2, y: region.y + region.h / 2 };
  }, id);
  await page.mouse.move(bounds.x + point.x * bounds.width / resolution.width, bounds.y + point.y * bounds.height / resolution.height);
}

async function dragHit(page, frame, sourceId, targetId) {
  const canvas = frame.locator("#game");
  await canvas.scrollIntoViewIfNeeded();
  const bounds = await canvas.boundingBox();
  const resolution = await canvas.evaluate(element => ({ width: element.width, height: element.height }));
  const points = await frame.evaluate(([source, target]) => [source, target].map(id => {
    const region = window.AB_UI.hitRegions().find(hit => hit.id === id);
    if (!region) throw new Error(`Missing drag region ${id}`);
    return { x: region.x + region.w / 2, y: region.y + region.h / 2 };
  }), [sourceId, targetId]);
  const location = point => ({ x: bounds.x + point.x * bounds.width / resolution.width, y: bounds.y + point.y * bounds.height / resolution.height });
  const from = location(points[0]), to = location(points[1]);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

async function buyAndDeploy(page, frame, useDrag = false, purchaseId = "shop-buy-0") {
  await hit(page, frame, purchaseId);
  await frame.waitForFunction(() => window.AB_GAME().bench.length === 1);
  const unitId = await frame.evaluate(() => window.AB_GAME().bench[0].id);
  if ((await gameState(frame)).selected !== unitId) await hit(page, frame, `bench-${unitId}`);
  const tile = await frame.evaluate(() => window.AB_UI.grid().tiles.find((tile) => tile.col === 0 && tile.row === window.AB_GAME().board.rows - 1));
  if (useDrag) await dragHit(page, frame, `bench-${unitId}`, `tile-${tile.col}-${tile.row}`);
  else await clickGamePoint(page, frame, tile);
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
    await expect(icon).toContainText("coLILseum");
    await icon.dblclick();
    await expect(surface(page)).toHaveAttribute("aria-label", "coLILseum");
    await expect(surface(page).getByRole("link", { name: "Meet the heroes" })).toBeVisible();
    const practice = await hostFrame(page);
    const game = await gameFrame(practice, "#frame");
    expect(await game.evaluate(() => window.AB.FACTIONS.map(faction => faction.name))).toContain("The Cookout");
    expect(await game.evaluate(() => window.AB.ROSTER.length)).toBe(50);
    expect((await gameState(game)).match.players.player.gold).toBe(1);
    expect((await gameState(game)).shop.visible).toBe(true);
    expect(await game.evaluate(() => window.AB_UI.hitRegions().some(hit => hit.id.startsWith("tile-")))).toBe(true);
    expect(await game.evaluate(() => window.AB_UI.hitRegions().some(hit => hit.id === "shop-buy-0"))).toBe(true);
    expect(await game.evaluate(() => window.AB_UI.hitRegions().some(hit => hit.id === "shop-card-buy-0"))).toBe(true);
    await hit(page, game, "shop-preview-1");
    expect((await gameState(game)).shop.previewIndex).toBe(1);
    await hit(page, game, "shop-preview-0");
    await game.locator("#game").screenshot({ path: test.info().outputPath("shop-card-buy-desktop.png") });
    const unitId = await buyAndDeploy(page, game, false, "shop-card-buy-0");
    const state = await gameState(game);
    expect(state.match.players.player.gold).toBe(0);
    expect(state.match.shops.player[0]).toBeNull();
    expect(state.field[0].id).toBe(unitId);
    expect(state.projection).toBe("side");
    expect(state.facing.find(unit => unit.id === unitId)?.mirrored).toBe(true);
    expect(state.shop.visible).toBe(true);
    await hit(page, game, "shop-toggle");
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

  test("Lil Guy Studio Cherub yields an equipable component in practice", async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/games/installed/wtfiap/generator.html?seed=cherub-practice&mode=match&boardMode=standard");
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true" && window.AB_UI);
    const ready = await gameState(page);
    expect(ready.cherubs).toHaveLength(2);
    expect(ready.cherubs.every(cherub => cherub.hp === cherub.maxHp)).toBe(true);
    await page.locator("#game").screenshot({ path: test.info().outputPath("cherub-preparation.png") });
    const unitId = await buyAndDeploy(page, page);
    await hit(page, page, "battle");
    await page.evaluate(() => window.advanceTime(30000));
    const settled = await gameState(page);
    expect(settled.match.phase).toBe("round-result");
    const reward = settled.match.lastReceipt.cherubRewards.find(item => item.side === "player");
    expect(reward?.itemId).toBeTruthy();
    expect(settled.match.players.player.items).toContain(reward.itemId);
    expect(settled.message).toContain("Cherub:");
    await hit(page, page, "next-round");
    await page.locator("#items-toggle").click();
    await expect(page.locator("#items-panel")).toContainText("Equip selected item");
    await page.locator("#items-panel button").filter({ hasText: "Equip selected item" }).click();
    expect((await gameState(page)).field.find(unit => unit.id === unitId)?.itemIds).toContain(reward.itemId);
    expect(errors).toEqual([]);
  });

  test("a seeded optional fortune draw opens the same shop controls on desktop and landscape phone", async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/games/installed/wtfiap/generator.html?seed=fortune-ui-13&mode=match&boardMode=standard");
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true" && window.AB_UI);
    const state = await gameState(page);
    expect(state.match.players.player.fortuneShop?.blessingId).toBeTruthy();
    expect(state.match.players.player.fortuneShop?.curseId).toBeTruthy();
    await hit(page, page, "shop-fortunes");
    const offers = page.locator("#items-panel .fortune-offers");
    await expect(offers).toBeVisible();
    await expect(offers.locator(".fortune-card")).toHaveCount(2);
    await expect(offers).toContainText("These effects last for this match");
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(offers).toBeVisible();
    await expect(offers.getByRole("button", { name: /Buy Nimble Ledger blessing for 10 gold/ })).toBeVisible();
    await expect(offers.getByRole("button", { name: /Buy Dim Coffer curse for 5 gold/ })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("practice offers shop hold, battle plans, shared draft, and protected supply encounters", async ({ page }) => {
    await page.goto("/games/installed/wtfiap/generator.html?seed=tft-parity-browser&mode=match&boardMode=standard");
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true" && window.AB_UI);
    const held = (await gameState(page)).match.shops.player.slice(1);
    await hit(page, page, "shop-lock");
    expect((await gameState(page)).shop.locked).toBe(true);
    await buyAndDeploy(page, page);
    const finish = async () => {
      await hit(page, page, "battle");
      await page.evaluate(() => window.advanceTime(30000));
      expect((await gameState(page)).match.phase).toBe("round-result");
      await hit(page, page, "next-round");
    };
    await finish();
    expect((await gameState(page)).match.shops.player.slice(1)).toEqual(held);
    await hit(page, page, "shop-reroll");
    expect((await gameState(page)).shop.locked).toBe(false);
    await finish();
    await expect(page.locator("#items-panel")).toContainText("Choose a battle plan");
    await page.locator("#items-panel button").filter({ hasText: "Scout" }).click();
    expect((await gameState(page)).match.players.player.freeRerolls).toBe(3);
    const gold = (await gameState(page)).match.players.player.gold;
    await hit(page, page, "shop-reroll");
    expect((await gameState(page)).match.players.player.gold).toBe(gold);
    await finish();
    await expect(page.locator("#items-panel")).toContainText("Shared component draft");
    await page.locator("#items-panel .item-panel-section").filter({ hasText: "Claim one available component." }).locator("button").first().click();
    expect((await gameState(page)).match.players.player.items.length).toBeGreaterThan(0);
    await finish();
    expect((await gameState(page)).match.roundNumber).toBe(5);
    expect((await gameState(page)).match.chestPreview.enabled).toBe(true);
    expect((await gameState(page)).match.chests.player).toBeNull();
    expect(await page.evaluate(() => window.AB_UI.hitRegions().map(region => region.id))).toContain("shop-place-chest");
    await hit(page, page, "shop-place-chest");
    expect((await gameState(page)).shop.visible).toBe(false);
    const chestTile = await page.evaluate(() => window.AB_UI.grid().tiles.find(tile => tile.col === 1 && tile.row === window.AB_GAME().board.rows - 1));
    await clickGamePoint(page, page, chestTile);
    const hp = (await gameState(page)).match.players.player.hp;
    await hit(page, page, "battle");
    await page.evaluate(() => window.advanceTime(30000));
    expect((await gameState(page)).match.players.player.hp).toBe(hp);
  });

  test("field status symbols show real preparation and combat effects", async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/games/installed/wtfiap/generator.html?seed=status-icon-inventory");
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true" && window.AB_UI);
    await page.evaluate(() => {
      const game = AB_GAME(), home = game.board.rows - 1;
      game.playerLevel = 3;
      game.field = [{ id: "pool-guard", heroId: "tide-sentinel", level: 1, col: 0, row: home },
        { id: "pool-healer", heroId: "tide-mender", level: 1, col: 2, row: home },
        { id: "fire-ranger", heroId: "ember-ranger", level: 1, col: 4, row: home }];
      game.opponents = [{ id: "ice-guard", heroId: "rime-boruun", level: 1, col: 2, row: 0 }];
      AB_UI.draw();
    });
    expect((await gameState(page)).visibleStatusIcons.find(unit => unit.unitId === "pool-guard")?.icons).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "shield", symbol: "⬡", label: expect.stringContaining("Starts shielded") })]),
    );
    await expect(page.locator('[data-action-id="status-pool-guard-shield"]')).toHaveCount(1);
    await hoverHit(page, page, "status-pool-guard-shield");
    await page.locator("#game").screenshot({ path: test.info().outputPath("status-icons-preparation.png") });
    await page.evaluate(() => {
      const game = AB_GAME(), start = AB.startBattle(game);
      if (!start.ok) throw new Error(start.reason);
      for (const unit of game.battle.units) unit.hp = unit.maxHp = 100000;
      while (game.phase === "battle" && !game.battle.units.some(unit => unit.statuses.some(status => status.type === "burn")))
        AB.step(game, AB.FIXED_STEP);
      AB_UI.draw();
    });
    expect((await gameState(page)).visibleStatusIcons.some(unit => unit.icons.some(icon => icon.key === "burn" && icon.symbol === "♨"))).toBe(true);
    expect(await page.evaluate(() => AB_UI.hitRegions().some(region => region.id.endsWith("-burn") && region.label.includes("Burning")))).toBe(true);
    await page.locator("#game").screenshot({ path: test.info().outputPath("status-icons-combat.png") });
    expect(errors).toEqual([]);
  });

  test("landscape phone keeps shop and bench readable while the shared board remains playable", async ({ browser }) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    const phone = await context.newPage(),errors=[];
    phone.on("pageerror", error => errors.push(error.message));
    try {
      await phone.goto("/games/installed/wtfiap/generator.html?mode=match&seed=inventory-mobile-ux");
      await phone.waitForFunction(() => document.documentElement.dataset.ready === "true" && window.AB_MATCH());
      await expect(phone.locator("main")).toHaveClass(/compact-stage/);
      await expect(phone.locator('.visual-board')).toHaveAttribute("data-mobile-view", "shop");
      await expect(phone.locator(".mobile-offer")).toHaveCount(4);
      expect(await phone.evaluate(async () => { let changes=0;const rail=document.getElementById('mobile-resource'),observer=new MutationObserver(records=>changes+=records.length);observer.observe(rail,{childList:true,subtree:true,characterData:true});AB_UI.draw();AB_UI.draw();await Promise.resolve();observer.disconnect();return changes; })).toBe(0);
      await expect(phone.locator('#mobile-stage-nav #items-toggle')).toBeVisible();
      await expect(phone.locator('#mobile-stage-nav #accessible-controls')).toBeVisible();
      expect(await phone.evaluate(() => {
        const buy = [...document.querySelectorAll('.mobile-offer-buy')].at(-1).getBoundingClientRect();
        const controls = document.querySelector('.access summary').getBoundingClientRect();
        return buy.left < controls.right && buy.right > controls.left && buy.top < controls.bottom && buy.bottom > controls.top;
      })).toBe(false);
      expect(await phone.locator('.mobile-offer canvas').first().evaluate(canvas => [...canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data].some((value, index) => index % 4 === 3 && value > 0))).toBe(true);
      await phone.locator('.access summary').click();
      await expect(phone.locator('#accessible-controls')).toHaveAttribute('open', '');
      await phone.locator('.access summary').click();
      await phone.locator("#mobile-shop").screenshot({ path: test.info().outputPath("shop-card-buy-landscape.png") });
      await phone.locator(".mobile-offer").nth(1).getByRole("button", { name: /^Preview/ }).click();
      expect((await gameState(phone)).shop.previewIndex).toBe(1);
      await expect(phone.locator('#mobile-hero-dialog')).toBeVisible();
      await expect(phone.locator('#mobile-hero-description')).not.toBeEmpty();
      await phone.keyboard.press('Escape');
      await expect(phone.locator('#mobile-hero-dialog')).toBeHidden();
      await expect(phone.locator('.mobile-offer').nth(1).getByRole('button', { name: /^Preview/ })).toBeFocused();
      expect(await phone.locator('.mobile-offer-buy, .mobile-stage-nav button, .quick-actions button').evaluateAll(elements => elements.filter(element => element.getBoundingClientRect().height > 0).every(element => element.getBoundingClientRect().height >= 44))).toBe(true);
      await phone.locator(".mobile-offer").nth(1).getByRole("button", { name: /^Buy/ }).click();
      await expect(phone.locator('.visual-board')).toHaveAttribute("data-mobile-view", "board");
      await expect(phone.locator('#mobile-hint')).toBeHidden();
      await phone.locator('.access summary').click();
      await phone.locator('[data-action-id="help-tip"]').click();
      await phone.locator('.access summary').click();
      await expect(phone.locator('#mobile-hint')).toContainText('friendly board space');
      await phone.getByRole('button', { name: 'Dismiss help tip' }).click();
      await expect(phone.locator('#mobile-hint')).toBeHidden();
      await phone.getByRole("button", { name: "Bench", exact: true }).click();
      await expect(phone.locator(".mobile-bench-slot:not(.empty)")).toHaveCount(1);
      await phone.locator(".mobile-bench-slot:not(.empty)").click();
      await expect(phone.locator('.visual-board')).toHaveAttribute("data-mobile-view", "board");
      expect(await phone.locator('.info-icon:not([hidden])').evaluateAll(elements => elements.every(element => element.getBoundingClientRect().height >= 44 && element.getBoundingClientRect().width >= 44))).toBe(true);
      await phone.locator('#items-toggle').click();
      expect(await phone.locator('#items-panel button').first().evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      await phone.getByRole('button', { name: 'Close ×' }).click();
      const position = await phone.evaluate(() => {
        const tile=window.AB_UI.grid().tiles.find(item => item.coordinate === 'A1'),canvas=document.getElementById('game').getBoundingClientRect(),view=document.querySelector('.visual-board').getBoundingClientRect();
        return { x:canvas.x+tile.x*canvas.width/1440,y:canvas.y+tile.y*canvas.height/1000,viewTop:view.top,viewBottom:view.bottom };
      });
      expect(position.y).toBeGreaterThan(position.viewTop);
      expect(position.y).toBeLessThan(position.viewBottom);
      await phone.mouse.click(position.x,position.y);
      expect((await gameState(phone)).field.map(unit => unit.coordinate)).toContain("A1");
      expect((await gameState(phone)).shop.visible).toBe(true);
      const framing=await phone.evaluate(() => { const tiles=AB_UI.grid().tiles,canvas=document.getElementById('game').getBoundingClientRect(),view=document.querySelector('.visual-board').getBoundingClientRect();const y=coordinate=>canvas.y+tiles.find(tile=>tile.coordinate===coordinate).y*canvas.height/1000;return {near:y('A1')-view.top,far:view.bottom-y('E5')}; });
      expect(framing.near).toBeGreaterThan(20);
      expect(framing.far).toBeGreaterThan(10);
      await phone.getByRole("button", { name: /Begin round/ }).click();
      expect((await gameState(phone)).phase).toBe("battle");
      const combatFraming=await phone.evaluate(() => { const tiles=AB_UI.grid().tiles,canvas=document.getElementById('game').getBoundingClientRect(),view=document.querySelector('.visual-board').getBoundingClientRect();const y=coordinate=>canvas.y+tiles.find(tile=>tile.coordinate===coordinate).y*canvas.height/1000;return {near:y('A1')-view.top,far:view.bottom-y('E5')}; });
      expect(combatFraming.near).toBeGreaterThan(40);
      expect(combatFraming.far).toBeGreaterThan(0);
      await expect(phone.getByRole("button", { name: "Pause" })).toBeVisible();
      await phone.screenshot({ path: test.info().outputPath("landscape-game.png") });
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });

  test("shared arena drags, swaps and sells heroes with star-aware shop and bench ratings", async ({ page }) => {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/wtfiap", { waitUntil: "domcontentloaded" });
    const host = await hostFrame(page);
    const game = await gameFrame(host, "#frame");
    const ratingCheck = await game.evaluate(() => {
      const invalid = [], unchanged = [];
      for (const hero of window.AB.ROSTER) {
        const scores = [1, 2, 3].map(star => window.AB_UI.ratings(hero.id, star));
        if (scores.some(score => Object.values(score).some(value => !Number.isInteger(value) || value < 1 || value > 10))) invalid.push(hero.id);
        if (new Set(scores.map(score => JSON.stringify(score))).size !== 3) unchanged.push(hero.id);
      }
      return { invalid, unchanged };
    });
    expect(ratingCheck).toEqual({ invalid: [], unchanged: [] });
    const rankVisuals = await game.evaluate(() => {
      const hero = window.AB.ROSTER[0];
      const ranks = [1, 2, 3].map(level => ({
        name: window.ABArtSprites.evolutionProfile({ heroId: hero.id, level }, hero).name,
        height: window.ABArtSprites.measureUnit(70, { heroId: hero.id, level }, hero).height,
      }));
      return ranks;
    });
    expect(rankVisuals.map(rank => rank.name)).toEqual(["Original form", "Silver aura", "Gold aura"]);
    expect(rankVisuals[0].height).toBeLessThan(rankVisuals[1].height);
    expect(rankVisuals[1].height).toBeLessThan(rankVisuals[2].height);
    const firstOfferRating = (await gameState(game)).shop.offerRatings[0];
    expect(firstOfferRating).toMatchObject({ defense: expect.any(Number), speed: expect.any(Number) });
    expect(firstOfferRating.attack ?? firstOfferRating.magic).toEqual(expect.any(Number));
    const roleRatings = await game.evaluate(() => {
      const healer = window.AB.ROSTER.find(hero => hero.primaryClass === "mender" && hero.cost === 1);
      const fighter = window.AB.ROSTER.find(hero => hero.primaryClass === "duelist");
      return { healer: window.AB_UI.ratings(healer.id, 1), fighter: window.AB_UI.ratings(fighter.id, 1) };
    });
    expect(roleRatings.healer.magic).toBeGreaterThan(1);
    expect(roleRatings.healer.attack).toBeUndefined();
    expect(roleRatings.fighter.attack).toEqual(expect.any(Number));
    expect(roleRatings.fighter.magic).toBeUndefined();
    const iconInventory = await game.evaluate(() => {
      const seen = new Set();
      const missing = [];
      for (const hero of window.AB.ROSTER) {
        const icons = window.AB_UI.traitIcons(hero);
        if (icons.length !== (hero.faction ? 1 + hero.classes.length : 1)) missing.push(hero.id);
        for (const icon of icons) seen.add(icon.id);
      }
      return { missing, factions: window.AB.FACTIONS.filter(faction => !seen.has(faction.id)).map(faction => faction.id), classes: window.AB.CLASSES.filter(clas => !seen.has(clas.id)).map(clas => clas.id) };
    });
    expect(iconInventory).toEqual({ missing: [], factions: [], classes: [] });

    await hit(page, game, "shop-buy-0");
    let state = await gameState(game);
    const first = state.bench[0].id;
    expect(state.bench[0].ratings).toEqual(await game.evaluate(id => window.AB_UI.ratings(id, 1), state.bench[0].heroId));
    await dragHit(page, game, `bench-${first}`, `tile-0-${state.board.rows - 1}`);
    state = await gameState(game);
    expect(state.field.map(unit => unit.id)).toContain(first);
    expect(state.saveStatus).toBe("saved");
    await hoverHit(page, game, `field-${first}`);
    const fieldHover = await game.evaluate(() => window.AB_UI.fieldHover());
    expect(fieldHover.heroId).toBe(state.field[0].heroId);
    expect(fieldHover.ratings).toEqual(await game.evaluate(id => window.AB_UI.ratings(id, 1), state.field[0].heroId));
    expect(fieldHover.icons.length).toBeGreaterThanOrEqual(2);
    await game.locator("#game").screenshot({ path: test.info().outputPath("field-trait-icons-and-ratings.png") });

    await game.evaluate(() => {
      window.AB_UI.begin();
      while (window.AB_GAME().phase === "battle") window.advanceTime(1000);
      window.AB_UI.nextRound();
    });
    await hit(page, game, "shop-buy-0");
    state = await gameState(game);
    const second = state.bench[0].id;
    await dragHit(page, game, `bench-${second}`, `field-${first}`);
    state = await gameState(game);
    expect(state.field.map(unit => unit.id)).toContain(second);
    expect(state.bench.map(unit => unit.id)).toContain(first);
    expect(state.selected).toBe(first);

    const beforeSale = state.match.players.player.gold;
    await dragHit(page, game, `bench-${first}`, "shop-toggle");
    state = await gameState(game);
    expect(state.bench.map(unit => unit.id)).not.toContain(first);
    expect(state.match.players.player.gold).toBe(beforeSale + 1);
    await page.screenshot({ path: test.info().outputPath("drag-ratings-practice.png"), fullPage: true });
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
    await page.getByRole('button', { name: 'Continue in portrait' }).click();
    await expect(page.locator('#orientation-prompt')).toBeHidden();
    await expect(page.locator('main')).toHaveClass(/portrait-play/);
    await expect(page.locator('.mobile-offer')).toHaveCount(4);
    await page.locator('.mobile-offer-buy').first().click();
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await expect(page.locator('#mobile-bench .mobile-bench-slot:not(.empty)')).toHaveCount(1);
    await page.locator('#mobile-bench .mobile-bench-slot:not(.empty)').click();
    const home=await page.evaluate(() => { const tile=AB_UI.grid().tiles.find(item=>item.coordinate==='A1'),canvas=document.getElementById('game').getBoundingClientRect();return {x:canvas.x+tile.x*canvas.width/1440,y:canvas.y+tile.y*canvas.height/1000}; });
    await page.touchscreen.tap(home.x,home.y);
    expect((await gameState(page)).field.map(unit=>unit.coordinate)).toContain('A1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator("#orientation-prompt")).toBeHidden();
    expect(await page.locator("main").evaluate(element => element.inert)).toBe(false);
    await page.getByRole('button', { name: 'Shop', exact: true }).click();
    await page.locator('.mobile-offer-preview').nth(1).click();
    await expect(page.locator('#mobile-hero-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator("#traits-icon")).toHaveClass(/unread/);
    expect(await page.locator("#traits-icon").evaluate(element => getComputedStyle(element).animationName)).toBe("none");
    await page.getByRole('button', { name: 'Board', exact: true }).click();
    await page.locator("#traits-icon").click();
    await expect(page.locator("#traits-panel")).toBeVisible();
    await context.close();
  });

  test("Stuffs Play opens Party, creates a real room and reloads its purchased formation", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Open Stuffs menu" }).click();
    await page.getByText("Play", { exact: true }).last().click();
    const menuEntry = page.getByText("coLILseum", { exact: true }).last();
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
    await expect(party.locator('.welcome-hero h1')).toHaveText('Choose your room.');
    expect(await party.locator('.cast-stage img').evaluateAll(images => images.length === 3 && images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
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
    const unitId = await buyAndDeploy(page, game, true, "shop-card-buy-0");
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

  test("two people can create and start a free coLILseum duel", async ({ page, browser }) => {
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
      await expect(arena.locator("#items-toggle")).toBeVisible();
      await arena.locator("#items-toggle").click();
      await expect(arena.locator("#items-panel")).toContainText("No items held yet");
      await expect(host.locator("#alive-count")).toContainText("2 alive");
      const directory = await (await page.request.get("/api/wtfiap/party/rooms")).json();
      expect(directory.rooms.find(room => room.roomCode === code)?.phase).toBe("preparation");
    } finally { await guestContext.close(); }
  });

  test("room directory exposes seats, player records and join or watch actions", async ({ page, browser }) => {
    await page.goto("/games/installed/wtfiap/party.html?mode=duel", { waitUntil: "domcontentloaded" });
    await page.locator("#create-name").fill("Directory host");
    await page.locator("#prep-time").selectOption("ready");
    await page.locator("#create-room").click();
    await expect(page.locator("#invite-code")).not.toHaveValue("");
    const code = await page.locator("#invite-code").inputValue();
    const guestContext = await browser.newContext();
    try {
      const guest = await guestContext.newPage();
      expect((await guest.request.post("/__test/state", { data: { userRole: "contestant" } })).ok()).toBeTruthy();
      await guest.goto("/games/installed/wtfiap/party.html", { waitUntil: "domcontentloaded" });
      await guest.locator("#refresh-rooms").click();
      const card = guest.locator(".table-card").filter({ has: guest.locator(`[aria-label="Join duel room ${code}"]`) });
      await expect(card).toContainText("WTF Admin");
      await expect(card).toContainText("0 W · 0 L");
      await expect(card.locator(".seat-dot.taken")).toHaveCount(1);
      await expect(card.locator(".seat-dot:not(.taken):not(.ai)")).toHaveCount(1);
      await guest.screenshot({ path: test.info().outputPath("room-directory.png"), fullPage: true });
      await guest.locator("#join-name").fill("Directory guest");
      await card.getByRole("button", { name: `Join duel room ${code}` }).click();
      await expect(guest.locator("#alive-count")).toContainText("2 / 2 seats");
    } finally { await guestContext.close(); }
  });

  test("full waiting tables leave discovery and a host can close an unstarted room", async ({ page, browser }) => {
    await page.goto("/games/installed/wtfiap/party.html?mode=duel", { waitUntil: "domcontentloaded" });
    await page.locator("#create-name").fill("Closing host");
    await page.locator("#prep-time").selectOption("ready");
    await page.locator("#create-room").click();
    await expect(page.locator("#invite-code")).not.toHaveValue("");
    const code = await page.locator("#invite-code").inputValue();
    const guestContext = await browser.newContext();
    try {
      const guest = await guestContext.newPage();
      expect((await guest.request.post("/__test/state", { data: { userRole: "contestant" } })).ok()).toBeTruthy();
      await guest.goto(`/games/installed/wtfiap/party.html?room=${code}`, { waitUntil: "domcontentloaded" });
      await guest.locator("#join-name").fill("Closing guest");
      await guest.locator("#join-room").click();
      await expect(guest.locator("#alive-count")).toContainText("2 / 2 seats");
      await guest.locator("#other-room").click();
      await guest.locator("#refresh-rooms").click();
      await expect(guest.getByRole("button", { name: `Watch duel room ${code}` })).toHaveCount(0);
      expect((await page.request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
      await expect(page.locator("#close-room")).toBeVisible();
      await page.locator("#close-room").click();
      await expect(page.locator("#phase-label")).toHaveText("Room closed");
      await expect(page.locator("#room-rules")).toContainText("no longer listed or joinable");
      await expect(page.locator("#start-room")).toBeHidden();
      const lobby = await (await page.request.get(`/api/wtfiap/party/rooms/${code}/lobby`)).json();
      expect(lobby.view.phase).toBe("closed");
      await page.screenshot({ path: test.info().outputPath("closed-room.png"), fullPage: true });
    } finally { await guestContext.close(); }
  });

  test("room creator pins Ancient and Custom optional rules while the core duel stays playable", async ({ page, browser }) => {
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto("/games/installed/wtfiap/party.html?mode=duel", { waitUntil: "domcontentloaded" });
    await expect(page.locator("#rules-preset")).toHaveValue("modern");
    await page.locator("#rules-preset").selectOption("custom");
    await expect(page.locator("#custom-rules")).toBeVisible();
    await page.locator('[data-feature="items"]').uncheck();
    await expect(page.locator('[data-feature="cherub"]')).toBeDisabled();
    await expect(page.locator('[data-feature="battlePlans"]')).not.toBeChecked();
    await page.locator('[data-feature="blessings"]').check();
    await page.screenshot({ path: test.info().outputPath("custom-room-rules.png"), fullPage: true });
    await page.locator("#rules-preset").selectOption("ancient");
    await expect(page.locator("#custom-rules")).toBeHidden();
    await page.locator("#rules-preset").selectOption("custom");
    await expect(page.locator("[data-feature]:checked")).toHaveCount(0);
    await page.locator("#rules-preset").selectOption("ancient");
    await page.locator("#create-name").fill("Ancient host");
    await page.locator("#prep-time").selectOption("ready");
    await page.locator("#create-room").click();
    await expect(page.locator("#room-rules")).toContainText("Ancient · core hero play");
    const code = await page.locator("#invite-code").inputValue();
    const lobby = (await (await page.request.get(`/api/wtfiap/party/rooms/${code}/lobby`)).json()).view;
    expect(lobby.config.gameFeatures.items).toBe(false);
    expect(lobby.config.gameFeatures.treasure).toBe(false);
    const guestContext = await browser.newContext();
    try {
      const guest = await guestContext.newPage();
      expect((await guest.request.post("/__test/state", { data: { userRole: "contestant" } })).ok()).toBeTruthy();
      await guest.goto(`/games/installed/wtfiap/party.html?room=${code}`);
      await guest.locator("#join-name").fill("Ancient guest");
      await guest.locator("#join-room").click();
      await expect(guest.locator("#room-rules")).toContainText("Ancient · core hero play");
      expect((await page.request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
      await page.locator("#start-room").click();
      const arena = await gameFrame(page, "#arena-frame");
      await expect(arena.locator("#items-toggle")).toBeHidden();
      const state = await gameState(arena);
      expect(state.match.shops.player[0]).toBeTruthy();
      await arena.locator("#game").screenshot({ path: test.info().outputPath("ancient-room-board.png") });
    } finally { await guestContext.close(); }
    expect(errors).toEqual([]);
  });

  test("a blessings-only Custom room exposes fortunes without item equipment", async ({ page, browser }) => {
    await page.goto("/games/installed/wtfiap/party.html?mode=duel", { waitUntil: "domcontentloaded" });
    await page.locator("#rules-preset").selectOption("custom");
    for (const input of await page.locator("[data-feature]").all()) if (await input.isEnabled() && await input.isChecked()) await input.uncheck();
    await page.locator('[data-feature="blessings"]').check();
    await page.locator("#create-name").fill("Blessed host");
    await page.locator("#prep-time").selectOption("ready");
    await page.locator("#create-room").click();
    await expect(page.locator("#room-rules")).toContainText("Custom · Blessings");
    const code = await page.locator("#invite-code").inputValue();
    const guestContext = await browser.newContext();
    try {
      const guest = await guestContext.newPage();
      expect((await guest.request.post("/__test/state", { data: { userRole: "contestant" } })).ok()).toBeTruthy();
      await guest.goto(`/games/installed/wtfiap/party.html?room=${code}`);
      await guest.locator("#join-name").fill("Blessed guest");
      await guest.locator("#join-room").click();
      await expect(guest.locator("#alive-count")).toContainText("2 / 2 seats");
      await expect(page.locator("#alive-count")).toContainText("2 / 2 seats");
      expect((await page.request.post("/__test/state", { data: { userRole: "admin" } })).ok()).toBeTruthy();
      await page.locator("#start-room").click();
      const arena = await gameFrame(page, "#arena-frame");
      await expect(arena.locator("#items-toggle")).toBeVisible();
      await arena.locator("#items-toggle").click();
      await expect(arena.locator("#items-panel")).toContainText("Blessings & curses");
      await expect(arena.locator("#items-panel")).not.toContainText("Inventory and equipment");
      expect((await gameState(arena)).match.players.player.gold).toBe(1);
    } finally { await guestContext.close(); }
  });

  test("Mainnet XTZ wager duels show their network and creator fee before room creation", async ({ page }) => {
    await page.goto("/wtfiap", { waitUntil: "domcontentloaded" });
    await surface(page).getByRole("link", { name: "Duel" }).click();
    const host = await hostFrame(page);
    await host.locator("#duel-wager").check();
    await host.locator("#entry-currency").selectOption("XTZ");
    await expect(host.locator("#entry-network-choice")).toBeVisible();
    await host.locator("#entry-network").selectOption("mainnet");
    await host.locator("#entry-fee").fill("1.00");
    await expect(host.locator("#entry-help")).toContainText("0.5 XTZ house fee");
    await host.locator("#create-name").fill("Mainnet duel host");
    await host.locator("#prep-time").selectOption("ready");
    await host.locator("#create-room").click();
    await expect(host.locator("#invite-code")).not.toHaveValue("");
    await expect(host.locator("#tournament-terms")).toContainText("Tezos mainnet");
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
