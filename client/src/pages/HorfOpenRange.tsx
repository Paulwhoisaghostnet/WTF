import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import styled from "styled-components";
import { HorfFrame } from "../features/horf/HorfFrame";
import { HorfObjktBuy } from "../features/horf/HorfObjktBuy";
import { HorfOwnedHorsePicker, type HorfOwnedHorse } from "../features/horf/HorfOwnedHorsePicker";
import { useHorfListedHorsePaths } from "../features/horf/useHorfListedHorsePaths";
import { useHorfWallet } from "../features/horf/useHorfWallet";
import { objktTokenUrl } from "../features/horf/token-input";
import { resolveHorfHorseArt, resolveHorfHorseCardArt, resolveHorfHorseVideo, uniqueHorfThumbnailIdentities } from "../features/horf/horse-media";
import { approveHorseDirectly } from "../features/horf/marshal-approval";
import { api, fetchWithCsrf } from "../lib/api";
import { advanceResolvedMediaFallback } from "../lib/media-resolve";
import { logClientSystemEvent } from "../lib/system-log";
import { useWindowManager } from "../lib/window-context";
import { toNatString } from "../lib/tezos/nat";
import { useAuth } from "../lib/auth-context";

type Season = { key: string; label: string; startsAt: string | null; endsAt: string | null; inferred?: boolean };
type AcceptedTokenPolicy = "marshal_only" | "any_qualifying";
type RangeOffer = { id: number; ownerAddress: string; tokenContract: string; tokenId: string; amount: string; acceptedTokenPolicy: AcceptedTokenPolicy; createdAt: string };
type RangeHorse = {
  contract: string;
  tokenId: string;
  name: string;
  description: string | null;
  image: string | null;
  artifactUri?: string | null;
  mime?: string | null;
  mintedAt: string | null;
  creatorAddress: string | null;
  tradedThroughHorf: boolean;
  activelyForTradeOnHorf: boolean;
  approvedForMarshalsMarket: boolean;
  inspectionStatus?: "none" | "pending" | "approved" | "rejected" | "reviewed";
  viewerBalance?: string | null;
  offers: Array<{ id: number; ownerAddress: string; ownerName?: string | null; amount: string; acceptedTokenPolicy: AcceptedTokenPolicy }>;
};
type RangePage = { season: Season; items: RangeHorse[]; nextCursor: string | null; hasMore: boolean; asOf: string | null; holderStatus?: "ready" | "stale" };

const CURRENT_SEASON = "current-2026";

function initialSeason(): string {
  if (typeof window === "undefined") return CURRENT_SEASON;
  const season = new URLSearchParams(window.location.search).get("season")?.trim();
  return season === "all-time" ? "all-horse-search" : season || CURRENT_SEASON;
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
        typeof item.approvedForMarshalsMarket !== "boolean" ||
        (item.viewerBalance !== undefined && item.viewerBalance !== null && typeof item.viewerBalance !== "string") ||
        !Array.isArray(item.offers)) ||
      typeof page.hasMore !== "boolean" ||
      (page.nextCursor !== null && typeof page.nextCursor !== "string") ||
      (page.holderStatus !== undefined && page.holderStatus !== "ready" && page.holderStatus !== "stale") ||
      (page.hasMore && !page.nextCursor)) {
    throw new Error("The Open Range returned an invalid horse page. Refresh to try again.");
  }
  return page as RangePage;
}

const Shell = styled.div`
  --range-canvas: var(--horf-canvas, #101816);
  --range-ink: var(--horf-ink, #f4ead6);
  --range-muted: var(--horf-muted, #b7b5a7);
  --range-line: var(--horf-line, #3d5148);
  --range-orange: var(--horf-coral, #ef9672);
  --range-teal: var(--horf-teal, #71b7a0);
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
  button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 3px solid var(--horf-focus); outline-offset: 3px; }
  @container (max-width: 560px) { padding: 0 18px 52px; }
`;

const Masthead = styled.header`
  position: relative;
  padding: 14px 0 20px;
  .range-topline { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; padding-bottom: 14px; border-bottom: 1px solid var(--range-line); }
  .range-path { color: var(--range-muted); font-size: 12px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; }
  .range-path strong { color: var(--range-ink); }
  .range-hero { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(180px, .7fr); align-items: center; gap: 16px; min-height: 140px; padding: 12px 0 0; }
  .range-eyebrow { display: inline-flex; align-items: center; gap: 8px; color: var(--range-teal); font-size: 12px; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; }
  .range-eyebrow::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--range-orange); }
  h1 { margin: 9px 0 0; font-family: var(--horf-display, "Avenir Next", sans-serif); font-size: clamp(44px, 6cqw, 70px); line-height: .98; font-weight: 700; letter-spacing: -.035em; text-wrap: balance; }
  h1 span { display: inline-block; margin-left: 12px; font-size: .58em; vertical-align: 8%; transform: rotate(-10deg); }
  p { max-width: 65ch; margin: 0; color: var(--range-muted); font-size: 16px; line-height: 1.55; text-wrap: pretty; }
  .range-hero-art { position: relative; display: grid; place-items: center; align-self: stretch; min-height: 128px; margin: 0; border-radius: 18px; overflow: hidden; background: #1c2d2d; }
  .range-hero-art button { display: block; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; cursor: zoom-in; }
  .range-hero-art button:focus-visible { outline: 3px solid var(--horf-focus); outline-offset: -3px; }
  .range-hero-art img { display: block; width: 100%; height: 100%; min-height: 128px; object-fit: contain; }
  .range-hero-art img.range-stock-photo { object-fit: cover; object-position: 50% 60%; }
  .range-hero-loading { display: grid; place-content: center; gap: 4px; width: 100%; min-height: 128px; color: var(--range-muted); text-align: center; font-size: 11px; font-weight: 800; }
  .range-hero-loading span { color: var(--range-teal); font-size: 30px; line-height: 1; }
  .range-hero-art figcaption { position: absolute; right: 8px; bottom: 8px; left: 8px; padding: 5px 7px; border-radius: 4px; background: #102b2bb8; color: #fff; font-size: 9px; font-weight: 700; line-height: 1.2; }
  @container (max-width: 640px) { .range-hero { grid-template-columns: minmax(0, 1fr) 110px; min-height: 120px; } .range-hero-art { min-height: 112px; } .range-hero-art img { min-height: 112px; } .range-hero-art figcaption { display: none; } h1 { font-size: clamp(36px, 7cqw, 58px); } }
  @container (max-width: 460px) { .range-hero { grid-template-columns: minmax(0, 1fr) 92px; } .range-topline { align-items: flex-start; } }
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
  border: 1px solid ${(p) => p.$primary ? "var(--horf-gold)" : "var(--range-line)"};
  border-radius: 999px;
  background: ${(p) => p.$primary ? "var(--horf-gold)" : "var(--horf-surface)"};
  color: ${(p) => p.$primary ? "var(--horf-deep)" : "var(--range-ink)"};
  cursor: pointer;
  font: 800 13px/1.2 var(--horf-font, "Avenir Next", sans-serif);
  transition: transform .18s ease, background .18s ease, border-color .18s ease;
  &:hover:not(:disabled) { transform: translateY(-2px); background: ${(p) => p.$primary ? "#e8b65d" : "var(--horf-elevated)"}; }
  @media (prefers-reduced-motion: reduce) { &:hover:not(:disabled) { transform: none; } }
  &:disabled { opacity: 0.55; cursor: not-allowed; }
`;

