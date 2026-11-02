#!/usr/bin/env node
/** Explicit Shadownet-only origination with an immutable, reconcilable intent. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MichelsonMap, TezosToolkit } from '@taquito/taquito';
import { Schema } from '@taquito/michelson-encoder';
import { require as tsxRequire } from 'tsx/cjs/api';
import { buildPuppetKeyringEnv } from '../../tests/e2e/puppets/runtime.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const execute = args.includes('--execute');
const positional = args.filter(value => value !== '--execute');
assert.equal(positional.length, 2,
  'Usage: node deploy-shadownet.mjs <public-config.json> <proof-directory> [--execute]');
const [configPath, proofDirectory] = positional;
const config = JSON.parse(await readFile(configPath, 'utf8'));
assert.equal(config.network, 'shadownet', 'This script can only originate on Shadownet.');
assert.equal(config.rpcUrl, 'https://tezos-shadownet.octez.io/',
  'Use the project Shadownet primary RPC for this proof.');
assert.equal(config.source, config.roomCreator,
  'The authorized creator and origination source must match.');
assert.equal(String(config.xtzPaidRoomHouseFee), '0',
  'This Shadownet fixture must not inherit the Mainnet house fee.');
const chainId = 'NetXsqzbfFenSTS';
const walletId = 'wtfiap-shadownet-referee';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const artifact = await readFile(path.join(dir, 'artifacts/contract.json'));
const artifactHash = hash(artifact);
const manifest = JSON.parse(await readFile(path.join(dir, 'artifacts/build-manifest.json'), 'utf8'));
assert.equal(artifactHash, manifest.artifacts['contract.json'].sha256,
  'Compiled contract differs from checked build manifest.');
const code = JSON.parse(artifact);
const schema = new Schema(code.find(node => node.prim === 'storage').args[0]);
const initialStorage = {
  cash_claims: new MichelsonMap(), lot_claims: new MichelsonMap(),
  rooms: new MichelsonMap(), room_creator: config.roomCreator,
  wtf_token_address: config.wtfTokenAddress, wtf_token_id: config.wtfTokenId,
  treasury_address: config.treasuryAddress,
  xtz_paid_room_house_fee: config.xtzPaidRoomHouseFee,
  xtz_quantum: '10000', wtf_quantum: '1000000',
};
assert(schema.Typecheck(initialStorage), 'Initial storage does not match compiled storage type.');
const init = schema.Encode(initialStorage);
const configHash = hash(JSON.stringify({ config, artifactHash, init }));
const journalPath = path.resolve(proofDirectory, 'origination.json');
const { assertTypedScriptIdentity } = (() => {
  const module = tsxRequire('../wtfiap-escrow/script-identity.ts', import.meta.url);
  return module.default || module;
})();

async function save(value) {
  await mkdir(path.dirname(journalPath), { recursive: true });
  const tempPath = journalPath + '.tmp';
  const handle = await open(tempPath, 'w', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  await rename(tempPath, journalPath);
  const directory = await open(path.dirname(journalPath), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
function clean(value) {
  if (value?.constructor?.name === 'BigNumber') return value.toFixed();
  if (value?.constructor?.name === 'MichelsonMap')
    return [...value.entries()].map(([key, item]) => [clean(key), clean(item)]);
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item)]));
  return value;
}
let journal;
try { journal = JSON.parse(await readFile(journalPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
if (journal) assert.equal(journal.configHash, configHash,
  'Saved origination intent is for different contract or storage.');
const tezos = new TezosToolkit(config.rpcUrl);
assert.equal(await tezos.rpc.getChainId(), chainId, 'RPC chain mismatch.');

if (!execute) {
  console.log(JSON.stringify({ mode: 'read-only', network: config.network,
    source: config.source, walletId, artifactSha256: artifactHash,
    savedStatus: journal?.status ?? null, journalPath }));
  process.exit(0);
}
if (journal?.status === 'applied') {
  const script = await tezos.rpc.getScript(journal.contractAddress);
  assert.equal(assertTypedScriptIdentity(script.code, code, 'Onchain code changed.'),
    journal.canonicalCodeSha256);
  console.log(JSON.stringify({ status: 'applied', contractAddress: journal.contractAddress,
    operationHash: journal.operationHash, artifactSha256: artifactHash }));
  process.exit(0);
}
if (journal?.status === 'prepared' && !journal.operationHash)
  throw new Error('Prepared send outcome unknown. Reconcile source counter before any resend.');
if (!journal) journal = { schemaVersion: 1, network: 'shadownet', chainId,
  configHash, artifactSha256: artifactHash, source: config.source,
  walletId, status: 'read-only' };

if (!journal.operationHash) {
  // The existing platform keyring holds the authorized test signer. This script
  // never exports or logs a private key, and it refuses another wallet ID.
  const keyringModule = tsxRequire('../../extensions/wtf-operator-signer/src/keyring.ts', import.meta.url);
  const { PlatformWalletKeyring } = keyringModule.default || keyringModule;
  const keyring = new PlatformWalletKeyring(await buildPuppetKeyringEnv());
  const { wallet, signer } = await keyring.getSigner(walletId);
  assert.equal(wallet.network, 'shadownet');
  assert.equal(wallet.address, config.source);
  assert.equal(await signer.publicKeyHash(), config.source);
  tezos.setProvider({ signer });
  const estimate = await tezos.estimate.originate({ code, init });
  const required = BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez);
  const balance = BigInt((await tezos.tz.getBalance(config.source)).toFixed());
  assert(balance >= required, `Shadownet origination needs ${required} mutez; source has ${balance}.`);
  journal.status = 'prepared';
  journal.preparedLevel = (await tezos.rpc.getBlockHeader()).level;
  journal.sourceCounter = String(await tezos.rpc.getContractCounter(config.source));
  journal.estimate = { suggestedFeeMutez: String(estimate.suggestedFeeMutez),
    burnFeeMutez: String(estimate.burnFeeMutez), gasLimit: String(estimate.gasLimit),
    storageLimit: String(estimate.storageLimit), requiredMutez: String(required),
    sourceBalanceMutez: String(balance) };
  await save(journal);
  const operation = await tezos.contract.originate({ code, init });
  journal.operationHash = operation.hash;
  journal.status = 'injected';
  await save(journal);
  console.log(JSON.stringify({ status: 'injected', operationHash: operation.hash }));
  await operation.confirmation(3);
}

// Confirm inclusion and the two successor blocks directly from the pinned RPC.
const finalizedHead = await tezos.rpc.getBlockHeader({ block: 'head~2' });
let found;
for (let level = journal.preparedLevel; level <= finalizedHead.level; level += 1) {
  const block = await tezos.rpc.getBlock({ block: String(level) });
  const operation = block.operations.flat().find(item => item.hash === journal.operationHash);
  if (operation) { found = { operation, level, blockHash: block.hash }; break; }
}
assert(found, 'Injected origination is not finalized yet; keep journal and resume.');
const originations = found.operation.contents.filter(item => item.kind === 'origination');
assert.equal(originations.length, 1);
const origination = originations[0];
assert.equal(origination.source, config.source);
assert.equal(origination.balance, '0');
assertTypedScriptIdentity(origination.script.code, code, 'Applied origination code differs.');
assert.deepEqual(clean(schema.Execute(origination.script.storage)), clean(schema.Execute(init)),
  'Applied initial storage differs.');
for (const content of found.operation.contents) {
  assert.equal(content.metadata.operation_result.status, 'applied');
  for (const internal of content.metadata.internal_operation_results || [])
    assert.equal(internal.result.status, 'applied');
}
const addresses = origination.metadata.operation_result.originated_contracts;
assert.equal(addresses.length, 1);
const script = await tezos.rpc.getScript(addresses[0], { block: String(finalizedHead.level) });
const canonicalCodeSha256 = assertTypedScriptIdentity(script.code, code,
  'Finalized onchain code differs.');
const storage = clean(schema.Execute(script.storage));
assert.equal(storage.room_creator, config.roomCreator);
assert.equal(storage.wtf_token_address, config.wtfTokenAddress);
assert.equal(storage.wtf_token_id, String(config.wtfTokenId));
assert.equal(storage.treasury_address, config.treasuryAddress);
assert.equal(storage.xtz_paid_room_house_fee, String(config.xtzPaidRoomHouseFee));
assert.equal(storage.xtz_quantum, '10000');
assert.equal(storage.wtf_quantum, '1000000');
journal.status = 'applied';
journal.contractAddress = addresses[0];
journal.canonicalCodeSha256 = canonicalCodeSha256;
journal.inclusion = { level: found.level, blockHash: found.blockHash };
journal.finalized = { level: finalizedHead.level };
journal.storage = storage;
await save(journal);
console.log(JSON.stringify({ status: 'applied', contractAddress: addresses[0],
  operationHash: journal.operationHash, canonicalCodeSha256 }));
