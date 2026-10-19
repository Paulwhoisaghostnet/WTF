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
    require('./commander-health.cjs'), require('./treasure.cjs'), require('./chest-health.cjs'), require('./shop-pool.cjs'), require('../../source/zone-policy.js'));
  else root.ABMatch = factory(root.AB, root.ABProgression, root.ABIncome, root.ABCommanderHealth, root.ABTreasure, root.ABChestHealth, root.ABShopPool, root.ABZonePolicy);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine, Progression, Income, Health, Treasure, ChestHealth, ShopPool, ZonePolicy) {
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
      for (const unit of [...units, ...(match.chests[side] ? [match.chests[side]] : [])]) { unit.col += columnOffset; unit.row += rowOffset; }
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
    const match = { schemaVersion: 2, shopPool: ShopPool.create(Engine.ROSTER), matchId, startingGold: RULES.startingGold, roundNumber: 1, phase: 'preparation',
      game: Engine.createGame(token), players: {}, enemyPool: [], shops: { player: [], enemy: [] },
      shopDraws: { player: 0, enemy: 0 }, shopReceipts: [], enemyMergeSerial: 0,
      chests: { player: null, enemy: null }, health: Health.createMatch({ matchId, playerIds: SIDES, startingHP: Health.COMMANDER_STARTING_HP }),
      treasure: Treasure.createLedger({ matchId, playerIds: SIDES }), receipts: [], lastReceipt: null, lastIncome: null, winnerSide: null };
    if (options.boardMode !== undefined) { match.boardMode = options.boardMode; match.game.board = boardForLevel(options.boardMode, 1); }
    match.game.bench = []; match.game.opponents = [];
    for (const side of SIDES) match.players[side] = { gold: RULES.startingGold, hp: Health.COMMANDER_STARTING_HP,
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
      const tiers = Engine.SPAWN_RARITY.costs.filter(tier => (match.roundNumber > 1 || tier.cost === 1) && available.some(lot => lot.cost === tier.cost));
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
    const upgrades = [];
    let result = unit;
    if (side === 'player') {
      const game = { ...match.game, field: clone(match.game.field), bench: clone(match.game.bench) };
      game.bench.push(unit);
      let group;
      while ((group = Engine.mergeGroups(game).find(value => value.heroId === offer.heroId))) {
        result = required(Engine.combine(game, group.heroId, group.level)).unit;
        upgrades.push({ heroId: result.heroId, level: result.level, unitId: result.id });
      }
      demand(game.bench.length <= 10, 'Make room on the ten-slot bench before buying.');
      return { unit: result, upgrades, game };
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
      } else { match.enemyPool = next.pool; match.enemyMergeSerial = next.serial; fieldAI(match); }
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
      const commander = match.players[side]; demand(commander.gold >= RULES.rerollCost, 'Refreshing the shop costs two gold.');
      const before = commander.gold; refreshShop(match, side); commander.gold -= RULES.rerollCost;
      match.shopReceipts.push({ kind: 'reroll', side, roundNumber: match.roundNumber, draw: match.shopDraws[side] - 1, goldBefore: before, goldSpent: RULES.rerollCost, goldAfter: commander.gold });
      return { ok: true };
    });
  }
  function prepareAI(match) {
    fieldAI(match);
    for (let index = 0; index < match.shops.enemy.length; index++) {
      const offer = match.shops.enemy[index];
      if (offer && offer.cost <= match.players.enemy.gold) buyShop(match, index, 'enemy');
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
        const health = units.length ? ChestHealth.calculateChestHealth(reference, units.map(unit => unit.heroId)) : null;
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
  function beginCombat(match) {
    return guarded(() => {
      demand(preparation(match), 'This round is not awaiting combat.'); validateInventory(match);
      const preview = chestPreview(match);
      demand(preview.chests.every(chest => chest.col !== null && chest.row !== null), 'Place your treasure chest before starting this round.');
      demand(preview.chests.every(chest => chest.maxHp !== null), 'Field a hero to determine treasure health.');
      required(Engine.startBattle(match.game, { roundNumber: match.roundNumber,
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
    const health = required(Health.applyCombatResult(match.health, { ...common, expectedRevision: match.health.revision, winnerId: winnerSide, survivingHeroes }));
    const treasure = required(Treasure.settleRound(match.treasure, { ...common, expectedRevision: match.treasure.revision,
      roundNumber: match.roundNumber, combatEndedAtSeconds: game.battle.elapsed,
      chests: (game.battle.objectives || []).map(chest => ({ chestId: chest.id, ownerId: chest.side })),
      verifiedDefeats: game.battle.events.filter(event => event.type === 'treasure-defeated').map(event =>
        ({ chestId: event.chestId, captorPlayerId: event.captorSide, defeatedAtSeconds: event.defeatedAtSeconds })) }));
    const xp = {}, balances = {};
    const zoneGoldEvents = game.battle.events.filter(event => event.type === 'zone-gold');
    demand(match.boardMode === 'zone-defense' || !zoneGoldEvents.length, 'Zone gold belongs only to Zone Defense.');
    const zoneGold = match.boardMode === 'zone-defense' ? ZonePolicy.goldPayouts(game.zoneDefense, zoneGoldEvents) : { player: 0, enemy: 0 };
    for (const side of SIDES) {
      xp[side] = required(Progression.awardCompletedCombat(match.players[side].progression, { ...common, playerId: side,
        expectedRevision: match.players[side].progression.revision, outcome: winnerSide === null ? 'draw' : side === winnerSide ? 'win' : 'loss' }));
      balances[side] = match.players[side].gold + treasure.receipt.payouts.find(payout => payout.playerId === side).gold + zoneGold[side];
      demand(safeGold(balances[side]), 'Gold balance exceeds exact numeric representation.');
    }
    // All pure module transitions have succeeded. Commit their effects together.
    match.health = health.state; match.treasure = treasure.state;
    for (const side of SIDES) { match.players[side].progression = xp[side].state; match.players[side].gold = balances[side]; }
    const receipt = { roundNumber: match.roundNumber, roundId: common.roundId, combatId: common.combatId, result, winnerSide,
      combatEndedAtSeconds: game.battle.elapsed, health: health.receipt, treasure: treasure.receipt,
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
      // Stage every shop return together before any commander receives a new draw.
      // A continuing duel has two living commanders; eight-player elimination
      // uses this same pure pool transition with its full original room roster.
      const enemyFieldIds = new Set(match.game.opponents.map(unit => unit.id));
      const recycled = match.schemaVersion === 2 ? ShopPool.recycleForPreparation(match.shopPool, [
        { playerId: 'player', commanderHP: match.players.player.hp, field: match.game.field, bench: match.game.bench, shop: match.shops.player },
        { playerId: 'enemy', commanderHP: match.players.enemy.hp, field: match.enemyPool.filter(unit => enemyFieldIds.has(unit.id)),
          bench: match.enemyPool.filter(unit => !enemyFieldIds.has(unit.id)), shop: match.shops.enemy }
      ], Engine.ROSTER) : null;
      const income = {};
      for (const side of SIDES) income[side] = required(Income.awardAtPreparationStart(match.players[side].income,
        { matchId: match.matchId, playerId: side, roundId: roundId(match, next), expectedRevision: match.players[side].income.revision,
          carriedGold: match.players[side].gold }));
      for (const side of SIDES) { match.players[side].income = income[side].state; match.players[side].gold = income[side].receipt.resultingGold; }
      match.lastIncome = { player: income.player.receipt, enemy: income.enemy.receipt };
      match.roundNumber = next; match.phase = 'preparation'; Engine.resetBattle(match.game); synchronize(match);
      // Both old shops return before the new preparation draws either side.
      if (recycled) for (const player of recycled.players) match.shops[player.playerId] = player.shop;
      for (const side of SIDES) refreshShop(match, side); prepareAI(match);
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
  function combine(match, heroId, stars) { return preparation(match) ? Engine.combine(match.game, heroId, stars) : fail('Combine heroes during round preparation.'); }
  function validate(match) {
    demand(match && [1, 2].includes(match.schemaVersion) && typeof match.matchId === 'string' && match.matchId.trim(), 'Invalid practice-match schema or identity.');
    demand(match.startingGold === RULES.startingGold && Number.isSafeInteger(match.roundNumber) && match.roundNumber >= 1, 'Invalid starting gold or round number.');
    demand(['preparation', 'combat', 'round-result', 'finished'].includes(match.phase), 'Invalid match phase.');
    Health.validate(match.health); Treasure.validate(match.treasure);
    demand(match.health.matchId === match.matchId && match.treasure.matchId === match.matchId && match.health.startingHP === 100, 'Health and treasure ledgers must belong to this match.');
    demand(match.health.players.map(player => player.playerId).join(',') === SIDES.join(','), 'Commander identities must match their board sides.');
    for (const side of SIDES) {
      const commander = match.players[side]; Progression.validate(commander.progression); Income.validate(commander.income);
      demand(safeGold(commander.gold) && commander.hp === match.health.players.find(player => player.playerId === side).hp, 'Commander gold or carried HP is invalid.');
      for (const ledger of [commander.progression, commander.income]) demand(ledger.matchId === match.matchId && ledger.playerId === side, 'Commander ledgers belong to another match or side.');
      demand(JSON.stringify(commander.progression.xpCosts) === JSON.stringify(Progression.COMMANDER_LEVEL_COSTS), 'Use the approved XP curve.');
      const expectedGold = match.startingGold + commander.income.receipts.reduce((total, receipt) => total + Income.BASE_ROUND_INCOME + receipt.interest, 0)
        + match.treasure.receipts.reduce((total, receipt) => total + receipt.payouts.find(payout => payout.playerId === side).gold, 0)
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
      demand(Array.isArray(match.shops[side]) && match.shops[side].length === RULES.shopSize && Number.isSafeInteger(match.shopDraws[side]) && match.shopDraws[side] >= match.roundNumber, 'Each preparation needs a four-offer shop.');
      for (const offer of match.shops[side].filter(Boolean)) demand(offer.level === 1 && Engine.heroById(offer.heroId).cost === offer.cost && (match.roundNumber > 1 || offer.cost === 1), 'Shop offers must match their approved stars and cost tier.');
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
  return Object.freeze({ RULES, BOARD_MODES, hasBoardMode, boardForLevel, boardModeInfo, validateBoard, createMatch, beginCombat, step, nextRound, buyXP, buyShop, sellHero, saleValue, rerollShop, moveChest, chestPreview,
    deploy, recall, combine, validate, serialize, restore, upgradeLegacy, poolSummary, heroSupply, reference });
});
