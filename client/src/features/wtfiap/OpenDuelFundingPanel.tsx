import { useEffect, useMemo, useRef, useState } from 'react';
import { styled } from 'styled-components';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { useWallet } from '../../lib/wallet-context';
import { assertWalletLinkedToCurrentUser } from '../../lib/tezos/wallet-ownership';
import { getNetwork } from '../../lib/tezos/loaders';
import { fundingWalletGateway, sendFundingCallsWithCheckpoint } from './funding-wallet-adapter';
import { createFundingActionLatch } from './funding-checkpoint';
import { formatFundingAmount, type FundingWalletAction } from './funding-types';

const Surface = styled.section`
  min-height:0; overflow:auto; padding:18px; box-sizing:border-box; background:transparent; color:inherit;
  h2{margin:0 0 8px} h3{margin:0 0 6px} p{line-height:1.45} button{padding:10px 14px;cursor:pointer} button:disabled{opacity:.6;cursor:default}
  button:focus-visible{outline:2px solid currentColor;outline-offset:2px}
  .primary{background:#285d4c;color:#fff;border:1px solid #17372f;font-weight:700}
  .actions{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0}.status{padding:12px;border:1px solid currentColor}.error{color:#ffaaa0}
  .step{border:1px solid #d9bb72;padding:14px;margin:16px 0}.step p{margin-bottom:0}
  details{border-top:1px solid #667b71;margin-top:16px;padding-top:14px} summary{cursor:pointer;font-weight:700}
  input{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:10px;background:#17312e;color:#fff;border:1px solid #92c6b6;border-radius:4px}
  dl{display:grid;grid-template-columns:max-content 1fr;gap:8px 14px}dd{margin:0;overflow-wrap:anywhere}
`;
type View = { roomCode:string; status:string; network:'mainnet'|'shadownet'; chainId:string; escrowContract:string;
  terms:{entryAtomic:string;currency:'XTZ'}; houseFeeAtomic:string; treasuryAddress:string; depositedCount:number;
  chainStatus:string|null; potAtomic:string; authorized:boolean; authorizationPending:boolean; guestDepositVerified:boolean;
  payoutMode:'automatic'|'claim'; paidOutAtomic:string;
  guestSeatReady:boolean; self:{isHost:boolean;canBind:boolean;walletAddress:string|null;playerId:string|null;
  creditBalanceAtomic?:string;prepaidSeat?:boolean;
  payout:{amount:string;claimed:boolean}|null;actions:Partial<Record<'deposit'|'refund'|'claim'|'prepaidJoin',FundingWalletAction>>};
  config:{enabled:boolean;reason:string|null;prepaidEnabled?:boolean}; };
const endpoint=(code:string)=>`/api/wtfiap/open-duel/rooms/${encodeURIComponent(code)}`;
const checkpointKey=(account:string,code:string)=>`wtfiap:open-duel:pending:${account}:${code}`;
const creditEndpoint='/api/wtfiap/open-duel/prepaid-credit';
const creditCheckpointKey=(account:string,contract:string)=>`wtfiap:prepaid-credit:pending:${account}:${contract}`;
type CreditCheckpoint={opHash:string;walletAddress:string;amountMutez:string};
function readCreditCheckpoint(account:string,contract:string):CreditCheckpoint|null{
  const value=localStorage.getItem(creditCheckpointKey(account,contract));
  if(!value)return null;
  const data=JSON.parse(value) as CreditCheckpoint;
  if(!(data.opHash==='unknown'||/^o[1-9A-HJ-NP-Za-km-z]{50}$/.test(data.opHash))||!/^(0|[1-9]\d*)$/.test(data.amountMutez)||!/^tz[1-4][1-9A-HJ-NP-Za-km-z]+$/.test(data.walletAddress))
    throw new Error('Saved prepaid credit transaction is unreadable. Do not send another payment until it is checked.');
  return data;
}
function parseXtzCredit(text:string):string{
  const value=text.trim();
  if(!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(value))throw new Error('Enter an XTZ amount with up to six decimal places.');
  const [whole,fraction='']=value.split('.');
  const amount=BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0')||'0');
  if(amount<=0n)throw new Error('Choose a positive XTZ credit amount.');
  return amount.toString();
}
function walletExplicitlyRejected(reason:unknown):boolean{
  if(!reason||typeof reason!=='object')return false;
  const value=reason as {errorType?:unknown;name?:unknown};
  return value.errorType==='ABORTED_ERROR'||value.name==='AbortedBeaconError';
}
const complete=(view:View,entrypoint:string)=>entrypoint==='create_offer'?!!view.chainStatus:
  entrypoint==='accept_offer'||entrypoint==='accept_prepaid'?view.guestDepositVerified:entrypoint==='cancel_offer'?view.chainStatus==='cancelled':
  entrypoint==='withdraw_guest'?!view.guestDepositVerified:entrypoint==='claim'?view.self.payout?.claimed===true:
  entrypoint==='refund'?view.chainStatus==='voided'&&!view.self.actions.refund:false;

