import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { hashTypedScript } from "../../../contracts/wtfiap-escrow/script-identity";
import { ParameterSchema } from "@taquito/michelson-encoder";
import { commitment, type FundingRecord, type FundingConfig } from "./funding";
import { fundingConfig, shadownetXtzFundingConfig, mainnetWtfFundingConfig, fundingMonitorConfigs, monitorFundingHeads, rpcEndpoints, tezosFundingChain } from "./funding-contract";
const require = createRequire(import.meta.url);
const rules = require('./rules.cjs');
const wallet = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const contract = "KT1DUZ2nf4Dd1F2BNm3zeg1TwAnA1iKZXbHD";
const code = [{prim:"parameter",args:[{prim:"unit"}]},{prim:"storage",args:[{prim:"unit"}]},{ prim: "code", args: [[{ prim: "CAR" }]] }];
const cfg: FundingConfig = { enabled:true,network:'mainnet',chainId:'NetXdQprcVkpaWU',rpcUrl:'https://explicit.test/rpc',escrowContract:contract,
  scriptHash:hashTypedScript(code),creatorAddress:wallet,refereeAddress:wallet,walletId:'proof',wtfToken:{contract,tokenId:'0',decimals:8},
  rulesHash:'1'.repeat(64),currencyQuantaAtomic:{XTZ:'10000',WTF:'1000000'},treasuryAddress:wallet,prizeRoundingPolicy:'floor-each-prize-to-quantum;remainder-to-wtf.tez-v1',feeQuantumAtomic:'10000',refundPolicy:'test-policy',minimalBlockDelaySeconds:6 };
