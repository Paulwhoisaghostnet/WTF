import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, GroupBox, Hourglass, Panel } from "react95";
import styled, { keyframes } from "styled-components";
import { AppWindow } from "../components/layout/AppWindow";
import { api } from "../lib/api";
import { useWindowManager } from "../lib/window-context";

type AmountView = { mutez: string; xtz: string };
type RugPullVote = "mercy" | "cruelty" | "silence";

type RugPullSnapshot = {
  title: string;
  route: string;
  paymentMode: "mocked_xtz_balances";
  wageringEnabled: false;
  nowMs: number;
  user: {
    walletId: string;
    displayName: string;
    balance: AmountView;
    activePlayer: boolean;
    activeWitness: boolean;
  };
  round: {
    roundId: string;
    phase: "active" | "panic" | "settled";
    pot: AmountView;
    nextSeedPot: AmountView;
    platformTake: AmountView;
    secondsUntilButtonUnlock: number;
    panicSecondsRemaining: number;
    panicModifier: "none" | RugPullVote;
    pressureMultiplierBps: number;
    totalPlayers: number;
    totalWitnesses: number;
    nextRoundPressOrder: string[];
  };
  userActions: {
    joinCost: AmountView;
    pressCost: AmountView;
    witnessCost: AmountView;
    nextDelayCost: AmountView | null;
    canJoin: boolean;
    canDelay: boolean;
    canPress: boolean;
    canJoinWitness: boolean;
    canVote: boolean;
    reason: string | null;
  };
  players: Array<{
    walletId: string;
    displayName: string;
    joinOrder: number;
    status: "active" | "pressed" | "auto_locked";
    pressedOrder: number | null;
    delayCount: number;
    currentMicroshares: string;
    shareRatePerSecond: string;
    totalPaid: AmountView;
    estimatedPayout: AmountView;
  }>;
  witnesses: Array<{ walletId: string; displayName: string; vote: RugPullVote | null }>;
  lastSettlement: null | {
    roundId: string;
    panicModifier: "none" | RugPullVote;
    pot: AmountView;
    nextSeedPot: AmountView;
    platformTake: AmountView;
    payouts: Array<{ walletId: string; displayName: string; finalShares: string; payout: AmountView }>;
  };
  timeline: Array<{ id: string; atMs: number; kind: string; message: string }>;
};

const pulse = keyframes`
  0%, 100% { transform: scale(1); filter: brightness(1); }
  50% { transform: scale(1.035); filter: brightness(1.18); }
`;

const shake = keyframes`
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-3px); }
  50% { transform: translateX(3px); }
  75% { transform: translateX(-1px); }
`;

const Shell = styled.div`
  min-height: 100%;
  padding: 10px;
  color: #f9f0d4;
  background:
    radial-gradient(circle at 50% 18%, rgba(255, 55, 78, 0.26), transparent 26%),
    linear-gradient(180deg, #211111 0%, #100d0d 100%);
`;

const Header = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  margin-bottom: 10px;

  @media (max-width: 840px) {
    grid-template-columns: 1fr;
  }
`;

const TitlePanel = styled(Panel).attrs({ variant: "well" })`
  padding: 12px;
  background: #f2d77b;
  color: #100b08;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 22px;
  letter-spacing: 0;
`;

const Badges = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
  font-size: 11px;
`;

const Badge = styled.span<{ $danger?: boolean }>`
  border: 1px solid #111;
  background: ${(p) => (p.$danger ? "#ff5f6f" : "#fff0a8")};
  color: #111;
  padding: 2px 6px;
  font-weight: 700;
`;

const Wallet = styled(Panel).attrs({ variant: "well" })`
  min-width: 260px;
  padding: 10px;
  background: #e7ddc0;
  color: #111;
  font-size: 12px;
  line-height: 1.45;
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(300px, 420px) minmax(0, 1fr);
  gap: 10px;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const Box = styled(GroupBox)`
  min-width: 0;
  color: #111;
  background: #d7cfb5;
`;

const BigButtonPanel = styled(Panel).attrs({ variant: "well" })`
  padding: 18px;
  min-height: 360px;
  background: #171010;
  color: #fff2d4;
  display: grid;
  place-items: center;
  text-align: center;
