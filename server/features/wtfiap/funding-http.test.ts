import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { createServer as httpServer, type Server } from "node:http";
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import pg from "pg";
import { createFundingService, type FundingConfig, type ChainRoom } from "./funding";
import { postgresFundingStore } from "./funding-store";
import { createFundingHandler } from "./funding-http";
import { recordTechnicalVoid, auditSavedRoom } from "./technical-void-cli";
process.env.DATABASE_URL ||= 'postgresql://wtf:wtf@127.0.0.1:1/wtf';
const { csrfProtection } = await import('../../lib/csrf');
const require = createRequire(import.meta.url), { createWtfiapAuthority } = require('./authority.cjs');
const { getRuntimeRulesHash } = require('./rules.cjs');
const url = process.env.WTFIAP_TEST_DATABASE_URL;
test('hosted paid-room HTTP binds eight accounts, gates applied start and survives authority+DB reconnect', { skip: !url && 'Requires isolated local PostgreSQL proof lane.' }, async () => {
  assert(['localhost','127.0.0.1','::1'].includes(new URL(url!).hostname));
  const schema='wtfiap_http_'+randomUUID().replace(/-/g,''), admin=new pg.Pool({connectionString:url});
  await admin.query(`CREATE SCHEMA "${schema}"`);
  let pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});
  await pool.query(readFileSync('drizzle/0132_wtfiap_funding.sql','utf8'));
  const dataDir=mkdtempSync(path.join(tmpdir(),'wtfiap-funded-http-'));
  const wallets=Array.from({length:8},(_,i)=>'tz1'+String(i+1).repeat(33));
  const config:FundingConfig={enabled:true,network:'shadownet',chainId:'NetXsqzbfFenSTS',rpcUrl:'https://tezos-shadownet.octez.io/',escrowContract:'KT1'+'1'.repeat(33),
    scriptHash:'a'.repeat(64),refereeAddress:wallets[0],creatorAddress:wallets[0],walletId:'test-referee',wtfToken:{contract:'KT1'+'2'.repeat(33),tokenId:'0',decimals:8},
    rulesHash:getRuntimeRulesHash(),currencyQuantaAtomic:{XTZ:'10000',WTF:'1000000'},treasuryAddress:wallets[0],prizeRoundingPolicy:'floor-each-prize-to-quantum;remainder-to-wtf.tez-v1',feeQuantumAtomic:'10000',refundPolicy:'explicit-local-test-policy'};
  let server:Server,authority:any,funding!:ReturnType<typeof createFundingService>,base!:string,enabled=true,chainPhase:string|null=null,paid=0,closed=true;
  const submissions:string[]=[];
  const chain={async read(record:any){if(!chainPhase)return null;return {blockHash:'Bfinal',level:10,termsHash:record.termsHash!,rulesHash:record.lock.rulesHash,seedCommitment:record.lock.seedCommitment,referee:config.refereeAddress,currency:'0',entryAtomic:record.terms.entryAtomic,entrants:wallets,paid:wallets.slice(0,paid),held:String(paid*1000000),paidOut:'0',deposited:String(paid*1000000),refunded:'0',quantum:'10000',treasuryAmount:'0',treasuryClaimed:false,voidReasonHash:chainPhase==='voided'?record.technicalVoid.reasonHash:null,voidEvidenceHash:chainPhase==='voided'?record.technicalVoid.evidenceHash:null,status:chainPhase as ChainRoom['status'],matchId:['active','voided'].includes(chainPhase)?record.lock.matchId:null,resultHash:null,transcriptHash:null,claims:{}};},
    async submit(_record:any,intent:any){submissions.push(intent.kind);return {operationHash:'o'+'1'.repeat(50)};}};
  async function open() {
    const app=express();app.use(express.json({verify(req:any,_res,buf){req.rawBody=buf.toString('utf8');}}));
    app.use((req:any,_res,next)=>{const id=req.headers['x-test-user'];req.user=id?{id:Number(id),username:'Account '+id}:null;req.isAuthenticated=()=>!!req.user;req.session={csrfToken:'proof-csrf'};next();});
    app.use(csrfProtection);
    authority=createWtfiapAuthority({dataDir,isEnabled:()=>enabled,onRoomChanged:()=>{}});await authority.ready;
    funding=createFundingService({config,store:postgresFundingStore(pool),game:authority.funding,onWake:()=>{},linkedWallet:async(id,address)=>wallets[Number(id)-1]===address,
      chain});
    app.use(createFundingHandler({getService:()=>funding,canAccess:()=>enabled}));app.use(authority.handler);
    server=httpServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+(server.address() as any).port;closed=false;
  }
  async function close(){if(closed)return;closed=true;await funding.close();await authority.close();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  async function request(method:string,suffix:string,body:any,user:string|null='1',token?:string,expected=200,csrf=true){
    const response=await fetch(base+suffix,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':'proof-csrf'}:{}),...(user?{'x-test-user':user}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const value:any=await response.json();assert.equal(response.status,expected,JSON.stringify(value));return value;
  }
  try{
    await open();
    const host=await request('POST','/api/wtfiap/party/rooms',{name:'Spoofed',boardMode:'standard',preparationSeconds:null,roomType:'tournament',tournament:{currency:'XTZ',entryFee:'1'}},'1',undefined,201);
    const game='/api/wtfiap/party/rooms/'+host.roomCode,route='/api/wtfiap/funding/rooms/'+host.roomCode;
    for(let i=2;i<=8;i++)await request('POST',game+'/join',{name:'Spoofed'},String(i),undefined,201);
    await request('POST',route+'/bind-wallet',{walletAddress:wallets[0]},null,undefined,401);
    await request('POST',route+'/bind-wallet',{walletAddress:wallets[0]},'1',undefined,403,false);
    await request('POST',route+'/bind-wallet',{walletAddress:wallets[0]},'2',undefined,403);
    for(let i=1;i<=8;i++)await request('POST',route+'/bind-wallet',{walletAddress:wallets[i-1]},String(i));
    await request('POST',route+'/open',{},'2',undefined,403);
    await request('POST',route+'/open',{winner:'p0'},'1',undefined,400);
    await request('POST',route+'/open',{});await funding.drain();assert.deepEqual(submissions,['create_room']);
    await request('POST',game+'/start',{fillAI:false},'1',host.sessionToken,409);
    await request('POST',route+'/observe',{action:'deposit',operationHash:'o'+'1'.repeat(50)});assert.equal((await request('GET',route,undefined)).room.depositedCount,0);
    chainPhase='funding';paid=7;await request('POST',route+'/reconcile',{});await request('POST',route+'/start',{},'1',undefined,409);
    paid=8;await request('POST',route+'/reconcile',{});await request('POST',route+'/start',{});await funding.drain();
    assert.deepEqual(submissions,['create_room','start_room']);assert.equal((await request('GET',game,undefined,'1',host.sessionToken)).view.phase,'lobby');
    chainPhase='active';await funding.drain();const started=(await request('GET',game,undefined,'1',host.sessionToken)).view;assert.equal(started.phase,'preparation');
    const bought=await request('POST',game+'/commands',{commandId:randomUUID(),sequence:started.nextCommandSequence,roundNumber:1,type:'buy',index:0},'1',host.sessionToken);
    assert.equal(bought.view.self.bench.length,1);
    const stream=await fetch(base+game+'/events',{headers:{Authorization:'Bearer '+host.sessionToken,'x-test-user':'1'}});
    const reader=stream.body!.getReader();assert.match(new TextDecoder().decode((await reader.read()).value),/event: snapshot/);await reader.cancel();
    const publicView=await request('GET',route,undefined,null);assert(!JSON.stringify(publicView).includes('userId'));assert(!JSON.stringify(publicView).includes(host.sessionToken));
    enabled=false;await request('GET','/api/wtfiap/funding/config',undefined,'1',undefined,403);enabled=true;
    await close();await pool.end();pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema}`});await open();await funding.drain();
    const restored=(await request('GET',game,undefined,'1',host.sessionToken)).view;assert.deepEqual(restored.self,bought.view.self);
    assert.deepEqual(submissions,['create_room','start_room']);assert.equal((await request('GET',route,undefined)).room.depositedCount,8);
    await request('POST',route+'/void',{},'1',undefined,404);
    await close();
    const store=postgresFundingStore(pool),saved=(await store.read(host.roomCode))!;
    assert.equal((await auditSavedRoom(dataDir,saved,Date.now())).ok,true);
    const maintenance={pool,code:host.roomCode,operatorId:'local-proof-operator',stoppedContainerId:'a'.repeat(64),dataDir,config,chain};
    await assert.rejects(recordTechnicalVoid(maintenance),/did not reproduce/);
    const file=path.join(dataDir,host.roomCode+'.json'),broken=JSON.parse(readFileSync(file,'utf8')),match=JSON.parse(broken.match);
    match.players[0].hp=-1;broken.match=JSON.stringify(match);writeFileSync(file,JSON.stringify(broken));
    const voidRequest=await recordTechnicalVoid(maintenance);assert.equal(voidRequest.signed,false);
    const paused=JSON.parse(readFileSync(file,'utf8'));assert.equal(paused.match,null);assert.equal(paused.fundingFaultArchive.snapshot.match,broken.match);
    assert.equal(statSync(file).mode&0o777,0o600);assert.deepEqual(submissions,['create_room','start_room']);
    assert.equal((await recordTechnicalVoid(maintenance)).evidenceHash,voidRequest.evidenceHash);
    await open();await funding.drain();assert.deepEqual(submissions,['create_room','start_room','void_room']);
    await request('POST',game+'/commands',{commandId:randomUUID(),sequence:2,roundNumber:1,type:'ready'},'1',host.sessionToken,409);
    await close();await open();await funding.drain();assert.deepEqual(submissions,['create_room','start_room','void_room']);
    chainPhase='voided';await funding.drain();
    assert.equal((await request('GET',game,undefined,'1',host.sessionToken)).view.phase,'voided');
    assert.equal((await request('GET',route,undefined)).room.self.actions.refund.entrypoint,'refund');
    assert(JSON.parse(readFileSync(file,'utf8')).voidArchive.snapshot.snapshot.match===broken.match);
    await close();await open();await funding.drain();
    assert.equal((await request('GET',game,undefined,'1',host.sessionToken)).view.phase,'voided');
    assert.deepEqual(submissions,['create_room','start_room','void_room']);
  }finally{if(authority)await close();await pool.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();rmSync(dataDir,{recursive:true,force:true});}
});