function fixture() {
  const pins: any[] = [], roomId='2'.repeat(64), termsHash='3'.repeat(64);
  const record = { roomId,termsHash,config:cfg,bindings:[{playerId:'p',userId:'1',walletAddress:wallet}],terms:{currency:'XTZ',entryAtomic:'100'},observations:[] } as unknown as FundingRecord;
  const room:any={terms_hash:termsHash,rules_hash:cfg.rulesHash,seed_commitment:'4'.repeat(64),referee:wallet,currency:'0',entry_amount:'100',quantum:'10000',deposited:'100',refunded:'0',treasury_amount:'0',treasury_claimed:false,void_reason_hash:null,void_evidence_hash:null,entrants:[wallet],paid:[wallet],held:'100',paid_out:'0',status:'0',match_id:null,result_hash:null,transcript_hash:null};
  const storage={room_creator:wallet,wtf_token_address:contract,wtf_token_id:'0',treasury_address:wallet,xtz_quantum:'10000',wtf_quantum:'1000000',rooms:{async get(key:any,block:any){pins.push(['room',key,block]);return room;}},claims:{async get(key:any,block:any){pins.push(['claim',key,block]);return undefined;}}};
  const rpc:any={async getChainId(){return cfg.chainId;},async getBlockHash(input:any){pins.push(['hash',input]);return input.block==='head~2'?'Bfinal':'Bincluded';},
    async getBlockHeader(input:any){pins.push(['header',input]);return {level:100};},async getScript(address:any,input:any){pins.push(['script',address,input]);return {code,storage:[]};}};
  const toolkit={rpc,contract:{async getStorage(address:any,schema:any,block:any){pins.push(['storage',address,block]);return storage;}}};
  return {record,pins,room,storage,rpc,toolkit,chain:tezosFundingChain(()=>toolkit)};
}
test('chain reconciliation pins script, storage and all maps to one finalized hash',async()=>{
  const f=fixture(),result=await f.chain.read(f.record);assert.equal(result!.blockHash,'Bfinal');assert.equal(result!.paid[0],wallet);
  assert.deepEqual(f.pins[0],['hash',{block:'head~2'}]);
  for(const pin of f.pins.filter(p=>['room','claim','storage'].includes(p[0])))assert.equal(pin.at(-1),'Bfinal');
  assert(f.pins.some(p=>p[0]==='script'&&p[2].block==='Bfinal'));
  f.storage.wtf_token_id='1';await assert.rejects(f.chain.read(f.record),/token, treasury or precision/);
  f.storage.wtf_token_id='0';f.record.config={...cfg,scriptHash:'0'.repeat(64)};await assert.rejects(f.chain.read(f.record),/fingerprint/);
});
test('configuration isolates the scoped Shadownet asset and enables only a complete approved deployment',()=>{
  const c=fundingConfig({TEZOS_NETWORK:'shadownet',WTFIAP_WTF_TOKEN_CONTRACT:'KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj',WTFIAP_WTF_TOKEN_ID:'2',WTFIAP_FUNDED_ENABLED:'1'});
  assert.equal(c.network,'shadownet');assert.equal(c.wtfToken.contract,'KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj');assert.equal(c.wtfToken.tokenId,'2');assert.equal(c.enabled,false);
  const missing=fundingConfig({TEZOS_NETWORK:'shadownet'});assert.equal(missing.wtfToken.contract,'');assert.equal(missing.enabled,false);
  const isolated=fundingConfig({TEZOS_NETWORK:'mainnet',WTFIAP_ESCROW_NETWORK:'shadownet',WTF_TOKEN_CONTRACT:contract,WTF_TOKEN_ID:'99',TEZOS_RPC_URL:'https://mainnet-only.example/'});
  assert.equal(isolated.wtfToken.contract,'');assert.equal(isolated.wtfToken.tokenId,'0');assert.equal(isolated.rpcUrl,'https://tezos-shadownet.octez.io/');
  const complete=fundingConfig({TEZOS_NETWORK:'mainnet',WTFIAP_ESCROW_NETWORK:'shadownet',WTFIAP_WTF_TOKEN_CONTRACT:'KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj',WTFIAP_WTF_TOKEN_ID:'0',WTFIAP_ESCROW_CONTRACT:contract,WTFIAP_ESCROW_SCRIPT_HASH:cfg.scriptHash,WTFIAP_REFEREE_ADDRESS:wallet,WTFIAP_ROOM_CREATOR_ADDRESS:wallet,WTFIAP_REFEREE_WALLET_ID:'proof',WTFIAP_TREASURY_ADDRESS:wallet,WTFIAP_CHAIN_MIN_BLOCK_DELAY_SECONDS:'6',WTFIAP_FUNDED_ENABLED:'1'});
  assert.equal(complete.enabled,true);assert.deepEqual(complete.currencyQuantaAtomic,{XTZ:'10000',WTF:'1000000'});assert.match(complete.refundPolicy!,/prestart-withdrawal/);
  assert.equal(rpcEndpoints(cfg).length,1);
  assert.deepEqual(rpcEndpoints({...cfg,rpcUrl:'https://tezos-mainnet.octez.io/'}),['https://tezos-mainnet.octez.io/','https://tcinfra.net/rpc/tezos/mainnet']);
  assert.equal(rules.hashValue(code),commitment(code));
  const manifest=JSON.parse(readFileSync('server/features/wtfiap/runtime/release-manifest.json','utf8'));
  const h=rules.rulesHashFromManifest(manifest);manifest.generatorSha256='new-art';manifest.title='changed-public-label';assert.equal(rules.rulesHashFromManifest(manifest),h);
  const authorityFile=manifest.files.find((x:any)=>x.path==='server/features/wtfiap/runtime/game/server/party-server.cjs');
  assert(authorityFile);authorityFile.sha256='0'.repeat(64);assert.notEqual(rules.rulesHashFromManifest(manifest),h);
});
test('Mainnet WTF requires its own complete lane and never inherits Shadownet settings',()=>{
  const legacy = { WTFIAP_ESCROW_NETWORK:'shadownet', WTFIAP_FUNDED_ENABLED:'1', WTFIAP_ESCROW_CONTRACT:contract,
    WTFIAP_ESCROW_SCRIPT_HASH:cfg.scriptHash, WTFIAP_REFEREE_ADDRESS:wallet, WTFIAP_ROOM_CREATOR_ADDRESS:wallet,
    WTFIAP_REFEREE_WALLET_ID:'shadownet-referee', WTFIAP_WTF_TOKEN_CONTRACT:'KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj',
    WTFIAP_TREASURY_ADDRESS:wallet, WTFIAP_CHAIN_MIN_BLOCK_DELAY_SECONDS:'6' };
  const unavailable=mainnetWtfFundingConfig(legacy);
  assert.equal(unavailable.network,'mainnet');assert.equal(unavailable.enabled,false);assert.equal(unavailable.escrowContract,'');
  const ready=mainnetWtfFundingConfig({...legacy,WTFIAP_MAINNET_FUNDED_ENABLED:'1',WTFIAP_MAINNET_ESCROW_CONTRACT:'KT1'+'3'.repeat(33),
    WTFIAP_MAINNET_ESCROW_SCRIPT_HASH:cfg.scriptHash,WTFIAP_MAINNET_REFEREE_ADDRESS:wallet,WTFIAP_MAINNET_ROOM_CREATOR_ADDRESS:wallet,
    WTFIAP_MAINNET_REFEREE_WALLET_ID:'mainnet-referee',WTFIAP_MAINNET_WTF_TOKEN_CONTRACT:contract,
    WTFIAP_MAINNET_WTF_TOKEN_ID:'0',WTFIAP_MAINNET_TREASURY_ADDRESS:wallet,WTFIAP_MAINNET_CHAIN_MIN_BLOCK_DELAY_SECONDS:'6'});
  assert.equal(ready.enabled,true);assert.equal(ready.network,'mainnet');assert.equal(ready.chainId,'NetXdQprcVkpaWU');
  assert.equal(ready.escrowContract,'KT1'+'3'.repeat(33));
  const wrongXtz=shadownetXtzFundingConfig({WTFIAP_ESCROW_NETWORK:'mainnet',WTFIAP_FUNDED_ENABLED:'1',WTFIAP_ESCROW_CONTRACT:'KT1'+'3'.repeat(33)});
  assert.equal(wrongXtz.network,'shadownet');assert.equal(wrongXtz.escrowContract,'');assert.equal(wrongXtz.enabled,false);
});
test('failed wallet retry requires exact finalized RPC operation; indexer status alone never suffices',async()=>{
  const f=fixture(); f.room.paid=[]; const opHash='o'+'1'.repeat(50),api=JSON.parse(readFileSync('contracts/wtfiap-escrow/artifacts/interface.json','utf8'));
  const type=api.entrypoints.join_room;
  const entrypoints={entrypoints:{join_room:type}};
  const encoded=new ParameterSchema(type).EncodeObject({room_id:f.record.roomId,expected_terms_hash:f.record.termsHash});
  f.record.observations=[{playerId:'p',action:'deposit',operationHash:opHash,observedAt:new Date().toISOString(),status:'pending'}];
  f.rpc.getEntrypoints=async()=>entrypoints;
  const content:any={kind:'transaction',source:wallet,destination:contract,amount:'100',parameters:{entrypoint:'join_room',value:encoded},metadata:{operation_result:{status:'failed'}}};
  f.rpc.getBlock=async()=>({operations:[[{hash:opHash,contents:[content]}]]});
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify([{sender:{address:wallet},target:{address:contract},parameter:{entrypoint:'join_room'},level:99,block:'Bincluded',status:'failed'}]));
  try{
    const observed=await f.chain.read(f.record);
    assert.equal((await f.chain.failedObservations!(f.record,observed)).length,1);
    content.metadata.operation_result.status='applied';assert.equal((await f.chain.failedObservations!(f.record,observed)).length,0);
    content.metadata.operation_result.status='failed';content.amount='99';assert.equal((await f.chain.failedObservations!(f.record,observed)).length,0);
    content.amount='100';content.parameters.value={bytes:'wrong'};assert.equal((await f.chain.failedObservations!(f.record,observed)).length,0);
  }finally{globalThis.fetch=previous;}
});

