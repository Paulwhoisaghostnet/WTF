#!/usr/bin/env tsx
/** Synthetic Shadownet custody proof. Never uses a browser or claims to prove game results. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { TezosToolkit } from '@taquito/taquito';
import { hashTypedScript } from '../wtfiap-escrow/script-identity';
import { buildToolkit, signerEnv } from '../../scripts/pasta-protocol/shadownet-proof-kit';
import * as keyringNamespace from '../../extensions/wtf-operator-signer/src/keyring';

const deploy = JSON.parse(await readFile(new URL('./shadownet-deployment.json', import.meta.url), 'utf8'));
const keyringModule = 'default' in keyringNamespace ?
  (keyringNamespace as typeof keyringNamespace & { default: typeof keyringNamespace }).default : keyringNamespace;
const execute = process.argv.includes('--execute');
const positional = process.argv.slice(2).filter(value => value !== '--execute');
assert.equal(positional.length, 1, 'Usage: tsx shadownet-proof.ts <new-proof-directory> [--execute]');
const dir = path.resolve(positional[0]), file = path.join(dir, 'journal.json');
const rpc = 'https://tezos-shadownet.octez.io/';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const roomIds = { cancel: hash('coLILseum-open-duel-shadownet-cancel-2026-10-24'),
  settle: hash('coLILseum-open-duel-shadownet-settle-2026-10-24') };
const entry = '10000', fee = '500000', hostId = 'e2e-bert', guestId = 'wtf-os-root';
const keyring = new keyringModule.PlatformWalletKeyring(await signerEnv(rpc));
const host = await keyring.getSigner(hostId), guest = await keyring.getSigner(guestId);
assert.equal(host.wallet.address, deploy.source);
assert.equal(guest.wallet.address, 'tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM');
assert.equal(host.wallet.network, 'shadownet'); assert.equal(guest.wallet.network, 'shadownet');
const actors = { [hostId]: { address: host.wallet.address, tezos: buildToolkit(host.signer, rpc) },
  [guestId]: { address: guest.wallet.address, tezos: buildToolkit(guest.signer, rpc) } };
const readonly = new TezosToolkit(rpc);
assert.equal(await readonly.rpc.getChainId(), deploy.chainId);
const script = await readonly.rpc.getScript(deploy.escrowContract, { block: 'head~2' });
assert.equal(hashTypedScript(script.code), deploy.canonicalTypedScriptSha256);
const storage: any = await readonly.contract.getStorage(deploy.escrowContract, script, 'head~2');
assert.equal(String(storage.treasury_address), deploy.treasuryAddress);
assert.equal(storage.house_fee_mutez.toFixed(), fee);
assert.equal(storage.xtz_quantum.toFixed(), entry);
await mkdir(dir, { recursive: true });
let journal: any;
try { journal = JSON.parse(await readFile(file, 'utf8')); }
catch (error: any) { if (error.code !== 'ENOENT') throw error;
  journal = { schemaVersion: 1, network: 'shadownet', contract: deploy.escrowContract,
    scriptHash: deploy.canonicalTypedScriptSha256, roomIds, operations: {} }; }
assert.equal(journal.contract, deploy.escrowContract);
assert.equal(journal.scriptHash, deploy.canonicalTypedScriptSha256);
assert.deepEqual(journal.roomIds, roomIds);
async function save() {
  const temp = file + '.tmp'; const handle = await open(temp, 'w', 0o600);
  try { await handle.writeFile(JSON.stringify(journal, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  const { rename } = await import('node:fs/promises'); await rename(temp, file);
  const parent = await open(dir, 'r'); try { await parent.sync(); } finally { await parent.close(); }
}
async function room(roomId: string): Promise<any | null> {
  const current: any = await readonly.contract.getStorage(deploy.escrowContract, undefined, 'head~2');
  return await current.rooms.get(roomId, 'head~2') || null;
}
async function proveOperation(opHash: string, source: string, entrypoint: string, amount: string, firstLevel: number) {
  const finalHeader = await readonly.rpc.getBlockHeader({ block: 'head~2' });
  for (let level = firstLevel; level <= finalHeader.level; level++) {
    const block = await readonly.rpc.getBlock({ block: String(level) });
    const operation: any = block.operations.flat().find((item: any) => item.hash === opHash);
    if (!operation) continue;
    const roots = operation.contents.filter((item: any) => item.kind === 'transaction' && item.source === source &&
      item.destination === deploy.escrowContract && item.parameters?.entrypoint === entrypoint && item.amount === amount);
    assert.equal(roots.length, 1, 'Operation must contain one exact signed escrow transaction.');
    for (const content of operation.contents) {
      assert.equal(content.metadata?.operation_result?.status, 'applied');
      for (const internal of content.metadata?.internal_operation_results || []) assert.equal(internal.result.status, 'applied');
    }
    return { blockHash: block.hash, level };
  }
  throw new Error('Operation is not finalized. Preserve journal and resume without resending.');
}
async function step(key: string, actorId: typeof hostId | typeof guestId, entrypoint: string, args: any,
  amount = '0') {
  const actor = actors[actorId], contract = await actor.tezos.contract.at(deploy.escrowContract);
  const method = (contract.methodsObject as any)[entrypoint];
  assert(method, `Missing escrow entrypoint ${entrypoint}`);
  const transfer = method(args).toTransferParams({ amount: Number(amount), mutez: true });
  let record = journal.operations[key];
  const intent = { actor: actor.address, entrypoint, amount, parameters: transfer.parameter.value };
  if (record) {
    assert.deepEqual({ actor: record.actor, entrypoint: record.entrypoint, amount: record.amount,
      parameters: record.parameters }, intent);
    if (record.status === 'applied') return;
    assert(record.operationHash, 'Unknown prepared submission; inspect chain before any retry.');
  } else {
    if (!execute) { console.log(JSON.stringify({ step: key, mode: 'read-only', intent })); return; }
    const estimate = await actor.tezos.estimate.transfer(transfer);
    const balance = BigInt((await actor.tezos.tz.getBalance(actor.address)).toFixed());
    const required = BigInt(amount) + BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez);
    assert(balance >= required, `${actorId} needs measured ${required} mutez; balance ${balance}.`);
    record = { ...intent, status: 'prepared', preparedLevel: (await actor.tezos.rpc.getBlockHeader()).level,
      estimate: { fee: String(estimate.suggestedFeeMutez), gas: String(estimate.gasLimit), storage: String(estimate.storageLimit),
        burn: String(estimate.burnFeeMutez), balance: String(balance) } };
    journal.operations[key] = record; await save();
    const op = await actor.tezos.contract.transfer({ ...transfer, fee: estimate.suggestedFeeMutez,
      gasLimit: estimate.gasLimit, storageLimit: estimate.storageLimit });
    record.operationHash = op.hash; record.status = 'injected'; await save();
    await op.confirmation(3);
  }
  record.inclusion = await proveOperation(record.operationHash, actor.address, entrypoint, amount, record.preparedLevel);
  record.status = 'applied'; await save();
}
const offer = (roomId: string) => ({ room_id: roomId, terms_hash: hash('terms:' + roomId),
  rules_hash: hash('rules:' + roomId), seed_commitment: hash('seed:' + roomId),
  referee: guest.wallet.address, entry_amount: entry });
for (const [scenario, roomId] of Object.entries(roomIds)) {
  const params = offer(roomId);
  if (!execute && !await room(roomId)) { console.log(JSON.stringify({ scenario, roomId, contract: deploy.escrowContract,
    status: 'read-only-ready', host: host.wallet.address, guestAndReferee: guest.wallet.address })); continue; }
  await step(scenario + '/create', hostId, 'create_offer', params, '510000');
  if (scenario === 'cancel') {
    await step(scenario + '/cancel', hostId, 'cancel_offer', roomId);
    assert.equal((await room(roomId))?.status.toFixed(), '4');
    continue;
  }
  await step(scenario + '/authorize', guestId, 'authorize_guest', { room_id: roomId, guest: guest.wallet.address });
  await step(scenario + '/accept', guestId, 'accept_offer', { room_id: roomId, expected_terms_hash: params.terms_hash }, entry);
  await step(scenario + '/start', guestId, 'start_room', { room_id: roomId, expected_terms_hash: params.terms_hash,
    match_id: hash('match:' + roomId) });
  await step(scenario + '/finalize', guestId, 'finalize_room', { room_id: roomId, match_id: hash('match:' + roomId),
    transcript_hash: hash('synthetic-transcript:' + roomId), result_hash: hash('synthetic-result:' + roomId),
    ranks: [{ player: host.wallet.address, rank: '1', group_size: '1' },
      { player: guest.wallet.address, rank: '2', group_size: '1' }] });
  await step(scenario + '/claim', hostId, 'claim', roomId);
  const final = await room(roomId);
  assert.equal(final.status.toFixed(), '2'); assert.equal(final.held.toFixed(), '0');
  assert.equal(final.fees_paid.toFixed(), fee);
}
console.log(JSON.stringify({ status: execute ? 'applied' : 'read-only', contract: deploy.escrowContract,
  roomIds, journal: file }));
