import {
  allButtonsIdle,
  calculatePressCost,
  createButtonRound,
  createWtfButtonGameState,
  DAY_SECONDS,
  formatMutez,
  getRottenness,
  getRoundState,
  HOUR_SECONDS,
  MUTEZ_PER_XTZ,
  maybeRestartButton,
  pressButton,
  quotePress,
  resolveClash,
  secondsRemaining,
  settleRound,
  type WtfButtonGameState,
  type WtfButtonId,
  type WtfButtonPressResult,
  type WtfButtonUser,
  type WtfButtonWinnerHistoryEntry,
} from "./rules";

export type WtfButtonSimulationArchetype =
  | "casual"
  | "sniper"
  | "degen"
  | "conservative"
  | "rival";

export type WtfButtonSimulationOptions = {
  users?: number;
  startingBalanceMutez?: bigint;
  seed?: string;
  maxSimulatedDays?: number;
  stepSeconds?: number;
  archetypeDistribution?: Partial<Record<WtfButtonSimulationArchetype, number>>;
};

export type WtfButtonSimulationUser = WtfButtonUser & {
  archetype: WtfButtonSimulationArchetype;
};

export type WtfButtonSimulationRoundReport = {
  buttonId: WtfButtonId;
  roundId: string;
  kind: WtfButtonWinnerHistoryEntry["kind"];
  winnerWalletId: string | null;
  payoutMutez: string;
  refundMutez: string;
  wtfTotalMutez: string;
  potMutez: string;
  durationSeconds: number;
  totalPresses: number;
  uniquePressers: number;
  rugClashes: number;
  cameFromRugClash: boolean;
};

export type WtfButtonSimulationReport = {
  seed: string;
  endedBecause: "all_three_idle" | "max_days";
  totalExperimentDurationSeconds: number;
  completedRounds: number;
  winners: number;
  uniqueWinners: number;
  refundedNoContestRounds: number;
  totalWtfReceivedMutez: string;
  totalPaidByUsersMutez: string;
  finalUserBalancesMutez: Record<string, string>;
  perButtonStats: Record<
    WtfButtonId,
    {
      completedRounds: number;
      noContestRounds: number;
      averageRoundLengthSeconds: number;
      averagePresses: number;
      averageUniquePressers: number;
      rugClashes: number;
    }
  >;
  perStartDurationStats: Record<
    string,
    {
      rounds: number;
      averageRoundLengthSeconds: number;
      averagePresses: number;
      averageUniquePressers: number;
    }
  >;
  winnerPayoutsMutez: string[];
  wtfReceivedPerRoundMutez: string[];
  potSizePerRoundMutez: string[];
  clashCountPerRound: number[];
  totalRugClashes: number;
  clashWinnerDifferedFromFirstEntrant: number;
  dominatedByOnePlayer: boolean;
  antiSnowballBlocks: number;
  rounds: WtfButtonSimulationRoundReport[];
  textReport: string;
};

const ARCHETYPES: WtfButtonSimulationArchetype[] = [
  "casual",
  "sniper",
  "degen",
  "conservative",
  "rival",
];

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function chooseArchetype(
  random: () => number,
  distribution: Partial<Record<WtfButtonSimulationArchetype, number>>
): WtfButtonSimulationArchetype {
  const weights = ARCHETYPES.map((archetype) => ({
    archetype,
    weight: distribution[archetype] ?? 1,
  })).filter((entry) => entry.weight > 0);
  const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (const entry of weights) {
    roll -= entry.weight;
    if (roll <= 0) return entry.archetype;
  }
  return weights[weights.length - 1]?.archetype ?? "casual";
}

function buildSimulationUsers(
  count: number,
  random: () => number,
  distribution: Partial<Record<WtfButtonSimulationArchetype, number>>
): WtfButtonSimulationUser[] {
  return Array.from({ length: count }, (_, index) => {
    const id = `sim-wallet-${String(index + 1).padStart(2, "0")}`;
    return {
      walletId: id,
      displayName: `Sim ${index + 1}`,
      archetype: chooseArchetype(random, distribution),
    };
  });
}

function initializeSimulationState(
  nowMs: number,
  users: WtfButtonSimulationUser[],
  startingBalanceMutez: bigint
): WtfButtonGameState {
  const balances = Object.fromEntries(users.map((user) => [user.walletId, startingBalanceMutez]));
  const state = createWtfButtonGameState(nowMs, balances);
  state.buttons.red = createButtonRound("red", nowMs, {
    startDurationSeconds: 12 * HOUR_SECONDS,
    roundId: `red-${nowMs}-sim-12h`,
  });
  state.buttons.green = createButtonRound("green", nowMs, {
    startDurationSeconds: 24 * HOUR_SECONDS,
    roundId: `green-${nowMs}-sim-24h`,
  });
  state.buttons.blue = createButtonRound("blue", nowMs, {
    startDurationSeconds: 48 * HOUR_SECONDS,
    roundId: `blue-${nowMs}-sim-48h`,
  });
  return state;
}

