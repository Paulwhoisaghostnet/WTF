import { createHash } from "node:crypto";

export const WTF_BUTTON_GAME_KEY = "wtf-button";
export const WTF_BUTTON_PUBLIC_TITLE = "WTF Does This Button Do?!!?";
export const WTF_BUTTON_SHORT_NAME = "WTF Button";
export const WTF_BUTTON_ROUTE = "/casino/wtf-button";
export const WTF_BUTTON_BPS = 10_000n;
export const MUTEZ_PER_XTZ = 1_000_000n;
export const SECOND_MS = 1_000;
export const MINUTE_SECONDS = 60;
export const HOUR_SECONDS = 60 * MINUTE_SECONDS;
export const DAY_SECONDS = 24 * HOUR_SECONDS;
export const DANGER_ZONE_SECONDS = 60;
export const RUG_CLASH_SECONDS = 15;
export const TRIAL_COOLDOWN_SECONDS = 3 * HOUR_SECONDS;
export const WINNER_COOLDOWN_SECONDS = 30 * MINUTE_SECONDS;

export type WtfButtonId = "red" | "green" | "blue";
export type WtfButtonColor = "Red" | "Green" | "Blue";
export type WtfButtonRuntimeState =
  | "idle"
  | "active"
  | "danger_zone"
  | "clash"
  | "cooling_down"
  | "settled";
export type WtfButtonRottenness = "fresh" | "warm" | "stale" | "rotten";
export type WtfButtonPriceProtectionMode = "strict" | "flexible";
export type WtfButtonPressOrigin = "normal" | "rug_clash";
export type WtfButtonSettlementKind = "no_contest_refund" | "winner_payout";

export type WtfButtonConfig = {
  id: WtfButtonId;
  color: WtfButtonColor;
  name: string;
  tableName: string;
  startDurationSeconds: number;
  maxRoundAgeSeconds: number;
  maxPressCostMutez: bigint;
  baseTimePowerSeconds: number;
};

export type WtfButtonUser = {
  walletId: string;
  displayName?: string | null;
};

export type WtfButtonParticipant = {
  walletId: string;
  displayName: string;
  presses: number;
  totalPaidMutez: bigint;
  totalPotAddedMutez: bigint;
  totalWtfPaidMutez: bigint;
  lastPressAtMs: number | null;
  lastStatus: "leader" | "challenger" | "clash_entrant" | "cooled_down";
};

export type WtfButtonPressHistoryEntry = {
  id: string;
  buttonId: WtfButtonId;
  roundId: string;
  walletId: string;
  displayName: string;
  atMs: number;
  quotedCostMutez: bigint;
  actualCostMutez: bigint;
  houseCutMutez: bigint;
  potAddMutez: bigint;
  timeAddedSeconds: number;
  previousLeaderWalletId: string | null;
  newLeaderWalletId: string | null;
  origin: WtfButtonPressOrigin;
  event: string;
  clashId?: string;
};

export type WtfButtonClashEntry = {
  walletId: string;
  displayName: string;
  atMs: number;
  actualCostMutez: bigint;
  houseCutMutez: bigint;
  potAddMutez: bigint;
  timeAddedSeconds: number;
  quoteId: string;
};

export type WtfButtonRugClash = {
  id: string;
  roundId: string;
  startedAtMs: number;
  endsAtMs: number;
  entrants: WtfButtonClashEntry[];
  resolvedAtMs: number | null;
  selectedWalletId: string | null;
  selectedTimeAddedSeconds: number | null;
  seedProof: string | null;
  firstEntrantWalletId: string | null;
};

export type WtfButtonWinnerHistoryEntry = {
  roundId: string;
  buttonId: WtfButtonId;
  kind: WtfButtonSettlementKind;
  winnerWalletId: string | null;
  winnerDisplayName: string | null;
  payoutMutez: bigint;
  refundMutez: bigint;
  settlementFeeMutez: bigint;
  wtfTotalMutez: bigint;
  durationSeconds: number;
  totalPresses: number;
  uniquePressers: number;
  rugClashes: number;
  cameFromRugClash: boolean;
  settledAtMs: number;
};

export type WtfButtonRound = {
  buttonId: WtfButtonId;
  config: WtfButtonConfig;
  roundId: string;
  potMutez: bigint;
  leaderWalletId: string | null;
  leaderDisplayName: string | null;
  leaderSinceMs: number | null;
  leaderOrigin: WtfButtonPressOrigin | null;
  roundStartMs: number;
  countdownEndMs: number;
  startDurationSeconds: number;
  maxRoundAgeSeconds: number;
  totalPressCount: number;
  participants: Record<string, WtfButtonParticipant>;
  wtfEarningsMutez: bigint;
  pressHistory: WtfButtonPressHistoryEntry[];
  rugClashHistory: WtfButtonRugClash[];
  winnerHistory: WtfButtonWinnerHistoryEntry[];
  currentState: WtfButtonRuntimeState;
  cooldownUntilMs: number | null;
  lastWinnerWalletId: string | null;
  lastWinnerDisplayName: string | null;
  lastPayoutMutez: bigint;
};

export type WtfButtonGameState = {
  buttons: Record<WtfButtonId, WtfButtonRound>;
  balances: Record<string, bigint>;
  winnerCooldownUntilByWallet: Record<string, number>;
  wtfTreasuryMutez: bigint;
  antiSnowballBlocks: number;
};

