import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import styled from "styled-components";
import { HorfFrame } from "../features/horf/HorfFrame";
import { HorfStables } from "../features/horf/HorfStables";
import { HorfHorseSend } from "../features/horf/HorfHorseSend";
import { HorfHorseMarket } from "../features/horf/HorfHorseMarket";
import { HahaCrp } from "../features/haha-crp/HahaCrp";
import { HorfGifts } from "../features/horf/HorfGifts";
import { HorfPosse } from "../features/horf/HorfPosse";
import { HorfTradeHorseCarousel } from "../features/horf/HorfTradeHorseCarousel";
import { HorfSeasonArt } from "../features/horf/HorfSeasonArt";
import { HorfTraderStatus } from "../features/horf/HorfTraderStatus";
import { HorfPersonalStable } from "../features/horf/HorfPersonalStable";
import { HorfPublicTraderProfile, parseProfile } from "../features/horf/HorfTraderProfile";
import { findHorfMintSeason } from "../features/horf/mint-season";
import { approveHorseDirectly } from "../features/horf/marshal-approval";
import { HorfInspectorDesk } from "../features/horf/HorfInspectorDesk";
import { resolveHorfHorseArt, resolveHorfHorseCardArt, resolveHorfHorseVideo, uniqueHorfThumbnailIdentities, type HorfHorseMedia } from "../features/horf/horse-media";
import { formatHorseAmount } from "../features/horf/recipient-input";
import { objktTokenUrl } from "../features/horf/token-input";
import { useHorfWallet } from "../features/horf/useHorfWallet";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { logClientSystemEvent } from "../lib/system-log";
import { advanceResolvedMediaFallback } from "../lib/media-resolve";
import { useWindowManager, WindowPathContext } from "../lib/window-context";

const CURRENT_SEASON_KEY = "current-2026";

type HorfSeason = {
  key: string;
  startsAt: string;
  endsAt: string | null;
  label: string;
  inferred: boolean;
};

type TraderCount = {
  address: string;
  name: string | null;
  count: number;
};

type HorfReceipt = {
  id: string | number;
  timestamp: string;
  direction: "in" | "out";
  counterparty: string;
  token: {
    contract: string;
    tokenId: string;
    name: string;
    image?: string | null;
  };
  amount: number;
  settlement?: "stable" | "gift";
  stableMode?: 0 | 1 | 2;
};

type WaitingHorse = {
  id: string | number;
  timestamp: string;
  from: string;
  token: HorfReceipt["token"];
  amount: number;
};

type HorfSeasonResponse = {
  season: HorfSeason;
  seasons: HorfSeason[];
  asOf: string | null;
  error: string | null;
  nextRefreshAt: string | null;
  status: "ready" | "syncing" | "error";
  leaderboard: Array<{
    address: string;
    name: string | null;
    trades: number;
    received: number;
    sent: number;
    blacklisted?: boolean;
  }>;
  currentUser: {
    address: string;
    received: number;
    sent: number;
    trades: number;
    blacklisted?: boolean;
    owedTo: TraderCount[];
    owedBy: TraderCount[];
    waitingHorses: WaitingHorse[];
    recent: HorfReceipt[];
  } | null;
};

type PublicOffer = {
  id: number;
  ownerAddress: string;
  ownerName?: string | null;
  tokenContract: string;
  tokenId: string;
  amount: string;
  acceptedTokenPolicy: "marshal_only" | "any_qualifying";
  name: string | null;
  image: string | null;
  artifactUri?: string | null;
  mime?: string | null;
  ownerBalance?: string | null;
  viewerBalance?: string | null;
};

type PublicHeldHorse = {
  contract: string;
  tokenId: string;
  balance: string;
  name: string | null;
  image: string | null;
  artifactUri?: string | null;
  mime?: string | null;
  description: string | null;
  creatorAddress: string | null;
  mintedAt?: string | null;
  viewerBalance?: string | null;
  approvedForMarshalsMarket?: boolean;
};

type PublicHorsePage = {
  address: string;
  items: PublicHeldHorse[];
  pagination: { hasMore: boolean; nextOffset: number };
};

function parseSeasonResponse(value: unknown): HorfSeasonResponse {
  const data = value as Partial<HorfSeasonResponse> | null;
  const validSeason = (season: unknown): season is HorfSeason => {
    const entry = season as Partial<HorfSeason> | null;
    return Boolean(entry &&
      typeof entry.key === "string" &&
      typeof entry.startsAt === "string" &&
      (entry.endsAt === null || typeof entry.endsAt === "string") &&
      typeof entry.label === "string" &&
      typeof entry.inferred === "boolean");
  };
  if (
    !data ||
    !validSeason(data.season) ||
    !Array.isArray(data.seasons) ||
    !data.seasons.length ||
    data.seasons.some((season) => !validSeason(season)) ||
    !["ready", "syncing", "error"].includes(data.status || "") ||
    !Array.isArray(data.leaderboard) ||
    data.leaderboard.some((trader) =>
      typeof trader.address !== "string" || typeof trader.trades !== "number" ||
      (trader.blacklisted != null && typeof trader.blacklisted !== "boolean")
    ) ||
    (data.currentUser != null && (
      typeof data.currentUser.address !== "string" ||
      (data.currentUser.blacklisted != null && typeof data.currentUser.blacklisted !== "boolean") ||
      !Array.isArray(data.currentUser.owedTo) ||
      !Array.isArray(data.currentUser.owedBy) ||
      !Array.isArray(data.currentUser.waitingHorses) ||
      !Array.isArray(data.currentUser.recent)
    ))
  ) {
    throw new Error("Horf received an invalid season ledger. Refresh to try again.");
  }
  return data as HorfSeasonResponse;
}

function isHorfLocation(): boolean {
  return typeof window !== "undefined" && /^\/horf(?:\/|$)/.test(window.location.pathname);
}

function readSeasonKeyFromUrl(): string {
  if (!isHorfLocation()) return CURRENT_SEASON_KEY;
  const season = new URLSearchParams(window.location.search).get("season")?.trim();
  return season === "all-horse-search" || season === "all-seasons" ? "all-time" : season || CURRENT_SEASON_KEY;
}

function writeSeasonKeyToUrl(key: string): void {
  if (!isHorfLocation()) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("season") === key) return;
  url.searchParams.set("season", key);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

const Shell = styled.div`
  min-height: 100%;
  min-width: 0;
  width: 100%;
  max-width: 1460px;
  margin: 0 auto;
  padding: clamp(16px, 2.4vw, 38px);
  box-sizing: border-box;
  color: var(--horf-ink);
  background: var(--horf-canvas);
  font-family: var(--horf-font, ui-sans-serif, system-ui, sans-serif);
  container-type: inline-size;

  * { box-sizing: border-box; }
  a { color: var(--horf-teal); }
  button:focus-visible, a:focus-visible, select:focus-visible, input:focus-visible {
    outline: 3px solid var(--horf-focus);
    outline-offset: 3px;
  }
`;

const Masthead = styled.header`
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(265px, 0.72fr);
  gap: clamp(20px, 3vw, 48px);
  align-items: center;
  padding: clamp(24px, 3.4vw, 54px);
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid var(--horf-line);
  background: linear-gradient(125deg, #182a24 0%, #20372e 66%, #152922 100%);
  color: var(--horf-ink);
  box-shadow: 0 18px 42px #0004;

  &::before {
    content: "";
    position: absolute;
    width: 450px;
    aspect-ratio: 1;
    right: 15%;
    top: -250px;
    border: 1px solid rgba(170, 224, 202, .15);
    border-radius: 50%;
    box-shadow: 0 0 0 60px rgba(170, 224, 202, .035), 0 0 0 130px rgba(170, 224, 202, .025);
    pointer-events: none;
  }
  > * { position: relative; z-index: 1; }

  h1 {
    margin: 12px 0 20px;
    color: var(--horf-ink);
    font: 800 clamp(58px, 8cqw, 114px)/.82 var(--horf-display, Georgia, serif);
    letter-spacing: -.04em;
  }
  h1 span { color: var(--horf-gold); font-size: .52em; vertical-align: top; }
  p { max-width: 660px; margin: 0; color: var(--horf-muted); font-size: clamp(15px, 1.15vw, 18px); line-height: 1.58; }
  small {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    padding: 5px 11px;
    border: 1px solid rgba(197, 231, 209, .35);
    border-radius: 999px;
    color: var(--horf-ink);
    font: 750 11px/1.2 ui-sans-serif, system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: .09em;
  }
  @container (max-width: 720px) { grid-template-columns: 1fr; }
`;

const WantedPoster = styled.aside`
  position: relative;
  min-width: 0;
  overflow: hidden;
  justify-self: end;
  width: min(100%, 370px);
  padding: 19px 22px 22px;
  border-radius: 16px;
  border: 1px solid #815d35;
  background: linear-gradient(155deg, #3f3527 0%, #493b29 55%, #352d23 100%);
  color: var(--horf-ink);
  box-shadow: 0 20px 36px rgba(0, 0, 0, .2);
  transform: rotate(2deg);
  font-family: var(--horf-font, ui-sans-serif, system-ui, sans-serif);
  .wanted { display: block; color: var(--horf-gold); font: 900 12px/1.2 ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; letter-spacing: .18em; }
  .traders { display: block; margin: 5px 0 0; color: #d6bd95; font: 750 11px/1.35 ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; letter-spacing: .07em; }
  .horse-art { height: clamp(135px, 15cqw, 185px); min-height: 0; overflow: hidden; margin: 9px 0 12px; border: 3px solid #9e7441; border-radius: 6px; background: #241f19; }
  .horse-art img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 34%; filter: sepia(.28) saturate(1.13) contrast(1.06); }
  h2 { margin: 0 0 10px; font: 800 clamp(22px, 2.2cqw, 30px)/1.05 var(--horf-display, Georgia, serif); letter-spacing: -.04em; overflow-wrap: anywhere; }
  .reward { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 10px; padding: 11px 13px; border: 1px solid #92713e; border-radius: 12px; background: #1b2b24; color: var(--horf-ink); }
  .reward strong { display: block; font: 800 clamp(22px, 2.2cqw, 30px)/1 var(--horf-display, sans-serif); white-space: nowrap; }
  .reward span { display: block; max-width: 126px; font: 700 11px/1.3 ui-sans-serif, system-ui, sans-serif; }
  p { margin: 0; color: #e1cfaf; font: 600 11px/1.42 ui-sans-serif, system-ui, sans-serif; }
  @container (max-width: 720px) { justify-self: start; width: min(100%, 390px); transform: none; }
`;

const SeasonPicker = styled.section`
  display: grid;
  grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
  gap: 12px 22px;
  align-items: center;
  margin-top: 22px;
  padding: 17px 20px;
  border: 1px solid var(--horf-line);
  border-radius: 16px;
  background: var(--horf-surface);
  label {
    display: block;
    margin-bottom: 7px;
    color: var(--horf-muted);
    font: 750 11px/1.25 ui-sans-serif, system-ui, sans-serif;
    text-transform: uppercase;
    letter-spacing: .08em;
  }
  select {
    width: 100%;
    min-height: 44px;
    padding: 9px 13px;
    border: 1px solid var(--horf-line);
    border-radius: 10px;
    color: var(--horf-ink);
    background: var(--horf-field);
    font: 750 14px/1.3 ui-sans-serif, system-ui, sans-serif;
  }
  p { margin: 0; font-size: 13px; line-height: 1.4; }
  strong { display: block; color: var(--horf-ink); font: 700 14px/1.4 ui-sans-serif, system-ui, sans-serif; }
  small { display: block; margin-top: 4px; color: var(--horf-muted); font-size: 12px; line-height: 1.4; }
  @container (max-width: 560px) { grid-template-columns: 1fr; }
`;

const IntroActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 26px;
  @container (max-width: 520px) { button { flex: 1 1 auto; } }
`;

const Action = styled.button<{ $primary?: boolean }>`
  appearance: none;
  border: 1px solid ${(p) => p.$primary ? "var(--horf-gold)" : "var(--horf-line)"};
  border-radius: 999px;
  background: ${(p) => p.$primary ? "var(--horf-gold)" : "var(--horf-surface)"};
  color: ${(p) => p.$primary ? "var(--horf-deep)" : "var(--horf-ink)"};
  min-height: 39px;
  padding: 8px 14px;
  font: 750 12px/1.2 ui-sans-serif, system-ui, sans-serif;
  cursor: pointer;
  transition: transform 160ms ease, background 160ms ease, box-shadow 160ms ease;
  &:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 6px 15px rgba(21, 63, 55, .12); }
  @media (prefers-reduced-motion: reduce) { &:hover:not(:disabled) { transform: none; } }
  &:disabled { opacity: 0.58; cursor: wait; }
`;

const StatusBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 14px;
  margin-top: 12px;
  padding: 10px 14px;
  border: 1px solid var(--horf-line);
  border-radius: 12px;
  background: var(--horf-surface);
  color: var(--horf-muted);
  font: 650 12px/1.35 ui-sans-serif, system-ui, sans-serif;
  button {
    min-height: 32px;
    border: 0;
    border-radius: 999px;
    padding: 6px 11px;
    color: var(--horf-deep);
    background: var(--horf-teal);
    font: inherit;
    cursor: pointer;
  }
`;

const Warning = styled.div`
  margin-top: 10px;
  padding: 12px 15px;
  border: 1px solid #795543;
  border-left: 4px solid var(--horf-coral);
  border-radius: 10px;
  background: #352822;
  color: #f5c9b8;
  font: 650 13px/1.45 ui-sans-serif, system-ui, sans-serif;
`;

const WalletStatus = styled.div`
  margin-top: 16px;
  padding: 11px 15px;
  border: 1px solid #416b59;
  border-radius: 10px;
  background: #1c352b;
  color: #d3eadb;
  font: 650 12px/1.45 ui-sans-serif, system-ui, sans-serif;
  button { margin-left: 12px; padding: 5px 10px; border: 1px solid var(--horf-teal); border-radius: 999px; background: var(--horf-field); color: var(--horf-ink); cursor: pointer; font: inherit; }
  button:focus-visible { outline: 3px solid var(--horf-focus); outline-offset: 2px; }
  button:disabled { opacity: 0.6; cursor: wait; }
`;

const ClaimNotice = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 14px;
  margin-top: 11px;
  padding: 12px 15px;
  border: 1px solid #7e6343;
  border-radius: 12px;
  background: #352e22;
  color: #f1dfb9;
  font: 650 13px/1.4 ui-sans-serif, system-ui, sans-serif;
  button { min-height: 36px; padding: 6px 11px; border: 0; border-radius: 999px; background: var(--horf-gold); color: var(--horf-deep); cursor: pointer; font: inherit; }
`;

const TradingZone = styled.section<{ $outlaw?: boolean }>`
  margin-top: 42px;
  padding: clamp(18px, 2.2vw, 30px);
  border: 1px solid ${(p) => p.$outlaw ? "#795543" : "var(--horf-line)"};
  border-radius: 22px;
  background: ${(p) => p.$outlaw ? "#2d2420" : "var(--horf-surface)"};
  min-width: 0;
  h2 { margin: 4px 0 9px; color: var(--horf-ink); font: 750 clamp(28px, 3cqw, 42px)/1.05 var(--horf-display, Georgia, serif); letter-spacing: -.04em; }
  > p { max-width: 850px; margin: 0 0 8px; color: var(--horf-muted); font-size: 14px; line-height: 1.6; }
  > small { color: ${(p) => p.$outlaw ? "var(--horf-coral)" : "var(--horf-teal)"}; font: 800 11px/1.3 ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; letter-spacing: .1em; }
  > section { margin-top: 14px; }
`;

const ZoneAction = styled.button`
  min-height: 40px;
  padding: 8px 14px;
  border: 1px solid var(--horf-gold);
  border-radius: 999px;
  background: var(--horf-gold);
  color: var(--horf-deep);
  cursor: pointer;
  font: 750 12px/1.2 ui-sans-serif, system-ui, sans-serif;
  &:hover { background: #e8b65d; }
`;

const Section = styled.section`
  margin-top: 42px;
  min-width: 0;
  h2 {
    margin: 0 0 8px;
    color: var(--horf-ink);
    font: 750 clamp(26px, 2.8cqw, 38px)/1.08 var(--horf-display, Georgia, serif);
    letter-spacing: -.045em;
  }
  > p { max-width: 800px; margin: 0 0 18px; color: var(--horf-muted); font-size: 14px; line-height: 1.55; }
`;

const SectionLabel = styled.div`
  margin-bottom: 8px;
  color: var(--horf-coral);
  font: 800 11px/1.2 ui-sans-serif, system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: .12em;
`;

const RaceFrame = styled.div`
  overflow: hidden;
  border: 1px solid var(--horf-line);
  border-radius: 18px;
  background: var(--horf-surface);
  box-shadow: 0 14px 36px #0003;
`;

const Race = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
`;

const RaceHeader = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 20px;
  background: var(--horf-elevated);
  color: var(--horf-ink);
  font: 800 11px/1.2 ui-sans-serif, system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: .09em;
`;

const Lane = styled.li`
  display: grid;
  grid-template-columns: minmax(160px, .3fr) minmax(100px, 1fr) 86px;
  min-height: 66px;
  border-top: 1px solid var(--horf-line);
  background: var(--horf-surface);
  &:nth-child(even) { background: var(--horf-elevated); }
  @container (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr) 72px;
    min-height: 94px;
  }
`;

const Rider = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 750;
  a { flex: 1 1 70px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @container (max-width: 560px) {
    padding-bottom: 0;
  }
`;

const BlacklistBadge = styled.button`
  flex: 0 0 calc(100% - 37px);
  margin-left: 37px;
  min-height: 30px;
  padding: 4px 8px;
  border: 1px solid #815543;
  border-radius: 999px;
  background: #3b2924;
  color: #f2b5a0;
  cursor: pointer;
  font: 800 10px/1.1 ui-sans-serif, system-ui, sans-serif;
  text-transform: uppercase;
  &:focus-visible { outline: 3px solid var(--horf-focus); outline-offset: 2px; }
`;

const Rank = styled.span`
  flex: 0 0 auto;
  display: grid;
  place-content: center;
  width: 31px;
  height: 31px;
  border-radius: 50%;
  border: 0;
  background: #49372c;
  color: var(--horf-gold);
  font: 850 12px ui-sans-serif, system-ui, sans-serif;
`;

const Track = styled.div`
  position: relative;
  overflow: hidden;
  min-width: 0;
  background: linear-gradient(90deg, transparent 0 3%, var(--horf-line) 3% 97%, transparent 97%) center / 100% 3px no-repeat;
  &::after { content: ""; position: absolute; right: 3%; top: 25%; bottom: 25%; border-right: 2px dashed var(--horf-coral); }
  @container (max-width: 560px) {
    grid-column: 1;
    grid-row: 2;
    min-height: 50px;
  }
`;

const Runner = styled.div`
  position: absolute;
  top: 50%;
  width: 58px;
  height: 48px;
  margin-top: -24px;
  color: var(--horf-gold);
  transition: left 700ms ease-out;
  span { display: block; width: 58px; height: 48px; font-size: 35px; line-height: 48px; text-align: center; transform: scaleX(-1); filter: drop-shadow(0 3px 2px rgba(73, 55, 37, .16)); }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const LaneScore = styled.div`
  display: grid;
  place-content: center;
  text-align: center;
  padding: 5px;
  border-left: 1px solid var(--horf-line);
  background: #243d32;
  color: #d5ead8;
  strong { display: block; font: 800 23px/1 var(--horf-display, Georgia, serif); }
  span { font: 800 10px/1.2 ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; letter-spacing: .04em; }
  @container (max-width: 560px) { grid-column: 2; grid-row: 1 / span 2; }
`;

const Ledger = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 15px;
  @container (max-width: 670px) { grid-template-columns: 1fr; }
`;

const LedgerPanel = styled.div`
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--horf-line);
  border-radius: 16px;
  background: var(--horf-surface);
  h3 { margin: 0 0 6px; color: var(--horf-ink); font: 750 20px/1.15 var(--horf-display, Georgia, serif); }
  p { margin: 0 0 12px; color: var(--horf-muted); font-size: 13px; line-height: 1.5; }
`;

const MetricStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 17px 0 22px;
  > div { padding: 17px 18px; border: 1px solid var(--horf-line); border-radius: 14px; background: var(--horf-elevated); }
  strong { display: block; color: var(--horf-teal); font: 800 30px/1 var(--horf-display, Georgia, serif); }
  span { display: block; margin-top: 7px; color: var(--horf-muted); font: 750 11px/1.25 ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; letter-spacing: .04em; }
  @container (max-width: 510px) { grid-template-columns: 1fr; }
`;

const RuleNote = styled.p`
  padding: 14px 17px;
  border-left: 3px solid var(--horf-coral);
  border-radius: 0 12px 12px 0;
  background: #302720;
  color: #ddcdbb;
  font-size: 13px;
  line-height: 1.55;
`;

const TraderList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 11px 0;
    border-top: 1px solid var(--horf-line);
    font-size: 13px;
  }
  strong { white-space: nowrap; }
  .trader-row-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
  .return-send-action { min-height: 32px; padding: 6px 10px; }
`;

const DirectoryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  @container (max-width: 720px) { grid-template-columns: 1fr; }
`;

const DirectoryCard = styled.article`
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--horf-line);
  border-radius: 17px;
  background: var(--horf-surface);
  box-shadow: 0 8px 24px #0003;
  .rider-rank { display: block; margin-bottom: 10px; color: var(--horf-coral); font-size: 10px; font-weight: 850; letter-spacing: .11em; text-transform: uppercase; }
  a { display: block; color: var(--horf-teal); font: 750 22px/1.15 var(--horf-display, sans-serif); overflow-wrap: anywhere; }
  p { margin: 9px 0 0; color: var(--horf-muted); font-size: 13px; }
  strong { color: var(--horf-ink); }
  button[data-horf-trader-quick-send] { width: 100%; margin-top: 15px; }
