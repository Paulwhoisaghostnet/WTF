import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Panel } from "react95";
import styled, { css, keyframes } from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { presentationRouteHref, usePresentationShell } from "../lib/presentation-shell";
import { useWindowManager } from "../lib/window-context";

type ButtonId = "red" | "green" | "blue";
type PriceProtectionMode = "strict" | "flexible";

type AmountView = {
  mutez: string;
  xtz: string;
};

type QuoteView = {
  id: string;
  buttonId: ButtonId;
  roundId: string;
  quotedCost: AmountView;
  actualCost: AmountView;
  maxAcceptedCost: AmountView;
  priceProtectionMode: PriceProtectionMode;
  tolerance: AmountView;
  quoteTimestampMs: number;
  houseCut: AmountView;
  potAdd: AmountView;
  timeAddedSeconds: number;
  canPress: boolean;
  reason: string | null;
};

type ParticipantView = {
  walletId: string;
  displayName: string;
  presses: number;
  totalPaid: AmountView;
  totalPotAdded: AmountView;
  totalWtfPaid: AmountView;
  lastPressAtMs: number | null;
  lastStatus: "leader" | "challenger" | "clash_entrant" | "cooled_down";
};

type TableView = {
  buttonId: ButtonId;
  color: string;
  name: string;
  tableName: string;
  roundId: string;
  currentPot: AmountView;
  currentLeader: {
    walletId: string | null;
    displayName: string | null;
    leaderSinceMs: number | null;
    leaderForSeconds: number;
    origin: string | null;
    paidIntoButton: AmountView;
    presses: number;
    estimatedPayoutIfExpiresNow: AmountView;
  };
  countdownEndMs: number;
  roundStartMs: number;
  timeRemainingSeconds: number;
  roundAgeSeconds: number;
  startDurationSeconds: number;
  maxRoundAgeSeconds: number;
  totalPressCount: number;
  uniquePresserCount: number;
  wtfEarnings: AmountView;
  state: "idle" | "active" | "danger_zone" | "clash" | "cooling_down" | "settled";
  rottenness: "fresh" | "warm" | "stale" | "rotten";
  dangerZone: boolean;
  rugClash: {
    active: boolean;
    countdownSeconds: number;
    entrants: Array<{
      walletId: string;
      displayName: string;
      paid: AmountView;
      potAdd: AmountView;
      wtfPaid: AmountView;
    }>;
    potAdded: AmountView;
    wtfEarned: AmountView;
    selectedWalletId: string | null;
    seedProof: string | null;
  };
  userQuote: QuoteView;
  userStats: {
    presses: number;
    totalPaid: AmountView;
    totalPotAdded: AmountView;
    totalWtfPaid: AmountView;
    canPress: boolean;
    cannotPressReason: string | null;
  };
  participants: ParticipantView[];
  timeline: Array<{
    id: string;
    atMs: number;
    event: string;
    displayName: string;
    amount: AmountView;
    wtfCut: AmountView;
    potAdd: AmountView;
    timeAddedSeconds: number;
    origin: string;
  }>;
  cooldownUntilMs: number | null;
  lastWinner: {
    walletId: string | null;
    displayName: string | null;
    payout: AmountView;
  };
};

type Snapshot = {
  title: string;
  shortName: string;
  route: string;
  paymentMode: "mocked_xtz_balances";
  nowMs: number;
  user: {
    walletId: string;
    displayName: string;
    balance: AmountView;
    leaderButtonId: ButtonId | null;
    winnerCooldownUntilMs: number | null;
  };
  tables: TableView[];
  wtfTreasury: AmountView;
  message?: string | null;
};

const flash = keyframes`
  0% { background: #ffff99; color: #101010; }
  100% { background: transparent; color: inherit; }
`;

const pulse = keyframes`
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.025); filter: brightness(1.18); }
`;

const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-2px); }
  40% { transform: translateX(2px); }
  60% { transform: translateX(-1px); }
  80% { transform: translateX(1px); }
