import { GUINEA_PIG_RACEWAY_RULES, RACEWAY_BPS } from "./rules";

export type RacewayWagerType = "win" | "place" | "show" | "exacta" | "trifecta";

export type RacewayTicketStatus =
  | "accepted"
  | "won"
  | "lost"
  | "refunded"
  | "void";

export type RacewayOfficialStatus =
  | "pending"
  | "unofficial"
  | "inquiry"
  | "official"
  | "canceled";

export type RacewayTicket = {
  id: string;
  raceId: string;
  walletAddress: string;
  wagerType: RacewayWagerType;
  selections: string[];
  stakeMicrowtf: bigint | number;
  acceptedAtMs: number;
  status: RacewayTicketStatus;
  refundReason?: string;
};

export type RacewayPoolSummary = {
  wagerType: RacewayWagerType;
  grossMicrowtf: bigint;
  takeoutMicrowtf: bigint;
  netMicrowtf: bigint;
  breakageMicrowtf: bigint;
  carryoverMicrowtf: bigint;
  ticketCount: number;
};

export type RacewayToteBoard = {
  totalHandleMicrowtf: bigint;
  poolSummaries: RacewayPoolSummary[];
  winOdds: Array<{
    racerId: string;
    poolMicrowtf: bigint;
    approximatePayoutPerWtfMicrowtf: bigint | null;
  }>;
};

export type RacewayTicketSettlement = RacewayTicket & {
  payoutMicrowtf: bigint;
  refundMicrowtf: bigint;
  status: RacewayTicketStatus;
};

export type RacewayToteSettlement = {
  officialStatus: RacewayOfficialStatus;
  finishOrder: string[];
  totalHandleMicrowtf: bigint;
  takeoutMicrowtf: bigint;
  breakageMicrowtf: bigint;
  houseMicrowtf: bigint;
  carryoverMicrowtf: bigint;
  ticketResults: RacewayTicketSettlement[];
  poolSummaries: RacewayPoolSummary[];
};

const REQUIRED_SELECTIONS: Record<RacewayWagerType, number> = {
  win: 1,
  place: 1,
  show: 1,
  exacta: 2,
  trifecta: 3,
};

function toBigInt(value: bigint | number, name: string): bigint {
  const amount = BigInt(value);
  if (amount < 0n) throw new RangeError(`${name} must be non-negative`);
  return amount;
}

function floorToUnit(value: bigint, unit: bigint): bigint {
  if (unit <= 1n) return value;
  return (value / unit) * unit;
}

function takeoutFor(grossMicrowtf: bigint): bigint {
  return (grossMicrowtf * BigInt(GUINEA_PIG_RACEWAY_RULES.houseTakeBps)) / BigInt(RACEWAY_BPS);
}

export function normalizeRacewaySelections(input: {
  wagerType: RacewayWagerType;
  selections: string[];
  fieldRacerIds: string[];
}): string[] {
  const required = REQUIRED_SELECTIONS[input.wagerType];
  const selections = input.selections.map((selection) => selection.trim()).filter(Boolean);
  if (selections.length !== required) {
    throw new RangeError(`${input.wagerType} wagers require ${required} selection(s)`);
  }
  if (new Set(selections).size !== selections.length) {
    throw new RangeError(`${input.wagerType} wagers require unique selections`);
  }
  const field = new Set(input.fieldRacerIds);
  for (const selection of selections) {
    if (!field.has(selection)) throw new RangeError(`Unknown racer selection: ${selection}`);
  }
  return selections;
}

export function isRacewayTicketRefundable(ticket: RacewayTicket): boolean {
  return ticket.status === "accepted";
}

