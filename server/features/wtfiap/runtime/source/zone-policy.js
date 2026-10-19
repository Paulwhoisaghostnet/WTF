/* Zone Defense prototype policy. The owner delegated choosing and tuning
 * bonuses; these explicit initial values are shared by every match authority.
 * Rotational pairs keep preparation previews equivalent for both combat sides.
 * A fresh round seed shuffles the six benefits. Resizing does not change draws.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ABZonePolicy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const BENEFITS = Object.freeze([
    { stat: 'hp-regen', magnitude: 0.01, duration: 0 },
    { stat: 'damage', magnitude: 0.1, duration: 0 },
    { stat: 'speed', magnitude: 0.1, duration: 0 },
    { stat: 'ability-regen', magnitude: 0.2, duration: 0 },
    { stat: 'gold', magnitude: 1, duration: 0, threshold: 10 },
    { stat: 'clone', magnitude: 1, duration: 8, threshold: 5 }
  ].map(Object.freeze));
  const clone = value => JSON.parse(JSON.stringify(value));
  const demand = (condition, message) => { if (!condition) throw new Error(message); };
  function equal(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(b);
    return keys.length === Object.keys(a).length && keys.every(key => Object.hasOwn(a, key) && equal(a[key], b[key]));
  }
  function rectangles(board) {
    demand(board && Number.isSafeInteger(board.columns) && board.columns > 0 && Number.isSafeInteger(board.rows) && board.rows > 0, 'Zones need positive integer board dimensions.');
    // Both commanders deploy in their two rear rows. Only the intervening
    // contested strip grants zone benefits; four-row opening boards have none.
    const left = -0.5, top = 1.5, right = board.columns - 0.5, bottom = board.rows - 2.5;
    if (bottom <= top) return [];
    const midCol = (left + right) / 2, midRow = (top + bottom) / 2;
    return [
      { id: 'NW', rect: { left, top, right: midCol, bottom: midRow } },
      { id: 'NE', rect: { left: midCol, top, right, bottom: midRow } },
      { id: 'SW', rect: { left, top: midRow, right: midCol, bottom } },
      { id: 'SE', rect: { left: midCol, top: midRow, right, bottom } }
    ];
  }
  function create(board, random) {
    demand(typeof random === 'function', 'Supply the seeded round random generator.');
    const benefits = BENEFITS.map(clone);
    for (let index = benefits.length - 1; index > 0; index--) {
      const draw = random(); demand(Number.isFinite(draw) && draw >= 0 && draw < 1, 'Zone random draws must be in [0, 1).');
      const next = Math.floor(draw * (index + 1)); [benefits[index], benefits[next]] = [benefits[next], benefits[index]];
    }
    return { zones: rectangles(board).map((zone, index) => ({ ...zone, benefit: clone(benefits[index === 0 || index === 3 ? 0 : 1]) })) };
  }
  function validate(assignment, board, random) {
    demand(equal(assignment, create(board, random)), 'Zone assignments must match the board and seeded preparation policy.'); return true;
  }
  function goldPayouts(assignment, events) {
    const payouts = { player: 0, enemy: 0 }, paid = new Set();
    for (const event of events.filter(event => event.type === 'zone-gold')) {
      const zone = assignment?.zones.find(zone => zone.id === event.zoneId);
      demand(zone?.benefit.stat === 'gold' && Object.hasOwn(payouts, event.side) && event.amount === zone.benefit.magnitude && !paid.has(zone.id),
        'Zone gold must be one verified configured award per zone.');
      paid.add(zone.id); payouts[event.side] += event.amount;
      demand(Number.isSafeInteger(payouts[event.side]), 'Zone gold exceeds exact numeric representation.');
    }
    return payouts;
  }
  return Object.freeze({ BENEFITS, create, validate, goldPayouts });
});
