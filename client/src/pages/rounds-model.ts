export type RoundsLaunchSeason = {
  id?: number;
  name?: string | null;
  number?: number | null;
  status?: string | null;
};

export type RoundsLaunchRound = {
  id?: number;
  name?: string | null;
  number?: number | null;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  calendarEvent?: {
    startsAt?: string | null;
    endsAt?: string | null;
  } | null;
};

export type RoundsLaunchChallenge = {
  status?: string | null;
};

function asArray<T>(value: T[] | unknown): T[] {
  return Array.isArray(value) ? value : [];
}

function timestampFor(round: RoundsLaunchRound): number {
  const raw = round.calendarEvent?.startsAt ?? round.startDate;
  if (!raw) return Number.POSITIVE_INFINITY;
  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

export function deriveRoundsLaunchState(input: {
  season?: RoundsLaunchSeason | null;
  rounds?: RoundsLaunchRound[] | unknown;
  challenges?: RoundsLaunchChallenge[] | unknown;
  now?: Date;
}) {
  const rounds = asArray<RoundsLaunchRound>(input.rounds);
  const challenges = asArray<RoundsLaunchChallenge>(input.challenges);
  const activeRounds = rounds.filter((round) => round.status === "active");
  const prepRounds = rounds.filter((round) => round.status === "upcoming" || round.status === "draft");
  const openChallenges = challenges.filter((challenge) => challenge.status === "active");
  const nowMs = input.now?.getTime() ?? Date.now();
  const nextRound =
    activeRounds[0] ??
    rounds
      .filter((round) => timestampFor(round) >= nowMs)
      .sort((a, b) => timestampFor(a) - timestampFor(b))[0] ??
    rounds[0] ??
    null;

  return {
    seasonLabel: input.season
      ? `Season ${input.season.number ?? "?"}: ${input.season.name || "Untitled"}`
      : "No season",
    seasonStatus: input.season?.status ?? "missing",
    launchStatus:
      activeRounds.length > 0
        ? "Live"
        : prepRounds.length > 0
          ? "Preparing"
          : input.season
            ? "Ready"
            : "Needs season",
    activeRounds: activeRounds.length,
    prepRounds: prepRounds.length,
    openChallenges: openChallenges.length,
    nextRoundLabel: nextRound
      ? `Round ${nextRound.number ?? "?"}: ${nextRound.name || "Untitled"}`
      : "No round scheduled",
  };
}
