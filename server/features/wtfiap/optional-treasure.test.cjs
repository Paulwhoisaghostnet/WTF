const test = require('node:test');
const assert = require('node:assert/strict');
const Party = require('./runtime/game/core/party.cjs');

function advanceToCombat(roundNumber, options) {
  const state = Party.createMatch({ matchId: 'optional-treasure-' + roundNumber + '-' + String(options.treasureEnabled),
    seed: 'optional-treasure-' + roundNumber + '-' + String(options.treasureEnabled),
    boardMode: 'standard', preparationSeconds: null, oddPlayerPolicy: 'round-ai', openedAtMs: 0,
    players: Array.from({ length: 8 }, (_, index) => ({ playerId: 'p' + index, name: 'P' + index, isAI: true })),
    ...options });
  let atMs = 0;
  while (state.roundNumber <= roundNumber) {
    assert.equal(state.phase, 'preparation');
    for (const player of state.players.filter(entry => entry.hp > 0)) {
      if (player.itemShop?.open) {
        const pass = Party.command(state, { type: 'passItemShop', playerId: player.playerId }, atMs);
        assert.equal(pass.ok, true, pass.reason);
      }
      const prepared = Party.prepareAI(state, player.playerId, atMs);
      assert.equal(prepared.ok, true, prepared.reason);
    }
    const started = Party.advance(state, atMs);
    assert.equal(started.ok, true, started.reason);
    if (state.roundNumber === roundNumber) break;
    while (state.phase === 'combat') {
      atMs += 1000;
      const advanced = Party.advance(state, atMs);
      assert.equal(advanced.ok, true, advanced.reason);
    }
  }
  assert.equal(state.phase, 'combat');
  return state;
}

test('Ancient round five starts without gold chests; treasure rooms retain both', () => {
  const ancient = advanceToCombat(5, { treasureEnabled: false });
  assert.equal(ancient.combats[0].config.treasureEnabled, false);
  assert.deepEqual(ancient.combats[0].game.battle.objectives, []);
  assert.equal(ancient.combats[0].game.battle.treasure.expiresAtSeconds, null);
  assert.equal(Party.validate(Party.restore(Party.serialize(ancient))), true);

  const treasure = advanceToCombat(5, { treasureEnabled: true });
  assert.equal(treasure.combats[0].config.chests.length, 2);
  assert.equal(treasure.combats[0].game.battle.objectives.length, 2);
  assert.equal(treasure.combats[0].game.battle.treasure.expiresAtSeconds, 75);
  assert.equal(Party.validate(Party.restore(Party.serialize(treasure))), true);
});

test('custom item rooms without gold treasure still spawn the two tenth-round item chests', () => {
  const state = advanceToCombat(10, { treasureEnabled: false, itemRulesVersion: 1, itemChestPlacementVersion: 2 });
  assert.deepEqual(state.combats[0].config.chests.map(chest => chest.kind), ['item', 'item']);
  assert.equal(state.combats[0].game.battle.treasure.expiresAtSeconds, 150);
  assert.equal(Party.validate(Party.restore(Party.serialize(state))), true);
});
