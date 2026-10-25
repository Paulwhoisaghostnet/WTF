const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createServer } = require('./runtime/game/server/party-server.cjs');
const Engine = require('./runtime/source/engine.js');
const Party = require('./runtime/game/core/party.cjs');

test('new hosted rooms pin level-sensitive shop odds while an old waiting room remains valid', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'colilseum-shop-odds-'));
  let app;
  try {
    app = createServer({ dataDir });
    const address = await app.ready;
    let created;
    for (const rulesPreset of ['ancient', 'modern', 'custom']) {
      const gameFeatures = rulesPreset === 'custom' ? Object.fromEntries(
        ['treasure', 'items', 'cherub', 'shopHold', 'battlePlans', 'sharedDraft', 'supplyEncounters',
          'blessings', 'curses', 'zoneBonuses'].map(key => [key, false])) : undefined;
      const response = await fetch(address.url + '/api/party/rooms', { method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Host', roomType: 'duel', boardMode: 'standard',
          preparationSeconds: null, rulesPreset, ...(gameFeatures ? { gameFeatures } : {}) }) });
      assert.equal(response.status, 201);
      const room = await response.json();
      assert.equal(app.funding.inspect(room.roomCode).config.shopOddsVersion, 1);
      if (rulesPreset === 'modern') created = room;
    }
    assert.equal(Engine.shopCostOdds(7)[3].probability > Engine.SPAWN_RARITY.costs[3].probability, true);
    await app.close(); app = null;

    const filename = path.join(dataDir, created.roomCode + '.json');
    const priorRoom = JSON.parse(fs.readFileSync(filename, 'utf8'));
    delete priorRoom.config.shopOddsVersion;
    fs.writeFileSync(filename, JSON.stringify(priorRoom));
    app = createServer({ dataDir });
    await app.ready;
    assert.equal(app.funding.inspect(created.roomCode).config.shopOddsVersion, undefined);
  } finally {
    if (app) await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('pre-change Modern rooms replay their two-seat and eight-seat transcripts unchanged', () => {
  const expected = {
    2: '0cfd418c9eeaac01918d583a40e34edb135a97fed6f5c98765a2f44b860c8ad3',
    8: '67d2f5d2479c11a4a8fae75c4d3790445f1ed598f7464348377f97574361d009',
  };
  for (const count of [2, 8]) {
    const state = Party.createMatch({ matchId: `old-modern-${count}`, seed: `old-modern-${count}`,
      boardMode: 'standard', preparationSeconds: null, oddPlayerPolicy: 'round-ai', openedAtMs: 0,
      itemRulesVersion: 1, cherubRulesVersion: 2, itemChestPlacementVersion: 2,
      balanceVersion: 1, shopLockRulesVersion: 1, encounterRulesVersion: 1,
      draftRulesVersion: 1, planRulesVersion: 1, fortuneRulesVersion: 1, fortunePricingVersion: 1,
      players: Array.from({ length: count }, (_, index) => ({ playerId: `p${index}`, name: `P${index}`, isAI: true })) });
    const digest = crypto.createHash('sha256');
    let atMs = 0;
    const capture = () => { digest.update(Party.serialize(state)); digest.update(JSON.stringify(Party.view(state, 'p0'))); };
    capture();
    while (state.phase !== 'finished' && state.roundNumber <= 10) {
      for (const player of state.players.filter(entry => entry.hp > 0)) {
        assert.equal(Party.prepareAI(state, player.playerId, atMs).ok, true); capture();
      }
      assert.equal(Party.advance(state, atMs).ok, true); capture();
      while (state.phase === 'combat') { atMs += 1000; assert.equal(Party.advance(state, atMs).ok, true); capture(); }
    }
    assert.equal(digest.digest('hex'), expected[count], `${count}-seat old-room replay changed`);
  }
});

test('a new Modern eight-seat match completes with the new shop rules', () => {
  const state = Party.createMatch({ matchId: 'new-modern-shop-odds', seed: 'new-modern-shop-odds',
    boardMode: 'standard', preparationSeconds: null, oddPlayerPolicy: 'round-ai', openedAtMs: 0,
    shopOddsVersion: 1, itemRulesVersion: 1, cherubRulesVersion: 2, itemChestPlacementVersion: 2,
    balanceVersion: 1, shopLockRulesVersion: 1, encounterRulesVersion: 1,
    draftRulesVersion: 1, planRulesVersion: 1, fortuneRulesVersion: 1, fortunePricingVersion: 1,
    players: Array.from({ length: 8 }, (_, index) => ({ playerId: `p${index}`, name: `P${index}`, isAI: true })) });
  let atMs = 0, higherCostOffers = 0;
  while (state.phase !== 'finished') {
    if (state.phase === 'preparation') {
      for (const player of state.players.filter(entry => entry.hp > 0)) {
        higherCostOffers += player.shop.filter(offer => offer?.cost > 1).length;
        assert.equal(Party.prepareAI(state, player.playerId, atMs).ok, true);
      }
      assert.equal(Party.advance(state, atMs).ok, true);
    } else {
      atMs += 1000;
      assert.equal(Party.advance(state, atMs).ok, true);
    }
  }
  assert.equal(Party.validate(state), true);
  assert.ok(higherCostOffers > 0);
  assert.ok(state.players.some(player => player.playerId === state.winnerId));
});