export function buildRacewayToteBoard(input: {
  tickets: RacewayTicket[];
  fieldRacerIds: string[];
}): RacewayToteBoard {
  const accepted = input.tickets.filter((ticket) => ticket.status === "accepted");
  const totalHandleMicrowtf = accepted.reduce(
    (sum, ticket) => sum + toBigInt(ticket.stakeMicrowtf, "stakeMicrowtf"),
    0n
  );
  const poolSummaries = buildPoolSummaries(accepted, new Map());
  const winPool = accepted.filter((ticket) => ticket.wagerType === "win");
  const winGross = winPool.reduce(
    (sum, ticket) => sum + toBigInt(ticket.stakeMicrowtf, "stakeMicrowtf"),
    0n
  );
  const winNet = winGross - takeoutFor(winGross);
  const winOdds = input.fieldRacerIds.map((racerId) => {
    const poolMicrowtf = winPool
      .filter((ticket) => ticket.selections[0] === racerId)
      .reduce((sum, ticket) => sum + toBigInt(ticket.stakeMicrowtf, "stakeMicrowtf"), 0n);
    return {
      racerId,
      poolMicrowtf,
      approximatePayoutPerWtfMicrowtf:
        poolMicrowtf > 0n
          ? (winNet * 1_000_000n) / poolMicrowtf
          : null,
    };
  });

  return {
    totalHandleMicrowtf,
    poolSummaries,
    winOdds,
  };
}

export function refundRacewayTickets(input: {
  tickets: RacewayTicket[];
  reason: string;
}): RacewayToteSettlement {
  const ticketResults = input.tickets.map((ticket) => {
    const stake = toBigInt(ticket.stakeMicrowtf, "stakeMicrowtf");
    return {
      ...ticket,
      status: isRacewayTicketRefundable(ticket) ? "refunded" : ticket.status,
      refundMicrowtf: isRacewayTicketRefundable(ticket) ? stake : 0n,
      payoutMicrowtf: 0n,
      refundReason: input.reason,
    };
  });
  const totalHandleMicrowtf = ticketResults.reduce((sum, ticket) => sum + ticket.refundMicrowtf, 0n);
  return {
    officialStatus: "canceled",
    finishOrder: [],
    totalHandleMicrowtf,
    takeoutMicrowtf: 0n,
    breakageMicrowtf: 0n,
    houseMicrowtf: 0n,
    carryoverMicrowtf: 0n,
    ticketResults,
    poolSummaries: buildPoolSummaries([], new Map()),
  };
}

export function settleRacewayTote(input: {
  tickets: RacewayTicket[];
  finishOrder: string[];
  breakageUnitMicrowtf?: bigint;
}): RacewayToteSettlement {
  if (input.finishOrder.length < 3) {
    return refundRacewayTickets({
      tickets: input.tickets,
      reason: "Race did not produce an official three-place result.",
    });
  }

  const breakageUnit = input.breakageUnitMicrowtf ?? BigInt(GUINEA_PIG_RACEWAY_RULES.breakageUnitMicrowtf);
  const accepted = input.tickets.filter((ticket) => ticket.status === "accepted");
  const payouts = new Map<string, bigint>();
  const statuses = new Map<string, RacewayTicketStatus>();
  const poolCarryovers = new Map<RacewayWagerType, bigint>();
  const poolBreakage = new Map<RacewayWagerType, bigint>();

  for (const wagerType of Object.keys(REQUIRED_SELECTIONS) as RacewayWagerType[]) {
    const poolTickets = accepted.filter((ticket) => ticket.wagerType === wagerType);
    settlePool({
      wagerType,
      tickets: poolTickets,
      finishOrder: input.finishOrder,
      payouts,
      statuses,
      poolCarryovers,
      poolBreakage,
      breakageUnit,
    });
  }

  const ticketResults = input.tickets.map((ticket) => {
    const payoutMicrowtf = payouts.get(ticket.id) ?? 0n;
    const status = statuses.get(ticket.id) ?? (ticket.status === "accepted" ? "lost" : ticket.status);
    return {
      ...ticket,
      status,
      payoutMicrowtf,
      refundMicrowtf: 0n,
    };
  });
  const poolSummaries = buildPoolSummaries(accepted, poolCarryovers, poolBreakage);
  const totalHandleMicrowtf = poolSummaries.reduce((sum, pool) => sum + pool.grossMicrowtf, 0n);
  const takeoutMicrowtf = poolSummaries.reduce((sum, pool) => sum + pool.takeoutMicrowtf, 0n);
  const breakageMicrowtf = poolSummaries.reduce((sum, pool) => sum + pool.breakageMicrowtf, 0n);
  const carryoverMicrowtf = poolSummaries.reduce((sum, pool) => sum + pool.carryoverMicrowtf, 0n);

  return {
    officialStatus: "official",
    finishOrder: input.finishOrder,
    totalHandleMicrowtf,
    takeoutMicrowtf,
    breakageMicrowtf,
    houseMicrowtf: takeoutMicrowtf + breakageMicrowtf,
    carryoverMicrowtf,
    ticketResults,
    poolSummaries,
  };
}

