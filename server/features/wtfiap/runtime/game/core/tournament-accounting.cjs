/* Tournament prize accounting only. Expected entry fees are not deposits,
 * quoted pots are unfunded, and allocations never authorize a transfer.
 * Owner rules: eight human entrants; XTZ/WTF room currency; fixed 50/35/15;
 * negative-HP ranking, then final gold, then fielded maximum HP.
 * Exactly equal scores share the combined prizes of occupied places equally.
 * Fractional asset atoms are exact unfunded entitlements, never transfers. */
'use strict';
const crypto = require('node:crypto');
const Tournament = require('./tournament.cjs');
const Party = require('./party.cjs');
const Standings = require('./party-standings.cjs');
const demand = (value, message) => { if (!value) throw new Error(message); };
const clone = value => JSON.parse(JSON.stringify(value));
const identity = value => typeof value === 'string' && value.trim().length > 0;
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
const equal = (a, b) => stable(a) === stable(b);
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function create({ matchId, terms, playerIds }) {
  demand(identity(matchId), 'Tournament accounting requires its match ID.');
  Tournament.validateTerms(terms);
  demand(Array.isArray(playerIds) && playerIds.length === Tournament.ROOM_SIZE && playerIds.every(identity) && new Set(playerIds).size === Tournament.ROOM_SIZE,
    'Tournament accounting requires eight distinct human seat IDs.');
  const ids = [...playerIds].sort();
  return freeze({ schemaVersion: 2, mode: 'accounting-only', fundingStatus: 'unfunded', matchId,
    terms: clone(terms), playerIds: ids, entries: ids.map(playerId => ({ playerId, amountAtomic: terms.entryAtomic, status: 'expected-unfunded' })),
    status: 'pending-results', completion: null });
}
function verifyGroups(ledger, completion) {
  demand(completion && completion.matchId === ledger.matchId && Number.isSafeInteger(completion.completedRound) && completion.completedRound > 0 &&
    ledger.playerIds.includes(completion.winnerId) && typeof completion.receiptsHash === 'string' && /^[a-f0-9]{64}$/.test(completion.receiptsHash), 'Invalid tournament completion binding.');
  demand(Array.isArray(completion.groups) && completion.groups.length > 0, 'Final standings must contain placement groups.');
  let nextPlace = 1, prior = null;
  const seen = new Set();
  for (const group of completion.groups) {
    demand(group && Array.isArray(group.playerIds) && group.playerIds.length > 0 && group.playerIds.every(id => ledger.playerIds.includes(id) && !seen.has(id)) &&
      new Set(group.playerIds).size === group.playerIds.length && equal(group.playerIds, [...group.playerIds].sort()), 'Each tournament entrant must occur once in canonical standings.');
    demand(group.placeFrom === nextPlace && group.placeTo === nextPlace + group.playerIds.length - 1 && Number.isSafeInteger(group.finalHP) && Number.isSafeInteger(group.finalGold) && group.finalGold >= 0 && Number.isFinite(group.fieldedMaxHP) && group.fieldedMaxHP >= 0, 'Standings must cover consecutive finish positions with exact final HP.');
    if (nextPlace === 1) demand(group.playerIds.length === 1 && group.playerIds[0] === completion.winnerId && group.eliminatedRound === null && group.finalHP > 0 && group.finalHP <= Party.RULES.startingHP, 'First place must be the surviving commander.');
    else {
      demand(Number.isSafeInteger(group.eliminatedRound) && group.eliminatedRound > 0 && group.eliminatedRound <= completion.completedRound && group.finalHP <= 0, 'Eliminated placements require their round and unclamped final HP.');
      if (prior?.eliminatedRound !== null) demand(group.eliminatedRound < prior.eliminatedRound || (group.eliminatedRound === prior.eliminatedRound && (group.finalHP < prior.finalHP || (group.finalHP === prior.finalHP && (group.finalGold < prior.finalGold || (group.finalGold === prior.finalGold && group.fieldedMaxHP < prior.fieldedMaxHP))))), 'Standings must rank later eliminations first, then higher final HP, then higher gold, then higher fielded maximum HP; exact ties form one group.');
    }
    demand(equal(group, { placeFrom: group.placeFrom, placeTo: group.placeTo, playerIds: group.playerIds, eliminatedRound: group.eliminatedRound, finalHP: group.finalHP, finalGold: group.finalGold, fieldedMaxHP: group.fieldedMaxHP }), 'Standings contain unrecognized fields.');
    group.playerIds.forEach(id => seen.add(id)); nextPlace = group.placeTo + 1; prior = group;
  }
  demand(seen.size === Tournament.ROOM_SIZE, 'Final standings must include all eight entrants.');
}
function gcd(a, b) { while (b !== 0n) { const next = a % b; a = b; b = next; } return a; }
function allocatePrizes(terms, groups) {
  const quote = Tournament.quote(terms, Tournament.ROOM_SIZE);
  demand(Array.isArray(groups), 'Prize sharing requires placement groups.');
  const ordered = [...groups].sort((a, b) => a.placeFrom - b.placeFrom), seen = new Set(), allocations = [];
  let nextPlace = 1;
  for (const group of ordered) {
    demand(group && Array.isArray(group.playerIds) && group.playerIds.length > 0 &&
      group.playerIds.every(id => identity(id) && !seen.has(id)) && new Set(group.playerIds).size === group.playerIds.length &&
      group.placeFrom === nextPlace && group.placeTo === nextPlace + group.playerIds.length - 1,
    'Prize sharing requires consecutive finish positions and distinct entrants.');
    group.playerIds.forEach(id => seen.add(id)); nextPlace = group.placeTo + 1;
    const occupiedPrizes = quote.prizes.filter(prize => prize.place >= group.placeFrom && prize.place <= group.placeTo);
    if (!occupiedPrizes.length) continue;
    const combined = occupiedPrizes.reduce((sum, prize) => sum + BigInt(prize.amountAtomic), 0n), count = BigInt(group.playerIds.length);
    const whole = combined / count, remainder = combined % count, common = remainder === 0n ? 1n : gcd(remainder, count);
    for (const playerId of [...group.playerIds].sort()) allocations.push({
      place: group.placeFrom, playerId, amountAtomic: whole.toString(), status: 'provisional-unfunded',
      ...(group.playerIds.length > 1 ? { placeTo: group.placeTo } : {}),
      ...(remainder > 0n ? { fractionalAtomic: { numerator: (remainder / common).toString(), denominator: (count / common).toString() } } : {})
    });
  }
  demand(seen.size === Tournament.ROOM_SIZE, 'Prize sharing requires all eight finish positions.');
  return freeze(allocations);
}
function complete(ledger, binding, legacy = false) {
  verifyGroups(ledger, binding);
  const quote = Tournament.quote(ledger.terms, ledger.playerIds.length), unallocatedPrizes = [];
  let allocations;
  if (legacy) {
    // Read-only schema-one verifier: reproduce the previously saved contract
    // exactly before a migration may replace its unresolved tied allocations.
    allocations = [];
    for (const prize of quote.prizes) {
      const group = binding.groups.find(group => prize.place >= group.placeFrom && prize.place <= group.placeTo);
      if (group.playerIds.length === 1) allocations.push({ place: prize.place, playerId: group.playerIds[0], amountAtomic: prize.amountAtomic, status: 'provisional-unfunded' });
      else unallocatedPrizes.push({ place: prize.place, amountAtomic: prize.amountAtomic, tiedPlayerIds: [...group.playerIds] });
    }
  } else allocations = allocatePrizes(ledger.terms, binding.groups);
  return { ...ledger, status: unallocatedPrizes.length ? 'awaiting-tiebreak' : 'complete', completion: {
    matchId: binding.matchId, completedRound: binding.completedRound, winnerId: binding.winnerId,
    receiptsHash: binding.receiptsHash, groups: clone(binding.groups), quote, allocations, unallocatedPrizes } };
}
function bindState(ledger, state) {
  Party.validate(state);
  demand(state.matchId === ledger.matchId && state.players.every(player => player.isAI === false) && equal(state.players.map(player => player.playerId).sort(), ledger.playerIds),
    'Tournament results must belong to the same eight human entrants and match.');
}
function fromState(base, state, legacy = false) {
  const standings = Standings.derive(state);
  return complete(base, { ...standings, receiptsHash: crypto.createHash('sha256').update(stable(state.receipts)).digest('hex') }, legacy);
}
function validateVersion(ledger, state, legacy = false) {
  demand(ledger && typeof ledger === 'object', 'Tournament accounting ledger is required.');
  const created = create({ matchId: ledger.matchId, terms: ledger.terms, playerIds: ledger.playerIds });
  const base = legacy ? { ...created, schemaVersion: 1 } : created;
  const expected = ledger.completion === null ? base : complete(base, ledger.completion, legacy);
  demand(equal(ledger, expected), 'Tournament accounting must be canonical and unfunded; entries, terms, standings and prizes cannot be altered.');
  if (state !== undefined) {
    bindState(base, state);
    if (ledger.completion !== null) {
      demand(state.phase === 'finished', 'A completed accounting ledger requires its completed authoritative match.');
      demand(equal(ledger, fromState(base, state, legacy)), 'Tournament completion must match the authoritative combat receipts and standings.');
    }
  }
  return true;
}
function validate(ledger, state) { return validateVersion(ledger, state, false); }
function restore(ledger, state) {
  demand(state !== undefined, 'Restoring tournament accounting requires its authoritative match.');
  if (ledger?.schemaVersion === 1) {
    validateVersion(ledger, state, true);
    const base = create({ matchId: ledger.matchId, terms: ledger.terms, playerIds: ledger.playerIds });
    return freeze(ledger.completion === null ? clone(base) : fromState(base, state));
  }
  validate(ledger, state); return freeze(clone(ledger));
}
function settle(ledger, state) {
  validate(ledger, state);
  if (state.phase !== 'finished') return freeze(clone(ledger));
  const base = create({ matchId: ledger.matchId, terms: ledger.terms, playerIds: ledger.playerIds });
  return freeze(fromState(base, state));
}
module.exports = Object.freeze({ create, settle, validate, restore, allocatePrizes });