export type WtfButtonPressQuote = {
  id: string;
  buttonId: WtfButtonId;
  roundId: string;
  sender: string;
  quotedCostMutez: bigint;
  actualCostMutez: bigint;
  maxAcceptedCostMutez: bigint;
  priceProtectionMode: WtfButtonPriceProtectionMode;
  toleranceMutez: bigint;
  quoteTimestampMs: number;
  houseCutMutez: bigint;
  potAddMutez: bigint;
  timeAddedSeconds: number;
  canPress: boolean;
  reason: string | null;
};

export type WtfButtonPressFailureCode =
  | "ROUND_MISMATCH"
  | "PRICE_CHANGED"
  | "QUOTE_INVALID"
  | "CANNOT_PRESS"
  | "INSUFFICIENT_BALANCE"
  | "CLASH_DUPLICATE"
  | "STATE_INVALID";

export type WtfButtonPressResult =
  | {
      ok: true;
      state: WtfButtonGameState;
      button: WtfButtonRound;
      quote: WtfButtonPressQuote;
      message: string;
      actualCostMutez: bigint;
      maxAcceptedCostMutez: bigint;
      clashStarted: boolean;
      clashJoined: boolean;
    }
  | {
      ok: false;
      state: WtfButtonGameState;
      code: WtfButtonPressFailureCode;
      message: string;
      actualCostMutez?: bigint;
      maxAcceptedCostMutez?: bigint;
      button?: WtfButtonRound;
    };

export type WtfButtonSettlementResult =
  | {
      settled: true;
      state: WtfButtonGameState;
      button: WtfButtonRound;
      record: WtfButtonWinnerHistoryEntry;
    }
  | {
      settled: false;
      state: WtfButtonGameState;
      button: WtfButtonRound;
      reason: string;
    };

export type WtfButtonClashResolution =
  | {
      resolved: true;
      state: WtfButtonGameState;
      button: WtfButtonRound;
      clash: WtfButtonRugClash;
      selected: WtfButtonClashEntry;
    }
  | {
      resolved: false;
      state: WtfButtonGameState;
      button: WtfButtonRound;
      reason: string;
    };

export const WTF_BUTTON_CONFIGS: Record<WtfButtonId, WtfButtonConfig> = {
  red: {
    id: "red",
    color: "Red",
    name: "Red Button",
    tableName: "Sprint",
    startDurationSeconds: 6 * HOUR_SECONDS,
    maxRoundAgeSeconds: 48 * HOUR_SECONDS,
    maxPressCostMutez: 2_500_000n,
    baseTimePowerSeconds: 30 * MINUTE_SECONDS,
  },
  green: {
    id: "green",
    color: "Green",
    name: "Green Button",
    tableName: "Standard",
    startDurationSeconds: 12 * HOUR_SECONDS,
    maxRoundAgeSeconds: 72 * HOUR_SECONDS,
    maxPressCostMutez: 3_000_000n,
    baseTimePowerSeconds: 60 * MINUTE_SECONDS,
  },
  blue: {
    id: "blue",
    color: "Blue",
    name: "Blue Button",
    tableName: "Jackpot",
    startDurationSeconds: 24 * HOUR_SECONDS,
    maxRoundAgeSeconds: 7 * DAY_SECONDS,
    maxPressCostMutez: 4_000_000n,
    baseTimePowerSeconds: 2 * HOUR_SECONDS,
  },
};

export const WTF_BUTTON_RULES = {
  version: "2026-05-09.wtf-button-mock-v0",
  publicTitle: WTF_BUTTON_PUBLIC_TITLE,
  shortName: WTF_BUTTON_SHORT_NAME,
  route: WTF_BUTTON_ROUTE,
  wagerAsset: "XTZ",
  paymentMode: "mocked_xtz_balances_until_escrow_contract",
  dangerZoneSeconds: DANGER_ZONE_SECONDS,
  rugClashSeconds: RUG_CLASH_SECONDS,
  winnerCooldownSeconds: WINNER_COOLDOWN_SECONDS,
  trialCooldownSeconds: TRIAL_COOLDOWN_SECONDS,
  basePressCostMutez: 1_000_000,
  globalSurchargeStepMutez: 50_000,
  globalSurchargePressBand: 25,
  maxGlobalSurchargeMutez: 500_000,
  personalRepeatStepMutez: 250_000,
  minHouseCutMutez: 100_000,
  maxHouseRateBps: 1_500,
  dailyMinimumMutez: 1_000_000,
  dailyMinimumPotCapBps: 1_000,
  noContestRefund: "total_player_payment",
  priceProtection: {
    defaultMode: "strict",
    flexibleToleranceOptionsMutez: [50_000, 100_000, 250_000],
  },
  buttons: Object.values(WTF_BUTTON_CONFIGS).map((config) => ({
    id: config.id,
    name: config.name,
    tableName: config.tableName,
    startDurationSeconds: config.startDurationSeconds,
    maxRoundAgeSeconds: config.maxRoundAgeSeconds,
    maxPressCostMutez: Number(config.maxPressCostMutez),
    baseTimePowerSeconds: config.baseTimePowerSeconds,
  })),
  contractEntrypointsNeeded: [
    "quote_press",
    "press_button",
    "enter_rug_clash",
    "resolve_rug_clash",
    "settle_round",
    "claim_refund",
  ],
} as const;

function assertNonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
  return value;
}

