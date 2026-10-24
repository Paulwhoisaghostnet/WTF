import { useEffect, useMemo, useRef, useState } from "react";
import { styled } from "styled-components";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useWallet } from "../../lib/wallet-context";
import { assertWalletLinkedToCurrentUser } from "../../lib/tezos/wallet-ownership";
import { createFundingActionLatch, loadFundingCheckpoint, type FundingCheckpoint } from "./funding-checkpoint";
import { acknowledgeFundingCheckpoint, fundingActionCompleted, submitFundingAction } from "./funding-submit";
import { formatFundingAmount, fundingEntryError, type FundingActionKind, type FundingConfig, type FundingRoom } from "./funding-types";
import { fundingWalletGateway } from "./funding-wallet-adapter";
import { getNetwork } from "../../lib/tezos/loaders";

const Panel = styled.section`
  flex: 1; min-height: 0; overflow: auto; padding: 16px;
  color: var(--wtf-text-color, #111); background: var(--wtf-window-color, #c0c0c0);
  h2 { margin: 0 0 8px; } p { line-height: 1.5; }
  button { padding: 8px 12px; color: inherit; cursor: pointer; }
  button:disabled { cursor: default; opacity: .6; }
  button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  code { overflow-wrap: anywhere; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 16px; }
  dt { font-weight: bold; } dd { margin: 0; overflow-wrap: anywhere; }
  ul { padding-left: 20px; } li { margin-block: 8px; overflow-wrap: anywhere; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-block: 16px; }
  .payment-step { padding: 14px; border: 2px solid #8b6825; background: #e8dfc7; color: #111; }
  .payment-step h3 { margin: 0 0 6px; }
  .payment-step p { margin: 0; }
  .payment-step button { background: #2c584d; color: #fff; border: 1px solid #17372f; font-weight: 700; }
  .payment-step button:disabled { background: #61736e; }
  .status { padding: 10px; border: 1px solid currentColor; }
  .error { color: var(--wtf-error-color, #900); }
`;

type RoomResponse = { ok: true; room: FundingRoom };
const endpoint = (roomCode: string) => `/api/wtfiap/funding/rooms/${encodeURIComponent(roomCode)}`;
const configEndpoint = (roomCode: string) => `/api/wtfiap/funding/config?room=${encodeURIComponent(roomCode)}`;

