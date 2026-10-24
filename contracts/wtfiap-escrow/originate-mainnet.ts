#!/usr/bin/env tsx
/** Exact Mainnet WTF escrow origination; read-only preflight unless --execute. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { originate } from './originate-shadownet';

const args = process.argv.slice(2);
const execute = args.includes('--execute');
const positional = args.filter(arg => arg !== '--execute');
assert.equal(positional.length, 2, 'Usage: tsx originate-mainnet.ts <public-config.json> <proof-directory> [--execute]');
const config = JSON.parse(await readFile(positional[0], 'utf8'));
const approved = JSON.parse(await readFile(path.resolve('contracts/wtfiap-escrow/mainnet-preparation.json'), 'utf8'));
assert.equal(config.kind, 'escrow');
assert.equal(config.network, 'mainnet');
assert.equal(config.expectedChainId, approved.chainId);
assert.equal(config.creator, approved.creatorAndReferee);
assert.equal(config.wtfTokenAddress, approved.wtfToken.contract);
assert.equal(config.wtfTokenId, approved.wtfToken.tokenId);
assert.equal(config.treasuryAddress, approved.resolvedTreasury);
assert.equal(config.artifactSha256, approved.artifactSha256);
assert.equal(path.resolve(config.artifactPath), path.resolve(approved.artifactPath));
assert(['https://tezos-mainnet.octez.io/', 'https://tcinfra.net/rpc/tezos/mainnet'].includes(config.rpcUrl),
  'Mainnet origination must use a configured Mainnet RPC.');
assert(config.walletId, 'An explicitly selected Mainnet payer wallet ID is required.');
const result = await originate(config, positional[1], execute);
console.log(JSON.stringify({ status: result.status, contractAddress: result.contractAddress,
  operationHash: result.operationHash }));