`;

const CursedButton = styled.button<{ $panic?: boolean; disabled?: boolean }>`
  width: min(86vw, 300px);
  aspect-ratio: 1;
  border-radius: 50%;
  border: 14px outset #aa1b2c;
  background:
    radial-gradient(circle at 35% 28%, #ffadb5, transparent 22%),
    radial-gradient(circle, #f23048 0%, #9a0f20 68%, #42060c 100%);
  box-shadow:
    0 0 34px rgba(255, 47, 72, 0.72),
    inset 0 -20px 42px rgba(0, 0, 0, 0.42);
  color: #fff8db;
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0;
  text-shadow: 2px 2px 0 #320006;
  cursor: ${(p) => (p.disabled ? "not-allowed" : "pointer")};
  animation: ${(p) => (p.$panic ? shake : pulse)} 0.8s infinite;
  opacity: ${(p) => (p.disabled ? 0.55 : 1)};
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
  margin-top: 10px;
`;

const Stat = styled(Panel).attrs({ variant: "well" })`
  padding: 8px;
  background: #f2e8c9;
  color: #111;
  font-size: 12px;
`;

const Table = styled.div`
  display: grid;
  gap: 6px;
`;

const Row = styled(Panel).attrs({ variant: "well" })`
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  padding: 7px;
  background: #efe5c5;
  color: #111;
  font-size: 12px;
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
`;

const EventFeed = styled.div`
  display: grid;
  gap: 6px;
  max-height: 260px;
  overflow: auto;
`;

function asShares(microshares: string) {
  const value = BigInt(microshares || "0");
  return (Number(value) / 1_000_000).toFixed(2);
}

function postAction(path: string, body?: unknown) {
  return api.post<{ ok: boolean; error?: string; snapshot: RugPullSnapshot }>(path, body ?? {});
}

function RugPullSurface() {
  const qc = useQueryClient();
  const wm = useWindowManager();
  const query = useQuery({
    queryKey: ["casino", "rug-pull", "state"],
    queryFn: () => api.get<RugPullSnapshot>("/api/casino/rug-pull/state"),
    refetchInterval: 2_500,
  });
  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => postAction(path, body),
    onSuccess: (result) => {
      qc.setQueryData(["casino", "rug-pull", "state"], result.snapshot);
    },
  });
  const data = query.data;
  const error =
    action.data?.ok === false
      ? action.data.error
      : action.error instanceof Error
        ? action.error.message
        : query.error instanceof Error
          ? query.error.message
          : "";

  const topPlayers = useMemo(
    () => [...(data?.players ?? [])].sort((a, b) => Number(BigInt(b.currentMicroshares) - BigInt(a.currentMicroshares))).slice(0, 6),
    [data?.players]
  );

  if (!data) {
    return (
      <Shell>
        <BigButtonPanel>
          {query.isLoading ? <Hourglass size={36} /> : <Button onClick={() => wm.openPage("/casino")}>Back to Casino</Button>}
          {error && <div>{error}</div>}
        </BigButtonPanel>
      </Shell>
    );
  }

  const panic = data.round.phase === "panic";
  const buttonLabel = panic
    ? `LOCK SHARES (${data.round.panicSecondsRemaining}s)`
    : data.round.secondsUntilButtonUnlock > 0
      ? `LOCKED ${data.round.secondsUntilButtonUnlock}s`
      : "PRESS THE RUG";

  return (
    <Shell>
      <Header>
        <TitlePanel>
          <Title>Rug Pull: The Game</Title>
          <Badges>
            <Badge $danger={panic}>{data.round.phase.toUpperCase()}</Badge>
            <Badge>Mocked XTZ</Badge>
            <Badge $danger>Live wagers disabled</Badge>
            <span>Everyone sees the button. Someone always does.</span>
          </Badges>
        </TitlePanel>
        <Wallet>
          <div>{data.user.displayName}</div>
          <div>Balance: {data.user.balance.xtz} XTZ</div>
          <div>Join: {data.userActions.joinCost.xtz} XTZ</div>
          <div>Press: {data.userActions.pressCost.xtz} XTZ</div>
        </Wallet>
      </Header>

      <Layout>
        <div>
          <BigButtonPanel>
            <div>
              <CursedButton
                $panic={panic}
                disabled={!data.userActions.canPress || action.isPending}
                onClick={() => action.mutate({ path: "/api/casino/rug-pull/press" })}
              >
                {buttonLabel}
              </CursedButton>
              <Actions>
                <Button
                  onClick={() => action.mutate({ path: "/api/casino/rug-pull/join" })}
                  disabled={!data.userActions.canJoin || action.isPending}
                >
                  Join Round
                </Button>
                <Button
                  onClick={() => action.mutate({ path: "/api/casino/rug-pull/delay" })}
                  disabled={!data.userActions.canDelay || action.isPending}
                >
                  Delay {data.userActions.nextDelayCost?.xtz ?? "-"} XTZ
                </Button>
                <Button
                  onClick={() => action.mutate({ path: "/api/casino/rug-pull/witness" })}
                  disabled={!data.userActions.canJoinWitness || action.isPending}
                >
                  Join Witness
                </Button>
              </Actions>
              {data.userActions.reason && <p>{data.userActions.reason}</p>}
              {error && <p>{error}</p>}
            </div>
          </BigButtonPanel>

          <StatsGrid>
            <Stat>
              <strong>Current Pot</strong>
              <div>{data.round.pot.xtz} XTZ</div>
            </Stat>
            <Stat>
              <strong>Next Seed</strong>
              <div>{data.round.nextSeedPot.xtz} XTZ</div>
            </Stat>
            <Stat>
              <strong>WTF Take</strong>
              <div>{data.round.platformTake.xtz} XTZ</div>
            </Stat>
            <Stat>
              <strong>Pressure</strong>
              <div>{(data.round.pressureMultiplierBps / 100).toFixed(0)}%</div>
            </Stat>
          </StatsGrid>
        </div>

        <div>
          <Box label="Panic Witness Vote">
            <Actions>
              {(["mercy", "cruelty", "silence"] as RugPullVote[]).map((vote) => (
                <Button
                  key={vote}
                  size="sm"
                  disabled={!data.userActions.canVote || action.isPending}
                  onClick={() => action.mutate({ path: "/api/casino/rug-pull/vote", body: { vote } })}
                >
                  {vote}
                </Button>
              ))}
            </Actions>
            <p>Current modifier: {data.round.panicModifier}</p>
          </Box>

          <Box label="Players">
            <Table>
              {topPlayers.map((player) => (
                <Row key={player.walletId}>
                  <strong>#{player.joinOrder}</strong>
                  <div>
                    <strong>{player.displayName}</strong>
                    <div>
                      {player.status} · shares {asShares(player.currentMicroshares)} · delays {player.delayCount}
                    </div>
                  </div>
                  <div>{player.estimatedPayout.xtz} XTZ</div>
                </Row>
              ))}
            </Table>
          </Box>

          <Box label="Witnesses">
            <Table>
              {data.witnesses.length ? (
                data.witnesses.map((witness) => (
                  <Row key={witness.walletId}>
                    <span>*</span>
                    <strong>{witness.displayName}</strong>
                    <span>{witness.vote ?? "watching"}</span>
                  </Row>
                ))
              ) : (
                <p>No witnesses yet.</p>
              )}
            </Table>
          </Box>

          {data.lastSettlement && (
            <Box label="Last Settlement">
              <p>
                Pot {data.lastSettlement.pot.xtz} XTZ · next seed {data.lastSettlement.nextSeedPot.xtz} XTZ
              </p>
              {data.lastSettlement.payouts.slice(0, 4).map((payout) => (
                <div key={payout.walletId}>
                  {payout.displayName}: {payout.payout.xtz} XTZ
                </div>
              ))}
            </Box>
          )}

          <Box label="Timeline">
            <EventFeed>
              {data.timeline.map((event) => (
                <div key={event.id}>{event.message}</div>
              ))}
            </EventFeed>
          </Box>
        </div>
      </Layout>
    </Shell>
  );
}

export function RugPull() {
  return (
    <AppWindow title="Rug Pull">
      <RugPullSurface />
    </AppWindow>
  );
}
