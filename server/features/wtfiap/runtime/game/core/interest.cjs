/* Interest award receipts shared by browser and CommonJS.
 * Owner rule: below 10 gold -> 0; floor(gold / 10) from 10 through 68;
 * at least 69 -> 10 interest. Ten caps the award, never held gold.
 * This module does not own a wallet or create starting money. The authoritative
 * match reducer supplies carriedGold after validating preparation-start phase,
 * round eligibility and player authorization. It must atomically persist the
 * returned receipt ledger AND resultingGold using expectedRevision. A browser
 * result alone is not a grant, proof of eligibility, or authoritative balance.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ABInterest = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  class InterestError extends Error {
    constructor(code, message) { super(message); this.name = 'InterestError'; this.code = code; }
  }
  function demand(condition, code, message) { if (!condition) throw new InterestError(code, message); }
  function record(value, label) {
    demand(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_RECORD', label + ' must be an object.');
  }
  function keys(value, required, label) {
    record(value, label);
    demand(Object.keys(value).length === required.length && required.every(key => Object.prototype.hasOwnProperty.call(value, key)),
      'INVALID_FIELDS', label + ' must provide exactly: ' + required.join(', ') + '.');
  }
  function identifier(value, label) {
    demand(typeof value === 'string' && value.trim().length > 0, 'INVALID_ID', label + ' must be a nonempty string.');
  }
  function nonnegativeInteger(value, label) {
    // The safe-integer boundary is exact JavaScript arithmetic, not a gold cap.
    demand(Number.isSafeInteger(value) && value >= 0, 'INVALID_INTEGER', label + ' must be a nonnegative safe integer.');
  }
  function jsonClone(value) {
    const ancestors = new Set();
    function visit(item) {
      if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
      if (typeof item === 'number') {
        demand(Number.isFinite(item), 'INVALID_JSON', 'JSON numbers must be finite.'); return;
      }
      demand(typeof item === 'object', 'INVALID_JSON', 'Commands and receipts must contain only JSON data.');
      demand(!ancestors.has(item), 'INVALID_JSON', 'JSON data cannot contain cycles.');
      const prototype = Object.getPrototypeOf(item);
      demand(Array.isArray(item) || prototype === Object.prototype || prototype === null,
        'INVALID_JSON', 'JSON records must be plain objects.');
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
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) frozen(child);
      Object.freeze(value);
    }
    return value;
  }
  function calculateInterest(gold) {
    nonnegativeInteger(gold, 'Carried gold');
    if (gold >= 69) return 10;
    return Math.floor(gold / 10);
  }
  function resultingBalance(carriedGold, interest) {
    const result = carriedGold + interest;
    demand(Number.isSafeInteger(result), 'ARITHMETIC_OVERFLOW', 'Awarded balance cannot be represented exactly.');
    return result;
  }
  function validate(state) {
    jsonClone(state);
    keys(state, ['schemaVersion', 'matchId', 'playerId', 'revision', 'receipts'], 'Interest receipt ledger');
    demand(state.schemaVersion === 1, 'INVALID_VERSION', 'Unsupported interest ledger schema.');
    identifier(state.matchId, 'Match ID'); identifier(state.playerId, 'Player ID');
    nonnegativeInteger(state.revision, 'Ledger revision');
    demand(Array.isArray(state.receipts), 'INVALID_RECEIPTS', 'Receipts must be an array.');
    demand(state.revision === state.receipts.length, 'INVALID_REVISION', 'Every accepted round award has one revision.');
    const rounds = new Set();
    for (const [index, receipt] of state.receipts.entries()) {
      keys(receipt, ['matchId', 'playerId', 'roundId', 'revision', 'carriedGold', 'interest', 'resultingGold'], 'Interest receipt');
      demand(receipt.matchId === state.matchId && receipt.playerId === state.playerId,
        'IDENTITY_MISMATCH', 'Receipt identity differs from its match/player ledger.');
      identifier(receipt.roundId, 'Round ID');
      demand(!rounds.has(receipt.roundId), 'ROUND_ALREADY_AWARDED', 'A round can receive interest only once.');
      rounds.add(receipt.roundId);
      demand(receipt.revision === index + 1, 'INVALID_REVISION', 'Receipt revisions must follow their durable award order.');
      const interest = calculateInterest(receipt.carriedGold);
      demand(receipt.interest === interest, 'INVALID_INTEREST', 'Receipt does not match the accepted interest rule.');
      demand(receipt.resultingGold === resultingBalance(receipt.carriedGold, interest),
        'INVALID_BALANCE', 'Receipt must record carried gold plus this one award.');
    }
    return true;
  }
  function createLedger(options) {
    const input = jsonClone(options);
    keys(input, ['matchId', 'playerId'], 'Interest ledger options');
    const state = { schemaVersion: 1, matchId: input.matchId, playerId: input.playerId, revision: 0, receipts: [] };
    validate(state); return frozen(state);
  }
  function awardAtPreparationStart(state, action) {
    try {
      validate(state);
      const command = jsonClone(action);
      keys(command, ['matchId', 'playerId', 'roundId', 'expectedRevision', 'carriedGold'], 'Preparation-start award');
      demand(command.matchId === state.matchId && command.playerId === state.playerId,
        'IDENTITY_MISMATCH', 'Award belongs to another match or player.');
      identifier(command.roundId, 'Round ID'); nonnegativeInteger(command.expectedRevision, 'Expected revision');
      demand(command.expectedRevision === state.revision, 'REVISION_CONFLICT', 'Reload the authoritative ledger before retrying.');
      demand(!state.receipts.some(receipt => receipt.roundId === command.roundId),
        'ROUND_ALREADY_AWARDED', 'This round already received its interest award.');
      const interest = calculateInterest(command.carriedGold);
      const receipt = { matchId: state.matchId, playerId: state.playerId, roundId: command.roundId,
        revision: state.revision + 1, carriedGold: command.carriedGold, interest,
        resultingGold: resultingBalance(command.carriedGold, interest) };
      const next = jsonClone(state); next.revision = receipt.revision; next.receipts.push(receipt);
      validate(next);
      return frozen({ ok: true, state: frozen(next), receipt });
    } catch (error) {
      if (!(error instanceof InterestError)) throw error;
      return { ok: false, state, receipt: null, error: { code: error.code, message: error.message } };
    }
  }
  function serialize(state) { validate(state); return JSON.stringify(state); }
  function restore(serialized) {
    demand(typeof serialized === 'string', 'INVALID_SERIALIZATION', 'Serialized ledger must be a JSON string.');
    let state;
    try { state = JSON.parse(serialized); }
    catch (_) { throw new InterestError('INVALID_SERIALIZATION', 'Serialized ledger is not valid JSON.'); }
    validate(state); return frozen(state);
  }
  return Object.freeze({ InterestError, calculateInterest, createLedger, awardAtPreparationStart, validate, serialize, restore });
});
