import { createHash } from "node:crypto";
import {
  GUINEA_PIG_RACEWAY_ASSET_MANIFEST_PATH,
  GUINEA_PIG_RACEWAY_ASSET_ROOT,
} from "./assets";
import { buildRacewayRaceCard, type RacewayRaceCard } from "./race-card";
import { buildRacewayReplayManifestDraft, type RacewayReplayManifestDraft } from "./replay";
import {
  GUINEA_PIG_RACEWAY_RULES,
  buildWinProbabilityBps,
  calculateRacePayouts,
  canAcceptNewBetAtSecond,
  canInjectEffectAtSecond,
  canWalletUseRaceEffect,
  getInjectedEffect,
  getRacePhaseAtSecond,
  splitRacePoolMicrowtf,
  type RacewayBet,
  type RacewayEffectKey,
  type RacewayEntrant,
  type RacewayPhase,
} from "./rules";
import type { ConsoleAuthUser } from "../../../console/types";

const MICRO_WTF_PER_WTF = 1_000_000n;
const SECOND_MS = 1_000;

type RacewayEffect = {
  id: string;
  walletAddress: string;
  displayName: string;
  racerId: string;
  effectKey: RacewayEffectKey;
  second: number;
  costMicrowtf: bigint;
  effectBps: number;
};

type RacewaySettlement = {
  raceId: string;
  settledAtMs: number;
  winningRacerId: string;
  winningRacerName: string;
  houseTakeMicrowtf: bigint;
  winnerPoolMicrowtf: bigint;
  carryoverMicrowtf: bigint;
  payouts: Array<RacewayBet & { payoutMicrowtf: bigint }>;
  replayManifest: RacewayReplayManifestDraft;
};

type RacewayState = {
  raceStartMs: number;
  raceId: string;
  seedCommitment: string;
  card: RacewayRaceCard;
  bets: RacewayBet[];
  effects: RacewayEffect[];
  balances: Record<string, bigint>;
  houseMicrowtf: bigint;
  carryoverMicrowtf: bigint;
  lastSettlement: RacewaySettlement | null;
  events: Array<{ id: string; atMs: number; kind: string; message: string }>;
};

export type RacewayAmountView = {
  microwtf: string;
  wtf: string;
};

export type RacewaySnapshot = {
  title: string;
  shortName: string;
  route: string;
  paymentMode: "mocked_wtf_balances";
  wageringEnabled: false;
  nowMs: number;
  assetRoot: string;
  assetManifestPath: string;
  user: {
    walletId: string;
    displayName: string;
    balance: RacewayAmountView;
  };
  race: {
    raceId: string;
    phase: RacewayPhase;
    elapsedSeconds: number;
    phaseSecondsRemaining: number;
    track: RacewayRaceCard["track"];
    conditions: RacewayRaceCard["conditions"];
    globalVariableBps: Record<string, number>;
    uniquenessProfile: string;
    scheduleSeconds: RacewayRaceCard["scheduleSeconds"];
    houseTakeBps: number;
    pool: RacewayAmountView;
    houseTakeIfSettledNow: RacewayAmountView;
    winnerPoolIfSettledNow: RacewayAmountView;
    carryover: RacewayAmountView;
  };
  entrants: Array<
    RacewayRaceCard["entrants"][number] & {
      modelPath: string;
      thumbnailPath: string;
      lane: number;
      currentProgressBps: number;
      currentPositionMeters: number;
      effectBps: number;
      betTotal: RacewayAmountView;
    }
  >;
  bets: Array<{
    id: string;
    walletAddress: string;
    racerId: string;
    stakeMicrowtf: string;
    stake: RacewayAmountView;
  }>;
  effects: Array<{
    id: string;
    walletAddress: string;
    displayName: string;
    racerId: string;
    effectKey: RacewayEffectKey;
    second: number;
    costMicrowtf: string;
    effectBps: number;
    cost: RacewayAmountView;
  }>;
  userActions: {
    defaultBet: RacewayAmountView;
    canBet: boolean;
    canInjectEffect: boolean;
    betRejectReason: string | null;
    effectRejectReason: string | null;
  };
  lastSettlement: null | {
    raceId: string;
    settledAtMs: number;
    winningRacerId: string;
    winningRacerName: string;
    houseTake: RacewayAmountView;
    winnerPool: RacewayAmountView;
    carryover: RacewayAmountView;
    replayManifest: RacewayReplayManifestDraft;
    payouts: Array<{
      id: string;
      walletAddress: string;
      racerId: string;
      stakeMicrowtf: string;
      payout: RacewayAmountView;
    }>;
  };
  timeline: RacewayState["events"];
};