`;

const Shell = styled.div`
  min-height: 100%;
  padding: 10px;
  color: #f8f0d8;
  background:
    linear-gradient(90deg, rgba(218, 36, 52, 0.18), transparent 24%),
    linear-gradient(270deg, rgba(41, 121, 255, 0.18), transparent 28%),
    linear-gradient(180deg, #191311 0%, #101010 100%);

  &[data-casino-table-presentation-host="gamma"] {
    color: #f2ead9;
    background: #08090a;
    border: 1px solid rgba(40, 215, 255, 0.18);
    font-family: Inter, "Helvetica Neue", Arial, sans-serif;
  }

  &[data-casino-table-presentation-host="gamma"],
  &[data-casino-table-presentation-host="gamma"] * {
    letter-spacing: 0;
    text-shadow: none;
  }

  &[data-casino-table-presentation-host="gamma"] [data-casino-table-region] {
    background-image: none;
    box-shadow: none;
    text-shadow: none;
    border-radius: 6px;
  }

  &[data-casino-table-presentation-host="gamma"]
    :where(
      [data-casino-table-region="title-panel"],
      [data-casino-table-region="wallet"],
      [data-casino-table-region="card"],
      [data-casino-table-region="stage"],
      [data-casino-table-region="panel"],
      [data-casino-table-region="stat"],
      [data-casino-table-region="timeline-item"],
      [data-casino-table-region="loading"]
    ) {
    background: rgba(242, 234, 217, 0.045);
    color: #f2ead9;
    border: 1px solid rgba(242, 234, 217, 0.14);
  }

  &[data-casino-table-presentation-host="gamma"] fieldset {
    background: rgba(242, 234, 217, 0.035);
    color: #f2ead9;
    border: 1px solid rgba(40, 215, 255, 0.2);
    border-radius: 6px;
  }

  &[data-casino-table-presentation-host="gamma"] legend {
    color: #28d7ff;
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
  }

  &[data-casino-table-presentation-host="gamma"] :where(button, select, input) {
    background: #0b0d0e;
    color: #f2ead9;
    border: 1px solid rgba(40, 215, 255, 0.55);
    border-radius: 4px;
    box-shadow: none;
  }

  &[data-casino-table-presentation-host="gamma"] button {
    color: #28d7ff;
  }

  &[data-casino-table-presentation-host="gamma"] [data-casino-table-region="giant-button"] {
    background: #0b0d0e;
    color: #f2ead9;
    border: 1px solid rgba(40, 215, 255, 0.85);
    box-shadow: none;
    text-shadow: none;
  }

  &[data-casino-table-presentation-host="gamma"] :where(th, td) {
    border-color: rgba(242, 234, 217, 0.14);
  }

  &[data-casino-table-presentation-host="gamma"] th {
    background: rgba(40, 215, 255, 0.1);
    color: #f2ead9;
  }
`;

const Header = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-bottom: 10px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const TitlePanel = styled(Panel).attrs({ variant: "well" })`
  padding: 12px;
  background: #f5d16b;
  color: #12100b;
  border-color: #ffffff #4e3214 #4e3214 #ffffff;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 22px;
  letter-spacing: 0;
`;

const Subline = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
  font-size: 11px;
`;

const StatusBadge = styled.span<{ $tone?: "red" | "green" | "blue" | "warn" }>`
  border: 1px solid #101010;
  background: ${(props) =>
    props.$tone === "red"
      ? "#ff6f7b"
      : props.$tone === "green"
        ? "#7dff94"
        : props.$tone === "blue"
          ? "#9dc7ff"
          : "#ffe36d"};
  color: #101010;
  padding: 2px 6px;
  font-weight: 700;
`;

const WalletPanel = styled(Panel).attrs({ variant: "well" })`
  min-width: 300px;
  padding: 10px;
  background: #e8dfbf;
  color: #111;
  font-size: 12px;
  line-height: 1.45;
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(250px, 330px) minmax(0, 1fr);
  gap: 10px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const Box = styled(GroupBox)`
  min-width: 0;
  color: #101010;
  background: #d7cfb4;
`;

const TableCards = styled.div`
  display: grid;
  gap: 8px;
`;

const TableCard = styled(Panel).attrs({ variant: "well" })<{
  $selected?: boolean;
  $button: ButtonId;
}>`
  padding: 10px;
  cursor: pointer;
  color: #101010;
  background: ${(props) => (props.$selected ? "#fff1a8" : "#f1e9c9")};
  border-color: ${(props) =>
    props.$button === "red"
      ? "#ffb6bd #5b0f18 #5b0f18 #ffffff"
      : props.$button === "green"
        ? "#b9ffc4 #125a1d #125a1d #ffffff"
        : "#bdd8ff #133b78 #133b78 #ffffff"};
`;

const CardTitle = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-weight: 700;
  margin-bottom: 6px;
`;

const MiniGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 8px;
  font-size: 11px;
`;

const MainGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(300px, 0.95fr) minmax(320px, 1.05fr);
  gap: 10px;

  @media (max-width: 1120px) {
    grid-template-columns: 1fr;
  }
`;

const StagePanel = styled(Panel).attrs({ variant: "well" })`
  padding: 12px;
  background: #171717;
  color: #f8f0d8;
  min-height: 440px;
  display: grid;
  gap: 12px;
  align-content: start;
`;

const GiantButtonWrap = styled.div`
  display: grid;
  place-items: center;
  min-height: 260px;
`;

const GiantButton = styled.button<{ $button: ButtonId; $state: TableView["state"] }>`
  width: min(72vw, 310px);
  aspect-ratio: 1;
  border-radius: 50%;
  border: 14px solid #2a211f;
  box-shadow:
    inset 0 18px 30px rgba(255, 255, 255, 0.28),
    inset 0 -22px 24px rgba(0, 0, 0, 0.35),
    0 0 0 8px #c7b36d,
    0 0 38px rgba(255, 230, 100, 0.45);
  color: #ffffff;
  font-size: 28px;
  font-weight: 900;
  letter-spacing: 0;
  text-shadow: 0 2px 2px rgba(0, 0, 0, 0.7);
  background: ${(props) =>
    props.$button === "red"
      ? "radial-gradient(circle at 35% 25%, #ffb1b9, #d9122c 58%, #6b0d18 100%)"
      : props.$button === "green"
        ? "radial-gradient(circle at 35% 25%, #c0ffc8, #1d9d35 58%, #0c4c17 100%)"
        : "radial-gradient(circle at 35% 25%, #c8ddff, #2166d8 58%, #102d74 100%)"};
  animation: ${pulse} 1.9s ease-in-out infinite;

  ${(props) =>
    props.$state === "danger_zone" &&
    css`
      animation:
        ${pulse} 0.75s ease-in-out infinite,
        ${shake} 0.32s linear infinite;
      box-shadow:
        inset 0 18px 30px rgba(255, 255, 255, 0.3),
        inset 0 -22px 24px rgba(0, 0, 0, 0.35),
        0 0 0 8px #ffef78,
        0 0 44px rgba(255, 72, 72, 0.9);
    `}

  ${(props) =>
    props.$state === "clash" &&
    css`
      animation:
        ${shake} 0.16s linear infinite,
        ${pulse} 0.45s ease-in-out infinite;
      filter: saturate(1.4);
      box-shadow:
        inset 0 18px 30px rgba(255, 255, 255, 0.3),
        inset 0 -22px 24px rgba(0, 0, 0, 0.35),
        0 0 0 8px #ffffff,
        0 0 52px rgba(255, 255, 255, 0.85);
    `}

  ${(props) =>
    (props.$state === "idle" || props.$state === "cooling_down" || props.$state === "settled") &&
    css`
      animation: none;
      filter: grayscale(0.8) brightness(0.65);
    `}
`;

const StageStats = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const StatTile = styled.div`
  border: 2px inset #808080;
  background: #0a0a0a;
  color: #f6f0c8;
  padding: 8px;
  min-height: 56px;
`;

const Label = styled.div`
  font-size: 10px;
  color: #c8bd89;
`;

const Value = styled.div<{ $flash?: boolean }>`
  font-size: 18px;
  font-weight: 800;
  overflow-wrap: anywhere;
  ${(props) =>
    props.$flash &&
    css`
      animation: ${flash} 900ms ease-out;
    `}
`;

const SideStack = styled.div`
  display: grid;
  gap: 10px;
`;

const InfoPanel = styled(Panel).attrs({ variant: "well" })`
  padding: 10px;
  background: #f1e9c9;
  color: #101010;
  min-width: 0;
`;

const PanelTitle = styled.h3`
  margin: 0 0 8px;
  font-size: 15px;
  letter-spacing: 0;
`;

const DataRows = styled.div`
  display: grid;
  gap: 4px;
  font-size: 12px;
`;

const DataRow = styled.div`
  display: grid;
  grid-template-columns: minmax(110px, 0.8fr) minmax(0, 1.2fr);
  gap: 8px;
  align-items: start;
`;

const ControlGrid = styled.div`
  display: grid;
  gap: 8px;
`;

const Select = styled.select`
  width: 100%;
  min-height: 27px;
  background: #fffde8;
  color: #101010;
`;

const Input = styled.input`
  width: 100%;
  min-height: 24px;
  background: #fffde8;
  color: #101010;
  border: 2px inset #808080;
`;

const StatusLine = styled.div<{ $error?: boolean }>`
  min-height: 18px;
  font-size: 11px;
  color: ${(props) => (props.$error ? "#b00020" : "#17652a")};
`;

const TableScroll = styled.div`
  overflow-x: auto;
`;

const ScoreTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;

  th,
  td {
    border: 1px solid #8a8067;
    padding: 4px;
    text-align: left;
    white-space: nowrap;
  }

  th {
    background: #d2bd76;
  }
`;

const Timeline = styled.div`
  display: grid;
  gap: 6px;
  max-height: 260px;
  overflow: auto;
`;

const TimelineItem = styled.div`
  border: 1px solid #827650;
  background: #fff5c9;
  padding: 6px;
  font-size: 11px;
`;

const Loading = styled.div`
  min-height: 280px;
  display: grid;
  place-items: center;
`;

function mutez(value: string | number | bigint): bigint {
  return BigInt(String(value));
}

function addMutez(a: string, b: bigint) {
  return (mutez(a) + b).toString();
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function formatTime(ms: number | null) {
  if (!ms) return "never";
  return new Date(ms).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function displayWallet(value: string | null) {
  if (!value) return "None";
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function xtzFromMutezString(mutezString: string) {
  const value = mutez(mutezString);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${fraction}`.replace(/0+$/, "").replace(/\.$/, "");
}