function settlePool(input: {
  wagerType: RacewayWagerType;
  tickets: RacewayTicket[];
  finishOrder: string[];
  payouts: Map<string, bigint>;
  statuses: Map<string, RacewayTicketStatus>;
  poolCarryovers: Map<RacewayWagerType, bigint>;
  poolBreakage: Map<RacewayWagerType, bigint>;
  breakageUnit: bigint;
}) {
  const gross = input.tickets.reduce(
    (sum, ticket) => sum + toBigInt(ticket.stakeMicrowtf, "stakeMicrowtf"),
    0n
  );
  if (gross <= 0n) return;
  const net = gross - takeoutFor(gross);
  const winningGroups = buildWinningGroups(input.wagerType, input.finishOrder);
  const share = net / BigInt(winningGroups.length);
  let poolBreakage = net - share * BigInt(winningGroups.length);
  let poolCarryover = 0n;

  for (const group of winningGroups) {
    const winningTickets = input.tickets.filter((ticket) => selectionMatches(ticket, group));
    const winningStake = winningTickets.reduce(
      (sum, ticket) => sum + toBigInt(ticket.stakeMicrowtf, "stakeMicrowtf"),
      0n
    );
    if (winningStake <= 0n) {
      poolCarryover += share;
      continue;
    }
    let groupPaid = 0n;
    for (const ticket of winningTickets) {
      const rawPayout = (share * toBigInt(ticket.stakeMicrowtf, "stakeMicrowtf")) / winningStake;
      const payout = floorToUnit(rawPayout, input.breakageUnit);
      groupPaid += payout;
      input.payouts.set(ticket.id, (input.payouts.get(ticket.id) ?? 0n) + payout);
      input.statuses.set(ticket.id, "won");
    }
    poolBreakage += share - groupPaid;
  }

  input.poolCarryovers.set(input.wagerType, poolCarryover);
  input.poolBreakage.set(input.wagerType, poolBreakage);
}

function buildWinningGroups(wagerType: RacewayWagerType, finishOrder: string[]): string[][] {
  if (wagerType === "win") return [[finishOrder[0]]];
  if (wagerType === "place") return [[finishOrder[0]], [finishOrder[1]]];
  if (wagerType === "show") return [[finishOrder[0]], [finishOrder[1]], [finishOrder[2]]];
  if (wagerType === "exacta") return [[finishOrder[0], finishOrder[1]]];
  return [[finishOrder[0], finishOrder[1], finishOrder[2]]];
}

function selectionMatches(ticket: RacewayTicket, group: string[]): boolean {
  if (ticket.selections.length !== group.length) return false;
  return ticket.selections.every((selection, index) => selection === group[index]);
}

function buildPoolSummaries(
  tickets: RacewayTicket[],
  carryovers: Map<RacewayWagerType, bigint>,
  breakage = new Map<RacewayWagerType, bigint>()
): RacewayPoolSummary[] {
  return (Object.keys(REQUIRED_SELECTIONS) as RacewayWagerType[]).map((wagerType) => {
    const poolTickets = tickets.filter((ticket) => ticket.wagerType === wagerType);
    const grossMicrowtf = poolTickets.reduce(
      (sum, ticket) => sum + toBigInt(ticket.stakeMicrowtf, "stakeMicrowtf"),
      0n
    );
    const takeoutMicrowtf = takeoutFor(grossMicrowtf);
    return {
      wagerType,
      grossMicrowtf,
      takeoutMicrowtf,
      netMicrowtf: grossMicrowtf - takeoutMicrowtf,
      breakageMicrowtf: breakage.get(wagerType) ?? 0n,
      carryoverMicrowtf: carryovers.get(wagerType) ?? 0n,
      ticketCount: poolTickets.length,
    };
  });
}
