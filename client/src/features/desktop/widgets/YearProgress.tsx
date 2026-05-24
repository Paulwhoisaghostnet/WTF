import { GroupBox } from "react95";
import styled from "styled-components";

const BarTrack = styled.div`
  height: 14px;
  background: #808080;
  border: 2px inset #c0c0c0;
  margin-top: 6px;
`;

const BarFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${(p) => p.$pct}%;
  background: linear-gradient(90deg, #008080, #000080);
`;

function yearProgressPercent(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 1).getTime();
  const end = new Date(date.getFullYear() + 1, 0, 1).getTime();
  return Math.min(100, Math.max(0, ((date.getTime() - start) / (end - start)) * 100));
}

function seasonProgressPercent(date = new Date()) {
  const month = date.getMonth();
  const seasonStartMonth = Math.floor(month / 3) * 3;
  const start = new Date(date.getFullYear(), seasonStartMonth, 1).getTime();
  const end = new Date(date.getFullYear(), seasonStartMonth + 3, 1).getTime();
  return Math.min(100, Math.max(0, ((date.getTime() - start) / (end - start)) * 100));
}

export function YearProgressWidget() {
  const now = new Date();
  const yearPct = yearProgressPercent(now);
  const seasonPct = seasonProgressPercent(now);
  const seasonNames = ["Winter", "Spring", "Summer", "Fall"];
  const season = seasonNames[Math.floor(now.getMonth() / 3)];

  return (
    <GroupBox label={`${now.getFullYear()} Progress — skllzrmy widget`}>
      <div style={{ fontSize: 11 }}>
        <div>Year: {yearPct.toFixed(1)}%</div>
        <BarTrack>
          <BarFill $pct={yearPct} />
        </BarTrack>
        <div style={{ marginTop: 8 }}>
          {season}: {seasonPct.toFixed(1)}%
        </div>
        <BarTrack>
          <BarFill $pct={seasonPct} />
        </BarTrack>
      </div>
    </GroupBox>
  );
}
