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
type RangeOffer = { id: number; ownerAddress: string; tokenContract: string; tokenId: string; amount: string; createdAt: string };
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
  offers: Array<{ id: number; ownerAddress: string; amount: string }>;
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
  color: #342219;
  background: #f4e9ce;
  font-family: Georgia, "Times New Roman", serif;
  container-type: inline-size;
  * { box-sizing: border-box; }
  a { color: #6f3024; }
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 3px solid #08707b; outline-offset: 2px; }
`;

const Masthead = styled.header`
  padding: 19px 22px;
  border: 4px double #efbd69;
  background: #4a2929;
  color: #fff5dc;
  box-shadow: 4px 4px 0 #ae694a;
  small { color: #f9d483; font: 700 11px/1.3 "Courier New", monospace; text-transform: uppercase; }
  h1 { margin: 2px 0 6px; font: 900 clamp(32px, 5cqw, 58px)/0.95 Georgia, serif; letter-spacing: -0.05em; }
  p { max-width: 760px; margin: 0; font-size: 14px; line-height: 1.45; }
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
  border: 2px solid #65402f;
  background: ${(p) => p.$primary ? "#f6ce76" : "#fff4d9"};
  color: #36251b;
  box-shadow: 2px 2px 0 #ae7c57;
  cursor: pointer;
  font: 700 12px/1.2 "Courier New", monospace;
  &:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }
`;

const Toolbar = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: end;
  margin-top: 18px;
  padding: 13px;
  border: 1px solid #b99469;
  background: #fff8e8;
  fieldset { margin: 0; padding: 0; border: 0; min-width: 0; }
  legend { margin-bottom: 7px; font: 700 12px "Courier New", monospace; }
  fieldset > div { display: flex; flex-wrap: wrap; gap: 6px; }
  label { display: inline-flex; align-items: center; gap: 5px; min-height: 34px; padding: 5px 8px; border: 1px solid #a8835d; background: #fffdf4; font: 700 11px/1.25 "Courier New", monospace; cursor: pointer; }
  label:has(input:checked) { border-width: 2px; border-color: #6f3024; background: #f6d68e; }
  input[type="radio"] { width: auto; margin: 0; accent-color: #803a2f; }
  small { display: block; margin-top: 6px; font: 11px/1.35 "Courier New", monospace; }
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
  border: 3px solid ${(p) => !p.$active ? "#b7aca0" : p.$kind === "traded" ? "#b35342" : p.$kind === "offered" ? "#bf8428" : "#3e8071"};
  background: ${(p) => !p.$active ? "#f2eee7" : p.$kind === "traded" ? "#ffe8d9" : p.$kind === "offered" ? "#fff0c6" : "#e0f1dc"};
  color: #39271e;
  font: 700 11px/1.25 "Courier New", monospace;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr));
  gap: 13px;
  margin-top: 10px;
`;

const Card = styled.article<{ $traded: boolean; $offered: boolean; $approved: boolean }>`
  min-width: 0;
  padding: 22px;
  border: 2px solid #8c6547;
  background: #fff9eb;
  box-shadow:
    inset 0 0 0 4px ${(p) => p.$traded ? "#b35342" : "#d7cec0"},
    inset 0 0 0 8px ${(p) => p.$offered ? "#bf8428" : "#e3d8c5"},
    inset 0 0 0 12px ${(p) => p.$approved ? "#3e8071" : "#e9dfce"},
    3px 3px 0 #c3a982;
  h2 { margin: 8px 0 4px; font-size: 19px; line-height: 1.15; overflow-wrap: anywhere; }
  p { margin: 5px 0; font-size: 12px; line-height: 1.4; }
  small { display: block; margin-top: 5px; color: #755b4a; font: 11px/1.35 "Courier New", monospace; overflow-wrap: anywhere; }
`;

const Art = styled.img`
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  border: 3px double #ad8a61;
  background: #efe9d5;
`;

const Glyph = styled.div`
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 1;
  border: 3px double #ad8a61;
  background: #efe9d5;
  font-size: 76px;
`;

const CardFlags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 10px 0;
`;

const Note = styled.div<{ $error?: boolean }>`
  margin: 12px 0;
  padding: 10px 12px;
  border-left: 5px solid ${(p) => p.$error ? "#a43d31" : "#5c7e53"};
  background: ${(p) => p.$error ? "#fff0d9" : "#edf3dc"};
  font: 700 12px/1.45 "Courier New", monospace;
  overflow-wrap: anywhere;
`;

const OfferPanel = styled.section`
  margin-top: 20px;
  padding: 15px;
  border: 3px solid #805534;
  background: #f5e1bd;
  h2 { margin: 0 0 6px; font-size: 24px; }
  p { margin: 0 0 10px; font-size: 13px; line-height: 1.45; }
  label { display: block; margin: 8px 0 4px; font: 700 12px "Courier New", monospace; }
  input { width: 100%; max-width: 250px; min-height: 36px; padding: 6px 8px; border: 1px solid #987350; background: #fffdf3; font: 13px Georgia, serif; }
  ul { list-style: none; padding: 0; margin: 10px 0 0; }
  li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; padding: 9px 0; border-top: 1px solid #d6b992; }
  li span { min-width: 0; overflow-wrap: anywhere; }
`;

function shortAddress(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function horseArt(value: RangeHorse) {
  return value.image ? resolveTokenThumbnail({ thumbnail: value.image }) : null;
}

export function HorfOpenRange() {
  const { address, isGuest, connectWallet, isConnecting, walletError } = useHorfWallet();
  const qc = useQueryClient();
  const windowManager = useWindowManager();
  const viewed = useRef(new Set<string>());
  const [seasonKey, setSeasonKey] = useState(initialSeason);
  const [offerHorse, setOfferHorse] = useState<RangeHorse | null>(null);
  const [offerAmount, setOfferAmount] = useState("1");
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
      await api.post("/api/horf/open-range/offers", { address, tokenContract: offerHorse.contract, tokenId: offerHorse.tokenId, amount });
      setOfferHorse(null); setOfferAmount("1");
      await qc.invalidateQueries({ queryKey: ["horf", "open-range-offers", address] });
      await qc.invalidateQueries({ queryKey: ["horf", "open-range", seasonKey] });
      setSuccess("Your horse is marked for direct trade on the Open Range. It stays in your wallet until you sign a transfer.");
      logClientSystemEvent({ eventType: "horf.open_range.offer_posted", message: "Horse marked for direct trade on Horf Open Range", metadata: { tokenContract: offerHorse.contract, tokenId: offerHorse.tokenId, amount } });
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
          {art ? <Art src={art.src} alt={`${horse.name || `Horse token #${horse.tokenId}`} artwork`} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, art)) event.currentTarget.style.display = "none"; }} /> : <Glyph aria-hidden="true">🐎</Glyph>}
          <h2><a href={objktTokenUrl(horse.contract, horse.tokenId)} target="_blank" rel="noopener noreferrer">{horse.name || `Horse token #${horse.tokenId}`}</a></h2>
          {horse.description && <p>{horse.description}</p>}
          <small>{horse.mintedAt ? `Minted ${new Date(horse.mintedAt).toLocaleDateString()}` : "Mint date unknown"} · {shortAddress(horse.contract)} / #{horse.tokenId}</small>
          {horse.creatorAddress && <small>Creator: <a href={`https://objkt.com/profile/${encodeURIComponent(horse.creatorAddress)}`} target="_blank" rel="noopener noreferrer">{shortAddress(horse.creatorAddress)}</a></small>}
          <CardFlags data-horf-open-range-flags><StatusFrame data-horf-open-range-status="traded" $kind="traded" $active={horse.tradedThroughHorf}>{horse.tradedThroughHorf ? "Traded through Horf" : "No Horf trade yet"}</StatusFrame><StatusFrame data-horf-open-range-status="offered" $kind="offered" $active={horse.activelyForTradeOnHorf}>{horse.activelyForTradeOnHorf ? "For direct trade now" : "No active Horf offer"}</StatusFrame><StatusFrame data-horf-open-range-status="approved" $kind="approved" $active={horse.approvedForMarshalsMarket}>{horse.approvedForMarshalsMarket ? "Marshal approved" : "Not Marshal approved"}</StatusFrame></CardFlags>
          {horse.offers.length > 0 && <p>{horse.offers.map((offer, index) => <span key={offer.id}>{index > 0 ? " · " : ""}<a href={`https://objkt.com/profile/${encodeURIComponent(offer.ownerAddress)}`} target="_blank" rel="noopener noreferrer">{shortAddress(offer.ownerAddress)}</a> offers {offer.amount}</span>)} · Contact the owner on Objkt before a direct wallet transfer.</p>}
          <Action type="button" onClick={() => { setOfferHorse(horse); setError(null); setSuccess(null); document.getElementById("horf-open-range-offer")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }} disabled={!address}>Offer this horse from my wallet</Action>
        </Card>;
      })}</Grid>
      {!rangeQuery.isPending && !rangeQuery.isError && !horses.length && <Note>{rangeQuery.hasNextPage ? "No qualifying horses appeared on the pages read so far. Keep riding to the next page." : "No qualifying horse mints were found in this range."}</Note>}
      {rangeQuery.hasNextPage && <Actions><Action data-horf-open-range-more type="button" onClick={() => void rangeQuery.fetchNextPage()} disabled={rangeQuery.isFetchingNextPage}>{rangeQuery.isFetchingNextPage ? "Rounding up more…" : "See more horses"}</Action></Actions>}
      <OfferPanel id="horf-open-range-offer" data-horf-open-range-offers><h2>Put a horse on the trade rail</h2><p>A Horf offer is a public, off-chain sign for a direct trade. The horse stays in your wallet; Horf checks ownership and eligibility before posting. The actual transfer is irrevocable and has no Horf escrow.</p>
        {!address && <Note>Connect and verify your wallet to post or remove its offers.</Note>}
        {offerHorse && <form onSubmit={(event) => void postOffer(event)}><p>Selected: <a href={objktTokenUrl(offerHorse.contract, offerHorse.tokenId)} target="_blank" rel="noopener noreferrer">{offerHorse.name || `Horse token #${offerHorse.tokenId}`}</a> · #{offerHorse.tokenId}</p><label htmlFor="horf-open-range-offer-amount">Editions to offer</label><input id="horf-open-range-offer-amount" data-horf-open-range-offer-amount inputMode="numeric" value={offerAmount} onChange={(event) => setOfferAmount(event.target.value)} disabled={busy} /><Actions><Action data-horf-open-range-offer-post type="submit" $primary disabled={!address || busy}>Post direct offer</Action><Action type="button" onClick={() => setOfferHorse(null)} disabled={busy}>Cancel</Action></Actions></form>}
        <h3>Your active signs</h3>{offersQuery.isPending && address && <p>Reading your offers…</p>}{offersQuery.isError && <Note $error role="alert">Your offer list is unavailable. Refresh to try again.</Note>}
        {myOffers.length ? <ul>{myOffers.map((offer) => <li key={offer.id} data-horf-open-range-my-offer><span><a href={objktTokenUrl(offer.tokenContract, offer.tokenId)} target="_blank" rel="noopener noreferrer">Horse token #{offer.tokenId}</a> · {offer.amount} editions · {shortAddress(offer.tokenContract)}</span><Action data-horf-open-range-offer-remove type="button" onClick={() => void removeOffer(offer)} disabled={busy}>Remove offer</Action></li>)}</ul> : address && !offersQuery.isPending && !offersQuery.isError && <p>No active offers from this wallet.</p>}
      </OfferPanel>
      {error && <Note $error role="alert">{error}</Note>}{success && <Note role="status">{success}</Note>}
    </Shell>
  </AppWindow>;
}
