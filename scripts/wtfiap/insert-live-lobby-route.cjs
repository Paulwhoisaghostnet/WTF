'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');

const host = 'wtfos.app';
const app = 'app:3000';
const reader = 'wtfiap-lobby-reader:3030';
const directory = '/api/wtfiap/party/rooms';

// This works on the running HTTP configuration, not an adaptation of a
// possibly different checkout. Each condition must match before any insert.
function insertLiveLobbyRoute(configuration) {
  const next = structuredClone(configuration);
  const rootRoutes = Object.values(next.apps?.http?.servers || {}).flatMap(server => server.routes || []);
  const hostRoutes = rootRoutes.filter(route => route.match?.some(match => match.host?.includes(host)));
  assert.equal(hostRoutes.length, 1, 'Expected one exact wtfOS origin route');

  const scopes = hostRoutes[0].handle?.filter(handler => handler.handler === 'subroute') || [];
  assert.equal(scopes.length, 1, 'Expected one wtfOS origin subroute');
  const { routes } = scopes[0];
  assert(Array.isArray(routes) && routes.length > 0, 'Expected wtfOS origin handlers');
  assert(!JSON.stringify(routes).includes(reader), 'The lobby reader is already present');

  const last = routes.at(-1);
  const [proxy] = last.handle || [];
  assert(!last.match && last.handle?.length === 1 && proxy?.handler === 'reverse_proxy',
    'Expected a final legacy app catch-all proxy');
  assert.deepEqual(proxy.upstreams, [{ dial: app }], 'Unexpected legacy app upstream');
  assert(proxy.headers?.request?.set, 'Legacy forwarding header policy is missing');

  const readProxy = structuredClone(proxy);
  readProxy.upstreams = [{ dial: reader }];
  // The sidecar receives session cookies for its fixed Express identity check.
  // Preserve the actual reverse proxy forwarding policy and exclude any bearer
  // request at the matcher. Pin the raw URI to preserve path case and escaping.
  const route = {
    match: [{
      host: [host],
      method: ['GET'],
      header: { Authorization: null },
      vars_regexp: { '{http.request.orig_uri}': { pattern: `^${directory}(?:\\?.*)?$` } },
    }],
    handle: [{
      handler: 'subroute',
      routes: [{ handle: [readProxy] }],
      // An upstream HTTP response, including a denial, passes through intact.
      // Only a Caddy transport/handler failure reaches this legacy fallback.
      errors: { routes: [{ handle: [structuredClone(proxy)] }] },
    }],
  };
  routes.splice(routes.length - 1, 0, route);
  return next;
}

if (require.main === module) {
  try {
    const [input, output] = process.argv.slice(2);
    assert(input && output && process.argv.length === 4, 'Usage: insert-live-lobby-route.cjs ACTIVE.json CANDIDATE.json');
    const configuration = JSON.parse(fs.readFileSync(input, 'utf8'));
    const next = insertLiveLobbyRoute(configuration);
    fs.writeFileSync(output, `${JSON.stringify(next)}\n`, { flag: 'wx', mode: 0o600 });
    process.stdout.write('One exact coLILseum lobby route staged. No running configuration changed.\n');
  } catch (error) {
    // A failed equality assertion may carry configuration data. Print only
    // the author-provided check name, never expected/actual JSON contents.
    const safeMessage = error instanceof assert.AssertionError
      ? String(error.message).split('\n')[0]
      : 'Could not read, parse, or write the private Caddy configuration.';
    process.stderr.write(`${safeMessage}\n`);
    process.exitCode = 1;
  }
}

module.exports = { insertLiveLobbyRoute };
