'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');

const roomUuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const phases = new Set(['preparation', 'combat', 'finished']);
const types = new Set(['duel', 'party', 'tournament']);
const networks = new Set(['mainnet', 'shadownet']);
const terminalStates = new Set(['closed', 'finished', 'voided']);
const bindingFile = '.isolated-duel-authority';
const isolatedBinding = '{"version":1,"database":"wtfiap_isolated_duels","schema":"duel_authority"}\n';

class InspectionError extends Error {}

function check(ok, message) {
  if (!ok) throw new InspectionError(message);
}

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function natural(value) { return Number.isSafeInteger(value) && value >= 0; }
function parseSaved(text) {
  try { return JSON.parse(text); }
  catch { throw new InspectionError('A room contains invalid saved JSON.'); }
}

function assessSavedRoom(room, code, authority) {
  check(object(room) && room.version === 1 && roomUuid.test(code) && room.roomCode === code &&
    object(room.config) && Array.isArray(room.players) && object(room.sessions) &&
    natural(room.createdAtMs) && natural(room.revision) && Object.hasOwn(room, 'match'),
  'A room has an invalid saved envelope.');
  const { config, fundingLock, fundingOffer, terminalArchive, voidArchive, fundingFaultArchive } = room;
  check(config.roomType === undefined || types.has(config.roomType), 'A room has an invalid type.');
  if (authority === 'isolated') {
    check(config.roomType === 'duel' && !config.sponsor && !config.tournament &&
      config.openSeatEscrowVersion === 1 && config.duelWager?.currency === 'XTZ' && networks.has(config.duelWager?.network),
    'An isolated room is outside its authorized Duel scope.');
  }
  for (const fundedOrArchive of [fundingLock, fundingOffer, terminalArchive, voidArchive, fundingFaultArchive]) {
    check(fundedOrArchive === undefined || object(fundedOrArchive), 'A room has a malformed escrow or archive record.');
  }
  const match = typeof room.match === 'string' ? parseSaved(room.match) : room.match;
  if (room.match !== null) {
    check(typeof room.match === 'string' && object(match) && match.matchId === 'party:' + code && phases.has(match.phase) &&
      Number.isSafeInteger(match.roundNumber) && match.roundNumber > 0 && natural(match.revision),
    'A room has an invalid saved match or phase.');
  }
  if (room.closedAtMs !== undefined) {
    check(natural(room.closedAtMs) && room.closedAtMs >= room.createdAtMs && !fundingLock && !fundingOffer &&
      !terminalArchive && !voidArchive && !fundingFaultArchive && typeof room.closedByPlayerId === 'string' &&
      (room.closedByPlayerId === room.hostPlayerId || config.sponsor && room.closedByPlayerId === room.hostWatcherId),
    'A closed room lacks a valid host closure record.');
    return 'closed';
  }
  if (voidArchive || fundingFaultArchive) {
    const archive = voidArchive || fundingFaultArchive;
    check(!(voidArchive && fundingFaultArchive) && fundingLock && match === null && !terminalArchive &&
      archive.version === 1 && object(archive.snapshot) && /^[0-9a-f]{64}$/.test(archive.snapshotHash),
    'A room has an invalid technical archive.');
    return voidArchive ? 'voided' : 'escrowPending';
  }
  if (terminalArchive) {
    check(fundingLock && match?.phase === 'finished' && [1, 2].includes(terminalArchive.version) &&
      object(terminalArchive.views) && /^[0-9a-f]{64}$/.test(terminalArchive.viewsHash),
    'A room has an invalid terminal archive.');
  }
  if (match?.phase === 'finished') {
    if (fundingLock || fundingOffer) {
      return terminalArchive && fundingLock?.summary?.status === 'settled' ? 'finished' : 'escrowPending';
    }
    return 'finished';
  }
  if (match) return match.phase;
  // Every waiting room can start once its host or an escrow callback acts.
  return fundingLock || fundingOffer ? 'fundedWaiting' : 'waiting';
}

function readPrivateFile(filename, ownerUid) {
  const target = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(target);
    check(stat.isFile() && stat.uid === ownerUid && stat.nlink === 1 && (stat.mode & 0o077) === 0,
      'A room or binding file lacks private single-owner storage.');
    return fs.readFileSync(target, 'utf8');
  } finally { fs.closeSync(target); }
}

