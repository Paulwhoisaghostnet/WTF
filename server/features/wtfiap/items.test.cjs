const test = require('node:test');
const assert = require('node:assert/strict');
const Items = require('./runtime/game/core/items.cjs');
const Party = require('./runtime/game/core/party.cjs');
const Engine = require('./runtime/source/engine.js');
const Rules = require('./rules.cjs');

const make = (version = 1) => Party.createMatch({ matchId: 'hosted-item-rules', seed: 'items-seed', boardMode: 'standard',
  preparationSeconds: null, oddPlayerPolicy: 'round-ai', openedAtMs: 0, ...(version ? { itemRulesVersion: version } : {}),
  players: [{ playerId: 'a', name: 'A', isAI: false }, { playerId: 'b', name: 'B', isAI: false }] });
const must = result => assert.equal(result.ok, true, result.reason);

test('hosted item table has every component pair and the approved reward probabilities', () => {
  assert.equal(Items.COMPONENTS.length, 8);
  assert.equal(Items.RECIPES.length, 36);
  assert.equal(Items.dropChance('win', 0), .25);
  assert.equal(Items.dropChance('win', 2), .27);
  assert.equal(Items.dropChance('loss', 0), .05);
  assert.ok(Math.abs(Items.dropChance('loss', 2) - .15) < Number.EPSILON);
  assert.equal(Items.itemShopRound(5), true);
  assert.equal(Items.itemChestRound(10), true);
});

test('new hosted duel advances to one-purchase fifth-round item shop and equips the item', () => {
  const state = make();
  for (const id of ['a', 'b']) {
    must(Party.command(state, { type: 'buy', playerId: id, index: 0 }, 0));
    const unitId = state.players.find(player => player.playerId === id).bench[0].id;
    must(Party.command(state, { type: 'deploy', playerId: id, unitId, col: 0, row: state.board.rows - 1 }, 0));
  }
  let atMs = 0;
  while (state.roundNumber < 5 && state.phase !== 'finished') {
    for (const id of ['a', 'b']) must(Party.command(state, { type: 'ready', playerId: id, value: true }, atMs));
    must(Party.advance(state, atMs));
    while (state.phase === 'combat') { atMs += 1000; must(Party.advance(state, atMs)); }
  }
  assert.equal(state.roundNumber, 5);
  assert.equal(state.players[0].itemShop.open, true);
  assert.equal(Party.command(state, { type: 'buy', playerId: 'a', index: 0 }, atMs).ok, false);
  must(Party.command(state, { type: 'buyItem', playerId: 'a', itemId: 'forgeblade' }, atMs));
  const unit = state.players[0].field[0], attack = Engine.deriveStats(unit).attack;
  must(Party.command(state, { type: 'equipItem', playerId: 'a', unitId: unit.id, itemId: 'forgeblade' }, atMs));
  assert.ok(Engine.deriveStats(state.players[0].field[0]).attack > attack);
  assert.deepEqual(Party.view(Party.restore(Party.serialize(state)), 'a'), Party.view(state, 'a'));
});

test('existing hosted rooms retain their original item-free rule state', () => {
  const state = make(0);
  assert.equal(Party.view(state, 'a').itemCatalog, undefined);
  assert.equal(Party.command(state, { type: 'buyItem', playerId: 'a', itemId: 'forgeblade' }, 0).ok, false);
  const current = Rules.getRuntimeRulesHash(process.cwd());
  assert.equal(Rules.supportsPinnedRules(current, '81cc9dff78f5c2342f035238bbdbfdbbcf0ec110805b9f1b0ac3c29e3b2352bd'), true);
  assert.equal(Rules.supportsPinnedRules(current, '49e69fb6b0dba17eb58ce63310be746dee29242aed0bbbb94e751a5e81a0f669'), true);
  assert.equal(Rules.supportsPinnedRules(current, 'unreviewed-old-rules'), false);
});

test('hosted tenth-round chest capture records a chosen component reward', () => {
  const state = Party.createMatch({ matchId: 'ten2', seed: 'ten2', boardMode: 'standard',
    preparationSeconds: null, oddPlayerPolicy: 'round-ai', openedAtMs: 0, itemRulesVersion: 1,
    players: [{ playerId: 'a', name: 'A', isAI: false }, { playerId: 'b', name: 'B', isAI: false }] });
  for (const id of ['a', 'b']) {
    must(Party.command(state, { type: 'buy', playerId: id, index: 0 }, 0));
    const unitId = state.players.find(player => player.playerId === id).bench[0].id;
    must(Party.command(state, { type: 'deploy', playerId: id, unitId, col: state.board.columns - 1, row: state.board.rows - 1 }, 0));
  }
  let atMs = 0;
  while (state.roundNumber < 10 && state.phase !== 'finished') {
    for (const player of state.players) if (player.itemShop?.open)
      must(Party.command(state, { type: 'passItemShop', playerId: player.playerId }, atMs));
    for (const id of ['a', 'b']) must(Party.command(state, { type: 'ready', playerId: id, value: true }, atMs));
    must(Party.advance(state, atMs));
    while (state.phase === 'combat') { atMs += 1000; must(Party.advance(state, atMs)); }
  }
  assert.equal(state.roundNumber, 10);
  for (const player of state.players) {
    must(Party.command(state, { type: 'passItemShop', playerId: player.playerId }, atMs));
    must(Party.command(state, { type: 'moveChest', playerId: player.playerId, col: 0, row: state.board.rows - 1 }, atMs));
    must(Party.command(state, { type: 'moveItemChest', playerId: player.playerId, col: 0, row: state.board.rows - 2 }, atMs));
  }
  must(Party.command(state, { type: 'deploy', playerId: 'a', unitId: state.players[0].field[0].id,
    col: state.board.columns - 1, row: state.board.playerStartRow }, atMs));
  state.players[0].field[0].itemIds = ['forgeblade+forgeblade', 'forgeblade+forgeblade', 'forgeblade+forgeblade'];
  for (const id of ['a', 'b']) must(Party.command(state, { type: 'ready', playerId: id, value: true }, atMs));
  must(Party.advance(state, atMs));
  while (state.phase === 'combat') { atMs += 1000; must(Party.advance(state, atMs)); }
  assert.ok(state.receipts.at(-1).results[0].itemChestCaptures.some(capture => capture.captorPlayerId === 'a'));
  assert.equal(state.players[0].pendingComponentChoices, 1);
  must(Party.command(state, { type: 'chooseComponent', playerId: 'a', itemId: 'spellglass' }, atMs));
  assert.equal(state.players[0].pendingComponentChoices, 0);
  assert.ok(state.players[0].items.includes('spellglass'));
});
