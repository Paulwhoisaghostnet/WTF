'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { insertIsolatedDuelRoute } = require('./insert-isolated-duel-route.cjs');

function verifyIsolatedDuelIngress(configuration, protectedRoomCode) {
  const actual = structuredClone(configuration);
  const baseline = structuredClone(configuration);
  const origin = '{http.request.orig_uri}';
  const upstream = 'wtfiap-duel-gateway:3032';

  function canonicalRoutes(config) {
    const sites = Object.values(config.apps.http.servers).flatMap(server => server.routes || [])
      .filter(route => route.match?.some(match => match.host?.includes('wtfos.app')));
    assert.equal(sites.length, 1);
    const scopes = sites[0].handle.filter(handler => handler.handler === 'subroute');
    assert.equal(scopes.length, 1);
    return scopes[0].routes;
  }

  const routes = canonicalRoutes(baseline);
  const matches = routes.flatMap((route, index) =>
    route.handle?.some(handler => handler.upstreams?.some(peer => peer.dial === upstream)) ? [index] : []);
  assert.equal(matches.length, 1);
  const [position] = matches;
  routes.splice(position, 1);

  const matcher = canonicalRoutes(actual)[position].match[0].vars_regexp[origin];
  if (matcher.name === 'wtfiap_isolated_duel') {
    assert(!JSON.stringify(actual).includes('{re.wtfiap_isolated_duel.'));
    delete matcher.name;
  }
  assert.deepEqual(actual, insertIsolatedDuelRoute(baseline, protectedRoomCode));
}

if (require.main === module) {
  try {
    verifyIsolatedDuelIngress(JSON.parse(readFileSync(0, 'utf8')), process.argv[2]);
    console.log('Verified the scoped isolated Duel ingress and protected-room bypass.');
  } catch {
    console.error('The running proxy does not match the verified Duel ingress.');
    process.exitCode = 1;
  }
}

module.exports = { verifyIsolatedDuelIngress };
