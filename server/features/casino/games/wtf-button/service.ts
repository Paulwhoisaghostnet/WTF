import {
  createWtfButtonGameState,
  formatMutez,
  getRottenness,
  getRoundState,
  MUTEZ_PER_XTZ,
  quotePress,
  resolveClash,
  secondsRemaining,
  settleRound,
  maybeRestartButton,
  pressButton,
  type WtfButtonGameState,
  type WtfButtonId,
  type WtfButtonParticipant,
  type WtfButtonPressQuote,
  type WtfButtonPriceProtectionMode,
  type WtfButtonRound,
  type WtfButtonUser,
} from "./rules";
import {
  appendCasinoAuditEvent,
  createCasinoAuditJournal,
  summarizeCasinoAuditJournal,
  type CasinoAuditEventInput,
  type CasinoAuditSummary,
} from "../../audit";

export type WtfButtonAmountView = {
  mutez: string;
  xtz: string;
};

export type WtfButtonQuoteView = {
  id: string;
  buttonId: WtfButtonId;
  roundId: string;
  quotedCost: WtfButtonAmountView;
  actualCost: WtfButtonAmountView;
  maxAcceptedCost: WtfButtonAmountView;
  priceProtectionMode: WtfButtonPriceProtectionMode;
  tolerance: WtfButtonAmountView;
  quoteTimestampMs: number;
  houseCut: WtfButtonAmountView;
  potAdd: WtfButtonAmountView;
  timeAddedSeconds: number;
  canPress: boolean;
  reason: string | null;
};

export type WtfButtonParticipantView = {
  walletId: string;
  displayName: string;
  presses: number;
  totalPaid: WtfButtonAmountView;
  totalPotAdded: WtfButtonAmountView;
  totalWtfPaid: WtfButtonAmountView;
  lastPressAtMs: number | null;
  lastStatus: WtfButtonParticipant["lastStatus"];
};

export type WtfButtonTableView = {
  buttonId: WtfButtonId;
  color: string;
  name: string;
  tableName: string;
  roundId: string;
  currentPot: WtfButtonAmountView;
  currentLeader: {
    walletId: string | null;
    displayName: string | null;
    leaderSinceMs: number | null;
    leaderForSeconds: number;
    origin: string | null;
    paidIntoButton: WtfButtonAmountView;
    presses: number;
    estimatedPayoutIfExpiresNow: WtfButtonAmountView;
  };
  countdownEndMs: number;
  roundStartMs: number;
  timeRemainingSeconds: number;
  roundAgeSeconds: number;
  startDurationSeconds: number;
  maxRoundAgeSeconds: number;
  totalPressCount: number;
  uniquePresserCount: number;
  wtfEarnings: WtfButtonAmountView;
  state: ReturnType<typeof getRoundState>;
  rottenness: ReturnType<typeof getRottenness>;
  dangerZone: boolean;
  rugClash: {
    active: boolean;
    countdownSeconds: number;
    entrants: Array<{
      walletId: string;
      displayName: string;
      paid: WtfButtonAmountView;
      potAdd: WtfButtonAmountView;
      wtfPaid: WtfButtonAmountView;
    }>;
    potAdded: WtfButtonAmountView;
    wtfEarned: WtfButtonAmountView;
    selectedWalletId: string | null;
    seedProof: string | null;
  };
  userQuote: WtfButtonQuoteView;
  userStats: {
    presses: number;
    totalPaid: WtfButtonAmountView;
    totalPotAdded: WtfButtonAmountView;
    totalWtfPaid: WtfButtonAmountView;
    canPress: boolean;
    cannotPressReason: string | null;
  };
  participants: WtfButtonParticipantView[];
  timeline: Array<{
    id: string;
    atMs: number;
    event: string;
    displayName: string;
    amount: WtfButtonAmountView;
    wtfCut: WtfButtonAmountView;
    potAdd: WtfButtonAmountView;
    timeAddedSeconds: number;
    origin: string;
  }>;
  cooldownUntilMs: number | null;
  lastWinner: {
    walletId: string | null;
    displayName: string | null;
    payout: WtfButtonAmountView;
  };
};

