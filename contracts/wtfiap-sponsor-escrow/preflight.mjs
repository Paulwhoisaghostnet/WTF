#!/usr/bin/env node
/** Read-only, network-explicit sponsor-escrow origination preflight. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MichelsonMap, TezosToolkit } from '@taquito/taquito';
import { Schema } from '@taquito/michelson-encoder';
import { localForger } from '@taquito/local-forging';
import { getPkhfromPk } from '@taquito/utils';

const dir = path.dirname(fileURLToPath(import.meta.url));
const [configPath, outputPath] = process.argv.slice(2);
assert(configPath && outputPath, 'Usage: node preflight.mjs <public-config.json> <report.json>');
const config = JSON.parse(await readFile(configPath, 'utf8'));
assert(['mainnet', 'shadownet'].includes(config.network), 'Explicit Tezos L1 network required.');
const chainId = config.network === 'mainnet' ? 'NetXdQprcVkpaWU' : 'NetXsqzbfFenSTS';
const defaults = config.network === 'mainnet'
  ? ['https://tezos-mainnet.octez.io/', 'https://tcinfra.net/rpc/tezos/mainnet']
  : ['https://tezos-shadownet.octez.io/', 'https://tcinfra.net/rpc/tezos/shadownet'];
const rpc = config.rpcUrl || defaults[0];
assert(defaults.includes(rpc), 'Use the configured primary/fallback RPC for the selected network.');
const sha = value => createHash('sha256').update(value).digest('hex');
const bytes = await readFile(path.join(dir, 'artifacts/contract.json'));
const manifest = JSON.parse(await readFile(path.join(dir, 'artifacts/build-manifest.json'), 'utf8'));
assert.equal(sha(bytes), manifest.artifacts['contract.json'].sha256, 'Artifact identity mismatch.');
const code = JSON.parse(bytes);
const storageType = code.find(item => item.prim === 'storage').args[0];
const schema = new Schema(storageType);
const value = {
  cash_claims: new MichelsonMap(), lot_claims: new MichelsonMap(),
  rooms: new MichelsonMap(), room_creator: config.roomCreator,
  wtf_token_address: config.wtfTokenAddress, wtf_token_id: config.wtfTokenId,
  treasury_address: config.treasuryAddress,
  xtz_paid_room_house_fee: config.xtzPaidRoomHouseFee,
  xtz_quantum: '10000', wtf_quantum: '1000000',
};
assert(schema.Typecheck(value), 'Constructor storage does not match compiled type.');
const init = schema.Encode(value);
const toolkit = new TezosToolkit(rpc);
assert.equal(await toolkit.rpc.getChainId(), chainId, 'RPC chain mismatch.');
const block = await toolkit.rpc.getBlockHash();
const [constants, balance, managerKey] = await Promise.all([
  toolkit.rpc.getConstants({ block }), toolkit.rpc.getBalance(config.source, { block }),
  toolkit.rpc.getManagerKey(config.source, { block }),
]);
const gas = constants.hard_gas_limit_per_operation.toString();
async function check(endpoint, body) {
  const response = await fetch(rpc.replace(/\/+$/, '') + '/chains/main/blocks/' + block +
    '/helpers/scripts/' + endpoint, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = await response.text();
  assert(response.ok, `${endpoint}: ${response.status} ${text.slice(0, 2000)}`);
  return JSON.parse(text);
}
const [codeCheck, dataCheck, size] = await Promise.all([
  check('typecheck_code', { program: code, gas, show_types: false }),
  check('typecheck_data', { data: init, type: storageType, gas }),
  check('script_size', { program: code, storage: init, gas }),
]);
const forged = await localForger.forge({ branch: block, contents: [{
  kind: 'origination', source: config.source, fee: '0', counter: '1',
  gas_limit: gas, storage_limit: '100000', balance: '0',
  script: { code, storage: init },
}] });
const report = {
  schemaVersion: 1, mode: 'read-only', network: config.network, chainId,
  rpcUrl: rpc, block, artifactSha256: sha(bytes), initSha256: sha(JSON.stringify(init)),
  source: config.source, roomCreator: config.roomCreator,
  sourceBalanceMutez: balance.toFixed(),
  houseFeeMutez: config.xtzPaidRoomHouseFee,
  codeCheck: { typechecked: true, remainingGas: codeCheck.gas },
  dataCheck: { typechecked: true, remainingGas: dataCheck.gas },
  scriptSize: size, forgedOperationBytes: forged.length / 2,
  estimate: null,
};
const publicKey = typeof managerKey === 'string' ? managerKey : config.sourcePublicKey;
try {
  assert(publicKey, 'Source has no revealed manager key; provide only its public key.');
  assert.equal(getPkhfromPk(publicKey), config.source, 'Source public key mismatch.');
  toolkit.setProvider({ signer: {
    publicKeyHash: async () => config.source, publicKey: async () => publicKey,
    secretKey: async () => { throw new Error('Read-only preflight has no secret key.'); },
    sign: async () => { throw new Error('Read-only preflight cannot sign.'); },
  } });
  const estimate = await toolkit.estimate.originate({ code, init });
  report.estimate = {
    suggestedFeeMutez: String(estimate.suggestedFeeMutez),
    burnFeeMutez: String(estimate.burnFeeMutez),
    gasLimit: String(estimate.gasLimit),
    storageLimit: String(estimate.storageLimit),
    requiredMutez: String(BigInt(estimate.suggestedFeeMutez) + BigInt(estimate.burnFeeMutez)),
  };
} catch (error) {
  report.estimateUnavailable = String(error?.message || error);
}
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ report: outputPath, network: report.network,
  artifactSha256: report.artifactSha256, forgedOperationBytes: report.forgedOperationBytes,
  estimate: report.estimate, estimateUnavailable: report.estimateUnavailable }));
