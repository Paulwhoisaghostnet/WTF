'use strict';
// Runs in the newly built app image with its existing private room volume.
// Only compatibility commitments leave the container, never seeds or sessions.
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.WTFIAP_DATA_DIR;
if (!root) throw new Error('WTFIAP_DATA_DIR must identify the deployed private volume.');
const locks = fs.readdirSync(root).filter(name => name.endsWith('.json')).flatMap(name => {
  const room = JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  return room.fundingLock ? [{ roomCode: room.roomCode, rulesHash: room.fundingLock.rulesHash,
    version: room.fundingLock.version || 1,
    roomId: room.fundingLock.roomId, termsHash: room.fundingLock.termsHash,
    matchId: room.fundingLock.matchId, network: room.fundingLock.network,
    escrowContract: room.fundingLock.escrowContract }] : [];
});
process.stdout.write(JSON.stringify(locks) + '\n');
