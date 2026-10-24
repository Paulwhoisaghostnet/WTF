#!/usr/bin/env node
'use strict';

// A single local authority owns room clocks, commands and durable state. No
// browser-supplied gold, shop draw, seed or combat result is accepted here.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Party = require('../core/party.cjs');
const Match = require('../core/match.cjs');
const Tournament = require('../core/tournament.cjs');
const DuelWager = require('../core/duel-wager.cjs');
const Accounting = require('../core/tournament-accounting.cjs');
const Standings = require('../core/party-standings.cjs');
const ROOT = path.resolve(__dirname, '../..');
const DIST = path.join(ROOT, 'dist');
const REVIEW = path.join(ROOT, 'review');
const ROOM_SIZE = 8; // Owner-approved party population and corresponding pool.
const PREPARATION_SECONDS = [120, 300, 600, null]; // Owner's 2m/5m/10m or everyone-ready party choices.
const MAX_TIMER_MS = 2147483647; // Node setTimeout's signed 32-bit contract.
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
const fingerprint = value => hash(JSON.stringify(ordered(value)));
const validText = value => typeof value === 'string' && value.trim().length > 0;
function changes(before, after, at = [], result = []) {
  if (Object.is(before, after)) return result;
  if (!before || !after || typeof before !== 'object' || typeof after !== 'object' ||
    Array.isArray(before) !== Array.isArray(after) || (Array.isArray(after) && after.length < before.length)) {
    result.push({ path: at, value: after }); return result;
  }
  for (const key of Object.keys(before)) if (!Object.hasOwn(after, key)) result.push({ path: [...at, key], remove: true });
  for (const key of Object.keys(after)) changes(before[key], after[key], [...at, key], result);
  return result;
}
function requireThat(condition, reason, status = 400) {
  if (!condition) { const error = new Error(reason); error.status = status; throw error; }
}
function atomicJSON(filename, value) {
  const temporary = filename + '.' + crypto.randomUUID() + '.tmp';
  let fd;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, filename);
    const directory = fs.openSync(path.dirname(filename), 'r');
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } catch (error) {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    throw error;
  }
}
function configuration(input) {
  requireThat(input && Match.hasBoardMode(input.boardMode), 'Select a supported board mode.');
  requireThat(PREPARATION_SECONDS.includes(input.preparationSeconds), 'Choose a preparation timer of 2m, 5m, 10m or everyone ready.');
  const earlyStart = input.preparationSeconds === null;
  requireThat(input.earlyStart === undefined || input.earlyStart === earlyStart, 'Timed rooms wait for their deadline; untimed rooms wait for everyone ready.');
  requireThat(input.oddPlayerPolicy === undefined || input.oddPlayerPolicy === 'round-ai', 'An odd survivor faces the round-scaled AI opponent.');
  const roomType = Object.hasOwn(input, 'roomType') ? input.roomType : 'party';
  requireThat(['duel', 'party', 'tournament'].includes(roomType), 'Choose a Duel, Party or Tournament room.');
  requireThat(!['config', 'currency', 'entryFee', 'entryAtomic', 'prizePercentages', 'shares', 'tournamentAccounting'].some(key => Object.hasOwn(input, key)),
    'Tournament money terms belong in the tournament configuration.');
  const config = { boardMode: input.boardMode, preparationSeconds: input.preparationSeconds,
    earlyStart, oddPlayerPolicy: 'round-ai' };
  if (roomType === 'tournament') {
    requireThat(!Object.hasOwn(input, 'duelWager') && (input.allowAI === undefined || typeof input.allowAI === 'boolean'),
      'Tournament AI fill must be an explicit yes or no.');
    try { config.tournament = Tournament.normalizeTerms(input.tournament); }
    catch (error) { requireThat(false, error.message); }
    if (input.allowAI === true) config.allowAI = true;
    config.roomType = roomType;
  } else {
    requireThat(!Object.hasOwn(input, 'tournament'), 'Entry fees are only available in Tournament rooms.');
    requireThat(!Object.hasOwn(input, 'allowAI'), 'Only tournaments can fill empty seats with AI.');
    if (roomType === 'duel') {
      if (Object.hasOwn(input, 'duelWager')) {
        try { config.duelWager = DuelWager.normalizeTerms(input.duelWager); }
        catch (error) { requireThat(false, error.message); }
      }
      config.roomType = roomType;
    } else requireThat(!Object.hasOwn(input, 'duelWager'), 'Duel entry fees belong only in Duel rooms.');
  }
  return config;
}
function immutableTerms(input) {
  requireThat(!['roomType', 'tournament', 'duelWager', 'allowAI', 'tournamentAccounting', 'config', 'currency', 'entryFee', 'entryAtomic',
    'prizePercentages', 'shares', 'mode', 'fundingStatus', 'collectedAtomic'].some(key => Object.hasOwn(input, key)),
  'Room type and tournament terms are fixed when the room is created.');
}
function writeJSON(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff' }); response.end(JSON.stringify(payload));
}
async function bodyJSON(request) {
  requireThat((request.headers['content-type'] || '').split(';')[0].trim() === 'application/json', 'Use application/json.', 415);
  // The host's JSON middleware may have already consumed the stream. Only a
  // server-owned rawBody property is accepted; request headers cannot set it.
  let raw;
  if (Object.hasOwn(request, 'rawBody')) {
    requireThat(typeof request.rawBody === 'string' || Buffer.isBuffer(request.rawBody), 'The host must provide the original JSON bytes.');
    raw = request.rawBody.toString();
  } else {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    raw = Buffer.concat(chunks).toString('utf8');
  }
  let value; try { value = JSON.parse(raw); } catch { requireThat(false, 'The request body must be valid JSON.'); }
  requireThat(value && typeof value === 'object' && !Array.isArray(value), 'The request body must be a JSON object.');
  return value;
}

