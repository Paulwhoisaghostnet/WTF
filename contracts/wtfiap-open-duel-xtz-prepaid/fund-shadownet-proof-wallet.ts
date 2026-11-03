#!/usr/bin/env tsx
/** Journaled Shadownet-only operating XTZ for the final synthetic void proof. */
import assert from 'node:assert/strict';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { TezosToolkit } from '@taquito/taquito';
import { buildToolkit, signerEnv } from '../../scripts/pasta-protocol/shadownet-proof-kit';
import * as keyringNamespace from '../../extensions/wtf-operator-signer/src/keyring';

const keyringModule = 'default' in keyringNamespace ?
  (keyringNamespace as typeof keyringNamespace & { default: typeof keyringNamespace }).default : keyringNamespace;
const execute = process.argv.includes('--execute');
const positional = process.argv.slice(2).filter(value => value !== '--execute');
assert.equal(positional.length, 1, 'Usage: tsx fund-shadownet-proof-wallet.ts <proof-directory> [--execute]');
const dir = path.resolve(positional[0]), file = path.join(dir, 'operating-transfer.json');
const rpc = 'https://tezos-shadownet.octez.io/', chainId = 'NetXsqzbfFenSTS';
const source = 'tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM';
const destination = 'tz1RWvytxhPa5a46c5mbv4omzrU6rMJG8wTZ';
// The void/create preflight had a measured 71,780-mutez storage shortfall;
// 100,000 mutez also covers its send and the following host refund fee.
const amountMutez = '100000';
const keyring = new keyringModule.PlatformWalletKeyring(await signerEnv(rpc));
const actor = await keyring.getSigner('wtf-os-root');
assert.equal(actor.wallet.address, source); assert.equal(actor.wallet.network, 'shadownet');
const tezos = buildToolkit(actor.signer, rpc), readonly = new TezosToolkit(rpc);
assert.equal(await tezos.rpc.getChainId(), chainId);
assert.equal(await readonly.rpc.getChainId(), chainId);
await mkdir(dir, { recursive: true });
let journal: any;
try { journal = JSON.parse(await readFile(file, 'utf8')); }
catch (error: any) { if (error.code !== 'ENOENT') throw error; }
const intent = { schemaVersion: 1, network: 'shadownet', chainId, source, destination, amountMutez };
if (journal) for (const [key, value] of Object.entries(intent)) assert.equal(journal[key], value);
async function save() {
  const fd = await open(file + '.tmp', 'w', 0o600);
  try { await fd.writeFile(JSON.stringify(journal, null, 2) + '\n'); await fd.sync(); }
  finally { await fd.close(); }
  await rename(file + '.tmp', file);
  const parent = await open(dir, 'r'); try { await parent.sync(); } finally { await parent.close(); }
}
if (!journal) {
  const estimate = await tezos.estimate.transfer({ to: destination, amount: Number(amountMutez), mutez: true });
  const sourceBalance = BigInt((await readonly.tz.getBalance(source)).toFixed());
  const hostBalance = BigInt((await readonly.tz.getBalance(destination)).toFixed());
  const required = BigInt(amountMutez) + BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez);
  assert(sourceBalance >= required, 'Proof sender cannot fund the measured test transfer.');
  assert(hostBalance + BigInt(amountMutez) >= 510000n + 86750n + 2000n,
    'Proof host would still lack the measured void/create stake, storage, and refund fee.');
  journal = { ...intent, status: 'read-only', estimate: { suggestedFeeMutez: String(estimate.suggestedFeeMutez),
    burnFeeMutez: String(estimate.burnFeeMutez), sourceBalanceMutez: String(sourceBalance),
    hostBalanceMutez: String(hostBalance), requiredMutez: String(required) } };
  await save();
}
if (!execute) { console.log(JSON.stringify(journal)); process.exit(0); }
if (journal.status === 'prepared' && !journal.operationHash)
  throw new Error('Unknown test transfer send outcome. Inspect chain before retrying.');
if (!journal.operationHash) {
  journal.status = 'prepared'; journal.preparedLevel = (await readonly.rpc.getBlockHeader()).level;
  await save();
  const operation = await tezos.contract.transfer({ to: destination, amount: Number(amountMutez), mutez: true });
  journal.operationHash = operation.hash; journal.status = 'injected'; await save();
  await operation.confirmation(3);
}
if (journal.status !== 'applied') {
  const finalized = await readonly.rpc.getBlockHeader({ block: 'head~2' });
  let found: any;
  for (let level = journal.preparedLevel; level <= finalized.level; level++) {
    const block = await readonly.rpc.getBlock({ block: String(level) });
    const operation: any = block.operations.flat().find((item: any) => item.hash === journal.operationHash);
    if (operation) { found = { block, operation }; break; }
  }
  assert(found, 'Transfer not finalized. Preserve journal and resume without resending.');
  const exact = found.operation.contents.filter((item: any) => item.kind === 'transaction' &&
    item.source === source && item.destination === destination && item.amount === amountMutez);
  assert.equal(exact.length, 1);
  assert.equal(exact[0].metadata.operation_result.status, 'applied');
  journal.status = 'applied'; journal.inclusion = { blockHash: found.block.hash, level: found.block.header.level };
  await save();
}
console.log(JSON.stringify({ status: journal.status, operationHash: journal.operationHash,
  inclusion: journal.inclusion, source, destination, amountMutez }));