export type WtfButtonSnapshot = {
  title: string;
  shortName: string;
  route: string;
  paymentMode: "mocked_xtz_balances";
  nowMs: number;
  user: {
    walletId: string;
    displayName: string;
    balance: WtfButtonAmountView;
    leaderButtonId: WtfButtonId | null;
    winnerCooldownUntilMs: number | null;
  };
  tables: WtfButtonTableView[];
  wtfTreasury: WtfButtonAmountView;
  audit: CasinoAuditSummary;
  message?: string | null;
};

type SerializedQuotePayload = {
  id?: unknown;
  buttonId?: unknown;
  roundId?: unknown;
  sender?: unknown;
  quotedCostMutez?: unknown;
  maxAcceptedCostMutez?: unknown;
  priceProtectionMode?: unknown;
  toleranceMutez?: unknown;
  quoteTimestampMs?: unknown;
};

let state: WtfButtonGameState | null = null;
let auditJournal = createCasinoAuditJournal("wtf-button-service");

function recordWtfButtonAudit(input: Omit<CasinoAuditEventInput, "gameKey">) {
  auditJournal = appendCasinoAuditEvent(
    auditJournal,
    {
      ...input,
      gameKey: "wtf-button",
    },
    160
  );
}

function amount(mutez: bigint): WtfButtonAmountView {
  return { mutez: mutez.toString(), xtz: formatMutez(mutez) };
}

function now() {
  return Date.now();
}

function ensureState(nowMs = now()): WtfButtonGameState {
  if (!state) {
    state = createWtfButtonGameState(nowMs, {
      "mock-wallet-1": 30n * MUTEZ_PER_XTZ,
      "mock-wallet-2": 30n * MUTEZ_PER_XTZ,
      "mock-wallet-3": 30n * MUTEZ_PER_XTZ,
      "mock-wallet-4": 30n * MUTEZ_PER_XTZ,
    });
  }
  state = advanceState(state, nowMs);
  return state;
}

function advanceState(input: WtfButtonGameState, nowMs: number): WtfButtonGameState {
  let next = input;
  for (const buttonId of Object.keys(next.buttons) as WtfButtonId[]) {
    const round = next.buttons[buttonId];
    const readyClash = round.rugClashHistory.find(
      (clash) => clash.resolvedAtMs === null && clash.endsAtMs <= nowMs
    );
    if (readyClash) {
      const resolved = resolveClash(next, buttonId, nowMs, "wtf-button-service-seed");
      next = resolved.state;
      if (resolved.resolved) {
        recordWtfButtonAudit({
          atMs: nowMs,
          scope: resolved.button.roundId,
          action: "rug_clash_resolved",
          actorId: resolved.selected.walletId,
          severity: "info",
          message: "Rug Clash resolved by deterministic service seed.",
          payload: {
            buttonId,
            clashId: resolved.clash.id,
            entrants: resolved.clash.entrants.length,
            selectedTimeAddedSeconds: resolved.selected.timeAddedSeconds,
            seedProof: resolved.clash.seedProof,
          },
        });
      }
    }
    const afterClash = next.buttons[buttonId];
    if (
      afterClash.countdownEndMs <= nowMs &&
      afterClash.currentState !== "idle" &&
      afterClash.currentState !== "cooling_down"
    ) {
      const settled = settleRound(next, buttonId, nowMs);
      next = settled.state;
      if (settled.settled) {
        recordWtfButtonAudit({
          atMs: nowMs,
          scope: settled.record.roundId,
          action: settled.record.kind === "no_contest_refund" ? "round_refunded" : "round_settled",
          actorId: settled.record.winnerWalletId,
          severity: "settlement",
          message:
            settled.record.kind === "no_contest_refund"
              ? "No-contest WTF Button round refunded."
              : "WTF Button round settled.",
          payload: {
            buttonId,
            kind: settled.record.kind,
            payoutMutez: settled.record.payoutMutez,
            refundMutez: settled.record.refundMutez,
            settlementFeeMutez: settled.record.settlementFeeMutez,
            uniquePressers: settled.record.uniquePressers,
            totalPresses: settled.record.totalPresses,
            rugClashes: settled.record.rugClashes,
          },
        });
      }
    }
    const restart = maybeRestartButton(next, buttonId, nowMs);
    next = restart.state;
    if (restart.restarted || restart.idled) {
      recordWtfButtonAudit({
        atMs: nowMs,
        scope: restart.button.roundId,
        action: restart.restarted ? "round_restarted" : "button_idled",
        actorId: null,
        severity: "info",
        message: restart.restarted
          ? "Trial cooldown completed and table restarted."
          : "Trial cooldown completed and table idled.",
        payload: {
          buttonId,
          restarted: restart.restarted,
          idled: restart.idled,
          startDurationSeconds: restart.button.startDurationSeconds,
        },
      });
    }
  }
  return next;
}

