import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Panel } from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import {
  presentationRouteHref,
  usePresentationShell,
} from "../lib/presentation-shell";
import { purchaseCasinoMembership } from "../lib/tezos";
import { useWallet } from "../lib/wallet-context";
import { useWindowManager } from "../lib/window-context";

type CasinoStatus = {
  userId: number;
  appPass: {
    sku: string;
    owned: boolean;
    quantity: number;
    marketCategory: "casino";
  };
  membership: {
    active: boolean;
    expiresAt: string | null;
    walletAddress: string | null;
    purchaseRef: string | null;
  };
  canEnter: boolean;
  wageringEnabled: false;
  config: {
    network: string;
    contractAddress: string | null;
    treasuryAddress: string;
    feeMutez: number;
    feeTez: string;
    durationDays: number;
    configured: boolean;
  };
};

type CasinoGame = {
  key: string;
  title: string;
  tagline?: string;
  summary?: string;
  mode: string;
  status: string;
  tableKind?: string;
  wagerAsset?: string;
  wageringEnabled?: false;
  minPlayers: number;
  maxPlayers: number | null;
  defaultHouseTakeBps: number;
  requiredContracts?: string[];
  highlights?: string[];
  subdomains?: string[];
};

type CasinoIntentResponse = {
  ok: boolean;
  intent: {
    purchaseRef: string;
    contractAddress: string | null;
    feeMutez: number;
    feeTez: string;
    expiresAt: string;
  };
};

const gammaCasinoScope = `[data-casino-presentation-host="gamma"]`;

const Shell = styled.div`
  min-height: 100%;
  background:
    linear-gradient(90deg, rgba(255, 214, 107, 0.22), transparent 24%),
    linear-gradient(180deg, #14261f 0%, #0d1514 100%);
  color: #f7eed4;
  padding: 10px;

  &[data-casino-presentation-host="gamma"] {
    background: #080807;
    border: 1px solid rgba(242, 234, 217, 0.14);
    border-radius: 6px;
    color: #f2ead9;
    font-family:
      Inter, "IBM Plex Sans", "Neue Haas Grotesk Text", Arial, sans-serif;
    line-height: 1.45;
  }

  &[data-casino-presentation-host="gamma"],
  &[data-casino-presentation-host="gamma"] * {
    box-sizing: border-box;
    letter-spacing: 0;
    text-shadow: none;
  }

  &[data-casino-presentation-host="gamma"] [data-casino-region] {
    background-image: none;
    box-shadow: none;
  }

  &[data-casino-presentation-host="gamma"]
    :where(button, input, select, textarea, div, span, strong, p, label, legend, fieldset) {
    font-family:
      Inter, "IBM Plex Sans", "Neue Haas Grotesk Text", Arial, sans-serif;
  }

  &[data-casino-presentation-host="gamma"] :where([data-casino-region="meta"], [data-casino-region="subline"], [data-casino-region="status-line"]) {
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
  }

  &[data-casino-presentation-host="gamma"] fieldset {
    border-color: rgba(242, 234, 217, 0.18);
    border-radius: 6px;
    background: rgba(242, 234, 217, 0.035);
    color: #f2ead9;
  }

  &[data-casino-presentation-host="gamma"] legend {
    color: #28d7ff;
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }

  &[data-casino-presentation-host="gamma"] button {
    border-radius: 4px;
  }
`;

const Header = styled.div`
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px;
  align-items: stretch;
  margin-bottom: 10px;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const TitlePanel = styled(Panel).attrs({ variant: "well" })`
  padding: 12px;
  background: #f6e2a6;
  color: #101010;
  border-color: #ffffff #20170a #20170a #ffffff;

  ${gammaCasinoScope} & {
    background: rgba(242, 234, 217, 0.045);
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: #f2ead9;
  }
`;

const Title = styled.h2`
  margin: 0;
  font-size: 22px;
  letter-spacing: 0;

  ${gammaCasinoScope} & {
    color: #f2ead9;
    font-size: 22px;
    font-weight: 800;
  }
`;

const Subline = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  font-size: 11px;

  ${gammaCasinoScope} & {
    color: rgba(242, 234, 217, 0.68);
    align-items: center;
    text-transform: uppercase;
  }
`;

const Badge = styled.span<{ $ready?: boolean }>`
  border: 1px solid #101010;
  background: ${(p) => (p.$ready ? "#7dff94" : "#ffcf6b")};
  color: #101010;
  padding: 2px 6px;
  font-weight: 700;

  ${gammaCasinoScope} & {
    background: ${(p) =>
      p.$ready ? "rgba(40, 215, 255, 0.14)" : "rgba(242, 234, 217, 0.045)"};
    border: 1px solid
      ${(p) =>
        p.$ready ? "rgba(40, 215, 255, 0.58)" : "rgba(242, 234, 217, 0.18)"};
    border-radius: 4px;
    color: ${(p) => (p.$ready ? "#28d7ff" : "rgba(242, 234, 217, 0.72)")};
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 10px;
  }
`;

