import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";
import { logClientSystemEvent } from "../../lib/system-log";
import { cancelHorfRoomListing, createPrivateHorfOffer, fulfillPrivateHorfOffer, type HorfRoomContract, type HorfRoomPermit } from "../../lib/tezos/horf-rooms";
import { HorfOwnedHorsePicker, type HorfOwnedHorse } from "./HorfOwnedHorsePicker";
import { HorfEscrowArtwork } from "./HorfEscrowArtwork";
import { objktTokenUrl } from "./token-input";

export type HorfTradeSign = {
  id: number;
  ownerAddress: string;
  ownerName?: string | null;
  tokenContract: string;
  tokenId: string;
  name?: string | null;
  acceptedTokenPolicy: "marshal_only" | "any_qualifying";
};

export type HorfTradeProposal = {
  id: number;
  signId: number;
  offererAddress: string;
  ownerAddress: string;
  requestedTokenContract: string;
  requestedTokenId: string;
  offeredTokenContract: string;
  offeredTokenId: string;
  message: string | null;
  status: "proposed" | "declined" | "cancelled" | "accepted" | "fulfilled";
  createdAt: string;
  updatedAt: string;
  privateListingId: string | null;
  acceptOperationHash: string | null;
  fulfillOperationHash: string | null;
  declineReason: string | null;
  signActive: boolean;
};

type ConfirmedProof = { id: number; kind: "accept" | "fulfill" | "escrow-cancel"; operationHash: string };
type PrivateEscrow = { listing: { id: string; mode: 3; owner: string; tokenContract: string; tokenId: string; remaining: string };
  terms: { offerer: string; inputTokenContract: string; inputTokenId: string } };

function proofKey(address: string): string { return `horf:confirmed-trade-proof:${address}`; }

function readProofs(address: string): ConfirmedProof[] {
  try {
    const values = JSON.parse(window.localStorage.getItem(proofKey(address)) || "[]") as unknown;
    return Array.isArray(values) ? values.filter((value): value is ConfirmedProof => Boolean(value &&
      Number.isSafeInteger(value.id) && value.id > 0 &&
      (value.kind === "accept" || value.kind === "fulfill" || value.kind === "escrow-cancel") &&
      typeof value.operationHash === "string" && value.operationHash.trim().length > 0)) : [];
  } catch { return []; }
}

