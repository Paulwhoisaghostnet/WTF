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
