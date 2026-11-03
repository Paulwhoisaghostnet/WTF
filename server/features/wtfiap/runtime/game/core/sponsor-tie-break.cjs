/* Sponsor prizes are indivisible when an FA2 lot is present. The ordinary
 * standings retain their shared places for legacy rooms; this module resolves
 * only sponsor-room human places from the saved, reproducible combat replay. */
'use strict';
const { createHash } = require('node:crypto');
const Engine = require('../../source/engine.js');
const Standings = require('./party-standings.cjs');

const demand = (condition, message) => { if (!condition) throw new Error(message); };
const hash = text => createHash('sha256').update(text).digest('hex');
const copy = value => JSON.parse(JSON.stringify(value));
const lex = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const HIT_TYPES = new Set(['hit', 'spell-hit', 'dot-hit', 'reflect-hit', 'shatter-hit']);
const HEAL_TYPES = new Set(['heal', 'item-heal', 'zone-heal']);

function replayCombat(result) {
  const saved = result.replay;
  demand(saved?.initial && saved.config && Number.isSafeInteger(saved.ticks) && saved.ticks >= 0,
    'A sponsor tie needs the saved combat initial state, config and ticks.');
  const game = copy(saved.initial);
  if (saved.instant) {
    demand(saved.ticks === 0, 'An instant combat has no simulation ticks.');
    game.result = game.field.length ? 'victory' : game.opponents.length ? 'defeat' : 'draw';
    game.phase = 'finished';
    game.battle = { units: Engine.previewCombatUnits(game), elapsed: 0, tick: 0, events: [] };
  } else {
    const started = Engine.startBattle(game, copy(saved.config));
    demand(started?.ok, 'The sponsor tie combat cannot be replayed.');
    for (let tick = 0; tick < saved.ticks; tick++) Engine.step(game, Engine.FIXED_STEP);
  }
  demand(game.phase === 'finished' && game.result === saved.result && game.result === result.result &&
    game.battle.tick === saved.ticks && game.battle.elapsed === result.elapsedSeconds,
  'The sponsor tie replay differs from the recorded combat outcome.');
  const surviving = game.battle.units.filter(unit => unit.alive && unit.hp > 0 && !unit.temporary)
    .map(unit => ({ unitId: unit.id, heroId: unit.heroId, stars: unit.level,
      cost: Engine.heroById(unit.heroId).cost, hp: unit.hp, maxHp: unit.maxHp }));
  demand(JSON.stringify(surviving) === JSON.stringify(result.survivors.map(({ unitId, heroId, stars, cost, hp, maxHp }) =>
    ({ unitId, heroId, stars, cost, hp, maxHp }))),
  'The sponsor tie replay differs from the recorded surviving heroes.');
  return game.battle;
}

function metricsFor(state, selected) {
  const scores = new Map([...selected].map(playerId => [playerId, {
    damage: 0, healing: 0, heroDamage: new Map(), rounds: new Map()
  }]));
  for (const receipt of state.receipts) for (const result of receipt.results) {
    if (!scores.has(result.pair.playerId) && !scores.has(result.pair.enemyId)) continue;
    const battle = replayCombat(result), units = new Map(battle.units.map(unit => [unit.id, unit]));
    const sidePlayer = { player: result.pair.playerId, enemy: result.pair.enemyId };
    for (const event of battle.events) {
      if (!HIT_TYPES.has(event.type) && !HEAL_TYPES.has(event.type)) continue;
      const actor = units.get(event.unitId), playerId = actor && sidePlayer[actor.side];
      if (!scores.has(playerId)) continue;
      const score = scores.get(playerId), round = score.rounds.get(receipt.roundNumber) || { damage: 0, healing: 0 };
      if (HIT_TYPES.has(event.type)) {
        const victim = units.get(event.targetId);
        if (!victim || victim.side === actor.side) continue; // Hero combat, not chest damage.
        const amount = event.healthDamage + event.absorbed;
        demand(Number.isFinite(amount) && amount >= 0, 'Replay damage must be finite and nonnegative.');
        score.damage += amount; round.damage += amount;
        const heroKey = event.unitId.replace(/^(?:player|enemy):/, '');
        score.heroDamage.set(heroKey, (score.heroDamage.get(heroKey) || 0) + amount);
      } else {
        demand(Number.isFinite(event.amount) && event.amount >= 0, 'Replay healing must be finite and nonnegative.');
        score.healing += event.amount; round.healing += event.amount;
      }
      score.rounds.set(receipt.roundNumber, round);
    }
  }
  return scores;
}

