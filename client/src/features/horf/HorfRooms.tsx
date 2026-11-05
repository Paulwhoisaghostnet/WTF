import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { cancelHorfRoomListing, claimHorfRoomHorse, depositHorfRoomHorses,
  swapHorfOutlawHorse, type HorfPublicRoomMode, type HorfRoomContract, type HorfRoomMode, type HorfRoomPermit } from "../../lib/tezos/horf-rooms";
import { HorfEscrowArtwork } from "./HorfEscrowArtwork";
import { HorfOwnedHorsePicker, type HorfOwnedHorse } from "./HorfOwnedHorsePicker";
import { objktTokenUrl } from "./token-input";

type RoomListing = {
  id: string;
  mode: HorfRoomMode;
  owner: string;
  ownerName?: string | null;
  creatorAddress?: string | null;
  creatorName?: string | null;
  tokenContract: string;
  tokenId: string;
  submitted: string;
  remaining: string;
  claimedByWallet: boolean | null;
  ownedByWallet: boolean | null;
  publicVisible: boolean;
  approvedForMarshalsMarket: boolean;
  token: { name: string; image: string | null; artifactUri?: string | null; mime?: string | null } | null;
};

type RoomSnapshot = {
  network: "mainnet";
  chainId: string;
  contractAddress: string | null;
  status: "ready" | "unconfigured";
  permitReady: boolean;
  balanceStatus: "ready" | "unavailable" | null;
  reciprocalCredits: string;
  asOf: string | null;
  onChainBlacklisted: boolean | null;
  listings: RoomListing[];
};

type StagedHorse = { horse: HorfOwnedHorse; amount: string };

const Shell = styled.section`
  color: var(--horf-ink, #f4ead6);
  font-family: var(--horf-font, "Avenir Next", sans-serif);
  a { color: var(--horf-teal, #71b7a0); }
  button, input, select { font: inherit; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid var(--horf-focus, #f0bd62); outline-offset: 2px; }
  p { color: var(--horf-muted, #b7b5a7); line-height: 1.45; }
`;
const Controls = styled.div`
  display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 16px;
`;
const Button = styled.button<{ $strong?: boolean }>`
  min-height: 38px; padding: 8px 13px; border: 1px solid var(--horf-line, #3d5148); border-radius: 9px;
  background: ${(p) => p.$strong ? "var(--horf-gold, #d8a34a)" : "var(--horf-elevated, #23332d)"};
  color: ${(p) => p.$strong ? "#201a12" : "var(--horf-ink, #f4ead6)"}; font-weight: 800; cursor: pointer;
  &:disabled { opacity: .5; cursor: not-allowed; }
`;
const CardGrid = styled.div`
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 244px), 1fr)); gap: 15px; margin: 17px 0;
`;
const RoomCard = styled.article`
  min-width: 0; overflow: hidden; border: 1px solid var(--horf-line, #3d5148); border-radius: 17px;
  background: var(--horf-surface, #1b2a25); box-shadow: 0 8px 23px #0003;
  &[data-horf-room-featured] { border-color: var(--horf-gold, #d8a34a); box-shadow: 0 0 0 3px #d8a34a55; }
  .art { width: 100%; aspect-ratio: 1; background: #102019; display: grid; place-items: center; overflow: hidden; }
  .art img, .art video { width: 100%; height: 100%; object-fit: contain; display: block; }
  .art span { padding: 15px; color: var(--horf-muted, #b7b5a7); text-align: center; font-size: 13px; }
  .copy { padding: 14px; }
  .copy h3 { margin: 0 0 5px; font-size: 19px; }
  .copy p { margin: 6px 0; font-size: 13px; }
  .copy small { display: block; color: var(--horf-muted, #b7b5a7); word-break: break-word; }
  .copy button { width: 100%; margin-top: 10px; }
`;
const Panel = styled.div`
  margin: 19px 0; padding: 16px; border: 1px solid var(--horf-line, #3d5148); border-radius: 16px;
  background: var(--horf-surface, #1b2a25);
  h3 { margin: 0 0 6px; }
  label { display: block; margin: 10px 0 5px; font-weight: 750; }
  input { box-sizing: border-box; width: 100%; min-height: 40px; padding: 8px 10px; border: 1px solid var(--horf-line, #3d5148); border-radius: 8px; background: var(--horf-field, #24332d); color: var(--horf-ink, #f4ead6); }
  ul { list-style: none; padding: 0; }
  li { padding: 8px 0; border-bottom: 1px solid var(--horf-line, #3d5148); }
  .staged-horses { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 185px), 1fr)); gap: 11px; }
  .staged-horses li { min-width: 0; padding: 0; overflow: hidden; border: 1px solid var(--horf-line, #3d5148); border-radius: 10px; background: var(--horf-field, #24332d); }
  .staged-horses .art { display: grid; place-items: center; width: 100%; aspect-ratio: 1; overflow: hidden; background: #102019; }
  .staged-horses .art img, .staged-horses .art video { display: block; width: 100%; height: 100%; object-fit: contain; }
  .staged-horses .art span { padding: 12px; color: var(--horf-muted, #b7b5a7); text-align: center; font-size: 12px; }
  .staged-horses .staged-copy { padding: 10px; font-size: 13px; line-height: 1.4; }
  .staged-horses .staged-copy strong { display: block; overflow-wrap: anywhere; }
`;
const Notice = styled.p<{ $error?: boolean }>`
  padding: 10px 12px; border: 1px solid ${(p) => p.$error ? "#b87060" : "var(--horf-line, #3d5148)"};
  border-radius: 9px; background: ${(p) => p.$error ? "#3c2825" : "#22332d"};
`;