let state: RacewayState | null = null;

function now() {
  return Date.now();
}

function amount(microwtf: bigint | number): RacewayAmountView {
  const value = BigInt(microwtf);
  const whole = value / MICRO_WTF_PER_WTF;
  const fractional = (value % MICRO_WTF_PER_WTF).toString().padStart(6, "0").replace(/0+$/, "");
  return {
    microwtf: value.toString(),
    wtf: fractional ? `${whole}.${fractional}` : whole.toString(),
  };
}

function walletForUser(user: ConsoleAuthUser) {
  return {
    walletId: `mock-wallet-${user.id}`,
    displayName: user.displayName || user.username || `Player ${user.id}`,
  };
}

function hashNumber(input: string): number {
  const digest = createHash("sha256").update(input).digest();
  return digest.readUInt32BE(0);
}

function newRace(nowMs: number, index = 1, carryoverMicrowtf = 0n, lastSettlement: RacewaySettlement | null = null): RacewayState {
  const raceId = `raceway-${index.toString().padStart(4, "0")}`;
  const seedCommitment = createHash("sha256").update(`${raceId}:${nowMs}:mock`).digest("hex").slice(0, 24);
  return {
    raceStartMs: nowMs,
    raceId,
    seedCommitment,
    card: buildRacewayRaceCard({ raceId, seedCommitment, entrantCount: 6 + (index % 3) }),
    bets: [],
    effects: [],
    balances: {
      "mock-wallet-1": 100n * MICRO_WTF_PER_WTF,
      "mock-wallet-2": 100n * MICRO_WTF_PER_WTF,
      "mock-wallet-3": 100n * MICRO_WTF_PER_WTF,
      "mock-wallet-4": 100n * MICRO_WTF_PER_WTF,
    },
    houseMicrowtf: 0n,
    carryoverMicrowtf,
    lastSettlement,
    events: lastSettlement
      ? [
          {
            id: `race:new:${nowMs}`,
            atMs: nowMs,
            kind: "new_race",
            message: `New race opened with ${amount(carryoverMicrowtf).wtf} WTF carryover.`,
          },
        ]
      : [
          {
            id: `race:start:${nowMs}`,
            atMs: nowMs,
            kind: "race_card",
            message: "Race card opened. Betting window is live.",
          },
        ],
  };
}

function ensureState(nowMs = now()): RacewayState {
  if (!state) state = newRace(nowMs);
  advanceState(nowMs);
  return state;
}

function pushEvent(gameState: RacewayState, atMs: number, kind: string, message: string) {
  gameState.events.unshift({ id: `${kind}:${atMs}:${gameState.events.length}`, atMs, kind, message });
  gameState.events = gameState.events.slice(0, 40);
}

function totalLoopSeconds() {
  return (
    GUINEA_PIG_RACEWAY_RULES.bettingOpenSeconds +
    GUINEA_PIG_RACEWAY_RULES.bettingLockoutSeconds +
    GUINEA_PIG_RACEWAY_RULES.introMarksSeconds +
    GUINEA_PIG_RACEWAY_RULES.raceSeconds +
    GUINEA_PIG_RACEWAY_RULES.replaySeconds
  );
}

function elapsedSeconds(gameState: RacewayState, nowMs: number) {
  return Math.max(0, Math.floor((nowMs - gameState.raceStartMs) / SECOND_MS));
}