export function xtzToMutez(xtz: string | number): bigint {
  const raw = String(xtz).trim();
  if (!/^\d+(\.\d{0,6})?$/.test(raw)) {
    throw new RangeError(`Invalid XTZ amount: ${raw}`);
  }
  const [whole, fraction = ""] = raw.split(".");
  return BigInt(whole) * MUTEZ_PER_XTZ + BigInt(fraction.padEnd(6, "0"));
}

export function formatMutez(mutez: bigint | number): string {
  const value = BigInt(mutez);
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const whole = absolute / MUTEZ_PER_XTZ;
  const fraction = (absolute % MUTEZ_PER_XTZ).toString().padStart(6, "0");
  return `${sign}${whole}.${fraction}`.replace(/0+$/, "").replace(/\.$/, "");
}

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("denominator must be positive");
  if (numerator <= 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

export function clampBigInt(value: bigint, min: bigint, max: bigint): bigint {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function roundAgeSeconds(round: WtfButtonRound, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - round.roundStartMs) / SECOND_MS));
}

export function secondsRemaining(round: WtfButtonRound, nowMs: number): number {
  return Math.max(0, Math.ceil((round.countdownEndMs - nowMs) / SECOND_MS));
}

export function getRottenness(
  round: Pick<WtfButtonRound, "roundStartMs" | "startDurationSeconds">,
  nowMs: number
): WtfButtonRottenness {
  const age = Math.max(0, Math.floor((nowMs - round.roundStartMs) / SECOND_MS));
  if (age <= round.startDurationSeconds) return "fresh";
  if (age <= round.startDurationSeconds * 2) return "warm";
  if (age <= round.startDurationSeconds * 3) return "stale";
  return "rotten";
}

export function getRottennessMultiplierBps(rotten: WtfButtonRottenness): number {
  if (rotten === "warm") return 11_000;
  if (rotten === "stale") return 12_500;
  if (rotten === "rotten") return 15_000;
  return 10_000;
}

export function getHouseRateBps(rotten: WtfButtonRottenness): number {
  if (rotten === "warm") return 1_200;
  if (rotten === "stale") return 1_400;
  if (rotten === "rotten") return 1_500;
  return 1_000;
}

export function getAgeDecayBps(rotten: WtfButtonRottenness): number {
  if (rotten === "warm") return 7_500;
  if (rotten === "stale") return 5_000;
  if (rotten === "rotten") return 2_500;
  return 10_000;
}

export function getUserTimeDecayBps(userPriorPresses: number): number {
  assertNonNegativeInteger(userPriorPresses, "userPriorPresses");
  if (userPriorPresses === 0) return 10_000;
  if (userPriorPresses === 1) return 7_500;
  if (userPriorPresses === 2) return 5_000;
  if (userPriorPresses === 3) return 2_500;
  return 0;
}

export function getRoundState(round: WtfButtonRound, nowMs: number): WtfButtonRuntimeState {
  if (round.currentState === "idle") return "idle";
  if (round.currentState === "cooling_down") return "cooling_down";
  if (round.currentState === "settled") return "settled";
  const activeClash = getActiveClash(round, nowMs);
  if (activeClash) return "clash";
  if (round.countdownEndMs <= nowMs) return "settled";
  return secondsRemaining(round, nowMs) <= DANGER_ZONE_SECONDS ? "danger_zone" : "active";
}

export function getActiveClash(
  round: WtfButtonRound,
  nowMs: number
): WtfButtonRugClash | null {
  const clash = round.rugClashHistory.find(
    (candidate) => candidate.resolvedAtMs === null && candidate.endsAtMs >= nowMs
  );
  return clash ?? null;
}

export function hasUnresolvedClash(round: WtfButtonRound): boolean {
  return round.rugClashHistory.some((candidate) => candidate.resolvedAtMs === null);
}

export function participantDisplayName(user: WtfButtonUser): string {
  return user.displayName?.trim() || user.walletId;
}

export function userPriorPresses(round: WtfButtonRound, walletId: string): number {
  return round.participants[walletId]?.presses ?? 0;
}

export function calculatePressCost(
  round: WtfButtonRound,
  user: WtfButtonUser,
  nowMs: number
): bigint {
  const rotten = getRottenness(round, nowMs);
  const globalBands = BigInt(Math.floor(round.totalPressCount / 25));
  const globalSurcharge = clampBigInt(globalBands * 50_000n, 0n, 500_000n);
  const priorPresses = BigInt(userPriorPresses(round, user.walletId));
  const personalBase = priorPresses * 250_000n;
  const personalSurcharge = ceilDiv(
    personalBase * BigInt(getRottennessMultiplierBps(rotten)),
    WTF_BUTTON_BPS
  );
  return clampBigInt(
    1_000_000n + globalSurcharge + personalSurcharge,
    0n,
    round.config.maxPressCostMutez
  );
}

export function calculateHouseCut(
  pressCostMutez: bigint,
  round: WtfButtonRound,
  nowMs: number
): bigint {
  const rateBps = BigInt(getHouseRateBps(getRottenness(round, nowMs)));
  const rawCut = ceilDiv(pressCostMutez * rateBps, WTF_BUTTON_BPS);
  const minCut = 100_000n;
  const maxCut = ceilDiv(pressCostMutez * 1_500n, WTF_BUTTON_BPS);
  return clampBigInt(rawCut, minCut, maxCut);
}