function viewQuote(quote: WtfButtonPressQuote): WtfButtonQuoteView {
  return {
    id: quote.id,
    buttonId: quote.buttonId,
    roundId: quote.roundId,
    quotedCost: amount(quote.quotedCostMutez),
    actualCost: amount(quote.actualCostMutez),
    maxAcceptedCost: amount(quote.maxAcceptedCostMutez),
    priceProtectionMode: quote.priceProtectionMode,
    tolerance: amount(quote.toleranceMutez),
    quoteTimestampMs: quote.quoteTimestampMs,
    houseCut: amount(quote.houseCutMutez),
    potAdd: amount(quote.potAddMutez),
    timeAddedSeconds: quote.timeAddedSeconds,
    canPress: quote.canPress,
    reason: quote.reason,
  };
}

function participantView(participant: WtfButtonParticipant): WtfButtonParticipantView {
  return {
    walletId: participant.walletId,
    displayName: participant.displayName,
    presses: participant.presses,
    totalPaid: amount(participant.totalPaidMutez),
    totalPotAdded: amount(participant.totalPotAddedMutez),
    totalWtfPaid: amount(participant.totalWtfPaidMutez),
    lastPressAtMs: participant.lastPressAtMs,
    lastStatus: participant.lastStatus,
  };
}

