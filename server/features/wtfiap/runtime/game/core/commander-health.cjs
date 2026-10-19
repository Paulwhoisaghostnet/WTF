/* Shared local commander health/outcome core; not a match service.
 * Owner rules: two commanders start with 100 HP, retain HP across rounds and
 * lose at zero. Damage comes only from surviving opposing heroes. Explicit
 * startingHP binds a match's rule version. Each hero contributes
 * ceil((stars + cost) * hp / maxHp), rounded separately before summing.
 * Zero damage is valid; no round cap, healing, shields or terminal draw is
 * introduced. A mutually eliminated pair of armies has no survivors/damage.
 * The future authoritative match reducer authenticates the completed result,
 * resolves its winner and verifies survivor ownership/stars/cost/current HP
 * and actual combat max HP, then atomically persists this state
 * using expectedRevision. Browser results alone do not authorize settlement.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ABCommanderHealth = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const COMMANDER_STARTING_HP = 100;
  class CommanderHealthError extends Error {
    constructor(code, message) { super(message); this.name = 'CommanderHealthError'; this.code = code; }
  }
  function demand(condition, code, message) { if (!condition) throw new CommanderHealthError(code, message); }
  function keys(value, required, label) {
    demand(value !== null && typeof value === 'object' && !Array.isArray(value), 'INVALID_RECORD', label + ' must be an object.');
    demand(Object.keys(value).length === required.length && required.every(key => Object.prototype.hasOwnProperty.call(value, key)),
      'INVALID_FIELDS', label + ' must provide exactly: ' + required.join(', ') + '.');
  }
  function identifier(value, label) {
    demand(typeof value === 'string' && value.trim().length > 0, 'INVALID_ID', label + ' must be a nonempty string.');
  }
  function integer(value, label) {
    // Revisions require exact integer identities; this is not a round cap.
    demand(Number.isSafeInteger(value) && value >= 0, 'INVALID_INTEGER', label + ' must be a nonnegative safe integer.');
  }
  function nonnegative(value, label) {
    demand(typeof value === 'number' && Number.isFinite(value) && value >= 0,
      'INVALID_NUMBER', label + ' must be a finite nonnegative number.');
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
  function combatWinner(players, winnerId, heroes) {
    if (winnerId === null) {
      demand(heroes.length === 0, 'INVALID_DRAW_SURVIVORS', 'Mutual elimination requires no surviving heroes.');
      return;
    }
    identifier(winnerId, 'Combat winner ID');
    demand(players.some(player => player.playerId === winnerId), 'UNKNOWN_WINNER', 'Combat winner must be a match participant.');
  }
  function decimalParts(value) {
    const [mantissa, exponent = '0'] = value.toString().split('e');
    const [whole, fraction = ''] = mantissa.split('.');
    return { coefficient: BigInt(whole + fraction), exponent: Number(exponent) - fraction.length };
  }
  function ceilHealthRatio(points, hp, maxHp) {
    // Evaluate hp/maxHp using the canonical decimal snapshots exactly before
    // rounding each hero upward. Binary division can turn 8*(.07/.08) into
    // 7.000000000000001; an epsilon would erase legitimate above-boundary HP.
    // BigInt also prevents overflow/underflow for finite exponent notation.
    const current = decimalParts(hp), maximum = decimalParts(maxHp);
    let numerator = BigInt(points) * current.coefficient, denominator = maximum.coefficient;
    const exponent = current.exponent - maximum.exponent;
    if (exponent >= 0) numerator *= 10n ** BigInt(exponent);
    else denominator *= 10n ** BigInt(-exponent);
    return Number((numerator + denominator - 1n) / denominator);
  }
  function heroDamage(hero) {
    keys(hero, ['stars', 'cost', 'hp', 'maxHp'], 'Hero health snapshot');
    demand(Number.isInteger(hero.stars) && hero.stars >= 1 && hero.stars <= 3,
      'INVALID_STARS', 'Hero stars must be from one through three.');
    demand(Number.isInteger(hero.cost) && hero.cost >= 1 && hero.cost <= 5,
      'INVALID_COST', 'Hero cost must be from one through five.');
    nonnegative(hero.hp, 'Hero HP'); nonnegative(hero.maxHp, 'Hero maximum HP');
    demand(hero.maxHp > 0 && hero.hp <= hero.maxHp, 'INVALID_HERO_HEALTH', 'Hero maximum HP must be positive and current HP cannot exceed it.');
    if (hero.hp === 0) return 0;
    return ceilHealthRatio(hero.stars + hero.cost, hero.hp, hero.maxHp);
  }
  function calculateHeroDamage(hero) { return heroDamage(jsonClone(hero)); }
  function survivorDamage(heroes, isReceipt = false) {
    demand(Array.isArray(heroes), 'INVALID_SURVIVORS', 'Surviving heroes must be an explicit array.');
    const units = new Set(), snapshots = []; let damage = 0;
    for (const hero of heroes) {
      keys(hero, isReceipt ? ['unitId', 'stars', 'cost', 'hp', 'maxHp', 'damage'] : ['unitId', 'stars', 'cost', 'hp', 'maxHp'], 'Surviving hero');
      identifier(hero.unitId, 'Surviving unit ID');
      demand(!units.has(hero.unitId), 'DUPLICATE_SURVIVOR', 'A surviving unit may contribute damage only once.'); units.add(hero.unitId);
      const contribution = heroDamage({ stars: hero.stars, cost: hero.cost, hp: hero.hp, maxHp: hero.maxHp });
      if (isReceipt) demand(hero.damage === contribution, 'INVALID_HERO_DAMAGE', 'Receipt damage must match the saved hero snapshot.');
      demand(Number.isSafeInteger(damage + contribution), 'ARITHMETIC_OVERFLOW', 'Total survivor damage must be exactly representable.');
      damage += contribution; snapshots.push({ ...hero, damage: contribution });
    }
    return { damage, snapshots };
  }
  function validate(state) {
    jsonClone(state);
    keys(state, ['schemaVersion', 'matchId', 'startingHP', 'phase', 'players', 'winnerId', 'revision', 'receipts'], 'Commander health match');
    demand(state.schemaVersion === 2, 'INVALID_VERSION', 'Unsupported commander health schema; old receipts require an explicit migration.');
    identifier(state.matchId, 'Match ID'); nonnegative(state.startingHP, 'Starting HP');
    demand(state.startingHP > 0, 'INVALID_STARTING_HP', 'Starting HP must be explicitly positive.');
    demand(['active', 'finished'].includes(state.phase), 'INVALID_PHASE', 'Match phase must be active or finished.');
    demand(Array.isArray(state.players) && state.players.length === 2, 'PLAYER_COUNT', 'A match requires exactly two commanders.');
    const playerIds = new Set();
    for (const player of state.players) {
      keys(player, ['playerId', 'hp'], 'Commander'); identifier(player.playerId, 'Player ID'); nonnegative(player.hp, 'Commander HP');
      demand(!playerIds.has(player.playerId), 'DUPLICATE_PLAYER', 'Commanders must be distinct.'); playerIds.add(player.playerId);
    }
    integer(state.revision, 'Match revision');
    demand(Array.isArray(state.receipts), 'INVALID_RECEIPTS', 'Receipts must be an array.');
    demand(state.revision === state.receipts.length, 'INVALID_REVISION', 'Every accepted combat has one revision.');
    const replayed = state.players.map(player => ({ playerId: player.playerId, hp: state.startingHP }));
    const rounds = new Set(), combats = new Set();
    let phase = 'active', matchWinner = null;
    for (const [index, receipt] of state.receipts.entries()) {
      keys(receipt, ['matchId', 'roundId', 'combatId', 'revision', 'status', 'winnerId', 'loserId',
        'survivingHeroes', 'damage', 'appliedDamage', 'hpBefore', 'hpAfter', 'phaseAfter', 'matchWinnerId'], 'Combat health receipt');
      demand(phase === 'active', 'MATCH_FINISHED', 'No combats may apply after a commander has lost.');
      demand(receipt.matchId === state.matchId, 'MATCH_MISMATCH', 'Receipt belongs to another match.');
      identifier(receipt.roundId, 'Round ID'); identifier(receipt.combatId, 'Combat ID');
      demand(!rounds.has(receipt.roundId) && !combats.has(receipt.combatId),
        'COMBAT_ALREADY_APPLIED', 'A round or combat may affect commander HP only once.');
      rounds.add(receipt.roundId); combats.add(receipt.combatId);
      demand(receipt.revision === index + 1, 'INVALID_REVISION', 'Receipt revisions must follow durable combat order.');
      demand(receipt.status === 'completed', 'COMBAT_NOT_COMPLETED', 'Only a completed combat may affect commander HP.');
      const { damage } = survivorDamage(receipt.survivingHeroes, true);
      combatWinner(replayed, receipt.winnerId, receipt.survivingHeroes);
      demand(receipt.damage === damage, 'INVALID_HEALTH_RECEIPT', 'Combat damage must equal surviving hero contributions only.');
      const loser = receipt.winnerId === null ? null : replayed.find(player => player.playerId !== receipt.winnerId);
      const before = loser ? loser.hp : null;
      if (loser) loser.hp = Math.max(0, before - damage);
      if (loser && loser.hp === 0) { phase = 'finished'; matchWinner = receipt.winnerId; }
      demand(receipt.loserId === (loser ? loser.playerId : null) && receipt.hpBefore === before && receipt.hpAfter === (loser ? loser.hp : null) &&
        receipt.appliedDamage === (loser ? before - loser.hp : 0) && receipt.phaseAfter === phase && receipt.matchWinnerId === matchWinner,
      'INVALID_HEALTH_RECEIPT', 'Receipt must match carried health, applied damage and the zero-HP outcome.');
    }
    demand(state.phase === phase && state.winnerId === matchWinner &&
      state.players.every((player, index) => player.hp === replayed[index].hp),
    'INVALID_HEALTH_STATE', 'Commander health and match outcome must follow durable combat receipts.');
    return true;
  }
  function createMatch(options) {
    const input = jsonClone(options); keys(input, ['matchId', 'playerIds', 'startingHP'], 'Commander health options');
    demand(Array.isArray(input.playerIds) && input.playerIds.length === 2, 'PLAYER_COUNT', 'A match requires exactly two commanders.');
    const state = { schemaVersion: 2, matchId: input.matchId, startingHP: input.startingHP, phase: 'active',
      players: input.playerIds.map(playerId => ({ playerId, hp: input.startingHP })), winnerId: null, revision: 0, receipts: [] };
    validate(state); return frozen(state);
  }
  function applyCombatResult(state, action) {
    try {
      validate(state); const command = jsonClone(action);
      keys(command, ['matchId', 'roundId', 'combatId', 'expectedRevision', 'status', 'winnerId', 'survivingHeroes'], 'Combat result');
      demand(command.matchId === state.matchId, 'MATCH_MISMATCH', 'Combat result belongs to another match.');
      identifier(command.roundId, 'Round ID'); identifier(command.combatId, 'Combat ID'); integer(command.expectedRevision, 'Expected revision');
      demand(command.expectedRevision === state.revision, 'REVISION_CONFLICT', 'Reload the authoritative match before retrying.');
      demand(state.phase === 'active', 'MATCH_FINISHED', 'The match already has a surviving commander winner.');
      demand(!state.receipts.some(receipt => receipt.roundId === command.roundId || receipt.combatId === command.combatId),
        'COMBAT_ALREADY_APPLIED', 'This round or combat already affected commander HP.');
      demand(command.status === 'completed', 'COMBAT_NOT_COMPLETED', 'Only a completed combat may affect commander HP.');
      const { damage, snapshots } = survivorDamage(command.survivingHeroes);
      combatWinner(state.players, command.winnerId, command.survivingHeroes);
      const next = jsonClone(state), loser = command.winnerId === null ? null : next.players.find(player => player.playerId !== command.winnerId);
      const before = loser ? loser.hp : null;
      if (loser) loser.hp = Math.max(0, before - damage); next.revision++;
      if (loser && loser.hp === 0) { next.phase = 'finished'; next.winnerId = command.winnerId; }
      const receipt = { matchId: state.matchId, roundId: command.roundId, combatId: command.combatId,
        revision: next.revision, status: command.status, winnerId: command.winnerId, loserId: loser ? loser.playerId : null,
        survivingHeroes: snapshots, damage, appliedDamage: loser ? before - loser.hp : 0, hpBefore: before, hpAfter: loser ? loser.hp : null,
        phaseAfter: next.phase, matchWinnerId: next.winnerId };
      next.receipts.push(receipt); validate(next);
      return frozen({ ok: true, state: frozen(next), receipt });
    } catch (error) {
      if (!(error instanceof CommanderHealthError)) throw error;
      return { ok: false, state, receipt: null, error: { code: error.code, message: error.message } };
    }
  }
  function serialize(state) { validate(state); return JSON.stringify(state); }
  function restore(serialized) {
    demand(typeof serialized === 'string', 'INVALID_SERIALIZATION', 'Serialized health match must be a JSON string.');
    let state;
    try { state = JSON.parse(serialized); }
    catch (_) { throw new CommanderHealthError('INVALID_SERIALIZATION', 'Serialized health match is not valid JSON.'); }
    validate(state); return frozen(state);
  }
  return Object.freeze({ COMMANDER_STARTING_HP, CommanderHealthError, calculateHeroDamage, createMatch, applyCombatResult, validate, serialize, restore });
});
