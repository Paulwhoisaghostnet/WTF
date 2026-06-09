import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import styled, { keyframes } from "styled-components";
import { loadGameFromZip, type GameBundle } from "../lib/zip-loader";
import type { ConsoleTokenProvenance } from "@shared/console-provenance";
import {
  formatProvenancePrice,
  provenanceCreatorLabel,
  provenanceSupportLinks,
  provenanceXLabel,
  readEmbeddedProvenance,
} from "../lib/provenance";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Cartridge = {
  id: string;
  slug?: string;
  title: string;
  description: string;
  mimeType: string;
  thumbnailUri: string | null;
  artifactUri: string;
  tokenContract: string;
  tokenId: string;
  isDemo: boolean;
  isPublished?: boolean;
  kind?: "html5" | "dos-game" | "dos-installer" | "vite-project" | "rom";
  category?: string;
  builderName?: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  licenseName?: string | null;
  provenance?: ConsoleTokenProvenance | null;
  playCount?: number;
  playerCount?: number;
  leaderboardEnabled?: boolean;
  arcadeCreditsRequired?: boolean;
  arcadeCreditPrice?: number;
  userSubmitted?: boolean;
  maxPossibleScore?: number | null;
  maxScorePerSecond?: number | null;
};

type ConsoleCatalog = {
  demos: Cartridge[];
  published: Cartridge[];
  mine: Cartridge[];
  all: Cartridge[];
  payment?: ArcadePaymentConfig;
};

type ArcadePaymentConfig = {
  sku: string;
  currency: "wtf";
  feeWtfUnits: string;
  feeWtfFormatted: string;
  contractAddress: string | null;
  routerListingId: number;
  configured: boolean;
};

type ArcadePlayFeeResponse = {
  payment: ArcadePaymentConfig;
};

type ArcadePlayStatus = {
  userId: number;
  sku: string;
  cardSku: string;
  cardsOwned: number;
  ticketsOwned: number;
  creditsRequired: boolean;
  creditsPerPlay: number;
  bypass: boolean;
  canPlay: boolean;
  payment: ArcadePaymentConfig;
};

type ArcadePaymentPrompt = {
  cart: Cartridge;
  reason: "login" | "ticket" | "error";
  message: string;
};

type ConsoleChampion = {
  slug: string;
  title: string;
  coverUri: string | null;
  category: string;
  userId: number;
  username: string;
  displayName: string | null;
  score: number;
  submittedAt: string | null;
};

type ConsoleChampionsResponse = {
  champions: ConsoleChampion[];
};

type ConsoleTopPlayer = {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  gamesPlayed: number;
  totalPlays: number;
  totalScore: number;
  bestScore: number;
  firstPlaceCount: number;
  consoleXp: number;
  lastPlayedAt: string | null;
};

type ConsoleTopPlayersResponse = {
  players: ConsoleTopPlayer[];
};

type ConsoleStats = {
  totalGames: number;
  publishedGames: number;
  pendingGames: number;
  sourceArcadeGames: number;
  creatorGames: number;
  gameStudioGames: number;
  totalPlays: number;
  totalPlayers: number;
  totalScores: number;
  totalConsoleXp: number;
  openReports: number;
  latestSourceArcadeImportAt?: string | null;
  latestConsoleActivityAt: string | null;
  topCategories: Array<{
    category: string;
    games: number;
    plays: number;
  }>;
};

type ConsoleDiscoveryShelfItem = {
  id: number;
  slug: string;
  title: string;
  description: string;
  category: string;
  coverUri: string | null;
  builderName: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  licenseName: string | null;
  playCount: number;
  playerCount: number;
  updatedAt: string;
};

type ConsoleDiscoveryShelves = {
  popular: ConsoleDiscoveryShelfItem[];
  newest: ConsoleDiscoveryShelfItem[];
  sourceArcade: ConsoleDiscoveryShelfItem[];
  creator: ConsoleDiscoveryShelfItem[];
  studio: ConsoleDiscoveryShelfItem[];
};

type ConsoleRecentScore = {
  id: number;
  slug: string;
  title: string;
  gameSlug?: string;
  gameTitle?: string;
  category: string;
  userId: number;
  username: string;
  displayName: string | null;
  score: number;
  submittedAt: string;
};

type ConsoleRecentScoresResponse = {
  scores: ConsoleRecentScore[];
};

type DiscoveryRailChip = {
  shelf: string;
  item: ConsoleDiscoveryShelfItem;
};

type ConsolePlayerProfile = {
  player: {
    id: number;
    username: string;
    displayName: string | null;
  };
  summary: {
    gamesPlayed: number;
    totalPlays: number;
    totalScore: number;
    firstPlaceCount: number;
    consoleXp: number;
  };
  games: Array<{
    slug: string;
    title: string;
    category: string;
    plays: number;
    bestScore: number;
    totalScore: number;
    rank: number;
    lastPlayedAt: string | null;
  }>;
};

const REPORT_CATEGORIES = [
  "broken",
  "unsafe",
  "stolen",
  "spam",
  "score-abuse",
  "other",
];

type LibrarySortMode = "popular" | "players" | "title";
type ConsoleSurface = "console" | "arcade";

function normalizeLibraryCategory(category: string | null | undefined): string {
  const normalized = String(category || "general").trim().toLowerCase();
  return normalized || "general";
}

