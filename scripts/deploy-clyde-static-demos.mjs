#!/usr/bin/env node
// Temporary static-only publication while the normal app deploy is room-fenced.
// prepare reads the live host but changes only a local, private state directory.
// apply and rollback are explicit operator actions; neither replaces containers.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sites = {
  adrift: { hostname: "adrift.wtfos.app", requiredFiles: ["index.html"] },
  bts: { hostname: "bts.wtfos.app", requiredFiles: ["index.html", "contact/index.html"] },
};
const containerNames = [
  "wtf-app-caddy-1",
  "wtf-app-app-1",
  "wtfiap-duel-authority",
  "wtfiap-duel-gateway",
  "wtfiap-lobby-reader",
];

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    input: options.input,
    env: options.env ?? process.env,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${command} ${args[0] ?? ""} failed: ${String(result.stderr || result.error || "").trim()}`);
  }
  return result.stdout;
}

function ssh(host, command, input) {
  return run("ssh", ["-o", "BatchMode=yes", host, command], { input });
}

function parseArgs(argv) {
  const [action, ...rest] = argv;
  assert(["prepare", "apply", "verify", "rollback"].includes(action),
    "Choose prepare, apply, verify, or rollback.");
  const options = { action, selected: [] };
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    assert(value && value !== "--", `Missing value for ${flag}.`);
    if (flag === "--site") {
      assert(Object.hasOwn(sites, value), `Unknown site: ${value}.`);
      assert(!options.selected.includes(value), `Duplicate site: ${value}.`);
      options.selected.push(value);
    } else if (flag === "--state-dir") options.stateDir = path.resolve(value);
    else if (flag === "--ssh") options.host = value;
    else if (flag === "--source-root") options.sourceRoot = path.resolve(value);
    else throw new Error(`Unknown option: ${flag}.`);
  }
  assert(options.stateDir, "Pass --state-dir outside the repository.");
  const relative = path.relative(repoRoot, options.stateDir);
  assert(relative === ".." || relative.startsWith(`..${path.sep}`),
    "State contains the private live Caddy configuration and must stay outside the repository.");
  if (action === "prepare") {
    assert(options.host, "Pass --ssh for the live host.");
    assert(options.selected.length, "Pass --site bts, --site adrift, or both.");
  } else {
    assert(options.selected.length === 0 && !options.sourceRoot,
      "Site selection and source root are fixed by prepare.");
  }
  if (options.host) assert(/^(?!-)[A-Za-z0-9_.@-]+$/.test(options.host), "Invalid SSH host alias.");
  return options;
}

function snapshotDirectory(source, target, prefix, entries) {
  assert(fs.lstatSync(source).isDirectory(), `Missing regular bundle directory: ${source}`);
  fs.mkdirSync(target, { recursive: true, mode: 0o755 });
  for (const name of fs.readdirSync(source).sort()) {
    const from = path.join(source, name);
    const to = path.join(target, name);
    const stat = fs.lstatSync(from);
    const relative = path.posix.join(prefix, name);
    if (stat.isDirectory()) snapshotDirectory(from, to, relative, entries);
    else if (stat.isFile()) {
      fs.copyFileSync(from, to);
      fs.chmodSync(to, 0o644);
      entries.push({ path: relative, sha256: digest(fs.readFileSync(to)) });
    } else throw new Error(`Non-regular bundle entry: ${from}`);
  }
}

function readTopology(host) {
  const script = String.raw`
