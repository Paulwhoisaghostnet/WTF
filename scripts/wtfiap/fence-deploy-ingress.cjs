'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');

const fenceHeader = 'X-Colilseum-Admission-Fence';
const fencedPath = '(?i)^/api/(?:v1/)?wtfiap/(?:' + [
  'party/rooms(?:/[^/]+/start)?',
  'open-duel/rooms/[A-Za-z0-9-]+/prepare-(?:host|guest)',
  'funding/rooms/[^/]+/(?:bind-wallet|stake-intent|open|start)',
  'sponsor-funding/rooms/[A-Za-z0-9-]+/(?:bind-wallet|open|start)',
].join('|') + ')/?$';

function fenceRoute() {
  return {
    match: [{ method: ['POST'], path_regexp: { pattern: fencedPath } }],
    handle: [{
      handler: 'static_response',
      status_code: '503',
      headers: {
        'Cache-Control': ['no-store'],
        'Content-Type': ['application/json; charset=utf-8'],
        [fenceHeader]: ['active'],
      },
      body: JSON.stringify({ ok: false, reason: 'Creating rooms and starting matches is temporarily paused for a coLILseum update.' }),
    }],
    terminal: true,
  };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fenceDeployIngress(configuration) {
  assert(isObject(configuration), 'Expected the running Caddy configuration.');
  const next = structuredClone(configuration);
  const servers = next.apps?.http?.servers;
  assert(isObject(servers) && Object.keys(servers).length > 0, 'Expected running Caddy HTTP servers.');
  assert(!JSON.stringify(servers).toLowerCase().includes(fenceHeader.toLowerCase()),
    'An admission fence is already present.');

  const runningServers = Object.values(servers);
  let hasWtfosOrigin = false;
  for (const server of runningServers) {
    assert(isObject(server) && Array.isArray(server.routes) && server.routes.length > 0,
      'An HTTP server does not have the expected route table.');
    for (const route of server.routes) {
      assert(isObject(route) && (route.match === undefined || Array.isArray(route.match)) && Array.isArray(route.handle),
        'An HTTP server has an unexpected root route.');
      if (route.match?.some(match => Array.isArray(match?.host) && match.host.includes('wtfos.app'))) {
        hasWtfosOrigin = true;
      }
    }
  }
  assert(hasWtfosOrigin, 'The running Caddy configuration does not contain the wtfOS origin.');

  // Fence before every host branch. Alternate wtfOS hosts and MCP's HTTP API
  // forwarding must not reach the legacy app through a different route.
  for (const server of runningServers) server.routes.unshift(fenceRoute());
  return next;
}

if (require.main === module) {
  try {
    assert.equal(process.argv.length, 2, 'Pass the running Caddy JSON on stdin.');
    const configuration = JSON.parse(readFileSync(0, 'utf8'));
    process.stdout.write(JSON.stringify(fenceDeployIngress(configuration)) + '\n');
  } catch (error) {
    // Never display active proxy configuration on a parse or validation error.
    const message = error instanceof assert.AssertionError
      ? String(error.message).split('\n', 1)[0]
      : 'Could not read or transform the running Caddy configuration.';
    process.stderr.write(message + '\n');
    process.exitCode = 1;
  }
}

module.exports = { fenceDeployIngress, fencedPath, fenceHeader };
