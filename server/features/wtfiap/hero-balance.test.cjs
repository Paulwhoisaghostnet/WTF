const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Party = require('./runtime/game/core/party.cjs');
const Engine = require('./runtime/source/engine.js');
const Fortunes = require('./runtime/game/core/fortunes.cjs');
const Rules = require('./rules.cjs');

const players = [{ playerId: 'a', name: 'A', isAI: false }, { playerId: 'b', name: 'B', isAI: false }];
const options = extra => ({ matchId: 'compat-balance', seed: 'compat-balance', boardMode: 'standard',
  preparationSeconds: null, oddPlayerPolicy: 'round-ai', openedAtMs: 0, players,
  itemRulesVersion: 1, cherubRulesVersion: 1, ...extra });
const must = result => { assert.equal(result.ok, true, result.reason); return result; };

function firstRound(extra) {
  const state = Party.createMatch(options(extra));
  for (const id of ['a', 'b']) {
    must(Party.command(state, { type: 'buy', playerId: id, index: 0 }, 0));
    const unit = state.players.find(player => player.playerId === id).bench[0];
    must(Party.command(state, { type: 'deploy', playerId: id, unitId: unit.id, col: 0, row: state.board.rows - 1 }, 0));
    must(Party.command(state, { type: 'ready', playerId: id, value: true }, 0));
  }
  must(Party.advance(state, 0));
  for (let atMs = 1000; state.phase === 'combat'; atMs += 1000) must(Party.advance(state, atMs));
  return state;
}

test('a persisted Cherub room keeps its old combat transcript and public view', () => {
  const state = firstRound({});
  const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(state.balanceVersion, undefined);
  assert.equal(sha(Party.serialize(state)), '6bf6152d787ccd624bac610c5aba6900b358576f4776e90b4cc96bbca02e6850');
  assert.equal(sha(JSON.stringify(Party.view(state, 'a'))), '58759e18ea01350a537eb112024b0eac286cbfa0ec479363d5b886d574e8ed86');
  assert.equal(Rules.getRuntimeRulesHash(process.cwd()), 'b6685336ab0dbd4b5875774e7fae17a2136003ab8ef8f3c416e967fc6ac3c8d8');
  assert.equal(Rules.supportsPinnedRules(Rules.getRuntimeRulesHash(process.cwd()),
    '838117450b955e3f47b35a9fdb714b002b5c99ba5d37911eb506638defd7c612'), true);
  assert.equal(Rules.supportsPinnedRules(Rules.getRuntimeRulesHash(process.cwd()),
    'dd7c9167362f17983d507ba907b8aba87ac6150f01562224d9871c13f6bebb3d'), true);
  assert.equal(Rules.supportsPinnedRules(Rules.getRuntimeRulesHash(process.cwd()),
    'f6808dd4d3cc63e38b1ab9691826b14e2acc0bc837188aa784f96ff710b107de'), true);
});

test('new rooms pin the tuned stats and actions through restoration', () => {
  const state = firstRound({ balanceVersion: 1 });
  assert.equal(state.balanceVersion, 1);
  assert.equal(Party.restore(Party.serialize(state)).balanceVersion, 1);
  assert.equal(Party.view(state, 'a').balanceVersion, 1);
  const traits = Engine.synergies([]);
  const old = Engine.deriveStats({ heroId: 'ember-drazhul', level: 1 }, traits);
  const tuned = Engine.deriveStats({ heroId: 'ember-drazhul', level: 1, balanceVersion: 1 }, traits);
  assert.ok(tuned.abilityScore < old.abilityScore);
  assert.equal(tuned.maxHp, old.maxHp);
  const game = Engine.createGame({ version: 5, config: Engine.DEFAULT_CONFIG, playerLevel: 1,
    board: state.board, bench: [], opponents: [], battleSeed: 'balance-actions' });
  game.field = [{ id: 'hot-shot', heroId: 'ember-ranger', level: 1, col: 0, row: state.board.rows - 1 }];
  assert.equal(Engine.previewCombatUnits(game)[0].abilityActions[0].factor, 2);
  game.balanceVersion = 1;
  assert.equal(Engine.previewCombatUnits(game)[0].abilityActions[0].factor, 1.2);
});

test('new fortune prices are pinned while an existing room keeps five-gold receipts', () => {
  const prepare = extra => {
    const state = Party.createMatch(options({ fortuneRulesVersion: 1, ...extra }));
    for (const id of ['a', 'b']) {
      must(Party.command(state, { type: 'buy', playerId: id, index: 0 }, 0));
      const unit = state.players.find(player => player.playerId === id).bench[0];
      must(Party.command(state, { type: 'deploy', playerId: id, unitId: unit.id, col: 0, row: state.board.rows - 1 }, 0));
      must(Party.command(state, { type: 'ready', playerId: id, value: true }, 0));
    }
    must(Party.advance(state, 0));
    for (let atMs = 1000; state.phase === 'combat'; atMs += 1000) must(Party.advance(state, atMs));
    return state;
  };
  const old = prepare({}), tuned = prepare({ fortunePricingVersion: 1 });
  const atMs = state => state.lastAdvancedAtMs;
  old.players[0].fortuneShop = { roll: 0, blessingId: 'bright-coffer', curseId: null };
  tuned.players[0].fortuneShop = { roll: 0, blessingId: 'bright-coffer', curseId: 'damp-scrap' };
  must(Party.command(old, { type: 'buyFortune', playerId: 'a', fortuneId: 'bright-coffer' }, atMs(old)));
  assert.equal(old.fortuneReceipts.at(-1).goldSpent, 5);
  assert.equal(Party.command(tuned, { type: 'buyFortune', playerId: 'a', fortuneId: 'bright-coffer' }, atMs(tuned)).ok, false);
  must(Party.command(tuned, { type: 'buyFortune', playerId: 'a', fortuneId: 'damp-scrap', targetPlayerId: 'b' }, atMs(tuned)));
  assert.equal(tuned.fortuneReceipts.at(-1).goldSpent, 1);
  assert.equal(Party.view(old, 'a').fortunePricingVersion, undefined);
  assert.equal(Party.view(tuned, 'a').fortunePricingVersion, 1);
  assert.equal(Fortunes.priceFor('dim-coffer', 1), 5);
  assert.equal(Rules.supportsPinnedRules(Rules.getRuntimeRulesHash(process.cwd()),
    'cb522a7d5245560b0aed42218bf283172338f13b2b178bb2c98e6e7f77ca86a9'), true);
});
