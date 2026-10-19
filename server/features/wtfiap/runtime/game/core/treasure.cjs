/* Independent treasure awards shared by CommonJS and the browser.
 * Owner rules: no chests before round five; floor(round / 5) new bonus gold
 * per chest thereafter; a round * 15 second combat window. Each of the two
 * players owns one chest. Defeating an enemy chest transfers that chest's
 * bonus; an uncaptured chest pays its owner. No existing gold is debited.
 *
 * This pure receipt ledger accepts VERIFIED defeat events from authoritative
 * combat code, never client capture claims. It does not simulate chest health,
 * defenses, attacks, abilities, targeting, placement or territory. The service
 * must establish those facts and actual round/combat identities and end time,
 * then atomically persist both player credits and this ledger using its revision.
 * Times are elapsed seconds since this combat began. A defeat transfers gold
 * only strictly before both treasure expiry and combat end; a later defeat
 * leaves gold with the owner. Events after combat end are impossible snapshots.
 * No round winner is used.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ABTreasure = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  class TreasureError extends Error {
    constructor(code, message) { super(message); this.name = 'TreasureError'; this.code = code; }
  }
  function demand(condition, code, message) { if (!condition) throw new TreasureError(code, message); }
  function keys(value, required, label) {
    demand(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_RECORD', label + ' must be an object.');
    demand(Object.keys(value).length === required.length && required.every(key => Object.prototype.hasOwnProperty.call(value, key)),
      'INVALID_FIELDS', label + ' must provide exactly: ' + required.join(', ') + '.');
  }
  function identifier(value, label) {
    demand(typeof value === 'string' && value.trim().length > 0, 'INVALID_ID', label + ' must be a nonempty string.');
  }
  function integer(value, minimum, label) {
    demand(Number.isSafeInteger(value) && value >= minimum, 'INVALID_INTEGER', label + ' must be an exact integer of at least ' + minimum + '.');
  }
  function seconds(value, label) {
    demand(typeof value === 'number' && Number.isFinite(value) && value >= 0, 'INVALID_TIME', label + ' must be finite nonnegative elapsed seconds.');
  }
  function jsonClone(value) {
    const ancestors = new Set();
    function visit(item) {
      if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
      if (typeof item === 'number') { demand(Number.isFinite(item), 'INVALID_JSON', 'JSON numbers must be finite.'); return; }
      demand(typeof item === 'object', 'INVALID_JSON', 'Commands and receipts must contain only JSON data.');
      demand(!ancestors.has(item), 'INVALID_JSON', 'JSON data cannot contain cycles.');
      const prototype = Object.getPrototypeOf(item);
      demand(Array.isArray(item) || prototype === Object.prototype || prototype === null, 'INVALID_JSON', 'JSON records must be plain objects.');
      const names = Reflect.ownKeys(item);
      demand(names.every(key => typeof key === 'string'), 'INVALID_JSON', 'JSON data cannot have symbol keys.');
      if (Array.isArray(item)) {
        demand(names.length === item.length + 1 && names.includes('length') &&
          Array.from({ length: item.length }, (_, index) => String(index)).every(key => names.includes(key)),
        'INVALID_JSON', 'JSON arrays must be dense and have no extra properties.');
      }
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
    if (value && typeof value === 'object') { for (const child of Object.values(value)) frozen(child); Object.freeze(value); }
    return value;
  }
  function calculateRoundTerms(roundNumber) {
    integer(roundNumber, 1, 'Round number');
    const enabled = roundNumber >= 5;
    const treasureWindowSeconds = enabled ? roundNumber * 15 : null;
    // This is JavaScript's exact-integer representation, not a gameplay cap.
    demand(!enabled || Number.isSafeInteger(treasureWindowSeconds), 'ARITHMETIC_OVERFLOW', 'Treasure window cannot be represented exactly.');
    return frozen({ roundNumber, enabled, goldPerChest: enabled ? Math.floor(roundNumber / 5) : 0, treasureWindowSeconds });
  }
  function settlementData(input, playerIds) {
    identifier(input.roundId, 'Round ID'); identifier(input.combatId, 'Combat ID');
    const roundTerms = calculateRoundTerms(input.roundNumber);
    seconds(input.combatEndedAtSeconds, 'Combat end');
    demand(Array.isArray(input.chests), 'INVALID_CHESTS', 'Chests must be an array.');
    demand(Array.isArray(input.verifiedDefeats), 'INVALID_DEFEATS', 'Verified defeats must be an array.');
    demand(input.chests.length === (roundTerms.enabled ? playerIds.length : 0), 'INVALID_CHESTS',
      'Treasure rounds require one chest per player; earlier rounds have none.');
    const chestIds = new Set(), owners = new Set();
    for (const chest of input.chests) {
      keys(chest, ['chestId', 'ownerId'], 'Chest identity'); identifier(chest.chestId, 'Chest ID');
      demand(playerIds.includes(chest.ownerId), 'IDENTITY_MISMATCH', 'Chest owner must belong to this match.');
      demand(!chestIds.has(chest.chestId) && !owners.has(chest.ownerId), 'DUPLICATE_CHEST', 'Chest IDs and their owners must be unique.');
      chestIds.add(chest.chestId); owners.add(chest.ownerId);
    }
    const chests = input.chests.slice().sort((a, b) => playerIds.indexOf(a.ownerId) - playerIds.indexOf(b.ownerId));
    const captures = new Map();
    for (const defeat of input.verifiedDefeats) {
      keys(defeat, ['chestId', 'captorPlayerId', 'defeatedAtSeconds'], 'Verified chest defeat');
      const chest = chests.find(item => item.chestId === defeat.chestId);
      demand(Boolean(chest), 'UNKNOWN_CHEST', 'A defeat must identify a chest in this round.');
      demand(playerIds.includes(defeat.captorPlayerId), 'IDENTITY_MISMATCH', 'Captor must belong to this match.');
      demand(defeat.captorPlayerId !== chest.ownerId, 'SELF_CAPTURE', 'Only enemy units can capture a chest.');
      demand(!captures.has(defeat.chestId), 'DUPLICATE_CAPTURE', 'Each chest can be captured only once.');
      seconds(defeat.defeatedAtSeconds, 'Chest defeat');
      demand(defeat.defeatedAtSeconds <= input.combatEndedAtSeconds, 'COMBAT_ENDED', 'Chest defeat cannot occur after combat end.');
      captures.set(defeat.chestId, defeat);
    }
    const verifiedDefeats = chests.filter(chest => captures.has(chest.chestId)).map(chest => captures.get(chest.chestId));
    const payouts = playerIds.map(playerId => ({ playerId, gold: 0 }));
    for (const chest of chests) {
      const defeat = captures.get(chest.chestId);
      const captured = defeat && defeat.defeatedAtSeconds < roundTerms.treasureWindowSeconds && defeat.defeatedAtSeconds < input.combatEndedAtSeconds;
      const recipient = captured ? defeat.captorPlayerId : chest.ownerId;
      payouts.find(item => item.playerId === recipient).gold += roundTerms.goldPerChest;
    }
    return { roundId: input.roundId, roundNumber: input.roundNumber, combatId: input.combatId,
      combatEndedAtSeconds: input.combatEndedAtSeconds, roundTerms, chests, verifiedDefeats, payouts };
  }
  function validate(state) {
    jsonClone(state);
    keys(state, ['schemaVersion', 'matchId', 'playerIds', 'revision', 'receipts'], 'Treasure ledger');
    demand(state.schemaVersion === 1, 'INVALID_VERSION', 'Unsupported treasure ledger schema.');
    identifier(state.matchId, 'Match ID');
    demand(Array.isArray(state.playerIds) && state.playerIds.length === 2, 'INVALID_PLAYERS', 'A match requires exactly two players.');
    state.playerIds.forEach(playerId => identifier(playerId, 'Player ID'));
    demand(new Set(state.playerIds).size === state.playerIds.length, 'INVALID_PLAYERS', 'The players must be distinct.');
    integer(state.revision, 0, 'Ledger revision');
    demand(Array.isArray(state.receipts), 'INVALID_RECEIPTS', 'Receipts must be an array.');
    demand(state.revision === state.receipts.length, 'INVALID_REVISION', 'Each settled round creates one revision.');
    const rounds = new Set(), numbers = new Set(), combats = new Set();
    for (const [index, receipt] of state.receipts.entries()) {
      keys(receipt, ['matchId', 'revision', 'roundId', 'roundNumber', 'combatId', 'combatEndedAtSeconds', 'roundTerms', 'chests', 'verifiedDefeats', 'payouts'], 'Treasure receipt');
      demand(receipt.matchId === state.matchId, 'IDENTITY_MISMATCH', 'Receipt belongs to another match.');
      demand(receipt.revision === index + 1, 'INVALID_REVISION', 'Receipt revisions must follow their durable settlement order.');
      demand(!rounds.has(receipt.roundId) && !numbers.has(receipt.roundNumber) && !combats.has(receipt.combatId),
        'ROUND_ALREADY_SETTLED', 'A round number, round ID or combat can be settled only once.');
      const expected = settlementData(receipt, state.playerIds);
      for (const key of ['roundTerms', 'chests', 'verifiedDefeats', 'payouts']) {
        demand(JSON.stringify(receipt[key]) === JSON.stringify(expected[key]), 'INVALID_RECEIPT', 'Receipt ' + key + ' must match canonical treasure settlement.');
      }
      rounds.add(receipt.roundId); numbers.add(receipt.roundNumber); combats.add(receipt.combatId);
    }
    return true;
  }
  function createLedger(options) {
    const input = jsonClone(options); keys(input, ['matchId', 'playerIds'], 'Treasure ledger options');
    const state = { schemaVersion: 1, matchId: input.matchId, playerIds: input.playerIds, revision: 0, receipts: [] };
    validate(state); return frozen(state);
  }
  function settleRound(state, action) {
    try {
      validate(state);
      const command = jsonClone(action);
      keys(command, ['matchId', 'roundId', 'roundNumber', 'combatId', 'expectedRevision', 'status', 'combatEndedAtSeconds', 'chests', 'verifiedDefeats'], 'Treasure settlement');
      demand(command.matchId === state.matchId, 'IDENTITY_MISMATCH', 'Settlement belongs to another match.');
      integer(command.expectedRevision, 0, 'Expected revision');
      demand(command.expectedRevision === state.revision, 'REVISION_CONFLICT', 'Reload the authoritative ledger before retrying.');
      demand(command.status === 'completed', 'COMBAT_NOT_COMPLETED', 'Only a completed authoritative combat can settle treasure.');
      demand(!state.receipts.some(receipt => receipt.roundId === command.roundId || receipt.roundNumber === command.roundNumber || receipt.combatId === command.combatId),
        'ROUND_ALREADY_SETTLED', 'This round number, round ID or combat is already settled.');
      const receipt = { matchId: state.matchId, revision: state.revision + 1, ...settlementData(command, state.playerIds) };
      const next = jsonClone(state); next.revision = receipt.revision; next.receipts.push(receipt);
      validate(next);
      return frozen({ ok: true, state: next, receipt });
    } catch (error) {
      if (!(error instanceof TreasureError)) throw error;
      return { ok: false, state, receipt: null, error: { code: error.code, message: error.message } };
    }
  }
  function serialize(state) { validate(state); return JSON.stringify(state); }
  function restore(serialized) {
    demand(typeof serialized === 'string', 'INVALID_SERIALIZATION', 'Serialized ledger must be a JSON string.');
    let state;
    try { state = JSON.parse(serialized); }
    catch (_) { throw new TreasureError('INVALID_SERIALIZATION', 'Serialized ledger is not valid JSON.'); }
    validate(state); return frozen(state);
  }
  return Object.freeze({ TreasureError, calculateRoundTerms, createLedger, settleRound, validate, serialize, restore });
});