function toleranceToMutez(value: string, table: TableView) {
  const clean = value.trim();
  if (!/^\d+(\.\d{0,6})?$/.test(clean)) return 0n;
  const [whole, fraction = ""] = clean.split(".");
  const parsed = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  const maxCost = mutez(table.userQuote.maxAcceptedCost.mutez);
  return parsed > maxCost ? maxCost : parsed;
}

function buildLocalQuote(table: TableView, mode: PriceProtectionMode, toleranceMutez: bigint) {
  const quoted = mutez(table.userQuote.quotedCost.mutez);
  const maxTableCost = table.buttonId === "red" ? 2_500_000n : table.buttonId === "green" ? 3_000_000n : 4_000_000n;
  const maxAccepted = mode === "flexible" ? (quoted + toleranceMutez > maxTableCost ? maxTableCost : quoted + toleranceMutez) : quoted;
  return {
    maxAcceptedMutez: maxAccepted,
    maxAcceptedXtz: xtzFromMutezString(maxAccepted.toString()),
    actionLabel:
      mode === "flexible"
        ? `${table.state === "danger_zone" || table.state === "clash" ? "Enter Rug Clash" : `Press ${table.color}`} for ${table.userQuote.quotedCost.xtz} XTZ, allow up to ${xtzFromMutezString(maxAccepted.toString())} XTZ`
        : `${table.state === "danger_zone" || table.state === "clash" ? "Enter Rug Clash" : `Press ${table.color}`} for ${table.userQuote.quotedCost.xtz} XTZ`,
  };
}

