'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { assessSavedRoom, scanRoomMounts } = require('./assert-room-deploy-safe.cjs');

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const third = '33333333-3333-4333-8333-333333333333';
const hash = 'f'.repeat(64);
const ownerUid = process.getuid();
const script = path.join(__dirname, 'assert-room-deploy-safe.cjs');

function saved(code, overrides = {}) {
  return { version: 1, roomCode: code, config: { roomType: 'party' }, players: [], sessions: {}, hostPlayerId: 'host',
    createdAtMs: 1, revision: 0, match: null, ...overrides };
}
function match(code, phase) {
  return JSON.stringify({ matchId: 'party:' + code, phase, roundNumber: 1, revision: 0 });
}
function isolated(code, overrides = {}) {
  return saved(code, { config: { roomType: 'duel', openSeatEscrowVersion: 1,
    duelWager: { currency: 'XTZ', network: 'shadownet' } }, ...overrides });
}
function mounts(t) {
  const tmp = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'wtfiap-deploy-safe-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const legacyDir = path.join(tmp, 'legacy');
  const isolatedDir = path.join(tmp, 'isolated');
  fs.mkdirSync(legacyDir);
  fs.mkdirSync(isolatedDir);
  fs.writeFileSync(path.join(isolatedDir, '.isolated-duel-authority'),
    '{"version":1,"database":"wtfiap_isolated_duels","schema":"duel_authority"}\n', { mode: 0o600 });
  return { tmp, legacyDir, isolatedDir, ownerUid };
}
function write(dir, room) {
  const filename = path.join(dir, room.roomCode + '.json');
  fs.writeFileSync(filename, JSON.stringify(room), { mode: 0o600 });
  return filename;
}
function cli({ legacyDir, isolatedDir }) {
  return spawnSync(process.execPath, [script, '--legacy', legacyDir, '--owner-uid', String(ownerUid),
    ...(isolatedDir ? ['--isolated', isolatedDir] : [])], { encoding: 'utf8' });
}

test('room assessment keeps play, prestart admissions, and unsettled escrow deferred', () => {
  const classify = values => assessSavedRoom(saved(first, values), first, 'legacy');
  assert.equal(classify(), 'waiting');
  assert.equal(classify({ fundingLock: {} }), 'fundedWaiting');
  assert.equal(classify({ fundingOffer: { summary: { status: 'matching' } } }), 'fundedWaiting');
  assert.equal(classify({ match: match(first, 'preparation') }), 'preparation');
  assert.equal(classify({ match: match(first, 'combat') }), 'combat');
  assert.equal(classify({ match: match(first, 'finished') }), 'finished');
  assert.equal(classify({ match: match(first, 'preparation'), closedAtMs: 2, closedByPlayerId: 'host' }), 'closed');
  const terminal = { match: match(first, 'finished'), terminalArchive: { version: 2, views: {}, viewsHash: hash } };
  assert.equal(classify({ ...terminal, fundingLock: { summary: { status: 'active' } } }), 'escrowPending');
  assert.equal(classify({ ...terminal, fundingLock: { summary: { status: 'settled' } } }), 'finished');
  assert.equal(classify({ match: match(first, 'finished'), fundingLock: { summary: { status: 'settled' } } }), 'escrowPending');
  const archive = { version: 1, snapshot: {}, snapshotHash: hash };
  assert.equal(classify({ fundingLock: {}, fundingFaultArchive: archive }), 'escrowPending');
  assert.equal(classify({ fundingLock: {}, voidArchive: archive }), 'voided');
  assert.throws(() => classify({ closedAtMs: 2, closedByPlayerId: 'host', fundingOffer: {} }), /closed room/i);
  assert.throws(() => classify({ match: match(first, 'unexpected') }), /saved match or phase/);
  assert.throws(() => classify({ match: match(second, 'finished') }), /saved match or phase/);
  assert.throws(() => classify({ match: 'private-secret-invalid-json' }), /invalid saved JSON/);
});

test('mount scanner returns aggregate safe or deferred exits without disclosing room content', t => {
  const options = mounts(t);
  const { legacyDir, isolatedDir } = options;
  write(legacyDir, saved(first, { match: match(first, 'finished') }));
  assert.equal(cli(options).status, 0);
  write(isolatedDir, isolated(second));
  write(legacyDir, saved(third, { fundingOffer: { summary: { status: 'matching' }, seed: 'private-marker' } }));
  const result = cli(options);
  assert.equal(result.status, 75);
  const { status, counts } = JSON.parse(result.stdout);
  assert.equal(status, 'deferred');
  assert.equal(counts.legacy.finished, 1);
  assert.equal(counts.legacy.fundedWaiting, 1);
  assert.equal(counts.isolated.waiting, 1);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp([first, second, third, 'private-marker'].join('|')));

  fs.writeFileSync(path.join(isolatedDir, second + '.json'), '{secret sensitive bytes');
  const malformed = cli(options);
  assert.equal(malformed.status, 1);
  assert.equal(malformed.stdout, '');
  assert.doesNotMatch(malformed.stderr, /secret|sensitive|[0-9]{8}|\.json/);
});

test('unsafe file ownership and cross-authority room storage fail inspection', t => {
  const options = mounts(t);
  const { legacyDir, isolatedDir, tmp } = options;
  const filename = write(legacyDir, saved(first));
  assert.throws(() => scanRoomMounts({ ...options, ownerUid: ownerUid + 1 }), /safe ownership/);
  fs.chmodSync(filename, 0o644);
  assert.throws(() => scanRoomMounts(options), /private single-owner/);
  fs.chmodSync(filename, 0o600);
  const link = path.join(legacyDir, second + '.json');
  fs.symlinkSync(filename, link);
  assert.equal(cli(options).status, 1);
  fs.unlinkSync(link);
  fs.linkSync(filename, link);
  assert.throws(() => scanRoomMounts(options), /private single-owner/);
  fs.unlinkSync(link);
  const nested = path.join(legacyDir, 'nested');
  fs.mkdirSync(nested);
  assert.throws(() => scanRoomMounts({ ...options, isolatedDir: nested }), /mounts overlap/);
  assert.throws(() => scanRoomMounts({ ...options, isolatedDir: path.join(tmp, 'missing') }), /ENOENT/);
  assert.throws(() => scanRoomMounts({ ...options, isolatedDir: legacyDir }), /mounts overlap/);

  write(isolatedDir, saved(second));
  assert.throws(() => scanRoomMounts(options), /authorized Duel scope/);
  write(isolatedDir, isolated(second));
  assert.throws(() => scanRoomMounts({ ...options, protectedRoomCode: second }), /ownership overlaps/);
  write(isolatedDir, isolated(first));
  assert.throws(() => scanRoomMounts(options), /ownership overlaps/);
});
