import { useEffect, useMemo, useState } from "react";
import { styled } from "styled-components";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { useWallet } from "../../lib/wallet-context";
import { assertWalletLinkedToCurrentUser } from "../../lib/tezos/wallet-ownership";
import { getNetwork } from "../../lib/tezos/loaders";
import { createFundingActionLatch } from "./funding-checkpoint";
import { fundingWalletGateway } from "./funding-wallet-adapter";
import { formatFundingAmount, type FundingWalletAction } from "./funding-types";
import { sponsorWalletCalls } from "./sponsor-funding-calls";

const Surface = styled.section`
  min-height: 0; overflow: auto; padding: 16px; box-sizing: border-box; background: transparent; color: inherit;
  h2, h3 { margin: 0 0 8px; } h3 { font-size: 1rem; } p { line-height: 1.45; }
  button { padding: 10px 14px; cursor: pointer; } button:disabled { opacity: .6; cursor: default; }
  button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
  .step { border: 1px solid #9c8350; border-radius: 6px; padding: 12px; margin: 12px 0; }
  .primary { background: #d9bb72; color: #102322; border: 1px solid #d9bb72; font-weight: 700; }
  .status { padding: 10px; border: 1px solid currentColor; overflow-wrap: anywhere; }
  .error { color: #ffaaa0; } code { overflow-wrap: anywhere; }
  ul { padding-left: 20px; } li { margin: 6px 0; }
`;

type Lot = { contract: string; tokenId: string; amount: string; place?: number };
type Plan = {
  mode: "fixed" | "random" | "pick";
  minimumHumans: number;
  entry: { currency: "FREE" | "XTZ" | "WTF"; entryAtomic: string; poolNumerator: string; poolDenominator: string; designatedWallet: string | null };
  places: Array<{ place: number; xtzAtomic: string; wtfAtomic: string; poolWeight: string }>;
  tokens: Lot[];
  deposit: { xtzAtomic: string; wtfAtomic: string };
};
type IndexedAction = { index: number; action: FundingWalletAction };
type CashClaim = { currency: "XTZ" | "WTF"; amountAtomic: string; action: FundingWalletAction };
type LotClaim = IndexedAction & Lot;
type SponsorActions = {
  sponsorXtz?: FundingWalletAction; sponsorWtf?: FundingWalletAction; sponsorLots: IndexedAction[];
  entry?: FundingWalletAction; cancel?: FundingWalletAction; refundEntry?: FundingWalletAction;
  refundSponsorXtz?: FundingWalletAction; refundSponsorWtf?: FundingWalletAction;
  refundSponsorLots: IndexedAction[]; cashClaims: CashClaim[]; lotClaims: LotClaim[];
};
type SponsorRoom = {
  roomCode: string; status: string; network: "mainnet" | "shadownet"; chainId: string;
  escrowContract: string; roomId: string | null; termsHash: string | null; terms: Plan;
  houseFeeAtomic?: string | null; wtfToken: { contract: string; tokenId: string | number; decimals: 8 };
  sponsorFunded: boolean; depositedCount: number; roster: Array<{ name: string; deposited: boolean; walletAddress: string | null }>;
  lotVerification?: { funded: number; verified: number; required: number; pending: boolean };
  config: { enabled: boolean; reason?: string | null };
  self: { role: "sponsor" | "entrant" | "watcher"; walletAddress: string | null; canBind: boolean; canOpen: boolean; canStart: boolean; canPick: boolean; actions: SponsorActions };
  prizeSelection: null | { nextPlace: number | null; nextPlayerId: string | null;
    nextPlayerName: string | null; remainingForPlace: number;
    chosen: Array<{ index: number; place: number; playerId: string }>;
    availableLots: Array<{ index: number; contract: string; tokenId: string; amount: string }> };
  operations?: Array<{ operationHash?: string | null; status: string }>;
  error?: string | null;
};

