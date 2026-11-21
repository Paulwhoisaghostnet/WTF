'use strict';

const http = require('node:http');
const https = require('node:https');
const { isIP } = require('node:net');
const { createRoomDirectory } = require('../../server/features/wtfiap/room-directory.cjs');

const listPath = '/api/wtfiap/party/rooms';
const gatePath = '/api/wtfiap/party/health';
const identityPath = '/api/auth/user';
const replacedHeaders = new Set([
  'connection', 'content-encoding', 'content-length', 'etag', 'keep-alive',
  'last-modified', 'proxy-authenticate', 'proxy-authorization', 'set-cookie',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

function exactOrigin(input, label) {
  const origin = new URL(input);
  if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash)
    throw new Error(`${label} must be an HTTP origin.`);
  return origin;
}

function applyGateHeaders(gate, response) {
  for (const [name, value] of Object.entries(gate.headers)) {
    if (!replacedHeaders.has(name)) response.setHeader(name, value);
  }
  const cookies = gate.headers['set-cookie'];
  if (cookies?.length) response.setHeader('Set-Cookie', cookies);
  response.setHeader('Cache-Control', 'no-store');
}

function legacyGet(url, headers, signal) {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.get(url, { headers, signal }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    request.on('error', reject);
  });
}

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

function createLobbyHandler({ directory, legacyOrigin, publicOrigin }) {
  const legacy = exactOrigin(legacyOrigin, 'Legacy service');
  const site = exactOrigin(publicOrigin, 'Public site');
  return async (request, response) => {
    const path = request.url.split('?', 1)[0];
    if (request.method !== 'GET' || path !== listPath || request.headers.authorization !== undefined)
      return sendJson(response, 404, { ok: false, reason: 'Unknown lobby route.' });

    const controller = new AbortController();
    response.once('close', () => controller.abort());
    // The private listener receives traffic only from the trusted ingress,
    // which replaces X-Forwarded-For with the direct client's address.
    const clientIp = request.headers['x-forwarded-for'];
    const cookie = request.headers.cookie || '';
    const hasSession = /(?:^|;\s*)connect\.sid=/.test(cookie);
    const headers = {
      Host: site.host,
      'X-Forwarded-Proto': site.protocol.slice(0, -1),
      'Accept-Encoding': 'identity',
      ...(isIP(clientIp || '') ? { 'X-Forwarded-For': clientIp } : {}),
      ...(request.headers.origin ? { Origin: request.headers.origin } : {}),
      ...(hasSession ? { Cookie: cookie } : {}),
    };
    const upstream = pathname => legacyGet(new URL(pathname, legacy), headers, controller.signal);
    try {
      // This endpoint passes through the same app/role gate as the list,
      // without reading or parsing the saved room archive.
      const gate = await upstream(gatePath);
      applyGateHeaders(gate, response);
      if (gate.status !== 200) {
        response.statusCode = gate.status;
        response.end(gate.body);
        return;
      }
      if (JSON.parse(gate.body).ok !== true) throw new Error('Legacy lobby gate did not approve this request.');

      const profile = hasSession ? await upstream(identityPath) : null;
      if (profile && profile.status !== 200 && profile.status !== 401)
        return sendJson(response, 502, { ok: false, reason: 'Lobby account verification is unavailable.' });
      const account = profile?.status === 200 ? JSON.parse(profile.body) : null;
      if (profile?.status === 200 && !Number.isSafeInteger(account?.id)) throw new Error('Invalid verified account identity.');

      const rooms = await directory.listForAccount(account ? String(account.id) : null);
      const identity = account ? { name: String(account.username || account.displayName || `Commander ${account.id}`) } : undefined;
      sendJson(response, 200, { ok: true, rooms, ...(identity ? { identity } : {}) });
    } catch {
      if (!controller.signal.aborted)
        sendJson(response, 502, { ok: false, reason: 'The lobby is temporarily unavailable.' });
    }
  };
}

if (require.main === module) {
  const dataDir = process.env.WTFIAP_LIVE_LOBBY_DATA_DIR;
  const port = Number(process.env.WTFIAP_LIVE_LOBBY_PORT);
  if (!dataDir || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Set a read-only room directory and a valid lobby listener port.');
  const handler = createLobbyHandler({
    directory: createRoomDirectory(dataDir, { accountBindings: true }),
    legacyOrigin: process.env.WTFIAP_LIVE_LOBBY_LEGACY_ORIGIN,
    publicOrigin: process.env.WTFIAP_LIVE_LOBBY_PUBLIC_ORIGIN,
  });
  http.createServer(handler).listen(port, process.env.WTFIAP_LIVE_LOBBY_HOST || '127.0.0.1');
}

module.exports = { createLobbyHandler };
