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
import { presentationRouteHref, usePresentationShell } from "../lib/presentation-shell";
import { deriveRoundsLaunchState } from "./rounds-model";

const roundRegionAttrs = (region: string): any => ({
  "data-rounds-region": region,
});

const RoundsSurface = styled.div`
  display: grid;
  gap: 12px;
  min-width: 0;

  &[data-rounds-presentation-host="gamma"] {
    color: var(--gamma-milk, #f2ead9);
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  &[data-rounds-presentation-host="gamma"],
  &[data-rounds-presentation-host="gamma"] * {
    letter-spacing: 0;
  }

  &[data-rounds-presentation-host="gamma"] [data-rounds-region] {
    background-image: none !important;
    box-shadow: none !important;
    text-shadow: none !important;
  }

  &[data-rounds-presentation-host="gamma"] :where(fieldset, section, [data-rounds-region]) {
    border-color: var(--gamma-line, rgba(242, 234, 217, 0.18));
    border-radius: 6px;
  }

  &[data-rounds-presentation-host="gamma"] fieldset,
  &[data-rounds-presentation-host="gamma"] [data-rounds-region="season-panel"],
  &[data-rounds-presentation-host="gamma"] [data-rounds-region="launch-board"],
  &[data-rounds-presentation-host="gamma"] [data-rounds-region="round-card"],
  &[data-rounds-presentation-host="gamma"] [data-rounds-region="launch-metric"] {
    background: color-mix(in srgb, var(--gamma-panel, #11110f) 82%, var(--gamma-ink, #070706));
    color: var(--gamma-milk, #f2ead9);
    border: 1px solid var(--gamma-line, rgba(242, 234, 217, 0.18));
  }

  &[data-rounds-presentation-host="gamma"] legend,
  &[data-rounds-presentation-host="gamma"] [data-rounds-region="launch-label"],
  &[data-rounds-presentation-host="gamma"] [data-rounds-region="season-picker-label"] {
    color: var(--gamma-cyan, #00d2ff);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.76rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  &[data-rounds-presentation-host="gamma"] [data-rounds-region="launch-value"],
  &[data-rounds-presentation-host="gamma"] h3,
  &[data-rounds-presentation-host="gamma"] p {
    color: var(--gamma-milk, #f2ead9);
  }

  &[data-rounds-presentation-host="gamma"] [data-rounds-region="status-badge"] {
    background: transparent;
    color: var(--gamma-cyan, #00d2ff);
    border: 1px solid var(--gamma-cyan, #00d2ff);
  }

  &[data-rounds-presentation-host="gamma"] [data-rounds-status="active"] {
    color: var(--gamma-live, #c6ff4f);
    border-color: var(--gamma-live, #c6ff4f);
  }

  &[data-rounds-presentation-host="gamma"] [data-rounds-region="launch-actions"],
  &[data-rounds-presentation-host="gamma"] [data-rounds-region="season-picker"] {
    align-items: center;
  }

  &[data-rounds-presentation-host="gamma"] button:not(:disabled),
  &[data-rounds-presentation-host="gamma"] select {
    border-color: var(--gamma-line, rgba(242, 234, 217, 0.18));
    border-radius: 5px;
  }
`;

const RoundCard = styled(GroupBox).attrs(roundRegionAttrs("round-card"))`
  margin-bottom: 8px;
  cursor: pointer;

  &:hover {
    background: #e0e0e0;
  }
`;

const StatusBadge = styled.span<{ $status: string }>`
  padding: 3px 7px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  background: ${(p) =>
    p.$status === "active"
      ? "var(--wtf-app-success, #176b38)"
      : p.$status === "completed"
        ? "#4b5563"
        : "var(--wtf-app-info, #175cd3)"};
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
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #dfdfdf);
  padding: var(--wtf-space-2, 8px);
  min-height: 54px;
  box-shadow: inset 1px 1px 0 #ffffff, inset -1px -1px 0 #9a9a9a;
`;

