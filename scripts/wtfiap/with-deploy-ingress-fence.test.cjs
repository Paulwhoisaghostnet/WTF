'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { fenceDeployIngress, fenceHeader } = require('./fence-deploy-ingress.cjs');

const roomCode = '11111111-1111-4111-8111-111111111111';
const config = {
  apps: { http: { servers: { public: { routes: [{
    match: [{ host: ['wtfos.app'] }], handle: [{ handler: 'reverse_proxy', upstreams: [{ dial: 'app:3000' }] }],
  }] } } } },
};
const originalConfig = JSON.stringify(config, null, 2) + '\n';

// Invoked by an executable inside the fixture PATH. This process implements
// only the Docker calls needed by the production fence wrapper.
function fakeDocker() {
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const path = require('node:path');
  const args = process.argv.slice(2);
  const { FENCE_RUN_LOG, FENCE_CONFIG, FENCE_LEGACY, FENCE_CREATE_AT_RELOAD_PATH } = process.env;
  const record = kind => fs.appendFileSync(FENCE_RUN_LOG, kind + '\n');
  const [command] = args;
  if (command === 'ps') {
    assert.deepEqual(args.slice(1), ['--all', '--format', '{{.Names}}']);
    record('list-containers');
    return process.stdout.write('wtf-app-app-1\nwtf-app-caddy-1\n');
  }
  if (command === 'inspect') {
    assert.deepEqual(args.slice(1, 4), ['--type', 'container', '--format']);
    if (args[4].includes('/app/wtfiap-data')) {
      assert.equal(args[5], 'wtf-app-app-1');
      record('inspect-legacy');
      return process.stdout.write(FENCE_LEGACY + '\n');
    }
    assert.equal(args[5], 'wtf-app-caddy-1');
    assert(["{{.Id}}", "{{if .State.Running}}{{.Id}}{{end}}"].includes(args[4]));
    record('inspect-proxy');
    return process.stdout.write('fixture-caddy\n');
  }
  assert.equal(command, 'exec');
  if (args[1] === 'fixture-caddy') {
    assert.deepEqual(args.slice(2), ['wget', '-qO-', 'http://127.0.0.1:2019/config/']);
    record('read-config');
    return process.stdout.write(fs.readFileSync(FENCE_CONFIG));
  }
  assert.deepEqual(args.slice(1), ['-i', 'fixture-caddy', 'caddy', 'reload', '--config', '-']);
  const input = fs.readFileSync(0, 'utf8');
  const next = JSON.parse(input);
  const fence = next.apps.http.servers.public.routes[0].handle[0].headers?.['X-Colilseum-Admission-Fence'];
  record(fence ? 'reload-fence' : 'reload-restore');
  fs.writeFileSync(FENCE_CONFIG, input);
  if (fence && FENCE_CREATE_AT_RELOAD_PATH) {
    const arrivingRoom = fs.readFileSync(FENCE_CREATE_AT_RELOAD_PATH, 'utf8');
    const { roomCode } = JSON.parse(arrivingRoom);
    fs.writeFileSync(path.join(FENCE_LEGACY, roomCode + '.json'), arrivingRoom, { mode: 0o600 });
  }
}

function savedRoom(phase) {
  return JSON.stringify({ version: 1, roomCode, revision: 0, createdAtMs: 1, config: { roomType: 'duel' },
    players: [], sessions: {}, match: phase ? JSON.stringify({ matchId: 'party:' + roomCode, roundNumber: 1, revision: 0, phase }) : null });
}

