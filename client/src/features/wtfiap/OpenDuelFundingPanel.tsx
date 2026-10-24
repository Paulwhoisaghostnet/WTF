import { useEffect, useMemo, useState } from 'react';
import { styled } from 'styled-components';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useWallet } from '../../lib/wallet-context';
import { assertWalletLinkedToCurrentUser } from '../../lib/tezos/wallet-ownership';
import { getNetwork } from '../../lib/tezos/loaders';
import { fundingWalletGateway } from './funding-wallet-adapter';
import { createFundingActionLatch } from './funding-checkpoint';
import { formatFundingAmount, type FundingWalletAction } from './funding-types';

const Surface = styled.section`
  flex:1; min-height:0; overflow:auto; padding:20px; background:var(--wtf-window-color,#c0c0c0); color:var(--wtf-text-color,#111);
  h2{margin:0 0 8px} p{line-height:1.45} button{padding:10px 14px;cursor:pointer} button:disabled{opacity:.6;cursor:default}
  button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
  .primary{background:#285d4c;color:#fff;border:1px solid #17372f;font-weight:700}
  .actions{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.status{padding:12px;border:1px solid currentColor}.error{color:#900}
  dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 14px}dd{margin:0;overflow-wrap:anywhere}
`;
type View = { roomCode:string; status:string; network:'mainnet'|'shadownet'; chainId:string; escrowContract:string;
  terms:{entryAtomic:string;currency:'XTZ'}; houseFeeAtomic:string; treasuryAddress:string; depositedCount:number;
  chainStatus:string|null; potAtomic:string; authorized:boolean; authorizationPending:boolean; guestDepositVerified:boolean;
  guestSeatReady:boolean; self:{isHost:boolean;canBind:boolean;walletAddress:string|null;playerId:string|null;
  payout:{amount:string;claimed:boolean}|null;actions:Partial<Record<'deposit'|'refund'|'claim',FundingWalletAction>>};
  config:{enabled:boolean;reason:string|null}; };
const endpoint=(code:string)=>`/api/wtfiap/open-duel/rooms/${encodeURIComponent(code)}`;
const checkpointKey=(account:string,code:string)=>`wtfiap:open-duel:pending:${account}:${code}`;
const complete=(view:View,entrypoint:string)=>entrypoint==='create_offer'?!!view.chainStatus:
  entrypoint==='accept_offer'?view.guestDepositVerified:entrypoint==='cancel_offer'?view.chainStatus==='cancelled':
  entrypoint==='withdraw_guest'?!view.guestDepositVerified:entrypoint==='claim'?view.self.payout?.claimed===true:
  entrypoint==='refund'?view.chainStatus==='voided'&&!view.self.actions.refund:false;