const Dialog = styled.dialog`
  width: min(440px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto;
  padding: 0; border: 1px solid var(--horf-line, #3d5148); border-radius: 18px;
  background: var(--horf-surface, #1b2a25); color: var(--horf-ink, #f4ead6);
  box-shadow: 0 28px 70px #06100dd9; font-family: var(--horf-font, ui-sans-serif, system-ui, sans-serif);
  &::backdrop { background: #07120fd9; backdrop-filter: blur(4px); }
  .head { display: flex; justify-content: space-between; align-items: start; gap: 12px; padding: 17px 18px 12px; border-bottom: 1px solid var(--horf-line, #3d5148); }
  .head small { color: var(--horf-gold, #d8a34a); font-size: 11px; font-weight: 850; text-transform: uppercase; letter-spacing: .08em; }
  .head h2 { margin: 4px 0 0; font: 750 24px/1.1 var(--horf-display, Georgia, serif); }
  .body { padding: 13px 18px 18px; }
  p { margin: 0 0 11px; color: var(--horf-muted, #b7b5a7); font-size: 13px; line-height: 1.45; }
  label { display: block; margin: 10px 0 5px; font-size: 13px; font-weight: 750; }
  textarea { box-sizing: border-box; width: 100%; min-height: 65px; padding: 9px; border: 1px solid var(--horf-line, #3d5148); border-radius: 8px; background: var(--horf-field, #24332d); color: var(--horf-ink, #f4ead6); font: inherit; resize: vertical; }
  a { color: var(--horf-teal, #71b7a0); }
  button:focus-visible, textarea:focus-visible, select:focus-visible { outline: 3px solid var(--horf-focus, #f0bd62); outline-offset: 2px; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
`;
const Button = styled.button<{ $strong?: boolean }>`
  min-height: 37px; padding: 7px 12px; border: 1px solid var(--horf-line, #3d5148); border-radius: 8px;
  background: ${(p) => p.$strong ? "var(--horf-gold, #d8a34a)" : "var(--horf-elevated, #23332d)"};
  color: ${(p) => p.$strong ? "#211b13" : "var(--horf-ink, #f4ead6)"}; font-weight: 800; cursor: pointer;
  &:disabled { opacity: .5; cursor: not-allowed; }
`;
const Inbox = styled.section`
  margin: 22px 0; color: var(--horf-ink, #f4ead6); font-family: var(--horf-font, "Avenir Next", sans-serif);
  h2 { margin: 0 0 7px; }
  p { color: var(--horf-muted, #b7b5a7); }
  a { color: var(--horf-teal, #71b7a0); }
  .columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
  .box { padding: 16px; border: 1px solid var(--horf-line, #3d5148); border-radius: 15px; background: var(--horf-surface, #1b2a25); }
  .box h3 { margin: 0 0 12px; }
  .offer { padding: 12px 0; border-top: 1px solid var(--horf-line, #3d5148); }
  .offer strong { display: block; }
  .offer small { display: block; margin: 4px 0; color: var(--horf-muted, #b7b5a7); overflow-wrap: anywhere; }
  .offer p { font-size: 13px; }
  .offer .actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }
  .offer .status { color: var(--horf-gold, #d8a34a); font-weight: 800; text-transform: capitalize; }
  .private-horse-card { display: grid; grid-template-columns: minmax(180px, 260px) minmax(0, 1fr); align-items: start; gap: 18px; margin-top: 12px; }
  .private-art { aspect-ratio: 1; display: grid; place-items: center; overflow: hidden; border-radius: 12px; background: #102019; }
  .private-art img, .private-art video { display: block; width: 100%; height: 100%; object-fit: contain; }
  .private-art span { padding: 15px; color: var(--horf-muted, #b7b5a7); text-align: center; font-size: 13px; }
  [role="alert"] { color: #e6a18c; }
  @container (max-width: 720px) { .columns { grid-template-columns: 1fr; } }
  @container (max-width: 560px) { .private-horse-card { grid-template-columns: 1fr; } .private-art { max-width: 360px; } }
`;

function short(address: string): string { return `${address.slice(0, 8)}…${address.slice(-6)}`; }

