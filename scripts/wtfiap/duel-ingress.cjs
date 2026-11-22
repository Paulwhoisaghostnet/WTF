'use strict';

const fs = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');
const path = require('node:path');
const { brotliDecompressSync, gunzipSync, inflateSync } = require('node:zlib');

const createPath = /^\/api\/(?:v1\/)?wtfiap\/party\/rooms$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const roomPath = /^(\/api\/(?:v1\/)?wtfiap\/(party|open-duel)\/rooms\/)([^/]+)(.*)$/;
const partyReads = new Set(['', '/events', '/replay', '/lobby']);
const partyWrites = new Set(['/join', '/watch', '/resume', '/start', '/close', '/commands', '/messages']);
const openWrites = new Set(['/prepare-host', '/prepare-guest', '/reconcile', '/claim-seat']);
const escrowOperation = /^\/operations\/o[1-9A-HJ-NP-Za-km-z]+$/;
const hopHeaders = [
  'connection', 'expect', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'proxy-connection', 'te', 'trailer', 'transfer-encoding', 'upgrade',
];
const permittedNetworks = new Set(['mainnet', 'shadownet']);
const encodings = new Map([
  ['gzip', gunzipSync], ['deflate', inflateSync], ['br', brotliDecompressSync],
]);

function exactOrigin(input) {
  const origin = new URL(input);
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash)
    throw new Error('Duel ingress upstream must be an HTTP origin.');
  return origin;
}

function decodeCreation(buffer, encoding, maxJsonBytes) {
  try {
    encoding = encoding?.trim().toLowerCase();
    if (encoding && encoding !== 'identity') {
      const decode = encodings.get(encoding);
      if (!decode) return null;
      buffer = decode(buffer, { maxOutputLength: maxJsonBytes });
    }
    return JSON.parse(buffer.toString('utf8'));
  } catch { return null; }
}

function networkSet(networks) {
  const enabled = new Set(networks);
  if ([...enabled].some(network => !permittedNetworks.has(network)))
    throw new Error('Duel ingress policy may enable only its supported Tezos networks.');
  return enabled;
}

function supportedAction(method, family, action) {
  if (method === 'GET')
    return family === 'party' ? partyReads.has(action) : action === '' || escrowOperation.test(action);
  if (method === 'POST') return family === 'party' ? partyWrites.has(action) : openWrites.has(action);
  return false;
}

async function resolveDuelRoute({ method, url, body, dataDir, protectedRoomCode, networks }) {
  const pathname = url.split('?', 1)[0];
  if (method === 'POST' && createPath.test(pathname)) {
    const wager = body?.duelWager;
    const network = wager?.network || 'shadownet';
    if (body?.roomType !== 'duel' || wager?.currency !== 'XTZ' || !permittedNetworks.has(network))
      return { lane: 'legacy', url };
    const enabled = typeof networks === 'function' ? networkSet(await networks()) : networks;
    return { lane: enabled.has(network) ? 'duel' : 'legacy', url };
  }
  const route = pathname.match(roomPath);
  if (!route) return { lane: 'legacy', url };
  const [, prefix, family, suppliedCode, action] = route;
  if (!uuid.test(suppliedCode) || !supportedAction(method, family, action))
    return { lane: 'legacy', url };

  const code = suppliedCode.toLowerCase();
  if (code === protectedRoomCode) return { lane: 'legacy', url };
  let file;
  try { file = await fs.lstat(path.join(dataDir, code + '.json')); }
  catch (error) { if (error.code === 'ENOENT') return { lane: 'legacy', url }; throw error; }
  if (!file.isFile()) return { lane: 'legacy', url };
  return { lane: 'duel', url: prefix + code + action + url.slice(pathname.length) };
}

function forwardedHeaders(incoming) {
  const headers = { ...incoming };
  const extensions = String(headers.connection || '').split(',').map(name => name.trim().toLowerCase());
  for (const name of [...hopHeaders, ...extensions]) delete headers[name];
  return headers;
}

function reject(response, status, reason) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify({ ok: false, reason }));
}

function proxyDuelRequest({ request, response, origin, url, bufferedBody, errorReason }) {
  const client = origin.protocol === 'https:' ? https : http;
  const headers = forwardedHeaders(request.headers);
  if (bufferedBody) headers['content-length'] = String(bufferedBody.length);
  const upstream = client.request(origin, { method: request.method, path: url, headers }, incoming => {
    if (response.destroyed) { incoming.destroy(); return; }
    response.writeHead(incoming.statusCode, forwardedHeaders(incoming.headers));
    response.flushHeaders();
    incoming.on('error', () => response.destroy());
    incoming.pipe(response);
  });
  response.once('close', () => { if (!response.writableFinished) upstream.destroy(); });
  upstream.on('error', () => {
    if (response.destroyed) return;
    if (response.headersSent) response.destroy();
    else reject(response, 502, errorReason);
  });
  if (bufferedBody) upstream.end(bufferedBody);
  else request.pipe(upstream);
}

async function selectionBody(request, maxJsonBytes) {
  if (Number(request.headers['content-length']) > maxJsonBytes) return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxJsonBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, size);
}

function createDuelIngress({ legacyOrigin, duelOrigin, dataDir, protectedRoomCode, networks, maxJsonBytes = 10 * 1024 * 1024 }) {
  const origins = { legacy: exactOrigin(legacyOrigin), duel: exactOrigin(duelOrigin) };
  const admissionPolicy = typeof networks === 'function' ? networks : networkSet(networks);
  if (!dataDir || !uuid.test(protectedRoomCode) || protectedRoomCode !== protectedRoomCode.toLowerCase() ||
      !Number.isSafeInteger(maxJsonBytes) || maxJsonBytes < 1)
    throw new Error('Duel ingress needs a room directory, pinned room, supported chains, and the host JSON limit.');

  return async (request, response) => {
    const { method, url } = request;
    let bufferedBody;
    let route;
    try {
      let body;
      if (method === 'POST' && createPath.test(url.split('?', 1)[0]) &&
          request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() === 'application/json') {
        // The default is the existing Express JSON limit in server/app.ts.
        bufferedBody = await selectionBody(request, maxJsonBytes);
        if (!bufferedBody) {
          request.resume();
          return reject(response, 413, 'Room creation exceeds the host request size.');
        }
        body = decodeCreation(bufferedBody, request.headers['content-encoding'], maxJsonBytes);
      }
      route = await resolveDuelRoute({ method, url, body, dataDir, protectedRoomCode, networks: admissionPolicy });
    } catch {
      request.resume();
      if (!response.destroyed) reject(response, 503, 'The room route is temporarily unavailable.');
      return;
    }
    // Never fail over an action to the other room authority. A backend can
    // finish a durable command even if its response socket closes.
    proxyDuelRequest({ request, response, origin: origins[route.lane], url: route.url, bufferedBody,
      errorReason: method === 'POST' ? 'The room action could not be confirmed. Check the room before retrying.' : 'The room service is temporarily unavailable.' });
  };
}

module.exports = { createDuelIngress, resolveDuelRoute, proxyDuelRequest };
