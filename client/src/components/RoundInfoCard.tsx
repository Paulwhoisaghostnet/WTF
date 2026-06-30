import type React from "react";
import styled from "styled-components";
import { UiPanel } from "./wtfos-ui";

const Shell = styled(UiPanel)`
  margin-bottom: 10px;

  [data-rounds-presentation-host="gamma"] & {
    background: color-mix(in srgb, var(--gamma-panel, #11110f) 82%, var(--gamma-ink, #070706));
    color: var(--gamma-milk, #f2ead9);
    border: 1px solid var(--gamma-line, rgba(242, 234, 217, 0.18));
    border-radius: 6px;
    box-shadow: none;
  }
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

  [data-rounds-presentation-host="gamma"] & {
    color: var(--gamma-milk, #f2ead9);
  }
`;

const Muted = styled.span`
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);

  [data-rounds-presentation-host="gamma"] & {
    color: var(--gamma-muted, rgba(242, 234, 217, 0.66));
  }
`;

const MetaGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 6px;
  margin: 8px 0;
`;

const Meta = styled.div`
  border: 1px solid var(--wtf-app-border, #808080);
  background: var(--wtf-app-surface-raised, #ffffff);
  padding: 7px;
  min-height: 34px;

  [data-rounds-presentation-host="gamma"] & {
    background: color-mix(in srgb, var(--gamma-panel-2, #181813) 72%, var(--gamma-ink, #070706));
    border: 1px solid var(--gamma-line, rgba(242, 234, 217, 0.18));
    border-radius: 6px;
    box-shadow: none;
  }
`;

const Label = styled.div`
  color: var(--wtf-app-muted-text, #444);
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;

  [data-rounds-presentation-host="gamma"] & {
    color: var(--gamma-cyan, #00d2ff);
    font-family: var(--wtf-mono-font, ui-monospace, SFMono-Regular, Menlo, monospace);
    font-size: 0.72rem;
    text-transform: uppercase;
  }
`;

const Value = styled.div`
  font-weight: 700;

  [data-rounds-presentation-host="gamma"] & {
    color: var(--gamma-milk, #f2ead9);
  }
`;

const PillRow = styled.div`
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 6px;
`;

const Pill = styled.span`
  background: var(--wtf-app-primary, #000080);
  color: var(--wtf-app-accent-text, #fff);
  padding: 3px 7px;
  font-size: var(--wtf-type-caption, 13px);
  font-weight: 700;

  [data-rounds-presentation-host="gamma"] & {
    background: transparent;
    color: var(--gamma-cyan, #00d2ff);
    border: 1px solid var(--gamma-cyan, #00d2ff);
    border-radius: 6px;
  }
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
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.35;

  [data-rounds-presentation-host="gamma"] & {
    color: var(--gamma-milk, #f2ead9);
  }
`;

const SectionTitle = styled.div`
  font-weight: 700;
  margin-bottom: 4px;

  [data-rounds-presentation-host="gamma"] & {
    color: var(--gamma-cyan, #00d2ff);
  }
`;

const BodyText = styled.p`
  margin: 6px 0;
  color: var(--wtf-app-text, #111);
  font-size: var(--wtf-type-caption, 13px);
  line-height: 1.4;

  [data-rounds-presentation-host="gamma"] & {
    color: var(--gamma-milk, #f2ead9);
  }
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
    <Shell title={`Round ${round.number}`} compact data-rounds-region="info-card">
      <Header data-rounds-region="info-header">
        <div>
          <Title data-rounds-region="info-title">{round.name}</Title>
          <Muted>{seasonLabel || "Library round"} · {round.status}</Muted>
        </div>
        {action}
      </Header>

      <MetaGrid data-rounds-region="info-meta-grid">
        <Meta data-rounds-region="info-meta">
          <Label data-rounds-region="info-label">Competing</Label>
          <Value data-rounds-region="info-value">{round.startingContestants || 0}</Value>
        </Meta>
        <Meta data-rounds-region="info-meta">
          <Label data-rounds-region="info-label">Eliminated</Label>
          <Value data-rounds-region="info-value">{round.eliminatedAtEnd || 0}</Value>
        </Meta>
        <Meta data-rounds-region="info-meta">
          <Label data-rounds-region="info-label">XP</Label>
          <Value data-rounds-region="info-value">{round.rewardXp || 0}</Value>
        </Meta>
        <Meta data-rounds-region="info-meta">
          <Label data-rounds-region="info-label">Schedule</Label>
          <Value data-rounds-region="info-value">{formatDate(schedule.startsAt ?? round.startDate)}</Value>
          {(schedule.endsAt ?? round.endDate) && (
            <Muted>to {formatDate(schedule.endsAt ?? round.endDate)}</Muted>
          )}
        </Meta>
      </MetaGrid>

      <BodyText>
        {round.description || "No round summary yet."}
      </BodyText>
      {round.rules && (
        <BodyText>
          <strong>Rules:</strong> {round.rules}
        </BodyText>
      )}

      {platforms.length > 0 && (
        <PillRow data-rounds-region="info-pill-row">
          {platforms.map((platform, index) => (
            <Pill key={`${labelFor(platform)}-${index}`} data-rounds-region="info-pill">{labelFor(platform)}</Pill>
          ))}
        </PillRow>
      )}

      <Columns data-rounds-region="info-columns">
        <div>
          <SectionTitle data-rounds-region="info-section-title">Prizes</SectionTitle>
          {prizes.length ? (
            <MiniList data-rounds-region="mini-list">
              {prizes.map((item, index) => (
                <li key={index}>{labelFor(item)}</li>
              ))}
            </MiniList>
          ) : (
            <Muted>No prize list yet.</Muted>
          )}
        </div>
        <div>
          <SectionTitle data-rounds-region="info-section-title">Previous Winners</SectionTitle>
          {previousWinners.length ? (
            <MiniList data-rounds-region="mini-list">
              {previousWinners.map((item, index) => (
                <li key={index}>{labelFor(item)}</li>
              ))}
            </MiniList>
          ) : (
            <Muted>No winner history yet.</Muted>
          )}
        </div>
        <div>
          <SectionTitle data-rounds-region="info-section-title">Top 10 Leaderboard</SectionTitle>
          {leaderboard.length ? (
            <MiniList data-rounds-region="mini-list">
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
          <SectionTitle data-rounds-region="info-section-title">Elimination History</SectionTitle>
          {eliminated.length ? (
            <MiniList data-rounds-region="mini-list">
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
