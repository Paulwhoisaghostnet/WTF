#!/usr/bin/env tsx
/** Read-only second-source check of finalized public deployment/lifecycle journals. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TezosToolkit } from '@taquito/taquito';
import { SHADOWNET_CHAIN_ID } from '../../scripts/pasta-protocol/shadownet-proof-kit';
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export async function verifyIndexer(proofDirectory: string) {
  const rpcUrl = 'https://tezos-shadownet.octez.io/';
  const api = 'https://api.shadownet.tzkt.io/v1';
  const tezos = new TezosToolkit(rpcUrl);
  assert.equal(await tezos.rpc.getChainId(), SHADOWNET_CHAIN_ID);
  const inputs: Record<string, string> = {};
  const expected: any[] = [];
  for (const name of ['dummy/origination.json', 'escrow/origination.json', 'host-escrow/origination.json']) {
    const bytes = await readFile(path.join(proofDirectory, name)); inputs[name] = hash(bytes);
    const journal = JSON.parse(bytes.toString()); assert.equal(journal.status, 'applied');
    assert.equal(journal.config.expectedChainId, SHADOWNET_CHAIN_ID);
    expected.push({ kind: 'origination', hash: journal.operationHash, source: journal.config.source,
      address: journal.contractAddress, block: journal.inclusion.blockHash, level: journal.inclusion.level });
  }
  const bytes = await readFile(path.join(proofDirectory, 'lifecycle/journal.json'));
  inputs['lifecycle/journal.json'] = hash(bytes);
  const lifecycle = JSON.parse(bytes.toString()); assert.equal(lifecycle.status, 'passed');
  for (const record of Object.values(lifecycle.operations) as any[]) {
    assert.equal(record.status, 'applied');
    expected.push({ kind: 'transaction', key: record.key, hash: record.operationHash, source: record.actor,
      address: record.destination, amount: record.amountMutez, block: record.inclusionBlock, level: record.inclusionLevel });
  }
  for (const name of ['host-funding/journal.json', 'host-mint/journal.json']) {
    const bytes = await readFile(path.join(proofDirectory, name)); inputs[name] = hash(bytes);
    const journal = JSON.parse(bytes.toString()); assert.equal(journal.status, 'passed');
    assert.equal(journal.plan.chainId, SHADOWNET_CHAIN_ID);
    for (const record of Object.values(journal.operations) as any[]) {
      if (record.status === 'satisfied') continue; // No transaction was needed or claimed.
      assert.equal(record.status, 'applied');
      expected.push({ kind: 'transaction', key: name + ':' + record.key, hash: record.operationHash, source: record.actor,
        address: record.destination, amount: record.amountMutez, block: record.inclusionBlock, level: record.inclusionLevel });
    }
  }
  const operations = [];
  for (const intent of expected) {
    const response = await fetch(api + '/operations/' + intent.hash);
    assert(response.ok, `Indexer operation read failed: ${response.status}`);
    const records = await response.json() as any[];
    assert(Array.isArray(records) && records.length > 0);
    for (const record of records) {
      assert.equal(record.hash, intent.hash); assert.equal(record.block, intent.block); assert.equal(record.level, intent.level);
      assert.equal(record.status, 'applied');
    }
    const primary = records.find(r => r.type === intent.kind && r.sender?.address === intent.source
      && (intent.kind === 'origination' ? r.originatedContract?.address === intent.address : r.target?.address === intent.address));
    assert(primary, 'Indexer does not confirm the journaled source and destination.');
    if (intent.kind === 'transaction') assert.equal(String(primary.amount), intent.amount);
    operations.push({ ...intent, indexedRecords: records.map(r => ({ id: r.id, type: r.type, status: r.status,
      sender: r.sender?.address, target: r.target?.address ?? r.originatedContract?.address, amount: r.amount,
      bakerFee: r.bakerFee, storageFee: r.storageFee, allocationFee: r.allocationFee })), responseSha256: hash(JSON.stringify(records)) });
  }
  const report = { status: 'passed', mode: 'read-only', network: 'shadownet', chainId: SHADOWNET_CHAIN_ID,
    rpcUrl, indexer: api, inputs, verifierSha256: hash(await readFile(fileURLToPath(import.meta.url))),
    operations, operationCount: operations.length };
  await writeFile(path.join(proofDirectory, 'indexer-verification.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, 'Usage: tsx verify-shadownet-indexer.ts <proof-directory>');
  verifyIndexer(process.argv[2]).then(r => console.log(JSON.stringify({ status: r.status, operations: r.operationCount })))
    .catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
