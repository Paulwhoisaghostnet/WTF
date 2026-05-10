import {
  calculateEarnedMicroshares,
  calculatePanicRemainingMicroshares,
  calculatePayouts,
  canWalletCauseButtonLock,
  computeDelayLockUntilSecond,
  getDelayCostMutezForNextUse,
  getPressureMultiplierBps,
  getShareRateMicrosharesPerSecond,
  MICROSHARES_PER_SHARE,
  RUG_PULL_RULES,
  splitRugPullPayment,
  type RugPullPanicModifier,
} from "./rules";
import type { ConsoleAuthUser } from "../../../console/types";
import {
  appendCasinoAuditEvent,
  createCasinoAuditJournal,
  summarizeCasinoAuditJournal,
  type CasinoAuditEventInput,
  type CasinoAuditSummary,
} from "../../audit";

const MUTEZ_PER_XTZ = 1_000_000n;
const SECOND_MS = 1_000;

type RugPullPhase = "active" | "panic" | "settled";
type RugPullPlayerStatus = "active" | "pressed" | "auto_locked";
export type RugPullVote = "mercy" | "cruelty" | "silence";

type RugPullPlayer = {
  walletId: string;
  displayName: string;
  joinOrder: number;
  joinedAtMs: number;
  delayCount: number;
  pressedOrder: number | null;
  lockedAtMs: number | null;
  finalMicroshares: bigint | null;
  totalPaidMutez: bigint;
  totalPotAddedMutez: bigint;
  totalPlatformPaidMutez: bigint;
  status: RugPullPlayerStatus;
};

type RugPullWitness = {
  walletId: string;
  displayName: string;
  joinedAtMs: number;
  vote: RugPullVote | null;
};

type RugPullEvent = {
  id: string;
  atMs: number;
  kind: string;
  message: string;
};

type RugPullSettlement = {
  roundId: string;
  settledAtMs: number;
  panicModifier: RugPullPanicModifier;
  potMutez: bigint;
  nextSeedPotMutez: bigint;
  platformTakeMutez: bigint;
  payouts: Array<{
    walletId: string;
    displayName: string;
    finalMicroshares: bigint;
    payoutMutez: bigint;
  }>;
};

type RugPullRound = {
  roundId: string;
  phase: RugPullPhase;
  roundStartMs: number;
  potMutez: bigint;
  nextSeedPotMutez: bigint;
  platformTakeMutez: bigint;
  buttonLockUntilMs: number;
  lastLockWalletId: string | null;
  firstPressedAtMs: number | null;
  panicEndsAtMs: number | null;
  players: Record<string, RugPullPlayer>;
  witnesses: Record<string, RugPullWitness>;
  pressOrder: string[];
  events: RugPullEvent[];
  lastSettlement: RugPullSettlement | null;
};

type RugPullState = {
  round: RugPullRound;
  balances: Record<string, bigint>;
};

export type RugPullAmountView = {
  mutez: string;
  xtz: string;
};