const { execFileSync } = require('node:child_process');
const names = ['wtf-app-caddy-1','wtf-app-app-1','wtfiap-duel-authority','wtfiap-duel-gateway','wtfiap-lobby-reader'];
const inspect = JSON.parse(execFileSync('docker', ['inspect','--type','container',...names], { encoding:'utf8' }));
const containers = Object.fromEntries(inspect.map(item => [item.Name.slice(1), {
  id:item.Id, status:item.State.Status,
  mounts:item.Name === '/wtf-app-caddy-1'
    ? Object.fromEntries(item.Mounts.filter(mount => ['/data','/config','/etc/caddy/Caddyfile'].includes(mount.Destination))
        .map(mount => [mount.Destination,mount.Source])) : undefined,
}]));
const ready = JSON.parse(execFileSync('curl', ['-fsS','http://localhost:3000/api/health/ready'], { encoding:'utf8' }));
console.log(JSON.stringify({containers, ready:{status:ready.status, commitRef:ready.version?.commitRef}}));
`;
  const topology = JSON.parse(ssh(host, "node -", script));
  for (const name of containerNames) assert(topology.containers[name]?.status === "running", `${name} is not running.`);
  assert(topology.ready.status === "ready" && topology.ready.commitRef, "The app is not ready.");
  return topology;
}

function readRuntime(host) {
  const runtime = JSON.parse(ssh(host,
    "docker exec wtf-app-caddy-1 wget -qO- http://127.0.0.1:2019/config/"));
  const text = JSON.stringify(runtime);
  assert(text.includes("wtfiap-duel-gateway:3032"), "Protected Duel route is absent.");
  assert(text.includes("wtfiap-lobby-reader:3030"), "Runtime-only lobby route is absent.");
  assert(!text.includes("X-Colilseum-Admission-Fence"), "An ingress fence is active.");
  return runtime;
}

function exactHostRoute(route, hostname) {
  return route.match?.some((matcher) => matcher.host?.length === 1 && matcher.host[0] === hostname);
}

function terminalRouteCouldShadow(route, hostname) {
  if (!route.terminal) return false;
  if (!route.match?.length) return true;
  return route.match.some((matcher) => !matcher.host?.length || matcher.host.some((pattern) =>
    pattern === hostname || pattern === "*" ||
    (pattern.startsWith("*.") && hostname.endsWith(pattern.slice(1)))));
}

function siteBlock(source, site, root) {
  const hostname = sites[site].hostname;
  const escaped = hostname.replace(/\./g, "\\.");
  const block = source.match(new RegExp(`^${escaped} \\{\\n([\\s\\S]*?)^\\}`, "m"));
  assert(block, `Missing exact ${hostname} Caddy site block.`);
  const originalRoot = `root * /srv/demos/${site}`;
  assert(block[1].split(originalRoot).length === 2, `Unexpected ${hostname} root.`);
  if (site === "bts") {
    assert(block[1].includes("rewrite /contact /contact/index.html"),
      "BTS /contact rewrite is absent.");
    assert(block[1].includes("@aspect path_regexp ^/(?:ar/)?[0-9]+x[0-9]+$") &&
      block[1].includes("rewrite @aspect /index.html"), "BTS aspect route rewrite is absent.");
  }
  return `${hostname} {\n${block[1].replace(originalRoot, `root * ${root}`)}}\n`;
}

function findServer(runtime) {
  const matches = Object.entries(runtime.apps?.http?.servers ?? {}).filter(([, server]) =>
    server.routes?.some((route) => route.match?.some((matcher) => matcher.host?.includes("wtfos.app"))));
  assert(matches.length === 1, "Expected one live wtfos.app HTTP server.");
  return matches[0][0];
}

function prepare(options) {
  assert(!fs.existsSync(options.stateDir), "State directory already exists; choose a fresh directory.");
  fs.mkdirSync(options.stateDir, { mode: 0o700 });
  const payloadRoot = path.join(options.stateDir, "payload");
  fs.mkdirSync(payloadRoot, { mode: 0o700 });
  const sourceRoot = options.sourceRoot ?? path.join(repoRoot, "demos");
  options.selected.sort();
  const entries = [];
  for (const site of options.selected) {
    snapshotDirectory(path.join(sourceRoot, site), path.join(payloadRoot, site), site, entries);
    for (const required of sites[site].requiredFiles) {
      const file = path.join(payloadRoot, site, required);
      assert(fs.statSync(file).isFile() && fs.statSync(file).size > 0, `Missing ${site}/${required}.`);
    }
  }
  const releaseId = digest(JSON.stringify(entries));
  const archive = path.join(options.stateDir, "payload.tar");
  run("tar", ["-C", payloadRoot, "-cf", archive, ...options.selected],
    { env: { ...process.env, COPYFILE_DISABLE: "1" } });

  const topology = readTopology(options.host);
  const baseline = readRuntime(options.host);
  const serverName = findServer(baseline);
  const caddyfile = fs.readFileSync(path.join(repoRoot, "Caddyfile"), "utf8");
  const roots = Object.fromEntries(options.selected.map((site) =>
    [site, `/data/clyde-demos/${releaseId}/${site}`]));
  const snippet = options.selected.map((site) => siteBlock(caddyfile, site, roots[site])).join("\n");
  const adapted = JSON.parse(ssh(options.host,
    "docker exec -i wtf-app-caddy-1 caddy adapt --config - --adapter caddyfile 2>/dev/null", snippet));
  const adaptedRoutes = Object.values(adapted.apps?.http?.servers ?? {})
    .flatMap((server) => server.routes ?? []);
  const candidate = structuredClone(baseline);
  const currentRoutes = candidate.apps.http.servers[serverName].routes;
  for (const site of options.selected) {
    const hostname = sites[site].hostname;
    assert(!Object.values(baseline.apps.http.servers).some((server) =>
      server.routes?.some((route) => exactHostRoute(route, hostname))), `${hostname} already has a live route.`);
    assert(!currentRoutes.some((route) => terminalRouteCouldShadow(route, hostname)),
      `${hostname} would be shadowed by an existing terminal Caddy route.`);
    const routes = adaptedRoutes.filter((route) => exactHostRoute(route, hostname));
    assert(routes.length === 1, `Caddy did not adapt exactly one ${hostname} route.`);
    const routeText = JSON.stringify(routes[0]);
    assert(routeText.includes(roots[site]) && routeText.includes('"handler":"file_server"'),
      `${hostname} is not an exact static file route.`);
    if (site === "bts") {
      assert(routeText.includes('"/contact"') && routeText.includes('"uri":"/contact/index.html"'),
        "BTS /contact route is missing after Caddy adaptation.");
      assert(routeText.includes('^/(?:ar/)?[0-9]+x[0-9]+$') &&
        routeText.includes('"uri":"/index.html"'),
        "BTS aspect routes are missing after Caddy adaptation.");
    }
    currentRoutes.push(routes[0]);
  }
  const withoutNewRoutes = structuredClone(candidate);
  withoutNewRoutes.apps.http.servers[serverName].routes.splice(-options.selected.length);
  assert.deepEqual(withoutNewRoutes, baseline, "Candidate changed existing Caddy routes or TLS settings.");

  const manifest = {
    schemaVersion: 1,
    sshHost: options.host,
    sites: options.selected,
    releaseId,
    roots,
    files: entries,
    archiveSha256: digest(fs.readFileSync(archive)),
    baselineSha256: digest(JSON.stringify(baseline)),
    candidateSha256: digest(JSON.stringify(candidate)),
    topology,
  };
  manifest.planId = digest(JSON.stringify(manifest));
  for (const [name, value] of Object.entries({
    "baseline.json": baseline,
    "candidate.json": candidate,
    "manifest.json": manifest,
  })) fs.writeFileSync(path.join(options.stateDir, name), `${JSON.stringify(value)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ mode: "prepared-read-only", stateDir: options.stateDir,
    planId: manifest.planId, sites: manifest.sites, releaseId, baselineCommit: topology.ready.commitRef }, null, 2));
}

