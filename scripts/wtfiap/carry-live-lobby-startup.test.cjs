'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { insertLiveLobbyRoute } = require('./insert-live-lobby-route.cjs');
const { carryLiveLobbyStartup, lobbyRoute } = require('./carry-live-lobby-startup.cjs');

function baseConfig() {
  const appProxy = {
    handler: 'reverse_proxy',
    headers: { request: { set: {
      'X-Forwarded-For': ['{http.request.remote.host}'],
      'X-Forwarded-Proto': ['{http.request.scheme}'],
      'X-Real-Ip': ['{http.request.remote.host}'],
    } } },
    upstreams: [{ dial: 'app:3000' }],
  };
  return { apps: { http: { servers: { srv0: { routes: [{
    match: [{ host: ['wtfos.app', 'operator.wtfos.app'] }],
    handle: [{ handler: 'subroute', routes: [
      { match: [{ vars_regexp: { '{http.request.orig_uri}': { pattern: '^/api/wtfiap/party/rooms/.+$' } } }],
        handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'wtfiap-duel-gateway:3032' }] }] },
      { handle: [appProxy] },
    ] }],
    terminal: true,
  }] } } } } };
}

test('startup carries only the exact live lobby route before the legacy fallback', () => {
  const adapted = baseConfig();
  const live = insertLiveLobbyRoute(adapted);
  const startup = carryLiveLobbyStartup(adapted, live);
  assert.deepEqual(startup, live);
  assert.deepEqual(lobbyRoute(startup), lobbyRoute(live));
  assert.equal(adapted.apps.http.servers.srv0.routes[0].handle[0].routes.length, 2);
});

test('startup refuses missing, altered, or duplicate live lobby routes', () => {
  const adapted = baseConfig();
  const live = insertLiveLobbyRoute(adapted);
  assert.throws(() => carryLiveLobbyStartup(adapted, adapted), /Expected one live lobby reader route/);
  const altered = structuredClone(live);
  lobbyRoute(altered).match[0].header.Authorization = ['*'];
  assert.throws(() => carryLiveLobbyStartup(adapted, altered), /Startup lobby route differs/);
  const duplicate = structuredClone(live);
  const routes = duplicate.apps.http.servers.srv0.routes[0].handle[0].routes;
  routes.splice(routes.length - 1, 0, structuredClone(lobbyRoute(live)));
  assert.throws(() => carryLiveLobbyStartup(adapted, duplicate), /Expected one live lobby reader route/);
});

test('CLI stages native JSON and verifies the running route against its captured reference', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wtfiap-lobby-startup-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'Caddyfile');
  const reference = path.join(directory, 'live.json');
  const output = path.join(directory, 'startup.json');
  const adapter = path.join(directory, 'adapt.cjs');
  const adapted = baseConfig();
  const live = insertLiveLobbyRoute(adapted);
  fs.writeFileSync(source, 'wtfos.app { reverse_proxy app:3000 }\n');
  fs.writeFileSync(reference, JSON.stringify(live));
  fs.writeFileSync(adapter, `process.stdout.write(${JSON.stringify(JSON.stringify(adapted))});\n`);
  const staged = spawnSync(process.execPath, [path.join(__dirname, 'carry-live-lobby-startup.cjs'),
    source, reference, output, '--', process.execPath, adapter], { encoding: 'utf8' });
  assert.equal(staged.status, 0, staged.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), live);
  const verified = spawnSync(process.execPath, [path.join(__dirname, 'carry-live-lobby-startup.cjs'),
    '--verify', reference], { input: fs.readFileSync(output), encoding: 'utf8' });
  assert.equal(verified.status, 0, verified.stderr);
  assert.match(verified.stdout, /Exact coLILseum lobby reader route is active/);
});
