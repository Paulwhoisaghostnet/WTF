import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import styled from "styled-components";
import { HorfFrame } from "../features/horf/HorfFrame";
import { HorfStables } from "../features/horf/HorfStables";
import { HorfHorseSend } from "../features/horf/HorfHorseSend";
import { HorfGifts } from "../features/horf/HorfGifts";
import { HorfPosse } from "../features/horf/HorfPosse";
import { HorfTradeHorseCarousel } from "../features/horf/HorfTradeHorseCarousel";
import { HorfTraderStatus } from "../features/horf/HorfTraderStatus";
import { HorfPersonalStable } from "../features/horf/HorfPersonalStable";
import { HorfInspectorDesk } from "../features/horf/HorfInspectorDesk";
import { formatHorseAmount } from "../features/horf/recipient-input";
import { objktTokenUrl } from "../features/horf/token-input";
import { useHorfWallet } from "../features/horf/useHorfWallet";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { logClientSystemEvent } from "../lib/system-log";
import { advanceResolvedMediaFallback, resolveTokenThumbnail } from "../lib/media-resolve";
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
  tokenContract: string;
  tokenId: string;
  amount: string;
  acceptedTokenPolicy: "marshal_only" | "any_qualifying";
  name: string | null;
  image: string | null;
};

type PublicHeldHorse = {
  contract: string;
  tokenId: string;
  balance: string;
  name: string | null;
  image: string | null;
  description: string | null;
  creatorAddress: string | null;
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
  return new URLSearchParams(window.location.search).get("season")?.trim() || CURRENT_SEASON_KEY;
}

