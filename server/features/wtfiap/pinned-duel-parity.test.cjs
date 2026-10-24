const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Party = require('./runtime/game/core/party.cjs');
const rules = require('./rules.cjs');

const oldRules = '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669';
const reference = {
  '2/ready': '69830cb1c681c757362abb0375e6bc677fbfdf1bb48b1d2ca4274383700ed1ca',
  '2/120': '6ff568040d94dda7d3a4ad7031007dbdb111b365e6c0718991c4fce032df4271',
  '2/300': 'b73739eda3683e297452d1982d3976cbd9aaaba12f9d15ce7cc7c7b8d1da0459',
  '2/600': 'e436d0becde60c3672c0f2f39af8a84694231580dd43f744b2b7b71da7fd8b69',
  '8/ready': '15f64fd5c620688d855a755723ea87de6649a3f4e4d2779f79fd08cb563d4d2b',
  '8/120': '1d5eb09e1a330a86ee3b35e8754911c98cecda2027b23c58124721d38934fe78',
  '8/300': '943594f901ff0eeb48358e5c7c33e60a6a8850207b1aa30b4b217ab859e36919',
  '8/600': '9c740ee525d6cefc1e1df159d90987472de4e3a3365ca7d9a0ca6f7b410b1ee1',
};
const must = result => assert.equal(result.ok, true, result.reason);

test('creator-first runtime preserves the deployed funded-room rules', () => {
  assert.equal(rules.supportsPinnedRules(rules.getRuntimeRulesHash(), oldRules), true);
  for (const count of [2, 8]) for (const seconds of [null, 120, 300, 600]) {
    const state = Party.createMatch({ matchId: `pinned-${count}-${seconds}`, seed: 'pinned-compatibility',
      boardMode: 'standard', preparationSeconds: seconds, oddPlayerPolicy: 'round-ai', openedAtMs: 0,
      itemRulesVersion: 1, cherubRulesVersion: 1, balanceVersion: 1, shopLockRulesVersion: 1,
      encounterRulesVersion: 1, draftRulesVersion: 1, planRulesVersion: 1,
      fortuneRulesVersion: 1, fortunePricingVersion: 1,
      players: Array.from({ length: count }, (_, i) => ({ playerId: `p${i}`, name: `P${i}`, isAI: true })) });
    const digest = crypto.createHash('sha256');
    let time = 0;
    const capture = () => { digest.update(Party.serialize(state)); digest.update(JSON.stringify(Party.view(state, 'p0'))); };
    capture();
    for (let round = 0; round < 3; round++) {
      for (const player of state.players.filter(entry => entry.hp > 0)) {
        must(Party.prepareAI(state, player.playerId, time)); capture();
      }
      if (seconds !== null) time = state.deadlineAtMs;
      must(Party.advance(state, time)); capture();
      while (state.phase === 'combat') { time += 1000; must(Party.advance(state, time)); capture(); }
      if (state.phase === 'finished') break;
    }
    const key = `${count}/${seconds === null ? 'ready' : seconds}`;
    assert.equal(digest.digest('hex'), reference[key], `deployed transcript changed for ${key}`);
  }
});