function formatCategoryLabel(category: string): string {
  return category
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildDiscoveryRail(
  shelves: ConsoleDiscoveryShelves | undefined
): DiscoveryRailChip[] {
  if (!shelves) return [];
  const seen = new Set<string>();
  const candidates: DiscoveryRailChip[] = [
    ...shelves.sourceArcade.slice(0, 4).map((item) => ({ shelf: "WTF ARCADE", item })),
    ...shelves.studio.slice(0, 4).map((item) => ({ shelf: "STUDIO", item })),
    ...shelves.newest.slice(0, 4).map((item) => ({ shelf: "NEW", item })),
    ...shelves.popular.slice(0, 4).map((item) => ({ shelf: "HOT", item })),
  ];
  return candidates
    .filter(({ item }) => {
      if (seen.has(item.slug)) return false;
      seen.add(item.slug);
      return true;
    })
    .slice(0, 10);
}

function isDirectIframeCartridge(cart: Cartridge): boolean {
  // Cartridges that live on our own static tree as a playable `index.html`
  // can be iframed directly; no client-side zip extraction is needed and
  // the wrapper's own `<script>`/`fetch` calls (e.g. js-dos loading its
  // wasm) resolve correctly because the iframe has a normal origin URL.
  const uri = cart.artifactUri || "";
  if (!uri.startsWith("/")) return false;
  if (uri.endsWith(".zip")) return false;
  return /\.html?($|[?#])/i.test(uri) || uri.endsWith("/");
}

function formatScoreHudMessage(result: any): string {
  const rank =
    result?.score?.playerRank != null ? `Rank #${result.score.playerRank}` : "Score submitted";
  const xp = Array.isArray(result?.xp)
    ? result.xp.reduce(
        (sum: number, award: any) =>
          sum + (Number.isFinite(Number(award?.amount)) ? Number(award.amount) : 0),
        0
      )
    : 0;
  return xp > 0 ? `${rank} / +${xp} XP` : rank;
}

/* ------------------------------------------------------------------ */
/*  Styled Components                                                  */
/* ------------------------------------------------------------------ */

const Wrapper = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a2e;
  overflow: hidden;
`;

const Chassis = styled.div<{ $wide?: boolean }>`
  width: 100%;
  max-width: ${(p) => (p.$wide ? "1180px" : "800px")};
  height: 100%;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #1e1e3a 0%, #12122a 60%, #0e0e22 100%);
  border: 2px solid #0a0a18;
  border-radius: 12px 12px 6px 6px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.05),
    0 4px 20px rgba(0, 0, 0, 0.6);
  overflow: hidden;
  position: relative;
`;

const TopStrip = styled.div`
  height: 32px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0 16px;
  background: linear-gradient(180deg, #2a2a50 0%, #1e1e3a 100%);
  border-bottom: 2px solid #0a0a18;
  gap: 8px;
`;

const ConsoleName = styled.span`
  font-family: var(--wtf-mono-font);
  font-weight: bold;
  font-size: 14px;
  color: #7b8fff;
  letter-spacing: 0;
  text-transform: uppercase;
  text-shadow: 0 0 8px rgba(123, 143, 255, 0.4);
`;

const CartSlot = styled.div`
  margin-left: auto;
  width: 60px;
  height: 10px;
  background: #0a0a18;
  border-radius: 2px;
  border: 1px solid #2a2a50;
  position: relative;
  overflow: hidden;
`;

const CartSlotFill = styled.div<{ $active: boolean }>`
  position: absolute;
  inset: 0;
  background: ${(p) =>
    p.$active
      ? "linear-gradient(90deg, #44ff88 0%, #00ccff 100%)"
      : "transparent"};
  transition: background 0.3s;
`;

const ScreenArea = styled.div`
  flex: 1;
  margin: 8px 12px;
  border-radius: 4px;
  overflow: hidden;
  background: #08081a;
  border: 2px solid #0a0a18;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8);
  position: relative;
  display: flex;
  flex-direction: column;
`;

const GameIframe = styled.iframe`
  width: 100%;
  height: 100%;
  border: none;
  background: #000;
`;

const RuntimeHud = styled.div`
  position: absolute;
  left: 8px;
  right: 8px;
  top: 8px;
  z-index: 4;
  display: flex;
  align-items: center;
  gap: 8px;
  pointer-events: none;
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  color: #dfe6ff;
`;

const HudPill = styled.div`
  min-height: 22px;
  padding: 4px 7px;
  border: 1px solid rgba(123, 143, 255, 0.45);
  background: rgba(8, 8, 26, 0.74);
  color: #dfe6ff;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.28);
`;

const bootGlow = keyframes`
  0% { opacity: 0; }
  50% { opacity: 1; }
  100% { opacity: 0; }
`;

const LoadingScreen = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #08081a;
  color: #7b8fff;
  font-family: var(--wtf-mono-font);
  z-index: 5;
`;

const LoadDot = styled.span`
  animation: ${bootGlow} 1.2s ease-in-out infinite;
  font-size: 24px;
`;

/* ── Library Screen ────────────────────────────────── */

const LibraryScreen = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  min-height: 0;
`;

const LibHeader = styled.div`
  padding: 12px 16px 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
`;

const LibTitle = styled.h2`
  font-family: var(--wtf-mono-font);
  font-size: 16px;
  color: #7b8fff;
  letter-spacing: 0;
  text-shadow: 0 0 6px rgba(123, 143, 255, 0.3);
  margin: 0;
`;

const LibrarySearchInput = styled.input`
  min-width: 120px;
  max-width: 190px;
  height: 32px;
  flex: 1 1 150px;
  border: 1px solid #2a2a50;
  background: #08081a;
  color: #dfe6ff;
  border-radius: 3px;
  padding: 0 8px;
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  outline: none;
`;

const LibrarySortSelect = styled.select`
  height: 32px;
  border: 1px solid #2a2a50;
  background: #08081a;
  color: #dfe6ff;
  border-radius: 3px;
  padding: 0 6px;
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  outline: none;
`;

const ConsoleStatsStrip = styled.div`
  flex-shrink: 0;
  border-top: 1px solid #111136;
  border-bottom: 1px solid #111136;
  padding: 8px 16px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
  gap: 7px;
  background: rgba(8, 8, 26, 0.28);

  @media (max-width: 760px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const ConsoleStatChip = styled.div`
  min-height: 36px;
  border: 1px solid #2a2a50;
  background: #10102a;
  border-radius: 4px;
  padding: 5px 7px;
  font-family: var(--wtf-mono-font);
  overflow: hidden;

  strong,
  span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #57f0be;
    font-size: var(--wtf-type-body, 14px);
  }

  span {
    color: #7777aa;
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const TabBtn = styled.button<{ $active?: boolean }>`
  min-height: 32px;
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  padding: 5px 10px;
  border: 1px solid ${(p) => (p.$active ? "#7b8fff" : "#2a2a50")};
  background: ${(p) => (p.$active ? "rgba(123,143,255,0.15)" : "transparent")};
  color: ${(p) => (p.$active ? "#aabbff" : "#555580")};
  cursor: pointer;
  border-radius: 3px;
  &:hover {
    border-color: #7b8fff;
  }
`;

const CartGrid = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  justify-content: center;
  grid-auto-rows: min-content;
  gap: 10px;
  padding: 8px 16px 16px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #2a2a50 #08081a;
`;

const ArcadeLibraryBody = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(248px, 300px);
  gap: 10px;
  padding: 0 12px 12px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
`;

const ArcadeCatalogPane = styled.div`
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid #111136;
  background: rgba(8, 8, 26, 0.18);
`;

const ArcadeRailPane = styled.aside`
  min-height: 0;
  overflow-y: auto;
  display: grid;
  align-content: start;
  gap: 8px;
  scrollbar-width: thin;
  scrollbar-color: #2a2a50 #08081a;
`;

const ArcadeRailSection = styled.section`
  border: 1px solid #24244e;
  background: rgba(10, 10, 30, 0.72);
  padding: 8px;
  display: grid;
  gap: 7px;
`;

const ArcadeRailHeader = styled.div<{ $tone?: "gold" | "green" | "orange" | "blue" }>`
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  letter-spacing: 0;
  color: ${(p) =>
    p.$tone === "gold"
      ? "#ffcb5c"
      : p.$tone === "green"
        ? "#57f0be"
        : p.$tone === "orange"
          ? "#ff8d5c"
          : "#88d7ff"};
`;

const ArcadeRailList = styled.div`
  display: grid;
  gap: 6px;

  button {
    min-width: 0;
    width: 100%;
    max-width: none;
  }
`;

const ChampionsStrip = styled.div`
  flex-shrink: 0;
  border-top: 1px solid #111136;
  border-bottom: 1px solid #111136;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: #2a2a50 #08081a;
`;

const ChampionsLabel = styled.div`
  flex: 0 0 auto;
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  letter-spacing: 0;
  color: #ffcb5c;
`;

const ChampionChip = styled.button`
  min-width: 152px;
  max-width: 176px;
  border: 1px solid #4c4460;
  background: linear-gradient(180deg, #1c1836 0%, #111126 100%);
  border-radius: 4px;
  color: #dfe6ff;
  padding: 6px 7px;
  display: grid;
  gap: 3px;
  text-align: left;
  cursor: pointer;

  &:hover {
    border-color: #ffcb5c;
  }

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-family: var(--wtf-mono-font);
    font-size: var(--wtf-type-caption, 13px);
    color: #aabbff;
  }

  span {
    font-family: var(--wtf-mono-font);
    font-size: var(--wtf-type-caption, 13px);
    color: #7777aa;
  }
`;

const ChampionScore = styled.div`
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  color: #ffcb5c;
`;

const DiscoveryStrip = styled(ChampionsStrip)`
  border-top: 0;
  background: rgba(8, 8, 26, 0.24);
`;

const DiscoveryLabel = styled(ChampionsLabel)`
  color: #88d7ff;
`;

const DiscoveryChip = styled.button`
  min-width: 150px;
  max-width: 184px;
  border: 1px solid #284462;
  background: linear-gradient(180deg, #102034 0%, #101126 100%);
  border-radius: 4px;
  color: #dfe6ff;
  padding: 6px 7px;
  display: grid;
  gap: 3px;
  text-align: left;
  cursor: pointer;
  font-family: var(--wtf-mono-font);

  &:hover {
    border-color: #88d7ff;
  }

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #88d7ff;
    font-size: var(--wtf-type-caption, 13px);
    letter-spacing: 0;
  }

  span {
    color: #dfe6ff;
    font-size: var(--wtf-type-caption, 13px);
  }

  em {
    color: #7777aa;
    font-size: var(--wtf-type-caption, 13px);
    font-style: normal;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

const PlayerLeaderboardStrip = styled.div`
  flex-shrink: 0;
  border-bottom: 1px solid #111136;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: #2a2a50 #08081a;
  background: rgba(8, 8, 26, 0.22);
`;

const PlayerLeaderboardLabel = styled(ChampionsLabel)`
  color: #57f0be;
`;

const PlayerLeaderboardChip = styled.button`
  min-width: 146px;
  max-width: 172px;
  border: 1px solid #284c55;
  background: linear-gradient(180deg, #102931 0%, #101126 100%);
  border-radius: 4px;
  color: #dfe6ff;
  padding: 6px 7px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 3px 7px;
  text-align: left;
  cursor: pointer;
  font-family: var(--wtf-mono-font);

  &:hover {
    border-color: #57f0be;
  }

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #dfe6ff;
    font-size: var(--wtf-type-caption, 13px);
  }

  span {
    color: #7777aa;
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const PlayerLeaderboardRank = styled.div`
  grid-row: span 2;
  min-width: 24px;
  color: #57f0be;
  font-size: var(--wtf-type-caption, 13px);
`;

const RecentScoresStrip = styled.div`
  flex-shrink: 0;
  border-bottom: 1px solid #111136;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: #2a2a50 #08081a;
  background: rgba(8, 8, 26, 0.18);
`;

const RecentScoresLabel = styled(ChampionsLabel)`
  color: #ff8d5c;
`;

const RecentScoreChip = styled.button`
  min-width: 154px;
  max-width: 190px;
  border: 1px solid #51324b;
  background: linear-gradient(180deg, #2a1633 0%, #101126 100%);
  border-radius: 4px;
  color: #dfe6ff;
  padding: 6px 7px;
  display: grid;
  gap: 3px;
  text-align: left;
  cursor: pointer;
  font-family: var(--wtf-mono-font);

  &:hover {
    border-color: #ff8d5c;
  }

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #ffcb5c;
    font-size: var(--wtf-type-caption, 13px);
  }

  span {
    color: #8888bb;
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const PlayerPanel = styled.form`
  flex-shrink: 0;
  border-bottom: 1px solid #111136;
  padding: 8px 16px;
  display: grid;
  gap: 7px;
  background: rgba(8, 8, 26, 0.35);
`;

const PlayerSearchRow = styled.div`
  display: flex;
  gap: 7px;
  align-items: center;
`;

const PlayerInput = styled.input`
  min-width: 0;
  flex: 1;
  height: 32px;
  border: 1px solid #2a2a50;
  background: #08081a;
  color: #dfe6ff;
  border-radius: 3px;
  padding: 0 8px;
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
`;

const MiniButton = styled.button`
  min-height: 32px;
  border: 1px solid #7b8fff;
  background: rgba(123, 143, 255, 0.15);
  color: #aabbff;
  border-radius: 3px;
  padding: 0 10px;
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  cursor: pointer;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
`;

const PlayerStatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const PlayerStat = styled.div`
  border: 1px solid #2a2a50;
  background: #10102a;
  border-radius: 3px;
  padding: 5px 7px;
  font-family: var(--wtf-mono-font);

  strong {
    display: block;
    color: #ffcb5c;
    font-size: var(--wtf-type-caption, 13px);
  }

  span {
    color: #7777aa;
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const PlayerGames = styled.div`
  display: flex;
  gap: 6px;
  overflow-x: auto;
`;

const PlayerGameChip = styled.button`
  min-width: 136px;
  border: 1px solid #2a2a50;
  background: #10102a;
  color: #dfe6ff;
  border-radius: 3px;
  padding: 5px 7px;
  text-align: left;
  font-family: var(--wtf-mono-font);
  cursor: pointer;

  strong,
  span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: #aabbff;
    font-size: var(--wtf-type-caption, 13px);
  }

  span {
    color: #7777aa;
    font-size: var(--wtf-type-caption, 13px);
  }
`;

const CartCard = styled.div`
  width: 100%;
  min-width: 0;
  border: 1px solid #2a2a50;
  border-radius: 6px;
  padding: 8px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: linear-gradient(180deg, #16163a 0%, #10102a 100%);
  box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:hover {
    border-color: #7b8fff;
    box-shadow: 0 0 10px rgba(123, 143, 255, 0.2);
  }
`;

const CartArt = styled.div`
  width: 100%;
  aspect-ratio: 1;
  border-radius: 4px;
  overflow: hidden;
  background: radial-gradient(circle at 50% 40%, #1a1a3e 0%, #0a0a1a 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #1a1a3e;
`;

const CartArtImg = styled.img`
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
`;

const CartArtFallback = styled.div`
  font-size: 36px;
  opacity: 0.4;
`;

const CartTitle = styled.div`
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  color: #aabbff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CartDesc = styled.div`
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  color: #555580;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SourceLine = styled.a`
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  color: #88d7ff;
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &[aria-disabled="true"] {
    pointer-events: none;
    color: #555580;
  }
`;

const ProvenanceCardLine = styled.div`
  display: grid;
  gap: 2px;
  min-height: 24px;
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  color: #b8c2ff;

  span,
  a {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  a {
    min-height: 32px;
    display: inline-flex;
    align-items: center;
    color: #ffcb5c;
    text-decoration: none;
  }
`;

const DemoBadge = styled.span`
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  color: #44ff88;
  letter-spacing: 0;
  text-transform: uppercase;
`;

const BadgeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  min-height: 12px;
`;

const ArcadeBadge = styled(DemoBadge)`
  color: #ffcb5c;
`;

const CreditBadge = styled(DemoBadge)`
  color: #57f0be;
`;

const PlaysBadge = styled.span`
  margin-left: auto;
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  color: #6f84ff;
`;

const ReportButton = styled.button`
  border: 1px solid #5a3150;
  background: #241127;
  color: #f0a5c8;
  border-radius: 3px;
  min-height: 32px;
  padding: 3px 7px;
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  cursor: pointer;
`;

const ReportOverlay = styled.div`
  position: absolute;
  inset: 0;
  z-index: 8;
  display: grid;
  place-items: center;
  background: rgba(8, 8, 26, 0.72);
  padding: 16px;
`;

const ReportDialog = styled.div`
  width: min(360px, 100%);
  border: 1px solid #7b8fff;
  background: #10102a;
  border-radius: 5px;
  padding: 12px;
  display: grid;
  gap: 9px;
  font-family: var(--wtf-mono-font);
  color: #dfe6ff;

  strong {
    color: #ffcb5c;
    font-size: var(--wtf-type-body, 14px);
  }

  select,
  textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid #2a2a50;
    background: #08081a;
    color: #dfe6ff;
    border-radius: 3px;
    padding: 7px;
    font-family: var(--wtf-mono-font);
    font-size: var(--wtf-type-caption, 13px);
  }

  textarea {
    min-height: 82px;
    resize: vertical;
  }
`;

const ReportActions = styled.div`
  display: flex;
  gap: 7px;
  justify-content: flex-end;
`;

const EmptyMsg = styled.div`
  font-family: var(--wtf-mono-font);
  font-size: 13px;
  color: #555580;
  text-align: center;
  padding: 40px 20px;
`;

const ProvenancePane = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 22px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 14px;
  background: radial-gradient(circle at 50% 0%, #1b1b42 0%, #08081a 62%);
  color: #dfe6ff;
  font-family: var(--wtf-mono-font);
`;

const ProvenanceEyebrow = styled.div`
  color: #ffcb5c;
  font-size: var(--wtf-type-caption, 13px);
  letter-spacing: 0;
  text-transform: uppercase;
`;

const ProvenanceTitle = styled.h2`
  margin: 0;
  color: #aabbff;
  font-size: 18px;
  letter-spacing: 0;
`;

const ProvenanceStatement = styled.p`
  margin: 0;
  max-width: 620px;
  font-size: 13px;
  line-height: 1.55;

  strong {
    color: #ffffff;
  }

  a {
    color: #88d7ff;
  }
`;

const ProvenanceLinkGrid = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
`;

const ProvenanceLinkButton = styled.a`
  min-height: 32px;
  display: inline-flex;
  align-items: center;
  border: 1px solid #7b8fff;
  background: rgba(123, 143, 255, 0.14);
  color: #dfe6ff;
  border-radius: 3px;
  padding: 6px 9px;
  font-size: var(--wtf-type-caption, 13px);
  text-decoration: none;
`;

const ProvenanceActions = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`;

const ArcadeErrorDesktop = styled.div`
  flex: 1;
  display: grid;
  place-items: center;
  padding: 18px;
  background: #008080;
  font-family: var(--wtf-mono-font);
`;

const ArcadeErrorWindow = styled.div`
  width: min(430px, 100%);
  border: 2px solid #0a0a0a;
  background: #c0c0c0;
  color: #0a0a0a;
  box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.55);
`;

const ArcadeErrorTitleBar = styled.div`
  height: 24px;
  display: flex;
  align-items: center;
  padding: 0 8px;
  background: #000080;
  color: #ffffff;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
`;

const ArcadeErrorBody = styled.div`
  padding: 16px;
  display: grid;
  gap: 12px;
  font-size: var(--wtf-type-caption, 13px);

  strong {
    font-size: 13px;
  }
`;

const ArcadeErrorActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
`;

/* ── Control Bar ────────────────────────────────── */

const ControlBar = styled.div`
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 0 16px;
  background: linear-gradient(180deg, #1e1e3a 0%, #16163a 100%);
  border-top: 2px solid #0a0a18;
`;

const CtrlBtn = styled.button<{ $color?: string; $size?: string }>`
  width: ${(p) => (p.$size === "large" ? "48px" : "36px")};
  height: ${(p) => (p.$size === "large" ? "48px" : "36px")};
  border-radius: 50%;
  border: 2px solid #0a0a18;
  background: ${(p) => p.$color || "#2a2a50"};
  color: #fff;
  font-family: var(--wtf-mono-font);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.15),
    0 2px 4px rgba(0, 0, 0, 0.4);
  transition: transform 0.1s;
  &:active {
    transform: scale(0.92);
  }
`;

const DPad = styled.div`
  display: grid;
  grid-template:
    ". u ." 12px
    "l c r" 12px
    ". d ." 12px
    / 12px 12px 12px;
  gap: 1px;
`;

const DPadBtn = styled.div<{ $area: string }>`
  grid-area: ${(p) => p.$area};
  background: #1e1e3a;
  border-radius: 2px;
  border: 1px solid #0a0a18;
`;

const BottomStrip = styled.div`
  height: 8px;
  flex-shrink: 0;
  background: linear-gradient(180deg, #12122a 0%, #0a0a18 100%);
  border-radius: 0 0 6px 6px;
`;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Console({ surface = "console" }: { surface?: ConsoleSurface } = {}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isArcade = surface === "arcade";
  const surfaceApi = isArcade ? "/api/arcade" : "/api/console";
  const surfaceKey = isArcade ? "arcade" : "console";
  const [view, setView] = useState<"library" | "provenance" | "payment" | "playing">("library");
  const [tab, setTab] = useState<"all" | "arcade" | "demos" | "wallet">("all");
  const [selectedCart, setSelectedCart] = useState<Cartridge | null>(null);
  const [pendingCart, setPendingCart] = useState<Cartridge | null>(null);
  const [paymentPrompt, setPaymentPrompt] = useState<ArcadePaymentPrompt | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [librarySearch, setLibrarySearch] = useState("");
  const [libraryCategory, setLibraryCategory] = useState("all");
  const [librarySort, setLibrarySort] = useState<LibrarySortMode>("popular");
  const [runtimeHud, setRuntimeHud] = useState<{
    status: string;
    scorePreview: number | null;
    lastScore: number | null;
    message: string | null;
  }>({
    status: "idle",
    scorePreview: null,
    lastScore: null,
    message: null,
  });
  const [playerLookup, setPlayerLookup] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [reportTarget, setReportTarget] = useState<Cartridge | null>(null);
  const [reportCategory, setReportCategory] = useState("broken");
  const [reportReason, setReportReason] = useState("");
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const gameBundleRef = useRef<GameBundle | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const arcadeSessionRef = useRef<Record<string, unknown>>({});

  const demosQuery = useQuery({
    queryKey: ["console", "demos"],
    queryFn: () => api.get<Cartridge[]>("/api/console/demo-cartridges"),
    enabled: !isArcade,
    staleTime: 600_000,
  });

  const catalogQuery = useQuery({
    queryKey: [surfaceKey, "catalog"],
    queryFn: () => api.get<ConsoleCatalog>(`${surfaceApi}/games`),
    staleTime: 60_000,
  });

  const statsQuery = useQuery({
    queryKey: [surfaceKey, "stats"],
    queryFn: () => api.get<ConsoleStats>(`${surfaceApi}/stats`),
    enabled: isArcade,
    staleTime: 60_000,
  });

  const arcadePaymentQuery = useQuery({
    queryKey: ["arcade", "play-fee"],
    queryFn: () => api.get<ArcadePlayFeeResponse>("/api/arcade/play-fee"),
    enabled: isArcade,
    staleTime: 60_000,
  });

  const arcadePlayStatusQuery = useQuery({
    queryKey: ["arcade", "play-status", user?.id],
    queryFn: () => api.get<ArcadePlayStatus>("/api/arcade/play-status"),
    enabled: isArcade && Boolean(user),
    retry: false,
    staleTime: 30_000,
  });

  const discoveryQuery = useQuery({
    queryKey: [surfaceKey, "discovery"],
    queryFn: () => api.get<ConsoleDiscoveryShelves>(`${surfaceApi}/discovery?limit=8`),
    enabled: isArcade,
    staleTime: 60_000,
  });

  const championsQuery = useQuery({
    queryKey: [surfaceKey, "champions"],
    queryFn: () =>
      api.get<ConsoleChampionsResponse>(`${surfaceApi}/champions?limit=12`),
    enabled: isArcade,
    staleTime: 60_000,
  });

  const topPlayersQuery = useQuery({
    queryKey: [surfaceKey, "top-players"],
    queryFn: () =>
      api.get<ConsoleTopPlayersResponse>(`${surfaceApi}/players/top?limit=12`),
    enabled: isArcade,
    staleTime: 60_000,
  });

  const recentScoresQuery = useQuery({
    queryKey: [surfaceKey, "recent-scores"],
    queryFn: () =>
      api.get<ConsoleRecentScoresResponse>(`${surfaceApi}/recent?limit=10`),
    enabled: isArcade,
    staleTime: 30_000,
  });

  const playerProfileQuery = useQuery({
    queryKey: [surfaceKey, "player", selectedPlayer],
    queryFn: () =>
      api.get<ConsolePlayerProfile>(
        `${surfaceApi}/player/${encodeURIComponent(selectedPlayer)}?limit=8`
      ),
    enabled: Boolean(selectedPlayer) && isArcade,
    retry: false,
    staleTime: 60_000,
  });

  const walletQuery = useQuery({
    queryKey: ["console", "cartridges"],
    queryFn: () => api.get<Cartridge[]>("/api/console/cartridges"),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const demos = isArcade ? [] : catalogQuery.data?.demos || demosQuery.data || [];
  const publishedCarts = catalogQuery.data?.published || [];
  const walletCarts = catalogQuery.data?.mine || walletQuery.data || [];
  const champions = championsQuery.data?.champions || [];
  const topPlayers = topPlayersQuery.data?.players || [];
  const recentScores = recentScoresQuery.data?.scores || [];
  const stats = statsQuery.data;
  const arcadePayment = catalogQuery.data?.payment || arcadePaymentQuery.data?.payment;
  const arcadePlayStatus = arcadePlayStatusQuery.data;
  const discoveryRail = buildDiscoveryRail(discoveryQuery.data);
  const playerProfile = playerProfileQuery.data;
  const baseCarts = isArcade
    ? catalogQuery.data?.all || publishedCarts
    : tab === "demos"
      ? demos
      : tab === "wallet"
        ? walletCarts
        : catalogQuery.data?.all || [...demos, ...walletCarts];
  const categoryOptions = Array.from(
    new Set(
      [
        ...(stats?.topCategories.map((entry) => entry.category) || []),
        ...((catalogQuery.data?.all || baseCarts).map((cart) => cart.category) || []),
        libraryCategory === "all" ? null : libraryCategory,
      ]
        .filter(Boolean)
        .map((category) => normalizeLibraryCategory(category))
    )
  ).sort((a, b) => a.localeCompare(b));
  const categoryCarts =
    libraryCategory === "all"
      ? baseCarts
      : baseCarts.filter(
          (cart) => normalizeLibraryCategory(cart.category) === libraryCategory
        );
  const libraryQuery = librarySearch.trim().toLowerCase();
  const filteredCarts = libraryQuery
    ? categoryCarts.filter((cart) =>
        [
          cart.title,
          cart.description,
          cart.category,
          cart.builderName,
          cart.sourceLabel,
          cart.licenseName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(libraryQuery)
      )
    : categoryCarts;
  const allCarts = [...filteredCarts].sort((a, b) => {
    if (librarySort === "title") return a.title.localeCompare(b.title);
    if (librarySort === "players") {
      return (b.playerCount || 0) - (a.playerCount || 0) || a.title.localeCompare(b.title);
    }
    return (b.playCount || 0) - (a.playCount || 0) || a.title.localeCompare(b.title);
  });

  const bootGame = useCallback(
    async (cart: Cartridge) => {
      setSelectedCart(cart);
      setPendingCart(null);
      setView("playing");
      setLoading(true);
      setError(null);
      setPaymentPrompt(null);
      setRuntimeHud({
        status: "booting",
        scorePreview: null,
        lastScore: null,
        message: null,
      });

      if (gameBundleRef.current) {
        gameBundleRef.current.revoke();
        gameBundleRef.current = null;
      }

      try {
        const gameSlug = cart.slug || cart.tokenId;
        if (isArcade && !user) {
          setPaymentPrompt({
            cart,
            reason: "login",
            message: "Sign in to buy or use a WTF Arcade play ticket.",
          });
          setView("payment");
          setLoading(false);
          return;
        }
        if (isArcade && gameSlug) {
          const session = await api.post(`${surfaceApi}/session`, { slug: gameSlug });
          arcadeSessionRef.current[gameSlug] = session;
          void queryClient.invalidateQueries({ queryKey: ["arcade", "play-status"] });
        }

        // Direct-iframe path: cartridge is a pre-extracted static bundle
        // on our own origin (produced by `scripts/install-games.mjs`).
        // The iframe loads the wrapper HTML which may internally pull in
        // WebAssembly (js-dos) or its own bundle; no client-side zip
        // extraction is needed.
        if (isDirectIframeCartridge(cart)) {
          if (iframeRef.current) {
            iframeRef.current.src = appendConsoleGameParams(
              cart.artifactUri,
              gameSlug
            );
          }
          setLoading(false);
          return;
        }

        // Fallback: wallet-owned or legacy zip cartridge served as a single
        // archive — inflate client-side and rewrite into blob URLs.
        let zipUrl = cart.artifactUri;
        if (
          !cart.isDemo &&
          !zipUrl.startsWith("/") &&
          !zipUrl.startsWith("blob:")
        ) {
          zipUrl = `/api/cache/media?url=${encodeURIComponent(zipUrl)}`;
        }

        const resp = await fetch(zipUrl);
        if (!resp.ok) throw new Error(`Failed to fetch cartridge (${resp.status})`);
        const buffer = await resp.arrayBuffer();
        const bundle = await loadGameFromZip(buffer);
        gameBundleRef.current = bundle;

        if (iframeRef.current) {
          iframeRef.current.src = bundle.entryUrl;
        }
        setLoading(false);
      } catch (err: any) {
        console.error("[console] failed to load game:", err);
        const message = err?.message || "Failed to load game";
        if (
          isArcade &&
          (/ticket required|payment required|play pass|arcade credit|buy a WTF Arcade Play ticket|Windows Arcade Error/i.test(message))
        ) {
          setPaymentPrompt({
            cart,
            reason: "ticket",
            message,
          });
          setView("payment");
          setError(null);
          setLoading(false);
          return;
        }
        setError(message);
        setLoading(false);
      }
    },
    [isArcade, queryClient, surfaceApi, user]
  );

  const launchGame = useCallback(
    (cart: Cartridge) => {
      const provenance = readEmbeddedProvenance(cart);
      if (provenance?.attributionRequired) {
        setSelectedCart(cart);
        setPendingCart(cart);
        setView("provenance");
        setLoading(false);
        setError(null);
        setRuntimeHud({
          status: "provenance",
          scorePreview: null,
          lastScore: null,
          message: "Attribution pending",
        });
        return;
      }
      void bootGame(cart);
    },
    [bootGame]
  );

  const exitGame = useCallback(() => {
    if (gameBundleRef.current) {
      gameBundleRef.current.revoke();
      gameBundleRef.current = null;
    }
    if (iframeRef.current) {
      iframeRef.current.src = "about:blank";
    }
    setView("library");
    setSelectedCart(null);
    setPendingCart(null);
    setPaymentPrompt(null);
    setError(null);
    setRuntimeHud({
      status: "idle",
      scorePreview: null,
      lastScore: null,
      message: null,
    });
  }, []);

  const resetGame = useCallback(() => {
    if (selectedCart) {
      void bootGame(selectedCart);
    }
  }, [selectedCart, bootGame]);

  async function submitReport() {
    if (!reportTarget?.slug || reporting) return;
    if (!user) {
      setReportStatus("Log in to report a game.");
      return;
    }
    setReporting(true);
    setReportStatus("Submitting report...");
    try {
      await api.post(`${surfaceApi}/games/${reportTarget.slug}/report`, {
        category: reportCategory,
        reason: reportReason,
      });
      setReportStatus("Report sent to the moderation queue.");
      setReportReason("");
      setTimeout(() => setReportTarget(null), 500);
    } catch (err) {
      setReportStatus(err instanceof Error ? err.message : "Report failed");
    } finally {
      setReporting(false);
    }
  }

  useEffect(() => {
    return () => {
      if (gameBundleRef.current) {
        gameBundleRef.current.revoke();
      }
    };
  }, [surfaceApi]);

  useEffect(() => {
    function handleConsoleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = event.data || {};
      if (!msg || typeof msg.type !== "string") return;
      if (!msg.type.startsWith("wtf-console:")) return;

      if (msg.type === "wtf-console:request") {
        handleRuntimeBridgeRequest(event, msg, {
          surface,
          arcadeSessions: arcadeSessionRef.current,
        });
        return;
      }

      if (msg.type === "wtf-console:ready") {
        setRuntimeHud((previous) => ({
          ...previous,
          status: "ready",
          message: msg.slug ? `Ready: ${msg.slug}` : "Ready",
        }));
        return;
      }

      if (msg.type === "wtf-console:session") {
        setRuntimeHud((previous) => ({
          ...previous,
          status: "running",
          message: msg.session?.player?.username
            ? `Player: ${msg.session.player.username}`
            : "Session started",
        }));
        return;
      }

      if (msg.type === "wtf-console:score-preview") {
        setRuntimeHud((previous) => ({
          ...previous,
          status: "running",
          scorePreview: Number.isFinite(Number(msg.score))
            ? Math.floor(Number(msg.score))
            : previous.scorePreview,
        }));
        return;
      }

      if (msg.type === "wtf-console:score" || msg.type === "wtf-console:game-over") {
        const score = Number(msg.result?.score?.score ?? msg.result?.score ?? NaN);
        setRuntimeHud((previous) => ({
          ...previous,
          status: msg.type === "wtf-console:game-over" ? "game over" : "scored",
          lastScore: Number.isFinite(score) ? Math.floor(score) : previous.lastScore,
          message: formatScoreHudMessage(msg.result),
        }));
      }
    }

    window.addEventListener("message", handleConsoleMessage);
    return () => window.removeEventListener("message", handleConsoleMessage);
  }, [surface]);

  function buildCacheUrl(uri: string | null | undefined): string | null {
    const v = String(uri || "").trim();
    if (!v) return null;
    if (v.startsWith("/")) return v;
    return `/api/cache/media?url=${encodeURIComponent(v)}`;
  }

  return (
    <AppWindow title={isArcade ? "WTF Arcade" : "WTF Console"}>
      <Wrapper>
        <Chassis $wide={isArcade}>
          <TopStrip>
            <ConsoleName>{isArcade ? "WTF ARCADE" : "WTF CONSOLE"}</ConsoleName>
            <CartSlot>
              <CartSlotFill $active={view !== "library"} />
            </CartSlot>
          </TopStrip>

          <ScreenArea>
            {view === "library" && (
              <LibraryScreen>
                <LibHeader>
                  <LibTitle>{isArcade ? "PUBLIC ARCADE" : "MY CONSOLE"}</LibTitle>
                  <LibrarySearchInput
                    value={librarySearch}
                    onChange={(event) => setLibrarySearch(event.target.value)}
                    placeholder="Search games"
                  />
                  <LibrarySortSelect
                    value={librarySort}
                    onChange={(event) =>
                      setLibrarySort(event.target.value as LibrarySortMode)
                    }
                  >
                    <option value="popular">Popular</option>
                    <option value="players">Players</option>
                    <option value="title">Title</option>
                  </LibrarySortSelect>
                  <LibrarySortSelect
                    value={libraryCategory}
                    onChange={(event) => setLibraryCategory(event.target.value)}
                  >
                    <option value="all">All categories</option>
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {formatCategoryLabel(category)}
                      </option>
                    ))}
                  </LibrarySortSelect>
                  {isArcade ? (
                    <TabBtn $active>ARCADE</TabBtn>
                  ) : (
                    <>
                      <TabBtn $active={tab === "all"} onClick={() => setTab("all")}>
                        ALL
                      </TabBtn>
                      <TabBtn
                        $active={tab === "demos"}
                        onClick={() => setTab("demos")}
                      >
                        STOCK
                      </TabBtn>
                      <TabBtn
                        $active={tab === "wallet"}
                        onClick={() => setTab("wallet")}
                      >
                        MY GAMES
                      </TabBtn>
                    </>
                  )}
                </LibHeader>

                {isArcade && stats && (
                  <ConsoleStatsStrip>
                    <ConsoleStatChip>
                      <strong>{stats.publishedGames}</strong>
                      <span>live games</span>
                    </ConsoleStatChip>
                    <ConsoleStatChip>
                      <strong>{stats.sourceArcadeGames}</strong>
                      <span>WTF Arcade</span>
                    </ConsoleStatChip>
                    <ConsoleStatChip>
                      <strong>{stats.gameStudioGames}</strong>
                      <span>Studio builds</span>
                    </ConsoleStatChip>
                    <ConsoleStatChip>
                      <strong>{stats.totalPlays.toLocaleString()}</strong>
                      <span>plays</span>
                    </ConsoleStatChip>
                    <ConsoleStatChip>
                      <strong>{stats.totalScores.toLocaleString()}</strong>
                      <span>scores</span>
                    </ConsoleStatChip>
                    <ConsoleStatChip>
                      <strong>{stats.totalConsoleXp.toLocaleString()}</strong>
                      <span>Arcade XP</span>
                    </ConsoleStatChip>
                    <ConsoleStatChip>
                      <strong>
                        {user
                          ? arcadePlayStatus?.bypass
                            ? "BYPASS"
                            : arcadePlayStatus
                              ? `${arcadePlayStatus.cardsOwned}/${arcadePlayStatus.ticketsOwned}`
                              : "..."
                          : "SIGN IN"}
                      </strong>
                      <span>{arcadePlayStatus?.bypass ? "trusted lane" : "cards / credits"}</span>
                    </ConsoleStatChip>
                  </ConsoleStatsStrip>
                )}

                {!isArcade && (
                  <ConsoleStatsStrip>
                    <ConsoleStatChip>
                      <strong>{demos.length}</strong>
                      <span>stock games</span>
                    </ConsoleStatChip>
                    <ConsoleStatChip>
                      <strong>{walletCarts.length}</strong>
                      <span>owned media</span>
                    </ConsoleStatChip>
                    <ConsoleStatChip>
                      <strong>{allCarts.length}</strong>
                      <span>visible now</span>
                    </ConsoleStatChip>
                    <ConsoleStatChip>
                      <strong>{user ? "YES" : "NO"}</strong>
                      <span>wallet scan</span>
                    </ConsoleStatChip>
                    <ConsoleStatChip>
                      <strong>{categoryOptions.length}</strong>
                      <span>categories</span>
                    </ConsoleStatChip>
                    <ConsoleStatChip>
                      <strong>LOCAL</strong>
                      <span>personal play</span>
                    </ConsoleStatChip>
                  </ConsoleStatsStrip>
                )}

                {isArcade ? (
                  <ArcadeLibraryBody>
                    <ArcadeCatalogPane>
                      {allCarts.length === 0 ? (
                        <EmptyMsg>
                          {libraryQuery || libraryCategory !== "all"
                            ? "No WTF Arcade games match that search."
                            : "No WTF Arcade games available."}
                        </EmptyMsg>
                      ) : (
                        <CartGrid>
                          {allCarts.map((cart) => (
                            <ArcadeCartCard
                              key={cart.id}
                              cart={cart}
                              buildCacheUrl={buildCacheUrl}
                              launchGame={launchGame}
                              setReportTarget={setReportTarget}
                              setReportStatus={setReportStatus}
                            />
                          ))}
                        </CartGrid>
                      )}
                    </ArcadeCatalogPane>
                    <ArcadeRailPane>
                      {discoveryRail.length > 0 && (
                        <ArcadeRailSection>
                          <ArcadeRailHeader $tone="blue">DISCOVER</ArcadeRailHeader>
                          <ArcadeRailList>
                            {discoveryRail.map(({ shelf, item }) => {
                              const cart =
                                catalogQuery.data?.all.find((entry) => entry.slug === item.slug) ||
                                publishedCarts.find((entry) => entry.slug === item.slug);
                              return (
                                <DiscoveryChip
                                  key={`${shelf}-${item.slug}`}
                                  type="button"
                                  onClick={() => {
                                    if (cart) {
                                      launchGame(cart);
                                    } else {
                                      setLibrarySearch(item.title);
                                      setTab("all");
                                    }
                                  }}
                                >
                                  <strong>{shelf}</strong>
                                  <span>{item.title}</span>
                                  <em>
                                    {item.sourceLabel ||
                                      item.builderName ||
                                      formatCategoryLabel(item.category)}
                                  </em>
                                </DiscoveryChip>
                              );
                            })}
                          </ArcadeRailList>
                        </ArcadeRailSection>
                      )}
                      {champions.length > 0 && (
                        <ArcadeRailSection>
                          <ArcadeRailHeader $tone="gold">CHAMPIONS</ArcadeRailHeader>
                          <ArcadeRailList>
                            {champions.map((champion) => (
                              <ChampionChip
                                key={`${champion.slug}-${champion.userId}`}
                                onClick={() => {
                                  setPlayerLookup(champion.username);
                                  setSelectedPlayer(champion.username);
                                }}
                              >
                                <strong>{champion.title}</strong>
                                <ChampionScore>{champion.score.toLocaleString()}</ChampionScore>
                                <span>{champion.displayName || champion.username}</span>
                              </ChampionChip>
                            ))}
                          </ArcadeRailList>
                        </ArcadeRailSection>
                      )}
                      {topPlayers.length > 0 && (
                        <ArcadeRailSection>
                          <ArcadeRailHeader $tone="green">TOP PLAYERS</ArcadeRailHeader>
                          <ArcadeRailList>
                            {topPlayers.map((player) => (
                              <PlayerLeaderboardChip
                                key={player.userId}
                                onClick={() => {
                                  setPlayerLookup(player.username);
                                  setSelectedPlayer(player.username);
                                }}
                              >
                                <PlayerLeaderboardRank>#{player.rank}</PlayerLeaderboardRank>
                                <strong>{player.displayName || player.username}</strong>
                                <span>{player.consoleXp} XP / {player.totalPlays} plays</span>
                              </PlayerLeaderboardChip>
                            ))}
                          </ArcadeRailList>
                        </ArcadeRailSection>
                      )}
                      {recentScores.length > 0 && (
                        <ArcadeRailSection>
                          <ArcadeRailHeader $tone="orange">RECENT SCORES</ArcadeRailHeader>
                          <ArcadeRailList>
                            {recentScores.map((score) => {
                              const cart =
                                catalogQuery.data?.all.find((entry) => entry.slug === score.slug) ||
                                publishedCarts.find((entry) => entry.slug === score.slug);
                              return (
                                <RecentScoreChip
                                  key={score.id}
                                  type="button"
                                  onClick={() => {
                                    setPlayerLookup(score.username);
                                    setSelectedPlayer(score.username);
                                    if (cart) launchGame(cart);
                                  }}
                                >
                                  <strong>{score.score.toLocaleString()}</strong>
                                  <span>{score.gameTitle || score.title}</span>
                                  <span>{score.displayName || score.username}</span>
                                </RecentScoreChip>
                              );
                            })}
                          </ArcadeRailList>
                        </ArcadeRailSection>
                      )}
                      <PlayerPanel
                        onSubmit={(event) => {
                          event.preventDefault();
                          const lookup = playerLookup.trim();
                          if (lookup) setSelectedPlayer(lookup);
                        }}
                      >
                        <PlayerSearchRow>
                          <PlayerInput
                            value={playerLookup}
                            onChange={(event) => setPlayerLookup(event.target.value)}
                            placeholder="Player username"
                          />
                          <MiniButton disabled={!playerLookup.trim()} type="submit">
                            LOOKUP
                          </MiniButton>
                        </PlayerSearchRow>
                        {playerProfile && (
                          <>
                            <PlayerStatsGrid>
                              <PlayerStat>
                                <strong>{playerProfile.summary.gamesPlayed}</strong>
                                <span>games</span>
                              </PlayerStat>
                              <PlayerStat>
                                <strong>{playerProfile.summary.totalPlays}</strong>
                                <span>plays</span>
                              </PlayerStat>
                              <PlayerStat>
                                <strong>{playerProfile.summary.totalScore.toLocaleString()}</strong>
                                <span>total score</span>
                              </PlayerStat>
                              <PlayerStat>
                                <strong>{playerProfile.summary.firstPlaceCount}</strong>
                                <span>first place</span>
                              </PlayerStat>
                              <PlayerStat>
                                <strong>{playerProfile.summary.consoleXp}</strong>
                                <span>arcade XP</span>
                              </PlayerStat>
                            </PlayerStatsGrid>
                            <PlayerGames>
                              {playerProfile.games.map((game) => {
                                const cart = publishedCarts.find(
                                  (entry) => entry.slug === game.slug
                                );
                                return (
                                  <PlayerGameChip
                                    key={game.slug}
                                    disabled={!cart}
                                    onClick={() => {
                                      if (cart) launchGame(cart);
                                    }}
                                    type="button"
                                  >
                                    <strong>{game.title}</strong>
                                    <span>#{game.rank} / {game.bestScore.toLocaleString()}</span>
                                  </PlayerGameChip>
                                );
                              })}
                            </PlayerGames>
                          </>
                        )}
                      </PlayerPanel>
                    </ArcadeRailPane>
                  </ArcadeLibraryBody>
                ) : allCarts.length === 0 ? (
                  <EmptyMsg>
                    {tab === "wallet"
                      ? user
                        ? libraryQuery
                          ? "No cartridges match that search."
                          : "No game cartridges found yet.\nAdd a game token from My Gallery or look for tokens with .zip artifacts."
                        : "Log in to scan your wallet for game cartridges."
                      : libraryQuery || libraryCategory !== "all"
                        ? "No cartridges match that search."
                        : "No cartridges available."}
                  </EmptyMsg>
                ) : (
                  <CartGrid>
                    {allCarts.map((cart) => (
                      <ArcadeCartCard
                        key={cart.id}
                        cart={cart}
                        buildCacheUrl={buildCacheUrl}
                        launchGame={launchGame}
                        setReportTarget={setReportTarget}
                        setReportStatus={setReportStatus}
                      />
                    ))}
                  </CartGrid>
                )}
                {reportTarget && (
                  <ReportOverlay>
                    <ReportDialog>
                      <strong>Report {reportTarget.title}</strong>
                      <select
                        value={reportCategory}
                        onChange={(event) => setReportCategory(event.target.value)}
                      >
                        {REPORT_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {category}
                          </option>
                        ))}
                      </select>
                      <textarea
                        value={reportReason}
                        onChange={(event) => setReportReason(event.target.value)}
                        placeholder="What should moderators review?"
                      />
                      {reportStatus && <CartDesc>{reportStatus}</CartDesc>}
                      <ReportActions>
                        <MiniButton
                          type="button"
                          onClick={() => {
                            setReportTarget(null);
                            setReportReason("");
                          }}
                        >
                          CANCEL
                        </MiniButton>
                        <MiniButton
                          type="button"
                          disabled={reporting || reportReason.trim().length < 8}
                          onClick={submitReport}
                        >
                          SEND
                        </MiniButton>
                      </ReportActions>
                    </ReportDialog>
                  </ReportOverlay>
                )}
              </LibraryScreen>
            )}

            {view === "provenance" && selectedCart && (
              <ProvenanceGate
                cart={selectedCart}
                onBack={exitGame}
                onPlay={() => {
                  const cart = pendingCart || selectedCart;
                  void bootGame(cart);
                }}
              />
            )}

            {view === "payment" && selectedCart && (
              <ArcadePaymentGate
                cart={selectedCart}
                payment={arcadePayment}
                playStatus={arcadePlayStatus}
                prompt={paymentPrompt}
                onBack={exitGame}
                onRetry={() => {
                  void bootGame(selectedCart);
                }}
              />
            )}

            {view === "playing" && (
              <>
                {loading && (
                  <LoadingScreen>
                    <LoadDot>&#9632;</LoadDot>
                    <div
                      style={{
                        marginTop: 12,
                        fontSize: "var(--wtf-type-caption, 13px)",
                        letterSpacing: 0,
                      }}
                    >
                      LOADING CARTRIDGE...
                    </div>
                  </LoadingScreen>
                )}
                {error && (
                  <LoadingScreen>
                    <div style={{ color: "#ff4444", fontSize: 14 }}>
                      ERROR
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: "var(--wtf-type-caption, 13px)",
                        color: "#aa4444",
                        maxWidth: 300,
                        textAlign: "center",
                      }}
                    >
                      {error}
                    </div>
                    <CtrlBtn
                      $color="#444"
                      style={{
                        marginTop: 16,
                        width: "auto",
                        borderRadius: 4,
                        padding: "6px 16px",
                      }}
                      onClick={exitGame}
                    >
                      BACK
                    </CtrlBtn>
                  </LoadingScreen>
                )}
                <GameIframe
                  ref={iframeRef}
                  sandbox={
                    selectedCart?.isPublished
                      ? "allow-scripts allow-pointer-lock allow-forms allow-downloads"
                      : "allow-scripts allow-same-origin allow-pointer-lock"
                  }
                  allow="fullscreen; gamepad; autoplay"
                  allowFullScreen
                  title={selectedCart?.title || "Game"}
                  style={{ display: loading || error ? "none" : "block" }}
                />
                {!loading && !error && (
                  <RuntimeHud>
                    <HudPill>{runtimeHud.status.toUpperCase()}</HudPill>
                    {runtimeHud.scorePreview != null && (
                      <HudPill>LIVE {runtimeHud.scorePreview}</HudPill>
                    )}
                    {runtimeHud.lastScore != null && (
                      <HudPill>LAST {runtimeHud.lastScore}</HudPill>
                    )}
                    {runtimeHud.message && <HudPill>{runtimeHud.message}</HudPill>}
                  </RuntimeHud>
                )}
              </>
            )}
          </ScreenArea>

          <ControlBar>
            <DPad>
              <DPadBtn $area="u" />
              <DPadBtn $area="l" />
              <DPadBtn $area="c" />
              <DPadBtn $area="r" />
              <DPadBtn $area="d" />
            </DPad>

            {view === "playing" ? (
              <>
                <CtrlBtn $color="#cc3344" onClick={resetGame} title="Reset">
                  RST
                </CtrlBtn>
                <CtrlBtn $color="#3344cc" onClick={exitGame} title="Eject">
                  ⏏
                </CtrlBtn>
              </>
            ) : (
              <div
                style={{
                  fontFamily: 'var(--wtf-mono-font)',
                  fontSize: "var(--wtf-type-caption, 13px)",
                  color: "#555580",
                  letterSpacing: 0,
                }}
              >
                SELECT A CARTRIDGE
              </div>
            )}

            <CtrlBtn
              $color="#44aa44"
              style={{ width: 32, height: 32 }}
            >
              A
            </CtrlBtn>
            <CtrlBtn
              $color="#cc8800"
              style={{ width: 32, height: 32 }}
            >
              B
            </CtrlBtn>
          </ControlBar>

          <BottomStrip />
        </Chassis>
      </Wrapper>
    </AppWindow>
  );
}

function ArcadeCartCard({
  cart,
  buildCacheUrl,
  launchGame,
  setReportTarget,
  setReportStatus,
}: {
  cart: Cartridge;
  buildCacheUrl: (uri: string | null | undefined) => string | null;
  launchGame: (cart: Cartridge) => void;
  setReportTarget: (cart: Cartridge) => void;
  setReportStatus: (status: string | null) => void;
}) {
  const provenance = readEmbeddedProvenance(cart);
  const supportLink = provenanceSupportLinks(provenance)[0] || null;
  const creditPrice = Math.max(0, Number(cart.arcadeCreditPrice ?? 1));
  const creditLabel = cart.arcadeCreditsRequired === false || creditPrice <= 0
    ? "FREE"
    : `${creditPrice} CR`;

  return (
    <CartCard onClick={() => launchGame(cart)}>
      <CartArt>
        {cart.thumbnailUri ? (
          <CartArtImg
            src={buildCacheUrl(cart.thumbnailUri) || cart.thumbnailUri}
            alt={cart.title}
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <CartArtFallback>{cart.isDemo ? "🕹️" : "🎮"}</CartArtFallback>
        )}
      </CartArt>
      <CartTitle>{cart.title}</CartTitle>
      <CartDesc>
        {cart.builderName
          ? `${cart.builderName} · ${cart.category || "arcade"}`
          : cart.description}
      </CartDesc>
      {provenance && (
        <ProvenanceCardLine>
          <span title={provenance.creatorAddress || undefined}>
            By {provenanceCreatorLabel(provenance)}
            {provenanceXLabel(provenance) ? ` / ${provenanceXLabel(provenance)}` : ""}
          </span>
          {supportLink && (
            <a
              href={supportLink.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => event.stopPropagation()}
            >
              Support on Tezos
            </a>
          )}
        </ProvenanceCardLine>
      )}
      {cart.sourceLabel && (
        <SourceLine
          href={cart.sourceUrl || "#"}
          target={cart.sourceUrl ? "_blank" : undefined}
          rel={cart.sourceUrl ? "noopener noreferrer" : undefined}
          onClick={(event) => event.stopPropagation()}
          aria-disabled={!cart.sourceUrl}
        >
          {cart.licenseName
            ? `${cart.sourceLabel} · ${cart.licenseName}`
            : cart.sourceLabel}
        </SourceLine>
      )}
      <BadgeRow>
        {cart.isPublished ? (
          <ArcadeBadge>ARCADE</ArcadeBadge>
        ) : cart.isDemo ? (
          <DemoBadge>DEMO</DemoBadge>
        ) : (
          <DemoBadge>OWNED</DemoBadge>
        )}
        {cart.isPublished && <CreditBadge>{creditLabel}</CreditBadge>}
        {cart.leaderboardEnabled && (
          <PlaysBadge>{cart.playCount || 0} plays</PlaysBadge>
        )}
        {cart.isPublished && (
          <ReportButton
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setReportTarget(cart);
              setReportStatus(null);
            }}
          >
            REPORT
          </ReportButton>
        )}
      </BadgeRow>
    </CartCard>
  );
}

function ProvenanceGate({
  cart,
  onBack,
  onPlay,
}: {
  cart: Cartridge;
  onBack: () => void;
  onPlay: () => void;
}) {
  const provenance = readEmbeddedProvenance(cart);
  const creator = provenanceCreatorLabel(provenance);
  const xLabel = provenanceXLabel(provenance);
  const links = provenanceSupportLinks(provenance);
  const tokenTitle = provenance?.tokenTitle || cart.title;

  return (
    <ProvenancePane>
      <ProvenanceEyebrow>Creator Provenance</ProvenanceEyebrow>
      <ProvenanceTitle>{cart.title}</ProvenanceTitle>
      <ProvenanceStatement>
        This game was made by <strong>{creator}</strong>
        {xLabel && provenance?.xUrl ? (
          <>
            {" "}
            <a href={provenance.xUrl} target="_blank" rel="noopener noreferrer">
              {xLabel}
            </a>
          </>
        ) : xLabel ? (
          <> {xLabel}</>
        ) : null}{" "}
        and can be purchased on Tezos.
      </ProvenanceStatement>
      <ProvenanceStatement>
        Token: <strong>{tokenTitle}</strong>
        {provenance?.tokenContract && provenance?.tokenId
          ? ` · ${provenance.tokenContract} #${provenance.tokenId}`
          : ""}
      </ProvenanceStatement>
      <ProvenanceLinkGrid>
        {links.map((link) => {
          const price = formatProvenancePrice(link);
          return (
            <ProvenanceLinkButton
              key={`${link.kind}-${link.url}-${link.listingId || link.label}`}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {price ? `${link.label} · ${price}` : link.label}
            </ProvenanceLinkButton>
          );
        })}
        {provenance?.explorerUrl && (
          <ProvenanceLinkButton
            href={provenance.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            TzKT token record
          </ProvenanceLinkButton>
        )}
      </ProvenanceLinkGrid>
      <ProvenanceActions>
        <MiniButton type="button" onClick={onPlay}>
          PLAY
        </MiniButton>
        <MiniButton type="button" onClick={onBack}>
          BACK
        </MiniButton>
      </ProvenanceActions>
    </ProvenancePane>
  );
}

function ArcadePaymentGate({
  cart,
  payment,
  playStatus,
  prompt,
  onBack,
  onRetry,
}: {
  cart: Cartridge;
  payment: ArcadePaymentConfig | undefined;
  playStatus: ArcadePlayStatus | undefined;
  prompt: ArcadePaymentPrompt | null;
  onBack: () => void;
  onRetry: () => void;
}) {
  const feeLabel = payment?.feeWtfFormatted || "1.00";
  const storeHref = "/wtfiam?category=arcade";
  const reason = prompt?.reason || "ticket";
  const message =
    prompt?.message ||
    "Windows Arcade Error: You need a WTF Arcade Play Pass Card loaded with credits to play this game.";
  const creditsPerPlay = Math.max(1, Number(cart.arcadeCreditPrice ?? playStatus?.creditsPerPlay ?? 1));

  return (
    <ArcadeErrorDesktop>
      <ArcadeErrorWindow role="alertdialog" aria-label="Arcade Play Pass Required">
        <ArcadeErrorTitleBar>WTF Arcade</ArcadeErrorTitleBar>
        <ArcadeErrorBody>
          <strong>{cart.title}</strong>
          <div>{message}</div>
          <div>
            Machine price: {creditsPerPlay} credit{creditsPerPlay === 1 ? "" : "s"}.
            Credit pack: {feeLabel} WTF
            {payment?.configured === false ? " (contract configuration pending)" : ""}.
          </div>
          {playStatus && reason !== "login" && (
            <div>
              Play Pass Card:{" "}
              {playStatus.bypass
                ? "trusted bypass"
                : `${playStatus.cardsOwned.toLocaleString()} card${
                    playStatus.cardsOwned === 1 ? "" : "s"
                  }, ${playStatus.ticketsOwned.toLocaleString()} credit${
                    playStatus.ticketsOwned === 1 ? "" : "s"
                  } loaded`}
            </div>
          )}
          <ArcadeErrorActions>
            {reason === "login" ? (
              <ProvenanceLinkButton href="/login">SIGN IN</ProvenanceLinkButton>
            ) : (
              <>
                <ProvenanceLinkButton href={storeHref}>
                  Get a Play Pass at WTF Market →
                </ProvenanceLinkButton>
              </>
            )}
            <MiniButton type="button" onClick={onRetry}>
              RETRY
            </MiniButton>
            <MiniButton type="button" onClick={onBack}>
              CANCEL
            </MiniButton>
          </ArcadeErrorActions>
        </ArcadeErrorBody>
      </ArcadeErrorWindow>
    </ArcadeErrorDesktop>
  );
}

function appendConsoleGameParams(uri: string, slug: string | undefined): string {
  const gameSlug = String(slug || "").trim();
  if (!gameSlug) return uri;
  try {
    const url = new URL(uri, window.location.origin);
    if (!url.searchParams.has("game")) url.searchParams.set("game", gameSlug);
    if (!url.searchParams.has("slug")) url.searchParams.set("slug", gameSlug);
    return url.pathname + url.search + url.hash;
  } catch {
    return uri;
  }
}

async function handleRuntimeBridgeRequest(
  event: MessageEvent,
  msg: any,
  options: {
    surface: ConsoleSurface;
    arcadeSessions: Record<string, unknown>;
  }
) {
  const source = event.source as WindowProxy | null;
  if (!source || !msg.id) return;
  const respond = (payload: Record<string, unknown>) => {
    source.postMessage(
      { type: "wtf-console:response", id: msg.id, ...payload },
      event.origin && event.origin !== "null" ? event.origin : "*"
    );
  };

  try {
    if (msg.action !== "postJson") {
      throw new Error("Unsupported console bridge action");
    }
    const path = String(msg.payload?.path || "");
    const allowed =
      path === "/api/console/session" ||
      path === "/api/console/scores" ||
      path === "/api/arcade/session" ||
      path === "/api/arcade/scores";
    if (!allowed) {
      throw new Error("Console bridge path denied");
    }
    const body = msg.payload?.body || {};
    if (options.surface === "arcade") {
      const slug = String(body.slug || "").trim();
      const isSessionRequest = path.endsWith("/session");
      if (isSessionRequest && slug && options.arcadeSessions[slug]) {
        respond({ ok: true, data: options.arcadeSessions[slug] });
        return;
      }
      const arcadePath =
        isSessionRequest ? "/api/arcade/session" : "/api/arcade/scores";
      const data = await api.post(arcadePath, body);
      if (isSessionRequest && slug) {
        options.arcadeSessions[slug] = data;
      }
      respond({ ok: true, data });
      return;
    }
    if (path.startsWith("/api/arcade/")) {
      throw new Error("WTF Arcade runs in the Arcade app.");
    }
    const data = await api.post(path, body);
    respond({ ok: true, data });
  } catch (err: any) {
    respond({ ok: false, error: err?.message || "Console bridge failed" });
  }
}
