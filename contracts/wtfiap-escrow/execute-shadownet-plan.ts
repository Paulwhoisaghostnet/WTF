#!/usr/bin/env tsx
/** Explicit public funding/mint plan for the hosted rehearsal; no Mainnet path. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TezosToolkit } from '@taquito/taquito';
import { Schema } from '@taquito/michelson-encoder';
import { stable, assertFundingReceipt, assertAppliedReceipt, type Actor } from './shadownet-proof';
import { assertTypedScriptIdentity } from './script-identity';
import { buildToolkit, signerEnv, SHADOWNET_CHAIN_ID } from '../../scripts/pasta-protocol/shadownet-proof-kit';
import * as keyringNamespace from '../../extensions/wtf-operator-signer/src/keyring';
const keyringModule = 'default' in keyringNamespace ? (keyringNamespace as typeof keyringNamespace & { default: typeof keyringNamespace }).default : keyringNamespace;
const { PlatformWalletKeyring } = keyringModule;
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
type FundingAction = { key: string; kind: 'native-topup'; recipient: string; targetBalanceMutez: string; authority: unknown };
type MintAction = { key: string; kind: 'dummy-mint'; recipients: { address: string; amountAtomic: string }[]; authority: unknown };
export type HostPlan = {
  schemaVersion: 1; network: 'shadownet'; chainId: string; rpcUrl: string; planId: string;
  source: Actor; approvedRecipients: string[];
  dummyToken: { address: string; tokenId: '0'; artifactPath: string; artifactSha256: string };
  actions: (FundingAction | MintAction)[];
};
export function validatePlan(plan: HostPlan) {
  assert.equal(plan.schemaVersion, 1); assert.equal(plan.network, 'shadownet'); assert.equal(plan.chainId, SHADOWNET_CHAIN_ID);
  const url = new URL(plan.rpcUrl); assert(['https:', 'http:'].includes(url.protocol)); assert(!url.username && !url.password && !url.search && !url.hash);
  assert(plan.planId && plan.source.walletId && plan.source.address.startsWith('tz'));
  assert(plan.approvedRecipients.length > 0); assert.equal(new Set(plan.approvedRecipients).size, plan.approvedRecipients.length);
  assert(plan.approvedRecipients.every(address => address.startsWith('tz') && address !== plan.source.address));
  assert.equal(plan.dummyToken.tokenId, '0'); assert(plan.dummyToken.address.startsWith('KT1')); assert(/^[a-f0-9]{64}$/.test(plan.dummyToken.artifactSha256));
  assert(plan.actions.length > 0); assert.equal(new Set(plan.actions.map(a => a.key)).size, plan.actions.length);
  for (const action of plan.actions) {
    assert(action.key && action.authority && typeof action.authority === 'object', 'Each amount needs explicit public measurement/entry authority.');
    if (action.kind === 'native-topup') {
      assert(plan.approvedRecipients.includes(action.recipient)); assert(/^[1-9][0-9]*$/.test(action.targetBalanceMutez));
      assert(Number.isSafeInteger(Number(action.targetBalanceMutez)), 'Taquito native transport must be exact.');
    } else {
      assert.equal(action.kind, 'dummy-mint'); assert(action.recipients.length > 0);
      assert.equal(new Set(action.recipients.map(a => a.address)).size, action.recipients.length);
      for (const recipient of action.recipients) { assert(plan.approvedRecipients.includes(recipient.address)); assert(/^[1-9][0-9]*$/.test(recipient.amountAtomic)); }
    }
  }
}
async function save(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true }); const handle = await open(file + '.tmp', 'w', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
  await rename(file + '.tmp', file); const directory = await open(path.dirname(file), 'r'); try { await directory.sync(); } finally { await directory.close(); }
}
export async function executePlan(plan: HostPlan, output: string, execute: boolean) {
  validatePlan(plan);
  const readonly = new TezosToolkit(plan.rpcUrl), chain = async () => assert.equal(await readonly.rpc.getChainId(), plan.chainId);
  await chain();
  const artifact = await readFile(plan.dummyToken.artifactPath); assert.equal(sha(artifact), plan.dummyToken.artifactSha256);
  const tokenScript = await readonly.rpc.getScript(plan.dummyToken.address);
  assertTypedScriptIdentity(tokenScript.code, JSON.parse(artifact.toString()), 'Only the exact rehearsal FA2 may be minted.');
  const storage = new Schema((tokenScript.code.find((n: any) => n.prim === 'storage') as any).args[0]).Execute(tokenScript.storage);
  assert.equal(storage.administrator, plan.source.address, 'Plan signer must be the dummy administrator.');
  const file = path.join(output, 'journal.json'), planHash = sha(stable(plan)); let journal: any;
  try { journal = JSON.parse(await readFile(file, 'utf8')); assert.equal(journal.planHash, planHash, 'Different plan cannot reuse a journal.'); }
  catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  journal ??= { schemaVersion: 1, network: 'shadownet', planHash, plan, status: 'read-only', operations: {}, sourceVersions: [] };
  const sourceBytes = await readFile(fileURLToPath(import.meta.url));
  journal.sourceVersions = [...new Set([...journal.sourceVersions, sha(sourceBytes)])];
  journal.publicBalances = await Promise.all([plan.source.address, ...plan.approvedRecipients].map(async address => ({ address, mutez: (await readonly.tz.getBalance(address)).toFixed() })));
  await save(file, journal);
  if (!execute) return journal;
  const keyring = new PlatformWalletKeyring(await signerEnv(plan.rpcUrl));
  const { wallet, signer } = await keyring.getSigner(plan.source.walletId);
  assert.equal(wallet.network, 'shadownet'); assert.equal(wallet.address, plan.source.address); assert.equal(await signer.publicKeyHash(), plan.source.address);
  const toolkit = buildToolkit(signer, plan.rpcUrl); await chain();
  assert(await readonly.rpc.getManagerKey(plan.source.address), 'Funding source must already be revealed; use the existing tested root.');
  const token = await toolkit.contract.at(plan.dummyToken.address);
  journal.status = 'running'; await save(file, journal);
  for (const action of plan.actions) {
    let record = journal.operations[action.key];
    if (record?.status === 'applied' || record?.status === 'satisfied') continue;
    if (record) assert(record.operationHash, 'Unknown prepared send; reconcile explicitly without automatic resubmission.');
    if (!record) {
      let transfer: any;
      if (action.kind === 'native-topup') {
        const balance = BigInt((await readonly.tz.getBalance(action.recipient)).toFixed());
        const amount = BigInt(action.targetBalanceMutez) - balance;
        if (amount <= 0n) { journal.operations[action.key] = { status: 'satisfied', balanceMutez: String(balance), authority: action.authority }; await save(file, journal); continue; }
        transfer = { to: action.recipient, amount: Number(amount), mutez: true };
      } else {
        transfer = token.methodsObject.mint(action.recipients.map(a => ({ to_: a.address, amount: a.amountAtomic }))).toTransferParams({ amount: 0, mutez: true });
      }
      const estimate = await toolkit.estimate.transfer(transfer);
      const required = BigInt(transfer.amount) + BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez);
      const sourceBalance = BigInt((await readonly.tz.getBalance(plan.source.address)).toFixed());
      assert(sourceBalance >= required, `Source needs measured ${required} mutez; balance ${sourceBalance}.`);
      record = { key: action.key, actor: plan.source.address, walletId: plan.source.walletId, destination: transfer.to,
        entrypoint: action.kind === 'native-topup' ? '__native-funding' : 'mint', amountMutez: String(transfer.amount), parameters: transfer.parameter?.value ?? null,
        authority: action.authority, status: 'prepared', preparedLevel: (await readonly.rpc.getBlockHeader()).level,
        estimate: { suggestedFeeMutez: String(estimate.suggestedFeeMutez), burnFeeMutez: String(estimate.burnFeeMutez), gasLimit: String(estimate.gasLimit), storageLimit: String(estimate.storageLimit), requiredMutez: String(required) } };
      journal.operations[action.key] = record; await save(file, journal); await chain();
      const operation = await toolkit.contract.transfer({ ...transfer, fee: estimate.suggestedFeeMutez, gasLimit: estimate.gasLimit, storageLimit: estimate.storageLimit });
      record.operationHash = operation.hash; record.status = 'injected'; await save(file, journal);
      console.log(JSON.stringify({ key: action.key, status: record.status, operationHash: operation.hash }));
      await operation.confirmation(3);
    }
    const finalized = await readonly.rpc.getBlockHash({ block: 'head~2' }), header = await readonly.rpc.getBlockHeader({ block: finalized });
    let found: any;
    for (let level = record.preparedLevel; level <= header.level; level++) {
      const blockHash = await readonly.rpc.getBlockHash({ block: finalized + '~' + (header.level - level) });
      const block = await readonly.rpc.getBlock({ block: blockHash });
      const operation = block.operations.flat().find((candidate: any) => candidate.hash === record.operationHash);
      if (operation) { found = { operation, level, blockHash }; break; }
    }
    assert(found, 'Operation not finalized yet; resume this journal without resubmitting.');
    if (action.kind === 'native-topup') assertFundingReceipt(found.operation, record);
    else assertAppliedReceipt(found.operation, record, token.entrypoints.entrypoints.mint);
    record.status = 'applied'; record.inclusionLevel = found.level; record.inclusionBlock = found.blockHash; record.receipt = { contents: found.operation.contents };
    if (action.kind === 'native-topup') record.recipientBalanceAtInclusion = (await readonly.rpc.getBalance(action.recipient, { block: found.blockHash })).toFixed();
    await save(file, journal); console.log(JSON.stringify({ key: action.key, status: record.status, operationHash: record.operationHash }));
  }
  journal.status = 'passed'; await save(file, journal); return journal;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), execute = args.includes('--execute'), positional = args.filter(v => v !== '--execute');
  assert.equal(positional.length, 2, 'Usage: tsx execute-shadownet-plan.ts <public-plan.json> <journal-directory> [--execute]');
  executePlan(JSON.parse(await readFile(positional[0], 'utf8')), positional[1], execute).then(j => console.log(JSON.stringify({ status: j.status, operations: Object.keys(j.operations).length })))
    .catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
