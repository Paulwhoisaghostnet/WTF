/* Authoritative Party finish order. Owner rule: same-round eliminations rank
 * by final HP before the zero clamp; closer to zero finishes higher. Equal
 * final HP ranks higher final gold first, then higher last-fielded team maxHP.
 * Exact ties across all three scores retain shared placement ranges.
 * This module derives, rather than changes, the combat/commander HP rules. */
'use strict';
const Party = require('./party.cjs');
const Health = require('./commander-health.cjs');
const Engine = require('../../source/engine.js');
const demand = (condition, message) => { if (!condition) throw new Error(message); };
const id = value => typeof value === 'string' && value.trim().length > 0;

function fullDamage(result) {
  demand(Array.isArray(result.survivors), 'Standings require the saved surviving heroes.');
  const ids = new Set();
  return result.survivors.reduce((sum, unit) => {
    demand(unit && id(unit.unitId) && !ids.has(unit.unitId), 'Surviving heroes must have distinct IDs.'); ids.add(unit.unitId);
    demand(Engine.heroById(unit.heroId)?.cost === unit.cost, 'Survivor cost must match its named hero.');
    const damage = Health.calculateHeroDamage({ stars: unit.stars, cost: unit.cost, hp: unit.hp, maxHp: unit.maxHp });
    demand(unit.hp > 0 && unit.damage === damage, 'Survivor damage must match its actual stars, cost and remaining HP.');
    demand(Number.isSafeInteger(sum + damage), 'Survivor damage must remain an exact integer.');
    return sum + damage;
  }, 0);
}
// Snapshot totals use the actual deployed formation before combat, including
// star scaling, class/faction synergies and deterministic Mime mimicry. Bench,
// treasure and transient clone bodies never contribute to the tie score.
function fieldedMaxHP(result, playerId) {
  const side = playerId === result.pair.playerId ? 'player' : playerId === result.pair.enemyId ? 'enemy' : null;
  demand(side !== null && result.replay?.initial && Array.isArray(result.replay.initial.field) && Array.isArray(result.replay.initial.opponents),
    'Fielded health requires the participating side and its saved initial formation.');
  const initial = result.replay.initial, actual = units => units.filter(unit => !unit.temporary && unit.kind !== 'treasure');
  const units = Engine.previewCombatUnits({ ...initial, field: actual(initial.field), opponents: actual(initial.opponents) });
  const values = units.filter(unit => unit.side === side).map(unit => unit.maxHp).sort((a, b) => a - b);
  demand(values.every(value => Number.isFinite(value) && value > 0), 'Fielded maximum HP must contain positive finite hero stats.');
  const total = values.reduce((sum, value) => sum + value, 0);
  demand(Number.isFinite(total), 'Fielded maximum HP must remain finite.');
  return total;
}
// Server projections call this on their validated authoritative state. It
// avoids replaying Party validation on every polling response. Eliminated
// commanders cannot act or receive later preparation income, so player.gold
// is their retained balance after elimination-round treasure/zone settlement.
function finalOutcomes(state) {
  const outcomes = new Map(state.players.map(player => [player.playerId, {
    playerId: player.playerId, finalHP: player.hp, finalGold: player.gold,
    fieldedMaxHP: 0, eliminatedRound: player.eliminatedRound
  }]));
  const found = new Set();
  for (const receipt of [...state.receipts].reverse()) for (const result of receipt.results) {
    for (const award of result.awards) {
      if (found.has(award.playerId)) continue;
      const outcome = outcomes.get(award.playerId);
      demand(outcome, 'Final outcomes require a known player.');
      outcome.fieldedMaxHP = fieldedMaxHP(result, award.playerId);
      if (award.hpAfter === 0) {
        const finalHP = award.hpBefore - fullDamage(result);
        demand(award.outcome === 'loss' && award.hpBefore > 0 && finalHP <= 0 && award.damage === award.hpBefore &&
          outcome.finalHP === 0 && outcome.eliminatedRound === receipt.roundNumber,
        'Eliminated outcomes must match complete survivor damage and their saved elimination round.');
        outcome.finalHP = finalHP;
      }
      found.add(award.playerId);
    }
  }
  demand([...outcomes.values()].every(outcome => Number.isSafeInteger(outcome.finalGold) && outcome.finalGold >= 0 &&
    (outcome.finalHP > 0 || found.has(outcome.playerId))), 'Final outcomes require the retained settled balance and elimination receipt.');
  return [...outcomes.values()];
}
function derive(state) {
  Party.validate(state);
  demand(state.phase === 'finished', 'Final standings require a completed Party match.');
  const survivors = state.players.filter(player => player.hp > 0);
  demand(survivors.length === 1 && state.winnerId === survivors[0].playerId,
    'Final standings require one surviving winner.');
  const remaining = new Set(state.players.map(player => player.playerId)), eliminated = new Map(), cohorts = [];
  const carriedHP = new Map(state.players.map(player => [player.playerId, Party.RULES.startingHP]));
  for (const receipt of state.receipts) {
    const seen = new Set(), fallen = [];
    for (const result of receipt.results) {
      const pair = result.pair;
      demand(pair && id(pair.playerId) && id(pair.enemyId) && pair.playerId !== pair.enemyId && typeof pair.isRoundAI === 'boolean', 'Every result requires its saved pairing.');
      demand(remaining.has(pair.playerId) && (pair.isRoundAI ? !carriedHP.has(pair.enemyId) : remaining.has(pair.enemyId)), 'Pairing must contain living commanders or the independent round encounter.');
      demand(['victory', 'defeat', 'draw'].includes(result.result), 'Combat result must identify its winning side or a draw.');
      const expectedIds = [pair.playerId, ...(pair.isRoundAI ? [] : [pair.enemyId])].sort();
      demand(Array.isArray(result.awards) && JSON.stringify(result.awards.map(award => award.playerId).sort()) === JSON.stringify(expectedIds), 'Each pairing must award exactly its participating commanders.');
      const winnerId = result.result === 'victory' ? pair.playerId : result.result === 'defeat' ? pair.enemyId : null;
      const damage = fullDamage(result);
      demand(winnerId !== null || result.survivors.length === 0, 'A combat draw cannot contain surviving heroes.');
      for (const award of result.awards) {
        demand(remaining.has(award.playerId) && !seen.has(award.playerId), 'Every living commander must receive exactly one result per round.'); seen.add(award.playerId);
        const outcome = winnerId === null ? 'draw' : winnerId === award.playerId ? 'win' : 'loss';
        demand(award.outcome === outcome && award.hpBefore === carriedHP.get(award.playerId) && award.hpBefore > 0, 'Awards must match the combat result and carried commander HP.');
        // award.damage is intentionally clamped by Party. Recover overflow from
        // the independently checked surviving-hero contributions instead.
        const finalHP = award.hpBefore - (outcome === 'loss' ? damage : 0), hpAfter = Math.max(0, finalHP);
        demand(award.hpAfter === hpAfter && award.damage === award.hpBefore - hpAfter, 'Applied commander damage must match the complete survivor damage and zero clamp.');
        carriedHP.set(award.playerId, hpAfter);
        if (hpAfter === 0) fallen.push({ playerId: award.playerId, finalHP });
      }
    }
    demand(seen.size === remaining.size, 'A completed round must include every living commander.');
    if (fallen.length) {
      for (const { playerId } of fallen) { remaining.delete(playerId); eliminated.set(playerId, receipt.roundNumber); }
      cohorts.push({ eliminatedRound: receipt.roundNumber, fallen });
    }
    demand(remaining.size > 1 || receipt === state.receipts.at(-1), 'A Party match cannot continue after a terminal round.');
  }
  demand(remaining.size === 1 && remaining.has(state.winnerId), 'Receipt history must end with the surviving winner.');
  for (const player of state.players) demand(player.hp === carriedHP.get(player.playerId) && player.eliminatedRound === (eliminated.get(player.playerId) ?? null), 'Final HP and elimination rounds must match completed combat receipts.');
  const outcomes = new Map(finalOutcomes(state).map(outcome => [outcome.playerId, outcome]));
  const finalGold = new Map([...outcomes].map(([id, outcome]) => [id, outcome.finalGold]));
  const groups = [{ placeFrom: 1, placeTo: 1, playerIds: [state.winnerId], eliminatedRound: null, finalHP: survivors[0].hp, finalGold: finalGold.get(state.winnerId), fieldedMaxHP: outcomes.get(state.winnerId).fieldedMaxHP }];
  let nextPlace = 2;
  for (const cohort of cohorts.reverse()) {
    const scores = [...new Set(cohort.fallen.map(player => player.finalHP))].sort((a, b) => b - a);
    for (const finalHP of scores) {
      const matching = cohort.fallen.filter(player => player.finalHP === finalHP);
      const balances = [...new Set(matching.map(player => finalGold.get(player.playerId)))].sort((a, b) => b - a);
      for (const balance of balances) {
        const goldTied = matching.filter(player => finalGold.get(player.playerId) === balance);
        const armyScores = [...new Set(goldTied.map(player => outcomes.get(player.playerId).fieldedMaxHP))].sort((a, b) => b - a);
        for (const armyHP of armyScores) {
          // IDs only stabilize serialization; identical scores remain tied.
          const playerIds = goldTied.filter(player => outcomes.get(player.playerId).fieldedMaxHP === armyHP).map(player => player.playerId).sort();
          const placeTo = nextPlace + playerIds.length - 1;
          groups.push({ placeFrom: nextPlace, placeTo, playerIds, eliminatedRound: cohort.eliminatedRound, finalHP, finalGold: balance, fieldedMaxHP: armyHP }); nextPlace = placeTo + 1;
        }
      }
    }
  }
  demand(nextPlace === state.players.length + 1, 'Every original commander must appear in final standings.');
  return { matchId: state.matchId, completedRound: state.roundNumber, winnerId: state.winnerId, groups };
}
module.exports = Object.freeze({ derive, finalOutcomes, fieldedMaxHP });
