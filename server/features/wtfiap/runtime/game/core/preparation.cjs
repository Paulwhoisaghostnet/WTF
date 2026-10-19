/* Shared per-round PvP preparation clock. All time comes from the authoritative
 * caller, in Unix milliseconds; this module never reads a client/local clock.
 * The six durations and two players are owner-specified rules. Safe-integer
 * checks protect exact JavaScript timestamp/revision arithmetic, not game caps.
 * Snapshots have already passed match validation and authorization elsewhere.
 * The server must persist returned states with an atomic expected-revision
 * compare-and-swap and publish combat events in that same durable transaction.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ABPreparation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const PREPARATION_SECONDS = Object.freeze([60, 300, 900, 3600, 21600, 86400]);
  class PreparationError extends Error {
    constructor(code, message) { super(message); this.name = 'PreparationError'; this.code = code; }
  }
  function demand(condition, code, message) { if (!condition) throw new PreparationError(code, message); }
  function record(value, label) {
    demand(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_RECORD', label + ' must be an object.');
  }
  function keys(value, required, label) {
    record(value, label);
    const actual = Object.keys(value);
    demand(actual.length === required.length && required.every(key => Object.prototype.hasOwnProperty.call(value, key)),
      'INVALID_FIELDS', label + ' must provide exactly: ' + required.join(', ') + '.');
  }
  function identifier(value, label) {
    demand(typeof value === 'string' && value.trim().length > 0, 'INVALID_ID', label + ' must be a nonempty string.');
  }
  function integer(value, label) {
    demand(Number.isSafeInteger(value), 'INVALID_INTEGER', label + ' must be an exactly representable integer.');
  }
  function revision(value, label) {
    integer(value, label); demand(value >= 0, 'INVALID_REVISION', label + ' cannot be negative.');
  }
  function duration(seconds) {
    demand(PREPARATION_SECONDS.includes(seconds), 'INVALID_DURATION', 'Select an explicit supported preparation duration.');
  }
  function jsonClone(value) {
    const ancestors = new Set();
    function visit(item) {
      if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
      if (typeof item === 'number') {
        demand(Number.isFinite(item), 'INVALID_JSON', 'JSON numbers must be finite.'); return;
      }
      demand(typeof item === 'object', 'INVALID_JSON', 'Snapshots and commands must contain only JSON data.');
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
  function validate(state) {
    jsonClone(state);
    keys(state, ['schemaVersion', 'phase', 'roundId', 'preparationSeconds', 'openedAtMs', 'deadlineAtMs',
      'revision', 'lastAcceptedAtMs', 'players', 'resolvedAtMs'], 'Preparation state');
    demand(state.schemaVersion === 1, 'INVALID_VERSION', 'Unsupported preparation schema.');
    demand(['preparation', 'combat'].includes(state.phase), 'INVALID_PHASE', 'Unknown durable preparation phase.');
    identifier(state.roundId, 'Round ID'); duration(state.preparationSeconds);
    for (const key of ['openedAtMs', 'deadlineAtMs', 'lastAcceptedAtMs']) integer(state[key], key);
    const deadline = state.openedAtMs + state.preparationSeconds * 1000;
    demand(Number.isSafeInteger(deadline) && state.deadlineAtMs === deadline,
      'INVALID_DEADLINE', 'The absolute deadline must match the explicit room duration.');
    revision(state.revision, 'State revision');
    demand(state.lastAcceptedAtMs >= state.openedAtMs, 'INVALID_TIME', 'Accepted time cannot precede opening.');
    demand(Array.isArray(state.players) && state.players.length === 2, 'PLAYER_COUNT', 'Preparation requires exactly two players.');
    const playerIds = new Set();
    for (const player of state.players) {
      keys(player, ['playerId', 'snapshot', 'snapshotRevision', 'savedAtMs'], 'Player preparation');
      identifier(player.playerId, 'Player ID');
      demand(!playerIds.has(player.playerId), 'DUPLICATE_PLAYER', 'Players must be distinct.'); playerIds.add(player.playerId);
      revision(player.snapshotRevision, 'Snapshot revision'); integer(player.savedAtMs, 'Snapshot timestamp');
      demand(player.savedAtMs >= state.openedAtMs && player.savedAtMs < state.deadlineAtMs && player.savedAtMs <= state.lastAcceptedAtMs,
        'INVALID_TIME', 'Saved preparation must precede the deadline and not exceed accepted time.');
    }
    const expectedRevision = state.players.reduce((sum, player) => sum + player.snapshotRevision, state.phase === 'combat' ? 1 : 0);
    demand(Number.isSafeInteger(expectedRevision) && state.revision === expectedRevision,
      'INVALID_REVISION', 'State revision must account for every save and the single resolution.');
    if (state.phase === 'preparation') {
      demand(state.resolvedAtMs === null && state.lastAcceptedAtMs < state.deadlineAtMs,
        'INVALID_PHASE', 'Unresolved preparation has no resolution timestamp.');
    } else {
      integer(state.resolvedAtMs, 'Resolution timestamp');
      demand(state.resolvedAtMs >= state.deadlineAtMs && state.resolvedAtMs === state.lastAcceptedAtMs,
        'INVALID_TIME', 'Combat can resolve only at or after the fixed deadline.');
    }
    return true;
  }
  function createRound(options) {
    const input = jsonClone(options);
    keys(input, ['roundId', 'playerIds', 'preparationSeconds', 'openedAtMs', 'initialSnapshots'], 'Preparation options');
    identifier(input.roundId, 'Round ID'); duration(input.preparationSeconds); integer(input.openedAtMs, 'Opening timestamp');
    demand(Array.isArray(input.playerIds) && input.playerIds.length === 2, 'PLAYER_COUNT', 'Preparation requires exactly two players.');
    input.playerIds.forEach(playerId => identifier(playerId, 'Player ID'));
    demand(new Set(input.playerIds).size === 2, 'DUPLICATE_PLAYER', 'Players must be distinct.');
    demand(Array.isArray(input.initialSnapshots) && input.initialSnapshots.length === 2,
      'SNAPSHOT_COUNT', 'Both players require an explicit initial saved preparation.');
    const initialIds = new Set();
    for (const entry of input.initialSnapshots) {
      keys(entry, ['playerId', 'snapshot'], 'Initial preparation');
      demand(input.playerIds.includes(entry.playerId) && !initialIds.has(entry.playerId),
        'UNKNOWN_PLAYER', 'Each initial snapshot must identify a distinct room player.'); initialIds.add(entry.playerId);
    }
    const state = { schemaVersion: 1, phase: 'preparation', roundId: input.roundId,
      preparationSeconds: input.preparationSeconds, openedAtMs: input.openedAtMs,
      deadlineAtMs: input.openedAtMs + input.preparationSeconds * 1000,
      revision: 0, lastAcceptedAtMs: input.openedAtMs,
      players: input.playerIds.map(playerId => ({ playerId,
        snapshot: input.initialSnapshots.find(entry => entry.playerId === playerId).snapshot,
        snapshotRevision: 0, savedAtMs: input.openedAtMs })), resolvedAtMs: null };
    validate(state); return frozen(state);
  }
  function timestamp(state, atMs) {
    integer(atMs, 'Authoritative timestamp');
    demand(atMs >= state.lastAcceptedAtMs, 'TIME_REWIND', 'Authoritative time cannot move behind an accepted command.');
  }
  function status(state, atMs) {
    validate(state); timestamp(state, atMs);
    return frozen({ roundId: state.roundId, revision: state.revision, deadlineAtMs: state.deadlineAtMs,
      phase: state.phase === 'combat' ? 'combat' : atMs >= state.deadlineAtMs ? 'locked' : 'preparation',
      remainingMs: Math.max(0, state.deadlineAtMs - atMs) });
  }
  function apply(state, action) {
    try {
      validate(state);
      const command = jsonClone(action);
      record(command, 'Preparation command');
      demand(['saveSnapshot', 'resolve'].includes(command.type), 'UNKNOWN_ACTION', 'Only saveSnapshot and resolve are supported.');
      keys(command, command.type === 'saveSnapshot'
        ? ['type', 'roundId', 'expectedRevision', 'atMs', 'playerId', 'snapshot']
        : ['type', 'roundId', 'expectedRevision', 'atMs'], 'Preparation command');
      demand(command.roundId === state.roundId, 'ROUND_MISMATCH', 'Command belongs to another round.');
      revision(command.expectedRevision, 'Expected revision');
      demand(command.expectedRevision === state.revision, 'REVISION_CONFLICT', 'Reload the latest state before retrying.');
      timestamp(state, command.atMs);
      demand(state.phase === 'preparation', 'PHASE_CLOSED', 'This preparation already resolved into combat.');
      const next = jsonClone(state);
      if (command.type === 'saveSnapshot') {
        demand(command.atMs < state.deadlineAtMs, 'DEADLINE_REACHED', 'The shared preparation window is closed.');
        const player = next.players.find(entry => entry.playerId === command.playerId);
        demand(player, 'UNKNOWN_PLAYER', 'Snapshot must belong to a room player.');
        player.snapshot = command.snapshot; player.savedAtMs = command.atMs; player.snapshotRevision++;
      } else {
        demand(command.atMs >= state.deadlineAtMs, 'PREPARATION_OPEN', 'Both players retain the full selected preparation window.');
        next.phase = 'combat'; next.resolvedAtMs = command.atMs;
      }
      next.revision++; next.lastAcceptedAtMs = command.atMs; validate(next);
      const events = command.type === 'resolve' ? [{ type: 'preparation-resolved', roundId: next.roundId,
        revision: next.revision, lockedAtMs: next.deadlineAtMs, resolvedAtMs: next.resolvedAtMs,
        preparations: jsonClone(next.players) }] : [];
      return frozen({ ok: true, state: frozen(next), events });
    } catch (error) {
      if (!(error instanceof PreparationError)) throw error;
      return { ok: false, state, events: [], error: { code: error.code, message: error.message } };
    }
  }
  function serialize(state) { validate(state); return JSON.stringify(state); }
  function restore(serialized) {
    demand(typeof serialized === 'string', 'INVALID_SERIALIZATION', 'Serialized preparation must be a JSON string.');
    let state;
    try { state = JSON.parse(serialized); }
    catch (_) { throw new PreparationError('INVALID_SERIALIZATION', 'Serialized preparation is not valid JSON.'); }
    validate(state); return frozen(state);
  }
  return Object.freeze({ PREPARATION_SECONDS, PreparationError, createRound, validate, apply, status, serialize, restore });
});
