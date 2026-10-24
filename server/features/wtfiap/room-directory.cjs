'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Read only the public facts needed by the room browser. Session tokens,
// private shops, chat, wallet bindings and escrow journals never leave disk.
function roomSummary(room) {
  if (!room || typeof room.roomCode !== 'string' || !Array.isArray(room.players) || !room.config) return null;
  const phase = room.voidArchive ? 'voided' : room.match?.phase || 'lobby';
  if (phase === 'finished' || phase === 'voided') return null;
  const type = room.config.roomType === 'duel' ? 'duel' : room.config.roomType === 'tournament' ? 'tournament' : 'party';
  const capacity = type === 'duel' ? 2 : 8;
  const record = new Map(room.players.map(player => [player.playerId, { wins: 0, losses: 0 }]));
  for (const receipt of room.match?.receipts || []) for (const result of receipt.results || []) for (const award of result.awards || []) {
    const tally = record.get(award.playerId);
    if (tally && award.outcome === 'win') tally.wins++;
    if (tally && award.outcome === 'loss') tally.losses++;
  }
  const wager = type === 'duel' ? room.config.duelWager : type === 'tournament' ? room.config.tournament : null;
  return {
    roomCode: room.roomCode, type, phase, capacity, openSeats: phase === 'lobby' && !room.fundingLock ? capacity - room.players.length : 0,
    aiFill: room.config.allowAI === true, watcherCount: Array.isArray(room.watchers) ? room.watchers.length : 0,
    players: room.players.map(player => ({ name: String(player.name || 'Commander'), isAI: player.isAI === true,
      ...record.get(player.playerId) })),
    wager: wager ? { currency: wager.currency, entryFee: wager.entryFee,
      network: wager.network || (wager.currency === 'WTF' ? 'mainnet' : 'shadownet') } : null,
    createdAtMs: Number.isSafeInteger(room.createdAtMs) ? room.createdAtMs : 0,
  };
}

function listRooms(dataDir) {
  return fs.readdirSync(dataDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && /^[0-9a-f-]{36}\.json$/i.test(entry.name))
    .flatMap(entry => {
      try { const summary = roomSummary(JSON.parse(fs.readFileSync(path.join(dataDir, entry.name), 'utf8'))); return summary ? [summary] : []; }
      catch { return []; }
    }).sort((a, b) => b.createdAtMs - a.createdAtMs);
}

module.exports = { roomSummary, listRooms };