function writeSeasonKeyToUrl(key: string): void {
  if (!isHorfLocation()) return;
  const url = new URL(window.location.href);
  if (url.searchParams.get("season") === key) return;
  url.searchParams.set("season", key);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

const Shell = styled.div`
  --horf-ink: #142b29;
  --horf-muted: #60716c;
  --horf-line: #dbe4dd;
  --horf-coral: #ed684b;
  --horf-teal: #087d74;
  min-height: 100%;
  min-width: 0;
  width: 100%;
  max-width: 1460px;
  margin: 0 auto;
  padding: clamp(16px, 2.4vw, 38px);
  box-sizing: border-box;
  color: var(--horf-ink);
  background: #f6f8f5;
  font-family: var(--horf-font, ui-sans-serif, system-ui, sans-serif);
  container-type: inline-size;

  * { box-sizing: border-box; }
  a { color: #08736c; }
  button:focus-visible, a:focus-visible, select:focus-visible, input:focus-visible {
    outline: 3px solid #ff9b73;
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
  background: linear-gradient(125deg, #102a29 0%, #153b36 66%, #0b302e 100%);
  color: #f7fbf5;
  box-shadow: 0 7px 0 rgba(14, 45, 39, 0.12);

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
    color: #fffdf3;
    font: 800 clamp(58px, 8cqw, 114px)/.82 var(--horf-display, Georgia, serif);
    letter-spacing: -.04em;
  }
  h1 span { color: #f2a767; font-size: .52em; vertical-align: top; }
  p { max-width: 660px; margin: 0; color: #c8dcd1; font-size: clamp(15px, 1.15vw, 18px); line-height: 1.58; }
  small {
    display: inline-flex;
    align-items: center;
    min-height: 30px;
    padding: 5px 11px;
    border: 1px solid rgba(197, 231, 209, .35);
    border-radius: 999px;
    color: #d6edda;
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
  background: #f6b779;
  color: #16302d;
  box-shadow: 0 20px 36px rgba(0, 0, 0, .2);
  transform: rotate(2deg);
  font-family: var(--horf-font, ui-sans-serif, system-ui, sans-serif);
  .wanted { display: block; color: #173732; font: 900 12px/1.2 ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; letter-spacing: .18em; }
  .traders { display: block; margin: 5px 0 0; color: #734a39; font: 750 11px/1.35 ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; letter-spacing: .07em; }
  .horse-art { display: flex; align-items: center; justify-content: center; height: clamp(135px, 15cqw, 185px); min-height: 0; overflow: hidden; margin: 4px 0 8px; background: radial-gradient(circle at center, #ffda9d 0 34%, transparent 70%); }
  .horse-art img { display: block; width: auto; height: 100%; max-width: 90%; max-height: 100%; object-fit: contain; filter: drop-shadow(0 8px 8px rgba(71, 36, 19, .2)); }
  h2 { margin: 0 0 10px; font: 800 clamp(22px, 2.2cqw, 30px)/1.05 var(--horf-display, Georgia, serif); letter-spacing: -.04em; overflow-wrap: anywhere; }
  .reward { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 10px; padding: 11px 13px; border-radius: 12px; background: #153f3b; color: #fff9ea; }
  .reward strong { display: block; font: 800 clamp(22px, 2.2cqw, 30px)/1 var(--horf-display, sans-serif); white-space: nowrap; }
  .reward span { display: block; max-width: 126px; font: 700 11px/1.3 ui-sans-serif, system-ui, sans-serif; }
  p { margin: 0; color: #594635; font: 600 11px/1.42 ui-sans-serif, system-ui, sans-serif; }
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
  background: #fff;
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
    border: 1px solid #bccdc3;
    border-radius: 10px;
    color: var(--horf-ink);
    background: #f7faf7;
    font: 750 14px/1.3 ui-sans-serif, system-ui, sans-serif;
  }
  p { margin: 0; font-size: 13px; line-height: 1.4; }
  strong { display: block; color: #28423c; font: 700 14px/1.4 ui-sans-serif, system-ui, sans-serif; }
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
  border: 1px solid ${(p) => p.$primary ? "#c84f35" : "#d3ded5"};
  border-radius: 999px;
  background: ${(p) => p.$primary ? "#ed684b" : "#fff"};
  color: ${(p) => p.$primary ? "#fff" : "#28433d"};
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
  background: #eef3ef;
  color: #47615a;
  font: 650 12px/1.35 ui-sans-serif, system-ui, sans-serif;
  button {
    min-height: 32px;
    border: 0;
    border-radius: 999px;
    padding: 6px 11px;
    color: #fff;
    background: #1a635b;
    font: inherit;
    cursor: pointer;
  }
`;

const Warning = styled.div`
  margin-top: 10px;
  padding: 12px 15px;
  border: 1px solid #f0c3ad;
  border-left: 4px solid #d56b47;
  border-radius: 10px;
  background: #fff5ee;
  color: #7c3b2d;
  font: 650 13px/1.45 ui-sans-serif, system-ui, sans-serif;
`;

const WalletStatus = styled.div`
  margin-top: 16px;
  padding: 11px 15px;
  border: 1px solid #c9e3d9;
  border-radius: 10px;
  background: #eaf7ef;
  color: #2a5d4f;
  font: 650 12px/1.45 ui-sans-serif, system-ui, sans-serif;
  button { margin-left: 12px; padding: 5px 10px; border: 1px solid #65ad91; border-radius: 999px; background: #fff; color: #205947; cursor: pointer; font: inherit; }
  button:focus-visible { outline: 3px solid #ff9b73; outline-offset: 2px; }
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
  border: 1px solid #edcba4;
  border-radius: 12px;
  background: #fff1dc;
  color: #66462b;
  font: 650 13px/1.4 ui-sans-serif, system-ui, sans-serif;
  button { min-height: 36px; padding: 6px 11px; border: 0; border-radius: 999px; background: #173d37; color: #fff; cursor: pointer; font: inherit; }
`;

const TradingZone = styled.section<{ $outlaw?: boolean }>`
  margin-top: 42px;
  padding: clamp(18px, 2.2vw, 30px);
  border: 1px solid ${(p) => p.$outlaw ? "#f0d8cb" : "#c9ddd4"};
  border-radius: 22px;
  background: ${(p) => p.$outlaw ? "#fff9f4" : "#f1faf5"};
  min-width: 0;
  h2 { margin: 4px 0 9px; color: #17342f; font: 750 clamp(28px, 3cqw, 42px)/1.05 var(--horf-display, Georgia, serif); letter-spacing: -.04em; }
  > p { max-width: 850px; margin: 0 0 8px; color: #5c6d66; font-size: 14px; line-height: 1.6; }
  > small { color: ${(p) => p.$outlaw ? "#bd5d45" : "#277e68"}; font: 800 11px/1.3 ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; letter-spacing: .1em; }
  > section { margin-top: 14px; }
`;

const ZoneAction = styled.button`
  min-height: 40px;
  padding: 8px 14px;
  border: 1px solid #d85f45;
  border-radius: 999px;
  background: #ed684b;
  color: #fff;
  cursor: pointer;
  font: 750 12px/1.2 ui-sans-serif, system-ui, sans-serif;
  &:hover { background: #d8573e; }
`;

const Section = styled.section`
  margin-top: 42px;
  min-width: 0;
  h2 {
    margin: 0 0 8px;
    color: #193b34;
    font: 750 clamp(26px, 2.8cqw, 38px)/1.08 var(--horf-display, Georgia, serif);
    letter-spacing: -.045em;
  }
  > p { max-width: 800px; margin: 0 0 18px; color: #5c7068; font-size: 14px; line-height: 1.55; }
`;

const SectionLabel = styled.div`
  margin-bottom: 8px;
  color: #bd5f43;
  font: 800 11px/1.2 ui-sans-serif, system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: .12em;
`;

const RaceFrame = styled.div`
  overflow: hidden;
  border: 1px solid var(--horf-line);
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 14px 36px rgba(25, 67, 54, .055);
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
  background: #183b35;
  color: #e7f4e9;
  font: 800 11px/1.2 ui-sans-serif, system-ui, sans-serif;
  text-transform: uppercase;
  letter-spacing: .09em;
`;

const Lane = styled.li`
  display: grid;
  grid-template-columns: minmax(160px, .3fr) minmax(100px, 1fr) 86px;
  min-height: 66px;
  border-top: 1px solid #e5ebe6;
  background: #fff;
  &:nth-child(even) { background: #f9fbf8; }
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
  border: 1px solid #edb8aa;
  border-radius: 999px;
  background: #fff0ea;
  color: #9a4a37;
  cursor: pointer;
  font: 800 10px/1.1 ui-sans-serif, system-ui, sans-serif;
  text-transform: uppercase;
  &:focus-visible { outline: 3px solid #ff9b73; outline-offset: 2px; }
`;

const Rank = styled.span`
  flex: 0 0 auto;
  display: grid;
  place-content: center;
  width: 31px;
  height: 31px;
  border-radius: 50%;
  border: 0;
  background: #f4e2d4;
  color: #b65139;
  font: 850 12px ui-sans-serif, system-ui, sans-serif;
`;

const Track = styled.div`
  position: relative;
  overflow: hidden;
  min-width: 0;
  background: linear-gradient(90deg, transparent 0 3%, #e1eae2 3% 97%, transparent 97%) center / 100% 3px no-repeat;
  &::after { content: ""; position: absolute; right: 3%; top: 25%; bottom: 25%; border-right: 2px dashed #e99574; }
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
  color: #b8603b;
  transition: left 700ms ease-out;
  img { display: block; width: 58px; height: 48px; object-fit: contain; filter: drop-shadow(0 3px 2px rgba(73, 55, 37, .16)); }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const LaneScore = styled.div`
  display: grid;
  place-content: center;
  text-align: center;
  padding: 5px;
  border-left: 1px solid #e5ebe6;
  background: #edf6ef;
  color: #224c42;
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
  background: #fff;
  h3 { margin: 0 0 6px; color: #193b34; font: 750 20px/1.15 var(--horf-display, Georgia, serif); }
  p { margin: 0 0 12px; color: #5c7068; font-size: 13px; line-height: 1.5; }
`;

const MetricStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 17px 0 22px;
  > div { padding: 17px 18px; border: 1px solid var(--horf-line); border-radius: 14px; background: #eaf4ee; }
  strong { display: block; color: #194e40; font: 800 30px/1 var(--horf-display, Georgia, serif); }
  span { display: block; margin-top: 7px; color: #557068; font: 750 11px/1.25 ui-sans-serif, system-ui, sans-serif; text-transform: uppercase; letter-spacing: .04em; }
  @container (max-width: 510px) { grid-template-columns: 1fr; }
`;

const RuleNote = styled.p`
  padding: 14px 17px;
  border-left: 3px solid #e19270;
  border-radius: 0 12px 12px 0;
  background: #fff3eb;
  color: #6b5c52;
  font-size: 13px;
  line-height: 1.55;
`;

const TraderList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 11px 0;
    border-top: 1px solid #e6ece6;
    font-size: 13px;
  }
  strong { white-space: nowrap; }
`;

const DirectoryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
`;

const DirectoryCard = styled.article`
  min-width: 0;
  padding: 20px;
  border: 1px solid var(--horf-line);
  border-radius: 17px;
  background: #fff;
  box-shadow: 0 8px 24px #183d3210;
  .rider-rank { display: block; margin-bottom: 10px; color: #b95840; font-size: 10px; font-weight: 850; letter-spacing: .11em; text-transform: uppercase; }
  a { display: block; color: #173d36; font: 750 22px/1.15 var(--horf-display, sans-serif); overflow-wrap: anywhere; }
  p { margin: 9px 0 0; color: #5b6d66; font-size: 13px; }
  strong { color: #144b3d; }
`;

const ProfileTabs = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 18px 0 20px;
  button { min-height: 43px; padding: 8px 16px; border: 1px solid #cbd8d0; border-radius: 999px; background: #fff; color: #28443d; font-weight: 800; cursor: pointer; }
  button[aria-selected="true"] { border-color: #153e35; background: #153e35; color: #fff; }
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
  background: #fff;
  .art { display: grid; place-items: center; height: 205px; background: #e4eee7; }
  img { display: block; width: 100%; height: 100%; object-fit: contain; }
  .copy { padding: 14px 16px 17px; }
  h3 { margin: 0 0 8px; color: #183e36; font: 750 19px/1.2 var(--horf-display, sans-serif); overflow-wrap: anywhere; }
  p { margin: 0 0 8px; color: #5b6d66; font-size: 12px; line-height: 1.45; }
  a { font-size: 12px; font-weight: 800; }
`;

const HorseTestList = styled.ul`
  margin: 16px 0 0;
  padding-left: 21px;
  color: #425a51;
  font-size: 14px;
  line-height: 1.7;
  li + li { margin-top: 8px; }
`;

const ReceiptList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid #e0e9e2;
  li {
    display: grid;
    grid-template-columns: 75px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: start;
    padding: 13px 2px;
    border-bottom: 1px solid #e6ece6;
    font-size: 13px;
  }
  small { display: block; margin-top: 3px; color: #62716c; font: 12px/1.4 ui-sans-serif, system-ui, sans-serif; }
  @container (max-width: 540px) { li { grid-template-columns: 60px minmax(0, 1fr); } }
`;

const ReceiptDirection = styled.strong<{ $in: boolean }>`
  display: inline-block;
  padding: 6px 9px;
  border-radius: 999px;
  background: ${(p) => p.$in ? "#dcf4e7" : "#fff0e4"};
  border: 1px solid ${(p) => p.$in ? "#9bcdb2" : "#ecc1a6"};
  color: ${(p) => p.$in ? "#28644e" : "#99583f"};
  font: 800 10px/1.2 ui-sans-serif, system-ui, sans-serif;
  text-transform: uppercase;
`;

const AsideRail = styled.div`
  color: #142b29;
  font-family: var(--horf-font, ui-sans-serif, system-ui, sans-serif);
  .eyebrow { display: block; margin-bottom: 10px; color: #b6553c; font-size: 10px; font-weight: 850; letter-spacing: .13em; text-transform: uppercase; }
  .rail-section { padding: 16px 0; border-bottom: 1px solid #dbe4dd; }
  .rail-section:first-child { padding-top: 4px; }
  strong { display: block; color: #173b33; font: 700 20px/1.12 var(--horf-display, Georgia, serif); overflow-wrap: anywhere; }
  p { margin: 8px 0 0; color: #597068; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
  .rail-number { color: #c35e42; font: 800 24px/1 var(--horf-display, Georgia, serif); }
  .rail-link { display: inline-block; margin-top: 11px; color: #176d61; font-size: 12px; font-weight: 750; text-decoration: underline; text-underline-offset: 3px; }
  .rail-link:focus-visible { outline: 3px solid #ff9b73; outline-offset: 3px; }
`;

function shortAddress(address: string): string {
  return address.length > 18 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

function traderName(name: string | null | undefined, address: string): string {
  return name?.trim() || shortAddress(address);
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
  return <img src="/horf-art/galloping-horse.webp" alt="" aria-hidden="true" />;
}

function TraderLink({ address, name }: { address: string; name?: string | null }) {
  return (
    <Link href={horfTraderUrl(address)} data-horf-trader-profile-link title={`View ${name?.trim() || address} on Horf`}>
      {traderName(name, address)}
    </Link>
  );
}

function ProfileArt({ image, name }: { image: string | null; name: string }) {
  const resolved = image ? resolveTokenThumbnail({ thumbnail: image }) : null;
  return <img src={resolved?.src ?? "/horf-art/horse-gallop-photo.jpg"} alt={`${name} horse token artwork`} onError={(event) => {
    if (!resolved || !advanceResolvedMediaFallback(event.currentTarget, resolved)) event.currentTarget.src = "/horf-art/horse-gallop-photo.jpg";
  }} />;
}

function TraderListPanel({ title, description, rows, empty, region }: {
  title: string;
  description: string;
  rows: TraderCount[];
  empty: string;
  region: "owed-to" | "owed-by";
}) {
  return (
    <LedgerPanel data-horf-region={region}>
      <h3>{title}</h3>
      <p>{description}</p>
      {rows.length ? (
        <TraderList>
          {rows.map((row) => (
            <li key={row.address}>
              <TraderLink address={row.address} name={row.name} />
              <strong>{row.count} {row.count === 1 ? "horse" : "horses"}</strong>
            </li>
          ))}
        </TraderList>
      ) : <p>{empty}</p>}
    </LedgerPanel>
  );
}

export function Horf() {
  const { address, isGuest, isConnecting, walletError, guestSessionLoading, localWalletAddress, connectWallet, disconnectWallet } = useHorfWallet();
  const [location, navigate] = useLocation();
  const { isAdmin } = useAuth();
  const windowManager = useWindowManager();
  const pagePath = useContext(WindowPathContext);
  const routePath = location.split("?")[0]?.split("#")[0] || "/horf";
  const profileAddress = routePath.match(/^\/horf\/traders\/([^/]+)$/)?.[1] ?? null;
  const validProfileAddress = profileAddress && /^tz[1-4][1-9A-HJ-NP-Za-km-z]{33}$/.test(profileAddress) ? profileAddress : null;
  const routeSection = routePath === "/horf/traders" ? "traders"
    : profileAddress ? "profile"
    : routePath === "/horf/info" ? "info"
    : routePath === "/horf/marshals-market" ? "marshal"
    : routePath === "/horf/outlaw-corral" ? "outlaw"
    : routePath === "/horf/stable" ? "stable"
    : routePath === "/horf/send-horse" ? "horse"
    : routePath === "/horf/posse" ? "posse"
    : routePath === "/horf/gifts" ? "gifts" : "race";
  const routeTitle = routeSection === "marshal" ? "Marshal’s Market"
    : routeSection === "outlaw" ? "Outlaw Corral"
    : routeSection === "stable" ? "My Stable"
    : routeSection === "horse" ? "Send $HORSE"
    : routeSection === "gifts" ? "Gifts"
    : routeSection === "posse" ? "Posse"
    : routeSection === "traders" ? "Find Other Traders"
    : routeSection === "profile" ? "Trader Profile"
    : routeSection === "info" ? "Is It a Horse?" : "Horf";
  const traderFromUrl = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("trader");
  const loggedViews = useRef(new Set<string>());
  const [selectedSeasonKey, setSelectedSeasonKey] = useState(readSeasonKeyFromUrl);
  const [seasonManifest, setSeasonManifest] = useState<HorfSeason[]>([]);
  const [statusAddress, setStatusAddress] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<"for-trade" | "all-horses">("for-trade");
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
    queryKey: ["horf", "trader-profile-offers", validProfileAddress],
    queryFn: () => api.get<{ offers: PublicOffer[] }>(`/api/horf/traders/${encodeURIComponent(validProfileAddress!)}/offers`),
    enabled: routeSection === "profile" && Boolean(validProfileAddress),
    refetchOnWindowFocus: true,
  });
  const profileHorsesQuery = useInfiniteQuery({
    queryKey: ["horf", "trader-profile-horses", validProfileAddress],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api.get<PublicHorsePage>(`/api/horf/traders/${encodeURIComponent(validProfileAddress!)}/horses?offset=${pageParam}`),
    getNextPageParam: (page) => page.pagination.hasMore ? page.pagination.nextOffset : undefined,
    enabled: routeSection === "profile" && Boolean(validProfileAddress) && profileTab === "all-horses",
    refetchOnWindowFocus: true,
  });
  const claimAlert = claimAlertQuery.data?.asOf && /^\d+$/.test(claimAlertQuery.data.claimableRaw) && BigInt(claimAlertQuery.data.claimableRaw) > 0n
    ? claimAlertQuery.data : null;
  const data = query.data;
  const availableSeasons = data?.seasons ?? seasonManifest;
  const selectedSeason = data?.season ?? availableSeasons.find((season) => season.key === selectedSeasonKey);
  const seasonDisplayName = selectedSeasonKey === CURRENT_SEASON_KEY ? "Neighvember 2026" : selectedSeason?.label ?? "Horf archive";
  const leaderboard = useMemo(
    () => [...(data?.leaderboard ?? [])].sort((a, b) => b.trades - a.trades || a.address.localeCompare(b.address)),
    [data?.leaderboard],
  );
  const directory = useMemo(() => {
    const rows = new Map<string, { address: string; name: string | null; trades: number; offerCount: number }>();
    for (const rider of leaderboard) rows.set(rider.address, { address: rider.address, name: rider.name, trades: rider.trades, offerCount: 0 });
    for (const offer of directoryOffersQuery.data?.offers ?? []) {
      const rider = rows.get(offer.ownerAddress) ?? { address: offer.ownerAddress, name: null, trades: 0, offerCount: 0 };
      rider.offerCount += 1;
      rows.set(offer.ownerAddress, rider);
    }
    return [...rows.values()].sort((a, b) => b.trades - a.trades || b.offerCount - a.offerCount || a.address.localeCompare(b.address));
  }, [leaderboard, directoryOffersQuery.data?.offers]);
  const profileRider = leaderboard.find((row) => row.address === validProfileAddress);
  const profileHorses = profileHorsesQuery.data?.pages.flatMap((page) => page.items) ?? [];
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

  useEffect(() => { setProfileTab("for-trade"); }, [profileAddress]);

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
    navigate(`${path}?season=${encodeURIComponent(selectedSeasonKey)}`, { replace });
  }

  function viewTraderStatus(traderAddress: string) {
    setStatusAddress(traderAddress);
    navigate(`/horf/outlaw-corral?season=${encodeURIComponent(selectedSeasonKey)}&trader=${encodeURIComponent(traderAddress)}`);
  }

  function selectProfileTab(tab: "for-trade" | "all-horses") {
    if (tab === profileTab) return;
    setProfileTab(tab);
    logClientSystemEvent({ eventType: "horf.trader_profile.tab_selected", message: "Horf trader horses tab selected", metadata: { address: profileAddress, tab } });
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
    <HorfFrame title={`${routeTitle} · ${seasonDisplayName}`} aside={<AsideRail>
      {walletError && <div className="rail-section" role="alert"><span className="eyebrow">Wallet alert</span><p>{walletError}</p></div>}
      {personal?.blacklisted === true && <div className="rail-section" role="alert"><span className="eyebrow">Trader standing</span><p>This wallet is restricted from private Horf actions. Review the public standing before trading.</p></div>}
      <div className="rail-section"><span className="eyebrow">🐎 Live trail</span><strong>{seasonDisplayName}</strong><p>{countsProvisional ? "The race is still scanning Mainnet." : hasError ? "Season totals need a refresh." : "Season ledger ready for the next ride."}</p></div>
      <div className="rail-section"><span className="eyebrow">Race leader</span><strong>{leaderboard[0] ? traderName(leaderboard[0].name, leaderboard[0].address) : "The starting gate"}</strong><p>{leaderboard[0] ? `${leaderboard[0].trades} ${leaderboard[0].trades === 1 ? "trade" : "trades"} this season` : "No riders ranked yet."}</p></div>
      {routeSection === "profile" && validProfileAddress && <div className="rail-section"><span className="eyebrow">Trader in your sights</span><strong>{traderName(profileRider?.name, validProfileAddress)}</strong><p>{profileRider?.trades ?? 0} season trades · {profileOffersQuery.data?.offers.length ?? 0} active trade signs</p></div>}
      {statusAddress && <div className="rail-section"><span className="eyebrow">Trader in your sights</span><strong>{shortAddress(statusAddress)}</strong><p>Standing and inspection notes are open in the main trail.</p></div>}
      <div className="rail-section"><span className="eyebrow">Your saddle</span>{address ? <><strong>{shortAddress(address)}</strong><p>{personal ? `${personal.received} received · ${personal.sent} sent` : "Reading your horse ledger."}</p></> : <><strong>Guest rider</strong><p>Connect a wallet to see your horses, posse, and claim.</p></>}</div>
      {claimAlert && <div className="rail-section"><span className="eyebrow">HORSE waiting</span><span className="rail-number">{formatHorseAmount(claimAlert.claimableRaw, 8)}</span><p>Earned HORSE · your wallet pays XTZ gas to claim.</p></div>}
    </AsideRail>}>
      <Shell data-horf-app data-horf-page={routeSection}>
        {routeSection === "race" && <Masthead data-horf-region="intro">
          <div>
            <small>WTF OS · Tezos horse trading</small>
            <h1>HORF! <span aria-hidden="true">★</span></h1>
            <p>Howdy, horse trader. Find other riders, follow the race, and see your recent trades. Bring your wallet to Marshal’s Market for inspected horses or trade on trust in the Outlaw Corral. Your stable, return rides, and earned $HORSE are waiting.{isGuest ? " No WTF OS account is needed; the separate WTF Trade Boards app requires sign-in." : " You can also browse the WTF Trade Boards."}</p>
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
            <div className="horse-art"><img src="/horf-art/horse-portrait.webp" alt="" /></div>
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

        <WalletStatus data-horf-wallet-status role="status">
          {address ? `${isGuest ? "Horf wallet verified" : "WTF OS wallet selected"}: ${shortAddress(address)} · Tezos Mainnet`
            : isGuest && guestSessionLoading ? "Checking for a saved Horf wallet proof…"
            : isGuest && localWalletAddress ? `Wallet ${shortAddress(localWalletAddress)} is connected locally. Verify it to unlock your Horf ledger and wallet actions.`
            : isGuest ? "You can watch the race without signing in. Connect and sign a wallet challenge to use your personal Horf ledger and wallet actions."
            : "Connect your Tezos wallet to use your personal Horf ledger and wallet actions."}
          {isGuest && address && <button data-horf-wallet-disconnect type="button" onClick={() => void disconnectWallet()} disabled={isConnecting}>{isConnecting ? "Disconnecting…" : "Disconnect Horf wallet"}</button>}
        </WalletStatus>
        {routeSection === "race" && claimAlert && <ClaimNotice data-horf-claim-alert role="status" aria-live="polite"><span>🐎 Claim alert: {formatHorseAmount(claimAlert.claimableRaw, 8)} HORSE is shown as earned from this wallet’s qualifying horse sends{claimAlert.status !== "ready" ? " (provisional while Horf scans Mainnet)" : ""}. {claimAlert.claimReady ? "Claim it from the Mainnet vault; your wallet pays XTZ gas." : "Vault claiming is waiting for its Mainnet setup or season scan."}</span><button type="button" onClick={() => navigateHorf("/horf/send-horse")}>See HORSE claim</button></ClaimNotice>}
        {walletError && <Warning role="alert">{walletError}</Warning>}

        {(routeSection === "race" || routeSection === "stable" || routeSection === "traders") && <SeasonPicker data-horf-region="season" aria-label="Trading season">
          <div>
            <label htmlFor="horf-season-select">Trading season</label>
            <select
              id="horf-season-select"
              data-horf-season-select
              value={selectedSeasonKey}
              aria-describedby={selectedSeason?.inferred ? "horf-season-boundary horf-season-inference" : "horf-season-boundary"}
              onChange={(event) => selectSeason(event.currentTarget.value)}
            >
              {!availableSeasons.some((season) => season.key === selectedSeasonKey) && (
                <option value={selectedSeasonKey}>{selectedSeasonKey === CURRENT_SEASON_KEY ? "Neighvember 2026" : selectedSeasonKey}</option>
              )}
              {!availableSeasons.length && selectedSeasonKey !== CURRENT_SEASON_KEY && (
                <option value={CURRENT_SEASON_KEY}>Neighvember 2026</option>
              )}
              {availableSeasons.map((season) => (
                <option key={season.key} value={season.key}>
                  {season.key === CURRENT_SEASON_KEY ? "Neighvember 2026" : season.label}{season.inferred ? " · archive" : " · current"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <strong id="horf-season-boundary">{selectedSeason ? seasonDateRange(selectedSeason) : "Loading campaign dates…"}</strong>
            {selectedSeason?.inferred && (
              <small id="horf-season-inference">Archive dates are inferred from Objkt mint clusters and organizer posts. They may not match an official campaign calendar; the listed end date is the first day outside this window.</small>
            )}
          </div>
        </SeasonPicker>}

        {(routeSection === "race" || routeSection === "stable" || routeSection === "traders") && <><StatusBar aria-live="polite">
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

        {routeSection === "traders" && <Section data-horf-region="trader-directory" aria-label="Find other Horf traders">
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
            </DirectoryCard>)}
          </DirectoryGrid> : <LedgerPanel><h3>{query.isPending || directoryOffersQuery.isPending ? "Gathering the riders…" : "No riders at the rail yet"}</h3><p>Try another season or check the Open Range for new horse trade signs.</p></LedgerPanel>}
        </Section>}

        {routeSection === "profile" && <Section data-horf-region="trader-profile" aria-label="Horf trader profile">
          <SectionLabel>🐎 Trader’s saddle</SectionLabel>
          {validProfileAddress ? <>
            <h2>{traderName(profileRider?.name, validProfileAddress)}</h2>
            <p>{validProfileAddress} · {profileRider?.trades ?? 0} {profileRider?.trades === 1 ? "trade" : "trades"} in {seasonDisplayName}. <a href={profileUrl(validProfileAddress)} target="_blank" rel="noopener noreferrer">View wallet on Objkt ↗</a></p>
            <Link href={`/horf/traders?season=${encodeURIComponent(selectedSeasonKey)}`}>← Back to other traders</Link>
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
                      <div className="art"><ProfileArt image={offer.image} name={name} /></div>
                      <div className="copy"><h3>{name}</h3><p>{offer.amount} {offer.amount === "1" ? "edition" : "editions"} · {offer.acceptedTokenPolicy === "marshal_only" ? "Marshal-approved horse wanted" : "Any qualifying horse welcome"}</p><a href={objktTokenUrl(offer.tokenContract, offer.tokenId)} target="_blank" rel="noopener noreferrer">View token on Objkt ↗</a></div>
                    </ProfileHorseCard>;
                  })}
                </ProfileHorseGrid> : <LedgerPanel><h3>No trade signs up</h3><p>This rider has no horses offered for direct trade on Horf right now.</p></LedgerPanel>}
              </> : <>
                <p>Every currently held token that passes Horf’s <Link href="/horf/info">Is It a Horse? Test</Link>, across mint dates. Balances come from Tezos Mainnet.</p>
                {profileHorsesQuery.isPending ? <p>Checking this rider’s stable…</p> : profileHorsesQuery.isError ? <Warning role="alert">This rider’s horses could not be loaded. Try again shortly.</Warning> : profileHorses.length ? <>
                  <ProfileHorseGrid>{profileHorses.map((horse) => {
                    const name = horse.name || `Horse token #${horse.tokenId}`;
                    return <ProfileHorseCard key={`${horse.contract}:${horse.tokenId}`} data-horf-profile-horse>
                      <div className="art"><ProfileArt image={horse.image} name={name} /></div>
                      <div className="copy"><h3>{name}</h3><p>{horse.balance} {horse.balance === "1" ? "edition held" : "editions held"} · {shortAddress(horse.contract)} / #{horse.tokenId}</p><a href={objktTokenUrl(horse.contract, horse.tokenId)} target="_blank" rel="noopener noreferrer">View token on Objkt ↗</a></div>
                    </ProfileHorseCard>;
                  })}</ProfileHorseGrid>
                  {profileHorsesQuery.hasNextPage && <Action type="button" onClick={() => void profileHorsesQuery.fetchNextPage()} disabled={profileHorsesQuery.isFetchingNextPage}>{profileHorsesQuery.isFetchingNextPage ? "Rounding up more horses…" : "Load more horses"}</Action>}
                </> : <LedgerPanel><h3>No qualifying horses held</h3><p>There are no current balances that pass the horse test for this wallet.</p></LedgerPanel>}
              </>}
            </div>
          </> : <LedgerPanel><h3>That rider’s address is off trail</h3><p>Choose a Tezos wallet from the trader directory to see its horse profile.</p><Link href={`/horf/traders?season=${encodeURIComponent(selectedSeasonKey)}`}>Return to other traders</Link></LedgerPanel>}
        </Section>}

        {routeSection === "info" && <Section data-horf-region="horse-test-info" aria-label="Horf Is It a Horse Test">
          <SectionLabel>🐴 The Horf field guide</SectionLabel>
          <h2>Is It a Horse?</h2>
          <p>Horf uses the same horse test for Open Range discovery and a trader’s “All horses held” profile tab. A Tezos Mainnet FA2 edition must be indexed by Objkt and be a whole token (zero or unset decimals). The profile shows qualifying editions the wallet currently holds.</p>
          <LedgerPanel><h3>Words that open the stable gate</h3><HorseTestList>
            <li>Whole-keyword matches in the minted name, description, or Objkt tag: horse, horseart, horse art, horsetrade, horse trade, horse trader, horse trading, haha, and horf.</li>
            <li>Neighvember and Horse of July, including year-suffixed campaign names.</li>
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

        {routeSection === "stable" && <HorfPersonalStable address={address} connectWallet={connectWallet} isConnecting={isConnecting} />}
        {routeSection === "marshal" && <><HorfInspectorDesk isGuest={isGuest} isAdmin={isAdmin} />
        <TradingZone id="horf-marshals-market" data-horf-region="marshals-market">
          <small>Inspected horses · escrow route</small>
          <h2>Marshal’s Market</h2>
          <p>The marshal documents a human trust judgment on a token, its FA2 code, and observed history before it enters any of the three trading Stables. Active approval is required for every deposit, even Honor. The Stable is designed to hold deposited editions until a claim or cancellation; inspection is no cryptographic proof that arbitrary FA2 code will always transfer correctly.</p>
          <HorfStables address={address} connectWallet={connectWallet} isConnecting={isConnecting} />
        </TradingZone></>}
        {routeSection === "outlaw" && <TradingZone id="horf-outlaw-corral" data-horf-region="outlaw-corral" $outlaw>
          <small>Qualifying horse art · direct wallet route</small>
          <h2>Outlaw Corral</h2>
          <p>Saddle up for a direct horse trade or gift. Qualifying Objkt horse art can ride wallet to wallet without inspection, and those confirmed transfers still count in the season race. These wallet transfers are irrevocable and have no Horf escrow: check the trader’s standing and the token’s details before you hit the trail.</p>
          <ZoneAction type="button" onClick={() => navigateHorf("/horf/open-range")}>Browse trust-based direct offers on the Open Range</ZoneAction>
          <ZoneAction type="button" onClick={() => navigateHorf("/horf/gifts")}>Gift a horse or tend your posse</ZoneAction>
          <HorfTraderStatus selectedAddress={traderFromUrl ?? statusAddress ?? address} walletAddress={address} onSelect={viewTraderStatus} isAdmin={isAdmin} onChange={() => void query.refetch()} />
        </TradingZone>}
        {routeSection === "horse" && <HorfHorseSend address={address} signedIn={!isGuest} connectWallet={connectWallet} isConnecting={isConnecting} />}
        {routeSection === "gifts" && <HorfGifts address={address} isGuest={isGuest} connectWallet={connectWallet} isConnecting={isConnecting} />}
        {routeSection === "posse" && <HorfPosse address={address} connectWallet={connectWallet} isConnecting={isConnecting} />}

        {routeSection === "stable" && <Section data-horf-region="trader-ledger" aria-label="Your horse trader ledger">
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
                          <li key={horse.id}>
                            <ReceiptDirection $in>Waiting</ReceiptDirection>
                            <div>
                              <a href={tokenUrl(horse.token)} target="_blank" rel="noopener noreferrer">{horse.token.name || `Token #${horse.token.tokenId}`}</a>
                              <small>From <TraderLink address={horse.from} /> · {formatDate(horse.timestamp)}</small>
                            </div>
                            <strong>{horse.amount} {horse.amount === 1 ? "horse" : "horses"}</strong>
                          </li>
                        ))}
                      </ReceiptList>
                    ) : <p>{countsProvisional ? "The scan is still checking which received horses need a return." : "Every received horse has a matching return ride, or no horses have arrived yet."}</p>}
                  </Section>
                  <Ledger>
                    <TraderListPanel region="owed-to" title="Return rides you owe" description="Traders who sent you horses and are waiting for one back." rows={personal.owedTo} empty="No return rides are waiting on you." />
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
      </Shell>
    </HorfFrame>
  );
}
