export const GUINEA_PIG_RACEWAY_GAME_KEY = "guinea-pig-raceway";
export const RACEWAY_BPS = 10_000;

export type RacewayPhase =
  | "betting_open"
  | "betting_lockout"
  | "intro_marks"
  | "racing"
  | "results_replay";

export type RacewayEffectKey =
  | "snack_toss"
  | "squeaky_distraction"
  | "tunnel_rumor"
  | "fan_chant"
  | "confetti_pop";

export type RacewayModifierKey =
  | "clear_fast"
  | "fresh_bedding"
  | "snack_scent"
  | "crowd_roar"
  | "low_grip"
  | "tunnel_traffic"
  | "spotlight_glare"
  | "nap_weather";

export type RacewayStats = {
  speed: number;
  stamina: number;
  cornering: number;
  focus: number;
  courage: number;
};

export type RacewayEntrant = {
  id: string;
  name?: string;
  stats: RacewayStats;
  trackBiasBps?: number;
  conditionBiasBps?: number;
  injectedEffectBps?: number;
  randomEffectBps?: number;
};

export type RacewayBet = {
  id: string;
  walletAddress: string;
  racerId: string;
  stakeMicrowtf: bigint | number;
};

export const GUINEA_PIG_RACEWAY_RULES = {
  version: "2026-05-08.guinea-pig-raceway-v0",
  wagerAsset: "WTF",
  minRacers: 5,
  maxRacers: 8,
  minBetMicrowtf: 5_000_000,
  houseTakeBps: 500,
  winnerPoolBps: 9_500,
  perRacerWinFloorBps: 250,
  maxSingleRacerWinBps: 4_500,
  maxTrackConditionSwingBps: 1_500,
  maxInjectedEffectSwingBps: 1_200,
  maxRandomEffectSwingBps: 1_800,
  bettingOpenSeconds: 90,
  bettingLockoutSeconds: 20,
  introMarksSeconds: 30,
  raceSeconds: 75,
  replaySeconds: 60,
  raceLoopTargetSeconds: 275,
  effectCooldownSeconds: 8,
  maxEffectsPerWalletPerRace: 3,
  maxEffectsPerRacerPerRace: 6,
  replayCameraAngles: [
    "broadcast_follow",
    "finish_line",
    "lane_low",
    "overhead_tactical",
    "winner_closeup",
  ],
  modelRequirements: {
    format: "glb",
    rig: "lightweight quadruped rig with idle, take_marks, sprint, stumble, nibble, cheer, victory, and loss loops",
    maxTrianglesPerRacer: 8_000,
    maxTextureSize: 1_024,
    lods: ["close", "mid", "far"],
  },
  defaultRacerStable: [
    {
      id: "miso-missile",
      displayName: "Miso Missile",
      modelVariant: "copper_abyssinian",
      coat: "copper rosette",
      laneStyle: "explosive starter with dramatic corner leans",
      stats: { speed: 92, stamina: 61, cornering: 74, focus: 58, courage: 71 },
      scoutingReport: "Fast enough to scare the tote board, but snack scent can break focus.",
    },
    {
      id: "pickle-jet",
      displayName: "Pickle Jet",
      modelVariant: "silver_crested",
      coat: "silver crest",
      laneStyle: "smooth rail runner",
      stats: { speed: 76, stamina: 86, cornering: 82, focus: 78, courage: 68 },
      scoutingReport: "A grinder who gets louder after halfway and loves longer tracks.",
    },
    {
      id: "button-biscuit",
      displayName: "Button Biscuit",
      modelVariant: "black_white_teddy",
      coat: "black and white teddy",
      laneStyle: "low center of gravity, big final push",
      stats: { speed: 63, stamina: 92, cornering: 69, focus: 86, courage: 73 },
      scoutingReport: "Never flashy, rarely finished, terrifying in messy conditions.",
    },
    {
      id: "waffle-thunder",
      displayName: "Waffle Thunder",
      modelVariant: "golden_satin",
      coat: "golden satin",
      laneStyle: "wide arcs and fearless traffic dives",
      stats: { speed: 84, stamina: 68, cornering: 58, focus: 64, courage: 94 },
      scoutingReport: "Chaos-friendly sprinter with comeback teeth in crowded fields.",
    },
    {
      id: "nori-nova",
      displayName: "Nori Nova",
      modelVariant: "charcoal_sheltie",
      coat: "charcoal sheltie",
      laneStyle: "patient drafting specialist",
      stats: { speed: 70, stamina: 74, cornering: 88, focus: 91, courage: 60 },
      scoutingReport: "Reads traffic well and turns tunnel races into chess with squeaks.",
    },
    {
      id: "hazel-havoc",
      displayName: "Hazel Havoc",
      modelVariant: "hazel_peruvian",
      coat: "hazel peruvian",
      laneStyle: "high-variance charge-and-pause racer",
      stats: { speed: 79, stamina: 59, cornering: 71, focus: 49, courage: 96 },
      scoutingReport: "A perfect underdog profile: fearless, messy, and never fully priced in.",
    },
    {
      id: "mochi-moon",
      displayName: "Mochi Moon",
      modelVariant: "cream_coronet",
      coat: "cream coronet",
      laneStyle: "steady outside-lane cruiser",
      stats: { speed: 58, stamina: 89, cornering: 79, focus: 88, courage: 66 },
      scoutingReport: "Slow to wake, hard to shake, excellent on slick surfaces.",
    },
    {
      id: "kimchi-comet",
      displayName: "Kimchi Comet",
      modelVariant: "red_smooth",
      coat: "red smooth",
      laneStyle: "pure pace with little respect for caution",
      stats: { speed: 96, stamina: 54, cornering: 62, focus: 55, courage: 82 },
      scoutingReport: "Top-end rocket. If the race gets strange, the door opens behind them.",
    },
  ],
  tracks: [
    {
      key: "cloverleaf_classic",
      label: "Cloverleaf Classic",
      lengthMeters: 42,
      laneCount: 8,
      surface: "felt_and_clover",
      statBiases: { speed: 250, stamina: 150, cornering: 300, focus: 0, courage: 0 },
      replayAngles: ["broadcast_follow", "overhead_tactical", "finish_line"],
    },
    {
      key: "tunnel_turnpike",
      label: "Tunnel Turnpike",
      lengthMeters: 38,
      laneCount: 6,
      surface: "tube_maze",
      statBiases: { speed: 0, stamina: 100, cornering: 450, focus: 250, courage: 150 },
      replayAngles: ["lane_low", "overhead_tactical", "winner_closeup"],
    },
    {
      key: "snack_bowl_speedway",
      label: "Snack Bowl Speedway",
      lengthMeters: 48,
      laneCount: 8,
      surface: "wide_bank",
      statBiases: { speed: 450, stamina: 200, cornering: 0, focus: -100, courage: 100 },
      replayAngles: ["broadcast_follow", "finish_line", "winner_closeup"],
    },
    {
      key: "hay_bale_chicane",
      label: "Hay Bale Chicane",
      lengthMeters: 44,
      laneCount: 7,
      surface: "tight_chicane",
      statBiases: { speed: -100, stamina: 150, cornering: 500, focus: 200, courage: 0 },
      replayAngles: ["lane_low", "overhead_tactical", "finish_line"],
    },
    {
      key: "moonlight_boardwalk",
      label: "Moonlight Boardwalk",
      lengthMeters: 52,
      laneCount: 8,
      surface: "glossy_boardwalk",
      statBiases: { speed: 200, stamina: 350, cornering: -50, focus: 250, courage: 200 },
      replayAngles: ["broadcast_follow", "lane_low", "winner_closeup"],
    },
  ],
  conditionModifiers: [
    { key: "clear_fast", label: "Clear and fast", modifierBps: 250 },
    { key: "fresh_bedding", label: "Fresh bedding", modifierBps: 100 },
    { key: "snack_scent", label: "Snack scent", modifierBps: 350 },
    { key: "crowd_roar", label: "Crowd roar", modifierBps: -150 },
    { key: "low_grip", label: "Low grip", modifierBps: -300 },
    { key: "tunnel_traffic", label: "Tunnel traffic", modifierBps: -250 },
    { key: "spotlight_glare", label: "Spotlight glare", modifierBps: -200 },
    { key: "nap_weather", label: "Nap weather", modifierBps: -400 },
  ],
  globalVariableBands: [
    { key: "trackGrip", minBps: -400, maxBps: 400 },
    { key: "crowdNoise", minBps: -300, maxBps: 300 },
    { key: "snackDensity", minBps: -250, maxBps: 450 },
    { key: "cameraDroneWash", minBps: -250, maxBps: 150 },
    { key: "tunnelDraft", minBps: -200, maxBps: 300 },
  ],
  injectedEffects: [
    {
      key: "snack_toss",
      label: "Snack Toss",
      costMicrowtf: 2_000_000,
      target: "boost_target",
      durationSeconds: 4,
      effectBps: 450,
    },
    {
      key: "squeaky_distraction",
      label: "Squeaky Distraction",
      costMicrowtf: 3_000_000,
      target: "slow_target",
      durationSeconds: 3,
      effectBps: -350,
    },
    {
      key: "tunnel_rumor",
      label: "Tunnel Shortcut Rumor",
      costMicrowtf: 4_000_000,
      target: "variance_target",
      durationSeconds: 5,
      effectBps: 250,
    },
    {
      key: "fan_chant",
      label: "Fan Chant",
      costMicrowtf: 2_500_000,
      target: "boost_target",
      durationSeconds: 6,
      effectBps: 300,
    },
    {
      key: "confetti_pop",
      label: "Confetti Pop",
      costMicrowtf: 3_500_000,
      target: "field_shuffle",
      durationSeconds: 2,
      effectBps: -250,
    },
  ],
  randomEffects: [
    { key: "zoomies", label: "Zoomies burst", maxSwingBps: 700 },
    { key: "mid_lane_snack", label: "Mid-lane snack pause", maxSwingBps: -650 },
    { key: "tiny_comeback", label: "Tiny comeback line", maxSwingBps: 550 },
    { key: "photo_finish_wobble", label: "Photo-finish wobble", maxSwingBps: 450 },
    { key: "nap_fakeout", label: "Nap fakeout", maxSwingBps: -550 },
  ],
  contractEntrypointsNeeded: [
    "open_race",
    "place_bet",
    "lock_betting",
    "resolve_bet",
    "inject_effect",
    "publish_randomness_commitment",
    "reveal_randomness_seed",
    "settle_race",
    "claim_payout",
    "record_replay_manifest",
  ],
} as const;