function pressProbability(input: {
  state: WtfButtonGameState;
  buttonId: WtfButtonId;
  user: WtfButtonSimulationUser;
  nowMs: number;
  random: () => number;
}): number {
  const round = input.state.buttons[input.buttonId];
  const roundState = getRoundState(round, input.nowMs);
  if (roundState !== "active" && roundState !== "danger_zone" && roundState !== "clash") {
    return 0;
  }
  if (round.leaderWalletId === input.user.walletId) return 0;
  const cost = calculatePressCost(round, input.user, input.nowMs);
  const balance = input.state.balances[input.user.walletId] ?? 0n;
  if (balance < cost) return 0;

  const potToCost = Number(round.potMutez + MUTEZ_PER_XTZ) / Math.max(1, Number(cost));
  const remaining = secondsRemaining(round, input.nowMs);
  const rotten = getRottenness(round, input.nowMs);
  const priorPresses = round.participants[input.user.walletId]?.presses ?? 0;
  let probability = 0;

  if (input.user.archetype === "casual") {
    probability = potToCost > 4 && remaining < 2 * HOUR_SECONDS ? 0.05 : 0.004;
    if (priorPresses > 1) probability *= 0.35;
  } else if (input.user.archetype === "sniper") {
    probability = remaining <= 60 ? 0.5 : remaining < 10 * MINUTE_LITE ? 0.08 : 0.001;
  } else if (input.user.archetype === "degen") {
    probability = potToCost > 2.2 ? 0.08 : 0.01;
    if (priorPresses > 3) probability *= 0.5;
  } else if (input.user.archetype === "conservative") {
    probability = potToCost > 7 && cost <= 1_500_000n && rotten !== "rotten" ? 0.035 : 0.001;
  } else {
    const leaderBalance = round.leaderWalletId
      ? input.state.balances[round.leaderWalletId] ?? 0n
      : 0n;
    probability = potToCost > 3 && leaderBalance > balance ? 0.07 : 0.01;
  }

  if (roundState === "danger_zone") probability *= 5;
  if (roundState === "clash") probability *= input.user.archetype === "sniper" ? 6 : 2.5;
  if (remaining < 10 * 60) probability *= 1.8;
  if (rotten === "stale") probability *= input.user.archetype === "degen" ? 0.8 : 0.45;
  if (rotten === "rotten") probability *= input.user.archetype === "degen" ? 0.5 : 0.18;
  if (priorPresses > 0) probability *= Math.max(0.18, 1 - priorPresses * 0.18);
  if (cost > balance / 6n) probability *= 0.45;
  return Math.max(0, Math.min(0.9, probability));
}

const MINUTE_LITE = 60;

function maybePress(input: {
  state: WtfButtonGameState;
  buttonId: WtfButtonId;
  user: WtfButtonSimulationUser;
  nowMs: number;
  random: () => number;
  seed: string;
}): WtfButtonPressResult | null {
  const probability = pressProbability(input);
  if (input.random() > probability) return null;
  const quote = quotePress(input.state, input.buttonId, input.user, input.nowMs, "flexible", 100_000n);
  if (!quote.canPress) return null;
  return pressButton(input.state, input.buttonId, input.user, quote, input.nowMs);
}

