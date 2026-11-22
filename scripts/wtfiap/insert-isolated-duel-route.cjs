'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const canonical = 'wtfos.app';
const legacy = 'app:3000';
const gateway = 'wtfiap-duel-gateway:3032';
const uuid = '[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}';
const roomActions = '[a-z-]+';
const openActions = '(?:[a-z-]+|operations/o[1-9A-HJ-NP-Za-km-z]+)';
const apiPrefix = '/api/(?:v1/)?wtfiap/';
const roomPaths = `(?:party/rooms(?:/${uuid}(?:/${roomActions})?)?|open-duel/rooms/${uuid}(?:/${openActions})?)`;

function insertIsolatedDuelRoute(configuration, protectedRoomCode) {
  assert(new RegExp(`^${uuid}$`).test(protectedRoomCode), 'Expected the explicitly protected Duel UUID');
  const output = structuredClone(configuration);
  const hostRoutes = Object.values(output.apps?.http?.servers || {}).flatMap(server => server.routes || [])
    .filter(route => route.match?.some(match => match.host?.includes(canonical)));
  assert.equal(hostRoutes.length, 1, 'Expected one canonical wtfOS site');
  const scopes = hostRoutes[0].handle?.filter(handler => handler.handler === 'subroute') || [];
  assert.equal(scopes.length, 1, 'Expected one canonical site handler');
  const routes = scopes[0].routes;
  assert(Array.isArray(routes), 'Missing canonical site routes');
  assert(!JSON.stringify(routes).includes(gateway), 'Isolated Duel ingress already exists');
  const last = routes.at(-1);
  const proxy = last?.handle?.[0];
  assert(!last?.match && last?.handle?.length === 1 && proxy?.handler === 'reverse_proxy', 'Missing final legacy proxy');
  assert.deepEqual(proxy.upstreams, [{ dial: legacy }], 'Unexpected legacy app upstream');
  assert(proxy.headers?.request?.set, 'Legacy forwarding header policy is missing');

  // The protected room's API requests bypass the new process entirely. Do not
  // retry the other routes on transport failure: a POST may already be durable.
  const protectedPath = `(?i)^${apiPrefix}(?:party|open-duel)/rooms/${protectedRoomCode}(?:[/?]|$)`;
  const route = {
    match: [{
      host: [canonical],
      vars_regexp: { '{http.request.orig_uri}': { pattern: `^${apiPrefix}${roomPaths}(?:\\?.*)?$` } },
      not: [{ vars_regexp: { '{http.request.orig_uri}': { pattern: protectedPath } } }],
    }],
    handle: [{ ...structuredClone(proxy), upstreams: [{ dial: gateway }] }],
  };
  const existingLobby = routes.findIndex(entry => JSON.stringify(entry).includes('wtfiap-lobby-reader:3030'));
  routes.splice(existingLobby < 0 ? routes.length - 1 : existingLobby, 0, route);
  return output;
}

if (require.main === module) {
  try {
    const [input, output, protectedRoomCode] = process.argv.slice(2);
    assert(input && output && protectedRoomCode && process.argv.length === 5,
      'Usage: insert-isolated-duel-route.cjs ACTIVE.json CANDIDATE.json PROTECTED_ROOM');
    const result = insertIsolatedDuelRoute(JSON.parse(fs.readFileSync(input, 'utf8')), protectedRoomCode);
    fs.writeFileSync(output, `${JSON.stringify(result)}\n`, { flag: 'wx', mode: 0o600 });
    process.stdout.write('Scoped Duel ingress staged. Running configuration unchanged.\n');
  } catch (error) {
    process.stderr.write(`${String(error.message).split('\n')[0]}\n`);
    process.exitCode = 1;
  }
}
module.exports = { insertIsolatedDuelRoute };