export function HorfProposalDialog({ sign, address, connectWallet, isConnecting, onClose }: {
  sign: HorfTradeSign | null;
  address: string | null;
  connectWallet: () => Promise<void>;
  isConnecting: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const qc = useQueryClient();
  const [horse, setHorse] = useState<HorfOwnedHorse | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (sign && dialog && !dialog.open) dialog.showModal();
    if (!sign && dialog?.open) dialog.close();
    if (sign) { setHorse(null); setMessage(""); setError(null); setSent(false); }
  }, [sign?.id]);

  async function submit() {
    if (!sign || !address || !horse || busy) return;
    setError(null);
    try {
      setBusy(true);
      await api.post("/api/horf/trade-offers", {
        offererAddress: address, signId: sign.id,
        offeredTokenContract: horse.contract, offeredTokenId: horse.tokenId,
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      setSent(true);
      logClientSystemEvent({ eventType: "horf.trade_offer.proposed", message: "One-horse trade proposal sent", metadata: { signId: sign.id, ownerAddress: sign.ownerAddress, offeredTokenContract: horse.contract, offeredTokenId: horse.tokenId } });
      await qc.invalidateQueries({ queryKey: ["horf", "trade-offers", address] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send this horse proposal."); }
    finally { setBusy(false); }
  }

  return <Dialog ref={dialogRef} data-horf-proposal-dialog aria-label="Offer a horse" onCancel={(event) => { if (busy) event.preventDefault(); }} onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget && !busy) event.currentTarget.close(); }}>
    {sign && <><div className="head"><div><small>🐎 Horse for horse</small><h2>Offer your horse</h2></div><Button type="button" aria-label="Close horse offer" disabled={busy} onClick={() => dialogRef.current?.close()}>×</Button></div>
      <div className="body"><p><strong>{sign.name || `Horse #${sign.tokenId}`}</strong> is marked available by {sign.ownerName || short(sign.ownerAddress)}. <a href={objktTokenUrl(sign.tokenContract, sign.tokenId)} target="_blank" rel="noopener noreferrer">See horse ↗</a></p>
        {sent ? <><p role="status">Proposal sent. No horse moved. Watch My Stable for their reply.</p><Button type="button" onClick={() => dialogRef.current?.close()}>Back to the corral</Button></>
          : <><p>Choose one horse you own. The trader may accept and place their edition in private escrow. You then sign one checked swap to complete the trade.</p>
            {!address ? <Button type="button" $strong onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect wallet to offer"}</Button> : <>
              <HorfOwnedHorsePicker address={address} selected={horse} onSelect={setHorse} marshalApprovedOnly={sign.acceptedTokenPolicy === "marshal_only"} id="horf-proposal-horse" label="Your one horse" />
              <label htmlFor="horf-proposal-message">Trail note (optional)</label><textarea id="horf-proposal-message" data-horf-proposal-message value={message} onChange={(event) => setMessage(event.target.value)} placeholder="A note for this trader" disabled={busy} />
              {horse && <p data-horf-proposal-selection>You offer 1 edition of <a href={objktTokenUrl(horse.contract, horse.tokenId)} target="_blank" rel="noopener noreferrer">{horse.name || `horse #${horse.tokenId}`}</a>.</p>}
              <div className="actions"><Button data-horf-proposal-submit type="button" $strong onClick={() => void submit()} disabled={!horse || busy}>{busy ? "Sending…" : "Send trade proposal"}</Button><Button type="button" onClick={() => dialogRef.current?.close()} disabled={busy}>Cancel</Button></div>
            </>}
          </>}
        {error && <p role="alert">{error}</p>}
      </div></>}
  </Dialog>;
}

export function HorfTradeOfferInbox({ address }: { address: string | null }) {
  const qc = useQueryClient();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [proofs, setProofs] = useState<ConfirmedProof[]>([]);
  const autoRetriedProofs = useRef(new Set<string>());
  useEffect(() => { setProofs(address ? readProofs(address) : []); autoRetriedProofs.current.clear(); }, [address]);
  const [privateId, setPrivateId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("private-listing"));
  const incoming = useQuery({ queryKey: ["horf", "trade-offers", address, "incoming"],
    queryFn: () => api.get<{ offers: HorfTradeProposal[] }>(`/api/horf/trade-offers?address=${encodeURIComponent(address!)}&box=incoming`),
    enabled: Boolean(address), refetchOnWindowFocus: true });
  const outgoing = useQuery({ queryKey: ["horf", "trade-offers", address, "outgoing"],
    queryFn: () => api.get<{ offers: HorfTradeProposal[] }>(`/api/horf/trade-offers?address=${encodeURIComponent(address!)}&box=outgoing`),
    enabled: Boolean(address), refetchOnWindowFocus: true });
  const roomQuery = useQuery({ queryKey: ["horf", "rooms", "offer-config", address],
    queryFn: () => api.get<{ status: "ready" | "unconfigured"; chainId: string; contractAddress: string | null; permitReady: boolean }>(`/api/horf/rooms?market=all&address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address), refetchOnWindowFocus: true });
  const privateListQuery = useQuery({ queryKey: ["horf", "private-rooms", address],
    queryFn: () => api.get<{ contractAddress: string | null; chainId?: string; listings: PrivateEscrow[] }>(`/api/horf/rooms/private?address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address), refetchOnWindowFocus: true });
  const privateDetailQuery = useQuery({ queryKey: ["horf", "private-room", address, privateId],
    queryFn: () => api.get<PrivateEscrow & { token: { name: string; image: string | null; artifactUri?: string | null; mime?: string | null } | null }>(`/api/horf/rooms/private/${encodeURIComponent(privateId!)}?address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address && privateId && /^\d+$/.test(privateId)), refetchOnWindowFocus: true });
  const room = roomQuery.data;
  const contract: HorfRoomContract | null = room?.status === "ready" && room.permitReady &&
    room.chainId === "NetXdQprcVkpaWU" && room.contractAddress && /^KT1[1-9A-HJ-NP-Za-km-z]{33}$/.test(room.contractAddress)
    ? { contractAddress: room.contractAddress, chainId: room.chainId } : null;

  function rememberProof(value: ConfirmedProof) {
    if (!address) return;
    const next = [...readProofs(address).filter((item) => !(item.id === value.id && item.kind === value.kind)), value];
    window.localStorage.setItem(proofKey(address), JSON.stringify(next));
    setProofs(next);
    autoRetriedProofs.current.add(`${value.kind}:${value.id}:${value.operationHash}`);
  }

  function clearProof(value: ConfirmedProof) {
    if (!address) return;
    const next = readProofs(address).filter((item) => !(item.id === value.id && item.kind === value.kind && item.operationHash === value.operationHash));
    if (next.length) window.localStorage.setItem(proofKey(address), JSON.stringify(next));
    else window.localStorage.removeItem(proofKey(address));
    setProofs(next);
  }

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["horf", "trade-offers", address] });
    await qc.invalidateQueries({ queryKey: ["horf", "rooms"] });
    await qc.invalidateQueries({ queryKey: ["horf", "private-rooms", address] });
    await qc.invalidateQueries({ queryKey: ["horf", "private-room", address] });
  }

  function openPrivateDetail(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("private-listing", id);
    window.history.pushState({}, "", `${url.pathname}${url.search}`);
    setPrivateId(id);
    window.requestAnimationFrame(() => document.getElementById("horf-private-escrow-detail")?.scrollIntoView({ block: "center", behavior: "smooth" }));
  }

  async function closeOffer(offer: HorfTradeProposal, kind: "decline" | "cancel") {
    if (!address || busyId != null) return;
    setBusyId(offer.id); setError(null); setSuccess(null);
    try {
      await api.post(`/api/horf/trade-offers/${offer.id}/${kind}`, { address });
      setSuccess(kind === "decline" ? "Horse proposal declined." : "Your horse proposal was withdrawn.");
      logClientSystemEvent({ eventType: kind === "decline" ? "horf.trade_offer.declined" : "horf.trade_offer.cancelled", message: kind === "decline" ? "One-horse trade proposal declined" : "One-horse trade proposal cancelled", metadata: { offerId: offer.id } });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update this proposal."); }
    finally { setBusyId(null); }
  }

  async function recordProof(offer: HorfTradeProposal, kind: ConfirmedProof["kind"], operationHash: string) {
    const value = { id: offer.id, kind, operationHash };
    await api.post(`/api/horf/trade-offers/${offer.id}/${kind}`, { address, operationHash });
    clearProof(value);
    setSuccess(kind === "accept" ? "Your horse is in private escrow. The offerer can finish the swap." : kind === "fulfill" ? "The one-for-one horse swap is complete." : "Your horse returned from private escrow.");
    logClientSystemEvent({ eventType: kind === "accept" ? "horf.trade_offer.escrow_confirmed" : kind === "fulfill" ? "horf.trade_offer.fulfilled" : "horf.trade_offer.escrow_cancelled", message: kind === "accept" ? "One-horse proposal accepted into private escrow" : kind === "fulfill" ? "Private horse swap fulfilled" : "Private escrow horse returned to owner", metadata: { offerId: offer.id, operationHash } });
    await refresh();
  }

  async function accept(offer: HorfTradeProposal) {
    if (!address || !contract || busyId != null || offer.ownerAddress !== address || offer.status !== "proposed" || !offer.signActive) return;
    setBusyId(offer.id); setError(null); setSuccess(null);
    try {
      const permit = await api.post<HorfRoomPermit>("/api/horf/rooms/permit", {
        address, action: 0, mode: 3, listingId: "0", tokenContract: offer.requestedTokenContract,
        tokenId: offer.requestedTokenId, amount: "1", offerId: offer.id,
      });
      const hash = await createPrivateHorfOffer(address, contract, offer.requestedTokenContract,
        offer.requestedTokenId, offer.offererAddress, offer.offeredTokenContract, offer.offeredTokenId,
        permit, { onStage: setStage, onSubmitted: (operationHash) => setStage(`Submitted ${operationHash}`) });
      rememberProof({ id: offer.id, kind: "accept", operationHash: hash });
      await recordProof(offer, "accept", hash);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not accept this horse proposal."); }
    finally { setBusyId(null); setStage(null); }
  }

  async function fulfill(offer: HorfTradeProposal) {
    if (!address || !contract || busyId != null || offer.offererAddress !== address || offer.status !== "accepted" || !offer.privateListingId) return;
    setBusyId(offer.id); setError(null); setSuccess(null);
    try {
      const permit = await api.post<HorfRoomPermit>("/api/horf/rooms/permit", {
        address, action: 2, mode: 3, listingId: offer.privateListingId,
        tokenContract: offer.offeredTokenContract, tokenId: offer.offeredTokenId, amount: "1", offerId: offer.id,
      });
      const hash = await fulfillPrivateHorfOffer(address, contract, offer.privateListingId,
        offer.offeredTokenContract, offer.offeredTokenId, permit,
        { onStage: setStage, onSubmitted: (operationHash) => setStage(`Submitted ${operationHash}`) });
      rememberProof({ id: offer.id, kind: "fulfill", operationHash: hash });
      await recordProof(offer, "fulfill", hash);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not finish this horse swap."); }
    finally { setBusyId(null); setStage(null); }
  }

  async function cancelEscrow(offer: HorfTradeProposal) {
    if (!address || !contract || busyId != null || offer.ownerAddress !== address || offer.status !== "accepted" || !offer.privateListingId) return;
    setBusyId(offer.id); setError(null); setSuccess(null);
    try {
      const hash = await cancelHorfRoomListing(address, contract, offer.privateListingId, "1",
        { onStage: setStage, onSubmitted: (operationHash) => setStage(`Submitted ${operationHash}`) });
      rememberProof({ id: offer.id, kind: "escrow-cancel", operationHash: hash });
      await recordProof(offer, "escrow-cancel", hash);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not return this horse from private escrow."); }
    finally { setBusyId(null); setStage(null); }
  }

  async function cancelUnmatchedEscrow(entry: PrivateEscrow) {
    if (!address || !contract || busyId != null || entry.listing.owner !== address) return;
    setBusyId(Number(entry.listing.id)); setError(null); setSuccess(null);
    try {
      const hash = await cancelHorfRoomListing(address, contract, entry.listing.id, "1",
        { onStage: setStage, onSubmitted: (operationHash) => setStage(`Submitted ${operationHash}`) });
      setSuccess(`Horse returned from private escrow #${entry.listing.id} · ${hash}`);
      logClientSystemEvent({ eventType: "horf.trade_offer.escrow_cancelled", message: "Unmatched private escrow horse returned to owner", metadata: { listingId: entry.listing.id, operationHash: hash } });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not return the private escrow horse."); }
    finally { setBusyId(null); setStage(null); }
  }

  useEffect(() => {
    if (!address || (!incoming.data && !outgoing.data)) return;
    const rows = [...(incoming.data?.offers ?? []), ...(outgoing.data?.offers ?? [])];
    for (const proof of proofs) {
      const key = `${proof.kind}:${proof.id}:${proof.operationHash}`;
      if (autoRetriedProofs.current.has(key)) continue;
      const offer = rows.find((row) => row.id === proof.id);
      if (!offer) continue;
      autoRetriedProofs.current.add(key);
      void recordProof(offer, proof.kind, proof.operationHash).catch((cause) =>
        setError(cause instanceof Error ? cause.message : "Confirmed transaction is awaiting indexer proof. Retry recording below."));
    }
  }, [address, proofs, incoming.data, outgoing.data]);

  function offerList(rows: HorfTradeProposal[], box: "incoming" | "outgoing") {
    if (!rows.length) return <p>No {box} proposals yet.</p>;
    return rows.map((offer) => <article className="offer" key={offer.id} data-horf-trade-offer data-horf-trade-offer-id={offer.id}>
      <strong><a href={objktTokenUrl(offer.offeredTokenContract, offer.offeredTokenId)} target="_blank" rel="noopener noreferrer">Offered horse #{offer.offeredTokenId}</a> ↔ <a href={objktTokenUrl(offer.requestedTokenContract, offer.requestedTokenId)} target="_blank" rel="noopener noreferrer">Requested horse #{offer.requestedTokenId}</a></strong>
      <small>{box === "incoming" ? `From ${short(offer.offererAddress)}` : `To ${short(offer.ownerAddress)}`} · {new Date(offer.createdAt).toLocaleString()}</small>
      <span className="status">{offer.status}</span>
      {offer.message && <p>“{offer.message}”</p>}
      {offer.status === "declined" && <p>{offer.declineReason || "The trader passed on this offer."}</p>}
      {offer.status === "accepted" && <p>{offer.privateListingId ? <a data-horf-private-link href={`/horf/stable?private-listing=${encodeURIComponent(offer.privateListingId)}`} onClick={(event) => { event.preventDefault(); openPrivateDetail(offer.privateListingId!); }}>Private escrow #{offer.privateListingId} ↗</a> : "Private escrow pending"}. {box === "outgoing" ? "Your next wallet action swaps both horses." : "Waiting for the offerer to finish the swap."}</p>}
      {box === "incoming" && offer.status === "proposed" && <p role="alert">Before you accept: an uninspected FA2 can fake its transfer. Check the offered horse’s contract; Objkt tags alone do not make private escrow safe.</p>}
      {offer.status === "proposed" && !offer.signActive && <p>That availability sign is down. The owner cannot accept this proposal.</p>}
      <div className="actions">
        {box === "incoming" && offer.status === "proposed" && <><Button data-horf-trade-accept type="button" $strong disabled={busyId != null || !contract || !offer.signActive} onClick={() => void accept(offer)}>Accept · escrow 1 horse</Button><Button data-horf-trade-decline type="button" disabled={busyId != null} onClick={() => void closeOffer(offer, "decline")}>Decline</Button></>}
        {box === "outgoing" && offer.status === "proposed" && <Button data-horf-trade-cancel type="button" disabled={busyId != null} onClick={() => void closeOffer(offer, "cancel")}>Withdraw proposal</Button>}
        {box === "outgoing" && offer.status === "accepted" && offer.privateListingId && <Button data-horf-trade-fulfill type="button" $strong disabled={busyId != null || !contract} onClick={() => void fulfill(offer)}>Complete swap in wallet</Button>}
        {box === "incoming" && offer.status === "accepted" && offer.privateListingId && <Button data-horf-trade-escrow-cancel type="button" disabled={busyId != null || !contract} onClick={() => void cancelEscrow(offer)}>Return my escrowed horse</Button>}
        {proofs.filter((proof) => proof.id === offer.id).map((proof) => <Button key={`${proof.kind}:${proof.operationHash}`} data-horf-trade-record-proof type="button" disabled={busyId != null} onClick={() => void recordProof(offer, proof.kind, proof.operationHash).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not record confirmed transaction."))}>Retry recording confirmed transaction</Button>)}
      </div>
    </article>);
  }

  const allOffers = [...(incoming.data?.offers ?? []), ...(outgoing.data?.offers ?? [])];
  const matchedPrivateIds = new Set(allOffers.map((offer) => offer.privateListingId).filter(Boolean));
  const unmatchedOwnerEscrows = (privateListQuery.data?.listings ?? []).filter((entry) =>
    entry.listing.owner === address && !matchedPrivateIds.has(entry.listing.id));
  const detail = privateDetailQuery.data;
  const detailOffer = detail ? allOffers.find((offer) => offer.privateListingId === detail.listing.id) : null;
  if (!address) return null;
  return <Inbox data-horf-trade-inbox>
    <h2>Trade proposals 🐎</h2><p>Offers to exchange one horse for one horse. Accepting places your horse in private escrow; the offerer completes the checked swap.</p>
    <div className="columns">
      <div className="box" data-horf-trade-incoming><h3>Riders asking for yours</h3>{incoming.isPending ? <p>Checking the postbox…</p> : incoming.isError ? <p role="alert">Incoming proposals unavailable. <Button type="button" onClick={() => void incoming.refetch()}>Retry</Button></p> : offerList(incoming.data?.offers ?? [], "incoming")}</div>
      <div className="box" data-horf-trade-outgoing><h3>Your horse offers</h3>{outgoing.isPending ? <p>Checking the postbox…</p> : outgoing.isError ? <p role="alert">Outgoing proposals unavailable. <Button type="button" onClick={() => void outgoing.refetch()}>Retry</Button></p> : offerList(outgoing.data?.offers ?? [], "outgoing")}</div>
    </div>
    {privateId && <div id="horf-private-escrow-detail" className="box" data-horf-private-detail>
      <h3>Private horse escrow #{privateId}</h3>
      {privateDetailQuery.isPending ? <p>Reading this horse’s pinned terms…</p> : privateDetailQuery.isError ? <p role="alert">This private escrow could not be opened. <Button type="button" onClick={() => void privateDetailQuery.refetch()}>Retry</Button></p> : detail && <>
        <div className="private-horse-card">
          <div className="private-art" data-horf-private-art=""><HorfEscrowArtwork
            key={`${detail.listing.tokenContract}/${detail.listing.tokenId}/${detail.token?.image}/${detail.token?.artifactUri}`}
            contract={detail.listing.tokenContract} tokenId={detail.listing.tokenId}
            name={detail.token?.name || `Horse #${detail.listing.tokenId}`} media={detail.token} preferExactArtwork /></div>
          <div>
            <p><a href={objktTokenUrl(detail.listing.tokenContract, detail.listing.tokenId)} target="_blank" rel="noopener noreferrer">{detail.token?.name || `Horse #${detail.listing.tokenId}`}</a> · 1 edition held for {short(detail.terms.offerer)}.</p>
            <p>Only <a href={objktTokenUrl(detail.terms.inputTokenContract, detail.terms.inputTokenId)} target="_blank" rel="noopener noreferrer">horse #{detail.terms.inputTokenId}</a> from that rider can complete this swap.</p>
            <div className="actions">
              {detailOffer?.status === "accepted" && detail.terms.offerer === address && <Button data-horf-private-fulfill type="button" $strong disabled={!contract || busyId != null} onClick={() => void fulfill(detailOffer)}>Complete checked swap</Button>}
              {detail.listing.owner === address && <Button data-horf-private-return type="button" disabled={!contract || busyId != null} onClick={() => void (detailOffer?.status === "accepted" ? cancelEscrow(detailOffer) : cancelUnmatchedEscrow(detail))}>Return my escrowed horse</Button>}
            </div>
          </div>
        </div>
      </>}
    </div>}
    {privateListQuery.isError && <p role="alert">Private escrow recovery is unavailable. <Button type="button" onClick={() => void privateListQuery.refetch()}>Retry</Button></p>}
    {unmatchedOwnerEscrows.length > 0 && <div className="box" data-horf-private-recovery>
      <h3>Escrowed horses to recover</h3><p>These on-chain horses are yours even if a message has not caught up. You can return them from the contract.</p>
      {unmatchedOwnerEscrows.map((entry) => <article className="offer" key={entry.listing.id} data-horf-private-unmatched>
        <strong>Escrow #{entry.listing.id} · horse #{entry.listing.tokenId}</strong>
        <small>Reserved for {short(entry.terms.offerer)} · offered horse #{entry.terms.inputTokenId}</small>
        <div className="actions"><Button type="button" onClick={() => openPrivateDetail(entry.listing.id)}>View pinned terms</Button><Button data-horf-private-recovery-return type="button" disabled={!contract || busyId != null} onClick={() => void cancelUnmatchedEscrow(entry)}>Return my escrowed horse</Button></div>
      </article>)}
    </div>}
    {proofs.filter((proof) => !allOffers.some((offer) => offer.id === proof.id)).map((proof) => <p key={`${proof.kind}:${proof.id}`} role="status">Confirmed transaction {proof.operationHash} is waiting for its horse proposal to appear. Refresh proposals to retry proof recording.</p>)}
    {roomQuery.data?.status === "unconfigured" && <p role="status">Private escrow is being connected; you can still review and decline proposals.</p>}
    {stage && <p role="status">{stage}</p>}{error && <p role="alert">{error}</p>}{success && <p role="status">{success}</p>}
  </Inbox>;
}
