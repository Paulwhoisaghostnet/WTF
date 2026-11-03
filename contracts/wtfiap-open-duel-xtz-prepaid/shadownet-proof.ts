#!/usr/bin/env tsx
/** Synthetic Shadownet prepaid-credit duel custody proof. Never claims to prove a player match. */
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
const roomIds = { cancel: hash('coLILseum-prepaid-open-duel-shadownet-cancel-2026-11-03'),
  settle: hash('coLILseum-prepaid-open-duel-shadownet-settle-2026-11-03'),
  void: hash('coLILseum-prepaid-open-duel-shadownet-void-2026-11-03') };
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
await step('credit/topup', guestId, 'deposit_credit', guest.wallet.address, '30000');
for (const [scenario, roomId] of Object.entries(roomIds)) {
  const params = offer(roomId);
  if (!execute && !await room(roomId)) { console.log(JSON.stringify({ scenario, roomId, contract: deploy.escrowContract,
    status: 'read-only-ready', host: host.wallet.address, guestAndReferee: guest.wallet.address })); continue; }
  await step(scenario + '/create', hostId, 'create_offer', params, '510000');
  await step(scenario + '/authorize', guestId, 'authorize_guest', { room_id: roomId, guest: guest.wallet.address });
  await step(scenario + '/accept', guestId, 'accept_prepaid', { room_id: roomId, expected_terms_hash: params.terms_hash });
  if (scenario === 'cancel') {
    await step(scenario + '/cancel', hostId, 'cancel_offer', roomId);
    assert.equal((await room(roomId))?.status.toFixed(), '4');
    const block = journal.operations['cancel/cancel'].inclusion.blockHash;
    const after: any = await readonly.contract.getStorage(deploy.escrowContract, undefined, block);
    assert.equal((await after.credit.get(guest.wallet.address, block)).toFixed(), '30000');
    continue;
  }
  await step(scenario + '/start', guestId, 'start_room', { room_id: roomId, expected_terms_hash: params.terms_hash,
    match_id: hash('match:' + roomId) });
  if (scenario === 'void') {
    await step(scenario + '/void', guestId, 'void_room', { room_id: roomId,
      reason_hash: hash('technical-failure:' + roomId), evidence_hash: hash('synthetic-proof:' + roomId) });
    await step(scenario + '/refund-guest', guestId, 'refund', roomId);
    await step(scenario + '/refund-host', hostId, 'refund', roomId);
    const after: any = await readonly.contract.getStorage(deploy.escrowContract, undefined, 'head~2');
    assert.equal((await after.credit.get(guest.wallet.address, 'head~2')).toFixed(), '20000');
    assert.equal(after.total_credit.toFixed(), '20000');
    continue;
  }
  await step(scenario + '/finalize', guestId, 'finalize_room', { room_id: roomId, match_id: hash('match:' + roomId),
    transcript_hash: hash('synthetic-transcript:' + roomId), result_hash: hash('synthetic-result:' + roomId),
    ranks: [{ player: guest.wallet.address, rank: '1', group_size: '1' },
      { player: host.wallet.address, rank: '2', group_size: '1' }] });
  const receipt = journal.operations[scenario + '/finalize'];
  const settledBlock: any = await readonly.rpc.getBlock({ block: receipt.inclusion.blockHash });
  const settledOperation: any = settledBlock.operations.flat().find((item: any) => item.hash === receipt.operationHash);
  assert(settledOperation, 'Finalized settlement operation is missing.');
  const transfers = settledOperation.contents.flatMap((content: any) =>
    (content.metadata?.internal_operation_results || []).filter((item: any) => item.kind === 'transaction')
      .map((item: any) => ({ destination: item.destination, amount: item.amount, status: item.result.status })));
  assert.deepEqual(transfers.sort((a: any, b: any) => a.destination.localeCompare(b.destination)), [
    { destination: deploy.treasuryAddress, amount: fee, status: 'applied' },
    { destination: guest.wallet.address, amount: '20000', status: 'applied' },
  ].sort((a, b) => a.destination.localeCompare(b.destination)));
  const final = await room(roomId);
  assert.equal(final.status.toFixed(), '2'); assert.equal(final.held.toFixed(), '0');
  assert.equal(final.fees_paid.toFixed(), fee);
  assert.equal(final.paid_out.toFixed(), '20000'); assert.equal(final.payout_mode.toFixed(), '2');
  const current: any = await readonly.contract.getStorage(deploy.escrowContract, undefined, 'head~2');
  const claim: any = await current.claims.get({ 0: roomId, 1: guest.wallet.address }, 'head~2');
  assert.equal(claim.amount.toFixed(), '20000'); assert.equal(claim.claimed, true);
  assert.equal((await current.credit.get(guest.wallet.address, 'head~2')).toFixed(), '20000');
  assert.equal(current.total_credit.toFixed(), '20000');
}
if (execute) {
  const finalStorage: any = await readonly.contract.getStorage(deploy.escrowContract, undefined, 'head~2');
  const credit = (await finalStorage.credit.get(guest.wallet.address, 'head~2')).toFixed();
  const balance = (await readonly.tz.getBalance(deploy.escrowContract)).toFixed();
  assert.equal(credit, '20000');
  assert.equal(finalStorage.total_credit.toFixed(), credit);
  assert.equal(balance, credit, 'Every outstanding prepaid mutez must remain backed by XTZ in this settled test escrow.');
  journal.finalConservation = { balanceMutez: balance, totalCreditMutez: credit };
  await save();
}
console.log(JSON.stringify({ status: execute ? 'applied' : 'read-only', contract: deploy.escrowContract,
  roomIds, journal: file }));
