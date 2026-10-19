/* Shared persistent planning state. No economy, item effects or battle mutation.
 * Limits come from the existing user-approved engine: 5x5 board, ten bench
 * slots, commander levels 1..10, stars 1..3, three matching copies to evolve.
 * Equipment capacity and deployment side are supplied by the caller.
 */
(function (root, factory) {
  'use strict';
  const api = factory(typeof module !== 'undefined' && module.exports
    ? require('../../source/engine.js') : root.AB);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ABArmy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (engine) {
  'use strict';
  if (!engine || !Array.isArray(engine.ROSTER)) throw new Error('Army requires the shared hero engine.');
  const heroIds = new Set(engine.ROSTER.map(hero => hero.id));
  const RULES = Object.freeze({ columns: 5, rows: 5, benchCapacity: 10,
    commanderMin: 1, commanderMax: 10, starMin: 1, starMax: 3, mergeCopies: 3 });

  class ArmyError extends Error {
    constructor(code, message) { super(message); this.name = 'ArmyError'; this.code = code; }
  }
  function demand(condition, code, message) { if (!condition) throw new ArmyError(code, message); }
  function id(value, label) {
    demand(typeof value === 'string' && value.trim().length > 0, 'INVALID_ID', label + ' must be a nonempty string.');
  }
  function integer(value, min, max, label) {
    demand(Number.isSafeInteger(value) && value >= min && value <= max,
      'INVALID_NUMBER', label + ' is outside its permitted integer range.');
  }
  function jsonClone(value) {
    const ancestors = new Set();
    function visit(item) {
      if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
      if (typeof item === 'number') {
        demand(Number.isFinite(item), 'INVALID_JSON', 'State values must be finite JSON numbers.'); return;
      }
      demand(typeof item === 'object', 'INVALID_JSON', 'State and item records must contain only JSON data.');
      demand(!ancestors.has(item), 'INVALID_JSON', 'State must not contain cycles.');
      const proto = Object.getPrototypeOf(item);
      demand(Array.isArray(item) || proto === Object.prototype || proto === null,
        'INVALID_JSON', 'State and item records must use plain JSON objects.');
      demand(Object.getOwnPropertySymbols(item).length === 0, 'INVALID_JSON', 'Symbol keys are not JSON data.');
      ancestors.add(item);
      for (const key of Object.keys(item)) visit(item[key]);
      if (Array.isArray(item)) {
        demand(Object.keys(item).length === item.length && Object.keys(item).every((key, index) => key === String(index)),
          'INVALID_JSON', 'Arrays must be dense JSON arrays without extra properties.');
      }
      ancestors.delete(item);
    }
    visit(value);
    return JSON.parse(JSON.stringify(value));
  }
  function frozen(value) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) frozen(child);
      Object.freeze(value);
    }
    return value;
  }
  function record(value, label) {
    demand(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_RECORD', label + ' must be an object.');
  }
  function list(value, label) { demand(Array.isArray(value), 'INVALID_LIST', label + ' must be an array.'); }
  function unique(values, label) {
    demand(new Set(values).size === values.length, 'DUPLICATE_ID', label + ' must be unique.');
  }
  function checkLocation(state, location) {
    record(location, 'Location');
    if (location.zone === 'bench') {
      integer(location.slot, 0, RULES.benchCapacity - 1, 'Bench slot');
      demand(location.col === undefined && location.row === undefined, 'INVALID_LOCATION', 'Bench locations use a slot only.');
    } else if (location.zone === 'field') {
      integer(location.col, 0, RULES.columns - 1, 'Board column');
      const first = state.deploymentSide === 'north' ? 0 : 3;
      integer(location.row, first, first + 1, 'Deployment row');
      demand(location.slot === undefined, 'INVALID_LOCATION', 'Field locations use a column and row only.');
    } else throw new ArmyError('INVALID_LOCATION', 'Location zone must be bench or field.');
  }
  function locationKey(location) {
    return location.zone === 'bench' ? 'bench:' + location.slot : 'field:' + location.col + ':' + location.row;
  }
  function destination(location, unitId) {
    return location.zone === 'bench' ? { unitId, zone: 'bench', slot: location.slot }
      : { unitId, zone: 'field', col: location.col, row: location.row };
  }
  function validate(state) {
    jsonClone(state);
    record(state, 'Army');
    demand(state.schemaVersion === 1, 'INVALID_VERSION', 'Unsupported army schema.');
    id(state.ownerId, 'Owner ID');
    integer(state.commanderLevel, RULES.commanderMin, RULES.commanderMax, 'Commander level');
    integer(state.equipmentSlots, 0, Number.MAX_SAFE_INTEGER, 'Explicit equipment slot count');
    demand(state.deploymentSide === 'north' || state.deploymentSide === 'south', 'INVALID_SIDE', 'Explicit deployment side must be north or south.');
    for (const key of ['units', 'locations', 'items', 'inventory']) list(state[key], key);
    const units = new Set(), items = new Set(), held = [];
    for (const unit of state.units) {
      record(unit, 'Unit'); id(unit.id, 'Unit ID');
      demand(!units.has(unit.id), 'DUPLICATE_ID', 'Unit IDs must be unique.'); units.add(unit.id);
      demand(unit.ownerId === state.ownerId, 'OWNERSHIP', 'Every unit must belong to this army.');
      demand(heroIds.has(unit.heroId), 'UNKNOWN_HERO', 'Hero is not in the shared roster.');
      integer(unit.stars, RULES.starMin, RULES.starMax, 'Hero stars');
      list(unit.itemIds, 'Equipped item IDs');
      demand(unit.itemIds.length <= state.equipmentSlots, 'EQUIPMENT_FULL', 'Unit exceeds its equipment capacity.');
      held.push(...unit.itemIds);
    }
    for (const item of state.items) {
      record(item, 'Item'); id(item.id, 'Item ID');
      demand(!items.has(item.id), 'DUPLICATE_ID', 'Item IDs must be unique.'); items.add(item.id);
      demand(item.ownerId === state.ownerId, 'OWNERSHIP', 'Every item must belong to this army.');
    }
    held.push(...state.inventory);
    for (const itemId of held) {
      id(itemId, 'Item reference');
      demand(items.has(itemId), 'UNKNOWN_ITEM', 'An item reference has no owned record.');
    }
    unique(held, 'Equipped and inventory item references');
    demand(held.length === items.size, 'ITEM_CONSERVATION', 'Every owned item must be equipped or in inventory.');
    const placed = [], cells = [];
    for (const location of state.locations) {
      checkLocation(state, location); id(location.unitId, 'Located unit ID');
      demand(units.has(location.unitId), 'UNKNOWN_UNIT', 'A location has no unit record.');
      placed.push(location.unitId); cells.push(locationKey(location));
    }
    unique(placed, 'Unit locations'); unique(cells, 'Starting positions');
    demand(placed.length === units.size, 'UNIT_CONSERVATION', 'Every unit must have exactly one location.');
    demand(state.locations.filter(location => location.zone === 'field').length <= state.commanderLevel,
      'ARMY_FULL', 'Field at most one hero per commander level.');
    return true;
  }
  function createArmy(options) {
    record(options, 'Army options');
    const state = { schemaVersion: 1, ownerId: options.ownerId, commanderLevel: options.commanderLevel,
      equipmentSlots: options.equipmentSlots, deploymentSide: options.deploymentSide,
      units: [], locations: [], items: [], inventory: [] };
    validate(state); return frozen(state);
  }
  function unitFor(state, unitId) {
    const unit = state.units.find(value => value.id === unitId);
    demand(unit, 'UNKNOWN_UNIT', 'Unit is not owned by this army.'); return unit;
  }
  function itemFor(state, itemId) {
    const item = state.items.find(value => value.id === itemId);
    demand(item, 'UNKNOWN_ITEM', 'Item is not owned by this army.'); return item;
  }
  function locationFor(state, unitId) { return state.locations.find(value => value.unitId === unitId); }
  function move(state, unitId, location, swap) {
    unitFor(state, unitId); checkLocation(state, location);
    const previous = locationFor(state, unitId);
    const occupant = state.locations.find(value => locationKey(value) === locationKey(location));
    demand(!occupant || occupant.unitId === unitId || swap, 'OCCUPIED', 'Destination is occupied; choose an explicit swap.');
    // Replace whole locations so a zone change cannot leave stale slot/row fields.
    if (occupant && occupant.unitId !== unitId) {
      state.locations[state.locations.indexOf(occupant)] = destination(previous, occupant.unitId);
    }
    state.locations[state.locations.indexOf(previous)] = destination(location, unitId);
  }
  function mutate(state, action) {
    switch (action.type) {
      case 'addUnit': {
        record(action.unit, 'Unit');
        demand(!state.units.some(unit => unit.id === action.unit.id), 'DUPLICATE_ID', 'Unit ID already exists.');
        demand(Array.isArray(action.unit.itemIds) && action.unit.itemIds.length === 0,
          'EQUIPPED_IMPORT', 'Add a unit with an empty item list, then equip owned inventory items.');
        checkLocation(state, action.location);
        demand(!state.locations.some(location => locationKey(location) === locationKey(action.location)), 'OCCUPIED', 'Destination is occupied.');
        state.units.push(jsonClone(action.unit)); state.locations.push(destination(action.location, action.unit.id)); break;
      }
      case 'removeUnit': {
        const unit = unitFor(state, action.unitId);
        state.inventory.push(...unit.itemIds);
        state.units = state.units.filter(value => value.id !== unit.id);
        state.locations = state.locations.filter(value => value.unitId !== unit.id); break;
      }
      case 'addItem': {
        record(action.item, 'Item');
        demand(!state.items.some(item => item.id === action.item.id), 'DUPLICATE_ID', 'Item ID already exists.');
        state.items.push(jsonClone(action.item)); state.inventory.push(action.item.id); break;
      }
      case 'removeItem': {
        itemFor(state, action.itemId);
        demand(state.inventory.includes(action.itemId), 'ITEM_EQUIPPED', 'Unequip the item before removing its record.');
        state.inventory = state.inventory.filter(value => value !== action.itemId);
        state.items = state.items.filter(value => value.id !== action.itemId); break;
      }
      case 'equip': {
        const unit = unitFor(state, action.unitId); itemFor(state, action.itemId);
        demand(state.inventory.includes(action.itemId), 'ITEM_EQUIPPED', 'Item must be in inventory before equipping.');
        demand(unit.itemIds.length < state.equipmentSlots, 'EQUIPMENT_FULL', 'Unit has no free equipment slot.');
        state.inventory = state.inventory.filter(value => value !== action.itemId); unit.itemIds.push(action.itemId); break;
      }
      case 'unequip': {
        const unit = unitFor(state, action.unitId); itemFor(state, action.itemId);
        demand(unit.itemIds.includes(action.itemId), 'NOT_EQUIPPED', 'This unit does not carry that item.');
        unit.itemIds = unit.itemIds.filter(value => value !== action.itemId); state.inventory.push(action.itemId); break;
      }
      case 'place': {
        demand(action.location && action.location.zone === 'field', 'INVALID_LOCATION', 'Place requires an explicit field destination.');
        move(state, action.unitId, action.location, false); break;
      }
      case 'recall': {
        unitFor(state, action.unitId);
        demand(locationFor(state, action.unitId).zone === 'field', 'NOT_FIELDED', 'Recall requires a fielded unit.');
        move(state, action.unitId, { zone: 'bench', slot: action.slot }, false); break;
      }
      case 'swap': {
        demand(action.unitId !== action.otherUnitId, 'SAME_UNIT', 'Swap requires two distinct units.');
        unitFor(state, action.unitId); unitFor(state, action.otherUnitId);
        move(state, action.unitId, jsonClone(locationFor(state, action.otherUnitId)), true); break;
      }
      case 'combine': {
        list(action.unitIds, 'Merge unit IDs'); unique(action.unitIds, 'Merge unit IDs');
        demand(action.unitIds.length === RULES.mergeCopies, 'MERGE_COUNT', 'Evolution requires exactly three matching units.');
        demand(action.unitIds.includes(action.retainUnitId), 'MERGE_TARGET', 'Explicit retained unit must be one of the three copies.');
        const target = unitFor(state, action.retainUnitId);
        const copies = action.unitIds.map(unitId => unitFor(state, unitId));
        demand(target.stars < RULES.starMax, 'MAX_STARS', 'Three-star units cannot evolve further.');
        demand(copies.every(unit => unit.heroId === target.heroId && unit.stars === target.stars),
          'MERGE_MISMATCH', 'All copies must share hero identity and star level.');
        list(action.equippedItemIds, 'Explicit retained equipment'); unique(action.equippedItemIds, 'Retained equipment');
        demand(action.equippedItemIds.length <= state.equipmentSlots, 'EQUIPMENT_FULL', 'Retained equipment exceeds capacity.');
        const mergedItems = copies.flatMap(unit => unit.itemIds);
        demand(action.equippedItemIds.every(itemId => mergedItems.includes(itemId)),
          'MERGE_EQUIPMENT', 'Retained equipment must come from the merged units.');
        state.inventory.push(...mergedItems.filter(itemId => !action.equippedItemIds.includes(itemId)));
        const removed = new Set(action.unitIds.filter(unitId => unitId !== target.id));
        state.units = state.units.filter(unit => !removed.has(unit.id));
        state.locations = state.locations.filter(location => !removed.has(location.unitId));
        target.stars += 1; target.itemIds = [...action.equippedItemIds]; break;
      }
      case 'setCommanderLevel': state.commanderLevel = action.level; break;
      default: throw new ArmyError('UNKNOWN_ACTION', 'Unknown army action.');
    }
  }
  function apply(state, action) {
    try {
      validate(state); record(action, 'Action');
      const next = jsonClone(state), command = jsonClone(action);
      mutate(next, command); validate(next);
      return { ok: true, state: frozen(next) };
    } catch (error) {
      if (!(error instanceof ArmyError)) throw error;
      return { ok: false, state, error: { code: error.code, message: error.message } };
    }
  }
  const helpers = {};
  for (const type of ['addUnit', 'removeUnit', 'addItem', 'removeItem', 'equip', 'unequip', 'place', 'recall', 'swap', 'combine', 'setCommanderLevel']) {
    helpers[type] = (state, parameters) => apply(state, { ...parameters, type });
  }
  return Object.freeze({ RULES, ArmyError, createArmy, validate, apply, ...helpers });
});
