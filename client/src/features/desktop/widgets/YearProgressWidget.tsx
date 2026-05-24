import { useState, useEffect } from "react";
import { GroupBox } from "react95";
import styled from "styled-components";

// ─── Styled components ────────────────────────────────────────────────────────

const BarWrap = styled.div`
  margin: 5px 0 8px;
`;

const BarLabel = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  margin-bottom: 2px;
  color: #444;
`;

const BarTrack = styled.div`
  width: 100%;
  height: 12px;
  background: #808080;
  border-top: 1px solid #404040;
  border-left: 1px solid #404040;
  border-right: 1px solid #dfdfdf;
  border-bottom: 1px solid #dfdfdf;
  overflow: hidden;
  position: relative;
`;

const BarFill = styled.div<{ $pct: number; $color: string }>`
  height: 100%;
  width: ${({ $pct }) => `${$pct}%`};
  background: ${({ $color }) => $color};
  transition: width 0.6s ease;
`;

const SeasonEmoji = styled.span`
  font-size: 18px;
  margin-right: 6px;
`;

const CountdownRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: #555;
  margin-top: 3px;
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface TimeProgress {
  yearPct: number;
  yearDaysLeft: number;
  seasonName: string;
  seasonEmoji: string;
  seasonPct: number;
  seasonDaysLeft: number;
  dayOfYear: number;
  totalDaysInYear: number;
}

function getSeasonInfo(date: Date): { name: string; emoji: string; pct: number; daysLeft: number } {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-based
  const day   = date.getDate();

  // Approximate meteorological seasons (northern hemisphere)
  // Spring: Mar 1 – May 31 | Summer: Jun 1 – Aug 31
  // Autumn: Sep 1 – Nov 30 | Winter: Dec 1 – Feb 28/29
  type SeasonSpec = { name: string; emoji: string; start: Date; end: Date };

  function d(y: number, m: number, dayN: number): Date {
    return new Date(y, m - 1, dayN);
  }

  const seasons: SeasonSpec[] = [
    { name: "Spring", emoji: "🌸", start: d(year, 3, 1),  end: d(year, 5, 31) },
    { name: "Summer", emoji: "☀️",  start: d(year, 6, 1),  end: d(year, 8, 31) },
    { name: "Autumn", emoji: "🍂",  start: d(year, 9, 1),  end: d(year, 11, 30) },
    { name: "Winter", emoji: "❄️",  start: d(year, 12, 1), end: d(year + 1, 2, isLeapYear(year + 1) ? 29 : 28) },
    // Dec 1 prev year – Feb 28/29 current year (for Jan/Feb)
    { name: "Winter", emoji: "❄️",  start: d(year - 1, 12, 1), end: d(year, 2, isLeapYear(year) ? 29 : 28) },
  ];

  for (const s of seasons) {
    if (date >= s.start && date <= s.end) {
      const total  = s.end.getTime() - s.start.getTime();
      const elapsed = date.getTime() - s.start.getTime();
      const pct = total > 0 ? Math.min(100, (elapsed / total) * 100) : 0;
      const daysLeft = Math.max(0, Math.ceil((s.end.getTime() - date.getTime()) / 86_400_000));
      return { name: s.name, emoji: s.emoji, pct, daysLeft };
    }
  }

  // Fallback
  const fallbacks: Record<number, [string, string]> = {
    1: ["Winter", "❄️"], 2: ["Winter", "❄️"],
    3: ["Spring", "🌸"], 4: ["Spring", "🌸"], 5: ["Spring", "🌸"],
    6: ["Summer", "☀️"], 7: ["Summer", "☀️"], 8: ["Summer", "☀️"],
    9: ["Autumn", "🍂"], 10: ["Autumn", "🍂"], 11: ["Autumn", "🍂"],
    12: ["Winter", "❄️"],
  };
  const [name, emoji] = fallbacks[month] ?? ["?", "🌍"];
  return { name, emoji, pct: 50, daysLeft: 30 };
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function computeProgress(now = new Date()): TimeProgress {
  const year  = now.getFullYear();
  const start = new Date(year, 0, 1);
  const end   = new Date(year + 1, 0, 1);

  const totalMs   = end.getTime() - start.getTime();
  const elapsedMs = now.getTime() - start.getTime();
  const yearPct   = Math.min(100, (elapsedMs / totalMs) * 100);

  const totalDays  = isLeapYear(year) ? 366 : 365;
  const dayOfYear  = Math.floor(elapsedMs / 86_400_000) + 1;
  const yearDaysLeft = totalDays - dayOfYear;

  const season = getSeasonInfo(now);

  return {
    yearPct,
    yearDaysLeft,
    seasonName: season.name,
    seasonEmoji: season.emoji,
    seasonPct: season.pct,
    seasonDaysLeft: season.daysLeft,
    dayOfYear,
    totalDaysInYear: totalDays,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function YearProgressWidget() {
  const [progress, setProgress] = useState<TimeProgress>(() => computeProgress());

  // Recalculate once per minute
  useEffect(() => {
    const tick = setInterval(() => {
      setProgress(computeProgress());
    }, 60_000);
    return () => clearInterval(tick);
  }, []);

  const yearColor = progress.yearPct > 75 ? "#c0392b" : progress.yearPct > 50 ? "#e67e22" : "#000080";

  const seasonColorMap: Record<string, string> = {
    Spring: "#27ae60",
    Summer: "#f39c12",
    Autumn: "#d35400",
    Winter: "#2980b9",
  };
  const seasonColor = seasonColorMap[progress.seasonName] ?? "#000080";

  return (
    <GroupBox label="Year Progress">
      <BarWrap>
        <BarLabel>
          <span>
            {new Date().getFullYear()} — Day {progress.dayOfYear}/{progress.totalDaysInYear}
          </span>
          <span style={{ fontWeight: "bold", color: yearColor }}>
            {progress.yearPct.toFixed(1)}%
          </span>
        </BarLabel>
        <BarTrack>
          <BarFill $pct={progress.yearPct} $color={yearColor} />
        </BarTrack>
        <CountdownRow>
          <span>{Math.round(progress.yearPct)}% complete</span>
          <span>{progress.yearDaysLeft}d left in {new Date().getFullYear()}</span>
        </CountdownRow>
      </BarWrap>

      <BarWrap>
        <BarLabel>
          <span>
            <SeasonEmoji>{progress.seasonEmoji}</SeasonEmoji>
            {progress.seasonName}
          </span>
          <span style={{ fontWeight: "bold", color: seasonColor }}>
            {progress.seasonPct.toFixed(1)}%
          </span>
        </BarLabel>
        <BarTrack>
          <BarFill $pct={progress.seasonPct} $color={seasonColor} />
        </BarTrack>
        <CountdownRow>
          <span>{Math.round(progress.seasonPct)}% through {progress.seasonName}</span>
          <span>{progress.seasonDaysLeft}d left</span>
        </CountdownRow>
      </BarWrap>
    </GroupBox>
  );
}