function auditFundingRoom(room, atMs) {
  const evidence = { roomCode: room.roomCode, roomId: room.fundingLock.roomId, checkedAtMs: atMs,
    snapshotHash: fingerprint({ match: room.match, tournamentAccounting: room.tournamentAccounting || null }) };
  if (room.terminalArchive || room.voidArchive || room.match?.phase === 'finished') return { ok: true, code: 'terminal-room', evidence };
  try {
    if (room.match) {
      const copy = Party.restore(Party.serialize(room.match));
      if (room.config.roomType === 'tournament' && room.config.allowAI !== true) Accounting.validate(room.tournamentAccounting, room.match);
      const result = Party.advance(copy, atMs);
      requireThat(result.ok, result.reason || 'Authoritative transition failed.');
      Party.validate(copy);
    }
    return { ok: true, code: 'healthy', evidence };
  } catch (error) {
    return { ok: false, code: 'authoritative-game-failure', evidence: { ...evidence, failure: String(error.message || error) } };
  }
}

function createServer({ port = 0, host = '127.0.0.1', dataDir, clock = Date.now, listen = true,
  apiPrefix = '/api/party', sharePath = '/dist/party.html', staticFiles = true, resolveActor, onRoomChanged } = {}) {
  requireThat(typeof apiPrefix === 'string' && /^\/[A-Za-z0-9_/-]+$/.test(apiPrefix) && !apiPrefix.endsWith('/') && !apiPrefix.includes('//'), 'Use an absolute API path without a trailing slash.');
  requireThat(typeof sharePath === 'string' && sharePath.startsWith('/') && !sharePath.startsWith('//') && !/[?#\\]/.test(sharePath), 'Use a same-origin invitation path without a query or fragment.');
  requireThat(resolveActor === undefined || typeof resolveActor === 'function', 'The host actor resolver must be a function.');
  requireThat(validText(dataDir), 'An explicit private dataDir is required.');
  requireThat(Number.isInteger(port) && port >= 0 && port <= 65535, 'Port must be an unsigned 16-bit TCP port; zero requests an OS-selected port.');
  const directory = path.resolve(dataDir); fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const rooms = new Map(), streams = new Map(), timers = new Map();
  // Tick revisions are intentionally volatile. A new server authority epoch
  // lets clients accept a recovered durable revision after an unclean restart.
  const authorityEpoch = crypto.randomUUID();
  let closing = false;
  const now = () => { const value = clock(); requireThat(Number.isSafeInteger(value) && value >= 0, 'The server clock must produce epoch milliseconds.'); return value; };
  const filename = room => path.join(directory, room.roomCode + '.json');
  const diskState = room => ({ ...room, match: room.match ? (room._terminalSerialized || Party.serialize(room.match)) : null });
  function persist(room, notifyFunding = true) {
    if (!room.voidArchive && room.fundingLock && room.match?.phase === 'finished' && !room.terminalArchive) {
      // Cache completed human views only after replay-derived accounting has
      // been validated under this room's pinned rules. Historical claims must
      // not replay an old match through a later game's hero definitions.
      if (room.config.roomType === 'tournament' && room.config.allowAI !== true) {
        Accounting.validate(room.tournamentAccounting, room.match);
        requireThat(room.tournamentAccounting.status === 'complete', 'A funded terminal archive requires complete verified accounting.');
      } else {
        room.wagerCompletion = { ...Standings.derive(room.match), receiptsHash: fingerprint(room.match.receipts) };
      }
      const views = {};
      for (const player of room.players) {
        const session = Object.values(room.sessions).find(value => value.playerId === player.playerId) || { playerId: player.playerId, nextSequence: 1 };
        views[player.playerId] = snapshot(room, session);
      }
      room.terminalArchive = room.wagerCompletion
        ? { version: 2, views, viewsHash: fingerprint(views), completionHash: fingerprint(room.wagerCompletion) }
        : { version: 1, views, viewsHash: fingerprint(views), accountingHash: fingerprint(room.tournamentAccounting) };
      Object.defineProperty(room, '_terminalSerialized', { value: Party.serialize(room.match), writable: true, configurable: true });
    }
    atomicJSON(filename(room), diskState(room));
    // A host notification is only a wake-up hint. The durable room is the
    // recovery source; a missed notification must never lose a result.
    if (notifyFunding && onRoomChanged) queueMicrotask(() => onRoomChanged(room.roomCode));
  }
  const isTournament = room => room.config.roomType === 'tournament';
  const isDuel = room => room.config.roomType === 'duel';
  const isWageredDuel = room => isDuel(room) && !!room.config.duelWager;
  const usesLegacyAccounting = room => isTournament(room) && room.config.allowAI !== true;
  const hasWagerTerms = room => isTournament(room) || isWageredDuel(room);
  const roomCapacity = room => isDuel(room) ? 2 : ROOM_SIZE;
  function reconcileTournament(room, restoring = false) {
    if (!isTournament(room)) {
      requireThat(room.tournamentAccounting === undefined, 'Party rooms cannot carry tournament accounting.'); return false;
    }
    Tournament.validateTerms(room.config.tournament);
    if (room.config.allowAI === true) {
      requireThat(room.tournamentAccounting === undefined, 'AI-filled tournaments use their verified human-only escrow result.');
      if (room.match) requireThat(room.players.length === ROOM_SIZE && room.match.players.length === ROOM_SIZE,
        'AI-filled tournament matches retain all eight battlefield seats.');
      if (room.match?.phase === 'finished') {
        const expected = { ...Standings.derive(room.match), receiptsHash: fingerprint(room.match.receipts) };
        if (room.wagerCompletion) requireThat(fingerprint(room.wagerCompletion) === fingerprint(expected),
          'AI tournament completion changed from its authoritative combat receipts.');
        else { room.wagerCompletion = expected; return true; }
      }
      return false;
    }
    requireThat(room.players.every(player => player.isAI === false), 'Tournament entrants must be human players.');
    if (!room.match) {
      requireThat(room.tournamentAccounting === undefined, 'Tournament accounting begins when eight humans start.'); return false;
    }
    requireThat(room.players.length === ROOM_SIZE && room.match.players.every(player => player.isAI === false), 'Tournament matches require eight human entrants.');
    requireThat(fingerprint(room.players.map(player => player.playerId).sort()) === fingerprint(room.match.players.map(player => player.playerId).sort()),
      'Tournament entrants must remain the original eight humans.');
    requireThat(fingerprint(room.tournamentAccounting.terms) === fingerprint(room.config.tournament), 'Tournament terms cannot change after entry.');
    let changed = false;
    if (restoring) {
      // The accounting module verifies legacy allocations and their complete
      // authoritative match binding before upgrading the tie-sharing policy.
      const restored = Accounting.restore(room.tournamentAccounting, room.match);
      changed = fingerprint(restored) !== fingerprint(room.tournamentAccounting);
      room.tournamentAccounting = restored;
    }
    if (room.match.phase !== 'finished' || room.tournamentAccounting.status !== 'pending-results') return changed;
    const next = Accounting.settle(room.tournamentAccounting, room.match);
    if (fingerprint(next) === fingerprint(room.tournamentAccounting)) return changed;
    room.tournamentAccounting = next; return true;
  }
  function tournamentView(room) {
    if (isWageredDuel(room)) return { wager: { mode: room.fundingLock ? 'escrow' : 'accounting-only',
      fundingStatus: room.fundingLock?.summary?.status || (room.fundingLock ? 'opening' : 'unfunded'),
      collectedAtomic: room.fundingLock?.summary?.collectedAtomic || '0',
      ...(room.fundingLock ? { funding: { roomId: room.fundingLock.roomId, network: room.fundingLock.network,
        escrowContract: room.fundingLock.escrowContract, ...clone(room.fundingLock.summary || {}) } } : {}),
      terms: clone(room.config.duelWager), fullRoomQuote: DuelWager.quote(room.config.duelWager, 2),
      joinedEntryQuote: DuelWager.quote(room.config.duelWager, room.players.filter(player => !player.isAI).length) } };
    if (!isTournament(room)) return {};
    return { tournament: { mode: room.fundingLock ? 'escrow' : 'accounting-only',
      aiFill: room.config.allowAI === true,
      payingEntrants: room.players.filter(player => !player.isAI).length,
      fundingStatus: room.fundingLock?.summary?.status || (room.fundingLock ? 'opening' : 'unfunded'),
      collectedAtomic: room.fundingLock?.summary?.collectedAtomic || '0',
      ...(room.fundingLock ? { funding: { roomId: room.fundingLock.roomId, network: room.fundingLock.network,
        escrowContract: room.fundingLock.escrowContract, ...clone(room.fundingLock.summary || {}) } } : {}),
      terms: clone(room.config.tournament), fullRoomQuote: Tournament.quote(room.config.tournament,
        room.config.allowAI === true ? room.players.filter(player => !player.isAI).length : ROOM_SIZE),
      joinedEntryQuote: Tournament.quote(room.config.tournament, room.players.filter(player => !player.isAI).length),
      ...(room.config.allowAI === true && room.wagerCompletion ? { completion: clone(room.wagerCompletion) } : {}),
      accounting: room.tournamentAccounting ? clone(room.tournamentAccounting) : null } };
  }
  for (const entry of fs.readdirSync(directory)) {
    if (!entry.endsWith('.json')) continue;
    const room = JSON.parse(fs.readFileSync(path.join(directory, entry), 'utf8'));
    requireThat(room.version === 1 && validText(room.roomCode) && entry === room.roomCode + '.json', 'Unsupported persisted party room.');
    // Older rooms predate the spectator/chat side channel. It never changes
    // match rules, seed, entrants, escrow terms or replay accounting.
    room.watchers ||= [];
    room.watcherSessions ||= {};
    room.messages ||= [];
    const restoredConfig = configuration({ ...room.config, ...(room.config.tournament ? { tournament: {
      currency: room.config.tournament.currency, entryFee: room.config.tournament.entryFee,
      prizePercentages: room.config.tournament.prizePercentages } } : {}),
      ...(room.config.duelWager ? { duelWager: {
        currency: room.config.duelWager.currency, entryFee: room.config.duelWager.entryFee,
        ...(room.config.duelWager.network ? { network: room.config.duelWager.network } : {}) } } : {}) });
    requireThat(fingerprint(restoredConfig) === fingerprint(room.config), 'Persisted room configuration is not canonical.');
    if (room.fundingLock) {
      requireThat(hasWagerTerms(room) && room.players.length === roomCapacity(room) &&
        (room.fundingLock.version === 2
          ? fingerprint({ seed: room.fundingLock.seed, roster: room.players.map(player => ({ playerId: player.playerId, isAI: player.isAI })) })
            === room.fundingLock.seedCommitment
          : isTournament(room) && hash(room.fundingLock.seed) === room.fundingLock.seedCommitment),
      'Persisted funded room seed or roster is invalid.');
    }
    if (room.fundingFaultArchive) {
      const archive = room.fundingFaultArchive;
      requireThat(room.fundingLock && archive.version === 1 && !room.match &&
        archive.snapshotHash === fingerprint(archive.snapshot) &&
        /^[a-f0-9]{64}$/.test(archive.reasonHash) && /^[a-f0-9]{64}$/.test(archive.evidenceHash) &&
        archive.snapshot.roomCode === room.roomCode &&
        ['roomId', 'termsHash', 'rulesHash', 'matchId', 'seedCommitment'].every(key => archive.snapshot.fundingLock?.[key] === room.fundingLock[key]),
      'Paused funded room archive is invalid.');
    } else if (room.voidArchive) {
      requireThat(room.fundingLock && room.voidArchive.version === 1 && room.voidArchive.snapshotHash === fingerprint(room.voidArchive.snapshot) && !room.match,
        'Voided funded room archive is invalid.');
    } else if (room.terminalArchive) {
      requireThat(room.fundingLock && room.terminalArchive.viewsHash === fingerprint(room.terminalArchive.views) &&
        (room.terminalArchive.version === 1
          ? room.terminalArchive.accountingHash === fingerprint(room.tournamentAccounting) && room.tournamentAccounting.status === 'complete'
          : room.terminalArchive.version === 2 && room.terminalArchive.completionHash === fingerprint(room.wagerCompletion)),
      'Completed funded room archive is invalid.');
      Object.defineProperty(room, '_terminalSerialized', { value: room.match, writable: true, configurable: true });
      room.match = JSON.parse(room.match);
      requireThat(room.match.phase === 'finished' &&
        (room.terminalArchive.version === 1 ? room.tournamentAccounting.completion.matchId : room.wagerCompletion.matchId) === room.match.matchId,
        'Completed funded archive belongs to a different match.');
    } else {
      if (room.match) room.match = Party.restore(room.match);
      if (reconcileTournament(room, true)) persist(room);
    }
    rooms.set(room.roomCode, room);
  }
  function lobby(room) {
    return { authorityEpoch, roomCode: room.roomCode, hostPlayerId: room.hostPlayerId, phase: room.voidArchive ? 'voided' : room.match ? room.match.phase : 'lobby',
      players: room.players.map(({ playerId, name, isAI }) => ({ playerId, name, isAI })),
      watchers: room.watchers.map(({ watcherId, name }) => ({ watcherId, name })),
      config: clone(room.config), capacity: roomCapacity(room), sharePath: sharePath + '?room=' + room.roomCode, ...tournamentView(room) };
  }
  function snapshot(room, session, atMs = now(), requestedWatchPlayerId = null) {
    const spectator = !!session.watcherId;
    const viewerId = spectator ? session.watcherId : session.playerId;
    const watchedPlayerId = spectator ? (room.players.some(player => player.playerId === requestedWatchPlayerId) ? requestedWatchPlayerId
      : (room.match?.players.find(player => player.hp > 0)?.playerId || room.players[0]?.playerId)) : session.playerId;
    const base = room.terminalArchive ? clone(room.terminalArchive.views[watchedPlayerId])
      : room.match ? Party.view(room.match, watchedPlayerId) : lobby(room);
    if (spectator && room.match) {
      // Party.view contains a commander's private shop. A watcher gets the
      // same public board and combat, with no offers or actionable seat.
      base.self.shop = [null, null, null, null];
      base.supply = base.supply.map(stock => ({ ...stock, you: 0 }));
    }
    if (isTournament(room) && room.match && !room.terminalArchive) {
      const eliminated = new Map(Standings.finalOutcomes(room.match).filter(outcome => outcome.eliminatedRound !== null)
        .map(outcome => [outcome.playerId, outcome]));
      for (const player of [...base.players, base.self]) if (eliminated.has(player.playerId)) {
        const { finalHP, finalGold, fieldedMaxHP } = eliminated.get(player.playerId);
        Object.assign(player, { finalHP, finalGold, fieldedMaxHP });
      }
    }
    return { ...base, roomCode: room.roomCode, hostPlayerId: room.hostPlayerId, config: clone(room.config),
      authorityEpoch, roomRevision: room.revision, serverNowMs: atMs, nextCommandSequence: spectator ? null : session.nextSequence,
      viewer: { id: viewerId, name: spectator ? room.watchers.find(watcher => watcher.watcherId === viewerId)?.name : room.players.find(player => player.playerId === viewerId)?.name,
        role: spectator ? 'watcher' : 'player' }, watchingPlayerId: watchedPlayerId,
      watchers: room.watchers.map(({ watcherId, name }) => ({ watcherId, name })),
      messages: room.messages.filter(message => message.channel === 'room' || message.senderId === viewerId || message.recipientId === viewerId).map(clone),
      capacity: roomCapacity(room),
      sharePath: sharePath + '?room=' + room.roomCode, ...tournamentView(room) };
  }
  function publish(room) {
    const subscribers = streams.get(room.roomCode); if (!subscribers) return;
    for (const subscriber of subscribers) {
      if (subscriber.blocked) { subscriber.pending = true; continue; }
      const view = snapshot(room, subscriber.session, now(), subscriber.watchPlayerId);
      const event = subscriber.lastView ? 'patch' : 'snapshot';
      const data = subscriber.lastView ? { baseViewRevision: subscriber.viewRevision, viewRevision: subscriber.viewRevision + 1,
        patch: changes(subscriber.lastView, view) } : { ok: true, view, viewRevision: 0 };
      subscriber.lastView = view; subscriber.viewRevision = data.viewRevision;
      subscriber.blocked = !subscriber.response.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n');
    }
  }
  function deadline(room) {
    if (!room.match) return null;
    if (typeof Party.nextWakeAtMs === 'function') return Party.nextWakeAtMs(room.match, now());
    if (room.match.phase === 'preparation') return room.match.preparationDeadlineAtMs ?? room.match.prepDeadlineAtMs ?? room.match.deadlineAtMs;
    if (room.match.phase === 'combat' || room.match.phase === 'battle') return room.match.combatEndsAtMs ?? room.match.battleEndsAtMs ?? room.match.deadlineAtMs;
    return null;
  }
  function schedule(room) {
    if (timers.has(room.roomCode)) clearTimeout(timers.get(room.roomCode));
    timers.delete(room.roomCode); if (closing) return;
    const atMs = deadline(room); if (atMs === null || atMs === undefined) return;
    requireThat(Number.isSafeInteger(atMs) && atMs >= 0, 'Party deadlines must be exact epoch milliseconds.');
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, atMs - now()));
    const timer = setTimeout(() => {
      timers.delete(room.roomCode);
      try { advance(room); } catch (error) { room.serverError = error.message; publish(room); }
    }, delay);
    timer.unref(); timers.set(room.roomCode, timer);
  }
  function advance(room) {
    if (room.terminalArchive || room.voidArchive || room.fundingFaultArchive) return;
    if (room.match) {
      const result = Party.advance(room.match, now());
      requireThat(result.ok, result.reason || 'Party clock transition failed.', 500);
      if (result.events?.some(event => event.type === 'preparation-opened')) prepareBots(room);
      const accountingChanged = reconcileTournament(room);
      if (result.changed || accountingChanged) {
        room.revision++;
        // An active fight replays from its durable start/ticks after a restart.
        // Persist commands and phase transitions, not twenty disk writes/sec.
        if (result.events?.length || accountingChanged) persist(room);
        publish(room);
      }
    }
    schedule(room);
  }
  function prepareBots(room) {
    if (room.match?.phase !== 'preparation') return;
    for (const player of room.match.players.filter(player => player.isAI && player.hp > 0 && !player.ready)) {
      const result = Party.prepareAI(room.match, player.playerId, now());
      requireThat(result.ok, result.reason || 'AI preparation failed.', 500);
    }
  }
  function authenticate(request, room) {
    const authorization = request.headers.authorization || '';
    requireThat(authorization.startsWith('Bearer '), 'A party session token is required.', 401);
    const session = room.sessions[hash(authorization.slice(7))] || room.watcherSessions[hash(authorization.slice(7))];
    requireThat(session, 'This party session is not valid.', 401);
    if (session.accountId !== undefined) requireThat(actor(request)?.id === session.accountId, 'Sign in to the account that owns this commander.', 403);
    return session;
  }
  function actor(request) {
    const value = resolveActor?.(request);
    if (value === undefined || value === null) return null;
    requireThat(value && validText(value.id) && validText(value.name), 'The host account identity is invalid.', 500);
    return value;
  }
  function addHuman(room, name, request) {
    const account = actor(request);
    if (account) {
      requireThat(!Object.values(room.sessions).some(session => session.accountId === account.id), 'This account already has a commander in this room.', 409);
      name = account.name;
    }
    requireThat(validText(name), 'Enter a commander name.');
    const playerId = crypto.randomUUID(), sessionToken = crypto.randomUUID();
    room.players.push({ playerId, name: name.trim(), isAI: false });
    const session = { playerId, nextSequence: 1, commands: {}, ...(account ? { accountId: account.id } : {}) };
    room.sessions[hash(sessionToken)] = session;
    return { playerId, sessionToken, session };
  }
  function addWatcher(room, name, request) {
    const account = actor(request);
    if (account) name = account.name;
    requireThat(validText(name), 'Enter a name to watch this room.');
    const watcherId = crypto.randomUUID(), sessionToken = crypto.randomUUID();
    room.watchers.push({ watcherId, name: name.trim() });
    const session = { watcherId, ...(account ? { accountId: account.id } : {}) };
    room.watcherSessions[hash(sessionToken)] = session;
    return { watcherId, sessionToken, session };
  }
  function replay(room, session) {
    // Replays never expose the private engine seed, other shops or session
    // credentials. The complete authoritative record stays on the host disk.
    return { roomCode: room.roomCode, playerId: session.playerId,
      commands: Object.values(session.commands).map(record => clone({ command: record.command, result: record.result })),
      view: snapshot(room, session) };
  }
  const handler = async (request, response) => {
    try {
      requireThat(!closing, 'The game authority is shutting down.', 503);
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname !== apiPrefix && !url.pathname.startsWith(apiPrefix + '/')) {
        requireThat(staticFiles, 'Unknown party endpoint.', 404); serveStatic(url, request, response); return;
      }
      const endpoint = url.pathname.slice(apiPrefix.length);
      if (request.method === 'POST' && request.headers.origin) {
        const origin = new URL(request.headers.origin);
        requireThat(origin.host === request.headers.host, 'Cross-origin room mutations are not permitted.', 403);
      }
      if (endpoint === '/health' && request.method === 'GET') {
        writeJSON(response, 200, { ok: true, serverNowMs: now() }); return;
      }
      if (endpoint === '/rooms' && request.method === 'POST') {
        const input = await bodyJSON(request), config = configuration(input);
        const room = { version: 1, roomCode: crypto.randomUUID(), revision: 0, config, players: [], sessions: {},
          watchers: [], watcherSessions: {}, messages: [], match: null, createdAtMs: now() };
        const identity = addHuman(room, input.name, request); room.hostPlayerId = identity.playerId;
        persist(room); rooms.set(room.roomCode, room);
        writeJSON(response, 201, { ok: true, roomCode: room.roomCode, playerId: identity.playerId,
          sessionToken: identity.sessionToken, sharePath: lobby(room).sharePath, view: snapshot(room, identity.session) }); return;
      }
      const route = endpoint.match(/^\/rooms\/([^/]+)(?:\/(join|watch|start|commands|messages|events|replay|lobby))?$/);
      requireThat(route, 'Unknown party endpoint.', 404);
      const room = rooms.get(route[1]); requireThat(room, 'Party room not found.', 404);
      const action = route[2];
      if (request.method === 'GET' && action === 'lobby') { writeJSON(response, 200, { ok: true, view: lobby(room), serverNowMs: now() }); return; }
      if (request.method === 'POST' && action === 'join') {
        const input = await bodyJSON(request);
        immutableTerms(input);
        requireThat(!room.match && !room.fundingLock, 'This party has already started or frozen its funded entrants.', 409);
        requireThat(room.players.length < roomCapacity(room), 'All room seats are occupied.', 409);
        const identity = addHuman(room, input.name, request); room.revision++; persist(room); publish(room);
        writeJSON(response, 201, { ok: true, roomCode: room.roomCode, playerId: identity.playerId,
          sessionToken: identity.sessionToken, sharePath: lobby(room).sharePath, view: snapshot(room, identity.session) }); return;
      }
      if (request.method === 'POST' && action === 'watch') {
        const input = await bodyJSON(request);
        requireThat(Object.keys(input).every(key => key === 'name'), 'Watching does not create a player seat or change room terms.');
        const identity = addWatcher(room, input.name, request);
        room.revision++; persist(room, false); publish(room);
        writeJSON(response, 201, { ok: true, roomCode: room.roomCode, playerId: identity.watcherId,
          role: 'watcher', sessionToken: identity.sessionToken, sharePath: lobby(room).sharePath,
          view: snapshot(room, identity.session) }); return;
      }
      const session = authenticate(request, room); advance(room);
      const watchedPlayerId = url.searchParams.get('watch');
      if (request.method === 'GET' && !action) { writeJSON(response, 200, { ok: true, view: snapshot(room, session, now(), watchedPlayerId) }); return; }
      if (request.method === 'GET' && action === 'replay') {
        requireThat(!session.watcherId, 'Only a commander can download their round records.', 403);
        writeJSON(response, 200, { ok: true, replay: replay(room, session) }); return;
      }
      if (request.method === 'GET' && action === 'events') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
        response.flushHeaders();
        const subscriber = { response, session, watchPlayerId: watchedPlayerId, blocked: false, pending: false, lastView: null, viewRevision: -1 };
        if (!streams.has(room.roomCode)) streams.set(room.roomCode, new Set());
        streams.get(room.roomCode).add(subscriber);
        response.on('drain', () => { subscriber.blocked = false; if (subscriber.pending) { subscriber.pending = false; publish(room); } });
        response.on('close', () => { streams.get(room.roomCode)?.delete(subscriber); });
        publish(room); return;
      }
      if (request.method === 'POST' && action === 'messages') {
        const input = await bodyJSON(request), senderId = session.watcherId || session.playerId;
        requireThat(Object.keys(input).every(key => ['channel', 'recipientId', 'text'].includes(key)), 'A message may contain only its channel, recipient and text.');
        requireThat(input.channel === 'room' || input.channel === 'whisper', 'Choose room chat or a whisper.');
        requireThat(validText(input.text), 'Write a message before sending it.');
        const sender = room.players.find(player => player.playerId === senderId) || room.watchers.find(watcher => watcher.watcherId === senderId);
        requireThat(sender, 'The sender is no longer in this room.', 403);
        let recipient;
        if (input.channel === 'whisper') {
          recipient = room.players.find(player => player.playerId === input.recipientId && !player.isAI)
            || room.watchers.find(watcher => watcher.watcherId === input.recipientId);
          requireThat(recipient && input.recipientId !== senderId, 'Choose another person in this room for a whisper.');
        } else requireThat(input.recipientId === undefined, 'Room chat cannot have a private recipient.');
        room.messages.push({ id: crypto.randomUUID(), channel: input.channel, senderId, senderName: sender.name,
          ...(recipient ? { recipientId: input.recipientId, recipientName: recipient.name } : {}), text: input.text.trim(), sentAtMs: now() });
        room.revision++; persist(room, false); publish(room);
        writeJSON(response, 200, { ok: true, view: snapshot(room, session, now(), watchedPlayerId) }); return;
      }
      if (request.method === 'POST' && action === 'start') {
        const input = await bodyJSON(request);
        immutableTerms(input);
        requireThat(!session.watcherId, 'Watchers cannot start a match.', 403);
        requireThat(session.playerId === room.hostPlayerId, 'Only the room host can start the party.', 403);
        if (isDuel(room) || isTournament(room) && room.config.allowAI !== true)
          requireThat(input.fillAI === false, 'This room requires human entrants; AI fill is unavailable.');
        if (isTournament(room) && room.config.allowAI === true)
          requireThat(input.fillAI === true, 'Choose AI fill for this tournament.');
        if (room.match) { writeJSON(response, 200, { ok: true, view: snapshot(room, session) }); return; }
        requireThat(!isWageredDuel(room), 'Open and fund duel escrow before starting this prize match.', 409);
        requireThat(!room.fundingLock, 'Use the funded-room controls; an applied escrow start is required.', 409);
        requireThat(typeof input.fillAI === 'boolean', 'Choose explicitly whether to fill vacant seats with AI.');
        requireThat(input.fillAI || room.players.length === roomCapacity(room), isTournament(room)
          ? 'Eight human entrants are required to start the tournament accounting preview.'
          : isDuel(room) ? 'Two human entrants are required to start a duel.'
          : 'Eight occupied seats are required; invite more players or explicitly fill with AI.', 409);
        while (room.players.length < roomCapacity(room)) room.players.push({ playerId: crypto.randomUUID(), name: 'AI Commander ' + (room.players.length + 1), isAI: true });
        room.match = Party.createMatch({ matchId: 'party:' + room.roomCode, seed: crypto.randomUUID(),
          ...room.config, players: clone(room.players), openedAtMs: now() });
        if (usesLegacyAccounting(room)) room.tournamentAccounting = Accounting.create({ matchId: room.match.matchId,
          terms: room.config.tournament, playerIds: room.players.map(player => player.playerId) });
        prepareBots(room);
        room.revision++; persist(room); publish(room); schedule(room);
        writeJSON(response, 200, { ok: true, view: snapshot(room, session) }); return;
      }
      if (request.method === 'POST' && action === 'commands') {
        const input = await bodyJSON(request);
        immutableTerms(input);
        requireThat(!session.watcherId, 'Watchers cannot command a team.', 403);
        requireThat(!room.voidArchive && !room.fundingFaultArchive, 'This funded tournament is paused for technical-void reconciliation.', 409);
        requireThat(room.match, 'Start the party before issuing game commands.', 409);
        requireThat(validText(input.commandId), 'Every command needs a persistent commandId.');
        requireThat(Number.isSafeInteger(input.sequence) && input.sequence > 0, 'Every command needs a positive integer sequence.');
        requireThat(Number.isSafeInteger(input.roundNumber) && input.roundNumber > 0, 'Every command must identify its preparation round.');
        const digest = fingerprint(input), existing = session.commands[input.commandId];
        if (existing) {
          requireThat(existing.fingerprint === digest, 'A commandId cannot be reused for different input.', 409);
          writeJSON(response, existing.result.ok ? 200 : 400, { ...existing.result, duplicate: true, view: snapshot(room, session) }); return;
        }
        if (input.sequence !== session.nextSequence) {
          writeJSON(response, 409, { ok: false, reason: 'Command sequence is stale or out of order.', view: snapshot(room, session) }); return;
        }
        requireThat(session.nextSequence < Number.MAX_SAFE_INTEGER, 'The command sequence exceeds JavaScript exact integer storage.', 409);
        const command = { ...input, playerId: session.playerId }; delete command.commandId; delete command.sequence;
        let result;
        if (input.playerId !== undefined && input.playerId !== session.playerId) result = { ok: false, reason: 'A session can command only its own commander.' };
        else result = Party.command(room.match, command, now());
        const durableResult = { ok: Boolean(result.ok), ...(result.reason ? { reason: result.reason } : {}), ...(result.receipt ? { receipt: clone(result.receipt) } : {}) };
        session.commands[input.commandId] = { fingerprint: digest, command: clone(command), result: durableResult, receivedAtMs: now() };
        session.nextSequence++; room.revision++; persist(room); publish(room); schedule(room);
        writeJSON(response, durableResult.ok ? 200 : 400, { ...durableResult, view: snapshot(room, session) }); return;
      }
      requireThat(false, 'This method is not supported by the party endpoint.', 405);
    } catch (error) {
      if (!response.headersSent) writeJSON(response, error.status || 500, { ok: false, reason: error.status ? error.message : 'The party server could not complete this request.' });
      else response.end();
    }
  };
  function serveStatic(url, request, response) {
    requireThat(['GET', 'HEAD'].includes(request.method), 'Static files support GET and HEAD.', 405);
    let pathname; try { pathname = decodeURIComponent(url.pathname); } catch { requireThat(false, 'Invalid URL encoding.'); }
    const root = pathname.startsWith('/review/') ? REVIEW : DIST;
    const relative = pathname === '/' ? 'index.html' : pathname.startsWith('/dist/') ? pathname.slice(6)
      : pathname.startsWith('/review/') ? pathname.slice(8) : pathname.slice(1);
    const target = path.resolve(root, relative);
    requireThat(target.startsWith(root + path.sep), 'Static path is outside the built game or public reviews.', 403);
    requireThat(fs.existsSync(target) && fs.statSync(target).isFile(), 'Built file not found.', 404);
    requireThat(fs.realpathSync(target).startsWith(fs.realpathSync(root) + path.sep), 'Static links cannot leave public files.', 403);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (request.method === 'HEAD') response.end(); else fs.createReadStream(target).pipe(response);
  }
  const server = listen ? http.createServer(handler) : null;
  const ready = !listen ? Promise.resolve().then(() => { for (const room of rooms.values()) advance(room); return null; }) : new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      for (const room of rooms.values()) advance(room);
      resolve({ host, port: server.address().port, url: 'http://' + (host.includes(':') ? '[' + host + ']' : host) + ':' + server.address().port });
    });
  });
  // This host-only interface is never routed to HTTP. It contains account-seat
  // bindings, but never returns bearer credentials or the committed private seed.
  const funding = {
    inspect(roomCode) {
      const room = rooms.get(roomCode); requireThat(room, 'Party room not found.', 404);
      const accounts = new Map(Object.values(room.sessions).map(session => [session.playerId, session.accountId ?? null]));
      return { roomCode, hostPlayerId: room.hostPlayerId, config: clone(room.config),
        phase: room.voidArchive ? 'voided' : room.match?.phase || 'lobby', players: room.players.map(player => ({ ...clone(player), accountId: accounts.get(player.playerId) })),
        lock: room.fundingLock ? (({ seed, ...publicLock }) => clone(publicLock))(room.fundingLock) : null };
    },
    list() { return [...rooms.values()].filter(room => room.fundingLock).map(room => room.roomCode); },
    lock(roomCode, binding) {
      const room = rooms.get(roomCode); requireThat(room, 'Party room not found.', 404);
      requireThat(hasWagerTerms(room) && !room.match, 'Only an unstarted wager room can open escrow.', 409);
      for (const key of ['roomId', 'termsHash', 'rulesHash', 'matchId']) requireThat(typeof binding[key] === 'string' && /^[a-f0-9]{64}$/.test(binding[key]), 'Invalid funding commitment.');
      requireThat(['mainnet', 'shadownet'].includes(binding.network) && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(binding.escrowContract), 'Invalid escrow binding.');
      const expected = { roomId: binding.roomId, termsHash: binding.termsHash, rulesHash: binding.rulesHash,
        matchId: binding.matchId, network: binding.network, escrowContract: binding.escrowContract };
      if (room.fundingLock) requireThat(Object.entries(expected).every(([key, value]) => room.fundingLock[key] === value), 'Escrow commitments cannot change.', 409);
      else {
        requireThat((isTournament(room) && room.config.allowAI === true || room.players.length === roomCapacity(room)) &&
          (!isTournament(room) || room.config.allowAI !== true || room.players.length >= 2) &&
          room.players.every(player => !player.isAI) &&
          room.players.every(player => Object.values(room.sessions).some(session => session.playerId === player.playerId && validText(session.accountId))),
        'Funded rooms require at least two account-bound human entrants and every paying wallet.', 409);
        const seed = crypto.randomUUID();
        if (isTournament(room) && room.config.allowAI === true)
          while (room.players.length < ROOM_SIZE) room.players.push({ playerId: crypto.randomUUID(), name: 'AI Commander ' + (room.players.length + 1), isAI: true });
        const modern = isWageredDuel(room) || room.config.allowAI === true;
        room.fundingLock = { ...expected, ...(modern ? { version: 2 } : {}), seed,
          seedCommitment: modern ? fingerprint({ seed, roster: room.players.map(player => ({ playerId: player.playerId, isAI: player.isAI })) }) : hash(seed),
          summary: { status: 'opening', collectedAtomic: '0' } };
        room.revision++; persist(room); publish(room);
      }
      return funding.inspect(roomCode);
    },
    update(roomCode, summary) {
      const room = rooms.get(roomCode); requireThat(room?.fundingLock, 'Room has no escrow binding.', 409);
      requireThat(summary && typeof summary.status === 'string' && /^[0-9]+$/.test(summary.collectedAtomic), 'Invalid public funding summary.');
      const next = clone({ status: summary.status, collectedAtomic: summary.collectedAtomic,
        ...Object.fromEntries(['feeQuantumAtomic', 'treasuryAddress', 'refundPolicy', 'prizeRoundingPolicy', 'prizeSummary', 'payouts']
          .filter(key => summary[key] !== undefined).map(key => [key, summary[key]])) });
      if (fingerprint(next) !== fingerprint(room.fundingLock.summary)) { room.fundingLock.summary = next; room.revision++; persist(room); publish(room); }
    },
    start(roomCode, binding) {
      const room = rooms.get(roomCode); requireThat(room?.fundingLock, 'Room has no escrow binding.', 409);
      requireThat(['roomId', 'termsHash', 'matchId'].every(key => binding[key] === room.fundingLock[key]), 'Applied start must match the frozen room.', 409);
      requireThat(!room.voidArchive && !room.fundingFaultArchive, 'A paused or voided funded room cannot start.', 409);
      if (room.match) return funding.inspect(roomCode);
      room.match = Party.createMatch({ matchId: 'party:' + room.roomCode, seed: room.fundingLock.seed,
        ...room.config, players: clone(room.players), openedAtMs: now() });
      if (usesLegacyAccounting(room)) room.tournamentAccounting = Accounting.create({ matchId: room.match.matchId,
        terms: room.config.tournament, playerIds: room.players.map(player => player.playerId) });
      prepareBots(room);
      room.revision++; persist(room); publish(room); schedule(room);
      return funding.inspect(roomCode);
    },
    audit(roomCode) {
      const room = rooms.get(roomCode); requireThat(room?.fundingLock, 'Room has no escrow binding.', 409);
      return auditFundingRoom(room, now());
    },
    markVoided(roomCode, binding) {
      const room = rooms.get(roomCode); requireThat(room?.fundingLock, 'Room has no escrow binding.', 409);
      requireThat(['roomId', 'termsHash', 'matchId'].every(key => binding[key] === room.fundingLock[key]), 'Applied void must match the frozen room.', 409);
      if (room.voidArchive) return;
      requireThat(!room.terminalArchive, 'A completed funded room cannot be voided.', 409);
      // Preserve diagnostic state without replaying an invalid/obsolete game on
      // restart. Escrow refunds use the host's frozen verified chain record.
      const snapshot = room.fundingFaultArchive ? clone(room.fundingFaultArchive) : clone({ match: room.match, tournamentAccounting: room.tournamentAccounting || null, serverError: room.serverError || null });
      room.voidArchive = { version: 1, snapshot, snapshotHash: fingerprint(snapshot) };
      room.match = null; room.revision++; delete room.serverError; delete room.fundingFaultArchive;
      if (timers.has(roomCode)) clearTimeout(timers.get(roomCode)); timers.delete(roomCode);
      persist(room); publish(room);
    },
    result(roomCode) {
      const room = rooms.get(roomCode); requireThat(room?.fundingLock, 'Room has no escrow binding.', 409);
      if (room.match?.phase !== 'finished') return null;
      if (room.terminalArchive) return clone(room.terminalArchive.version === 1 ? room.tournamentAccounting.completion : room.wagerCompletion);
      // Re-derive from validated authoritative combat receipts; never accept a
      // submitted winner, prize amount or standings document from a client.
      return clone(usesLegacyAccounting(room) ? Accounting.settle(room.tournamentAccounting, room.match).completion
        : { ...Standings.derive(room.match), receiptsHash: fingerprint(room.match.receipts) });
    },
  };
  return { server, handler, ready, dataDir: directory, funding,
    pump: () => { for (const room of rooms.values()) advance(room); },
    close: async () => {
      if (closing) return;
      closing = true; for (const timer of timers.values()) clearTimeout(timer); timers.clear();
      for (const room of rooms.values()) persist(room);
      for (const subscribers of streams.values()) for (const { response } of subscribers) response.end();
      if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    } };
}

module.exports = { createServer, PREPARATION_SECONDS };
if (require.main === module) {
  const args = process.argv.slice(2), option = name => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
  const dataDir = option('--data-dir'), port = option('--port') === undefined ? 0 : Number(option('--port'));
  try {
    const app = createServer({ dataDir, port, host: option('--host') || '127.0.0.1' });
    app.ready.then(address => process.stdout.write(JSON.stringify({ ...address, dataDir: app.dataDir }) + '\n')).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => app.close().then(() => { process.exitCode = 0; }));
  } catch (error) { process.stderr.write(error.message + '\n'); process.exitCode = 1; }
}
