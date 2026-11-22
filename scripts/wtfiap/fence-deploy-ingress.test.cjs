'use strict';

const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
const { mkdtemp, rm, writeFile } = require('node:fs/promises');
const { createServer, request } = require('node:http');
const { tmpdir } = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { fenceDeployIngress, fencedPath, fenceHeader } = require('./fence-deploy-ingress.cjs');

const root = {
  match: [{ host: ['wtfos.app', 'beta.wtfos.app'] }],
  handle: [{ handler: 'subroute', routes: [{ handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'app:3000' }] }] }] }],
  terminal: true,
};
const sites = {
  match: [{ host: ['*.wtfos.me'] }],
  handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'app:3000' }] }],
};

function fixture() {
  return {
    admin: { listen: '127.0.0.1:2019' },
    apps: { http: { servers: {
      public: { listen: [':443'], routes: [root] },
      extra: { listen: [':8443'], routes: [sites], logs: { default_logger_name: 'site' } },
    } } },
  };
}

test('all HTTP servers get a first, terminal 503 route without modifying existing config', () => {
  const active = fixture(), original = structuredClone(active);
  const next = fenceDeployIngress(active);

  assert.deepEqual(active, original);
  assert.deepEqual(next.admin, active.admin);
  for (const [name, server] of Object.entries(next.apps.http.servers)) {
    const [fence, ...existing] = server.routes;
    assert.deepEqual({ ...server, routes: existing }, active.apps.http.servers[name]);
    assert.equal(fence.terminal, true);
    assert.deepEqual(fence.match, [{ method: ['POST'], path_regexp: { pattern: fencedPath } }]);
    assert.deepEqual(fence.handle[0].headers[fenceHeader], ['active']);
    assert.deepEqual(fence.handle[0].headers['Cache-Control'], ['no-store']);
    assert.equal(fence.handle[0].status_code, '503');
    assert.equal(JSON.parse(fence.handle[0].body).ok, false);
  }
});

test('only room admission and match starts are fenced for both URL prefixes', () => {
  assert(fencedPath.startsWith('(?i)'));
  const pattern = new RegExp(fencedPath.slice('(?i)'.length), 'i');
  const blocked = [
    'party/rooms',
    'party/rooms/room-code/start',
    'open-duel/rooms/room-code/prepare-host',
    'open-duel/rooms/room-code/prepare-guest',
    'funding/rooms/legacy-room/bind-wallet',
    'funding/rooms/legacy-room/stake-intent',
    'funding/rooms/legacy-room/open',
    'funding/rooms/legacy-room/start',
    'sponsor-funding/rooms/room-code/bind-wallet',
    'sponsor-funding/rooms/room-code/open',
    'sponsor-funding/rooms/room-code/start',
  ];
  const open = [
    'party/rooms/room-code', 'party/rooms/room-code/events', 'party/rooms/room-code/replay',
    'party/rooms/room-code/lobby', 'party/rooms/room-code/resume', 'party/rooms/room-code/join',
    'party/rooms/room-code/watch', 'party/rooms/room-code/close', 'party/rooms/room-code/commands',
    'party/rooms/room-code/messages', 'open-duel/rooms/room-code/reconcile',
    'open-duel/rooms/room-code/claim-seat', 'open-duel/prepaid-credit/quote',
    'open-duel/rooms/room-code/operations/oDuel', 'funding/rooms/room-code/observe',
    'funding/rooms/room-code/reconcile', 'sponsor-funding/rooms/room-code/pick-lot',
    'sponsor-funding/rooms/room-code/observe', 'sponsor-funding/rooms/room-code/reconcile',
    'funding/rooms/room-code/start/extra', 'party/rooms/room-code/restart',
  ];
  for (const prefix of ['/api/wtfiap/', '/api/v1/wtfiap/']) {
    for (const target of blocked) {
      assert(pattern.test(prefix + target), target);
      assert(pattern.test((prefix + target).toUpperCase() + '/'), target);
    }
    for (const target of open) {
      assert(!pattern.test(prefix + target), target);
      assert(!pattern.test((prefix + target).toUpperCase() + '/'), target);
    }
  }
  for (const target of ['/mcp', '/api/auth/user', '/api/v1/party/rooms', '/games/installed/wtfiap/party.html']) {
    assert(!pattern.test(target), target);
  }
});

