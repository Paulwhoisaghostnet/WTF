import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { ParameterSchema, Schema } from '@taquito/michelson-encoder';
import { packDataBytes } from '@taquito/michel-codec';
import { encodeExpr } from '@taquito/utils';
import { assertFundingReceipt, measuredFundingDeficit, assertAppliedReceipt, expectedAwards, stable, validateConfig, type ProofConfig } from './shadownet-proof';
const address = 'tz1dDi8WdWBno7NxkPdikec4W1jZ9yzgcecg';
const hash = 'ab'.repeat(32);
const api: any = JSON.parse(await readFile(new URL('./artifacts/interface.json', import.meta.url), 'utf8'));
const args = { room_id: hash, expected_terms_hash: 'cd'.repeat(32) };
const parameter = new ParameterSchema(api.entrypoints.join_room).EncodeObject(args);
const record: any = { key: 'one', actor: address, walletId: 'e2e-one', destination: 'KT1TezoooozzSmartPyzzSTATiCzzzwwBFA1',
  entrypoint: 'join_room', amountMutez: '10000', parameters: parameter, status: 'injected', preparedLevel: 1, estimate: {} };
function operation() { return { contents: [{ kind: 'transaction', source: address, destination: record.destination, amount: '10000',
  parameters: { entrypoint: 'join_room', value: parameter }, metadata: { operation_result: { status: 'applied' },
  internal_operation_results: [{ result: { status: 'applied' } }] } }] }; }
test('compiled DTO encoding and applied receipt require exact actor, amount, parameters and internal success', () => {
  assertAppliedReceipt(operation(), record, api.entrypoints.join_room);
  for (const mutate of [
    (o: any) => { o.contents[0].source = 'wrong'; },
    (o: any) => { o.contents[0].amount = '10001'; },
    (o: any) => { o.contents[0].destination = 'wrong'; },
    (o: any) => { o.contents[0].parameters.entrypoint = 'claim'; },
    (o: any) => { o.contents[0].metadata.operation_result.status = 'backtracked'; },
    (o: any) => { o.contents[0].metadata.internal_operation_results[0].result.status = 'failed'; },
    (o: any) => { o.contents[0].parameters.value = new ParameterSchema(api.entrypoints.join_room).EncodeObject({ ...args, room_id: 'ff'.repeat(32) }); },
  ]) { const o = structuredClone(operation()); mutate(o); assert.throws(() => assertAppliedReceipt(o, record, api.entrypoints.join_room)); }
});
test('room and unannotated pair claim big-map keys encode through compiled schemas', () => {
  function find(n: any, name: string): any { if (n.annots?.includes('%' + name)) return n; return n.args?.map((c: any) => find(c, name)).find(Boolean); }
  for (const [name, key] of [['rooms', hash], ['claims', [hash, address]]] as const) {
    const schema = new Schema(find(api.storageType, name));
    const encoded = schema.EncodeBigMapKey(key as any);
    assert(encodeExpr(packDataBytes(encoded.key as any, encoded.type as any).bytes).startsWith('expr'));
  }
});
test('proof config requires explicit Shadownet and eight distinct e2e identities', () => {
  const config: ProofConfig = { schemaVersion: 2, network: 'shadownet', chainId: 'NetXsqzbfFenSTS', rpcUrl: 'https://tezos-shadownet.octez.io/', proofId: 'local-fixture',
    escrowAddress: record.destination, artifactPath: 'artifact.json', artifactSha256: hash, buildManifestPath: 'manifest.json',
    creator: { walletId: 'root', address }, referee: { walletId: 'root', address },
    entrants: Array.from({ length: 8 }, (_, i) => ({ walletId: 'e2e-' + i, address: 'tz1fixture' + i })),
    treasuryAddress: address, entryAtomic: { XTZ: '10000', WTF: '1000000' }, wtfTokenAddress: record.destination, wtfTokenId: '0', rulesHash: hash, seedCommitment: hash };
  validateConfig(config);
  assert.throws(() => validateConfig({ ...config, chainId: 'NetXdQprcVkpaWU' }));
  assert.throws(() => validateConfig({ ...config, entrants: config.entrants.slice(1) }));
  assert.throws(() => validateConfig({ ...config, entrants: config.entrants.map(() => config.entrants[0]) }));
  assert.throws(() => validateConfig({ ...config, rpcUrl: 'https://user:secret@example.invalid' }));
  assert.throws(() => validateConfig({ ...config, entryAtomic: { XTZ: '10001', WTF: '1000000' } }));
  assert.throws(() => validateConfig({ ...config, entryAtomic: { XTZ: '10000', WTF: '10000' } }));
  assert.equal(stable({ b: 1, a: 2 }), stable({ a: 2, b: 1 }));
});