function positive(value: string): boolean {
  try { return /^\d+$/.test(value) && BigInt(value) > 0n; } catch { return false; }
}

function validAmount(amount: string, owned: string): boolean {
  try { return positive(amount) && BigInt(amount) <= BigInt(owned); } catch { return false; }
}

function abbreviated(address: string): string { return `${address.slice(0, 8)}…${address.slice(-6)}`; }

function horseIdentity(horse: HorfOwnedHorse): string { return `${horse.contract}/${horse.tokenId}`; }

export function HorfRooms({ market, address, connectWallet, isConnecting, listingFromUrl }: {
  market: "marshal" | "outlaw";
  address: string | null;
  connectWallet: () => Promise<void>;
  isConnecting: boolean;
  listingFromUrl?: string | null;
}) {
  const qc = useQueryClient();
  const [depositMode, setDepositMode] = useState<HorfPublicRoomMode>(market === "outlaw" ? 2 : 0);
  const [picked, setPicked] = useState<HorfOwnedHorse | null>(null);
  const [quantity, setQuantity] = useState("0");
  const [staged, setStaged] = useState<StagedHorse[]>([]);
  const [swapHorse, setSwapHorse] = useState<HorfOwnedHorse | null>(null);
  const [swapListing, setSwapListing] = useState<RoomListing | null>(null);
  const [cancelAmounts, setCancelAmounts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const listingRefs = useRef(new Map<string, HTMLElement>());
  useEffect(() => { setDepositMode(market === "outlaw" ? 2 : 0); setStaged([]); setPicked(null); setQuantity("0"); }, [market]);
  const query = useQuery({
    queryKey: ["horf", "rooms", market, address],
    queryFn: () => api.get<RoomSnapshot>(`/api/horf/rooms?${new URLSearchParams({ market: address ? "all" : market, ...(address ? { address } : {}) })}`),
    refetchOnWindowFocus: true,
  });
  const snapshot = query.data;
  const configured = snapshot?.status === "ready" && snapshot.network === "mainnet" &&
    snapshot.chainId === "NetXdQprcVkpaWU" && Boolean(snapshot.contractAddress && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(snapshot.contractAddress));
  const contract: HorfRoomContract | null = configured ? { contractAddress: snapshot!.contractAddress!, chainId: snapshot!.chainId } : null;
  const listings = useMemo(() => (snapshot?.listings ?? []).filter((listing) => market === "outlaw" ? listing.mode === 2 : listing.mode === 0 || listing.mode === 1), [snapshot, market]);
  useEffect(() => {
    if (!listingFromUrl || !/^\d+$/.test(listingFromUrl) || query.isPending) return;
    const target = listingRefs.current.get(listingFromUrl);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
    target?.focus({ preventScroll: true });
  }, [listingFromUrl, query.isPending, listings]);

  function resetFeedback() { setError(null); setSuccess(null); }

  function addStaged() {
    resetFeedback();
    if (!picked || !validAmount(quantity, picked.balance)) { setError("Choose a horse and an edition count you own."); return; }
    if (staged.some((item) => horseIdentity(item.horse) === horseIdentity(picked))) { setError("That horse is already in this room deposit."); return; }
    setStaged((current) => [...current, { horse: picked, amount: quantity }]);
    setPicked(null); setQuantity("0");
  }

  async function deposit() {
    resetFeedback();
    if (!address || !contract || !snapshot?.permitReady || busy || !staged.length) return;
    if (staged.some((item) => !validAmount(item.amount, item.horse.balance))) { setError("Check each edition count before opening the room."); return; }
    try {
      setBusy(true); setStage("Checking horses");
      const deposits = await Promise.all(staged.map(async ({ horse, amount }) => {
        const permit = await api.post<HorfRoomPermit>("/api/horf/rooms/permit", {
          address, action: 0, mode: depositMode, listingId: "0", tokenContract: horse.contract, tokenId: horse.tokenId, amount,
        });
        return { tokenContract: horse.contract, tokenId: horse.tokenId, amount, permit };
      }));
      const opHash = await depositHorfRoomHorses(address, contract, depositMode, deposits,
        { onStage: setStage, onSubmitted: (hash) => setStage(`Submitted ${hash}`) });
      setSuccess(`Horse deposit confirmed · ${opHash}`); setStaged([]);
      logClientSystemEvent({ eventType: "horf.room.deposited", message: "Horse escrow room deposit confirmed", metadata: { market, mode: depositMode, editionCount: staged.map((item) => item.amount), opHash } });
      await qc.invalidateQueries({ queryKey: ["horf", "rooms"] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not open this horse room."); }
    finally { setBusy(false); setStage(null); }
  }

  async function swap() {
    resetFeedback();
    if (!address || !contract || !swapListing || !swapHorse || busy || !snapshot?.permitReady) return;
    if (swapListing.owner === address || swapListing.claimedByWallet || swapListing.ownedByWallet !== false ||
      horseIdentity(swapHorse) === `${swapListing.tokenContract}/${swapListing.tokenId}`) {
      setError("Choose a different horse; this room is not available to your wallet."); return;
    }
    try {
      setBusy(true); setStage("Checking your horse");
      const permit = await api.post<HorfRoomPermit>("/api/horf/rooms/permit", {
        address, action: 1, mode: 2, listingId: swapListing.id,
        tokenContract: swapHorse.contract, tokenId: swapHorse.tokenId, amount: "1",
      });
      const opHash = await swapHorfOutlawHorse(address, contract, swapListing.id,
        swapHorse.contract, swapHorse.tokenId, permit,
        { onStage: setStage, onSubmitted: (hash) => setStage(`Submitted ${hash}`) });
      setSuccess(`One-for-one swap confirmed · ${opHash}`); setSwapHorse(null); setSwapListing(null);
      logClientSystemEvent({ eventType: "horf.room.swapped", message: "One-for-one Outlaw horse swap confirmed", metadata: { listingId: swapListing.id, inputTokenContract: swapHorse.contract, inputTokenId: swapHorse.tokenId, opHash } });
      await qc.invalidateQueries({ queryKey: ["horf", "rooms"] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not swap these horses."); }
    finally { setBusy(false); setStage(null); }
  }

  async function claim(listing: RoomListing) {
    resetFeedback();
    if (!address || !contract || busy || listing.owner === address || listing.claimedByWallet || listing.ownedByWallet !== false) return;
    try {
      setBusy(true);
      const opHash = await claimHorfRoomHorse(address, contract, listing.id,
        { onStage: setStage, onSubmitted: (hash) => setStage(`Submitted ${hash}`) });
      setSuccess(`Horse claim confirmed · ${opHash}`);
      logClientSystemEvent({ eventType: "horf.room.claimed", message: "Horse claimed from inspected escrow", metadata: { listingId: listing.id, mode: listing.mode, opHash } });
      await qc.invalidateQueries({ queryKey: ["horf", "rooms"] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not claim this horse."); }
    finally { setBusy(false); setStage(null); }
  }

  async function cancel(listing: RoomListing) {
    resetFeedback();
    const count = cancelAmounts[listing.id] ?? listing.remaining;
    if (!address || !contract || busy || listing.owner !== address || !validAmount(count, listing.remaining)) {
      setError("Choose how many remaining editions to return."); return;
    }
    try {
      setBusy(true);
      const opHash = await cancelHorfRoomListing(address, contract, listing.id, count,
        { onStage: setStage, onSubmitted: (hash) => setStage(`Submitted ${hash}`) });
      setSuccess(`${count} horse ${count === "1" ? "edition" : "editions"} returned · ${opHash}`);
      logClientSystemEvent({ eventType: "horf.room.cancelled", message: "Escrowed horse editions returned to owner", metadata: { listingId: listing.id, amount: count, opHash } });
      await qc.invalidateQueries({ queryKey: ["horf", "rooms"] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not return these editions."); }
    finally { setBusy(false); setStage(null); }
  }

  return <Shell data-horf-rooms data-horf-rooms-market={market}>
    {query.isPending && <Notice role="status">Reading Mainnet escrow rooms…</Notice>}
    {query.isError && <Notice $error role="alert">Escrow rooms are unavailable. <Button type="button" onClick={() => void query.refetch()}>Retry</Button></Notice>}
    {snapshot?.status === "unconfigured" && <Notice role="status">The new escrow contract is being connected. Existing deposits remain in <a href="/horf/legacy-stables">Legacy Stable Recovery</a>.</Notice>}
    {snapshot?.status === "ready" && !configured && <Notice $error role="alert">Escrow contract network mismatch. Wallet transactions are disabled.</Notice>}
    {snapshot?.onChainBlacklisted && <Notice $error role="alert">This wallet is restricted from new escrow actions.</Notice>}
    {configured && <p><a href={`https://tzkt.io/${contract!.contractAddress}`} target="_blank" rel="noopener noreferrer">Mainnet escrow contract ↗</a> · {market === "outlaw" ? "One horse in, one horse out, in one wallet transaction." : "Marshal-approved horses in the reciprocal pool and honor stable."}</p>}
    {market === "outlaw" && <Notice $error data-horf-outlaw-risk>Outlaw risk: Objkt indexing and horse tags do not prove that an uninspected FA2 really transfers its token. A malicious contract could fake a transfer and take a real horse from escrow. Check the horse and its contract before you deposit or swap.</Notice>}
    {market === "marshal" && address && configured && <p data-horf-room-credits>{snapshot?.reciprocalCredits ?? "0"} reciprocal {snapshot?.reciprocalCredits === "1" ? "claim" : "claims"} available</p>}
    <h3>{market === "outlaw" ? "For trade now" : "Horses in inspected escrow"}</h3>
    {listings.length ? <CardGrid data-horf-room-listings>{listings.map((listing) => {
      const name = listing.token?.name || `Horse token #${listing.tokenId}`;
      const own = address === listing.owner;
      const canClaim = Boolean(address && configured && !busy && !own && !listing.claimedByWallet &&
        listing.ownedByWallet === false && !snapshot?.onChainBlacklisted &&
        (listing.mode !== 0 || positive(snapshot?.reciprocalCredits ?? "0")));
      return <RoomCard key={listing.id} ref={(node) => { if (node) listingRefs.current.set(listing.id, node); else listingRefs.current.delete(listing.id); }}
        tabIndex={-1} data-horf-room-listing data-horf-room-id={listing.id}
        data-horf-room-featured={listing.id === listingFromUrl ? "" : undefined}>
        <div className="art" data-horf-room-art=""><HorfEscrowArtwork
          key={`${listing.tokenContract}/${listing.tokenId}/${listing.token?.image}/${listing.token?.artifactUri}`}
          contract={listing.tokenContract} tokenId={listing.tokenId} name={name}
          media={listing.token} preferExactArtwork /></div>
        <div className="copy">
          <h3><a href={objktTokenUrl(listing.tokenContract, listing.tokenId)} target="_blank" rel="noopener noreferrer">{name}</a></h3>
          <small>{listing.remaining} of {listing.submitted} {listing.submitted === "1" ? "edition" : "editions"} in escrow · {listing.mode === 0 ? "Reciprocal" : listing.mode === 1 ? "Honor" : "Outlaw"}</small>
          <p>Listed by <a href={`/horf/traders/${listing.owner}`}>{listing.ownerName || abbreviated(listing.owner)}</a></p>
          {listing.creatorAddress && <p>Created by <a href={`/horf/traders/${listing.creatorAddress}`}>{listing.creatorName || abbreviated(listing.creatorAddress)}</a></p>}
          {own ? <>
            <label htmlFor={`horf-room-return-${listing.id}`}>Editions to return</label>
            <input id={`horf-room-return-${listing.id}`} data-horf-room-return-amount inputMode="numeric" value={cancelAmounts[listing.id] ?? listing.remaining} onChange={(event) => setCancelAmounts((current) => ({ ...current, [listing.id]: event.target.value }))} disabled={busy} />
            <Button data-horf-room-cancel type="button" onClick={() => void cancel(listing)} disabled={!configured || busy}>Return my editions</Button>
          </> : market === "outlaw" ? <Button data-horf-room-swap type="button" $strong disabled={!canClaim || !snapshot?.permitReady} onClick={() => { resetFeedback(); setSwapHorse(null); setSwapListing(listing); }}>{!address ? "Connect to trade" : listing.ownedByWallet ? "You already own this horse" : listing.claimedByWallet ? "Already claimed this horse" : "Swap 1 horse for 1"}</Button>
            : <Button data-horf-room-claim type="button" $strong disabled={!canClaim} onClick={() => void claim(listing)}>{!address ? "Connect to claim" : listing.mode === 0 && !positive(snapshot?.reciprocalCredits ?? "0") ? "Deposit first to earn a claim" : listing.ownedByWallet ? "You already own this horse" : listing.claimedByWallet ? "Already claimed this horse" : "Claim 1 horse"}</Button>}
          {!address && <Button type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect wallet"}</Button>}
          {address && snapshot?.balanceStatus === "unavailable" && !own && <p role="status">Checking whether you already hold this token before enabling claims.</p>}
        </div>
      </RoomCard>;
    })}</CardGrid> : !query.isPending && !query.isError && <p data-horf-room-empty>No horses in this {market === "outlaw" ? "Outlaw" : "Marshal"} escrow yet.</p>}
    {swapListing && market === "outlaw" && <Panel data-horf-room-swap-review>
      <h3>Swap for {swapListing.token?.name || `horse #${swapListing.tokenId}`}</h3>
      <p>Give one horse you own. The room sends one listed edition to you and one of yours to {swapListing.ownerName || abbreviated(swapListing.owner)} in the same Mainnet transaction.</p>
      <Notice $error>An uninspected token contract may fake a transfer. Review both horse contracts before signing this swap.</Notice>
      <HorfOwnedHorsePicker address={address} selected={swapHorse} onSelect={setSwapHorse} id="horf-room-swap-horse" label="The 1 horse you will give" />
      {swapHorse && <p data-horf-room-swap-token>You give 1 edition of <a href={objktTokenUrl(swapHorse.contract, swapHorse.tokenId)} target="_blank" rel="noopener noreferrer">{swapHorse.name || `horse #${swapHorse.tokenId}`}</a>.</p>}
      <Controls><Button data-horf-room-swap-confirm type="button" $strong onClick={() => void swap()} disabled={!swapHorse || busy || !snapshot?.permitReady}>Confirm one-for-one swap in wallet</Button><Button type="button" onClick={() => { setSwapListing(null); setSwapHorse(null); }} disabled={busy}>Cancel</Button></Controls>
    </Panel>}
    {address && configured && <Panel data-horf-room-deposit>
      <h3>{market === "outlaw" ? "Open an Outlaw room" : "Stock an inspected stable"}</h3>
      <p>{market === "outlaw" ? "Choose the horses and exact edition counts to place in escrow. A visitor gives one qualifying horse for each edition they take." : "Deposit approved horses. Reciprocal deposits earn one claim per edition; Honor deposits are gifts."}</p>
      {market === "outlaw" && <Notice $error>Depositing here accepts automatic swaps with uninspected FA2s. A malicious token contract can fake the visitor’s transfer and drain your horse. Check this risk before signing.</Notice>}
      {market === "marshal" && <Controls role="group" aria-label="Inspected room type"><Button data-horf-room-mode="0" type="button" $strong={depositMode === 0} onClick={() => { setDepositMode(0); setStaged([]); }}>Reciprocal pool</Button><Button data-horf-room-mode="1" type="button" $strong={depositMode === 1} onClick={() => { setDepositMode(1); setStaged([]); }}>Honor stable</Button></Controls>}
      <HorfOwnedHorsePicker address={address} selected={picked} onSelect={(horse) => { setPicked(horse); setQuantity("0"); }} id="horf-room-deposit-horse" label="Horse to deposit" marshalApprovedOnly={market === "marshal"} disabled={busy} />
      {picked && <><label htmlFor="horf-room-deposit-quantity">Exact editions to deposit (starts at 0)</label><input id="horf-room-deposit-quantity" data-horf-room-deposit-quantity inputMode="numeric" pattern="[0-9]+" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={busy} /><p>You own {picked.balance} {picked.balance === "1" ? "edition" : "editions"}.</p><Button data-horf-room-add type="button" onClick={addStaged} disabled={busy || !validAmount(quantity, picked.balance)}>Add to deposit</Button></>}
      {staged.length > 0 && <ul className="staged-horses" data-horf-room-staged>{staged.map(({ horse, amount }) => <li key={horseIdentity(horse)} data-horf-room-staged-card="">
        <div className="art"><HorfEscrowArtwork contract={horse.contract} tokenId={horse.tokenId}
          name={horse.name || `Horse #${horse.tokenId}`} media={horse} preferExactArtwork /></div>
        <div className="staged-copy"><strong>{horse.name || `Horse #${horse.tokenId}`} · {amount} {amount === "1" ? "edition" : "editions"}</strong>
          <Button type="button" onClick={() => setStaged((current) => current.filter((item) => horseIdentity(item.horse) !== horseIdentity(horse)))} disabled={busy}>Remove</Button></div>
      </li>)}</ul>}
      <Controls><Button data-horf-room-deposit-confirm type="button" $strong onClick={() => void deposit()} disabled={!staged.length || busy || !snapshot?.permitReady || snapshot.onChainBlacklisted === true}>Deposit {staged.reduce((sum, item) => sum + BigInt(item.amount), 0n).toString()} editions in wallet</Button></Controls>
      {snapshot?.permitReady === false && <p role="status">Deposit signing is being connected. Existing rooms remain visible.</p>}
    </Panel>}
    {stage && <Notice role="status">{stage}</Notice>}
    {error && <Notice $error role="alert">{error}</Notice>}
    {success && <Notice role="status">{success}</Notice>}
  </Shell>;
}
