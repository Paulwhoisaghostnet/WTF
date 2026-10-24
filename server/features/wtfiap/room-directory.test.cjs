'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listRooms } = require('./room-directory.cjs');

test('room browser lists only public active tables and receipt-backed player records', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wtfiap-rooms-'));
  try {
    const roomCode = '11111111-1111-4111-8111-111111111111';
    fs.writeFileSync(path.join(dataDir, roomCode + '.json'), JSON.stringify({
      roomCode, createdAtMs: 1, config: { roomType: 'duel', duelWager: { currency: 'XTZ', entryFee: '1', network: 'mainnet' } },
      players: [{ playerId: 'p1', name: 'Alpha', isAI: false }, { playerId: 'p2', name: 'Beta', isAI: false }],
      watchers: [{ watcherId: 'w1', name: 'Observer', sessionToken: 'secret' }],
      sessions: { p1: { sessionToken: 'private' } },
      match: { phase: 'preparation', receipts: [{ results: [{ awards: [{ playerId: 'p1', outcome: 'win' }, { playerId: 'p2', outcome: 'loss' }] }] }] },
    }));
    const [table] = listRooms(dataDir);
    assert.equal(table.type, 'duel'); assert.equal(table.openSeats, 0);
    assert.equal(table.rulesPreset, 'original');
    assert.equal(table.wager.network, 'mainnet'); assert.equal(table.watcherCount, 1);
    assert.deepEqual(table.players.map(({ wins, losses }) => [wins, losses]), [[1, 0], [0, 1]]);
    assert.doesNotMatch(JSON.stringify(table), /private|secret|sessionToken|receipts/);
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('room browser labels a creator-pinned variation without revealing its private match', () => {
  const table = require('./room-directory.cjs').roomSummary({ roomCode: 'room', config: { roomType: 'duel', rulesPreset: 'ancient' },
    players: [{ playerId: 'p1', name: 'A', isAI: false }], watchers: [], match: null });
  assert.equal(table.rulesPreset, 'ancient');
  assert.equal(table.openSeats, 1);
});
