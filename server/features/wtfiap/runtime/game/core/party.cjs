/* Authoritative two- or eight-player room coordinator. Persistent armies own canonical
 * lots; battles only clone formations. All old offers and eliminated armies
 * return together before the next draw. Clients receive projections, never the
 * seed, rival shop reservations, raw ledgers or future random draws.
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(
    require('../../source/engine.js'), require('./match.cjs'), require('./progression.cjs'), require('./income.cjs'),
    require('./commander-health.cjs'), require('./treasure.cjs'), require('./chest-health.cjs'), require('./shop-pool.cjs'), require('./party-schedule.cjs'), require('../../source/zone-policy.js'), require('./items.cjs'), require('./fortunes.cjs'));
  else root.ABParty = factory(root.AB, root.ABMatch, root.ABProgression, root.ABIncome, root.ABCommanderHealth,
    root.ABTreasure, root.ABChestHealth, root.ABShopPool, root.ABPartySchedule, root.ABZonePolicy, root.ABItems, root.ABFortunes);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine, Match, Progression, Income, Health, Treasure, ChestHealth, ShopPool, Schedule, ZonePolicy, Items, Fortunes) {
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
  const cherubsOn = state => state.cherubRulesVersion === 1;
  const balanceOn = state => state.balanceVersion === 1;
  const shopLockOn = state => state.shopLockRulesVersion === 1;
  const encountersOn = state => state.encounterRulesVersion === 1;
  const encounterRound = state => encountersOn(state) && state.roundNumber % 5 === 0;
  const draftOn = state => state.draftRulesVersion === 1;
  const draftRound = state => draftOn(state) && state.roundNumber % 4 === 0;
  const plansOn = state => state.planRulesVersion === 1;
  const fortunesOn = state => state.fortuneRulesVersion === 1;
  const fortunePrice = (state, id) => Fortunes.priceFor(id, state.fortunePricingVersion);
  const treasureOn = state => state.treasureEnabled !== false;
  const zonesOn = state => state.boardMode === 'zone-defense' && state.zoneBonusesEnabled !== false;
  const planRound = state => plansOn(state) && state.roundNumber % 4 === 3;
  const itemRandom = (state, label) => Engine.makeRandom(state.seed + ':items:' + label);
  const alive = state => state.players.filter(player => player.hp > 0);
  const playerFor = (state, id) => { const player = state.players.find(player => player.playerId === id); demand(player, 'Unknown party player.'); return player; };
  const holders = state => state.players.flatMap(player => [...player.field, ...player.bench, ...player.shop.filter(Boolean)]);
  const references = [undefined, 1].map(balanceVersion => ChestHealth.createReference(Engine.ROSTER.map(hero => {
    const stats = Engine.deriveStats({ heroId: hero.id, level: 1, balanceVersion }, Engine.synergies([]));
    return { id: hero.id, maxHp: stats.maxHp, armor: stats.armor };
  })));
  const referenceFor = state => references[balanceOn(state) ? 1 : 0];
  function position(board, col, row) {
    demand(Number.isInteger(col) && col >= 0 && col < board.columns && Number.isInteger(row) && row >= board.playerStartRow && row < board.rows,
      'Place this object in your territory.');
  }
  function assertTime(state, atMs) {
    demand(Number.isSafeInteger(atMs) && atMs >= state.lastAdvancedAtMs, 'Use a monotonic authoritative timestamp.');
  }
  function zoneRandom(state, number = state.roundNumber) { return Engine.makeRandom(state.seed + ':zones:' + number); }
  function syncZones(state) {
    if (zonesOn(state)) state.zoneDefense = ZonePolicy.create(state.board, zoneRandom(state));
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
      const tiers = Engine.SPAWN_RARITY.costs.filter(tier => (state.roundNumber > 1 || tier.cost === 1) && available.some(lot => lot.cost === tier.cost))
        .map(tier => fortunesOn(state) ? { ...tier, weight: Fortunes.tierWeight(tier.weight, tier.cost, player.blessings, player.curses) } : tier);
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
    if (fortunesOn(state)) {
      const eligible = Fortunes.CATALOG.filter(entry => entry.kind === 'curse' && alive(state).some(target =>
        target.playerId !== player.playerId && !target.curses.includes(entry.id))).map(entry => entry.id);
      player.fortuneShop = Fortunes.draw(Engine.makeRandom(state.seed + ':fortune:' + player.playerId + ':' + state.roundNumber + ':' + draw), player.blessings, eligible,
        state.fortuneKinds ? { ...state.fortuneKinds, items: itemsOn(state), treasure: treasureOn(state) } : undefined);
    }
  }
  function drawAll(state) {
    // Rotate first drawer each round; all old reservations are already gone.
    const players = alive(state), offset = (state.roundNumber - 1) % players.length;
    for (let index = 0; index < players.length; index++) {
      const player = players[(index + offset) % players.length];
      if (!shopLockOn(state) || !player.shopLocked) refreshShop(state, player);
    }
  }
  function openPreparation(state, atMs) {
    expandBoard(state);
    syncZones(state);
    state.phase = 'preparation'; state.openedAtMs = atMs; state.lastAdvancedAtMs = atMs;
    state.clock = Schedule.createClock({ roundNumber: state.roundNumber, preparationSeconds: state.preparationSeconds,
      openedAtMs: atMs, playerIds: alive(state).map(player => player.playerId), earlyStart: state.earlyStart });
    state.deadlineAtMs = state.clock.deadlineAtMs; state.combats = []; state.pairings = [];
    for (const player of state.players) { player.ready = false; if (itemsOn(state)) player.itemShop = null; }
    if (plansOn(state)) for (const player of alive(state)) player.pendingPlan = planRound(state);
    if (draftOn(state)) state.draft = draftRound(state) ? { roundNumber: state.roundNumber,
      availableIds: [...Items.componentIds], pickedPlayerIds: [] } : null;
    drawAll(state);
    for (const player of alive(state)) {
      if (treasureOn(state) && state.roundNumber >= 5 && !player.chest) {
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
    demand(options.cherubRulesVersion === undefined || options.cherubRulesVersion === 1 && options.itemRulesVersion === 1, 'Cherub rewards require item rules.');
    demand(options.balanceVersion === undefined || options.balanceVersion === 1, 'Unknown hero balance version.');
    demand(options.shopLockRulesVersion === undefined || options.shopLockRulesVersion === 1, 'Unknown shop lock rules version.');
    demand(options.encounterRulesVersion === undefined || options.encounterRulesVersion === 1 && options.itemRulesVersion === 1, 'Unknown encounter rules version.');
    demand(options.draftRulesVersion === undefined || options.draftRulesVersion === 1 && options.itemRulesVersion === 1, 'Unknown shared draft rules version.');
    demand(options.planRulesVersion === undefined || options.planRulesVersion === 1 && options.itemRulesVersion === 1, 'Unknown battle plan rules version.');
    demand(options.fortuneRulesVersion === undefined || options.fortuneRulesVersion === 1, 'Unknown fortune shop rules version.');
    demand(options.fortunePricingVersion === undefined || options.fortunePricingVersion === 1 && options.fortuneRulesVersion === 1,
      'Unknown fortune pricing version.');
    demand(options.treasureEnabled === undefined || typeof options.treasureEnabled === 'boolean', 'Invalid treasure rule.');
    demand(options.zoneBonusesEnabled === undefined || typeof options.zoneBonusesEnabled === 'boolean', 'Invalid zone rule.');
    demand(options.fortuneKinds === undefined || options.fortuneRulesVersion === 1 &&
      typeof options.fortuneKinds?.blessings === 'boolean' && typeof options.fortuneKinds?.curses === 'boolean' &&
      (options.fortuneKinds.blessings || options.fortuneKinds.curses), 'Invalid fortune kinds.');
    const state = { schemaVersion: 1, matchId: options.matchId, seed: options.seed, boardMode: options.boardMode,
      ...(options.itemRulesVersion === 1 ? { itemRulesVersion: 1, itemReceipts: [] } : {}),
      ...(options.cherubRulesVersion === 1 ? { cherubRulesVersion: 1 } : {}),
      ...(options.balanceVersion === 1 ? { balanceVersion: 1 } : {}),
      ...(options.shopLockRulesVersion === 1 ? { shopLockRulesVersion: 1 } : {}),
      ...(options.encounterRulesVersion === 1 ? { encounterRulesVersion: 1 } : {}),
      ...(options.draftRulesVersion === 1 ? { draftRulesVersion: 1, draft: null } : {}),
      ...(options.planRulesVersion === 1 ? { planRulesVersion: 1, planReceipts: [] } : {}),
      ...(options.fortuneRulesVersion === 1 ? { fortuneRulesVersion: 1, fortuneReceipts: [] } : {}),
      ...(options.fortunePricingVersion === 1 ? { fortunePricingVersion: 1 } : {}),
      ...(options.treasureEnabled !== undefined ? { treasureEnabled: options.treasureEnabled } : {}),
      ...(options.zoneBonusesEnabled !== undefined ? { zoneBonusesEnabled: options.zoneBonusesEnabled } : {}),
      ...(options.fortuneKinds ? { fortuneKinds: clone(options.fortuneKinds) } : {}),
      board: Match.boardForLevel(options.boardMode, 1), preparationSeconds: options.preparationSeconds,
      earlyStart, oddPlayerPolicy: options.oddPlayerPolicy, roundNumber: 1, phase: 'preparation',
      openedAtMs: options.openedAtMs, deadlineAtMs: null, lastAdvancedAtMs: options.openedAtMs, revision: 0,
      shopPool: ShopPool.create(Engine.ROSTER, options.players.length), players: options.players.map(input => {
        demand(identity(input.playerId) && identity(input.name) && typeof input.isAI === 'boolean', 'Every player needs an ID, display name and explicit AI flag.');
        return { playerId: input.playerId, name: input.name, isAI: input.isAI, hp: RULES.startingHP, gold: RULES.startingGold,
          progression: Progression.createProgression({ matchId: options.matchId, playerId: input.playerId, xpCosts: [...Progression.COMMANDER_LEVEL_COSTS] }),
          income: Income.createLedger({ matchId: options.matchId, playerId: input.playerId }), field: [], bench: [], shop: [], shopDraw: 0,
          mergeSerial: 0, chest: null, ready: false, eliminatedRound: null,
          ...(options.shopLockRulesVersion === 1 ? { shopLocked: false } : {}),
          ...(options.planRulesVersion === 1 ? { pendingPlan: false, freeRerolls: 0, plans: [] } : {}),
          ...(options.fortuneRulesVersion === 1 ? { blessings: [], curses: [], fortuneShop: null, mirrorTickets: [] } : {}),
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
      if (fortunesOn(state) && player.blessings.includes('mirror-loom') && combined.unit.level === 2)
        player.mirrorTickets.push({ id: state.matchId + ':mirror:' + player.playerId + ':' + combined.unit.id,
          maxCost: Engine.heroById(combined.unit.heroId).cost });
      upgrades.push(combined.unit.level);
    }
    demand(game.bench.length <= RULES.benchCapacity, 'Make room on the ten-slot bench.');
    const receipt = { kind: 'purchase', playerId: player.playerId, roundNumber: state.roundNumber, offer: clone(offer), goldSpent: offer.cost, goldReceived: 0 };
    player.gold -= offer.cost; player.shop[index] = null; commitArmy(player, game); state.shopReceipts.push(receipt);
    return { receipt, upgrades };
  }
  function saleValue(unit) { const hero = Engine.heroById(unit?.heroId); demand(hero && [1, 2, 3].includes(unit.level), 'Choose an owned hero.'); return hero.cost * 3 ** (unit.level - 1); }
  function useMirrorTicket(state, player, ticketId, unitId) {
    demand(fortunesOn(state), 'This room has no Mirror Tickets.');
    const ticket = player.mirrorTickets.find(value => value.id === ticketId);
    const target = [...player.field, ...player.bench].find(value => value.id === unitId), hero = Engine.heroById(target?.heroId);
    demand(ticket && hero && hero.cost <= ticket.maxCost, 'Choose an owned hero within this ticket’s cost tier.');
    demand(player.gold >= hero.cost, 'A Mirror Ticket still pays the hero’s normal gold cost.');
    const lot = ShopPool.available(state.shopPool, holders(state)).find(value => value.heroId === hero.id);
    demand(lot, 'No copy of that hero remains in the shared pool.');
    const game = armyGame(state, player), unit = { id: roundId(state) + ':mirror:' + player.playerId + ':' + state.revision,
      heroId: hero.id, level: 1, lotIds: [lot.id] };
    game.bench.push(unit); const upgrades = []; let group;
    while ((group = Engine.mergeGroups(game).find(group => group.heroId === hero.id))) {
      const combined = required(Engine.combine(game, group.heroId, group.level));
      if (itemsOn(state)) player.items.push(...(combined.overflowItemIds || []));
      if (player.blessings.includes('mirror-loom') && combined.unit.level === 2)
        player.mirrorTickets.push({ id: state.matchId + ':mirror:' + player.playerId + ':' + combined.unit.id,
          maxCost: Engine.heroById(combined.unit.heroId).cost });
      upgrades.push(combined.unit.level);
    }
    demand(game.bench.length <= RULES.benchCapacity, 'Make room on the ten-slot bench.');
    player.gold -= hero.cost; player.mirrorTickets.splice(player.mirrorTickets.findIndex(value => value.id === ticketId), 1);
    commitArmy(player, game);
    const receipt = { kind: 'mirror-copy', playerId: player.playerId, roundNumber: state.roundNumber,
      ticketId, heroId: hero.id, lotId: lot.id, goldSpent: hero.cost, goldReceived: 0 };
    state.shopReceipts.push(receipt);
    return { receipt, upgrades };
  }
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
    else if (action.type === 'buyFortune') {
      demand(fortunesOn(state), 'This room uses its original shop rules.');
      const entry = Fortunes.get(action.fortuneId);
      demand(entry && player.fortuneShop?.[entry.kind + 'Id'] === entry.id, 'Choose an offered blessing or curse.');
      demand(!state.fortuneKinds || state.fortuneKinds[entry.kind === 'blessing' ? 'blessings' : 'curses'], 'This room disables that fortune type.');
      const target = entry.kind === 'blessing' ? player : playerFor(state, action.targetPlayerId);
      demand(entry.kind === 'blessing' || target.playerId !== player.playerId && target.hp > 0, 'Choose a living opponent for a curse.');
      const list = entry.kind === 'blessing' ? target.blessings : target.curses;
      demand(!list.includes(entry.id), 'That permanent effect is already active on this commander.');
      const price = fortunePrice(state, entry.id);
      demand(player.gold >= price, 'Not enough gold for this fortune.');
      player.gold -= price; list.push(entry.id); player.fortuneShop[entry.kind + 'Id'] = null;
      const receipt = { kind: entry.kind, playerId: player.playerId, targetPlayerId: target.playerId,
        roundNumber: state.roundNumber, fortuneId: entry.id, goldSpent: price, goldReceived: 0 };
      state.fortuneReceipts.push(receipt); result.receipt = receipt;
    }
    else if (action.type === 'buy') result = buy(state, player, action.index);
    else if (action.type === 'useMirrorTicket') result = useMirrorTicket(state, player, action.ticketId, action.unitId);
    else if (action.type === 'sell') result = sell(state, player, action.unitId);
    else if (action.type === 'choosePlan') {
      demand(plansOn(state) && player.pendingPlan && ['treasury', 'armory', 'scout'].includes(action.planId),
        'Choose an available battle plan for this preparation.');
      player.pendingPlan = false; player.plans.push({ roundNumber: state.roundNumber, planId: action.planId });
      const receipt = { kind: 'battle-plan', playerId: player.playerId, roundNumber: state.roundNumber,
        planId: action.planId, goldReceived: 0, itemId: null, freeRerolls: 0 };
      if (action.planId === 'treasury') { player.gold += 5; receipt.goldReceived = 5; }
      else if (action.planId === 'armory') {
        const random = itemRandom(state, 'plan-armory:' + state.roundNumber + ':' + player.playerId);
        receipt.itemId = Items.componentIds[Math.floor(random() * Items.componentIds.length)]; player.items.push(receipt.itemId);
      } else { player.freeRerolls += 3; receipt.freeRerolls = 3; }
      state.planReceipts.push(receipt); result.receipt = receipt;
    }
    else if (action.type === 'draftPick') {
      demand(draftOn(state) && state.draft?.roundNumber === state.roundNumber &&
        !state.draft.pickedPlayerIds.includes(player.playerId) && state.draft.availableIds.includes(action.itemId),
      'Choose an available component from this round’s shared draft.');
      state.draft.availableIds.splice(state.draft.availableIds.indexOf(action.itemId), 1);
      state.draft.pickedPlayerIds.push(player.playerId); player.items.push(action.itemId);
      state.itemReceipts.push({ kind: 'shared-draft', playerId: player.playerId, roundNumber: state.roundNumber,
        itemId: action.itemId, goldSpent: 0, goldReceived: 0 });
    }
    else if (action.type === 'setShopLocked') {
      demand(shopLockOn(state) && typeof action.value === 'boolean', 'Choose whether to hold these shop offers.');
      player.shopLocked = action.value;
    }
    else if (action.type === 'reroll') {
      demand(!itemsOn(state) || !player.itemShop?.open, 'Choose one item or pass the item shop before refreshing heroes.');
      const free = plansOn(state) && player.freeRerolls > 0;
      const priorPaid = state.shopReceipts.some(receipt => receipt.kind === 'reroll' && receipt.playerId === player.playerId && receipt.roundNumber === state.roundNumber && receipt.goldSpent > 0);
      const price = free ? 0 : fortunesOn(state)
        ? Fortunes.rerollPrice(RULES.rerollCost, player.blessings, player.curses, !priorPaid) : RULES.rerollCost;
      demand(player.gold >= price, 'Not enough gold for this shop refresh.'); refreshShop(state, player); player.gold -= price;
      if (price === 0) player.freeRerolls--;
      if (shopLockOn(state)) player.shopLocked = false;
      const receipt = { kind: 'reroll', playerId: player.playerId, roundNumber: state.roundNumber, goldSpent: price, goldReceived: 0 };
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
        if (fortunesOn(state) && player.blessings.includes('mirror-loom') && combined.unit.level === 2)
          player.mirrorTickets.push({ id: state.matchId + ':mirror:' + player.playerId + ':' + combined.unit.id,
            maxCost: Engine.heroById(combined.unit.heroId).cost });
      }
      commitArmy(player, game);
    } else if (action.type === 'moveChest') {
      demand(treasureOn(state) && state.roundNumber >= 5, 'This room has no movable treasure chest.'); position(state.board, action.col, action.row);
      demand(!player.itemChest || player.itemChest.col !== action.col || player.itemChest.row !== action.row, 'Keep the gold and item chests on separate spaces.');
      player.chest = { col: action.col, row: action.row };
    } else if (action.type === 'moveItemChest') {
      demand(itemsOn(state) && Items.itemChestRound(state.roundNumber) && player.itemChest, 'The item chest appears every ten battles.');
      position(state.board, action.col, action.row);
      demand(action.row >= state.board.rows - 2, 'Place the item chest in your two back rows.');
      demand(!player.chest || player.chest.col !== action.col || player.chest.row !== action.row, 'Keep the gold and item chests on separate spaces.');
      player.itemChest = { col: action.col, row: action.row };
    } else if (action.type === 'ready') {
      demand(!action.value || !plansOn(state) || !player.pendingPlan, 'Choose your battle plan before marking ready.');
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
      if (plansOn(state) && player.pendingPlan) required(command(state, { type: 'choosePlan', playerId, planId: 'treasury' }, atMs));
      if (state.draft && !state.draft.pickedPlayerIds.includes(playerId) && state.draft.availableIds.length) {
        const random = itemRandom(state, 'draft-ai:' + state.roundNumber + ':' + playerId);
        required(command(state, { type: 'draftPick', playerId,
          itemId: state.draft.availableIds[Math.floor(random() * state.draft.availableIds.length)] }, atMs));
      }
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
      if (fortunesOn(state)) {
        const current = playerFor(state, playerId), offer = current.fortuneShop;
        if (current.field.length && offer) {
          const target = alive(state).find(other => other.playerId !== playerId && offer.curseId && !other.curses.includes(offer.curseId));
          const fortuneId = [offer.blessingId, target ? offer.curseId : null]
            .find(id => id && current.gold >= fortunePrice(state, id));
          if (fortuneId) required(command(state, { type: 'buyFortune', playerId, fortuneId, ...(target ? { targetPlayerId: target.playerId } : {}) }, atMs));
        }
        for (const ticket of [...playerFor(state, playerId).mirrorTickets]) {
          const owner = playerFor(state, playerId), target = [...owner.field, ...owner.bench].find(unit =>
            Engine.heroById(unit.heroId).cost <= ticket.maxCost && owner.gold >= Engine.heroById(unit.heroId).cost &&
            (owner.bench.length < RULES.benchCapacity || [...owner.field, ...owner.bench]
              .filter(copy => copy.heroId === unit.heroId && copy.level === 1).length >= 2) &&
            ShopPool.available(state.shopPool, holders(state)).some(lot => lot.heroId === unit.heroId));
          if (target) { required(command(state, { type: 'useMirrorTicket', playerId, ticketId: ticket.id, unitId: target.id }, atMs)); deployNext(); }
        }
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
    if (treasureOn(state) && state.roundNumber >= 5) {
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
    const cherubTerms = cherubsOn(state) ? { cherubRulesVersion: 1, cherubs: Engine.cherubObjectives(game, pair.id) } : {};
    if (state.roundNumber < 5) return { roundNumber: state.roundNumber, chests: [], ...cherubTerms };
    const chests = treasureOn(state) ? ['player', 'enemy'].map(side => {
      const player = side === 'enemy' && npc ? npc : playerFor(state, side === 'player' ? pair.playerId : pair.enemyId), units = side === 'player' ? game.field : game.opponents;
      const health = units.length ? ChestHealth.calculateChestHealth(referenceFor(state), units.map(unit => unit.heroId)) : null;
      const chest = player.chest;
      return { id: pair.id + ':chest:' + side, side, col: side === 'player' ? chest.col : state.board.columns - 1 - chest.col,
        row: side === 'player' ? chest.row : state.board.rows - 1 - chest.row, maxHp: health?.maxHp ?? null };
    }) : [];
    if (itemsOn(state) && Items.itemChestRound(state.roundNumber)) for (const side of ['player', 'enemy']) {
      const player = side === 'enemy' && npc ? npc : playerFor(state, side === 'player' ? pair.playerId : pair.enemyId);
      const chest = player.itemChest || player.chest;
      chests.push({ id: pair.id + ':item-chest:' + side, kind: 'item', side,
        col: side === 'player' ? chest.col : state.board.columns - 1 - chest.col,
        row: side === 'player' ? chest.row : state.board.rows - 1 - chest.row,
        maxHp: chests.find(entry => entry.side === side)?.maxHp ?? ((side === 'player' ? game.field : game.opponents).length
          ? ChestHealth.calculateChestHealth(referenceFor(state), (side === 'player' ? game.field : game.opponents).map(unit => unit.heroId)).maxHp : null) });
    }
    return { roundNumber: state.roundNumber, ...(itemsOn(state) ? { itemRulesVersion: 1 } : {}), ...cherubTerms, chests };
  }
  function makeCombat(state, pair) {
    const npc = pair.isRoundAI ? createRoundAI(state, pair) : null;
    const a = playerFor(state, pair.playerId), b = npc || playerFor(state, pair.enemyId), combatSeed = state.seed + ':' + roundId(state) + ':' + pair.id;
    const token = { version: 5, config: { ...Engine.DEFAULT_CONFIG, benchCapacity: RULES.benchCapacity }, playerLevel: a.progression.level,
      board: clone(state.board), bench: [], opponents: [], battleSeed: combatSeed };
    const game = Engine.createGame(token); if (itemsOn(state)) game.itemRulesVersion = 1;
    if (balanceOn(state)) game.balanceVersion = 1;
    game.field = clone(a.field).map(unit => ({ ...unit, id: 'player:' + unit.id }));
    if (zonesOn(state)) game.zoneDefense = clone(state.zoneDefense);
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
    if (plansOn(state)) for (const player of alive(state).filter(entry => entry.pendingPlan)) {
      player.pendingPlan = false; player.plans.push({ roundNumber: state.roundNumber, planId: 'treasury' });
      player.gold += 5; state.planReceipts.push({ kind: 'battle-plan-auto', playerId: player.playerId,
        roundNumber: state.roundNumber, planId: 'treasury', goldReceived: 5, itemId: null, freeRerolls: 0 });
    }
    if (state.draft) for (const player of alive(state).filter(entry => !state.draft.pickedPlayerIds.includes(entry.playerId))
      .sort((a, b) => a.hp - b.hp || a.playerId.localeCompare(b.playerId))) {
      const random = itemRandom(state, 'draft-auto:' + state.roundNumber + ':' + player.playerId);
      const itemId = state.draft.availableIds[Math.floor(random() * state.draft.availableIds.length)];
      demand(itemId, 'The shared draft has no component left for an active commander.');
      state.draft.availableIds.splice(state.draft.availableIds.indexOf(itemId), 1);
      state.draft.pickedPlayerIds.push(player.playerId); player.items.push(itemId);
      state.itemReceipts.push({ kind: 'shared-draft-auto', playerId: player.playerId, roundNumber: state.roundNumber,
        itemId, goldSpent: 0, goldReceived: 0 });
    }
    state.pairings = encounterRound(state)
      ? alive(state).map((player, index) => ({ id: 'round:' + state.roundNumber + ':encounter:' + index,
        playerId: player.playerId, enemyId: 'round-ai:' + state.roundNumber + ':' + player.playerId,
        isGhost: false, isRoundAI: true }))
      : Schedule.pair({ playerIds: alive(state).map(player => player.playerId), seed: state.seed,
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
    const treasure = !treasureOn(state) ? { payouts: ['player', 'enemy'].map(side => ({ playerId: sideId(side), gold: 0 })), chests: [], verifiedDefeats: [] } : required(Treasure.settleRound(Treasure.createLedger({ matchId: state.matchId, playerIds: [sideId('player'), sideId('enemy')] }), {
      matchId: state.matchId, roundId: roundId(state), roundNumber: state.roundNumber, combatId, expectedRevision: 0, status: 'completed',
      combatEndedAtSeconds: game.battle.elapsed, chests: combat.config.chests.filter(chest => chest.kind !== 'item').map(chest => ({ chestId: chest.id, ownerId: sideId(chest.side) })),
      verifiedDefeats: game.battle.events.filter(event => event.type === 'treasure-defeated' && !combat.config.chests.some(chest => chest.id === event.chestId && chest.kind === 'item')).map(event => ({ chestId: event.chestId,
        captorPlayerId: sideId(event.captorSide), defeatedAtSeconds: event.defeatedAtSeconds })) })).receipt;
    const itemChestCaptures = itemsOn(state) ? game.battle.events.filter(event => event.type === 'treasure-defeated' &&
      combat.config.chests.some(chest => chest.id === event.chestId && chest.kind === 'item') &&
      event.defeatedAtSeconds < state.roundNumber * 15 && event.defeatedAtSeconds <= game.battle.elapsed)
      .map(event => ({ chestId: event.chestId, captorPlayerId: sideId(event.captorSide) })) : [];
    const cherubCaptures = cherubsOn(state) ? game.battle.events.filter(event => event.type === 'cherub-defeated' &&
      combat.config.cherubs.some(cherub => cherub.id === event.cherubId && cherub.side === event.ownerSide))
      .map(event => ({ cherubId: event.cherubId, captorPlayerId: sideId(event.captorSide) })) : [];
    const zoneGoldEvents = game.battle.events.filter(event => event.type === 'zone-gold');
    demand(zonesOn(state) || !zoneGoldEvents.length, 'Zone gold belongs only to Zone Defense.');
    const zoneGold = zonesOn(state) ? ZonePolicy.goldPayouts(game.zoneDefense, zoneGoldEvents) : { player: 0, enemy: 0 };
    const awards = ['player', ...(pair.isRoundAI ? [] : ['enemy'])].map(side => {
      const player = playerFor(state, sideId(side)), outcome = winnerSide === null ? 'draw' : side === winnerSide ? 'win' : 'loss';
      const hpAfter = outcome === 'loss' && !encounterRound(state) ? Math.max(0, player.hp - damage) : player.hp;
      const xp = required(Progression.awardCompletedCombat(player.progression, { matchId: state.matchId, playerId: player.playerId,
        expectedRevision: player.progression.revision, roundId: roundId(state), combatId, status: 'completed', outcome }));
      const baseTreasure = treasure.payouts.find(payout => payout.playerId === player.playerId).gold;
      const paidTreasure = fortunesOn(state) ? Fortunes.treasureGold(baseTreasure, player.blessings, player.curses) : baseTreasure;
      return { playerId: player.playerId, outcome, hpBefore: player.hp, hpAfter, damage: player.hp - hpAfter, xp,
        ...(zonesOn(state) ? { zoneGold: zoneGold[side] } : {}),
        treasureGold: paidTreasure, ...(fortunesOn(state) ? { fortuneGold: paidTreasure - baseTreasure } : {}) };
    });
    return { pair: clone(pair), combatId, result: game.result, elapsedSeconds: game.battle.elapsed, survivors, treasure, awards,
      ...(itemsOn(state) ? { itemChestCaptures } : {}),
      ...(cherubsOn(state) ? { cherubCaptures } : {}),
      ...(zonesOn(state) ? { zoneGoldEvents: clone(zoneGoldEvents) } : {}),
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
        const random = itemRandom(state, 'drop:' + state.roundNumber + ':' + player.playerId);
        const drop = fortunesOn(state) ? (() => {
          const chance = Fortunes.dropChance(Items.dropChance(award.outcome, previousStreak), player.blessings, player.curses);
          const roll = random(); return { chance, roll, itemId: roll < chance ? Items.componentIds[Math.floor(random() * Items.componentIds.length)] : null };
        })() : Items.reward({ outcome: award.outcome, previousStreak, random });
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
    if (cherubsOn(state)) for (const result of results) for (const capture of result.cherubCaptures) {
      const captor = state.players.find(player => player.playerId === capture.captorPlayerId);
      if (!captor) continue; // AI encounters cannot own a competitive inventory.
      const random = itemRandom(state, 'cherub:' + state.roundNumber + ':' + capture.cherubId + ':' + captor.playerId);
      const itemId = Items.componentIds[Math.floor(random() * Items.componentIds.length)];
      captor.items.push(itemId);
      const award = result.awards.find(entry => entry.playerId === captor.playerId);
      if (award) (award.cherubItems ||= []).push(itemId);
      state.itemReceipts.push({ kind: 'cherub-capture', playerId: captor.playerId, roundNumber: state.roundNumber,
        cherubId: capture.cherubId, itemId, goldSpent: 0, goldReceived: 0 });
    }
    if (encounterRound(state)) for (const award of awards.filter(award => award.outcome === 'win')) {
      const random = itemRandom(state, 'encounter:' + state.roundNumber + ':' + award.playerId);
      const itemId = Items.componentIds[Math.floor(random() * Items.componentIds.length)];
      playerFor(state, award.playerId).items.push(itemId);
      award.encounterItem = itemId;
      state.itemReceipts.push({ kind: 'encounter-win', playerId: award.playerId, roundNumber: state.roundNumber,
        itemId, goldSpent: 0, goldReceived: 0 });
    }
    const receipt = { roundNumber: state.roundNumber, pairings: clone(state.pairings), startedAtMs: state.combatStartedAtMs,
      settledAtMs: atMs, results: results.map(result => ({ ...result, awards: result.awards.map(award => ({ ...award, xp: award.xp.receipt })) })) };
    state.receipts.push(receipt); state.revision++;
    if (alive(state).length <= 1) { state.phase = 'finished'; state.winnerId = alive(state)[0]?.playerId ?? null; return; }
    if (shopLockOn(state)) for (const player of alive(state)) if (player.shopLocked && !player.shop.some(Boolean)) player.shopLocked = false;
    const recycled = ShopPool.recycleForPreparation(state.shopPool, state.players.map(player => ({ playerId: player.playerId,
      commanderHP: player.hp, field: player.field, bench: player.bench, shop: player.shop,
      ...(shopLockOn(state) ? { preserveShop: player.shopLocked } : {}) })), Engine.ROSTER);
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
      ready: player.ready, chest: player.chest, ...(itemsOn(state) ? { itemChest: player.itemChest } : {}), chestMaxHp: player.field.length ? ChestHealth.calculateChestHealth(referenceFor(state), player.field.map(unit => unit.heroId)).maxHp : null, eliminatedRound: player.eliminatedRound,
      ...(itemsOn(state) ? { itemCount: (player.items || []).length, winStreak: player.winStreak || 0, lossStreak: player.lossStreak || 0 } : {}),
      ...(fortunesOn(state) ? { blessings: player.blessings || [], curses: player.curses || [] } : {}) });
    const combat = state.combats.find(combat => combat.pair.playerId === playerId || (!combat.pair.isRoundAI && combat.pair.enemyId === playerId));
    const owned = state.players.flatMap(player => [...player.field, ...player.bench]);
    const supply = Engine.ROSTER.map(hero => ({ heroId: hero.id, total: state.shopPool.copiesByCost[hero.cost],
      owned: owned.filter(unit => unit.heroId === hero.id).reduce((sum, unit) => sum + unit.lotIds.length, 0),
      you: [...own.field, ...own.bench].filter(unit => unit.heroId === hero.id).reduce((sum, unit) => sum + unit.lotIds.length, 0) }));
    const last = state.receipts.at(-1), terms = Treasure.calculateRoundTerms(state.roundNumber);
    const battle = combat ? { ...combat.game.battle, units: combat.game.battle.units.map(publicUnit) } : null;
    return clone({ schemaVersion: state.schemaVersion, matchId: state.matchId, revision: state.revision, roundNumber: state.roundNumber,
      phase: state.phase, boardMode: state.boardMode, board: state.board, ...(itemsOn(state) ? { itemRulesVersion: 1, itemCatalog: { components: Items.COMPONENTS, recipes: Items.RECIPES } } : {}), ...(cherubsOn(state) ? { cherubRulesVersion: 1 } : {}), ...(balanceOn(state) ? { balanceVersion: 1 } : {}), ...(shopLockOn(state) ? { shopLockRulesVersion: 1 } : {}), ...(encountersOn(state) ? { encounterRulesVersion: 1, encounterRound: encounterRound(state) } : {}), ...(draftOn(state) ? { draftRulesVersion: 1, draft: state.draft ? { availableIds: state.draft.availableIds, picked: state.draft.pickedPlayerIds.includes(playerId) } : null } : {}), ...(plansOn(state) ? { planRulesVersion: 1 } : {}), ...(fortunesOn(state) ? { fortuneRulesVersion: 1, ...(state.fortunePricingVersion === 1 ? { fortunePricingVersion: 1 } : {}) } : {}), ...(state.zoneDefense ? { zoneDefense: state.zoneDefense } : {}), selfId: playerId, preparationSeconds: state.preparationSeconds,
      earlyStart: state.earlyStart, oddPlayerPolicy: state.oddPlayerPolicy, openedAtMs: state.openedAtMs, deadlineAtMs: state.deadlineAtMs,
      serverTimeMs: state.lastAdvancedAtMs, winnerId: state.winnerId, players: state.players.map(publicPlayer),
      treasure: { enabled: treasureOn(state) && terms.enabled, goldPerChest: treasureOn(state) ? terms.goldPerChest : 0, expiresAtSeconds: treasureOn(state) ? terms.treasureWindowSeconds : null },
      self: { ...publicPlayer(own), shop: own.shop.map(offer => offer ? publicUnit(offer) : null), ...(shopLockOn(state) ? { shopLocked: own.shopLocked } : {}), ...(plansOn(state) ? { pendingPlan: own.pendingPlan, freeRerolls: own.freeRerolls, plans: own.plans } : {}),
        ...(itemsOn(state) ? { items: own.items, itemShop: own.itemShop, pendingComponentChoices: own.pendingComponentChoices } : {}),
        ...(fortunesOn(state) ? { fortuneShop: own.fortuneShop, mirrorTickets: own.mirrorTickets, paidRefreshThisRound: state.shopReceipts.some(receipt =>
          receipt.kind === 'reroll' && receipt.playerId === own.playerId && receipt.roundNumber === state.roundNumber && receipt.goldSpent > 0) } : {}) }, supply, pairings: state.pairings,
      combat: combat ? { pair: combat.pair, enemyPlayer: combat.npc ? publicPlayer(combat.npc) : null, board: combat.game.board,
        ...(combat.game.zoneDefense ? { zoneDefense: combat.game.zoneDefense } : {}), phase: combat.game.phase, result: combat.game.result, battle } : null,
      lastRound: last ? { roundNumber: last.roundNumber, pairings: last.pairings, results: last.results.map(result => ({ pair: result.pair,
        result: result.result, elapsedSeconds: result.elapsedSeconds, awards: result.awards.map(award => ({ playerId: award.playerId,
          outcome: award.outcome, damage: award.damage, hpAfter: award.hpAfter, treasureGold: award.treasureGold,
          ...(award.zoneGold !== undefined ? { zoneGold: award.zoneGold } : {}), ...(itemsOn(state) ? { itemDrop: award.itemDrop || null } : {}), ...(cherubsOn(state) ? { cherubItems: award.cherubItems || [] } : {}), ...(encountersOn(state) ? { encounterItem: award.encounterItem || null } : {}), xpGranted: award.xp.xpGranted })) })) } : null });
  }
  function validate(state) {
    demand(state && state.schemaVersion === 1 && identity(state.matchId) && identity(state.seed), 'Invalid party identity.');
    demand([RULES.duelPlayerCount, RULES.playerCount].includes(state.players.length) && new Set(state.players.map(player => player.playerId)).size === state.players.length, 'A room retains its original players.');
    demand(state.itemRulesVersion === undefined || state.itemRulesVersion === 1, 'Invalid item rules version.');
    demand(state.cherubRulesVersion === undefined || state.cherubRulesVersion === 1 && itemsOn(state), 'Invalid Cherub rules version.');
    demand(state.balanceVersion === undefined || state.balanceVersion === 1, 'Invalid hero balance version.');
    demand(state.shopLockRulesVersion === undefined || state.shopLockRulesVersion === 1, 'Invalid shop lock rules version.');
    demand(state.encounterRulesVersion === undefined || state.encounterRulesVersion === 1 && itemsOn(state), 'Invalid encounter rules version.');
    demand(state.draftRulesVersion === undefined || state.draftRulesVersion === 1 && itemsOn(state), 'Invalid shared draft rules version.');
    demand(state.planRulesVersion === undefined || state.planRulesVersion === 1 && itemsOn(state), 'Invalid battle plan rules version.');
    demand(state.fortuneRulesVersion === undefined || state.fortuneRulesVersion === 1, 'Invalid fortune shop rules version.');
    demand(state.fortunePricingVersion === undefined || state.fortunePricingVersion === 1 && fortunesOn(state),
      'Invalid fortune pricing version.');
    demand(state.treasureEnabled === undefined || typeof state.treasureEnabled === 'boolean', 'Invalid treasure rule.');
    demand(state.zoneBonusesEnabled === undefined || typeof state.zoneBonusesEnabled === 'boolean', 'Invalid zone rule.');
    demand(state.fortuneKinds === undefined || fortunesOn(state) && typeof state.fortuneKinds?.blessings === 'boolean' &&
      typeof state.fortuneKinds?.curses === 'boolean' && (state.fortuneKinds.blessings || state.fortuneKinds.curses), 'Invalid fortune kinds.');
    if (fortunesOn(state)) demand(Array.isArray(state.fortuneReceipts), 'Fortune purchase receipts are required.');
    if (plansOn(state)) demand(Array.isArray(state.planReceipts), 'Battle plan receipts are required.');
    if (draftOn(state)) {
      demand(state.draft === null || draftRound(state) && state.draft.roundNumber === state.roundNumber &&
        Array.isArray(state.draft.availableIds) && state.draft.availableIds.every(Items.isComponent) &&
        new Set(state.draft.availableIds).size === state.draft.availableIds.length &&
        Array.isArray(state.draft.pickedPlayerIds) && new Set(state.draft.pickedPlayerIds).size === state.draft.pickedPlayerIds.length &&
        state.draft.pickedPlayerIds.every(id => state.players.some(player => player.playerId === id)) &&
        state.draft.availableIds.length + state.draft.pickedPlayerIds.length === Items.componentIds.length,
      'Invalid shared component draft.');
    }
    if (itemsOn(state)) demand(Array.isArray(state.itemReceipts), 'Item receipts are required.');
    if (fortunesOn(state)) for (const receipt of state.fortuneReceipts) {
      const entry = Fortunes.get(receipt.fortuneId), buyer = state.players.find(player => player.playerId === receipt.playerId),
        target = state.players.find(player => player.playerId === receipt.targetPlayerId);
      demand(entry && buyer && target && receipt.kind === entry.kind && receipt.goldSpent === fortunePrice(state, entry.id) && receipt.goldReceived === 0 &&
        (!state.fortuneKinds || state.fortuneKinds[entry.kind === 'blessing' ? 'blessings' : 'curses']) &&
        (entry.kind === 'blessing' ? buyer === target && target.blessings.includes(entry.id) : buyer !== target && target.curses.includes(entry.id)),
      'Fortune receipt must identify its payer, target and permanent effect.');
    }
    demand(state.shopPool.playerCount === state.players.length, 'Room supply must match its original player count.'); ShopPool.validate(state.shopPool, holders(state), Engine.ROSTER);
    demand(['preparation', 'combat', 'finished'].includes(state.phase) && safe(state.revision) && safe(state.roundNumber) && state.roundNumber > 0, 'Invalid party phase or round.');
    demand(state.earlyStart === (state.preparationSeconds === null) && state.oddPlayerPolicy === 'round-ai', 'Invalid party policies.');
    Schedule.validateClock(state.clock);
    demand(state.clock.roundNumber === state.roundNumber && state.clock.preparationSeconds === state.preparationSeconds &&
      state.clock.openedAtMs === state.openedAtMs && state.clock.deadlineAtMs === state.deadlineAtMs && state.clock.earlyStart === state.earlyStart, 'Clock must belong to the active party round.');
    if (state.phase !== 'finished') demand(JSON.stringify(state.clock.playerIds) === JSON.stringify(alive(state).map(player => player.playerId)) &&
      state.players.every(player => player.ready === state.clock.readyPlayerIds.includes(player.playerId)), 'Clock readiness must match surviving commanders.');
    Match.validateBoard(state.boardMode, state.board);
    if (zonesOn(state)) ZonePolicy.validate(state.zoneDefense, state.board, zoneRandom(state));
    else demand(state.zoneDefense === undefined, 'Zone bonuses belong only to Zone Defense.');
    const unitIds = new Set();
    for (const player of state.players) {
      demand(identity(player.playerId) && identity(player.name) && typeof player.isAI === 'boolean' && safe(player.hp) && player.hp <= RULES.startingHP && safe(player.gold), 'Invalid commander.');
      Progression.validate(player.progression); Income.validate(player.income);
      demand(player.progression.matchId === state.matchId && player.progression.playerId === player.playerId && player.income.matchId === state.matchId && player.income.playerId === player.playerId, 'Commander ledgers belong to another player.');
      demand(JSON.stringify(player.progression.xpCosts) === JSON.stringify(Progression.COMMANDER_LEVEL_COSTS), 'Use the approved commander XP curve.');
      demand(player.bench.length <= RULES.benchCapacity && player.field.length <= player.progression.fieldCapacity && player.shop.length === RULES.shopSize, 'Army or shop capacity exceeded.');
      demand(safe(player.shopDraw) && safe(player.mergeSerial), 'Invalid army/shop counters.');
      if (shopLockOn(state)) demand(typeof player.shopLocked === 'boolean', 'Shop lock state is invalid.');
      if (plansOn(state)) demand(typeof player.pendingPlan === 'boolean' && safe(player.freeRerolls) && Array.isArray(player.plans), 'Battle plan state is invalid.');
      if (fortunesOn(state)) {
        demand(Array.isArray(player.blessings) && Array.isArray(player.curses) && Array.isArray(player.mirrorTickets) &&
          player.mirrorTickets.every(ticket => identity(ticket.id) && Number.isInteger(ticket.maxCost) && ticket.maxCost >= 1 && ticket.maxCost <= 5) &&
          new Set(player.mirrorTickets.map(ticket => ticket.id)).size === player.mirrorTickets.length &&
          player.blessings.every(id => Fortunes.get(id)?.kind === 'blessing' && (!state.fortuneKinds || state.fortuneKinds.blessings)) &&
          player.curses.every(id => Fortunes.get(id)?.kind === 'curse' && (!state.fortuneKinds || state.fortuneKinds.curses)) &&
          new Set(player.blessings).size === player.blessings.length && new Set(player.curses).size === player.curses.length, 'Permanent fortunes cannot stack by name.');
        const offer = player.fortuneShop;
        demand(offer === null || Number.isFinite(offer.roll) && offer.roll >= 0 && offer.roll < Fortunes.OFFER_CHANCE &&
          (offer.blessingId === null || Fortunes.get(offer.blessingId)?.kind === 'blessing' && (!state.fortuneKinds || state.fortuneKinds.blessings)) &&
          (offer.curseId === null || Fortunes.get(offer.curseId)?.kind === 'curse' && (!state.fortuneKinds || state.fortuneKinds.curses)), 'Invalid optional fortune offers.');
      }
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
      if (!treasureOn(state)) demand(player.chest === null, 'Treasure is disabled in this room.');
      if (itemsOn(state) && player.itemChest) {
        position(state.board, player.itemChest.col, player.itemChest.row);
        demand(player.itemChest.row >= state.board.rows - 2, 'Item chest belongs in the two back rows.');
      }
      for (const offer of player.shop.filter(Boolean)) demand(offer.level === 1 && Engine.heroById(offer.heroId).cost === offer.cost && (state.roundNumber !== 1 || offer.cost === 1), 'Invalid shop offer.');
      let hp = RULES.startingHP, treasureGold = 0, zoneGold = 0, combatCount = 0;
      for (const round of state.receipts) for (const result of round.results) for (const award of result.awards.filter(award => award.playerId === player.playerId)) {
        demand(award.hpBefore === hp && award.hpAfter === Math.max(0, hp - award.damage), 'Commander HP must carry between completed combats.'); hp = award.hpAfter; treasureGold += award.treasureGold; zoneGold += award.zoneGold ?? 0; combatCount++;
        if (fortunesOn(state)) demand(Number.isSafeInteger(award.fortuneGold) &&
          award.treasureGold === result.treasure.payouts.find(payout => payout.playerId === player.playerId).gold + award.fortuneGold,
        'Fortune chest adjustments must reconcile to the verified payout.');
      }
      demand(hp === player.hp && player.progression.receipts.filter(receipt => receipt.kind === 'combat').length === combatCount, 'Combat progression or HP history differs.');
      const gold = RULES.startingGold + player.income.receipts.reduce((sum, receipt) => sum + Income.BASE_ROUND_INCOME + receipt.interest, 0) + treasureGold + zoneGold
        - player.progression.receipts.filter(receipt => receipt.kind === 'purchase').reduce((sum, receipt) => sum + receipt.goldSpent, 0)
        + state.shopReceipts.filter(receipt => receipt.playerId === player.playerId).reduce((sum, receipt) => sum + receipt.goldReceived - receipt.goldSpent, 0)
        - (itemsOn(state) ? state.itemReceipts.filter(receipt => receipt.playerId === player.playerId).reduce((sum, receipt) => sum + receipt.goldSpent, 0) : 0)
        - (fortunesOn(state) ? state.fortuneReceipts.filter(receipt => receipt.playerId === player.playerId).reduce((sum, receipt) => sum + receipt.goldSpent, 0) : 0)
        + (plansOn(state) ? state.planReceipts.filter(receipt => receipt.playerId === player.playerId).reduce((sum, receipt) => sum + receipt.goldReceived, 0) : 0);
      demand(gold === player.gold, 'Gold must follow income, treasure and transactions.');
    }
    for (const [index, receipt] of state.receipts.entries()) {
      demand(receipt.roundNumber === index + 1, 'Party rounds settle once in order.');
      for (const result of receipt.results) {
        if (zonesOn(state)) {
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