function phaseRemainingSeconds(phase: RacewayPhase, elapsed: number) {
  const { bettingOpenSeconds, bettingLockoutSeconds, introMarksSeconds, raceSeconds } =
    GUINEA_PIG_RACEWAY_RULES;
  const cutoffs = {
    betting_open: bettingOpenSeconds,
    betting_lockout: bettingOpenSeconds + bettingLockoutSeconds,
    intro_marks: bettingOpenSeconds + bettingLockoutSeconds + introMarksSeconds,
    racing: bettingOpenSeconds + bettingLockoutSeconds + introMarksSeconds + raceSeconds,
    results_replay: totalLoopSeconds(),
  };
  return Math.max(0, cutoffs[phase] - elapsed);
}

function effectBpsByRacer(gameState: RacewayState): Record<string, number> {
  const byRacer: Record<string, number> = {};
  for (const effect of gameState.effects) {
    byRacer[effect.racerId] = (byRacer[effect.racerId] ?? 0) + effect.effectBps;
  }
  return byRacer;
}

function weightedEntrants(gameState: RacewayState): RacewayEntrant[] {
  const effectBps = effectBpsByRacer(gameState);
  return gameState.card.entrants.map((entrant) => ({
    id: entrant.id,
    name: entrant.displayName,
    stats: entrant.stats,
    trackBiasBps: entrant.trackBiasBps,
    conditionBiasBps: entrant.conditionBiasBps,
    injectedEffectBps: effectBps[entrant.id] ?? 0,
    randomEffectBps:
      (hashNumber(`${gameState.raceId}:${entrant.id}:variance`) %
        (GUINEA_PIG_RACEWAY_RULES.maxRandomEffectSwingBps * 2 + 1)) -
      GUINEA_PIG_RACEWAY_RULES.maxRandomEffectSwingBps,
  }));
}

function selectWinner(gameState: RacewayState) {
  const probabilities = buildWinProbabilityBps(weightedEntrants(gameState));
  const roll = hashNumber(`${gameState.raceId}:${gameState.seedCommitment}:winner`) % 10_000;
  let cursor = 0;
  for (const probability of probabilities) {
    cursor += probability.winProbabilityBps;
    if (roll < cursor) return probability;
  }
  return probabilities[probabilities.length - 1];
}

function settleRace(gameState: RacewayState, nowMs: number): RacewaySettlement {
  const winner = selectWinner(gameState);
  const winnerName =
    gameState.card.entrants.find((entrant) => entrant.id === winner.id)?.displayName ?? winner.id;
  const settled = calculateRacePayouts({
    winningRacerId: winner.id,
    bets: gameState.bets,
  });
  for (const payout of settled.payouts) {
    if (payout.payoutMicrowtf > 0n) {
      gameState.balances[payout.walletAddress] =
        (gameState.balances[payout.walletAddress] ?? 0n) + payout.payoutMicrowtf;
    }
  }
  gameState.houseMicrowtf += settled.houseTakeMicrowtf;
  const replayManifest = buildRacewayReplayManifestDraft({
    raceId: gameState.raceId,
    track: gameState.card.track,
    winnerRacerId: winner.id,
    settlementHash: createHash("sha256")
      .update(`${gameState.raceId}:${winner.id}:${settled.houseTakeMicrowtf}:${settled.winnerPoolMicrowtf}`)
      .digest("hex"),
    effectTimeline: gameState.effects.map((effect) => ({
      second: effect.second,
      walletAddressHash: createHash("sha256").update(effect.walletAddress).digest("hex").slice(0, 12),
      racerId: effect.racerId,
      effectKey: effect.effectKey,
    })),
  });
  const settlement: RacewaySettlement = {
    raceId: gameState.raceId,
    settledAtMs: nowMs,
    winningRacerId: winner.id,
    winningRacerName: winnerName,
    houseTakeMicrowtf: settled.houseTakeMicrowtf,
    winnerPoolMicrowtf: settled.winnerPoolMicrowtf,
    carryoverMicrowtf: settled.carryoverMicrowtf,
    payouts: settled.payouts,
    replayManifest,
  };
  pushEvent(gameState, nowMs, "settled", `${winnerName} crossed first. Replay manifest recorded.`);
  return settlement;
}

