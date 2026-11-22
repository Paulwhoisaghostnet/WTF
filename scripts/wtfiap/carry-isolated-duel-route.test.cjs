'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { carryIsolatedDuelRoute } = require('./carry-isolated-duel-route.cjs');
const { insertIsolatedDuelRoute } = require('./insert-isolated-duel-route.cjs');

const protectedRoom = 'f0d03a0b-1b30-4456-926e-f83ade7a1e9f';
const otherRoom = '30430664-dfb3-4657-b2e3-418198d7c5a9';
const variable = '{http.request.orig_uri}';
const source = `wtfos.app, beta.wtfos.app {
\treverse_proxy app:3000 {
\t\theader_up X-Real-IP {remote_host}
\t\theader_up X-Forwarded-For {remote_host}
\t\theader_up X-Forwarded-Proto {scheme}
\t}
\t@websocket {
\t\theader Connection *Upgrade*
\t\theader Upgrade websocket
\t}
\treverse_proxy @websocket app:3000
}

unrelated.example {
\trespond 200
}
`;

const configuration = {
  apps: { http: { servers: { srv0: { routes: [
    { match: [{ host: ['wtfos.app', 'beta.wtfos.app'] }], handle: [{ handler: 'subroute', routes: [
      { match: [{ header: { Connection: ['*Upgrade*'], Upgrade: ['websocket'] } }],
        handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'app:3000' }] }] },
      { handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'app:3000' }], headers: { request: { set: {
        'X-Real-Ip': ['{http.request.remote.host}'],
        'X-Forwarded-For': ['{http.request.remote.host}'],
        'X-Forwarded-Proto': ['{http.request.scheme}'],
      } } } } ] },
    ] }] },
    { match: [{ host: ['unrelated.example'] }], handle: [{ handler: 'static_response', status_code: 200 }] },
  ] } } } },
};

const routes = config => config.apps.http.servers.srv0.routes[0].handle[0].routes;
function fixtureAdapter(before, verifyCandidate = () => {}) {
  return text => {
    if (text === before || text === before.replaceAll('\r\n', '\n')) return structuredClone(configuration);
    const candidate = insertIsolatedDuelRoute(configuration, protectedRoom);
    const newRoute = routes(candidate)[1];
    const first = newRoute.match[0].vars_regexp[variable];
    const second = newRoute.match[0].not[0].vars_regexp[variable];
    assert(text.includes(`vars_regexp ${variable} "${first.pattern}"`));
    assert(text.includes(`not vars_regexp ${variable} "${second.pattern}"`));
    assert(text.includes('reverse_proxy @wtfiap_isolated_duel wtfiap-duel-gateway:3032 {'));
    first.name = 'wtfiap_isolated_duel';
    verifyCandidate(candidate);
    return candidate;
  };
}

test('carries only the verified Duel proxy and is byte-idempotent', () => {
  const adapt = fixtureAdapter(source);
  const result = carryIsolatedDuelRoute(source, protectedRoom, adapt);
  assert(result.includes(`\treverse_proxy @websocket app:3000\n\t# BEGIN coLILseum isolated Duel ingress`));
  assert(result.endsWith('unrelated.example {\n\trespond 200\n}\n'));
  const forwarded = result.match(/\treverse_proxy @wtfiap_isolated_duel[^\n]+\n([\s\S]+?)\n\t}/)[1];
  assert.equal(forwarded, source.match(/\treverse_proxy app:3000 \{\n([\s\S]+?)\n\t}/)[1]);
  assert.equal(carryIsolatedDuelRoute(result, protectedRoom, adapt), result);
});

test('keeps the protected room on legacy routes while matching the approved exact Duel route', () => {
  const next = carryIsolatedDuelRoute(source, protectedRoom, fixtureAdapter(source));
  const [include, exclude] = [...next.matchAll(/vars_regexp \{http\.request\.orig_uri\} "([^"]+)"/g)].map(match => match[1]);
  const isIsolated = url => new RegExp(include).test(url) && !new RegExp(exclude.slice(4), 'i').test(url);
  assert(isIsolated('/api/wtfiap/party/rooms'));
  assert(isIsolated(`/api/v1/wtfiap/party/rooms/${otherRoom}/events?watch=1`));
  assert(isIsolated(`/api/wtfiap/open-duel/rooms/${otherRoom}`));
  assert(!isIsolated(`/api/wtfiap/party/rooms/${protectedRoom}/events`));
  assert(!isIsolated(`/api/v1/wtfiap/open-duel/rooms/${protectedRoom.toUpperCase()}?x=1`));
  assert(!isIsolated('/api/wtfiap/funding/rooms'));
  assert(!isIsolated('/api/wtfiap/party/%72ooms'));
});

test('preserves checkout CRLF and rejects ambiguous, damaged, or moved carry blocks', () => {
  const windows = source.replaceAll('\n', '\r\n');
  const result = carryIsolatedDuelRoute(windows, protectedRoom, fixtureAdapter(windows));
  assert(!result.replaceAll('\r\n', '').includes('\n'));
  const unix = carryIsolatedDuelRoute(source, protectedRoom, fixtureAdapter(source));
  assert.throws(() => carryIsolatedDuelRoute(unix.replace(protectedRoom, otherRoom), protectedRoom, fixtureAdapter(source)), /does not match/);
  assert.throws(() => carryIsolatedDuelRoute(unix.replace(/^.*# END.*\n/m, ''), protectedRoom, fixtureAdapter(source)), /partial/);
  const stripped = source.replace('reverse_proxy @websocket app:3000', 'reverse_proxy @different app:3000');
  assert.throws(() => carryIsolatedDuelRoute(stripped, protectedRoom, fixtureAdapter(stripped)), /WebSocket/);
});

test('rejects changes to unrelated adapters, route order, or capture dependencies', () => {
  const mutations = [
    candidate => { candidate.apps.http.servers.srv0.routes[1].handle[0].status_code = 201; },
    candidate => { routes(candidate).reverse(); },
    candidate => { routes(candidate)[1].handle[0].headers.request.set.Danger = ['{re.wtfiap_isolated_duel.0}']; },
  ];
  for (const alter of mutations) {
    assert.throws(() => carryIsolatedDuelRoute(source, protectedRoom, fixtureAdapter(source, alter)),
      /changed more|metadata|capture namespace/);
  }
});
