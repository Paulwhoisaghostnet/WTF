'use strict';

const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { createDuelIngress } = require('./duel-ingress.cjs');
const { createLobbyHandler, legacyGet } = require('./live-lobby.cjs');
const { createRoomDirectory } = require('../../server/features/wtfiap/room-directory.cjs');

const listPath = '/api/wtfiap/party/rooms';
const apiListPath = '/api/v1/wtfiap/party/rooms';

function combineRooms(legacy, isolated) {
  const present = new Set(legacy.map(room => room.roomCode));
  if (isolated.some(room => present.has(room.roomCode))) throw new Error('Duel room ownership overlaps.');
  return [...legacy, ...isolated].sort((a, b) => b.createdAtMs - a.createdAtMs);
}

function createDuelGateway({ legacyOrigin, duelOrigin, publicOrigin, legacyDataDir, dataDir, protectedRoomCode, networks }) {
  const legacyDirectory = createRoomDirectory(legacyDataDir, { accountBindings: true });
  const isolatedDirectory = createRoomDirectory(dataDir, { accountBindings: true });
  const lobby = createLobbyHandler({
    directory: {
      async listForAccount(accountId) {
        const [legacy, isolated] = await Promise.all([
          legacyDirectory.listForAccount(accountId), isolatedDirectory.listForAccount(accountId),
        ]);
        return combineRooms(legacy, isolated);
      },
    },
    legacyOrigin,
    publicOrigin,
  });
  const ingress = createDuelIngress({ legacyOrigin, duelOrigin, dataDir, protectedRoomCode, networks });
  const legacy = new URL(legacyOrigin);
  const isolated = new URL(duelOrigin);

  return (request, response) => {
    const pathname = request.url.split('?', 1)[0];
    const read = request.method === 'GET';
    if (read && pathname === listPath && request.headers.authorization === undefined) return lobby(request, response);
    if (read && pathname === apiListPath) return apiLobby(request, response, legacy, isolated);
    return ingress(request, response);
  };
}

async function apiLobby(request, response, legacy, isolated) {
  const headers = {
    Host: request.headers.host,
    'Accept-Encoding': 'identity',
    ...(request.headers.authorization && { Authorization: request.headers.authorization }),
    ...(request.headers.origin && { Origin: request.headers.origin }),
    ...(request.headers['x-forwarded-for'] && { 'X-Forwarded-For': request.headers['x-forwarded-for'] }),
    ...(request.headers['x-forwarded-proto'] && { 'X-Forwarded-Proto': request.headers['x-forwarded-proto'] }),
  };
  const abort = new AbortController();
  response.once('close', () => abort.abort());
  const read = origin => legacyGet(new URL(apiListPath, origin), headers, abort.signal);
  try {
    // Check the exact existing versioned bearer gate before querying the new
    // authority. The normal API verifies token scopes on both services.
    const old = await read(legacy);
    if (old.status !== 200) {
      return sendApiList(response, old, old.status, old.body);
    }
    const next = await read(isolated);
    if (next.status !== 200) throw new Error('Isolated lobby denied the request.');
    const current = JSON.parse(old.body);
    const proposed = JSON.parse(next.body);
    if (!current.ok || !proposed.ok) throw new Error('Invalid lobby response.');
    const joined = { ...current, rooms: combineRooms(current.rooms, proposed.rooms) };
    return sendApiList(response, old, 200, JSON.stringify(joined));
  } catch {
    if (response.destroyed) return;
    response.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ ok: false, reason: 'The lobby is temporarily unavailable.' }));
  }
}

function sendApiList(response, upstream, status, body) {
  for (const [name, value] of Object.entries(upstream.headers)) {
    if (!['connection', 'content-length', 'content-encoding', 'etag', 'set-cookie', 'transfer-encoding'].includes(name)) {
      response.setHeader(name, value);
    }
  }
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(body);
}

async function main() {
  const dataDir = process.env.WTFIAP_GATEWAY_DUEL_DIR;
  const legacyDataDir = process.env.WTFIAP_GATEWAY_LEGACY_DIR;
  const policyPath = process.env.WTFIAP_ISOLATED_DUEL_POLICY;
  const port = Number(process.env.PORT);
  if (!dataDir || !legacyDataDir || dataDir === legacyDataDir || !policyPath ||
      !Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('Incomplete Duel gateway settings.');
  const binding = await readFile(path.join(dataDir, '.isolated-duel-authority'), 'utf8');
  if (binding !== '{"version":1,"database":"wtfiap_isolated_duels","schema":"duel_authority"}\n') {
    throw new Error('The gateway requires the dedicated Duel authority directory.');
  }
  const networks = async () => JSON.parse(await readFile(policyPath, 'utf8'));
  await networks();
  const handler = createDuelGateway({
    legacyOrigin: process.env.WTFIAP_LIVE_LOBBY_LEGACY_ORIGIN,
    duelOrigin: process.env.WTFIAP_GATEWAY_DUEL_ORIGIN,
    publicOrigin: process.env.WTFIAP_LIVE_LOBBY_PUBLIC_ORIGIN,
    legacyDataDir,
    dataDir,
    protectedRoomCode: process.env.WTFIAP_PROTECTED_DUEL,
    networks,
  });
  createServer(handler).listen(port, '0.0.0.0', () => console.log('Isolated coLILseum Duel gateway listening.'));
}

if (require.main === module) void main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = { createDuelGateway };