function advanceState(nowMs: number) {
  if (!state) return;
  const elapsed = elapsedSeconds(state, nowMs);
  if (elapsed >= totalLoopSeconds()) {
    const settlement = state.lastSettlement?.raceId === state.raceId ? state.lastSettlement : settleRace(state, nowMs);
    const nextIndex = Number(state.raceId.split("-")[1] ?? "1") + 1;
    const balances = state.balances;
    const house = state.houseMicrowtf;
    state = newRace(nowMs, nextIndex, settlement.carryoverMicrowtf, settlement);
    state.balances = balances;
    state.houseMicrowtf = house;
  } else if (getRacePhaseAtSecond(elapsed) === "results_replay" && state.lastSettlement?.raceId !== state.raceId) {
    state.lastSettlement = settleRace(state, nowMs);
  }
}

function modelPath(racerId: string) {
  return `${GUINEA_PIG_RACEWAY_ASSET_ROOT}/models/racers/${racerId}.glb`;
}

function thumbnailPath(racerId: string) {
  return `${GUINEA_PIG_RACEWAY_ASSET_ROOT}/thumbnails/${racerId}.svg`;
}

function progressFor(gameState: RacewayState, racerId: string, phase: RacewayPhase, elapsed: number, lane: number) {
  if (phase === "betting_open" || phase === "betting_lockout") return 0;
  const introStart =
    GUINEA_PIG_RACEWAY_RULES.bettingOpenSeconds + GUINEA_PIG_RACEWAY_RULES.bettingLockoutSeconds;
  const raceStart = introStart + GUINEA_PIG_RACEWAY_RULES.introMarksSeconds;
  if (phase === "intro_marks") return Math.min(600, (elapsed - introStart) * 20);
  const winner = selectWinner(gameState);
  const raceElapsed = Math.max(0, Math.min(GUINEA_PIG_RACEWAY_RULES.raceSeconds, elapsed - raceStart));
  const base = Math.round((raceElapsed / GUINEA_PIG_RACEWAY_RULES.raceSeconds) * 10_000);
  const variance = (hashNumber(`${gameState.raceId}:${racerId}:lane:${lane}`) % 1_200) - 500;
  const winnerBoost = racerId === winner.id ? 850 : 0;
  return Math.max(0, Math.min(10_000, base + variance + winnerBoost));
}

