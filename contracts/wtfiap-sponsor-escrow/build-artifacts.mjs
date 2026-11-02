#!/usr/bin/env node
/** Export a locally tested SmartPy scenario as an immutable candidate artifact. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const scenario = process.argv[2];
assert(scenario, 'Pass a successful sponsor_free_room scenario directory.');
const output = path.join(dir, 'artifacts');
const prefix = path.join(scenario, 'step_001_cont_0_');
const bytes = await readFile(prefix + 'contract.json');
const code = JSON.parse(bytes);
const parameter = code.find(item => item.prim === 'parameter');
const storage = code.find(item => item.prim === 'storage');
assert(parameter && storage, 'Compiled code must declare parameter and storage.');
const entrypoints = {};
function walk(node) {
  if (node.prim === 'or') { node.args.forEach(walk); return; }
  const name = node.annots?.find(item => item.startsWith('%'))?.slice(1);
  assert(name, 'Every entrypoint must have a name.');
  entrypoints[name] = node;
}
walk(parameter.args[0]);
const names = [
  'cancel_room', 'claim_cash', 'claim_lot', 'create_room', 'default',
  'finalize_room', 'fund_sponsor_lot', 'fund_sponsor_wtf',
  'fund_sponsor_xtz', 'join_room', 'refund_entry', 'refund_sponsor_lot',
  'refund_sponsor_wtf', 'refund_sponsor_xtz', 'register_entrant',
  'start_room', 'unregister_entrant', 'void_room',
];
assert.deepEqual(Object.keys(entrypoints).sort(), names.sort());
const views = code.filter(item => item.prim === 'view');
assert.deepEqual(views.map(item => item.args[0].string).sort(),
  ['get_cash_claim', 'get_lot_claim', 'get_room']);
const sha = value => createHash('sha256').update(value).digest('hex');
await mkdir(output, { recursive: true });
for (const name of ['contract.json', 'storage.json']) {
  await copyFile(prefix + name, path.join(output, name));
}
const interfaceValue = {
  schemaVersion: 1,
  title: 'coLILseum sponsored prize escrow candidate',
  policyStatus: 'local-candidate; no network deployment',
  artifactSha256: sha(bytes),
  transport: {
    bytes32: 'lowercase hexadecimal without 0x',
    nat: 'unsigned decimal string',
    mode: { fixed: 0, random: 1, pick: 2 },
    entryCurrency: { FREE: 0, XTZ: 1, WTF: 2 },
    cashCurrency: { XTZ: 0, WTF: 1 },
    status: { funding: 0, active: 1, settled: 2, voided: 3 },
    quantum: { XTZ: '10000', WTF: '1000000' },
  },
  parameterType: parameter.args[0],
  storageType: storage.args[0],
  entrypoints,
  views: views.map(item => ({ name: item.args[0].string,
    input: item.args[1], output: item.args[2] })),
};
await writeFile(path.join(output, 'interface.json'),
  JSON.stringify(interfaceValue, null, 2) + '\n');
const sourceHashes = {};
for (const name of ['WtfIapSponsorEscrow.py', 'DummyPrizeFA2.py',
                    'test_escrow.py', 'test_arithmetic.py',
                    'build-artifacts.mjs']) {
  sourceHashes[name] = sha(await readFile(path.join(dir, name)));
}
const artifacts = {};
for (const name of ['contract.json', 'storage.json', 'interface.json']) {
  const value = await readFile(path.join(output, name));
  artifacts[name] = { sha256: sha(value), bytes: value.length };
}
await writeFile(path.join(output, 'build-manifest.json'), JSON.stringify({
  schemaVersion: 1, compiler: 'smartpy-tezos==0.24.1',
  policyStatus: 'local-candidate; no network deployment',
  sourceHashes, artifacts,
  checks: { smartpyScenarios: 'run separately before export',
    arithmetic: 'run separately before export',
    entrypointAndViewParity: true,
    storageWarning: 'Fixture addresses. Encode network-specific constructor values before origination.' },
}, null, 2) + '\n');
console.log(JSON.stringify({artifact: path.join(output, 'contract.json'),
  sha256: artifacts['contract.json'].sha256, entrypoints: names}));
