#!/usr/bin/env tsx
/** Read-only-first, journaled Mainnet v3 custody proof. Never proves a player match. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { TezosToolkit } from '@taquito/taquito';
import { hashTypedScript } from '../wtfiap-escrow/script-identity';
import { stable } from '../wtfiap-escrow/shadownet-proof';
import { buildToolkit, signerEnv } from '../../scripts/pasta-protocol/shadownet-proof-kit';
import * as keyringNamespace from '../../extensions/wtf-operator-signer/src/keyring';

const keyringModule = 'default' in keyringNamespace ?
  (keyringNamespace as typeof keyringNamespace & { default: typeof keyringNamespace }).default : keyringNamespace;
const execute = process.argv.includes('--execute');
const positional = process.argv.slice(2).filter(value => value !== '--execute');
assert.equal(positional.length, 1, 'Usage: tsx mainnet-proof.ts <new-proof-directory> [--execute]');
const deploy = JSON.parse(await readFile(new URL('./mainnet-deployment.json', import.meta.url), 'utf8'));
assert.equal(deploy.status, 'applied'); assert.equal(deploy.network, 'mainnet');
assert.equal(deploy.chainId, 'NetXdQprcVkpaWU');
assert.equal(deploy.source, 'tz1hNbUXWdjPpUuGK3tMWM8uSJzBBGonWB5u');
assert.equal(deploy.treasuryAddress, 'tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt');
const host = deploy.source, guest = 'tz1W4pW7zEsovK5tQ3HqfqQAcWifRYeYAUTo';
const preflight = JSON.parse(await readFile(new URL('./preflight-mainnet.json', import.meta.url), 'utf8'));
assert.equal(preflight.network, 'mainnet');
assert.equal(preflight.expectedChainId, deploy.chainId);
const fallbackRpc = 'https://tcinfra.net/rpc/tezos/mainnet';
const rpcCandidates = [...new Set([preflight.rpcUrl, fallbackRpc])];
async function verifiedRpc() {
  const failures: string[] = [];
  for (const endpoint of rpcCandidates) {
    try {
      const toolkit = new TezosToolkit(endpoint);
      assert.equal(await toolkit.rpc.getChainId(), deploy.chainId);
      const finalizedBlock = await toolkit.rpc.getBlockHash({ block: 'head~2' });
      const deployedScript = await toolkit.rpc.getScript(deploy.escrowContract, { block: finalizedBlock as any });
      assert.equal(hashTypedScript(deployedScript.code), deploy.canonicalTypedScriptSha256);
      return { rpc: endpoint, readonly: toolkit, block: finalizedBlock, script: deployedScript };
    } catch (error) {
      failures.push(`${endpoint}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`No verified Mainnet RPC is usable. ${failures.join(' | ')}`);
}
const { rpc, readonly, block, script } = await verifiedRpc();
const storage: any = await readonly.contract.getStorage(deploy.escrowContract, script, block as any);
assert.equal(String(storage.treasury_address), deploy.treasuryAddress);
assert.equal(storage.house_fee_mutez.toFixed(), '500000');
assert.equal(storage.xtz_quantum.toFixed(), '10000');
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const roomId = digest('coLILseum-mainnet-prepaid-lifecycle-2026-11-03');
const termsHash = digest('terms:' + roomId), rulesHash = digest('rules:' + roomId);
const seedCommitment = digest('seed:' + roomId), matchId = digest('match:' + roomId);
const currentRoom = await storage.rooms.get(roomId, block);
const initialCredit = (await storage.credit.get(guest, block))?.toFixed() || '0';
const initialTotalCredit = storage.total_credit.toFixed();
const initialBalance = (await readonly.rpc.getBalance(deploy.escrowContract, { block: block as any })).toFixed();
const dir = path.resolve(positional[0]), file = path.join(dir, 'journal.json');
await mkdir(dir, { recursive: true });
let journal: any;
try { journal = JSON.parse(await readFile(file, 'utf8')); }
catch (error: any) { if (error.code !== 'ENOENT') throw error; }
if (!journal) assert(!currentRoom, 'This proof room ID is already in use without its journal. Reconcile it before proceeding.');
const identity = { schemaVersion: 1, network: 'mainnet', chainId: deploy.chainId,
  contract: deploy.escrowContract, scriptHash: deploy.canonicalTypedScriptSha256, roomId, host, guest,
  treasury: deploy.treasuryAddress };
if (journal) for (const [key, value] of Object.entries(identity)) assert.equal(journal[key], value);
else journal = { ...identity, initial: { creditMutez: initialCredit, totalCreditMutez: initialTotalCredit,
  contractBalanceMutez: initialBalance, finalizedBlock: block }, operations: {} };
async function save() {
  const fd = await open(file + '.tmp', 'w', 0o600);
  try { await fd.writeFile(JSON.stringify(journal, null, 2) + '\n'); await fd.sync(); }
  finally { await fd.close(); }
  await rename(file + '.tmp', file);
  const parent = await open(dir, 'r'); try { await parent.sync(); } finally { await parent.close(); }
}
await save();
if (!execute) {
  console.log(JSON.stringify({ status: 'read-only', contract: deploy.escrowContract, roomId,
    host, guest, sourceBalanceMutez: (await readonly.tz.getBalance(host)).toFixed(),
    guestBalanceMutez: (await readonly.tz.getBalance(guest)).toFixed(), journal: file }));
} else {
  const keyring = new keyringModule.PlatformWalletKeyring(await signerEnv(rpc));
  const hostSigner = await keyring.getSigner('reward-disburser');
  const guestSigner = await keyring.getSigner('contract-admin');
  assert.equal(hostSigner.wallet.address, host); assert.equal(hostSigner.wallet.network, 'mainnet');
  assert.equal(guestSigner.wallet.address, guest); assert.equal(guestSigner.wallet.network, 'mainnet');
  const actors = { host: { address: host, tezos: buildToolkit(hostSigner.signer, rpc) },
    guest: { address: guest, tezos: buildToolkit(guestSigner.signer, rpc) } };
  async function step(key: string, actorName: 'host' | 'guest', entrypoint: string, params: any, amountMutez = '0') {
    const actor = actors[actorName];
    const contract = await actor.tezos.contract.at(deploy.escrowContract);
    const method = (contract.methodsObject as any)[entrypoint];
    assert(method, `Missing exact escrow entrypoint ${entrypoint}`);
    const transfer = method(params).toTransferParams({ amount: Number(amountMutez), mutez: true });
    const intent = { actor: actor.address, contract: deploy.escrowContract, entrypoint, amountMutez,
      parameters: transfer.parameter.value };
    let record = journal.operations[key];
    if (record) {
      for (const [name, value] of Object.entries(intent)) assert.deepEqual(record[name], value);
      if (record.status === 'applied') return;
      assert(record.operationHash, 'Unknown prepared Mainnet send outcome. Inspect chain; never blind retry.');
    } else {
      const estimate = await actor.tezos.estimate.transfer(transfer);
      const balance = BigInt((await actor.tezos.tz.getBalance(actor.address)).toFixed());
      const required = BigInt(amountMutez) + BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez);
      assert(balance >= required, `Measured ${actorName} requirement ${required} mutez exceeds balance ${balance}.`);
      record = { ...intent, status: 'prepared', preparedLevel: (await actor.tezos.rpc.getBlockHeader()).level,
        estimate: { suggestedFeeMutez: String(estimate.suggestedFeeMutez), burnFeeMutez: String(estimate.burnFeeMutez),
          requiredMutez: String(required), balanceMutez: String(balance) } };
      journal.operations[key] = record; await save();
      const operation = await actor.tezos.contract.transfer({ ...transfer, fee: estimate.suggestedFeeMutez,
        gasLimit: estimate.gasLimit, storageLimit: estimate.storageLimit });
      record.operationHash = operation.hash; record.status = 'injected'; await save();
      await operation.confirmation(3);
    }
    const final = await readonly.rpc.getBlockHeader({ block: 'head~2' });
    let found: any;
    for (let level = record.preparedLevel; level <= final.level; level++) {
      const candidate = await readonly.rpc.getBlock({ block: String(level) });
      const operation: any = candidate.operations.flat().find((item: any) => item.hash === record.operationHash);
      if (operation) { found = { block: candidate, operation }; break; }
    }
    assert(found, 'Mainnet operation is not finalized. Preserve journal and resume without resending.');
    const exact = found.operation.contents.filter((content: any) => content.kind === 'transaction' &&
      content.source === actor.address && content.destination === deploy.escrowContract &&
      content.parameters?.entrypoint === entrypoint && content.amount === amountMutez &&
      stable(content.parameters.value) === stable(intent.parameters));
    assert.equal(exact.length, 1, 'Finalized operation must match one exact escrow wallet action.');
    assert.equal(exact[0].metadata?.operation_result?.status, 'applied');
    for (const content of found.operation.contents)
      for (const internal of content.metadata?.internal_operation_results || []) assert.equal(internal.result.status, 'applied');
    record.status = 'applied'; record.inclusion = { level: found.block.header.level, blockHash: found.block.hash };
    await save();
  }
  const offer = { room_id: roomId, terms_hash: termsHash, rules_hash: rulesHash,
    seed_commitment: seedCommitment, referee: guest, entry_amount: '10000' };
  await step('credit/topup', 'guest', 'deposit_credit', guest, '10000');
  await step('room/create', 'host', 'create_offer', offer, '510000');
  await step('room/authorize', 'guest', 'authorize_guest', { room_id: roomId, guest });
  await step('room/accept', 'guest', 'accept_prepaid', { room_id: roomId, expected_terms_hash: termsHash });
  await step('room/start', 'guest', 'start_room', { room_id: roomId, expected_terms_hash: termsHash, match_id: matchId });
  await step('room/finalize', 'guest', 'finalize_room', { room_id: roomId, match_id: matchId,
    transcript_hash: digest('synthetic-transcript:' + roomId), result_hash: digest('synthetic-result:' + roomId),
    ranks: [{ player: guest, rank: '1', group_size: '1' }, { player: host, rank: '2', group_size: '1' }] });
  const settlement = journal.operations['room/finalize'];
  const settledBlock: any = await readonly.rpc.getBlock({ block: settlement.inclusion.blockHash });
  const settledOp: any = settledBlock.operations.flat().find((item: any) => item.hash === settlement.operationHash);
  assert(settledOp);
  const transfers = settledOp.contents.flatMap((content: any) =>
    (content.metadata?.internal_operation_results || []).filter((item: any) => item.kind === 'transaction')
      .map((item: any) => ({ destination: item.destination, amount: item.amount, status: item.result.status })));
  assert.deepEqual(transfers.sort((a: any, b: any) => a.destination.localeCompare(b.destination)), [
    { destination: guest, amount: '20000', status: 'applied' },
    { destination: deploy.treasuryAddress, amount: '500000', status: 'applied' },
  ].sort((a, b) => a.destination.localeCompare(b.destination)));
  const finalBlock = await readonly.rpc.getBlockHash({ block: 'head~2' });
  const finalStorage: any = await readonly.contract.getStorage(deploy.escrowContract, undefined, finalBlock as any);
  const room: any = await finalStorage.rooms.get(roomId, finalBlock);
  assert.equal(room.status.toFixed(), '2'); assert.equal(room.held.toFixed(), '0');
  assert.equal(room.payout_mode.toFixed(), '2'); assert.equal(room.paid_out.toFixed(), '20000');
  assert.equal(room.fees_paid.toFixed(), '500000');
  assert.equal((await finalStorage.credit.get(guest, finalBlock))?.toFixed() || '0', journal.initial.creditMutez);
  assert.equal(finalStorage.total_credit.toFixed(), journal.initial.totalCreditMutez);
  assert.equal((await readonly.rpc.getBalance(deploy.escrowContract, { block: finalBlock as any })).toFixed(),
    journal.initial.contractBalanceMutez);
  journal.finalConservation = { contractBalanceMutez: journal.initial.contractBalanceMutez,
    totalCreditMutez: journal.initial.totalCreditMutez, guestCreditMutez: journal.initial.creditMutez };
  await save();
  console.log(JSON.stringify({ status: 'applied', contract: deploy.escrowContract, roomId,
    settlementOperation: settlement.operationHash, journal: file }));
}
