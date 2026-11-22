'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { insertIsolatedDuelRoute } = require('./insert-isolated-duel-route.cjs');

const begin = '# BEGIN coLILseum isolated Duel ingress';
const end = '# END coLILseum isolated Duel ingress';
const matcherName = '@wtfiap_isolated_duel';
const originalUri = '{http.request.orig_uri}';

function uniqueIndex(lines, accepts, label) {
  const indexes = lines.flatMap((line, index) => accepts(line) ? [index] : []);
  assert.equal(indexes.length, 1, `Expected one ${label}`);
  return indexes[0];
}

function siteRange(lines) {
  const start = uniqueIndex(lines, line => /^\S.*\{\s*$/.test(line) && !line.startsWith('#') &&
    line.slice(0, line.lastIndexOf('{')).trim().split(/\s*,\s*/).includes('wtfos.app'), 'wtfOS site block');
  const finishOffset = lines.slice(start + 1).findIndex(line => /^}\s*$/.test(line));
  assert(finishOffset >= 0, 'Could not locate the end of the wtfOS site block');
  return { start, finish: start + 1 + finishOffset };
}

function canonicalRoutes(configuration) {
  const site = Object.values(configuration.apps.http.servers).flatMap(server => server.routes || [])
    .find(route => route.match?.some(match => match.host?.includes('wtfos.app')));
  return site.handle.find(handler => handler.handler === 'subroute').routes;
}

