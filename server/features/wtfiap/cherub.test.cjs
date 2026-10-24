const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const Party = require('./runtime/game/core/party.cjs');
const Engine = require('./runtime/source/engine.js');
const Items = require('./runtime/game/core/items.cjs');
const Rules = require('./rules.cjs');

const must = result => { assert.equal(result.ok, true, result.reason); return result; };
const players = [{ playerId: 'a', name: 'A', isAI: false }, { playerId: 'b', name: 'B', isAI: false }];
function round(options) {
  const state = Party.createMatch({ matchId: 'compat-cherub', seed: 'compat-seed', boardMode: 'standard',
    preparationSeconds: null, oddPlayerPolicy: 'round-ai', openedAtMs: 0, players, ...options });
  for (const id of ['a', 'b']) {
    must(Party.command(state, { type: 'buy', playerId: id, index: 0 }, 0));
    const unit = state.players.find(player => player.playerId === id).bench[0];
    must(Party.command(state, { type: 'deploy', playerId: id, unitId: unit.id, col: 0, row: state.board.rows - 1 }, 0));
    must(Party.command(state, { type: 'ready', playerId: id, value: true }, 0));
  }
  must(Party.advance(state, 0));
  for (let atMs = 1000; state.phase === 'combat'; atMs += 1000) must(Party.advance(state, atMs));
  assert.equal(Party.validate(state), true);
  return state;
}

test('prior item-free and item-enabled room transcripts remain byte-identical', () => {
  const baseline = [
    [{}, 'd1cc365d70cdf58884a5a08c3ce0efe4c4a7e6a4ee0db957fcc45ca9c9995496'],
    [{ itemRulesVersion: 1 }, '42a2bff6690c59350778aed09c27fb731882b902c868e7bac24fcff6a5821b49'],
  ];
  for (const [options, expected] of baseline) {
    const state = round(options);
    assert.equal(state.cherubRulesVersion, undefined);
    assert.equal(crypto.createHash('sha256').update(Party.serialize(state)).digest('hex'), expected);
  }
  const incoming = Rules.getRuntimeRulesHash(process.cwd());
  for (const pinned of ['4415776d4b0db7a07f3346bdf0c4014c68808060d32e974bbf7703ba47ac8d73',
    '81cc9dff78f5c2342f035238bbdbfdbbcf0ec110805b9f1b0ac3c29e3b2352bd',
    '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669'])
    assert.equal(Rules.supportsPinnedRules(incoming, pinned), true);
});

test('new room Cherubs cannot attack and award seeded components without becoming purchasable heroes', () => {
  const state = round({ itemRulesVersion: 1, cherubRulesVersion: 1 });
  const captures = state.receipts[0].results[0].cherubCaptures;
  assert.equal(captures.length, 2);
  assert.equal(state.itemReceipts.filter(receipt => receipt.kind === 'cherub-capture').length, 2);
  assert.equal(Engine.heroById('cherub'), undefined);
  assert.ok(Engine.cherubMaxHp() <= Math.min(...Engine.ROSTER.map(hero => hero.stats.hp)));
  for (const receipt of state.itemReceipts.filter(entry => entry.kind === 'cherub-capture')) {
    assert.ok(Items.isComponent(receipt.itemId));
    assert.ok(state.players.find(player => player.playerId === receipt.playerId).items.includes(receipt.itemId));
  }
  const firstBattle = state.receipts[0].results[0].replay;
  const game = Engine.createGame(firstBattle.initial.token);
  Object.assign(game, firstBattle.initial);
  must(Engine.startBattle(game, firstBattle.config));
  assert.equal(game.battle.objectives.length, 2);
  assert.ok(game.battle.objectives.every(objective => objective.rewardKind === 'cherub' && objective.effectiveAttack === 0 && objective.maxHp === Engine.cherubMaxHp()));
  assert.deepEqual(Party.view(Party.restore(Party.serialize(state)), 'a'), Party.view(state, 'a'));
  const html = fs.readFileSync('public/games/installed/wtfiap/generator.html', 'utf8');
  assert.match(html, /CHERUB · ITEM/);
  assert.match(html, /window\.AB_SPRITE_DATA=.*cherub/);
});
