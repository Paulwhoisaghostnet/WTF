import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { useHorfWallet } from "../features/horf/useHorfWallet";
import { objktTokenUrl } from "../features/horf/token-input";
import { api, fetchWithCsrf } from "../lib/api";
import { advanceResolvedMediaFallback, resolveTokenThumbnail } from "../lib/media-resolve";
import { logClientSystemEvent } from "../lib/system-log";
import { useWindowManager } from "../lib/window-context";
import { toNatString } from "../lib/tezos/nat";

type Season = { key: string; label: string; startsAt: string | null; endsAt: string | null; inferred?: boolean };
type AcceptedTokenPolicy = "marshal_only" | "any_qualifying";
type RangeOffer = { id: number; ownerAddress: string; tokenContract: string; tokenId: string; amount: string; acceptedTokenPolicy: AcceptedTokenPolicy; createdAt: string };
type RangeHorse = {
  contract: string;
  tokenId: string;
  name: string;
  description: string | null;
  image: string | null;
  mintedAt: string | null;
  creatorAddress: string | null;
  tradedThroughHorf: boolean;
  activelyForTradeOnHorf: boolean;
  approvedForMarshalsMarket: boolean;
  offers: Array<{ id: number; ownerAddress: string; amount: string; acceptedTokenPolicy: AcceptedTokenPolicy }>;
};
type RangePage = { season: Season; items: RangeHorse[]; nextCursor: string | null; hasMore: boolean; asOf: string | null };

const CURRENT_SEASON = "current-2026";

function initialSeason(): string {
  if (typeof window === "undefined") return CURRENT_SEASON;
  return new URLSearchParams(window.location.search).get("season")?.trim() || CURRENT_SEASON;
}

