import { useEffect, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import styled from "styled-components";
import { api } from "../../lib/api";
import { advanceResolvedMediaFallback, resolveTokenThumbnail, type ResolvedThumbnail } from "../../lib/media-resolve";
import { logClientSystemEvent } from "../../lib/system-log";
import { resolveHorfHorseArt, resolveHorfHorseVideo } from "./horse-media";
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
import { HorfOwnedHorsePicker, type HorfOwnedHorse } from "./HorfOwnedHorsePicker";
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
type OwnedHorsePage = {
  address: string;
  items: HorfOwnedHorse[];
  pagination: { hasMore: boolean; nextOffset: number };
};
type Inspection = { status: "none" | "pending" | "approved" | "rejected" | "revoked"; reason: string | null };
type Pending = { action: "list" | "buy" | "cancel"; stage: "eligibility" | "preflight" | "preparing" | "wallet" | "confirming"; opHash: string | null };
type ListingReview = { address: string; tokenContract: string; tokenId: string; tokenName: string;
  quantity: string; ownedBalance: string; unitPriceHorseRaw: string; priceInput: string };

function parseSellToken(value: string | null): { contract: string; tokenId: string } | null {
  const match = value?.match(/^(KT1[1-9A-HJ-NP-Za-km-z]{33}):(\d+)$/);
  return match ? { contract: match[1], tokenId: match[2] } : null;
}

const Page = styled.section`
  width: min(100%, 1400px);
  margin: 0 auto;
  padding: clamp(16px, 2vw, 28px);
  color: var(--horf-ink);
  h2, h3, p { margin-top: 0; }
  button { cursor: pointer; }
  button:disabled { cursor: not-allowed; opacity: .55; }
`;
const Hero = styled.header`
  position: relative;
  min-height: 132px;
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(180px, .7fr);
  overflow: hidden;
  border-radius: 25px;
  background: var(--horf-surface, #1b2723);
  color: var(--horf-ink, #f4ead6);
  border: 1px solid var(--horf-line, #3d5148);
  box-shadow: 0 18px 45px #0000003d;
  .copy { position: relative; z-index: 1; align-self: center; padding: clamp(16px, 2.2vw, 25px); }
  .kicker { color: #ffc363; font-weight: 850; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
  h2 { max-width: 15ch; margin: 5px 0 6px; color: var(--horf-ink, #f4ead6); font: 700 clamp(30px, 3cqw, 44px)/1 var(--horf-display); letter-spacing: -.045em; }
  p { max-width: 62ch; margin: 0; color: var(--horf-muted, #b7b5a7); font-size: 13px; line-height: 1.45; }
  .photo { position: relative; display: block; width: 100%; min-height: 132px; padding: 0; border: 0; background: #24332d; overflow: hidden; }
  button.photo { cursor: zoom-in; }
  button.photo:focus-visible { outline: 3px solid var(--horf-teal); outline-offset: -4px; }
  .photo img { display: block; width: 100%; height: 132px; object-fit: contain; }
  .photo img.stock-photo { object-fit: cover; object-position: center 35%; }
  .photo-loading { display: grid; place-content: center; gap: 4px; color: var(--horf-muted); text-align: center; font-size: 11px; font-weight: 800; }
  .photo-loading span { color: var(--horf-teal); font-size: 30px; line-height: 1; }
  .seal { position: absolute; right: 10px; bottom: 10px; padding: 6px 9px; border: 1px solid #ffd187; border-radius: 999px; background: #132b2de8; color: #ffcf73; font: 850 10px/1.2 var(--horf-font); text-transform: uppercase; }
  @container (max-width: 660px) { grid-template-columns: minmax(0, 1fr) 125px; .photo { min-height: 132px; } .photo img { height: 132px; } .seal { right: 4px; bottom: 4px; padding: 4px 5px; font-size: 8px; } .copy p { display: none; } }
`;
const Toolbar = styled.div`
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
  margin: 18px 0 12px;
  h3 { margin: 0; font: 700 25px/1.1 var(--horf-display); }
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
  &[data-horf-horse-market-featured] { border-color: var(--horf-gold, #d8a34a); box-shadow: 0 0 0 3px #d8a34a55, 0 12px 36px #0005; }
  &:focus { outline: 3px solid var(--horf-teal, #71b7a0); outline-offset: 4px; }
  .art { position: relative; aspect-ratio: 1.15; overflow: hidden; background: #2b3d34; }
  .art-open { width: 100%; height: 100%; padding: 0; border: 0; background: transparent; cursor: zoom-in; }
  .art-open:focus-visible { outline: 3px solid var(--horf-teal, #71b7a0); outline-offset: -4px; }
  .art img, .art video { width: 100%; height: 100%; object-fit: contain; display: block; }
  .art .photo { object-fit: cover; }
  .tag { position: absolute; top: 10px; left: 10px; padding: 5px 8px; border-radius: 999px; background: #ffcf76; color: #382a17; font: 850 10px/1 var(--horf-font); text-transform: uppercase; pointer-events: none; }
  .expand { position: absolute; right: 10px; bottom: 10px; padding: 5px 8px; border-radius: 999px; background: #101816d9; color: var(--horf-ink, #f4ead6); font: 800 11px/1.2 var(--horf-font); pointer-events: none; opacity: 0; transition: opacity .16s ease; }
  .art:hover .expand, .art:focus-within .expand { opacity: 1; }
  @media (hover: none) { .expand { opacity: 1; } }
  .body { padding: 13px; }
  h4 { margin: 0 0 4px; font: 700 20px/1.15 var(--horf-display); overflow-wrap: anywhere; }
  p { margin: 0; color: var(--horf-muted); font-size: 12px; }
  .price { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 7px; margin: 12px 0; }
  .price strong { font: 750 24px/1 var(--horf-display); color: var(--horf-gold, #d8a34a); }
  .price span { color: var(--horf-muted); font-size: 11px; }
  .body > button { width: 100%; }
  .body > a:last-child { display: inline-block; margin-top: 9px; color: var(--horf-muted); font-size: 11px; text-decoration: none; }
  .body > a:last-child:hover { color: var(--horf-teal); text-decoration: underline; }
`;
const ArtDialog = styled.dialog`
  position: fixed; inset: 0; width: 100vw; height: 100dvh; max-width: none; max-height: none;
  margin: 0; padding: 0; overflow: hidden; border: 0; background: transparent; color: var(--horf-ink, #f4ead6);
  &::backdrop { background: #030806e8; }
  .backdrop { position: absolute; inset: 0; background: #030806ec; cursor: zoom-out; }
  .viewer { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 360px); width: min(1480px, calc(100% - 32px)); height: calc(100% - 32px); margin: 16px auto; overflow: hidden; border: 1px solid var(--horf-line, #3d5148); border-radius: 18px; background: var(--horf-surface, #1b2723); box-shadow: 0 24px 80px #000b; }
  .close-x { position: absolute; top: 14px; left: 14px; z-index: 2; display: grid; place-items: center; width: 44px; height: 44px; border: 1px solid var(--horf-line, #3d5148); border-radius: 50%; background: #101816e8; color: var(--horf-ink, #f4ead6); font-size: 26px; line-height: 1; cursor: pointer; }
  .close-x:focus-visible, .close-bottom:focus-visible { outline: 3px solid var(--horf-teal, #71b7a0); outline-offset: 3px; }
  .stage { display: grid; place-items: center; min-width: 0; min-height: 0; padding: clamp(18px, 3vw, 48px); background: var(--horf-canvas, #101816); }
  .stage img, .stage video { display: block; max-width: 100%; max-height: 100%; width: auto; height: auto; object-fit: contain; }
  .stage video { width: 100%; }
  .stage p { color: var(--horf-muted, #b7b5a7); }
  .info { display: flex; flex-direction: column; gap: 14px; min-width: 0; overflow: auto; padding: clamp(22px, 3vw, 36px); border-left: 1px solid var(--horf-line, #3d5148); }
  .info small { color: var(--horf-gold, #d8a34a); font-weight: 850; text-transform: uppercase; letter-spacing: .08em; }
  .info h3 { margin: 0; font: 700 clamp(26px, 3vw, 40px)/1.05 var(--horf-display); overflow-wrap: anywhere; }
  .info dl { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 8px 12px; margin: 0; font-size: 13px; }
  .info dt { color: var(--horf-muted, #b7b5a7); }
  .info dd { margin: 0; overflow-wrap: anywhere; }
  .info a, .close-bottom { color: var(--horf-teal, #71b7a0); font-weight: 800; }
  .close-bottom { align-self: flex-start; margin-top: auto; padding: 8px 0; border: 0; background: transparent; text-decoration: underline; cursor: pointer; }
  @media (max-width: 760px) { .viewer { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) auto; } .stage { padding: 48px 12px 12px; } .info { max-height: 34dvh; padding: 17px; border-left: 0; border-top: 1px solid var(--horf-line, #3d5148); } .info dl { grid-template-columns: 90px minmax(0, 1fr); } }
`;
const Panel = styled.aside`
  min-width: 0; padding: 21px; border: 1px solid var(--horf-line, #3d5148); border-radius: 18px;
  background: var(--horf-surface, #1b2723); box-shadow: 0 6px 22px #00000026;
  &:focus { outline: 3px solid var(--horf-teal, #71b7a0); outline-offset: 3px; }
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

function MarketVideoPreview({ video, poster }: { video: ResolvedThumbnail; poster: ResolvedThumbnail | null }) {
  const elementRef = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;
    if (typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !visible || failed) return;
    // The source is assigned after IntersectionObserver sees the card. In some
    // browsers that late assignment does not trigger the autoplay attribute.
    void element.play().catch(() => { /* Keep the poster if autoplay is blocked. */ });
  }, [visible, failed, video.src]);

  if (failed) return <img src={poster?.src ?? "/horf-art/horse-portrait-photo.jpg"} alt="" onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, poster)) event.currentTarget.src = "/horf-art/horse-portrait-photo.jpg"; }} />;
  return <video ref={elementRef} data-horf-horse-market-card-video src={visible ? video.src : undefined} poster={poster?.src} muted autoPlay loop playsInline preload={visible ? "metadata" : "none"} aria-hidden="true" onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, video)) setFailed(true); }} />;
}

function shortAddress(value: string) { return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value; }
function listingPreview(listing: HorfHorseMarketListing): { art: ResolvedThumbnail | null; hasGifPreview: boolean } {
  const token = listing.token;
  const isGif = token?.mime?.trim().toLowerCase().startsWith("image/gif") ?? false;
  const hasGifPreview = isGif || Boolean(token?.displayUri && /\.gif(?:[?#]|$)/i.test(token.displayUri));
  const art = isGif
    ? resolveHorfHorseArt({ ...(token ?? {}), image: token?.displayUri || token?.image })
    : hasGifPreview && token?.displayUri
      ? resolveTokenThumbnail({ thumbnail: token.displayUri })
      : token?.image || token?.displayUri ? resolveTokenThumbnail({ thumbnail: token.image || token.displayUri! }) : null;
  return { art, hasGifPreview };
}
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
  const search = useSearch();
  const params = new URLSearchParams(search);
  const listingFromUrl = params.get("listing")?.trim() || null;
  const sellFromUrl = params.get("sell")?.trim() || null;
  const sellToken = parseSellToken(sellFromUrl);
  const detailsRef = useRef<HTMLElement>(null);
  const sellFormRef = useRef<HTMLElement>(null);
  const linkedCardRef = useRef<HTMLElement>(null);
  const focusedListingRef = useRef<string | null>(null);
  const focusedSellRef = useRef<string | null>(null);
  const appliedSellRef = useRef<string | null>(null);
  const artDialogRef = useRef<HTMLDialogElement>(null);
  const artCloseRef = useRef<HTMLButtonElement>(null);
  const artTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [artListing, setArtListing] = useState<HorfHorseMarketListing | null>(null);
  const [artVideoFailed, setArtVideoFailed] = useState(false);
  const [artImageFailed, setArtImageFailed] = useState(false);
  const [featuredImageFailedKeys, setFeaturedImageFailedKeys] = useState<Set<string>>(() => new Set());
  const [selectedOwned, setSelectedOwned] = useState<HorfOwnedHorse | null>(null);
  const [quantity, setQuantity] = useState("0");
  const [price, setPrice] = useState("");
  const [review, setReview] = useState<ListingReview | null>(null);
  const [buyQuantity, setBuyQuantity] = useState("1");
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ text: string; opHash: string } | null>(null);

  const configQuery = useQuery({ queryKey: ["horf", "horse-market", "config"], queryFn: () => api.get<MarketSnapshot>("/api/horf/horse-market/config"), refetchOnWindowFocus: true });
  const listingQuery = useQuery({ queryKey: ["horf", "horse-market", "listings"], queryFn: () => api.get<MarketListings>("/api/horf/horse-market/listings"), refetchOnWindowFocus: true });
  const sellHorseQuery = useInfiniteQuery({
    queryKey: ["horf", "owned-qualifying-horses", address],
    queryFn: async ({ pageParam }) => {
      const page = await api.get<OwnedHorsePage>(`/api/horf/traders/${encodeURIComponent(address!)}/horses?offset=${pageParam}`);
      if (page.address !== address || !Array.isArray(page.items) || !page.pagination ||
          typeof page.pagination.hasMore !== "boolean" || !Number.isSafeInteger(page.pagination.nextOffset) ||
          page.pagination.nextOffset < 0 || (page.pagination.hasMore && page.pagination.nextOffset <= pageParam)) {
        throw new Error("Your horse list could not be read.");
      }
      return page;
    },
    initialPageParam: 0,
    getNextPageParam: (page) => page.pagination.hasMore ? page.pagination.nextOffset : undefined,
    enabled: Boolean(address && sellToken),
    refetchOnWindowFocus: true,
  });
  const linkedOwnedHorse = sellToken ? sellHorseQuery.data?.pages.flatMap((page) => page.items).find((horse) =>
    horse.contract === sellToken.contract && horse.tokenId === sellToken.tokenId && isPositive(horse.balance)) ?? null : null;
  const sellStatus = !sellToken ? null : !address ? "connect" : sellHorseQuery.isError ? "error"
    : linkedOwnedHorse ? linkedOwnedHorse.approvedForMarshalsMarket === true ? "ready" : "unapproved"
      : sellHorseQuery.isPending || sellHorseQuery.isFetching || sellHorseQuery.hasNextPage ? "loading" : "unavailable";
  const sellRequestKey = sellToken ? `${address ?? ""}:${sellToken.contract}:${sellToken.tokenId}` : null;
  const snapshot = configQuery.data;
  const configured = snapshot?.status === "ready" && snapshot.chainId === HORF_MARKET_CHAIN_ID && snapshot.network === "mainnet" &&
    Boolean(snapshot.contractAddress && snapshot.horseContractAddress);
  const contract: HorfHorseMarketContract | null = configured ? {
    contractAddress: snapshot!.contractAddress!, chainId: snapshot!.chainId, horseContractAddress: snapshot!.horseContractAddress!,
  } : null;
  const listings = (listingQuery.data?.listings ?? []).filter((item) => isPositive(item.remaining));
  const featuredListing = listings.find((item) => !featuredImageFailedKeys.has(item.id) && listingPreview(item).art) ?? null;
  const featuredImage = featuredListing ? listingPreview(featuredListing).art : null;
  const showFeaturedImage = Boolean(featuredListing && featuredImage);
  const linkedListing = listingFromUrl ? listings.find((item) => item.id === listingFromUrl) ?? null : null;
  const selected = listings.find((item) => item.id === selectedId) ?? (listingFromUrl ? linkedListing : listings[0] ?? null);
  const inspectionQuery = useQuery({
    queryKey: ["horf", "inspection-status", selectedOwned?.contract, selectedOwned?.tokenId],
    queryFn: () => api.get<Inspection>(`/api/horf/inspections/status?contract=${encodeURIComponent(selectedOwned!.contract)}&tokenId=${encodeURIComponent(selectedOwned!.tokenId)}`),
    enabled: Boolean(selectedOwned), refetchOnWindowFocus: true,
  });
  const reviewCurrent = Boolean(review && selectedOwned && address === review.address &&
    selectedOwned.contract === review.tokenContract && selectedOwned.tokenId === review.tokenId &&
    selectedOwned.balance === review.ownedBalance && quantity === review.quantity &&
    price.trim() === review.priceInput && inspectionQuery.data?.status === "approved");
  useEffect(() => { setSelectedOwned(null); setQuantity("0"); setReview(null); }, [address]);
  useEffect(() => { setSelectedId(null); }, [listingFromUrl]);
  useEffect(() => {
    if (!sellToken || !address || linkedOwnedHorse || !sellHorseQuery.hasNextPage || sellHorseQuery.isFetching) return;
    void sellHorseQuery.fetchNextPage();
  }, [sellToken?.contract, sellToken?.tokenId, address, linkedOwnedHorse, sellHorseQuery.hasNextPage, sellHorseQuery.isFetching, sellHorseQuery.dataUpdatedAt]);
  useEffect(() => {
    if (!sellRequestKey || sellStatus !== "ready" || !linkedOwnedHorse || appliedSellRef.current === sellRequestKey) return;
    appliedSellRef.current = sellRequestKey;
    setSelectedOwned({ ...linkedOwnedHorse, walletAddress: address! });
    setQuantity("0");
    setReview(null);
  }, [sellRequestKey, sellStatus, linkedOwnedHorse, address]);
  useEffect(() => {
    if (!sellRequestKey || !sellStatus || sellStatus === "loading") { if (!sellRequestKey) focusedSellRef.current = null; return; }
    const focusKey = `${sellRequestKey}:${sellStatus}`;
    if (focusedSellRef.current === focusKey) return;
    const frame = window.requestAnimationFrame(() => {
      const panel = sellFormRef.current;
      if (!panel) return;
      panel.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      panel.focus({ preventScroll: true });
      focusedSellRef.current = focusKey;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sellRequestKey, sellStatus]);
  useEffect(() => {
    if (!listingFromUrl) { focusedListingRef.current = null; return; }
    if (!linkedListing || focusedListingRef.current === listingFromUrl) return;
    const frame = window.requestAnimationFrame(() => {
      const card = linkedCardRef.current;
      if (!card) return;
      card.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      card.focus({ preventScroll: true });
      focusedListingRef.current = listingFromUrl;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [listingFromUrl, linkedListing]);
  useEffect(() => {
    const dialog = artDialogRef.current;
    if (!dialog) return;
    if (artListing && !dialog.open) {
      dialog.showModal();
      artCloseRef.current?.focus();
    } else if (!artListing && dialog.open) dialog.close();
  }, [artListing]);
  useEffect(() => {
    if (!artListing) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [artListing]);
  const busy = pending !== null;
  const artName = artListing?.token?.name || (artListing ? `Horse #${artListing.tokenId}` : "Horse artwork");
  const artVideo = artListing ? resolveHorfHorseVideo(artListing.token ?? {}) : null;
  const artImage = artListing ? resolveHorfHorseArt({ ...(artListing.token ?? {}), image: artListing.token?.image || artListing.token?.displayUri }) : null;

  function openArtwork(listing: HorfHorseMarketListing, trigger: HTMLButtonElement) {
    artTriggerRef.current = trigger;
    setArtVideoFailed(false);
    setArtImageFailed(false);
    setArtListing(listing);
    logClientSystemEvent({
      eventType: "horf.horse_market.artwork_opened",
      message: "HORF Market horse artwork opened",
      metadata: { listingId: listing.id, tokenContract: listing.tokenContract, tokenId: listing.tokenId },
    });
  }

  function inspectListing(listing: HorfHorseMarketListing) {
    setSelectedId(listing.id);
    setBuyQuantity("1");
    setError(null);
    logClientSystemEvent({
      eventType: "horf.horse_market.buying_options_opened",
      message: "HORF Market buying options opened",
      metadata: { listingId: listing.id, tokenContract: listing.tokenContract, tokenId: listing.tokenId },
    });
    window.requestAnimationFrame(() => {
      const panel = detailsRef.current;
      if (!panel) return;
      panel.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
      panel.focus({ preventScroll: true });
    });
  }

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
      setSelectedOwned(null); setQuantity("0"); setPrice(""); setReview(null);
      await Promise.all([listingQuery.refetch(), qc.invalidateQueries({ queryKey: ["horf", "owned-qualifying-horses", address] })]);
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
      <div className="copy"><span className="kicker">✦ Marshal-approved market</span><h2>Horse4HORSE</h2><p>Inspected horses. Full price to the seller.</p></div>
      {showFeaturedImage && featuredListing && featuredImage ? <button className="photo" data-horf-horse-market-featured-mint type="button" aria-label={`View larger artwork for ${featuredListing.token?.name || `Horse #${featuredListing.tokenId}`}`} onClick={(event) => openArtwork(featuredListing, event.currentTarget)}><img src={featuredImage.src} alt="" fetchPriority="high" decoding="async" onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, featuredImage)) setFeaturedImageFailedKeys((current) => new Set(current).add(featuredListing.id)); }} /><span className="seal">✦ Marshal approved</span></button> : listingQuery.isPending || (listingQuery.isError && !listings.length) ? <div className="photo photo-loading" role="status"><span aria-hidden="true">🐎</span>Rounding up listings…</div> : <div className="photo"><img className="stock-photo" src="/horf-art/horse-portrait-photo.jpg" alt="Horse photograph" /></div>}
    </Hero>
    {configQuery.isPending && <Notice role="status">Checking the HORSE Market contract…</Notice>}
    {configQuery.isError && <Notice $error role="alert">Market configuration is unavailable. Refresh before signing a transaction.</Notice>}
    {snapshot?.status === "unconfigured" && <Notice role="status">The HORSE Market is being prepared for Mainnet. Listings and purchases will open when its contract is deployed and verified.</Notice>}
    {snapshot?.status === "ready" && !configured && <Notice $error role="alert">Market configuration does not match Tezos Mainnet. Signing is paused.</Notice>}
    {pending && <Notice role="status" aria-live="polite">{pendingText(pending)} {pending.opHash && <a href={`https://tzkt.io/${encodeURIComponent(pending.opHash)}`} target="_blank" rel="noopener noreferrer">View submitted operation</a>}</Notice>}
    {error && <Notice $error role="alert">{error}</Notice>}
    {success && <Notice role="status">{success.text} <a href={`https://tzkt.io/${encodeURIComponent(success.opHash)}`} target="_blank" rel="noopener noreferrer">View operation</a></Notice>}

    <Toolbar><h3>Horses on the block 🐎</h3><Action type="button" onClick={() => { setFeaturedImageFailedKeys(new Set()); void Promise.all([listingQuery.refetch(), configQuery.refetch()]); }} disabled={listingQuery.isFetching || configQuery.isFetching}>↻ Refresh</Action></Toolbar>
    <Layout>
      <div>
        {listingQuery.isPending && <Notice role="status">Rounding up the live listings…</Notice>}
        {listingQuery.isError && <Notice $error role="alert">Listings could not be read. Refresh to try again.</Notice>}
        {!listingQuery.isPending && !listingQuery.isError && listingFromUrl && !linkedListing && <Notice role="status">Listing #{listingFromUrl} is no longer active. Browse the current horses below.</Notice>}
        {!listingQuery.isPending && !listingQuery.isError && listings.length === 0 && <Notice>No horses on the block yet. A Marshal-approved horse can be the first in the ring.</Notice>}
        <Grid>{listings.map((listing, index) => {
          const name = listing.token?.name || `Horse #${listing.tokenId}`;
          const video = listing.token ? resolveHorfHorseVideo(listing.token) : null;
          const { art, hasGifPreview } = listingPreview(listing);
          return <Card key={listing.id} ref={listing.id === listingFromUrl ? linkedCardRef : undefined} $selected={selected?.id === listing.id} data-horf-horse-market-listing data-horf-horse-market-listing-id={listing.id} data-horf-horse-market-featured={listing.id === listingFromUrl ? "" : undefined} tabIndex={-1}>
            <div className="art"><button className="art-open" type="button" data-horf-horse-market-art-trigger aria-haspopup="dialog" aria-label={`View larger artwork for ${name}`} onClick={(event) => openArtwork(listing, event.currentTarget)}>{video ? <MarketVideoPreview video={video} poster={art} /> : art ? <img data-horf-horse-market-card-gif={hasGifPreview ? "" : undefined} src={art.src} alt="" loading={index === 0 ? "eager" : "lazy"} decoding="async" fetchPriority={index === 0 ? "high" : "auto"} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, art)) { event.currentTarget.src = "/horf-art/horse-portrait-photo.jpg"; event.currentTarget.classList.add("photo"); } }} /> : <img className="photo" src="/horf-art/horse-portrait-photo.jpg" alt="" loading="lazy" decoding="async" />}</button><span className="tag">✦ Marshal approved</span><span className="expand" aria-hidden="true">⤢ View art</span></div>
            <div className="body"><h4>{name}</h4><p>{listing.remaining} {listing.remaining === "1" ? "edition" : "editions"} in escrow · Seller <a href={`/horf/traders/${listing.sellerAddress}`} title={`Seller ${listing.sellerAddress}`}>{shortAddress(listing.sellerAddress)}</a></p><div className="price"><div><span>Per edition</span><br /><strong>{formatHorseRaw(listing.unitPriceHorseRaw)}</strong> <span>HORSE</span></div></div><Action type="button" $strong={selected?.id === listing.id} onClick={() => inspectListing(listing)} aria-label={`View buying options for ${name}`}>View buying options →</Action><a href={objktTokenUrl(listing.tokenContract, listing.tokenId)} target="_blank" rel="noopener noreferrer" aria-label="View full artwork on Objkt">Objkt ↗</a></div>
          </Card>;
        })}</Grid>
      </div>
      <div>
        <Panel ref={detailsRef} tabIndex={-1} aria-label="Horse listing and payment choices" data-horf-horse-market-details>
          <h3>At the hitching post 🪢</h3>
          {configured && <p className="small"><a href={`https://tzkt.io/${contract!.contractAddress}`} target="_blank" rel="noopener noreferrer">HORSE Market contract ↗</a></p>}
          {!selected && <p>Select a horse from the corral to see its payment choices.</p>}
          {selected && <>
            <p><Stamp>✦ Inspected horse</Stamp></p>
            <p className="meta"><a href={objktTokenUrl(selected.tokenContract, selected.tokenId)} target="_blank" rel="noopener noreferrer">{selected.token?.name || `Horse token #${selected.tokenId}`}</a><br />Token #{selected.tokenId} · seller {shortAddress(selected.sellerAddress)}</p>
            {!address && <Notice>Connect a Tezos wallet to buy this horse with HORSE. <Action type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect wallet for HORSE"}</Action></Notice>}
            <label htmlFor="horf-market-buy-quantity">Editions to buy with HORSE</label>
            <input id="horf-market-buy-quantity" data-horf-horse-market-buy-quantity type="number" min="1" step="1" max={selected.remaining} value={buyQuantity} onChange={(event) => setBuyQuantity(event.target.value)} disabled={busy || !configured} />
            <p className="small">{formatHorseRaw(selected.unitPriceHorseRaw)} HORSE per edition. Your wallet signs the swap and pays XTZ gas.</p>
            {address === selected.sellerAddress ? <Action className="wide" type="button" onClick={() => void cancel(selected)} disabled={!configured || busy}>Cancel my listing</Action> : <Action className="wide" $strong type="button" onClick={() => void buy(selected)} disabled={!address || !configured || busy}>Buy with HORSE</Action>}
            <HorfObjktBuy key={`${selected.tokenContract}:${selected.tokenId}`} tokenContract={selected.tokenContract} tokenId={selected.tokenId} address={address} connectWallet={connectWallet} isConnecting={isConnecting} />
          </>}
        </Panel>
        <Panel ref={sellFormRef} tabIndex={-1} style={{ marginTop: 16 }} data-horf-horse-market-list-form>
          <h3>Hang a HORSE price 🤠</h3>
          <p>Marshal approval required. Signing deposits your editions into the Market.</p>
          {sellFromUrl && !sellToken && <Notice $error role="alert" data-horf-horse-market-sell-status>That horse link is invalid. Choose a horse from your wallet below.</Notice>}
          {sellStatus === "connect" && <Notice role="status" data-horf-horse-market-sell-status>Connect your wallet to find this horse and check its Marshal approval.</Notice>}
          {sellStatus === "loading" && <Notice role="status" data-horf-horse-market-sell-status>Finding this horse in your wallet…</Notice>}
          {sellStatus === "error" && <Notice $error role="alert" data-horf-horse-market-sell-status>Your horses could not be loaded. Retry from the horse picker below.</Notice>}
          {sellStatus === "unapproved" && <Notice role="status" data-horf-horse-market-sell-status>This horse is in your wallet but needs Marshal approval. <a href="/horf/stable">Request inspection from My Stable</a>.</Notice>}
          {sellStatus === "unavailable" && <Notice role="status" data-horf-horse-market-sell-status>This horse is not available in your connected wallet or does not pass Horf’s horse test. Choose another horse below.</Notice>}
          {sellStatus === "ready" && <Notice role="status" data-horf-horse-market-sell-status>{linkedOwnedHorse?.name || `Horse #${sellToken?.tokenId}`} is ready to list. Choose the edition quantity and HORSE price.</Notice>}
          {!address && <Action type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : "Connect to list"}</Action>}
          {address && <form onSubmit={reviewListing}>
            <HorfOwnedHorsePicker address={address} selected={selectedOwned} onSelect={(horse) => { setSelectedOwned(horse); setQuantity("0"); setReview(null); }} disabled={busy} id="horf-market-owned" label="Choose a Marshal-approved horse" selectDataAttr="data-horf-horse-market-owned" marshalApprovedOnly />
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
    <ArtDialog ref={artDialogRef} data-horf-horse-market-art-modal aria-modal="true" aria-labelledby="horf-market-art-title" onClose={() => { setArtListing(null); artTriggerRef.current?.focus(); }}>
      <div className="backdrop" data-horf-horse-market-art-backdrop onClick={() => setArtListing(null)} aria-hidden="true" />
      {artListing && <div className="viewer">
        <button ref={artCloseRef} className="close-x" type="button" onClick={() => setArtListing(null)} aria-label="Close horse artwork">×</button>
        <div className="stage">
          {artVideo && !artVideoFailed ? <video key={`${artListing.id}:video`} data-horf-horse-market-art-video src={artVideo.src} poster={artImage?.src} controls autoPlay muted playsInline preload="metadata" aria-label={`${artName} video artwork`} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, artVideo)) setArtVideoFailed(true); }} />
            : artImage && !artImageFailed ? <img key={`${artListing.id}:image`} data-horf-horse-market-art-image src={artImage.src} alt={`${artName} artwork`} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, artImage)) setArtImageFailed(true); }} />
              : <p>Token artwork is unavailable here. Open the exact token on Objkt.</p>}
        </div>
        <div className="info">
          <small>🐎 On the block</small>
          <h3 id="horf-market-art-title">{artName}</h3>
          <dl><dt>Token</dt><dd>{artListing.tokenContract} / #{artListing.tokenId}</dd><dt>Seller</dt><dd>{artListing.sellerAddress}</dd><dt>Available</dt><dd>{artListing.remaining} {artListing.remaining === "1" ? "edition" : "editions"}</dd><dt>HORSE price</dt><dd>{formatHorseRaw(artListing.unitPriceHorseRaw)} per edition</dd></dl>
          <a href={objktTokenUrl(artListing.tokenContract, artListing.tokenId)} target="_blank" rel="noopener noreferrer">Open this token on Objkt ↗</a>
          <button className="close-bottom" type="button" onClick={() => setArtListing(null)}>Close this popup</button>
        </div>
      </div>}
    </ArtDialog>
  </Page>;
}