test('wrong runtime configuration, malformed route shape, and repeated fences fail closed', () => {
  assert.throws(() => fenceDeployIngress([]), /running Caddy configuration/);
  assert.throws(() => fenceDeployIngress({}), /HTTP servers/);
  assert.throws(() => fenceDeployIngress({ apps: { http: { servers: { unknown: {} } } } }), /expected route table/);
  assert.throws(() => fenceDeployIngress({ apps: { http: { servers: { unknown: { routes: [{}] } } } } }), /unexpected root route/);
  const wrongOrigin = fixture();
  wrongOrigin.apps.http.servers.public.routes = [sites];
  assert.throws(() => fenceDeployIngress(wrongOrigin), /does not contain the wtfOS origin/);
  assert.throws(() => fenceDeployIngress(fenceDeployIngress(fixture())), /already present/);
});

test('CLI accepts stdin and emits only JSON on success, no output config on failure', () => {
  const script = path.join(__dirname, 'fence-deploy-ingress.cjs');
  const run = input => spawnSync(process.execPath, [script], { input, encoding: 'utf8' });
  const valid = run(JSON.stringify(fixture()));
  assert.equal(valid.status, 0, valid.stderr);
  assert.deepEqual(JSON.parse(valid.stdout), fenceDeployIngress(fixture()));
  const invalid = run('invalid JSON containing private configuration text');
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, '');
  assert(!invalid.stderr.includes('private configuration text'));
});

const caddy = process.env.WTFIAP_TEST_CADDY;
test('Caddy blocks variant starts on an alias and preserves existing room actions', {
  skip: !caddy && 'Set WTFIAP_TEST_CADDY to the local Caddy executable to exercise the Go router.',
}, async () => {
  const available = createServer().listen(0, '127.0.0.1');
  await once(available, 'listening');
  const { port } = available.address();
  await new Promise(resolve => available.close(resolve));
  const temp = await mkdtemp(path.join(tmpdir(), 'colilseum-fence-'));
  const source = { admin: { disabled: true }, apps: { http: { servers: { local: {
    listen: ['127.0.0.1:' + port], automatic_https: { disable: true },
    routes: [{ match: [{ host: ['wtfos.app', 'beta.wtfos.app'] }],
      handle: [{ handler: 'static_response', status_code: '204' }] }],
  } } } } };
  const config = path.join(temp, 'caddy.json');
  await writeFile(config, JSON.stringify(fenceDeployIngress(source)));
  const proxy = spawn(caddy, ['run', '--config', config], {
    env: { ...process.env, XDG_CONFIG_HOME: path.join(temp, 'config'), XDG_DATA_HOME: path.join(temp, 'data') },
  });
  const done = once(proxy, 'exit');
  let log = '';
  const ready = new Promise((resolve, reject) => {
    proxy.stderr.setEncoding('utf8').on('data', chunk => {
      log += chunk;
      if (log.includes('serving initial configuration')) resolve();
    });
    proxy.once('error', reject);
    proxy.once('exit', code => reject(new Error(`Caddy exited before listening (${code}).`)));
  });
  const submit = (method, target, host) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, method, path: target, headers: { Host: host } }, response => {
      response.resume().once('end', () => resolve({ status: response.statusCode, headers: response.headers }));
    });
    req.once('error', reject);
    req.end();
  });
  try {
    await ready;
    const start = '/api/V1/WTFIAP/Party/Rooms/Room/START/?mode=normal';
    const blocked = await submit('POST', start, 'beta.wtfos.app');
    assert.equal(blocked.status, 503);
    assert.equal(blocked.headers[fenceHeader.toLowerCase()], 'active');
    assert.equal(blocked.headers['cache-control'], 'no-store');
    const command = await submit('POST', '/api/wtfiap/party/rooms/room/COMMANDS/', 'wtfos.app');
    assert.equal(command.status, 204);
    assert.equal(command.headers[fenceHeader.toLowerCase()], undefined);
    assert.equal((await submit('GET', start, 'wtfos.app')).status, 204);
  } finally {
    proxy.kill('SIGTERM');
    await done.catch(() => undefined);
    await rm(temp, { recursive: true, force: true });
  }
});