function writeSeason(key: string) {
  if (typeof window === "undefined" || !/\/horf\/open-range\/?$/.test(window.location.pathname)) return;
  const url = new URL(window.location.href);
  url.searchParams.set("season", key);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function parsePage(value: unknown): RangePage {
  const page = value as Partial<RangePage> | null;
  if (!page || !page.season || typeof page.season.key !== "string" ||
      !Array.isArray(page.items) || page.items.some((item) => !item ||
        typeof item.contract !== "string" || typeof item.tokenId !== "string" ||
        typeof item.name !== "string" || (item.mintedAt !== null && typeof item.mintedAt !== "string") ||
        typeof item.tradedThroughHorf !== "boolean" ||
        typeof item.activelyForTradeOnHorf !== "boolean" ||
        typeof item.approvedForMarshalsMarket !== "boolean" || !Array.isArray(item.offers)) ||
      typeof page.hasMore !== "boolean" ||
      (page.nextCursor !== null && typeof page.nextCursor !== "string") ||
      (page.hasMore && !page.nextCursor)) {
    throw new Error("The Open Range returned an invalid horse page. Refresh to try again.");
  }
  return page as RangePage;
}

const Shell = styled.div`
  min-height: 100%;
  min-width: 0;
  padding: 16px;
  box-sizing: border-box;
  color: #f8edd5;
  background: #202a28;
  font-family: Georgia, "Times New Roman", serif;
  container-type: inline-size;
  * { box-sizing: border-box; }
  a { color: #ffe19a; }
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 3px solid #08707b; outline-offset: 2px; }
`;

const Masthead = styled.header`
  position: relative;
  overflow: hidden;
  padding: 16px 22px;
  border: 2px solid #d19555;
  border-radius: 18px;
  background: linear-gradient(105deg, #40232a, #1b3938);
  color: #fff5dc;
  box-shadow: 4px 4px 0 #101a1a;
  > * { position: relative; z-index: 1; }
  &::after { content: ""; position: absolute; right: 10px; top: 4px; width: 205px; height: 145px; background: url('/horf-art/galloping-horse.webp') center / contain no-repeat; opacity: .44; pointer-events: none; }
  small { color: #f9d483; font: 700 11px/1.3 "Courier New", monospace; text-transform: uppercase; }
  h1 { margin: 2px 0 6px; font: 900 clamp(32px, 5cqw, 52px)/0.95 Georgia, serif; letter-spacing: -0.05em; }
  p { max-width: 760px; margin: 0; font-size: 14px; line-height: 1.45; }
  @container (max-width: 620px) { &::after { right: -35px; opacity: .16; } }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 13px;
`;

const Action = styled.button<{ $primary?: boolean }>`
  min-height: 36px;
  padding: 6px 11px;
  border: 2px solid #8a512f;
  border-radius: 999px;
  background: ${(p) => p.$primary ? "#f6ce76" : "#f5e9cb"};
  color: #36251b;
  box-shadow: 2px 2px 0 #ae7c57;
  cursor: pointer;
  font: 700 12px/1.2 "Courier New", monospace;
  &:hover:not(:disabled) { transform: translateY(-2px); }
  @media (prefers-reduced-motion: reduce) { &:hover:not(:disabled) { transform: none; } }
  &:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }
`;

const Toolbar = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
  margin-top: 18px;
  padding: 13px;
  border: 1px solid #a97a4c;
  border-radius: 16px;
  background: #303d37;
  fieldset { margin: 0; padding: 0; border: 0; min-width: 0; background: transparent; color: #f8edd5; }
  legend { margin-bottom: 7px; font: 700 12px "Courier New", monospace; }
  fieldset > div { display: flex; flex-wrap: wrap; gap: 6px; }
  label { display: inline-flex; align-items: center; gap: 5px; min-height: 34px; padding: 5px 10px; border: 1px solid #b7936b; border-radius: 999px; background: #f5e9ce; color: #342219; font: 700 11px/1.25 "Courier New", monospace; cursor: pointer; }
  label:has(input:checked) { border-width: 2px; border-color: #f8d783; background: #f0b85d; box-shadow: 0 0 0 2px #784632; }
  input[type="radio"] { width: auto; margin: 0; accent-color: #803a2f; }
  small { display: block; margin-top: 8px; color: #ead6b4; font: 11px/1.35 "Courier New", monospace; }
  @container (max-width: 560px) { grid-template-columns: 1fr; }
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin: 17px 0 9px;
  align-items: center;
  strong { margin-right: 4px; font: 700 12px "Courier New", monospace; }
`;

const StatusFrame = styled.span<{ $kind: "traded" | "offered" | "approved"; $active?: boolean }>`
  display: inline-flex;
  padding: 4px 7px;
  border-radius: 999px;
  border: 3px solid ${(p) => !p.$active ? "#b7aca0" : p.$kind === "traded" ? "#b35342" : p.$kind === "offered" ? "#bf8428" : "#3e8071"};
  background: ${(p) => !p.$active ? "#f2eee7" : p.$kind === "traded" ? "#ffe8d9" : p.$kind === "offered" ? "#fff0c6" : "#e0f1dc"};
  color: #39271e;
  font: 700 11px/1.25 "Courier New", monospace;
`;

const Grid = styled.div`
  columns: 240px;
  column-gap: 14px;
  margin-top: 10px;
`;

const Card = styled.article<{ $traded: boolean; $offered: boolean; $approved: boolean }>`
  min-width: 0;
  display: inline-block;
  width: 100%;
  break-inside: avoid;
  margin-bottom: 14px;
  padding: 13px;
  border: 1px solid #af855a;
  border-radius: 13px;
  background: #303d37;
  box-shadow:
    inset 0 0 0 3px ${(p) => p.$traded ? "#d0654c" : "#4b594f"},
    inset 0 0 0 6px ${(p) => p.$offered ? "#e8af48" : "#4b594f"},
    inset 0 0 0 9px ${(p) => p.$approved ? "#63b4a0" : "#4b594f"},
    3px 5px 0 #101a1a;
  h2 { margin: 8px 0 4px; font-size: 19px; line-height: 1.15; overflow-wrap: anywhere; }
  p { margin: 5px 0; font-size: 12px; line-height: 1.4; }
  small { display: block; margin-top: 5px; color: #e0caa8; font: 11px/1.35 "Courier New", monospace; overflow-wrap: anywhere; }
`;

const Art = styled.img`
  display: block;
  width: 100%;
  height: auto;
  max-height: 350px;
  object-fit: contain;
  border-radius: 8px;
  background: #eee3ca;
`;

const Glyph = styled.div`
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 8px;
  background: #e9d5a3;
  img { display: block; width: 90%; max-height: 88%; object-fit: contain; }
`;

const CardFlags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 10px 0;
`;

const ArtButton = styled.button`
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: #e9d5a3;
  cursor: zoom-in;
  overflow: hidden;
  &:hover img { transform: scale(1.025); }
  @media (prefers-reduced-motion: reduce) { &:hover img { transform: none; } }
  img { transition: transform 160ms ease; }
  @media (prefers-reduced-motion: reduce) { img { transition: none; } }
`;

const HorseDetail = styled.dialog`
  width: min(820px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  padding: 17px;
  border: 3px solid #e6af63;
  border-radius: 18px;
  background: #f8edda;
  color: #342219;
  box-shadow: 0 22px 70px #000a;
  &::backdrop { background: #101c1ccc; }
  button:focus-visible, a:focus-visible { outline: 3px solid #08707b; outline-offset: 3px; }
  .detail-head { display: flex; justify-content: space-between; align-items: start; gap: 12px; margin-bottom: 12px; }
  h2 { margin: 0; font: 900 clamp(24px, 4vw, 34px)/1.05 Georgia, serif; }
  .detail-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 18px; }
  .detail-grid > img, .detail-grid > .detail-glyph { display: block; width: 100%; max-height: 62vh; object-fit: contain; border-radius: 10px; background: #e9d5a3; }
  .detail-glyph { display: grid; place-items: center; min-height: 220px; }
  .detail-glyph img { display: block; width: 90%; max-height: 35vh; object-fit: contain; }
  p { margin: 0 0 10px; line-height: 1.45; }
  small { display: block; margin: 0 0 8px; overflow-wrap: anywhere; }
  a { color: #742e27; }
  @media (max-width: 650px) { .detail-grid { grid-template-columns: 1fr; } .detail-grid > img, .detail-grid > .detail-glyph { max-height: 38vh; } }
`;

const Note = styled.div<{ $error?: boolean }>`
  margin: 12px 0;
  padding: 10px 12px;
  border-left: 5px solid ${(p) => p.$error ? "#a43d31" : "#5c7e53"};
  background: ${(p) => p.$error ? "#fff0d9" : "#edf3dc"};
  color: #342219;
  font: 700 12px/1.45 "Courier New", monospace;
  overflow-wrap: anywhere;
`;

const EmptyRange = styled(Note)`
  min-height: 62px;
  padding-left: 70px;
  background: url('/horf-art/horseshoe.svg') 12px center / 42px 42px no-repeat, #edf3dc;
`;

const OfferPanel = styled.section`
  margin-top: 20px;
  padding: 15px;
  border: 2px solid #bb8e59;
  border-radius: 16px;
  background: #3b3430;
  h2 { margin: 0 0 6px; font-size: 24px; }
  p { margin: 0 0 10px; font-size: 13px; line-height: 1.45; }
  label { display: block; margin: 8px 0 4px; font: 700 12px "Courier New", monospace; }
  input { width: 100%; max-width: 250px; min-height: 36px; padding: 6px 8px; border: 1px solid #987350; border-radius: 8px; background: #fffdf3; color: #342219; font: 13px Georgia, serif; }
  ul { list-style: none; padding: 0; margin: 10px 0 0; }
  li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 9px 0; border-top: 1px solid #d6b992; }
  li span { min-width: 0; overflow-wrap: anywhere; }
  fieldset { margin: 12px 0; padding: 10px; border: 1px solid #b89467; border-radius: 10px; background: #2b3a35; color: #f8edd5; }
  legend { padding: 0 5px; font: 700 12px/1.3 "Courier New", monospace; }
  fieldset label { display: flex; align-items: start; gap: 8px; margin: 7px 0; font: 700 12px/1.35 "Courier New", monospace; cursor: pointer; }
  fieldset input { width: auto; min-height: 0; margin: 2px 0 0; accent-color: #e0a747; }
`;

function shortAddress(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function horseArt(value: RangeHorse) {
  return value.image ? resolveTokenThumbnail({ thumbnail: value.image }) : null;
}

function policyLabel(policy: AcceptedTokenPolicy | undefined): string {
  return policy === "marshal_only" ? "Wants Marshal-approved horses" : "Welcomes any qualifying horse";
}

export function HorfOpenRange() {
  const { address, isGuest, connectWallet, isConnecting, walletError } = useHorfWallet();
  const qc = useQueryClient();
  const windowManager = useWindowManager();
  const viewed = useRef(new Set<string>());
  const [seasonKey, setSeasonKey] = useState(initialSeason);
  const [offerHorse, setOfferHorse] = useState<RangeHorse | null>(null);
  const [detailHorse, setDetailHorse] = useState<RangeHorse | null>(null);
  const detailRef = useRef<HTMLDialogElement>(null);
  const [offerAmount, setOfferAmount] = useState("1");
  const [acceptedTokenPolicy, setAcceptedTokenPolicy] = useState<AcceptedTokenPolicy>("any_qualifying");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const seasonsQuery = useQuery({
    queryKey: ["horf", "open-range-seasons"],
    queryFn: () => api.get<{ season: Season; seasons: Season[] }>(`/api/horf/season?season=${CURRENT_SEASON}`),
  });
  const seasons = Array.isArray(seasonsQuery.data?.seasons) ? seasonsQuery.data.seasons : [];
  const rangeQuery = useInfiniteQuery({
    queryKey: ["horf", "open-range", seasonKey],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ season: seasonKey });
      if (pageParam) params.set("cursor", pageParam);
      return api.get<unknown>(`/api/horf/open-range?${params}`).then(parsePage);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.hasMore ? page.nextCursor ?? undefined : undefined,
    refetchOnWindowFocus: true,
  });
  const pages = rangeQuery.data?.pages ?? [];
  const horses = useMemo(() => pages.flatMap((page) => page.items), [pages]);
  const shownSeason = pages[0]?.season ?? seasonsQuery.data?.season;
  const asOf = pages[0]?.asOf ?? null;
  const offersQuery = useQuery({
    queryKey: ["horf", "open-range-offers", address],
    queryFn: () => api.get<{ offers: RangeOffer[] }>(`/api/horf/open-range/offers?address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address),
    refetchOnWindowFocus: true,
  });
  const myOffers = Array.isArray(offersQuery.data?.offers) ? offersQuery.data.offers : [];

  useEffect(() => {
    const dialog = detailRef.current;
    if (!dialog) return;
    if (detailHorse && !dialog.open) dialog.showModal();
    if (!detailHorse && dialog.open) dialog.close();
  }, [detailHorse]);

  function viewHorse(horse: RangeHorse) {
    setDetailHorse(horse);
    logClientSystemEvent({ eventType: "horf.open_range.horse_viewed", message: "Horse details viewed on Horf Open Range", metadata: { contract: horse.contract, tokenId: horse.tokenId } });
  }

  useEffect(() => {
    if (!pages.length || viewed.current.has(seasonKey)) return;
    viewed.current.add(seasonKey);
    logClientSystemEvent({ eventType: "horf.open_range.viewed", message: "Horf Open Range horse market viewed", metadata: { seasonKey } });
  }, [pages.length, seasonKey]);

  function changeSeason(key: string) {
    setSeasonKey(key);
    setOfferHorse(null);
    writeSeason(key);
  }

  async function postOffer(event: FormEvent) {
    event.preventDefault();
    if (!address || !offerHorse || busy) return;
    setError(null); setSuccess(null);
    try {
      const amount = toNatString(offerAmount);
      if (amount === "0") throw new Error("Offer at least one horse edition.");
      setBusy(true);
      await api.post("/api/horf/open-range/offers", { address, tokenContract: offerHorse.contract, tokenId: offerHorse.tokenId, amount, acceptedTokenPolicy });
      setOfferHorse(null); setOfferAmount("1"); setAcceptedTokenPolicy("any_qualifying");
      await qc.invalidateQueries({ queryKey: ["horf", "open-range-offers", address] });
      await qc.invalidateQueries({ queryKey: ["horf", "open-range", seasonKey] });
      setSuccess("Your horse is marked for direct trade on the Open Range. It stays in your wallet until you sign a transfer.");
      logClientSystemEvent({ eventType: "horf.open_range.offer_posted", message: "Horse marked for direct trade on Horf Open Range", metadata: { tokenContract: offerHorse.contract, tokenId: offerHorse.tokenId, amount, acceptedTokenPolicy } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not post this horse offer."); }
    finally { setBusy(false); }
  }

  async function removeOffer(offer: RangeOffer) {
    if (busy) return;
    setError(null); setSuccess(null);
    try {
      setBusy(true);
      const response = await fetchWithCsrf(`/api/horf/open-range/offers/${offer.id}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Could not remove this offer.");
      }
      await qc.invalidateQueries({ queryKey: ["horf", "open-range-offers", address] });
      await qc.invalidateQueries({ queryKey: ["horf", "open-range", seasonKey] });
      setSuccess("The direct-trade sign is down. The horse never left your wallet.");
      logClientSystemEvent({ eventType: "horf.open_range.offer_removed", message: "Horse direct-trade sign removed from Horf Open Range", metadata: { offerId: offer.id, tokenContract: offer.tokenContract, tokenId: offer.tokenId } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove this offer."); }
    finally { setBusy(false); }
  }

  return <AppWindow title="Horf · Open Range">
    <Shell data-horf-open-range>
      <Masthead><small>Public horse trail · Tezos Mainnet</small><h1>The Open Range 🐎</h1><p>Every qualifying horse minted in the selected season gets a place here, even if it has never traded. Follow the colored reins to see separate Horf trade history, direct offers, and Marshal’s Market approval.</p>
        <Actions><Action type="button" onClick={() => windowManager.openPage(`/horf?season=${encodeURIComponent(seasonKey)}`)}>Back to Horf race and stables</Action>{!address && <Action data-horf-open-range-connect type="button" $primary onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : isGuest ? "Connect and verify wallet" : "Connect wallet"}</Action>}</Actions>
      </Masthead>
      {walletError && <Note $error role="alert">{walletError}</Note>}
      <Toolbar data-horf-open-range-season><div><fieldset><legend>Range to search</legend><div>
        <label><input type="radio" name="horf-open-range-mode" data-horf-open-range-mode="all-seasons" checked={seasonKey === "all-seasons"} onChange={() => changeSeason("all-seasons")} />All known seasons</label>
        <label><input type="radio" name="horf-open-range-mode" data-horf-open-range-mode="all-horse-search" checked={seasonKey === "all-horse-search"} onChange={() => changeSeason("all-horse-search")} />All Horse Search</label>
        {!seasons.some((season) => season.key === seasonKey) && seasonKey !== "all-seasons" && seasonKey !== "all-horse-search" && <label><input type="radio" name="horf-open-range-mode" checked readOnly />{shownSeason?.label || seasonKey}</label>}
        {seasons.map((season) => <label key={season.key}><input type="radio" name="horf-open-range-mode" data-horf-open-range-mode={season.key} checked={seasonKey === season.key} onChange={() => changeSeason(season.key)} />{season.label}{season.inferred ? " · archive" : ""}</label>)}
      </div></fieldset><small>{seasonKey === "all-seasons" ? "All known campaign windows only; this does not cover every calendar year." : seasonKey === "all-horse-search" ? "All known qualifying horse keywords, regardless of mint date. Some mint dates may be unknown." : shownSeason?.startsAt ? `${new Date(shownSeason.startsAt).toLocaleDateString()} – ${shownSeason.endsAt ? new Date(shownSeason.endsAt).toLocaleDateString() : "ongoing"}${shownSeason.inferred ? " · Archive boundaries are inferred from Objkt clusters and organizer posts." : ""}` : "Loading campaign dates…"}</small></div><Action type="button" onClick={() => void rangeQuery.refetch()} disabled={rangeQuery.isFetching}>{rangeQuery.isFetching ? "Refreshing…" : "Refresh horses"}</Action></Toolbar>
      <Legend data-horf-open-range-legend><strong>Read the reins:</strong><StatusFrame $kind="traded" $active>Traded through Horf</StatusFrame><StatusFrame $kind="offered" $active>For direct trade now</StatusFrame><StatusFrame $kind="approved" $active>Marshal approved</StatusFrame></Legend>
      <p>Each horse card wears three nested status frames matching the text badges below. A horse may show several colors, or none. A direct offer is an owner’s off-chain signal, not escrow or a guaranteed swap.</p>
      {rangeQuery.isPending && <Note role="status">Rounding up the season’s minted horses…</Note>}
      {rangeQuery.isError && <Note $error role="alert">{rangeQuery.error instanceof Error ? rangeQuery.error.message : "The Open Range is unavailable."} Refresh to try again.</Note>}
      {asOf && <p>Mint and Horf status indexed through {new Date(asOf).toLocaleString()}.</p>}
      <Grid data-horf-open-range-grid>{horses.map((horse) => {
        const art = horseArt(horse);
        return <Card key={`${horse.contract}:${horse.tokenId}`} data-horf-open-range-horse data-horf-frame-traded={horse.tradedThroughHorf} data-horf-frame-offered={horse.activelyForTradeOnHorf} data-horf-frame-approved={horse.approvedForMarshalsMarket} $traded={horse.tradedThroughHorf} $offered={horse.activelyForTradeOnHorf} $approved={horse.approvedForMarshalsMarket}>
          <ArtButton data-horf-open-range-view-horse type="button" onClick={() => viewHorse(horse)} aria-label={`View ${horse.name || `horse token #${horse.tokenId}`} details`}>
            {art ? <Art src={art.src} alt="" onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, art)) event.currentTarget.src = "/horf-art/galloping-horse.webp"; }} /> : <Glyph aria-hidden="true"><img src="/horf-art/galloping-horse.webp" alt="" /></Glyph>}
          </ArtButton>
          <h2><a href={objktTokenUrl(horse.contract, horse.tokenId)} target="_blank" rel="noopener noreferrer">{horse.name || `Horse token #${horse.tokenId}`}</a></h2>
          {horse.description && <p>{horse.description}</p>}
          <small>{horse.mintedAt ? `Minted ${new Date(horse.mintedAt).toLocaleDateString()}` : "Mint date unknown"} · {shortAddress(horse.contract)} / #{horse.tokenId}</small>
          {horse.creatorAddress && <small>Creator: <a href={`https://objkt.com/profile/${encodeURIComponent(horse.creatorAddress)}`} target="_blank" rel="noopener noreferrer">{shortAddress(horse.creatorAddress)}</a></small>}
          <CardFlags data-horf-open-range-flags><StatusFrame data-horf-open-range-status="traded" $kind="traded" $active={horse.tradedThroughHorf}>{horse.tradedThroughHorf ? "Traded through Horf" : "No Horf trade yet"}</StatusFrame><StatusFrame data-horf-open-range-status="offered" $kind="offered" $active={horse.activelyForTradeOnHorf}>{horse.activelyForTradeOnHorf ? "For direct trade now" : "No active Horf offer"}</StatusFrame><StatusFrame data-horf-open-range-status="approved" $kind="approved" $active={horse.approvedForMarshalsMarket}>{horse.approvedForMarshalsMarket ? "Marshal approved" : "Not Marshal approved"}</StatusFrame></CardFlags>
          {horse.offers.length > 0 && <p>{horse.offers.map((offer, index) => <span key={offer.id}>{index > 0 ? " · " : ""}<a href={`https://objkt.com/profile/${encodeURIComponent(offer.ownerAddress)}`} target="_blank" rel="noopener noreferrer">{shortAddress(offer.ownerAddress)}</a> offers {offer.amount} · {policyLabel(offer.acceptedTokenPolicy)}</span>)}. These are owner preferences, not escrow rules; contact them on Objkt before any direct wallet transfer.</p>}
          <Action type="button" onClick={() => { setOfferHorse(horse); setError(null); setSuccess(null); document.getElementById("horf-open-range-offer")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }} disabled={!address}>Offer this horse from my wallet</Action>
        </Card>;
      })}</Grid>
      {!rangeQuery.isPending && !rangeQuery.isError && !horses.length && <EmptyRange data-horf-open-range-empty>{rangeQuery.hasNextPage ? "No qualifying horses appeared on the pages read so far. Keep riding to the next page." : "No qualifying horse mints were found in this range. Try All Horse Search to look beyond known campaign windows."}</EmptyRange>}
      {rangeQuery.hasNextPage && <Actions><Action data-horf-open-range-more type="button" onClick={() => void rangeQuery.fetchNextPage()} disabled={rangeQuery.isFetchingNextPage}>{rangeQuery.isFetchingNextPage ? "Rounding up more…" : "See more horses"}</Action></Actions>}
      <OfferPanel id="horf-open-range-offer" data-horf-open-range-offers><h2>Put a horse on the trade rail</h2><p>A Horf offer is a public, off-chain sign for a direct trade. The horse stays in your wallet; Horf checks ownership and eligibility before posting. The actual transfer is irrevocable and has no Horf escrow.</p>
        {!address && <Note>Connect and verify your wallet to post or remove its offers.</Note>}
        {offerHorse && <form onSubmit={(event) => void postOffer(event)}><p>Selected: <a href={objktTokenUrl(offerHorse.contract, offerHorse.tokenId)} target="_blank" rel="noopener noreferrer">{offerHorse.name || `Horse token #${offerHorse.tokenId}`}</a> · #{offerHorse.tokenId}</p><label htmlFor="horf-open-range-offer-amount">Editions to offer</label><input id="horf-open-range-offer-amount" data-horf-open-range-offer-amount inputMode="numeric" value={offerAmount} onChange={(event) => setOfferAmount(event.target.value)} disabled={busy} /><fieldset data-horf-open-range-policy><legend>Horses you would accept in return</legend><label><input type="radio" name="horf-offer-policy" value="any_qualifying" checked={acceptedTokenPolicy === "any_qualifying"} onChange={() => setAcceptedTokenPolicy("any_qualifying")} disabled={busy} />Any qualifying horse · trust your trading partner</label><label><input type="radio" name="horf-offer-policy" value="marshal_only" checked={acceptedTokenPolicy === "marshal_only"} onChange={() => setAcceptedTokenPolicy("marshal_only")} disabled={busy} />Marshal-approved horses only</label></fieldset><p>This is your off-chain preference. A direct wallet trade has no escrow; potential partners should honor your choice.</p><Actions><Action data-horf-open-range-offer-post type="submit" $primary disabled={!address || busy}>Post direct offer</Action><Action type="button" onClick={() => setOfferHorse(null)} disabled={busy}>Cancel</Action></Actions></form>}
        <h3>Your active signs</h3>{offersQuery.isPending && address && <p>Reading your offers…</p>}{offersQuery.isError && <Note $error role="alert">Your offer list is unavailable. Refresh to try again.</Note>}
        {myOffers.length ? <ul>{myOffers.map((offer) => <li key={offer.id} data-horf-open-range-my-offer><span><a href={objktTokenUrl(offer.tokenContract, offer.tokenId)} target="_blank" rel="noopener noreferrer">Horse token #{offer.tokenId}</a> · {offer.amount} editions · {shortAddress(offer.tokenContract)} · {policyLabel(offer.acceptedTokenPolicy)}</span><Action data-horf-open-range-offer-remove type="button" onClick={() => void removeOffer(offer)} disabled={busy}>Remove offer</Action></li>)}</ul> : address && !offersQuery.isPending && !offersQuery.isError && <p>No active offers from this wallet.</p>}
      </OfferPanel>
      {error && <Note $error role="alert">{error}</Note>}{success && <Note role="status">{success}</Note>}
      <HorseDetail ref={detailRef} data-horf-open-range-detail onClose={() => setDetailHorse(null)} onClick={(event) => { if (event.target === event.currentTarget) setDetailHorse(null); }} aria-label="Horse details">
        {detailHorse && <>
          <div className="detail-head"><div><small>🐎 Open Range · horse papers</small><h2>{detailHorse.name || `Horse token #${detailHorse.tokenId}`}</h2></div><Action type="button" onClick={() => setDetailHorse(null)}>Close details</Action></div>
          <div className="detail-grid">
            {horseArt(detailHorse) ? <img src={horseArt(detailHorse)!.src} alt={`${detailHorse.name || `Horse token #${detailHorse.tokenId}`} artwork`} onError={(event) => { const resolved = horseArt(detailHorse); if (!resolved || !advanceResolvedMediaFallback(event.currentTarget, resolved)) { event.currentTarget.src = "/horf-art/galloping-horse.webp"; event.currentTarget.alt = "Illustrated horse placeholder"; } }} /> : <div className="detail-glyph" aria-hidden="true"><img src="/horf-art/galloping-horse.webp" alt="" /></div>}
            <div><p>{detailHorse.description || "This horse has no description from Objkt yet."}</p><CardFlags><StatusFrame $kind="traded" $active={detailHorse.tradedThroughHorf}>{detailHorse.tradedThroughHorf ? "Traded through Horf" : "No Horf trade yet"}</StatusFrame><StatusFrame $kind="offered" $active={detailHorse.activelyForTradeOnHorf}>{detailHorse.activelyForTradeOnHorf ? "For direct trade now" : "No active Horf offer"}</StatusFrame><StatusFrame $kind="approved" $active={detailHorse.approvedForMarshalsMarket}>{detailHorse.approvedForMarshalsMarket ? "Marshal approved" : "Not Marshal approved"}</StatusFrame></CardFlags><small>{detailHorse.mintedAt ? `Minted ${new Date(detailHorse.mintedAt).toLocaleDateString()}` : "Mint date unknown"} · {detailHorse.contract} / #{detailHorse.tokenId}</small>{detailHorse.creatorAddress && <small>Creator: <a href={`https://objkt.com/profile/${encodeURIComponent(detailHorse.creatorAddress)}`} target="_blank" rel="noopener noreferrer">{shortAddress(detailHorse.creatorAddress)}</a></small>}{detailHorse.offers.map((offer) => <p key={offer.id}>🤠 <a href={`https://objkt.com/profile/${encodeURIComponent(offer.ownerAddress)}`} target="_blank" rel="noopener noreferrer">{shortAddress(offer.ownerAddress)}</a> offers {offer.amount} · {policyLabel(offer.acceptedTokenPolicy)}</p>)}<p>Offers are owner preferences, not escrow protection. Confirm terms before any direct wallet transfer.</p><a href={objktTokenUrl(detailHorse.contract, detailHorse.tokenId)} target="_blank" rel="noopener noreferrer">View this horse on Objkt ↗</a></div>
          </div>
        </>}
      </HorseDetail>
    </Shell>
  </AppWindow>;
}