export type RugPullSnapshot = {
  title: string;
  shortName: string;
  route: string;
  paymentMode: "mocked_xtz_balances";
  wageringEnabled: false;
  nowMs: number;
  user: {
    walletId: string;
    displayName: string;
    balance: RugPullAmountView;
    activePlayer: boolean;
    activeWitness: boolean;
  };
  round: {
    roundId: string;
    phase: RugPullPhase;
    pot: RugPullAmountView;
    nextSeedPot: RugPullAmountView;
    platformTake: RugPullAmountView;
    buttonLockUntilMs: number;
    secondsUntilButtonUnlock: number;
    panicEndsAtMs: number | null;
    panicSecondsRemaining: number;
    panicModifier: RugPullPanicModifier;
    pressureMultiplierBps: number;
    totalPlayers: number;
    totalWitnesses: number;
    totalLockedMicroshares: string;
    nextRoundPressOrder: string[];
  };
  userActions: {
    joinCost: RugPullAmountView;
    pressCost: RugPullAmountView;
    witnessCost: RugPullAmountView;
    nextDelayCost: RugPullAmountView | null;
    canJoin: boolean;
    canDelay: boolean;
    canPress: boolean;
    canJoinWitness: boolean;
    canVote: boolean;
    reason: string | null;
  };
  players: Array<{
    walletId: string;
    displayName: string;
    joinOrder: number;
    status: RugPullPlayerStatus;
    pressedOrder: number | null;
    delayCount: number;
    currentMicroshares: string;
    shareRatePerSecond: string;
    totalPaid: RugPullAmountView;
    estimatedPayout: RugPullAmountView;
  }>;
  witnesses: Array<{
    walletId: string;
    displayName: string;
    vote: RugPullVote | null;
  }>;
  lastSettlement: null | {
    roundId: string;
    settledAtMs: number;
    panicModifier: RugPullPanicModifier;
    pot: RugPullAmountView;
    nextSeedPot: RugPullAmountView;
    platformTake: RugPullAmountView;
    payouts: Array<{
      walletId: string;
      displayName: string;
      finalShares: string;
      payout: RugPullAmountView;
    }>;
  };
  timeline: RugPullEvent[];
  audit: CasinoAuditSummary;
};

let state: RugPullState | null = null;
let auditJournal = createCasinoAuditJournal("rug-pull-service");

function recordRugPullAudit(input: Omit<CasinoAuditEventInput, "gameKey">) {
  auditJournal = appendCasinoAuditEvent(
    auditJournal,
    {
      ...input,
      gameKey: "rug-pull",
    },
    160
  );
}

function now() {
  return Date.now();
}

function amount(mutez: bigint | number): RugPullAmountView {
  const value = BigInt(mutez);
  const whole = value / MUTEZ_PER_XTZ;
  const fractional = (value % MUTEZ_PER_XTZ).toString().padStart(6, "0").replace(/0+$/, "");
  return {
    mutez: value.toString(),
    xtz: fractional ? `${whole}.${fractional}` : whole.toString(),
  };
}

function walletForUser(user: ConsoleAuthUser) {
  return {
    walletId: `mock-wallet-${user.id}`,
    displayName: user.displayName || user.username || `Player ${user.id}`,
  };
}

function newRound(nowMs: number, seedPotMutez = 0n, events: RugPullEvent[] = []): RugPullRound {
  return {
    roundId: `rug-${nowMs.toString(36)}`,
    phase: "active",
    roundStartMs: nowMs,
    potMutez: seedPotMutez,
    nextSeedPotMutez: 0n,
    platformTakeMutez: 0n,
    buttonLockUntilMs: nowMs,
    lastLockWalletId: null,
    firstPressedAtMs: null,
    panicEndsAtMs: null,
    players: {},
    witnesses: {},
    pressOrder: [],
    events,
    lastSettlement: null,
  };
}

function ensureState(nowMs = now()): RugPullState {
  if (!state) {
    state = {
      round: newRound(nowMs),
      balances: {
        "mock-wallet-1": 50n * MUTEZ_PER_XTZ,
        "mock-wallet-2": 50n * MUTEZ_PER_XTZ,
        "mock-wallet-3": 50n * MUTEZ_PER_XTZ,
        "mock-wallet-4": 50n * MUTEZ_PER_XTZ,
      },
    };
  }
  advanceState(nowMs);
  return state;
}

function pushEvent(round: RugPullRound, atMs: number, kind: string, message: string) {
  round.events.unshift({
    id: `${kind}:${atMs}:${round.events.length}`,
    atMs,
    kind,
    message,
  });
  round.events = round.events.slice(0, 40);
}

function roundSecond(round: RugPullRound, nowMs: number) {
  return Math.max(0, Math.floor((nowMs - round.roundStartMs) / SECOND_MS));
}

function currentMicroshares(player: RugPullPlayer, round: RugPullRound, nowMs: number): bigint {
  if (player.finalMicroshares != null) return player.finalMicroshares;
  const toSecond = Math.max(0, Math.floor(((player.lockedAtMs ?? nowMs) - round.roundStartMs) / SECOND_MS));
  const fromSecond = Math.max(0, Math.floor((player.joinedAtMs - round.roundStartMs) / SECOND_MS));
  return calculateEarnedMicroshares({
    joinOrder: player.joinOrder,
    fromRoundSecond: fromSecond,
    toRoundSecond: toSecond,
  });
}