test('live oracle validates both approved quanta and tie rounding before treasury remainder', () => {
  assert.deepEqual(expectedAwards('10000', '10000', [1,2,3,4,5,6,7,8]), {amounts:['40000','20000','10000','0','0','0','0','0'],treasury:'10000'});
  assert.deepEqual(expectedAwards('10000', '10000', [1,2,2,4,5,6,7,8]), {amounts:['40000','20000','20000','0','0','0','0','0'],treasury:'0'});
  assert.deepEqual(expectedAwards('1000000', '1000000', [1,2,3,3,5,6,7,8]), {amounts:['4000000','2000000','0','0','0','0','0','0'],treasury:'2000000'});
  assert.throws(() => expectedAwards('10000','10000',[1,2,2,3,5,6,7,8]));
  for (let bits=0; bits<64; bits++) {
    const ranks=[1,2]; for(let place=3;place<=8;place++) ranks.push(bits & (1<<(place-3)) ? place : ranks.at(-1)!);
    for(const q of ['10000','1000000']) {
      const result=expectedAwards(q,q,ranks);
      assert.equal(result.amounts.reduce((sum,n)=>sum+BigInt(n),0n)+BigInt(result.treasury),BigInt(q)*8n);
      assert.deepEqual(expectedAwards(q,q,[...ranks].reverse()),{amounts:[...result.amounts].reverse(),treasury:result.treasury});
    }
  }
});
test('compiled refund, technical void and treasury DTOs have recipient-bound schemas', () => {
  assert.equal(api.entrypoints.refund.prim,'bytes');
  assert.equal(api.entrypoints.claim_treasury.prim,'bytes');
  const params={room_id:hash,reason_hash:'cd'.repeat(32),evidence_hash:'ef'.repeat(32)};
  const schema=new ParameterSchema(api.entrypoints.void_room);
  assert.deepEqual(schema.Execute(schema.EncodeObject(params)),params);
});

test('funding uses only a positive RPC shortfall for the exact actor and validates native recipients', () => {
  const errors=[{id:'proto.025-PsUshuai.contract.balance_too_low',contract:address,balance:'10',amount:'10000'}];
  assert.equal(measuredFundingDeficit({errors},address)?.deficit,9990n);
  assert.equal(measuredFundingDeficit({body:JSON.stringify(errors)},address)?.deficit,9990n);
  assert.equal(measuredFundingDeficit({errors},'another-wallet'),undefined);
  assert.equal(measuredFundingDeficit({errors:[{...errors[0],amount:'9'}]},address),undefined);
  assert.equal(measuredFundingDeficit({errors:[{...errors[0],id:'unrelated'}]},address),undefined);
  const record:any={actor:address,destination:'tz1recipient',amountMutez:'9990'};
  const op:any={contents:[{kind:'transaction',source:address,destination:record.destination,amount:'9990',metadata:{operation_result:{status:'applied'}}}]};
  assertFundingReceipt(op,record);
  for(const mutate of [
    (x:any)=>{x.contents[0].destination='wrong';},
    (x:any)=>{x.contents[0].amount='9991';},
    (x:any)=>{x.contents[0].metadata.operation_result.status='failed';},
    (x:any)=>{x.contents[0].parameters={entrypoint:'default',value:{prim:'Unit'}};},
  ]){const tampered=structuredClone(op);mutate(tampered);assert.throws(()=>assertFundingReceipt(tampered,record));}
});