function caddyRegexp(pattern) {
  assert(typeof pattern === 'string' && !/["\r\n]/.test(pattern), 'Unsupported Caddy matcher pattern');
  // Caddyfile preserves regex backslashes within quoted tokens.
  return `"${pattern}"`;
}

function markedBlock(lines, protectedRoomCode, adapt) {
  const { start, finish } = siteRange(lines);
  const body = lines.slice(start + 1, finish);
  const websocket = uniqueIndex(body, line => /^[ \t]+reverse_proxy\s+@websocket\s+app:3000\s*$/.test(line),
    'existing wtfOS WebSocket proxy');
  const fallback = uniqueIndex(body, line => /^[ \t]+reverse_proxy\s+app:3000\s+\{\s*$/.test(line),
    'existing legacy app proxy');
  const indent = body[fallback].match(/^[ \t]+/)[0];
  assert.equal(body[websocket].match(/^[ \t]+/)[0], indent, 'Legacy and WebSocket proxies must share a routing scope');
  const fallbackEnd = body.slice(fallback + 1).findIndex(line => line.trimEnd() === `${indent}}`);
  assert(fallbackEnd >= 0, 'Could not locate the legacy proxy forwarding policy');

  const baseline = adapt(lines.join('\n'));
  const expected = insertIsolatedDuelRoute(baseline, protectedRoomCode);
  const originalRoutes = canonicalRoutes(baseline);
  const routes = canonicalRoutes(expected);
  const changed = originalRoutes.findIndex((route, index) => JSON.stringify(route) !== JSON.stringify(routes[index]));
  assert(changed >= 0 && routes.length === originalRoutes.length + 1, 'Expected one inserted Duel rule');
  const [{ host: [host], vars_regexp: patterns, not: [bypass] }] = routes[changed].match;
  const [{ upstreams: [{ dial }] }] = routes[changed].handle;
  const after = start + 1 + websocket + 1;
  const policy = body.slice(fallback + 1, fallback + 1 + fallbackEnd);
  const block = [
    `${indent}${begin}`,
    `${indent}${matcherName} {`,
    `${indent}\thost ${host}`,
    `${indent}\tvars_regexp ${originalUri} ${caddyRegexp(patterns[originalUri].pattern)}`,
    `${indent}\tnot vars_regexp ${originalUri} ${caddyRegexp(bypass.vars_regexp[originalUri].pattern)}`,
    `${indent}}`,
    `${indent}reverse_proxy ${matcherName} ${dial} {`,
    ...policy,
    `${indent}}`,
    `${indent}${end}`,
  ];
  return { block, after, expected, changed };
}

function carryIsolatedDuelRoute(source, protectedRoomCode, adapt) {
  const separator = source.includes('\r\n') ? '\r\n' : '\n';
  const original = source.split(separator);
  const lines = [...original];
  const markers = lines.flatMap((line, index) => [begin, end].includes(line.trim()) ? [index] : []);
  if (markers.length) {
    assert.equal(markers.length, 2, 'Unexpected duplicate or partial Duel carry markers');
    const [first, last] = markers;
    assert(lines[first].trim() === begin && lines[last].trim() === end, 'Unexpected Duel carry marker order');
    const { start, finish } = siteRange(lines);
    assert(start < first && last < finish, 'Duel carry markers must stay inside the wtfOS site');
    lines.splice(first, last - first + 1);
  }
  assert(!lines.some(line => line.includes(matcherName)), 'Unhandled existing Duel matcher');
  const { block, after, expected, changed } = markedBlock(lines, protectedRoomCode, adapt);
  lines.splice(after, 0, ...block);
  const output = lines.join(separator);
  assert(!markers.length || output === source, 'Existing Duel carry block does not match the verified rule');
  const actual = adapt(output);
  // The Caddyfile adapter adds a capture namespace to its named matcher. No
  // route may refer to that namespace, so this is harmless adapter metadata.
  const matcherId = matcherName.slice(1);
  assert(!JSON.stringify(actual).includes(`{re.${matcherId}.`), 'A route consumes the Duel matcher capture namespace');
  const regexp = canonicalRoutes(actual)[changed]?.match?.[0]?.vars_regexp?.[originalUri];
  assert.equal(regexp?.name, matcherId, 'Missing expected Caddyfile matcher metadata');
  delete regexp.name;
  assert.deepEqual(actual, expected, 'Adapted Caddyfile changed more than the verified Duel rule');
  return output;
}

if (require.main === module) {
  let temporary;
  try {
    const [filename, protectedRoomCode, separator, ...command] = process.argv.slice(2);
    assert(filename && protectedRoomCode && (separator === undefined || separator === '--' && command.length > 0),
      'Usage: carry-isolated-duel-route.cjs CADDYFILE PROTECTED_UUID [-- CADDY_ADAPTER COMMAND_ARGS...]');
    const location = path.resolve(filename);
    const metadata = fs.lstatSync(location);
    assert(metadata.isFile(), 'Caddyfile must be a regular file');
    const source = fs.readFileSync(location, 'utf8');
    const [adapter, ...args] = command.length ? command : ['caddy', 'adapt', '--config', '-', '--adapter', 'caddyfile'];
    const adapt = document => {
      const result = spawnSync(adapter, args, { cwd: path.dirname(location), input: document, encoding: 'utf8' });
      assert.equal(result.status, 0, 'Caddy failed to adapt the candidate configuration');
      return JSON.parse(result.stdout);
    };
    const output = carryIsolatedDuelRoute(source, protectedRoomCode, adapt);
    if (source !== output) {
      assert.equal(fs.readFileSync(location, 'utf8'), source, 'Caddyfile changed during route verification');
      temporary = path.join(path.dirname(location), `.${path.basename(location)}.${randomUUID()}.tmp`);
      fs.writeFileSync(temporary, output, { flag: 'wx', mode: metadata.mode & 0o777 });
      fs.renameSync(temporary, location);
      temporary = undefined;
    }
    process.stdout.write('coLILseum ingress matches the verified Caddy route. Running configuration unchanged.\n');
  } catch (error) {
    const message = error instanceof assert.AssertionError ? error.message.split('\n')[0]
      : 'Could not read, adapt, or update the Caddyfile.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  } finally {
    if (temporary) fs.rmSync(temporary, { force: true });
  }
}

module.exports = { carryIsolatedDuelRoute };
