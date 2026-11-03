import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { HorfStables } from "../features/horf/HorfStables";
import { HorfHorseSend } from "../features/horf/HorfHorseSend";
import { HorfGifts } from "../features/horf/HorfGifts";
import { HorfTraderStatus } from "../features/horf/HorfTraderStatus";
import { HorfPersonalStable } from "../features/horf/HorfPersonalStable";
import { HorfInspectorDesk } from "../features/horf/HorfInspectorDesk";
import { formatHorseAmount } from "../features/horf/recipient-input";
import { useHorfWallet } from "../features/horf/useHorfWallet";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { logClientSystemEvent } from "../lib/system-log";
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
  return typeof window !== "undefined" && /(?:^|\/)horf\/?$/.test(window.location.pathname);
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
  --horf-ink: #321d1a;
  --horf-red: #a83f30;
  --horf-gold: #f4c95c;
  --horf-paper: #f5ead1;
  min-height: 100%;
  min-width: 0;
  padding: 16px;
  box-sizing: border-box;
  color: var(--horf-ink);
  background: var(--horf-paper);
  font-family: Georgia, "Times New Roman", serif;
  container-type: inline-size;

  * { box-sizing: border-box; }
  a { color: #6f2d24; }
  button:focus-visible, a:focus-visible, select:focus-visible {
    outline: 3px solid #0b6874;
    outline-offset: 3px;
  }
`;

const Masthead = styled.header`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(228px, 280px);
  gap: 14px 22px;
  align-items: start;
  padding: 18px 22px;
  border: 4px double var(--horf-gold);
  outline: 2px solid #572523;
  background:
    radial-gradient(circle at 13% 50%, rgba(255, 211, 94, 0.16) 0 2px, transparent 3px) 0 0 / 20px 20px,
    #4c2026;
  color: #fff4d5;
  box-shadow: 4px 4px 0 #b86039;

  h1 {
    margin: 1px 0 6px;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(34px, 5cqw, 62px);
    font-weight: 900;
    line-height: 0.92;
    letter-spacing: -0.05em;
    text-shadow: 2px 2px 0 #aa5030;
  }
  p { max-width: 660px; margin: 0; font-size: 15px; line-height: 1.45; }
  small {
    display: block;
    color: #ffd581;
    font: 700 12px/1.3 "Courier New", monospace;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  @container (max-width: 610px) { grid-template-columns: 1fr; }
`;

const WantedPoster = styled.aside`
  position: relative;
  min-width: 0;
  overflow: hidden;
  text-align: center;
  padding: 9px 12px 11px;
  border: 4px solid #f8d16b;
  outline: 2px solid #162f34;
  background: linear-gradient(145deg, #ffe09a, #f8b45d 62%, #eb8053);
  color: #351d20;
  box-shadow: 5px 5px 0 #102c32, inset 0 0 0 2px #9b4138;
  font-family: Georgia, "Times New Roman", serif;
  &::before, &::after { content: "★"; position: absolute; top: 7px; color: #0c5960; font-size: 18px; }
  &::before { left: 10px; }
  &::after { right: 10px; }
  .wanted { display: block; color: #902d31; font: 900 26px/1 Georgia, serif; text-transform: uppercase; }
  .traders { display: block; margin: 2px 0 3px; font: 800 11px/1.1 "Courier New", monospace; text-transform: uppercase; }
  .horse-art { display: grid; place-items: center; height: 96px; margin: 4px 6px 5px; border-top: 2px solid #a84638; border-bottom: 2px solid #a84638; background: radial-gradient(ellipse at center, #ffe8b3 0 40%, transparent 72%); }
  .horse-art img { display: block; height: 94px; width: 142px; max-width: 100%; object-fit: cover; object-position: center top; filter: sepia(.35) contrast(1.2) drop-shadow(2px 2px 0 #a34d3a); }
  h2 { margin: 0 0 5px; font: 900 20px/1.05 Georgia, serif; overflow-wrap: anywhere; }
  .reward { display: block; margin: 0 -12px 7px; padding: 6px 8px; background: #0b5b64; color: #fff6dd; box-shadow: inset 0 2px 0 #f6d27d, inset 0 -2px 0 #f6d27d; }
  .reward strong { display: block; font: 900 25px/1 Georgia, serif; }
  .reward span { display: block; margin-top: 2px; font: 700 11px/1.2 "Courier New", monospace; }
  p { margin: 0; color: #4e2524; font: 700 11px/1.25 "Courier New", monospace; }
  @container (max-width: 610px) { width: min(100%, 300px); justify-self: center; }
`;

const SeasonPicker = styled.section`
  display: grid;
  grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
  gap: 10px 18px;
  align-items: center;
  margin-top: 18px;
  padding: 13px 16px;
  border: 2px solid #754633;
  background: #fff4d8;
  box-shadow: 3px 3px 0 #d7aa72;
  label {
    display: block;
    margin-bottom: 5px;
    font: 700 12px/1.25 "Courier New", monospace;
    text-transform: uppercase;
  }
  select {
    width: 100%;
    min-height: 40px;
    padding: 7px 9px;
    border: 2px solid #70402e;
    border-radius: 0;
    color: #321d1a;
    background: #fffdf4;
    font: 700 14px/1.3 Georgia, serif;
  }
  p { margin: 0; font-size: 13px; line-height: 1.4; }
  strong { display: block; font: 700 14px/1.4 "Courier New", monospace; }
  small { display: block; margin-top: 4px; color: #684b3c; font-size: 12px; line-height: 1.4; }
  @container (max-width: 560px) { grid-template-columns: 1fr; }
`;

const IntroActions = styled.div`
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 2px 0 0;
  font: 700 13px/1.2 "Courier New", monospace;
`;

const Action = styled.button<{ $primary?: boolean }>`
  appearance: none;
  border: 2px solid ${(p) => p.$primary ? "#fbd67d" : "#a66049"};
  background: ${(p) => p.$primary ? "#f8ce70" : "transparent"};
  color: ${(p) => p.$primary ? "#3a2119" : "#fff4d5"};
  min-height: 38px;
  padding: 7px 11px;
  font: inherit;
  cursor: pointer;
  &:hover:not(:disabled) { filter: brightness(1.12); }
  &:disabled { opacity: 0.62; cursor: wait; }
`;

const StatusBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 14px;
  margin-top: 16px;
  padding: 9px 12px;
  border: 1px solid #b18762;
  background: #fff7e7;
  font: 700 12px/1.35 "Courier New", monospace;
  button {
    border: 1px solid #5b3024;
    padding: 5px 9px;
    color: #4c231b;
    background: #ffe1a0;
    font: inherit;
    cursor: pointer;
  }
`;

const Warning = styled.div`
  margin-top: 10px;
  padding: 10px 12px;
  border-left: 5px solid #a83f30;
  background: #fff0d3;
  font: 700 13px/1.45 "Courier New", monospace;
`;

const WalletStatus = styled.div`
  margin-top: 12px;
  padding: 10px 12px;
  border-left: 5px solid #4e7851;
  background: #edf2d9;
  color: #304331;
  font: 700 12px/1.45 "Courier New", monospace;
  button { margin-left: 12px; padding: 3px 7px; border: 1px solid #4c684a; background: #fff8e8; color: #304331; cursor: pointer; font: inherit; }
  button:focus-visible { outline: 3px solid #0b6874; outline-offset: 2px; }
  button:disabled { opacity: 0.6; cursor: wait; }
`;

const ClaimNotice = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 14px;
  margin-top: 11px;
  padding: 11px 13px;
  border: 3px double #946019;
  background: #fff0b9;
  color: #473018;
  font: 700 13px/1.4 "Courier New", monospace;
  button { min-height: 34px; padding: 5px 9px; border: 2px solid #78502a; background: #fff9e5; color: inherit; cursor: pointer; font: inherit; }
`;

const TradingZone = styled.section<{ $outlaw?: boolean }>`
  margin-top: 26px;
  padding: 14px;
  border: 4px double ${(p) => p.$outlaw ? "#7a302b" : "#315e57"};
  background: ${(p) => p.$outlaw ? "#f3dbc4" : "#dce8d8"};
  box-shadow: 4px 4px 0 ${(p) => p.$outlaw ? "#b96b49" : "#6b9782"};
  min-width: 0;
  h2 { margin: 3px 0 6px; font-size: clamp(27px, 4.3cqw, 40px); line-height: 1.02; }
  > p { max-width: 800px; margin: 0 0 4px; font-size: 14px; line-height: 1.45; }
  > small { color: ${(p) => p.$outlaw ? "#9c4135" : "#38695c"}; font: 700 11px/1.3 "Courier New", monospace; text-transform: uppercase; }
  > section { margin-top: 14px; }
`;

const ZoneAction = styled.button`
  min-height: 36px;
  padding: 6px 10px;
  border: 2px solid #71362c;
  background: #f8d78e;
  color: #3c261d;
  box-shadow: 2px 2px 0 #b87d54;
  cursor: pointer;
  font: 700 12px/1.2 "Courier New", monospace;
`;

const Section = styled.section`
  margin-top: 20px;
  min-width: 0;
  h2 {
    margin: 0 0 4px;
    color: #4c2420;
    font-size: 24px;
    line-height: 1.15;
  }
  > p { margin: 0 0 12px; font-size: 14px; line-height: 1.45; }
`;

const SectionLabel = styled.div`
  margin-bottom: 4px;
  color: #8b3c2c;
  font: 700 12px/1.2 "Courier New", monospace;
  text-transform: uppercase;
`;

const RaceFrame = styled.div`
  border: 3px solid #4d2520;
  background: #e8c99c;
  box-shadow: inset 0 0 0 2px #fae5bd, 4px 4px 0 #c97946;
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
  padding: 6px 12px;
  background: #4d2520;
  color: #ffe6a4;
  font: 700 12px/1.2 "Courier New", monospace;
  text-transform: uppercase;
`;

const Lane = styled.li`
  display: grid;
  grid-template-columns: minmax(142px, 0.28fr) minmax(100px, 1fr) 80px;
  min-height: 57px;
  border-top: 2px solid rgba(83, 38, 29, 0.72);
  background: repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.14) 0 8px, transparent 8px 32px);
  &:nth-child(odd) { background-color: rgba(255, 248, 224, 0.42); }
  &:nth-child(even) { background-color: rgba(214, 162, 109, 0.28); }
  @container (max-width: 560px) {
    grid-template-columns: minmax(0, 1fr) 72px;
    min-height: 86px;
  }
`;

const Rider = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px;
  border-right: 2px solid #7b4b36;
  font-size: 13px;
  font-weight: 700;
  a { flex: 1 1 70px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  @container (max-width: 560px) {
    border-right: 0;
    padding-bottom: 0;
  }
`;

const BlacklistBadge = styled.button`
  flex: 0 0 calc(100% - 37px);
  margin-left: 37px;
  padding: 3px 5px;
  border: 1px solid #852b24;
  background: #ffe3cc;
  color: #7d261e;
  cursor: pointer;
  font: 700 9px/1.1 "Courier New", monospace;
  text-transform: uppercase;
  &:focus-visible { outline: 3px solid #0b6874; outline-offset: 2px; }
`;

const Rank = styled.span`
  flex: 0 0 auto;
  display: grid;
  place-content: center;
  width: 29px;
  height: 29px;
  border-radius: 50%;
  border: 2px solid #5b2b22;
  background: #f6d073;
  font: 700 12px "Courier New", monospace;
`;

const Track = styled.div`
  position: relative;
  overflow: hidden;
  min-width: 0;
  border-right: 4px dashed #fff7da;
  background:
    linear-gradient(180deg, transparent 47%, rgba(76, 37, 32, 0.28) 48% 51%, transparent 52%),
    linear-gradient(90deg, transparent 92%, rgba(179, 66, 44, 0.28) 92%);
  @container (max-width: 560px) {
    grid-column: 1;
    grid-row: 2;
    min-height: 50px;
  }
`;

const Runner = styled.div`
  position: absolute;
  top: 50%;
  width: 50px;
  height: 36px;
  margin-top: -18px;
  color: #4c2721;
  transition: left 700ms ease-out;
  svg { width: 50px; height: 36px; filter: drop-shadow(2px 2px 0 rgba(55, 23, 18, 0.35)); }
  @media (prefers-reduced-motion: reduce) { transition: none; }
`;

const LaneScore = styled.div`
  display: grid;
  place-content: center;
  text-align: center;
  padding: 5px;
  border-left: 2px solid #7b4b36;
  background: rgba(255, 245, 211, 0.64);
  strong { display: block; font: 900 23px/1 Georgia, serif; }
  span { font: 700 10px/1.2 "Courier New", monospace; text-transform: uppercase; }
  @container (max-width: 560px) { grid-column: 2; grid-row: 1 / span 2; }
`;

const Ledger = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 18px;
  @container (max-width: 670px) { grid-template-columns: 1fr; }
`;

const LedgerPanel = styled.div`
  min-width: 0;
  padding: 14px;
  border-top: 4px solid #a74a34;
  background: #fff8e9;
  box-shadow: inset 0 0 0 1px #cba77b;
  h3 { margin: 0 0 4px; font-size: 18px; }
  p { margin: 0 0 10px; font-size: 13px; line-height: 1.4; }
`;

const MetricStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 13px 0 18px;
  > div { padding: 9px; border: 1px solid #bd9465; background: #fff3d5; }
  strong { display: block; font-size: 24px; line-height: 1; }
  span { font: 700 11px/1.25 "Courier New", monospace; text-transform: uppercase; }
`;

const RuleNote = styled.p`
  padding: 10px 12px;
  border-left: 4px solid #9d4c30;
  background: #ffefd0;
  font-size: 13px;
  line-height: 1.45;
`;

const TraderList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 0;
    border-top: 1px solid #d8bc94;
    font-size: 13px;
  }
  strong { white-space: nowrap; }
`;

const ReceiptList = styled.ol`
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid #b99065;
  li {
    display: grid;
    grid-template-columns: 75px minmax(0, 1fr) auto;
    gap: 10px;
    align-items: start;
    padding: 10px 2px;
    border-bottom: 1px solid #d8bc94;
    font-size: 13px;
  }
  small { display: block; margin-top: 3px; color: #755349; font: 12px/1.35 "Courier New", monospace; }
  @container (max-width: 540px) { li { grid-template-columns: 60px minmax(0, 1fr); } }
`;

const ReceiptDirection = styled.strong<{ $in: boolean }>`
  display: inline-block;
  padding: 4px 5px;
  background: ${(p) => p.$in ? "#d6ecce" : "#f5d8c1"};
  border: 1px solid ${(p) => p.$in ? "#4f7642" : "#a34b31"};
  color: #2d2b1e;
  font: 700 11px "Courier New", monospace;
  text-transform: uppercase;
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

function tokenUrl(token: HorfReceipt["token"]): string {
  return `https://objkt.com/tokens/${encodeURIComponent(token.contract)}/${encodeURIComponent(token.tokenId)}`;
}

function HorseGlyph() {
  return (
    <svg viewBox="0 0 60 42" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M8 15 3 10 1 11l4 10 7 3 11-1 3 7-2 10h4l5-13 9-1 5 13h4l-2-17 5-5 5 1 1-4-5-3-2-7-3-2-2 6-6 2-7 6-18-3-7 3Z" />
      <path fill="#f1ca76" d="m45 10 5-2-1 7-4 2z" />
      <circle cx="51" cy="13" r="1.3" fill="#f7e9c6" />
      <path d="M18 25 12 39M35 26l-2 13" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function TraderLink({ address, name }: { address: string; name?: string | null }) {
  return (
    <a href={profileUrl(address)} target="_blank" rel="noopener noreferrer" title={`Open ${name?.trim() || address} on Objkt`}>
      {traderName(name, address)}
    </a>
  );
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
  const { isAdmin } = useAuth();
  const windowManager = useWindowManager();
  const pagePath = useContext(WindowPathContext);
  const raceRef = useRef<HTMLElement | null>(null);
  const loggedViews = useRef(new Set<string>());
  const [selectedSeasonKey, setSelectedSeasonKey] = useState(readSeasonKeyFromUrl);
  const [seasonManifest, setSeasonManifest] = useState<HorfSeason[]>([]);
  const [statusAddress, setStatusAddress] = useState<string | null>(null);
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
    if (!loggedViews.current.has(`race:${key}`)) {
      loggedViews.current.add(`race:${key}`);
      logClientSystemEvent({ eventType: "horf.race.viewed", message: "Horf race board viewed", metadata: { season: data.season.label } });
    }
    if (personal && !loggedViews.current.has(`trader:${key}`)) {
      loggedViews.current.add(`trader:${key}`);
      logClientSystemEvent({ eventType: "horf.trader.viewed", message: "Horf trader ledger viewed", metadata: { season: data.season.label } });
    }
  }, [address, data, personal]);

  function findTraders() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    raceRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  function visitSection(id: string) {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  }

  function viewTraderStatus(traderAddress: string) {
    setStatusAddress(traderAddress);
    visitSection("horf-trader-status");
  }

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
    <AppWindow title={`Horf · ${seasonDisplayName}`}>
      <Shell data-horf-app>
        <Masthead data-horf-region="intro">
          <div>
            <small>WTF OS · Tezos horse trading</small>
            <h1>HORF! <span aria-hidden="true">★</span></h1>
            <p>Howdy, horse trader. Find other riders on the race board and open their Objkt profiles. Gather owned horses in your personal stable, ride an inspected horse through Marshal’s Market, or make a direct trade in the Outlaw Corral. Send $HORSE to your posse and keep an eye on recent trades and return rides after you verify your wallet.{isGuest ? " No WTF OS account is needed; the separate WTF Trade Boards app requires sign-in." : " You can also browse the WTF Trade Boards."}</p>
          </div>
          <WantedPoster data-horf-wanted-poster aria-label={`${seasonDisplayName} horse trader notice`}>
            <span className="wanted">Wanted</span>
            <span className="traders">Horse traders · all riders welcome</span>
            <div className="horse-art"><img src="/creation-tools/pixalerce/stamps/packs/collage/animales/horse.webp" alt="" /></div>
            <h2>{seasonDisplayName}</h2>
            {selectedSeasonKey === CURRENT_SEASON_KEY ? <>
              <span className="reward"><strong>10 $HORSE</strong><span>per recognized horse trade/send</span></span>
              <p>Neighvember 2026 sender only, for each qualifying horse edition. Return a ride to earn your own.</p>
            </> : <>
              <span className="reward"><strong>Past rides</strong><span>Archive race board</span></span>
              <p>Follow the hoofprints from this earlier season.</p>
            </>}
          </WantedPoster>
          <IntroActions>
              <Action type="button" $primary onClick={findTraders}>Find horse traders</Action>
              <Action data-horf-open-range-open type="button" onClick={() => windowManager.openPage(`/horf/open-range?season=${encodeURIComponent(selectedSeasonKey)}`)}>Browse the Open Range</Action>
              <Action type="button" onClick={() => visitSection("horf-trader-status")}>Check trader standing</Action>
              {!address && <Action data-horf-wallet-connect-intro type="button" onClick={() => void connectWallet()} disabled={isConnecting}>{isConnecting ? "Connecting wallet…" : isGuest ? "Connect and verify wallet" : "Connect Tezos wallet"}</Action>}
              <Action type="button" onClick={() => visitSection("horf-personal-stable")}>Your personal stable</Action>
              <Action type="button" onClick={() => visitSection("horf-marshals-market")}>Marshal’s Market · inspected Stables</Action>
              <Action type="button" onClick={() => visitSection("horf-outlaw-corral")}>Outlaw Corral · direct trades</Action>
              <Action type="button" onClick={() => visitSection("horf-inspector-desk")}>Inspector’s desk</Action>
              <Action type="button" onClick={() => visitSection("horf-horse-send")}>Send $HORSE</Action>
              <Action type="button" onClick={() => visitSection("horf-gifts")}>Gift horses</Action>
              {!isGuest && <Action type="button" onClick={() => windowManager.openPage("/trade-boards")}>Browse Trade Boards</Action>}
          </IntroActions>
        </Masthead>

        <WalletStatus data-horf-wallet-status role="status">
          {address ? `${isGuest ? "Horf wallet verified" : "WTF OS wallet selected"}: ${shortAddress(address)} · Tezos Mainnet`
            : isGuest && guestSessionLoading ? "Checking for a saved Horf wallet proof…"
            : isGuest && localWalletAddress ? `Wallet ${shortAddress(localWalletAddress)} is connected locally. Verify it to unlock your Horf ledger and wallet actions.`
            : isGuest ? "You can watch the race without signing in. Connect and sign a wallet challenge to use your personal Horf ledger and wallet actions."
            : "Connect your Tezos wallet to use your personal Horf ledger and wallet actions."}
          {isGuest && address && <button data-horf-wallet-disconnect type="button" onClick={() => void disconnectWallet()} disabled={isConnecting}>{isConnecting ? "Disconnecting…" : "Disconnect Horf wallet"}</button>}
        </WalletStatus>
        {claimAlert && <ClaimNotice data-horf-claim-alert role="status" aria-live="polite"><span>🐎 Claim alert: {formatHorseAmount(claimAlert.claimableRaw, 8)} HORSE is shown as earned from this wallet’s qualifying horse sends{claimAlert.status !== "ready" ? " (provisional while Horf scans Mainnet)" : ""}. {claimAlert.claimReady ? "Claim it from the Mainnet vault; your wallet pays XTZ gas." : "Vault claiming is waiting for its Mainnet setup or season scan."}</span><button type="button" onClick={() => visitSection("horf-horse-send")}>See HORSE claim</button></ClaimNotice>}
        {walletError && <Warning role="alert">{walletError}</Warning>}

        <SeasonPicker data-horf-region="season" aria-label="Trading season">
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
        </SeasonPicker>

        <StatusBar aria-live="polite">
          <span>
            {query.isPending ? "Reading the season ledger…" : hasError ? "Season ledger needs attention" : countsProvisional ? "Scanning Tezos history · counts are provisional" : "Season ledger ready"}
            {data?.asOf ? ` · As of ${formatDate(data.asOf)}` : " · Awaiting first snapshot"}
          </span>
          <button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? "Updating…" : hasError ? "Retry season ledger" : "Refresh race and ledger"}
          </button>
        </StatusBar>
        {countsProvisional && <Warning role="status">Horf is scanning mainnet transfers. Race positions, horse totals, and return rides may change as transfers are found.</Warning>}
        {hasError && <Warning role="alert">Horf could not finish reading the season. Retry the ledger; any figures shown below are the last available snapshot.</Warning>}
        {personal?.blacklisted === true && <Warning data-horf-wallet-restricted role="alert">This wallet is blacklisted from Horf private API features. Its historical trade totals remain visible. Direct Stable claims need a separate admin-signed contract restriction; Horf cannot reverse Tezos transfers.</Warning>}

        <Section id="horf-race" ref={raceRef} data-horf-region="race" aria-label="Horse trader race leaderboard">
          <SectionLabel>Midway race board</SectionLabel>
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
        </Section>

        <HorfTraderStatus selectedAddress={statusAddress ?? address} walletAddress={address} onSelect={viewTraderStatus} isAdmin={isAdmin} onChange={() => void query.refetch()} />

        <HorfPersonalStable address={address} connectWallet={connectWallet} isConnecting={isConnecting} />
        <HorfInspectorDesk isGuest={isGuest} isAdmin={isAdmin} />
        <TradingZone id="horf-marshals-market" data-horf-region="marshals-market">
          <small>Inspected horses · escrow route</small>
          <h2>Marshal’s Market</h2>
          <p>The marshal documents a human trust judgment on a token, its FA2 code, and observed history before it enters any of the three trading Stables. Active approval is required for every deposit, even Honor. The Stable is designed to hold deposited editions until a claim or cancellation; inspection is no cryptographic proof that arbitrary FA2 code will always transfer correctly.</p>
          <HorfStables address={address} connectWallet={connectWallet} isConnecting={isConnecting} />
        </TradingZone>
        <TradingZone id="horf-outlaw-corral" data-horf-region="outlaw-corral" $outlaw>
          <small>Qualifying horse art · direct wallet route</small>
          <h2>Outlaw Corral</h2>
          <p>Saddle up for a direct horse trade or gift. Qualifying Objkt horse art can ride wallet to wallet without inspection, and those confirmed transfers still count in the season race. These wallet transfers are irrevocable and have no Horf escrow: check the trader’s standing and the token’s details before you hit the trail.</p>
          <ZoneAction type="button" onClick={() => windowManager.openPage(`/horf/open-range?season=${encodeURIComponent(selectedSeasonKey)}`)}>See every qualifying season mint on the Open Range</ZoneAction>
          <HorfGifts address={address} isGuest={isGuest} connectWallet={connectWallet} isConnecting={isConnecting} />
        </TradingZone>
        <HorfHorseSend address={address} signedIn={!isGuest} connectWallet={connectWallet} isConnecting={isConnecting} />

        <Section data-horf-region="trader-ledger" aria-label="Your horse trader ledger">
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
        </Section>
      </Shell>
    </AppWindow>
  );
}