export function calculateTimeAdded(
  round: WtfButtonRound,
  user: WtfButtonUser,
  nowMs: number
): number {
  const priorPresses = userPriorPresses(round, user.walletId);
  if (priorPresses >= 4) return 15;
  const userDecay = BigInt(getUserTimeDecayBps(priorPresses));
  const ageDecay = BigInt(getAgeDecayBps(getRottenness(round, nowMs)));
  const seconds =
    (BigInt(round.config.baseTimePowerSeconds) * userDecay * ageDecay) /
    (WTF_BUTTON_BPS * WTF_BUTTON_BPS);
  return Math.max(15, Number(seconds));
}

export function createButtonRound(
  buttonId: WtfButtonId,
  nowMs: number,
  overrides: Partial<Pick<WtfButtonRound, "roundId" | "startDurationSeconds" | "maxRoundAgeSeconds">> & {
    config?: Partial<WtfButtonConfig>;
  } = {}
): WtfButtonRound {
  const config: WtfButtonConfig = {
    ...WTF_BUTTON_CONFIGS[buttonId],
    ...overrides.config,
    id: buttonId,
  };
  const startDurationSeconds =
    overrides.startDurationSeconds ?? config.startDurationSeconds;
  const maxRoundAgeSeconds = overrides.maxRoundAgeSeconds ?? config.maxRoundAgeSeconds;
  return {
    buttonId,
    config: { ...config, startDurationSeconds, maxRoundAgeSeconds },
    roundId: overrides.roundId ?? `${buttonId}-${nowMs}`,
    potMutez: 0n,
    leaderWalletId: null,
    leaderDisplayName: null,
    leaderSinceMs: null,
    leaderOrigin: null,
    roundStartMs: nowMs,
    countdownEndMs: nowMs + startDurationSeconds * SECOND_MS,
    startDurationSeconds,
    maxRoundAgeSeconds,
    totalPressCount: 0,
    participants: {},
    wtfEarningsMutez: 0n,
    pressHistory: [],
    rugClashHistory: [],
    winnerHistory: [],
    currentState: "active",
    cooldownUntilMs: null,
    lastWinnerWalletId: null,
    lastWinnerDisplayName: null,
    lastPayoutMutez: 0n,
  };
}

export function createIdleButtonRound(buttonId: WtfButtonId, nowMs: number): WtfButtonRound {
  return {
    ...createButtonRound(buttonId, nowMs),
    currentState: "idle",
    countdownEndMs: nowMs,
  };
}

export function createWtfButtonGameState(
  nowMs: number,
  balances: Record<string, bigint> = {}
): WtfButtonGameState {
  return {
    buttons: {
      red: createButtonRound("red", nowMs),
      green: createButtonRound("green", nowMs),
      blue: createButtonRound("blue", nowMs),
    },
    balances: { ...balances },
    winnerCooldownUntilByWallet: {},
    wtfTreasuryMutez: 0n,
    antiSnowballBlocks: 0,
  };
}

export function cloneGameState(state: WtfButtonGameState): WtfButtonGameState {
  const cloneRound = (round: WtfButtonRound): WtfButtonRound => ({
    ...round,
    config: { ...round.config },
    participants: Object.fromEntries(
      Object.entries(round.participants).map(([wallet, participant]) => [
        wallet,
        { ...participant },
      ])
    ),
    pressHistory: round.pressHistory.map((entry) => ({ ...entry })),
    rugClashHistory: round.rugClashHistory.map((clash) => ({
      ...clash,
      entrants: clash.entrants.map((entry) => ({ ...entry })),
    })),
    winnerHistory: round.winnerHistory.map((entry) => ({ ...entry })),
  });
  return {
    buttons: {
      red: cloneRound(state.buttons.red),
      green: cloneRound(state.buttons.green),
      blue: cloneRound(state.buttons.blue),
    },
    balances: { ...state.balances },
    winnerCooldownUntilByWallet: { ...state.winnerCooldownUntilByWallet },
    wtfTreasuryMutez: state.wtfTreasuryMutez,
    antiSnowballBlocks: state.antiSnowballBlocks,
  };
}

export function getLeaderButtonId(
  state: WtfButtonGameState,
  walletId: string,
  nowMs: number
): WtfButtonId | null {
  for (const buttonId of Object.keys(state.buttons) as WtfButtonId[]) {
    const round = state.buttons[buttonId];
    const roundState = getRoundState(round, nowMs);
    if (
      round.leaderWalletId === walletId &&
      (roundState === "active" || roundState === "danger_zone" || roundState === "clash")
    ) {
      return buttonId;
    }
  }
  return null;
}