export function getRacewaySnapshot(rawUser: ConsoleAuthUser, nowMs = now()): RacewaySnapshot {
  const gameState = ensureState(nowMs);
  const user = walletForUser(rawUser);
  const balance = gameState.balances[user.walletId] ?? 100n * MICRO_WTF_PER_WTF;
  gameState.balances[user.walletId] = balance;
  const elapsed = elapsedSeconds(gameState, nowMs);
  const phase = getRacePhaseAtSecond(elapsed);
  const poolTotal = gameState.bets.reduce((sum, bet) => sum + BigInt(bet.stakeMicrowtf), gameState.carryoverMicrowtf);
  const split = splitRacePoolMicrowtf(poolTotal);
  const effectBps = effectBpsByRacer(gameState);
  const betsByRacer = new Map<string, bigint>();
  for (const bet of gameState.bets) {
    betsByRacer.set(bet.racerId, (betsByRacer.get(bet.racerId) ?? 0n) + BigInt(bet.stakeMicrowtf));
  }
  return {
    title: "Guinea Pig Raceway",
    shortName: "Raceway",
    route: "/casino/guinea-pig-raceway",
    paymentMode: "mocked_wtf_balances",
    wageringEnabled: false,
    nowMs,
    assetRoot: GUINEA_PIG_RACEWAY_ASSET_ROOT,
    assetManifestPath: GUINEA_PIG_RACEWAY_ASSET_MANIFEST_PATH,
    user: {
      walletId: user.walletId,
      displayName: user.displayName,
      balance: amount(balance),
    },
    race: {
      raceId: gameState.raceId,
      phase,
      elapsedSeconds: elapsed,
      phaseSecondsRemaining: phaseRemainingSeconds(phase, elapsed),
      track: gameState.card.track,
      conditions: gameState.card.conditions,
      globalVariableBps: gameState.card.globalVariableBps,
      uniquenessProfile: gameState.card.uniquenessProfile,
      scheduleSeconds: gameState.card.scheduleSeconds,
      houseTakeBps: GUINEA_PIG_RACEWAY_RULES.houseTakeBps,
      pool: amount(poolTotal),
      houseTakeIfSettledNow: amount(split.houseTakeMicrowtf),
      winnerPoolIfSettledNow: amount(split.winnerPoolMicrowtf),
      carryover: amount(gameState.carryoverMicrowtf),
    },
    entrants: gameState.card.entrants.map((entrant, index) => {
      const progress = progressFor(gameState, entrant.id, phase, elapsed, index + 1);
      return {
        ...entrant,
        modelPath: modelPath(entrant.id),
        thumbnailPath: thumbnailPath(entrant.id),
        lane: index + 1,
        currentProgressBps: progress,
        currentPositionMeters: Math.round((gameState.card.track.lengthMeters * progress) / 10_000),
        effectBps: effectBps[entrant.id] ?? 0,
        betTotal: amount(betsByRacer.get(entrant.id) ?? 0n),
      };
    }),
    bets: gameState.bets.map((bet) => ({
      id: bet.id,
      walletAddress: bet.walletAddress,
      racerId: bet.racerId,
      stakeMicrowtf: BigInt(bet.stakeMicrowtf).toString(),
      stake: amount(bet.stakeMicrowtf),
    })),
    effects: gameState.effects.map((effect) => ({
      id: effect.id,
      walletAddress: effect.walletAddress,
      displayName: effect.displayName,
      racerId: effect.racerId,
      effectKey: effect.effectKey,
      second: effect.second,
      costMicrowtf: effect.costMicrowtf.toString(),
      effectBps: effect.effectBps,
      cost: amount(effect.costMicrowtf),
    })),
    userActions: {
      defaultBet: amount(GUINEA_PIG_RACEWAY_RULES.minBetMicrowtf),
      canBet: canAcceptNewBetAtSecond(elapsed) && balance >= BigInt(GUINEA_PIG_RACEWAY_RULES.minBetMicrowtf),
      canInjectEffect: canInjectEffectAtSecond(elapsed),
      betRejectReason: canAcceptNewBetAtSecond(elapsed) ? null : "Betting lockout is closed for this race.",
      effectRejectReason: canInjectEffectAtSecond(elapsed) ? null : "Effects unlock only while the race is live.",
    },
    lastSettlement: gameState.lastSettlement
      ? {
          raceId: gameState.lastSettlement.raceId,
          settledAtMs: gameState.lastSettlement.settledAtMs,
          winningRacerId: gameState.lastSettlement.winningRacerId,
          winningRacerName: gameState.lastSettlement.winningRacerName,
          houseTake: amount(gameState.lastSettlement.houseTakeMicrowtf),
          winnerPool: amount(gameState.lastSettlement.winnerPoolMicrowtf),
          carryover: amount(gameState.lastSettlement.carryoverMicrowtf),
          replayManifest: gameState.lastSettlement.replayManifest,
          payouts: gameState.lastSettlement.payouts.map((payout) => ({
            id: payout.id,
            walletAddress: payout.walletAddress,
            racerId: payout.racerId,
            stakeMicrowtf: BigInt(payout.stakeMicrowtf).toString(),
            payout: amount(payout.payoutMicrowtf),
          })),
        }
      : null,
    timeline: gameState.events,
  };
}

