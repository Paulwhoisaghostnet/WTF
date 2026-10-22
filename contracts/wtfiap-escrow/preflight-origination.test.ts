import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { Schema } from '@taquito/michelson-encoder';
import { typedInit, publicRpcError, rpcCheckSummary, type PreflightConfig } from './preflight-origination';
const code: any = JSON.parse(await readFile(new URL('./artifacts/contract.json', import.meta.url), 'utf8'));
const tokenCode: any = JSON.parse(await readFile(new URL('./artifacts/dummy-wtf-contract.json', import.meta.url), 'utf8'));
const tokenInit: any = JSON.parse(await readFile(new URL('./artifacts/dummy-wtf-storage.json', import.meta.url), 'utf8'));
const base: PreflightConfig = { kind: 'escrow', network: 'shadownet', expectedChainId: 'NetXsqzbfFenSTS', rpcUrl: 'https://tezos-shadownet.octez.io/',
  artifactPath: 'fixture', artifactSha256: 'ab'.repeat(32), creator: 'tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM', source: 'tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM',
  treasuryAddress: 'tz1QBFTdinTExQ2YU6HhLihXFMhrqM4BS3cM', wtfTokenAddress: 'KT1TezoooozzSmartPyzzSTATiCzzzwwBFA1', wtfTokenId: '0' };
test('typed escrow init uses only supplied creator/token and empty liabilities', () => {
  const type = code.find((n: any) => n.prim === 'storage').args[0];
  const value = new Schema(type).Execute(typedInit(base, type));
  assert.equal(value.room_creator, base.creator); assert.equal(value.wtf_token_address, base.wtfTokenAddress);
  assert.equal(value.treasury_address, base.treasuryAddress);
  assert.equal(value.xtz_quantum.toString(), '10000'); assert.equal(value.wtf_quantum.toString(), '1000000');
  assert.equal(value.wtf_token_id.toString(), '0'); assert.equal(value.rooms.size, 0); assert.equal(value.claims.size, 0);
});
test('dummy fixture preserves standard token metadata and changes only test admin', () => {
  const type = tokenCode.find((n: any) => n.prim === 'storage').args[0];
  const value = new Schema(type).Execute(typedInit({ ...base, kind: 'dummy-fa2' }, type, tokenInit));
  assert.equal(value.administrator, base.creator); assert.equal(value.ledger.size, 0);
  assert.throws(() => typedInit({ ...base, kind: 'dummy-fa2', network: 'mainnet' }, type, tokenInit));
});
test('preflight source contains no signer/keyring or send path', async () => {
  const source = await readFile(new URL('./preflight-origination.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /getSigner\(|PlatformWalletKeyring|\.send\(|\.contract\.originate\(|\.inject\(/);
  assert.match(source, /tezos\.estimate\.originate/);
});

test('preflight reports hash type maps and retain structured public RPC balance errors', () => {
  const response = { gas: '10', type_map: [{ location: 1, stack_before: [] }] };
  const summary = rpcCheckSummary(response);
  assert.equal(summary.typechecked, true); assert.equal(summary.remainingGas, '10');
  assert.equal((summary.responseSha256 as string).length, 64); assert(!('type_map' in summary));
  const error = Object.assign(new Error('balance too low'), { errors: [{ id: 'contract.balance_too_low', balance: '745372', amount: '1713250' }], secretKey: 'never-include' });
  const details = publicRpcError(error);
  assert.deepEqual(details.rpcErrors, error.errors); assert(!('secretKey' in details));
});