function mountsForScan({ legacyDir, isolatedDir, ownerUid }) {
  check(natural(ownerUid), 'Invalid room file owner policy.');
  if (legacyDir && isolatedDir) {
    const nested = (parent, child) => {
      const relative = path.relative(parent, child);
      return relative !== '..' && !relative.startsWith('..' + path.sep);
    };
    check(!nested(legacyDir, isolatedDir) && !nested(isolatedDir, legacyDir), 'Legacy and isolated room mounts overlap.');
  }
  const mounts = [['legacy', legacyDir], ...(isolatedDir ? [['isolated', isolatedDir]] : [])];
  const seen = new Set();
  return mounts.map(([authority, directory]) => {
    check(typeof directory === 'string' && path.isAbsolute(directory) && directory === path.resolve(directory),
      'Room mounts must be explicit absolute paths.');
    const stat = fs.lstatSync(directory);
    check(stat.isDirectory() && stat.uid === ownerUid && (stat.mode & 0o022) === 0 && fs.realpathSync(directory) === directory,
      'A room mount is indirect or lacks safe ownership.');
    const identity = `${stat.dev}:${stat.ino}`;
    check(!seen.has(identity), 'Legacy and isolated room mounts overlap.');
    seen.add(identity);
    const marker = path.join(directory, bindingFile);
    if (authority === 'isolated') {
      check(readPrivateFile(marker, ownerUid) === isolatedBinding, 'The isolated room mount binding does not match.');
    } else {
      try { fs.lstatSync(marker); throw new InspectionError('The legacy mount contains the isolated room binding.'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return { authority, directory, identity };
  });
}

function scanRoomMounts({ legacyDir, isolatedDir, protectedRoomCode, ownerUid = 1000 }) {
  check(protectedRoomCode === undefined || roomUuid.test(protectedRoomCode), 'Invalid protected room policy.');
  const counts = {};
  const seen = new Set();
  let deferred = false;
  for (const { authority, directory, identity } of mountsForScan({ legacyDir, isolatedDir, ownerUid })) {
    counts[authority] = { closed: 0, finished: 0, voided: 0, waiting: 0, fundedWaiting: 0, preparation: 0, combat: 0, escrowPending: 0 };
    for (const entry of fs.readdirSync(directory)) {
      if (!entry.endsWith('.json')) continue;
      const code = entry.slice(0, -5);
      check(roomUuid.test(code), 'A room has a noncanonical saved filename.');
      check(!seen.has(code) && (authority !== 'isolated' || code !== protectedRoomCode),
        'Room ownership overlaps the legacy and isolated authorities.');
      seen.add(code);
      const room = parseSaved(readPrivateFile(path.join(directory, entry), ownerUid));
      const status = assessSavedRoom(room, code, authority);
      counts[authority][status]++;
      if (!terminalStates.has(status)) deferred = true;
    }
    const after = fs.lstatSync(directory);
    check(after.isDirectory() && `${after.dev}:${after.ino}` === identity, 'A room mount changed during inspection.');
  }
  return { status: deferred ? 'deferred' : 'safe', counts };
}

if (require.main === module) {
  try {
    const { values } = parseArgs({ options: { legacy: { type: 'string' }, isolated: { type: 'string' },
      'owner-uid': { type: 'string', default: '1000' }, 'protected-room': { type: 'string' } } });
    const result = scanRoomMounts({ legacyDir: values.legacy, isolatedDir: values.isolated,
      protectedRoomCode: values['protected-room'], ownerUid: /^\d+$/.test(values['owner-uid']) ? Number(values['owner-uid']) : NaN });
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.status === 'deferred' ? 75 : 0;
  } catch (error) {
    // JSON parser and filesystem errors may include paths or private content.
    const reason = error instanceof InspectionError ? error.message : 'Room storage or configuration could not be inspected.';
    process.stderr.write(`coLILseum deploy inspection failed. ${reason}\n`);
    process.exitCode = 1;
  }
}

module.exports = { assessSavedRoom, scanRoomMounts };
