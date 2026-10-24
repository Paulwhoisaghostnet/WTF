#!/usr/bin/env tsx
/** Pinned Mainnet XTZ duel escrow origination. Read-only unless --execute. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { originate } from '../wtfiap-escrow/originate-shadownet';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const positional = args.filter(arg => arg !== '--execute');
assert.equal(positional.length, 1, 'Usage: tsx originate-mainnet.ts <proof-directory> [--execute]');
const config = JSON.parse(await readFile(new URL('./preflight-config.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('./artifacts/build-manifest.json', import.meta.url), 'utf8'));
assert.equal(config.kind, 'escrow');
assert.equal(config.network, 'mainnet');
assert.equal(config.expectedChainId, 'NetXdQprcVkpaWU');
assert.equal(config.source, 'tz1hNbUXWdjPpUuGK3tMWM8uSJzBBGonWB5u');
assert.equal(config.walletId, 'reward-disburser');
assert.equal(config.creator, 'tz1W4pW7zEsovK5tQ3HqfqQAcWifRYeYAUTo');
assert.equal(config.treasuryAddress, 'tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt');
assert.equal(config.artifactSha256, manifest.artifacts['contract.json'].sha256);
assert.equal(path.resolve(config.artifactPath), path.resolve('contracts/wtfiap-mainnet-xtz-escrow/artifacts/contract.json'));
assert(['https://tezos-mainnet.octez.io/', 'https://tcinfra.net/rpc/tezos/mainnet'].includes(config.rpcUrl));
const result = await originate(config, positional[0], execute);
console.log(JSON.stringify({ status: result.status, contractAddress: result.contractAddress,
  operationHash: result.operationHash }));