test('fallback reconciliation skips successful observations and verifies remaining failures on the same finalized branch',async()=>{
  const f=fixture(), opHash='o'+'1'.repeat(50), api=JSON.parse(readFileSync('contracts/wtfiap-escrow/artifacts/interface.json','utf8'));
  f.record.config={...cfg,rpcUrl:'https://tezos-mainnet.octez.io/'};
  f.record.observations=[{playerId:'p',action:'deposit',operationHash:opHash,observedAt:new Date().toISOString(),status:'pending'}];
  const calls:string[]=[];
  const chain=tezosFundingChain(rpc=>{calls.push(rpc);return rpc.includes('octez.io')?{rpc:{async getChainId(){throw Error('primary offline');}}}:f.toolkit;});
  const observed=await chain.read(f.record);const before=calls.length;
  assert.deepEqual(await chain.failedObservations!(f.record,observed),[]);assert.equal(calls.length,before,'finalized deposit does not need an operation failure lookup');
  observed!.paid=[];const type=api.entrypoints.join_room;
  const encoded=new ParameterSchema(type).EncodeObject({room_id:f.record.roomId,expected_terms_hash:f.record.termsHash});
  f.rpc.getEntrypoints=async(input:any,options:any)=>{assert.equal(options.block,'Bfinal');return{entrypoints:{join_room:type}};};
  f.rpc.getBlock=async()=>({operations:[[{hash:opHash,contents:[{kind:'transaction',source:wallet,destination:contract,amount:'100',parameters:{entrypoint:'join_room',value:encoded},metadata:{operation_result:{status:'failed'}}}]}]]});
  const previous=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify([{sender:{address:wallet},target:{address:contract},parameter:{entrypoint:'join_room'},level:99,block:'Bincluded'}]));
  try{assert.equal((await chain.failedObservations!(f.record,observed)).length,1);assert.deepEqual(calls.slice(-2),rpcEndpoints(f.record.config));assert(f.pins.some(p=>p[0]==='hash'&&p[1].block==='Bfinal~1'));}
  finally{globalThis.fetch=previous;}
});

