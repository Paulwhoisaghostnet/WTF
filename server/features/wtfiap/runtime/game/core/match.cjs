/* Local practice-match coordinator. The existing modules own every economy,
 * progression and HP rule. This adapter consumes only its own engine result;
 * it is not a server validator or permission to settle a paid room.
 * Owner-approved shop: one starting gold, four one-star offers per preparation,
 * first round all one-cost; later costs use the existing rarity weights;
 * rerolls cost two gold. Supply uses the owner-approved two-player lot counts; tier rarity is unchanged.
 * The AI buys affordable offers in their displayed order and fields its owned
 * roster in acquisition order. It never receives free heroes or rerolls.
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(
    require('../../source/engine.js'), require('./progression.cjs'), require('./income.cjs'),
    require('./commander-health.cjs'), require('./treasure.cjs'), require('./chest-health.cjs'), require('./shop-pool.cjs'), require('../../source/zone-policy.js'), require('./items.cjs'), require('./fortunes.cjs'));
  else root.ABMatch = factory(root.AB, root.ABProgression, root.ABIncome, root.ABCommanderHealth, root.ABTreasure, root.ABChestHealth, root.ABShopPool, root.ABZonePolicy, root.ABItems, root.ABFortunes);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine, Progression, Income, Health, Treasure, ChestHealth, ShopPool, ZonePolicy, Items, Fortunes) {
  'use strict';
  if (![Engine, Progression, Income, Health, Treasure, ChestHealth].every(Boolean)) throw new Error('Load the engine and shared match-rule modules before ABMatch.');
  const SIDES = ['player', 'enemy'];
  const RULES = Object.freeze({ startingGold: 1, shopSize: 4, rerollCost: 2 });
  // Board sizes and expansion levels are the owner's mode rules. A mode is
  // explicit so existing tokens and saved five-by-five matches retain their
  // original geometry and deterministic combat replay.
  const boardMode = (id, name, stages) => Object.freeze({ id, name,
    stages: Object.freeze(stages.map(([level, columns, rows]) => Object.freeze({ level, columns, rows }))) });
  const STANDARD_STAGES = [[1, 3, 4], [2, 4, 4], [3, 4, 5], [4, 5, 5], [5, 5, 6],
    [6, 6, 6], [7, 6, 7], [8, 7, 7], [9, 7, 8], [10, 8, 8]];
  const BOARD_MODES = Object.freeze({
    'tight-quarters': boardMode('tight-quarters', 'Tight Quarters', [[1, 3, 3], [4, 4, 4], [8, 5, 5]]),
    standard: boardMode('standard', 'Standard', STANDARD_STAGES),
    expansive: boardMode('expansive', 'Expansive', [[1, 4, 5], [2, 5, 5], [3, 5, 6], [4, 6, 6], [5, 6, 7],
      [6, 7, 7], [7, 7, 8], [8, 8, 8], [9, 8, 9], [10, 9, 9]]),
    gated: boardMode('gated', 'Gated', STANDARD_STAGES.map(([level, columns, rows]) => [level, columns, rows + (rows % 2 ? 0 : 1)])),
    'zone-defense': boardMode('zone-defense', 'Zone Defense', STANDARD_STAGES)
  });
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = reason => ({ ok: false, reason });
  const demand = (condition, reason) => { if (!condition) throw new Error(reason); };
  const safeGold = value => Number.isSafeInteger(value) && value >= 0;
  const reference = ChestHealth.createReference(Engine.ROSTER.map(hero => {
    const stats = Engine.deriveStats({ heroId: hero.id, level: 1 }, Engine.synergies([]));
    return { id: hero.id, maxHp: stats.maxHp, armor: stats.armor };
  }));
  const balancedReference = ChestHealth.createReference(Engine.ROSTER.map(hero => {
    const stats = Engine.deriveStats({ heroId: hero.id, level: 1, balanceVersion: 1 }, Engine.synergies([]));
    return { id: hero.id, maxHp: stats.maxHp, armor: stats.armor };
  }));
  const referenceFor = match => match.balanceVersion === 1 ? balancedReference : reference;
  function required(result) {
    if (!result.ok) throw new Error(result.reason || result.error.message);
    return result;
  }
  function roundId(match, number = match.roundNumber) { return match.matchId + ':round:' + number; }
  function combatId(match) { return roundId(match) + ':combat'; }
  function preparation(match) { return match.phase === 'preparation' && match.game.phase === 'planning'; }
  function guarded(action) { try { return action(); } catch (error) { return fail(error.message); } }
  function zoneRandom(match, number = match.roundNumber) {
    return Engine.makeRandom(String(match.game.token.battleSeed ?? match.game.token.seed) + ':zones:' + number);
  }
  function hasBoardMode(mode) { return typeof mode === 'string' && Object.hasOwn(BOARD_MODES, mode); }
  function boardForLevel(mode, level) {
    demand(hasBoardMode(mode), 'Select a supported board mode.');
    demand(Number.isInteger(level) && level >= 1 && level <= Progression.RULES.maximumLevel, 'Board expansion requires a valid commander level.');
    const stage = BOARD_MODES[mode].stages.filter(stage => stage.level <= level).at(-1);
    const board = geometry(stage.columns, stage.rows);
    if (mode === 'zone-defense') { board.halfRows = 2; board.playerStartRow = board.rows - 2; }
    if (mode === 'gated') {
      // Two symmetric outer lanes remain open. The center-row barrier blocks
      // movement and sight; intentionally aligned heroes can see through gates.
      board.terrain = { walls: [{ minCol: 0.5, maxCol: board.columns - 1.5,
        minRow: board.neutralRow - 0.5, maxRow: board.neutralRow + 0.5 }],
      gates: [{ col: 0, row: board.neutralRow }, { col: board.columns - 1, row: board.neutralRow }] };
    }
    return board;
  }
  function geometry(columns, rows) {
    const halfRows = Math.floor(rows / 2), neutralRow = rows % 2 ? halfRows : null;
    return { columns, rows, halfRows, playerStartRow: rows - halfRows, neutralRow };
  }
  function sameBoardValue(actual, expected) {
    if (actual === expected) return true;
    if (!actual || !expected || typeof actual !== 'object' || typeof expected !== 'object' || Array.isArray(actual) !== Array.isArray(expected)) return false;
    const keys = Object.keys(expected);
    return Object.keys(actual).length === keys.length && keys.every(key => Object.hasOwn(actual, key) && sameBoardValue(actual[key], expected[key]));
  }
  function validateBoard(mode, board, level) {
    // Match replay knows its exact commander level. A Party room can retain a
    // previously reached stage after that commander is eliminated, so an
    // omitted level accepts any complete canonical stage, never arbitrary size
    // or client-supplied terrain metadata.
    demand(mode === undefined || hasBoardMode(mode), 'Select a supported board mode.');
    const candidates = mode === undefined ? [geometry(5, 5)] : level === undefined
      ? BOARD_MODES[mode].stages.map(stage => boardForLevel(mode, stage.level)) : [boardForLevel(mode, level)];
    demand(candidates.some(expected => sameBoardValue(board, expected)), 'Board geometry must match its mode, commander levels and neutral center row.');
    return true;
  }
  function highestLevel(match, beforeResult = false) {
    return Math.max(...SIDES.map(side => beforeResult ? match.players[side].progression.receipts.filter(receipt => receipt.kind === 'combat').at(-1).levelBefore
      : match.players[side].progression.level));
  }
  function boardModeInfo(match) {
    const mode = hasBoardMode(match.boardMode) ? BOARD_MODES[match.boardMode] : null;
    demand(match.boardMode === undefined || mode, 'Unknown board mode.');
    const { columns, rows } = match.game.board, stages = mode ? mode.stages : [{ level: 1, columns: 5, rows: 5 }];
    return { id: mode ? mode.id : null, name: mode ? mode.name : 'Fixed 5×5', columns, rows,
      maximumColumns: stages.at(-1).columns, maximumRows: stages.at(-1).rows, deploymentSpaces: columns * match.game.board.halfRows,
      highestLevel: highestLevel(match), next: stages.find(stage => stage.columns > columns || stage.rows > rows) || null, stages };
  }
  function expandBoard(match) {
    if (match.boardMode === undefined || !preparation(match)) return;
    const oldBoard = match.game.board, nextBoard = boardForLevel(match.boardMode, highestLevel(match));
    if (nextBoard.columns === oldBoard.columns && nextBoard.rows === oldBoard.rows) return;
    demand(nextBoard.columns >= oldBoard.columns && nextBoard.rows >= oldBoard.rows, 'A match board cannot shrink after preparation begins.');
    // Keep integer starting cells when parity changes. Shift columns toward
    // the new center and retain each side's distance from its front row.
    const columnOffset = Math.floor(nextBoard.columns / 2) - Math.floor(oldBoard.columns / 2);
    for (const side of SIDES) {
      const rowOffset = side === 'player' ? nextBoard.playerStartRow - oldBoard.playerStartRow : nextBoard.halfRows - oldBoard.halfRows;
      const units = side === 'player' ? match.game.field : match.game.opponents;
      for (const unit of [...units, ...(match.chests[side] ? [match.chests[side]] : []), ...(match.cherubs?.[side] ? [match.cherubs[side]] : [])]) { unit.col += columnOffset; unit.row += rowOffset; }
    }
    match.game.board = nextBoard;
  }
  function availableFieldCapacity(match, side) {
    return Math.min(match.players[side].progression.fieldCapacity, match.game.board.columns * match.game.board.halfRows);
  }
  function fieldAI(match) {
    const selected = match.enemyPool.slice(0, availableFieldCapacity(match, 'enemy'));
    const remaining = new Set(selected.map(unit => unit.id)), occupied = new Set();
    const units = selected.map(unit => {
      const old = match.game.opponents.find(value => value.id === unit.id);
      if (!old) return { ...unit };
      occupied.add(old.col + ':' + old.row); remaining.delete(unit.id); return { ...unit, col: old.col, row: old.row };
    });
    for (const unit of units.filter(unit => remaining.has(unit.id))) {
      for (let cell = 0; cell < match.game.board.columns * match.game.board.halfRows; cell++) {
        const col = cell % match.game.board.columns, row = Math.floor(cell / match.game.board.columns), key = col + ':' + row;
        if (occupied.has(key)) continue;
        Object.assign(unit, { col, row }); occupied.add(key); break;
      }
    }
    match.game.opponents = units;
  }
  function synchronize(match) {
    match.game.playerLevel = match.players.player.progression.level;
    for (const side of SIDES) match.players[side].hp = match.health.players.find(player => player.playerId === side).hp;
    match.winnerSide = match.health.winnerId;
    expandBoard(match);
    if (match.boardMode === 'zone-defense' && preparation(match)) match.game.zoneDefense = ZonePolicy.create(match.game.board, zoneRandom(match));
  }
  function checkUnit(unit, positioned, side, board) {
    demand(unit && typeof unit.id === 'string' && unit.id.trim() && Engine.heroById(unit.heroId), 'Every owned hero must have a valid identity.');
    demand(Number.isInteger(unit.level) && unit.level >= 1 && unit.level <= 3, 'Hero stars must be from one through three.');
    if (positioned) checkPosition(side, unit.col, unit.row, board);
  }
  function checkPosition(side, col, row, board) {
    demand(SIDES.includes(side), 'Unknown commander side.');
    demand(Number.isInteger(col) && col >= 0 && col < board.columns && Number.isInteger(row) &&
      (side === 'player' ? row >= board.playerStartRow && row < board.rows : row >= 0 && row < board.halfRows), 'Place this object in its owner’s territory.');
  }
  function validateInventory(match) {
    const game = match.game;
    const ended = match.phase === 'round-result' || match.phase === 'finished';
    validateBoard(match.boardMode, game.board, match.boardMode === undefined ? undefined : highestLevel(match, ended));
    if (match.boardMode === 'zone-defense') ZonePolicy.validate(game.zoneDefense, game.board, zoneRandom(match));
    else demand(game.zoneDefense === undefined, 'Zone bonuses belong only to Zone Defense.');
    demand(game.token.config.benchCapacity === 10 && game.bench.length <= 10, 'The approved bench holds ten heroes.');
    demand(Array.isArray(match.enemyPool) && match.enemyPool.length - game.opponents.length <= 10, 'The opponent bench holds ten reserve heroes.');
    validateSupply(match);
    const owned = [...game.bench, ...game.field, ...match.enemyPool];
    demand(new Set(owned.map(unit => unit.id)).size === owned.length, 'Owned hero IDs must be unique across both commanders.');
    game.bench.forEach(unit => checkUnit(unit, false, 'player'));
    game.field.forEach(unit => checkUnit(unit, true, 'player', game.board));
    match.enemyPool.forEach(unit => checkUnit(unit, false, 'enemy')); game.opponents.forEach(unit => checkUnit(unit, true, 'enemy', game.board));
    for (const units of [game.field, game.opponents]) demand(new Set(units.map(unit => unit.col + ':' + unit.row)).size === units.length, 'Starting hero positions must be distinct.');
    demand(game.field.length <= match.players.player.progression.fieldCapacity && game.opponents.length <= match.players.enemy.progression.fieldCapacity,
      'Field at most one hero per commander level.');
    demand(game.opponents.every(unit => match.enemyPool.some(owned => owned.id === unit.id && owned.heroId === unit.heroId && owned.level === unit.level)), 'Opponent formation must use its persistent roster.');
  }
  function createMatch(options) {
    demand(options && (options.startingGold === undefined || options.startingGold === RULES.startingGold), 'Practice matches start with the approved one gold.');
    demand(options.boardMode === undefined || hasBoardMode(options.boardMode), 'Select a supported board mode.');
    const token = clone(options.token);
    demand(token && Array.isArray(token.bench) && Array.isArray(token.opponents), 'A generated token must supply both owned rosters.');
    const matchId = options.matchId === undefined ? 'practice:' + String(token.battleSeed ?? token.seed) : options.matchId;
    demand(typeof matchId === 'string' && matchId.trim(), 'Match ID must be a nonempty string.');
    demand(ShopPool, 'Load the shared shop-pool module before creating a match.');
    const match = { schemaVersion: 2, cherubRulesVersion: 2, fortunePricingVersion: 1, balanceVersion: 1, shopLockRulesVersion: 1, encounterRulesVersion: 1, draftRulesVersion: 1, draft: null, planRulesVersion: 1, planReceipts: [], fortuneRulesVersion: 1, fortuneReceipts: [], shopPool: ShopPool.create(Engine.ROSTER), matchId, startingGold: RULES.startingGold, roundNumber: 1, phase: 'preparation',
      game: Engine.createGame(token), players: {}, enemyPool: [], shops: { player: [], enemy: [] },
      shopDraws: { player: 0, enemy: 0 }, shopReceipts: [], enemyMergeSerial: 0,
      chests: { player: null, enemy: null }, cherubs: { player: null, enemy: null }, health: Health.createMatch({ matchId, playerIds: SIDES, startingHP: Health.COMMANDER_STARTING_HP }),
      treasure: Treasure.createLedger({ matchId, playerIds: SIDES }), receipts: [], lastReceipt: null, lastIncome: null, winnerSide: null };
    if (options.boardMode !== undefined) { match.boardMode = options.boardMode; match.game.board = boardForLevel(options.boardMode, 1); }
    match.game.itemRulesVersion = 1;
    const startBoard = match.game.board;
    match.cherubs = { player: { col: Math.floor((startBoard.columns - 1) / 2), row: startBoard.playerStartRow },
      enemy: { col: Math.floor((startBoard.columns - 1) / 2), row: startBoard.halfRows - 1 } };
    match.game.balanceVersion = 1;
    match.game.bench = []; match.game.opponents = [];
    for (const side of SIDES) match.players[side] = { gold: RULES.startingGold, hp: Health.COMMANDER_STARTING_HP, items: [], shopLocked: false, pendingPlan: false, freeRerolls: 0, plans: [], blessings: [], curses: [], fortuneShop: null, mirrorTickets: [], winStreak: 0, lossStreak: 0,
      progression: Progression.createProgression({ matchId, playerId: side, xpCosts: [...Progression.COMMANDER_LEVEL_COSTS] }),
      income: Income.createLedger({ matchId, playerId: side }) };
    synchronize(match); for (const side of SIDES) refreshShop(match, side); prepareAI(match); validate(match); return match;
  }
  function refreshShop(match, side) {
    if (match.schemaVersion === 2) return refreshLotShop(match, side);
    const draw = match.shopDraws[side]++;
    const random = Engine.makeRandom(String(match.game.token.battleSeed ?? match.game.token.seed) + ':shop:' + side + ':' + match.roundNumber + ':' + draw);
    const costs = Engine.SPAWN_RARITY.costs, total = costs.reduce((sum, row) => sum + row.weight, 0);
    match.shops[side] = Array.from({ length: RULES.shopSize }, (_, index) => {
      let cost = 1;
      if (match.roundNumber > 1) {
        const value = random() * total; let sum = 0;
        for (const tier of costs) { sum += tier.weight; if (value < sum) { cost = tier.cost; break; } }
      }
      const heroes = Engine.ROSTER.filter(hero => hero.cost === cost), hero = heroes[Math.floor(random() * heroes.length)];
      return { id: roundId(match) + ':shop:' + side + ':' + draw + ':' + index, heroId: hero.id, level: 1, cost };
    });
  }
  function poolHolders(match, omitShops = []) {
    return [...match.game.field, ...match.game.bench, ...match.enemyPool,
      ...SIDES.filter(side => !omitShops.includes(side)).flatMap(side => match.shops[side].filter(Boolean))];
  }
  function validateSupply(match) {
    if (match.schemaVersion === 2) {
      demand(ShopPool, 'Load the shared shop-pool module before this match.');
      demand(match.shopPool && match.shopPool.playerCount === SIDES.length, 'Practice matches require the two-player stock policy.');
      ShopPool.validate(match.shopPool, poolHolders(match), Engine.ROSTER);
      for (const unit of match.game.opponents) {
        const owned = match.enemyPool.find(value => value.id === unit.id);
        demand(owned && JSON.stringify(unit.lotIds) === JSON.stringify(owned.lotIds), 'Opponent formation must retain its owned lots.');
      }
    } else demand(match.shopPool === undefined, 'Legacy matches cannot contain an unvalidated shop pool.');
  }
  function refreshLotShop(match, side) {
    validateSupply(match);
    const draw = match.shopDraws[side];
    demand(Number.isSafeInteger(draw + 1), 'Shop draw counter exceeds exact numeric representation.');
    const random = Engine.makeRandom(String(match.game.token.battleSeed ?? match.game.token.seed) + ':shop:' + side + ':' + match.roundNumber + ':' + draw + ':lots-v1');
    // Old unbought offers are released for this draw. Other shops stay reserved.
    let available = ShopPool.available(match.shopPool, poolHolders(match, [side]));
    const offers = Array.from({ length: RULES.shopSize }, (_, index) => {
      const tiers = Engine.SPAWN_RARITY.costs.filter(tier => (match.roundNumber > 1 || tier.cost === 1) && available.some(lot => lot.cost === tier.cost))
        .map(tier => match.fortuneRulesVersion === 1 ? { ...tier, weight: Fortunes.tierWeight(tier.weight, tier.cost, match.players[side].blessings, match.players[side].curses) } : tier);
      if (!tiers.length) return null;
      let cost = tiers[0].cost;
      if (match.roundNumber > 1) {
        const value = random() * tiers.reduce((sum, tier) => sum + tier.weight, 0); let sum = 0;
        for (const tier of tiers) { sum += tier.weight; if (value < sum) { cost = tier.cost; break; } }
      }
      const lots = available.filter(lot => lot.cost === cost), lot = lots[Math.floor(random() * lots.length)];
      available = available.filter(value => value.id !== lot.id);
      return { id: roundId(match) + ':shop:' + side + ':' + draw + ':' + index, heroId: lot.heroId, level: 1, cost, lotIds: [lot.id] };
    });
    // Commit only after every slot has been drawn; there are no retry limits.
    match.shops[side] = offers; match.shopDraws[side] = draw + 1;
    if (match.fortuneRulesVersion === 1) {
      const buyer = match.players[side], target = match.players[side === 'player' ? 'enemy' : 'player'];
      const eligible = Fortunes.CATALOG.filter(entry => entry.kind === 'curse' && !target.curses.includes(entry.id)).map(entry => entry.id);
      buyer.fortuneShop = Fortunes.draw(Engine.makeRandom(String(match.game.token.battleSeed ?? match.game.token.seed) + ':fortune:' + side + ':' + match.roundNumber + ':' + draw), buyer.blessings, eligible);
    }
  }
  function poolSummary(match) {
    if (match.schemaVersion !== 2) return null;
    return ShopPool.summary(match.shopPool, poolHolders(match));
  }
  function heroSupply(match, heroId) {
    if (match.schemaVersion !== 2) return null;
    const copies = units => units.filter(unit => unit.heroId === heroId).reduce((sum, unit) => sum + unit.lotIds.length, 0);
    return { total: match.shopPool.copiesByCost[Engine.heroById(heroId).cost],
      playerOwned: copies([...match.game.field, ...match.game.bench]), enemyOwned: copies(match.enemyPool) };
  }
  function purchaseInventory(match, side, offer) {
    // Stage the recruit and its complete upgrade chain before checking capacity.
    // Nothing is spent, removed or evolved if the final inventory cannot fit.
    const unit = { id: offer.id + ':unit', heroId: offer.heroId, level: 1, ...(offer.lotIds ? { lotIds: [...offer.lotIds] } : {}) };
    const upgrades = [], overflowItems = [];
    let result = unit;
    if (side === 'player') {
      const game = { ...match.game, field: clone(match.game.field), bench: clone(match.game.bench) };
      game.bench.push(unit);
      let group;
      while ((group = Engine.mergeGroups(game).find(value => value.heroId === offer.heroId))) {
        const combined = required(Engine.combine(game, group.heroId, group.level));
        result = combined.unit; overflowItems.push(...(combined.overflowItemIds || []));
        upgrades.push({ heroId: result.heroId, level: result.level, unitId: result.id });
      }
      demand(game.bench.length <= 10, 'Make room on the ten-slot bench before buying.');
      return { unit: result, upgrades, overflowItems, game };
    }
    let pool = clone(match.enemyPool), serial = match.enemyMergeSerial;
    pool.push(unit);
    let merged;
    do {
      merged = false;
      for (const candidate of pool) {
        if (candidate.heroId !== offer.heroId || candidate.level >= 3) continue;
        const copies = pool.filter(copy => copy.heroId === candidate.heroId && copy.level === candidate.level);
        if (copies.length < 3) continue;
        const ids = new Set(copies.slice(0, 3).map(copy => copy.id)), first = pool.findIndex(copy => ids.has(copy.id));
        result = { id: match.matchId + ':enemy-merge:' + (++serial), heroId: candidate.heroId, level: candidate.level + 1,
          ...(match.schemaVersion === 2 ? { lotIds: copies.slice(0, 3).flatMap(copy => copy.lotIds) } : {}) };
        pool = pool.filter(copy => !ids.has(copy.id)); pool.splice(first, 0, result);
        upgrades.push({ heroId: result.heroId, level: result.level, unitId: result.id });
        merged = true; break;
      }
    } while (merged);
    demand(pool.length - Math.min(pool.length, availableFieldCapacity(match, 'enemy')) <= 10,
      'Make room on the ten-slot bench before buying.');
    return { unit: result, upgrades, pool, serial };
  }
  function grantMirrorTickets(match, side, upgrades) {
    if (match.fortuneRulesVersion !== 1 || !match.players[side].blessings.includes('mirror-loom')) return;
    for (const upgrade of upgrades.filter(value => value.level === 2)) match.players[side].mirrorTickets.push({
      id: match.matchId + ':mirror:' + side + ':' + upgrade.unitId,
      maxCost: Engine.heroById(upgrade.heroId).cost });
  }
  function buyShop(match, index, side = 'player') {
    return guarded(() => {
      demand(preparation(match), 'Buy heroes during round preparation.'); demand(SIDES.includes(side), 'Unknown commander side.'); validateSupply(match);
      demand(Number.isInteger(index) && index >= 0 && index < RULES.shopSize, 'Select a shop offer.');
      const offer = match.shops[side][index], commander = match.players[side];
      demand(offer, 'That shop slot has no available offer.'); demand(commander.gold >= offer.cost, 'Not enough gold for that hero.');
      const next = purchaseInventory(match, side, offer), before = commander.gold;
      if (match.schemaVersion === 2) {
        const shops = { ...match.shops, [side]: match.shops[side].map((value, slot) => slot === index ? null : value) };
        const staged = { ...match, shops, game: side === 'player' ? next.game : match.game, enemyPool: side === 'enemy' ? next.pool : match.enemyPool };
        ShopPool.validate(staged.shopPool, poolHolders(staged), Engine.ROSTER);
      }
      commander.gold -= offer.cost; match.shops[side][index] = null;
      if (side === 'player') {
        match.game.field = next.game.field; match.game.bench = next.game.bench; match.game.mergeSerial = next.game.mergeSerial;
        if ([1, 2].includes(match.cherubRulesVersion)) commander.items.push(...next.overflowItems);
      } else { match.enemyPool = next.pool; match.enemyMergeSerial = next.serial; fieldAI(match); }
      grantMirrorTickets(match, side, next.upgrades);
      match.shopReceipts.push({ kind: 'purchase', side, roundNumber: match.roundNumber, offer: clone(offer), goldBefore: before, goldSpent: offer.cost, goldAfter: commander.gold });
      return { ok: true, unit: next.unit, upgrades: next.upgrades };
    });
  }
  function saleValue(unit) {
    checkUnit(unit, false, 'player');
    return Engine.heroById(unit.heroId).cost * 3 ** (unit.level - 1);
  }
  function sellHero(match, unitId, side = 'player') {
    return guarded(() => {
      demand(preparation(match), 'Sell heroes during round preparation.'); demand(SIDES.includes(side), 'Unknown commander side.'); validateSupply(match);
      const owned = side === 'player' ? [...match.game.field, ...match.game.bench] : match.enemyPool;
      const unit = owned.find(value => value.id === unitId);
      demand(unit, 'Select a hero you own to sell.');
      const goldReceived = saleValue(unit), commander = match.players[side], before = commander.gold;
      demand(safeGold(before + goldReceived), 'Gold balance exceeds exact numeric representation.');
      if (side === 'player') {
        match.game.field = match.game.field.filter(value => value.id !== unitId);
        match.game.bench = match.game.bench.filter(value => value.id !== unitId);
        if ([1, 2].includes(match.cherubRulesVersion)) commander.items.push(...(unit.itemIds || []));
      } else { match.enemyPool = match.enemyPool.filter(value => value.id !== unitId); fieldAI(match); }
      commander.gold += goldReceived;
      const receipt = { kind: 'sale', side, roundNumber: match.roundNumber, unit: clone(unit), goldBefore: before,
        goldSpent: 0, goldReceived, goldAfter: commander.gold };
      match.shopReceipts.push(receipt);
      return { ok: true, unit: clone(unit), goldReceived, receipt };
    });
  }
  function rerollShop(match, side = 'player') {
    return guarded(() => {
      demand(preparation(match), 'Refresh the shop during round preparation.'); demand(SIDES.includes(side), 'Unknown commander side.');
      const commander = match.players[side], free = match.planRulesVersion === 1 && commander.freeRerolls > 0;
      const priorPaid = match.shopReceipts.some(receipt => receipt.kind === 'reroll' && receipt.side === side && receipt.roundNumber === match.roundNumber && receipt.goldSpent > 0);
      const price = free ? 0 : match.fortuneRulesVersion === 1
        ? Fortunes.rerollPrice(RULES.rerollCost, commander.blessings, commander.curses, !priorPaid) : RULES.rerollCost;
      demand(commander.gold >= price, 'Not enough gold for this shop refresh.');
      const before = commander.gold; refreshShop(match, side); commander.gold -= price;
      if (price === 0) commander.freeRerolls--;
      if (match.shopLockRulesVersion === 1) commander.shopLocked = false;
      match.shopReceipts.push({ kind: 'reroll', side, roundNumber: match.roundNumber, draw: match.shopDraws[side] - 1, goldBefore: before, goldSpent: price, goldAfter: commander.gold });
      return { ok: true };
    });
  }
  function buyFortune(match, fortuneId, targetSide = 'enemy', side = 'player') {
    return guarded(() => {
      demand(match.fortuneRulesVersion === 1 && preparation(match) && SIDES.includes(side), 'This match has no fortune shop.');
      const entry = Fortunes.get(fortuneId), buyer = match.players[side];
      demand(entry && buyer.fortuneShop?.[entry.kind + 'Id'] === fortuneId, 'Choose a current blessing or curse offer.');
      const target = entry.kind === 'blessing' ? side : targetSide;
      demand(SIDES.includes(target) && (entry.kind === 'blessing' ? target === side : target !== side), 'Choose the opposing commander for a curse.');
      const list = entry.kind === 'blessing' ? match.players[side].blessings : match.players[target].curses;
      demand(!list.includes(fortuneId), 'That permanent effect is already active.');
      const price = Fortunes.priceFor(fortuneId, match.fortunePricingVersion);
      demand(buyer.gold >= price, 'Not enough gold for this fortune.');
      buyer.gold -= price; list.push(fortuneId); buyer.fortuneShop[entry.kind + 'Id'] = null;
      const receipt = { side, target, kind: entry.kind, fortuneId, roundNumber: match.roundNumber, goldSpent: price };
      match.fortuneReceipts.push(receipt);
      return { ok: true, receipt };
    });
  }
  function useMirrorTicket(match, ticketId, unitId, side = 'player') {
    return guarded(() => {
      demand(match.fortuneRulesVersion === 1 && preparation(match) && SIDES.includes(side), 'Mirror Tickets belong to fortune matches in preparation.');
      validateSupply(match);
      const commander = match.players[side], ticket = commander.mirrorTickets.find(value => value.id === ticketId);
      const owned = side === 'player' ? [...match.game.field, ...match.game.bench] : match.enemyPool;
      const target = owned.find(value => value.id === unitId), hero = Engine.heroById(target?.heroId);
      demand(ticket && hero && hero.cost <= ticket.maxCost, 'Choose an owned hero within this ticket’s cost tier.');
      demand(commander.gold >= hero.cost, 'A Mirror Ticket still pays the hero’s normal gold cost.');
      const lot = ShopPool.available(match.shopPool, poolHolders(match)).find(value => value.heroId === hero.id);
      demand(lot, 'No copy of that hero remains in the shared pool.');
      const offer = { id: roundId(match) + ':mirror:' + side + ':' + ticket.id, heroId: hero.id, level: 1, cost: hero.cost, lotIds: [lot.id] };
      const next = purchaseInventory(match, side, offer), before = commander.gold;
      const staged = { ...match, game: side === 'player' ? next.game : match.game, enemyPool: side === 'enemy' ? next.pool : match.enemyPool };
      ShopPool.validate(staged.shopPool, poolHolders(staged), Engine.ROSTER);
      commander.gold -= hero.cost; commander.mirrorTickets.splice(commander.mirrorTickets.indexOf(ticket), 1);
      if (side === 'player') {
        match.game.field = next.game.field; match.game.bench = next.game.bench; match.game.mergeSerial = next.game.mergeSerial;
        commander.items.push(...next.overflowItems);
      } else { match.enemyPool = next.pool; match.enemyMergeSerial = next.serial; fieldAI(match); }
      grantMirrorTickets(match, side, next.upgrades);
      match.shopReceipts.push({ kind: 'mirror-copy', side, roundNumber: match.roundNumber, offer: clone(offer), ticketId,
        goldBefore: before, goldSpent: hero.cost, goldAfter: commander.gold });
      return { ok: true, unit: next.unit, upgrades: next.upgrades };
    });
  }
  function setShopLocked(match, value, side = 'player') {
    return guarded(() => {
      demand(match.shopLockRulesVersion === 1 && preparation(match) && SIDES.includes(side) && typeof value === 'boolean', 'Hold shop offers during preparation.');
      match.players[side].shopLocked = value;
      return { ok: true };
    });
  }
  function draftPick(match, itemId) {
    return guarded(() => {
      demand(preparation(match) && match.draftRulesVersion === 1 && match.draft?.roundNumber === match.roundNumber &&
        !match.draft.picked && match.draft.availableIds.includes(itemId), 'Choose an available shared-draft component.');
      match.draft.availableIds.splice(match.draft.availableIds.indexOf(itemId), 1);
      match.draft.picked = true; match.players.player.items.push(itemId);
      return { ok: true, itemId };
    });
  }
  function choosePlan(match, planId, side = 'player') {
    return guarded(() => {
      demand(preparation(match) && match.planRulesVersion === 1 && SIDES.includes(side) &&
        match.players[side].pendingPlan && ['treasury', 'armory', 'scout'].includes(planId), 'Choose an available battle plan.');
      const player = match.players[side], receipt = { side, roundNumber: match.roundNumber, planId,
        goldReceived: 0, itemId: null, freeRerolls: 0 };
      player.pendingPlan = false; player.plans.push({ roundNumber: match.roundNumber, planId });
      if (planId === 'treasury') { player.gold += 5; receipt.goldReceived = 5; }
      else if (planId === 'armory') {
        const random = Engine.makeRandom(String(match.game.token.battleSeed ?? match.game.token.seed) + ':plan-armory:' + match.roundNumber + ':' + side);
        receipt.itemId = Items.componentIds[Math.floor(random() * Items.componentIds.length)]; player.items.push(receipt.itemId);
      } else { player.freeRerolls += 3; receipt.freeRerolls = 3; }
      match.planReceipts.push(receipt); return { ok: true, receipt };
    });
  }
  function prepareAI(match) {
    fieldAI(match);
    for (let index = 0; index < match.shops.enemy.length; index++) {
      const offer = match.shops.enemy[index];
      if (offer && offer.cost <= match.players.enemy.gold) buyShop(match, index, 'enemy');
    }
    if (match.fortuneRulesVersion === 1 && match.enemyPool.length) {
      const offer = match.players.enemy.fortuneShop;
      if (offer?.blessingId && match.players.enemy.gold >= Fortunes.priceFor(offer.blessingId, match.fortunePricingVersion))
        buyFortune(match, offer.blessingId, 'enemy', 'enemy');
      else if (offer?.curseId && match.players.enemy.gold >= Fortunes.priceFor(offer.curseId, match.fortunePricingVersion))
        buyFortune(match, offer.curseId, 'player', 'enemy');
    }
    let merged;
    do {
      merged = false;
      for (const unit of match.enemyPool) {
        if (unit.level >= 3) continue;
        const copies = match.enemyPool.filter(copy => copy.heroId === unit.heroId && copy.level === unit.level);
        if (copies.length < 3) continue;
        const consumed = new Set(copies.slice(0, 3).map(copy => copy.id)), first = match.enemyPool.findIndex(copy => consumed.has(copy.id));
        const evolved = { id: match.matchId + ':enemy-merge:' + (++match.enemyMergeSerial), heroId: unit.heroId, level: unit.level + 1,
          ...(match.schemaVersion === 2 ? { lotIds: copies.slice(0, 3).flatMap(copy => copy.lotIds) } : {}) };
        match.enemyPool = match.enemyPool.filter(copy => !consumed.has(copy.id)); match.enemyPool.splice(first, 0, evolved);
        merged = true; break;
      }
    } while (merged);
    fieldAI(match);
  }
  function chestPreview(match) {
    const terms = Treasure.calculateRoundTerms(match.roundNumber);
    return { enabled: terms.enabled, goldPerChest: terms.goldPerChest, expiresAtSeconds: terms.treasureWindowSeconds,
      chests: !terms.enabled ? [] : SIDES.map(side => {
        const units = side === 'player' ? match.game.field : match.game.opponents;
        const health = units.length ? ChestHealth.calculateChestHealth(referenceFor(match), units.map(unit => unit.heroId)) : null;
        const position = match.chests[side];
        return { id: roundId(match) + ':chest:' + side, side, col: position ? position.col : null,
          row: position ? position.row : null, maxHp: health ? health.maxHp : null, health };
      }) };
  }
  function moveChest(match, side, col, row) {
    return guarded(() => {
      demand(preparation(match), 'Place treasure during round preparation.');
      demand(match.roundNumber >= 5, 'Treasure begins in round five.');
      checkPosition(side, col, row, match.game.board); match.chests[side] = { col, row }; return { ok: true };
    });
  }
  function moveCherub(match, side, col, row) {
    return guarded(() => {
      demand(preparation(match) && match.cherubRulesVersion === 2, 'Move Cherub during preparation.');
      checkPosition(side, col, row, match.game.board);
      match.cherubs[side] = { col, row };
      return { ok: true };
    });
  }
  function beginCombat(match) {
    return guarded(() => {
      demand(preparation(match), 'This round is not awaiting combat.'); validateInventory(match);
      if (match.planRulesVersion === 1 && match.players.player.pendingPlan) required(choosePlan(match, 'treasury'));
      if (match.draft && !match.draft.picked) {
        const random = Engine.makeRandom(String(match.game.token.battleSeed ?? match.game.token.seed) + ':draft-auto:' + match.roundNumber);
        required(draftPick(match, match.draft.availableIds[Math.floor(random() * match.draft.availableIds.length)]));
      }
      const preview = chestPreview(match);
      demand(preview.chests.every(chest => chest.col !== null && chest.row !== null), 'Place your treasure chest before starting this round.');
      demand(preview.chests.every(chest => chest.maxHp !== null), 'Field a hero to determine treasure health.');
      required(Engine.startBattle(match.game, { roundNumber: match.roundNumber,
        ...([1, 2].includes(match.cherubRulesVersion) ? { cherubRulesVersion: match.cherubRulesVersion, cherubs: Engine.cherubObjectives(match.game, combatId(match)).map(cherub => match.cherubRulesVersion === 2 ? { ...cherub, ...match.cherubs[cherub.side] } : cherub) } : {}),
        chests: preview.chests.map(({ id, side, col, row, maxHp }) => ({ id, side, col, row, maxHp })) }));
      match.phase = 'combat'; if (match.game.phase === 'finished') settleCombat(match);
      return { ok: true };
    });
  }
  function settleCombat(match) {
    demand(match.phase === 'combat' && match.game.phase === 'finished', 'Only this match’s completed battle can settle.');
    const game = match.game, result = game.result;
    const winnerSide = result === 'victory' ? 'player' : result === 'defeat' ? 'enemy' : null;
    demand(['victory', 'defeat', 'draw'].includes(result), 'Unknown engine result.');
    const survivingHeroes = game.battle.units.filter(unit => unit.alive && unit.hp > 0 && !unit.temporary).map(unit => {
      demand(unit.side === winnerSide, 'Only the winning army can have surviving heroes.');
      return { unitId: unit.id, stars: unit.level, cost: Engine.heroById(unit.heroId).cost, hp: unit.hp, maxHp: unit.maxHp };
    });
    const common = { matchId: match.matchId, roundId: roundId(match), combatId: combatId(match), status: 'completed' };
    const encounterRound = match.encounterRulesVersion === 1 && match.roundNumber % 5 === 0;
    const health = required(Health.applyCombatResult(match.health, { ...common, expectedRevision: match.health.revision,
      winnerId: encounterRound ? null : winnerSide, survivingHeroes: encounterRound ? [] : survivingHeroes }));
    const treasure = required(Treasure.settleRound(match.treasure, { ...common, expectedRevision: match.treasure.revision,
      roundNumber: match.roundNumber, combatEndedAtSeconds: game.battle.elapsed,
      chests: (game.battle.objectives || []).filter(chest => chest.rewardKind !== 'cherub').map(chest => ({ chestId: chest.id, ownerId: chest.side })),
      verifiedDefeats: game.battle.events.filter(event => event.type === 'treasure-defeated').map(event =>
        ({ chestId: event.chestId, captorPlayerId: event.captorSide, defeatedAtSeconds: event.defeatedAtSeconds })) }));
    const xp = {}, balances = {};
    const zoneGoldEvents = game.battle.events.filter(event => event.type === 'zone-gold');
    demand(match.boardMode === 'zone-defense' || !zoneGoldEvents.length, 'Zone gold belongs only to Zone Defense.');
    const zoneGold = match.boardMode === 'zone-defense' ? ZonePolicy.goldPayouts(game.zoneDefense, zoneGoldEvents) : { player: 0, enemy: 0 };
    for (const side of SIDES) {
      xp[side] = required(Progression.awardCompletedCombat(match.players[side].progression, { ...common, playerId: side,
        expectedRevision: match.players[side].progression.revision, outcome: winnerSide === null ? 'draw' : side === winnerSide ? 'win' : 'loss' }));
      const baseTreasure = treasure.receipt.payouts.find(payout => payout.playerId === side).gold;
      const paidTreasure = match.fortuneRulesVersion === 1
        ? Fortunes.treasureGold(baseTreasure, match.players[side].blessings, match.players[side].curses) : baseTreasure;
      balances[side] = match.players[side].gold + paidTreasure + zoneGold[side];
      demand(safeGold(balances[side]), 'Gold balance exceeds exact numeric representation.');
    }
    const cherubRewards = [1, 2].includes(match.cherubRulesVersion) ? game.battle.events.filter(event => event.type === 'cherub-defeated').map(event => {
      const random = Engine.makeRandom(String(game.token.battleSeed ?? game.token.seed) + ':cherub:' + match.roundNumber + ':' + event.cherubId + ':' + event.captorSide);
      return { cherubId: event.cherubId, side: event.captorSide,
        itemId: Items.componentIds[Math.floor(random() * Items.componentIds.length)] };
    }) : [];
    const encounterReward = encounterRound && winnerSide === 'player' ? Items.componentIds[Math.floor(
      Engine.makeRandom(String(game.token.battleSeed ?? game.token.seed) + ':encounter:' + match.roundNumber)() * Items.componentIds.length)] : null;
    // All pure module transitions have succeeded. Commit their effects together.
    match.health = health.state; match.treasure = treasure.state;
    const fortuneGold = match.fortuneRulesVersion === 1 ? Object.fromEntries(SIDES.map(side => {
      const base = treasure.receipt.payouts.find(payout => payout.playerId === side).gold;
      return [side, Fortunes.treasureGold(base, match.players[side].blessings, match.players[side].curses) - base];
    })) : null;
    const fortuneDrops = match.fortuneRulesVersion === 1 ? Object.fromEntries(SIDES.map(side => {
      const player = match.players[side], outcome = winnerSide === null ? 'draw' : winnerSide === side ? 'win' : 'loss';
      const priorStreak = outcome === 'win' ? player.winStreak : player.lossStreak;
      const base = Items.dropChance(outcome, priorStreak);
      const chance = Fortunes.dropChance(base, player.blessings, player.curses);
      const random = Engine.makeRandom(String(game.token.battleSeed ?? game.token.seed) + ':fortune-drop:' + match.roundNumber + ':' + side);
      const roll = random();
      return [side, { outcome, priorStreak, chance, roll, itemId: roll < chance ? Items.componentIds[Math.floor(random() * Items.componentIds.length)] : null }];
    })) : null;
    for (const side of SIDES) {
      const player = match.players[side]; player.progression = xp[side].state; player.gold = balances[side];
      if (fortuneDrops) {
        const drop = fortuneDrops[side]; if (drop.itemId) player.items.push(drop.itemId);
        player.winStreak = drop.outcome === 'win' ? drop.priorStreak + 1 : 0;
        player.lossStreak = drop.outcome === 'loss' ? drop.priorStreak + 1 : 0;
      }
    }
    for (const reward of cherubRewards) match.players[reward.side].items.push(reward.itemId);
    if (encounterReward) match.players.player.items.push(encounterReward);
    const receipt = { roundNumber: match.roundNumber, roundId: common.roundId, combatId: common.combatId, result, winnerSide,
      combatEndedAtSeconds: game.battle.elapsed, health: health.receipt, treasure: treasure.receipt,
      ...([1, 2].includes(match.cherubRulesVersion) ? { cherubRewards } : {}),
      ...(match.fortuneRulesVersion === 1 ? { fortuneGold, fortuneDrops } : {}),
      ...(encounterRound ? { encounterReward } : {}),
      ...(match.boardMode === 'zone-defense' ? { zoneGold, zoneGoldEvents: clone(zoneGoldEvents) } : {}),
      xp: { player: xp.player.receipt, enemy: xp.enemy.receipt } };
    match.receipts.push(receipt); match.lastReceipt = receipt;
    match.phase = health.state.phase === 'finished' ? 'finished' : 'round-result'; synchronize(match);
  }
  function step(match, seconds) {
    demand(Number.isFinite(seconds) && seconds >= 0, 'Elapsed combat seconds must be finite and nonnegative.');
    if (match.phase !== 'combat') return match;
    Engine.step(match.game, seconds);
    if (match.game.phase === 'finished') settleCombat(match);
    return match;
  }
  function nextRound(match) {
    return guarded(() => {
      demand(match.phase === 'round-result' && match.health.phase === 'active', 'Finish this combat before starting the next preparation.'); validateSupply(match);
      const next = match.roundNumber + 1; demand(Number.isSafeInteger(next), 'Round number exceeds exact numeric representation.');
      Treasure.calculateRoundTerms(next);
      if (match.shopLockRulesVersion === 1) for (const side of SIDES)
        if (match.players[side].shopLocked && !match.shops[side].some(Boolean)) match.players[side].shopLocked = false;
      // Stage every shop return together before any commander receives a new draw.
      // A continuing duel has two living commanders; eight-player elimination
      // uses this same pure pool transition with its full original room roster.
      const enemyFieldIds = new Set(match.game.opponents.map(unit => unit.id));
      const recycled = match.schemaVersion === 2 ? ShopPool.recycleForPreparation(match.shopPool, [
        { playerId: 'player', commanderHP: match.players.player.hp, field: match.game.field, bench: match.game.bench, shop: match.shops.player,
          ...(match.shopLockRulesVersion === 1 ? { preserveShop: match.players.player.shopLocked } : {}) },
        { playerId: 'enemy', commanderHP: match.players.enemy.hp, field: match.enemyPool.filter(unit => enemyFieldIds.has(unit.id)),
          bench: match.enemyPool.filter(unit => !enemyFieldIds.has(unit.id)), shop: match.shops.enemy,
          ...(match.shopLockRulesVersion === 1 ? { preserveShop: match.players.enemy.shopLocked } : {}) }
      ], Engine.ROSTER) : null;
      const income = {};
      for (const side of SIDES) income[side] = required(Income.awardAtPreparationStart(match.players[side].income,
        { matchId: match.matchId, playerId: side, roundId: roundId(match, next), expectedRevision: match.players[side].income.revision,
          carriedGold: match.players[side].gold }));
      for (const side of SIDES) { match.players[side].income = income[side].state; match.players[side].gold = income[side].receipt.resultingGold; }
      match.lastIncome = { player: income.player.receipt, enemy: income.enemy.receipt };
      match.roundNumber = next; match.phase = 'preparation'; Engine.resetBattle(match.game); synchronize(match);
      if (match.planRulesVersion === 1) {
        for (const side of SIDES) match.players[side].pendingPlan = next % 4 === 3;
        if (match.players.enemy.pendingPlan) required(choosePlan(match, 'treasury', 'enemy'));
      }
      if (match.draftRulesVersion === 1) {
        match.draft = next % 4 === 0 ? { roundNumber: next, availableIds: [...Items.componentIds], picked: false } : null;
        if (match.draft) {
          const random = Engine.makeRandom(String(match.game.token.battleSeed ?? match.game.token.seed) + ':draft-enemy:' + next);
          const itemId = match.draft.availableIds.splice(Math.floor(random() * match.draft.availableIds.length), 1)[0];
          match.players.enemy.items.push(itemId);
          const target = match.enemyPool[0]; if (target) { target.itemIds ||= []; target.itemIds.push(itemId); }
        }
      }
      // Both old shops return before the new preparation draws either side.
      if (recycled) for (const player of recycled.players) match.shops[player.playerId] = player.shop;
      for (const side of SIDES) if (match.shopLockRulesVersion !== 1 || !match.players[side].shopLocked) refreshShop(match, side);
      prepareAI(match);
      if (next >= 5 && !match.chests.enemy) {
        // A deterministic legal tile from the token's existing entropy. This is
        // placement policy, not an additional chest stat or economy parameter.
        const random = Engine.makeRandom(String(match.game.token.battleSeed ?? match.game.token.seed) + ':enemy-chest');
        const cells = match.game.board.columns * match.game.board.halfRows, cell = Math.floor(random() * cells);
        match.chests.enemy = { col: cell % match.game.board.columns, row: Math.floor(cell / match.game.board.columns) };
      }
      return { ok: true, income: match.lastIncome };
    });
  }
  function buyXP(match, side = 'player') {
    return guarded(() => {
      demand(preparation(match), 'Buy commander XP during round preparation.'); demand(SIDES.includes(side), 'Unknown commander side.');
      const commander = match.players[side];
      const purchase = required(Progression.purchaseXP(commander.progression, { matchId: match.matchId, playerId: side,
        expectedRevision: commander.progression.revision, purchaseId: roundId(match) + ':xp:' + side + ':' + commander.progression.revision,
        availableGold: commander.gold }));
      commander.progression = purchase.state; commander.gold = purchase.receipt.resultingGold; synchronize(match);
      // Either commander can enlarge the shared board and make more legal
      // starting spaces available to the opponent formation.
      fieldAI(match);
      return { ok: true, receipt: purchase.receipt };
    });
  }
  function deploy(match, unitId, col, row) { return preparation(match) ? Engine.deploy(match.game, unitId, col, row) : fail('Move heroes during round preparation.'); }
  function recall(match, unitId) { return preparation(match) ? Engine.recall(match.game, unitId) : fail('Recall heroes during round preparation.'); }
  function combine(match, heroId, stars) {
    if (!preparation(match)) return fail('Combine heroes during round preparation.');
    const result = Engine.combine(match.game, heroId, stars);
    if (result.ok && [1, 2].includes(match.cherubRulesVersion)) match.players.player.items.push(...(result.overflowItemIds || []));
    if (result.ok) grantMirrorTickets(match, 'player', [{ heroId, level: result.unit.level, unitId: result.unit.id }]);
    return result;
  }
  function equipItem(match, unitId, itemId) {
    return guarded(() => {
      demand(preparation(match) && [1, 2].includes(match.cherubRulesVersion), 'Equip items during preparation in a Cherub match.');
      const unit = [...match.game.field, ...match.game.bench].find(entry => entry.id === unitId), items = match.players.player.items;
      demand(unit && Items.isItem(itemId) && items.includes(itemId), 'Choose an owned hero and an item in your inventory.');
      unit.itemIds ||= [];
      demand(!unit.itemIds.includes('lucky-grips+lucky-grips'), 'Trickster Mitts occupy all slots.');
      const componentIndex = Items.isComponent(itemId) ? unit.itemIds.findIndex(Items.isComponent) : -1;
      if (componentIndex >= 0) unit.itemIds[componentIndex] = Items.recipe(unit.itemIds[componentIndex], itemId).id;
      else { demand(unit.itemIds.length < 3, 'A hero can carry three completed item slots.'); unit.itemIds.push(itemId); }
      items.splice(items.indexOf(itemId), 1);
      if (itemId === 'lucky-grips+lucky-grips') { items.push(...unit.itemIds.filter(id => id !== itemId)); unit.itemIds = [itemId]; }
      return { ok: true };
    });
  }
  function unequipItem(match, unitId, itemId) {
    return guarded(() => {
      demand(preparation(match) && [1, 2].includes(match.cherubRulesVersion), 'Remove items during preparation.');
      const unit = [...match.game.field, ...match.game.bench].find(entry => entry.id === unitId);
      demand(unit?.itemIds?.includes(itemId), 'That item is not on this hero.');
      unit.itemIds.splice(unit.itemIds.indexOf(itemId), 1); match.players.player.items.push(itemId);
      return { ok: true };
    });
  }
  function validate(match) {
    demand(match && [1, 2].includes(match.schemaVersion) && typeof match.matchId === 'string' && match.matchId.trim(), 'Invalid practice-match schema or identity.');
    demand(match.startingGold === RULES.startingGold && Number.isSafeInteger(match.roundNumber) && match.roundNumber >= 1, 'Invalid starting gold or round number.');
    demand(['preparation', 'combat', 'round-result', 'finished'].includes(match.phase), 'Invalid match phase.');
    demand(match.cherubRulesVersion === undefined || [1, 2].includes(match.cherubRulesVersion), 'Unknown practice Cherub rules version.');
    if (match.cherubRulesVersion === 2) for (const side of SIDES) {
      demand(match.cherubs?.[side], 'Cherub placement is missing.');
      checkPosition(side, match.cherubs[side].col, match.cherubs[side].row, match.game.board);
    }
    demand(match.balanceVersion === undefined || match.balanceVersion === 1 && match.game.balanceVersion === 1, 'Unknown practice hero balance version.');
    demand(match.encounterRulesVersion === undefined || match.encounterRulesVersion === 1 && [1, 2].includes(match.cherubRulesVersion), 'Unknown practice encounter rules version.');
    demand(match.draftRulesVersion === undefined || match.draftRulesVersion === 1 && [1, 2].includes(match.cherubRulesVersion), 'Unknown practice draft rules version.');
    demand(match.planRulesVersion === undefined || match.planRulesVersion === 1 && [1, 2].includes(match.cherubRulesVersion) && Array.isArray(match.planReceipts), 'Unknown practice battle plan rules version.');
    demand(match.fortuneRulesVersion === undefined || match.fortuneRulesVersion === 1 && [1, 2].includes(match.cherubRulesVersion) && Array.isArray(match.fortuneReceipts), 'Unknown practice fortune rules version.');
    demand(match.fortunePricingVersion === undefined || match.fortunePricingVersion === 1 && match.fortuneRulesVersion === 1,
      'Unknown practice fortune pricing version.');
    if (match.draftRulesVersion === 1) demand(match.draft === null || match.roundNumber % 4 === 0 &&
      match.draft.roundNumber === match.roundNumber && Array.isArray(match.draft.availableIds) &&
      match.draft.availableIds.every(Items.isComponent) && new Set(match.draft.availableIds).size === match.draft.availableIds.length &&
      typeof match.draft.picked === 'boolean', 'Invalid practice shared draft.');
    demand(match.shopLockRulesVersion === undefined || match.shopLockRulesVersion === 1, 'Unknown practice shop lock rules version.');
    Health.validate(match.health); Treasure.validate(match.treasure);
    demand(match.health.matchId === match.matchId && match.treasure.matchId === match.matchId && match.health.startingHP === 100, 'Health and treasure ledgers must belong to this match.');
    demand(match.health.players.map(player => player.playerId).join(',') === SIDES.join(','), 'Commander identities must match their board sides.');
    for (const side of SIDES) {
      const commander = match.players[side]; Progression.validate(commander.progression); Income.validate(commander.income);
      if (match.planRulesVersion === 1) demand(typeof commander.pendingPlan === 'boolean' && safeGold(commander.freeRerolls) && Array.isArray(commander.plans), 'Invalid practice battle plan.');
      if (match.fortuneRulesVersion === 1) {
        demand(Array.isArray(commander.blessings) && Array.isArray(commander.curses) && Array.isArray(commander.mirrorTickets) &&
          commander.mirrorTickets.every(ticket => typeof ticket.id === 'string' && Number.isInteger(ticket.maxCost) && ticket.maxCost >= 1 && ticket.maxCost <= 5) &&
          new Set(commander.mirrorTickets.map(ticket => ticket.id)).size === commander.mirrorTickets.length &&
          safeGold(commander.winStreak) && safeGold(commander.lossStreak) && !(commander.winStreak && commander.lossStreak), 'Invalid permanent fortunes.');
        demand(commander.blessings.every(id => Fortunes.get(id)?.kind === 'blessing') && commander.curses.every(id => Fortunes.get(id)?.kind === 'curse') &&
          new Set(commander.blessings).size === commander.blessings.length && new Set(commander.curses).size === commander.curses.length, 'Fortune effects cannot stack by name.');
        const offer = commander.fortuneShop;
        demand(offer === null || Number.isFinite(offer.roll) && offer.roll >= 0 && offer.roll < Fortunes.OFFER_CHANCE &&
          (offer.blessingId === null || Fortunes.get(offer.blessingId)?.kind === 'blessing') &&
          (offer.curseId === null || Fortunes.get(offer.curseId)?.kind === 'curse'), 'Invalid optional fortune shop.');
      }
      if (match.shopLockRulesVersion === 1) demand(typeof commander.shopLocked === 'boolean', 'Invalid practice shop lock.');
      if ([1, 2].includes(match.cherubRulesVersion)) demand(Array.isArray(commander.items) && commander.items.every(Items.isItem), 'Invalid Cherub item inventory.');
      if ([1, 2].includes(match.cherubRulesVersion) && side === 'player') for (const unit of [...match.game.field, ...match.game.bench])
        demand(!unit.itemIds || Array.isArray(unit.itemIds) && unit.itemIds.length <= 3 && unit.itemIds.every(Items.isItem), 'Invalid equipped item.');
      demand(safeGold(commander.gold) && commander.hp === match.health.players.find(player => player.playerId === side).hp, 'Commander gold or carried HP is invalid.');
      for (const ledger of [commander.progression, commander.income]) demand(ledger.matchId === match.matchId && ledger.playerId === side, 'Commander ledgers belong to another match or side.');
      demand(JSON.stringify(commander.progression.xpCosts) === JSON.stringify(Progression.COMMANDER_LEVEL_COSTS), 'Use the approved XP curve.');
      const expectedGold = match.startingGold + commander.income.receipts.reduce((total, receipt) => total + Income.BASE_ROUND_INCOME + receipt.interest, 0)
        + match.treasure.receipts.reduce((total, receipt) => total + receipt.payouts.find(payout => payout.playerId === side).gold, 0)
        + (match.planRulesVersion === 1 ? match.planReceipts.filter(receipt => receipt.side === side).reduce((total, receipt) => total + receipt.goldReceived, 0) : 0)
        + (match.fortuneRulesVersion === 1 ? match.receipts.reduce((total, receipt) => total + receipt.fortuneGold[side], 0)
          - match.fortuneReceipts.filter(receipt => receipt.side === side).reduce((total, receipt) => total + receipt.goldSpent, 0) : 0)
        + match.receipts.reduce((total, receipt) => total + (receipt.zoneGold?.[side] ?? 0), 0)
        - commander.progression.receipts.filter(receipt => receipt.kind === 'purchase').reduce((total, receipt) => total + receipt.goldSpent, 0)
        - match.shopReceipts.filter(receipt => receipt.side === side).reduce((total, receipt) => total + receipt.goldSpent, 0)
        + match.shopReceipts.filter(receipt => receipt.side === side && receipt.kind === 'sale').reduce((total, receipt) => {
          demand(receipt.goldSpent === 0 && receipt.goldReceived === saleValue(receipt.unit) && receipt.goldAfter === receipt.goldBefore + receipt.goldReceived, 'Sale receipts must refund the owned hero’s full copy value.');
          return total + receipt.goldReceived;
        }, 0);
      demand(commander.gold === expectedGold, 'Gold must equal the carried starting balance, income, treasure and XP debits.');
      const settled = commander.progression.receipts.filter(receipt => receipt.kind === 'combat');
      demand(settled.length === match.receipts.length && commander.income.receipts.length === match.roundNumber - 1, 'A round can award income and combat XP only once.');
      for (const [index, receipt] of commander.income.receipts.entries()) demand(receipt.roundId === roundId(match, index + 2), 'Preparation income must follow round order.');
      for (const [index, receipt] of settled.entries()) demand(receipt.roundId === roundId(match, index + 1) && receipt.combatId === roundId(match, index + 1) + ':combat', 'Combat XP must follow round order.');
      if (match.chests[side]) checkPosition(side, match.chests[side].col, match.chests[side].row, match.game.board);
      demand(Array.isArray(match.shops[side]) && match.shops[side].length === RULES.shopSize && Number.isSafeInteger(match.shopDraws[side]) &&
        match.shopDraws[side] >= (match.shopLockRulesVersion === 1 ? 1 : match.roundNumber), 'Each preparation needs a four-offer shop.');
      for (const offer of match.shops[side].filter(Boolean)) demand(offer.level === 1 && Engine.heroById(offer.heroId).cost === offer.cost && (match.roundNumber > 1 || offer.cost === 1), 'Shop offers must match their approved stars and cost tier.');
    }
    if (match.fortuneRulesVersion === 1) for (const receipt of match.fortuneReceipts) {
      const entry = Fortunes.get(receipt.fortuneId);
      demand(entry && entry.kind === receipt.kind && receipt.goldSpent === Fortunes.priceFor(entry.id, match.fortunePricingVersion) && SIDES.includes(receipt.side) && SIDES.includes(receipt.target) &&
        (entry.kind === 'blessing' ? receipt.target === receipt.side : receipt.target !== receipt.side) &&
        match.players[receipt.target][entry.kind === 'blessing' ? 'blessings' : 'curses'].includes(entry.id), 'Fortune purchase receipt is invalid.');
    }
    const ended = match.phase === 'round-result' || match.phase === 'finished';
    demand(match.receipts.length === match.roundNumber - (ended ? 0 : 1) && match.health.receipts.length === match.receipts.length && match.treasure.receipts.length === match.receipts.length,
      'All settlement ledgers must agree on completed rounds.');
    demand(match.game.phase === (match.phase === 'preparation' ? 'planning' : match.phase === 'combat' ? 'battle' : 'finished'), 'Combat and match phases disagree.');
    demand(match.game.playerLevel === match.players.player.progression.level && match.winnerSide === match.health.winnerId &&
      (match.phase === 'finished') === (match.health.phase === 'finished'), 'Commander levels or terminal winner disagree.');
    demand((match.receipts.length === 0 && match.lastReceipt === null) || JSON.stringify(match.lastReceipt) === JSON.stringify(match.receipts[match.receipts.length - 1]), 'Last receipt must be the latest settled combat.');
    for (const [index, receipt] of match.receipts.entries()) {
      demand(receipt.roundNumber === index + 1 && receipt.roundId === roundId(match, index + 1) && receipt.combatId === roundId(match, index + 1) + ':combat', 'Round receipts must follow combat order.');
      demand(JSON.stringify(receipt.health) === JSON.stringify(match.health.receipts[index]) && JSON.stringify(receipt.treasure) === JSON.stringify(match.treasure.receipts[index]), 'Round receipts must match shared module ledgers.');
      if (match.boardMode === 'zone-defense') {
        const board = boardForLevel(match.boardMode, Math.max(...SIDES.map(side => receipt.xp[side].levelBefore)));
        const assignment = ZonePolicy.create(board, zoneRandom(match, receipt.roundNumber));
        demand(Array.isArray(receipt.zoneGoldEvents) && sameBoardValue(receipt.zoneGold, ZonePolicy.goldPayouts(assignment, receipt.zoneGoldEvents)), 'Zone gold receipts must match verified awards.');
      } else demand(receipt.zoneGold === undefined && receipt.zoneGoldEvents === undefined, 'Zone gold belongs only to Zone Defense.');
    }
    // Enemy deployment may still show the preceding capacity on a results
    // screen; field expansion happens only in the following preparation.
    if (ended) {
      const expected = match.game.opponents.length;
      demand(expected > 0 && expected <= match.players.enemy.progression.fieldCapacity, 'Opponent result formation is invalid.');
      validateInventory(match);
    } else validateInventory(match);
    return true;
  }
  function serialize(match) {
    validate(match);
    const snapshot = { ...match, game: { ...match.game, battle: null }, replay: match.game.battle ?
      { ticks: match.game.battle.tick, accumulator: match.game.battle.accumulator } : null };
    return JSON.stringify(snapshot);
  }
  function restore(serialized) {
    demand(typeof serialized === 'string', 'Saved match must be a JSON string.');
    const match = JSON.parse(serialized), replay = match.replay; delete match.replay;
    if (replay) {
      demand(Number.isSafeInteger(replay.ticks) && replay.ticks >= 0 && Number.isFinite(replay.accumulator) && replay.accumulator >= -1e-9, 'Saved combat clock is invalid.');
      const expectedPhase = match.game.phase, expectedResult = match.game.result;
      match.game.phase = 'planning'; match.game.result = null;
      const preview = chestPreview(match);
      required(Engine.startBattle(match.game, { roundNumber: match.roundNumber,
        ...([1, 2].includes(match.cherubRulesVersion) ? { cherubRulesVersion: match.cherubRulesVersion,
          cherubs: Engine.cherubObjectives(match.game, combatId(match)).map(cherub => match.cherubRulesVersion === 2
            ? { ...cherub, ...match.cherubs[cherub.side] } : cherub) } : {}),
        chests: preview.chests.map(({ id, side, col, row, maxHp }) => ({ id, side, col, row, maxHp })) }));
      // Replaying exact engine ticks restores AP getter aliases, live statuses,
      // events and target state. It never invokes this adapter's award path.
      for (let tick = 0; tick < replay.ticks; tick++) Engine.step(match.game, Engine.FIXED_STEP);
      demand(match.game.battle.tick === replay.ticks && match.game.phase === expectedPhase && match.game.result === expectedResult, 'Saved combat does not replay under these rules.');
      match.game.battle.accumulator = replay.accumulator;
    } else demand(match.phase === 'preparation', 'A combat or result snapshot requires its replay clock.');
    validate(match); return match;
  }
  function upgradeLegacy(match) {
    return guarded(() => {
      validate(match);
      if (match.schemaVersion === 2) return { ok: true, match };
      demand(ShopPool, 'Load the shared shop-pool module before upgrading a saved match.');
      const upgraded = restore(serialize(match)), pool = ShopPool.create(Engine.ROSTER), used = new Set();
      const holders = poolHolders(upgraded);
      for (const holder of holders) {
        const lots = pool.lots.filter(lot => lot.heroId === holder.heroId && !used.has(lot.id)).slice(0, 3 ** (holder.level - 1));
        demand(lots.length === 3 ** (holder.level - 1), 'This saved army and its shops exceed the new shared supply. Continue it with legacy supply rules; new matches use shared lots.');
        holder.lotIds = lots.map(lot => lot.id); holder.lotIds.forEach(id => used.add(id));
      }
      for (const unit of upgraded.game.opponents) unit.lotIds = [...upgraded.enemyPool.find(value => value.id === unit.id).lotIds];
      upgraded.schemaVersion = 2; upgraded.shopPool = pool; validate(upgraded);
      return { ok: true, match: upgraded };
    });
  }
  return Object.freeze({ RULES, BOARD_MODES, hasBoardMode, boardForLevel, boardModeInfo, validateBoard, createMatch, beginCombat, step, nextRound, buyXP, buyShop, sellHero, saleValue, rerollShop, buyFortune, useMirrorTicket, setShopLocked, draftPick, choosePlan, moveChest, chestPreview,
    deploy, recall, combine, moveCherub, equipItem, unequipItem, validate, serialize, restore, upgradeLegacy, poolSummary, heroSupply, reference });
});