export function placeRacewayBet(rawUser: ConsoleAuthUser, racerId: string, stakeMicrowtf: bigint, nowMs = now()) {
  const gameState = ensureState(nowMs);
  const user = walletForUser(rawUser);
  const elapsed = elapsedSeconds(gameState, nowMs);
  if (!canAcceptNewBetAtSecond(elapsed)) {
    return { ok: false, error: "Betting window is closed.", snapshot: getRacewaySnapshot(rawUser, nowMs) };
  }
  if (!gameState.card.entrants.some((entrant) => entrant.id === racerId)) {
    return { ok: false, error: "Unknown racer.", snapshot: getRacewaySnapshot(rawUser, nowMs) };
  }
  if (stakeMicrowtf < BigInt(GUINEA_PIG_RACEWAY_RULES.minBetMicrowtf)) {
    return { ok: false, error: "Stake is below table minimum.", snapshot: getRacewaySnapshot(rawUser, nowMs) };
  }
  const balance = gameState.balances[user.walletId] ?? 100n * MICRO_WTF_PER_WTF;
  if (balance < stakeMicrowtf) {
    return { ok: false, error: "Insufficient mocked WTF balance.", snapshot: getRacewaySnapshot(rawUser, nowMs) };
  }
  gameState.balances[user.walletId] = balance - stakeMicrowtf;
  const bet: RacewayBet = {
    id: `bet:${gameState.raceId}:${user.walletId}:${gameState.bets.length}`,
    walletAddress: user.walletId,
    racerId,
    stakeMicrowtf,
  };
  gameState.bets.push(bet);
  const racer = gameState.card.entrants.find((entrant) => entrant.id === racerId);
  pushEvent(gameState, nowMs, "bet", `${user.displayName} backed ${racer?.displayName ?? racerId} for ${amount(stakeMicrowtf).wtf} WTF.`);
  return { ok: true, snapshot: getRacewaySnapshot(rawUser, nowMs) };
}

export function injectRacewayEffect(
  rawUser: ConsoleAuthUser,
  racerId: string,
  effectKey: RacewayEffectKey,
  nowMs = now()
) {
  const gameState = ensureState(nowMs);
  const user = walletForUser(rawUser);
  const elapsed = elapsedSeconds(gameState, nowMs);
  const effect = getInjectedEffect(effectKey);
  if (!canInjectEffectAtSecond(elapsed) || !effect) {
    return { ok: false, error: "Effect is not available right now.", snapshot: getRacewaySnapshot(rawUser, nowMs) };
  }
  if (!gameState.card.entrants.some((entrant) => entrant.id === racerId)) {
    return { ok: false, error: "Unknown racer.", snapshot: getRacewaySnapshot(rawUser, nowMs) };
  }
  const walletEffects = gameState.effects.filter((entry) => entry.walletAddress === user.walletId);
  const racerEffects = gameState.effects.filter((entry) => entry.racerId === racerId);
  const lastWalletEffect = walletEffects.at(-1);
  const secondsSinceLast =
    lastWalletEffect == null ? null : Math.max(0, elapsed - lastWalletEffect.second);
  if (
    !canWalletUseRaceEffect({
      priorEffectsByWallet: walletEffects.length,
      priorEffectsOnRacer: racerEffects.length,
      secondsSinceLastEffectByWallet: secondsSinceLast,
    })
  ) {
    return { ok: false, error: "Effect cap or cooldown blocked this cheat.", snapshot: getRacewaySnapshot(rawUser, nowMs) };
  }
  const cost = BigInt(effect.costMicrowtf);
  const balance = gameState.balances[user.walletId] ?? 100n * MICRO_WTF_PER_WTF;
  if (balance < cost) {
    return { ok: false, error: "Insufficient mocked WTF balance.", snapshot: getRacewaySnapshot(rawUser, nowMs) };
  }
  gameState.balances[user.walletId] = balance - cost;
  gameState.houseMicrowtf += cost;
  const record: RacewayEffect = {
    id: `effect:${gameState.raceId}:${user.walletId}:${gameState.effects.length}`,
    walletAddress: user.walletId,
    displayName: user.displayName,
    racerId,
    effectKey,
    second: elapsed,
    costMicrowtf: cost,
    effectBps: effect.effectBps,
  };
  gameState.effects.push(record);
  const racer = gameState.card.entrants.find((entrant) => entrant.id === racerId);
  pushEvent(gameState, nowMs, "effect", `${user.displayName} used ${effect.label} on ${racer?.displayName ?? racerId}.`);
  return { ok: true, snapshot: getRacewaySnapshot(rawUser, nowMs) };
}

export function resetRacewayMockState(nowMs = now()) {
  state = newRace(nowMs);
  return state;
}
