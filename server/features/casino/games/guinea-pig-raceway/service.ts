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
  canAcceptNewBetAtSecond,
  canInjectEffectAtSecond,
  canWalletUseRaceEffect,
  getInjectedEffect,
  getRacePhaseAtSecond,
  type RacewayEffectKey,
  type RacewayEntrant,
  type RacewayPhase,
} from "./rules";
import {
  buildRacewayToteBoard,
  normalizeRacewaySelections,
  settleRacewayTote,
  type RacewayOfficialStatus,
  type RacewayTicket,
  type RacewayTicketSettlement,
  type RacewayToteBoard,
  type RacewayToteSettlement,
  type RacewayWagerType,
} from "./tote";
import type { ConsoleAuthUser } from "../../../console/types";
import {
  appendCasinoAuditEvent,
  createCasinoAuditJournal,
  summarizeCasinoAuditJournal,
  type CasinoAuditEventInput,
  type CasinoAuditJournal,
  type CasinoAuditSummary,
} from "../../audit";

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
  officialStatus: RacewayOfficialStatus;
  winningRacerId: string;
  winningRacerName: string;
  finishOrder: string[];
  totalHandleMicrowtf: bigint;
  houseTakeMicrowtf: bigint;
  breakageMicrowtf: bigint;
  winnerPoolMicrowtf: bigint;
  carryoverMicrowtf: bigint;
  auditHash: string;
  ticketResults: RacewayTicketSettlement[];
  toteSettlement: RacewayToteSettlement;
  replayManifest: RacewayReplayManifestDraft;
};

type RacewayState = {
  raceStartMs: number;
  raceId: string;
  seedCommitment: string;
  card: RacewayRaceCard;
  tickets: RacewayTicket[];
  effects: RacewayEffect[];
  balances: Record<string, bigint>;
  houseMicrowtf: bigint;
  carryoverMicrowtf: bigint;
  lastSettlement: RacewaySettlement | null;
  audit: CasinoAuditJournal;
  events: Array<{ id: string; atMs: number; kind: string; message: string }>;
};

type RacewayActionResult =
  | { ok: true; snapshot: RacewaySnapshot }
  | { ok: false; error: string; snapshot: RacewaySnapshot };

export type RacewayAmountView = {
  microwtf: string;
  wtf: string;
};

type RacewayPoolSummaryView = {
  wagerType: RacewayWagerType;
  gross: RacewayAmountView;
  takeout: RacewayAmountView;
  net: RacewayAmountView;
  breakage: RacewayAmountView;
  carryover: RacewayAmountView;
  ticketCount: number;
};

type RacewayToteBoardView = {
  totalHandle: RacewayAmountView;
  poolSummaries: RacewayPoolSummaryView[];
  winOdds: Array<{
    racerId: string;
    pool: RacewayAmountView;
    approximatePayoutPerWtf: RacewayAmountView | null;
  }>;
};

export type RacewaySnapshot = {
  title: string;
  shortName: string;
  route: string;
  paymentMode: "mocked_wtf_balances";
  wageringEnabled: false;
  tokenPolicy: {
    asset: "WTF";
    entertainmentOnly: true;
    cashValue: "none";
    statement: string;
  };
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
    toteBoard: RacewayToteBoardView;
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
    wagerType: RacewayWagerType;
    selections: string[];
    status: string;
    stakeMicrowtf: string;
    stake: RacewayAmountView;
  }>;
  tickets: Array<{
    id: string;
    raceId: string;
    walletAddress: string;
    wagerType: RacewayWagerType;
    selections: string[];
    status: string;
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
    officialStatus: RacewayOfficialStatus;
    winningRacerId: string;
    winningRacerName: string;
    finishOrder: string[];
    totalHandle: RacewayAmountView;
    houseTake: RacewayAmountView;
    breakage: RacewayAmountView;
    winnerPool: RacewayAmountView;
    carryover: RacewayAmountView;
    auditHash: string;
    replayManifest: RacewayReplayManifestDraft;
    payouts: Array<{
      id: string;
      walletAddress: string;
      racerId: string;
      wagerType: RacewayWagerType;
      selections: string[];
      status: string;
      stakeMicrowtf: string;
      payout: RacewayAmountView;
      refund: RacewayAmountView;
    }>;
  };
  timeline: RacewayState["events"];
  audit: CasinoAuditSummary;
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