const Toolbar = styled.section`
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-top: 5px;
  padding: 12px 0;
  border-top: 1px solid var(--range-line);
  border-bottom: 1px solid var(--range-line);
  details { position: relative; min-width: min(100%, 270px); }
  summary { display: flex; justify-content: space-between; align-items: center; gap: 10px; min-height: 40px; padding: 8px 13px; border: 1px solid var(--range-line); border-radius: 10px; background: var(--horf-surface); color: var(--range-ink); font-size: 13px; font-weight: 800; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: '⌄'; color: var(--range-teal); font-size: 18px; line-height: 1; }
  details[open] summary::after { transform: rotate(180deg); }
  summary:focus-visible { outline: 3px solid var(--horf-focus); outline-offset: 3px; }
  .range-filter-options { position: absolute; z-index: 5; top: calc(100% + 6px); left: 0; width: min(640px, calc(100vw - 45px)); max-height: min(65vh, 420px); overflow: auto; padding: 14px; border: 1px solid var(--range-line); border-radius: 13px; background: var(--horf-surface); box-shadow: 0 20px 42px #0009; }
  fieldset { margin: 0; padding: 0; border: 0; min-width: 0; background: transparent; color: var(--range-ink); }
  legend { margin-bottom: 10px; color: var(--range-muted); font-size: 12px; font-weight: 800; letter-spacing: .07em; text-transform: uppercase; }
  fieldset > div { display: flex; flex-wrap: wrap; gap: 7px; }
  label { display: inline-flex; align-items: center; gap: 7px; min-height: 38px; padding: 7px 13px; border: 1px solid var(--range-line); border-radius: 999px; background: transparent; color: var(--range-ink); font-size: 12px; font-weight: 800; cursor: pointer; transition: color .18s ease, background .18s ease; }
  label:has(input:checked) { border-color: var(--horf-gold); background: var(--horf-elevated); color: var(--horf-ink); }
  input[type="radio"] { width: 16px; min-width: 16px; height: 16px; min-height: 16px; margin: 0; accent-color: var(--range-orange); }
  small { display: block; margin-top: 5px; color: var(--range-muted); font-size: 11px; line-height: 1.3; }
  @container (max-width: 640px) { details { flex: 1; } }
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
  margin: 14px 0 6px;
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
  border: 1px solid ${(p) => !p.$active ? "var(--range-line)" : p.$kind === "traded" ? "#b97665" : p.$kind === "offered" ? "#b38b4f" : "#5aab95"};
  background: ${(p) => !p.$active ? "var(--horf-surface)" : p.$kind === "traded" ? "#392c28" : p.$kind === "offered" ? "#3b3325" : "#1e3a33"};
  color: ${(p) => !p.$active ? "var(--range-muted)" : p.$kind === "traded" ? "#f0b3a0" : p.$kind === "offered" ? "#ebcf90" : "#a6dfce"};
  font-size: 11px;
  font-weight: 800;
  line-height: 1.2;
`;

const AvailabilityBadge = styled(StatusFrame).attrs({ as: "button", type: "button" })`
  cursor: pointer;
  &:hover { filter: brightness(1.2); }
  &:focus-visible { outline: 2px solid #ebcf90; outline-offset: 2px; }
`;

const Grid = styled.div`
  columns: 265px;
  column-gap: 26px;
  margin-top: 12px;
`;

const Card = styled.article`
  min-width: 0;
  display: inline-block;
  width: 100%;
  break-inside: avoid;
  margin-bottom: 24px;
  padding: 0;
  background: transparent;
  color: var(--range-ink);
  h2 { margin: 15px 0 4px; font-size: 19px; font-weight: 900; line-height: 1.2; overflow-wrap: anywhere; }
  h2 a { text-decoration: none; }
  h2 a:hover { text-decoration: underline; text-decoration-color: var(--range-orange); text-underline-offset: 3px; }
  p { margin: 7px 0; color: var(--range-muted); font-size: 13px; line-height: 1.45; }
  .horse-description { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
  .horse-meta { display: flex; flex-wrap: wrap; gap: 3px 12px; align-items: center; margin-top: 7px; color: var(--range-muted); font-size: 12px; }
  .horse-meta a { color: var(--range-teal); text-decoration: none; }
  .horse-meta a:hover { text-decoration: underline; }
  small { display: block; margin-top: 5px; color: var(--range-muted); font-size: 12px; line-height: 1.4; overflow-wrap: anywhere; }
  & > button:not([data-horf-open-range-view-horse]) { margin-top: 10px; padding-inline: 13px; min-height: 34px; }
  & > button[data-horf-open-range-not-horse] { display: block; min-height: 36px; padding: 7px 0; border: 0; background: transparent; color: var(--range-muted); font-size: 11px; text-align: left; }
  & > button[data-horf-open-range-not-horse]:hover:not(:disabled) { color: var(--range-ink); text-decoration: underline; transform: none; }
`;

const Art = styled.img`
  display: block;
  width: 100%;
  height: auto;
  max-height: 420px;
  object-fit: contain;
  border-radius: 10px;
  background: var(--horf-field);
`;

const Glyph = styled.div`
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 10px;
  background: var(--horf-field);
  img { display: block; width: 100%; height: 100%; object-fit: cover; }
`;