export function FundingPanel({ roomCode, onReturn }: { roomCode: string; onReturn(): void }) {
  const { user } = useAuth();
  const wallet = useWallet();
  const accountId = user ? String(user.id) : null;
  const [config, setConfig] = useState<FundingConfig | null>(null);
  const [room, setRoom] = useState<FundingRoom | null>(null);
  const [checkpoint, setCheckpoint] = useState<FundingCheckpoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [currentNetwork, setCurrentNetwork] = useState(getNetwork);
  const latch = useMemo(() => createFundingActionLatch(`wtfiap-account:${accountId}`), [accountId]);
  const generation = useRef(0);

  useEffect(() => {
    const sync = () => setCurrentNetwork(getNetwork());
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("wtf:network-selected", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("wtf:network-selected", sync);
    };
  }, []);

  useEffect(() => {
    const turn = ++generation.current;
    setConfig(null); setRoom(null); setCheckpoint(null); setError(""); setMessage("");
    if (!accountId) return;
    try { setCheckpoint(loadFundingCheckpoint(localStorage, accountId, roomCode)); } catch (reason) { setError((reason as Error).message); }
    setBusy(true);
    Promise.all([
      api.get<{ ok: true; config: FundingConfig }>(configEndpoint(roomCode)),
      api.get<RoomResponse>(endpoint(roomCode)),
    ]).then(([settings, view]) => {
      if (turn === generation.current) { setConfig(settings.config); setRoom(view.room); }
    }).catch(reason => { if (turn === generation.current) setError((reason as Error).message); })
      .finally(() => { if (turn === generation.current) setBusy(false); });
    return () => { generation.current++; };
  }, [accountId, roomCode]);

  async function run(action: () => Promise<void>) {
    if (latch.active) return;
    const turn = generation.current;
    setBusy(true); setError(""); setMessage("");
    try { await latch.run(action); }
    catch (reason) { if (turn === generation.current) setError((reason as Error).message); }
    finally { if (turn === generation.current) setBusy(false); }
  }

  async function mutate(action: string, data: unknown = {}) {
    const turn = generation.current;
    const response = await api.post<RoomResponse>(`${endpoint(roomCode)}/${action}`, data);
    if (turn === generation.current) setRoom(response.room);
    return response.room;
  }

  async function refresh() {
    if (!accountId) return;
    if (!room || !config) {
      const [settings, view] = await Promise.all([api.get<{ ok: true; config: FundingConfig }>(configEndpoint(roomCode)), api.get<RoomResponse>(endpoint(roomCode))]);
      setConfig(settings.config); setRoom(view.room);
      return;
    }
    const saved = checkpoint || loadFundingCheckpoint(localStorage, accountId, roomCode);
    const updated = saved
      ? await mutate("observe", { operationHash: saved.operationHash, action: saved.action })
      : await mutate("reconcile");
    if (saved && acknowledgeFundingCheckpoint(localStorage, accountId, updated, saved)) setCheckpoint(null);
    setMessage("Room status refreshed from the server. Submitted operations remain pending until verified on the room’s chain.");
  }

  async function bind() {
    const address = wallet.address || (await wallet.connect()).address;
    await assertWalletLinkedToCurrentUser(address);
    await mutate("bind-wallet", { walletAddress: address });
    setMessage("Wallet bound to your seat. The host can open escrow after every paying entrant binds a wallet.");
  }

  async function send(kind: FundingActionKind) {
    if (!room || !config || !accountId) return;
    if (getNetwork() !== room.network) throw new Error(`Select Tezos ${room.network} for wallet operations before continuing. This room’s network cannot change.`);
    const turn = generation.current;
    const address = wallet.address || (await wallet.connect()).address;
    // A room retains its original asset and chain even if deployment defaults later change.
    const pinned = { ...config, network: room.network, chainId: room.chainId, escrowContract: room.escrowContract, wtfToken: room.wtfToken };
    const updated = await submitFundingAction({
      store: localStorage,
      gateway: fundingWalletGateway,
      onSubmitted(value) { if (turn === generation.current) { setCheckpoint(value); setMessage("Submitted to the wallet’s network. Verification is pending; no second payment is needed."); } },
      async observe(value) { return mutate("observe", { operationHash: value.operationHash, action: value.action }); },
    }, accountId, pinned, room, kind, address);
    if (turn === generation.current) {
      setRoom(updated);
      setCheckpoint(loadFundingCheckpoint(localStorage, accountId, roomCode));
    }
  }

  if (!user) return <Panel aria-label="Room funding"><h2>Room funding</h2><p>Sign in to wtfOS and join this room with your account before binding a wallet or funding an entry. Free rooms remain available without payment.</p><button onClick={onReturn}>Return to game</button></Panel>;
  const serverPending = room?.self.pendingOperations.filter(item => item.status !== "failed" && item.status !== "applied" && !fundingActionCompleted(room, item.action)) || [];
  const pending = Boolean(checkpoint || serverPending.length);
  const actionsDisabled = busy || pending;
  const entryError = room ? fundingEntryError(room) : null;
  const networkMismatch = Boolean(room && currentNetwork !== room.network);
  const refunded = room?.self.pendingOperations.some(item => item.action === "refund" && item.status === "applied");
  const refundLabel = room?.chainStatus === "funding" ? "Withdraw full entry to bound wallet" : "Claim full refund to bound wallet";
  return <Panel aria-label="Room funding" aria-busy={busy}>
    <h2>{room?.roomType === "duel" ? "Duel funding" : "Tournament funding"}</h2>
    <p>{room?.roomType === "duel" ? "Two paying players · the winner receives the prize pool. Exact ties share it equally." : `${room?.payingEntrants ?? "—"} paying humans · ${room?.aiFill ? "AI fill to eight battlefield seats" : "eight human battlefield seats"} · 50% / 35% / 15% before rounding. Exact ties share the combined prizes for their occupied places.`} Each player’s prize is rounded down to the room’s prize increment.</p>
    <p>Entry and prizes use the room’s currency. Wallet deposits go to escrow; the game server validates matches and submits results. Only your wallet can collect its prize.</p>
    <p><a href={`/wtfiap?room=${encodeURIComponent(roomCode)}&funding=1`}>Open this room’s funding recovery page</a> · Save this link to check deposits and claims independently of the battlefield.</p>
    {config && !config.enabled && <p className="status">{config.reason || "New tournament funding is unavailable on this deployment."}{room?.chainStatus ? " Existing verified prize claims and eligible full entry refunds remain available to their bound wallets." : " No entry can be deposited here while funding is unavailable."}</p>}
    {room && <>
      {networkMismatch && <div className="status"><p>This room stays on Tezos {room.network}. wtfOS currently uses {currentNetwork} for wallet operations. Select the room’s network before depositing, withdrawing or claiming. Account ownership is verified separately on Mainnet; the shared wallet connector will request the room’s network when you submit an operation.</p><button disabled={busy} onClick={() => void run(async () => {
        localStorage.setItem("wtf:network", room.network);
        window.dispatchEvent(new Event("wtf:network-selected"));
        setCurrentNetwork(getNetwork());
        setMessage(`Tezos ${room.network} selected for wtfOS wallet operations. No wallet operation was sent.`);
      })}>Use {room.network} for wallet operations</button></div>}
      {(room.self.canOpen || room.self.actions.deposit) && entryError && <p role="alert" className="error">{entryError}</p>}
      <section className="payment-step" aria-label="Wager actions">
        <h3>{room.self.actions.deposit ? "Deposit your entry" : "Wager setup and claims"}</h3>
        <p>{room.self.actions.deposit ? "Choose Deposit, then approve the transaction in your Tezos wallet. The room updates after the deposit is verified on-chain." : "Complete the available wallet step below to advance this room."}</p>
      <div className="actions">
        {room.self.canBind && <button disabled={actionsDisabled || !config?.enabled} onClick={() => void run(bind)}>{wallet.address ? "Bind connected wallet" : "Connect and bind wallet"}</button>}
        {room.self.canOpen && <button disabled={actionsDisabled || !config?.enabled || !!entryError} onClick={() => void run(async () => { if (entryError) throw new Error(entryError); await mutate("open"); setMessage("Escrow creation requested. Recheck status to follow the server’s submitted operation."); })}>Freeze {room.payingEntrants} wallets &amp; open escrow</button>}
        {room.self.actions.deposit && <button disabled={actionsDisabled || !config?.enabled || !!entryError || networkMismatch} onClick={() => void run(() => send("deposit"))}>{refunded ? "Redeposit" : "Deposit"} {formatFundingAmount(room.terms.currency === "XTZ" ? room.self.actions.deposit.amountMutez : room.terms.entryAtomic, room.terms.decimals)} {room.terms.currency}{room.houseFeeAtomic ? " total (entry + house fee)" : ""}</button>}
        {room.self.canStart && <button disabled={actionsDisabled || !config?.enabled} onClick={() => void run(async () => { await mutate("start"); setMessage("Match start requested. The room will start after the on-chain start is verified."); })}>Start funded {room.roomType}</button>}
        {room.self.actions.claim && <button disabled={busy || pending || networkMismatch} onClick={() => void run(() => send("claim"))}>Claim prize to bound wallet</button>}
        {room.self.actions.refund && <button disabled={busy || pending || networkMismatch} onClick={() => void run(() => send("refund"))}>{refundLabel}</button>}
      </div>
      </section>
      <dl>
        <dt>Room</dt><dd>{room.roomCode}</dd>
        <dt>Network</dt><dd>Tezos {room.network} · <code>{room.chainId}</code></dd>
        <dt>Wallet operations</dt><dd>Tezos {currentNetwork} selected in wtfOS</dd>
        <dt>Entry</dt><dd>{formatFundingAmount(room.terms.entryAtomic, room.terms.decimals)} {room.terms.currency}</dd>
        {room.houseFeeAtomic && <><dt>Mainnet XTZ house fee</dt><dd>{formatFundingAmount(room.houseFeeAtomic, 6)} XTZ once per duel room, paid by its creator with their wager deposit and sent to wtf.tez on settlement. A pre-start withdrawal or technical void refunds it.</dd></>}
        {room.feeQuantumAtomic && <><dt>Entry / prize increments</dt><dd>{formatFundingAmount(room.feeQuantumAtomic, room.terms.decimals)} {room.terms.currency}</dd></>}
        <dt>Refund policy</dt><dd>{room.refundPolicy === "prestart-withdrawal;technical-void-full-refund-v1" ? "Withdraw your full entry before the match starts; you may deposit again before start. After start, a verified technical void makes the full entry refundable. An ordinary loss is not refundable." : "Not configured; funding cannot open until this policy is approved."}</dd>
        <dt>Prize rounding</dt><dd>{room.prizeRoundingPolicy === "floor-each-prize-to-quantum;remainder-to-wtf.tez-v1" ? "Round each player’s prize down to the increment above; all remaining room currency goes to wtf.tez." : "Not configured; prize rounding must be approved before funding."}</dd>
        <dt>wtf.tez treasury</dt><dd><code>{room.treasuryAddress || "Not configured"}</code></dd>
        <dt>Prize pool</dt><dd>{formatFundingAmount(room.potAtomic, room.terms.decimals)} {room.terms.currency} · {room.depositedCount} / {room.payingEntrants} paying deposits verified</dd>
        <dt>Status</dt><dd>{room.status}{room.chainStatus ? ` · chain: ${room.chainStatus}` : " · escrow not confirmed"}</dd>
        <dt>Escrow</dt><dd><code>{room.escrowContract}</code></dd>
        <dt>Your bound wallet</dt><dd><code>{room.self.walletAddress || "Not bound"}</code></dd>
        <dt>Connected wallet</dt><dd><code>{wallet.address || "Not connected"}</code></dd>
        {room.self.payout && <><dt>Your prize</dt><dd>{formatFundingAmount(room.self.payout.amount, room.terms.decimals)} {room.terms.currency} · {room.self.payout.claimed ? "Claim verified" : room.self.payout.amount === "0" ? "No payable prize" : "Available to claim"}</dd></>}
        {room.prizeSummary && <><dt>Verified player prizes</dt><dd>{formatFundingAmount(room.prizeSummary.allocatedPlayerPrizesAtomic, room.terms.decimals)} {room.terms.currency}</dd><dt>wtf.tez remainder</dt><dd>{formatFundingAmount(room.prizeSummary.treasuryRemainderAtomic, room.terms.decimals)} {room.terms.currency} · {room.prizeSummary.treasuryClaimed ? "Transfer verified" : "Reserved for treasury"}</dd></>}
        {room.terms.currency === "WTF" && <><dt>WTF asset</dt><dd><code>{room.wtfToken.contract}</code> · token {room.wtfToken.tokenId}</dd></>}
      </dl>
      <p>Wallet bindings and entry terms freeze when the host opens escrow. Deposits are verified on-chain before the host can start the match.</p>
      {room.chainStatus === "voided" && <p className="status">This match was technically voided. Each paid entrant can recover their full entry from escrow; no prizes are awarded.</p>}
      {refunded && room.chainStatus === "funding" && room.self.actions.deposit && <p className="status">Your full entry withdrawal is verified. You can deposit again while this room remains open for funding.</p>}
      {room.terms.currency === "WTF" && <p>A WTF deposit asks your wallet to approve one batch: allow this escrow to transfer WTF, deposit the entry, then remove its permission. Your wallet also needs XTZ on {room.network} to pay the transaction and storage fees.</p>}
      <ul aria-label="Paying wallet roster">{room.roster.map(player => <li key={player.playerId}><strong>{player.name}</strong> · <code>{player.walletAddress || "Wallet not bound"}</code> · {player.deposited ? "Deposit verified" : "No verified deposit"}</li>)}</ul>
      {room.health.error && <p className="status">Chain verification is delayed: {room.health.error}. A submitted hash does not yet prove payment. Use Recheck status.</p>}
    </>}
    {checkpoint && <p className="status">{checkpoint.action} submitted · <code>{checkpoint.operationHash}</code><br />Verification pending. Rechecking never sends another wallet operation.</p>}
    {serverPending.filter(item => item.operationHash !== checkpoint?.operationHash).map(item => <p className="status" key={item.operationHash}>{item.action} submitted · <code>{item.operationHash}</code><br />Server verification pending. Recheck before sending anything else.</p>)}
    {room?.self.pendingOperations.filter(item => item.status === "failed").map(item => <p key={item.operationHash}>{item.action} failed on-chain · <code>{item.operationHash}</code>. A new attempt is allowed if the action remains available.</p>)}
    {room?.operations.filter(item => item.operationHash).map(item => <p key={`${item.kind}:${item.operationHash}`}><strong>{item.kind}: {item.status}</strong> · <code>{item.operationHash}</code></p>)}
    {message && <p className="status" role="status">{message}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button disabled={busy} onClick={() => void run(refresh)}>Recheck status</button><button onClick={onReturn}>Return to game</button></div>
  </Panel>;
}
