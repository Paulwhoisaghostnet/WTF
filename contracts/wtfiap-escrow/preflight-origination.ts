#!/usr/bin/env tsx
/** Read-only target-protocol origination check. No keyring, signing or injection. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MichelsonMap, TezosToolkit } from '@taquito/taquito';
import { Schema } from '@taquito/michelson-encoder';
import { getPkhfromPk } from '@taquito/utils';
import { hashMichelsonScriptCode } from '../../scripts/pasta-protocol/pasta-michelson-script-identity';
export type PreflightConfig = {
  kind: 'escrow' | 'dummy-fa2'; network: 'mainnet' | 'shadownet'; expectedChainId: string;
  rpcUrl: string; artifactPath: string; artifactSha256: string; creator: string; source: string;
  sourcePublicKey?: string; treasuryAddress?: string; wtfTokenAddress?: string; wtfTokenId?: string; storageTemplatePath?: string;
};
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
export function typedInit(config: PreflightConfig, storageType: any, template?: any): any {
  const schema = new Schema(storageType);
  let value: any;
  if (config.kind === 'escrow') {
    assert(config.treasuryAddress, 'Explicit verified treasury address is required.');
    assert(config.wtfTokenAddress && /^(0|[1-9][0-9]*)$/.test(config.wtfTokenId ?? ''));
    value = { claims: new MichelsonMap(), room_creator: config.creator, rooms: new MichelsonMap(),
      wtf_token_address: config.wtfTokenAddress, wtf_token_id: config.wtfTokenId,
      treasury_address: config.treasuryAddress, xtz_quantum: "10000", wtf_quantum: "1000000" };
  } else {
    assert(config.kind === 'dummy-fa2' && config.network === 'shadownet', 'Dummy token rehearsal is Shadownet only.');
    assert(template, 'Use exact standards-based DummyWtfFA2 initial storage.');
    value = schema.Execute(template);
    assert('administrator' in value); value.administrator = config.creator;
    assert(value.ledger.size === 0, 'Dummy template must contain no minted ledger entries.');
  }
  const encoded = schema.Encode(value);
  assert(schema.Typecheck(value), 'Structured storage must typecheck against its schema.');
  return encoded;
}
async function post(rpc: string, block: string, endpoint: string, body: unknown): Promise<any> {
  const response = await fetch(rpc.replace(/\/+$/, '') + '/chains/main/blocks/' + block + '/helpers/scripts/' + endpoint,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  assert(response.ok, JSON.stringify({ endpoint, status: response.status, result }));
  return result;
}
export function publicRpcError(error: any): Record<string, unknown> {
  const details: Record<string, unknown> = {
    name: error?.name ?? 'Error', message: error instanceof Error ? error.message : String(error),
  };
  if (Array.isArray(error?.errors)) details.rpcErrors = error.errors;
  if (error?.status !== undefined) details.httpStatus = error.status;
  if (error?.statusCode !== undefined) details.httpStatus = error.statusCode;
  if (typeof error?.body === 'string') {
    try { details.rpcResponse = JSON.parse(error.body); } catch { /* non-JSON bodies have no structured RPC errors */ }
  }
  return details;
}
export function rpcCheckSummary(response: any): Record<string, unknown> {
  return { typechecked: true, remainingGas: response?.gas ?? null,
    responseSha256: sha256(JSON.stringify(response)) };
}
export async function preflight(config: PreflightConfig, outputDir: string): Promise<any> {
  assert(config.network === 'mainnet' || config.network === 'shadownet', 'Select an explicit supported Tezos L1 network.');
  assert.equal(config.expectedChainId, config.network === 'mainnet' ? 'NetXdQprcVkpaWU' : 'NetXsqzbfFenSTS');
  const url = new URL(config.rpcUrl); assert(!url.username && !url.password && !url.search && !url.hash);
  assert(['https:', 'http:'].includes(url.protocol));
  const bytes = await readFile(config.artifactPath); assert.equal(sha256(bytes), config.artifactSha256);
  const code = JSON.parse(bytes.toString()); const storageType = code.find((v: any) => v.prim === 'storage').args[0];
  const template = config.storageTemplatePath ? JSON.parse(await readFile(config.storageTemplatePath, 'utf8')) : undefined;
  const init = typedInit(config, storageType, template);
  const tezos = new TezosToolkit(config.rpcUrl);
  assert.equal(await tezos.rpc.getChainId(), config.expectedChainId);
  const block = await tezos.rpc.getBlockHash();
  const [header, metadata, constants, balance, managerKey] = await Promise.all([
    tezos.rpc.getBlockHeader({ block }), tezos.rpc.getBlockMetadata({ block }), tezos.rpc.getConstants({ block }),
    tezos.rpc.getBalance(config.source, { block }), tezos.rpc.getManagerKey(config.source, { block }),
  ]);
  const gas = constants.hard_gas_limit_per_operation.toString();
  const codeCheck = await post(config.rpcUrl, block, 'typecheck_code', { program: code, gas, show_types: false });
  const dataCheck = await post(config.rpcUrl, block, 'typecheck_data', { data: init, type: storageType, gas });
  const size = await post(config.rpcUrl, block, 'script_size', { program: code, storage: init, gas });
  const report: any = {
    schemaVersion: 1, mode: 'read-only', network: config.network, chainId: config.expectedChainId,
    rpcUrl: config.rpcUrl, block, level: header.level, protocol: metadata.protocol,
    artifactSha256: config.artifactSha256, canonicalCodeSha256: hashMichelsonScriptCode(code),
    initSha256: sha256(JSON.stringify(init)), source: config.source, creator: config.creator,
    sourceBalanceMutez: balance.toFixed(), constants: { costPerByte: constants.cost_per_byte.toString(),
      originationSize: constants.origination_size, hardGasLimitPerOperation: gas },
    codeCheck: rpcCheckSummary(codeCheck), dataCheck: rpcCheckSummary(dataCheck), scriptSize: size, estimate: null,
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, 'init.json'), JSON.stringify(init, null, 2) + '\n');
  const publicKey = typeof managerKey === 'string' ? managerKey : config.sourcePublicKey;
  try {
    assert(publicKey, 'Source has no revealed manager key; supply its public key for read-only estimation.');
    assert.equal(getPkhfromPk(publicKey), config.source);
    tezos.setProvider({ signer: {
      publicKeyHash: async () => config.source, publicKey: async () => publicKey,
      secretKey: async (): Promise<never> => { throw new Error('Read-only preflight has no secret key.'); },
      sign: async (): Promise<never> => { throw new Error('Read-only preflight cannot sign.'); },
    } });
    assert.equal(await tezos.rpc.getChainId(), config.expectedChainId);
    const estimate = await tezos.estimate.originate({ code, init });
    report.estimate = { suggestedFeeMutez: String(estimate.suggestedFeeMutez), burnFeeMutez: String(estimate.burnFeeMutez),
      gasLimit: String(estimate.gasLimit), storageLimit: String(estimate.storageLimit),
      requiredMutez: String(BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez)),
      affordable: BigInt(balance.toFixed()) >= BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez) };
  } catch (error) { report.estimateUnavailable = publicRpcError(error); }
  await writeFile(path.join(outputDir, 'preflight.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
async function main(): Promise<void> {
  assert.equal(process.argv.length, 4, 'Usage: tsx preflight-origination.ts <public-config.json> <output-directory>');
  const report = await preflight(JSON.parse(await readFile(process.argv[2], 'utf8')), process.argv[3]);
  console.log(JSON.stringify({ mode: report.mode, network: report.network, protocol: report.protocol,
    typechecked: true, estimate: report.estimate, estimateUnavailable: report.estimateUnavailable,
    report: path.join(process.argv[3], 'preflight.json') }));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error('Read-only preflight failed: ' + (error instanceof Error ? error.message : String(error))); process.exitCode = 1; });
}