function viewRound(
  round: WtfButtonRound,
  gameState: WtfButtonGameState,
  user: WtfButtonUser,
  nowMs: number
): WtfButtonTableView {
  const userQuote = quotePress(gameState, round.buttonId, user, nowMs, "strict", 0n);
  const participant = round.participants[user.walletId] ?? null;
  const leaderParticipant = round.leaderWalletId
    ? round.participants[round.leaderWalletId] ?? null
    : null;
  const activeClash = round.rugClashHistory.find(
    (clash) => clash.resolvedAtMs === null && clash.endsAtMs >= nowMs
  );
  const clashEntrants = activeClash?.entrants ?? [];
  const clashPotAdded = clashEntrants.reduce((sum, entry) => sum + entry.potAddMutez, 0n);
  const clashWtf = clashEntrants.reduce((sum, entry) => sum + entry.houseCutMutez, 0n);
  const runtimeState = getRoundState(round, nowMs);
  return {
    buttonId: round.buttonId,
    color: round.config.color,
    name: round.config.name,
    tableName: round.config.tableName,
    roundId: round.roundId,
    currentPot: amount(round.potMutez),
    currentLeader: {
      walletId: round.leaderWalletId,
      displayName: round.leaderDisplayName,
      leaderSinceMs: round.leaderSinceMs,
      leaderForSeconds: round.leaderSinceMs
        ? Math.max(0, Math.floor((nowMs - round.leaderSinceMs) / 1_000))
        : 0,
      origin: round.leaderOrigin,
      paidIntoButton: amount(leaderParticipant?.totalPaidMutez ?? 0n),
      presses: leaderParticipant?.presses ?? 0,
      estimatedPayoutIfExpiresNow: amount(round.potMutez),
    },
    countdownEndMs: round.countdownEndMs,
    roundStartMs: round.roundStartMs,
    timeRemainingSeconds: secondsRemaining(round, nowMs),
    roundAgeSeconds: Math.max(0, Math.floor((nowMs - round.roundStartMs) / 1_000)),
    startDurationSeconds: round.startDurationSeconds,
    maxRoundAgeSeconds: round.maxRoundAgeSeconds,
    totalPressCount: round.totalPressCount,
    uniquePresserCount: Object.values(round.participants).filter((entry) => entry.presses > 0)
      .length,
    wtfEarnings: amount(round.wtfEarningsMutez),
    state: runtimeState,
    rottenness: getRottenness(round, nowMs),
    dangerZone: runtimeState === "danger_zone" || runtimeState === "clash",
    rugClash: {
      active: Boolean(activeClash),
      countdownSeconds: activeClash
        ? Math.max(0, Math.ceil((activeClash.endsAtMs - nowMs) / 1_000))
        : 0,
      entrants: clashEntrants.map((entry) => ({
        walletId: entry.walletId,
        displayName: entry.displayName,
        paid: amount(entry.actualCostMutez),
        potAdd: amount(entry.potAddMutez),
        wtfPaid: amount(entry.houseCutMutez),
      })),
      potAdded: amount(clashPotAdded),
      wtfEarned: amount(clashWtf),
      selectedWalletId: activeClash?.selectedWalletId ?? null,
      seedProof: activeClash?.seedProof ?? null,
    },
    userQuote: viewQuote(userQuote),
    userStats: {
      presses: participant?.presses ?? 0,
      totalPaid: amount(participant?.totalPaidMutez ?? 0n),
      totalPotAdded: amount(participant?.totalPotAddedMutez ?? 0n),
      totalWtfPaid: amount(participant?.totalWtfPaidMutez ?? 0n),
      canPress: userQuote.canPress,
      cannotPressReason: userQuote.reason,
    },
    participants: Object.values(round.participants)
      .sort((a, b) => {
        if (a.totalPotAddedMutez !== b.totalPotAddedMutez) {
          return a.totalPotAddedMutez > b.totalPotAddedMutez ? -1 : 1;
        }
        return (b.lastPressAtMs ?? 0) - (a.lastPressAtMs ?? 0);
      })
      .map(participantView),
    timeline: round.pressHistory
      .slice(-18)
      .reverse()
      .map((entry) => ({
        id: entry.id,
        atMs: entry.atMs,
        event: entry.event,
        displayName: entry.displayName,
        amount: amount(entry.actualCostMutez),
        wtfCut: amount(entry.houseCutMutez),
        potAdd: amount(entry.potAddMutez),
        timeAddedSeconds: entry.timeAddedSeconds,
        origin: entry.origin,
      })),
    cooldownUntilMs: round.cooldownUntilMs,
    lastWinner: {
      walletId: round.lastWinnerWalletId,
      displayName: round.lastWinnerDisplayName,
      payout: amount(round.lastPayoutMutez),
    },
  };
}

function leaderButtonId(gameState: WtfButtonGameState, user: WtfButtonUser, nowMs: number) {
  for (const buttonId of Object.keys(gameState.buttons) as WtfButtonId[]) {
    const round = gameState.buttons[buttonId];
    const stateName = getRoundState(round, nowMs);
    if (
      round.leaderWalletId === user.walletId &&
      (stateName === "active" || stateName === "danger_zone" || stateName === "clash")
    ) {
      return buttonId;
    }
  }
  return null;
}

export function getMockWtfButtonUser(rawUser: {
  id: number;
  username?: string | null;
  displayName?: string | null;
}): WtfButtonUser {
  return {
    walletId: `mock-wallet-${rawUser.id}`,
    displayName: rawUser.displayName || rawUser.username || `Player ${rawUser.id}`,
  };
}

