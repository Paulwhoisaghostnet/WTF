import assert from 'node:assert/strict';
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { request } from '@playwright/test';
import { TezosToolkit } from '@taquito/taquito';
import { require as tsxRequire } from 'tsx/cjs/api';
import { readPuppetCredentials, buildPuppetKeyringEnv } from '../../tests/e2e/puppets/runtime.mjs';
import { playAuthoritativeTournament, waitForRoomView } from '../../tests/e2e/puppets/wtfiap-match-driver.mjs';
import { verifyWtfiapTransfer } from '../../tests/e2e/puppets/wtfiap-chain-evidence.mjs';

const baseURL='https://wtfos.app',allIds=['bert','ernie','elmo','bigbird','thecount','snuffaluffagus','grover','cookiemonster'];
const {fundingCalls}=tsxRequire('../../client/src/features/wtfiap/funding-wallet.ts',import.meta.url);
async function json(response){const body=await response.json();assert(response.ok(),body.reason||body.error||`HTTP ${response.status()}`);return body;}
// Respect the deployed rate-limit response exactly. A rejected 429 is safe to
// repeat with the same request body; ambiguous writes and other failures stop.
function rateAware(context){
  const send=method=>async(url,options)=>{for(;;){const response=await context[method](url,options);if(response.status()!==429)return response;
    const header=response.headers()['retry-after'];assert(header,'Rate limit must supply retry timing');
    const ms=/^\d+$/.test(header)?Number(header)*1000:Date.parse(header)-Date.now();assert(Number.isFinite(ms)&&ms>=0);
    console.log(JSON.stringify({stage:'server-rate-limit',retryAfterMs:ms}));await new Promise(resolve=>setTimeout(resolve,ms));}};
  return {get:send('get'),post:send('post'),storageState:()=>context.storageState(),dispose:()=>context.dispose()};
}
async function main(){
  const aiFill=process.argv.includes('--ai-fill'),ids=aiFill?allIds.slice(0,2):allIds;
  const selectedCurrency=process.argv.slice(2).find(arg=>['XTZ','WTF'].includes(arg));
  assert(process.argv.slice(2).every(arg=>arg==='--ai-fill'||['XTZ','WTF'].includes(arg)));
  assert(!aiFill||selectedCurrency==='XTZ','The AI-fill hosted proof exercises Shadownet XTZ explicitly.');
  assert(!selectedCurrency||['XTZ','WTF'].includes(selectedCurrency),'Optional argument must select XTZ or WTF');
  assert.equal(process.env.WTF_E2E_WTFIAP_HOST_WRITES,'1','Root must explicitly hand off hosted Shadownet writes');
  assert.equal(process.env.WTF_E2E_LIVE_BASE_URL,baseURL);assert(/^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(process.env.WTF_E2E_WTFIAP_ESCROW||''));
  const directory=path.resolve('.tmp/wtfiap-host-20261022.local'),statePath=path.join(directory,aiFill?'ai-proof-state.json':'proof-state.json');
  const sessions=JSON.parse(await readFile(path.join(directory,'sessions.json'),'utf8')),credentials=await readPuppetCredentials();
  let state;try{state=JSON.parse(await readFile(statePath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;state={version:1,baseURL,escrowContract:process.env.WTF_E2E_WTFIAP_ESCROW,rooms:{}};}
  assert.equal(state.baseURL,baseURL);assert.equal(state.escrowContract,process.env.WTF_E2E_WTFIAP_ESCROW);
  const save=async()=>{await writeFile(statePath+'.tmp',JSON.stringify(state),{mode:0o600});await rename(statePath+'.tmp',statePath);};
  const env=await buildPuppetKeyringEnv();env.WTF_PLATFORM_KEYRING_CREATE_ENABLED=0;
  const module=tsxRequire('../../extensions/wtf-operator-signer/src/keyring.ts',import.meta.url),{PlatformWalletKeyring}=module.default||module,keyring=new PlatformWalletKeyring(env);
  const entrants=[];
  try{
    for(const id of ids){const actor=credentials.actors.find(a=>a.id===id),saved=sessions.find(a=>a.id===id);assert(actor&&saved&&actor.walletAddress===saved.walletAddress);
      const api=rateAware(await request.newContext({baseURL,storageState:saved.storageState}));const account=await json(await api.get('/api/profile/account'));assert.equal(account.id,actor.userId);
      const wallets=await json(await api.get('/api/wallets'));assert(wallets.some(w=>w.walletAddress===actor.walletAddress));
      const {csrfToken}=await json(await api.get('/api/auth/csrf-token'));entrants.push({actor,request:api,write:async(route,data={})=>json(await api.post(route,{headers:{'X-CSRF-Token':csrfToken},data}))});}
    const configuration=(await json(await entrants[0].request.get('/api/wtfiap/funding/config'))).config;
    assert.equal(configuration.enabled,true);assert.equal(configuration.network,'shadownet');assert.equal(configuration.chainId,'NetXsqzbfFenSTS');assert.equal(configuration.escrowContract,state.escrowContract);
    for(const currency of selectedCurrency?[selectedCurrency]:['XTZ','WTF']){
      let checkpoint=state.rooms[currency];
      if(!checkpoint){checkpoint=state.rooms[currency]={status:'creating-room',players:{},operations:{}};await save();
        const host=await entrants[0].write('/api/wtfiap/party/rooms',{name:`Hosted Shadownet ${currency} proof`,boardMode:'standard',preparationSeconds:null,roomType:'tournament',tournament:{currency,entryFee:'0.01'},allowAI:aiFill});
        Object.assign(checkpoint,{roomCode:host.roomCode,status:'lobby'});checkpoint.players[ids[0]]={playerId:host.playerId,sessionToken:host.sessionToken};await save();}
      assert(checkpoint.roomCode,'An ambiguous room-creation response requires reconciliation, never a new room');
      const code=checkpoint.roomCode,route=`/api/wtfiap/funding/rooms/${code}`;
      for(const entrant of entrants){if(!checkpoint.players[entrant.actor.id]){checkpoint.players[entrant.actor.id]={status:'joining'};await save();const joined=await entrant.write(`/api/wtfiap/party/rooms/${code}/join`,{name:entrant.actor.displayName});checkpoint.players[entrant.actor.id]={playerId:joined.playerId,sessionToken:joined.sessionToken};await save();}
        assert(checkpoint.players[entrant.actor.id].sessionToken,'An ambiguous seat join needs reconciliation');Object.assign(entrant,checkpoint.players[entrant.actor.id]);}
      const read=async entrant=>(await json(await entrant.request.get(route))).room;
      async function walletAction(entrant,kind,label){
        let room=await read(entrant);const prior=checkpoint.operations[label];
        if(prior?.status==='verified')return prior.evidence;
        assert(!prior||prior.status==='submitted'&&prior.operationHash,
          'An incomplete wallet submission is reconcile-only; never submit again under a fresh identifier');
        let operationHash,inclusionLevel,amountAtomic;
        if(prior){
          operationHash=prior.operationHash;amountAtomic=prior.amountAtomic;
          const indexed=await (await fetch(`https://api.shadownet.tzkt.io/v1/operations/transactions/${operationHash}`)).json();
          const found=indexed.find(op=>op.hash===operationHash&&op.status==='applied');
          assert(found,'The submitted operation must be located before resuming');inclusionLevel=found.level;
        }else{
          const action=room.self.actions[kind];assert(action,'The finalized server must offer the exact wallet action');
          const calls=fundingCalls({...configuration,wtfToken:room.wtfToken},room,kind,action,entrant.actor.walletAddress);
          const {wallet,signer}=await keyring.getSigner(entrant.actor.walletId);assert.equal(wallet.address,entrant.actor.walletAddress);assert.equal(wallet.chainId,'NetXsqzbfFenSTS');assert.equal(await signer.publicKeyHash(),wallet.address);
          const tezos=new TezosToolkit(configuration.rpcUrl);tezos.setProvider({signer});assert.equal(await tezos.rpc.getChainId(),configuration.chainId);
          const batch=tezos.contract.batch();for(const call of calls){const contract=await tezos.contract.at(call.contract);batch.withTransfer(contract.methodsObject[call.entrypoint](call.params).toTransferParams({amount:call.amountMutez,mutez:true}));}
          amountAtomic=kind==='claim'?room.self.payout.amount:room.terms.entryAtomic;
          checkpoint.operations[label]={status:'submission-unknown',kind,actorId:entrant.actor.id,amountAtomic};await save();
          const operation=await batch.send();operationHash=operation.hash;checkpoint.operations[label].operationHash=operationHash;checkpoint.operations[label].status='submitted';await save();
          await entrant.write(route+'/observe',{action:kind,operationHash});await operation.confirmation(3);inclusionLevel=operation.includedInBlock;
        }
        const evidence=await verifyWtfiapTransfer({configuration,operationHash,inclusionLevel,currency,
          from:kind==='deposit'?entrant.actor.walletAddress:configuration.escrowContract,to:kind==='deposit'?configuration.escrowContract:entrant.actor.walletAddress,amountAtomic});
        for(;;){
          await entrant.write(route+'/reconcile');room=await read(entrant);
          if(kind==='deposit'?room.roster.find(p=>p.playerId===entrant.playerId).deposited:
            kind==='claim'?room.self.payout.claimed:!room.roster.find(p=>p.playerId===entrant.playerId).deposited)break;
          await new Promise(resolve=>setTimeout(resolve,1000));
        }
        Object.assign(checkpoint.operations[label],{status:'verified',evidence});await save();return evidence;
      }
      if(!checkpoint.opened){for(const entrant of entrants)await entrant.write(route+'/bind-wallet',{walletAddress:entrant.actor.walletAddress});await entrants[0].write(route+'/open');checkpoint.opened=true;await save();}
      await waitForRoomView({baseURL,roomCode:code,entrant:entrants[0],predicate:v=>['funding','starting','active','settling','settled'].includes(v.tournament?.funding?.status)});
      if(!checkpoint.started){for(const entrant of entrants)await walletAction(entrant,'deposit',entrant.actor.id+':deposit');
        assert.equal((await read(entrants[0])).depositedCount,ids.length);await entrants[0].write(route+'/start');checkpoint.started=true;await save();}
      await waitForRoomView({baseURL,roomCode:code,entrant:entrants[0],predicate:v=>['preparation','combat','finished'].includes(v.phase)});
      const match=await playAuthoritativeTournament({baseURL,roomCode:code,entrants,onRound:async({roundNumber,survivors})=>console.log(JSON.stringify({currency,roomCode:code,roundNumber,survivors}))});
      const settled=await waitForRoomView({baseURL,roomCode:code,entrant:entrants[0],predicate:v=>v.tournament?.funding?.status==='settled'}),funding=settled.tournament.funding;
      const quantum=BigInt(configuration.currencyQuantaAtomic[currency]);assert.equal(BigInt(funding.prizeSummary.allocatedPlayerPrizesAtomic)+BigInt(funding.prizeSummary.treasuryRemainderAtomic),BigInt(ids.length)*quantum);
      for(const payout of funding.payouts){assert.equal(BigInt(payout.amountAtomic)%quantum,0n);if(BigInt(payout.amountAtomic)>0n)await walletAction(entrants.find(e=>e.playerId===payout.playerId),'claim',payout.playerId+':claim');}
      if(BigInt(funding.prizeSummary.treasuryRemainderAtomic)>0n)await waitForRoomView({baseURL,roomCode:code,entrant:entrants[0],predicate:v=>v.tournament?.funding?.prizeSummary?.treasuryClaimed===true});
      const verified=await read(entrants[0]);checkpoint.status='complete';checkpoint.summary={kind:'hosted-authoritative-Shadownet-match',aiFill,payingHumans:ids.length,baseURL,currency,escrowContract:configuration.escrowContract,roomCode:code,match:match.summary,prizeSummary:verified.prizeSummary,operations:Object.values(checkpoint.operations),noGameplayStateInjection:true,noAccountOrWalletLinkChanges:true};await save();
      await mkdir('output/wtfiap-escrow/hosted-matches',{recursive:true});await writeFile(`output/wtfiap-escrow/hosted-matches/${aiFill?'ai-':''}${currency}.json`,JSON.stringify(checkpoint.summary,null,2)+'\n');console.log(JSON.stringify({currency,roomCode:code,status:'complete',winnerId:match.view.winnerId,aiFill}));
    }
  }finally{for(const entrant of entrants)await entrant.request.dispose();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
