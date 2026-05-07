import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
  maxPossibleScore?: number | null;
  maxScorePerSecond?: number | null;
};

type ConsoleCatalog = {
  demos: Cartridge[];
  published: Cartridge[];
  mine: Cartridge[];
  all: Cartridge[];
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

const Chassis = styled.div`
  width: 100%;
  max-width: 800px;
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
  font-family: "Courier New", monospace;
  font-weight: bold;
  font-size: 14px;
  color: #7b8fff;
  letter-spacing: 3px;
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
  font-family: "Courier New", monospace;
  font-size: 10px;
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
  font-family: "Courier New", monospace;
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
`;

const LibHeader = styled.div`
  padding: 12px 16px 8px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
`;

const LibTitle = styled.h2`
  font-family: "Courier New", monospace;
  font-size: 16px;
  color: #7b8fff;
  letter-spacing: 2px;
  text-shadow: 0 0 6px rgba(123, 143, 255, 0.3);
  margin: 0;
`;

const TabBtn = styled.button<{ $active?: boolean }>`
  font-family: "Courier New", monospace;
  font-size: 11px;
  padding: 4px 10px;
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
  grid-template-columns: repeat(auto-fill, 140px);
  justify-content: center;
  grid-auto-rows: min-content;
  gap: 10px;
  padding: 8px 16px 16px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #2a2a50 #08081a;
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
  font-family: "Courier New", monospace;
  font-size: 10px;
  letter-spacing: 1px;
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
    font-family: "Courier New", monospace;
    font-size: 10px;
    color: #aabbff;
  }

  span {
    font-family: "Courier New", monospace;
    font-size: 9px;
    color: #7777aa;
  }
`;

const ChampionScore = styled.div`
  font-family: "Courier New", monospace;
  font-size: 10px;
  color: #ffcb5c;
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
  height: 26px;
  border: 1px solid #2a2a50;
  background: #08081a;
  color: #dfe6ff;
  border-radius: 3px;
  padding: 0 8px;
  font-family: "Courier New", monospace;
  font-size: 11px;
`;

const MiniButton = styled.button`
  height: 26px;
  border: 1px solid #7b8fff;
  background: rgba(123, 143, 255, 0.15);
  color: #aabbff;
  border-radius: 3px;
  padding: 0 10px;
  font-family: "Courier New", monospace;
  font-size: 10px;
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
  font-family: "Courier New", monospace;

  strong {
    display: block;
    color: #ffcb5c;
    font-size: 11px;
  }

  span {
    color: #7777aa;
    font-size: 9px;
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
  font-family: "Courier New", monospace;
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
    font-size: 10px;
  }

  span {
    color: #7777aa;
    font-size: 9px;
  }
`;

const CartCard = styled.div`
  width: 140px;
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
  font-family: "Courier New", monospace;
  font-size: 11px;
  font-weight: bold;
  color: #aabbff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const CartDesc = styled.div`
  font-family: "Courier New", monospace;
  font-size: 9px;
  color: #555580;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const SourceLine = styled.a`
  font-family: "Courier New", monospace;
  font-size: 8px;
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
  font-family: "Courier New", monospace;
  font-size: 8px;
  color: #b8c2ff;

  span,
  a {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  a {
    color: #ffcb5c;
    text-decoration: none;
  }
`;

const DemoBadge = styled.span`
  font-family: "Courier New", monospace;
  font-size: 8px;
  color: #44ff88;
  letter-spacing: 1px;
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

const PlaysBadge = styled.span`
  margin-left: auto;
  font-family: "Courier New", monospace;
  font-size: 8px;
  color: #6f84ff;
`;

const ReportButton = styled.button`
  border: 1px solid #5a3150;
  background: #241127;
  color: #f0a5c8;
  border-radius: 3px;
  padding: 1px 5px;
  font-family: "Courier New", monospace;
  font-size: 8px;
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
  font-family: "Courier New", monospace;
  color: #dfe6ff;

  strong {
    color: #ffcb5c;
    font-size: 12px;
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
    font-family: "Courier New", monospace;
    font-size: 11px;
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
  font-family: "Courier New", monospace;
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
  font-family: "Courier New", monospace;
`;

const ProvenanceEyebrow = styled.div`
  color: #ffcb5c;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
`;

const ProvenanceTitle = styled.h2`
  margin: 0;
  color: #aabbff;
  font-size: 18px;
  letter-spacing: 1px;
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
  border: 1px solid #7b8fff;
  background: rgba(123, 143, 255, 0.14);
  color: #dfe6ff;
  border-radius: 3px;
  padding: 6px 9px;
  font-size: 10px;
  text-decoration: none;
`;

const ProvenanceActions = styled.div`
  display: flex;
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
  font-family: "Courier New", monospace;
  font-size: ${(p) => (p.$size === "large" ? "10px" : "8px")};
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

export function Console() {
  const { user } = useAuth();
  const [view, setView] = useState<"library" | "provenance" | "playing">("library");
  const [tab, setTab] = useState<"all" | "arcade" | "demos" | "wallet">("all");
  const [selectedCart, setSelectedCart] = useState<Cartridge | null>(null);
  const [pendingCart, setPendingCart] = useState<Cartridge | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  const demosQuery = useQuery({
    queryKey: ["console", "demos"],
    queryFn: () => api.get<Cartridge[]>("/api/console/demo-cartridges"),
    staleTime: 600_000,
  });

  const catalogQuery = useQuery({
    queryKey: ["console", "catalog"],
    queryFn: () => api.get<ConsoleCatalog>("/api/console/games"),
    staleTime: 60_000,
  });

  const championsQuery = useQuery({
    queryKey: ["console", "champions"],
    queryFn: () =>
      api.get<ConsoleChampionsResponse>("/api/console/champions?limit=12"),
    staleTime: 60_000,
  });

  const playerProfileQuery = useQuery({
    queryKey: ["console", "player", selectedPlayer],
    queryFn: () =>
      api.get<ConsolePlayerProfile>(
        `/api/console/player/${encodeURIComponent(selectedPlayer)}?limit=8`
      ),
    enabled: Boolean(selectedPlayer),
    retry: false,
    staleTime: 60_000,
  });

  const walletQuery = useQuery({
    queryKey: ["console", "cartridges"],
    queryFn: () => api.get<Cartridge[]>("/api/console/cartridges"),
    enabled: Boolean(user),
    staleTime: 60_000,
  });

  const demos = catalogQuery.data?.demos || demosQuery.data || [];
  const publishedCarts = catalogQuery.data?.published || [];
  const walletCarts = catalogQuery.data?.mine || walletQuery.data || [];
  const champions = championsQuery.data?.champions || [];
  const playerProfile = playerProfileQuery.data;
  const allCarts =
    tab === "demos"
      ? demos
      : tab === "arcade"
        ? publishedCarts
      : tab === "wallet"
        ? walletCarts
        : catalogQuery.data?.all || [...publishedCarts, ...demos, ...walletCarts];

  const bootGame = useCallback(
    async (cart: Cartridge) => {
      setSelectedCart(cart);
      setPendingCart(null);
      setView("playing");
      setLoading(true);
      setError(null);
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
        // Direct-iframe path: cartridge is a pre-extracted static bundle
        // on our own origin (produced by `scripts/install-games.mjs`).
        // The iframe loads the wrapper HTML which may internally pull in
        // WebAssembly (js-dos) or its own bundle; no client-side zip
        // extraction is needed.
        if (isDirectIframeCartridge(cart)) {
          if (iframeRef.current) {
            iframeRef.current.src = appendConsoleGameParams(
              cart.artifactUri,
              cart.slug || cart.tokenId
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
        setError(err.message || "Failed to load game");
        setLoading(false);
      }
    },
    []
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
      await api.post(`/api/console/games/${reportTarget.slug}/report`, {
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
  }, []);

  useEffect(() => {
    function handleConsoleMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = event.data || {};
      if (!msg || typeof msg.type !== "string") return;
      if (!msg.type.startsWith("wtf-console:")) return;

      if (msg.type === "wtf-console:request") {
        handleRuntimeBridgeRequest(event, msg);
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
  }, []);

  function buildCacheUrl(uri: string | null | undefined): string | null {
    const v = String(uri || "").trim();
    if (!v) return null;
    if (v.startsWith("/")) return v;
    return `/api/cache/media?url=${encodeURIComponent(v)}`;
  }

  return (
    <AppWindow title="WTF Console">
      <Wrapper>
        <Chassis>
          <TopStrip>
            <ConsoleName>WTF CONSOLE</ConsoleName>
            <CartSlot>
              <CartSlotFill $active={view !== "library"} />
            </CartSlot>
          </TopStrip>

          <ScreenArea>
            {view === "library" && (
              <LibraryScreen>
                <LibHeader>
                  <LibTitle>GAME LIBRARY</LibTitle>
                  <TabBtn $active={tab === "all"} onClick={() => setTab("all")}>
                    ALL
                  </TabBtn>
                  <TabBtn
                    $active={tab === "arcade"}
                    onClick={() => setTab("arcade")}
                  >
                    ARCADE
                  </TabBtn>
                  <TabBtn
                    $active={tab === "demos"}
                    onClick={() => setTab("demos")}
                  >
                    DEMOS
                  </TabBtn>
                  <TabBtn
                    $active={tab === "wallet"}
                    onClick={() => setTab("wallet")}
                  >
                    MY GAMES
                  </TabBtn>
                </LibHeader>

                {champions.length > 0 && (
                  <ChampionsStrip>
                    <ChampionsLabel>CHAMPIONS</ChampionsLabel>
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
                        <span>
                          {champion.displayName || champion.username}
                        </span>
                      </ChampionChip>
                    ))}
                  </ChampionsStrip>
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
                          <span>console XP</span>
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
                              <span>
                                #{game.rank} / {game.bestScore.toLocaleString()}
                              </span>
                            </PlayerGameChip>
                          );
                        })}
                      </PlayerGames>
                    </>
                  )}
                </PlayerPanel>

                {allCarts.length === 0 ? (
                  <EmptyMsg>
                    {tab === "wallet"
                      ? user
                        ? "No game cartridges found yet.\nAdd a game token from My Gallery or look for tokens with .zip artifacts."
                        : "Log in to scan your wallet for game cartridges."
                      : "No cartridges available."}
                  </EmptyMsg>
                ) : (
                  <CartGrid>
                    {allCarts.map((cart) => {
                      const provenance = readEmbeddedProvenance(cart);
                      const supportLink = provenanceSupportLinks(provenance)[0] || null;
                      return (
                        <CartCard
                          key={cart.id}
                          onClick={() => launchGame(cart)}
                        >
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
                              <CartArtFallback>
                                {cart.isDemo ? "🕹️" : "🎮"}
                              </CartArtFallback>
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
                                {provenanceXLabel(provenance)
                                  ? ` / ${provenanceXLabel(provenance)}`
                                  : ""}
                              </span>
                              {supportLink && (
                                <a
                                  href={supportLink.url}
                                  target="_blank"
                                  rel="noreferrer"
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
                              rel={cart.sourceUrl ? "noreferrer" : undefined}
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
                    })}
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

            {view === "playing" && (
              <>
                {loading && (
                  <LoadingScreen>
                    <LoadDot>&#9632;</LoadDot>
                    <div
                      style={{
                        marginTop: 12,
                        fontSize: 12,
                        letterSpacing: 2,
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
                        fontSize: 11,
                        color: "#aa4444",
                        maxWidth: 300,
                        textAlign: "center",
                      }}
                    >
                      {error}
                    </div>
                    <CtrlBtn
                      $color="#444"
                      style={{ marginTop: 16, width: "auto", borderRadius: 4, padding: "6px 16px", fontSize: 11 }}
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
                  fontFamily: '"Courier New", monospace',
                  fontSize: 10,
                  color: "#555580",
                  letterSpacing: 1,
                }}
              >
                SELECT A CARTRIDGE
              </div>
            )}

            <CtrlBtn
              $color="#44aa44"
              style={{ width: 24, height: 24, fontSize: 7 }}
            >
              A
            </CtrlBtn>
            <CtrlBtn
              $color="#cc8800"
              style={{ width: 24, height: 24, fontSize: 7 }}
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
            <a href={provenance.xUrl} target="_blank" rel="noreferrer">
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
              rel="noreferrer"
            >
              {price ? `${link.label} · ${price}` : link.label}
            </ProvenanceLinkButton>
          );
        })}
        {provenance?.explorerUrl && (
          <ProvenanceLinkButton
            href={provenance.explorerUrl}
            target="_blank"
            rel="noreferrer"
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

async function handleRuntimeBridgeRequest(event: MessageEvent, msg: any) {
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
    if (path !== "/api/console/session" && path !== "/api/console/scores") {
      throw new Error("Console bridge path denied");
    }
    const data = await api.post(path, msg.payload?.body || {});
    respond({ ok: true, data });
  } catch (err: any) {
    respond({ ok: false, error: err?.message || "Console bridge failed" });
  }
}