function WtfButtonSurface() {
  const wm = useWindowManager();
  const presentation = usePresentationShell();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<ButtonId>("red");
  const [priceMode, setPriceMode] = useState<PriceProtectionMode>("strict");
  const [tolerance, setTolerance] = useState("0.10");
  const previousCostRef = useRef<string | null>(null);
  const [priceFlashed, setPriceFlashed] = useState(false);

  const snapshotQuery = useQuery({
    queryKey: ["casino", "wtf-button", "state"],
    queryFn: () => api.get<Snapshot>("/api/casino/wtf-button/state"),
    refetchInterval: 2_000,
  });

  const pressMutation = useMutation({
    mutationFn: async () => {
      const table = selectedTable;
      if (!table) throw new Error("No WTF Button table selected.");
      const toleranceMutez = priceMode === "flexible" ? toleranceToMutez(tolerance, table) : 0n;
      const quoteResponse = await api.post<{ ok: true; quote: QuoteView }>(
        "/api/casino/wtf-button/quote",
        {
          buttonId: table.buttonId,
          priceProtectionMode: priceMode,
          toleranceMutez: toleranceMutez.toString(),
        }
      );
      const quote = quoteResponse.quote;
      return api.post<{
        ok: boolean;
        message?: string;
        error?: string;
        snapshot: Snapshot;
      }>("/api/casino/wtf-button/press", {
        quote: {
          id: quote.id,
          buttonId: quote.buttonId,
          roundId: quote.roundId,
          sender: snapshotQuery.data?.user.walletId,
          quotedCostMutez: quote.quotedCost.mutez,
          maxAcceptedCostMutez: quote.maxAcceptedCost.mutez,
          priceProtectionMode: quote.priceProtectionMode,
          toleranceMutez: quote.tolerance.mutez,
          quoteTimestampMs: quote.quoteTimestampMs,
        },
      });
    },
    onSuccess: (result) => {
      qc.setQueryData(["casino", "wtf-button", "state"], result.snapshot);
    },
  });

  const snapshot = snapshotQuery.data;
  const stateError =
    snapshotQuery.error instanceof Error ? snapshotQuery.error.message : "";
  const selectedTable = useMemo(
    () => snapshot?.tables.find((table) => table.buttonId === selectedId) ?? snapshot?.tables[0],
    [selectedId, snapshot]
  );

  const localQuote = selectedTable
    ? buildLocalQuote(
        selectedTable,
        priceMode,
        priceMode === "flexible" ? toleranceToMutez(tolerance, selectedTable) : 0n
      )
    : null;

  useEffect(() => {
    const cost = selectedTable?.userQuote.quotedCost.mutez ?? null;
    if (cost && previousCostRef.current && previousCostRef.current !== cost) {
      setPriceFlashed(true);
      const timer = window.setTimeout(() => setPriceFlashed(false), 950);
      previousCostRef.current = cost;
      return () => window.clearTimeout(timer);
    }
    previousCostRef.current = cost;
  }, [selectedTable?.userQuote.quotedCost.mutez]);

  const mutationError =
    pressMutation.error instanceof Error ? pressMutation.error.message : "";
  const visibleMessage =
    mutationError || stateError || snapshot?.message || (selectedTable?.userStats.cannotPressReason ?? "");
  const openCasinoLobby = () => {
    if (presentation.host === "gamma") {
      setLocation(presentationRouteHref("/casino", presentation.host));
      return;
    }
    wm.openPage("/casino");
  };

  return (
    <Shell
      data-casino-table-presentation-host={presentation.host}
      data-casino-table="wtf-button"
      data-casino-table-region="surface"
    >
      <Header data-casino-table-region="header">
        <TitlePanel data-casino-table-region="title-panel">
          <Title>{snapshot?.title ?? "WTF Does This Button Do?!!?"}</Title>
          <Subline>
            <StatusBadge $tone="warn">MOCK XTZ</StatusBadge>
            <StatusBadge $tone="red">RED 6H</StatusBadge>
            <StatusBadge $tone="green">GREEN 12H</StatusBadge>
            <StatusBadge $tone="blue">BLUE 24H</StatusBadge>
            <span>Real escrow disabled until contract wiring is ready.</span>
          </Subline>
        </TitlePanel>
        <WalletPanel data-casino-table-region="wallet">
          <div>Player: {snapshot?.user.displayName ?? "Loading"}</div>
          <div>Mock balance: {snapshot?.user.balance.xtz ?? "0"} XTZ</div>
          <div>Leader on: {snapshot?.user.leaderButtonId ?? "none"}</div>
          <div>WTF treasury mock: {snapshot?.wtfTreasury.xtz ?? "0"} XTZ</div>
          <Button size="sm" onClick={openCasinoLobby}>
            Casino Lobby
          </Button>
        </WalletPanel>
      </Header>

      {stateError && !snapshot ? (
        <Box label="Entry Required">
          <InfoPanel data-casino-table-region="panel">
            <PanelTitle>Casino Gate</PanelTitle>
            <p>
              WTF Casino app pass and active membership card are required before the
              mocked WTF Button tables open.
            </p>
            <Button onClick={openCasinoLobby}>Back to Casino</Button>
          </InfoPanel>
        </Box>
      ) : !snapshot || !selectedTable || !localQuote ? (
        <Loading data-casino-table-region="loading">
          <Hourglass size={32} />
        </Loading>
      ) : (
        <Layout data-casino-table-region="layout">
          <Box label="Three-Button Lobby">
            <TableCards data-casino-table-region="table-list">
              {snapshot.tables.map((table) => (
                <TableCard
                  key={table.buttonId}
                  $selected={table.buttonId === selectedTable.buttonId}
                  $button={table.buttonId}
                  onClick={() => setSelectedId(table.buttonId)}
                  data-casino-table-region="card"
                >
                  <CardTitle>
                    <span>
                      {table.name} - {table.tableName}
                    </span>
                    <StatusBadge $tone={table.buttonId}>
                      {table.state === "danger_zone" ? "DANGER" : table.state.toUpperCase()}
                    </StatusBadge>
                  </CardTitle>
                  <MiniGrid>
                    <span>Pot</span>
                    <strong>{table.currentPot.xtz} XTZ</strong>
                    <span>Time</span>
                    <strong>{formatDuration(table.timeRemainingSeconds)}</strong>
                    <span>Leader</span>
                    <strong>{table.currentLeader.displayName ?? displayWallet(table.currentLeader.walletId)}</strong>
                    <span>Pressers</span>
                    <strong>{table.uniquePresserCount}</strong>
                    <span>Total presses</span>
                    <strong>{table.totalPressCount}</strong>
                    <span>Your cost</span>
                    <strong>{table.userQuote.quotedCost.xtz} XTZ</strong>
                  </MiniGrid>
                  <StatusLine $error={!table.userQuote.canPress}>
                    {table.userQuote.canPress
                      ? table.state === "danger_zone" || table.state === "clash"
                        ? "Action: Enter Rug Clash"
                        : `Action: Press ${table.color}`
                      : table.userQuote.reason}
                  </StatusLine>
                </TableCard>
              ))}
            </TableCards>
          </Box>

          <MainGrid data-casino-table-region="main-grid">
            <StagePanel data-casino-table-region="stage">
              <GiantButtonWrap>
                <GiantButton
                  $button={selectedTable.buttonId}
                  $state={selectedTable.state}
                  disabled={!selectedTable.userQuote.canPress || pressMutation.isPending}
                  onClick={() => pressMutation.mutate()}
                  data-casino-table-region="giant-button"
                >
                  {selectedTable.state === "clash"
                    ? "RUG CLASH"
                    : selectedTable.state === "cooling_down"
                      ? "BURNOUT"
                      : selectedTable.state === "idle"
                        ? "WAITING"
                        : "PRESS"}
                </GiantButton>
              </GiantButtonWrap>
              <StageStats>
                <StatTile data-casino-table-region="stat">
                  <Label>Current Pot</Label>
                  <Value>{selectedTable.currentPot.xtz} XTZ</Value>
                </StatTile>
                <StatTile data-casino-table-region="stat">
                  <Label>Countdown</Label>
                  <Value>{formatDuration(selectedTable.timeRemainingSeconds)}</Value>
                </StatTile>
                <StatTile data-casino-table-region="stat">
                  <Label>Your Cost</Label>
                  <Value $flash={priceFlashed}>{selectedTable.userQuote.quotedCost.xtz} XTZ</Value>
                </StatTile>
              </StageStats>
              <StatusBadge $tone={selectedTable.buttonId}>
                {selectedTable.dangerZone ? "RUG CLASH POSSIBLE" : `${selectedTable.rottenness.toUpperCase()} ROUND`}
              </StatusBadge>
              <Button
                disabled={!selectedTable.userQuote.canPress || pressMutation.isPending}
                onClick={() => pressMutation.mutate()}
              >
                {pressMutation.isPending ? "Pressing" : localQuote.actionLabel}
              </Button>
              <StatusLine $error={Boolean(mutationError || selectedTable.userStats.cannotPressReason)}>
                {visibleMessage || "If the timer hits zero right now, the current leader wins the pot."}
              </StatusLine>
            </StagePanel>

            <SideStack>
              <InfoPanel data-casino-table-region="panel">
                <PanelTitle>Price Protection</PanelTitle>
                <ControlGrid>
                  <Select
                    value={priceMode}
                    onChange={(event) => setPriceMode(event.target.value as PriceProtectionMode)}
                  >
                    <option value="strict">Strict Mode / Fail If Price Changes</option>
                    <option value="flexible">Flexible Mode / Allow Small Increase</option>
                  </Select>
                  <Select
                    value={tolerance}
                    onChange={(event) => setTolerance(event.target.value)}
                    disabled={priceMode !== "flexible"}
                  >
                    <option value="0.05">+0.05 XTZ</option>
                    <option value="0.10">+0.10 XTZ</option>
                    <option value="0.25">+0.25 XTZ</option>
                    <option value="0.50">+0.50 XTZ</option>
                  </Select>
                  <Input
                    value={tolerance}
                    onChange={(event) => setTolerance(event.target.value)}
                    disabled={priceMode !== "flexible"}
                    aria-label="Custom price tolerance in XTZ"
                  />
                  <DataRows>
                    <DataRow>
                      <span>Shown cost</span>
                      <strong>{selectedTable.userQuote.quotedCost.xtz} XTZ</strong>
                    </DataRow>
                    <DataRow>
                      <span>WTF cut</span>
                      <strong>{selectedTable.userQuote.houseCut.xtz} XTZ</strong>
                    </DataRow>
                    <DataRow>
                      <span>Pot add</span>
                      <strong>{selectedTable.userQuote.potAdd.xtz} XTZ</strong>
                    </DataRow>
                    <DataRow>
                      <span>Time add</span>
                      <strong>{formatDuration(selectedTable.userQuote.timeAddedSeconds)}</strong>
                    </DataRow>
                    <DataRow>
                      <span>Max accepted</span>
                      <strong>{localQuote.maxAcceptedXtz} XTZ</strong>
                    </DataRow>
                  </DataRows>
                </ControlGrid>
              </InfoPanel>

              <InfoPanel data-casino-table-region="panel">
                <PanelTitle>Current Leader</PanelTitle>
                <DataRows>
                  <DataRow>
                    <span>Leader</span>
                    <strong>
                      {selectedTable.currentLeader.displayName ??
                        displayWallet(selectedTable.currentLeader.walletId)}
                    </strong>
                  </DataRow>
                  <DataRow>
                    <span>Leader for</span>
                    <strong>{formatDuration(selectedTable.currentLeader.leaderForSeconds)}</strong>
                  </DataRow>
                  <DataRow>
                    <span>Pressed</span>
                    <strong>{selectedTable.currentLeader.presses} times</strong>
                  </DataRow>
                  <DataRow>
                    <span>Paid</span>
                    <strong>{selectedTable.currentLeader.paidIntoButton.xtz} XTZ</strong>
                  </DataRow>
                  <DataRow>
                    <span>Wins now</span>
                    <strong>{selectedTable.currentLeader.estimatedPayoutIfExpiresNow.xtz} XTZ</strong>
                  </DataRow>
                  <DataRow>
                    <span>Origin</span>
                    <strong>{selectedTable.currentLeader.origin ?? "none"}</strong>
                  </DataRow>
                </DataRows>
              </InfoPanel>

              {selectedTable.rugClash.active && (
                <InfoPanel data-casino-table-region="panel">
                  <PanelTitle>Rug Clash</PanelTitle>
                  <DataRows>
                    <DataRow>
                      <span>Clash timer</span>
                      <strong>{selectedTable.rugClash.countdownSeconds}s</strong>
                    </DataRow>
                    <DataRow>
                      <span>Pot added</span>
                      <strong>{selectedTable.rugClash.potAdded.xtz} XTZ</strong>
                    </DataRow>
                    <DataRow>
                      <span>WTF earned</span>
                      <strong>{selectedTable.rugClash.wtfEarned.xtz} XTZ</strong>
                    </DataRow>
                    <DataRow>
                      <span>Entrants</span>
                      <strong>
                        {selectedTable.rugClash.entrants
                          .map((entrant) => entrant.displayName)
                          .join(", ") || "None yet"}
                      </strong>
                    </DataRow>
                  </DataRows>
                </InfoPanel>
              )}
            </SideStack>
          </MainGrid>

          <Box label="Button Card Stats">
            <MainGrid data-casino-table-region="main-grid">
              <InfoPanel data-casino-table-region="panel">
                <PanelTitle>Your Position</PanelTitle>
                <DataRows>
                  <DataRow>
                    <span>Balance</span>
                    <strong>{snapshot.user.balance.xtz} XTZ</strong>
                  </DataRow>
                  <DataRow>
                    <span>Presses</span>
                    <strong>{selectedTable.userStats.presses}</strong>
                  </DataRow>
                  <DataRow>
                    <span>Total paid</span>
                    <strong>{selectedTable.userStats.totalPaid.xtz} XTZ</strong>
                  </DataRow>
                  <DataRow>
                    <span>To pot</span>
                    <strong>{selectedTable.userStats.totalPotAdded.xtz} XTZ</strong>
                  </DataRow>
                  <DataRow>
                    <span>To WTF</span>
                    <strong>{selectedTable.userStats.totalWtfPaid.xtz} XTZ</strong>
                  </DataRow>
                  <DataRow>
                    <span>Can press</span>
                    <strong>{selectedTable.userStats.canPress ? "yes" : "no"}</strong>
                  </DataRow>
                </DataRows>
              </InfoPanel>

              <InfoPanel data-casino-table-region="panel">
                <PanelTitle>Round Mechanics</PanelTitle>
                <DataRows>
                  <DataRow>
                    <span>Round age</span>
                    <strong>{formatDuration(selectedTable.roundAgeSeconds)}</strong>
                  </DataRow>
                  <DataRow>
                    <span>Rottenness</span>
                    <strong>{selectedTable.rottenness}</strong>
                  </DataRow>
                  <DataRow>
                    <span>Max age</span>
                    <strong>{formatDuration(selectedTable.maxRoundAgeSeconds)}</strong>
                  </DataRow>
                  <DataRow>
                    <span>WTF earned</span>
                    <strong>{selectedTable.wtfEarnings.xtz} XTZ</strong>
                  </DataRow>
                  <DataRow>
                    <span>Started</span>
                    <strong>{formatTime(selectedTable.roundStartMs)}</strong>
                  </DataRow>
                  <DataRow>
                    <span>Ends</span>
                    <strong>{formatTime(selectedTable.countdownEndMs)}</strong>
                  </DataRow>
                </DataRows>
              </InfoPanel>
            </MainGrid>
          </Box>

          <MainGrid data-casino-table-region="main-grid">
            <InfoPanel data-casino-table-region="panel">
              <PanelTitle>Presser Leaderboard</PanelTitle>
              <TableScroll>
                <ScoreTable data-casino-table-region="score-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Player</th>
                      <th>Presses</th>
                      <th>Paid</th>
                      <th>Pot</th>
                      <th>WTF</th>
                      <th>Last</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTable.participants.length === 0 ? (
                      <tr>
                        <td colSpan={8}>No pressers yet.</td>
                      </tr>
                    ) : (
                      selectedTable.participants.map((participant, index) => (
                        <tr key={participant.walletId}>
                          <td>{index + 1}</td>
                          <td>{participant.displayName}</td>
                          <td>{participant.presses}</td>
                          <td>{participant.totalPaid.xtz}</td>
                          <td>{participant.totalPotAdded.xtz}</td>
                          <td>{participant.totalWtfPaid.xtz}</td>
                          <td>{formatTime(participant.lastPressAtMs)}</td>
                          <td>{participant.lastStatus}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </ScoreTable>
              </TableScroll>
            </InfoPanel>

            <InfoPanel data-casino-table-region="panel">
              <PanelTitle>Pot Contribution Breakdown</PanelTitle>
              <DataRows>
                <DataRow>
                  <span>Current pot</span>
                  <strong>{selectedTable.currentPot.xtz} XTZ</strong>
                </DataRow>
                <DataRow>
                  <span>Total payments</span>
                  <strong>
                    {xtzFromMutezString(
                      selectedTable.participants
                        .reduce((sum, participant) => sum + mutez(participant.totalPaid.mutez), 0n)
                        .toString()
                    )}{" "}
                    XTZ
                  </strong>
                </DataRow>
                <DataRow>
                  <span>Pot added</span>
                  <strong>
                    {xtzFromMutezString(
                      selectedTable.participants
                        .reduce((sum, participant) => sum + mutez(participant.totalPotAdded.mutez), 0n)
                        .toString()
                    )}{" "}
                    XTZ
                  </strong>
                </DataRow>
                <DataRow>
                  <span>WTF take</span>
                  <strong>{selectedTable.wtfEarnings.xtz} XTZ</strong>
                </DataRow>
              </DataRows>
            </InfoPanel>
          </MainGrid>

          <InfoPanel data-casino-table-region="panel">
            <PanelTitle>Round Timeline</PanelTitle>
            <Timeline>
              {selectedTable.timeline.length === 0 ? (
                <TimelineItem data-casino-table-region="timeline-item">Round started. The button is waiting for the first bad idea.</TimelineItem>
              ) : (
                selectedTable.timeline.map((event) => (
                  <TimelineItem key={event.id} data-casino-table-region="timeline-item">
                    <strong>{formatTime(event.atMs)}</strong> {event.displayName} paid{" "}
                    {event.amount.xtz} XTZ. {event.wtfCut.xtz} XTZ to WTF.{" "}
                    {event.potAdd.xtz} XTZ added to pot. Timer extended by{" "}
                    {formatDuration(event.timeAddedSeconds)}. {event.event}.
                  </TimelineItem>
                ))
              )}
            </Timeline>
          </InfoPanel>
        </Layout>
      )}
    </Shell>
  );
}

export function WtfButton() {
  return (
    <AppWindow title="WTF Button">
      <WtfButtonSurface />
    </AppWindow>
  );
}