export function canUserPress(
  state: WtfButtonGameState,
  buttonId: WtfButtonId,
  user: WtfButtonUser,
  nowMs: number
): { canPress: boolean; reason: string | null; actualCostMutez: bigint } {
  const round = state.buttons[buttonId];
  const actualCostMutez = calculatePressCost(round, user, nowMs);
  const roundState = getRoundState(round, nowMs);
  const activeClash = getActiveClash(round, nowMs);
  if (roundState !== "active" && roundState !== "danger_zone" && roundState !== "clash") {
    return {
      canPress: false,
      reason:
        roundState === "cooling_down"
          ? "Button is cooling down."
          : "Button is not active.",
      actualCostMutez,
    };
  }
  if (round.leaderWalletId === user.walletId) {
    return {
      canPress: false,
      reason: `You are already leader on ${round.config.name}.`,
      actualCostMutez,
    };
  }
  const leaderButtonId = getLeaderButtonId(state, user.walletId, nowMs);
  if (leaderButtonId && leaderButtonId !== buttonId) {
    state.antiSnowballBlocks += 1;
    return {
      canPress: false,
      reason: `You are already leader on ${state.buttons[leaderButtonId].config.name}.`,
      actualCostMutez,
    };
  }
  const cooldownUntil = state.winnerCooldownUntilByWallet[user.walletId] ?? 0;
  if (cooldownUntil > nowMs) {
    return {
      canPress: false,
      reason: `Winner cooldown active: ${Math.ceil((cooldownUntil - nowMs) / SECOND_MS)}s remaining.`,
      actualCostMutez,
    };
  }
  if (activeClash?.entrants.some((entrant) => entrant.walletId === user.walletId)) {
    return {
      canPress: false,
      reason: "You already entered this Rug Clash.",
      actualCostMutez,
    };
  }
  if ((state.balances[user.walletId] ?? 0n) < actualCostMutez) {
    return {
      canPress: false,
      reason: "Insufficient mocked XTZ balance.",
      actualCostMutez,
    };
  }
  return { canPress: true, reason: null, actualCostMutez };
}

export function quotePress(
  state: WtfButtonGameState,
  buttonId: WtfButtonId,
  user: WtfButtonUser,
  nowMs: number,
  priceProtectionMode: WtfButtonPriceProtectionMode = "strict",
  toleranceMutez: bigint = 0n
): WtfButtonPressQuote {
  const round = state.buttons[buttonId];
  const pressCheck = canUserPress(cloneGameState(state), buttonId, user, nowMs);
  const quotedCostMutez = pressCheck.actualCostMutez;
  const safeTolerance =
    priceProtectionMode === "flexible" ? clampBigInt(toleranceMutez, 0n, round.config.maxPressCostMutez) : 0n;
  const maxAcceptedCostMutez =
    priceProtectionMode === "flexible"
      ? clampBigInt(quotedCostMutez + safeTolerance, 0n, round.config.maxPressCostMutez)
      : quotedCostMutez;
  const houseCutMutez = calculateHouseCut(quotedCostMutez, round, nowMs);
  return {
    id: `${buttonId}-${round.roundId}-${user.walletId}-${nowMs}`,
    buttonId,
    roundId: round.roundId,
    sender: user.walletId,
    quotedCostMutez,
    actualCostMutez: quotedCostMutez,
    maxAcceptedCostMutez,
    priceProtectionMode,
    toleranceMutez: safeTolerance,
    quoteTimestampMs: nowMs,
    houseCutMutez,
    potAddMutez: quotedCostMutez - houseCutMutez,
    timeAddedSeconds: calculateTimeAdded(round, user, nowMs),
    canPress: pressCheck.canPress,
    reason: pressCheck.reason,
  };
}

function ensureParticipant(round: WtfButtonRound, user: WtfButtonUser): WtfButtonParticipant {
  const existing = round.participants[user.walletId];
  if (existing) return existing;
  const participant: WtfButtonParticipant = {
    walletId: user.walletId,
    displayName: participantDisplayName(user),
    presses: 0,
    totalPaidMutez: 0n,
    totalPotAddedMutez: 0n,
    totalWtfPaidMutez: 0n,
    lastPressAtMs: null,
    lastStatus: "challenger",
  };
  round.participants[user.walletId] = participant;
  return participant;
}

function applyPayment(
  state: WtfButtonGameState,
  round: WtfButtonRound,
  user: WtfButtonUser,
  quote: WtfButtonPressQuote,
  nowMs: number
) {
  const participant = ensureParticipant(round, user);
  state.balances[user.walletId] = (state.balances[user.walletId] ?? 0n) - quote.actualCostMutez;
  state.wtfTreasuryMutez += quote.houseCutMutez;
  round.potMutez += quote.potAddMutez;
  round.wtfEarningsMutez += quote.houseCutMutez;
  round.totalPressCount += 1;
  participant.presses += 1;
  participant.totalPaidMutez += quote.actualCostMutez;
  participant.totalPotAddedMutez += quote.potAddMutez;
  participant.totalWtfPaidMutez += quote.houseCutMutez;
  participant.lastPressAtMs = nowMs;
  participant.displayName = participantDisplayName(user);
  participant.lastStatus = "challenger";
}

function createPressHistoryEntry(input: {
  round: WtfButtonRound;
  user: WtfButtonUser;
  quote: WtfButtonPressQuote;
  nowMs: number;
  previousLeaderWalletId: string | null;
  newLeaderWalletId: string | null;
  origin: WtfButtonPressOrigin;
  event: string;
  clashId?: string;
}): WtfButtonPressHistoryEntry {
  return {
    id: `${input.round.buttonId}-press-${input.round.totalPressCount}-${input.nowMs}`,
    buttonId: input.round.buttonId,
    roundId: input.round.roundId,
    walletId: input.user.walletId,
    displayName: participantDisplayName(input.user),
    atMs: input.nowMs,
    quotedCostMutez: input.quote.quotedCostMutez,
    actualCostMutez: input.quote.actualCostMutez,
    houseCutMutez: input.quote.houseCutMutez,
    potAddMutez: input.quote.potAddMutez,
    timeAddedSeconds: input.quote.timeAddedSeconds,
    previousLeaderWalletId: input.previousLeaderWalletId,
    newLeaderWalletId: input.newLeaderWalletId,
    origin: input.origin,
    event: input.event,
    clashId: input.clashId,
  };
}

