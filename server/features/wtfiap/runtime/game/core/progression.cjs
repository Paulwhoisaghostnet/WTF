/* Shared commander progression, separate from hero stars.
 * Owner rules: start at level 1; one field slot per level; maximum level 10;
 * completed combat gives 2 XP, a win adds 2 XP; buy 4 XP for 4 gold.
 * COMMANDER_LEVEL_COSTS exports the owner's accepted incremental costs. Match
 * configuration must still pass xpCosts explicitly; no silent default is used.
 * Overflow XP remains recorded, including at maximum level.
 * The authoritative match reducer validates completion/phase/ownership and
 * supplies availableGold. It must atomically persist this state and any gold
 * debit using expectedRevision. Browser results alone cannot grant XP or gold.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ABProgression = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const RULES = Object.freeze({ startingLevel: 1, maximumLevel: 10, combatXP: 2, winBonusXP: 2, purchaseXP: 4, purchaseGold: 4 });
  const COMMANDER_LEVEL_COSTS = Object.freeze([2, 4, 8, 16, 24, 32, 48, 64, 72]);
  class ProgressionError extends Error {
    constructor(code, message) { super(message); this.name = 'ProgressionError'; this.code = code; }
  }
  function demand(condition, code, message) { if (!condition) throw new ProgressionError(code, message); }
  function keys(value, required, label) {
    demand(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_RECORD', label + ' must be an object.');
    demand(Object.keys(value).length === required.length && required.every(key => Object.prototype.hasOwnProperty.call(value, key)),
      'INVALID_FIELDS', label + ' must provide exactly: ' + required.join(', ') + '.');
  }
  function identifier(value, label) {
    demand(typeof value === 'string' && value.trim().length > 0, 'INVALID_ID', label + ' must be a nonempty string.');
  }
  function integer(value, label) {
    demand(Number.isSafeInteger(value) && value >= 0, 'INVALID_INTEGER', label + ' must be a nonnegative safe integer.');
  }
  function jsonClone(value) {
    const ancestors = new Set();
    function visit(item) {
      if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
      if (typeof item === 'number') { demand(Number.isFinite(item), 'INVALID_JSON', 'JSON numbers must be finite.'); return; }
      demand(typeof item === 'object', 'INVALID_JSON', 'Commands and state must contain only JSON data.');
      demand(!ancestors.has(item), 'INVALID_JSON', 'JSON data cannot contain cycles.');
      const prototype = Object.getPrototypeOf(item);
      demand(Array.isArray(item) || prototype === Object.prototype || prototype === null,
        'INVALID_JSON', 'JSON records must be plain objects.');
      const names = Reflect.ownKeys(item);
      demand(names.every(key => typeof key === 'string'), 'INVALID_JSON', 'JSON data cannot have symbol keys.');
      if (Array.isArray(item)) demand(names.length === item.length + 1 && names.includes('length') &&
        Array.from({ length: item.length }, (_, index) => String(index)).every(key => names.includes(key)),
      'INVALID_JSON', 'JSON arrays must be dense and have no extra properties.');
      ancestors.add(item);
      for (const key of names) {
        if (Array.isArray(item) && key === 'length') continue;
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        demand(descriptor.enumerable && Object.prototype.hasOwnProperty.call(descriptor, 'value'),
          'INVALID_JSON', 'JSON data cannot contain accessors or hidden properties.');
        visit(descriptor.value);
      }
      ancestors.delete(item);
    }
    visit(value); return JSON.parse(JSON.stringify(value));
  }
  function frozen(value) {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) frozen(child);
      Object.freeze(value);
    }
    return value;
  }
  function curve(xpCosts) {
    demand(Array.isArray(xpCosts) && xpCosts.length === RULES.maximumLevel - RULES.startingLevel,
      'INVALID_CURVE', 'Provide exactly nine increasing level costs.');
    let previous = 0;
    for (const cost of xpCosts) {
      integer(cost, 'Level XP cost');
      demand(cost > previous, 'INVALID_CURVE', 'Level costs must be positive and strictly increasing.'); previous = cost;
    }
  }
  function progress(totalEarnedXP, xpCosts) {
    let level = RULES.startingLevel, xpIntoLevel = totalEarnedXP;
    while (level < RULES.maximumLevel && xpIntoLevel >= xpCosts[level - RULES.startingLevel]) {
      xpIntoLevel -= xpCosts[level - RULES.startingLevel]; level++;
    }
    return { level, fieldCapacity: level, xpIntoLevel };
  }
  function addXP(total, amount) {
    const next = total + amount;
    // Exact JavaScript arithmetic is required; this is not a gameplay XP cap.
    demand(Number.isSafeInteger(next), 'ARITHMETIC_OVERFLOW', 'Total earned XP cannot be represented exactly.'); return next;
  }
  function combatXP(status, outcome) {
    demand(status === 'completed', 'COMBAT_NOT_COMPLETED', 'Only a completed combat grants commander XP.');
    demand(['win', 'loss', 'draw'].includes(outcome), 'INVALID_OUTCOME', 'Completed outcome must be win, loss or draw.');
    return RULES.combatXP + (outcome === 'win' ? RULES.winBonusXP : 0);
  }
  function validate(state) {
    jsonClone(state);
    keys(state, ['schemaVersion', 'matchId', 'playerId', 'xpCosts', 'totalEarnedXP', 'level', 'fieldCapacity',
      'xpIntoLevel', 'revision', 'receipts'], 'Commander progression');
    demand(state.schemaVersion === 1, 'INVALID_VERSION', 'Unsupported commander progression schema.');
    identifier(state.matchId, 'Match ID'); identifier(state.playerId, 'Player ID'); curve(state.xpCosts);
    for (const key of ['totalEarnedXP', 'level', 'fieldCapacity', 'xpIntoLevel', 'revision']) integer(state[key], key);
    demand(Array.isArray(state.receipts), 'INVALID_RECEIPTS', 'Receipts must be an array.');
    demand(state.revision === state.receipts.length, 'INVALID_REVISION', 'Every accepted award or purchase has one revision.');
    const rounds = new Set(), combats = new Set(), purchases = new Set();
    let total = 0;
    for (const [index, receipt] of state.receipts.entries()) {
      const common = ['kind', 'matchId', 'playerId', 'revision', 'xpGranted', 'totalEarnedXPBefore', 'totalEarnedXPAfter', 'levelBefore', 'levelAfter'];
      demand(receipt && ['combat', 'purchase'].includes(receipt.kind), 'INVALID_RECEIPT', 'Unsupported progression receipt kind.');
      keys(receipt, [...common, ...(receipt.kind === 'combat' ? ['roundId', 'combatId', 'status', 'outcome']
        : ['purchaseId', 'availableGold', 'goldSpent', 'resultingGold'])], 'Progression receipt');
      demand(receipt.matchId === state.matchId && receipt.playerId === state.playerId,
        'IDENTITY_MISMATCH', 'Receipt identity differs from its match/player state.');
      demand(receipt.revision === index + 1, 'INVALID_REVISION', 'Receipt revisions must follow durable award order.');
      const before = progress(total, state.xpCosts);
      let amount;
      if (receipt.kind === 'combat') {
        identifier(receipt.roundId, 'Round ID'); identifier(receipt.combatId, 'Combat ID');
        demand(!rounds.has(receipt.roundId) && !combats.has(receipt.combatId), 'COMBAT_ALREADY_AWARDED', 'A round/combat can grant XP only once.');
        rounds.add(receipt.roundId); combats.add(receipt.combatId); amount = combatXP(receipt.status, receipt.outcome);
      } else {
        identifier(receipt.purchaseId, 'Purchase ID');
        demand(!purchases.has(receipt.purchaseId), 'PURCHASE_ALREADY_APPLIED', 'An XP purchase can apply only once.'); purchases.add(receipt.purchaseId);
        demand(before.level < RULES.maximumLevel, 'MAX_LEVEL', 'Do not spend gold on XP at maximum commander level.');
        integer(receipt.availableGold, 'Available gold');
        demand(receipt.availableGold >= RULES.purchaseGold, 'INSUFFICIENT_GOLD', 'A complete XP pack costs four gold.');
        demand(receipt.goldSpent === RULES.purchaseGold && receipt.resultingGold === receipt.availableGold - RULES.purchaseGold,
          'INVALID_GOLD_RECEIPT', 'Purchase receipt must deduct exactly four gold.'); amount = RULES.purchaseXP;
      }
      const nextTotal = addXP(total, amount), after = progress(nextTotal, state.xpCosts);
      demand(receipt.xpGranted === amount && receipt.totalEarnedXPBefore === total && receipt.totalEarnedXPAfter === nextTotal &&
        receipt.levelBefore === before.level && receipt.levelAfter === after.level,
      'INVALID_XP_RECEIPT', 'Receipt must record the exact XP grant and derived level transition.'); total = nextTotal;
    }
    demand(state.totalEarnedXP === total, 'INVALID_TOTAL_XP', 'Total XP must equal durable receipt grants.');
    const expected = progress(total, state.xpCosts);
    demand(state.level === expected.level && state.fieldCapacity === expected.fieldCapacity && state.xpIntoLevel === expected.xpIntoLevel,
      'INVALID_PROGRESS', 'Level, capacity and overflow XP must follow the explicit curve.');
    return true;
  }
  function createProgression(options) {
    const input = jsonClone(options); keys(input, ['matchId', 'playerId', 'xpCosts'], 'Commander progression options');
    const state = { schemaVersion: 1, matchId: input.matchId, playerId: input.playerId, xpCosts: input.xpCosts,
      totalEarnedXP: 0, level: RULES.startingLevel, fieldCapacity: RULES.startingLevel, xpIntoLevel: 0, revision: 0, receipts: [] };
    validate(state); return frozen(state);
  }
  function apply(state, action, kind) {
    try {
      validate(state); const command = jsonClone(action);
      keys(command, ['matchId', 'playerId', 'expectedRevision', ...(kind === 'combat'
        ? ['roundId', 'combatId', 'status', 'outcome'] : ['purchaseId', 'availableGold'])], 'Commander progression command');
      demand(command.matchId === state.matchId && command.playerId === state.playerId,
        'IDENTITY_MISMATCH', 'Command belongs to another match or player.');
      integer(command.expectedRevision, 'Expected revision');
      demand(command.expectedRevision === state.revision, 'REVISION_CONFLICT', 'Reload the authoritative progression before retrying.');
      let amount, details;
      if (kind === 'combat') {
        identifier(command.roundId, 'Round ID'); identifier(command.combatId, 'Combat ID');
        demand(!state.receipts.some(receipt => receipt.kind === 'combat' &&
          (receipt.roundId === command.roundId || receipt.combatId === command.combatId)),
        'COMBAT_ALREADY_AWARDED', 'This round or combat already granted commander XP.');
        amount = combatXP(command.status, command.outcome);
        details = { roundId: command.roundId, combatId: command.combatId, status: command.status, outcome: command.outcome };
      } else {
        identifier(command.purchaseId, 'Purchase ID');
        demand(!state.receipts.some(receipt => receipt.kind === 'purchase' && receipt.purchaseId === command.purchaseId),
          'PURCHASE_ALREADY_APPLIED', 'This XP purchase already applied.');
        demand(state.level < RULES.maximumLevel, 'MAX_LEVEL', 'Do not spend gold on XP at maximum commander level.');
        integer(command.availableGold, 'Available gold');
        demand(command.availableGold >= RULES.purchaseGold, 'INSUFFICIENT_GOLD', 'A complete XP pack costs four gold.');
        amount = RULES.purchaseXP; details = { purchaseId: command.purchaseId, availableGold: command.availableGold,
          goldSpent: RULES.purchaseGold, resultingGold: command.availableGold - RULES.purchaseGold };
      }
      const totalEarnedXP = addXP(state.totalEarnedXP, amount), after = progress(totalEarnedXP, state.xpCosts);
      const receipt = { kind, matchId: state.matchId, playerId: state.playerId, revision: state.revision + 1,
        xpGranted: amount, totalEarnedXPBefore: state.totalEarnedXP, totalEarnedXPAfter: totalEarnedXP,
        levelBefore: state.level, levelAfter: after.level, ...details };
      const next = jsonClone(state); Object.assign(next, after, { totalEarnedXP, revision: receipt.revision }); next.receipts.push(receipt);
      validate(next); return frozen({ ok: true, state: frozen(next), receipt });
    } catch (error) {
      if (!(error instanceof ProgressionError)) throw error;
      return { ok: false, state, receipt: null, error: { code: error.code, message: error.message } };
    }
  }
  function awardCompletedCombat(state, command) { return apply(state, command, 'combat'); }
  function purchaseXP(state, command) { return apply(state, command, 'purchase'); }
  function serialize(state) { validate(state); return JSON.stringify(state); }
  function restore(serialized) {
    demand(typeof serialized === 'string', 'INVALID_SERIALIZATION', 'Serialized progression must be a JSON string.');
    let state;
    try { state = JSON.parse(serialized); }
    catch (_) { throw new ProgressionError('INVALID_SERIALIZATION', 'Serialized progression is not valid JSON.'); }
    validate(state); return frozen(state);
  }
  return Object.freeze({ RULES, COMMANDER_LEVEL_COSTS, ProgressionError, createProgression, awardCompletedCombat, purchaseXP, validate, serialize, restore });
});