function viewToteBoard(board: RacewayToteBoard): RacewayToteBoardView {
  return {
    totalHandle: amount(board.totalHandleMicrowtf),
    poolSummaries: board.poolSummaries.map((pool) => ({
      wagerType: pool.wagerType,
      gross: amount(pool.grossMicrowtf),
      takeout: amount(pool.takeoutMicrowtf),
      net: amount(pool.netMicrowtf),
      breakage: amount(pool.breakageMicrowtf),
      carryover: amount(pool.carryoverMicrowtf),
      ticketCount: pool.ticketCount,
    })),
    winOdds: board.winOdds.map((entry) => ({
      racerId: entry.racerId,
      pool: amount(entry.poolMicrowtf),
      approximatePayoutPerWtf:
        entry.approximatePayoutPerWtfMicrowtf == null
          ? null
          : amount(entry.approximatePayoutPerWtfMicrowtf),
    })),
  };
}

function walletForUser(user: ConsoleAuthUser) {
  return {
    walletId: `mock-wallet-${user.id}`,
    displayName: user.displayName || user.username || `Player ${user.id}`,
  };
}

function recordRacewayAudit(
  gameState: RacewayState,
  input: Omit<CasinoAuditEventInput, "gameKey">
) {
  gameState.audit = appendCasinoAuditEvent(
    gameState.audit,
    {
      ...input,
      gameKey: "guinea-pig-raceway",
    },
    180
  );
}

function hashNumber(input: string): number {
  const digest = createHash("sha256").update(input).digest();
  return digest.readUInt32BE(0);
}