`;

const QuickSendDialog = styled.dialog`
  width: min(440px, calc(100vw - 24px));
  max-height: calc(100dvh - 24px);
  overflow: auto;
  padding: 0;
  border: 1px solid var(--horf-line);
  border-radius: 18px;
  background: var(--horf-surface);
  color: var(--horf-ink);
  box-shadow: 0 28px 70px #06100dd9;
  font-family: var(--horf-font, ui-sans-serif, system-ui, sans-serif);
  &::backdrop { background: #07120fd9; backdrop-filter: blur(4px); }
  .quick-head { display: flex; justify-content: space-between; align-items: start; gap: 12px; padding: 20px 20px 13px; border-bottom: 1px solid var(--horf-line); }
  .quick-head small { display: block; color: var(--horf-gold); font: 800 11px/1.2 ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; letter-spacing: .08em; }
  .quick-head h2 { margin: 5px 0 0; font: 750 25px/1.08 var(--horf-display, Georgia, serif); overflow-wrap: anywhere; }
  .quick-head button { flex: 0 0 auto; min-width: 38px; min-height: 38px; border: 1px solid var(--horf-line); border-radius: 999px; background: var(--horf-field); color: var(--horf-ink); cursor: pointer; font-size: 18px; }
  .quick-head button:disabled { cursor: wait; opacity: .5; }
  .quick-body { padding: 16px 20px 20px; }
  button:focus-visible, select:focus-visible, input:focus-visible, a:focus-visible { outline: 3px solid var(--horf-focus); outline-offset: 2px; }
  @media (max-width: 480px) { .quick-head { padding: 16px 16px 12px; } .quick-body { padding: 14px 16px 16px; } }
`;

const ProfileTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 18px 0 20px;
  button { min-height: 43px; padding: 8px 16px; border: 1px solid var(--horf-line); border-radius: 999px; background: var(--horf-surface); color: var(--horf-ink); font-weight: 800; cursor: pointer; }
  button[aria-selected="true"] { border-color: var(--horf-gold); background: var(--horf-gold); color: var(--horf-deep); }
`;

const ProfileHorseGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(205px, 1fr));
  gap: 16px;
`;

const ProfileHorseCard = styled.article`
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--horf-line);
  border-radius: 17px;
  background: var(--horf-surface);
  .art { display: grid; place-items: center; height: 205px; background: var(--horf-field); }
  .art img, .art video { display: block; width: 100%; height: 100%; object-fit: contain; }
  .art .missing-preview { padding: 20px; color: var(--horf-muted); font-size: 12px; text-align: center; }
  .art-open { display: block; width: 100%; height: 100%; padding: 0; border: 0; background: transparent; cursor: zoom-in; }
  .copy { padding: 14px 16px 17px; }
  h3 { margin: 0 0 8px; color: var(--horf-ink); font: 750 19px/1.2 var(--horf-display, sans-serif); overflow-wrap: anywhere; }
  h3 button { padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  h3 button:hover { text-decoration: underline; text-underline-offset: 3px; }
  button:focus-visible { outline: 3px solid var(--horf-focus); outline-offset: 3px; }
  p { margin: 0 0 8px; color: var(--horf-muted); font-size: 12px; line-height: 1.45; }
  .mint-badge { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; margin: 0 0 9px; padding: 3px 8px 3px 5px; border: 1px solid #856838; border-radius: 999px; background: #392f20; color: #f0d39a; font: 750 11px/1.25 var(--horf-font); }
  .mint-badge img { width: 15px; height: 15px; flex: 0 0 15px; object-fit: contain; }
  a { font-size: 12px; font-weight: 800; }
  ${Action} { width: 100%; min-height: 38px; margin-top: 11px; }
`;

const ProfileHorseDetail = styled.dialog`
  width: min(980px, calc(100vw - 28px));
  max-height: calc(100vh - 28px);
  overflow: auto;
  padding: clamp(18px, 3vw, 30px);
  border: 1px solid var(--horf-line);
  border-radius: 16px;
  background: var(--horf-surface);
  color: var(--horf-ink);
  box-shadow: 0 28px 70px #081512bd;
  &::backdrop { background: #07120fcb; backdrop-filter: blur(5px); }
  .detail-head { display: flex; justify-content: space-between; align-items: start; gap: 16px; margin-bottom: 18px; }
  .detail-head h2 { margin: 4px 0 0; font: 750 clamp(25px, 4vw, 40px)/1.1 var(--horf-display, sans-serif); }
  .detail-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 24px; }
  .detail-art { display: grid; place-items: center; min-height: 300px; max-height: 68vh; border-radius: 12px; overflow: hidden; background: var(--horf-field); }
  .detail-art img, .detail-art video { display: block; width: 100%; max-height: 68vh; object-fit: contain; }
  .detail-copy p { line-height: 1.5; overflow-wrap: anywhere; }
  .detail-copy a { color: var(--horf-teal); }
  button:focus-visible, a:focus-visible { outline: 3px solid var(--horf-focus); outline-offset: 3px; }
  @media (max-width: 650px) { .detail-grid { grid-template-columns: 1fr; } .detail-art { min-height: 220px; max-height: 40vh; } .detail-art img, .detail-art video { max-height: 40vh; } }
`;

const HorseTestList = styled.ul`
  margin: 16px 0 0;
  padding-left: 21px;
  color: var(--horf-ink);
  font-size: 14px;
  line-height: 1.7;
  li + li { margin-top: 8px; }
`;

const ReceiptList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--horf-line);
  li {
    display: grid;
    grid-template-columns: 75px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: start;
    padding: 13px 2px;
    border-bottom: 1px solid var(--horf-line);
    font-size: 13px;
  }
  small { display: block; margin-top: 3px; color: var(--horf-muted); font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
  .return-send-action { min-height: 32px; margin-top: 8px; padding: 6px 10px; }
  @container (max-width: 540px) { li { grid-template-columns: 60px minmax(0, 1fr); } }
`;

const ReceiptDirection = styled.strong<{ $in: boolean }>`
  display: inline-block;
  padding: 6px 9px;
  border-radius: 999px;
  background: ${(p) => p.$in ? "#243e31" : "#3a2d24"};
  border: 1px solid ${(p) => p.$in ? "#5e9b79" : "#9d7152"};
  color: ${(p) => p.$in ? "#c8ead2" : "#f1d1ad"};
  font: 800 10px/1.2 ui-sans-serif, system-ui, sans-serif;
  text-transform: uppercase;
`;

const AsideRail = styled.div`
  color: var(--horf-ink);
  font-family: var(--horf-font, ui-sans-serif, system-ui, sans-serif);
  .eyebrow { display: block; margin-bottom: 10px; color: var(--horf-coral); font-size: 10px; font-weight: 850; letter-spacing: .13em; text-transform: uppercase; }
  .rail-section { padding: 16px 0; border-bottom: 1px solid var(--horf-line); }
  .rail-section:first-child { padding-top: 4px; }
  strong { display: block; color: var(--horf-ink); font: 700 20px/1.12 var(--horf-display, Georgia, serif); overflow-wrap: anywhere; }
  p { margin: 8px 0 0; color: var(--horf-muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .rail-number { color: var(--horf-gold); font: 800 24px/1 var(--horf-display, Georgia, serif); }
  .rail-link { display: inline-block; margin-top: 11px; color: var(--horf-teal); font-size: 12px; font-weight: 750; text-decoration: underline; text-underline-offset: 3px; }
  .rail-link:focus-visible { outline: 3px solid var(--horf-focus); outline-offset: 3px; }
`;

function shortAddress(address: string): string {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function traderName(name: string | null | undefined, address: string): string {
  return name?.trim() || shortAddress(address);
}

function holdingsText(owner: string | null | undefined, viewer: string | null | undefined, connected: boolean): string {
  const editions = (value: string) => `${value} ${value === "1" ? "edition" : "editions"}`;
  const ownerText = owner == null ? "Trader holdings unavailable" : `Trader owns ${editions(owner)}`;
  if (!connected) return ownerText;
  return `${ownerText} · ${viewer == null ? "Your holdings unavailable" : `You own ${editions(viewer)}`}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
}

function formatSeasonDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(date);
}

function seasonDateRange(season: HorfSeason): string {
  return season.endsAt
    ? `From ${formatSeasonDate(season.startsAt)} to before ${formatSeasonDate(season.endsAt)}`
    : `From ${formatSeasonDate(season.startsAt)} · ongoing`;
}

function profileUrl(address: string): string {
  return `https://objkt.com/profile/${encodeURIComponent(address)}`;
}

function horfTraderUrl(address: string): string {
  const season = typeof window === "undefined" ? CURRENT_SEASON_KEY
    : new URLSearchParams(window.location.search).get("season") || CURRENT_SEASON_KEY;
  return `/horf/traders/${encodeURIComponent(address)}?season=${encodeURIComponent(season)}`;
}

function tokenUrl(token: HorfReceipt["token"]): string {
  return `https://objkt.com/tokens/${encodeURIComponent(token.contract)}/${encodeURIComponent(token.tokenId)}`;
}

function HorseGlyph() {
  return <span aria-hidden="true">🐎</span>;
}

function TraderLink({ address, name }: { address: string; name?: string | null }) {
  return (
    <Link href={horfTraderUrl(address)} data-horf-trader-profile-link title={`View ${name?.trim() || address} on Horf`}>
      {traderName(name, address)}
    </Link>
  );
}

function ProfileArt({ media, name, uniqueThumbnails, card = false }: { media: HorfHorseMedia; name: string; uniqueThumbnails?: ReadonlySet<string>; card?: boolean }) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setVideoFailed(false); setImageFailed(false); }, [media.image, media.artifactUri, media.mime]);
  const video = resolveHorfHorseVideo(media);
  const art = uniqueThumbnails ? resolveHorfHorseCardArt(media, uniqueThumbnails) : resolveHorfHorseArt(media);
  if (video && !videoFailed) return <video src={video.src} controls playsInline preload="metadata" aria-label={`${name} video artwork`} onError={(event) => {
    if (!advanceResolvedMediaFallback(event.currentTarget, video)) setVideoFailed(true);
  }} />;
  if (art && !imageFailed) return <img src={art.src} alt={`${name} horse token artwork`} loading={card ? "lazy" : "eager"} decoding="async" onError={(event) => {
    if (!advanceResolvedMediaFallback(event.currentTarget, art)) setImageFailed(true);
  }} />;
  return <span className="missing-preview">Token preview unavailable</span>;
}

function TraderListPanel({ title, description, rows, empty, region, onSend, currentWallet }: {
  title: string;
  description: string;
  rows: TraderCount[];
  empty: string;
  region: "owed-to" | "owed-by";
  onSend?: (rider: { address: string; name: string | null }, trigger: HTMLButtonElement) => void;
  currentWallet?: string | null;
}) {
  return (
    <LedgerPanel data-horf-region={region}>
      <h3>{title}</h3>
      <p>{description}</p>
      {rows.length ? (
        <TraderList>
          {rows.map((row) => (
            <li key={row.address} data-horf-owed-to-row={region === "owed-to" ? "" : undefined}>
              <TraderLink address={row.address} name={row.name} />
              <span className="trader-row-actions"><strong>{row.count} {row.count === 1 ? "horse" : "horses"}</strong>
                {onSend && row.address !== currentWallet && <Action data-horf-owed-to-send className="return-send-action" type="button" aria-label={`Send a return horse to ${traderName(row.name, row.address)}`} onClick={(event) => onSend(row, event.currentTarget)}>Send a horse 🐎</Action>}
              </span>
            </li>
          ))}
        </TraderList>
      ) : <p>{empty}</p>}
    </LedgerPanel>
  );
}

