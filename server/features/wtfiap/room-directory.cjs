'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Read only the public facts needed by the room browser. Session tokens,
// private shops, chat, wallet bindings and escrow journals never leave disk.
function roomSummary(room) {
  if (!room || typeof room.roomCode !== 'string' || !Array.isArray(room.players) || !room.config) return null;
  let match = room.match;
  if (typeof match === 'string') {
    try { match = JSON.parse(match); } catch { return null; }
  }
  if (match !== null && match !== undefined && (typeof match !== 'object' || Array.isArray(match) || typeof match.phase !== 'string')) return null;
  const phase = room.voidArchive ? 'voided' : room.closedAtMs !== undefined ? 'closed' : match?.phase || 'lobby';
  if (phase === 'finished' || phase === 'voided' || phase === 'closed' || room.fundingFaultArchive) return null;
  const type = room.config.roomType === 'duel' ? 'duel' : room.config.roomType === 'tournament' ? 'tournament' : 'party';
  const capacity = type === 'duel' ? 2 : 8;
  // A full waiting table cannot be joined, and has no live match to watch.
  // Its invitation still works; it reappears here if the match starts.
  // Sponsor custody opens before entrants join, so its locked invitation
  // remains discoverable. Legacy funded rooms retain their original listing.
  if (phase === 'lobby' && ((room.fundingLock && !room.config.sponsor) || room.players.length >= capacity)) return null;
  const record = new Map(room.players.map(player => [player.playerId, { wins: 0, losses: 0 }]));
  for (const receipt of match?.receipts || []) for (const result of receipt.results || []) for (const award of result.awards || []) {
    const tally = record.get(award.playerId);
    if (tally && award.outcome === 'win') tally.wins++;
    if (tally && award.outcome === 'loss') tally.losses++;
  }
  const wager = type === 'duel' ? room.config.duelWager : type === 'tournament' ? room.config.tournament : null;
  const sponsored = room.config.sponsor ? { network: room.config.sponsorNetwork } : null;
  return {
    roomCode: room.roomCode, type, phase, capacity,
    openSeats: phase === 'lobby' && (!room.fundingLock || sponsored) ? capacity - room.players.length : 0,
    aiFill: room.config.allowAI === true, watcherCount: Array.isArray(room.watchers) ? room.watchers.length : 0,
    rulesPreset: room.config.rulesPreset || 'original',
    players: room.players.map(player => ({ name: String(player.name || 'Commander'), isAI: player.isAI === true,
      ...record.get(player.playerId) })),
    wager: wager ? { currency: wager.currency, entryFee: wager.entryFee,
      network: wager.network || (wager.currency === 'WTF' ? 'mainnet' : 'shadownet') } : null,
    sponsored,
    createdAtMs: Number.isSafeInteger(room.createdAtMs) ? room.createdAtMs : 0,
  };
}

function createRoomDirectory(dataDir, { accountBindings = false } = {}) {
  let cache = new Map();
  let inFlight;
  const playerIdsByRoom = new WeakMap();

  async function refresh() {
    const files = await fs.promises.readdir(dataDir, { withFileTypes: true });
    const nextCache = new Map();
    const rooms = [];
    // Read one changed document at a time so a cold listing never buffers
    // the entire archive or opens all of its files at once.
    for (const entry of files) {
      if (!entry.isFile() || !/^[0-9a-f-]{36}\.json$/i.test(entry.name)) continue;
      const filename = path.join(dataDir, entry.name);
      try {
        const stat = await fs.promises.lstat(filename, { bigint: true });
        if (!stat.isFile()) continue;
        // Room writes use atomic replacement. Identity plus timestamps also
        // handle edits or a remove-and-recreate between directory requests.
        const identity = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
        let saved = cache.get(entry.name);
        if (saved?.identity !== identity) {
          const payload = await fs.promises.readFile(filename, 'utf8');
          let summary = null;
          try {
            const room = JSON.parse(payload);
            summary = roomSummary(room);
            if (summary && accountBindings) {
              // Match authority.funding.inspect() without exposing account IDs
              // or keeping command journals in the directory cache.
              const accountsByPlayer = new Map(Object.values(room.sessions || {})
                .map(session => [session?.playerId, session?.accountId]));
              const ownedPlayers = new Map();
              for (const player of room.players) {
                const accountId = accountsByPlayer.get(player.playerId);
                if (!player.isAI && typeof accountId === 'string' && !ownedPlayers.has(accountId))
                  ownedPlayers.set(accountId, player.playerId);
              }
              playerIdsByRoom.set(summary, ownedPlayers);
            }
          } catch { /* ignore malformed room files */ }
          saved = { identity, summary };
        }
        nextCache.set(entry.name, saved);
        if (saved.summary) rooms.push(saved.summary);
      } catch { /* a transient filesystem error must not turn into a cached miss */ }
    }
    cache = nextCache;
    return rooms.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  function list() {
    // Multiple lobby requests can share one scan without delaying other
    // room activity or holding onto private saved match documents.
    inFlight ??= refresh().finally(() => { inFlight = undefined; });
    return inFlight;
  }
  async function listForAccount(accountId) {
    const rooms = await list();
    if (!accountId) return rooms;
    return rooms.map(room => {
      const myPlayerId = playerIdsByRoom.get(room)?.get(accountId);
      return myPlayerId ? { ...room, myPlayerId } : room;
    });
  }
  return { list, listForAccount };
}

module.exports = { roomSummary, createRoomDirectory };
