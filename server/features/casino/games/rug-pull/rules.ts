export const RUG_PULL_GAME_KEY = "rug-pull";
export const BPS = 10_000;
export const MICROSHARES_PER_SHARE = 1_000_000;

export type RugPullPaymentKind = "join" | "press" | "witness";
export type RugPullPanicModifier = "none" | "mercy" | "cruelty" | "silence";

export const RUG_PULL_RULES = {
  version: "2026-05-08.rug-pull-v0",
  entryFeeMutez: 5_000_000,
  entryPotMutez: 4_000_000,
  entryPlatformMutez: 1_000_000,
  pressFeeMutez: 5_000_000,
  pressNextPotMutez: 4_000_000,
  pressPlatformMutez: 1_000_000,
  witnessFeeMutez: 250_000,
  witnessPotMutez: 200_000,
  witnessPlatformMutez: 50_000,
  joinButtonLockSeconds: 45,
  delayLockSeconds: 15,
  maxButtonLockFromNowSeconds: 45,
  panicSeconds: 30,
  baseShareMicrosharesPerSecond: MICROSHARES_PER_SHARE,
  panicLossMicrosharesPerSecond: MICROSHARES_PER_SHARE,
  delayCostMutezByUse: [1_000_000, 2_000_000, 3_000_000, 5_000_000, 8_000_000],
  joinOrderMultipliers: [
    { fromJoinOrder: 1, toJoinOrder: 1, multiplierBps: 10_000 },
    { fromJoinOrder: 2, toJoinOrder: 2, multiplierBps: 11_500 },
    { fromJoinOrder: 3, toJoinOrder: 3, multiplierBps: 13_000 },
    { fromJoinOrder: 4, toJoinOrder: 4, multiplierBps: 14_500 },
    { fromJoinOrder: 5, toJoinOrder: 5, multiplierBps: 16_000 },
    { fromJoinOrder: 6, toJoinOrder: null, multiplierBps: 17_500 },
  ],
  pressureMultipliers: [
    { fromSecond: 0, toSecond: 45, multiplierBps: 10_000 },
    { fromSecond: 45, toSecond: 90, multiplierBps: 12_000 },
    { fromSecond: 90, toSecond: 135, multiplierBps: 14_000 },
    { fromSecond: 135, toSecond: 180, multiplierBps: 16_000 },
    { fromSecond: 180, toSecond: null, multiplierBps: 18_000 },
  ],
  witnessVoteOptions: [
    { key: "mercy", label: "Mercy", panicLossMultiplierBps: 5_000, disablesDelaySeconds: 0 },
    { key: "cruelty", label: "Cruelty", panicLossMultiplierBps: 15_000, disablesDelaySeconds: 0 },
    { key: "silence", label: "Silence", panicLossMultiplierBps: 10_000, disablesDelaySeconds: 15 },
  ],
  contractEntrypointsNeeded: [
    "join_round",
    "delay_button",
    "press_button",
    "join_witness",
    "vote_witness_modifier",
    "settle_round",
  ],
} as const;

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
  return value;
}

export function getJoinOrderMultiplierBps(joinOrder: number): number {
  positiveInteger(joinOrder, "joinOrder");
  const band = RUG_PULL_RULES.joinOrderMultipliers.find((candidate) => {
    const upper = candidate.toJoinOrder ?? Number.POSITIVE_INFINITY;
    return joinOrder >= candidate.fromJoinOrder && joinOrder <= upper;
  });
  return band?.multiplierBps ?? 10_000;
}

export function getPressureMultiplierBps(secondsSinceRoundStart: number): number {
  nonNegativeInteger(secondsSinceRoundStart, "secondsSinceRoundStart");
  const band = RUG_PULL_RULES.pressureMultipliers.find((candidate) => {
    const upper = candidate.toSecond ?? Number.POSITIVE_INFINITY;
    return secondsSinceRoundStart >= candidate.fromSecond && secondsSinceRoundStart < upper;
  });
  return band?.multiplierBps ?? 18_000;
}

export function getShareRateMicrosharesPerSecond(input: {
  joinOrder: number;
  secondsSinceRoundStart: number;
}): bigint {
  const joinBps = BigInt(getJoinOrderMultiplierBps(input.joinOrder));
  const pressureBps = BigInt(getPressureMultiplierBps(input.secondsSinceRoundStart));
  return (
    (BigInt(MICROSHARES_PER_SHARE) * joinBps * pressureBps) /
    BigInt(BPS * BPS)
  );
}

export function calculateEarnedMicroshares(input: {
  joinOrder: number;
  fromRoundSecond: number;
  toRoundSecond: number;
}): bigint {
  positiveInteger(input.joinOrder, "joinOrder");
  const from = nonNegativeInteger(input.fromRoundSecond, "fromRoundSecond");
  const to = nonNegativeInteger(input.toRoundSecond, "toRoundSecond");
  if (to <= from) return 0n;

  const joinBps = BigInt(getJoinOrderMultiplierBps(input.joinOrder));
  let earned = 0n;
  for (const band of RUG_PULL_RULES.pressureMultipliers) {
    const bandEnd = band.toSecond ?? to;
    const segmentStart = Math.max(from, band.fromSecond);
    const segmentEnd = Math.min(to, bandEnd);
    if (segmentEnd <= segmentStart) continue;
    earned +=
      (BigInt(segmentEnd - segmentStart) *
        BigInt(MICROSHARES_PER_SHARE) *
        joinBps *
        BigInt(band.multiplierBps)) /
      BigInt(BPS * BPS);
  }
  return earned;
}