export function Horf() {
  const { address, isGuest, isConnecting, walletError, guestSessionLoading, localWalletAddress, connectWallet, disconnectWallet } = useHorfWallet();
  const qc = useQueryClient();
  const [location, navigate] = useLocation();
  const { isAdmin } = useAuth();
  const windowManager = useWindowManager();
  const pagePath = useContext(WindowPathContext);
  const routePath = location.split("?")[0]?.split("#")[0] || "/horf";
  const profileAddress = routePath.match(/^\/horf\/traders\/([^/]+)$/)?.[1] ?? null;
  const validProfileAddress = profileAddress && /^tz[1-5][1-9A-HJ-NP-Za-km-z]{33}$/.test(profileAddress) ? profileAddress : null;
  const routeSection = routePath === "/horf/traders" ? "traders"
    : profileAddress ? "profile"
    : routePath === "/horf/info" ? "info"
    : routePath === "/horf/marshals-market" ? "marshal"
    : routePath === "/horf/inspection-desk" ? "inspection-desk"
    : routePath === "/horf/outlaw-corral" ? "outlaw"
    : routePath === "/horf/stable" || (routePath === "/horf" && Boolean(address)) ? "stable"
    : routePath === "/horf/send-horse" ? "horse"
    : routePath === "/horf/horse-market" ? "horse-market"
    : routePath === "/horf/haha-crp" ? "haha"
    : routePath === "/horf/posse" ? "posse"
    : routePath === "/horf/gifts" ? "gifts" : "race";
  const routeTitle = routeSection === "marshal" ? "Marshal’s Market"
    : routeSection === "inspection-desk" ? "Inspection Desk"
    : routeSection === "outlaw" ? "Outlaw Corral"
    : routeSection === "stable" ? "My Stable & Profile"
    : routeSection === "horse" ? "Send $HORSE"
    : routeSection === "horse-market" ? "HORSE Market"
    : routeSection === "haha" ? "HAHA Horse Trader Awards"
    : routeSection === "gifts" ? "Gifts"
    : routeSection === "posse" ? "Posse"
    : routeSection === "traders" ? "Find Other Traders"
    : routeSection === "profile" ? "Trader Profile"
    : routeSection === "info" ? "Is It a Horse?" : "Horf";
  const traderFromUrl = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("trader");
  const loggedViews = useRef(new Set<string>());
  const [selectedSeasonKey, setSelectedSeasonKey] = useState(readSeasonKeyFromUrl);
  const profileSeasonKey = selectedSeasonKey === "all-time" || selectedSeasonKey === "all-seasons" || selectedSeasonKey === "all-horse-search" ? CURRENT_SEASON_KEY : selectedSeasonKey;
  const [seasonManifest, setSeasonManifest] = useState<HorfSeason[]>([]);
  const [statusAddress, setStatusAddress] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<"for-trade" | "all-horses">("for-trade");
  const [selectedProfileHorse, setSelectedProfileHorse] = useState<PublicHeldHorse | PublicOffer | null>(null);
  const profileHorseDialogRef = useRef<HTMLDialogElement>(null);
  const [quickSendRider, setQuickSendRider] = useState<{ address: string; name: string | null } | null>(null);
  const [quickSendBusy, setQuickSendBusy] = useState(false);
  const quickSendDialogRef = useRef<HTMLDialogElement>(null);
  const quickSendTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [profileApprovalBusy, setProfileApprovalBusy] = useState(false);
  const [profileApprovalStatus, setProfileApprovalStatus] = useState<string | null>(null);
  const [profileApprovalResults, setProfileApprovalResults] = useState<Record<string, { status: "approved" | "failed"; message: string }>>({});
  const query = useQuery({
    queryKey: ["horf", "season", selectedSeasonKey, address],
    queryFn: async () => {
      const params = new URLSearchParams({ season: selectedSeasonKey });
      if (address) params.set("address", address);
      const response = parseSeasonResponse(await api.get<unknown>(`/api/horf/season?${params}`));
      if (response.season.key !== selectedSeasonKey) {
        throw new Error("Horf received a different season than the one selected. Refresh to try again.");
      }
      return response;
    },
    refetchOnWindowFocus: true,
  });
  const claimAlertQuery = useQuery({
    queryKey: ["horf", "horse-rewards", address],
    queryFn: () => api.get<{ claimableRaw: string; claimReady: boolean; asOf: string | null; status: "ready" | "syncing" | "error" }>(`/api/horf/horse/rewards?address=${encodeURIComponent(address!)}`),
    enabled: Boolean(address),
    refetchOnWindowFocus: true,
  });
  const directoryOffersQuery = useQuery({
    queryKey: ["horf", "directory-offers"],
    queryFn: () => api.get<{ offers: PublicOffer[] }>("/api/horf/open-range/offers"),
    enabled: routeSection === "traders",
    refetchOnWindowFocus: true,
  });
  const profileOffersQuery = useQuery({
    queryKey: ["horf", "trader-profile-offers", validProfileAddress, address],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (address) params.set("viewer", address);
      const response = await api.get<unknown>(`/api/horf/traders/${encodeURIComponent(validProfileAddress!)}/offers${params.size ? `?${params}` : ""}`);
      if (!response || typeof response !== "object" || !("offers" in response) || !Array.isArray(response.offers)) {
        throw new Error("Trader trade signs returned an invalid page.");
      }
      return response as { offers: PublicOffer[] };
    },
    enabled: routeSection === "profile" && Boolean(validProfileAddress),
    refetchOnWindowFocus: true,
  });
  const profileHorsesQuery = useInfiniteQuery({
    queryKey: ["horf", "trader-profile-horses", validProfileAddress, address],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get<PublicHorsePage>(`/api/horf/traders/${encodeURIComponent(validProfileAddress!)}/horses?offset=${pageParam}${address ? `&viewer=${encodeURIComponent(address)}` : ""}`),
    getNextPageParam: (page) => page.pagination.hasMore ? page.pagination.nextOffset : undefined,
    enabled: routeSection === "profile" && Boolean(validProfileAddress) && profileTab === "all-horses",
    refetchOnWindowFocus: true,
  });
  const profileMarshalQuery = useQuery({
    queryKey: ["horf", "inspector-status", isGuest],
    queryFn: () => api.get<{ active: boolean; role: "horf_marshal" | "admin" | null }>("/api/horf/inspectors/status"),
    enabled: true,
    refetchOnWindowFocus: true,
  });
  const profileIdentityQuery = useQuery({
    queryKey: ["horf", "trader-profile", validProfileAddress, profileSeasonKey],
    queryFn: () => api.get<unknown>(`/api/horf/traders/${encodeURIComponent(validProfileAddress!)}/profile?season=${encodeURIComponent(profileSeasonKey)}`).then(parseProfile),
    enabled: routeSection === "profile" && Boolean(validProfileAddress),
    refetchOnWindowFocus: true,
  });
  const claimAlert = claimAlertQuery.data?.asOf && /^\d+$/.test(claimAlertQuery.data.claimableRaw) && BigInt(claimAlertQuery.data.claimableRaw) > 0n
    ? claimAlertQuery.data : null;
  const data = query.data;
  const availableSeasons = data?.seasons ?? seasonManifest;
  const selectedSeason = data?.season ?? availableSeasons.find((season) => season.key === selectedSeasonKey);
  const seasonDisplayName = selectedSeasonKey === CURRENT_SEASON_KEY ? "Neighvember 2026" : selectedSeason?.label ?? "Horf archive";
  const profileSeasonLabel = profileSeasonKey === CURRENT_SEASON_KEY ? "Neighvember 2026" : selectedSeason?.label ?? profileSeasonKey;
  const leaderboard = useMemo(
    () => [...(data?.leaderboard ?? [])].sort((a, b) => b.trades - a.trades || a.address.localeCompare(b.address)),
    [data?.leaderboard],
  );
  const directory = useMemo(() => {
    const rows = new Map<string, { address: string; name: string | null; trades: number; offerCount: number }>();
    for (const rider of leaderboard) rows.set(rider.address, { address: rider.address, name: rider.name, trades: rider.trades, offerCount: 0 });
    for (const offer of directoryOffersQuery.data?.offers ?? []) {
      const rider = rows.get(offer.ownerAddress) ?? { address: offer.ownerAddress, name: offer.ownerName ?? null, trades: 0, offerCount: 0 };
      if (!rider.name && offer.ownerName) rider.name = offer.ownerName;
      rider.offerCount += 1;
      rows.set(offer.ownerAddress, rider);
    }
    return [...rows.values()].sort((a, b) => b.trades - a.trades || b.offerCount - a.offerCount || a.address.localeCompare(b.address));
  }, [leaderboard, directoryOffersQuery.data?.offers]);
  const profileRider = leaderboard.find((row) => row.address === validProfileAddress);
  const profileHorses = useMemo(() => profileHorsesQuery.data?.pages.flatMap((page) => page.items) ?? [], [profileHorsesQuery.data]);
  const profileThumbnails = useMemo(() => uniqueHorfThumbnailIdentities([
    ...(profileOffersQuery.data?.offers ?? []).map((offer) => ({ ...offer, contract: offer.tokenContract })),
    ...profileHorses,
  ]), [profileOffersQuery.data?.offers, profileHorses]);
  const selectedProfileContract = selectedProfileHorse && ("contract" in selectedProfileHorse ? selectedProfileHorse.contract : selectedProfileHorse.tokenContract);
  const selectedProfileName = selectedProfileHorse?.name || (selectedProfileHorse ? `Horse token #${selectedProfileHorse.tokenId}` : "Horse card");
  const leadTrades = leaderboard.reduce((lead, row) => Math.max(lead, row.trades), 1);
  const personal = address && data?.currentUser?.address === address
    ? data.currentUser
    : null;
  const waitingHorses = personal?.waitingHorses ?? [];
  const countsProvisional = data?.status === "syncing" || (data?.status === "ready" && !data.asOf);
  const hasError = query.isError || data?.status === "error";

  useEffect(() => {
    if (data?.seasons) setSeasonManifest(data.seasons);
  }, [data?.seasons]);

  useEffect(() => {
    const dialog = quickSendDialogRef.current;
    if (!quickSendRider || !dialog || dialog.open) return;
    dialog.showModal();
    const focusFrame = window.requestAnimationFrame(() => {
      const horseSelect = dialog.querySelector<HTMLSelectElement>("[data-horf-gift-owned]");
      const closeButton = dialog.querySelector<HTMLButtonElement>("[data-horf-quick-send-close]");
      (horseSelect && !horseSelect.disabled ? horseSelect : closeButton)?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [quickSendRider]);

  function openQuickSend(rider: { address: string; name: string | null }, trigger: HTMLButtonElement) {
    quickSendTriggerRef.current = trigger;
    setQuickSendBusy(false);
    setQuickSendRider(rider);
    logClientSystemEvent({ eventType: "horf.trader.quick_send_opened", message: "Horf trader quick horse send opened", metadata: { targetWallet: rider.address } });
  }

  function closeQuickSend() {
    setQuickSendRider(null);
    setQuickSendBusy(false);
    window.requestAnimationFrame(() => {
      if (quickSendTriggerRef.current?.isConnected) quickSendTriggerRef.current.focus();
      else document.querySelector<HTMLElement>('[data-horf-region="trader-ledger"], [data-horf-region="trader-directory"]')?.focus();
    });
  }

  useEffect(() => {
    if (isHorfLocation() && (!pagePath || windowManager.focusedPath === pagePath)) {
      writeSeasonKeyToUrl(selectedSeasonKey);
    }
  }, [pagePath, selectedSeasonKey, windowManager.focusedPath]);

  useEffect(() => {
    const onPopState = () => {
      if (isHorfLocation()) setSelectedSeasonKey(readSeasonKeyFromUrl());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!data?.nextRefreshAt) return;
    const nextRefreshAt = new Date(data.nextRefreshAt).getTime();
    if (!Number.isFinite(nextRefreshAt)) return;
    const timer = window.setTimeout(() => void query.refetch(), Math.max(0, nextRefreshAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [data?.nextRefreshAt, query.refetch]);

  useEffect(() => {
    if (!data) return;
    const key = `${data.season.startsAt}:${address ?? "spectator"}`;
    if (!loggedViews.current.has(`season:${key}`)) {
      loggedViews.current.add(`season:${key}`);
      logClientSystemEvent({ eventType: "horf.season.viewed", message: "Horf season opened", metadata: { season: data.season.label } });
    }
    if (routeSection === "race" && !loggedViews.current.has(`race:${key}`)) {
      loggedViews.current.add(`race:${key}`);
      logClientSystemEvent({ eventType: "horf.race.viewed", message: "Horf race board viewed", metadata: { season: data.season.label } });
    }
    if (routeSection === "stable" && personal && !loggedViews.current.has(`trader:${key}`)) {
      loggedViews.current.add(`trader:${key}`);
      logClientSystemEvent({ eventType: "horf.trader.viewed", message: "Horf trader ledger viewed", metadata: { season: data.season.label } });
    }
  }, [address, data, personal, routeSection]);

  useEffect(() => {
    setProfileTab("for-trade");
    setSelectedProfileHorse(null);
    setProfileApprovalStatus(null);
    setProfileApprovalResults({});
  }, [profileAddress]);

  useEffect(() => {
    const dialog = profileHorseDialogRef.current;
    if (!dialog) return;
    if (selectedProfileHorse && !dialog.open) dialog.showModal();
    if (!selectedProfileHorse && dialog.open) dialog.close();
  }, [selectedProfileHorse]);

  useEffect(() => {
    const key = `${routeSection}:${profileAddress ?? ""}:${selectedSeasonKey}`;
    if (loggedViews.current.has(key)) return;
    if (routeSection === "traders") logClientSystemEvent({ eventType: "horf.traders.viewed", message: "Horf trader directory viewed", metadata: { seasonKey: selectedSeasonKey } });
    else if (routeSection === "profile" && profileAddress) logClientSystemEvent({ eventType: "horf.trader_profile.viewed", message: "Horf trader profile viewed", metadata: { address: profileAddress, seasonKey: selectedSeasonKey } });
    else if (routeSection === "info") logClientSystemEvent({ eventType: "horf.info.viewed", message: "Horf horse criteria viewed" });
    else return;
    loggedViews.current.add(key);
  }, [routeSection, profileAddress, selectedSeasonKey]);

  function navigateHorf(path: string, replace = false) {
    const nextSeason = path === "/horf/open-range"
      ? selectedSeasonKey === "all-time" ? "all-horse-search" : selectedSeasonKey
      : path === "/horf" || path === "/horf/race" || path === "/horf/traders" || path === "/horf/stable"
        ? selectedSeasonKey : selectedSeasonKey === "all-time" ? CURRENT_SEASON_KEY : selectedSeasonKey;
    navigate(`${path}?season=${encodeURIComponent(nextSeason)}`, { replace });
  }

  function viewTraderStatus(traderAddress: string) {
    setStatusAddress(traderAddress);
    navigate(`/horf/outlaw-corral?season=${encodeURIComponent(selectedSeasonKey === "all-time" ? CURRENT_SEASON_KEY : selectedSeasonKey)}&trader=${encodeURIComponent(traderAddress)}`);
  }

  function selectProfileTab(tab: "for-trade" | "all-horses") {
    if (tab === profileTab) return;
    setProfileTab(tab);
    logClientSystemEvent({ eventType: "horf.trader_profile.tab_selected", message: "Horf trader horses tab selected", metadata: { address: profileAddress, tab } });
  }

  async function approveProfileHorse(horse: PublicHeldHorse) {
    if (!validProfileAddress || !profileMarshalQuery.data?.active || profileApprovalBusy) return;
    const key = `${horse.contract}/${horse.tokenId}`;
    if (horse.approvedForMarshalsMarket || profileApprovalResults[key]?.status === "approved") return;
    setProfileApprovalBusy(true);
    setProfileApprovalStatus(`Checking ${horse.name || `horse #${horse.tokenId}`}…`);
    try {
      const inspectionId = await approveHorseDirectly(horse);
      setProfileApprovalResults((current) => ({ ...current, [key]: { status: "approved", message: "Marshal approved" } }));
      setProfileApprovalStatus(`${horse.name || `Horse #${horse.tokenId}`} is Marshal approved.`);
      await qc.invalidateQueries({ queryKey: ["horf", "trader-profile-horses", validProfileAddress] });
      logClientSystemEvent({ eventType: "horf.inspection.decided", message: "Horf Marshal approved a trader profile horse directly", metadata: { inspectionId, decision: "approve", mode: "direct", tokenContract: horse.contract, tokenId: horse.tokenId, profileAddress: validProfileAddress } });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "This horse could not be approved.";
      setProfileApprovalResults((current) => ({ ...current, [key]: { status: "failed", message } }));
      setProfileApprovalStatus(`Horse #${horse.tokenId}: ${message}`);
    } finally { setProfileApprovalBusy(false); }
  }

  async function approveAllProfileHorses() {
    if (!validProfileAddress || !profileMarshalQuery.data?.active || profileApprovalBusy) return;
    setProfileApprovalBusy(true);
    setProfileApprovalStatus("Checking every holdings page…");
    setProfileApprovalResults({});
    try {
      const allHorses = new Map<string, PublicHeldHorse>();
      let offset = 0;
      while (true) {
        const page: PublicHorsePage = await api.get<PublicHorsePage>(`/api/horf/traders/${encodeURIComponent(validProfileAddress)}/horses?offset=${offset}&refresh=1`);
        if (page.address !== validProfileAddress || !Array.isArray(page.items) || !page.pagination ||
            typeof page.pagination.hasMore !== "boolean" || !Number.isSafeInteger(page.pagination.nextOffset)) {
          throw new Error("The trader’s horse pages changed during the scan. Refresh and try again.");
        }
        for (const horse of page.items) allHorses.set(`${horse.contract}/${horse.tokenId}`, horse);
        setProfileApprovalStatus(`Checking every holdings page… ${allHorses.size} horses found.`);
        if (!page.pagination.hasMore) break;
        if (page.pagination.nextOffset <= offset) throw new Error("The trader’s horse pages stopped advancing. Refresh and try again.");
        offset = page.pagination.nextOffset;
      }
      const horses = [...allHorses.values()];
      const toApprove = horses.filter((horse) => !horse.approvedForMarshalsMarket);
      let approved = 0;
      let failed = 0;
      for (const [index, horse] of toApprove.entries()) {
        const key = `${horse.contract}/${horse.tokenId}`;
        setProfileApprovalStatus(`Approving ${index + 1} of ${toApprove.length} horses… ${approved} approved, ${failed} failed.`);
        try {
          const inspectionId = await approveHorseDirectly(horse);
          approved += 1;
          setProfileApprovalResults((current) => ({ ...current, [key]: { status: "approved", message: "Marshal approved" } }));
          logClientSystemEvent({ eventType: "horf.inspection.decided", message: "Horf Marshal approved a trader profile horse directly", metadata: { inspectionId, decision: "approve", mode: "direct", tokenContract: horse.contract, tokenId: horse.tokenId, profileAddress: validProfileAddress } });
        } catch (cause) {
          failed += 1;
          setProfileApprovalResults((current) => ({ ...current, [key]: { status: "failed", message: cause instanceof Error ? cause.message : "Approval failed" } }));
        }
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["horf", "trader-profile-horses", validProfileAddress] }),
        qc.invalidateQueries({ queryKey: ["horf", "open-range"] }),
        qc.invalidateQueries({ queryKey: ["horf", "marshal-open-range"] }),
      ]);
      setProfileApprovalStatus(`Checked all ${horses.length} held horses: ${approved} approved, ${horses.length - toApprove.length} already approved, ${failed} failed.`);
    } catch (cause) {
      setProfileApprovalStatus(cause instanceof Error ? cause.message : "Could not finish checking this trader’s horses. Review each card before retrying.");
    } finally { setProfileApprovalBusy(false); }
  }

  useEffect(() => {
    if (routePath !== "/horf") return;
    const oldHash = window.location.hash.slice(1);
    const oldDestination: Record<string, string> = {
      "horf-marshals-market": "/horf/marshals-market",
      "horf-outlaw-corral": "/horf/outlaw-corral",
      "horf-personal-stable": "/horf/stable",
      "horf-horse-send": "/horf/send-horse",
      "horf-gifts": "/horf/gifts",
      "horf-posse": "/horf/posse",
      "horf-trader-status": "/horf/outlaw-corral",
    };
    const destination = oldDestination[oldHash];
    if (destination) navigateHorf(destination, true);
  }, [routePath]);

  function selectSeason(key: string) {
    if (key === selectedSeasonKey) return;
    if (pagePath && windowManager.focusedPath !== pagePath) windowManager.focus(pagePath);
    logClientSystemEvent({
      eventType: "horf.season.selected",
      message: "Horf trading season selected",
      metadata: { previousSeasonKey: selectedSeasonKey, seasonKey: key },
    });
    setSelectedSeasonKey(key);
    writeSeasonKeyToUrl(key);
  }

  return (
    <HorfFrame title={`${routeTitle} · ${seasonDisplayName}`} walletAddress={address} onConnectWallet={connectWallet} onDisconnectWallet={disconnectWallet} walletConnecting={isConnecting} marshalActive={profileMarshalQuery.data?.active === true} aside={<AsideRail>
      {walletError && <div className="rail-section" role="alert"><span className="eyebrow">Wallet alert</span><p>{walletError}</p></div>}
      {personal?.blacklisted === true && <div className="rail-section" role="alert"><span className="eyebrow">Trader standing</span><p>This wallet is restricted from private Horf actions. Review the public standing before trading.</p></div>}
      <div className="rail-section"><span className="eyebrow">🐎 Live trail</span><strong>{seasonDisplayName}</strong><p>{countsProvisional ? "The race is still scanning Mainnet." : hasError ? "Season totals need a refresh." : "Season ledger ready for the next ride."}</p></div>
      {routeSection === "haha" && <div className="rail-section"><span className="eyebrow">🏆 HAHA ballot</span><strong>Nominate a deserving rider</strong><p>Choose a different Tezos wallet for each nomination in a category. Your wallet signs in to the ballot.</p></div>}
      {routeSection === "horse-market" && <div className="rail-section"><span className="eyebrow">🐎 HORSE market</span><strong>Inspected steeds only</strong><p>HORSE listings pay the full price to the seller. Objkt tez asks can be purchased here through Objkt’s own contract.</p></div>}
      <div className="rail-section"><span className="eyebrow">Race leader</span><strong>{leaderboard[0] ? traderName(leaderboard[0].name, leaderboard[0].address) : "The starting gate"}</strong><p>{leaderboard[0] ? `${leaderboard[0].trades} ${leaderboard[0].trades === 1 ? "trade" : "trades"} this season` : "No riders ranked yet."}</p></div>
      {routeSection === "profile" && validProfileAddress && <div className="rail-section"><span className="eyebrow">Trader in your sights</span><strong>{traderName(profileIdentityQuery.data?.displayName ?? profileRider?.name, validProfileAddress)}</strong><p>{profileRider?.trades ?? 0} season trades · {profileOffersQuery.data?.offers.length ?? 0} active trade signs</p></div>}
      {statusAddress && <div className="rail-section"><span className="eyebrow">Trader in your sights</span><strong>{shortAddress(statusAddress)}</strong><p>Standing and inspection notes are open in the main trail.</p></div>}
      <div className="rail-section"><span className="eyebrow">Your saddle</span>{address ? <><strong>{shortAddress(address)}</strong><p>{personal ? `${personal.received} received · ${personal.sent} sent` : "Reading your horse ledger."}</p></> : <><strong>Guest rider</strong><p>Connect a wallet to see your horses, posse, and claim.</p></>}</div>
      {claimAlert && <div className="rail-section"><span className="eyebrow">HORSE waiting</span><span className="rail-number">{formatHorseAmount(claimAlert.claimableRaw, 8)}</span><p>Earned HORSE · your wallet pays XTZ gas to claim.</p></div>}
    </AsideRail>}>
      <Shell data-horf-app data-horf-page={routeSection}>
        {routeSection === "race" && <Masthead data-horf-region="intro">
          <div>
            <small>WTF OS · Tezos horse trading</small>
            <h1>HORF! <span aria-hidden="true">★</span></h1>
            <p>Howdy, horse trader. Connect your wallet to open your stable and rider profile. Find horses, trade with the posse, and follow the race.{isGuest ? " No WTF OS sign-in needed." : ""}</p>
            <IntroActions>
              <Action type="button" $primary onClick={() => navigateHorf("/horf/traders")}><span aria-hidden="true">🐎 </span>Find horse traders</Action>
              <Action data-horf-open-range-open type="button" style={{ backgroundImage: "url('/horf-art/lasso.svg')", backgroundPosition: "8px center", backgroundSize: 18, backgroundRepeat: "no-repeat", paddingLeft: 31 }} onClick={() => navigateHorf("/horf/open-range")}>Browse the Open Range</Action>
              {!address && <Action data-horf-wallet-connect-intro type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting wallet…" : isGuest ? "Connect and verify wallet" : "Connect Tezos wallet"}</Action>}
              {!isGuest && <Action type="button" onClick={() => windowManager.openPage("/trade-boards")}>Browse Trade Boards</Action>}
            </IntroActions>
          </div>
          <WantedPoster data-horf-wanted-poster aria-label={`${seasonDisplayName} horse trader notice`}>
            <span className="wanted">Wanted</span>
            <span className="traders">Horse traders · all riders welcome</span>
            <div className="horse-art"><img src="/horf-art/horse-portrait-photo.jpg" alt="A chestnut horse peers out from the wanted poster" /></div>
            <h2>{seasonDisplayName}</h2>
            {selectedSeasonKey === CURRENT_SEASON_KEY ? <>
              <span className="reward"><strong>10 $HORSE</strong><span>per recognized horse trade/send</span></span>
              <p>Neighvember 2026 sender only, for each qualifying horse edition. Return a ride to earn your own.</p>
            </> : <>
              <span className="reward"><strong>Past rides</strong><span>Archive race board</span></span>
              <p>Follow the hoofprints from this earlier season.</p>
            </>}
          </WantedPoster>
        </Masthead>}

        {routeSection === "race" && <HorfSeasonArt />}

        {routeSection !== "stable" && <WalletStatus data-horf-wallet-status role="status">
          {address ? `${isGuest ? "Horf wallet verified" : "WTF OS wallet selected"}: ${shortAddress(address)} · Tezos Mainnet`
            : isGuest && guestSessionLoading ? "Checking for a saved Horf wallet proof…"
            : isGuest && localWalletAddress ? `Wallet ${shortAddress(localWalletAddress)} is connected locally. Verify it to unlock your Horf ledger and wallet actions.`
            : isGuest ? "You can watch the race without signing in. Connect and sign a wallet challenge to use your personal Horf ledger and wallet actions."
            : "Connect your Tezos wallet to use your personal Horf ledger and wallet actions."}
          {isGuest && address && <button data-horf-wallet-disconnect type="button" onClick={() => void disconnectWallet()} disabled={isConnecting}>{isConnecting ? "Disconnecting…" : "Disconnect Horf wallet"}</button>}
        </WalletStatus>}
        {routeSection === "race" && claimAlert && <ClaimNotice data-horf-claim-alert role="status" aria-live="polite"><span>🐎 Claim alert: {formatHorseAmount(claimAlert.claimableRaw, 8)} HORSE is shown as earned from this wallet’s qualifying horse sends{claimAlert.status !== "ready" ? " (provisional while Horf scans Mainnet)" : ""}. {claimAlert.claimReady ? "Claim it from the Mainnet vault; your wallet pays XTZ gas." : "Vault claiming is waiting for its Mainnet setup or season scan."}</span><button type="button" onClick={() => navigateHorf("/horf/send-horse")}>See HORSE claim</button></ClaimNotice>}
        {walletError && <Warning role="alert">{walletError}</Warning>}

        {(routeSection === "race" || routeSection === "stable" || routeSection === "traders" || routeSection === "profile") && <SeasonPicker data-horf-region="season" aria-label="Trading season">
          <div>
            <label htmlFor="horf-season-select">Trading season</label>
            <select
              id="horf-season-select"
              data-horf-season-select
              value={selectedSeasonKey}
              aria-describedby={selectedSeason?.inferred ? "horf-season-boundary horf-season-inference" : "horf-season-boundary"}
              onChange={(event) => selectSeason(event.currentTarget.value)}
            >
              <option value="all-time">All time · tracked seasons</option>
              {!availableSeasons.some((season) => season.key === selectedSeasonKey) && selectedSeasonKey !== "all-time" && (
                <option value={selectedSeasonKey}>{selectedSeasonKey === CURRENT_SEASON_KEY ? "Neighvember 2026" : selectedSeasonKey}</option>
              )}
              {!availableSeasons.length && selectedSeasonKey !== CURRENT_SEASON_KEY && (
                <option value={CURRENT_SEASON_KEY}>Neighvember 2026</option>
              )}
              {availableSeasons.filter((season) => season.key !== "all-time").map((season) => (
                <option key={season.key} value={season.key}>
                  {season.key === CURRENT_SEASON_KEY ? "Neighvember 2026" : season.label}{season.inferred ? " · archive" : " · current"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <strong id="horf-season-boundary">{selectedSeasonKey === "all-time" ? "Tracked seasons combined" : selectedSeason ? seasonDateRange(selectedSeason) : "Loading campaign dates…"}</strong>
            {selectedSeasonKey === "all-time" ? <small id="horf-season-inference">All time combines tracked seasons. Rider notes below show {profileSeasonLabel}; wallet horses show current holdings.</small> : selectedSeason?.inferred && (
              <small id="horf-season-inference">Archive dates are inferred from Objkt mint clusters and organizer posts; boundaries may differ from an official calendar.</small>
            )}
          </div>
        </SeasonPicker>}

        {(routeSection === "race" || routeSection === "traders") && <><StatusBar aria-live="polite">
          <span>
            {query.isPending ? "Reading the season ledger…" : hasError ? "Season ledger needs attention" : countsProvisional ? "Scanning Tezos history · counts are provisional" : "Season ledger ready"}
            {data?.asOf ? ` · As of ${formatDate(data.asOf)}` : " · Awaiting first snapshot"}
          </span>
          <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? "Updating…" : hasError ? "Retry season ledger" : "Refresh race and ledger"}
          </button>
        </StatusBar>
        {countsProvisional && <Warning role="status">Horf is scanning mainnet transfers. Race positions, horse totals, and return rides may change as transfers are found.</Warning>}
        {hasError && <Warning role="alert">Horf could not finish reading the season. Retry the ledger; any figures shown below are the last available snapshot.</Warning>}</>}
        {personal?.blacklisted === true && <Warning data-horf-wallet-restricted role="alert">This wallet is blacklisted from Horf private API features. Its historical trade totals remain visible. Direct Stable claims need a separate admin-signed contract restriction; Horf cannot reverse Tezos transfers.</Warning>}

        {routeSection === "traders" && <Section data-horf-region="trader-directory" aria-label="Find other Horf traders" tabIndex={-1}>
          <SectionLabel>🤠 The horse trader directory</SectionLabel>
          <h2>Find Other Traders</h2>
          <p>Meet riders from {seasonDisplayName} and wallets with horses currently offered on Horf. Open a trader’s profile to see their trade signs and qualifying horses.</p>
          {directoryOffersQuery.isError && <Warning role="status">Active trade signs are taking longer to load. The season riders are still listed below.</Warning>}
          {directory.length ? <DirectoryGrid>
            {directory.map((rider, index) => <DirectoryCard key={rider.address} data-horf-trader-card>
              <span className="rider-rank">{rider.trades ? `Race position ${index + 1}` : "Rider with a trade sign"}</span>
              <TraderLink address={rider.address} name={rider.name} />
              <p><strong>{rider.trades}</strong> {rider.trades === 1 ? "season trade" : "season trades"} · <strong>{rider.offerCount}</strong> {rider.offerCount === 1 ? "horse offered" : "horses offered"}</p>
              <HorfTradeHorseCarousel address={rider.address} />
              {rider.address !== address && <Action data-horf-trader-quick-send type="button" $primary aria-label={`Send a horse to ${traderName(rider.name, rider.address)}`} onClick={(event) => openQuickSend(rider, event.currentTarget)}>Send a horse 🐎</Action>}
            </DirectoryCard>)}
          </DirectoryGrid> : <LedgerPanel><h3>{query.isPending || directoryOffersQuery.isPending ? "Gathering the riders…" : "No riders at the rail yet"}</h3><p>Try another season or check the Open Range for new horse trade signs.</p></LedgerPanel>}
        </Section>}

        {routeSection === "profile" && <Section data-horf-region="trader-profile" aria-label="Horf trader profile">
          <SectionLabel>🐎 Trader’s saddle</SectionLabel>
          {validProfileAddress ? <>
            <h2>{traderName(profileIdentityQuery.data?.displayName ?? profileRider?.name, validProfileAddress)}</h2>
            <p>{validProfileAddress} · {profileRider?.trades ?? 0} {profileRider?.trades === 1 ? "trade" : "trades"} in {seasonDisplayName}. <a href={profileUrl(validProfileAddress)} target="_blank" rel="noopener noreferrer">View wallet on Objkt ↗</a></p>
            <Link href={`/horf/traders?season=${encodeURIComponent(selectedSeasonKey)}`}>← Back to other traders</Link>
            <HorfPublicTraderProfile address={validProfileAddress} seasonKey={profileSeasonKey} seasonLabel={profileSeasonLabel} />
            <ProfileTabs role="tablist" aria-label="Trader horse collections">
              <button type="button" role="tab" id="horf-profile-tab-for-trade" data-horf-profile-tab="for-trade" aria-selected={profileTab === "for-trade"} aria-controls="horf-profile-panel" onClick={() => selectProfileTab("for-trade")}>For trade on Horf</button>
              <button type="button" role="tab" id="horf-profile-tab-all-horses" data-horf-profile-tab="all-horses" aria-selected={profileTab === "all-horses"} aria-controls="horf-profile-panel" onClick={() => selectProfileTab("all-horses")}>All horses held</button>
            </ProfileTabs>
            <div id="horf-profile-panel" role="tabpanel" aria-labelledby={profileTab === "for-trade" ? "horf-profile-tab-for-trade" : "horf-profile-tab-all-horses"}>
              {profileTab === "for-trade" ? <>
                <p>These horses have active direct-trade signs on Horf. A sign expresses a trader’s preference; the horse stays in their wallet until a transfer.</p>
                {profileOffersQuery.isPending ? <p>Reading this rider’s trade signs…</p> : profileOffersQuery.isError ? <Warning role="alert">Trade signs could not be loaded. Try again shortly.</Warning> : profileOffersQuery.data?.offers.length ? <ProfileHorseGrid>
                  {profileOffersQuery.data.offers.map((offer) => {
                    const name = offer.name || `Horse token #${offer.tokenId}`;
                    return <ProfileHorseCard key={offer.id} data-horf-profile-horse>
                      <div className="art">{resolveHorfHorseVideo(offer) ? <ProfileArt media={offer} name={name} uniqueThumbnails={profileMarshalQuery.data?.active ? undefined : profileThumbnails} card /> : <button className="art-open" type="button" aria-label={`View ${name} horse card`} onClick={() => setSelectedProfileHorse(offer)}><ProfileArt media={offer} name={name} uniqueThumbnails={profileMarshalQuery.data?.active ? undefined : profileThumbnails} card /></button>}</div>
                      <div className="copy"><h3><button type="button" onClick={() => setSelectedProfileHorse(offer)}>{name}</button></h3><p>{offer.amount} {offer.amount === "1" ? "edition" : "editions"} offered · {offer.acceptedTokenPolicy === "marshal_only" ? "Marshal-approved horse wanted" : "Any qualifying horse welcome"}</p><p data-horf-edition-holdings>{holdingsText(offer.ownerBalance, offer.viewerBalance, Boolean(address))}</p><a href={objktTokenUrl(offer.tokenContract, offer.tokenId)} target="_blank" rel="noopener noreferrer">View token on Objkt ↗</a><Action data-horf-profile-view-horse type="button" onClick={() => setSelectedProfileHorse(offer)}>View horse card</Action></div>
                    </ProfileHorseCard>;
                  })}
                </ProfileHorseGrid> : <LedgerPanel><h3>No trade signs up</h3><p>This rider has no horses offered for direct trade on Horf right now.</p></LedgerPanel>}
              </> : <>
                <p>Every currently held token that passes Horf’s <Link href="/horf/info">Is It a Horse? Test</Link>, across mint dates. Balances come from Tezos Mainnet.</p>
                {profileMarshalQuery.data?.active && <Action data-horf-profile-approve-all type="button" disabled={profileApprovalBusy} onClick={() => void approveAllProfileHorses()}>{profileApprovalBusy ? "Checking the herd…" : "Approve all held horses"}</Action>}
                {profileApprovalStatus && <p data-horf-profile-approval-progress role="status" aria-live="polite">{profileApprovalStatus}</p>}
                {Object.entries(profileApprovalResults).filter(([, result]) => result.status === "failed").map(([key, result]) => <Warning key={key} data-horf-profile-approval-failure role="alert">{key}: {result.message}</Warning>)}
                {profileHorsesQuery.isPending ? <p>Checking this rider’s stable…</p> : profileHorsesQuery.isError ? <Warning role="alert">This rider’s horses could not be loaded. Try again shortly.</Warning> : <>
                  {profileHorses.length > 0 ? <ProfileHorseGrid>{profileHorses.map((horse) => {
                    const name = horse.name || `Horse token #${horse.tokenId}`;
                    const mintedSeason = findHorfMintSeason(horse, availableSeasons);
                    const approval = profileApprovalResults[`${horse.contract}/${horse.tokenId}`];
                    const isApproved = horse.approvedForMarshalsMarket || approval?.status === "approved";
                    return <ProfileHorseCard key={`${horse.contract}:${horse.tokenId}`} data-horf-profile-horse>
                      <div className="art">{resolveHorfHorseVideo(horse) ? <ProfileArt media={horse} name={name} uniqueThumbnails={profileMarshalQuery.data?.active ? undefined : profileThumbnails} card /> : <button className="art-open" type="button" aria-label={`View ${name} horse card`} onClick={() => setSelectedProfileHorse(horse)}><ProfileArt media={horse} name={name} uniqueThumbnails={profileMarshalQuery.data?.active ? undefined : profileThumbnails} card /></button>}</div>
                      <div className="copy"><h3><button type="button" onClick={() => setSelectedProfileHorse(horse)}>{name}</button></h3>{mintedSeason && <span className="mint-badge" data-horf-mint-badge><img src="/horf-art/horseshoe.svg" alt="" aria-hidden="true" />{mintedSeason.label}</span>}<p data-horf-edition-holdings>{holdingsText(horse.balance, horse.viewerBalance, Boolean(address))}</p><p>{shortAddress(horse.contract)} / #{horse.tokenId}</p><a href={objktTokenUrl(horse.contract, horse.tokenId)} target="_blank" rel="noopener noreferrer">View token on Objkt ↗</a><Action data-horf-profile-view-horse type="button" onClick={() => setSelectedProfileHorse(horse)}>View horse card</Action>{isApproved && <p data-horf-profile-approved>✦ Marshal approved</p>}{profileMarshalQuery.data?.active && !isApproved && <Action data-horf-profile-approve-horse type="button" disabled={profileApprovalBusy} onClick={() => void approveProfileHorse(horse)}>Approve this horse</Action>}</div>
                    </ProfileHorseCard>;
                  })}</ProfileHorseGrid> : <LedgerPanel><h3>No qualifying horses on the scanned pages</h3><p>{profileHorsesQuery.hasNextPage ? "This wallet has more editions to check. Load the next page to keep looking." : "There are no current balances that pass the horse test for this wallet."}</p></LedgerPanel>}
                  {profileHorsesQuery.hasNextPage && <Action type="button" onClick={() => void profileHorsesQuery.fetchNextPage()} disabled={profileHorsesQuery.isFetchingNextPage}>{profileHorsesQuery.isFetchingNextPage ? "Rounding up more horses…" : "Load more horses"}</Action>}
                </>}
              </>}
            </div>
            <ProfileHorseDetail ref={profileHorseDialogRef} data-horf-profile-horse-detail aria-label="Horse card" onClose={() => setSelectedProfileHorse(null)} onClick={(event) => { if (event.target === event.currentTarget) setSelectedProfileHorse(null); }}>
              {selectedProfileHorse && selectedProfileContract && <>
                <div className="detail-head"><div><small>🐎 Horf horse card · {validProfileAddress}</small><h2>{selectedProfileName}</h2></div><Action type="button" onClick={() => setSelectedProfileHorse(null)}>Close horse card</Action></div>
                <div className="detail-grid"><div className="detail-art"><ProfileArt key={`${selectedProfileContract}/${selectedProfileHorse.tokenId}`} media={selectedProfileHorse} name={selectedProfileName} /></div><div className="detail-copy">
                  <p><strong>Token:</strong> {selectedProfileContract} / #{selectedProfileHorse.tokenId}</p>
                  {"balance" in selectedProfileHorse && <p><strong>Trader holds:</strong> {selectedProfileHorse.balance} {selectedProfileHorse.balance === "1" ? "edition" : "editions"}</p>}
                  {"amount" in selectedProfileHorse && <p><strong>For trade:</strong> {selectedProfileHorse.amount} {selectedProfileHorse.amount === "1" ? "edition" : "editions"} · {selectedProfileHorse.acceptedTokenPolicy === "marshal_only" ? "Marshal-approved horse wanted" : "Any qualifying horse welcome"}</p>}
                  {"mintedAt" in selectedProfileHorse && selectedProfileHorse.mintedAt && <p><strong>Minted:</strong> {new Date(selectedProfileHorse.mintedAt).toLocaleDateString()}</p>}
                  {"creatorAddress" in selectedProfileHorse && selectedProfileHorse.creatorAddress && <p><strong>Creator:</strong> {selectedProfileHorse.creatorAddress}</p>}
                  {"description" in selectedProfileHorse && selectedProfileHorse.description && <p>{selectedProfileHorse.description}</p>}
                  {"contract" in selectedProfileHorse && (selectedProfileHorse.approvedForMarshalsMarket || profileApprovalResults[`${selectedProfileHorse.contract}/${selectedProfileHorse.tokenId}`]?.status === "approved") && <p>✦ Marshal approved</p>}
                  <p><a href={objktTokenUrl(selectedProfileContract, selectedProfileHorse.tokenId)} target="_blank" rel="noopener noreferrer">View exact token on Objkt ↗</a></p>
                  {"contract" in selectedProfileHorse && profileMarshalQuery.data?.active && !selectedProfileHorse.approvedForMarshalsMarket && profileApprovalResults[`${selectedProfileHorse.contract}/${selectedProfileHorse.tokenId}`]?.status !== "approved" && <Action data-horf-profile-detail-approve type="button" disabled={profileApprovalBusy} onClick={() => void approveProfileHorse(selectedProfileHorse)}>Approve this horse</Action>}
                </div></div>
              </>}
            </ProfileHorseDetail>
          </> : <LedgerPanel><h3>That rider’s address is off trail</h3><p>Choose a Tezos wallet from the trader directory to see its horse profile.</p><Link href={`/horf/traders?season=${encodeURIComponent(selectedSeasonKey)}`}>Return to other traders</Link></LedgerPanel>}
        </Section>}

        {routeSection === "info" && <Section data-horf-region="horse-test-info" aria-label="Horf Is It a Horse Test">
          <SectionLabel>🐴 The Horf field guide</SectionLabel>
          <h2>Is It a Horse?</h2>
          <p>Horf uses the same horse test for Open Range discovery and a trader’s “All horses held” profile tab. A Tezos Mainnet FA2 edition must be indexed by Objkt and be a whole token (zero or unset decimals). The profile shows qualifying editions the wallet currently holds.</p>
          <LedgerPanel><h3>Words that open the stable gate</h3><HorseTestList>
            <li>Objkt mint tags with whole-keyword matches: horse, horseart, horse art, horsetrade, horse trade, horse trader, horse trading, and horf.</li>
            <li>Neighvember and Horse of July mint tags, including year-suffixed campaign names. A word in the title or description alone does not qualify.</li>
            <li>A HAHA mint tag by itself needs a Marshal’s approval before the token appears as a horse or counts as a trade.</li>
            <li>Other equine-related Objkt tag groups, such as pony, mare, or foal, when Objkt shows more than five tokens in that tag. Substrings such as “horsepower” and “neighbor” do not count.</li>
          </HorseTestList></LedgerPanel>
          <LedgerPanel><h3>What counts as a trade?</h3><HorseTestList>
            <li>The horse edition must actually move between two different wallets on Tezos Mainnet during the selected trading season.</li>
            <li>Horf ignores reverted transfers, marketplace or contract handoffs, non-positive amounts, and tokens with fractional decimals. The HORSE reward currency is excluded from horse trade counts.</li>
            <li>A token’s mint date chooses its Open Range season. Its transfer date chooses which race season counts the ride.</li>
            <li>Passing the horse test makes art discoverable and direct trades countable. Marshal inspection is a separate approval before an edition may enter an inspected escrow Stable.</li>
          </HorseTestList></LedgerPanel>
          <p><Link href="/horf/open-range?season=all-horse-search">Search every qualifying horse on the Open Range →</Link></p>
        </Section>}

        {routeSection === "race" && <Section id="horf-race" data-horf-region="race" aria-label="Horse trader race leaderboard">
          <SectionLabel><img src="/horf-art/horseshoe.svg" alt="" aria-hidden="true" width="20" height="20" style={{ verticalAlign: "middle", marginRight: 5 }} />Midway race board</SectionLabel>
          <h2>Who’s out in front?</h2>
          <p>Every counted horse trade gives a rider a little more giddyup. Rank and trade totals sit beside each horse, whether the trade rode through a Stable or crossed wallets directly.</p>
          <RaceFrame>
            <RaceHeader><span>Riders · {seasonDisplayName}</span><span>Finish line</span></RaceHeader>
            {leaderboard.length ? (
              <Race>
                {leaderboard.map((row, index) => (
                <Lane key={row.address} data-horf-lane data-horf-trades={row.trades}>
                  <Rider>
                    <Rank aria-label={`Rank ${index + 1}`}>{index + 1}</Rank>
                    <TraderLink address={row.address} name={row.name} />
                    {row.blacklisted === true && <BlacklistBadge data-horf-blacklist-badge type="button" onClick={() => viewTraderStatus(row.address)} aria-label={`View Horf blacklist details for ${row.name || row.address}`}>Blacklisted · details</BlacklistBadge>}
                  </Rider>
                  <Track aria-hidden="true">
                    <Runner style={{ left: `${5 + (row.trades / leadTrades) * 74}%` }}><HorseGlyph /></Runner>
                  </Track>
                  <LaneScore><strong>{row.trades}</strong><span>{row.trades === 1 ? "trade" : "trades"}</span></LaneScore>
                </Lane>
                ))}
              </Race>
            ) : (
              <p style={{ margin: 0, padding: "18px 12px" }}>
                {query.isPending ? "Riders are being gathered…" : hasError ? "Race board unavailable. Retry the season ledger." : countsProvisional ? "Scanning for riders…" : "No horse traders recorded yet."}
              </p>
            )}
          </RaceFrame>
        </Section>}

        {routeSection === "stable" && <HorfPersonalStable address={address} connectWallet={connectWallet} isConnecting={isConnecting} seasonKey={profileSeasonKey} seasonLabel={profileSeasonLabel} seasons={availableSeasons} />}
        {routeSection === "marshal" && <TradingZone id="horf-marshals-market" data-horf-region="marshals-market">
          <small>Marshal-approved horses · escrow route</small>
          <h2>Marshal’s Market</h2>
          <p>Browse approved horses currently listed for swap. Connect a wallet to claim one or list an approved horse of your own.</p>
          <HorfStables address={address} connectWallet={connectWallet} isConnecting={isConnecting} />
        </TradingZone>}
        {routeSection === "inspection-desk" && (profileMarshalQuery.isPending
          ? <Section role="status">Checking your Marshal badge…</Section>
          : profileMarshalQuery.data?.active
            ? <HorfInspectorDesk isGuest={isGuest} isAdmin={isAdmin} />
            : <Section role="alert"><h2>Marshal badge required</h2><p>The Inspection Desk opens for signed-in HORF MARSHALs.</p></Section>)}
        {routeSection === "outlaw" && <TradingZone id="horf-outlaw-corral" data-horf-region="outlaw-corral" $outlaw>
          <small>Qualifying horse art · direct wallet route</small>
          <h2>Outlaw Corral</h2>
          <p>Trade or gift qualifying horses directly, without inspection or escrow. Confirmed sends count in the race. Wallet transfers are final, so check the rider and horse first.</p>
          <ZoneAction type="button" onClick={() => navigateHorf("/horf/open-range")}>Browse trust-based direct offers on the Open Range</ZoneAction>
          <ZoneAction type="button" onClick={() => navigateHorf("/horf/gifts")}>Gift a horse or tend your posse</ZoneAction>
          <HorfTraderStatus selectedAddress={traderFromUrl ?? statusAddress ?? address} walletAddress={address} onSelect={viewTraderStatus} isAdmin={isAdmin} onChange={() => void query.refetch()} />
        </TradingZone>}
        {routeSection === "horse" && <HorfHorseSend address={address} signedIn={!isGuest} connectWallet={connectWallet} isConnecting={isConnecting} />}
        {routeSection === "horse-market" && <HorfHorseMarket address={address} connectWallet={connectWallet} isConnecting={isConnecting} />}
        {routeSection === "haha" && <HahaCrp />}
        {routeSection === "gifts" && <HorfGifts address={address} isGuest={isGuest} connectWallet={connectWallet} isConnecting={isConnecting} />}
        {routeSection === "posse" && <HorfPosse address={address} connectWallet={connectWallet} isConnecting={isConnecting} />}

        {routeSection === "stable" && <Section data-horf-region="trader-ledger" aria-label="Your horse trader ledger" tabIndex={-1}>
          <SectionLabel>Your stable</SectionLabel>
          <h2>Your horse trading ledger</h2>
          {!address ? (
            <LedgerPanel>
              <h3>{isGuest ? "Connect and verify your Tezos wallet" : "Connect your Tezos wallet"}</h3>
              <p>See horses received from other traders, who is waiting for a horse back, and every counted trade this season.</p>
              <Action data-horf-wallet-connect type="button" $primary onClick={() => void connectWallet()} disabled={isConnecting}>
                {isConnecting ? "Connecting wallet…" : isGuest ? "Connect and verify wallet" : "Connect Tezos wallet"}
              </Action>
              {walletError && <Warning role="alert">{walletError}</Warning>}
            </LedgerPanel>
          ) : (
            <>
              <p>Showing {shortAddress(address)} · Tezos mainnet{countsProvisional ? " · provisional totals" : ""}</p>
              <RuleNote>Each eligible wallet transfer, confirmed Horf Stable claim, and verified gift counts one trade per horse token unit for both traders. Ordinary direct wallet-to-wallet trades create social return rides; Stable claims and marked gifts do not. Sending a horse back to the same direct trader offsets one received horse. “Owed” is a social return ledger, not an on-chain obligation.</RuleNote>
              {personal ? (
                <>
                  <MetricStrip>
                    <div><strong>{personal.received}</strong><span>Horses received</span></div>
                    <div><strong>{personal.sent}</strong><span>Horses sent</span></div>
                    <div><strong>{personal.trades}</strong><span>Season trades</span></div>
                  </MetricStrip>
                  <Section data-horf-region="waiting-horses">
                    <SectionLabel>In your stable</SectionLabel>
                    <h2>Waiting for a return ride</h2>
                    <p>These received horses still have no matching send back to the same trader.</p>
                    {waitingHorses.length ? (
                      <ReceiptList>
                        {waitingHorses.map((horse) => (
                          <li key={horse.id} data-horf-waiting-horse>
                            <ReceiptDirection $in>Waiting</ReceiptDirection>
                            <div>
                              <a href={tokenUrl(horse.token)} target="_blank" rel="noopener noreferrer">{horse.token.name || `Token #${horse.token.tokenId}`}</a>
                              <small>From <TraderLink address={horse.from} /> · {formatDate(horse.timestamp)}</small>
                              {horse.from !== address && <Action data-horf-return-send className="return-send-action" type="button" aria-label={`Send a return horse to ${traderName(personal.owedTo.find((row) => row.address === horse.from)?.name ?? null, horse.from)}`} onClick={(event) => openQuickSend({ address: horse.from, name: personal.owedTo.find((row) => row.address === horse.from)?.name ?? null }, event.currentTarget)}>Send a return horse 🐎</Action>}
                            </div>
                            <strong>{horse.amount} {horse.amount === 1 ? "horse" : "horses"}</strong>
                          </li>
                        ))}
                      </ReceiptList>
                    ) : <p>{countsProvisional ? "The scan is still checking which received horses need a return." : "Every received horse has a matching return ride, or no horses have arrived yet."}</p>}
                  </Section>
                  <Ledger>
                    <TraderListPanel region="owed-to" title="Return rides you owe" description="Traders who sent you horses and are waiting for one back." rows={personal.owedTo} empty="No return rides are waiting on you." onSend={openQuickSend} currentWallet={address} />
                    <TraderListPanel region="owed-by" title="Return rides owed to you" description="Traders you sent horses to who have not sent one back." rows={personal.owedBy} empty="No return rides are owed to you." />
                  </Ledger>
                  <Section data-horf-region="recent">
                    <SectionLabel>Season log</SectionLabel>
                    <h2>Recent horse transfers</h2>
                    {personal.recent.length ? (
                      <ReceiptList>
                        {personal.recent.map((receipt) => (
                          <li key={receipt.id}>
                            <ReceiptDirection $in={receipt.direction === "in"}>{receipt.direction === "in" ? "Received" : "Sent"}</ReceiptDirection>
                            <div>
                              <a href={tokenUrl(receipt.token)} target="_blank" rel="noopener noreferrer">{receipt.token.name || `Token #${receipt.token.tokenId}`}</a>
                              <small>{receipt.direction === "in" ? "From" : "To"} <TraderLink address={receipt.counterparty} /> · {formatDate(receipt.timestamp)}{receipt.settlement === "stable" ? " · via Horf Stable" : receipt.settlement === "gift" ? " · gifted horse" : ""}</small>
                            </div>
                            <strong>{receipt.amount} {receipt.amount === 1 ? "horse" : "horses"}</strong>
                          </li>
                        ))}
                      </ReceiptList>
                    ) : <p>{countsProvisional ? "The scan has not found your recent horse transfers yet." : "No horse transfers for this wallet this season."}</p>}
                  </Section>
                </>
              ) : (
                <LedgerPanel>
                  <h3>{hasError ? "Ledger unavailable" : query.isPending || countsProvisional ? "Finding your horses…" : "No horse trades yet"}</h3>
                  <p>{hasError ? "Retry the season ledger to load this wallet's horse trades." : query.isPending || countsProvisional ? "Your wallet history is still being checked. These counts are not final." : "This wallet has no qualifying horse transfers in the selected season. The race board is still open for discovering traders."}</p>
                </LedgerPanel>
              )}
            </>
          )}
        </Section>}
        {quickSendRider && <QuickSendDialog ref={quickSendDialogRef} data-horf-quick-send-dialog aria-labelledby="horf-quick-send-title" onCancel={(event) => { if (quickSendBusy) event.preventDefault(); }} onClose={closeQuickSend} onClick={(event) => { if (event.target === event.currentTarget && !quickSendBusy) event.currentTarget.close(); }}>
          <div className="quick-head"><div><small>🐎 Quick trade</small><h2 id="horf-quick-send-title">Send a horse to {traderName(quickSendRider.name, quickSendRider.address)}</h2></div><button data-horf-quick-send-close type="button" aria-label="Close horse send" disabled={quickSendBusy} onClick={() => quickSendDialogRef.current?.close()}>×</button></div>
          <div className="quick-body"><HorfGifts key={quickSendRider.address} address={address} isGuest={isGuest} connectWallet={connectWallet} isConnecting={isConnecting} quickRecipient={quickSendRider} onQuickBusyChange={setQuickSendBusy} /></div>
        </QuickSendDialog>}
      </Shell>
    </HorfFrame>
  );
}