const Meter = styled(Panel).attrs({ variant: "well" })`
  min-width: 240px;
  padding: 8px;
  background: #e7dfc0;
  color: #101010;
  font-size: 12px;
  line-height: 1.45;

  ${gammaCasinoScope} & {
    background: rgba(242, 234, 217, 0.045);
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: rgba(242, 234, 217, 0.82);
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 10px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Box = styled(GroupBox)`
  min-width: 0;
  color: #101010;
  background: #d4ccb2;
`;

const Empty = styled.div`
  min-height: 210px;
  border: 2px inset #808080;
  background: #eee6c8;
  color: #4b3f2a;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 14px;

  ${gammaCasinoScope} & {
    background: rgba(242, 234, 217, 0.035);
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: rgba(242, 234, 217, 0.76);
  }
`;

const GameGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
`;

const GameCard = styled(Panel).attrs({ variant: "well" })`
  padding: 10px;
  min-height: 120px;
  background: #f1e9c9;
  color: #101010;
  line-height: 1.35;

  ${gammaCasinoScope} & {
    background: rgba(242, 234, 217, 0.045);
    border: 1px solid rgba(242, 234, 217, 0.16);
    border-radius: 6px;
    color: #f2ead9;
  }
`;

const CardMeta = styled.div`
  margin-top: 6px;
  font-size: 11px;
  color: #3a321f;

  ${gammaCasinoScope} & {
    color: rgba(242, 234, 217, 0.66);
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
    font-size: 11px;
  }
`;

const CardTagLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
`;

const CardTag = styled.span`
  border: 1px solid #6b5a2c;
  background: #fff4bc;
  color: #2f2818;
  padding: 1px 5px;
  font-size: 10px;

  ${gammaCasinoScope} & {
    background: rgba(40, 215, 255, 0.08);
    border: 1px solid rgba(40, 215, 255, 0.36);
    border-radius: 4px;
    color: #28d7ff;
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
  }
`;

const CardActions = styled.div`
  display: flex;
  gap: 6px;
  margin-top: 10px;
`;

const Controls = styled.div`
  display: grid;
  gap: 8px;
`;

const StatusLine = styled.div<{ $error?: boolean }>`
  min-height: 18px;
  color: ${(p) => (p.$error ? "#b00020" : "#173b18")};
  font-size: 11px;
  overflow-wrap: anywhere;

  ${gammaCasinoScope} & {
    color: ${(p) => (p.$error ? "#ff7a7a" : "rgba(242, 234, 217, 0.76)")};
    font-family:
      "IBM Plex Mono", "Roboto Mono", "SFMono-Regular", Consolas, monospace;
  }
