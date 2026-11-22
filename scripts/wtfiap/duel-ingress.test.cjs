'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const { createServer } = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { gzipSync } = require('node:zlib');
const { createDuelIngress, resolveDuelRoute } = require('./duel-ingress.cjs');

const protectedRoomCode = 'f0d03a0b-1b30-4456-926e-f83ade7a1e9f';
const candidate = '1137ab39-02bf-44f6-93c0-cc7e2042a6fb';
const another = '7fa6abc2-8ddf-4f6f-86ca-8fffddb1ff54';
const route = '/api/wtfiap/party/rooms';
const open = '/api/wtfiap/open-duel/rooms';

async function temporaryDirectory(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wtfiap-duel-ingress-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}

async function listen(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('exact partitioning selects only the intended creation and owner-scoped room paths', async t => {
  const dataDir = await temporaryDirectory(t);
  await fs.writeFile(path.join(dataDir, candidate + '.json'), '{}');
  await fs.writeFile(path.join(dataDir, protectedRoomCode + '.json'), '{}');
  await fs.symlink(path.join(dataDir, candidate + '.json'), path.join(dataDir, another + '.json'));
  const networks = new Set(['mainnet']);
  const resolve = (method, url, body) => resolveDuelRoute({ method, url, body, networks, dataDir, protectedRoomCode });
  const create = network => ({ roomType: 'duel', duelWager: { currency: 'XTZ', entryFee: '5', network } });
  assert.equal((await resolve('POST', route, create('mainnet'))).lane, 'duel');
  assert.equal((await resolve('POST', route, create('shadownet'))).lane, 'legacy');
  assert.equal((await resolve('POST', route, create(undefined))).lane, 'legacy');
  assert.equal((await resolve('POST', route, { roomType: 'duel', duelWager: { currency: 'WTF', network: 'mainnet' } })).lane, 'legacy');
  assert.equal((await resolve('POST', route, { ...create('mainnet'), roomType: 'party' })).lane, 'legacy');
  assert.equal((await resolve('GET', route)).lane, 'legacy');
  assert.equal((await resolve('GET', `${route}/${protectedRoomCode.toUpperCase()}/events`)).lane, 'legacy');
  assert.equal((await resolve('POST', `${open}/${protectedRoomCode}/reconcile`)).lane, 'legacy');
  assert.equal((await resolve('GET', `${route}/${another}/events`)).lane, 'legacy');
  assert.equal((await resolve('GET', `${route}/${candidate}/not-an-action`)).lane, 'legacy');
  assert.equal((await resolve('GET', `${route}/${candidate}`)).lane, 'duel');
  assert.equal((await resolve('PATCH', `${route}/${candidate}/commands`)).lane, 'legacy');
  assert.equal((await resolve('GET', `${open}/${candidate}/reconcile`)).lane, 'legacy');
  assert.equal((await resolve('OPTIONS', `${route}/${candidate}/events`)).lane, 'legacy');
  assert.equal((await resolve('GET', `/api/v2/wtfiap/party/rooms/${candidate}`)).lane, 'legacy');
  assert.equal((await resolve('GET', `/api/wtfiap/sponsor-funding/rooms/${candidate}`)).lane, 'legacy');
  assert.equal((await resolve('GET', `/api/wtfiap/funding/config?room=${candidate}`)).lane, 'legacy');
  assert.equal((await resolve('GET', '/api/wtfiap/open-duel/prepaid-credit')).lane, 'legacy');
  assert.deepEqual(await resolve('GET', `${route}/${candidate.toUpperCase()}/events?watch=one%2Ftwo`),
    { lane: 'duel', url: `${route}/${candidate}/events?watch=one%2Ftwo` });
  assert.deepEqual(await resolve('GET', `${open.replace('/api/', '/api/v1/')}/${candidate.toUpperCase()}/operations/opHash`),
    { lane: 'duel', url: `${open.replace('/api/', '/api/v1/')}/${candidate}/operations/opHash` });
});

test('an asynchronous admission policy selects new supported wagers and can drain without moving rooms', async t => {
  const dataDir = await temporaryDirectory(t);
  await fs.writeFile(path.join(dataDir, candidate + '.json'), '{}');
  let reads = 0;
  let policy = [];
  const networks = async () => { reads++; return new Set(policy); };
  const resolve = (method, url, body) => resolveDuelRoute({ method, url, body, networks, dataDir, protectedRoomCode });
  const wager = { roomType: 'duel', duelWager: { currency: 'XTZ', network: 'shadownet' } };
  assert.equal((await resolve('GET', `${route}/${candidate}`)).lane, 'duel');
  assert.equal((await resolve('GET', `${route}/${protectedRoomCode}/events`)).lane, 'legacy');
  assert.equal((await resolve('POST', route, { ...wager, roomType: 'party' })).lane, 'legacy');
  assert.equal((await resolve('POST', route, { ...wager, duelWager: { ...wager.duelWager, network: 'unrecognized' } })).lane, 'legacy');
  assert.equal(reads, 0);

  assert.equal((await resolve('POST', route, wager)).lane, 'legacy');
  policy = ['shadownet'];
  assert.equal((await resolve('POST', route, wager)).lane, 'duel');
  policy = ['mainnet'];
  assert.equal((await resolve('POST', route, wager)).lane, 'legacy');
  assert.equal(reads, 3);
  policy = ['invalid-network'];
  await assert.rejects(resolve('POST', route, wager), /supported Tezos networks/);
  assert.equal((await resolve('POST', `${route}/${candidate}/commands`)).lane, 'duel');
  assert.equal(reads, 4);
});

test('gateway keeps stream and request bytes, relays credentials, and does not retry a dropped POST', async t => {
  const dataDir = await temporaryDirectory(t);
  await fs.writeFile(path.join(dataDir, candidate + '.json'), '{}');
  const calls = [];
  let stream;
  const backend = lane => async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    calls.push({ lane, method: request.method, path: request.url, headers: request.headers, body: Buffer.concat(chunks) });
    if (request.url.endsWith('/commands')) { request.socket.destroy(); return; }
    if (request.url.endsWith('/events')) {
      stream = response;
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
      response.write('data: {"revision":1}\n\n');
      return;
    }
    response.writeHead(request.method === 'POST' ? 201 : 200, {
      'content-type': 'application/json', 'set-cookie': ['sid=1; Secure', 'prefs=2; Secure'],
    });
    response.end(JSON.stringify({ lane }));
  };
  const legacyOrigin = await listen(t, backend('legacy'));
  const duelOrigin = await listen(t, backend('duel'));
  let policy = ['mainnet', 'shadownet'];
  const ingress = await listen(t, createDuelIngress({ legacyOrigin, duelOrigin, dataDir, protectedRoomCode,
    networks: async () => {
      if (!policy) throw new Error('Policy file is unavailable');
      return new Set(policy);
    } }));
  const body = '{ "roomType": "duel", "duelWager": { "currency": "XTZ", "network": "mainnet", "entryFee": "5" }}\n';
  const signed = { 'x-csrf-token': 'test-token', cookie: 'connect.sid=fixture', authorization: 'Bearer test',
    origin: 'https://wtfos.app', 'x-forwarded-proto': 'https', 'x-forwarded-for': '192.0.2.12' };
  const post = (url, payload, additions) => fetch(ingress + url, {
    method: 'POST', headers: { 'content-type': 'application/json', ...signed, ...additions }, body: payload,
  });
  const result = await post(route, body);
  assert.equal(result.status, 201);
  assert.deepEqual(result.headers.getSetCookie(), ['sid=1; Secure', 'prefs=2; Secure']);
  assert.deepEqual(await result.json(), { lane: 'duel' });
  assert.equal(calls.at(-1).body.toString(), body);
  for (const [name, value] of Object.entries(signed)) assert.equal(calls.at(-1).headers[name], value);

  const compressed = gzipSync(body);
  const gzipResult = await post(route.replace('/api/', '/api/v1/'), compressed, { 'content-encoding': 'gzip' });
  assert.deepEqual(await gzipResult.json(), { lane: 'duel' });
  assert.deepEqual(calls.at(-1).body, compressed);
  assert.equal(calls.at(-1).headers['content-encoding'], 'gzip');

  const free = await post(route, '{"roomType":"duel","name":"Lil Player"}');
  assert.deepEqual(await free.json(), { lane: 'legacy' });
  for (const code of [protectedRoomCode, another]) {
    const check = await fetch(`${ingress}${route}/${code}/lobby`);
    assert.deepEqual(await check.json(), { lane: 'legacy' });
  }
  const own = await fetch(`${ingress}${open}/${candidate.toUpperCase()}`);
  assert.deepEqual(await own.json(), { lane: 'duel' });
  assert.equal(calls.at(-1).path, `${open}/${candidate}`);

  const sse = await fetch(`${ingress}${route}/${candidate}/events`);
  assert.equal(sse.headers.get('content-type'), 'text/event-stream');
  const reader = sse.body.getReader();
  const decoder = new TextDecoder();
  assert.equal(decoder.decode((await reader.read()).value), 'data: {"revision":1}\n\n');
  stream.write('data: {"revision":2}\n\n');
  assert.equal(decoder.decode((await reader.read()).value), 'data: {"revision":2}\n\n');
  stream.end();
  assert.equal((await reader.read()).done, true);

  const failed = await post(`${route}/${candidate}/commands`, '{"commandId":"room-retry-key"}');
  assert.equal(failed.status, 502);
  assert.match((await failed.json()).reason, /could not be confirmed/);
  assert.deepEqual(calls.filter(item => item.path.endsWith('/commands')).map(item => item.lane), ['duel']);

  policy = [];
  assert.deepEqual(await (await post(route, body)).json(), { lane: 'legacy' });
  assert.deepEqual(await (await fetch(`${ingress}${route}/${candidate}`)).json(), { lane: 'duel' });
  policy = null;
  const lastCallCount = calls.length;
  assert.equal((await post(route, body)).status, 503);
  assert.equal(calls.length, lastCallCount);
  assert.deepEqual(await (await fetch(`${ingress}${route}/${candidate}`)).json(), { lane: 'duel' });
});
