import { GroupBox } from "react95";
import type React from "react";
import styled from "styled-components";

const Shell = styled(GroupBox)`
  margin-bottom: 10px;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  flex-wrap: wrap;
`;

const Title = styled.div`
  font-weight: 700;
  font-size: 16px;
`;

const Muted = styled.span`
  color: #555;
  font-size: 12px;
`;

const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 6px;
  margin: 8px 0;
`;

const Meta = styled.div`
  border-left: 3px solid #000080;
  padding-left: 6px;
  min-height: 34px;
`;

const Label = styled.div`
  color: #555;
  font-size: 11px;
  text-transform: uppercase;
`;

const Value = styled.div`
  font-weight: 700;
`;

const PillRow = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 6px;
`;

const Pill = styled.span`
  background: #000080;
  color: #fff;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 700;
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 10px;
  margin-top: 8px;
`;

const MiniList = styled.ol`
  margin: 4px 0 0 18px;
  padding: 0;
  font-size: 12px;
`;

const SectionTitle = styled.div`
  font-weight: 700;
  margin-bottom: 4px;
`;

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function labelFor(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return String(
      record.label ??
        record.name ??
        record.username ??
        record.wallet ??
        record.title ??
        JSON.stringify(record)
    );
  }
  return String(value ?? "");
}

function scoreFor(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const score = record.score ?? record.points ?? record.value;
  return score === undefined ? null : String(score);
}

function formatDate(value: unknown): string {
  if (!value) return "Not scheduled";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? "Not scheduled" : parsed.toLocaleString();
}

export function RoundInfoCard({
  round,
  seasonLabel,
  action,
}: {
  round: any;
  seasonLabel?: string;
  action?: React.ReactNode;
}) {
  const platforms = asArray(round.requiredPlatforms);
  const prizes = asArray(round.prizes);
  const previousWinners = asArray(round.previousWinners);
  const leaderboard = asArray(round.leaderboard).slice(0, 10);
  const eliminated = asArray(round.eliminatedContestants);
  const schedule = round.calendarEvent ?? round;

  return (
    <Shell label={`Round ${round.number}`}>
      <Header>
        <div>
          <Title>{round.name}</Title>
          <Muted>{seasonLabel || "Library round"} · {round.status}</Muted>
        </div>
        {action}
      </Header>

      <MetaGrid>
        <Meta>
          <Label>Competing</Label>
          <Value>{round.startingContestants || 0}</Value>
        </Meta>
        <Meta>
          <Label>Eliminated</Label>
          <Value>{round.eliminatedAtEnd || 0}</Value>
        </Meta>
        <Meta>
          <Label>XP</Label>
          <Value>{round.rewardXp || 0}</Value>
        </Meta>
        <Meta>
          <Label>Schedule</Label>
          <Value>{formatDate(schedule.startsAt ?? round.startDate)}</Value>
          {(schedule.endsAt ?? round.endDate) && (
            <Muted>to {formatDate(schedule.endsAt ?? round.endDate)}</Muted>
          )}
        </Meta>
      </MetaGrid>

      <p style={{ fontSize: 12, margin: "6px 0" }}>
        {round.description || "No round summary yet."}
      </p>
      {round.rules && (
        <p style={{ fontSize: 12, margin: "6px 0" }}>
          <strong>Rules:</strong> {round.rules}
        </p>
      )}

      {platforms.length > 0 && (
        <PillRow>
          {platforms.map((platform, index) => (
            <Pill key={`${labelFor(platform)}-${index}`}>{labelFor(platform)}</Pill>
          ))}
        </PillRow>
      )}

      <Columns>
        <div>
          <SectionTitle>Prizes</SectionTitle>
          {prizes.length ? (
            <MiniList>
              {prizes.map((item, index) => (
                <li key={index}>{labelFor(item)}</li>
              ))}
            </MiniList>
          ) : (
            <Muted>No prize list yet.</Muted>
          )}
        </div>
        <div>
          <SectionTitle>Previous Winners</SectionTitle>
          {previousWinners.length ? (
            <MiniList>
              {previousWinners.map((item, index) => (
                <li key={index}>{labelFor(item)}</li>
              ))}
            </MiniList>
          ) : (
            <Muted>No winner history yet.</Muted>
          )}
        </div>
        <div>
          <SectionTitle>Top 10 Leaderboard</SectionTitle>
          {leaderboard.length ? (
            <MiniList>
              {leaderboard.map((item, index) => {
                const score = scoreFor(item);
                return (
                  <li key={index}>
                    {labelFor(item)}
                    {score ? ` — ${score}` : ""}
                  </li>
                );
              })}
            </MiniList>
          ) : (
            <Muted>No scores yet.</Muted>
          )}
        </div>
        <div>
          <SectionTitle>Elimination History</SectionTitle>
          {eliminated.length ? (
            <MiniList>
              {eliminated.map((item, index) => (
                <li key={index}>{labelFor(item)}</li>
              ))}
            </MiniList>
          ) : (
            <Muted>No eliminations recorded.</Muted>
          )}
        </div>
      </Columns>
    </Shell>
  );
}
