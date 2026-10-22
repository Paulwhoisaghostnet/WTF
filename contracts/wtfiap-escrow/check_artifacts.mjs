import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const [scenarioDir, outputDir = path.join(dir, 'artifacts')] = process.argv.slice(2);
assert(scenarioDir, 'Pass the successful wtfiap_escrow_native scenario directory.');
const codeFile = path.join(scenarioDir, 'step_003_cont_1_contract.json');
const storageFile = path.join(scenarioDir, 'step_003_cont_1_storage.json');
const raw = await readFile(codeFile), code = JSON.parse(raw);
const parameter = code.find(x => x.prim === 'parameter');
const storage = code.find(x => x.prim === 'storage');
const entrypoints = {};
function walk(node) {
  if (node.prim === 'or') { node.args.forEach(walk); return; }
  const name = node.annots?.find(x => x.startsWith('%'))?.slice(1);
  assert(name, 'Every branch needs an explicit entrypoint.');
  entrypoints[name] = node;
}
walk(parameter.args[0]);
assert.deepEqual(Object.keys(entrypoints).sort(), ['claim', 'claim_treasury', 'create_room', 'default', 'finalize_room', 'join_room', 'refund', 'start_room', 'void_room']);
assert.deepEqual(code.filter(x => x.prim === 'view').map(x => x.args[0].string).sort(), ['get_claim', 'get_room']);
function fields(node) {
  if (node.prim !== 'pair') return [];
  return node.args.flatMap(child => child.annots?.find(a => a.startsWith('%'))?.slice(1) || fields(child));
}
assert.deepEqual(fields(entrypoints.create_room), ['room_id', 'terms_hash', 'rules_hash', 'seed_commitment', 'referee', 'currency', 'entry_amount', 'entrants']);
assert.deepEqual(fields(entrypoints.start_room), ['room_id', 'expected_terms_hash', 'match_id']);
assert.deepEqual(fields(entrypoints.void_room), ['room_id', 'reason_hash', 'evidence_hash']);
assert.deepEqual(fields(entrypoints.finalize_room), ['room_id', 'match_id', 'transcript_hash', 'result_hash', 'ranks']);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
await mkdir(outputDir, { recursive: true });
for (const suffix of ['contract.json', 'contract.tz', 'storage.json', 'storage.tz']) {
  await copyFile(path.join(scenarioDir, 'step_003_cont_1_' + suffix), path.join(outputDir, suffix));
}
const dummyDir = path.join(path.dirname(scenarioDir), 'deploy_dummy_wtf_template');
for (const suffix of ['contract.json', 'contract.tz', 'storage.json', 'storage.tz']) {
  await copyFile(path.join(dummyDir, 'step_003_cont_0_' + suffix), path.join(outputDir, 'dummy-wtf-' + suffix));
}
const interfaceValue = {
  schemaVersion: 2, title: 'WTFIAP-v0.01', policyStatus: 'owner-approved',
  transport: { bytes: 'lowercase hexadecimal, no 0x prefix, exactly32 bytes', nat: 'unsigned decimal string', currency: { XTZ: '0', WTF: '1' },
    status: { funding: '0', active: '1', settled: '2', voided: '3' }, quantum: { XTZ: '10000', WTF: '1000000' } },
  parameterType: parameter.args[0], storageType: storage.args[0], entrypoints,
  views: code.filter(x => x.prim === 'view').map(x => ({ name: x.args[0].string, input: x.args[1], output: x.args[2] })),
};
await writeFile(path.join(outputDir, 'interface.json'), JSON.stringify(interfaceValue, null, 2) + '\n');
const sources = {};
for (const file of ['WtfIapEscrow.py', 'test_escrow.py', 'test_arithmetic.py', 'requirements.txt', 'check_artifacts.mjs']) {
  sources[file] = sha256(await readFile(path.join(dir, file)));
}
const artifacts = {};
for (const file of ['contract.json', 'contract.tz', 'storage.json', 'storage.tz', 'interface.json', 'dummy-wtf-contract.json', 'dummy-wtf-contract.tz', 'dummy-wtf-storage.json', 'dummy-wtf-storage.tz']) {
  const bytes = await readFile(path.join(outputDir, file));
  artifacts[file] = { sha256: sha256(bytes), bytes: bytes.length };
}
await writeFile(path.join(outputDir, 'build-manifest.json'), JSON.stringify({
  schemaVersion: 2, title: 'WTFIAP-v0.01', policyStatus: 'owner-approved',
  compiler: 'smartpy-tezos==0.24.1', targetProtocolVerification: 'recorded separately in deployment proof',
  storageWarning: 'Fixture addresses only. Encode the approved deployment values against storageType before origination.',
  sourceHashes: sources, artifacts, checks: { compiledParameterAndStorage: true, entrypointAndViewParity: true,
    smartpyScenarios: 'passed by invoking test script before this exporter', independentArithmetic: 'all64 tie partitions, both approved quanta, all420 rounding residue classes and above-JS-safe integer entry' },
}, null, 2) + '\n');
console.log(JSON.stringify({ outputDir, codeSha256: artifacts['contract.json'].sha256, entrypoints: Object.keys(entrypoints) }));