function newRace(
  nowMs: number,
  index = 1,
  carryoverMicrowtf = 0n,
  lastSettlement: RacewaySettlement | null = null,
  audit = createCasinoAuditJournal("guinea-pig-raceway-service")
): RacewayState {
  const raceId = `raceway-${index.toString().padStart(4, "0")}`;
  const seedCommitment = createHash("sha256").update(`${raceId}:${nowMs}:mock`).digest("hex").slice(0, 24);
  const card = buildRacewayRaceCard({ raceId, seedCommitment, entrantCount: 6 + (index % 3) });
  const next: RacewayState = {
    raceStartMs: nowMs,
    raceId,
    seedCommitment,
    card,
    tickets: [],
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
    audit,
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
  recordRacewayAudit(next, {
    atMs: nowMs,
    scope: raceId,
    action: lastSettlement ? "race_reopened" : "race_card_opened",
    actorId: null,
    severity: "info",
    message: lastSettlement
      ? "Raceway opened the next race after replay settlement."
      : "Raceway race card opened.",
    payload: {
      raceId,
      seedCommitment,
      entrantCount: card.entrants.length,
      trackKey: card.track.key,
      carryoverMicrowtf,
      uniquenessProfile: card.uniquenessProfile,
    },
  });
  return next;
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

function selectFinishOrder(gameState: RacewayState): string[] {
  const winner = selectWinner(gameState);
  const rest = gameState.card.entrants
    .filter((entrant) => entrant.id !== winner.id)
    .sort((a, b) => {
      const scoreA = hashNumber(`${gameState.raceId}:${gameState.seedCommitment}:${a.id}:finish`);
      const scoreB = hashNumber(`${gameState.raceId}:${gameState.seedCommitment}:${b.id}:finish`);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.id.localeCompare(b.id);
    })
    .map((entrant) => entrant.id);
  return [winner.id, ...rest];
}

function buildSettlementAuditHash(input: {
  raceId: string;
  seedCommitment: string;
  uniquenessProfile: string;
  finishOrder: string[];
  tickets: RacewayTicket[];
  effects: RacewayEffect[];
  toteSettlement: RacewayToteSettlement;
}) {
  const payload = {
    raceId: input.raceId,
    seedCommitment: input.seedCommitment,
    uniquenessProfile: input.uniquenessProfile,
    finishOrder: input.finishOrder,
    tickets: input.tickets.map((ticket) => ({
      id: ticket.id,
      walletAddressHash: createHash("sha256").update(ticket.walletAddress).digest("hex").slice(0, 16),
      wagerType: ticket.wagerType,
      selections: ticket.selections,
      stakeMicrowtf: BigInt(ticket.stakeMicrowtf).toString(),
      acceptedAtMs: ticket.acceptedAtMs,
      status: ticket.status,
    })),
    effects: input.effects.map((effect) => ({
      id: effect.id,
      walletAddressHash: createHash("sha256").update(effect.walletAddress).digest("hex").slice(0, 16),
      racerId: effect.racerId,
      effectKey: effect.effectKey,
      second: effect.second,
      costMicrowtf: effect.costMicrowtf.toString(),
      effectBps: effect.effectBps,
    })),
    settlement: {
      officialStatus: input.toteSettlement.officialStatus,
      totalHandleMicrowtf: input.toteSettlement.totalHandleMicrowtf.toString(),
      houseMicrowtf: input.toteSettlement.houseMicrowtf.toString(),
      breakageMicrowtf: input.toteSettlement.breakageMicrowtf.toString(),
      carryoverMicrowtf: input.toteSettlement.carryoverMicrowtf.toString(),
      tickets: input.toteSettlement.ticketResults.map((ticket) => ({
        id: ticket.id,
        status: ticket.status,
        payoutMicrowtf: ticket.payoutMicrowtf.toString(),
        refundMicrowtf: ticket.refundMicrowtf.toString(),
      })),
    },
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function settleRace(gameState: RacewayState, nowMs: number): RacewaySettlement {
  const finishOrder = selectFinishOrder(gameState);
  const winner = gameState.card.entrants.find((entrant) => entrant.id === finishOrder[0]);
  const winnerName =
    winner?.displayName ?? finishOrder[0] ?? "unknown racer";
  const toteSettlement = settleRacewayTote({
    finishOrder,
    tickets: gameState.tickets,
  });
  for (const ticket of toteSettlement.ticketResults) {
    const credit = ticket.payoutMicrowtf + ticket.refundMicrowtf;
    if (credit > 0n) {
      gameState.balances[ticket.walletAddress] =
        (gameState.balances[ticket.walletAddress] ?? 0n) + credit;
    }
  }
  gameState.houseMicrowtf += toteSettlement.houseMicrowtf;
  const auditHash = buildSettlementAuditHash({
    raceId: gameState.raceId,
    seedCommitment: gameState.seedCommitment,
    uniquenessProfile: gameState.card.uniquenessProfile,
    finishOrder,
    tickets: gameState.tickets,
    effects: gameState.effects,
    toteSettlement,
  });
  const replayManifest = buildRacewayReplayManifestDraft({
    raceId: gameState.raceId,
    track: gameState.card.track,
    winnerRacerId: finishOrder[0],
    settlementHash: auditHash,
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
    officialStatus: toteSettlement.officialStatus,
    winningRacerId: finishOrder[0],
    winningRacerName: winnerName,
    finishOrder,
    totalHandleMicrowtf: toteSettlement.totalHandleMicrowtf,
    houseTakeMicrowtf: toteSettlement.houseMicrowtf,
    breakageMicrowtf: toteSettlement.breakageMicrowtf,
    winnerPoolMicrowtf: toteSettlement.totalHandleMicrowtf - toteSettlement.takeoutMicrowtf,
    carryoverMicrowtf: toteSettlement.carryoverMicrowtf,
    auditHash,
    ticketResults: toteSettlement.ticketResults,
    toteSettlement,
    replayManifest,
  };
  pushEvent(
    gameState,
    nowMs,
    "settled",
    `${winnerName} crossed first. Official tote settlement ${auditHash.slice(0, 10)} recorded.`
  );
  recordRacewayAudit(gameState, {
    atMs: nowMs,
    scope: gameState.raceId,
    action: "race_settled",
    actorId: null,
    severity: "settlement",
    message: "Raceway race settled with official tote results.",
    payload: {
      officialStatus: toteSettlement.officialStatus,
      winningRacerId: finishOrder[0],
      finishOrder,
      totalHandleMicrowtf: toteSettlement.totalHandleMicrowtf,
      houseMicrowtf: toteSettlement.houseMicrowtf,
      breakageMicrowtf: toteSettlement.breakageMicrowtf,
      carryoverMicrowtf: toteSettlement.carryoverMicrowtf,
      ticketCount: toteSettlement.ticketResults.length,
      settlementHash: auditHash,
    },
  });
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
    const audit = state.audit;
    state = newRace(nowMs, nextIndex, settlement.carryoverMicrowtf, settlement, audit);
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
  const toteBoard = buildRacewayToteBoard({
    tickets: gameState.tickets,
    fieldRacerIds: gameState.card.entrants.map((entrant) => entrant.id),
  });
  const toteTakeout = toteBoard.poolSummaries.reduce((sum, pool) => sum + pool.takeoutMicrowtf, 0n);
  const toteNet = toteBoard.totalHandleMicrowtf - toteTakeout + gameState.carryoverMicrowtf;
  const poolTotal = toteBoard.totalHandleMicrowtf + gameState.carryoverMicrowtf;
  const effectBps = effectBpsByRacer(gameState);
  const betsByRacer = new Map<string, bigint>();
  for (const ticket of gameState.tickets) {
    if (ticket.status !== "accepted") continue;
    const racerId = ticket.selections[0];
    betsByRacer.set(racerId, (betsByRacer.get(racerId) ?? 0n) + BigInt(ticket.stakeMicrowtf));
  }
  return {
    title: "Guinea Pig Raceway",
    shortName: "Raceway",
    route: "/casino/guinea-pig-raceway",
    paymentMode: "mocked_wtf_balances",
    wageringEnabled: false,
    tokenPolicy: {
      asset: "WTF",
      entertainmentOnly: true,
      cashValue: "none",
      statement: GUINEA_PIG_RACEWAY_RULES.tokenValueStatement,
    },
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
      houseTakeIfSettledNow: amount(toteTakeout),
      winnerPoolIfSettledNow: amount(toteNet),
      carryover: amount(gameState.carryoverMicrowtf),
      toteBoard: viewToteBoard(toteBoard),
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
    bets: gameState.tickets.map((ticket) => ({
      id: ticket.id,
      walletAddress: ticket.walletAddress,
      racerId: ticket.selections[0],
      wagerType: ticket.wagerType,
      selections: ticket.selections,
      status: ticket.status,
      stakeMicrowtf: BigInt(ticket.stakeMicrowtf).toString(),
      stake: amount(ticket.stakeMicrowtf),
    })),
    tickets: gameState.tickets.map((ticket) => ({
      id: ticket.id,
      raceId: ticket.raceId,
      walletAddress: ticket.walletAddress,
      wagerType: ticket.wagerType,
      selections: ticket.selections,
      status: ticket.status,
      stakeMicrowtf: BigInt(ticket.stakeMicrowtf).toString(),
      stake: amount(ticket.stakeMicrowtf),
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
          officialStatus: gameState.lastSettlement.officialStatus,
          winningRacerId: gameState.lastSettlement.winningRacerId,
          winningRacerName: gameState.lastSettlement.winningRacerName,
          finishOrder: gameState.lastSettlement.finishOrder,
          totalHandle: amount(gameState.lastSettlement.totalHandleMicrowtf),
          houseTake: amount(gameState.lastSettlement.houseTakeMicrowtf),
          breakage: amount(gameState.lastSettlement.breakageMicrowtf),
          winnerPool: amount(gameState.lastSettlement.winnerPoolMicrowtf),
          carryover: amount(gameState.lastSettlement.carryoverMicrowtf),
          auditHash: gameState.lastSettlement.auditHash,
          replayManifest: gameState.lastSettlement.replayManifest,
          payouts: gameState.lastSettlement.ticketResults.map((ticket) => ({
            id: ticket.id,
            walletAddress: ticket.walletAddress,
            racerId: ticket.selections[0],
            wagerType: ticket.wagerType,
            selections: ticket.selections,
            status: ticket.status,
            stakeMicrowtf: BigInt(ticket.stakeMicrowtf).toString(),
            payout: amount(ticket.payoutMicrowtf),
            refund: amount(ticket.refundMicrowtf),
          })),
        }
      : null,
    timeline: gameState.events,
    audit: summarizeCasinoAuditJournal(gameState.audit),
  };
}

function rejectedRacewayAction(
  rawUser: ConsoleAuthUser,
  gameState: RacewayState,
  user: ReturnType<typeof walletForUser>,
  nowMs: number,
  action: string,
  error: string,
  payload: Record<string, unknown> = {}
): RacewayActionResult {
  recordRacewayAudit(gameState, {
    atMs: nowMs,
    scope: gameState.raceId,
    action,
    actorId: user.walletId,
    severity: "rejection",
    message: error,
    payload,
  });
  return { ok: false, error, snapshot: getRacewaySnapshot(rawUser, nowMs) };
}

function acceptedRacewayAction(
  rawUser: ConsoleAuthUser,
  gameState: RacewayState,
  user: ReturnType<typeof walletForUser>,
  nowMs: number,
  action: string,
  message: string,
  payload: Record<string, unknown> = {}
): RacewayActionResult {
  recordRacewayAudit(gameState, {
    atMs: nowMs,
    scope: gameState.raceId,
    action,
    actorId: user.walletId,
    severity: "info",
    message,
    payload,
  });
  return { ok: true, snapshot: getRacewaySnapshot(rawUser, nowMs) };
}

export function placeRacewayBet(
  rawUser: ConsoleAuthUser,
  racerId: string,
  stakeMicrowtf: bigint,
  nowMs = now(),
  wagerType: RacewayWagerType = "win",
  selections?: string[]
) {
  const gameState = ensureState(nowMs);
  const user = walletForUser(rawUser);
  const elapsed = elapsedSeconds(gameState, nowMs);
  if (!canAcceptNewBetAtSecond(elapsed)) {
    return rejectedRacewayAction(rawUser, gameState, user, nowMs, "bet_rejected", "Betting window is closed.", {
      elapsed,
      phase: getRacePhaseAtSecond(elapsed),
      wagerType,
    });
  }
  let normalizedSelections: string[];
  try {
    normalizedSelections = normalizeRacewaySelections({
      wagerType,
      selections: selections?.length ? selections : [racerId],
      fieldRacerIds: gameState.card.entrants.map((entrant) => entrant.id),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid ticket selections.";
    return rejectedRacewayAction(rawUser, gameState, user, nowMs, "bet_rejected", message, {
      wagerType,
      selections: selections?.length ? selections : [racerId],
    });
  }
  if (stakeMicrowtf < BigInt(GUINEA_PIG_RACEWAY_RULES.minBetMicrowtf)) {
    return rejectedRacewayAction(rawUser, gameState, user, nowMs, "bet_rejected", "Stake is below table minimum.", {
      wagerType,
      stakeMicrowtf,
      minimumMicrowtf: GUINEA_PIG_RACEWAY_RULES.minBetMicrowtf,
    });
  }
  const balance = gameState.balances[user.walletId] ?? 100n * MICRO_WTF_PER_WTF;
  if (balance < stakeMicrowtf) {
    return rejectedRacewayAction(rawUser, gameState, user, nowMs, "bet_rejected", "Insufficient mocked WTF balance.", {
      wagerType,
      stakeMicrowtf,
      balanceMicrowtf: balance,
    });
  }
  gameState.balances[user.walletId] = balance - stakeMicrowtf;
  const ticket: RacewayTicket = {
    id: `ticket:${gameState.raceId}:${wagerType}:${user.walletId}:${gameState.tickets.length}`,
    raceId: gameState.raceId,
    walletAddress: user.walletId,
    wagerType,
    selections: normalizedSelections,
    stakeMicrowtf,
    acceptedAtMs: nowMs,
    status: "accepted",
  };
  gameState.tickets.push(ticket);
  const labels = normalizedSelections
    .map((selection) => gameState.card.entrants.find((entrant) => entrant.id === selection)?.displayName ?? selection)
    .join(" / ");
  pushEvent(
    gameState,
    nowMs,
    "ticket",
    `${user.displayName} bought ${wagerType.toUpperCase()} ticket on ${labels} for ${amount(stakeMicrowtf).wtf} WTF.`
  );
  return acceptedRacewayAction(rawUser, gameState, user, nowMs, "ticket_accepted", "Raceway tote ticket accepted.", {
    ticketId: ticket.id,
    wagerType,
    selections: normalizedSelections,
    stakeMicrowtf,
  });
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
    return rejectedRacewayAction(rawUser, gameState, user, nowMs, "effect_rejected", "Effect is not available right now.", {
      elapsed,
      phase: getRacePhaseAtSecond(elapsed),
      effectKey,
    });
  }
  if (!gameState.card.entrants.some((entrant) => entrant.id === racerId)) {
    return rejectedRacewayAction(rawUser, gameState, user, nowMs, "effect_rejected", "Unknown racer.", {
      racerId,
      effectKey,
    });
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
    return rejectedRacewayAction(rawUser, gameState, user, nowMs, "effect_rejected", "Effect cap or cooldown blocked this cheat.", {
      racerId,
      effectKey,
      priorEffectsByWallet: walletEffects.length,
      priorEffectsOnRacer: racerEffects.length,
      secondsSinceLastEffectByWallet: secondsSinceLast,
    });
  }
  const cost = BigInt(effect.costMicrowtf);
  const balance = gameState.balances[user.walletId] ?? 100n * MICRO_WTF_PER_WTF;
  if (balance < cost) {
    return rejectedRacewayAction(rawUser, gameState, user, nowMs, "effect_rejected", "Insufficient mocked WTF balance.", {
      racerId,
      effectKey,
      costMicrowtf: cost,
      balanceMicrowtf: balance,
    });
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
  return acceptedRacewayAction(rawUser, gameState, user, nowMs, "effect_accepted", "Raceway effect accepted.", {
    effectId: record.id,
    racerId,
    effectKey,
    costMicrowtf: cost,
    effectBps: effect.effectBps,
    second: elapsed,
  });
}

export function resetRacewayMockState(nowMs = now()) {
  state = newRace(nowMs);
  return state;
}