export function getDelayCostMutezForNextUse(priorDelayCountForPlayer: number): number | null {
  nonNegativeInteger(priorDelayCountForPlayer, "priorDelayCountForPlayer");
  return RUG_PULL_RULES.delayCostMutezByUse[priorDelayCountForPlayer] ?? null;
}

export function canWalletCauseButtonLock(input: {
  walletAddress: string;
  lastLockWalletAddress: string | null;
}): boolean {
  const wallet = input.walletAddress.trim().toLowerCase();
  const last = input.lastLockWalletAddress?.trim().toLowerCase() ?? "";
  return Boolean(wallet) && wallet !== last;
}

export function computeDelayLockUntilSecond(input: {
  nowSecond: number;
  currentLockUntilSecond: number;
}): number {
  const nowSecond = nonNegativeInteger(input.nowSecond, "nowSecond");
  const currentLockUntilSecond = nonNegativeInteger(
    input.currentLockUntilSecond,
    "currentLockUntilSecond"
  );
  const extensionStart = Math.max(nowSecond, currentLockUntilSecond);
  return Math.min(
    extensionStart + RUG_PULL_RULES.delayLockSeconds,
    nowSecond + RUG_PULL_RULES.maxButtonLockFromNowSeconds
  );
}

export function getPanicLossMultiplierBps(modifier: RugPullPanicModifier): number {
  if (modifier === "mercy") return 5_000;
  if (modifier === "cruelty") return 15_000;
  return 10_000;
}

export function calculatePanicRemainingMicroshares(input: {
  startingMicroshares: bigint;
  elapsedPanicSeconds: number;
  modifier: RugPullPanicModifier;
}): bigint {
  const elapsed = nonNegativeInteger(input.elapsedPanicSeconds, "elapsedPanicSeconds");
  const lossPerSecond =
    (BigInt(RUG_PULL_RULES.panicLossMicrosharesPerSecond) *
      BigInt(getPanicLossMultiplierBps(input.modifier))) /
    BigInt(BPS);
  const loss = BigInt(elapsed) * lossPerSecond;
  return input.startingMicroshares > loss ? input.startingMicroshares - loss : 0n;
}

export function splitRugPullPayment(kind: RugPullPaymentKind): {
  totalMutez: number;
  potMutez: number;
  platformMutez: number;
} {
  if (kind === "witness") {
    return {
      totalMutez: RUG_PULL_RULES.witnessFeeMutez,
      potMutez: RUG_PULL_RULES.witnessPotMutez,
      platformMutez: RUG_PULL_RULES.witnessPlatformMutez,
    };
  }
  if (kind === "press") {
    return {
      totalMutez: RUG_PULL_RULES.pressFeeMutez,
      potMutez: RUG_PULL_RULES.pressNextPotMutez,
      platformMutez: RUG_PULL_RULES.pressPlatformMutez,
    };
  }
  return {
    totalMutez: RUG_PULL_RULES.entryFeeMutez,
    potMutez: RUG_PULL_RULES.entryPotMutez,
    platformMutez: RUG_PULL_RULES.entryPlatformMutez,
  };
}

export function calculatePayouts<T extends { id: string; finalMicroshares: bigint }>(input: {
  potMutez: bigint | number;
  participants: T[];
}): Array<T & { payoutMutez: bigint }> {
  const potMutez = BigInt(input.potMutez);
  const totalShares = input.participants.reduce(
    (sum, participant) => sum + participant.finalMicroshares,
    0n
  );
  if (potMutez <= 0n || totalShares <= 0n) {
    return input.participants.map((participant) => ({ ...participant, payoutMutez: 0n }));
  }

  const rows = input.participants.map((participant, index) => {
    const numerator = potMutez * participant.finalMicroshares;
    return {
      participant,
      index,
      payoutMutez: numerator / totalShares,
      remainder: numerator % totalShares,
    };
  });

  let dust = potMutez - rows.reduce((sum, row) => sum + row.payoutMutez, 0n);
  const priority = [...rows].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    if (a.participant.finalMicroshares !== b.participant.finalMicroshares) {
      return a.participant.finalMicroshares > b.participant.finalMicroshares ? -1 : 1;
    }
    return a.participant.id.localeCompare(b.participant.id);
  });
  for (const row of priority) {
    if (dust <= 0n) break;
    row.payoutMutez += 1n;
    dust -= 1n;
  }

  return rows
    .sort((a, b) => a.index - b.index)
    .map((row) => ({
      ...row.participant,
      payoutMutez: row.payoutMutez,
    }));
}
