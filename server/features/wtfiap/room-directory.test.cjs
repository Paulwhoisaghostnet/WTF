'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { listRooms, roomSummary } = require('./room-directory.cjs');

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

test('directory includes joinable and live rooms but excludes full waiting, closed and terminal records', () => {
  const base = { roomCode: 'table', config: { roomType: 'duel' }, players: [{ playerId: 'p1', name: 'Host' }] };
  assert.equal(roomSummary(base).openSeats, 1);
  assert.equal(roomSummary({ ...base, players: [...base.players, { playerId: 'p2', name: 'Guest' }] }), null);
  assert.equal(roomSummary({ ...base, players: [...base.players, { playerId: 'p2', name: 'Guest' }],
    match: { phase: 'preparation' } }).phase, 'preparation');
  assert.equal(roomSummary({ ...base, closedAtMs: 100, closedByPlayerId: 'p1' }), null);
  assert.equal(roomSummary({ ...base, match: { phase: 'finished' } }), null);
  assert.equal(roomSummary({ ...base, match: JSON.stringify({ phase: 'finished', receipts: [] }) }), null);
  const serializedLive = roomSummary({ ...base, players: [...base.players, { playerId: 'p2', name: 'Guest' }],
    match: JSON.stringify({ phase: 'preparation', receipts: [{ results: [{ awards: [{ playerId: 'p1', outcome: 'win' }] }] }] }) });
  assert.equal(serializedLive.phase, 'preparation');
  assert.equal(serializedLive.players[0].wins, 1);
  assert.equal(roomSummary({ ...base, match: '{corrupt saved match' }), null);
  assert.equal(roomSummary({ ...base, voidArchive: {} }), null);
  assert.equal(roomSummary({ ...base, fundingFaultArchive: {} }), null);
});