function capEndTime(round: WtfButtonRound, proposedEndMs: number): number {
  return Math.min(proposedEndMs, round.roundStartMs + round.maxRoundAgeSeconds * SECOND_MS);
}

export function pressButton(
  state: WtfButtonGameState,
  buttonId: WtfButtonId,
  user: WtfButtonUser,
  quote: WtfButtonPressQuote,
  nowMs: number
): WtfButtonPressResult {
  const next = cloneGameState(state);
  const round = next.buttons[buttonId];
  if (!round) {
    return { ok: false, state: next, code: "QUOTE_INVALID", message: "Unknown button." };
  }
  if (quote.buttonId !== buttonId || quote.sender !== user.walletId) {
    return {
      ok: false,
      state: next,
      button: round,
      code: "QUOTE_INVALID",
      message: "Press quote does not match this sender and button.",
    };
  }
  if (quote.roundId !== round.roundId) {
    return {
      ok: false,
      state: next,
      button: round,
      code: "ROUND_MISMATCH",
      message: "Round changed before your press landed.",
    };
  }

  const actualCostMutez = calculatePressCost(round, user, nowMs);
  if (actualCostMutez > quote.maxAcceptedCostMutez) {
    return {
      ok: false,
      state: next,
      button: round,
      code: "PRICE_CHANGED",
      message: `Button price changed before your press landed. New cost is ${formatMutez(actualCostMutez)} XTZ.`,
      actualCostMutez,
      maxAcceptedCostMutez: quote.maxAcceptedCostMutez,
    };
  }
  const actualQuote: WtfButtonPressQuote = {
    ...quote,
    actualCostMutez,
    houseCutMutez: calculateHouseCut(actualCostMutez, round, nowMs),
    potAddMutez: actualCostMutez - calculateHouseCut(actualCostMutez, round, nowMs),
    timeAddedSeconds: calculateTimeAdded(round, user, nowMs),
  };

  const pressCheck = canUserPress(next, buttonId, user, nowMs);
  if (!pressCheck.canPress) {
    const code =
      pressCheck.reason === "You already entered this Rug Clash."
        ? "CLASH_DUPLICATE"
        : pressCheck.reason === "Insufficient mocked XTZ balance."
          ? "INSUFFICIENT_BALANCE"
          : "CANNOT_PRESS";
    return {
      ok: false,
      state: next,
      button: round,
      code,
      message: pressCheck.reason ?? "Cannot press this button right now.",
      actualCostMutez,
      maxAcceptedCostMutez: quote.maxAcceptedCostMutez,
    };
  }

  const previousLeaderWalletId = round.leaderWalletId;
  const beforeState = getRoundState(round, nowMs);
  applyPayment(next, round, user, actualQuote, nowMs);

  if (beforeState === "danger_zone" || beforeState === "clash") {
    let clash = getActiveClash(round, nowMs);
    let clashStarted = false;
    if (!clash) {
      clash = {
        id: `${buttonId}-clash-${round.rugClashHistory.length + 1}-${nowMs}`,
        roundId: round.roundId,
        startedAtMs: nowMs,
        endsAtMs: nowMs + RUG_CLASH_SECONDS * SECOND_MS,
        entrants: [],
        resolvedAtMs: null,
        selectedWalletId: null,
        selectedTimeAddedSeconds: null,
        seedProof: null,
        firstEntrantWalletId: user.walletId,
      };
      round.rugClashHistory.push(clash);
      clashStarted = true;
    }
    clash.entrants.push({
      walletId: user.walletId,
      displayName: participantDisplayName(user),
      atMs: nowMs,
      actualCostMutez: actualQuote.actualCostMutez,
      houseCutMutez: actualQuote.houseCutMutez,
      potAddMutez: actualQuote.potAddMutez,
      timeAddedSeconds: actualQuote.timeAddedSeconds,
      quoteId: actualQuote.id,
    });
    round.participants[user.walletId].lastStatus = "clash_entrant";
    round.currentState = "clash";
    round.pressHistory.push(
      createPressHistoryEntry({
        round,
        user,
        quote: actualQuote,
        nowMs,
        previousLeaderWalletId,
        newLeaderWalletId: null,
        origin: "rug_clash",
        event: clashStarted ? "Rug Clash started" : "Rug Clash entrant joined",
        clashId: clash.id,
      })
    );
    return {
      ok: true,
      state: next,
      button: round,
      quote: actualQuote,
      message:
        actualQuote.priceProtectionMode === "flexible"
          ? `Press succeeded at ${formatMutez(actualCostMutez)} XTZ. Your allowed max was ${formatMutez(quote.maxAcceptedCostMutez)} XTZ.`
          : `Entered Rug Clash for ${formatMutez(actualCostMutez)} XTZ.`,
      actualCostMutez,
      maxAcceptedCostMutez: quote.maxAcceptedCostMutez,
      clashStarted,
      clashJoined: true,
    };
  }

  round.leaderWalletId = user.walletId;
  round.leaderDisplayName = participantDisplayName(user);
  round.leaderSinceMs = nowMs;
  round.leaderOrigin = "normal";
  round.countdownEndMs = capEndTime(
    round,
    round.countdownEndMs + actualQuote.timeAddedSeconds * SECOND_MS
  );
  round.currentState = getRoundState(round, nowMs);
  round.participants[user.walletId].lastStatus = "leader";
  round.pressHistory.push(
    createPressHistoryEntry({
      round,
      user,
      quote: actualQuote,
      nowMs,
      previousLeaderWalletId,
      newLeaderWalletId: user.walletId,
      origin: "normal",
      event: "Leader changed",
    })
  );
  return {
    ok: true,
    state: next,
    button: round,
    quote: actualQuote,
    message:
      actualQuote.priceProtectionMode === "flexible"
        ? `Press succeeded at ${formatMutez(actualCostMutez)} XTZ. Your allowed max was ${formatMutez(quote.maxAcceptedCostMutez)} XTZ.`
        : `Pressed ${round.config.color} for ${formatMutez(actualCostMutez)} XTZ.`,
    actualCostMutez,
    maxAcceptedCostMutez: quote.maxAcceptedCostMutez,
    clashStarted: false,
    clashJoined: false,
  };
}

