import {
  GUINEA_PIG_RACEWAY_RULES,
  buildWinProbabilityBps,
  calculateRaceWeight,
  clampTrackConditionSwingBps,
  createRaceUniquenessProfile,
  selectRacewayTrack,
  type RacewayEntrant,
  type RacewayModifierKey,
  type RacewayStats,
} from "./rules";

type StableRacer = (typeof GUINEA_PIG_RACEWAY_RULES.defaultRacerStable)[number];
type RacewayTrack = (typeof GUINEA_PIG_RACEWAY_RULES.tracks)[number];
type RacewayCondition = (typeof GUINEA_PIG_RACEWAY_RULES.conditionModifiers)[number];

export type RacewayRaceCardEntrant = StableRacer & {
  trackBiasBps: number;
  conditionBiasBps: number;
  preRaceWeight: number;
  winProbabilityBps: number;
};

export type RacewayRaceCard = {
  raceId: string;
  seedCommitment: string;
  uniquenessProfile: string;
  track: RacewayTrack;
  conditions: RacewayCondition[];
  globalVariableBps: Record<string, number>;
  entrants: RacewayRaceCardEntrant[];
  scheduleSeconds: {
    bettingOpen: number;
    bettingLockout: number;
    introMarks: number;
    race: number;
    replay: number;
  };
};

function hashString(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function boundedHash(input: string, min: number, max: number): number {
  const span = max - min + 1;
  return min + (hashString(input) % span);
}

function pickStableField(seed: string, entrantCount: number): StableRacer[] {
  const stable = GUINEA_PIG_RACEWAY_RULES.defaultRacerStable;
  const start = hashString(`${seed}:field-start`) % stable.length;
  return Array.from({ length: entrantCount }, (_, offset) => stable[(start + offset) % stable.length]);
}

function pickConditions(seed: string): RacewayCondition[] {
  const conditions = GUINEA_PIG_RACEWAY_RULES.conditionModifiers;
  const picks = new Map<string, RacewayCondition>();
  let salt = 0;
  while (picks.size < 3) {
    const condition = conditions[hashString(`${seed}:condition:${salt}`) % conditions.length];
    picks.set(condition.key, condition);
    salt += 1;
  }
  return [...picks.values()];
}

function buildGlobalVariableBps(seed: string): Record<string, number> {
  return Object.fromEntries(
    GUINEA_PIG_RACEWAY_RULES.globalVariableBands.map((band) => [
      band.key,
      boundedHash(`${seed}:global:${band.key}`, band.minBps, band.maxBps),
    ])
  );
}

function calculateTrackFitBps(stats: RacewayStats, track: RacewayTrack): number {
  const fit =
    (stats.speed - 50) * track.statBiases.speed +
    (stats.stamina - 50) * track.statBiases.stamina +
    (stats.cornering - 50) * track.statBiases.cornering +
    (stats.focus - 50) * track.statBiases.focus +
    (stats.courage - 50) * track.statBiases.courage;
  return clampTrackConditionSwingBps(Math.round(fit / 10_000));
}

function calculateConditionBiasBps(input: {
  conditions: RacewayCondition[];
  globalVariableBps: Record<string, number>;
  racerId: string;
  seed: string;
}): number {
  const publicConditionBias = input.conditions.reduce(
    (sum, condition) => sum + condition.modifierBps,
    0
  );
  const globalBias = Object.values(input.globalVariableBps).reduce((sum, value) => sum + value, 0);
  const personalVariance = boundedHash(
    `${input.seed}:personal:${input.racerId}`,
    -300,
    300
  );
  return clampTrackConditionSwingBps(publicConditionBias + Math.round(globalBias / 5) + personalVariance);
}

export function buildRacewayRaceCard(input: {
  raceId: string;
  seedCommitment: string;
  entrantCount?: number;
}): RacewayRaceCard {
  const raceId = input.raceId.trim();
  const seedCommitment = input.seedCommitment.trim();
  if (!raceId) throw new RangeError("raceId is required");
  if (!seedCommitment) throw new RangeError("seedCommitment is required");

  const entrantCount =
    input.entrantCount ??
    boundedHash(
      `${raceId}:${seedCommitment}:entrant-count`,
      GUINEA_PIG_RACEWAY_RULES.minRacers,
      GUINEA_PIG_RACEWAY_RULES.maxRacers
    );
  if (
    entrantCount < GUINEA_PIG_RACEWAY_RULES.minRacers ||
    entrantCount > GUINEA_PIG_RACEWAY_RULES.maxRacers
  ) {
    throw new RangeError(
      `entrantCount must be ${GUINEA_PIG_RACEWAY_RULES.minRacers}-${GUINEA_PIG_RACEWAY_RULES.maxRacers}`
    );
  }

  const seed = `${raceId}:${seedCommitment}`;
  const track = selectRacewayTrack(seed);
  const conditions = pickConditions(seed);
  const globalVariableBps = buildGlobalVariableBps(seed);
  const field = pickStableField(seed, entrantCount);

  const entrantsForOdds: RacewayEntrant[] = field.map((racer) => {
    const trackBiasBps = calculateTrackFitBps(racer.stats, track);
    const conditionBiasBps = calculateConditionBiasBps({
      conditions,
      globalVariableBps,
      racerId: racer.id,
      seed,
    });
    return {
      id: racer.id,
      name: racer.displayName,
      stats: racer.stats,
      trackBiasBps,
      conditionBiasBps,
    };
  });

  const probabilities = buildWinProbabilityBps(entrantsForOdds);
  const probabilityById = new Map(
    probabilities.map((entrant) => [
      entrant.id,
      {
        weight: entrant.weight,
        winProbabilityBps: entrant.winProbabilityBps,
      },
    ])
  );

  const entrants = field.map((racer) => {
    const trackBiasBps = calculateTrackFitBps(racer.stats, track);
    const conditionBiasBps = calculateConditionBiasBps({
      conditions,
      globalVariableBps,
      racerId: racer.id,
      seed,
    });
    const probability = probabilityById.get(racer.id);
    return {
      ...racer,
      trackBiasBps,
      conditionBiasBps,
      preRaceWeight:
        probability?.weight ??
        calculateRaceWeight({ id: racer.id, stats: racer.stats, trackBiasBps, conditionBiasBps }),
      winProbabilityBps: probability?.winProbabilityBps ?? 0,
    };
  });

  return {
    raceId,
    seedCommitment,
    track,
    conditions,
    globalVariableBps,
    entrants,
    uniquenessProfile: createRaceUniquenessProfile({
      raceId,
      trackKey: track.key,
      conditionKeys: conditions.map((condition) => condition.key as RacewayModifierKey),
      globalVariableBps,
      racerIds: entrants.map((entrant) => entrant.id),
    }),
    scheduleSeconds: {
      bettingOpen: GUINEA_PIG_RACEWAY_RULES.bettingOpenSeconds,
      bettingLockout: GUINEA_PIG_RACEWAY_RULES.bettingLockoutSeconds,
      introMarks: GUINEA_PIG_RACEWAY_RULES.introMarksSeconds,
      race: GUINEA_PIG_RACEWAY_RULES.raceSeconds,
      replay: GUINEA_PIG_RACEWAY_RULES.replaySeconds,
    },
  };
}