`;

function formatExpiry(value: string | null): string {
  if (!value) return "No active card";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function CasinoSurface() {
  const presentation = usePresentationShell();
  const qc = useQueryClient();
  const wallet = useWallet();
  const wm = useWindowManager();
  const [, setLocation] = useLocation();

  const statusQuery = useQuery({
    queryKey: ["casino", "status"],
    queryFn: () => api.get<CasinoStatus>("/api/casino/status"),
    staleTime: 20_000,
  });

  const gamesQuery = useQuery({
    queryKey: ["casino", "games"],
    queryFn: () =>
      api.get<{ games: CasinoGame[]; canEnter: boolean; wageringEnabled: false }>(
        "/api/casino/games"
      ),
    staleTime: 20_000,
  });

  const membershipMutation = useMutation({
    mutationFn: async () => {
      const connected = await wallet.connect();
      const intentResponse = await api.post<CasinoIntentResponse>(
        "/api/casino/membership-intents",
        { walletAddress: connected.address }
      );
      const opHash = await purchaseCasinoMembership({
        walletAddress: connected.address,
        contractAddress: intentResponse.intent.contractAddress,
        membershipRef: intentResponse.intent.purchaseRef,
        feeMutez: intentResponse.intent.feeMutez,
      });
      await api.post("/api/casino/membership-verify", { opHash });
      return opHash;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["casino"] });
    },
  });

  const entryMutation = useMutation({
    mutationFn: () => api.post("/api/casino/entry", {}),
  });

  const status = statusQuery.data;
  const games = gamesQuery.data?.games ?? [];
  const busy = statusQuery.isLoading || gamesQuery.isLoading;
  const membershipError =
    membershipMutation.error instanceof Error ? membershipMutation.error.message : "";
  const entryError = entryMutation.error instanceof Error ? entryMutation.error.message : "";

  const openCasinoRoute = (route: string) => {
    if (presentation.host === "gamma") {
      setLocation(presentationRouteHref(route, presentation.host));
      return;
    }
    wm.openPage(route);
  };

  return (
    <Shell
      data-casino-presentation-host={presentation.host}
      data-casino-surface="lobby"
      data-casino-region="surface"
    >
      <Header data-casino-region="header">
        <TitlePanel data-casino-region="title-panel">
          <Title>WTF Casino</Title>
          <Subline data-casino-region="subline">
            <Badge $ready={status?.appPass.owned} data-casino-region="status-badge">APP</Badge>
            <Badge $ready={status?.membership.active} data-casino-region="status-badge">CARD</Badge>
            <Badge $ready={status?.canEnter} data-casino-region="status-badge">ENTRY</Badge>
            <span data-casino-region="meta">{status?.config.network ?? "mainnet"}</span>
          </Subline>
        </TitlePanel>
        <Meter data-casino-region="meter">
          <div data-casino-region="meta">App pass: {status?.appPass.owned ? "owned" : "missing"}</div>
          <div data-casino-region="meta">Membership: {formatExpiry(status?.membership.expiresAt ?? null)}</div>
          <div data-casino-region="meta">Fee: {status?.config.feeTez ?? "1"} XTZ</div>
          <div data-casino-region="meta">Contract: {status?.config.contractAddress ?? "pending"}</div>
        </Meter>
      </Header>

      <Layout data-casino-region="layout">
        <Box label="Casino Floor" data-casino-region="floor">
          {busy ? (
            <Empty data-casino-region="empty">
              <Hourglass size={28} />
            </Empty>
          ) : games.length === 0 ? (
            <Empty data-casino-region="empty">No casino tables installed.</Empty>
          ) : (
            <GameGrid data-casino-region="game-grid">
              {games.map((game) => (
                <GameCard key={game.key} data-casino-region="game-card">
                  <strong>{game.title}</strong>
                  {game.tagline && <CardMeta data-casino-region="meta">{game.tagline}</CardMeta>}
                  {game.summary && <CardMeta data-casino-region="meta">{game.summary}</CardMeta>}
                  <CardMeta data-casino-region="meta">
                    {game.mode.replace("_", " ")} · {game.status}
                  </CardMeta>
                  <CardMeta data-casino-region="meta">
                    {game.maxPlayers
                      ? `${game.minPlayers}-${game.maxPlayers} players`
                      : `${game.minPlayers}+ players`}
                  </CardMeta>
                  <CardMeta data-casino-region="meta">
                    Wager: {game.wagerAsset ?? "XTZ"} · House:{" "}
                    {game.defaultHouseTakeBps / 100}%
                  </CardMeta>
                  <CardMeta data-casino-region="meta">Live wagers: {game.wageringEnabled ? "enabled" : "disabled"}</CardMeta>
                  {game.highlights && game.highlights.length > 0 && (
                    <CardTagLine data-casino-region="card-tags">
                      {game.highlights.slice(0, 4).map((highlight) => (
                        <CardTag key={highlight}>{highlight}</CardTag>
                      ))}
                    </CardTagLine>
                  )}
                  {["wtf-button", "rug-pull", "guinea-pig-raceway"].includes(game.key) && (
                    <CardActions data-casino-region="card-actions">
                      <Button
                        size="sm"
                        onClick={() => openCasinoRoute(`/casino/${game.key}`)}
                        disabled={!status?.canEnter}
                      >
                        Open Table
                      </Button>
                    </CardActions>
                  )}
                </GameCard>
              ))}
            </GameGrid>
          )}
        </Box>

        <Box label="Entry" data-casino-region="entry">
          <Controls data-casino-region="entry-controls">
            <Button onClick={() => openCasinoRoute("/wtfiam")} disabled={status?.appPass.owned}>
              Buy App
            </Button>
            <Button
              onClick={() => membershipMutation.mutate()}
              disabled={
                membershipMutation.isPending ||
                !status?.appPass.owned ||
                status?.membership.active
              }
            >
              {membershipMutation.isPending ? "Working" : "Buy Card"}
            </Button>
            <Button
              onClick={() => entryMutation.mutate()}
              disabled={entryMutation.isPending || !status?.canEnter}
            >
              Enter
            </Button>
            <StatusLine
              $error={Boolean(membershipError || entryError)}
              data-casino-region="status-line"
            >
              {membershipError ||
                entryError ||
                (status?.canEnter
                  ? "Access verified."
                  : "App pass and active card required.")}
            </StatusLine>
          </Controls>
        </Box>
      </Layout>
    </Shell>
  );
}

export function Casino() {
  return (
    <AppWindow title="WTF Casino">
      <CasinoSurface />
    </AppWindow>
  );
}