const remoteWorker = String.raw`
const assert = require('node:assert/strict');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const planId = process.argv[2], action = process.argv[3];
assert(/^[0-9a-f]{64}$/.test(planId) && ['apply','verify','rollback'].includes(action));
const state = path.join(os.homedir(), '.local/state/wtfos/clyde-static', planId);
const read = name => JSON.parse(fs.readFileSync(path.join(state, name), 'utf8'));
const manifest = read('manifest.json');
const baseline = read('baseline.json');
const candidate = read('candidate.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const checkPlan = structuredClone(manifest); delete checkPlan.planId;
assert.equal(hash(JSON.stringify(checkPlan)), planId, 'Plan manifest changed.');
assert.equal(hash(JSON.stringify(baseline)), manifest.baselineSha256, 'Baseline changed.');
assert.equal(hash(JSON.stringify(candidate)), manifest.candidateSha256, 'Candidate changed.');
assert.equal(hash(fs.readFileSync(path.join(state, 'payload.tar'))), manifest.archiveSha256, 'Bundle archive changed.');
const names = ['wtf-app-caddy-1','wtf-app-app-1','wtfiap-duel-authority','wtfiap-duel-gateway','wtfiap-lobby-reader'];
function docker(args, input) {
  const result = spawnSync('docker', ['exec', ...(input ? ['-i'] : []), 'wtf-app-caddy-1', ...args],
    { input, encoding: null });
  if (result.error || result.status !== 0) throw Error('Docker Caddy command failed: ' + args[0]);
  return result.stdout;
}
function exists(location) {
  const result = spawnSync('docker', ['exec','wtf-app-caddy-1','test','-e',location]);
  if (result.error || ![0,1].includes(result.status)) throw Error('Could not inspect Caddy data path.');
  return result.status === 0;
}
function currentConfig() { return JSON.parse(docker(['wget','-qO-','http://127.0.0.1:2019/config/']).toString()); }
function savedConfig() { return JSON.parse(docker(['cat','/config/caddy/autosave.json']).toString()); }
function topology() {
  const inspect = JSON.parse(execFileSync('docker', ['inspect','--type','container',...names], { encoding:'utf8' }));
  const containers = Object.fromEntries(inspect.map(item => [item.Name.slice(1), {
    id:item.Id, status:item.State.Status,
    mounts:item.Name === '/wtf-app-caddy-1'
      ? Object.fromEntries(item.Mounts.filter(mount => ['/data','/config','/etc/caddy/Caddyfile'].includes(mount.Destination))
          .map(mount => [mount.Destination,mount.Source])) : undefined,
  }]));
  const ready = JSON.parse(execFileSync('curl', ['-fsS','http://localhost:3000/api/health/ready'], { encoding:'utf8' }));
  return {containers, ready:{status:ready.status, commitRef:ready.version?.commitRef}};
}
function assertTopology() {
  const actual = topology();
  assert.deepEqual(actual, manifest.topology, 'App, Duel, lobby, or Caddy identity/readiness changed.');
}
function verifyFiles(root) {
  const listed = docker(['find',root,'-type','f','-print0']).toString().split('\0').filter(Boolean).sort();
  const expected = manifest.files.map(entry => root + '/' + entry.path).sort();
  assert.deepEqual(listed, expected, 'Staged files differ from the verified bundle.');
  for (const entry of manifest.files) {
    const output = docker(['sha256sum',root + '/' + entry.path]).toString();
    assert.equal(output.slice(0,64), entry.sha256, 'Staged file hash mismatch: ' + entry.path);
  }
}
function stageFiles() {
  const base = '/data/clyde-demos';
  const finalRoot = base + '/' + manifest.releaseId;
  if (exists(finalRoot)) { verifyFiles(finalRoot); return; }
  docker(['mkdir','-p',base]);
  const stage = docker(['mktemp','-d',base + '/.stage.XXXXXXXX']).toString().trim();
  assert(/^\/data\/clyde-demos\/\.stage\.[A-Za-z0-9]+$/.test(stage), 'Unsafe stage path.');
  docker(['tar','-xf','-','-C',stage], fs.readFileSync(path.join(state, 'payload.tar')));
  verifyFiles(stage);
  assert(!exists(finalRoot), 'Another process staged this release.');
  docker(['mv',stage,finalRoot]);
  verifyFiles(finalRoot);
}
function checkHttp(host, route, origin) {
  const url = 'https://' + host + route;
  const args = ['-sS','-o','/dev/null','-w','%{http_code} %{content_type} %{ssl_verify_result}'];
  if (origin) args.push('--resolve',host + ':443:127.0.0.1');
  args.push(url);
  const response = execFileSync('curl',args,{encoding:'utf8'}).trim().split(/\s+/);
  assert.equal(response[0], '200', url + (origin ? ' origin' : ' Cloudflare') + ' did not return 200.');
  assert(response[1]?.startsWith('text/html'), url + ' did not serve HTML.');
  assert.equal(response[2], '0', url + ' failed TLS verification.');
}
function verifyHosts() {
  for (const site of manifest.sites) {
    const host = site === 'bts' ? 'bts.wtfos.app' : 'adrift.wtfos.app';
    for (const route of (site === 'bts' ? ['/','/contact','/ar/9x16','/4x5','/2x3'] : ['/'])) {
      checkHttp(host, route, true);
      checkHttp(host, route, false);
    }
  }
}
function verifyCandidate() {
  assertTopology();
  assert.deepEqual(currentConfig(), candidate, 'Runtime Caddy config differs from the candidate.');
  assert.deepEqual(savedConfig(), candidate, 'Caddy autosave differs from the candidate.');
  verifyFiles('/data/clyde-demos/' + manifest.releaseId);
  verifyHosts();
  assertTopology();
  console.log(JSON.stringify({status:'verified',sites:manifest.sites,releaseId:manifest.releaseId,
    appCommit:manifest.topology.ready.commitRef}));
}
if (action === 'apply') {
  assertTopology();
  assert.deepEqual(currentConfig(), baseline, 'Live Caddy config changed after prepare; prepare again.');
  stageFiles();
  docker(['caddy','validate','--config','-'], Buffer.from(JSON.stringify(candidate)));
  assertTopology();
  assert.deepEqual(currentConfig(), baseline, 'Live Caddy config changed before reload.');
  docker(['caddy','reload','--config','-'], Buffer.from(JSON.stringify(candidate)));
  assertTopology();
  assert.deepEqual(currentConfig(), candidate, 'Reload returned but runtime Caddy config differs.');
  assert.deepEqual(savedConfig(), candidate, 'Reload returned but Caddy autosave differs.');
  verifyFiles('/data/clyde-demos/' + manifest.releaseId);
  try {
    verifyHosts();
    console.log(JSON.stringify({status:'verified',sites:manifest.sites,releaseId:manifest.releaseId,
      appCommit:manifest.topology.ready.commitRef}));
  } catch (error) {
    console.log(JSON.stringify({status:'active_host_verification_pending',sites:manifest.sites,
      releaseId:manifest.releaseId,detail:String(error.message || error)}));
  }
} else if (action === 'verify') {
  verifyCandidate();
} else {
  assertTopology();
  const active = currentConfig();
  if (require('node:util').isDeepStrictEqual(active, baseline)) {
    console.log('Baseline Caddy configuration is already active.');
  } else {
    assert.deepEqual(active, candidate, 'Runtime Caddy config changed; automatic rollback refused.');
    docker(['caddy','reload','--config','-'], Buffer.from(JSON.stringify(baseline)));
    assert.deepEqual(currentConfig(), baseline, 'Rollback did not restore baseline Caddy config.');
    assert.deepEqual(savedConfig(), baseline, 'Rollback did not restore Caddy autosave.');
    assertTopology();
    console.log('Baseline Caddy configuration restored; staged bundle remains inert in /data.');
  }
}
`;

