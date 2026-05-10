import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRacewayToteBoard,
  normalizeRacewaySelections,
  refundRacewayTickets,
  settleRacewayTote,
  type RacewayTicket,
} from "./tote";

const tickets: RacewayTicket[] = [
  {
    id: "win-a",
    raceId: "raceway-test",
    walletAddress: "wallet-a",
    wagerType: "win",
    selections: ["miso"],
    stakeMicrowtf: 10_000_000n,
    acceptedAtMs: 1,
    status: "accepted",
  },
  {
    id: "place-b",
    raceId: "raceway-test",
    walletAddress: "wallet-b",
    wagerType: "place",
    selections: ["nori"],
    stakeMicrowtf: 10_000_000n,
    acceptedAtMs: 2,
    status: "accepted",
  },
  {
    id: "show-c",
    raceId: "raceway-test",
    walletAddress: "wallet-c",
    wagerType: "show",
    selections: ["button"],
    stakeMicrowtf: 10_000_000n,
    acceptedAtMs: 3,
    status: "accepted",
  },
  {
    id: "exacta-d",
    raceId: "raceway-test",
    walletAddress: "wallet-d",
    wagerType: "exacta",
    selections: ["miso", "nori"],
    stakeMicrowtf: 10_000_000n,
    acceptedAtMs: 4,
    status: "accepted",
  },
  {
    id: "trifecta-e",
    raceId: "raceway-test",
    walletAddress: "wallet-e",
    wagerType: "trifecta",
    selections: ["miso", "nori", "button"],
    stakeMicrowtf: 10_000_000n,
    acceptedAtMs: 5,
    status: "accepted",
  },
];

test("raceway tote validates standard ticket selection shapes", () => {
  assert.deepEqual(
    normalizeRacewaySelections({
      wagerType: "exacta",
      selections: ["miso", "nori"],
      fieldRacerIds: ["miso", "nori", "button"],
    }),
    ["miso", "nori"]
  );
  assert.throws(
    () =>
      normalizeRacewaySelections({
        wagerType: "exacta",
        selections: ["miso", "miso"],
        fieldRacerIds: ["miso", "nori", "button"],
      }),
    /unique/
  );
  assert.throws(
    () =>
      normalizeRacewaySelections({
        wagerType: "trifecta",
        selections: ["miso", "nori"],
        fieldRacerIds: ["miso", "nori", "button"],
      }),
    /3 selection/
  );
});

test("raceway tote board exposes separate pool totals and approximate win payouts", () => {
  const board = buildRacewayToteBoard({
    tickets,
    fieldRacerIds: ["miso", "nori", "button", "hazel", "mochi"],
  });
  assert.equal(board.totalHandleMicrowtf, 50_000_000n);
  assert.equal(board.poolSummaries.find((pool) => pool.wagerType === "win")?.ticketCount, 1);
  assert.equal(
    board.winOdds.find((entry) => entry.racerId === "miso")?.approximatePayoutPerWtfMicrowtf,
    950_000n
  );
  assert.equal(
    board.winOdds.find((entry) => entry.racerId === "hazel")?.approximatePayoutPerWtfMicrowtf,
    null
  );
});

test("raceway tote settles win place show exacta and trifecta pools independently", () => {
  const settlementTickets: RacewayTicket[] = [
    ...tickets,
    {
      id: "place-a",
      raceId: "raceway-test",
      walletAddress: "wallet-a",
      wagerType: "place",
      selections: ["miso"],
      stakeMicrowtf: 10_000_000n,
      acceptedAtMs: 6,
      status: "accepted",
    },
    {
      id: "show-a",
      raceId: "raceway-test",
      walletAddress: "wallet-a",
      wagerType: "show",
      selections: ["miso"],
      stakeMicrowtf: 10_000_000n,
      acceptedAtMs: 7,
      status: "accepted",
    },
    {
      id: "show-b",
      raceId: "raceway-test",
      walletAddress: "wallet-b",
      wagerType: "show",
      selections: ["nori"],
      stakeMicrowtf: 10_000_000n,
      acceptedAtMs: 8,
      status: "accepted",
    },
  ];
  const settlement = settleRacewayTote({
    tickets: settlementTickets,
    finishOrder: ["miso", "nori", "button", "hazel", "mochi"],
    breakageUnitMicrowtf: 1n,
  });
  assert.equal(settlement.officialStatus, "official");
  assert.equal(settlement.totalHandleMicrowtf, 80_000_000n);
  assert.equal(settlement.houseMicrowtf, 4_000_000n);
  assert.equal(settlement.carryoverMicrowtf, 0n);
  assert.deepEqual(
    settlement.ticketResults
      .filter((ticket) => ["win-a", "place-a", "place-b", "show-a", "show-b", "show-c", "exacta-d", "trifecta-e"].includes(ticket.id))
      .map((ticket) => [ticket.id, ticket.status, ticket.payoutMicrowtf]),
    [
      ["win-a", "won", 9_500_000n],
      ["place-b", "won", 9_500_000n],
      ["show-c", "won", 9_500_000n],
      ["exacta-d", "won", 9_500_000n],
      ["trifecta-e", "won", 9_500_000n],
      ["place-a", "won", 9_500_000n],
      ["show-a", "won", 9_500_000n],
      ["show-b", "won", 9_500_000n],
    ]
  );
  assert.equal(settlement.breakageMicrowtf, 0n);
});

test("raceway tote carries unhit pool shares instead of inventing winners", () => {
  const settlement = settleRacewayTote({
    tickets: [
      {
        id: "missed-exacta",
        raceId: "raceway-test",
        walletAddress: "wallet-a",
        wagerType: "exacta",
        selections: ["nori", "miso"],
        stakeMicrowtf: 10_000_000n,
        acceptedAtMs: 1,
        status: "accepted",
      },
    ],
    finishOrder: ["miso", "nori", "button"],
  });
  assert.equal(settlement.ticketResults[0].status, "lost");
  assert.equal(settlement.carryoverMicrowtf, 9_500_000n);
});

test("raceway tote refunds all accepted tickets when a race cannot become official", () => {
  const settlement = refundRacewayTickets({ tickets, reason: "manual cancel" });
  assert.equal(settlement.officialStatus, "canceled");
  assert.equal(settlement.houseMicrowtf, 0n);
  assert.equal(
    settlement.ticketResults.reduce((sum, ticket) => sum + ticket.refundMicrowtf, 0n),
    50_000_000n
  );
});
