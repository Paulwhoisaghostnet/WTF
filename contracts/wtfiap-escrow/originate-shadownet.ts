#!/usr/bin/env tsx
/** Explicitly coordinated Shadownet origination. Default is read-only preflight. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TezosToolkit } from '@taquito/taquito';
import { Schema } from '@taquito/michelson-encoder';
import { preflight, type PreflightConfig } from './preflight-origination';
import { stable } from './shadownet-proof';
import { assertTypedScriptIdentity } from './script-identity';
import { buildToolkit, signerEnv, SHADOWNET_CHAIN_ID } from '../../scripts/pasta-protocol/shadownet-proof-kit';
import * as keyringNamespace from '../../extensions/wtf-operator-signer/src/keyring';
const keyringModule = 'default' in keyringNamespace ? (keyringNamespace as typeof keyringNamespace & { default: typeof keyringNamespace }).default : keyringNamespace;
const { PlatformWalletKeyring } = keyringModule;
const hash = (v: string | Uint8Array) => createHash('sha256').update(v).digest('hex');
async function save(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true });
  const handle = await open(file + '.tmp', 'w', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); } finally { await handle.close(); }
  await rename(file + '.tmp', file);
  const dir = await open(path.dirname(file), 'r'); try { await dir.sync(); } finally { await dir.close(); }
}
function clean(v: any): any {
  if (v?.constructor?.name === 'BigNumber') return v.toFixed();
  if (v?.constructor?.name === 'MichelsonMap') return [...v.entries()].map(([k, value]: any) => [clean(k), clean(value)]);
  if (Array.isArray(v)) return v.map(clean);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, value]) => [k, clean(value)]));
  return v;
}
export async function originate(config: PreflightConfig & { walletId: string }, output: string, execute: boolean) {
  assert(config.network === 'shadownet' || config.network === 'mainnet');
  assert.equal(config.expectedChainId, config.network === 'shadownet' ? SHADOWNET_CHAIN_ID : 'NetXdQprcVkpaWU');
  assert(config.walletId); // Immutable creator may be the explicitly configured hosted referee; signer remains bound to source.
  const file = path.join(output, 'origination.json'), configHash = hash(stable(config));
  let journal: any;
  try { journal = JSON.parse(await readFile(file, 'utf8')); assert.equal(journal.configHash, configHash); }
  catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  const bytes = await readFile(config.artifactPath); assert.equal(hash(bytes), config.artifactSha256);
  const code = JSON.parse(bytes.toString()), schema = new Schema(code.find((n: any) => n.prim === 'storage').args[0]);
  if (!journal) {
    const report = await preflight(config, path.join(output, 'preflight'));
    journal = { schemaVersion: 1, network: config.network, configHash, config, status: 'read-only', preflight: report };
    await save(file, journal);
  }
  const init = JSON.parse(await readFile(path.join(output, 'preflight/init.json'), 'utf8'));
  assert.equal(hash(JSON.stringify(init)), journal.preflight.initSha256);
  if (!execute) return journal;
  if (config.kind === 'escrow') {
    const manifest = JSON.parse(await readFile(path.join(path.dirname(config.artifactPath), 'build-manifest.json'), 'utf8'));
    assert.equal(manifest.policyStatus, 'owner-approved'); assert.equal(manifest.artifacts['contract.json'].sha256, config.artifactSha256);
  }
  const readonly = new TezosToolkit(config.rpcUrl);
  assert.equal(await readonly.rpc.getChainId(), config.expectedChainId);
  if (journal.status === 'applied') {
    const script = await readonly.rpc.getScript(journal.contractAddress);
    assertTypedScriptIdentity(script.code, code, 'Applied deployment code changed.');
    return journal;
  }
  if (journal.status === 'prepared') assert(journal.operationHash, 'Unknown origination send outcome. Reconcile the prepared intent; never resend automatically.');
  if (!journal.operationHash) {
    const keyring = new PlatformWalletKeyring(await signerEnv(config.rpcUrl));
    const { wallet, signer } = await keyring.getSigner(config.walletId);
    assert.equal(wallet.network, config.network); assert.equal(wallet.address, config.source);
    assert.equal(await signer.publicKeyHash(), config.source);
    const toolkit = buildToolkit(signer, config.rpcUrl); assert.equal(await toolkit.rpc.getChainId(), config.expectedChainId);
    const estimate = await toolkit.estimate.originate({ code, init });
    const required = BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez);
    const balance = BigInt((await toolkit.tz.getBalance(config.source)).toFixed());
    assert(balance >= required, `Measured origination needs ${required} mutez; balance ${balance}.`);
    journal.status = 'prepared'; journal.preparedLevel = (await toolkit.rpc.getBlockHeader()).level;
    journal.estimate = { suggestedFeeMutez: String(estimate.suggestedFeeMutez), burnFeeMutez: String(estimate.burnFeeMutez), gasLimit: String(estimate.gasLimit), storageLimit: String(estimate.storageLimit), balanceMutez: String(balance), requiredMutez: String(required) };
    await save(file, journal);
    const op = await toolkit.contract.originate({ code, init });
    journal.operationHash = op.hash; journal.status = 'injected'; await save(file, journal);
    console.log(JSON.stringify({kind: config.kind, status: 'injected', operationHash: op.hash}));
    await op.confirmation(3); // inclusion plus the two Tenderbake successor blocks
  }
  const finalized = await readonly.rpc.getBlockHash({block:'head~2'}), header = await readonly.rpc.getBlockHeader({block:finalized});
  let found: any;
  for(let level=journal.preparedLevel;level<=header.level;level++) {
    const blockHash=await readonly.rpc.getBlockHash({block:finalized+'~'+(header.level-level)});
    const block=await readonly.rpc.getBlock({block:blockHash});
    const operation=block.operations.flat().find((op:any)=>op.hash===journal.operationHash);
    if(operation) { found={operation,level,blockHash}; break; }
  }
  assert(found, 'Injected origination is not yet finalized; preserve journal and resume.');
  const origins=found.operation.contents.filter((c:any)=>c.kind==='origination'); assert.equal(origins.length,1);
  const tx=origins[0]; assert.equal(tx.source,config.source); assert.equal(tx.balance,'0');
  assertTypedScriptIdentity(tx.script.code,code,'Applied origination code differs.');
  assert.equal(stable(clean(schema.Execute(tx.script.storage))),stable(clean(schema.Execute(init))),'Applied init differs.');
  for(const content of found.operation.contents) {
    assert.equal(content.metadata.operation_result.status,'applied');
    for(const internal of content.metadata.internal_operation_results||[]) assert.equal(internal.result.status,'applied');
  }
  const addresses=tx.metadata.operation_result.originated_contracts; assert.equal(addresses.length,1);
  const script=await readonly.rpc.getScript(addresses[0],{block:finalized});
  const canonicalCodeSha256=assertTypedScriptIdentity(script.code,code,'Finalized on-chain code differs.');
  const storage=clean(schema.Execute(script.storage));
  if(config.kind==='escrow') {
    assert.equal(storage.room_creator,config.creator); assert.equal(storage.treasury_address,config.treasuryAddress);
    assert.equal(storage.wtf_token_address,config.wtfTokenAddress); assert.equal(storage.wtf_token_id,config.wtfTokenId);
    assert.equal(storage.xtz_quantum,'10000'); assert.equal(storage.wtf_quantum,'1000000');
  } else assert.equal(storage.administrator,config.creator);
  journal.status='applied'; journal.contractAddress=addresses[0]; journal.canonicalCodeSha256=canonicalCodeSha256;
  journal.inclusion={level:found.level,blockHash:found.blockHash}; journal.finalized={level:header.level,blockHash:finalized};
  journal.receipt={contents:found.operation.contents}; journal.storage=storage; await save(file,journal); return journal;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const args=process.argv.slice(2),execute=args.includes('--execute'),pos=args.filter(v=>v!=='--execute');
  assert.equal(pos.length,2,'Usage: tsx originate-shadownet.ts <public-config.json> <proof-directory> [--execute]');
  const config=JSON.parse(await readFile(pos[0],'utf8')); assert.equal(config.network,'shadownet');
  originate(config,pos[1],execute).then(r=>console.log(JSON.stringify({status:r.status,contractAddress:r.contractAddress,operationHash:r.operationHash}))).catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
}