function clashScore(seed: string, round: WtfButtonRound, clash: WtfButtonRugClash, entry: WtfButtonClashEntry): bigint {
  const digest = createHash("sha256")
    .update(`${seed}:${round.roundId}:${clash.id}:${entry.walletId}:${entry.atMs}`)
    .digest("hex");
  return BigInt(`0x${digest}`);
}

export function selectClashWinner(
  round: WtfButtonRound,
  clash: WtfButtonRugClash,
  seed: string
): WtfButtonClashEntry | null {
  if (clash.entrants.length === 0) return null;
  return [...clash.entrants].sort((a, b) => {
    const aScore = clashScore(seed, round, clash, a);
    const bScore = clashScore(seed, round, clash, b);
    if (aScore === bScore) return a.walletId.localeCompare(b.walletId);
    return aScore < bScore ? -1 : 1;
  })[0];
}

export function resolveClash(
  state: WtfButtonGameState,
  buttonId: WtfButtonId,
  nowMs: number,
  seed: string
): WtfButtonClashResolution {
  const next = cloneGameState(state);
  const round = next.buttons[buttonId];
  const clash = round.rugClashHistory.find(
    (candidate) => candidate.resolvedAtMs === null && candidate.endsAtMs <= nowMs
  );
  if (!clash) {
    return { resolved: false, state: next, button: round, reason: "No Rug Clash ready." };
  }
  const selected = selectClashWinner(round, clash, seed);
  if (!selected) {
    clash.resolvedAtMs = nowMs;
    round.currentState = getRoundState(round, nowMs);
    return { resolved: false, state: next, button: round, reason: "Rug Clash had no entrants." };
  }
  round.leaderWalletId = selected.walletId;
  round.leaderDisplayName = selected.displayName;
  round.leaderSinceMs = nowMs;
  round.leaderOrigin = "rug_clash";
  round.countdownEndMs = capEndTime(
    round,
    round.countdownEndMs + selected.timeAddedSeconds * SECOND_MS
  );
  for (const participant of Object.values(round.participants)) {
    if (participant.walletId === selected.walletId) {
      participant.lastStatus = "leader";
    } else if (clash.entrants.some((entrant) => entrant.walletId === participant.walletId)) {
      participant.lastStatus = "challenger";
    }
  }
  clash.resolvedAtMs = nowMs;
  clash.selectedWalletId = selected.walletId;
  clash.selectedTimeAddedSeconds = selected.timeAddedSeconds;
  clash.seedProof = createHash("sha256")
    .update(`${seed}:${round.roundId}:${clash.id}`)
    .digest("hex");
  round.currentState = getRoundState(round, nowMs);
  return { resolved: true, state: next, button: round, clash, selected };
}

export function calculateDailyWtfMinimum(round: WtfButtonRound, nowMs: number): bigint {
  const uniquePressers = Object.keys(round.participants).filter(
    (walletId) => round.participants[walletId].presses > 0
  ).length;
  if (uniquePressers < 3) return 0n;
  const durationSeconds = Math.max(0, Math.floor((nowMs - round.roundStartMs) / SECOND_MS));
  if (durationSeconds <= round.startDurationSeconds) return 0n;
  return BigInt(Math.floor((durationSeconds - round.startDurationSeconds) / DAY_SECONDS)) *
    MUTEZ_PER_XTZ;
}

export function calculateSettlementFee(round: WtfButtonRound, nowMs: number): bigint {
  const requiredMinimum = calculateDailyWtfMinimum(round, nowMs);
  if (requiredMinimum <= round.wtfEarningsMutez) return 0n;
  const shortfall = requiredMinimum - round.wtfEarningsMutez;
  const potCap = (round.potMutez * 1_000n) / WTF_BUTTON_BPS;
  return shortfall < potCap ? shortfall : potCap;
}

