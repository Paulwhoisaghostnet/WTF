const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Party = require('./runtime/game/core/party.cjs');
const Items = require('./runtime/game/core/items.cjs');
const rules = require('./rules.cjs');

const must = result => { assert.equal(result.ok, true, result.reason); return result; };
const room = (extra = {}, count = 2) => Party.createMatch({ matchId: 'parity-' + count,
  seed: 'parity-seed', boardMode: 'standard', preparationSeconds: null,
  oddPlayerPolicy: 'round-ai', openedAtMs: 0,
  players: Array.from({ length: count }, (_, index) => ({ playerId: 'p' + index, name: 'P' + index, isAI: true })), ...extra });

test('new eight-seat rooms resolve plans, a contested draft, and protected supply encounters', () => {
  const state = room({ itemRulesVersion: 1, cherubRulesVersion: 1, balanceVersion: 1,
    shopLockRulesVersion: 1, encounterRulesVersion: 1, draftRulesVersion: 1, planRulesVersion: 1 }, 8);
  let time = 0;
  for (let round = 1; round <= 8; round++) {
    if (round === 4 || round === 8) {
      assert.equal(state.draft.availableIds.length, Items.componentIds.length);
      assert.equal(Party.view(state, 'p0').draft.picked, false);
    }
    for (const player of state.players.filter(entry => entry.hp > 0)) must(Party.prepareAI(state, player.playerId, time));
    if (round === 3 || round === 7) assert.equal(state.planReceipts.length, round === 3 ? 8 : 16);
    if (round === 4 || round === 8) assert.equal(state.draft.pickedPlayerIds.length, 8);
    const beforeHP = state.players.map(player => player.hp);
    must(Party.advance(state, time));
    if (round === 5) assert.ok(state.pairings.every(pair => pair.isRoundAI));
    while (state.phase === 'combat') { time += 1000; must(Party.advance(state, time)); }
    if (round === 5) assert.deepEqual(state.players.map(player => player.hp), beforeHP);
    assert.equal(Party.validate(state), true);
  }
  assert.ok(state.itemReceipts.some(receipt => receipt.kind === 'shared-draft'));
  assert.deepEqual(Party.view(Party.restore(Party.serialize(state)), 'p0'), Party.view(state, 'p0'));
});

test('old first-round authority and views remain byte-identical under pinned rules', () => {
  const expected = {
    legacy: { state: '6f8eb97fb1958d3f9185a2b9bebd1ca87138c2424f8b3964314479ebff0949c0', view: 'fb6f9fd0598d17ef08dd0d001b74b0692089fe4a282e35edd31a4332cb2cf741' },
    items: { state: 'd96dd924d792c2be976147baaf3bc798069bc95bbec7d601cded0b6abdc92faf', view: '841683e7f168bee3701610c620934a42a2af69313dbb876cddaca813c8e2d888' },
    cherub: { state: '9d39b0f8e5383787ed98427041bac58a99a21a96dfd42861c31d9a7ae3d1a377', view: '9c99288e85dcc2efdadc7d9a69c034d0178a9d66268737efcd45ec9bf82c80f4' },
    balanced: { state: 'ee8fa2781604ad1175472efe53ccbd3a9e7a168871709855d6f13e8681c0ab93', view: '032c783a34baadc02128689a3b9e14ad58e454f78c5bb3096be2057a9a353f8a' },
  };
  // The previous release's independent fixture hashes are checked separately
  // from the opt-in systems so wager rooms never silently inherit new terms.
  const hash = value => crypto.createHash('sha256').update(value).digest('hex');
  for (const [label, extra] of Object.entries({ legacy: {}, items: { itemRulesVersion: 1 },
    cherub: { itemRulesVersion: 1, cherubRulesVersion: 1 },
    balanced: { itemRulesVersion: 1, cherubRulesVersion: 1, balanceVersion: 1 } })) {
    const state = Party.createMatch({ matchId: 'legacy-' + label, seed: 'legacy-seed', boardMode: 'standard',
      preparationSeconds: null, oddPlayerPolicy: 'round-ai', openedAtMs: 0,
      players: [{ playerId: 'a', name: 'A', isAI: false }, { playerId: 'b', name: 'B', isAI: false }], ...extra });
    for (const playerId of ['a', 'b']) {
      const player = state.players.find(entry => entry.playerId === playerId);
      if (player.itemShop?.open) must(Party.command(state, { type: 'passItemShop', playerId }, 0));
      must(Party.command(state, { type: 'buy', playerId, index: 0 }, 0));
      must(Party.command(state, { type: 'deploy', playerId,
        unitId: state.players.find(entry => entry.playerId === playerId).bench[0].id,
        col: 0, row: state.board.rows - 1 }, 0));
      must(Party.command(state, { type: 'ready', playerId, value: true }, 0));
    }
    must(Party.advance(state, 0)); let time = 0;
    while (state.phase === 'combat') { time += 1000; must(Party.advance(state, time)); }
    assert.deepEqual({ state: hash(Party.serialize(state)), view: hash(JSON.stringify(Party.view(state, 'a'))) }, expected[label]);
  }
  assert.equal(rules.supportsPinnedRules(rules.getRuntimeRulesHash(),
    'dd7c9167362f17983d507ba907b8aba87ac6150f01562224d9871c13f6bebb3d'), true);
  assert.equal(Object.hasOwn(room().players[0], 'shopLocked'), false);
  assert.equal(Party.view(room(), 'p0').planRulesVersion, undefined);
});

test('previous balanced eight-seat rooms keep their full eight-round transcript', () => {
  // Recorded from the immediately preceding deployed runtime before changing
  // these optional systems; includes preparations, combats and public views.
  const state = room({ matchId: 'legacy-eight', seed: 'legacy-eight-seed',
    itemRulesVersion: 1, cherubRulesVersion: 1, balanceVersion: 1 }, 8);
  const hash = crypto.createHash('sha256');
  let time = 0;
  for (let round = 1; round <= 8; round++) {
    for (const player of state.players.filter(entry => entry.hp > 0)) must(Party.prepareAI(state, player.playerId, time));
    hash.update(Party.serialize(state)); hash.update(JSON.stringify(Party.view(state, 'p0')));
    must(Party.advance(state, time));
    while (state.phase === 'combat') { time += 1000; must(Party.advance(state, time)); }
    hash.update(Party.serialize(state)); hash.update(JSON.stringify(Party.view(state, 'p0')));
  }
  assert.equal(hash.digest('hex'), '5d27acda6385d185ea61c347bff0e0232c224b02d882f2793fe727fcc29c909e');
});
