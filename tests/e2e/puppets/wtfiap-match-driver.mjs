import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { RULES } = require(path.resolve('server/features/wtfiap/runtime/game/core/party.cjs'));
const patchView = (base, changes) => {
  const next = structuredClone(base);
  for (const change of changes) {
    assert(Array.isArray(change.path) && change.path.length && change.path.every(key => !['__proto__','constructor','prototype'].includes(String(key))));
    let target = next;
    for (const key of change.path.slice(0,-1)) { assert(Object.hasOwn(target,key)); target = target[key]; }
    const key = change.path.at(-1);
    if (change.remove) { if (Array.isArray(target)) target.splice(Number(key),1); else delete target[key]; }
    else target[key] = structuredClone(change.value);
  }
  return next;
};
async function json(response) { const body=await response.json();assert(response.ok() && body.ok,body.reason || body.error || 'Authoritative room request failed');return body; }
export async function roomView(roomCode, entrant) {
  return (await json(await entrant.request.get(`/api/wtfiap/party/rooms/${roomCode}`,{headers:{Authorization:'Bearer '+entrant.sessionToken}}))).view;
}
export async function roomCommand(roomCode, entrant, command, currentView) {
  const view=currentView||await roomView(roomCode,entrant);
  if(!entrant.csrfToken)entrant.csrfToken=(await (await entrant.request.get('/api/auth/csrf-token')).json()).csrfToken;
  const csrfToken=entrant.csrfToken;
  const response=await entrant.request.post(`/api/wtfiap/party/rooms/${roomCode}/commands`,{headers:{Authorization:'Bearer '+entrant.sessionToken,'X-CSRF-Token':csrfToken},data:{commandId:randomUUID(),sequence:view.nextCommandSequence,roundNumber:view.roundNumber,...command}});
  return (await json(response)).view;
}
export async function waitForRoomView({baseURL,roomCode,entrant,predicate}) {
  const url=new URL(`/api/wtfiap/party/rooms/${roomCode}/events`,baseURL);
  const {cookies}=await entrant.request.storageState();
  const cookie=cookies.filter(c=>url.hostname===c.domain.replace(/^\./,'')||url.hostname.endsWith('.'+c.domain.replace(/^\./,''))).map(c=>c.name+'='+c.value).join('; ');
  const controller=new AbortController();let reader;
  try {
    let response;
    for(;;){response=await fetch(url,{headers:{Authorization:'Bearer '+entrant.sessionToken,Cookie:cookie,Accept:'text/event-stream'},signal:controller.signal});
      if(response.status!==429)break;
      const header=response.headers.get('retry-after');assert(header,'The server must specify rate-limit recovery timing');
      const ms=/^\d+$/.test(header)?Number(header)*1000:Date.parse(header)-Date.now();assert(Number.isFinite(ms)&&ms>=0);
      await response.body?.cancel();await new Promise(resolve=>setTimeout(resolve,ms));
    }
    assert(response.ok && response.body,'Authenticated authoritative event stream is required');reader=response.body.getReader();
    const decoder=new TextDecoder();let buffer='',view,revision;
    for(;;){const chunk=await reader.read();assert(!chunk.done,'Room event stream ended before the expected game state');buffer+=decoder.decode(chunk.value,{stream:true});buffer=buffer.replace(/\r\n/g,'\n');let boundary;
      while((boundary=buffer.indexOf('\n\n'))!==-1){const block=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);let event='message';const lines=[];
        for(const line of block.split('\n')){if(line.startsWith('event:'))event=line.slice(6).trim();if(line.startsWith('data:'))lines.push(line.slice(5).trimStart());}
        if(!lines.length)continue;const data=JSON.parse(lines.join('\n'));
        if(event==='snapshot'){view=data.view;revision=data.viewRevision??0;}
        else if(event==='patch'){assert.equal(data.baseViewRevision,revision);view=patchView(view,data.patch);revision=data.viewRevision;}
        if(view&&predicate(view))return view;
      }
    }
  } finally { controller.abort();await reader?.cancel().catch(()=>{}); }
}
// Entrants are the real authenticated paying human seats; AI fills other
// battlefield seats in the selected room. This strategy issues ordinary buys,
// deployments and ready commands; it cannot
// inject match state, accelerate the clock, select winners or settle money.
export async function playAuthoritativeTournament({baseURL,roomCode,entrants,onRound=async()=>{}}) {
  assert(entrants.length>=2&&entrants.length<=RULES.playerCount);assert.equal(new Set(entrants.map(e=>e.playerId)).size,entrants.length);
  let commands=0,view=await roomView(roomCode,entrants[0]);const rounds=[];
  async function deploy(entrant,current){
    while(current.self.bench.length&&current.self.field.length<current.self.fieldCapacity){
      const cell=Array.from({length:current.board.columns*current.board.halfRows},(_,index)=>({col:index%current.board.columns,row:current.board.playerStartRow+Math.floor(index/current.board.columns)})).find(c=>!current.self.field.some(u=>u.col===c.col&&u.row===c.row));
      assert(cell,'Authoritative board must have an available deployment cell');current=await roomCommand(roomCode,entrant,{type:'deploy',unitId:current.self.bench[0].id,...cell},current);commands++;
    }return current;
  }
  while(view.phase!=='finished'){
    if(view.phase!=='preparation')view=await waitForRoomView({baseURL,roomCode,entrant:entrants[0],predicate:v=>['preparation','finished'].includes(v.phase)});
    if(view.phase==='finished')break;
    assert.equal(view.preparationSeconds,null,'This live driver uses the approved untimed-ready room policy');
    await onRound({roundNumber:view.roundNumber,survivors:view.players.filter(p=>p.hp>0).length});
    for(const entrant of entrants){let current=await roomView(roomCode,entrant);if(!current.self.hp||current.self.ready)continue;assert.equal(current.phase,'preparation');
      current=await deploy(entrant,current);
      for(let index=0;index<current.self.shop.length;index++){const offer=current.self.shop[index];if(offer&&offer.cost<=current.self.gold&&current.self.bench.length<RULES.benchCapacity){current=await roomCommand(roomCode,entrant,{type:'buy',index},current);commands++;current=await deploy(entrant,current);}}
      await roomCommand(roomCode,entrant,{type:'ready',value:true},current);commands++;
    }
    const previousRound=view.roundNumber;
    view=await waitForRoomView({baseURL,roomCode,entrant:entrants[0],predicate:v=>v.phase==='finished'||v.phase==='preparation'&&v.roundNumber>previousRound});
    rounds.push({roundNumber:previousRound,survivors:view.players.filter(p=>p.hp>0).length,hp:view.players.map(p=>({playerId:p.playerId,hp:p.hp}))});
  }
  assert(view.winnerId);assert.equal(view.players.filter(p=>p.hp>0).length,1);
  const replay=await json(await entrants[0].request.get(`/api/wtfiap/party/rooms/${roomCode}/replay`,{headers:{Authorization:'Bearer '+entrants[0].sessionToken}}));
  assert.equal(replay.replay.view.winnerId,view.winnerId);
  return {view,replay,summary:{roomCode,winnerId:view.winnerId,rounds,commandCount:commands,replaySha256:createHash('sha256').update(JSON.stringify(replay.replay)).digest('hex')}};
}
