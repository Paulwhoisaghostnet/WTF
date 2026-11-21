'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const fs = require('node:fs');
const { createServer } = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createWtfiapAuthority } = require('../../server/features/wtfiap/authority.cjs');
const { createRoomDirectory } = require('../../server/features/wtfiap/room-directory.cjs');
const { createLobbyHandler } = require('./live-lobby.cjs');

const route = '/api/wtfiap/party/rooms';
const publicOrigin = 'https://wtfos.app';
const accounts = new Map([
  ['seat', { id: 27, username: 'captain', displayName: 'Captain' }],
  ['other', { id: 41, displayName: 'Other' }],
  ['timeout', { id: 63, username: 'disabled' }],
]);

async function listen(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test('lobby reuses the legacy access gate and matches its directory and account response', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wtfiap-live-lobby-'));
  let enabled = true;
  const calls = [];
  const authority = createWtfiapAuthority({ dataDir, isEnabled: () => enabled, canAccess: request => request.user?.id !== 63 });
  await authority.ready;
  t.after(async () => { await authority.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const legacy = await listen(t, (request, response) => {
    calls.push({ path: request.url, headers: request.headers });
    response.status = status => { response.statusCode = status; return response; };
    response.json = data => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(data)); };
    if (request.headers.origin) {
      response.setHeader('Vary', 'Origin');
      if (request.headers.origin !== publicOrigin) return response.status(403).json({ error: 'Origin denied' });
      response.setHeader('Access-Control-Allow-Origin', publicOrigin);
    }
    request.user = accounts.get(request.headers.cookie?.match(/(?:^|;\s*)connect\.sid=([^;]+)/)?.[1]);
    if (request.url === '/api/auth/user')
      return request.user ? response.json(request.user) : response.status(401).json({ error: 'Not authenticated' });
    authority.handler(request, response, error => response.status(500).json({ error: String(error) }));
  });
  const created = await fetch(legacy + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'connect.sid=seat' },
    body: JSON.stringify({ name: 'different request name', roomType: 'duel', boardMode: 'standard', preparationSeconds: null }),
  });
  assert.equal(created.status, 201);
  const { roomCode, playerId, sessionToken } = await created.json();
  const sidecar = await listen(t, createLobbyHandler({
    directory: createRoomDirectory(dataDir, { accountBindings: true }), legacyOrigin: legacy, publicOrigin,
  }));
  const get = (origin, cookieName, extras = {}) => fetch(origin + route, {
    headers: { ...(cookieName ? { Cookie: `connect.sid=${cookieName}` } : {}), ...extras },
  });
  for (const actor of [undefined, 'seat', 'other', 'stale']) {
    const expected = await (await get(legacy, actor)).json();
    const index = calls.length;
    const response = await get(sidecar, actor, { Origin: publicOrigin, 'X-Forwarded-For': '192.0.2.42' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), publicOrigin);
    assert.equal(response.headers.get('vary'), 'Origin');
    const actual = await response.json();
    assert.deepEqual(actual, expected);
    assert.equal(actual.rooms[0].roomCode, roomCode);
    assert.equal(actual.rooms[0].myPlayerId, actor === 'seat' ? playerId : undefined);
    assert.equal(JSON.stringify(actual).includes(sessionToken), false);
    assert.equal(Object.hasOwn(actual.rooms[0], 'sessions'), false);
    const upstream = calls.slice(index);
    assert.deepEqual(upstream.map(x => x.path), ['/api/wtfiap/party/health', ...(actor ? ['/api/auth/user'] : [])]);
    for (const { headers } of upstream) {
      assert.equal(headers.host, 'wtfos.app');
      assert.equal(headers['x-forwarded-for'], '192.0.2.42');
      assert.equal(headers['x-forwarded-proto'], 'https');
    }
  }

  for (const [actor, origin, expectedStatus] of [['timeout', publicOrigin, 403], ['seat', 'https://unrelated.example', 403]]) {
    const index = calls.length;
    const result = await get(sidecar, actor, { Origin: origin });
    assert.equal(result.status, expectedStatus);
    assert.equal((await result.json()).rooms, undefined);
    assert.deepEqual(calls.slice(index).map(x => x.path), ['/api/wtfiap/party/health']);
  }
  enabled = false;
  const disabled = await get(sidecar, 'seat');
  assert.equal(disabled.status, 403);
  assert.match((await disabled.json()).reason, /disabled by the host/);

  const index = calls.length;
  assert.equal((await fetch(sidecar + route, { method: 'POST' })).status, 404);
  assert.equal((await fetch(sidecar + route.replace('/api/', '/api/v1/'))).status, 404);
  assert.equal((await get(sidecar, 'seat', { Authorization: 'Bearer signed-token' })).status, 404);
  assert.equal(calls.length, index);
});
