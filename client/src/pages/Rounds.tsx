import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  GroupBox,
  Select,
  Hourglass,
  Separator,
} from "react95";
import styled from "styled-components";
import { useLocation } from "wouter";
import { AppWindow } from "../components/layout/AppWindow";
import { RoundInfoCard } from "../components/RoundInfoCard";
import { useAuth } from "../lib/auth-context";
import { api } from "../lib/api";
import { deriveRoundsLaunchState } from "./rounds-model";

const RoundCard = styled(GroupBox)`
  margin-bottom: 8px;
  cursor: pointer;

  &:hover {
    background: #e0e0e0;
  }
`;

const StatusBadge = styled.span<{ $status: string }>`
  padding: 2px 6px;
  font-size: 11px;
  font-weight: bold;
  background: ${(p) =>
    p.$status === "active"
      ? "#00aa00"
      : p.$status === "completed"
        ? "#808080"
        : "#0000aa"};
  color: white;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const LaunchGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 8px;

  @media (max-width: 860px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 520px) {
    grid-template-columns: 1fr;
  }
`;

const LaunchMetric = styled.div`
  border: 1px solid #808080;
  background: #dfdfdf;
  padding: 6px;
  min-height: 54px;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
`;

const LaunchLabel = styled.div`
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  color: #404040;
`;

const LaunchValue = styled.div`
  margin-top: 3px;
  font-size: 14px;
  font-weight: bold;
  overflow-wrap: anywhere;
`;

const LaunchActions = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;

  @media (max-width: 720px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
`;

const LaunchButton = styled(Button)`
  width: 100%;
  min-height: 28px;
  font-size: 11px;
`;

export function Rounds() {
  const { isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  const { data: seasons, isLoading } = useQuery({
    queryKey: ["seasons"],
    queryFn: () => api.get<any[]>("/api/seasons"),
  });

  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  const activeSeason =
    seasons?.find((s) =>
      selectedSeason ? s.id === selectedSeason : s.status === "active"
    ) || seasons?.[0];

  const { data: rounds } = useQuery({
    queryKey: ["rounds", activeSeason?.id],
    queryFn: () => api.get<any[]>(`/api/rounds?seasonId=${activeSeason.id}`),
    enabled: !!activeSeason,
  });

  const { data: challenges } = useQuery({
    queryKey: ["rounds", "active-challenges"],
    queryFn: () => api.get<any[]>("/api/challenges"),
  });

  const launchState = deriveRoundsLaunchState({
    season: activeSeason,
    rounds,
    challenges,
  });

  if (isLoading) return <AppWindow title="Rounds"><Hourglass size={32} /></AppWindow>;

  return (
    <AppWindow title="Seasons & Rounds">
      {seasons && seasons.length > 0 && (
        <div style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}>
          <label>Season:</label>
          <Select
            value={activeSeason?.id}
            onChange={(e: any) => setSelectedSeason(e.value)}
            options={seasons.map((s: any) => ({
              label: `Season ${s.number}: ${s.name}`,
              value: s.id,
            }))}
            width={300}
          />
        </div>
      )}

      {activeSeason && (
        <GroupBox label={`Season ${activeSeason.number}: ${activeSeason.name}`}>
          <p>{activeSeason.description || "No description"}</p>
          <StatusBadge $status={activeSeason.status}>
            {activeSeason.status.toUpperCase()}
          </StatusBadge>
        </GroupBox>
      )}

      <GroupBox label="Gameshow launch board">
        <LaunchGrid>
          <LaunchMetric>
            <LaunchLabel>Season</LaunchLabel>
            <LaunchValue>{launchState.seasonLabel}</LaunchValue>
          </LaunchMetric>
          <LaunchMetric>
            <LaunchLabel>Status</LaunchLabel>
            <LaunchValue>{launchState.launchStatus}</LaunchValue>
          </LaunchMetric>
          <LaunchMetric>
            <LaunchLabel>Open work</LaunchLabel>
            <LaunchValue>
              {launchState.activeRounds} live / {launchState.openChallenges} challenges
            </LaunchValue>
          </LaunchMetric>
          <LaunchMetric>
            <LaunchLabel>Next round</LaunchLabel>
            <LaunchValue>{launchState.nextRoundLabel}</LaunchValue>
          </LaunchMetric>
        </LaunchGrid>
        <LaunchActions>
          <LaunchButton onClick={() => setLocation("/mission-control")}>
            Mission Control
          </LaunchButton>
          <LaunchButton onClick={() => setLocation("/side-quests")}>
            Daily Loops
          </LaunchButton>
          <LaunchButton onClick={() => setLocation("/challenges")}>
            Challenges
          </LaunchButton>
          <LaunchButton onClick={() => setLocation("/calendar")}>
            Calendar
          </LaunchButton>
        </LaunchActions>
      </GroupBox>

      <Separator style={{ margin: "12px 0" }} />

      <h3>Rounds</h3>
      <Grid>
        {rounds?.map((round: any) => (
          <RoundCard
            key={round.id}
            label={`Round ${round.number}`}
            onClick={() => setLocation(`/rounds/${round.id}`)}
          >
            <RoundInfoCard
              round={round}
              seasonLabel={activeSeason ? `Season ${activeSeason.number}` : undefined}
            />
          </RoundCard>
        ))}
        {(!rounds || rounds.length === 0) && <p>No rounds yet.</p>}
      </Grid>

      {isAdmin && (
        <div style={{ marginTop: 12 }}>
          <Button onClick={() => setLocation("/admin")}>
            Manage Seasons & Rounds
          </Button>
        </div>
      )}
    </AppWindow>
  );
}