const CardFlags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 0;
`;

const ArtButton = styled.button`
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: var(--horf-field);
  box-shadow: none;
  cursor: zoom-in;
  overflow: hidden;
  &:hover img { transform: scale(1.035); }
  @media (prefers-reduced-motion: reduce) { &:hover img { transform: none; } }
  img { transition: transform 320ms cubic-bezier(.22, 1, .36, 1); }
  .video-cue { position: absolute; right: 9px; bottom: 9px; padding: 5px 8px; border-radius: 999px; background: #101816db; color: #f4ead6; font-size: 11px; font-weight: 800; }
  @media (prefers-reduced-motion: reduce) { img { transition: none; } }
`;

const HorseDetail = styled.dialog`
  width: min(1120px, calc(100vw - 28px));
  max-height: calc(100vh - 28px);
  padding: clamp(18px, 3vw, 30px);
  border: 0;
  border-radius: 16px;
  background: var(--horf-surface);
  color: var(--horf-ink);
  box-shadow: 0 28px 70px #0c282b45;
  &::backdrop { background: #102a2cbc; backdrop-filter: blur(5px); }
  button:focus-visible, a:focus-visible { outline: 3px solid var(--horf-focus); outline-offset: 3px; }
  .detail-head { display: flex; justify-content: space-between; align-items: start; gap: 12px; margin-bottom: 20px; }
  h2 { margin: 3px 0 0; font-family: var(--horf-display, "Avenir Next", sans-serif); font-size: clamp(26px, 4vw, 42px); line-height: 1.05; font-weight: 700; letter-spacing: -.03em; }
  .detail-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 28px; }
  .detail-grid > img, .detail-grid > video, .detail-grid > .detail-glyph { display: block; width: 100%; max-height: 68vh; object-fit: contain; border-radius: 12px; background: var(--horf-field); }
  .detail-glyph { display: grid; place-items: center; min-height: 230px; }
  .detail-glyph img { display: block; width: 100%; max-height: 48vh; object-fit: cover; }
  p { margin: 0 0 12px; line-height: 1.5; }
  small { display: block; margin: 0 0 10px; color: var(--horf-muted); overflow-wrap: anywhere; }
  a { color: var(--horf-teal); }
  @media (max-width: 650px) { .detail-grid { grid-template-columns: 1fr; } .detail-grid > img, .detail-grid > video, .detail-grid > .detail-glyph { max-height: 36vh; } }
`;

const OwnedMarker = styled.span`
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  margin-top: 10px;
  padding: 4px 11px;
  border: 1px solid #5aab95;
  border-radius: 999px;
  background: #1e3a33;
  color: #a6dfce;
  font-size: 12px;
  font-weight: 800;
`;

const Note = styled.div<{ $error?: boolean }>`
  margin: 16px 0;
  padding: 14px 18px;
  border-radius: 10px;
  border-left: 4px solid ${(p) => p.$error ? "var(--horf-coral)" : "var(--horf-teal)"};
  background: ${(p) => p.$error ? "#352822" : "#1c352d"};
  color: var(--horf-ink);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.5;
  overflow-wrap: anywhere;
`;

const EmptyRange = styled(Note)`
  min-height: 72px;
  padding-left: 76px;
  background: url('/horf-art/horseshoe.svg') 20px center / 40px 40px no-repeat, #1c352d;
`;

const OfferPanel = styled.section`
  margin-top: 42px;
  padding: clamp(22px, 4vw, 42px);
  border-radius: 16px;
  border: 1px solid var(--horf-line);
  background: var(--horf-surface);
  color: var(--horf-ink);
  h2 { margin: 0 0 9px; font-family: var(--horf-display, "Avenir Next", sans-serif); font-size: clamp(25px, 3cqw, 36px); font-weight: 700; letter-spacing: -.03em; }
  h3 { margin: 30px 0 8px; font-size: 18px; }
  p { max-width: 74ch; margin: 0 0 13px; color: var(--horf-muted); font-size: 14px; line-height: 1.5; }
  a { color: var(--horf-teal); }
  form { max-width: 680px; margin: 23px 0; padding: 20px; border-radius: 12px; background: var(--horf-elevated); }
  label { display: block; margin: 10px 0 5px; font-size: 13px; font-weight: 800; }
  input { width: 100%; max-width: 250px; min-height: 42px; padding: 8px 11px; border: 1px solid var(--horf-line); border-radius: 8px; background: var(--horf-field); color: var(--horf-ink); font: inherit; }
  ul { list-style: none; padding: 0; margin: 10px 0 0; }
  li { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px; padding: 14px 0; border-top: 1px solid var(--horf-line); }
  li span { min-width: 0; overflow-wrap: anywhere; }
  fieldset { margin: 20px 0; padding: 14px; border: 1px solid var(--horf-line); border-radius: 10px; background: var(--horf-elevated); color: var(--horf-ink); }
  legend { padding: 0 5px; font-size: 13px; font-weight: 800; }
  fieldset label { display: flex; align-items: start; gap: 9px; margin: 9px 0; line-height: 1.4; cursor: pointer; }
  fieldset input { width: 18px; min-width: 18px; min-height: 18px; margin: 1px 0 0; accent-color: var(--horf-gold); }
  ${Action} { border-color: var(--horf-line); color: var(--horf-ink); }
  ${Action}[type="submit"] { border-color: var(--horf-gold); background: var(--horf-gold); color: var(--horf-deep); }
`;

const RangeAside = styled.div`
  color: var(--horf-ink);
  font-family: var(--horf-font, "Avenir Next", sans-serif);
  .aside-eyebrow { display: block; margin-bottom: 12px; color: var(--horf-teal); font-size: 11px; font-weight: 900; letter-spacing: .09em; text-transform: uppercase; }
  h3 { margin: 0 0 8px; font-size: 19px; line-height: 1.15; font-weight: 900; overflow-wrap: anywhere; }
  p { margin: 0 0 12px; color: var(--horf-muted); font-size: 12px; line-height: 1.5; }
  img, video { display: block; width: 100%; max-height: 160px; margin-bottom: 12px; border-radius: 9px; background: var(--horf-field); object-fit: contain; }
  small { display: block; margin: 8px 0; color: var(--horf-muted); font-size: 11px; overflow-wrap: anywhere; }
  .aside-count { display: block; margin-bottom: 3px; color: var(--horf-ink); font-size: 34px; line-height: 1; font-weight: 900; }
  .aside-rule { height: 1px; margin: 17px 0; background: var(--horf-line); }
  ${Legend} { display: grid; justify-items: start; gap: 7px; margin: 0; }
  ${Legend} strong { margin-bottom: 2px; }
  ${StatusFrame} { max-width: 100%; white-space: normal; }
  & > ${StatusFrame} { display: flex; width: fit-content; margin: 5px 0; }
  ${Action} { min-height: 34px; width: 100%; margin-top: 8px; padding: 7px 9px; font-size: 12px; }
`;

function shortAddress(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function ownsHorse(balance: string | null | undefined): boolean {
  try { return balance != null && BigInt(balance) > 0n; } catch { return false; }
}

function horseArt(value: RangeHorse) {
  return resolveHorfHorseArt(value);
}

function policyLabel(policy: AcceptedTokenPolicy | undefined): string {
  return policy === "marshal_only" ? "Wants Marshal-approved horses" : "Welcomes any qualifying horse";
}

export function HorfOpenRange() {
  const { address, isGuest, connectWallet, isConnecting, walletError } = useHorfWallet();
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const windowManager = useWindowManager();
  const viewed = useRef(new Set<string>());
  const [seasonKey, setSeasonKey] = useState(initialSeason);
  const listedHorsePaths = useHorfListedHorsePaths(seasonKey, isAdmin);
  const [offerHorse, setOfferHorse] = useState<RangeHorse | null>(null);
  const [offerWalletAddress, setOfferWalletAddress] = useState<string | null>(null);
  const [detailHorse, setDetailHorse] = useState<RangeHorse | null>(null);
  const [selectedHorse, setSelectedHorse] = useState<RangeHorse | null>(null);
  const detailRef = useRef<HTMLDialogElement>(null);
  const [offerAmount, setOfferAmount] = useState("1");
  const [acceptedTokenPolicy, setAcceptedTokenPolicy] = useState<AcceptedTokenPolicy>("any_qualifying");
  const [busy, setBusy] = useState(false);
  const [reportBusyKey, setReportBusyKey] = useState<string | null>(null);
  const [reportedKeys, setReportedKeys] = useState<Set<string>>(() => new Set());
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());
  const [featuredArtFailedKeys, setFeaturedArtFailedKeys] = useState<Set<string>>(() => new Set());
  const filterRef = useRef<HTMLDetailsElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const refreshHorseCache = useRef(false);

  const marshalStatusQuery = useQuery({
    queryKey: ["horf", "inspector-status", isGuest],
    queryFn: () => api.get<{ active: boolean; role: "horf_marshal" | "admin" | null }>("/api/horf/inspectors/status"),
    refetchOnWindowFocus: true,
  });

  const seasonsQuery = useQuery({
    queryKey: ["horf", "open-range-seasons"],
    queryFn: () => api.get<{ season: Season; seasons: Season[] }>(`/api/horf/season?season=${CURRENT_SEASON}`),
  });
  const seasons = Array.isArray(seasonsQuery.data?.seasons) ? seasonsQuery.data.seasons : [];
  const rangeQuery = useInfiniteQuery({
    queryKey: ["horf", "open-range", seasonKey, address],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ season: seasonKey });
      if (pageParam) params.set("cursor", pageParam);
      if (address) params.set("viewer", address);
      if (refreshHorseCache.current) params.set("refresh", "1");
      return api.get<unknown>(`/api/horf/open-range?${params}`).then(parsePage);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.hasMore ? page.nextCursor ?? undefined : undefined,
    refetchOnWindowFocus: true,
  });
  const pages = rangeQuery.data?.pages ?? [];
  const horses = useMemo(() => pages.flatMap((page) => page.items).filter((horse) =>
    !hiddenKeys.has(`${horse.contract}/${horse.tokenId}`)), [pages, hiddenKeys]);
  const uniqueThumbnails = useMemo(() => uniqueHorfThumbnailIdentities(horses), [horses]);
  const featuredHorse = horses.find((horse) => !featuredArtFailedKeys.has(`${horse.contract}/${horse.tokenId}`) && resolveHorfHorseCardArt(horse, uniqueThumbnails)) ?? null;
  const featuredArt = featuredHorse ? resolveHorfHorseCardArt(featuredHorse, uniqueThumbnails) : null;
  const featuredKey = featuredHorse ? `${featuredHorse.contract}/${featuredHorse.tokenId}` : null;
  const showFeaturedMint = Boolean(featuredArt);
  const selectedOfferOwned = Boolean(address && offerWalletAddress === address && offerHorse && ownsHorse(offerHorse.viewerBalance));
  const shownSeason = pages[0]?.season ?? seasonsQuery.data?.season;
  const asOf = pages[0]?.asOf ?? null;
  const holderStatusStale = pages.some((page) => page.holderStatus === "stale");
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
    setFeaturedArtFailedKeys(new Set());
    writeSeason(key);
    filterRef.current?.removeAttribute("open");
  }

  function availabilityUrl(offerId?: number) {
    const params = new URLSearchParams({ season: seasonKey, market: "outlaw", outlaw: "available" });
    if (offerId != null) params.set("offer", String(offerId));
    return `/horf/horse-market?${params}`;
  }

  function horseAvailabilityUrl(horse: RangeHorse) {
    return availabilityUrl(horse.offers.length === 1 ? horse.offers[0]!.id : undefined);
  }

  function chooseOwnedOfferHorse(horse: HorfOwnedHorse | null) {
    if (!horse) { setOfferHorse(null); setOfferWalletAddress(null); return; }
    const onRange = horses.find((item) => item.contract === horse.contract && item.tokenId === horse.tokenId);
    setOfferHorse(onRange ? { ...onRange, viewerBalance: horse.balance } : {
      contract: horse.contract, tokenId: horse.tokenId, name: horse.name || `Token #${horse.tokenId}`,
      description: horse.description ?? null, image: horse.image, artifactUri: horse.artifactUri,
      mime: horse.mime, mintedAt: horse.mintedAt ?? null, creatorAddress: horse.creatorAddress ?? null,
      tradedThroughHorf: false, activelyForTradeOnHorf: false,
      approvedForMarshalsMarket: horse.approvedForMarshalsMarket === true,
      viewerBalance: horse.balance, offers: [],
    });
    setOfferWalletAddress(address);
    setError(null); setSuccess(null);
  }

  async function postOffer(event: FormEvent) {
    event.preventDefault();
    if (!address || !offerHorse || !selectedOfferOwned || busy) return;
    setError(null); setSuccess(null);
    try {
      const amount = toNatString(offerAmount);
      if (amount === "0") throw new Error("Offer at least one horse edition.");
      setBusy(true);
      await api.post("/api/horf/open-range/offers", { address, tokenContract: offerHorse.contract, tokenId: offerHorse.tokenId, amount, acceptedTokenPolicy });
      setOfferHorse(null); setOfferWalletAddress(null); setOfferAmount("1"); setAcceptedTokenPolicy("any_qualifying");
      await qc.invalidateQueries({ queryKey: ["horf", "open-range-offers", address] });
      await qc.invalidateQueries({ queryKey: ["horf", "open-range", seasonKey] });
      setSuccess("Marked available for trade. The horse stays in your wallet; this sign does not put it in escrow.");
      logClientSystemEvent({ eventType: "horf.open_range.offer_posted", message: "Wallet-held horse marked available on Horf Open Range", metadata: { tokenContract: offerHorse.contract, tokenId: offerHorse.tokenId, amount, acceptedTokenPolicy } });
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
      setSuccess("Availability sign removed. The horse stayed in your wallet.");
      logClientSystemEvent({ eventType: "horf.open_range.offer_removed", message: "Wallet-held horse availability removed from Horf Open Range", metadata: { offerId: offer.id, tokenContract: offer.tokenContract, tokenId: offer.tokenId } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove this offer."); }
    finally { setBusy(false); }
  }

  async function approveHorseNow(horse: RangeHorse) {
    if (busy || !marshalStatusQuery.data?.active || horse.approvedForMarshalsMarket) return;
    setError(null); setSuccess(null);
    try {
      setBusy(true);
      const inspectionId = await approveHorseDirectly(horse);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["horf", "open-range"] }),
        qc.invalidateQueries({ queryKey: ["horf", "marshal-open-range"] }),
        qc.invalidateQueries({ queryKey: ["horf", "inspection-queue"] }),
        qc.invalidateQueries({ queryKey: ["horf", "inspection-status", horse.contract, horse.tokenId] }),
      ]);
      setSuccess(`Marshal approved ${horse.name || `horse #${horse.tokenId}`}.`);
      logClientSystemEvent({ eventType: "horf.inspection.decided", message: "Horf Marshal approved an Open Range horse directly", metadata: { inspectionId, decision: "approve", mode: "direct", tokenContract: horse.contract, tokenId: horse.tokenId } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not approve this horse."); }
    finally { setBusy(false); }
  }

  async function reportNotHorse(horse: RangeHorse) {
    const tokenKey = `${horse.contract}/${horse.tokenId}`;
    if (reportBusyKey || reportedKeys.has(tokenKey)) return;
    setError(null); setSuccess(null);
    setReportBusyKey(tokenKey);
    let optimisticallyHidden = marshalStatusQuery.data?.active === true;
    if (optimisticallyHidden) setHiddenKeys((current) => new Set(current).add(tokenKey));
    try {
      const marshalStatus = marshalStatusQuery.data ?? await api.get<{ active: boolean }>("/api/horf/inspectors/status");
      const marshal = marshalStatus.active === true;
      if (marshal) {
        if (!optimisticallyHidden) {
          optimisticallyHidden = true;
          setHiddenKeys((current) => new Set(current).add(tokenKey));
        }
        setSelectedHorse((current) => current?.contract === horse.contract && current.tokenId === horse.tokenId ? null : current);
        setDetailHorse((current) => current?.contract === horse.contract && current.tokenId === horse.tokenId ? null : current);
        setOfferHorse((current) => current?.contract === horse.contract && current.tokenId === horse.tokenId ? null : current);
        const result = await api.post<{ status: string; inspectionId: number }>("/api/horf/reports/not-a-horse/direct", {
          tokenContract: horse.contract, tokenId: horse.tokenId,
        });
        if (result.status !== "hidden") throw new Error("Marshal decision did not hide this token.");
        setSuccess(`${horse.name || `Token #${horse.tokenId}`} is hidden from Horf horse displays.`);
        void Promise.all([
          qc.invalidateQueries({ queryKey: ["horf", "open-range"] }),
          qc.invalidateQueries({ queryKey: ["horf", "marshal-open-range"] }),
          qc.invalidateQueries({ queryKey: ["horf", "inspection-queue"] }),
          qc.invalidateQueries({ queryKey: ["horf", "trader-profile-horses"] }),
          qc.invalidateQueries({ queryKey: ["horf", "trader-profile-offers"] }),
          qc.invalidateQueries({ queryKey: ["horf", "directory-offers"] }),
          qc.invalidateQueries({ queryKey: ["horf", "open-range-offers"] }),
          qc.invalidateQueries({ queryKey: ["horf", "owned-tokens"] }),
          qc.invalidateQueries({ queryKey: ["horf", "stable-selections"] }),
          qc.invalidateQueries({ queryKey: ["horf", "horse-market", "listings"] }),
        ]);
        logClientSystemEvent({ eventType: "horf.inspection.decided", message: "Horf Marshal hid a non-horse from the Open Range", metadata: { inspectionId: result.inspectionId, decision: "hide", tokenContract: horse.contract, tokenId: horse.tokenId } });
      } else {
        await api.post("/api/horf/reports/not-a-horse", {
          tokenContract: horse.contract, tokenId: horse.tokenId,
        });
        setReportedKeys((current) => new Set(current).add(tokenKey));
        setSuccess(`${horse.name || `Token #${horse.tokenId}`} was sent to a HORF Marshal for horse review.`);
        setSelectedHorse(horse);
        void qc.invalidateQueries({ queryKey: ["horf", "inspection-queue"] });
        logClientSystemEvent({ eventType: "horf.inspection.submitted", message: "Rider reported a possible non-horse on the Open Range", metadata: { tokenContract: horse.contract, tokenId: horse.tokenId, source: "public_report" } });
      }
    } catch (cause) {
      if (optimisticallyHidden) setHiddenKeys((current) => {
        const next = new Set(current);
        next.delete(tokenKey);
        return next;
      });
      setError(cause instanceof Error ? cause.message : "Could not review this token.");
    } finally {
      setReportBusyKey(null);
    }
  }

  const railHorse = selectedHorse ? horses.find((horse) => horse.contract === selectedHorse.contract && horse.tokenId === selectedHorse.tokenId) ?? selectedHorse : null;
  const selectedArt = railHorse ? horseArt(railHorse) : null;
  const selectedVideo = railHorse ? resolveHorfHorseVideo(railHorse) : null;
  const sidebar = <RangeAside>
    {(walletError || error) && <Note $error role="alert">{walletError || error}</Note>}
    {success && <Note role="status">{success}</Note>}
    {railHorse ? <>
      <span className="aside-eyebrow">Horse in your sights 🐎</span>
      {selectedVideo ? <video key={`${railHorse.contract}/${railHorse.tokenId}`} src={selectedVideo.src} controls playsInline preload="metadata" aria-label={`${railHorse.name} video artwork`} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, selectedVideo)) event.currentTarget.style.display = "none"; }} /> : <img src={selectedArt?.src ?? "/horf-art/horse-gallop-photo.jpg"} alt="" onError={(event) => { if (!selectedArt || !advanceResolvedMediaFallback(event.currentTarget, selectedArt)) event.currentTarget.src = "/horf-art/horse-gallop-photo.jpg"; }} />}
      <h3>{railHorse.name || `Horse token #${railHorse.tokenId}`}</h3>
      <p>{railHorse.mintedAt ? `Minted ${new Date(railHorse.mintedAt).toLocaleDateString()}` : "Mint date unknown"} · #{railHorse.tokenId}</p>
      <StatusFrame $kind="traded" $active={railHorse.tradedThroughHorf}>{railHorse.tradedThroughHorf ? "Traded before on Horf" : "No Horf trade yet"}</StatusFrame>
      {railHorse.activelyForTradeOnHorf && railHorse.offers.length ? <AvailabilityBadge $kind="offered" $active onClick={() => windowManager.openPage(horseAvailabilityUrl(railHorse))}>Available in a wallet ↗</AvailabilityBadge> : <StatusFrame $kind="offered" $active={railHorse.activelyForTradeOnHorf}>{railHorse.activelyForTradeOnHorf ? "Available in a wallet" : "No wallet availability sign"}</StatusFrame>}
      <StatusFrame $kind="approved" $active={railHorse.approvedForMarshalsMarket}>{railHorse.approvedForMarshalsMarket ? "Marshal approved" : "Not Marshal approved"}</StatusFrame>
      <Action type="button" onClick={() => viewHorse(railHorse)}>View horse details</Action>
      <small><a href={objktTokenUrl(railHorse.contract, railHorse.tokenId)} target="_blank" rel="noopener noreferrer">View on Objkt ↗</a></small>
    </> : <>
      <span className="aside-eyebrow">Range report</span>
      <strong className="aside-count">{horses.length}</strong>
      <h3>{shownSeason?.label || "Horses on the range"}</h3>
      {rangeQuery.isPending && <p role="status">Rounding up horses…</p>}
      {rangeQuery.isError && <p role="alert">This range is unavailable. Refresh the gallery to try again.</p>}
      <div className="aside-rule" />
      <Legend data-horf-open-range-legend><strong>Status key</strong><StatusFrame $kind="traded" $active>Traded before on Horf</StatusFrame><StatusFrame $kind="offered" $active>Available in a wallet</StatusFrame><StatusFrame $kind="approved" $active>Marshal approved</StatusFrame></Legend>
    </>}
  </RangeAside>;

  return <HorfFrame title="Open Range" aside={sidebar} walletAddress={address} onConnectWallet={connectWallet} walletConnecting={isConnecting} marshalActive={marshalStatusQuery.data?.active === true} raceEnabled={isAdmin}>
    <Shell data-horf-open-range>
      <Masthead>
        <div className="range-topline">
          <span className="range-path">Horf / <strong>Open Range</strong></span>
          <Actions><Action type="button" onClick={() => windowManager.openPage(`/horf?season=${encodeURIComponent(seasonKey === "all-horse-search" || seasonKey === "all-seasons" ? "all-time" : seasonKey)}`)}>← Horf home</Action>{!address && <Action data-horf-open-range-connect type="button" $primary onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting…" : isGuest ? "Connect and verify wallet" : "Connect wallet"}</Action>}</Actions>
        </div>
        <div className="range-hero">
          <div><span className="range-eyebrow">Horse art · Tezos Mainnet</span><h1>The Open Range<span aria-hidden="true">🐎</span></h1></div>
          <figure className="range-hero-art">{showFeaturedMint && featuredHorse && featuredArt ? <button data-horf-open-range-featured-mint type="button" aria-label={`View featured mint ${featuredHorse.name}`} onClick={() => viewHorse(featuredHorse)}><img src={featuredArt.src} alt="" fetchPriority="high" decoding="async" onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, featuredArt) && featuredKey) setFeaturedArtFailedKeys((current) => new Set(current).add(featuredKey)); }} /></button> : rangeQuery.isPending || (rangeQuery.isError && !horses.length) ? <div className="range-hero-loading" role="status"><span aria-hidden="true">🐎</span>Rounding up mints…</div> : <img className="range-stock-photo" src="/horf-art/horse-beach-photo.jpg" alt="Horses crossing a beach at sunset" />}{!(rangeQuery.isPending || (rangeQuery.isError && !horses.length)) && <figcaption>{showFeaturedMint && featuredHorse ? `On the range · ${featuredHorse.name}` : "Yudi Susilo · CC0 horse photograph"}</figcaption>}</figure>
        </div>
      </Masthead>
      {walletError && <Note $error role="alert">{walletError}</Note>}
      <Toolbar data-horf-open-range-season><div><details ref={filterRef} data-horf-open-range-filter><summary>Range: {seasonKey === "all-seasons" ? "Tracked seasons" : seasonKey === "all-horse-search" ? "All time · every horse" : shownSeason?.label || "Choose a season"}</summary><div className="range-filter-options"><fieldset><legend>Range to search</legend><div>
        <label><input type="radio" name="horf-open-range-mode" data-horf-open-range-mode="all-seasons" checked={seasonKey === "all-seasons"} onChange={() => changeSeason("all-seasons")} />Tracked seasons</label>
        <label><input type="radio" name="horf-open-range-mode" data-horf-open-range-mode="all-horse-search" checked={seasonKey === "all-horse-search"} onChange={() => changeSeason("all-horse-search")} />All time · every horse</label>
        {!seasons.some((season) => season.key === seasonKey) && seasonKey !== "all-seasons" && seasonKey !== "all-horse-search" && <label><input type="radio" name="horf-open-range-mode" checked readOnly />{shownSeason?.label || seasonKey}</label>}
        {seasons.map((season) => <label key={season.key}><input type="radio" name="horf-open-range-mode" data-horf-open-range-mode={season.key} checked={seasonKey === season.key} onChange={() => changeSeason(season.key)} />{season.label}{season.inferred ? " · archive" : ""}</label>)}
      </div></fieldset></div></details><small>{seasonKey === "all-seasons" ? "Horse trading season windows." : seasonKey === "all-horse-search" ? "All known horse keywords, any mint date." : shownSeason?.startsAt ? `${new Date(shownSeason.startsAt).toLocaleDateString()} – ${shownSeason.endsAt ? new Date(shownSeason.endsAt).toLocaleDateString() : "ongoing"}${shownSeason.inferred ? " · Archive dates are inferred." : ""}` : "Loading season dates…"}</small></div><Action type="button" onClick={() => { setFeaturedArtFailedKeys(new Set()); refreshHorseCache.current = true; logClientSystemEvent({ eventType: "horf.open_range.refreshed", message: "Open Range source refresh requested", metadata: { seasonKey } }); void rangeQuery.refetch().finally(() => { refreshHorseCache.current = false; }); }} disabled={rangeQuery.isFetching}>{rangeQuery.isFetching ? "Refreshing…" : "Refresh horses"}</Action></Toolbar>
      {rangeQuery.isPending && <Note role="status">Rounding up the season’s minted horses…</Note>}
      {rangeQuery.isError && <Note $error role="alert">{rangeQuery.error instanceof Error ? rangeQuery.error.message : "The Open Range is unavailable."} Refresh to try again.</Note>}
      {holderStatusStale && <Note role="status">Holder check is delayed; last verified ownership shown.</Note>}
      <GalleryHeading><div><h2>{shownSeason?.label || "Horses on the range"}</h2><p>{horses.length} horses</p></div>{asOf && <small>Indexed {new Date(asOf).toLocaleString()}</small>}</GalleryHeading>
      <Grid data-horf-open-range-grid tabIndex={-1}>{horses.map((horse, index) => {
        const art = marshalStatusQuery.data?.active ? horseArt(horse) : resolveHorfHorseCardArt(horse, uniqueThumbnails);
        const video = resolveHorfHorseVideo(horse);
        const tradingPaths = listedHorsePaths.paths.get(`${horse.contract}/${horse.tokenId}`) ?? [];
        return <Card key={`${horse.contract}:${horse.tokenId}`} data-horf-open-range-horse>
          <ArtButton data-horf-open-range-view-horse data-compact-control="true" type="button" onClick={() => viewHorse(horse)} aria-label={`View ${horse.name || `horse token #${horse.tokenId}`} details`}>
            {art ? <Art src={art.src} alt="" loading={index === 0 ? "eager" : "lazy"} decoding="async" fetchPriority={index === 0 ? "high" : "auto"} onError={(event) => { if (!advanceResolvedMediaFallback(event.currentTarget, art)) event.currentTarget.src = "/horf-art/horse-gallop-photo.jpg"; }} /> : <Glyph aria-hidden="true"><img src="/horf-art/horse-gallop-photo.jpg" alt="" loading="lazy" decoding="async" /></Glyph>}
            {video && <span className="video-cue">▶ Video artwork</span>}
          </ArtButton>
          <h2><a href={objktTokenUrl(horse.contract, horse.tokenId)} target="_blank" rel="noopener noreferrer">{horse.name || `Horse token #${horse.tokenId}`}</a></h2>
          {horse.description && <p className="horse-description">{horse.description}</p>}
          <div className="horse-meta"><span title="Mint date" aria-label={horse.mintedAt ? `Minted ${new Date(horse.mintedAt).toLocaleDateString()}` : "Mint date unknown"}>◷ {horse.mintedAt ? new Date(horse.mintedAt).toLocaleDateString() : "Mint date unknown"}</span><span title={`Token ${horse.contract} / #${horse.tokenId}`} aria-label={`Token number ${horse.tokenId}`}>#{horse.tokenId}</span>{horse.creatorAddress && <a title={`Creator ${horse.creatorAddress}`} aria-label={`Creator ${horse.creatorAddress}`} href={`https://objkt.com/profile/${encodeURIComponent(horse.creatorAddress)}`} target="_blank" rel="noopener noreferrer">by {shortAddress(horse.creatorAddress)}</a>}</div>
          {(horse.tradedThroughHorf || horse.activelyForTradeOnHorf || horse.approvedForMarshalsMarket) && <CardFlags data-horf-open-range-flags>{horse.tradedThroughHorf && <StatusFrame data-horf-open-range-status="traded" $kind="traded" $active title="This token has been traded through Horf">Traded before on Horf</StatusFrame>}{horse.activelyForTradeOnHorf && horse.offers.length ? <AvailabilityBadge data-horf-open-range-status="offered" $kind="offered" $active title="Wallet-held availability; this horse is not in escrow" onClick={() => windowManager.openPage(horseAvailabilityUrl(horse))}>Available in a wallet ↗</AvailabilityBadge> : horse.activelyForTradeOnHorf && <StatusFrame data-horf-open-range-status="offered" $kind="offered" $active>Available in a wallet</StatusFrame>}{horse.approvedForMarshalsMarket && <StatusFrame data-horf-open-range-status="approved" $kind="approved" $active>Marshal approved</StatusFrame>}</CardFlags>}
          {horse.inspectionStatus === "rejected" && <StatusFrame $kind="traded" $active>Marshal reviewed · rejected for trade</StatusFrame>}
          {horse.inspectionStatus === "reviewed" && <StatusFrame $kind="approved" $active>Marshal reviewed · kept</StatusFrame>}
          {tradingPaths.map((path) => <Action data-horf-open-range-for-trade-now type="button" key={`${path.kind}:${path.id}`} $primary onClick={() => windowManager.openPage(path.href)}>{path.label} →</Action>)}
          {address && ownsHorse(horse.viewerBalance) ? <OwnedMarker data-horf-open-range-owned>You own this horse</OwnedMarker> : horse.activelyForTradeOnHorf && horse.offers.some((offer) => offer.ownerAddress !== address) ? <Action data-horf-open-range-view-availability type="button" $primary onClick={() => windowManager.openPage(availabilityUrl(horse.offers.length === 1 ? horse.offers[0]!.id : undefined))}>View availability</Action> : null}
          {marshalStatusQuery.data?.active && !horse.approvedForMarshalsMarket && <Action data-horf-open-range-approve type="button" disabled={busy} onClick={() => void approveHorseNow(horse)}>{busy ? "Checking horse…" : "Approve for Marshal’s Market"}</Action>}
          <Action data-horf-open-range-not-horse type="button" disabled={reportBusyKey !== null || reportedKeys.has(`${horse.contract}/${horse.tokenId}`)} onClick={() => void reportNotHorse(horse)}>{reportedKeys.has(`${horse.contract}/${horse.tokenId}`) ? "Sent to Marshal review" : reportBusyKey === `${horse.contract}/${horse.tokenId}` ? marshalStatusQuery.data?.active ? "Hiding from Horf…" : "Sending to Marshal…" : "That’s not a horse"}</Action>
        </Card>;
      })}</Grid>
      {!rangeQuery.isPending && !rangeQuery.isError && !horses.length && <EmptyRange data-horf-open-range-empty>{rangeQuery.hasNextPage ? "No qualifying horses appeared on the pages read so far. Keep riding to the next page." : "No qualifying horse mints were found in this range. Try All Horse Search to look beyond known campaign windows."}</EmptyRange>}
      {rangeQuery.hasNextPage && <Actions><Action data-horf-open-range-more type="button" onClick={() => void rangeQuery.fetchNextPage()} disabled={rangeQuery.isFetchingNextPage}>{rangeQuery.isFetchingNextPage ? "Rounding up more…" : "See more horses"}</Action></Actions>}
      <OfferPanel id="horf-open-range-offer" data-horf-open-range-offers><h2>Mark a horse available</h2><p>Show traders a qualifying horse you hold. This sign stays outside escrow; use an Outlaw room for a contract-backed exchange.</p>
        {!address && <Note>Connect and verify your wallet to mark a horse available.</Note>}
        {address && <HorfOwnedHorsePicker address={address} selected={offerHorse && selectedOfferOwned ? { ...offerHorse, balance: offerHorse.viewerBalance!, walletAddress: offerWalletAddress! } : null} onSelect={chooseOwnedOfferHorse} disabled={busy} id="horf-open-range-owned-horse" label="Choose a horse to mark available" selectDataAttr="data-horf-open-range-owned-horse" />}
        {offerHorse && selectedOfferOwned && <form onSubmit={(event) => void postOffer(event)}><p>Selected: <a href={objktTokenUrl(offerHorse.contract, offerHorse.tokenId)} target="_blank" rel="noopener noreferrer">{offerHorse.name || `Horse token #${offerHorse.tokenId}`}</a> · #{offerHorse.tokenId}</p><label htmlFor="horf-open-range-offer-amount">Editions to show as available</label><input id="horf-open-range-offer-amount" data-horf-open-range-offer-amount inputMode="numeric" value={offerAmount} onChange={(event) => setOfferAmount(event.target.value)} disabled={busy} /><fieldset data-horf-open-range-policy><legend>Horses you prefer in return</legend><label><input type="radio" name="horf-offer-policy" value="any_qualifying" checked={acceptedTokenPolicy === "any_qualifying"} onChange={() => setAcceptedTokenPolicy("any_qualifying")} disabled={busy} />Any qualifying horse</label><label><input type="radio" name="horf-offer-policy" value="marshal_only" checked={acceptedTokenPolicy === "marshal_only"} onChange={() => setAcceptedTokenPolicy("marshal_only")} disabled={busy} />Marshal-approved horses only</label></fieldset><p>Preference only. No horse moves or gets reserved when you post this sign.</p><Actions><Action data-horf-open-range-offer-post type="submit" $primary disabled={!address || busy}>Mark available</Action><Action type="button" onClick={() => setOfferHorse(null)} disabled={busy}>Cancel</Action></Actions></form>}
        <h3>Your availability signs</h3>{offersQuery.isPending && address && <p>Reading your signs…</p>}{offersQuery.isError && <Note $error role="alert">Your availability signs are unavailable. Refresh to try again.</Note>}
        {myOffers.length ? <ul>{myOffers.map((offer) => <li key={offer.id} data-horf-open-range-my-offer><span><a href={objktTokenUrl(offer.tokenContract, offer.tokenId)} target="_blank" rel="noopener noreferrer">Horse token #{offer.tokenId}</a> · {offer.amount} editions in wallet · {shortAddress(offer.tokenContract)} · {policyLabel(offer.acceptedTokenPolicy)}</span><Action data-horf-open-range-offer-remove type="button" onClick={() => void removeOffer(offer)} disabled={busy}>Remove sign</Action></li>)}</ul> : address && !offersQuery.isPending && !offersQuery.isError && <p>No availability signs from this wallet.</p>}
      </OfferPanel>
      {error && <Note $error role="alert">{error}</Note>}{success && <Note role="status">{success}</Note>}
      <HorseDetail ref={detailRef} data-horf-open-range-detail onClose={() => setDetailHorse(null)} onClick={(event) => { if (event.target === event.currentTarget) setDetailHorse(null); }} aria-label="Horse details">
        {detailHorse && <>
          <div className="detail-head"><div><small>🐎 Open Range · horse papers</small><h2>{detailHorse.name || `Horse token #${detailHorse.tokenId}`}</h2></div><Action type="button" onClick={() => setDetailHorse(null)}>Close details</Action></div>
          <div className="detail-grid">
            {resolveHorfHorseVideo(detailHorse) ? <video key={`${detailHorse.contract}/${detailHorse.tokenId}`} data-horf-open-range-detail-video src={resolveHorfHorseVideo(detailHorse)!.src} controls playsInline preload="metadata" aria-label={`${detailHorse.name || `Horse token #${detailHorse.tokenId}`} video artwork`} onError={(event) => { const resolved = resolveHorfHorseVideo(detailHorse); if (!resolved || !advanceResolvedMediaFallback(event.currentTarget, resolved)) event.currentTarget.style.display = "none"; }} /> : horseArt(detailHorse) ? <img src={horseArt(detailHorse)!.src} alt={`${detailHorse.name || `Horse token #${detailHorse.tokenId}`} artwork`} onError={(event) => { const resolved = horseArt(detailHorse); if (!resolved || !advanceResolvedMediaFallback(event.currentTarget, resolved)) { event.currentTarget.src = "/horf-art/horse-gallop-photo.jpg"; event.currentTarget.alt = "Horse photograph placeholder"; } }} /> : <div className="detail-glyph" aria-hidden="true"><img src="/horf-art/horse-gallop-photo.jpg" alt="" /></div>}
            <div><p>{detailHorse.description || "This horse has no description from Objkt yet."}</p><CardFlags><StatusFrame $kind="traded" $active={detailHorse.tradedThroughHorf}>{detailHorse.tradedThroughHorf ? "Traded before on Horf" : "No Horf trade yet"}</StatusFrame><StatusFrame $kind="offered" $active={detailHorse.activelyForTradeOnHorf}>{detailHorse.activelyForTradeOnHorf ? "Available in a wallet" : "No wallet availability sign"}</StatusFrame><StatusFrame $kind="approved" $active={detailHorse.approvedForMarshalsMarket}>{detailHorse.approvedForMarshalsMarket ? "Marshal approved" : "Not Marshal approved"}</StatusFrame></CardFlags>{detailHorse.inspectionStatus === "rejected" && <StatusFrame $kind="traded" $active>Marshal reviewed · rejected for trade</StatusFrame>}{detailHorse.inspectionStatus === "reviewed" && <StatusFrame $kind="approved" $active>Marshal reviewed · kept</StatusFrame>}<small>{detailHorse.mintedAt ? `Minted ${new Date(detailHorse.mintedAt).toLocaleDateString()}` : "Mint date unknown"} · {detailHorse.contract} / #{detailHorse.tokenId}</small>{detailHorse.creatorAddress && <small>Creator: <a href={`https://objkt.com/profile/${encodeURIComponent(detailHorse.creatorAddress)}`} target="_blank" rel="noopener noreferrer">{shortAddress(detailHorse.creatorAddress)}</a></small>}{detailHorse.offers.map((offer) => <p key={offer.id}>🤠 <a href={`https://objkt.com/profile/${encodeURIComponent(offer.ownerAddress)}`} target="_blank" rel="noopener noreferrer">{shortAddress(offer.ownerAddress)}</a> marks {offer.amount} {offer.amount === "1" ? "edition" : "editions"} available · {policyLabel(offer.acceptedTokenPolicy)} <Action data-horf-open-range-detail-find-offer type="button" onClick={() => { setDetailHorse(null); windowManager.openPage(availabilityUrl(offer.id)); }}>Offer 1 of yours →</Action></p>)}<p>An availability sign starts a proposal. If accepted, the owner places one horse in private escrow; you finish the checked swap.</p><a href={objktTokenUrl(detailHorse.contract, detailHorse.tokenId)} target="_blank" rel="noopener noreferrer">View this horse on Objkt ↗</a><Action data-horf-open-range-detail-not-horse type="button" disabled={reportBusyKey !== null || reportedKeys.has(`${detailHorse.contract}/${detailHorse.tokenId}`)} onClick={() => void reportNotHorse(detailHorse)}>{reportedKeys.has(`${detailHorse.contract}/${detailHorse.tokenId}`) ? "Sent to Marshal review" : reportBusyKey === `${detailHorse.contract}/${detailHorse.tokenId}` ? "Sending to Marshal…" : "That’s not a horse"}</Action>{marshalStatusQuery.data?.active && !detailHorse.approvedForMarshalsMarket && <Action data-horf-open-range-inspect type="button" onClick={() => { setDetailHorse(null); windowManager.openPage(`/horf/inspection-desk?season=${encodeURIComponent(seasonKey)}&inspect=${encodeURIComponent(`${detailHorse.contract}/${detailHorse.tokenId}`)}`); }}>Inspect for Marshal’s Market</Action>}<HorfObjktBuy key={`${detailHorse.contract}:${detailHorse.tokenId}`} tokenContract={detailHorse.contract} tokenId={detailHorse.tokenId} address={address} connectWallet={connectWallet} isConnecting={isConnecting} /></div>
          </div>
        </>}
      </HorseDetail>
    </Shell>
  </HorfFrame>;
}
