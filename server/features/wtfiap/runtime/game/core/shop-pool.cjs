/* Shared physical copies for explicitly approved room populations. The owner
 * approved 13/11/9/7/5 copies per hero at costs 1–5 for two players, and
 * 22/18/14/9/7 for eight. Other room populations need their own stock policy.
 *
 * The catalog is static. Shops reserve lots and armies own lots; their lotIds
 * are the sole occupancy record. Removing an unbought offer or selling a hero
 * therefore releases its exact physical copies without a second stock ledger.
 */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ABShopPool = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PLAYER_COUNT = 2;
  const COPIES_BY_COST = Object.freeze({ 1: 13, 2: 11, 3: 9, 4: 7, 5: 5 });
  const COPIES_BY_PLAYER_COUNT = Object.freeze({
    2: COPIES_BY_COST,
    8: Object.freeze({ 1: 22, 2: 18, 3: 14, 4: 9, 5: 7 })
  });
  const compareIds = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  function assert(condition, message) {
    if (!condition) throw new Error('Invalid shared shop pool: ' + message);
  }
  function rosterHeroes(roster) {
    assert(Array.isArray(roster) && roster.length > 0, 'the hero roster is required.');
    const ids = new Set();
    for (const hero of roster) {
      assert(hero && typeof hero.id === 'string' && hero.id.length > 0, 'every hero needs an ID.');
      assert(!ids.has(hero.id), 'hero IDs must be unique.');
      assert(Number.isInteger(hero.cost) && Object.hasOwn(COPIES_BY_COST, hero.cost), 'hero costs must be 1–5.');
      ids.add(hero.id);
    }
    return [...roster].sort(compareIds);
  }
  function copyPolicy(playerCount) {
    assert(Number.isInteger(playerCount) && Object.hasOwn(COPIES_BY_PLAYER_COUNT, playerCount), 'stock is approved only for two or eight original room players.');
    return COPIES_BY_PLAYER_COUNT[playerCount];
  }
  function create(roster, playerCount = PLAYER_COUNT) {
    const copiesByCost = copyPolicy(playerCount);
    const lots = rosterHeroes(roster).flatMap(hero => Array.from({ length: copiesByCost[hero.cost] }, (_, index) => Object.freeze({
      id: 'shop-lot:' + encodeURIComponent(hero.id) + ':' + (index + 1), heroId: hero.id, cost: hero.cost
    })));
    return Object.freeze({ version: 1, playerCount, copiesByCost, lots: Object.freeze(lots) });
  }
  function heldIds(pool, holders) {
    assert(pool && Array.isArray(pool.lots), 'the lot catalog is required.');
    assert(Array.isArray(holders), 'shop and army holders must be supplied together.');
    const catalog = new Map();
    for (const lot of pool.lots) {
      assert(lot && typeof lot.id === 'string' && !catalog.has(lot.id), 'catalog lot IDs must be unique.');
      catalog.set(lot.id, lot);
    }
    const held = new Set();
    for (const holder of holders) {
      assert(holder && typeof holder.heroId === 'string', 'every holder needs a hero ID.');
      assert(Number.isInteger(holder.level) && holder.level >= 1 && holder.level <= 3, 'holder stars must be 1–3.');
      assert(Array.isArray(holder.lotIds) && holder.lotIds.length === 3 ** (holder.level - 1), 'holder stars must retain all underlying copies.');
      for (const id of holder.lotIds) {
        const lot = catalog.get(id);
        assert(lot && lot.heroId === holder.heroId, 'held lots must exist and match their hero.');
        assert(!held.has(id), 'a lot cannot be reserved or owned more than once.');
        held.add(id);
      }
    }
    return held;
  }
  function available(pool, holders, cost) {
    if (cost !== undefined) assert(Number.isInteger(cost) && Object.hasOwn(COPIES_BY_COST, cost), 'draw cost must be 1–5.');
    const held = heldIds(pool, holders);
    return pool.lots.filter(lot => !held.has(lot.id) && (cost === undefined || lot.cost === cost));
  }
  function validate(pool, holders, roster) {
    assert(pool && typeof pool === 'object', 'the lot catalog is required.');
    const policy = copyPolicy(pool.playerCount), canonical = create(roster, pool.playerCount);
    assert(pool.version === canonical.version, 'the catalog version is unsupported.');
    assert(pool.copiesByCost && Object.keys(pool.copiesByCost).length === Object.keys(policy).length &&
      Object.entries(policy).every(([cost, count]) => pool.copiesByCost[cost] === count), 'copy counts must match the approved policy.');
    assert(Array.isArray(pool.lots) && pool.lots.length === canonical.lots.length, 'the catalog must contain every approved copy.');
    for (let index = 0; index < canonical.lots.length; index++) {
      const lot = pool.lots[index], expected = canonical.lots[index];
      assert(lot && lot.id === expected.id && lot.heroId === expected.heroId && lot.cost === expected.cost, 'the catalog must retain canonical IDs, heroes, costs and order.');
    }
    heldIds(pool, holders);
    return true;
  }
  function summary(pool, holders) {
    const held = heldIds(pool, holders), heroes = new Map();
    for (const lot of pool.lots) {
      if (!heroes.has(lot.heroId)) heroes.set(lot.heroId, { heroId: lot.heroId, cost: lot.cost, total: 0, held: 0, available: 0 });
      const hero = heroes.get(lot.heroId);
      hero.total++;
      if (held.has(lot.id)) hero.held++;
      else hero.available++;
    }
    return { total: pool.lots.length, held: held.size, available: pool.lots.length - held.size, heroes: [...heroes.values()] };
  }
  function recycleForPreparation(pool, players, roster) {
    assert(pool && typeof pool === 'object', 'the lot catalog is required.');
    copyPolicy(pool.playerCount);
    assert(Array.isArray(players) && players.length === pool.playerCount, 'include every original room player, including eliminated commanders.');
    const playerIds = new Set();
    for (const player of players) {
      assert(player && typeof player.playerId === 'string' && player.playerId.trim() && !playerIds.has(player.playerId), 'room player IDs must be unique nonempty strings.');
      assert(Number.isFinite(player.commanderHP) && player.commanderHP >= 0, 'commander HP must be finite and nonnegative.');
      assert(Array.isArray(player.field) && Array.isArray(player.bench) && Array.isArray(player.shop), 'each player needs field, bench and shop arrays.');
      playerIds.add(player.playerId);
    }
    const holdersFor = entries => entries.flatMap(player => [...player.field, ...player.bench, ...Array.from(player.shop).filter(unit => unit !== null)]);
    const holders = holdersFor(players);
    // Validate eliminated inventories too: clearing them must not hide a forged
    // or duplicated lot. No input is changed if any room member is invalid.
    validate(pool, holders, roster);
    const clone = value => Array.isArray(value) ? value.map(clone) : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)])) : value;
    const nextPlayers = clone(players);
    for (const player of nextPlayers) {
      player.shop = player.shop.map(() => null);
      if (player.commanderHP === 0) { player.field = []; player.bench = []; }
    }
    const remaining = holdersFor(nextPlayers), beforeIds = heldIds(pool, holders), afterIds = heldIds(pool, remaining);
    return {
      players: nextPlayers,
      releasedLotIds: pool.lots.filter(lot => beforeIds.has(lot.id) && !afterIds.has(lot.id)).map(lot => lot.id),
      availableLots: available(pool, remaining),
      summary: summary(pool, remaining)
    };
  }
  return Object.freeze({ COPIES_BY_COST, COPIES_BY_PLAYER_COUNT, PLAYER_COUNT, create, available, validate, summary, recycleForPreparation });
});