function fixture(t, mode) {
  const scratch = fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'wtfiap-ingress-fence-test-'));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  const dir = name => { const result = path.join(scratch, name); fs.mkdirSync(result); return result; };
  const bin = dir('bin'), scripts = dir('scripts'), rooms = dir('rooms');
  const file = (name, value, mode) => { fs.writeFileSync(name, value, { mode }); return name; };
  const runLog = file(path.join(scratch, 'run.log'), '', 0o600);
  const state = file(path.join(scratch, 'current.json'), originalConfig, 0o600);

  for (const name of ['with-deploy-ingress-fence.sh', 'assert-room-deploy-safe.cjs', 'fence-deploy-ingress.cjs']) {
    fs.copyFileSync(path.join(__dirname, name), path.join(scripts, name));
  }
  const topology = fs.readFileSync(path.join(__dirname, 'check-wtfos-room-deploy.sh'), 'utf8');
  const systemBinding = '/etc/wtf/wtfiap-duel-deploy.json';
  assert(topology.includes(systemBinding));
  // Keep topology discovery in the test's filesystem, never consult /etc.
  file(path.join(scripts, 'check-wtfos-room-deploy.sh'), topology.replace(systemBinding, path.join(scratch, 'binding.json')), 0o600);
  file(path.join(bin, 'docker'), `#!/usr/bin/env node\n${fakeDocker.toString()}\nfakeDocker();\n`, 0o700);
  // On the host, the scanner's default is the production container UID. In
  // the fixture it validates the real unprivileged test owner's files.
  file(path.join(bin, 'node'), String.raw`#!/usr/bin/env bash
if [[ "$1" == */assert-room-deploy-safe.cjs ]]; then
  exec "$FENCE_TEST_NODE" "$@" --owner-uid "$FENCE_TEST_UID"
fi
exec "$FENCE_TEST_NODE" "$@"
`, 0o700);

  const callback = file(path.join(scratch, 'replace.cjs'), `
    const assert = require('node:assert/strict');
    const fs = require('node:fs');
    const { FENCE_CONFIG, FENCE_RUN_LOG, WTFIAP_DEPLOY_FENCE, WTFIAP_DEPLOY_PROTECTED_ROOM } = process.env;
    assert.equal(WTFIAP_DEPLOY_PROTECTED_ROOM, '');
    const active = fs.readFileSync(FENCE_CONFIG, 'utf8');
    assert.equal(active, fs.readFileSync(WTFIAP_DEPLOY_FENCE, 'utf8'));
    assert.deepEqual(JSON.parse(active).apps.http.servers.public.routes[0].handle[0].headers[${JSON.stringify(fenceHeader)}], ['active']);
    fs.appendFileSync(FENCE_RUN_LOG, 'replace-app\\n');
  `, 0o600);
  if (mode === 'active') file(path.join(rooms, roomCode + '.json'), savedRoom('preparation'), 0o600);
  const arriving = mode === 'arriving' ? file(path.join(scratch, 'arriving-room.json'), savedRoom(null), 0o600) : '';
  const result = spawnSync('bash', [path.join(scripts, 'with-deploy-ingress-fence.sh'), '--', process.execPath, callback], {
    encoding: 'utf8',
    env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, TMPDIR: scratch,
      FENCE_RUN_LOG: runLog, FENCE_CONFIG: state, FENCE_LEGACY: rooms, FENCE_TEST_NODE: process.execPath,
      FENCE_TEST_UID: String(process.getuid()), FENCE_CREATE_AT_RELOAD_PATH: arriving },
  });
  const scans = result.stdout.split('\n').filter(Boolean).map(line => JSON.parse(line));
  const operations = fs.readFileSync(runLog, 'utf8').split('\n').filter(Boolean);
  return { result, scans, operations, finalConfig: fs.readFileSync(state, 'utf8') };
}

test('an active match defers before Caddy or the replacement callback are touched', t => {
  const { result, scans, operations, finalConfig } = fixture(t, 'active');
  assert.equal(result.status, 75, result.stderr);
  assert.deepEqual(operations, ['list-containers', 'inspect-legacy']);
  assert.deepEqual(scans.map(scan => scan.status), ['deferred']);
  assert.equal(scans[0].counts.legacy.preparation, 1);
  assert.equal(finalConfig, originalConfig);
});

test('a terminal-only site applies the exact fence before invoking replacement', t => {
  const { result, scans, operations, finalConfig } = fixture(t, 'empty');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(scans.map(scan => scan.status), ['safe', 'safe']);
  assert.deepEqual(operations.filter(operation => operation.startsWith('reload') || operation === 'replace-app'),
    ['reload-fence', 'replace-app', 'reload-restore']);
  assert.equal(finalConfig, originalConfig);
  assert.notDeepEqual(fenceDeployIngress(config), JSON.parse(finalConfig));
});

test('a durably created room at fence time defers and restores the exact prior ingress', t => {
  const { result, scans, operations, finalConfig } = fixture(t, 'arriving');
  assert.equal(result.status, 75, result.stderr);
  assert.deepEqual(scans.map(scan => scan.status), ['safe', 'deferred']);
  assert.equal(scans[1].counts.legacy.waiting, 1);
  assert.deepEqual(operations.filter(operation => operation.startsWith('reload') || operation === 'replace-app'),
    ['reload-fence', 'reload-restore']);
  assert.equal(finalConfig, originalConfig);
});
