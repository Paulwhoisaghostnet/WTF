export const BUMPER_CATEGORY_PERSONAL = "personal" as const;
export const BUMPER_CATEGORY_COMMUNITY = "community" as const;
export const BUMPER_CATEGORIES = new Set<string>([
  BUMPER_CATEGORY_PERSONAL,
  BUMPER_CATEGORY_COMMUNITY,
]);

export type DaypartName =
  | "late_night"
  | "morning_drive"
  | "afternoon"
  | "prime_time"
  | "evening";

export interface DaypartWindow {
  name: DaypartName;
  displayName: string;
  /** Preferred bumper category for the window, or `null` for "no preference". */
  preferredCategory: typeof BUMPER_CATEGORY_PERSONAL | typeof BUMPER_CATEGORY_COMMUNITY | null;
  /**
   * Multiplier applied to the channel's `videosPerBumper` cadence.
   * >1 means bumpers play less often (loose), <1 means bumpers play
   * more often (tight).  Result is clamped to [1, 20] in the queue
   * builder so a bug here can't produce a 0-cadence feedback loop.
   */
  cadenceMultiplier: number;
}

export function daypartForMs(nowMs: number): DaypartWindow {
  const hour = new Date(nowMs).getHours();
  if (hour >= 0 && hour < 6) {
    return {
      name: "late_night",
      displayName: "Late Night",
      preferredCategory: BUMPER_CATEGORY_COMMUNITY,
      cadenceMultiplier: 1.5,
    };
  }
  if (hour >= 6 && hour < 11) {
    return {
      name: "morning_drive",
      displayName: "Morning Drive",
      preferredCategory: BUMPER_CATEGORY_PERSONAL,
      cadenceMultiplier: 0.85,
    };
  }
  if (hour >= 11 && hour < 16) {
    return {
      name: "afternoon",
      displayName: "Afternoon Mix",
      preferredCategory: null,
      cadenceMultiplier: 1.0,
    };
  }
  if (hour >= 16 && hour < 20) {
    return {
      name: "prime_time",
      displayName: "Prime Time",
      preferredCategory: BUMPER_CATEGORY_PERSONAL,
      cadenceMultiplier: 0.9,
    };
  }
  return {
    name: "evening",
    displayName: "Evening Rotation",
    preferredCategory: BUMPER_CATEGORY_COMMUNITY,
    cadenceMultiplier: 1.1,
  };
}