function choosePanicModifier(round: RugPullRound): RugPullPanicModifier {
  const votes: Record<RugPullVote, number> = { mercy: 0, cruelty: 0, silence: 0 };
  for (const witness of Object.values(round.witnesses)) {
    if (witness.vote) votes[witness.vote] += 1;
  }
  const ordered = Object.entries(votes).sort((a, b) => {
    if (a[1] !== b[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  }) as Array<[RugPullVote, number]>;
  return ordered[0][1] > 0 ? ordered[0][0] : "none";
}

function lockPlayer(player: RugPullPlayer, round: RugPullRound, atMs: number) {
  const earned = currentMicroshares(player, round, atMs);
  if (round.phase === "panic" && round.firstPressedAtMs != null) {
    const elapsed = Math.max(0, Math.floor((atMs - round.firstPressedAtMs) / SECOND_MS));
    player.finalMicroshares = calculatePanicRemainingMicroshares({
      startingMicroshares: earned,
      elapsedPanicSeconds: elapsed,
      modifier: choosePanicModifier(round),
    });
  } else {
    player.finalMicroshares = earned;
  }
  player.lockedAtMs = atMs;
}

function settleRound(nowMs: number) {
  if (!state) return;
  const round = state.round;
  if (round.phase !== "panic" || !round.panicEndsAtMs || round.panicEndsAtMs > nowMs) return;

  for (const player of Object.values(round.players)) {
    if (player.finalMicroshares == null) {
      lockPlayer(player, round, round.panicEndsAtMs);
      player.status = "auto_locked";
    }
  }
  const payouts = calculatePayouts({
    potMutez: round.potMutez,
    participants: Object.values(round.players).map((player) => ({
      id: player.walletId,
      displayName: player.displayName,
      finalMicroshares: player.finalMicroshares ?? 0n,
    })),
  });
  for (const payout of payouts) {
    state.balances[payout.id] = (state.balances[payout.id] ?? 0n) + payout.payoutMutez;
  }
  const settlement: RugPullSettlement = {
    roundId: round.roundId,
    settledAtMs: nowMs,
    panicModifier: choosePanicModifier(round),
    potMutez: round.potMutez,
    nextSeedPotMutez: round.nextSeedPotMutez,
    platformTakeMutez: round.platformTakeMutez,
    payouts: payouts.map((payout) => ({
      walletId: payout.id,
      displayName: payout.displayName,
      finalMicroshares: payout.finalMicroshares,
      payoutMutez: payout.payoutMutez,
    })),
  };
  pushEvent(round, nowMs, "settled", `Round settled. Next seed pot: ${amount(round.nextSeedPotMutez).xtz} XTZ.`);
  recordRugPullAudit({
    atMs: nowMs,
    scope: round.roundId,
    action: "round_settled",
    actorId: null,
    severity: "settlement",
    message: "Rug Pull panic round settled.",
    payload: {
      panicModifier: settlement.panicModifier,
      potMutez: settlement.potMutez,
      nextSeedPotMutez: settlement.nextSeedPotMutez,
      platformTakeMutez: settlement.platformTakeMutez,
      payoutCount: settlement.payouts.length,
    },
  });
  const carryEvents = round.events;
  state.round = newRound(nowMs, round.nextSeedPotMutez, carryEvents);
  state.round.lastSettlement = settlement;
}

function advanceState(nowMs: number) {
  settleRound(nowMs);
}

function userReason(round: RugPullRound, walletId: string, nowMs: number): string | null {
  const player = round.players[walletId] ?? null;
  if (round.phase === "settled") return "Round is settling.";
  if (round.phase === "active" && player?.status === "active" && round.buttonLockUntilMs > nowMs) {
    return "Button is locked so the newest player cannot be instantly rugged.";
  }
  if (round.phase === "panic" && player?.status !== "active") return "Your shares are already locked.";
  return null;
}

function viewSettlement(settlement: RugPullSettlement | null): RugPullSnapshot["lastSettlement"] {
  if (!settlement) return null;
  return {
    roundId: settlement.roundId,
    settledAtMs: settlement.settledAtMs,
    panicModifier: settlement.panicModifier,
    pot: amount(settlement.potMutez),
    nextSeedPot: amount(settlement.nextSeedPotMutez),
    platformTake: amount(settlement.platformTakeMutez),
    payouts: settlement.payouts.map((payout) => ({
      walletId: payout.walletId,
      displayName: payout.displayName,
      finalShares: (payout.finalMicroshares / BigInt(MICROSHARES_PER_SHARE)).toString(),
      payout: amount(payout.payoutMutez),
    })),
  };
}

export function getRugPullSnapshot(rawUser: ConsoleAuthUser, nowMs = now()): RugPullSnapshot {
  const gameState = ensureState(nowMs);
  const user = walletForUser(rawUser);
  const balance = gameState.balances[user.walletId] ?? 50n * MUTEZ_PER_XTZ;
  gameState.balances[user.walletId] = balance;
  const round = gameState.round;
  const joinSplit = splitRugPullPayment("join");
  const pressSplit = splitRugPullPayment("press");
  const witnessSplit = splitRugPullPayment("witness");
  const player = round.players[user.walletId] ?? null;
  const witness = round.witnesses[user.walletId] ?? null;
  const reason = userReason(round, user.walletId, nowMs);
  const nextDelayCost = player ? getDelayCostMutezForNextUse(player.delayCount) : null;
  const playerRows = Object.values(round.players).map((entry) => {
    const shares = currentMicroshares(entry, round, nowMs);
    const totalShares = Object.values(round.players).reduce(
      (sum, candidate) => sum + currentMicroshares(candidate, round, nowMs),
      0n
    );
    const estimatedPayout = totalShares > 0n ? (round.potMutez * shares) / totalShares : 0n;
    const shareRate =
      entry.status === "active" && round.phase === "active"
        ? getShareRateMicrosharesPerSecond({
            joinOrder: entry.joinOrder,
            secondsSinceRoundStart: roundSecond(round, nowMs),
          })
        : 0n;
    return {
      walletId: entry.walletId,
      displayName: entry.displayName,
      joinOrder: entry.joinOrder,
      status: entry.status,
      pressedOrder: entry.pressedOrder,
      delayCount: entry.delayCount,
      currentMicroshares: shares.toString(),
      shareRatePerSecond: shareRate.toString(),
      totalPaid: amount(entry.totalPaidMutez),
      estimatedPayout: amount(estimatedPayout),
    };
  });

  return {
    title: "Rug Pull: The Game",
    shortName: "Rug Pull",
    route: "/casino/rug-pull",
    paymentMode: "mocked_xtz_balances",
    wageringEnabled: false,
    nowMs,
    user: {
      walletId: user.walletId,
      displayName: user.displayName,
      balance: amount(balance),
      activePlayer: Boolean(player && player.status === "active"),
      activeWitness: Boolean(witness),
    },
    round: {
      roundId: round.roundId,
      phase: round.phase,
      pot: amount(round.potMutez),
      nextSeedPot: amount(round.nextSeedPotMutez),
      platformTake: amount(round.platformTakeMutez),
      buttonLockUntilMs: round.buttonLockUntilMs,
      secondsUntilButtonUnlock: Math.max(0, Math.ceil((round.buttonLockUntilMs - nowMs) / SECOND_MS)),
      panicEndsAtMs: round.panicEndsAtMs,
      panicSecondsRemaining: round.panicEndsAtMs
        ? Math.max(0, Math.ceil((round.panicEndsAtMs - nowMs) / SECOND_MS))
        : 0,
      panicModifier: choosePanicModifier(round),
      pressureMultiplierBps: getPressureMultiplierBps(roundSecond(round, nowMs)),
      totalPlayers: Object.keys(round.players).length,
      totalWitnesses: Object.keys(round.witnesses).length,
      totalLockedMicroshares: Object.values(round.players)
        .reduce((sum, entry) => sum + currentMicroshares(entry, round, nowMs), 0n)
        .toString(),
      nextRoundPressOrder: round.pressOrder,
    },
    userActions: {
      joinCost: amount(joinSplit.totalMutez),
      pressCost: amount(pressSplit.totalMutez),
      witnessCost: amount(witnessSplit.totalMutez),
      nextDelayCost: nextDelayCost == null ? null : amount(nextDelayCost),
      canJoin: round.phase === "active" && !player && balance >= BigInt(joinSplit.totalMutez),
      canDelay:
        round.phase === "active" &&
        Boolean(player && player.status === "active") &&
        nextDelayCost != null &&
        canWalletCauseButtonLock({ walletAddress: user.walletId, lastLockWalletAddress: round.lastLockWalletId }) &&
        balance >= BigInt(nextDelayCost),
      canPress:
        Boolean(player && player.status === "active") &&
        (round.phase === "panic" || (round.phase === "active" && round.buttonLockUntilMs <= nowMs)) &&
        balance >= BigInt(pressSplit.totalMutez),
      canJoinWitness: !witness && balance >= BigInt(witnessSplit.totalMutez),
      canVote: round.phase === "panic" && Boolean(witness) && !witness?.vote,
      reason,
    },
    players: playerRows.sort((a, b) => a.joinOrder - b.joinOrder),
    witnesses: Object.values(round.witnesses).map((entry) => ({
      walletId: entry.walletId,
      displayName: entry.displayName,
      vote: entry.vote,
    })),
    lastSettlement: viewSettlement(round.lastSettlement),
    timeline: round.events,
    audit: summarizeCasinoAuditJournal(auditJournal),
  };
}

function debit(walletId: string, totalMutez: number, nowMs = now()): boolean {
  const gameState = ensureState(nowMs);
  const total = BigInt(totalMutez);
  const balance = gameState.balances[walletId] ?? 50n * MUTEZ_PER_XTZ;
  if (balance < total) return false;
  gameState.balances[walletId] = balance - total;
  return true;
}

function rejectedAction(
  rawUser: ConsoleAuthUser,
  nowMs: number,
  action: string,
  error: string,
  payload: Record<string, unknown> = {}
) {
  const user = walletForUser(rawUser);
  const gameState = ensureState(nowMs);
  recordRugPullAudit({
    atMs: nowMs,
    scope: gameState.round.roundId,
    action,
    actorId: user.walletId,
    severity: "rejection",
    message: error,
    payload,
  });
  return { ok: false, error, snapshot: getRugPullSnapshot(rawUser, nowMs) };
}

function acceptedAction(
  rawUser: ConsoleAuthUser,
  nowMs: number,
  action: string,
  message: string,
  payload: Record<string, unknown> = {}
) {
  const user = walletForUser(rawUser);
  const gameState = ensureState(nowMs);
  recordRugPullAudit({
    atMs: nowMs,
    scope: gameState.round.roundId,
    action,
    actorId: user.walletId,
    severity: "info",
    message,
    payload,
  });
  return { ok: true, snapshot: getRugPullSnapshot(rawUser, nowMs) };
}

export function joinRugPullRound(rawUser: ConsoleAuthUser, nowMs = now()) {
  const gameState = ensureState(nowMs);
  const user = walletForUser(rawUser);
  const round = gameState.round;
  if (round.phase !== "active") return rejectedAction(rawUser, nowMs, "join_rejected", "Round is not joinable.", { phase: round.phase });
  if (round.players[user.walletId]) return rejectedAction(rawUser, nowMs, "join_rejected", "You are already in this round.", { reason: "duplicate_player" });
  const split = splitRugPullPayment("join");
  if (!debit(user.walletId, split.totalMutez, nowMs)) return rejectedAction(rawUser, nowMs, "join_rejected", "Insufficient mocked XTZ balance.", { totalMutez: split.totalMutez });
  const player: RugPullPlayer = {
    walletId: user.walletId,
    displayName: user.displayName,
    joinOrder: Object.keys(round.players).length + 1,
    joinedAtMs: nowMs,
    delayCount: 0,
    pressedOrder: null,
    lockedAtMs: null,
    finalMicroshares: null,
    totalPaidMutez: BigInt(split.totalMutez),
    totalPotAddedMutez: BigInt(split.potMutez),
    totalPlatformPaidMutez: BigInt(split.platformMutez),
    status: "active",
  };
  round.players[user.walletId] = player;
  round.potMutez += BigInt(split.potMutez);
  round.platformTakeMutez += BigInt(split.platformMutez);
  round.buttonLockUntilMs = nowMs + RUG_PULL_RULES.joinButtonLockSeconds * SECOND_MS;
  round.lastLockWalletId = user.walletId;
  pushEvent(round, nowMs, "join", `${user.displayName} joined as Player ${player.joinOrder}.`);
  return acceptedAction(rawUser, nowMs, "round_joined", "Player joined Rug Pull round.", {
    joinOrder: player.joinOrder,
    totalMutez: split.totalMutez,
    potMutez: split.potMutez,
    platformMutez: split.platformMutez,
  });
}

export function delayRugPullButton(rawUser: ConsoleAuthUser, nowMs = now()) {
  const gameState = ensureState(nowMs);
  const user = walletForUser(rawUser);
  const round = gameState.round;
  const player = round.players[user.walletId];
  const nextCost = player ? getDelayCostMutezForNextUse(player.delayCount) : null;
  if (round.phase !== "active" || !player || player.status !== "active" || nextCost == null) {
    return rejectedAction(rawUser, nowMs, "delay_rejected", "Delay is not available.", {
      phase: round.phase,
      playerStatus: player?.status ?? null,
    });
  }
  if (!canWalletCauseButtonLock({ walletAddress: user.walletId, lastLockWalletAddress: round.lastLockWalletId })) {
    return rejectedAction(rawUser, nowMs, "delay_rejected", "Same wallet cannot cause two button locks in a row.", {
      reason: "consecutive_lock",
    });
  }
  if (!debit(user.walletId, nextCost, nowMs)) return rejectedAction(rawUser, nowMs, "delay_rejected", "Insufficient mocked XTZ balance.", { totalMutez: nextCost });
  player.delayCount += 1;
  player.totalPaidMutez += BigInt(nextCost);
  player.totalPotAddedMutez += BigInt(nextCost);
  round.potMutez += BigInt(nextCost);
  round.lastLockWalletId = user.walletId;
  round.buttonLockUntilMs =
    computeDelayLockUntilSecond({
      nowSecond: Math.floor(nowMs / SECOND_MS),
      currentLockUntilSecond: Math.floor(round.buttonLockUntilMs / SECOND_MS),
    }) * SECOND_MS;
  pushEvent(round, nowMs, "delay", `${user.displayName} delayed the button for ${amount(nextCost).xtz} XTZ.`);
  return acceptedAction(rawUser, nowMs, "button_delayed", "Player delayed the Rug Pull button.", {
    totalMutez: nextCost,
    delayCount: player.delayCount,
    buttonLockUntilMs: round.buttonLockUntilMs,
  });
}

export function pressRugPullButton(rawUser: ConsoleAuthUser, nowMs = now()) {
  const gameState = ensureState(nowMs);
  const user = walletForUser(rawUser);
  const round = gameState.round;
  const player = round.players[user.walletId];
  const split = splitRugPullPayment("press");
  if (!player || player.status !== "active") return rejectedAction(rawUser, nowMs, "press_rejected", "Only active unpressed players can press.", { playerStatus: player?.status ?? null });
  if (round.phase === "active" && round.buttonLockUntilMs > nowMs) return rejectedAction(rawUser, nowMs, "press_rejected", "Button is locked.", { buttonLockUntilMs: round.buttonLockUntilMs });
  if (round.phase !== "active" && round.phase !== "panic") return rejectedAction(rawUser, nowMs, "press_rejected", "Round is not pressable.", { phase: round.phase });
  if (!debit(user.walletId, split.totalMutez, nowMs)) return rejectedAction(rawUser, nowMs, "press_rejected", "Insufficient mocked XTZ balance.", { totalMutez: split.totalMutez });
  lockPlayer(player, round, nowMs);
  player.status = "pressed";
  player.pressedOrder = round.pressOrder.length + 1;
  player.totalPaidMutez += BigInt(split.totalMutez);
  player.totalPotAddedMutez += BigInt(split.potMutez);
  player.totalPlatformPaidMutez += BigInt(split.platformMutez);
  round.pressOrder.push(user.walletId);
  round.nextSeedPotMutez += BigInt(split.potMutez);
  round.platformTakeMutez += BigInt(split.platformMutez);
  if (round.phase === "active") {
    round.phase = "panic";
    round.firstPressedAtMs = nowMs;
    round.panicEndsAtMs = nowMs + RUG_PULL_RULES.panicSeconds * SECOND_MS;
    pushEvent(round, nowMs, "panic", `${user.displayName} pressed first. Panic Mode started.`);
  } else {
    pushEvent(round, nowMs, "panic_press", `${user.displayName} locked shares and entered next-round order.`);
  }
  return acceptedAction(rawUser, nowMs, "button_pressed", "Player pressed and locked Rug Pull shares.", {
    pressedOrder: player.pressedOrder,
    totalMutez: split.totalMutez,
    potMutez: split.potMutez,
    platformMutez: split.platformMutez,
    phase: round.phase,
  });
}

export function joinRugPullWitness(rawUser: ConsoleAuthUser, nowMs = now()) {
  const gameState = ensureState(nowMs);
  const user = walletForUser(rawUser);
  const round = gameState.round;
  if (round.witnesses[user.walletId]) return rejectedAction(rawUser, nowMs, "witness_join_rejected", "You are already a witness.", { reason: "duplicate_witness" });
  const split = splitRugPullPayment("witness");
  if (!debit(user.walletId, split.totalMutez, nowMs)) return rejectedAction(rawUser, nowMs, "witness_join_rejected", "Insufficient mocked XTZ balance.", { totalMutez: split.totalMutez });
  round.witnesses[user.walletId] = {
    walletId: user.walletId,
    displayName: user.displayName,
    joinedAtMs: nowMs,
    vote: null,
  };
  round.potMutez += BigInt(split.potMutez);
  round.platformTakeMutez += BigInt(split.platformMutez);
  pushEvent(round, nowMs, "witness", `${user.displayName} joined as a Witness.`);
  return acceptedAction(rawUser, nowMs, "witness_joined", "Witness joined Rug Pull round.", {
    totalMutez: split.totalMutez,
    potMutez: split.potMutez,
    platformMutez: split.platformMutez,
  });
}

export function voteRugPullWitness(rawUser: ConsoleAuthUser, vote: RugPullVote, nowMs = now()) {
  const gameState = ensureState(nowMs);
  const user = walletForUser(rawUser);
  const round = gameState.round;
  const witness = round.witnesses[user.walletId];
  if (round.phase !== "panic" || !witness || witness.vote) {
    return rejectedAction(rawUser, nowMs, "witness_vote_rejected", "Witness vote is not available.", {
      phase: round.phase,
      hasWitness: Boolean(witness),
      alreadyVoted: Boolean(witness?.vote),
    });
  }
  witness.vote = vote;
  pushEvent(round, nowMs, "vote", `${user.displayName} voted ${vote}.`);
  return acceptedAction(rawUser, nowMs, "witness_vote_cast", "Witness vote recorded.", { vote });
}

export function resetRugPullMockState(nowMs = now()) {
  state = {
    round: newRound(nowMs),
    balances: {
      "mock-wallet-1": 50n * MUTEZ_PER_XTZ,
      "mock-wallet-2": 50n * MUTEZ_PER_XTZ,
      "mock-wallet-3": 50n * MUTEZ_PER_XTZ,
      "mock-wallet-4": 50n * MUTEZ_PER_XTZ,
    },
  };
  auditJournal = createCasinoAuditJournal("rug-pull-service");
  return state;
}
