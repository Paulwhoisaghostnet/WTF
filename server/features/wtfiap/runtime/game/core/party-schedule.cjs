/* Owner-approved Party: eight seats; 2/5/10 minute preparation or untimed
 * all-ready mode. Odd survivors face a round-scaled AI encounter. No round
 * cap is imposed. Pairings favor fresh opponents and rotate AI assignments. */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('../../source/engine.js'));
  else root.ABPartySchedule = factory(root.AB);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Engine) {
  'use strict';
  const PREPARATION_SECONDS = Object.freeze([120, 300, 600]);
  const fail = (ok, message) => { if (!ok) throw new Error(message); };
  const integer = value => Number.isSafeInteger(value) && value >= 0;
  const id = value => typeof value === 'string' && value.trim().length > 0;
  const ids = values => Array.isArray(values) && values.length > 0 && values.length <= 8 && values.every(id) && new Set(values).size === values.length;
  function validateClock(clock) {
    fail(clock && integer(clock.roundNumber) && clock.roundNumber > 0, 'A valid round number is required.');
    fail(clock.preparationSeconds === null || PREPARATION_SECONDS.includes(clock.preparationSeconds), 'Choose 2, 5 or 10 minutes, or ready-only mode.');
    fail(integer(clock.openedAtMs) && (clock.preparationSeconds === null ? clock.deadlineAtMs === null : Number.isSafeInteger(clock.deadlineAtMs) && clock.deadlineAtMs === clock.openedAtMs + clock.preparationSeconds * 1000), 'Invalid preparation deadline.');
    fail(clock.earlyStart === (clock.preparationSeconds === null) && ids(clock.playerIds), 'Timed rounds wait for the deadline; ready-only rounds wait for everyone.');
    fail(Array.isArray(clock.readyPlayerIds) && new Set(clock.readyPlayerIds).size === clock.readyPlayerIds.length && clock.readyPlayerIds.every(value => clock.playerIds.includes(value)), 'Ready players must belong to this round.');
    return true;
  }
  function createClock({ roundNumber, preparationSeconds, openedAtMs, playerIds, earlyStart = preparationSeconds === null }) {
    const clock = { roundNumber, preparationSeconds, openedAtMs, deadlineAtMs: preparationSeconds === null ? null : openedAtMs + preparationSeconds * 1000,
      playerIds: [...playerIds], earlyStart, readyPlayerIds: [] };
    validateClock(clock); return clock;
  }
  function shouldStart(clock, atMs) {
    validateClock(clock); fail(integer(atMs) && atMs >= clock.openedAtMs, 'Use an authoritative time at or after preparation opened.');
    return clock.deadlineAtMs === null ? clock.readyPlayerIds.length === clock.playerIds.length : atMs >= clock.deadlineAtMs;
  }
  function setReady(clock, playerId, value, atMs) {
    validateClock(clock); fail(integer(atMs) && atMs >= clock.openedAtMs && (clock.deadlineAtMs === null || atMs < clock.deadlineAtMs), 'Preparation has closed.');
    fail(clock.playerIds.includes(playerId) && typeof value === 'boolean', 'A living player and explicit readiness are required.');
    return { ...clock, playerIds: [...clock.playerIds], readyPlayerIds: clock.playerIds.filter(name => name === playerId ? value : clock.readyPlayerIds.includes(name)) };
  }
  const key = (a, b) => JSON.stringify([a, b].sort());
  function pair({ playerIds, seed, roundNumber, history, oddPlayerPolicy }) {
    fail(ids(playerIds) && playerIds.length >= 2, 'Pair between two and eight surviving commanders.');
    fail(id(seed) && integer(roundNumber) && roundNumber > 0 && Array.isArray(history), 'Seed, round and pairing history are required.');
    fail(oddPlayerPolicy === 'round-ai', 'Odd populations face a round-scaled AI encounter.');
    const alive = [...playerIds].sort(), meetings = new Map(), last = new Map(), unpaired = new Map(alive.map(value => [value, 0]));
    for (const round of history) {
      fail(integer(round.roundNumber) && round.roundNumber > 0 && round.roundNumber < roundNumber && Array.isArray(round.pairings), 'Pairing history must contain prior rounds.');
      for (const p of round.pairings) {
        fail(id(p.playerId) && (p.enemyId === null || (id(p.enemyId) && p.enemyId !== p.playerId)), 'Invalid prior pairing.');
        if (p.isRoundAI) { if (unpaired.has(p.playerId)) unpaired.set(p.playerId, unpaired.get(p.playerId) + 1); }
        if (!p.isRoundAI) {
          const k = key(p.playerId, p.enemyId); meetings.set(k, (meetings.get(k) || 0) + 1);
          last.set(k, Math.max(last.get(k) || 0, round.roundNumber));
        }
      }
    }
    function matchings(remaining) {
      if (!remaining.length) return [[]];
      const result = [], first = remaining[0];
      for (let i = 1; i < remaining.length; i++) {
        const rest = remaining.filter((_, index) => index !== 0 && index !== i);
        for (const tail of matchings(rest)) result.push([{ playerId: first, enemyId: remaining[i], isGhost: false, isRoundAI: false }, ...tail]);
      }
      return result;
    }
    const odd = alive.length % 2 === 1, minimumUnpaired = Math.min(...unpaired.values());
    const candidates = [];
    for (const lone of odd ? alive.filter(value => unpaired.get(value) === minimumUnpaired) : [null]) {
      const remaining = lone === null ? alive : alive.filter(value => value !== lone);
      for (const pairs of matchings(remaining)) {
        if (lone === null) candidates.push(pairs);
        else candidates.push([...pairs, { playerId: lone, enemyId: 'round-ai:' + roundNumber, isGhost: false, isRoundAI: true }]);
      }
    }
    // Lexicographic choices avoid arbitrary score weights: avoid consecutive
    // opponents, then minimize the most-contested pair and total pair repeats.
    const score = pairs => {
      const fought = pairs.filter(p => !p.isRoundAI), counts = fought.map(p => meetings.get(key(p.playerId, p.enemyId)) || 0);
      return [fought.filter(p => last.get(key(p.playerId, p.enemyId)) === roundNumber - 1).length, Math.max(0, ...counts), counts.reduce((a, b) => a + b, 0)];
    };
    const compare = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
    let best = [], bestScore = null;
    for (const candidate of candidates) {
      const value = score(candidate), order = bestScore === null ? -1 : compare(value, bestScore);
      if (order < 0) { best = [candidate]; bestScore = value; }
      else if (order === 0) best.push(candidate);
    }
    const random = Engine.makeRandom(String(seed) + ':party-pairings:' + roundNumber + ':' + JSON.stringify(alive));
    const selected = best[Math.floor(random() * best.length)];
    return selected.map((p, index) => {
      const swap = !p.isRoundAI && random() < 0.5;
      return { id: 'round:' + roundNumber + ':pair:' + index, playerId: swap ? p.enemyId : p.playerId,
        enemyId: swap ? p.playerId : p.enemyId, isGhost: false, isRoundAI: p.isRoundAI };
    });
  }
  return Object.freeze({ PREPARATION_SECONDS, createClock, validateClock, setReady, shouldStart, pair });
});
