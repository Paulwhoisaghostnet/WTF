import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { api } from "../../lib/api";
import { advanceResolvedMediaFallback, resolveTokenThumbnail } from "../../lib/media-resolve";
import { logClientSystemEvent } from "../../lib/system-log";
import {
  HORF_MARKET_CHAIN_ID,
  assertHorseMarketPermitMatchesReview,
  buyHorseWithHorse,
  cancelHorseMarketListing,
  formatHorseRaw,
  horseAmountToRaw,
  listHorseForHorse,
  type HorfHorseMarketContract,
  type HorfHorseMarketListing,
  type HorfHorseMarketPermit,
} from "../../lib/tezos/horf-horse-market";
import { toNatString } from "../../lib/tezos/nat";
import { HorfObjktBuy } from "./HorfObjktBuy";
import { parseHorfOwnedTokenPage } from "./owned-tokens";
import { objktTokenUrl } from "./token-input";

type MarketSnapshot = {
  status: "ready" | "unconfigured";
  network: "mainnet";
  chainId: string;
  contractAddress: string | null;
  horseContractAddress: string | null;
  permitReady: boolean;
};
type MarketListings = { listings: HorfHorseMarketListing[] };
type Inspection = { status: "none" | "pending" | "approved" | "rejected" | "revoked"; reason: string | null };
type Pending = { action: "list" | "buy" | "cancel"; stage: "eligibility" | "preflight" | "preparing" | "wallet" | "confirming"; opHash: string | null };
type ListingReview = { address: string; tokenContract: string; tokenId: string; tokenName: string;
  quantity: string; ownedBalance: string; unitPriceHorseRaw: string; priceInput: string };

const Page = styled.section`
  width: min(100%, 1400px);
  margin: 0 auto;
  padding: clamp(18px, 3vw, 42px);
  color: var(--horf-ink);
  h2, h3, p { margin-top: 0; }
  button { cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .55; }
`;
const Hero = styled.header`
  position: relative;
  min-height: 226px;
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(180px, .7fr);
  overflow: hidden;
  border-radius: 25px;
  background: var(--horf-surface, #1b2723);
  color: var(--horf-ink, #f4ead6);
  border: 1px solid var(--horf-line, #3d5148);
  box-shadow: 0 18px 45px #0000003d;
  .copy { position: relative; z-index: 1; align-self: center; padding: clamp(25px, 4vw, 48px); }
  .kicker { color: #ffc363; font-weight: 850; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
  h2 { max-width: 12ch; margin: 8px 0 12px; color: var(--horf-ink, #f4ead6); font: 700 clamp(35px, 4cqw, 62px)/.99 var(--horf-display); letter-spacing: -.045em; }
  p { max-width: 62ch; margin: 0; color: var(--horf-muted, #b7b5a7); font-size: 14px; line-height: 1.55; }
  .photo { position: relative; min-height: 226px; background: url('/horf-art/horse-portrait-photo.jpg') center 35% / cover; }
  .photo:before { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, #1b2723 0%, #1b272311 46%); }
  .seal { position: absolute; right: 18px; bottom: 18px; display: grid; place-items: center; width: 112px; height: 112px; border: 2px dashed #ffd187; border-radius: 50%; background: #132b2dd9; color: #ffcf73; font: 700 14px/1.2 var(--horf-display); text-align: center; transform: rotate(11deg); }
  @container (max-width: 660px) { grid-template-columns: 1fr; .photo { min-height: 130px; background-position: center 32%; } .photo:before { background: linear-gradient(180deg, #1b2723, transparent 80%); } .seal { width: 93px; height: 93px; font-size: 12px; } }
`;
const Toolbar = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
  margin: 28px 0 16px;
  h3 { margin: 0; font: 700 27px/1.1 var(--horf-display); }
  p { margin: 3px 0 0; color: var(--horf-muted); font-size: 13px; }
