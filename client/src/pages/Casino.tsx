import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Panel } from "react95";
import styled from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
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

const Shell = styled.div`
  min-height: 100%;
  background:
    linear-gradient(90deg, rgba(255, 214, 107, 0.22), transparent 24%),
    linear-gradient(180deg, #14261f 0%, #0d1514 100%);
  color: #f7eed4;
  padding: 10px;
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
  margin-top: 4px;
  font-size: 11px;
`;

const Badge = styled.span<{ $ready?: boolean }>`
  border: 1px solid #101010;
  background: ${(p) => (p.$ready ? "#7dff94" : "#ffcf6b")};
  color: #101010;
  padding: 2px 6px;
  font-weight: 700;
`;

const Meter = styled(Panel).attrs({ variant: "well" })`
  min-width: 240px;
  padding: 8px;
  background: #e7dfc0;
  color: #101010;
  font-size: 12px;
  line-height: 1.45;
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
`;

const CardMeta = styled.div`
  margin-top: 6px;
  font-size: 11px;
  color: #3a321f;
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
  const qc = useQueryClient();
  const wallet = useWallet();
  const wm = useWindowManager();

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

  return (
    <Shell>
      <Header>
        <TitlePanel>
          <Title>WTF Casino</Title>
          <Subline>
            <Badge $ready={status?.appPass.owned}>APP</Badge>
            <Badge $ready={status?.membership.active}>CARD</Badge>
            <Badge $ready={status?.canEnter}>ENTRY</Badge>
            <span>{status?.config.network ?? "mainnet"}</span>
          </Subline>
        </TitlePanel>
        <Meter>
          <div>App pass: {status?.appPass.owned ? "owned" : "missing"}</div>
          <div>Membership: {formatExpiry(status?.membership.expiresAt ?? null)}</div>
          <div>Fee: {status?.config.feeTez ?? "1"} XTZ</div>
          <div>Contract: {status?.config.contractAddress ?? "pending"}</div>
        </Meter>
      </Header>

      <Layout>
        <Box label="Casino Floor">
          {busy ? (
            <Empty>
              <Hourglass size={28} />
            </Empty>
          ) : games.length === 0 ? (
            <Empty>No casino tables installed.</Empty>
          ) : (
            <GameGrid>
              {games.map((game) => (
                <GameCard key={game.key}>
                  <strong>{game.title}</strong>
                  {game.tagline && <CardMeta>{game.tagline}</CardMeta>}
                  {game.summary && <CardMeta>{game.summary}</CardMeta>}
                  <CardMeta>
                    {game.mode.replace("_", " ")} · {game.status}
                  </CardMeta>
                  <CardMeta>
                    {game.maxPlayers
                      ? `${game.minPlayers}-${game.maxPlayers} players`
                      : `${game.minPlayers}+ players`}
                  </CardMeta>
                  <CardMeta>
                    Wager: {game.wagerAsset ?? "XTZ"} · House:{" "}
                    {game.defaultHouseTakeBps / 100}%
                  </CardMeta>
                  <CardMeta>Live wagers: {game.wageringEnabled ? "enabled" : "disabled"}</CardMeta>
                  {game.highlights && game.highlights.length > 0 && (
                    <CardTagLine>
                      {game.highlights.slice(0, 4).map((highlight) => (
                        <CardTag key={highlight}>{highlight}</CardTag>
                      ))}
                    </CardTagLine>
                  )}
                  {game.key === "wtf-button" && (
                    <CardActions>
                      <Button
                        size="sm"
                        onClick={() => wm.openPage("/casino/wtf-button")}
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

        <Box label="Entry">
          <Controls>
            <Button onClick={() => wm.openPage("/wtfiam")} disabled={status?.appPass.owned}>
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
            <StatusLine $error={Boolean(membershipError || entryError)}>
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
