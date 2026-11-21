'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRoomDirectory, roomSummary } = require('./room-directory.cjs');

test('room browser lists only public active tables and receipt-backed player records', async () => {
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
    const [table] = await createRoomDirectory(dataDir).list();
    assert.equal(table.type, 'duel'); assert.equal(table.openSeats, 0);
    assert.equal(table.rulesPreset, 'original');
    assert.equal(table.wager.network, 'mainnet'); assert.equal(table.watcherCount, 1);
    assert.deepEqual(table.players.map(({ wins, losses }) => [wins, losses]), [[1, 0], [0, 1]]);
    assert.doesNotMatch(JSON.stringify(table), /private|secret|sessionToken|receipts/);
  } finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
});

test('lobby refreshes share one scan and reread only changed room documents', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wtfiap-room-refresh-'));
  try {
    const roomCode = '22222222-2222-4222-8222-222222222222';
    const archiveCode = '33333333-3333-4333-8333-333333333333';
    const base = { config: { roomType: 'duel' }, players: [{ playerId: 'p1', name: 'Host' }] };
    const filename = path.join(dataDir, roomCode + '.json');
    fs.writeFileSync(filename, JSON.stringify({ ...base, roomCode }));
    fs.writeFileSync(path.join(dataDir, archiveCode + '.json'), JSON.stringify({
      ...base, roomCode: archiveCode, match: JSON.stringify({ phase: 'finished' }),
    }));
    const reads = t.mock.method(fs.promises, 'readFile');
    const directory = createRoomDirectory(dataDir);
    const first = directory.list();
    assert.equal(directory.list(), first);
    assert.deepEqual((await first).map(room => room.roomCode), [roomCode]);
    assert.equal(reads.mock.callCount(), 2);

    assert.equal((await directory.list())[0].watcherCount, 0);
    assert.equal(reads.mock.callCount(), 2);

    // The authority persists via rename, so players see the current room on
    // the next list without discarding already indexed terminal records.
    fs.writeFileSync(filename + '.tmp', JSON.stringify({ ...base, roomCode, watchers: [{ watcherId: 'w1' }] }));
    fs.renameSync(filename + '.tmp', filename);
    assert.equal((await directory.list())[0].watcherCount, 1);
    assert.equal(reads.mock.callCount(), 3);

    fs.unlinkSync(filename);
    assert.deepEqual(await directory.list(), []);
    assert.equal(reads.mock.callCount(), 3);
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

test('sponsor-funded Party and Tournament tables stay discoverable while accepting entrants', () => {
  for (const roomType of ['party', 'tournament']) {
    const locked = roomSummary({ roomCode: 'sponsor',
      config: { roomType, sponsor: { places: [{ place: 1 }] }, sponsorNetwork: 'mainnet' },
      players: [{ playerId: 'p1', name: 'Sponsor', isAI: false }],
      fundingLock: { roomId: 'pinned' }, match: null });
    assert.equal(locked?.type, roomType);
    assert.equal(locked?.openSeats, 7);
    assert.deepEqual(locked?.sponsored, { network: 'mainnet' });
    assert.equal(locked?.wager, null);
  }
  assert.equal(roomSummary({ roomCode: 'legacy', config: { roomType: 'tournament' },
    players: [{ playerId: 'p1', name: 'Host' }], fundingLock: { roomId: 'pinned' } }), null);
});