export function getWtfButtonSnapshot(
  rawUser: { id: number; username?: string | null; displayName?: string | null },
  message: string | null = null
): WtfButtonSnapshot {
  const nowMs = now();
  const gameState = ensureState(nowMs);
  const user = getMockWtfButtonUser(rawUser);
  if (gameState.balances[user.walletId] === undefined) {
    gameState.balances[user.walletId] = 30n * MUTEZ_PER_XTZ;
  }
  return {
    title: "WTF Does This Button Do?!!?",
    shortName: "WTF Button",
    route: "/casino/wtf-button",
    paymentMode: "mocked_xtz_balances",
    nowMs,
    user: {
      walletId: user.walletId,
      displayName: user.displayName ?? user.walletId,
      balance: amount(gameState.balances[user.walletId] ?? 0n),
      leaderButtonId: leaderButtonId(gameState, user, nowMs),
      winnerCooldownUntilMs: gameState.winnerCooldownUntilByWallet[user.walletId] ?? null,
    },
    tables: (Object.keys(gameState.buttons) as WtfButtonId[]).map((buttonId) =>
      viewRound(gameState.buttons[buttonId], gameState, user, nowMs)
    ),
    wtfTreasury: amount(gameState.wtfTreasuryMutez),
    audit: summarizeCasinoAuditJournal(auditJournal),
    message,
  };
}

function parseBigInt(value: unknown, fallback = 0n): bigint {
  if (typeof value === "bigint") return value;
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return fallback;
  return BigInt(raw);
}

function hydrateQuote(payload: SerializedQuotePayload): WtfButtonPressQuote | null {
  const buttonId = payload.buttonId === "red" || payload.buttonId === "green" || payload.buttonId === "blue"
    ? payload.buttonId
    : null;
  const mode =
    payload.priceProtectionMode === "flexible" || payload.priceProtectionMode === "strict"
      ? payload.priceProtectionMode
      : null;
  const roundId = typeof payload.roundId === "string" ? payload.roundId : null;
  const sender = typeof payload.sender === "string" ? payload.sender : null;
  const quoteTimestampMs = Number(payload.quoteTimestampMs);
  if (!buttonId || !mode || !roundId || !sender || !Number.isFinite(quoteTimestampMs)) {
    return null;
  }
  const gameState = ensureState(now());
  const round = gameState.buttons[buttonId];
  const quotedCostMutez = parseBigInt(payload.quotedCostMutez);
  const maxAcceptedCostMutez = parseBigInt(payload.maxAcceptedCostMutez, quotedCostMutez);
  const houseCutMutez = round ? 0n : 0n;
  return {
    id: typeof payload.id === "string" ? payload.id : `${buttonId}-${roundId}-${sender}`,
    buttonId,
    roundId,
    sender,
    quotedCostMutez,
    actualCostMutez: quotedCostMutez,
    maxAcceptedCostMutez,
    priceProtectionMode: mode,
    toleranceMutez: parseBigInt(payload.toleranceMutez),
    quoteTimestampMs,
    houseCutMutez,
    potAddMutez: quotedCostMutez - houseCutMutez,
    timeAddedSeconds: 0,
    canPress: true,
    reason: null,
  };
}

export function createWtfButtonQuote(input: {
  rawUser: { id: number; username?: string | null; displayName?: string | null };
  buttonId: WtfButtonId;
  priceProtectionMode: WtfButtonPriceProtectionMode;
  toleranceMutez: bigint;
}) {
  const nowMs = now();
  const gameState = ensureState(nowMs);
  const user = getMockWtfButtonUser(input.rawUser);
  if (gameState.balances[user.walletId] === undefined) {
    gameState.balances[user.walletId] = 30n * MUTEZ_PER_XTZ;
  }
  const quote = quotePress(
    gameState,
    input.buttonId,
    user,
    nowMs,
    input.priceProtectionMode,
    input.toleranceMutez
  );
  recordWtfButtonAudit({
    atMs: nowMs,
    scope: quote.roundId,
    action: "quote_created",
    actorId: user.walletId,
    severity: quote.canPress ? "info" : "rejection",
    message: quote.canPress ? "Press quote created." : "Press quote created with a cannot-press reason.",
    payload: {
      buttonId: input.buttonId,
      quotedCostMutez: quote.quotedCostMutez,
      maxAcceptedCostMutez: quote.maxAcceptedCostMutez,
      priceProtectionMode: quote.priceProtectionMode,
      toleranceMutez: quote.toleranceMutez,
      canPress: quote.canPress,
      reason: quote.reason,
    },
  });
  return viewQuote(quote);
}

