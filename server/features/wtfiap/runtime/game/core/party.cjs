/* Authoritative two- or eight-player room coordinator. Persistent armies own canonical
 * lots; battles only clone formations. All old offers and eliminated armies
 * return together before the next draw. Clients receive projections, never the
 * seed, rival shop reservations, raw ledgers or future random draws.
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(
    require('../../source/engine.js'), require('./match.cjs'), require('./progression.cjs'), require('./income.cjs'),
    require('./commander-health.cjs'), require('./treasure.cjs'), require('./chest-health.cjs'), require('./shop-pool.cjs'), require('./party-schedule.cjs'), require('../../source/zone-policy.js'), require('./items.cjs'));
  else root.ABParty = factory(root.AB, root.ABMatch, root.ABProgression, root.ABIncome, root.ABCommanderHealth,
    root.ABTreasure, root.ABChestHealth, root.ABShopPool, root.ABPartySchedule, root.ABZonePolicy, root.ABItems);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine, Match, Progression, Income, Health, Treasure, ChestHealth, ShopPool, Schedule, ZonePolicy, Items) {
  'use strict';
  const RULES = Object.freeze({ playerCount: 8, duelPlayerCount: 2, startingGold: 1, startingHP: 100, shopSize: 4, benchCapacity: 10, rerollCost: 2 });
  const clone = value => JSON.parse(JSON.stringify(value));
  const demand = (value, reason) => { if (!value) throw new Error(reason); };
  const required = result => { demand(result.ok, result.reason || result.error?.message || 'Action rejected.'); return result; };
  const safe = value => Number.isSafeInteger(value) && value >= 0;
  const guarded = action => { try { return action(); } catch (error) { return { ok: false, reason: error.message }; } };
  const identity = value => typeof value === 'string' && value.trim().length > 0;
  const roundId = state => state.matchId + ':round:' + state.roundNumber;
  const itemsOn = state => state.itemRulesVersion === 1;
  const itemRandom = (state, label) => Engine.makeRandom(state.seed + ':items:' + label);
  const alive = state => state.players.filter(player => player.hp > 0);
  const playerFor = (state, id) => { const player = state.players.find(player => player.playerId === id); demand(player, 'Unknown party player.'); return player; };
  const holders = state => state.players.flatMap(player => [...player.field, ...player.bench, ...player.shop.filter(Boolean)]);
  const reference = ChestHealth.createReference(Engine.ROSTER.map(hero => {
    const stats = Engine.deriveStats({ heroId: hero.id, level: 1 }, Engine.synergies([]));
    return { id: hero.id, maxHp: stats.maxHp, armor: stats.armor };
  }));
  function position(board, col, row) {
    demand(Number.isInteger(col) && col >= 0 && col < board.columns && Number.isInteger(row) && row >= board.playerStartRow && row < board.rows,
      'Place this object in your territory.');
  }
  function assertTime(state, atMs) {
    demand(Number.isSafeInteger(atMs) && atMs >= state.lastAdvancedAtMs, 'Use a monotonic authoritative timestamp.');
  }
  function zoneRandom(state, number = state.roundNumber) { return Engine.makeRandom(state.seed + ':zones:' + number); }
  function syncZones(state) {
    if (state.boardMode === 'zone-defense') state.zoneDefense = ZonePolicy.create(state.board, zoneRandom(state));
  }
  function expandBoard(state) {
    const level = Math.max(...alive(state).map(player => player.progression.level));
    const next = Match.boardForLevel(state.boardMode, level), old = state.board;
    // Eliminating the highest-level commander never shrinks a board.
    if (next.columns <= old.columns && next.rows <= old.rows) return;
    demand(next.columns >= old.columns && next.rows >= old.rows, 'Party geometry cannot shrink.');
    const dx = Math.floor(next.columns / 2) - Math.floor(old.columns / 2), dy = next.playerStartRow - old.playerStartRow;
    for (const player of state.players) for (const unit of [...player.field, ...(player.chest ? [player.chest] : []), ...(player.itemChest ? [player.itemChest] : [])]) { unit.col += dx; unit.row += dy; }
    state.board = next;
    syncZones(state);
  }
  function armyGame(state, player) {
    return { token: { config: { benchCapacity: RULES.benchCapacity } }, phase: 'planning', board: state.board,
      playerLevel: player.progression.level, field: clone(player.field), bench: clone(player.bench), mergeSerial: player.mergeSerial };
  }
  function commitArmy(player, game) {
    // Engine merge IDs are local to one army. Prefix each new one with its owner.
    for (const unit of [...game.field, ...game.bench]) if (unit.id.startsWith('merge-')) unit.id = player.playerId + ':' + unit.id;
    player.field = game.field; player.bench = game.bench; player.mergeSerial = game.mergeSerial;
  }
  function refreshShop(state, player) {
    const draw = player.shopDraw;
    demand(Number.isSafeInteger(draw + 1), 'Shop counter exceeds exact numeric representation.');
    let available = ShopPool.available(state.shopPool, state.players.flatMap(other => [...other.field, ...other.bench,
      ...(other === player ? [] : other.shop.filter(Boolean))]));
    const random = Engine.makeRandom(state.seed + ':party-shop:' + player.playerId + ':' + state.roundNumber + ':' + draw);
    const offers = Array.from({ length: RULES.shopSize }, (_, index) => {
      const tiers = Engine.SPAWN_RARITY.costs.filter(tier => (state.roundNumber > 1 || tier.cost === 1) && available.some(lot => lot.cost === tier.cost));
      if (!tiers.length) return null;
      let cost = 1;
      if (state.roundNumber > 1) {
        let threshold = random() * tiers.reduce((sum, tier) => sum + tier.weight, 0); cost = tiers.at(-1).cost;
        for (const tier of tiers) { threshold -= tier.weight; if (threshold < 0) { cost = tier.cost; break; } }
      }
      const lots = available.filter(lot => lot.cost === cost), lot = lots[Math.floor(random() * lots.length)];
      available = available.filter(candidate => candidate.id !== lot.id);
      return { id: roundId(state) + ':shop:' + player.playerId + ':' + draw + ':' + index,
        heroId: lot.heroId, level: 1, cost, lotIds: [lot.id] };
    });
    player.shop = offers; player.shopDraw++;
  }
  function drawAll(state) {
    // Rotate first drawer each round; all old reservations are already gone.
    const players = alive(state), offset = (state.roundNumber - 1) % players.length;
    for (let index = 0; index < players.length; index++) refreshShop(state, players[(index + offset) % players.length]);
  }
  function openPreparation(state, atMs) {
    expandBoard(state);
    syncZones(state);
    state.phase = 'preparation'; state.openedAtMs = atMs; state.lastAdvancedAtMs = atMs;
    state.clock = Schedule.createClock({ roundNumber: state.roundNumber, preparationSeconds: state.preparationSeconds,
      openedAtMs: atMs, playerIds: alive(state).map(player => player.playerId), earlyStart: state.earlyStart });
    state.deadlineAtMs = state.clock.deadlineAtMs; state.combats = []; state.pairings = [];
    for (const player of state.players) { player.ready = false; if (itemsOn(state)) player.itemShop = null; }
    drawAll(state);
    for (const player of alive(state)) {
      if (state.roundNumber >= 5 && !player.chest) {
        const random = Engine.makeRandom(state.seed + ':party-chest:' + player.playerId);
        const cell = Math.floor(random() * state.board.columns * state.board.halfRows);
        player.chest = { col: cell % state.board.columns, row: state.board.playerStartRow + Math.floor(cell / state.board.columns) };
      }
      if (itemsOn(state)) player.itemShop = Items.itemShopRound(state.roundNumber)
        ? { ...Items.shop({ random: itemRandom(state, 'shop:' + state.roundNumber + ':' + player.playerId) }), open: true }
        : null;
      if (itemsOn(state)) {
        player.itemChest = null;
        if (Items.itemChestRound(state.roundNumber)) {
          const random = itemRandom(state, 'chest:' + state.roundNumber + ':' + player.playerId);
          player.itemChest = { col: Math.floor(random() * state.board.columns), row: state.board.rows - 1 - Math.floor(random() * 2) };
          if (player.itemChest.col === player.chest?.col && player.itemChest.row === player.chest?.row)
            player.itemChest.col = (player.itemChest.col + 1) % state.board.columns;
        }
      }
    }
  }
  function createMatch(options) {
    demand(options && identity(options.matchId) && identity(options.seed), 'Match ID and seed are required.');
    demand(Array.isArray(options.players) && [RULES.duelPlayerCount, RULES.playerCount].includes(options.players.length), 'A duel needs two players; a party needs eight.');
    demand(new Set(options.players.map(player => player.playerId)).size === options.players.length, 'Room players must have distinct IDs.');
    const earlyStart = options.preparationSeconds === null;
    demand(options.earlyStart === undefined || options.earlyStart === earlyStart, 'Only untimed rooms start when everyone is ready.');
    demand(options.oddPlayerPolicy === 'round-ai', 'An unmatched commander faces the round AI.');
    demand(options.itemRulesVersion === undefined || options.itemRulesVersion === 1, 'Unknown item rules version.');
    const state = { schemaVersion: 1, matchId: options.matchId, seed: options.seed, boardMode: options.boardMode,
      ...(options.itemRulesVersion === 1 ? { itemRulesVersion: 1, itemReceipts: [] } : {}),
      board: Match.boardForLevel(options.boardMode, 1), preparationSeconds: options.preparationSeconds,
      earlyStart, oddPlayerPolicy: options.oddPlayerPolicy, roundNumber: 1, phase: 'preparation',
      openedAtMs: options.openedAtMs, deadlineAtMs: null, lastAdvancedAtMs: options.openedAtMs, revision: 0,
      shopPool: ShopPool.create(Engine.ROSTER, options.players.length), players: options.players.map(input => {
        demand(identity(input.playerId) && identity(input.name) && typeof input.isAI === 'boolean', 'Every player needs an ID, display name and explicit AI flag.');
        return { playerId: input.playerId, name: input.name, isAI: input.isAI, hp: RULES.startingHP, gold: RULES.startingGold,
          progression: Progression.createProgression({ matchId: options.matchId, playerId: input.playerId, xpCosts: [...Progression.COMMANDER_LEVEL_COSTS] }),
          income: Income.createLedger({ matchId: options.matchId, playerId: input.playerId }), field: [], bench: [], shop: [], shopDraw: 0,
          mergeSerial: 0, chest: null, ready: false, eliminatedRound: null,
          ...(options.itemRulesVersion === 1 ? { items: [], itemShop: null, itemChest: null, winStreak: 0, lossStreak: 0, pendingComponentChoices: 0 } : {}) };
      }), pairings: [], combats: [], receipts: [], shopReceipts: [], actions: [], winnerId: null, lastRecycling: null };
    openPreparation(state, options.openedAtMs); validate(state); return state;
  }
  function buy(state, player, index) {
    demand(!itemsOn(state) || !player.itemShop?.open, 'Choose one item or pass the item shop before recruiting heroes.');
    demand(Number.isInteger(index) && index >= 0 && index < RULES.shopSize, 'Choose a shop slot.');
    const offer = player.shop[index]; demand(offer, 'That shop slot is empty.'); demand(player.gold >= offer.cost, 'Not enough gold.');
    const game = armyGame(state, player), unit = { id: offer.id + ':unit', heroId: offer.heroId, level: 1, lotIds: [...offer.lotIds] };
    game.bench.push(unit); const upgrades = []; let group;
    while ((group = Engine.mergeGroups(game).find(group => group.heroId === offer.heroId))) {
      const combined = required(Engine.combine(game, group.heroId, group.level));
      if (itemsOn(state)) player.items.push(...(combined.overflowItemIds || []));
      upgrades.push(combined.unit.level);
    }
    demand(game.bench.length <= RULES.benchCapacity, 'Make room on the ten-slot bench.');
    const receipt = { kind: 'purchase', playerId: player.playerId, roundNumber: state.roundNumber, offer: clone(offer), goldSpent: offer.cost, goldReceived: 0 };
    player.gold -= offer.cost; player.shop[index] = null; commitArmy(player, game); state.shopReceipts.push(receipt);
    return { receipt, upgrades };
  }
  function saleValue(unit) { const hero = Engine.heroById(unit?.heroId); demand(hero && [1, 2, 3].includes(unit.level), 'Choose an owned hero.'); return hero.cost * 3 ** (unit.level - 1); }
  function sell(state, player, unitId) {
    const unit = [...player.field, ...player.bench].find(unit => unit.id === unitId); demand(unit, 'Choose an owned hero.');
    const goldReceived = saleValue(unit); demand(safe(player.gold + goldReceived), 'Gold exceeds exact numeric representation.');
    player.field = player.field.filter(unit => unit.id !== unitId); player.bench = player.bench.filter(unit => unit.id !== unitId); player.gold += goldReceived;
    if (itemsOn(state)) player.items.push(...(unit.itemIds || []));
    const receipt = { kind: 'sale', playerId: player.playerId, roundNumber: state.roundNumber, unit: clone(unit), goldSpent: 0, goldReceived };
    state.shopReceipts.push(receipt); return { receipt };
  }
  function applyCommand(state, action, atMs) {
    assertTime(state, atMs);
    demand(state.phase === 'preparation' && (state.deadlineAtMs === null || atMs < state.deadlineAtMs), 'The shared preparation window is closed.');
    if (action.expectedRevision !== undefined) demand(action.expectedRevision === state.revision, 'Reload the latest party state before retrying.');
    if (action.roundNumber !== undefined) demand(action.roundNumber === state.roundNumber, 'This command belongs to another round.');
    const player = playerFor(state, action.playerId); demand(player.hp > 0, 'Eliminated commanders cannot change their armies.');
    let result = {};
    if (['buyItem', 'passItemShop', 'chooseComponent', 'equipItem', 'unequipItem'].includes(action.type)) {
      demand(itemsOn(state), 'This room uses its original rules without items.');
      if (action.type === 'buyItem') {
        const item = Items.item(action.itemId), offer = player.itemShop;
        demand(offer?.open, 'This round has no open item shop.');
        demand(item && (Items.isComponent(action.itemId) || offer.completedId === action.itemId), 'This item is not offered.');
        const price = Items.isComponent(action.itemId) ? Items.COMPONENT_PRICE : Items.COMPLETED_PRICE;
        demand(player.gold >= price, 'Not enough gold for this item.');
        player.gold -= price; player.items.push(action.itemId); offer.open = false;
        const receipt = { kind: 'item-purchase', playerId: player.playerId, roundNumber: state.roundNumber,
          itemId: action.itemId, goldSpent: price, goldReceived: 0 };
        state.itemReceipts.push(receipt); result.receipt = receipt;
      } else if (action.type === 'passItemShop') {
        demand(player.itemShop?.open, 'The item shop is closed.'); player.itemShop.open = false;
      } else if (action.type === 'chooseComponent') {
        demand(player.pendingComponentChoices > 0 && Items.isComponent(action.itemId), 'Choose an owed component.');
        player.pendingComponentChoices--; player.items.push(action.itemId);
        state.itemReceipts.push({ kind: 'chest-choice', playerId: player.playerId, roundNumber: state.roundNumber, itemId: action.itemId, goldSpent: 0, goldReceived: 0 });
      } else {
        const unit = [...player.field, ...player.bench].find(unit => unit.id === action.unitId);
        demand(unit, 'Choose an owned hero.');
        unit.itemIds ||= [];
        if (action.type === 'equipItem') {
          const inventoryIndex = player.items.indexOf(action.itemId);
          demand(inventoryIndex >= 0, 'You do not hold that item.');
          demand(!unit.itemIds.includes('lucky-grips+lucky-grips'), 'Trickster Mitts already occupy every item slot.');
          const componentIndex = Items.isComponent(action.itemId)
            ? unit.itemIds.findIndex(id => Items.isComponent(id)) : -1;
          if (componentIndex >= 0) {
            const combined = Items.recipe(unit.itemIds[componentIndex], action.itemId);
            demand(combined, 'These components do not combine.'); unit.itemIds[componentIndex] = combined.id;
            result.combinedItemId = combined.id;
          } else {
            demand(unit.itemIds.length < 3, 'A hero can carry three completed item slots.'); unit.itemIds.push(action.itemId);
          }
          player.items.splice(inventoryIndex, 1);
          if (unit.itemIds.includes('lucky-grips+lucky-grips')) {
            player.items.push(...unit.itemIds.filter(id => id !== 'lucky-grips+lucky-grips'));
            unit.itemIds = ['lucky-grips+lucky-grips'];
          }
        } else {
          const equippedIndex = unit.itemIds.indexOf(action.itemId);
          demand(equippedIndex >= 0, 'That item is not on this hero.');
          player.items.push(unit.itemIds.splice(equippedIndex, 1)[0]);
        }
      }
    }
    else if (action.type === 'buy') result = buy(state, player, action.index);
    else if (action.type === 'sell') result = sell(state, player, action.unitId);
    else if (action.type === 'reroll') {
      demand(!itemsOn(state) || !player.itemShop?.open, 'Choose one item or pass the item shop before refreshing heroes.');
      demand(player.gold >= RULES.rerollCost, 'Refreshing costs two gold.'); refreshShop(state, player); player.gold -= RULES.rerollCost;
      const receipt = { kind: 'reroll', playerId: player.playerId, roundNumber: state.roundNumber, goldSpent: RULES.rerollCost, goldReceived: 0 };
      state.shopReceipts.push(receipt); result.receipt = receipt;
    } else if (action.type === 'buyXP') {
      const purchase = required(Progression.purchaseXP(player.progression, { matchId: state.matchId, playerId: player.playerId,
        expectedRevision: player.progression.revision, purchaseId: roundId(state) + ':xp:' + player.playerId + ':' + player.progression.revision, availableGold: player.gold }));
      player.progression = purchase.state; player.gold = purchase.receipt.resultingGold; expandBoard(state); result.receipt = purchase.receipt;
    } else if (['deploy', 'recall', 'combine'].includes(action.type)) {
      const game = armyGame(state, player);
      if (action.type === 'deploy') required(Engine.deploy(game, action.unitId, action.col, action.row));
      else if (action.type === 'recall') required(Engine.recall(game, action.unitId));
      else {
        const combined = required(Engine.combine(game, action.heroId, action.stars));
        if (itemsOn(state)) player.items.push(...(combined.overflowItemIds || []));
      }
      commitArmy(player, game);
    } else if (action.type === 'moveChest') {
      demand(state.roundNumber >= 5, 'Treasure begins in round five.'); position(state.board, action.col, action.row);
      demand(!player.itemChest || player.itemChest.col !== action.col || player.itemChest.row !== action.row, 'Keep the gold and item chests on separate spaces.');
      player.chest = { col: action.col, row: action.row };
    } else if (action.type === 'moveItemChest') {
      demand(itemsOn(state) && Items.itemChestRound(state.roundNumber) && player.itemChest, 'The item chest appears every ten battles.');
      position(state.board, action.col, action.row);
      demand(action.row >= state.board.rows - 2, 'Place the item chest in your two back rows.');
      demand(!player.chest || player.chest.col !== action.col || player.chest.row !== action.row, 'Keep the gold and item chests on separate spaces.');
      player.itemChest = { col: action.col, row: action.row };
    } else if (action.type === 'ready') {
      demand(typeof action.value === 'boolean', 'Ready must be true or false.'); state.clock = Schedule.setReady(state.clock, player.playerId, action.value, atMs); player.ready = action.value;
    } else throw new Error('Unknown party command.');
    if (action.type !== 'ready' && player.ready) { state.clock = Schedule.setReady(state.clock, player.playerId, false, atMs); player.ready = false; }
    state.lastAdvancedAtMs = atMs; state.revision++;
    state.actions.push({ revision: state.revision, roundNumber: state.roundNumber, atMs, command: clone(action) });
    return { ok: true, ...result };
  }
  function command(state, action, atMs) {
    // All mutations occur on a staged JSON snapshot. Rejected purchases or stale
    // commands never consume gold, shop reservations, readiness or random draws.
    return guarded(() => {
      validate(state); const next = clone(state), result = applyCommand(next, clone(action), atMs); validate(next); Object.assign(state, next); return result;
    });
  }
  function prepareAI(state, playerId, atMs = state.lastAdvancedAtMs) {
    return guarded(() => {
      const player = playerFor(state, playerId); demand(player.isAI && player.hp > 0, 'Choose an active AI commander.');
      if (itemsOn(state)) {
        while (playerFor(state, playerId).pendingComponentChoices > 0) {
          const random = itemRandom(state, 'ai-choice:' + state.roundNumber + ':' + playerId + ':' + playerFor(state, playerId).pendingComponentChoices);
          required(command(state, { type: 'chooseComponent', playerId,
            itemId: Items.componentIds[Math.floor(random() * Items.componentIds.length)] }, atMs));
        }
        const shopper = playerFor(state, playerId);
        if (shopper.itemShop?.open) {
          const offer = shopper.itemShop.completedId && shopper.gold >= Items.COMPLETED_PRICE
            ? shopper.itemShop.completedId : shopper.gold >= Items.COMPONENT_PRICE
              ? Items.componentIds[Math.floor(itemRandom(state, 'ai-shop:' + state.roundNumber + ':' + playerId)() * Items.componentIds.length)] : null;
          required(command(state, offer ? { type: 'buyItem', playerId, itemId: offer } : { type: 'passItemShop', playerId }, atMs));
        }
      }
      const deployNext = () => {
        const current = playerFor(state, playerId);
        while (current.bench.length && current.field.length < current.progression.fieldCapacity) {
          const cells = Array.from({ length: state.board.columns * state.board.halfRows }, (_, index) => ({ col: index % state.board.columns,
            row: state.board.playerStartRow + Math.floor(index / state.board.columns) }));
          const cell = cells.find(cell => !current.field.some(unit => unit.col === cell.col && unit.row === cell.row)); if (!cell) break;
          required(applyCommand(state, { type: 'deploy', playerId, unitId: current.bench[0].id, ...cell }, atMs));
        }
      };
      deployNext();
      for (let index = 0; index < RULES.shopSize; index++) { const current = playerFor(state, playerId), offer = current.shop[index];
        if (offer && offer.cost <= current.gold) { const bought = command(state, { type: 'buy', playerId, index }, atMs); if (bought.ok) deployNext(); }
      }
      if (itemsOn(state)) {
        while (playerFor(state, playerId).items.length) {
          const current = playerFor(state, playerId);
          const candidate = [...current.field, ...current.bench]
            .filter(unit => !unit.itemIds?.includes('lucky-grips+lucky-grips') && (unit.itemIds?.length || 0) < 3)
            .sort((a, b) => Engine.heroById(b.heroId).cost - Engine.heroById(a.heroId).cost || b.level - a.level || a.id.localeCompare(b.id))[0];
          if (!candidate) break;
          const itemId = current.items[0];
          required(command(state, { type: 'equipItem', playerId, unitId: candidate.id, itemId }, atMs));
        }
      }
      required(command(state, { type: 'ready', playerId, value: true }, atMs)); return { ok: true };
    });
  }
  function createRoundAI(state, pair) {
    // An independent virtual commander advances through the same economy and
    // shop rules once per elapsed round. Its base combat XP is two each round;
    // no wins, bonus XP, free heroes or additional balance constants are assumed.
    // Its practice catalog is separate from the competitive room's 699 lots.
    const matchId = state.matchId + ':neutral:' + pair.playerId, playerId = pair.enemyId;
    const npc = { playerId, name: 'Round ' + state.roundNumber + ' Challenger', isAI: true, hp: RULES.startingHP,
      gold: RULES.startingGold, progression: Progression.createProgression({ matchId, playerId, xpCosts: [...Progression.COMMANDER_LEVEL_COSTS] }),
      income: Income.createLedger({ matchId, playerId }), field: [], bench: [], shop: [], shopDraw: 0, mergeSerial: 0,
      chest: null, ready: true, eliminatedRound: null };
    const virtual = { matchId, seed: state.seed + ':round-ai:' + pair.playerId, boardMode: state.boardMode,
      board: Match.boardForLevel(state.boardMode, 1), roundNumber: 1, players: [npc], shopPool: ShopPool.create(Engine.ROSTER, 2), shopReceipts: [] };
    function field() {
      while (npc.bench.length && npc.field.length < npc.progression.fieldCapacity) {
        const cells = Array.from({ length: virtual.board.columns * virtual.board.halfRows }, (_, index) => ({
          col: index % virtual.board.columns, row: virtual.board.playerStartRow + Math.floor(index / virtual.board.columns) }));
        const cell = cells.find(cell => !npc.field.some(unit => unit.col === cell.col && unit.row === cell.row)); if (!cell) break;
        const game = armyGame(virtual, npc); required(Engine.deploy(game, npc.bench[0].id, cell.col, cell.row)); commitArmy(npc, game);
      }
    }
    for (let round = 1; round <= state.roundNumber; round++) {
      if (round > 1) {
        npc.progression = required(Progression.awardCompletedCombat(npc.progression, { matchId, playerId,
          expectedRevision: npc.progression.revision, roundId: matchId + ':round:' + (round - 1),
          combatId: matchId + ':combat:' + (round - 1), status: 'completed', outcome: 'draw' })).state;
        const income = required(Income.awardAtPreparationStart(npc.income, { matchId, playerId, expectedRevision: npc.income.revision,
          roundId: matchId + ':round:' + round, carriedGold: npc.gold }));
        npc.income = income.state; npc.gold = income.receipt.resultingGold;
      }
      virtual.roundNumber = round; expandBoard(virtual); npc.shop = []; refreshShop(virtual, npc); field();
      for (let index = 0; index < RULES.shopSize; index++) if (npc.shop[index] && npc.shop[index].cost <= npc.gold) {
        const result = guarded(() => buy(virtual, npc, index)); if (result.ok !== false) field();
      }
    }
    const dx = Math.floor(state.board.columns / 2) - Math.floor(virtual.board.columns / 2), dy = state.board.playerStartRow - virtual.board.playerStartRow;
    for (const unit of npc.field) { unit.col += dx; unit.row += dy; position(state.board, unit.col, unit.row); }
    npc.shop = []; // The encounter is a formation, not a second player shop.
    if (state.roundNumber >= 5) {
      const random = Engine.makeRandom(virtual.seed + ':chest'), cell = Math.floor(random() * state.board.columns * state.board.halfRows);
      npc.chest = { col: cell % state.board.columns, row: state.board.playerStartRow + Math.floor(cell / state.board.columns) };
    }
    if (itemsOn(state) && Items.itemChestRound(state.roundNumber)) {
      const random = itemRandom(state, 'round-ai-chest:' + pair.playerId + ':' + state.roundNumber);
      npc.itemChest = { col: Math.floor(random() * state.board.columns), row: state.board.rows - 1 - Math.floor(random() * 2) };
      if (npc.itemChest.col === npc.chest?.col && npc.itemChest.row === npc.chest?.row)
        npc.itemChest.col = (npc.itemChest.col + 1) % state.board.columns;
    }
    return npc;
  }
  function chestConfig(state, pair, game, npc) {
    if (state.roundNumber < 5) return { roundNumber: state.roundNumber, chests: [] };
    const chests = ['player', 'enemy'].map(side => {
      const player = side === 'enemy' && npc ? npc : playerFor(state, side === 'player' ? pair.playerId : pair.enemyId), units = side === 'player' ? game.field : game.opponents;
      const health = units.length ? ChestHealth.calculateChestHealth(reference, units.map(unit => unit.heroId)) : null;
      const chest = player.chest;
      return { id: pair.id + ':chest:' + side, side, col: side === 'player' ? chest.col : state.board.columns - 1 - chest.col,
        row: side === 'player' ? chest.row : state.board.rows - 1 - chest.row, maxHp: health?.maxHp ?? null };
    });
    if (itemsOn(state) && Items.itemChestRound(state.roundNumber)) for (const side of ['player', 'enemy']) {
      const player = side === 'enemy' && npc ? npc : playerFor(state, side === 'player' ? pair.playerId : pair.enemyId);
      const chest = player.itemChest || player.chest;
      chests.push({ id: pair.id + ':item-chest:' + side, kind: 'item', side,
        col: side === 'player' ? chest.col : state.board.columns - 1 - chest.col,
        row: side === 'player' ? chest.row : state.board.rows - 1 - chest.row,
        maxHp: chests.find(entry => entry.side === side).maxHp });
    }
    return { roundNumber: state.roundNumber, ...(itemsOn(state) ? { itemRulesVersion: 1 } : {}), chests };
  }
  function makeCombat(state, pair) {
    const npc = pair.isRoundAI ? createRoundAI(state, pair) : null;
    const a = playerFor(state, pair.playerId), b = npc || playerFor(state, pair.enemyId), combatSeed = state.seed + ':' + roundId(state) + ':' + pair.id;
    const token = { version: 5, config: { ...Engine.DEFAULT_CONFIG, benchCapacity: RULES.benchCapacity }, playerLevel: a.progression.level,
      board: clone(state.board), bench: [], opponents: [], battleSeed: combatSeed };
    const game = Engine.createGame(token); if (itemsOn(state)) game.itemRulesVersion = 1;
    game.field = clone(a.field).map(unit => ({ ...unit, id: 'player:' + unit.id }));
    if (state.boardMode === 'zone-defense') game.zoneDefense = clone(state.zoneDefense);
    game.opponents = clone(b.field).map(unit => ({ ...unit, id: 'enemy:' + unit.id, col: state.board.columns - 1 - unit.col, row: state.board.rows - 1 - unit.row }));
    const config = chestConfig(state, pair, game, npc), initial = clone(game);
    const instant = !game.field.length || !game.opponents.length;
    if (instant) {
      game.phase = 'finished'; game.result = game.field.length ? 'victory' : game.opponents.length ? 'defeat' : 'draw';
      game.battle = { units: Engine.previewCombatUnits(game), elapsed: 0, tick: 0, accumulator: 0,
        events: [{ type: 'result', result: game.result, at: 0 }], objectives: [] };
    } else required(Engine.startBattle(game, config));
    return { pair: clone(pair), initial, config, instant, game, npc }; 
  }
  function beginCombat(state, atMs) {
    state.pairings = Schedule.pair({ playerIds: alive(state).map(player => player.playerId), seed: state.seed,
      roundNumber: state.roundNumber, history: state.receipts.map(receipt => ({ roundNumber: receipt.roundNumber, pairings: receipt.pairings })), oddPlayerPolicy: state.oddPlayerPolicy });
    state.combats = state.pairings.filter(pair => pair.enemyId !== null).map(pair => makeCombat(state, pair));
    state.phase = 'combat'; state.combatStartedAtMs = atMs; state.lastAdvancedAtMs = atMs; state.revision++;
  }
  function receiptFor(state, combat) {
    const { game, pair } = combat, winnerSide = game.result === 'victory' ? 'player' : game.result === 'defeat' ? 'enemy' : null;
    const sideId = side => side === 'player' ? pair.playerId : pair.enemyId;
    const survivors = game.battle.units.filter(unit => unit.alive && unit.hp > 0 && !unit.temporary).map(unit => {
      demand(unit.side === winnerSide, 'Only the winning side may have survivors.');
      const hero = { stars: unit.level, cost: Engine.heroById(unit.heroId).cost, hp: unit.hp, maxHp: unit.maxHp };
      return { unitId: unit.id, heroId: unit.heroId, ...hero, damage: Health.calculateHeroDamage(hero) };
    });
    const damage = survivors.reduce((sum, unit) => sum + unit.damage, 0), combatId = roundId(state) + ':' + pair.id;
    const treasure = required(Treasure.settleRound(Treasure.createLedger({ matchId: state.matchId, playerIds: [sideId('player'), sideId('enemy')] }), {
      matchId: state.matchId, roundId: roundId(state), roundNumber: state.roundNumber, combatId, expectedRevision: 0, status: 'completed',
      combatEndedAtSeconds: game.battle.elapsed, chests: combat.config.chests.filter(chest => chest.kind !== 'item').map(chest => ({ chestId: chest.id, ownerId: sideId(chest.side) })),
      verifiedDefeats: game.battle.events.filter(event => event.type === 'treasure-defeated' && !combat.config.chests.some(chest => chest.id === event.chestId && chest.kind === 'item')).map(event => ({ chestId: event.chestId,
        captorPlayerId: sideId(event.captorSide), defeatedAtSeconds: event.defeatedAtSeconds })) })).receipt;
    const itemChestCaptures = itemsOn(state) ? game.battle.events.filter(event => event.type === 'treasure-defeated' &&
      combat.config.chests.some(chest => chest.id === event.chestId && chest.kind === 'item') &&
      event.defeatedAtSeconds < state.roundNumber * 15 && event.defeatedAtSeconds <= game.battle.elapsed)
      .map(event => ({ chestId: event.chestId, captorPlayerId: sideId(event.captorSide) })) : [];
    const zoneGoldEvents = game.battle.events.filter(event => event.type === 'zone-gold');
    demand(state.boardMode === 'zone-defense' || !zoneGoldEvents.length, 'Zone gold belongs only to Zone Defense.');
    const zoneGold = state.boardMode === 'zone-defense' ? ZonePolicy.goldPayouts(game.zoneDefense, zoneGoldEvents) : { player: 0, enemy: 0 };
    const awards = ['player', ...(pair.isRoundAI ? [] : ['enemy'])].map(side => {
      const player = playerFor(state, sideId(side)), outcome = winnerSide === null ? 'draw' : side === winnerSide ? 'win' : 'loss';
      const hpAfter = outcome === 'loss' ? Math.max(0, player.hp - damage) : player.hp;
      const xp = required(Progression.awardCompletedCombat(player.progression, { matchId: state.matchId, playerId: player.playerId,
        expectedRevision: player.progression.revision, roundId: roundId(state), combatId, status: 'completed', outcome }));
      return { playerId: player.playerId, outcome, hpBefore: player.hp, hpAfter, damage: player.hp - hpAfter, xp,
        ...(state.boardMode === 'zone-defense' ? { zoneGold: zoneGold[side] } : {}),
        treasureGold: treasure.payouts.find(payout => payout.playerId === player.playerId).gold };
    });
    return { pair: clone(pair), combatId, result: game.result, elapsedSeconds: game.battle.elapsed, survivors, treasure, awards,
      ...(itemsOn(state) ? { itemChestCaptures } : {}),
      ...(state.boardMode === 'zone-defense' ? { zoneGoldEvents: clone(zoneGoldEvents) } : {}),
      replay: { initial: clone(combat.initial), config: clone(combat.config), instant: combat.instant, ticks: game.battle.tick, result: game.result } };
  }
  function settleRound(state, atMs) {
    const results = state.combats.map(combat => receiptFor(state, combat)), awards = results.flatMap(result => result.awards);
    demand(new Set(awards.map(award => award.playerId)).size === awards.length, 'Each commander settles once per round.');
    for (const award of awards) {
      const player = playerFor(state, award.playerId), goldAward = award.treasureGold + (award.zoneGold ?? 0); demand(safe(player.gold + goldAward), 'Gold exceeds exact numeric representation.');
      player.hp = award.hpAfter; player.gold += goldAward; player.progression = award.xp.state;
      if (itemsOn(state)) {
        const previousStreak = award.outcome === 'win' ? player.winStreak : player.lossStreak;
        const drop = Items.reward({ outcome: award.outcome, previousStreak,
          random: itemRandom(state, 'drop:' + state.roundNumber + ':' + player.playerId) });
        if (drop.itemId) player.items.push(drop.itemId);
        player.winStreak = award.outcome === 'win' ? previousStreak + 1 : 0;
        player.lossStreak = award.outcome === 'loss' ? previousStreak + 1 : 0;
        const itemReceipt = { kind: 'battle-drop', playerId: player.playerId, roundNumber: state.roundNumber,
          outcome: award.outcome, priorStreak: previousStreak, chance: drop.chance, roll: drop.roll,
          itemId: drop.itemId, goldSpent: 0, goldReceived: 0 };
        state.itemReceipts.push(itemReceipt); award.itemDrop = drop.itemId;
      }
      if (!player.hp) player.eliminatedRound = state.roundNumber;
    }
    if (itemsOn(state)) for (const result of results) for (const capture of result.itemChestCaptures) {
      const captor = state.players.find(player => player.playerId === capture.captorPlayerId);
      if (!captor) continue; // Round AI cannot own a competitive inventory.
      captor.pendingComponentChoices++;
      state.itemReceipts.push({ kind: 'item-chest-capture', playerId: captor.playerId, roundNumber: state.roundNumber,
        chestId: capture.chestId, goldSpent: 0, goldReceived: 0 });
    }
    const receipt = { roundNumber: state.roundNumber, pairings: clone(state.pairings), startedAtMs: state.combatStartedAtMs,
      settledAtMs: atMs, results: results.map(result => ({ ...result, awards: result.awards.map(award => ({ ...award, xp: award.xp.receipt })) })) };
    state.receipts.push(receipt); state.revision++;
    if (alive(state).length <= 1) { state.phase = 'finished'; state.winnerId = alive(state)[0]?.playerId ?? null; return; }
    const recycled = ShopPool.recycleForPreparation(state.shopPool, state.players.map(player => ({ playerId: player.playerId,
      commanderHP: player.hp, field: player.field, bench: player.bench, shop: player.shop })), Engine.ROSTER);
    state.lastRecycling = { beforeRound: state.roundNumber + 1, releasedLotIds: recycled.releasedLotIds };
    for (const returned of recycled.players) Object.assign(playerFor(state, returned.playerId), { field: returned.field, bench: returned.bench, shop: returned.shop });
    state.roundNumber++; demand(safe(state.roundNumber), 'Round number exceeds exact numeric representation.');
    for (const player of alive(state)) {
      const income = required(Income.awardAtPreparationStart(player.income, { matchId: state.matchId, playerId: player.playerId,
        expectedRevision: player.income.revision, roundId: roundId(state), carriedGold: player.gold }));
      player.income = income.state; player.gold = income.receipt.resultingGold;
    }
    openPreparation(state, atMs);
  }
  function advance(state, atMs) {
    return guarded(() => {
      assertTime(state, atMs); const events = []; let changed = false;
      if (state.phase === 'preparation' && Schedule.shouldStart(state.clock, atMs)) {
        // Use the actual authoritative opening time for the next phase. A server
        // returning after an outage never consumes another preparation offline.
        beginCombat(state, atMs); changed = true; events.push({ type: 'combat-started', roundNumber: state.roundNumber });
      }
      if (state.phase === 'combat') {
        const seconds = (atMs - state.lastAdvancedAtMs) / 1000;
        for (const combat of state.combats) Engine.step(combat.game, seconds);
        changed ||= seconds > 0; if (seconds > 0) state.revision++; state.lastAdvancedAtMs = atMs;
        if (state.combats.every(combat => combat.game.phase === 'finished')) { settleRound(state, atMs); changed = true;
          events.push({ type: state.phase === 'finished' ? 'match-finished' : 'preparation-opened', roundNumber: state.roundNumber }); }
      }
      if (state.phase === 'preparation') state.lastAdvancedAtMs = atMs;
      return { ok: true, changed, events };
    });
  }
  function nextWakeAtMs(state) {
    if (state.phase === 'finished') return null;
    if (state.phase === 'preparation') return Schedule.shouldStart(state.clock, state.lastAdvancedAtMs) ? state.lastAdvancedAtMs : state.deadlineAtMs;
    return state.lastAdvancedAtMs + Engine.FIXED_STEP * 1000;
  }
  function publicUnit(unit) { const { lotIds, ...publicData } = unit; return publicData; }
  function view(state, playerId) {
    const own = playerFor(state, playerId), publicPlayer = player => ({ playerId: player.playerId, name: player.name, isAI: player.isAI,
      hp: player.hp, gold: player.gold, level: player.progression.level, fieldCapacity: player.progression.fieldCapacity,
      xpIntoLevel: player.progression.xpIntoLevel, xpToNext: Progression.COMMANDER_LEVEL_COSTS[player.progression.level - 1] ?? null,
      totalEarnedXP: player.progression.totalEarnedXP, field: player.field.map(publicUnit), bench: player.bench.map(publicUnit),
      ready: player.ready, chest: player.chest, ...(itemsOn(state) ? { itemChest: player.itemChest } : {}), chestMaxHp: player.field.length ? ChestHealth.calculateChestHealth(reference, player.field.map(unit => unit.heroId)).maxHp : null, eliminatedRound: player.eliminatedRound,
      ...(itemsOn(state) ? { itemCount: player.items.length, winStreak: player.winStreak, lossStreak: player.lossStreak } : {}) });
    const combat = state.combats.find(combat => combat.pair.playerId === playerId || (!combat.pair.isRoundAI && combat.pair.enemyId === playerId));
    const owned = state.players.flatMap(player => [...player.field, ...player.bench]);
    const supply = Engine.ROSTER.map(hero => ({ heroId: hero.id, total: state.shopPool.copiesByCost[hero.cost],
      owned: owned.filter(unit => unit.heroId === hero.id).reduce((sum, unit) => sum + unit.lotIds.length, 0),
      you: [...own.field, ...own.bench].filter(unit => unit.heroId === hero.id).reduce((sum, unit) => sum + unit.lotIds.length, 0) }));
    const last = state.receipts.at(-1), terms = Treasure.calculateRoundTerms(state.roundNumber);
    const battle = combat ? { ...combat.game.battle, units: combat.game.battle.units.map(publicUnit) } : null;
    return clone({ schemaVersion: state.schemaVersion, matchId: state.matchId, revision: state.revision, roundNumber: state.roundNumber,
      phase: state.phase, boardMode: state.boardMode, board: state.board, ...(itemsOn(state) ? { itemRulesVersion: 1, itemCatalog: { components: Items.COMPONENTS, recipes: Items.RECIPES } } : {}), ...(state.zoneDefense ? { zoneDefense: state.zoneDefense } : {}), selfId: playerId, preparationSeconds: state.preparationSeconds,
      earlyStart: state.earlyStart, oddPlayerPolicy: state.oddPlayerPolicy, openedAtMs: state.openedAtMs, deadlineAtMs: state.deadlineAtMs,
      serverTimeMs: state.lastAdvancedAtMs, winnerId: state.winnerId, players: state.players.map(publicPlayer),
      treasure: { enabled: terms.enabled, goldPerChest: terms.goldPerChest, expiresAtSeconds: terms.treasureWindowSeconds },
      self: { ...publicPlayer(own), shop: own.shop.map(offer => offer ? publicUnit(offer) : null),
        ...(itemsOn(state) ? { items: own.items, itemShop: own.itemShop, pendingComponentChoices: own.pendingComponentChoices } : {}) }, supply, pairings: state.pairings,
      combat: combat ? { pair: combat.pair, enemyPlayer: combat.npc ? publicPlayer(combat.npc) : null, board: combat.game.board,
        ...(combat.game.zoneDefense ? { zoneDefense: combat.game.zoneDefense } : {}), phase: combat.game.phase, result: combat.game.result, battle } : null,
      lastRound: last ? { roundNumber: last.roundNumber, pairings: last.pairings, results: last.results.map(result => ({ pair: result.pair,
        result: result.result, elapsedSeconds: result.elapsedSeconds, awards: result.awards.map(award => ({ playerId: award.playerId,
          outcome: award.outcome, damage: award.damage, hpAfter: award.hpAfter, treasureGold: award.treasureGold,
          ...(award.zoneGold !== undefined ? { zoneGold: award.zoneGold } : {}), ...(itemsOn(state) ? { itemDrop: award.itemDrop || null } : {}), xpGranted: award.xp.xpGranted })) })) } : null });
  }
  function validate(state) {
    demand(state && state.schemaVersion === 1 && identity(state.matchId) && identity(state.seed), 'Invalid party identity.');
    demand([RULES.duelPlayerCount, RULES.playerCount].includes(state.players.length) && new Set(state.players.map(player => player.playerId)).size === state.players.length, 'A room retains its original players.');
    demand(state.itemRulesVersion === undefined || state.itemRulesVersion === 1, 'Invalid item rules version.');
    if (itemsOn(state)) demand(Array.isArray(state.itemReceipts), 'Item receipts are required.');
    demand(state.shopPool.playerCount === state.players.length, 'Room supply must match its original player count.'); ShopPool.validate(state.shopPool, holders(state), Engine.ROSTER);
    demand(['preparation', 'combat', 'finished'].includes(state.phase) && safe(state.revision) && safe(state.roundNumber) && state.roundNumber > 0, 'Invalid party phase or round.');
    demand(state.earlyStart === (state.preparationSeconds === null) && state.oddPlayerPolicy === 'round-ai', 'Invalid party policies.');
    Schedule.validateClock(state.clock);
    demand(state.clock.roundNumber === state.roundNumber && state.clock.preparationSeconds === state.preparationSeconds &&
      state.clock.openedAtMs === state.openedAtMs && state.clock.deadlineAtMs === state.deadlineAtMs && state.clock.earlyStart === state.earlyStart, 'Clock must belong to the active party round.');
    if (state.phase !== 'finished') demand(JSON.stringify(state.clock.playerIds) === JSON.stringify(alive(state).map(player => player.playerId)) &&
      state.players.every(player => player.ready === state.clock.readyPlayerIds.includes(player.playerId)), 'Clock readiness must match surviving commanders.');
    Match.validateBoard(state.boardMode, state.board);
    if (state.boardMode === 'zone-defense') ZonePolicy.validate(state.zoneDefense, state.board, zoneRandom(state));
    else demand(state.zoneDefense === undefined, 'Zone bonuses belong only to Zone Defense.');
    const unitIds = new Set();
    for (const player of state.players) {
      demand(identity(player.playerId) && identity(player.name) && typeof player.isAI === 'boolean' && safe(player.hp) && player.hp <= RULES.startingHP && safe(player.gold), 'Invalid commander.');
      Progression.validate(player.progression); Income.validate(player.income);
      demand(player.progression.matchId === state.matchId && player.progression.playerId === player.playerId && player.income.matchId === state.matchId && player.income.playerId === player.playerId, 'Commander ledgers belong to another player.');
      demand(JSON.stringify(player.progression.xpCosts) === JSON.stringify(Progression.COMMANDER_LEVEL_COSTS), 'Use the approved commander XP curve.');
      demand(player.bench.length <= RULES.benchCapacity && player.field.length <= player.progression.fieldCapacity && player.shop.length === RULES.shopSize, 'Army or shop capacity exceeded.');
      demand(safe(player.shopDraw) && safe(player.mergeSerial), 'Invalid army/shop counters.');
      if (itemsOn(state)) {
        demand(Array.isArray(player.items) && player.items.every(Items.isItem), 'Inventory contains an unknown item.');
        demand(safe(player.winStreak) && safe(player.lossStreak) && !(player.winStreak && player.lossStreak)
          && safe(player.pendingComponentChoices), 'Invalid item streak or pending choice.');
        demand(player.itemShop === null || Items.itemShopRound(state.roundNumber) &&
          Array.isArray(player.itemShop.componentIds) && JSON.stringify(player.itemShop.componentIds) === JSON.stringify(Items.componentIds) &&
          (player.itemShop.completedId === null || Items.item(player.itemShop.completedId)?.kind === 'completed') &&
          typeof player.itemShop.open === 'boolean', 'Invalid item shop.');
      }
      for (const unit of [...player.field, ...player.bench]) { demand(identity(unit.id) && !unitIds.has(unit.id) && Engine.heroById(unit.heroId), 'Owned unit IDs must be unique.'); unitIds.add(unit.id); }
      if (itemsOn(state)) for (const unit of [...player.field, ...player.bench]) demand(!unit.itemIds ||
        Array.isArray(unit.itemIds) && unit.itemIds.length <= 3 && unit.itemIds.every(Items.isItem) &&
        (!unit.itemIds.includes('lucky-grips+lucky-grips') || unit.itemIds.length === 1), 'Invalid equipped items.');
      for (const unit of player.field) position(state.board, unit.col, unit.row);
      demand(new Set(player.field.map(unit => unit.col + ':' + unit.row)).size === player.field.length, 'Starting hero cells must be distinct.');
      if (player.chest) position(state.board, player.chest.col, player.chest.row);
      if (itemsOn(state) && player.itemChest) {
        position(state.board, player.itemChest.col, player.itemChest.row);
        demand(player.itemChest.row >= state.board.rows - 2, 'Item chest belongs in the two back rows.');
      }
      for (const offer of player.shop.filter(Boolean)) demand(offer.level === 1 && Engine.heroById(offer.heroId).cost === offer.cost && (state.roundNumber !== 1 || offer.cost === 1), 'Invalid shop offer.');
      let hp = RULES.startingHP, treasureGold = 0, zoneGold = 0, combatCount = 0;
      for (const round of state.receipts) for (const result of round.results) for (const award of result.awards.filter(award => award.playerId === player.playerId)) {
        demand(award.hpBefore === hp && award.hpAfter === Math.max(0, hp - award.damage), 'Commander HP must carry between completed combats.'); hp = award.hpAfter; treasureGold += award.treasureGold; zoneGold += award.zoneGold ?? 0; combatCount++;
      }
      demand(hp === player.hp && player.progression.receipts.filter(receipt => receipt.kind === 'combat').length === combatCount, 'Combat progression or HP history differs.');
      const gold = RULES.startingGold + player.income.receipts.reduce((sum, receipt) => sum + Income.BASE_ROUND_INCOME + receipt.interest, 0) + treasureGold + zoneGold
        - player.progression.receipts.filter(receipt => receipt.kind === 'purchase').reduce((sum, receipt) => sum + receipt.goldSpent, 0)
        + state.shopReceipts.filter(receipt => receipt.playerId === player.playerId).reduce((sum, receipt) => sum + receipt.goldReceived - receipt.goldSpent, 0)
        - (itemsOn(state) ? state.itemReceipts.filter(receipt => receipt.playerId === player.playerId).reduce((sum, receipt) => sum + receipt.goldSpent, 0) : 0);
      demand(gold === player.gold, 'Gold must follow income, treasure and transactions.');
    }
    for (const [index, receipt] of state.receipts.entries()) {
      demand(receipt.roundNumber === index + 1, 'Party rounds settle once in order.');
      for (const result of receipt.results) {
        if (state.boardMode === 'zone-defense') {
          const assignment = ZonePolicy.create(result.replay.initial.board, zoneRandom(state, receipt.roundNumber));
          ZonePolicy.validate(result.replay.initial.zoneDefense, result.replay.initial.board, zoneRandom(state, receipt.roundNumber));
          demand(Array.isArray(result.zoneGoldEvents), 'Zone Defense must retain verified zone awards.');
          const paid = ZonePolicy.goldPayouts(assignment, result.zoneGoldEvents);
          for (const award of result.awards) demand(award.zoneGold === paid[award.playerId === result.pair.playerId ? 'player' : 'enemy'], 'Zone gold receipts must match verified awards.');
        } else demand(result.zoneGoldEvents === undefined && result.awards.every(award => award.zoneGold === undefined), 'Zone gold belongs only to Zone Defense.');
      }
    }
    demand(state.receipts.length === state.roundNumber - (state.phase === 'finished' ? 0 : 1), 'Completed rounds must match the active phase.');
    if (state.phase === 'finished') demand(alive(state).length <= 1 && state.winnerId === (alive(state)[0]?.playerId ?? null), 'Terminal winner must be the surviving commander.');
    else demand(alive(state).length > 1 && state.winnerId === null, 'An active party needs at least two surviving commanders.');
    demand(state.preparationSeconds === null ? state.deadlineAtMs === null : state.deadlineAtMs === state.openedAtMs + state.preparationSeconds * 1000 && Number.isSafeInteger(state.deadlineAtMs), 'Preparation uses its room deadline or the untimed ready rule.');
    return true;
  }
  function serialize(state) {
    validate(state);
    return JSON.stringify({ ...state, combats: state.combats.map(combat => ({ ...combat, game: null,
      replay: { ticks: combat.game.battle.tick, accumulator: combat.game.battle.accumulator, phase: combat.game.phase, result: combat.game.result } })) });
  }
  function restore(serialized) {
    const state = JSON.parse(serialized);
    state.combats = state.combats.map(saved => {
      const combat = { ...saved, game: clone(saved.initial) }; delete combat.replay;
      if (saved.instant) {
        combat.game.phase = 'finished'; combat.game.result = saved.replay.result;
        combat.game.battle = { units: Engine.previewCombatUnits(combat.game), elapsed: 0, tick: 0, accumulator: 0,
          events: [{ type: 'result', result: saved.replay.result, at: 0 }], objectives: [] };
      } else {
        required(Engine.startBattle(combat.game, saved.config));
        demand(safe(saved.replay.ticks), 'Invalid replay tick count.');
        for (let tick = 0; tick < saved.replay.ticks; tick++) Engine.step(combat.game, Engine.FIXED_STEP);
        demand(combat.game.battle.tick === saved.replay.ticks && combat.game.phase === saved.replay.phase && combat.game.result === saved.replay.result, 'Saved party battle does not replay.');
        combat.game.battle.accumulator = saved.replay.accumulator;
      }
      return combat;
    });
    validate(state); return state;
  }
  return Object.freeze({ RULES, createMatch, command, advance, view, serialize, restore, validate, prepareAI, saleValue, nextWakeAtMs });
});