const LaunchLabel = styled.div`
  font-size: var(--wtf-type-caption, 13px);
  font-weight: bold;
  color: var(--wtf-app-muted-text, #404040);
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
  min-height: var(--wtf-control-min-height, 34px);
  font-size: var(--wtf-type-caption, 13px);
`;

export function Rounds() {
  const { isAdmin } = useAuth();
  const [, setLocation] = useLocation();
  const presentation = usePresentationShell();
  const goToRoute = (route: string) =>
    setLocation(presentationRouteHref(route, presentation.host));

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
      <RoundsSurface
        data-rounds-presentation-host={presentation.host}
        data-rounds-surface="rounds"
        data-rounds-region="surface"
      >
        {seasons && seasons.length > 0 && (
          <div
            style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}
            data-rounds-region="season-picker"
          >
            <label data-rounds-region="season-picker-label">Season:</label>
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
          <GroupBox
            label={`Season ${activeSeason.number}: ${activeSeason.name}`}
            data-rounds-region="season-panel"
          >
            <p>{activeSeason.description || "No description"}</p>
            <StatusBadge
              $status={activeSeason.status}
              data-rounds-region="status-badge"
              data-rounds-status={activeSeason.status}
            >
              {activeSeason.status.toUpperCase()}
            </StatusBadge>
          </GroupBox>
        )}

        <section data-testid="gameshow-launch-board" data-rounds-region="launch-board">
          <GroupBox label="Gameshow launch board">
            <LaunchGrid data-rounds-region="launch-grid">
              <LaunchMetric data-rounds-region="launch-metric">
                <LaunchLabel data-rounds-region="launch-label">Season</LaunchLabel>
                <LaunchValue data-rounds-region="launch-value">{launchState.seasonLabel}</LaunchValue>
              </LaunchMetric>
              <LaunchMetric data-rounds-region="launch-metric">
                <LaunchLabel data-rounds-region="launch-label">Status</LaunchLabel>
                <LaunchValue data-rounds-region="launch-value">{launchState.launchStatus}</LaunchValue>
              </LaunchMetric>
              <LaunchMetric data-rounds-region="launch-metric">
                <LaunchLabel data-rounds-region="launch-label">Open work</LaunchLabel>
                <LaunchValue data-rounds-region="launch-value">
                  {launchState.activeRounds} live / {launchState.openChallenges} challenges
                </LaunchValue>
              </LaunchMetric>
              <LaunchMetric data-rounds-region="launch-metric">
                <LaunchLabel data-rounds-region="launch-label">Next round</LaunchLabel>
                <LaunchValue data-rounds-region="launch-value">{launchState.nextRoundLabel}</LaunchValue>
              </LaunchMetric>
            </LaunchGrid>
            <LaunchActions data-rounds-region="launch-actions">
              <LaunchButton onClick={() => goToRoute("/mission-control")}>
                Mission Control
              </LaunchButton>
              <LaunchButton onClick={() => goToRoute("/side-quests")}>
                Side Quests
              </LaunchButton>
              <LaunchButton onClick={() => goToRoute("/challenges")}>
                Challenges
              </LaunchButton>
              <LaunchButton onClick={() => goToRoute("/calendar")}>
                Calendar
              </LaunchButton>
            </LaunchActions>
          </GroupBox>
        </section>

        <Separator style={{ margin: "12px 0" }} />

        <h3>Rounds</h3>
        <Grid data-rounds-region="round-grid">
          {rounds?.map((round: any) => (
            <RoundCard
              key={round.id}
              label={`Round ${round.number}`}
              onClick={() => goToRoute(`/rounds/${round.id}`)}
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
          <div style={{ marginTop: 12 }} data-rounds-region="admin-actions">
            <Button onClick={() => goToRoute("/admin")}>
              Manage Seasons & Rounds
            </Button>
          </div>
        )}
      </RoundsSurface>
    </AppWindow>
  );
}
