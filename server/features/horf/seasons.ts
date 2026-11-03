import { HORF_SEASON_LABEL, HORF_SEASON_START } from "./model";

export interface HorfSeason {
  key: string;
  startsAt: string;
  endsAt: string | null;
  label: string;
  inferred: boolean;
}

/** Historical windows are inferred from Objkt mint clusters and organizer posts. */
export const HORF_SEASONS: readonly HorfSeason[] = [
  { key: "origins-2023", startsAt: "2023-07-30T00:00:00.000Z", endsAt: "2023-09-01T00:00:00.000Z", label: "First horse trade", inferred: true },
  { key: "horse-trading-2023", startsAt: "2023-09-01T00:00:00.000Z", endsAt: "2023-11-01T00:00:00.000Z", label: "Horse Trading 2023", inferred: true },
  { key: "neighvember-2023", startsAt: "2023-11-01T00:00:00.000Z", endsAt: "2023-12-01T00:00:00.000Z", label: "Neighvember 2023", inferred: true },
  { key: "love-of-horses-2024", startsAt: "2024-02-01T00:00:00.000Z", endsAt: "2024-03-01T00:00:00.000Z", label: "For the Love of Horses", inferred: true },
  { key: "horse-of-july-2024", startsAt: "2024-07-01T00:00:00.000Z", endsAt: "2024-08-01T00:00:00.000Z", label: "Horse of July 2024", inferred: true },
  { key: "neighvember-2024", startsAt: "2024-11-01T00:00:00.000Z", endsAt: "2024-12-01T00:00:00.000Z", label: "Neighvember 2024", inferred: true },
  { key: "spring-horse-trading-2025", startsAt: "2025-03-01T00:00:00.000Z", endsAt: "2025-05-01T00:00:00.000Z", label: "Spring / WTF Horse Trading 2025", inferred: true },
  { key: "neighvember-2025", startsAt: "2025-11-01T00:00:00.000Z", endsAt: "2025-12-01T00:00:00.000Z", label: "Neighvember 2025", inferred: true },
  { key: "current-2026", startsAt: HORF_SEASON_START, endsAt: null, label: HORF_SEASON_LABEL, inferred: false },
];

export const HORF_CURRENT_SEASON_KEY = "current-2026";

export function resolveHorfSeason(key: string | null | undefined): HorfSeason | null {
  const wanted = key || HORF_CURRENT_SEASON_KEY;
  return HORF_SEASONS.find((season) => season.key === wanted) || null;
}