export function settleRound(
  state: WtfButtonGameState,
  buttonId: WtfButtonId,
  nowMs: number
): WtfButtonSettlementResult {
  const next = cloneGameState(state);
  const round = next.buttons[buttonId];
  if (hasUnresolvedClash(round)) {
    return { settled: false, state: next, button: round, reason: "Rug Clash is unresolved." };
  }
  if (round.currentState === "idle" || round.currentState === "cooling_down") {
    return { settled: false, state: next, button: round, reason: "Round is not active." };
  }
  if (round.countdownEndMs > nowMs) {
    return { settled: false, state: next, button: round, reason: "Countdown has not expired." };
  }

  const pressers = Object.values(round.participants).filter((participant) => participant.presses > 0);
  const durationSeconds = Math.max(0, Math.floor((nowMs - round.roundStartMs) / SECOND_MS));
  const cameFromRugClash = round.leaderOrigin === "rug_clash";
  let record: WtfButtonWinnerHistoryEntry;

  if (pressers.length <= 1) {
    const participant = pressers[0] ?? null;
    const refundMutez = participant?.totalPaidMutez ?? 0n;
    if (participant) {
      next.balances[participant.walletId] =
        (next.balances[participant.walletId] ?? 0n) + refundMutez;
    }
    next.wtfTreasuryMutez =
      next.wtfTreasuryMutez >= round.wtfEarningsMutez
        ? next.wtfTreasuryMutez - round.wtfEarningsMutez
        : 0n;
    record = {
      roundId: round.roundId,
      buttonId,
      kind: "no_contest_refund",
      winnerWalletId: null,
      winnerDisplayName: null,
      payoutMutez: 0n,
      refundMutez,
      settlementFeeMutez: 0n,
      wtfTotalMutez: 0n,
      durationSeconds,
      totalPresses: round.totalPressCount,
      uniquePressers: pressers.length,
      rugClashes: round.rugClashHistory.length,
      cameFromRugClash: false,
      settledAtMs: nowMs,
    };
    round.potMutez = 0n;
    round.wtfEarningsMutez = 0n;
    round.lastWinnerWalletId = null;
    round.lastWinnerDisplayName = participant?.displayName ?? null;
    round.lastPayoutMutez = 0n;
  } else {
    const settlementFeeMutez = calculateSettlementFee(round, nowMs);
    const payoutMutez = round.potMutez - settlementFeeMutez;
    if (settlementFeeMutez > 0n) {
      next.wtfTreasuryMutez += settlementFeeMutez;
      round.wtfEarningsMutez += settlementFeeMutez;
    }
    if (round.leaderWalletId) {
      next.balances[round.leaderWalletId] =
        (next.balances[round.leaderWalletId] ?? 0n) + payoutMutez;
      next.winnerCooldownUntilByWallet[round.leaderWalletId] =
        nowMs + WINNER_COOLDOWN_SECONDS * SECOND_MS;
    }
    record = {
      roundId: round.roundId,
      buttonId,
      kind: "winner_payout",
      winnerWalletId: round.leaderWalletId,
      winnerDisplayName: round.leaderDisplayName,
      payoutMutez,
      refundMutez: 0n,
      settlementFeeMutez,
      wtfTotalMutez: round.wtfEarningsMutez,
      durationSeconds,
      totalPresses: round.totalPressCount,
      uniquePressers: pressers.length,
      rugClashes: round.rugClashHistory.length,
      cameFromRugClash,
      settledAtMs: nowMs,
    };
    round.lastWinnerWalletId = round.leaderWalletId;
    round.lastWinnerDisplayName = round.leaderDisplayName;
    round.lastPayoutMutez = payoutMutez;
    round.potMutez = 0n;
  }

  for (const participant of Object.values(round.participants)) {
    participant.lastStatus = "cooled_down";
  }
  round.winnerHistory.push(record);
  round.currentState = "cooling_down";
  round.cooldownUntilMs = nowMs + TRIAL_COOLDOWN_SECONDS * SECOND_MS;
  return { settled: true, state: next, button: round, record };
}

function isButtonActiveForRestart(round: WtfButtonRound, nowMs: number): boolean {
  const state = getRoundState(round, nowMs);
  return state === "active" || state === "danger_zone" || state === "clash";
}

export function maybeRestartButton(
  state: WtfButtonGameState,
  buttonId: WtfButtonId,
  nowMs: number
): { state: WtfButtonGameState; restarted: boolean; idled: boolean; button: WtfButtonRound } {
  const next = cloneGameState(state);
  const round = next.buttons[buttonId];
  if (round.currentState !== "cooling_down" || (round.cooldownUntilMs ?? 0) > nowMs) {
    return { state: next, restarted: false, idled: false, button: round };
  }
  const otherButtons = (Object.keys(next.buttons) as WtfButtonId[]).filter(
    (candidate) => candidate !== buttonId
  );
  const otherTwoActive = otherButtons.every((candidate) =>
    isButtonActiveForRestart(next.buttons[candidate], nowMs)
  );
  if (!otherTwoActive) {
    const idle = createIdleButtonRound(buttonId, nowMs);
    idle.winnerHistory = round.winnerHistory;
    idle.lastWinnerWalletId = round.lastWinnerWalletId;
    idle.lastWinnerDisplayName = round.lastWinnerDisplayName;
    idle.lastPayoutMutez = round.lastPayoutMutez;
    next.buttons[buttonId] = idle;
    return { state: next, restarted: false, idled: true, button: idle };
  }
  const restarted = createButtonRound(buttonId, nowMs, {
    startDurationSeconds: 6 * HOUR_SECONDS,
    roundId: `${buttonId}-${nowMs}-trial-restart`,
  });
  restarted.winnerHistory = round.winnerHistory;
  restarted.lastWinnerWalletId = round.lastWinnerWalletId;
  restarted.lastWinnerDisplayName = round.lastWinnerDisplayName;
  restarted.lastPayoutMutez = round.lastPayoutMutez;
  next.buttons[buttonId] = restarted;
  return { state: next, restarted: true, idled: false, button: restarted };
}

export function allButtonsIdle(state: WtfButtonGameState, nowMs: number): boolean {
  return (Object.keys(state.buttons) as WtfButtonId[]).every(
    (buttonId) => getRoundState(state.buttons[buttonId], nowMs) === "idle"
  );
}