const endpoint = (code: string) => `/api/wtfiap/sponsor-funding/rooms/${encodeURIComponent(code)}`;
const checkpointKey = (account: string, code: string) => `wtfiap:sponsor:pending:${account}:${code}`;
const observedAction = (kind: string, index?: number) => {
  if (kind === "sponsorLot") {
    if (!Number.isSafeInteger(index) || index! < 0) throw new Error("The prize lot index is missing.");
    return `sponsorToken:${index}`;
  }
  return kind;
};
const atomic = (value: string): bigint => {
  if (!/^(0|[1-9]\d*)$/.test(value)) throw new Error("Invalid prize amount in this room.");
  return BigInt(value);
};
export function SponsorFundingPanel({ roomCode, onReturn }: { roomCode: string; onReturn(): void }) {
  const { user } = useAuth(), wallet = useWallet(), account = user ? String(user.id) : null;
  const latch = useMemo(() => createFundingActionLatch(`wtfiap-sponsor:${account}:${roomCode}`), [account, roomCode]);
  const [room, setRoom] = useState<SponsorRoom | null>(null), [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ kind: string; index?: number; opHash: string } | null>(() => {
    if (!account) return null;
    try { return JSON.parse(localStorage.getItem(checkpointKey(account, roomCode)) || "null"); } catch { return null; }
  });
  const [selectedNetwork, setSelectedNetwork] = useState(getNetwork);
  const [message, setMessage] = useState(""), [error, setError] = useState("");
  useEffect(() => {
    const sync = () => setSelectedNetwork(getNetwork());
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    window.addEventListener("wtf:network-selected", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("wtf:network-selected", sync);
    };
  }, []);
  async function refresh() {
    const response = await api.get<{ ok: true; room: SponsorRoom }>(endpoint(roomCode));
    setRoom(response.room);
    if (pending && response.room.operations?.some(item => item.operationHash === pending.opHash && (item.status === "applied" || item.status === "failed"))) {
      localStorage.removeItem(checkpointKey(account!, roomCode)); setPending(null);
      setMessage("Wallet operation verified on Tezos " + response.room.network + ".");
    }
    return response.room;
  }
  useEffect(() => {
    if (!account) return;
    let active = true;
    const poll = async () => {
      try { const response = await api.get<{ ok: true; room: SponsorRoom }>(endpoint(roomCode)); if (!active) return;
        setRoom(response.room);
        const saved = JSON.parse(localStorage.getItem(checkpointKey(account, roomCode)) || "null");
        if (saved && response.room.operations?.some(item => item.operationHash === saved.opHash && (item.status === "applied" || item.status === "failed"))) {
          localStorage.removeItem(checkpointKey(account, roomCode)); setPending(null);
        }
      } catch (reason) { if (active) setError((reason as Error).message); }
    };
    void poll(); const timer = window.setInterval(() => void poll(), 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [account, roomCode]);
  async function run(work: () => Promise<void>) {
    if (busy || latch.active) return;
    setBusy(true); setError(""); setMessage("");
    try { await latch.run(work); } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(false); }
  }
  async function post(action: string, body: unknown = {}) {
    const response = await api.post<{ ok: true; room: SponsorRoom }>(endpoint(roomCode) + "/" + action, body);
    setRoom(response.room); return response.room;
  }
  async function bind() {
    const address = wallet.address || (await wallet.connect()).address;
    await assertWalletLinkedToCurrentUser(address);
    await post("bind-wallet", { walletAddress: address });
    setMessage("Wallet bound to this room. Prize custody and entry payments remain separate steps.");
  }
  async function send(kind: string, action: FundingWalletAction, index?: number, currency?: "XTZ" | "WTF") {
    if (!room || !account) throw new Error("Sign in and load the room before funding a prize.");
    if (pending || localStorage.getItem(checkpointKey(account, roomCode))) throw new Error("A wallet operation is awaiting verification. Recheck before sending another.");
    const address = wallet.address || (await wallet.connect()).address;
    await assertWalletLinkedToCurrentUser(address);
    if (address !== room.self.walletAddress) throw new Error("Connect the exact wallet bound to this room.");
    if (getNetwork() !== room.network) throw new Error("Select Tezos " + room.network + " for this room before signing.");
    const calls = sponsorWalletCalls(room, action, kind, index, currency);
    const result = await fundingWalletGateway.send(calls, address, room.network, room.chainId);
    if (!result.opHash) throw new Error("The wallet did not return an operation hash. Recheck before retrying.");
    const checkpoint = { kind, ...(index === undefined ? {} : { index }), opHash: result.opHash };
    localStorage.setItem(checkpointKey(account, roomCode), JSON.stringify(checkpoint)); setPending(checkpoint);
    setMessage("Transaction submitted. The room is checking Tezos; do not send it again.");
    await post("observe", { operationHash: result.opHash, action: observedAction(kind, index) });
  }
  if (!user) return <Surface><h2>Prize escrow</h2><p>Sign in to wtfOS to fund or claim a prize.</p><button onClick={onReturn}>Return to room</button></Surface>;
  const actions = room?.self.actions;
  const exitDisabled = busy || !!pending || !room?.roomId;
  const fundingDisabled = exitDisabled || !room?.config.enabled;
  const entry = room?.terms.entry;
  return <Surface aria-label="Prize escrow" aria-busy={busy}>
    <h2>Room prizes</h2>
    <p>{room ? `Tezos ${room.network} · ${room.terms.minimumHumans} human entrants needed to start` : "Checking room rules…"}</p>
    {room?.config.reason && !room.config.enabled && <p className="status" role="status">{room.config.reason} New prize and entry payments are paused. Existing refund and claim actions remain available for an opened room.</p>}
    {room && selectedNetwork !== room.network && <section className="step" role="status"><h3>Choose this room’s network</h3>
      <p>This prize room uses Tezos {room.network}. Switch the app’s network before signing a wallet transaction.</p>
      <button onClick={() => { localStorage.setItem("wtf:network", room.network); window.dispatchEvent(new Event("wtf:network-selected")); setSelectedNetwork(getNetwork()); }}>Switch to {room.network}</button>
    </section>}
    {room && <>
      <section className="step"><h3>Prizes</h3><ul>{room.terms.places.map(place => <li key={place.place}><strong>Place {place.place}</strong>
        {atomic(place.xtzAtomic) > 0n && ` · ${formatFundingAmount(place.xtzAtomic, 6)} XTZ`}
        {atomic(place.wtfAtomic) > 0n && ` · ${formatFundingAmount(place.wtfAtomic, 8)} WTF`}
        {room.terms.tokens.filter(token => token.place === place.place).map(token => ` · FA2 ${token.contract} #${token.tokenId} ×${token.amount}`).join("")}
      </li>)}</ul>
        {room.terms.mode !== "fixed" && <p>FA2 prizes use {room.terms.mode === "random" ? "a seeded random allocation" : "finish-place picks"} when the match ends.</p>}
        {room.terms.tokens.length > 0 && <p><small>Token custody checks use <a href="https://tzkt.io" target="_blank" rel="noopener noreferrer">data provided by TzKT API</a>.</small></p>}
        <p>{entry?.currency === "FREE" ? "Free entry" : `Entry: ${formatFundingAmount(entry?.entryAtomic || "0", entry?.currency === "WTF" ? 8 : 6)} ${entry?.currency} per human`}. Sponsor prize funding is separate from entry payment.</p>
      </section>
      {room.prizeSelection && <section className="step" aria-label="Finish-place FA2 prize picks">
        <h3>Choose FA2 prizes</h3>
        {room.prizeSelection.nextPlace === null
          ? <p role="status">All finishers have chosen. The verified prize result is being submitted to escrow.</p>
          : <p role="status">{room.prizeSelection.nextPlayerName || "The next finisher"} chooses for place {room.prizeSelection.nextPlace}. {room.prizeSelection.remainingForPlace} pick{room.prizeSelection.remainingForPlace === 1 ? " remains" : "s remain"} at this place.</p>}
        {room.prizeSelection.chosen.length > 0 && <ul aria-label="Recorded prize choices">{room.prizeSelection.chosen.map(pick => {
          const lot = room.terms.tokens[pick.index];
          return <li key={pick.index}>Place {pick.place} chose FA2 {lot.contract} #{lot.tokenId} ×{lot.amount}</li>;
        })}</ul>}
        {room.self.canPick && <div className="actions">{room.prizeSelection.availableLots.map(lot =>
          <button key={lot.index} className="primary" disabled={busy}
            onClick={() => void run(async () => { await post("pick-lot", { index: lot.index });
              setMessage("Your FA2 prize choice was recorded. The next finisher may choose when it is their turn."); })}>
            Pick FA2 {lot.contract} #{lot.tokenId} ×{lot.amount}
          </button>)}</div>}
      </section>}
      <section className="step"><h3>Fund and enter</h3>
        <p>{room.sponsorFunded ? "Sponsor prizes verified in escrow." : "Waiting for sponsor prizes to be verified in escrow."} {room.depositedCount} entrant deposits verified.</p>
        {room.lotVerification?.pending && <p role="status">FA2 prize transfer seen on Tezos; token custody verification is pending. The room cannot start until the transfer and escrow balance are confirmed.</p>}
        <div className="actions">
          {room.self.canBind && <button className="primary" disabled={fundingDisabled} onClick={() => void run(bind)}>Connect and bind wallet</button>}
          {room.self.canOpen && <button className="primary" disabled={fundingDisabled} onClick={() => void run(async () => { await post("open"); setMessage("Prize escrow creation requested; check status before depositing."); })}>Open prize escrow</button>}
          {actions?.sponsorXtz && <button className="primary" disabled={fundingDisabled} onClick={() => void run(() => send("sponsorXtz", actions.sponsorXtz!))}>Stake XTZ prize · {formatFundingAmount((atomic(room.terms.deposit.xtzAtomic) + atomic(room.houseFeeAtomic || "0")).toString(), 6)} XTZ</button>}
          {actions?.sponsorWtf && <button className="primary" disabled={fundingDisabled} onClick={() => void run(() => send("sponsorWtf", actions.sponsorWtf!))}>Stake WTF prize · {formatFundingAmount(room.terms.deposit.wtfAtomic, 8)} WTF</button>}
          {actions?.sponsorLots?.map(lot => <button key={lot.index} className="primary" disabled={fundingDisabled} onClick={() => void run(() => send("sponsorLot", lot.action, lot.index))}>Stake FA2 #{room.terms.tokens[lot.index]?.tokenId} · lot {lot.index + 1}</button>)}
          {actions?.entry && <button className="primary" disabled={fundingDisabled} onClick={() => void run(() => send("entry", actions.entry!))}>{entry?.currency === "FREE" ? "Confirm free entry" : `Pay entry · ${formatFundingAmount(entry?.entryAtomic || "0", entry?.currency === "WTF" ? 8 : 6)} ${entry?.currency}`}</button>}
          {room.self.canStart && <button className="primary" disabled={fundingDisabled} onClick={() => void run(async () => { await post("start"); setMessage("Match start requested. It begins after escrow verifies every required deposit."); })}>Start funded match</button>}
        </div>
      </section>
      {(actions?.cancel || actions?.refundEntry || actions?.refundSponsorXtz || actions?.refundSponsorWtf || actions?.refundSponsorLots?.length || actions?.cashClaims?.length || actions?.lotClaims?.length) ?
        <section className="step"><h3>Refunds and winnings</h3><div className="actions">
          {actions.cancel && <button disabled={exitDisabled} onClick={() => void run(() => send("cancel", actions.cancel!))}>Cancel before combat</button>}
          {actions.refundEntry && <button disabled={exitDisabled} onClick={() => void run(() => send("refundEntry", actions.refundEntry!))}>Refund entry</button>}
          {actions.refundSponsorXtz && <button disabled={exitDisabled} onClick={() => void run(() => send("refundSponsorXtz", actions.refundSponsorXtz!))}>Refund XTZ prize</button>}
          {actions.refundSponsorWtf && <button disabled={exitDisabled} onClick={() => void run(() => send("refundSponsorWtf", actions.refundSponsorWtf!))}>Refund WTF prize</button>}
          {actions.refundSponsorLots?.map(lot => <button key={lot.index} disabled={exitDisabled} onClick={() => void run(() => send("refundSponsorLot", lot.action, lot.index))}>Refund FA2 lot {lot.index + 1}</button>)}
          {actions.cashClaims?.map(claim => <button key={claim.currency} disabled={exitDisabled} onClick={() => void run(() => send("cashClaim", claim.action, undefined, claim.currency))}>Claim {formatFundingAmount(claim.amountAtomic, claim.currency === "XTZ" ? 6 : 8)} {claim.currency}</button>)}
          {actions.lotClaims?.map(lot => <button key={lot.index} disabled={exitDisabled} onClick={() => void run(() => send("lotClaim", lot.action, lot.index))}>Claim FA2 #{lot.tokenId} · lot {lot.index + 1}</button>)}
        </div></section> : null}
      <p className="status" role="status">Status: {room.status}. {room.error || ""}</p>
      <p><small>Escrow: <code>{room.escrowContract}</code></small></p>
      <ul aria-label="Human entrant funding">{room.roster.map((player, index) => <li key={index}>{player.name} · {entry?.currency === "FREE" ? "Free entry" : player.deposited ? "Entry verified" : "Entry pending"}</li>)}</ul>
    </>}
    {pending && <p className="status" role="status">Wallet transaction submitted: <code>{pending.opHash}</code>. Rechecking does not send another payment.</p>}
    {message && <p className="status" role="status">{message}</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="actions"><button disabled={busy} onClick={() => void run(async () => {
      if (pending) await post("observe", { operationHash: pending.opHash, action: observedAction(pending.kind, pending.index) });
      else await post("reconcile");
      await refresh();
    })}>Refresh escrow status</button><button onClick={onReturn}>Return to room</button></div>
  </Surface>;
}
