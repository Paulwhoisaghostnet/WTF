import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { HorfFrame } from "../features/horf/HorfFrame";
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
  --range-canvas: var(--horf-canvas, #edf1ef);
  --range-ink: var(--horf-ink, #142526);
  --range-muted: var(--horf-muted, #50625e);
  --range-line: var(--horf-line, #d6ded8);
  --range-orange: var(--horf-coral, #e26a45);
  --range-teal: var(--horf-teal, #087e7a);
  min-height: 100%;
  min-width: 0;
  padding: 0 clamp(20px, 4vw, 64px) 72px;
  box-sizing: border-box;
  color: var(--range-ink);
  background: var(--range-canvas);
  font-family: var(--horf-font, "Avenir Next", sans-serif);
  container-type: inline-size;
  * { box-sizing: border-box; }
  a { color: inherit; }
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 3px solid var(--range-orange); outline-offset: 3px; }
  @container (max-width: 560px) { padding: 0 18px 52px; }
`;

const Masthead = styled.header`
  position: relative;
  padding: 20px 0 36px;
  .range-topline { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; padding-bottom: 20px; border-bottom: 1px solid var(--range-line); }
  .range-path { color: var(--range-muted); font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
  .range-path strong { color: var(--range-ink); }
  .range-hero { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(180px, .7fr); align-items: center; gap: 16px; min-height: 205px; padding: 25px 0 0; }
  .range-eyebrow { display: inline-flex; align-items: center; gap: 8px; color: var(--range-teal); font-size: 12px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
  .range-eyebrow::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--range-orange); }
  h1 { margin: 9px 0 12px; font-family: var(--horf-display, "Avenir Next", sans-serif); font-size: clamp(44px, 6cqw, 78px); line-height: .98; font-weight: 700; letter-spacing: -.035em; text-wrap: balance; }
  h1 span { display: inline-block; margin-left: 12px; font-size: .58em; vertical-align: 8%; transform: rotate(-10deg); }
  p { max-width: 65ch; margin: 0; color: var(--range-muted); font-size: 16px; line-height: 1.55; text-wrap: pretty; }
  .range-hero-art { position: relative; display: grid; place-items: center; align-self: stretch; min-height: 175px; margin: 0; border-radius: 18px; overflow: hidden; background: #1c2d2d; }
  .range-hero-art img { display: block; width: 100%; height: 100%; min-height: 175px; object-fit: cover; object-position: 50% 60%; }
  .range-hero-art figcaption { position: absolute; right: 8px; bottom: 8px; left: 8px; padding: 5px 7px; border-radius: 4px; background: #102b2bb8; color: #fff; font-size: 9px; font-weight: 700; line-height: 1.2; }
  @container (max-width: 640px) { .range-hero { grid-template-columns: 1fr 110px; min-height: 150px; } .range-hero-art { min-height: 120px; } .range-hero-art img { min-height: 120px; } .range-hero-art figcaption { display: none; } h1 { font-size: clamp(40px, 7cqw, 58px); } }
  @container (max-width: 460px) { .range-hero { grid-template-columns: 1fr; } .range-hero-art { display: none; } .range-topline { align-items: flex-start; } }
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
`;

const Action = styled.button<{ $primary?: boolean }>`
  min-height: 40px;
  padding: 8px 15px;
  border: 1px solid ${(p) => p.$primary ? "#d85734" : "#b7c9bf"};
  border-radius: 999px;
  background: ${(p) => p.$primary ? "#e5653f" : "transparent"};
  color: ${(p) => p.$primary ? "#fff" : "#16342c"};
  cursor: pointer;
  font: 800 13px/1.2 var(--horf-font, "Avenir Next", sans-serif);
  transition: transform .18s ease, background .18s ease, border-color .18s ease;
  &:hover:not(:disabled) { transform: translateY(-2px); background: ${(p) => p.$primary ? "#cf5130" : "#e6ede8"}; }
  @media (prefers-reduced-motion: reduce) { &:hover:not(:disabled) { transform: none; } }
  &:disabled { opacity: 0.55; cursor: not-allowed; }
`;

const Toolbar = styled.section`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  margin-top: 5px;
  padding: 18px 0;
  border-top: 1px solid var(--range-line);
  border-bottom: 1px solid var(--range-line);
  fieldset { margin: 0; padding: 0; border: 0; min-width: 0; background: transparent; color: var(--range-ink); }
  legend { margin-bottom: 10px; color: var(--range-muted); font-size: 12px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
  fieldset > div { display: flex; flex-wrap: wrap; gap: 7px; }
  label { display: inline-flex; align-items: center; gap: 7px; min-height: 38px; padding: 7px 13px; border: 1px solid var(--range-line); border-radius: 999px; background: transparent; color: var(--range-ink); font-size: 12px; font-weight: 800; cursor: pointer; transition: color .18s ease, background .18s ease; }
  label:has(input:checked) { border-color: var(--range-ink); background: var(--range-ink); color: #fff; }
  input[type="radio"] { width: 16px; min-width: 16px; height: 16px; min-height: 16px; margin: 0; accent-color: var(--range-orange); }
  small { display: block; margin-top: 11px; color: var(--range-muted); font-size: 12px; line-height: 1.4; }
  @container (max-width: 640px) { grid-template-columns: 1fr; }
`;

const Legend = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin: 16px 0 0;
  align-items: center;
  strong { margin-right: 5px; color: var(--range-muted); font-size: 12px; font-weight: 800; }
`;

const GalleryHeading = styled.div`
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 14px;
  flex-wrap: wrap;
  margin: 34px 0 6px;
  h2 { margin: 0; font-family: var(--horf-display, "Avenir Next", sans-serif); font-size: clamp(24px, 3cqw, 34px); font-weight: 700; letter-spacing: -.03em; }
  p { margin: 5px 0 0; color: var(--range-muted); font-size: 13px; line-height: 1.45; }
  small { color: var(--range-muted); font-size: 12px; }
`;

const StatusFrame = styled.span<{ $kind: "traded" | "offered" | "approved"; $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  min-height: 25px;
  padding: 3px 9px;
  border-radius: 999px;
  border: 1px solid ${(p) => !p.$active ? "#cbd8d0" : p.$kind === "traded" ? "#cc6146" : p.$kind === "offered" ? "#a66f22" : "#278d82"};
  background: ${(p) => !p.$active ? "transparent" : p.$kind === "traded" ? "#fce8e0" : p.$kind === "offered" ? "#fff1d6" : "#dff3ec"};
  color: ${(p) => !p.$active ? "#63746c" : p.$kind === "traded" ? "#8d3f2e" : p.$kind === "offered" ? "#765119" : "#155f56"};
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
`;

const Grid = styled.div`
  columns: 265px;
  column-gap: 26px;
  margin-top: 24px;
`;

const Card = styled.article<{ $traded: boolean; $offered: boolean; $approved: boolean }>`
  min-width: 0;
  display: inline-block;
  width: 100%;
  break-inside: avoid;
  margin-bottom: 32px;
  padding: 0;
  background: transparent;
  color: var(--range-ink);
  h2 { margin: 15px 0 4px; font-size: 19px; font-weight: 900; line-height: 1.2; overflow-wrap: anywhere; }
  h2 a { text-decoration: none; }
  h2 a:hover { text-decoration: underline; text-decoration-color: var(--range-orange); text-underline-offset: 3px; }
  p { margin: 7px 0; color: var(--range-muted); font-size: 13px; line-height: 1.45; }
  .horse-description { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  small { display: block; margin-top: 5px; color: var(--range-muted); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
  & > button[data-horf-open-range-view-horse] { box-shadow: 0 0 0 2px ${(p) => p.$traded ? "#e5653f" : "transparent"}, 0 0 0 4px ${(p) => p.$offered ? "#f0b65a" : "transparent"}, 0 0 0 6px ${(p) => p.$approved ? "#42a99b" : "transparent"}; }
  & > button:not([data-horf-open-range-view-horse]) { margin-top: 10px; padding-inline: 13px; min-height: 34px; }
`;

const Art = styled.img`
  display: block;
  width: 100%;
  height: auto;
  max-height: 420px;
  object-fit: contain;
  border-radius: 10px;
  background: #e0e9e3;
`;

const Glyph = styled.div`
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 10px;
  background: #dbe9df;
  img { display: block; width: 100%; height: 100%; object-fit: cover; }
`;

const CardFlags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0;
`;

const ArtButton = styled.button`
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: #dbe9df;
  cursor: zoom-in;
  overflow: hidden;
  &:hover img { transform: scale(1.035); }
  @media (prefers-reduced-motion: reduce) { &:hover img { transform: none; } }
  img { transition: transform 320ms cubic-bezier(.22, 1, .36, 1); }
  @media (prefers-reduced-motion: reduce) { img { transition: none; } }
`;

const HorseDetail = styled.dialog`
  width: min(1120px, calc(100vw - 28px));
  max-height: calc(100vh - 28px);
  padding: clamp(18px, 3vw, 30px);
  border: 0;
  border-radius: 16px;
  background: #f8faf7;
  color: #142622;
  box-shadow: 0 28px 70px #0c282b45;
  &::backdrop { background: #102a2cbc; backdrop-filter: blur(5px); }
  button:focus-visible, a:focus-visible { outline: 3px solid #e5653f; outline-offset: 3px; }
  .detail-head { display: flex; justify-content: space-between; align-items: start; gap: 12px; margin-bottom: 20px; }
  h2 { margin: 3px 0 0; font-family: var(--horf-display, "Avenir Next", sans-serif); font-size: clamp(26px, 4vw, 42px); line-height: 1.05; font-weight: 700; letter-spacing: -.03em; }
  .detail-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 28px; }
  .detail-grid > img, .detail-grid > .detail-glyph { display: block; width: 100%; max-height: 68vh; object-fit: contain; border-radius: 12px; background: #e0e9e3; }
  .detail-glyph { display: grid; place-items: center; min-height: 230px; }
  .detail-glyph img { display: block; width: 100%; max-height: 48vh; object-fit: cover; }
  p { margin: 0 0 12px; line-height: 1.5; }
  small { display: block; margin: 0 0 10px; color: #53665f; overflow-wrap: anywhere; }
  a { color: #155f56; }
  @media (max-width: 650px) { .detail-grid { grid-template-columns: 1fr; } .detail-grid > img, .detail-grid > .detail-glyph { max-height: 36vh; } }
`;

const Note = styled.div<{ $error?: boolean }>`
  margin: 16px 0;
  padding: 14px 18px;
  border-radius: 10px;
  border-left: 4px solid ${(p) => p.$error ? "#b24136" : "#167f78"};
  background: ${(p) => p.$error ? "#fce9e5" : "#e3f1eb"};
  color: #18352e;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
  overflow-wrap: anywhere;
`;

const EmptyRange = styled(Note)`
  min-height: 72px;
  padding-left: 76px;
  background: url('/horf-art/horseshoe.svg') 20px center / 40px 40px no-repeat, #e3f1eb;
`;

const OfferPanel = styled.section`
  margin-top: 42px;
  padding: clamp(22px, 4vw, 42px);
  border-radius: 16px;
  background: #12352e;
  color: #f3faf6;
  h2 { margin: 0 0 9px; font-family: var(--horf-display, "Avenir Next", sans-serif); font-size: clamp(25px, 3cqw, 36px); font-weight: 700; letter-spacing: -.03em; }
  h3 { margin: 30px 0 8px; font-size: 18px; }
  p { max-width: 74ch; margin: 0 0 13px; color: #d8eae1; font-size: 14px; line-height: 1.5; }
  a { color: #aee5d7; }
  form { max-width: 680px; margin: 23px 0; padding: 20px; border-radius: 12px; background: #1d493e; }
  label { display: block; margin: 10px 0 5px; font-size: 13px; font-weight: 800; }
  input { width: 100%; max-width: 250px; min-height: 42px; padding: 8px 11px; border: 1px solid #a9cbbb; border-radius: 8px; background: #f8faf7; color: #142622; font: inherit; }
  ul { list-style: none; padding: 0; margin: 10px 0 0; }
  li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; padding: 14px 0; border-top: 1px solid #456c5d; }
  li span { min-width: 0; overflow-wrap: anywhere; }
  fieldset { margin: 20px 0; padding: 14px; border: 1px solid #648778; border-radius: 10px; background: #1d493e; color: #f3faf6; }
  legend { padding: 0 5px; font-size: 13px; font-weight: 800; }
  fieldset label { display: flex; align-items: start; gap: 9px; margin: 9px 0; line-height: 1.4; cursor: pointer; }
  fieldset input { width: 18px; min-width: 18px; min-height: 18px; margin: 1px 0 0; accent-color: #e5653f; }
  ${Action} { border-color: #83ab99; color: #fff; }
  ${Action}[type="submit"] { border-color: #d85734; background: #e5653f; }
`;

const RangeAside = styled.div`
  color: #18352e;
  font-family: var(--horf-font, "Avenir Next", sans-serif);
  .aside-eyebrow { display: block; margin-bottom: 12px; color: #167f78; font-size: 11px; font-weight: 900; letter-spacing: .09em; text-transform: uppercase; }
  h3 { margin: 0 0 8px; font-size: 19px; line-height: 1.15; font-weight: 900; overflow-wrap: anywhere; }
  p { margin: 0 0 12px; color: #53665f; font-size: 12px; line-height: 1.5; }
  img { display: block; width: 100%; max-height: 160px; margin-bottom: 12px; border-radius: 9px; background: #dbe9df; object-fit: contain; }
  small { display: block; margin: 8px 0; color: #53665f; font-size: 11px; overflow-wrap: anywhere; }
  .aside-count { display: block; margin-bottom: 3px; color: #142622; font-size: 34px; line-height: 1; font-weight: 900; }
  .aside-rule { height: 1px; margin: 17px 0; background: #cbd8d0; }
  ${Legend} { display: grid; justify-items: start; gap: 7px; margin: 0; }
  ${Legend} strong { margin-bottom: 2px; }
  ${StatusFrame} { max-width: 100%; white-space: normal; }
  & > ${StatusFrame} { display: flex; width: fit-content; margin: 5px 0; }
  ${Action} { min-height: 34px; width: 100%; margin-top: 8px; padding: 7px 9px; font-size: 12px; }
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
  const [selectedHorse, setSelectedHorse] = useState<RangeHorse | null>(null);
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
    setSelectedHorse(horse);
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
    setSelectedHorse(null);
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

  const railHorse = selectedHorse ? horses.find((horse) => horse.contract === selectedHorse.contract && horse.tokenId === selectedHorse.tokenId) ?? selectedHorse : null;
  const selectedArt = railHorse ? horseArt(railHorse) : null;
  const sidebar = <RangeAside>
    {(walletError || error) && <Note $error role="alert">{walletError || error}</Note>}
    {success && <Note role="status">{success}</Note>}
    {railHorse ? <>
      <span className="aside-eyebrow">Horse in your sights 🐎</span>
      <img src={selectedArt?.src ?? "/horf-art/horse-gallop-photo.jpg"} alt="" onError={(event) => { if (!selectedArt || !advanceResolvedMediaFallback(event.currentTarget, selectedArt)) event.currentTarget.src = "/horf-art/horse-gallop-photo.jpg"; }} />
      <h3>{railHorse.name || `Horse token #${railHorse.tokenId}`}</h3>
      <p>{railHorse.mintedAt ? `Minted ${new Date(railHorse.mintedAt).toLocaleDateString()}` : "Mint date unknown"} · #{railHorse.tokenId}</p>
      <StatusFrame $kind="traded" $active={railHorse.tradedThroughHorf}>{railHorse.tradedThroughHorf ? "Traded through Horf" : "No Horf trade yet"}</StatusFrame>
      <StatusFrame $kind="offered" $active={railHorse.activelyForTradeOnHorf}>{railHorse.activelyForTradeOnHorf ? "For direct trade now" : "No active Horf offer"}</StatusFrame>
      <StatusFrame $kind="approved" $active={railHorse.approvedForMarshalsMarket}>{railHorse.approvedForMarshalsMarket ? "Marshal approved" : "Not Marshal approved"}</StatusFrame>
      <Action type="button" onClick={() => viewHorse(railHorse)}>View horse details</Action>
      <small><a href={objktTokenUrl(railHorse.contract, railHorse.tokenId)} target="_blank" rel="noopener noreferrer">View on Objkt ↗</a></small>
    </> : <>
      <span className="aside-eyebrow">Range report</span>
      <strong className="aside-count">{horses.length}</strong>
      <h3>{shownSeason?.label || "Horses on the range"}</h3>
      <p>Qualifying horses loaded. Select any artwork to inspect its details.</p>
      {rangeQuery.isPending && <p role="status">Rounding up horses…</p>}
      {rangeQuery.isError && <p role="alert">This range is unavailable. Refresh the gallery to try again.</p>}
      <div className="aside-rule" />
      <Legend data-horf-open-range-legend><strong>Color key</strong><StatusFrame $kind="traded" $active>Traded through Horf</StatusFrame><StatusFrame $kind="offered" $active>For direct trade now</StatusFrame><StatusFrame $kind="approved" $active>Marshal approved</StatusFrame></Legend>
      <div className="aside-rule" />
      <p>{address ? `${myOffers.length} ${myOffers.length === 1 ? "active sign" : "active signs"} from your wallet.` : "Connect your wallet to post a direct offer."} Direct offers are social signals, not escrow.</p>
    </>}
  </RangeAside>;

  return <HorfFrame title="Open Range" aside={sidebar}>
    <Shell data-horf-open-range>
      <Masthead>
        <div className="range-topline">
          <span className="range-path">Horf / <strong>Open Range</strong></span>
          <Actions><Action type="button" onClick={() => windowManager.openPage(`/horf?season=${encodeURIComponent(seasonKey)}`)}>← Back to Horf race and stables</Action>{!address && <Action data-horf-open-range-connect type="button" $primary onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : isGuest ? "Connect and verify wallet" : "Connect wallet"}</Action>}</Actions>
        </div>
        <div className="range-hero">
          <div><span className="range-eyebrow">Public horse art · Tezos Mainnet</span><h1>The Open Range<span aria-hidden="true">🐎</span></h1><p>Meet the horses minted across our trading seasons. Follow a favorite, check its papers, and see who is ready to ride.</p></div>
          <figure className="range-hero-art"><img src="/horf-art/horse-beach-photo.jpg" alt="Horses crossing a beach at sunset" /><figcaption>Yudi Susilo · CC0 horse photograph</figcaption></figure>
        </div>
      </Masthead>
      {walletError && <Note $error role="alert">{walletError}</Note>}
      <Toolbar data-horf-open-range-season><div><fieldset><legend>Range to search</legend><div>
        <label><input type="radio" name="horf-open-range-mode" data-horf-open-range-mode="all-seasons" checked={seasonKey === "all-seasons"} onChange={() => changeSeason("all-seasons")} />All known seasons</label>
        <label><input type="radio" name="horf-open-range-mode" data-horf-open-range-mode="all-horse-search" checked={seasonKey === "all-horse-search"} onChange={() => changeSeason("all-horse-search")} />All Horse Search</label>
        {!seasons.some((season) => season.key === seasonKey) && seasonKey !== "all-seasons" && seasonKey !== "all-horse-search" && <label><input type="radio" name="horf-open-range-mode" checked readOnly />{shownSeason?.label || seasonKey}</label>}
        {seasons.map((season) => <label key={season.key}><input type="radio" name="horf-open-range-mode" data-horf-open-range-mode={season.key} checked={seasonKey === season.key} onChange={() => changeSeason(season.key)} />{season.label}{season.inferred ? " · archive" : ""}</label>)}
      </div></fieldset><small>{seasonKey === "all-seasons" ? "All known campaign windows only; this does not cover every calendar year." : seasonKey === "all-horse-search" ? "All known qualifying horse keywords, regardless of mint date. Some mint dates may be unknown." : shownSeason?.startsAt ? `${new Date(shownSeason.startsAt).toLocaleDateString()} – ${shownSeason.endsAt ? new Date(shownSeason.endsAt).toLocaleDateString() : "ongoing"}${shownSeason.inferred ? " · Archive boundaries are inferred from Objkt clusters and organizer posts." : ""}` : "Loading campaign dates…"}</small></div><Action type="button" onClick={() => void rangeQuery.refetch()} disabled={rangeQuery.isFetching}>{rangeQuery.isFetching ? "Refreshing…" : "Refresh horses"}</Action></Toolbar>
      {rangeQuery.isPending && <Note role="status">Rounding up the season’s minted horses…</Note>}
      {rangeQuery.isError && <Note $error role="alert">{rangeQuery.error instanceof Error ? rangeQuery.error.message : "The Open Range is unavailable."} Refresh to try again.</Note>}
      <GalleryHeading><div><h2>{shownSeason?.label || "Horses on the range"}</h2><p>{horses.length} {horses.length === 1 ? "horse" : "horses"} in view. Colored outlines mark trade history, active offers, and Marshal approval.</p></div>{asOf && <small>Indexed {new Date(asOf).toLocaleString()}</small>}</GalleryHeading>
      <Grid data-horf-open-range-grid>{horses.map((horse) => {
        const art = horseArt(horse);
        return <Card key={`${horse.contract}:${horse.tokenId}`} data-horf-open-range-horse data-horf-frame-traded={horse.tradedThroughHorf} data-horf-frame-offered={horse.activelyForTradeOnHorf} data-horf-frame-approved={horse.approvedForMarshalsMarket} $traded={horse.tradedThroughHorf} $offered={horse.activelyForTradeOnHorf} $approved={horse.approvedForMarshalsMarket}>
          <ArtButton data-horf-open-range-view-horse type="button" onClick={() => viewHorse(horse)} aria-label={`View ${horse.name || `horse token #${horse.tokenId}`} details`}>
            {art ? <Art src={art.src} alt="" onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, art)) event.currentTarget.src = "/horf-art/horse-gallop-photo.jpg"; }} /> : <Glyph aria-hidden="true"><img src="/horf-art/horse-gallop-photo.jpg" alt="" /></Glyph>}
          </ArtButton>
          <h2><a href={objktTokenUrl(horse.contract, horse.tokenId)} target="_blank" rel="noopener noreferrer">{horse.name || `Horse token #${horse.tokenId}`}</a></h2>
          {horse.description && <p className="horse-description">{horse.description}</p>}
          <small>{horse.mintedAt ? `Minted ${new Date(horse.mintedAt).toLocaleDateString()}` : "Mint date unknown"} · {shortAddress(horse.contract)} / #{horse.tokenId}</small>
          {horse.creatorAddress && <small>Creator: <a href={`https://objkt.com/profile/${encodeURIComponent(horse.creatorAddress)}`} target="_blank" rel="noopener noreferrer">{shortAddress(horse.creatorAddress)}</a></small>}
          <CardFlags data-horf-open-range-flags><StatusFrame data-horf-open-range-status="traded" $kind="traded" $active={horse.tradedThroughHorf}>{horse.tradedThroughHorf ? "Traded through Horf" : "No Horf trade yet"}</StatusFrame><StatusFrame data-horf-open-range-status="offered" $kind="offered" $active={horse.activelyForTradeOnHorf}>{horse.activelyForTradeOnHorf ? "For direct trade now" : "No active Horf offer"}</StatusFrame><StatusFrame data-horf-open-range-status="approved" $kind="approved" $active={horse.approvedForMarshalsMarket}>{horse.approvedForMarshalsMarket ? "Marshal approved" : "Not Marshal approved"}</StatusFrame></CardFlags>
          {horse.offers.length > 0 && <p>{horse.offers.map((offer, index) => <span key={offer.id}>{index > 0 ? " · " : ""}<a href={`https://objkt.com/profile/${encodeURIComponent(offer.ownerAddress)}`} target="_blank" rel="noopener noreferrer">{shortAddress(offer.ownerAddress)}</a> offers {offer.amount} · {policyLabel(offer.acceptedTokenPolicy)}</span>)}. These are owner preferences, not escrow rules; contact them on Objkt before any direct wallet transfer.</p>}
          <Action type="button" onClick={() => { setSelectedHorse(horse); setOfferHorse(horse); setError(null); setSuccess(null); document.getElementById("horf-open-range-offer")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); }} disabled={!address}>Offer this horse from my wallet</Action>
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
            {horseArt(detailHorse) ? <img src={horseArt(detailHorse)!.src} alt={`${detailHorse.name || `Horse token #${detailHorse.tokenId}`} artwork`} onError={(event) => { const resolved = horseArt(detailHorse); if (!resolved || !advanceResolvedMediaFallback(event.currentTarget, resolved)) { event.currentTarget.src = "/horf-art/horse-gallop-photo.jpg"; event.currentTarget.alt = "Horse photograph placeholder"; } }} /> : <div className="detail-glyph" aria-hidden="true"><img src="/horf-art/horse-gallop-photo.jpg" alt="" /></div>}
            <div><p>{detailHorse.description || "This horse has no description from Objkt yet."}</p><CardFlags><StatusFrame $kind="traded" $active={detailHorse.tradedThroughHorf}>{detailHorse.tradedThroughHorf ? "Traded through Horf" : "No Horf trade yet"}</StatusFrame><StatusFrame $kind="offered" $active={detailHorse.activelyForTradeOnHorf}>{detailHorse.activelyForTradeOnHorf ? "For direct trade now" : "No active Horf offer"}</StatusFrame><StatusFrame $kind="approved" $active={detailHorse.approvedForMarshalsMarket}>{detailHorse.approvedForMarshalsMarket ? "Marshal approved" : "Not Marshal approved"}</StatusFrame></CardFlags><small>{detailHorse.mintedAt ? `Minted ${new Date(detailHorse.mintedAt).toLocaleDateString()}` : "Mint date unknown"} · {detailHorse.contract} / #{detailHorse.tokenId}</small>{detailHorse.creatorAddress && <small>Creator: <a href={`https://objkt.com/profile/${encodeURIComponent(detailHorse.creatorAddress)}`} target="_blank" rel="noopener noreferrer">{shortAddress(detailHorse.creatorAddress)}</a></small>}{detailHorse.offers.map((offer) => <p key={offer.id}>🤠 <a href={`https://objkt.com/profile/${encodeURIComponent(offer.ownerAddress)}`} target="_blank" rel="noopener noreferrer">{shortAddress(offer.ownerAddress)}</a> offers {offer.amount} · {policyLabel(offer.acceptedTokenPolicy)}</p>)}<p>Offers are owner preferences, not escrow protection. Confirm terms before any direct wallet transfer.</p><a href={objktTokenUrl(detailHorse.contract, detailHorse.tokenId)} target="_blank" rel="noopener noreferrer">View this horse on Objkt ↗</a></div>
          </div>
        </>}
      </HorseDetail>
    </Shell>
  </HorfFrame>;
}
