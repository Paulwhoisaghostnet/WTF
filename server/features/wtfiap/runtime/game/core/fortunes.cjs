/* Seeded, optional shop modifiers. A fortune belongs to its buyer for the
 * entire match; a curse belongs to its target. Hero lots remain in the shared
 * shop pool, and an offer never changes a previously pinned room's rules. */
(function (root, factory) {
  'use strict';
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.ABFortunes = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const OFFER_CHANCE = .15;
  // The 5-gold price matches the existing owner-approved component shop. The
  // modifiers deliberately pay less than a component's direct combat value.
  const PRICE = 5;
  const CATALOG = Object.freeze([
    { id: 'bright-coffer', kind: 'blessing', name: 'Bright Coffer', glyph: '✧', price: PRICE,
      description: 'Gain 1 extra gold when you earn treasure-chest gold.' },
    { id: 'nimble-ledger', kind: 'blessing', name: 'Nimble Ledger', glyph: '↻', price: PRICE,
      description: 'Your first paid hero-shop refresh each round costs 1 less gold.' },
    { id: 'scrap-spark', kind: 'blessing', name: 'Scrap Spark', glyph: '◇', price: PRICE,
      description: 'Component drop chance after combat rises by 1 percentage point.' },
    { id: 'far-sight', kind: 'blessing', name: 'Far Sight', glyph: '◉', price: PRICE,
      description: 'Available heroes costing 3 or more gain 5% relative shop draw weight.' },
    { id: 'mirror-loom', kind: 'blessing', name: 'Mirror Loom', glyph: '◐', price: PRICE,
      description: 'Each new 2-star hero grants a Mirror Ticket. Spend it to buy a matching 1-star copy from the shared pool at that hero’s normal cost; the copy cannot cost more than the hero that made the ticket.' },
    { id: 'dim-coffer', kind: 'curse', name: 'Dim Coffer', glyph: '◈', price: PRICE,
      description: 'Target loses 1 gold from a positive treasure-chest payout.' },
    { id: 'tangled-ledger', kind: 'curse', name: 'Tangled Ledger', glyph: '⌁', price: PRICE,
      description: 'Target’s first paid hero-shop refresh each round costs 1 extra gold.' },
    { id: 'damp-scrap', kind: 'curse', name: 'Damp Scrap', glyph: '◌', price: PRICE,
      description: 'Target’s component drop chance falls by 1 percentage point.' },
    { id: 'near-sight', kind: 'curse', name: 'Near Sight', glyph: '◍', price: PRICE,
      description: 'Target’s available heroes costing 3 or more lose 5% relative shop draw weight.' }
  ].map(value => Object.freeze(value)));
  const byId = Object.freeze(Object.fromEntries(CATALOG.map(value => [value.id, value])));
  const get = id => byId[id] || null;
  // The first paired Duel/Tournament audit found roughly ten gold of direct
  // midgame value in self chest/refresh effects and about one gold of expected
  // value in the rare drop/odds effects. Target-only curses retain five gold:
  // a buyer spends on one rival while every other tournament seat remains
  // unaffected. Versioned prices preserve older rooms' five-gold terms.
  const TUNED_PRICES = Object.freeze({
    'bright-coffer': 10, 'nimble-ledger': 10, 'scrap-spark': 1,
    'far-sight': 1, 'mirror-loom': 5, 'dim-coffer': 5,
    'tangled-ledger': 5, 'damp-scrap': 1, 'near-sight': 1
  });
  const priceFor = (id, version) => version === 1 ? TUNED_PRICES[id] ?? null : get(id)?.price ?? null;
  const has = (list, id) => Array.isArray(list) && list.includes(id);
  function draw(random, ownedBlessings = [], eligibleCurses = CATALOG.filter(value => value.kind === 'curse').map(value => value.id), options = {}) {
    if (typeof random !== 'function') throw new Error('A seeded shop stream is required.');
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Fortune roll must be in [0, 1).');
    if (roll >= OFFER_CHANCE) return null;
    const allowed = value => (options.items !== false || !['scrap-spark', 'damp-scrap'].includes(value.id)) &&
      (options.treasure !== false || !['bright-coffer', 'dim-coffer'].includes(value.id));
    const blessings = CATALOG.filter(value => value.kind === 'blessing' && options.blessings !== false && allowed(value) && !ownedBlessings.includes(value.id));
    const curses = CATALOG.filter(value => value.kind === 'curse' && options.curses !== false && allowed(value) && eligibleCurses.includes(value.id));
    if (!blessings.length && !curses.length) return null;
    return { roll, blessingId: blessings.length ? blessings[Math.floor(random() * blessings.length)].id : null,
      curseId: curses.length ? curses[Math.floor(random() * curses.length)].id : null };
  }
  const tierWeight = (weight, cost, blessings, curses) => cost >= 3
    ? weight * (has(blessings, 'far-sight') ? 1.05 : 1) * (has(curses, 'near-sight') ? .95 : 1) : weight;
  const rerollPrice = (base, blessings, curses, firstPaid) => firstPaid
    ? base - Number(has(blessings, 'nimble-ledger')) + Number(has(curses, 'tangled-ledger')) : base;
  const treasureGold = (base, blessings, curses) => base > 0
    ? Math.max(0, base + Number(has(blessings, 'bright-coffer')) - Number(has(curses, 'dim-coffer'))) : base;
  const dropChance = (base, blessings, curses) => Math.max(0, Math.min(1,
    base + (has(blessings, 'scrap-spark') ? .01 : 0) - (has(curses, 'damp-scrap') ? .01 : 0)));
  return Object.freeze({ OFFER_CHANCE, PRICE, CATALOG, TUNED_PRICES, get, priceFor, draw, tierWeight, rerollPrice, treasureGold, dropChance });
});
