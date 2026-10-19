/* Cumulative Zone Defense occupancy, shared by authoritative combat and review.
 * The caller supplies every zone rectangle and benefit for this preparation.
 * This module tracks leadership only: it does not invent, apply or expire buffs.
 * Rectangles use combat center coordinates. Generic zones use half-open
 * right/bottom edges. The four-quadrant battlefield uses rotationally symmetric
 * seam ownership: the north/west halves of the seams belong to NW, south/east
 * to SE. The exact center and the region's outer boundary are neutral, so
 * entering the contested band is symmetric from either deployment territory.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ABZones = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const demand = (condition, message) => { if (!condition) throw new Error(message); };
  const identifier = value => typeof value === 'string' && value.trim().length > 0;
  const number = value => typeof value === 'number' && Number.isFinite(value);
  const nonnegative = value => number(value) && value >= 0;
  const count = value => Number.isSafeInteger(value) && value >= 0;
  const compareId = (left, right) => left.unitId < right.unitId ? -1 : left.unitId > right.unitId ? 1 : 0;
  const clone = value => JSON.parse(JSON.stringify(value));

  function validateZones(zones) {
    demand(Array.isArray(zones), 'Supply the explicitly configured zone list.');
    const ids = new Set();
    for (const zone of zones) {
      demand(zone && identifier(zone.id) && !ids.has(zone.id), 'Zone IDs must be nonempty and distinct.');
      ids.add(zone.id);
      const rect = zone.rect;
      demand(rect && ['left', 'top', 'right', 'bottom'].every(key => number(rect[key])) && rect.left < rect.right && rect.top < rect.bottom,
        'Each zone requires an explicit rectangle with positive width and height.');
      const benefit = zone.benefit;
      demand(benefit && identifier(benefit.stat) && number(benefit.magnitude) && nonnegative(benefit.duration),
        'Each zone requires an explicit benefit stat, finite magnitude and nonnegative duration.');
      demand(benefit.threshold === undefined || nonnegative(benefit.threshold), 'Zone reward thresholds must be explicit finite nonnegative times.');
    }
    return true;
  }

  function definition(zone) {
    return { id: zone.id,
      rect: { left: zone.rect.left, top: zone.rect.top, right: zone.rect.right, bottom: zone.rect.bottom },
      benefit: { stat: zone.benefit.stat, magnitude: zone.benefit.magnitude, duration: zone.benefit.duration,
        ...(zone.benefit.threshold === undefined ? {} : { threshold: zone.benefit.threshold }) } };
  }

  function create(zones) {
    validateZones(zones);
    return { elapsed: 0, ticks: 0,
      zones: zones.map(zone => ({ ...definition(zone), occupancy: [], championId: null, activeChampionId: null, rewardClaimed: false })) };
  }

  function validateState(state, zones) {
    demand(state && nonnegative(state.elapsed) && count(state.ticks) && Array.isArray(state.zones), 'Invalid zone occupancy state.');
    validateZones(state.zones);
    if (zones !== undefined) {
      validateZones(zones);
      const configured = new Map(zones.map(zone => [zone.id, definition(zone)]));
      demand(state.zones.length === configured.size && state.zones.every(zone => JSON.stringify(definition(zone)) === JSON.stringify(configured.get(zone.id))),
        'Zone assignments changed; create fresh occupancy state for the new battle.');
    }
    for (const zone of state.zones) {
      demand(Array.isArray(zone.occupancy), 'Each zone requires occupancy records.');
      const ids = new Set();
      for (const entry of zone.occupancy) {
        demand(entry && identifier(entry.unitId) && !ids.has(entry.unitId), 'Occupancy unit IDs must be distinct.');
        ids.add(entry.unitId);
        demand(nonnegative(entry.elapsed) && entry.elapsed <= state.elapsed && count(entry.ticks) && entry.ticks <= state.ticks && typeof entry.eligible === 'boolean',
          'Occupancy must contain valid cumulative elapsed time, ticks and eligibility.');
      }
      demand(zone.championId === null || zone.occupancy.some(entry => entry.unitId === zone.championId && entry.eligible && entry.elapsed > 0),
        'A zone champion must be an eligible hero with positive occupancy.');
      demand(typeof zone.rewardClaimed === 'boolean', 'Zone reward claim state must be explicit.');
    }
    return true;
  }

  function update(state, zones, units, dt) {
    validateState(state, zones);
    demand(nonnegative(dt), 'Zone time increments must be finite and nonnegative.');
    demand(Array.isArray(units), 'Supply the authoritative combat unit snapshot.');
    const seen = new Set(), eligible = new Map();
    for (const unit of units) {
      demand(unit && identifier(unit.id) && !seen.has(unit.id), 'Combat unit IDs must be nonempty and distinct.');
      seen.add(unit.id);
      // Treasure and other objectives cannot claim hero zones, even if their
      // snapshots happen to carry an alive flag. Defeated history is retained.
      if (unit.kind === 'treasure' || unit.temporary === true || !identifier(unit.heroId) || unit.alive !== true) continue;
      demand(number(unit.col) && number(unit.row), 'Living heroes require finite combat center coordinates.');
      eligible.set(unit.id, unit);
    }
    const next = clone(state), transitions = [];
    next.elapsed += dt;
    if (dt > 0) next.ticks += 1;
    demand(nonnegative(next.elapsed) && count(next.ticks), 'Zone elapsed time or tick count exceeds numeric representation.');
    for (const zone of next.zones) {
      const records = new Map(zone.occupancy.map(entry => [entry.unitId, entry]));
      for (const entry of records.values()) entry.eligible = eligible.has(entry.unitId);
      for (const unit of eligible.values()) {
        let entry = records.get(unit.id);
        if (!entry) {
          entry = { unitId: unit.id, elapsed: 0, ticks: 0, eligible: true };
          records.set(unit.id, entry);
        }
        const inside = contains(zone, unit, next.zones);
        if (inside && dt > 0) { entry.elapsed += dt; entry.ticks += 1; }
      }
      zone.occupancy = [...records.values()].sort(compareId);
      const contenders = zone.occupancy.filter(entry => entry.eligible && entry.elapsed > 0);
      const longest = contenders.reduce((maximum, entry) => Math.max(maximum, entry.elapsed), 0);
      const leaders = contenders.filter(entry => entry.elapsed === longest);
      // An exact tie cannot award a side merely because it appears first in
      // the unit array. An incumbent keeps a tied lead; otherwise it is vacant.
      const previousChampionId = zone.championId;
      zone.championId = leaders.length === 1 ? leaders[0].unitId
        : leaders.some(entry => entry.unitId === previousChampionId) ? previousChampionId : null;
      const champion = eligible.get(zone.championId);
      zone.activeChampionId = champion && contains(zone, champion, next.zones) ? champion.id : null;
      if (zone.championId !== previousChampionId) transitions.push({ zoneId: zone.id, previousChampionId,
        championId: zone.championId, at: next.elapsed, benefit: clone(zone.benefit) });
    }
    validateState(next, zones);
    Object.assign(state, next);
    return transitions;
  }

  function contains(zone, unit, zones) {
    if (Array.isArray(zones) && zones.length === 4 && ['NW', 'NE', 'SW', 'SE'].every(id => zones.some(item => item.id === id))) {
      const left = Math.min(...zones.map(item => item.rect.left)), right = Math.max(...zones.map(item => item.rect.right));
      const top = Math.min(...zones.map(item => item.rect.top)), bottom = Math.max(...zones.map(item => item.rect.bottom));
      const midCol = (left + right) / 2, midRow = (top + bottom) / 2;
      const quadrants = [[left, top, midCol, midRow], [midCol, top, right, midRow], [left, midRow, midCol, bottom], [midCol, midRow, right, bottom]];
      const isQuadrantLayout = quadrants.every(([x1, y1, x2, y2]) => zones.some(item => item.rect.left === x1 && item.rect.top === y1 && item.rect.right === x2 && item.rect.bottom === y2));
      if (isQuadrantLayout) {
        if (unit.col <= left || unit.col >= right || unit.row <= top || unit.row >= bottom || (unit.col === midCol && unit.row === midRow)) return false;
        // Geometric ownership is unchanged by rotating the board and its zone
        // rectangles for the other player's view. IDs need not match screen
        // compass directions after that projection.
        const west = unit.col < midCol || (unit.col === midCol && unit.row < midRow);
        const north = unit.row < midRow || (unit.row === midRow && unit.col < midCol);
        return zone.rect.left === (west ? left : midCol) && zone.rect.top === (north ? top : midRow);
      }
    }
    return unit.col >= zone.rect.left && unit.col < zone.rect.right && unit.row >= zone.rect.top && unit.row < zone.rect.bottom;
  }
  return { create, update, validateZones, validateState, contains };
});