export function OpenDuelFundingPanel({roomCode,onReturn,onEnterRoom}:{roomCode:string;onReturn():void;onEnterRoom():void}) {
  const {user}=useAuth(), wallet=useWallet(), account=user?String(user.id):null;
  const latch=useMemo(()=>createFundingActionLatch(`wtfiap-open-duel:${account}:${roomCode}`),[account,roomCode]);
  const [view,setView]=useState<View|null>(null),[busy,setBusy]=useState(false),[waiting,setWaiting]=useState(false);
  const [message,setMessage]=useState(''),[error,setError]=useState('');
  const [creditAmount,setCreditAmount]=useState(''),[creditPending,setCreditPending]=useState<CreditCheckpoint|null>(null);
  const [creditCheckpointError,setCreditCheckpointError]=useState('');
  const autoClaimed=useRef<string|null>(null),reconciling=useRef(false);
  const [pending,setPending]=useState<{entrypoint:string;opHash:string}|null>(()=>{
    if(!account)return null;
    try{return JSON.parse(localStorage.getItem(checkpointKey(account,roomCode))||'null');}catch{return null;}
  });
  useEffect(()=>{if(!account)return;try{setPending(JSON.parse(localStorage.getItem(checkpointKey(account,roomCode))||'null'));}
    catch{setError('The saved wallet operation is unreadable. Recheck chain status before another payment.');}},[account,roomCode]);
  useEffect(()=>{
    if(!account||!view?.config.prepaidEnabled||view.network!=='mainnet'||view.self.isHost)return;
    setCreditAmount(amount=>amount||formatFundingAmount(view.terms.entryAtomic,6));
    try{const saved=readCreditCheckpoint(account,view.escrowContract);
      setCreditPending(saved);setCreditCheckpointError(saved?.opHash==='unknown'?
        'The wallet response was lost. Do not buy credit again until wtfOS support checks this transaction. Other room actions remain available.':'');}
    catch(reason){setCreditCheckpointError((reason as Error).message);}
  },[account,view?.escrowContract,view?.config.prepaidEnabled,view?.self.isHost]);
  async function refresh(){
    const result=await api.get<{ok:true;room:View}>(endpoint(roomCode));
    setView(result.room);
    if(pending&&complete(result.room,pending.entrypoint)){
      localStorage.removeItem(checkpointKey(account!,roomCode));setPending(null);
      setMessage('Wallet transaction verified on Tezos '+result.room.network+'.');
    }else if(pending&&result.room.self.walletAddress){
      const query=new URLSearchParams({walletAddress:result.room.self.walletAddress,entrypoint:pending.entrypoint});
      const status=await api.get<{ok:true;operation:{status:'pending'|'applied'|'failed';operationHash:string}}>(
        `${endpoint(roomCode)}/operations/${encodeURIComponent(pending.opHash)}?${query}`);
      if(status.operation.operationHash===pending.opHash&&status.operation.status==='failed'){
        localStorage.removeItem(checkpointKey(account!,roomCode));setPending(null);
        setMessage('The wallet operation failed on-chain. Check the room’s verified balance and available actions before retrying.');
      }
    }
    return result.room;
  }
  useEffect(()=>{if(!account)return;let active=true;
    const tick=async()=>{try{
      let result=await api.get<{ok:true;room:View}>(endpoint(roomCode));
      if(!active)return;
      if(result.room.guestDepositVerified&&!result.room.guestSeatReady&&!reconciling.current){
        reconciling.current=true;
        try {
          await api.post(endpoint(roomCode)+'/reconcile',{});
          result=await api.get<{ok:true;room:View}>(endpoint(roomCode));
        } finally { reconciling.current=false; }
      }
      if(!active)return;setView(result.room);
      if(pending){
        if(complete(result.room,pending.entrypoint)){
          localStorage.removeItem(checkpointKey(account,roomCode));setPending(null);
        }else if(result.room.self.walletAddress){
          const query=new URLSearchParams({walletAddress:result.room.self.walletAddress,entrypoint:pending.entrypoint});
          const status=await api.get<{ok:true;operation:{status:'pending'|'applied'|'failed';operationHash:string}}>(
            `${endpoint(roomCode)}/operations/${encodeURIComponent(pending.opHash)}?${query}`);
          if(!active)return;
          if(status.operation.operationHash===pending.opHash&&status.operation.status==='failed'){
            localStorage.removeItem(checkpointKey(account,roomCode));setPending(null);
            setMessage('The wallet operation failed on-chain. Check the room’s verified balance and available actions before retrying.');
          }
        }
      }
    }catch(reason){if(active)setError((reason as Error).message);}};
    autoClaimed.current=null;void tick();const timer=window.setInterval(()=>void tick(),3000);
    return()=>{active=false;window.clearInterval(timer);};
  },[account,roomCode,pending?.opHash]);
  useEffect(()=>{
    if(!account||!view||!creditPending||creditPending.opHash==='unknown'||!view.config.prepaidEnabled)return;
    let active=true;
    const tick=async()=>{
      try{
        const query=new URLSearchParams({walletAddress:creditPending.walletAddress,amountMutez:creditPending.amountMutez});
        const result=await api.get<{ok:true;operation:{status:'pending'|'applied'|'failed';operationHash:string}}>(
          `${creditEndpoint}/operations/${encodeURIComponent(creditPending.opHash)}?${query}`);
        if(!active||result.operation.operationHash!==creditPending.opHash)return;
        if(result.operation.status==='applied'||result.operation.status==='failed'){
          localStorage.removeItem(creditCheckpointKey(account,view.escrowContract));setCreditPending(null);
          setMessage(result.operation.status==='applied'?'Prepaid XTZ credit verified. You can now claim an eligible open seat.':
            'The prepaid credit purchase failed on-chain. No credit was added.');
          await refresh();
        }
      }catch(reason){if(active)setError((reason as Error).message);}
    };
    void tick();const timer=window.setInterval(()=>void tick(),3000);
    return()=>{active=false;window.clearInterval(timer);};
  },[account,roomCode,view?.escrowContract,view?.config.prepaidEnabled,creditPending?.opHash]);
  async function action(work:()=>Promise<void>,allowPending=false){if(busy||pending&&!allowPending||latch.active)return;setBusy(true);setError('');setMessage('');
    try{await latch.run(work);}catch(reason){setError((reason as Error).message);}finally{setBusy(false);}}
  async function send(operation:FundingWalletAction,currentView:View|null=view){
    if(!account||!currentView)throw new Error('Sign in and load the room before staking.');
    if(operation.contract!==currentView.escrowContract||operation.network!==currentView.network||operation.chainId!==currentView.chainId)
      throw new Error('The wallet action does not match this room’s chain and escrow.');
    const entry=BigInt(currentView.terms.entryAtomic), expected=operation.entrypoint==='create_offer'?
      entry+BigInt(currentView.houseFeeAtomic):operation.entrypoint==='accept_offer'?entry:0n;
    if(BigInt(operation.amountMutez)!==expected)throw new Error('The wallet action amount differs from the displayed wager.');
    if(!['create_offer','accept_offer','accept_prepaid','cancel_offer','withdraw_guest','refund','claim'].includes(operation.entrypoint))
      throw new Error('This escrow action is unavailable.');
    if(operation.entrypoint==='accept_prepaid'&&(!currentView.config.prepaidEnabled||currentView.network!=='mainnet'))
      throw new Error('Prepaid credit is only available for eligible Mainnet XTZ duel seats.');
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
    if(result.room.config.prepaidEnabled&&result.room.network==='mainnet'&&!result.room.self.isHost){
      setWaiting(false);setMessage('Wallet linked. Choose a direct XTZ stake or prepaid credit for this open seat.');return;
    }
    if(result.room.self.actions.deposit)await send(result.room.self.actions.deposit,result.room);
    else{setWaiting(true);setMessage('Your wallet is verified. Waiting for the creator’s offer or the on-chain seat authorization.');}
  }
  async function buyCredit(){
    if(!view||!account||!view.config.prepaidEnabled||view.network!=='mainnet'||view.self.isHost)
      throw new Error('Prepaid credit is unavailable for this room.');
    if(creditCheckpointError||creditPending)throw new Error('Check the existing prepaid transaction before purchasing more credit.');
    const amountMutez=parseXtzCredit(creditAmount);
    const address=wallet.address||(await wallet.connect()).address;
    await assertWalletLinkedToCurrentUser(address);
    const key=creditCheckpointKey(account,view.escrowContract),probe=`${key}:write-check`;
    localStorage.setItem(probe,'1');
    if(localStorage.getItem(probe)!=='1')throw new Error('Browser storage is unavailable. No wallet transaction was sent.');
    localStorage.removeItem(probe);
    const quoted=await api.post<{ok:true;action:FundingWalletAction}>(`${creditEndpoint}/quote`,{walletAddress:address,amountMutez});
    const operation=quoted.action;
    if(operation.contract!==view.escrowContract||operation.network!=='mainnet'||operation.chainId!==view.chainId||
      operation.expectedWallet!==address||operation.entrypoint!=='deposit_credit'||operation.amountMutez!==amountMutez||operation.params!==address)
      throw new Error('The prepaid wallet action differs from this room’s verified credit contract.');
    if(getNetwork()!=='mainnet'){localStorage.setItem('wtf:network','mainnet');window.dispatchEvent(new Event('wtf:network-selected'));}
    // Only persist an unknown submission after all RPC and wallet preflight
    // reads pass, immediately before the single wallet submit call.
    let submitAttempted=false;
    try{
      const result=await sendFundingCallsWithCheckpoint([operation],address,'mainnet',view.chainId,()=>{
        localStorage.setItem(key,JSON.stringify({opHash:'unknown',walletAddress:address,amountMutez}));
        submitAttempted=true;
      });
      if(!result.opHash)throw new Error('The wallet did not return an operation hash.');
      const next={opHash:result.opHash,walletAddress:address,amountMutez};
      localStorage.setItem(key,JSON.stringify(next));setCreditPending(next);
    }catch(reason){
      if(!submitAttempted)throw reason;
      if(walletExplicitlyRejected(reason)){
        localStorage.removeItem(key);setCreditPending(null);
        throw new Error('The wallet request was cancelled. No prepaid credit purchase was sent.');
      }
      const guidance='The wallet submission result is uncertain. Do not buy credit again. Keep this browser data and contact wtfOS support with this room code.';
      setCreditCheckpointError(guidance);throw new Error(guidance);
    }
    setMessage('Credit purchase submitted. This room will verify the exact transaction before allowing another payment.');
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
  useEffect(()=>{
    const key=account?`${account}:${roomCode}`:null;
    if(!key||!view?.guestSeatReady||busy||pending||autoClaimed.current===key)return;
    autoClaimed.current=key;
    setBusy(true);setError('');
    void latch.run(claimSeat).catch(reason=>{
      setError((reason as Error).message);
      if(autoClaimed.current===key)autoClaimed.current=null;
    }).finally(()=>setBusy(false));
  },[account,roomCode,view?.guestSeatReady,busy,pending?.opHash]);
  if(!user)return <Surface><h2>Open-seat wager</h2><p>Sign in before staking or claiming a duel seat.</p><button onClick={onReturn}>Return</button></Surface>;
  const entry=view?formatFundingAmount(view.terms.entryAtomic,6):'—';
  const total=view?formatFundingAmount((BigInt(view.terms.entryAtomic)+BigInt(view.houseFeeAtomic)).toString(),6):'—';
  const network=!view?'Network loading…':view.network==='mainnet'?'Mainnet · real XTZ':'Shadownet · test XTZ';
  const stepTitle = pending||creditPending ? 'Checking your wallet transaction' : view?.guestSeatReady ? 'Your seat is ready' :
    view?.guestDepositVerified ? 'Activating your seat' : view?.self.actions.deposit ? 'Sign the wager in your wallet' :
    view?.self.canBind ? 'Connect your linked wallet' : view?.self.isHost && view?.chainStatus ?
      'Waiting for a challenger' : view?.chainStatus ? 'Check the room escrow' : 'Waiting for the creator';
  return <Surface aria-label="Open-seat duel wager" aria-busy={busy}>
    <h2>Duel wager</h2>
    <p><strong>{network}</strong> · {view?.self.isHost ? `Your stake: ${total} XTZ including the 0.5 XTZ house fee.` : `Your stake: ${entry} XTZ.`}</p>
    {view?.config.reason&&!view.config.enabled&&<p className="status">{view.config.reason}</p>}
    <section className="step" aria-label="Next escrow step"><h3>{stepTitle}</h3>
      <p>{pending||creditPending ? 'The room is checking Tezos automatically. Keep this room open; no second payment is needed.' :
        view?.guestSeatReady ? 'Enter the funded match when the room opens your commander.' :
        view?.guestDepositVerified ? 'Your payment is verified. The game is connecting your commander to this room.' :
        view?.self.isHost && view?.chainStatus ? 'Your wager is verified. Share this room link; a challenger can stake their matching entry.' :
        view?.self.canBind || view?.self.actions.deposit ? 'The wallet will ask you to review and sign the exact room amount.' :
        'The room will show your next available action when the creator funds the wager.'}</p>
    <div className="actions">
      {view?.self.canBind&&!pending&&<button className="primary" disabled={busy} onClick={()=>void action(stake)}>
        {view.config.prepaidEnabled&&view.network==='mainnet'&&!view.self.isHost?'Connect wallet and choose payment':'Stake wager'}
      </button>}
      {view?.self.actions.prepaidJoin&&!pending&&<button className="primary" disabled={busy} onClick={()=>void action(()=>send(view.self.actions.prepaidJoin!))}>
        Use {entry} XTZ credit to claim seat
      </button>}
      {view?.self.actions.deposit&&!pending&&<button className="primary" disabled={busy} onClick={()=>void action(()=>send(view.self.actions.deposit!))}>
        {view.self.isHost?'Stake '+total+' XTZ':'Stake '+entry+' XTZ'}
      </button>}
      {view?.self.actions.refund&&!pending&&<button disabled={busy} onClick={()=>void action(()=>send(view.self.actions.refund!))}>
        {view.self.isHost?'Cancel room and refund entry + 0.5 XTZ':view.self.prepaidSeat?'Return entry to prepaid credit':'Withdraw full entry'}
      </button>}
      {view?.self.actions.claim&&!pending&&<button className="primary" disabled={busy} onClick={()=>void action(()=>send(view.self.actions.claim!))}>Claim prize</button>}
      {view?.guestSeatReady&&<button className="primary" disabled={busy} onClick={()=>void action(claimSeat)}>Enter funded match</button>}
      <button disabled={busy} onClick={()=>void action(async()=>{await api.post(endpoint(roomCode)+'/reconcile',{});await refresh();},true)}>Refresh escrow status</button>
    </div>
    </section>
    {view?.config.prepaidEnabled&&view.network==='mainnet'&&!view.self.isHost&&<section className="step" aria-label="Prepaid XTZ credit">
      <h3>Prepaid seat credit</h3>
      <p>Available: {formatFundingAmount(view.self.creditBalanceAtomic||'0',6)} XTZ credit. One full credit equals 1 XTZ; fractions are allowed. Credit can only claim open Mainnet XTZ challenger seats. Unspent credit cannot be withdrawn as XTZ. Pre-start and technical-void refunds return credit; winners receive XTZ.</p>
      <label htmlFor="prepaid-credit-amount">Buy XTZ credit</label>
      <input id="prepaid-credit-amount" inputMode="decimal" value={creditAmount} onChange={event=>setCreditAmount(event.target.value)} aria-label="XTZ credit purchase amount" />
      <div className="actions"><button disabled={busy||!!pending||!!creditPending||!!creditCheckpointError} onClick={()=>void action(buyCredit)}>Review credit purchase in wallet</button></div>
      {creditPending&&<p className="status" role="status">Credit transaction <code>{creditPending.opHash}</code> is awaiting exact on-chain verification. Do not send it again.</p>}
      {creditCheckpointError&&<p className="error" role="alert">{creditCheckpointError}</p>}
    </section>}
    {pending&&<p className="status" role="status">Wallet operation submitted: <code>{pending.opHash}</code>. Verification is pending; no second payment is needed.</p>}
    {view?.guestDepositVerified&&!view.guestSeatReady&&<p className="status" role="status">Your entry is confirmed on-chain. The room is activating your seat now; you do not need to stake again.</p>}
    {message&&<p className="status" role="status">{message}</p>}
    {error&&<p className="error" role="alert">{error}</p>}
    <details><summary>Wager rules and contract details</summary>
    <p>The creator can fund before a challenger arrives. The first verified matching challenger deposit claims the seat. The winner receives both entries. {view?.payoutMode==='automatic'?'The game pays the winner automatically when the match settles.':'This room uses winner-claimed escrow payouts.'} Your wallet pays network transaction and storage fees separately.</p>
    {view&&<dl><dt>Room</dt><dd>{roomCode}</dd><dt>Network</dt><dd>{network}</dd>
      <dt>Escrow</dt><dd><code>{view.escrowContract}</code></dd><dt>Status</dt><dd>{view.status}</dd>
      <dt>Verified deposits</dt><dd>{view.depositedCount} of 2</dd><dt>Prize pot</dt><dd>{formatFundingAmount(view.potAtomic,6)} XTZ</dd>
      <dt>House fee</dt><dd>0.5 XTZ, separate from the prize; refundable before combat and on a technical void.</dd>
      <dt>Payout</dt><dd>{view.payoutMode==='automatic'?view.chainStatus==='settled'?
        view.self.prepaidSeat&&view.self.payout?.amount===view.terms.entryAtomic?
          'Your prepaid entry was restored as credit on an exact tie. The creator’s entry was returned as XTZ.':
          `${formatFundingAmount(view.paidOutAtomic,6)} XTZ paid automatically on settlement.`:
        'Automatic on verified match settlement.':
        view.chainStatus==='settled'?'Winner claims from escrow.':'Winner claims after settlement.'}</dd>
      <dt>Treasury</dt><dd><code>{view.treasuryAddress}</code></dd></dl>}
    </details>
    <div className="actions"><button onClick={onReturn}>Back to room</button></div>
  </Surface>;
}