`;
const Action = styled.button<{ $strong?: boolean; $gold?: boolean }>`
  display: inline-flex; align-items: center; justify-content: center; gap: 7px;
  min-height: 43px; padding: 10px 17px;
  border: 1px solid ${(p) => p.$gold ? '#a3621d' : p.$strong ? 'var(--horf-gold, #d8a34a)' : 'var(--horf-line, #3d5148)'};
  border-radius: 999px;
  background: ${(p) => p.$gold ? '#ffcc70' : p.$strong ? 'var(--horf-gold, #d8a34a)' : 'var(--horf-field, #24332d)'};
  color: ${(p) => p.$gold || p.$strong ? '#241a0f' : 'var(--horf-ink, #f4ead6)'};
  font-weight: 800; font-size: 13px; line-height: 1.2;
  &:hover:not(:disabled) { filter: brightness(.95); transform: translateY(-1px); }
  &:focus-visible { outline: 3px solid var(--horf-teal); outline-offset: 3px; }
  @media (prefers-reduced-motion: reduce) { &:hover:not(:disabled) { transform: none; } }
`;
const Notice = styled.div<{ $error?: boolean }>`
  margin: 12px 0; padding: 13px 16px; border: 1px solid ${(p) => p.$error ? '#a8604f' : '#477663'};
  border-radius: 12px; background: ${(p) => p.$error ? '#3b2723' : '#1d3932'};
  font-size: 13px; line-height: 1.5; overflow-wrap: anywhere;
  a { color: var(--horf-teal, #71b7a0); }
`;
const ListingReviewCard = styled.div`
  margin: 16px 0; padding: 16px; border: 1px solid var(--horf-gold, #d8a34a);
  border-radius: 13px; background: #352d20;
  h4 { margin: 0 0 8px; color: var(--horf-ink); font: 700 18px/1.2 var(--horf-display); }
  dl { display: grid; grid-template-columns: 115px minmax(0, 1fr); gap: 7px 10px; margin: 11px 0; font-size: 13px; }
  dt { color: var(--horf-muted); } dd { margin: 0; overflow-wrap: anywhere; }
  p { margin: 10px 0; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  @container (max-width: 420px) { dl { grid-template-columns: 1fr; } }
`;
const Layout = styled.div`
  display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(300px, .75fr); gap: 20px; align-items: start;
  @container (max-width: 850px) { grid-template-columns: 1fr; }
`;
const Grid = styled.div`
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px;
  @container (max-width: 600px) { grid-template-columns: 1fr; }
`;
const Card = styled.article<{ $selected: boolean }>`
  min-width: 0; overflow: hidden; border: 1px solid ${(p) => p.$selected ? 'var(--horf-teal, #71b7a0)' : 'var(--horf-line, #3d5148)'};
  border-radius: 18px; background: var(--horf-surface, #1b2723); box-shadow: ${(p) => p.$selected ? '0 10px 30px #00000040' : '0 3px 12px #00000026'};
  .art { position: relative; aspect-ratio: 1.35; overflow: hidden; background: #2b3d34; }
  .art img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .art .photo { object-fit: cover; }
  .tag { position: absolute; top: 11px; left: 11px; padding: 6px 9px; border-radius: 999px; background: #ffcf76; color: #382a17; font: 850 10px/1 var(--horf-font); text-transform: uppercase; }
  .body { padding: 15px; }
  h4 { margin: 0 0 4px; font: 700 20px/1.15 var(--horf-display); overflow-wrap: anywhere; }
  p { margin: 0; color: var(--horf-muted); font-size: 12px; }
  .price { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 7px; margin: 17px 0; }
  .price strong { font: 750 24px/1 var(--horf-display); color: var(--horf-gold, #d8a34a); }
  .price span { color: var(--horf-muted); font-size: 11px; }
  .body > button { width: 100%; }
`;
const Panel = styled.aside`
  min-width: 0; padding: 21px; border: 1px solid var(--horf-line, #3d5148); border-radius: 18px;
  background: var(--horf-surface, #1b2723); box-shadow: 0 6px 22px #00000026;
  h3 { margin-bottom: 5px; font: 700 24px/1.1 var(--horf-display); }
  h4 { margin: 22px 0 6px; font: 700 17px/1.15 var(--horf-display); }
  p { margin-bottom: 12px; color: var(--horf-muted); font-size: 13px; line-height: 1.5; }
  label { display: block; margin: 13px 0 6px; font-weight: 750; font-size: 12px; }
  input, select { width: 100%; min-width: 0; min-height: 43px; padding: 10px 11px; border: 1px solid var(--horf-line, #3d5148); border-radius: 9px; background: var(--horf-field, #24332d); color: var(--horf-ink); font-size: 14px; }
  input:focus-visible, select:focus-visible { outline: 3px solid var(--horf-teal); outline-offset: 2px; }
  form > button, .wide { width: 100%; margin-top: 14px; }
  .rule { height: 1px; margin: 22px 0; background: var(--horf-line, #3d5148); }
  .small { font-size: 11px; }
  .meta { overflow-wrap: anywhere; }
`;
const Stamp = styled.span`
  display: inline-flex; align-items: center; gap: 5px; padding: 5px 9px; border-radius: 999px;
  background: #25483a; color: #a5d9bd; font-size: 11px; font-weight: 800;
`;

function shortAddress(value: string) { return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value; }
function isPositive(value: string) { try { return BigInt(value) > 0n; } catch { return false; } }
function pendingText(pending: Pending) {
  if (pending.stage === "eligibility") return "Checking the Marshal’s approval and preparing your one-use listing permit…";
  if (pending.stage === "preflight") return "Checking your wallet and Tezos Mainnet…";
  if (pending.stage === "preparing") return "Preparing the horse trade…";
  if (pending.stage === "wallet") return "Approve this Tezos transaction in your wallet…";
  return "Waiting for Tezos confirmation…";
}

export function HorfHorseMarket({ address, connectWallet, isConnecting }: {
  address: string | null; connectWallet: () => Promise<void>; isConnecting: boolean;
}) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedOwnedKey, setSelectedOwnedKey] = useState("");
  const [ownedSearchDraft, setOwnedSearchDraft] = useState("");
  const [ownedSearch, setOwnedSearch] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [price, setPrice] = useState("");
  const [review, setReview] = useState<ListingReview | null>(null);
  const [buyQuantity, setBuyQuantity] = useState("1");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ text: string; opHash: string } | null>(null);

  const configQuery = useQuery({ queryKey: ["horf", "horse-market", "config"], queryFn: () => api.get<MarketSnapshot>("/api/horf/horse-market/config"), refetchOnWindowFocus: true });
  const listingQuery = useQuery({ queryKey: ["horf", "horse-market", "listings"], queryFn: () => api.get<MarketListings>("/api/horf/horse-market/listings"), refetchOnWindowFocus: true });
  const snapshot = configQuery.data;
  const configured = snapshot?.status === "ready" && snapshot.chainId === HORF_MARKET_CHAIN_ID && snapshot.network === "mainnet" &&
    Boolean(snapshot.contractAddress && snapshot.horseContractAddress);
  const contract: HorfHorseMarketContract | null = configured ? {
    contractAddress: snapshot!.contractAddress!, chainId: snapshot!.chainId, horseContractAddress: snapshot!.horseContractAddress!,
  } : null;
  const listings = (listingQuery.data?.listings ?? []).filter((item) => isPositive(item.remaining));
  const selected = listings.find((item) => item.id === selectedId) ?? listings[0] ?? null;
  const ownedQuery = useInfiniteQuery({
    queryKey: ["horf", "owned-tokens", address, ownedSearch],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ address: address!, offset: String(pageParam) });
      if (ownedSearch) params.set("q", ownedSearch);
      return api.get<unknown>(`/api/horf/wallet/tokens?${params}`).then(parseHorfOwnedTokenPage);
    },
    initialPageParam: 0,
    getNextPageParam: (page) => page.pagination.hasMore ? page.pagination.nextOffset : undefined,
    enabled: Boolean(address),
  });
  const owned = useMemo(() => (ownedQuery.data?.pages.flatMap((page) => page.items) ?? [])
    .filter((token) => token.walletAddress === address && isPositive(token.balance)), [address, ownedQuery.data]);
  const selectedOwned = owned.find((item) => `${item.contract}:${item.tokenId}` === selectedOwnedKey) ?? null;
  const inspectionQuery = useQuery({
    queryKey: ["horf", "inspection-status", selectedOwned?.contract, selectedOwned?.tokenId],
    queryFn: () => api.get<Inspection>(`/api/horf/inspections/status?contract=${encodeURIComponent(selectedOwned!.contract)}&tokenId=${encodeURIComponent(selectedOwned!.tokenId)}`),
    enabled: Boolean(selectedOwned), refetchOnWindowFocus: true,
  });
  const reviewCurrent = Boolean(review && selectedOwned && address === review.address &&
    selectedOwned.contract === review.tokenContract && selectedOwned.tokenId === review.tokenId &&
    selectedOwned.balance === review.ownedBalance && quantity === review.quantity &&
    price.trim() === review.priceInput && inspectionQuery.data?.status === "approved");
  useEffect(() => { setReview(null); }, [address]);
  const busy = pending !== null;

  function stage(action: Pending["action"]) {
    return {
      onStage: (step: Exclude<Pending["stage"], "eligibility">) => setPending((current) => ({ action, stage: step, opHash: current?.opHash ?? null })),
      onSubmitted: (hash: string) => setPending((current) => ({ action, stage: "confirming", opHash: hash })),
    };
  }
  function reviewListing(event: FormEvent) {
    event.preventDefault();
    if (!address || !contract || !selectedOwned || busy) return;
    setError(null); setSuccess(null);
    try {
      const units = toNatString(quantity);
      if (units === "0" || BigInt(units) > BigInt(selectedOwned.balance)) throw new Error("Choose an edition quantity held by this wallet.");
      const rawPrice = horseAmountToRaw(price);
      if (inspectionQuery.data?.status !== "approved") throw new Error("A Horf Marshal must approve this token before it can enter the HORSE Market.");
      const priceInput = price.trim();
      setQuantity(units); setPrice(priceInput);
      setReview({ address, tokenContract: selectedOwned.contract, tokenId: selectedOwned.tokenId,
        tokenName: selectedOwned.name || `Token #${selectedOwned.tokenId}`, quantity: units,
        ownedBalance: selectedOwned.balance, unitPriceHorseRaw: rawPrice, priceInput });
    } catch (cause) {
      setReview(null);
      setError(cause instanceof Error ? cause.message : "Could not review this horse listing.");
    }
  }
  async function list() {
    if (!address || !contract || !selectedOwned || !review || !reviewCurrent || busy) return;
    setError(null); setSuccess(null);
    let submitted: string | null = null;
    try {
      const units = review.quantity;
      const rawPrice = review.unitPriceHorseRaw;
      if (inspectionQuery.data?.status !== "approved") throw new Error("A Horf Marshal must approve this token before it can enter the HORSE Market.");
      setPending({ action: "list", stage: "eligibility", opHash: null });
      const permit = await api.post<HorfHorseMarketPermit>("/api/horf/horse-market/permit", {
        address, tokenContract: review.tokenContract, tokenId: review.tokenId, quantity: units, unitPriceHorseRaw: rawPrice,
      });
      assertHorseMarketPermitMatchesReview(permit, review);
      const handlers = stage("list");
      const opHash = await listHorseForHorse(address, contract, permit, {
        ...handlers, onSubmitted: (hash) => { submitted = hash; handlers.onSubmitted(hash); },
      });
      setSuccess({ text: "Horse listed for HORSE. Your editions are now held by the Market contract until sold or cancelled.", opHash });
      logClientSystemEvent({ eventType: "horf.horse_market.listed", message: "Marshal-approved horse listed for HORSE", metadata: { tokenContract: selectedOwned.contract, tokenId: selectedOwned.tokenId, quantity: units, unitPriceHorseRaw: rawPrice, opHash } });
      setSelectedOwnedKey(""); setQuantity("0"); setPrice(""); setReview(null);
      await Promise.all([listingQuery.refetch(), qc.invalidateQueries({ queryKey: ["horf", "owned-tokens", address] })]);
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "Could not list this horse."}${submitted ? " The transaction was submitted; check its explorer status before retrying." : ""}`);
    } finally { setPending(null); }
  }
  async function buy(listing: HorfHorseMarketListing) {
    if (!address || !contract || busy) return;
    setError(null); setSuccess(null);
    let submitted: string | null = null;
    try {
      const units = toNatString(buyQuantity);
      if (units === "0" || BigInt(units) > BigInt(listing.remaining)) throw new Error("Choose an available edition quantity.");
      setPending({ action: "buy", stage: "preflight", opHash: null });
      const handlers = stage("buy");
      const opHash = await buyHorseWithHorse(address, contract, listing, units, {
        ...handlers, onSubmitted: (hash) => { submitted = hash; handlers.onSubmitted(hash); },
      });
      setSuccess({ text: `${units} horse ${units === "1" ? "edition" : "editions"} bought with HORSE. The full HORSE price went to the seller.`, opHash });
      logClientSystemEvent({ eventType: "horf.horse_market.bought", message: "Horse bought with HORSE", metadata: { listingId: listing.id, quantity: units, opHash } });
      setBuyQuantity("1");
      await listingQuery.refetch();
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "The HORSE purchase could not be completed."}${submitted ? " The transaction was submitted; check its explorer status before retrying." : ""}`);
    } finally { setPending(null); }
  }
  async function cancel(listing: HorfHorseMarketListing) {
    if (!address || !contract || busy) return;
    setError(null); setSuccess(null);
    let submitted: string | null = null;
    try {
      setPending({ action: "cancel", stage: "preflight", opHash: null });
      const handlers = stage("cancel");
      const opHash = await cancelHorseMarketListing(address, contract, listing.id, {
        ...handlers, onSubmitted: (hash) => { submitted = hash; handlers.onSubmitted(hash); },
      });
      setSuccess({ text: "Unsold horse editions returned to your wallet.", opHash });
      logClientSystemEvent({ eventType: "horf.horse_market.cancelled", message: "HORSE Market listing cancelled", metadata: { listingId: listing.id, opHash } });
      await listingQuery.refetch();
    } catch (cause) {
      setError(`${cause instanceof Error ? cause.message : "The listing could not be cancelled."}${submitted ? " The transaction was submitted; check its explorer status before retrying." : ""}`);
    } finally { setPending(null); }
  }
  return <Page data-horf-region="horse-market" aria-label="Horf HORSE Market">
    <Hero>
      <div className="copy"><span className="kicker">Marshal’s seal · 🪢 The HORSE Market</span><h2>Fine horses. Fair HORSE.</h2><p>List inspected horses for HORSE. The full price goes to the seller. 🤠</p></div>
      <div className="photo" role="img" aria-label="Horse photograph"><span className="seal">MARSHAL<br />APPROVED<br />🐎</span></div>
    </Hero>
    {configQuery.isPending && <Notice role="status">Checking the HORSE Market contract…</Notice>}
    {configQuery.isError && <Notice $error role="alert">Market configuration is unavailable. Refresh before signing a transaction.</Notice>}
    {snapshot?.status === "unconfigured" && <Notice role="status">The HORSE Market is being prepared for Mainnet. Listings and purchases will open when its contract is deployed and verified.</Notice>}
    {snapshot?.status === "ready" && !configured && <Notice $error role="alert">Market configuration does not match Tezos Mainnet. Signing is paused.</Notice>}
    {configured && <Notice role="status"><Stamp>✦ Mainnet contract ready</Stamp> <a href={`https://tzkt.io/${contract!.contractAddress}`} target="_blank" rel="noopener noreferrer">{shortAddress(contract!.contractAddress)}</a> · HORSE is the only currency accepted by this Market. Objkt XTZ asks below use Objkt’s own contract.</Notice>}
    {!address && <Notice>Browse the corral freely. Connect a Tezos wallet to list or buy. <Action type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect my wallet"}</Action></Notice>}
    {pending && <Notice role="status" aria-live="polite">{pendingText(pending)} {pending.opHash && <a href={`https://tzkt.io/${encodeURIComponent(pending.opHash)}`} target="_blank" rel="noopener noreferrer">View submitted operation</a>}</Notice>}
    {error && <Notice $error role="alert">{error}</Notice>}
    {success && <Notice role="status">{success.text} <a href={`https://tzkt.io/${encodeURIComponent(success.opHash)}`} target="_blank" rel="noopener noreferrer">View operation</a></Notice>}

    <Toolbar><div><h3>Horses on the block 🐎</h3><p>Inspected editions priced in HORSE by their owners.</p></div><Action type="button" onClick={() => void Promise.all([listingQuery.refetch(), configQuery.refetch()])} disabled={listingQuery.isFetching || configQuery.isFetching}>↻ Refresh market</Action></Toolbar>
    <Layout>
      <div>
        {listingQuery.isPending && <Notice role="status">Rounding up the live listings…</Notice>}
        {listingQuery.isError && <Notice $error role="alert">Listings could not be read. Refresh to try again.</Notice>}
        {!listingQuery.isPending && !listingQuery.isError && listings.length === 0 && <Notice>No horses on the block yet. A Marshal-approved horse can be the first in the ring.</Notice>}
        <Grid>{listings.map((listing) => {
          const name = listing.token?.name || `Horse #${listing.tokenId}`;
          const art = listing.token?.image ? resolveTokenThumbnail({ thumbnail: listing.token.image }) : null;
          return <Card key={listing.id} $selected={selected?.id === listing.id} data-horf-horse-market-listing>
            <div className="art">{art ? <img src={art.src} alt={`${name} token artwork`} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, art)) { event.currentTarget.src = "/horf-art/horse-portrait-photo.jpg"; event.currentTarget.classList.add("photo"); event.currentTarget.alt = "Horse photograph placeholder"; } }} /> : <img className="photo" src="/horf-art/horse-portrait-photo.jpg" alt="Horse photograph placeholder" />}<span className="tag">✦ Marshal approved</span></div>
            <div className="body"><h4>{name}</h4><p>{listing.remaining} {listing.remaining === "1" ? "edition" : "editions"} · {shortAddress(listing.sellerAddress)}</p><div className="price"><div><span>Per edition</span><br /><strong>{formatHorseRaw(listing.unitPriceHorseRaw)}</strong> <span>HORSE</span></div><span>100% to seller</span></div><Action type="button" $strong={selected?.id === listing.id} onClick={() => setSelectedId(listing.id)} aria-label={`Inspect ${name} listing and payment options`}>Inspect this horse →</Action></div>
          </Card>;
        })}</Grid>
      </div>
      <div>
        <Panel data-horf-horse-market-details>
          <h3>At the hitching post 🪢</h3>
          {!selected && <p>Select a horse from the corral to see its payment choices.</p>}
          {selected && <>
            <p><Stamp>✦ Inspected horse</Stamp></p>
            <p className="meta"><a href={objktTokenUrl(selected.tokenContract, selected.tokenId)} target="_blank" rel="noopener noreferrer">{selected.token?.name || `Horse token #${selected.tokenId}`}</a><br />Token #{selected.tokenId} · seller {shortAddress(selected.sellerAddress)}</p>
            <label htmlFor="horf-market-buy-quantity">Editions to buy with HORSE</label>
            <input id="horf-market-buy-quantity" data-horf-horse-market-buy-quantity type="number" min="1" step="1" max={selected.remaining} value={buyQuantity} onChange={(event) => setBuyQuantity(event.target.value)} disabled={busy || !configured} />
            <p className="small">{formatHorseRaw(selected.unitPriceHorseRaw)} HORSE per edition. Your wallet signs the swap and pays XTZ gas.</p>
            {address === selected.sellerAddress ? <Action className="wide" type="button" onClick={() => void cancel(selected)} disabled={!configured || busy}>Cancel my listing</Action> : <Action className="wide" $strong type="button" onClick={() => void buy(selected)} disabled={!address || !configured || busy}>Buy with HORSE</Action>}
            <HorfObjktBuy key={`${selected.tokenContract}:${selected.tokenId}`} tokenContract={selected.tokenContract} tokenId={selected.tokenId} address={address} connectWallet={connectWallet} isConnecting={isConnecting} />
          </>}
        </Panel>
        <Panel style={{ marginTop: 16 }} data-horf-horse-market-list-form>
          <h3>Hang a HORSE price 🤠</h3>
          <p>Marshal approval required. Signing deposits your editions into the Market.</p>
          {!address && <Action type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect to list"}</Action>}
          {address && <form onSubmit={reviewListing}>
            <label htmlFor="horf-market-search">Find a horse in your wallet</label>
            <div style={{ display: "flex", gap: 7 }}><input id="horf-market-search" value={ownedSearchDraft} onChange={(event) => setOwnedSearchDraft(event.target.value)} placeholder="Name, contract or ID" /><Action type="button" onClick={() => { setOwnedSearch(ownedSearchDraft.trim()); setSelectedOwnedKey(""); setQuantity("0"); setReview(null); }}>Find</Action></div>
            <label htmlFor="horf-market-owned">Choose a horse token</label>
            <select id="horf-market-owned" data-horf-horse-market-owned value={selectedOwnedKey} onChange={(event) => { setSelectedOwnedKey(event.target.value); setQuantity("0"); setReview(null); }} disabled={busy}>
              <option value="">{ownedQuery.isPending ? "Loading horses…" : "Select a horse"}</option>
              {owned.map((token) => <option key={`${token.contract}:${token.tokenId}`} value={`${token.contract}:${token.tokenId}`}>{token.name || `Token #${token.tokenId}`} · {token.balance} owned</option>)}
            </select>
            {ownedQuery.hasNextPage && <Action type="button" onClick={() => void ownedQuery.fetchNextPage()} disabled={ownedQuery.isFetchingNextPage}>More wallet tokens</Action>}
            {ownedQuery.isError && <p role="alert">Wallet tokens are unavailable. Search again to retry.</p>}
            {selectedOwned && <p role="status">Inspection: <strong>{inspectionQuery.isPending ? "checking…" : inspectionQuery.isError ? "unavailable" : inspectionQuery.data?.status}</strong>{inspectionQuery.data?.status !== "approved" && <><br />Take this horse to <a href="/horf/stable">your personal stable</a> and ask a Marshal to inspect it.</>}</p>}
            <label htmlFor="horf-market-quantity">Editions to list</label>
            <input id="horf-market-quantity" data-horf-horse-market-quantity type="number" inputMode="numeric" min="0" max={selectedOwned?.balance} step="1" value={quantity} onChange={(event) => { setQuantity(event.target.value); setReview(null); }} disabled={busy} />
            <label htmlFor="horf-market-price">HORSE per edition</label>
            <input id="horf-market-price" data-horf-horse-market-price inputMode="decimal" value={price} onChange={(event) => { setPrice(event.target.value); setReview(null); }} placeholder="e.g. 25 or 2.5" disabled={busy} />
            <p className="small">Set any positive HORSE amount, up to eight decimal places. The full price goes to you when a horse sells. Tezos gas applies to listing and buying.</p>
            {!reviewCurrent && <Action type="submit" $strong disabled={!configured || snapshot?.permitReady !== true || !selectedOwned || inspectionQuery.data?.status !== "approved" || !isPositive(quantity) || (selectedOwned && BigInt(quantity) > BigInt(selectedOwned.balance)) || busy}>Review listing</Action>}
            {reviewCurrent && review && <ListingReviewCard data-horf-horse-market-list-review role="group" aria-label="Review HORSE Market listing">
              <h4>Check this horse before signing</h4>
              <dl><dt>Horse</dt><dd>{review.tokenName}</dd><dt>Token</dt><dd>{review.tokenContract} #{review.tokenId}</dd><dt>Wallet</dt><dd>{review.address}</dd><dt>Owned</dt><dd>{review.ownedBalance} editions</dd><dt>To escrow</dt><dd><strong>{review.quantity} {review.quantity === "1" ? "edition" : "editions"}</strong></dd><dt>Asking price</dt><dd>{formatHorseRaw(review.unitPriceHorseRaw)} HORSE per edition</dd></dl>
              <p className="small">Your wallet will deposit exactly {review.quantity} {review.quantity === "1" ? "edition" : "editions"} of this token into the HORSE Market. Review the wallet transaction before signing.</p>
              <div className="actions"><Action type="button" $strong data-horf-horse-market-list-confirm onClick={() => void list()} disabled={busy || !configured || snapshot?.permitReady !== true}>Continue to wallet</Action><Action type="button" onClick={() => setReview(null)} disabled={busy}>Change listing</Action></div>
            </ListingReviewCard>}
            {configured && snapshot?.permitReady !== true && <p role="status">Marshal listing permits are temporarily unavailable.</p>}
          </form>}
        </Panel>
      </div>
    </Layout>
  </Page>;
}
