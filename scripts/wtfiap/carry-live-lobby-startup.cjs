'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const { insertLiveLobbyRoute } = require('./insert-live-lobby-route.cjs');

const reader = 'wtfiap-lobby-reader:3030';

function lobbyRoute(configuration) {
  const hostRoutes = Object.values(configuration.apps?.http?.servers || {})
    .flatMap(server => server.routes || [])
    .filter(route => route.match?.some(match => match.host?.includes('wtfos.app')));
  assert.equal(hostRoutes.length, 1, 'Expected one exact wtfOS origin route');
  const scopes = hostRoutes[0].handle?.filter(handler => handler.handler === 'subroute') || [];
  assert.equal(scopes.length, 1, 'Expected one wtfOS origin subroute');
  const routes = scopes[0].routes;
  assert(Array.isArray(routes), 'Expected wtfOS origin handlers');
  const matches = routes.flatMap((route, index) => JSON.stringify(route).includes(reader) ? [{ route, index }] : []);
  assert.equal(matches.length, 1, 'Expected one live lobby reader route');
  assert.equal(matches[0].index, routes.length - 2, 'Lobby reader must precede the legacy app fallback');
  return matches[0].route;
}

function carryLiveLobbyStartup(adapted, live) {
  const expected = lobbyRoute(live);
  const startup = insertLiveLobbyRoute(adapted);
  assert.deepEqual(lobbyRoute(startup), expected, 'Startup lobby route differs from the running route');
  const withoutLobby = structuredClone(startup);
  const hostRoute = Object.values(withoutLobby.apps.http.servers).flatMap(server => server.routes || [])
    .find(route => route.match?.some(match => match.host?.includes('wtfos.app')));
  const routes = hostRoute.handle.find(handler => handler.handler === 'subroute').routes;
  routes.splice(routes.length - 2, 1);
  assert.deepEqual(withoutLobby, adapted, 'Startup changed more than the exact lobby route');
  return startup;
}

function safeMessage(error) {
  return error instanceof assert.AssertionError ? String(error.message).split('\n', 1)[0]
    : 'Could not prepare or verify the lobby reader startup configuration.';
}

if (require.main === module) {
  try {
    if (process.argv[2] === '--verify') {
      assert.equal(process.argv.length, 4, 'Usage: --verify LIVE_REFERENCE.json < ACTIVE.json');
      const live = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
      const active = JSON.parse(fs.readFileSync(0, 'utf8'));
      assert.deepEqual(lobbyRoute(active), lobbyRoute(live), 'Active lobby route differs from the captured route');
      process.stdout.write('Exact coLILseum lobby reader route is active.\n');
    } else {
      const [sourceFile, liveFile, outputFile, separator, adapter, ...args] = process.argv.slice(2);
      assert(sourceFile && liveFile && outputFile && separator === '--' && adapter,
        'Usage: CADDYFILE LIVE_REFERENCE.json OUTPUT.json -- CADDY_ADAPTER COMMAND_ARGS...');
      assert(fs.lstatSync(sourceFile).isFile() && fs.lstatSync(liveFile).isFile(),
        'Caddyfile and live reference must be regular files');
      const source = fs.readFileSync(sourceFile, 'utf8');
      const adapted = spawnSync(adapter, args, { input: source, encoding: 'utf8' });
      assert.equal(adapted.status, 0, 'Caddy failed to adapt the startup Caddyfile');
      const startup = carryLiveLobbyStartup(JSON.parse(adapted.stdout),
        JSON.parse(fs.readFileSync(liveFile, 'utf8')));
      fs.writeFileSync(outputFile, `${JSON.stringify(startup)}\n`, { flag: 'wx', mode: 0o600 });
      process.stdout.write('Exact coLILseum lobby reader route staged in startup JSON.\n');
    }
  } catch (error) {
    process.stderr.write(`${safeMessage(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { carryLiveLobbyStartup, lobbyRoute };
