#!/usr/bin/env tsx
/** Real Shadownet rehearsal, executed only by an explicit --execute invocation.
 * Default mode verifies public identities/artifacts/balances and submits nothing.
 * Journals contain public on-chain intents/receipts only, never signer secrets.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TezosToolkit } from '@taquito/taquito';
import { ParameterSchema, Schema } from '@taquito/michelson-encoder';
import { packDataBytes } from '@taquito/michel-codec';
import { encodeExpr } from '@taquito/utils';
import { buildToolkit, signerEnv, SHADOWNET_CHAIN_ID } from '../../scripts/pasta-protocol/shadownet-proof-kit';
import { assertTypedScriptIdentity } from './script-identity';
import * as keyringNamespace from '../../extensions/wtf-operator-signer/src/keyring';

const keyringModule = 'default' in keyringNamespace
  ? (keyringNamespace as typeof keyringNamespace & { default: typeof keyringNamespace }).default : keyringNamespace;
const { PlatformWalletKeyring } = keyringModule;
const dir = path.dirname(fileURLToPath(import.meta.url));
export type Actor = { walletId: string; address: string };
export type ProofConfig = {
  schemaVersion: 2; network: 'shadownet'; chainId: string; rpcUrl: string; proofId: string;
  escrowAddress: string; artifactPath: string; artifactSha256: string; buildManifestPath: string;
  creator: Actor; referee: Actor; treasuryAddress: string; entrants: Actor[]; entryAtomic: { XTZ: string; WTF: string };
  wtfTokenAddress: string; wtfTokenId: string;
  dummyToken?: { artifactPath: string; artifactSha256: string };
  rulesHash: string; seedCommitment: string;
};
type OperationRecord = {
  key: string; actor: string; walletId: string; destination: string; entrypoint: string;
  amountMutez: string; parameters: unknown; status: 'prepared' | 'injected' | 'applied';
  preparedLevel: number; operationHash?: string; inclusionLevel?: number; inclusionBlock?: string;
  estimate: { suggestedFeeMutez: string; burnFeeMutez: string; gasLimit: string; storageLimit: string };
  receipt?: unknown; fundingAuthority?: unknown; automaticReveal?: unknown;
};
type Journal = {
  schemaVersion: 2; configHash: string; config: ProofConfig; artifactSha256: string;
  status: 'read-only' | 'running' | 'passed'; operations: Record<string, OperationRecord>;
  evidence: Record<string, unknown>;
};
const hex32 = (v: string) => /^[a-f0-9]{64}$/.test(v);
const sha256 = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
export function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    return '{' + Object.keys(v).sort().map(key => JSON.stringify(key) + ':' + stable(v[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}
export function validateConfig(c: ProofConfig): void {
  assert.equal(c.schemaVersion, 2); assert.equal(c.network, 'shadownet'); assert.equal(c.chainId, SHADOWNET_CHAIN_ID);
  const rpc = new URL(c.rpcUrl); assert(['https:', 'http:'].includes(rpc.protocol));
  assert(!rpc.username && !rpc.password && !rpc.search && !rpc.hash, 'RPC URL must contain no credentials/query/hash.');
  assert(c.proofId && c.escrowAddress.startsWith('KT1'));
  for (const value of [c.artifactSha256, c.rulesHash, c.seedCommitment]) assert(hex32(value), 'Expected lowercase SHA256/commitment bytes32.');
  for (const currency of ['XTZ', 'WTF'] as const) {
    assert(/^[1-9][0-9]*$/.test(c.entryAtomic[currency]));
    assert.equal(BigInt(c.entryAtomic[currency]) % (currency === 'XTZ' ? 10000n : 1000000n), 0n);
  }
  assert(/^(0|[1-9][0-9]*)$/.test(c.wtfTokenId));
  assert(Number.isSafeInteger(Number(c.entryAtomic.XTZ)), 'Taquito native amount transport requires an exactly representable integer.');
  assert(c.treasuryAddress?.startsWith('tz'), 'Explicit synthetic Shadownet treasury required.');
  assert(c.wtfTokenAddress.startsWith('KT1')); assert.equal(c.entrants.length, 8);
  assert.equal(new Set(c.entrants.map(a => a.address)).size, 8, 'Eight distinct wallet addresses required.');
  assert.equal(new Set(c.entrants.map(a => a.walletId)).size, 8, 'Eight distinct e2e wallet IDs required.');
  for (const actor of [c.creator, c.referee, ...c.entrants]) assert(actor.walletId && actor.address.startsWith('tz'), 'Expected explicit implicit-wallet identities.');
  assert(c.entrants.every(a => a.walletId.startsWith('e2e-')), 'This rehearsal uses only explicitly chosen e2e entrant wallets.');
  if (c.dummyToken) assert(hex32(c.dummyToken.artifactSha256));
}
export function expectedAwards(entry: string, quantum: string, ranks: number[]): { amounts: string[]; treasury: string } {
  const e = BigInt(entry), q = BigInt(quantum), pot = e * 8n;
  assert(e > 0n && q > 0n && e % q === 0n);
  assert.equal(ranks.length, 8); assert.equal(ranks.filter(r => r === 1).length, 1);
  const amounts = ranks.map(rank => {
    assert.equal(rank, 1 + ranks.filter(r => r < rank).length);
    const tied = ranks.filter(r => r === rank).length;
    const percent = [50, 35, 15].reduce((total, weight, i) => total + (rank <= i + 1 && i + 1 < rank + tied ? weight : 0), 0);
    return pot * BigInt(percent) / (100n * BigInt(tied) * q) * q;
  });
  return { amounts: amounts.map(String), treasury: String(pot - amounts.reduce((sum, n) => sum + n, 0n)) };
}
function fieldType(node: any, name: string): any {
  if (node?.annots?.includes('%' + name)) return node;
  for (const child of node?.args ?? []) { const found = fieldType(child, name); if (found) return found; }
  return undefined;
}
function clean(value: any): any {
  if (value?.isBigNumber || value?.constructor?.name === 'BigNumber') return value.toFixed();
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
  return value;
}
async function atomicJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const output = await open(file + '.tmp', 'w', 0o600);
  try { await output.writeFile(JSON.stringify(value, null, 2) + '\n'); await output.sync(); } finally { await output.close(); }
  await rename(file + '.tmp', file);
  const directory = await open(path.dirname(file), 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}
export function measuredFundingDeficit(error: any, address: string): { deficit: bigint; errors: unknown[] } | undefined {
  let errors: any = error?.errors;
  if (!Array.isArray(errors)) {
    try { errors = JSON.parse(error?.body ?? 'null'); } catch { return undefined; }
  }
  if (!Array.isArray(errors)) return undefined;
  const shortage = errors.find((item: any) => typeof item.id === 'string' && item.id.endsWith('.contract.balance_too_low')
    && item.contract === address && /^[0-9]+$/.test(item.balance) && /^[0-9]+$/.test(item.amount));
  if (!shortage) return undefined;
  const deficit = BigInt(shortage.amount) - BigInt(shortage.balance);
  return deficit > 0n ? { deficit, errors } : undefined;
}
export function assertFundingReceipt(operation: any, record: OperationRecord): void {
  const transactions = operation.contents.filter((c: any) => c.kind === 'transaction');
  assert.equal(transactions.length, 1);
  const tx = transactions[0];
  assert.equal(tx.source, record.actor); assert.equal(tx.destination, record.destination);
  assert.equal(tx.amount, record.amountMutez); assert(!tx.parameters, 'Funding must be a plain implicit transfer.');
  for (const content of operation.contents) {
    assert.equal(content.metadata?.operation_result?.status, 'applied');
    assert.equal((content.metadata?.internal_operation_results ?? []).length, 0);
  }
}
export function assertAppliedReceipt(operation: any, record: OperationRecord, parameterType: any): void {
  const transactions = operation.contents.filter((c: any) => c.kind === 'transaction');
  assert.equal(transactions.length, 1, 'Each proof step must contain exactly one manager transaction.');
  const tx = transactions[0];
  assert.equal(tx.source, record.actor); assert.equal(tx.destination, record.destination);
  assert.equal(tx.amount, record.amountMutez); assert.equal(tx.parameters.entrypoint, record.entrypoint);
  const schema = new ParameterSchema(parameterType);
  assert.equal(stable(clean(schema.Execute(tx.parameters.value))), stable(clean(schema.Execute(record.parameters))), 'Applied parameters differ from persisted intent.');
  for (const content of operation.contents) {
    assert.equal(content.metadata?.operation_result?.status, 'applied', 'Every manager result must be applied.');
    for (const internal of content.metadata?.internal_operation_results ?? []) assert.equal(internal.result?.status, 'applied', 'Every internal result must be applied.');
  }
}

export async function runProof(config: ProofConfig, outputDir: string, execute: boolean): Promise<Journal> {
  validateConfig(config);
  const file = path.join(outputDir, 'journal.json');
  const artifactBytes = await readFile(config.artifactPath);
  assert.equal(sha256(artifactBytes), config.artifactSha256, 'Compiled artifact bytes changed.');
  const artifact = JSON.parse(artifactBytes.toString());
  const manifest = JSON.parse(await readFile(config.buildManifestPath, 'utf8'));
  assert.equal(manifest.artifacts['contract.json'].sha256, config.artifactSha256);
  const tezos = new TezosToolkit(config.rpcUrl);
  const chain = async () => assert.equal(await tezos.rpc.getChainId(), config.chainId, 'RPC network changed.');
  await chain();
  const live = await tezos.rpc.getScript(config.escrowAddress);
  const semanticCodeHash = assertTypedScriptIdentity(live.code, artifact, 'Escrow does not match exact compiled code.');
  const storageType = artifact.find((n: any) => n.prim === 'storage').args[0];
  const storageSchema = new Schema(storageType);
  const initial = storageSchema.Execute(live.storage);
  assert.equal(initial.room_creator, config.creator.address);
  assert.equal(initial.wtf_token_address, config.wtfTokenAddress);
  assert.equal(initial.wtf_token_id.toString(), config.wtfTokenId);
  assert.equal(initial.treasury_address, config.treasuryAddress);
  assert.equal(initial.xtz_quantum.toString(), '10000');
  assert.equal(initial.wtf_quantum.toString(), '1000000');
  const roomType = fieldType(storageType, 'rooms');
  const claimType = fieldType(storageType, 'claims');
  const artifactParams = artifact.find((n: any) => n.prim === 'parameter').args[0];
  const configHash = sha256(stable(config));
  let journal: Journal;
  try {
    journal = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(journal.configHash, configHash, 'Existing journal belongs to different immutable inputs.');
    assert.equal(journal.artifactSha256, config.artifactSha256);
  } catch (error: any) {
    if (error?.code !== 'ENOENT') throw error;
    journal = { schemaVersion: 2, configHash, config, artifactSha256: config.artifactSha256,
      status: 'read-only', operations: {}, evidence: {} };
  }
  const save = () => atomicJson(file, journal);
  const actors = [...new Map([config.creator, config.referee, ...config.entrants].map(a => [a.walletId, a])).values()];
  const harnessBytes = await readFile(fileURLToPath(import.meta.url));
  const harnessHash = sha256(harnessBytes);
  await mkdir(path.join(outputDir, 'sources'), { recursive: true });
  await writeFile(path.join(outputDir, 'sources', harnessHash + '.ts'), harnessBytes, { flag: 'w' });
  const priorHarnessHashes = (journal.evidence.harnessVersions as string[] | undefined) ?? [];
  journal.evidence.harnessVersions = [...new Set([...priorHarnessHashes, (journal.evidence.preflight as any)?.harnessSha256, harnessHash].filter(Boolean))];
  journal.evidence.preflight = { chainId: config.chainId, semanticCodeHash,
    harnessSha256: sha256(await readFile(fileURLToPath(import.meta.url))), treasuryAddress: config.treasuryAddress,
    balances: await Promise.all(actors.map(async a => ({ ...a, mutez: (await tezos.tz.getBalance(a.address)).toFixed() }))) };
  await save();
  if (!execute) return journal;
  assert.equal(manifest.policyStatus, 'owner-approved', 'Pending-policy draft cannot be funded by this harness.');
  await chain();
  const keyring = new PlatformWalletKeyring(await signerEnv(config.rpcUrl));
  const toolkits = new Map<string, TezosToolkit>();
  for (const actor of actors) {
    const { wallet, signer } = await keyring.getSigner(actor.walletId);
    assert.equal(wallet.network, 'shadownet'); assert.equal(wallet.address, actor.address);
    assert.equal(await signer.publicKeyHash(), actor.address);
    toolkits.set(actor.walletId, buildToolkit(signer, config.rpcUrl));
  }
  journal.status = 'running'; await save();

  async function pinnedState(roomId: string): Promise<any> {
    const block = await tezos.rpc.getBlockHash({ block: 'head~2' });
    const header = await tezos.rpc.getBlockHeader({ block });
    const rawStorage = await tezos.rpc.getStorage(config.escrowAddress, { block });
    const storage = storageSchema.Execute(rawStorage);
    async function bigMap(type: any, id: string, key: any) {
      const schema = new Schema(type); const encoded = schema.EncodeBigMapKey(key);
      const packed = packDataBytes(encoded.key as any, encoded.type as any).bytes;
      const raw = await tezos.rpc.getBigMapExpr(id, encodeExpr(packed), { block });
      return clean(schema.ExecuteOnBigMapValue(raw));
    }
    const room = await bigMap(roomType, storage.rooms.toString(), roomId);
    // The current encoder preserves Some wrappers for option(bytes). Normalize
    // only these declared optional commitment fields for proof comparisons.
    for (const key of ['match_id', 'result_hash', 'transcript_hash', 'void_reason_hash', 'void_evidence_hash']) {
      if (room[key] && typeof room[key] === 'object' && Object.keys(room[key]).length === 1 && 'Some' in room[key]) room[key] = room[key].Some;
    }
    const claims = Number(room.status) === 2 ? await Promise.all(config.entrants.map(async actor => ({
      address: actor.address, ...await bigMap(claimType, storage.claims.toString(), [roomId, actor.address]),
    }))) : [];
    return { block, level: header.level, room, claims };
  }
  async function reconcile(record: OperationRecord, parameterType?: any): Promise<void> {
    assert(record.operationHash, 'Prior prepared submission has an unknown outcome. Reconcile manually; never auto-resubmit.');
    const finalBlock = await tezos.rpc.getBlockHash({ block: 'head~2' });
    const finalHeader = await tezos.rpc.getBlockHeader({ block: finalBlock });
    let found: any;
    for (let level = record.preparedLevel; level <= finalHeader.level; level += 1) {
      const blockHash = await tezos.rpc.getBlockHash({ block: finalBlock + '~' + (finalHeader.level - level) });
      const block = await tezos.rpc.getBlock({ block: blockHash });
      const operation = block.operations.flat().find((candidate: any) => candidate.hash === record.operationHash);
      if (operation) { found = { operation, level, block: block.hash }; break; }
    }
    assert(found, 'Submitted operation is not yet provable in the head~2 chain; retain journal and rerun without resubmitting.');
    if (record.entrypoint === '__native-funding') assertFundingReceipt(found.operation, record);
    else assertAppliedReceipt(found.operation, record, parameterType);
    record.status = 'applied'; record.inclusionLevel = found.level; record.inclusionBlock = found.block;
    record.receipt = { contents: found.operation.contents }; // excludes operation signature
    await save();
    console.log(JSON.stringify({ key: record.key, status: record.status, operationHash: record.operationHash }));
  }
  // Reconcile an interrupted funding transfer before deriving any new funding deficit.
  for (const record of Object.values(journal.operations)) {
    if (record.entrypoint === '__native-funding' && record.status !== 'applied') await reconcile(record);
  }
  async function fundTo(actor: Actor, target: bigint, authority: unknown): Promise<void> {
    assert.notEqual(actor.address, config.creator.address, 'Funding source is insufficient; do not recursively fund it.');
    const balance = BigInt((await tezos.tz.getBalance(actor.address)).toFixed());
    const deficit = target - balance;
    if (deficit <= 0n) return;
    assert(Number.isSafeInteger(Number(deficit)), 'Native transfer must be exactly representable.');
    const funding = toolkits.get(config.creator.walletId)!;
    await chain();
    const transfer = { to: actor.address, amount: Number(deficit), mutez: true };
    const estimate = await funding.estimate.transfer(transfer);
    const required = deficit + BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez);
    const sourceBalance = BigInt((await funding.tz.getBalance(config.creator.address)).toFixed());
    assert(sourceBalance >= required, `Funding source needs measured ${required} mutez; balance ${sourceBalance}.`);
    const key = 'funding/' + actor.walletId + '/' + Object.values(journal.operations).filter(r => r.entrypoint === '__native-funding').length;
    assert(!journal.operations[key]);
    const record: OperationRecord = { key, actor: config.creator.address, walletId: config.creator.walletId,
      destination: actor.address, entrypoint: '__native-funding', amountMutez: String(deficit), parameters: null,
      status: 'prepared', preparedLevel: (await tezos.rpc.getBlockHeader()).level,
      fundingAuthority: { balanceBefore: String(balance), targetBalance: String(target), evidence: authority },
      estimate: { suggestedFeeMutez: String(estimate.suggestedFeeMutez), burnFeeMutez: String(estimate.burnFeeMutez), gasLimit: String(estimate.gasLimit), storageLimit: String(estimate.storageLimit) } };
    journal.operations[key] = record; await save();
    await chain();
    const op = await funding.contract.transfer({ ...transfer, fee: estimate.suggestedFeeMutez, gasLimit: estimate.gasLimit, storageLimit: estimate.storageLimit });
    record.operationHash = op.hash; record.status = 'injected'; await save();
    await op.confirmation(3);
    await reconcile(record);
  }
  async function estimateFunded(key: string, actor: Actor, transfer: any): Promise<{ estimate: any; automaticReveal: any; cost: bigint }> {
    const toolkit = toolkits.get(actor.walletId)!;
    if ((await toolkit.tz.getBalance(actor.address)).isZero()) {
      // A finalized same-parameter call from another formerly empty entrant is
      // measured evidence for its successor's activation/deposit/reveal budget.
      // Any differing cost is still obtained from this entrant's own RPC estimate.
      const prior = Object.values(journal.operations).reverse().find(record => record.status === 'applied'
        && record.destination === transfer.to && record.entrypoint === transfer.parameter.entrypoint
        && record.amountMutez === String(transfer.amount) && stable(record.parameters) === stable(transfer.parameter.value)
        && Array.isArray(record.automaticReveal) && record.automaticReveal.length > 0);
      if (prior) {
        const target = BigInt(prior.amountMutez) + BigInt(prior.estimate.suggestedFeeMutez) + BigInt(prior.estimate.burnFeeMutez)
          + (prior.automaticReveal as any[]).reduce((sum: bigint, content: any) => sum + BigInt(content.fee), 0n);
        await fundTo(actor, target, { kind: 'same-parameter-finalized-estimate', operation: key, priorOperation: prior.key,
          priorOperationHash: prior.operationHash, priorEstimate: prior.estimate, priorAutomaticReveal: prior.automaticReveal });
      } else {
        await fundTo(actor, 1n, { kind: 'protocol-minimum-activation', amountMutez: '1', reason: 'An empty implicit account cannot be simulated; one mutez is the minimum positive native amount.' });
      }
    }
    // During simulation, an automatically inserted reveal can consume all of a
    // tiny activation balance before the transaction is executed. Keep exactly
    // one protocol atomic unit after the known reveal fee and native amount.
    const initialPrepared = await toolkit.prepare.transaction(transfer);
    const initialRevealFee = initialPrepared.opOb.contents.filter((c: any) => c.kind === 'reveal')
      .reduce((sum: bigint, c: any) => sum + BigInt(c.fee), 0n);
    const simulationBalance = BigInt(transfer.amount) + initialRevealFee + 1n;
    if (BigInt((await toolkit.tz.getBalance(actor.address)).toFixed()) < simulationBalance) {
      await fundTo(actor, simulationBalance, { kind: 'protocol-nonempty-simulation-balance', operation: key,
        entryMutez: String(transfer.amount), automaticRevealFeeMutez: String(initialRevealFee), minimumRemainingMutez: '1' });
    }
    while (true) {
      try {
        const estimate = await toolkit.estimate.transfer(transfer);
        // Taquito transfer estimates exclude an automatic reveal. Prepare its public,
        // unsigned operation to account for the exact SDK reveal fee that will be sent.
        const prepared = await toolkit.prepare.transaction({ ...transfer, fee: estimate.suggestedFeeMutez, gasLimit: estimate.gasLimit, storageLimit: estimate.storageLimit });
        const reveals = prepared.opOb.contents.filter((c: any) => c.kind === 'reveal');
        assert(reveals.every((c: any) => c.storage_limit === '0'), 'Unexpected reveal storage cost needs an explicit estimate.');
        const revealFee = reveals.reduce((sum: bigint, c: any) => sum + BigInt(c.fee), 0n);
        const cost = BigInt(transfer.amount) + BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez) + revealFee;
        const balance = BigInt((await toolkit.tz.getBalance(actor.address)).toFixed());
        if (balance < cost) await fundTo(actor, cost, { kind: 'complete-operation-estimate', operation: key,
          entryMutez: String(transfer.amount), suggestedFeeMutez: String(estimate.suggestedFeeMutez), burnFeeMutez: String(estimate.burnFeeMutez), automaticRevealFeeMutez: String(revealFee) });
        return { estimate, automaticReveal: reveals, cost };
      } catch (error) {
        const shortage = measuredFundingDeficit(error, actor.address);
        if (!shortage) throw error;
        const balance = BigInt((await toolkit.tz.getBalance(actor.address)).toFixed());
        await fundTo(actor, balance + shortage.deficit + 1n, { kind: 'rpc-simulation-shortage', operation: key, minimumRemainingMutez: '1', errors: shortage.errors });
      }
    }
  }
  async function step(key: string, actor: Actor, destination: string, entrypoint: string, args: unknown, amountMutez = '0'): Promise<void> {
    await chain();
    const toolkit = toolkits.get(actor.walletId)!;
    const contract = await toolkit.contract.at(destination);
    const method = (contract.methodsObject as any)[entrypoint](args);
    const transfer = method.toTransferParams({ amount: Number(amountMutez), mutez: true });
    let record = journal.operations[key];
    if (record) {
      assert.equal(stable({ actor: record.actor, destination: record.destination, entrypoint: record.entrypoint, amountMutez: record.amountMutez, parameters: record.parameters }),
        stable({ actor: actor.address, destination, entrypoint, amountMutez, parameters: transfer.parameter.value }));
      if (record.status === 'applied') return;
      assert(record.operationHash, 'Prior prepared submission has an unknown outcome. Reconcile it manually; never auto-resubmit.');
    } else {
      const { estimate, automaticReveal } = await estimateFunded(key, actor, transfer);
      record = { key, actor: actor.address, walletId: actor.walletId, destination, entrypoint, amountMutez,
        parameters: transfer.parameter.value, status: 'prepared', preparedLevel: (await tezos.rpc.getBlockHeader()).level,
        automaticReveal,
        estimate: { suggestedFeeMutez: String(estimate.suggestedFeeMutez), burnFeeMutez: String(estimate.burnFeeMutez), gasLimit: String(estimate.gasLimit), storageLimit: String(estimate.storageLimit) } };
      journal.operations[key] = record; await save();
      await chain();
      const op = await toolkit.contract.transfer({ ...transfer, fee: estimate.suggestedFeeMutez, gasLimit: estimate.gasLimit, storageLimit: estimate.storageLimit });
      record.operationHash = op.hash; record.status = 'injected'; await save();
      // Tenderbake finality requires inclusion plus two successor blocks.
      await op.confirmation(3);
    }
    const parameterType = destination === config.escrowAddress ? fieldType(artifactParams, entrypoint)
      : (contract.entrypoints.entrypoints as any)[entrypoint];
    await reconcile(record, parameterType);
  }

  if (config.dummyToken) {
    const bytes = await readFile(config.dummyToken.artifactPath);
    assert.equal(sha256(bytes), config.dummyToken.artifactSha256);
    const liveToken = await tezos.rpc.getScript(config.wtfTokenAddress);
    assertTypedScriptIdentity(liveToken.code, JSON.parse(bytes.toString()), 'Dummy token code mismatch.');
    const tokenStorage = new Schema((liveToken.code.find((n: any) => n.prim === 'storage') as any).args[0]).Execute(liveToken.storage);
    assert.equal(tokenStorage.administrator, config.creator.address, 'Only the exact rehearsal dummy may be minted.');
    assert.equal(config.wtfTokenId, '0');
    await step('dummy-mint', config.creator, config.wtfTokenAddress, 'mint', config.entrants.map(a => ({ to_: a.address, amount: String(BigInt(config.entryAtomic.WTF) * 2n) })));
  }
  async function assetBalances(currency: number): Promise<any> {
    const block = await tezos.rpc.getBlockHash({ block: 'head~2' });
    if (currency === 0) return { block, escrow: (await tezos.rpc.getBalance(config.escrowAddress, { block })).toFixed() };
    const script = await tezos.rpc.getScript(config.wtfTokenAddress, { block });
    const type = (script.code.find((n: any) => n.prim === 'storage') as any).args[0];
    const stored = new Schema(type).Execute(script.storage);
    const ledgerType = fieldType(type, 'ledger');
    assert(ledgerType?.prim === 'big_map', 'FA2 proof needs its authoritative ledger type.');
    const ledgerSchema = new Schema(ledgerType);
    async function balance(address: string): Promise<string> {
      const key = ledgerType.args[0].prim === 'address' ? address : [address, config.wtfTokenId];
      const encoded = ledgerSchema.EncodeBigMapKey(key);
      const expr = encodeExpr(packDataBytes(encoded.key as any, encoded.type as any).bytes);
      try {
        const raw = await tezos.rpc.getBigMapExpr(stored.ledger.toString(), expr, { block });
        return ledgerSchema.ExecuteOnBigMapValue(raw).toString();
      } catch (error: any) {
        if (error?.status === 404 || error?.statusCode === 404) return '0';
        throw error;
      }
    }
    return { block, escrow: await balance(config.escrowAddress), treasury: await balance(config.treasuryAddress),
      players: await Promise.all(config.entrants.map(async a => ({ address: a.address, balance: await balance(a.address) }))) };
  }
  const cases = [
    { name: 'xtz-unique', currency: 0, ranks: [1, 2, 3, 4, 5, 6, 7, 8], voided: false },
    { name: 'wtf-third-tie', currency: 1, ranks: [1, 2, 3, 3, 5, 6, 7, 8], voided: false },
    { name: 'xtz-refund-rejoin-void', currency: 0, ranks: [], voided: true },
    { name: 'wtf-refund-rejoin-void', currency: 1, ranks: [], voided: true },
  ];
  function nativeTransfer(key: string, recipient: string, amount: string) {
    const receipt: any = journal.operations[key]?.receipt;
    assert(receipt, 'Missing applied transfer receipt.');
    const transfers = receipt.contents.flatMap((c: any) => c.metadata?.internal_operation_results || [])
      .filter((tx: any) => tx.kind === 'transaction' && tx.source === config.escrowAddress);
    assert.equal(transfers.length, 1); assert.equal(transfers[0].destination, recipient);
    assert.equal(transfers[0].amount, amount); assert.equal(transfers[0].result.status, 'applied');
  }
  for (const item of cases) {
    const entry = item.currency === 0 ? config.entryAtomic.XTZ : config.entryAtomic.WTF;
    const quantum = item.currency === 0 ? 10000n : 1000000n;
    const roomId = sha256(stable({ version: 2, proofId: config.proofId, scenario: item.name }));
    const matchId = sha256(stable({ version: 2, roomId, kind: 'contract-rehearsal-match' }));
    const terms = { version: 2, chainId: config.chainId, escrowAddress: config.escrowAddress, roomId,
      referee: config.referee.address, currency: item.currency, entryAtomic: entry, quantum: String(quantum), treasuryAddress: config.treasuryAddress,
      rulesHash: config.rulesHash, seedCommitment: config.seedCommitment, entrants: config.entrants.map(a => a.address),
      prizePercentages: [50, 35, 15], nature: 'synthetic contract lifecycle proof, not played game' };
    const termsHash = sha256(stable(terms));
    const prefix = item.name + '/';
    if (journal.evidence[prefix + 'assetAfter']) {
      // Other scenarios may hold funds when a run resumes. Recheck this room's
      // terminal reserve instead of comparing the whole contract with an old
      // per-scenario balance snapshot or re-sending completed operations.
      const finished = await pinnedState(roomId);
      assert.equal(finished.room.status, item.voided ? '3' : '2');
      assert.equal(finished.room.held, '0');
      assert.equal(stable(finished.room), stable((journal.evidence[prefix + 'finished'] as any).room));
      assert.equal(stable(finished.claims), stable((journal.evidence[prefix + 'finished'] as any).claims));
      continue;
    }
    if (!journal.evidence[prefix + 'assetBefore']) {
      journal.evidence[prefix + 'assetBefore'] = await assetBalances(item.currency); await save();
    }
    await step(prefix + 'create', config.creator, config.escrowAddress, 'create_room', {
      room_id: roomId, terms_hash: termsHash, rules_hash: config.rulesHash, seed_commitment: config.seedCommitment,
      referee: config.referee.address, currency: item.currency, entry_amount: entry, entrants: terms.entrants,
    });
    async function deposit(actor: Actor, label = '') {
      const operator = { owner: actor.address, operator: config.escrowAddress, token_id: config.wtfTokenId };
      const key = prefix + actor.walletId + '/' + label;
      if (item.currency === 1) await step(key + 'operator-add', actor, config.wtfTokenAddress, 'update_operators', [{ add_operator: operator }]);
      await step(key + 'join', actor, config.escrowAddress, 'join_room', { room_id: roomId, expected_terms_hash: termsHash }, item.currency === 0 ? entry : '0');
      if (item.currency === 1) await step(key + 'operator-remove', actor, config.wtfTokenAddress, 'update_operators', [{ remove_operator: operator }]);
    }
    for (const actor of config.entrants) await deposit(actor);
    if (!journal.evidence[prefix + 'funded']) {
      const funded = await pinnedState(roomId); assert.equal(funded.room.held, String(BigInt(entry) * 8n));
      assert.equal(funded.room.deposited, String(BigInt(entry) * 8n)); assert.equal(funded.room.quantum, String(quantum));
      assert.equal(funded.room.paid.length, 8); assert.equal(funded.room.status, '0');
      assert.deepEqual(funded.room.entrants, terms.entrants); journal.evidence[prefix + 'funded'] = funded; await save();
    }
    if (item.voided) {
      const actor = config.entrants[0], key = prefix + 'prestart-refund';
      await step(key, actor, config.escrowAddress, 'refund', roomId);
      if (item.currency === 0) nativeTransfer(key, actor.address, entry);
      if (!journal.evidence[prefix + 'withdrawn']) {
        const withdrawn = await pinnedState(roomId);
        assert.equal(withdrawn.room.held, String(BigInt(entry) * 7n));
        assert.equal(withdrawn.room.refunded, entry); assert(!withdrawn.room.paid.includes(actor.address));
        journal.evidence[prefix + 'withdrawn'] = withdrawn; await save();
      }
      await deposit(actor, 'rejoin/');
    }
    await step(prefix + 'start', config.referee, config.escrowAddress, 'start_room', { room_id: roomId, expected_terms_hash: termsHash, match_id: matchId });
    let expected = { amounts: Array<string>(8).fill('0'), treasury: '0' };
    if (item.voided) {
      const reasonHash = sha256(stable({ reason: 'synthetic technical-failure rehearsal', roomId }));
      const evidenceHash = sha256(stable({ proofId: config.proofId, roomId, funded: journal.evidence[prefix + 'funded'], reasonHash }));
      await step(prefix + 'void', config.referee, config.escrowAddress, 'void_room', { room_id: roomId, reason_hash: reasonHash, evidence_hash: evidenceHash });
      if (!journal.evidence[prefix + 'voided']) {
        const voided = await pinnedState(roomId); assert.equal(voided.room.status, '3');
        assert.equal(voided.room.void_reason_hash, reasonHash); assert.equal(voided.room.void_evidence_hash, evidenceHash);
        journal.evidence[prefix + 'voided'] = voided; await save();
      }
      for (const actor of config.entrants) {
        const key = prefix + actor.walletId + '/void-refund';
        await step(key, actor, config.escrowAddress, 'refund', roomId);
        if (item.currency === 0) nativeTransfer(key, actor.address, entry);
      }
    } else {
      expected = expectedAwards(entry, String(quantum), item.ranks);
      const ranks = config.entrants.map((a, i) => ({ player: a.address, rank: item.ranks[i] }));
      const resultHash = sha256(stable({ matchId, ranks, synthetic: true }));
      const transcriptHash = sha256(stable({ matchId, termsHash, resultHash, steps: 'fund,start,referee-rank,claim,treasury' }));
      await step(prefix + 'settle', config.referee, config.escrowAddress, 'finalize_room', {
        room_id: roomId, match_id: matchId, transcript_hash: transcriptHash, result_hash: resultHash, ranks,
      });
      if (!journal.evidence[prefix + 'settled']) {
        const settled = await pinnedState(roomId);
        assert.equal(settled.room.status, '2'); assert.equal(settled.room.result_hash, resultHash);
        assert.equal(settled.room.transcript_hash, transcriptHash);
        assert.deepEqual(settled.claims.map((c: any) => c.amount), expected.amounts);
        assert.equal(settled.room.treasury_amount, expected.treasury);
        journal.evidence[prefix + 'settled'] = settled; await save();
      }
      for (const [index, amount] of expected.amounts.entries()) if (BigInt(amount) > 0n) {
        const actor = config.entrants[index], key = prefix + actor.walletId + '/claim';
        await step(key, actor, config.escrowAddress, 'claim', roomId);
        if (item.currency === 0) nativeTransfer(key, actor.address, amount);
      }
      if (BigInt(expected.treasury) > 0n) {
        const key = prefix + 'treasury';
        await step(key, config.referee, config.escrowAddress, 'claim_treasury', roomId);
        if (item.currency === 0) nativeTransfer(key, config.treasuryAddress, expected.treasury);
      }
    }
    const finished = await pinnedState(roomId); assert.equal(finished.room.held, '0');
    assert.equal(BigInt(finished.room.paid_out) + BigInt(finished.room.refunded), BigInt(finished.room.deposited));
    assert.equal(finished.room.paid_out, item.voided ? '0' : String(BigInt(entry) * 8n));
    if (item.voided) { assert.equal(finished.room.refunded, String(BigInt(entry) * 9n)); assert.equal(finished.room.paid.length, 0); }
    else {
      assert(finished.claims.every((c: any) => BigInt(c.amount) === 0n || c.claimed === true));
      if (BigInt(expected.treasury) > 0n) assert.equal(finished.room.treasury_claimed, true);
    }
    journal.evidence[prefix + 'finished'] = finished;
    const before: any = journal.evidence[prefix + 'assetBefore'];
    const after = await assetBalances(item.currency);
    assert.equal(after.escrow, before.escrow, 'Other-room reserves stay untouched.');
    if (item.currency === 1) {
      for (let i = 0; i < config.entrants.length; i += 1) {
        const delta = item.voided ? 0n : -BigInt(entry) + BigInt(expected.amounts[i]);
        assert.equal(BigInt(after.players[i].balance), BigInt(before.players[i].balance) + delta, 'FA2 recipient balance differs from payout or full refund.');
      }
      assert.equal(BigInt(after.treasury), BigInt(before.treasury) + BigInt(expected.treasury));
    }
    journal.evidence[prefix + 'assetAfter'] = after; await save();
  }
  journal.status = 'passed'; await save(); return journal;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2), execute = args.includes('--execute');
  const positional = args.filter(v => v !== '--execute');
  assert.equal(positional.length, 2, 'Usage: tsx contracts/wtfiap-escrow/shadownet-proof.ts <public-config.json> <output-directory> [--execute]');
  const config = JSON.parse(await readFile(positional[0], 'utf8')) as ProofConfig;
  const result = await runProof(config, positional[1], execute);
  console.log(JSON.stringify({ status: result.status, journal: path.join(positional[1], 'journal.json'), operations: Object.keys(result.operations).length }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('WTFIAP rehearsal stopped: ' + (error instanceof Error ? error.message : String(error))); process.exitCode = 1; });
}