test('saved disabled-admission rooms retain head monitoring and startup outage recovers with measured chain delay',async(t)=>{
  const f=fixture(), disabled={...cfg,enabled:false};f.record.lock={};
  assert.equal(fundingMonitorConfigs(disabled,[]).length,0);
  assert.deepEqual(fundingMonitorConfigs(disabled,[f.record]),[cfg]);
  t.mock.timers.enable({apis:['setTimeout']});
  let fail=true, attempts=0, resolveOutage!:()=>void, resolveHead!:()=>void;
  const outage=new Promise<void>(r=>resolveOutage=r), head=new Promise<void>(r=>resolveHead=r);
  const prior=globalThis.fetch,health={headStreamConnected:false,error:null as string|null};
  globalThis.fetch=async(input,init)=>{
    const url=String(input);if(fail){attempts++;queueMicrotask(resolveOutage);throw Error('initial RPC outage');}
    if(url.endsWith('/chain_id'))return new Response(JSON.stringify(cfg.chainId));
    if(url.endsWith('/constants'))return new Response(JSON.stringify({minimal_block_delay:'6'}));
    return new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('{"hash":"Bhead"}\n'));init?.signal?.addEventListener('abort',()=>controller.close(),{once:true});}}));
  };
  const monitor=monitorFundingHeads(disabled,resolveHead,health);
  try{await outage;await new Promise<void>(r=>setImmediate(r));assert.equal(attempts,1);assert.equal(health.headStreamConnected,false);fail=false;t.mock.timers.tick(6000);await head;assert.equal(health.headStreamConnected,true);}
  finally{await monitor.close();globalThis.fetch=prior;t.mock.timers.reset();}
  assert.equal(health.headStreamConnected,false);
});
