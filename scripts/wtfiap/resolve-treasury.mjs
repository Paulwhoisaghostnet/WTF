#!/usr/bin/env node
// Read-only Mainnet wtf.tez resolution, pinned to a finalized block.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TezosToolkit } from '@taquito/taquito';

const rpcUrl = process.env.WTFIAP_TREASURY_RESOLUTION_RPC || 'https://tezos-mainnet.octez.io/';
const tezos = new TezosToolkit(rpcUrl);
assert.equal(await tezos.rpc.getChainId(), 'NetXdQprcVkpaWU');
const block = await tezos.rpc.getBlockHash({ block: 'head~2' });
const header = await tezos.rpc.getBlockHeader({ block });
const checkAddress = 'KT1F7JKNqwaoLzRsMio1MQC7zv3jG9dHcDdJ';
const proxy = await tezos.contract.at(checkAddress);
const proxyStorage = await proxy.storage(undefined, { block });
const registryAddress = proxyStorage.contract;
assert(typeof registryAddress === 'string' && registryAddress.startsWith('KT1'));
const registry = await tezos.contract.at(registryAddress);
const storage = await registry.storage(undefined, { block });
const unwrap = value => value == null || value.None !== undefined ? null : value.Some ?? value;
const record = await storage.store.records.get(Buffer.from('wtf.tez').toString('hex'), block);
assert(record, 'wtf.tez record missing');
const address = unwrap(record.address);
const expiryKey = unwrap(record.expiry_key);
assert(address && expiryKey, 'wtf.tez must resolve to an address with an expiry');
const expiry = await storage.store.expiry_map.get(expiryKey, block);
const expiresAt = new Date(typeof expiry === 'object' && expiry.toFixed ? Number(expiry.toFixed()) * 1000 : expiry);
assert(Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > Date.parse(header.timestamp), 'wtf.tez expired');
const report = { schemaVersion: 1, mode: 'read-only', domain: 'wtf.tez', network: 'mainnet',
  chainId: 'NetXdQprcVkpaWU', rpcUrl, block, level: header.level, blockTimestamp: header.timestamp,
  checkAddress, registryAddress, address, owner: record.owner, expiresAtUtc: expiresAt.toISOString(),
  resolutionSource: 'https://developers.tezos.domains/interoperability/name-resolution' };
const output = process.argv[2];
assert(output, 'Usage: node scripts/wtfiap/resolve-treasury.mjs <public-report.json>');
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