function usePlan(options) {
  const manifest = JSON.parse(fs.readFileSync(path.join(options.stateDir, "manifest.json"), "utf8"));
  assert(manifest.schemaVersion === 1 && /^[0-9a-f]{64}$/.test(manifest.planId), "Invalid plan.");
  const host = options.host ?? manifest.sshHost;
  assert(/^(?!-)[A-Za-z0-9_.@-]+$/.test(host), "Invalid SSH host alias in plan.");
  assert(host === manifest.sshHost, "Plan is bound to its prepared SSH host.");
  const remoteRelative = `.local/state/wtfos/clyde-static/${manifest.planId}`;
  if (options.action === "apply") {
    ssh(host, `install -d -m 0700 "$HOME/${remoteRelative}"`);
    run("scp", ["-q", ...["manifest.json", "baseline.json", "candidate.json", "payload.tar"]
      .map((name) => path.join(options.stateDir, name)), `${host}:${remoteRelative}/`]);
    ssh(host, `chmod 0600 "$HOME/${remoteRelative}"/*`);
  }
  // The host's ordinary deployment uses this same lock. A busy lock aborts.
  const command = `flock -n /tmp/wtf-app-deploy.lock node - ${manifest.planId} ${options.action}`;
  console.log(ssh(host, command, remoteWorker).trim());
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.action === "prepare") prepare(options);
  else usePlan(options);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