export function submitWtfButtonPress(input: {
  rawUser: { id: number; username?: string | null; displayName?: string | null };
  quotePayload: SerializedQuotePayload;
}) {
  const quote = hydrateQuote(input.quotePayload);
  const user = getMockWtfButtonUser(input.rawUser);
  if (!quote) {
    recordWtfButtonAudit({
      atMs: now(),
      scope: "unknown",
      action: "press_rejected",
      actorId: user.walletId,
      severity: "rejection",
      message: "Invalid press quote rejected.",
      payload: { reason: "Invalid press quote." },
    });
    return {
      ok: false,
      snapshot: getWtfButtonSnapshot(input.rawUser, "Invalid press quote."),
      error: "Invalid press quote.",
    };
  }
  const nowMs = now();
  const gameState = ensureState(nowMs);
  if (gameState.balances[user.walletId] === undefined) {
    gameState.balances[user.walletId] = 30n * MUTEZ_PER_XTZ;
  }
  const result = pressButton(gameState, quote.buttonId, user, quote, nowMs);
  state = result.state;
  if (!result.ok) {
    recordWtfButtonAudit({
      atMs: nowMs,
      scope: quote.roundId,
      action: result.code === "PRICE_CHANGED" ? "price_protection_rejected" : "press_rejected",
      actorId: user.walletId,
      severity: "rejection",
      message: result.message,
      payload: {
        buttonId: quote.buttonId,
        code: result.code,
        quotedCostMutez: quote.quotedCostMutez,
        maxAcceptedCostMutez: quote.maxAcceptedCostMutez,
        actualCostMutez: result.actualCostMutez ?? null,
      },
    });
    return {
      ok: false,
      code: result.code,
      error: result.message,
      actualCost: result.actualCostMutez ? amount(result.actualCostMutez) : null,
      maxAcceptedCost: result.maxAcceptedCostMutez ? amount(result.maxAcceptedCostMutez) : null,
      snapshot: getWtfButtonSnapshot(input.rawUser, result.message),
    };
  }
  recordWtfButtonAudit({
    atMs: nowMs,
    scope: quote.roundId,
    action: result.clashJoined ? "rug_clash_entered" : "press_succeeded",
    actorId: user.walletId,
    severity: "info",
    message: result.message,
    payload: {
      buttonId: quote.buttonId,
      actualCostMutez: result.actualCostMutez,
      maxAcceptedCostMutez: result.maxAcceptedCostMutez,
      potAddMutez: result.quote.potAddMutez,
      houseCutMutez: result.quote.houseCutMutez,
      timeAddedSeconds: result.quote.timeAddedSeconds,
      clashStarted: result.clashStarted,
      clashJoined: result.clashJoined,
    },
  });
  return {
    ok: true,
    message: result.message,
    actualCost: amount(result.actualCostMutez),
    maxAcceptedCost: amount(result.maxAcceptedCostMutez),
    snapshot: getWtfButtonSnapshot(input.rawUser, result.message),
  };
}

export function resetWtfButtonMockState(nowMs = now()) {
  state = createWtfButtonGameState(nowMs, {
    "mock-wallet-1": 30n * MUTEZ_PER_XTZ,
    "mock-wallet-2": 30n * MUTEZ_PER_XTZ,
    "mock-wallet-3": 30n * MUTEZ_PER_XTZ,
    "mock-wallet-4": 30n * MUTEZ_PER_XTZ,
  });
  auditJournal = createCasinoAuditJournal("wtf-button-service");
  return state;
}