function integer(value: number, name: string): number {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${name} must be an integer`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  integer(value, name);
  if (value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
  return value;
}

function positiveInteger(value: number, name: string): number {
  integer(value, name);
  if (value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function scoreStat(value: number, name: string): number {
  integer(value, name);
  return clamp(value, 1, 100);
}

export function getRacePhaseAtSecond(second: number): RacewayPhase {
  const elapsed = nonNegativeInteger(second, "second");
  const bettingEnd = GUINEA_PIG_RACEWAY_RULES.bettingOpenSeconds;
  const lockoutEnd = bettingEnd + GUINEA_PIG_RACEWAY_RULES.bettingLockoutSeconds;
  const introEnd = lockoutEnd + GUINEA_PIG_RACEWAY_RULES.introMarksSeconds;
  const raceEnd = introEnd + GUINEA_PIG_RACEWAY_RULES.raceSeconds;

  if (elapsed < bettingEnd) return "betting_open";
  if (elapsed < lockoutEnd) return "betting_lockout";
  if (elapsed < introEnd) return "intro_marks";
  if (elapsed < raceEnd) return "racing";
  return "results_replay";
}

export function canAcceptNewBetAtSecond(second: number): boolean {
  return getRacePhaseAtSecond(second) === "betting_open";
}

export function canInjectEffectAtSecond(second: number): boolean {
  return getRacePhaseAtSecond(second) === "racing";
}

export function getInjectedEffect(key: RacewayEffectKey) {
  return GUINEA_PIG_RACEWAY_RULES.injectedEffects.find((effect) => effect.key === key) ?? null;
}

export function getInjectedEffectCostMicrowtf(key: RacewayEffectKey): number {
  const effect = getInjectedEffect(key);
  if (!effect) throw new RangeError(`Unknown raceway effect: ${key}`);
  return effect.costMicrowtf;
}

export function clampTrackConditionSwingBps(value: number): number {
  return clamp(
    integer(value, "trackConditionSwingBps"),
    -GUINEA_PIG_RACEWAY_RULES.maxTrackConditionSwingBps,
    GUINEA_PIG_RACEWAY_RULES.maxTrackConditionSwingBps
  );
}

export function clampInjectedEffectSwingBps(value: number): number {
  return clamp(
    integer(value, "injectedEffectSwingBps"),
    -GUINEA_PIG_RACEWAY_RULES.maxInjectedEffectSwingBps,
    GUINEA_PIG_RACEWAY_RULES.maxInjectedEffectSwingBps
  );
}

export function clampRandomEffectSwingBps(value: number): number {
  return clamp(
    integer(value, "randomEffectSwingBps"),
    -GUINEA_PIG_RACEWAY_RULES.maxRandomEffectSwingBps,
    GUINEA_PIG_RACEWAY_RULES.maxRandomEffectSwingBps
  );
}

export function calculateStatScore(stats: RacewayStats): number {
  const speed = scoreStat(stats.speed, "speed");
  const stamina = scoreStat(stats.stamina, "stamina");
  const cornering = scoreStat(stats.cornering, "cornering");
  const focus = scoreStat(stats.focus, "focus");
  const courage = scoreStat(stats.courage, "courage");

  return Math.round(
    speed * 0.28 +
      stamina * 0.22 +
      cornering * 0.2 +
      focus * 0.18 +
      courage * 0.12
  );
}

export function calculateRaceWeight(entrant: RacewayEntrant): number {
  const statScore = calculateStatScore(entrant.stats);
  const baseBps = 7_000 + statScore * 60;
  const conditionBps = clampTrackConditionSwingBps(
    (entrant.trackBiasBps ?? 0) + (entrant.conditionBiasBps ?? 0)
  );
  const injectedBps = clampInjectedEffectSwingBps(entrant.injectedEffectBps ?? 0);
  const randomBps = clampRandomEffectSwingBps(entrant.randomEffectBps ?? 0);
  const combinedBps = RACEWAY_BPS + conditionBps + injectedBps + randomBps;
  return Math.max(1, Math.round((baseBps * combinedBps) / RACEWAY_BPS));
}

function allocateDust<T extends { id: string }>(
  rows: Array<T & { amount: number; remainder: bigint }>,
  dust: number,
  maxAmount?: number
): void {
  const priority = [...rows].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    if (a.amount !== b.amount) return b.amount - a.amount;
    return a.id.localeCompare(b.id);
  });
  for (const row of priority) {
    if (dust <= 0) break;
    if (maxAmount != null && row.amount >= maxAmount) continue;
    row.amount += 1;
    dust -= 1;
  }
}

export function buildWinProbabilityBps<T extends RacewayEntrant>(
  entrants: T[]
): Array<T & { weight: number; winProbabilityBps: number }> {
  if (
    entrants.length < GUINEA_PIG_RACEWAY_RULES.minRacers ||
    entrants.length > GUINEA_PIG_RACEWAY_RULES.maxRacers
  ) {
    throw new RangeError(
      `Raceway requires ${GUINEA_PIG_RACEWAY_RULES.minRacers}-${GUINEA_PIG_RACEWAY_RULES.maxRacers} racers`
    );
  }

  const floor = GUINEA_PIG_RACEWAY_RULES.perRacerWinFloorBps;
  const ceiling = GUINEA_PIG_RACEWAY_RULES.maxSingleRacerWinBps;
  const remaining = RACEWAY_BPS - floor * entrants.length;
  if (remaining < 1) {
    throw new RangeError("Raceway probability floor leaves no allocatable probability");
  }

  const weighted = entrants.map((entrant, index) => ({
    ...entrant,
    index,
    weight: calculateRaceWeight(entrant),
  }));
  const totalWeight = weighted.reduce((sum, entrant) => sum + BigInt(entrant.weight), 0n);

  const rows = weighted.map((entrant) => {
    const numerator = BigInt(remaining) * BigInt(entrant.weight);
    return {
      ...entrant,
      amount: floor + Number(numerator / totalWeight),
      remainder: numerator % totalWeight,
    };
  });
  allocateDust(rows, RACEWAY_BPS - rows.reduce((sum, row) => sum + row.amount, 0));

  let overflow = 0;
  for (const row of rows) {
    if (row.amount > ceiling) {
      overflow += row.amount - ceiling;
      row.amount = ceiling;
    }
  }

  while (overflow > 0) {
    const eligible = rows.filter((row) => row.amount < ceiling);
    if (!eligible.length) break;
    const before = overflow;
    for (const row of eligible) {
      if (overflow <= 0) break;
      row.amount += 1;
      overflow -= 1;
    }
    if (overflow === before) break;
  }

  return rows
    .sort((a, b) => a.index - b.index)
    .map((row) => {
      const { amount, remainder, index, ...entrant } = row;
      void remainder;
      void index;
      return {
        ...entrant,
        winProbabilityBps: amount,
      } as T & { weight: number; winProbabilityBps: number };
    });
}

export function splitRacePoolMicrowtf(totalBetMicrowtf: bigint | number): {
  totalBetMicrowtf: bigint;
  houseTakeMicrowtf: bigint;
  winnerPoolMicrowtf: bigint;
} {
  const total = BigInt(totalBetMicrowtf);
  if (total < 0n) throw new RangeError("totalBetMicrowtf must be non-negative");
  const houseTake =
    (total * BigInt(GUINEA_PIG_RACEWAY_RULES.houseTakeBps)) / BigInt(RACEWAY_BPS);
  return {
    totalBetMicrowtf: total,
    houseTakeMicrowtf: houseTake,
    winnerPoolMicrowtf: total - houseTake,
  };
}

export function calculateRacePayouts<T extends RacewayBet>(input: {
  winningRacerId: string;
  bets: T[];
}): {
  houseTakeMicrowtf: bigint;
  winnerPoolMicrowtf: bigint;
  carryoverMicrowtf: bigint;
  payouts: Array<T & { payoutMicrowtf: bigint }>;
} {
  const total = input.bets.reduce((sum, bet) => sum + BigInt(bet.stakeMicrowtf), 0n);
  const split = splitRacePoolMicrowtf(total);
  const winners = input.bets.filter((bet) => bet.racerId === input.winningRacerId);
  const winningStake = winners.reduce((sum, bet) => sum + BigInt(bet.stakeMicrowtf), 0n);
  if (split.winnerPoolMicrowtf <= 0n || winningStake <= 0n) {
    return {
      houseTakeMicrowtf: split.houseTakeMicrowtf,
      winnerPoolMicrowtf: split.winnerPoolMicrowtf,
      carryoverMicrowtf: split.winnerPoolMicrowtf,
      payouts: input.bets.map((bet) => ({ ...bet, payoutMicrowtf: 0n })),
    };
  }

  const rows = input.bets.map((bet, index) => {
    if (bet.racerId !== input.winningRacerId) {
      return { bet, index, payoutMicrowtf: 0n, remainder: 0n };
    }
    const numerator = split.winnerPoolMicrowtf * BigInt(bet.stakeMicrowtf);
    return {
      bet,
      index,
      payoutMicrowtf: numerator / winningStake,
      remainder: numerator % winningStake,
    };
  });

  let dust = split.winnerPoolMicrowtf - rows.reduce((sum, row) => sum + row.payoutMicrowtf, 0n);
  const priority = [...rows]
    .filter((row) => row.bet.racerId === input.winningRacerId)
    .sort((a, b) => {
      if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
      const stakeA = BigInt(a.bet.stakeMicrowtf);
      const stakeB = BigInt(b.bet.stakeMicrowtf);
      if (stakeA !== stakeB) return stakeA > stakeB ? -1 : 1;
      return a.bet.id.localeCompare(b.bet.id);
    });
  for (const row of priority) {
    if (dust <= 0n) break;
    row.payoutMicrowtf += 1n;
    dust -= 1n;
  }

  return {
    houseTakeMicrowtf: split.houseTakeMicrowtf,
    winnerPoolMicrowtf: split.winnerPoolMicrowtf,
    carryoverMicrowtf: 0n,
    payouts: rows
      .sort((a, b) => a.index - b.index)
      .map((row) => ({ ...row.bet, payoutMicrowtf: row.payoutMicrowtf })),
  };
}

export function canWalletUseRaceEffect(input: {
  priorEffectsByWallet: number;
  priorEffectsOnRacer: number;
  secondsSinceLastEffectByWallet: number | null;
}): boolean {
  const walletCount = nonNegativeInteger(input.priorEffectsByWallet, "priorEffectsByWallet");
  const racerCount = nonNegativeInteger(input.priorEffectsOnRacer, "priorEffectsOnRacer");
  if (walletCount >= GUINEA_PIG_RACEWAY_RULES.maxEffectsPerWalletPerRace) return false;
  if (racerCount >= GUINEA_PIG_RACEWAY_RULES.maxEffectsPerRacerPerRace) return false;
  if (input.secondsSinceLastEffectByWallet == null) return true;
  return (
    nonNegativeInteger(input.secondsSinceLastEffectByWallet, "secondsSinceLastEffectByWallet") >=
    GUINEA_PIG_RACEWAY_RULES.effectCooldownSeconds
  );
}

export function selectRacewayTrack(seed: string) {
  if (!seed.trim()) throw new RangeError("seed is required");
  const hash = [...seed].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return GUINEA_PIG_RACEWAY_RULES.tracks[hash % GUINEA_PIG_RACEWAY_RULES.tracks.length];
}

export function createRaceUniquenessProfile(input: {
  raceId: string;
  trackKey: string;
  conditionKeys: RacewayModifierKey[];
  globalVariableBps: Record<string, number>;
  racerIds: string[];
}): string {
  positiveInteger(input.racerIds.length, "racerIds.length");
  const conditions = [...input.conditionKeys].sort().join(",");
  const globals = Object.entries(input.globalVariableBps)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${integer(value, key)}`)
    .join(",");
  const racers = [...input.racerIds].sort().join(",");
  return `${input.raceId}|${input.trackKey}|${conditions}|${globals}|${racers}`;
}