export function OpenDuelFundingPanel({roomCode,onReturn,onEnterRoom}:{roomCode:string;onReturn():void;onEnterRoom():void}) {
  const {user}=useAuth(), wallet=useWallet(), account=user?String(user.id):null;
  const latch=useMemo(()=>createFundingActionLatch(`wtfiap-open-duel:${account}:${roomCode}`),[account,roomCode]);
  const [view,setView]=useState<View|null>(null),[busy,setBusy]=useState(false),[waiting,setWaiting]=useState(false);
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  const [pending,setPending]=useState<{entrypoint:string;opHash:string}|null>(()=>{
    if(!account)return null;
    try{return JSON.parse(localStorage.getItem(checkpointKey(account,roomCode))||'null');}catch{return null;}
  });
  useEffect(()=>{if(!account)return;try{setPending(JSON.parse(localStorage.getItem(checkpointKey(account,roomCode))||'null'));}
    catch{setError('The saved wallet operation is unreadable. Recheck chain status before another payment.');}},[account,roomCode]);
  async function refresh(){
    const result=await api.get<{ok:true;room:View}>(endpoint(roomCode));
    setView(result.room);
    if(pending&&complete(result.room,pending.entrypoint)){
      localStorage.removeItem(checkpointKey(account!,roomCode));setPending(null);
      setMessage('Wallet transaction verified on Tezos '+result.room.network+'.');
    }
    return result.room;
  }
  useEffect(()=>{if(!account)return;let active=true;
    const tick=()=>{void api.get<{ok:true;room:View}>(endpoint(roomCode)).then(result=>{
      if(!active)return;setView(result.room);
      if(pending&&complete(result.room,pending.entrypoint)){
        localStorage.removeItem(checkpointKey(account,roomCode));setPending(null);
      }
    }).catch(reason=>{if(active)setError((reason as Error).message);});};
    tick();const timer=window.setInterval(tick,3000);return()=>{active=false;window.clearInterval(timer);};
  },[account,roomCode,pending?.opHash]);
  async function action(work:()=>Promise<void>,allowPending=false){if(busy||pending&&!allowPending||latch.active)return;setBusy(true);setError('');setMessage('');
    try{await latch.run(work);}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}
  async function send(operation:FundingWalletAction,currentView:View|null=view){
    if(!account||!currentView)throw new Error('Sign in and load the room before staking.');
    if(operation.contract!==currentView.escrowContract||operation.network!==currentView.network||operation.chainId!==currentView.chainId)
      throw new Error('The wallet action does not match this room’s chain and escrow.');
    const entry=BigInt(currentView.terms.entryAtomic), expected=operation.entrypoint==='create_offer'?
      entry+BigInt(currentView.houseFeeAtomic):operation.entrypoint==='accept_offer'?entry:0n;
    if(BigInt(operation.amountMutez)!==expected)throw new Error('The wallet action amount differs from the displayed wager.');
    if(!['create_offer','accept_offer','cancel_offer','withdraw_guest','refund','claim'].includes(operation.entrypoint))
      throw new Error('This escrow action is unavailable.');
    if(getNetwork()!==operation.network){localStorage.setItem('wtf:network',operation.network);
      window.dispatchEvent(new Event('wtf:network-selected'));}
    const address=wallet.address||(await wallet.connect()).address;
    await assertWalletLinkedToCurrentUser(address);
    if(address!==operation.expectedWallet)throw new Error('Use the wallet linked to this exact wager seat.');
    const result=await fundingWalletGateway.send([operation],address,operation.network,operation.chainId);
    if(!result.opHash)throw new Error('The wallet did not return an operation hash. Recheck the room before retrying.');
    const next={entrypoint:operation.entrypoint,opHash:result.opHash};
    localStorage.setItem(checkpointKey(account,roomCode),JSON.stringify(next));setPending(next);
    setMessage('Transaction submitted. Keep this room link; the game will verify it on-chain.');
    await api.post(endpoint(roomCode)+'/reconcile',{});
    await refresh();
  }
  async function stake(){if(!view)throw new Error('Room is loading.');
    const address=wallet.address||(await wallet.connect()).address;
    await assertWalletLinkedToCurrentUser(address);
    const path=view.self.isHost?'prepare-host':'prepare-guest';
    const result=await api.post<{ok:true;room:View}>(endpoint(roomCode)+'/'+path,
      view.self.isHost?{walletAddress:address}:{walletAddress:address,
        name:sessionStorage.getItem('autobattler:open-duel-name:'+roomCode)||String((user as any)?.displayName||(user as any)?.username||'Challenger')});
    setView(result.room);
    if(result.room.self.actions.deposit)await send(result.room.self.actions.deposit,result.room);
    else{setWaiting(true);setMessage('Your wallet is verified. Waiting for the creator’s offer or the on-chain seat authorization.');}
  }
  useEffect(()=>{if(!waiting||!view?.self.actions.deposit||busy||pending)return;
    setWaiting(false);void action(()=>send(view.self.actions.deposit!));
  },[waiting,view?.self.actions.deposit?.entrypoint,busy,pending]);
  async function claimSeat(){
    if(!account)throw new Error('Sign in to claim your commander.');
    const result=await api.post<{ok:true;seat:{roomCode:string;playerId:string;sessionToken:string}}>(endpoint(roomCode)+'/claim-seat',{});
    localStorage.setItem('autobattler:party-session:'+roomCode,JSON.stringify({...result.seat,role:'player',pending:null}));
    setMessage('Your funded commander is ready. Opening the arena.');onEnterRoom();
  }
  if(!user)return <Surface><h2>Open-seat wager</h2><p>Sign in before staking or claiming a duel seat.</p><button onClick={onReturn}>Return</button></Surface>;
  const entry=view?formatFundingAmount(view.terms.entryAtomic,6):'—';
  const total=view?formatFundingAmount((BigInt(view.terms.entryAtomic)+BigInt(view.houseFeeAtomic)).toString(),6):'—';
  const network=!view?'Network loading…':view.network==='mainnet'?'Mainnet · real XTZ':'Shadownet · test XTZ';
  return <Surface aria-label="Open-seat duel wager" aria-busy={busy}>
    <h2>Stake a Duel wager</h2>
    <p><strong>{network}</strong> · Creator stakes {total} XTZ (entry {entry} + 0.5 house fee). The challenger stakes {entry} XTZ. The winner receives both entries.</p>
    <p>The creator can fund now and leave this room open. The first verified challenger deposit claims the seat. Your wallet pays network transaction and storage fees separately.</p>
    {view?.config.reason&&!view.config.enabled&&<p className="status">{view.config.reason}</p>}
    <div className="actions">
      {view?.self.canBind&&!pending&&<button className="primary" disabled={busy} onClick={()=>void action(stake)}>Stake wager</button>}
      {view?.self.actions.deposit&&!pending&&<button className="primary" disabled={busy} onClick={()=>void action(()=>send(view.self.actions.deposit!))}>
        {view.self.isHost?'Stake '+total+' XTZ':'Stake '+entry+' XTZ'}
      </button>}
      {view?.self.actions.refund&&!pending&&<button disabled={busy} onClick={()=>void action(()=>send(view.self.actions.refund!))}>
        {view.self.isHost?'Cancel room and refund entry + 0.5 XTZ':'Withdraw full entry'}
      </button>}
      {view?.self.actions.claim&&!pending&&<button className="primary" disabled={busy} onClick={()=>void action(()=>send(view.self.actions.claim!))}>Claim prize</button>}
      {view?.guestSeatReady&&<button className="primary" disabled={busy} onClick={()=>void action(claimSeat)}>Enter funded match</button>}
      <button disabled={busy} onClick={()=>void action(async()=>{await api.post(endpoint(roomCode)+'/reconcile',{});await refresh();},true)}>Recheck</button>
      <button onClick={onReturn}>Return to game</button>
    </div>
    {view&&<dl><dt>Room</dt><dd>{roomCode}</dd><dt>Network</dt><dd>{network}</dd>
      <dt>Escrow</dt><dd><code>{view.escrowContract}</code></dd><dt>Status</dt><dd>{view.status}</dd>
      <dt>Verified deposits</dt><dd>{view.depositedCount} of 2</dd><dt>Prize pot</dt><dd>{formatFundingAmount(view.potAtomic,6)} XTZ</dd>
      <dt>House fee</dt><dd>0.5 XTZ, separate from the prize; refundable before combat and on a technical void.</dd>
      <dt>Treasury</dt><dd><code>{view.treasuryAddress}</code></dd></dl>}
    {pending&&<p className="status" role="status">Wallet operation submitted: <code>{pending.opHash}</code>. Verification is pending; no second payment is needed.</p>}
    {view&&!view.self.isHost&&!view.chainStatus&&<p className="status">Waiting for the creator to stake this wager. Return with the room link to claim its open seat.</p>}
    {message&&<p className="status" role="status">{message}</p>}
    {error&&<p className="error" role="alert">{error}</p>}
  </Surface>;
}