function advanceTimedState(input: {
  state: WtfButtonGameState;
  nowMs: number;
  seed: string;
  settledRecords: WtfButtonWinnerHistoryEntry[];
  stats: { clashWinnerDifferedFromFirstEntrant: number };
}) {
  let state = input.state;
  for (const buttonId of Object.keys(state.buttons) as WtfButtonId[]) {
    const round = state.buttons[buttonId];
    const unresolved = round.rugClashHistory.find(
      (clash) => clash.resolvedAtMs === null && clash.endsAtMs <= input.nowMs
    );
    if (unresolved) {
      const result = resolveClash(state, buttonId, input.nowMs, input.seed);
      state = result.state;
      if (
        result.resolved &&
        result.clash.firstEntrantWalletId &&
        result.clash.selectedWalletId &&
        result.clash.firstEntrantWalletId !== result.clash.selectedWalletId
      ) {
        input.stats.clashWinnerDifferedFromFirstEntrant += 1;
      }
    }
    const afterClash = state.buttons[buttonId];
    if (
      afterClash.currentState !== "idle" &&
      afterClash.currentState !== "cooling_down" &&
      afterClash.countdownEndMs <= input.nowMs
    ) {
      const settlement = settleRound(state, buttonId, input.nowMs);
      state = settlement.state;
      if (settlement.settled) input.settledRecords.push(settlement.record);
    }
    const restart = maybeRestartButton(state, buttonId, input.nowMs);
    state = restart.state;
  }
  return state;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function serializeRound(record: WtfButtonWinnerHistoryEntry): WtfButtonSimulationRoundReport {
  return {
    buttonId: record.buttonId,
    roundId: record.roundId,
    kind: record.kind,
    winnerWalletId: record.winnerWalletId,
    payoutMutez: record.payoutMutez.toString(),
    refundMutez: record.refundMutez.toString(),
    wtfTotalMutez: record.wtfTotalMutez.toString(),
    potMutez: (record.payoutMutez + record.refundMutez + record.settlementFeeMutez).toString(),
    durationSeconds: record.durationSeconds,
    totalPresses: record.totalPresses,
    uniquePressers: record.uniquePressers,
    rugClashes: record.rugClashes,
    cameFromRugClash: record.cameFromRugClash,
  };
}

function buildTextReport(report: Omit<WtfButtonSimulationReport, "textReport">): string {
  const lines = [
    "WTF Button simulation report",
    `Seed: ${report.seed}`,
    `Ended because: ${report.endedBecause}`,
    `Experiment duration: ${(report.totalExperimentDurationSeconds / DAY_SECONDS).toFixed(2)} days`,
    `Completed rounds: ${report.completedRounds}`,
    `Winners: ${report.winners} (${report.uniqueWinners} unique)`,
    `No-contest refunds: ${report.refundedNoContestRounds}`,
    `WTF received: ${formatMutez(BigInt(report.totalWtfReceivedMutez))} XTZ`,
    `Total paid by users: ${formatMutez(BigInt(report.totalPaidByUsersMutez))} XTZ`,
    `Rug Clashes: ${report.totalRugClashes}`,
    `Clash winner differed from first entrant: ${report.clashWinnerDifferedFromFirstEntrant}`,
    `Anti-snowball blocks: ${report.antiSnowballBlocks}`,
    `Dominated by one player: ${report.dominatedByOnePlayer ? "yes" : "no"}`,
  ];
  for (const buttonId of Object.keys(report.perButtonStats) as WtfButtonId[]) {
    const stats = report.perButtonStats[buttonId];
    lines.push(
      `${buttonId.toUpperCase()}: ${stats.completedRounds} rounds, avg ${stats.averagePresses} presses, avg ${stats.averageUniquePressers} users, ${stats.rugClashes} clashes`
    );
  }
  return lines.join("\n");
}

export function runWtfButtonSimulation(
  options: WtfButtonSimulationOptions = {}
): WtfButtonSimulationReport {
  const seed = options.seed ?? "wtf-button-default-seed";
  const random = mulberry32(hashSeed(seed));
  const userCount = options.users ?? 50;
  const startingBalanceMutez = options.startingBalanceMutez ?? 30n * MUTEZ_PER_XTZ;
  const maxSimulatedDays = options.maxSimulatedDays ?? 45;
  const stepSeconds = options.stepSeconds ?? 60;
  const distribution = options.archetypeDistribution ?? {
    casual: 16,
    sniper: 10,
    degen: 10,
    conservative: 8,
    rival: 6,
  };
  const users = buildSimulationUsers(userCount, random, distribution);
  const startMs = 1_760_000_000_000;
  let nowMs = startMs;
  let state = initializeSimulationState(startMs, users, startingBalanceMutez);
  const settledRecords: WtfButtonWinnerHistoryEntry[] = [];
  const stats = { clashWinnerDifferedFromFirstEntrant: 0 };
  const maxMs = startMs + maxSimulatedDays * DAY_SECONDS * 1_000;

  while (nowMs <= maxMs) {
    state = advanceTimedState({ state, nowMs, seed, settledRecords, stats });
    if (allButtonsIdle(state, nowMs)) break;
    const shuffledUsers = [...users].sort(() => random() - 0.5);
    for (const user of shuffledUsers) {
      for (const buttonId of ["red", "green", "blue"] as WtfButtonId[]) {
        const result = maybePress({ state, buttonId, user, nowMs, random, seed });
        if (result) state = result.state;
      }
    }
    nowMs += stepSeconds * 1_000;
  }
  state = advanceTimedState({ state, nowMs, seed, settledRecords, stats });

  const rounds = settledRecords.map(serializeRound);
  const winners = settledRecords.filter((record) => record.kind === "winner_payout");
  const uniqueWinners = new Set(winners.map((record) => record.winnerWalletId).filter(Boolean));
  const payoutByWinner = new Map<string, number>();
  for (const record of winners) {
    if (!record.winnerWalletId) continue;
    payoutByWinner.set(record.winnerWalletId, (payoutByWinner.get(record.winnerWalletId) ?? 0) + 1);
  }
  const topWinnerRounds = Math.max(0, ...payoutByWinner.values());
  const completedRounds = settledRecords.length;
  const perButtonStats = Object.fromEntries(
    (["red", "green", "blue"] as WtfButtonId[]).map((buttonId) => {
      const buttonRounds = settledRecords.filter((record) => record.buttonId === buttonId);
      return [
        buttonId,
        {
          completedRounds: buttonRounds.length,
          noContestRounds: buttonRounds.filter((record) => record.kind === "no_contest_refund").length,
          averageRoundLengthSeconds: average(buttonRounds.map((record) => record.durationSeconds)),
          averagePresses: average(buttonRounds.map((record) => record.totalPresses)),
          averageUniquePressers: average(buttonRounds.map((record) => record.uniquePressers)),
          rugClashes: buttonRounds.reduce((sum, record) => sum + record.rugClashes, 0),
        },
      ];
    })
  ) as WtfButtonSimulationReport["perButtonStats"];

  const perStartDurationStats: WtfButtonSimulationReport["perStartDurationStats"] = {};
  for (const record of settledRecords) {
    const key =
      record.roundId.includes("12h")
        ? "12h"
        : record.roundId.includes("24h")
          ? "24h"
          : record.roundId.includes("48h")
            ? "48h"
            : "6h_trial_restart";
    const bucket = perStartDurationStats[key] ?? {
      rounds: 0,
      averageRoundLengthSeconds: 0,
      averagePresses: 0,
      averageUniquePressers: 0,
    };
    const priorRounds = bucket.rounds;
    bucket.rounds += 1;
    bucket.averageRoundLengthSeconds = Math.round(
      (bucket.averageRoundLengthSeconds * priorRounds + record.durationSeconds) / bucket.rounds
    );
    bucket.averagePresses = Math.round(
      (bucket.averagePresses * priorRounds + record.totalPresses) / bucket.rounds
    );
    bucket.averageUniquePressers = Math.round(
      (bucket.averageUniquePressers * priorRounds + record.uniquePressers) / bucket.rounds
    );
    perStartDurationStats[key] = bucket;
  }

  const totalWtfReceived = state.wtfTreasuryMutez;
  const finalBalanceTotal = Object.values(state.balances).reduce((sum, balance) => sum + balance, 0n);
  const startingTotal = BigInt(userCount) * startingBalanceMutez;
  const totalPaidByUsers = startingTotal > finalBalanceTotal ? startingTotal - finalBalanceTotal : 0n;
  const totalRugClashes = settledRecords.reduce((sum, record) => sum + record.rugClashes, 0);
  const clashWinnerDifferedFromFirstEntrant = stats.clashWinnerDifferedFromFirstEntrant;

  const reportWithoutText: Omit<WtfButtonSimulationReport, "textReport"> = {
    seed,
    endedBecause: allButtonsIdle(state, nowMs) ? "all_three_idle" : "max_days",
    totalExperimentDurationSeconds: Math.floor((nowMs - startMs) / 1_000),
    completedRounds,
    winners: winners.length,
    uniqueWinners: uniqueWinners.size,
    refundedNoContestRounds: settledRecords.filter((record) => record.kind === "no_contest_refund").length,
    totalWtfReceivedMutez: totalWtfReceived.toString(),
    totalPaidByUsersMutez: totalPaidByUsers.toString(),
    finalUserBalancesMutez: Object.fromEntries(
      Object.entries(state.balances).map(([wallet, balance]) => [wallet, balance.toString()])
    ),
    perButtonStats,
    perStartDurationStats,
    winnerPayoutsMutez: winners.map((record) => record.payoutMutez.toString()),
    wtfReceivedPerRoundMutez: settledRecords.map((record) => record.wtfTotalMutez.toString()),
    potSizePerRoundMutez: rounds.map((round) => round.potMutez),
    clashCountPerRound: settledRecords.map((record) => record.rugClashes),
    totalRugClashes,
    clashWinnerDifferedFromFirstEntrant,
    dominatedByOnePlayer:
      winners.length >= 3 && topWinnerRounds / Math.max(1, winners.length) > 0.5,
    antiSnowballBlocks: state.antiSnowballBlocks,
    rounds,
  };

  return {
    ...reportWithoutText,
    textReport: buildTextReport(reportWithoutText),
  };
}