function factorNames(rounds) {
  const names = ['total-healing', 'most-single-hero-damage', 'total-damage'];
  for (let first = 1; first <= rounds; first++) for (let last = first; last <= rounds; last++) {
    names.push(`average-damage-rounds-${first}-${last}`, `average-healing-rounds-${first}-${last}`);
  }
  return names;
}
function factorScore(score, name) {
  if (name === 'total-healing') return score.healing;
  if (name === 'total-damage') return score.damage;
  if (name === 'most-single-hero-damage') return Math.max(0, ...score.heroDamage.values());
  const match = /^average-(damage|healing)-rounds-(\d+)-(\d+)$/.exec(name);
  demand(match, 'Unknown sponsor tie factor.');
  const [, kind, first, last] = match;
  let total = 0;
  for (let round = Number(first); round <= Number(last); round++) total += score.rounds.get(round)?.[kind] || 0;
  return total / (Number(last) - Number(first) + 1);
}

function resolveGroup(playerIds, scores, seed, placeFrom, rounds) {
  const names = factorNames(rounds).sort((a, b) =>
    lex(hash(`colilseum-sponsor-factor-v1:${seed}:${placeFrom}:${a}`),
      hash(`colilseum-sponsor-factor-v1:${seed}:${placeFrom}:${b}`)) || lex(a, b));
  const draws = [];
  function rank(ids, nextFactor) {
    if (ids.length === 1) return ids;
    for (let index = nextFactor; index < names.length; index++) {
      const name = names[index], values = ids.map(playerId => ({ playerId, value: factorScore(scores.get(playerId), name) }));
      demand(values.every(item => Number.isFinite(item.value)), 'Sponsor tie scores must be finite.');
      draws.push({ factor: name, scores: values });
      const distinct = [...new Set(values.map(item => item.value))].sort((a, b) => b - a);
      if (distinct.length === 1) continue;
      return distinct.flatMap(value => rank(values.filter(item => item.value === value).map(item => item.playerId), index + 1));
    }
    // A committed room-seed draw is the terminal factor if every available
    // match analytic is equal. Including the player ID guarantees a total order.
    const values = ids.map(playerId => ({ playerId,
      value: hash(`colilseum-sponsor-final-v1:${seed}:${placeFrom}:${playerId}`) + ':' + playerId }));
    draws.push({ factor: 'committed-seed-draw', scores: values });
    return values.sort((a, b) => lex(b.value, a.value)).map(item => item.playerId);
  }
  return { resolvedPlayerIds: rank(playerIds, 0), draws };
}

function derive(state, seed) {
  demand(typeof seed === 'string' && /^[a-f0-9]{64}$/.test(seed), 'Sponsor ties require the committed 32-byte room seed.');
  const standings = Standings.derive(state), humans = new Set(state.players.filter(player => !player.isAI).map(player => player.playerId));
  const tied = standings.groups.filter(group => group.playerIds.filter(id => humans.has(id)).length > 1);
  const scores = tied.length ? metricsFor(state, new Set(tied.flatMap(group => group.playerIds.filter(id => humans.has(id))))) : new Map();
  const rankedPlayerIds = [], tieBreaks = [];
  for (const group of standings.groups) {
    const humanIds = group.playerIds.filter(id => humans.has(id));
    if (humanIds.length < 2) { rankedPlayerIds.push(...humanIds); continue; }
    // Later rounds cannot contain actions by this eliminated cohort.
    const resolved = resolveGroup(humanIds, scores, seed, group.placeFrom, group.eliminatedRound ?? state.roundNumber);
    rankedPlayerIds.push(...resolved.resolvedPlayerIds);
    tieBreaks.push({ placeFrom: group.placeFrom, playerIds: humanIds,
      resolvedPlayerIds: resolved.resolvedPlayerIds, draws: resolved.draws });
  }
  demand(rankedPlayerIds.length === humans.size && new Set(rankedPlayerIds).size === humans.size,
    'Sponsor human ranks must include each human exactly once.');
  return { matchId: state.matchId, rankedPlayerIds, tieBreaks, seedCommitment: hash(seed) };
}

module.exports = Object.freeze({ derive, replayCombat, metricsFor, resolveGroup });
