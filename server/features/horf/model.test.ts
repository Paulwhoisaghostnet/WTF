import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedHorseTags,
  horseTagEvidence,
  HORF_SEASON_START,
  isHorseRelatedTag,
  normalizeHorfTransfer,
  summarizeSeason,
  tokenQualifies,
  type HorfTransfer,
  type ObjktTransferEvent,
} from "./model";

const alice = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const bob = "tz1fjdv69hHYx457eLfdWh4n3n4xzmJF9j7T";
const carol = "tz1LNDLoU3Juoc6sWeKbHRsoCNtP1GTJXvRQ";
const contract = "KT1L7PSeJpnj79MEaybcEiDtbHM43g5DZe12";

function event(overrides: Partial<ObjktTransferEvent> = {}): ObjktTransferEvent {
  return {
    id: 76425265,
    event_type: "transfer",
    marketplace_event_type: null,
    marketplace_contract: null,
    reverted: false,
    timestamp: "2026-11-02T10:34:40Z",
    creator_address: alice,
    recipient_address: bob,
    amount: 1,
    token: {
      fa_contract: contract,
      token_id: "12",
      name: "All Stirred Up",
      decimals: 0,
      thumbnail_uri: "ipfs://bafybeiczy64hx2xhzvhvsoae4k7zdjmler3sewql2eazn2vt2qtixv3ufi",
      tags: [{ tag: { name: "neighvember", token_count: 190 } }],
    },
    ...overrides,
  };
}

test("listed horse mint tags and year suffixes qualify without a group-size gate", () => {
  for (const value of [
    "horse", "horseart", "horse art", "horsetrade", "horse trade",
    "horse trader", "horse trading", "horsetraders", "horf",
    "neighvember", "neighvember2025", "horse of july 2024", "horseofjuly2026",
  ]) {
    assert.equal(tokenQualifies({ tags: [{ tag: { name: value, token_count: 1 } }] }, new Set()), true, value);
  }
  assert.equal(tokenQualifies({ tags: [{ tag: { name: "#horsetrading 2024", token_count: 1 } }] }, new Set()), true);
});

test("titles, descriptions, and unrelated tag substrings do not count as horse evidence", () => {
  assert.equal(tokenQualifies({ name: "Horse Art 2026", description: "Neighvember horse trade" }, new Set()), false);
  assert.equal(tokenQualifies({ name: "The OG", description: "HAHA, just joking!", tags: [
    { tag: { name: "clown" } }, { tag: { name: "gif" } },
    { tag: { name: "pastel" } }, { tag: { name: "pastelverse" } },
  ] }, new Set()), false);
  for (const value of ["shahabvfx", "nightmare", "neighborhood", "horsepower", "coltrane"]) {
    assert.equal(tokenQualifies({ tags: [{ tag: { name: value, token_count: 100 } }] }, new Set()), false, value);
    assert.equal(isHorseRelatedTag(value), false, value);
  }
});

test("a HAHA-only mint tag waits for a Marshal and a horse tag wins independently", () => {
  const haha = { tags: [{ tag: { name: "HAHA 2026", token_count: 100 } }] };
  assert.equal(horseTagEvidence(haha, new Set()), "haha-review");
  assert.equal(tokenQualifies(haha, new Set()), false);
  assert.equal(tokenQualifies(haha, new Set(), true), true);
  assert.equal(horseTagEvidence({ tags: [...haha.tags, { tag: { name: "horse", token_count: 1 } }] }, new Set()), "horse");
  assert.equal(horseTagEvidence({ name: "HAHA", description: "horse" }, new Set()), "none");
  const hahaTransfer = event({ token: { ...event().token!, name: "The OG", description: "HAHA, just joking!",
    tags: [{ tag: { name: "haha", token_count: 100 } }] } });
  assert.equal(normalizeHorfTransfer(hahaTransfer, new Set()), null);
  assert.ok(normalizeHorfTransfer(hahaTransfer, new Set(), HORF_SEASON_START, null, null, true));
});

test("additional horse-family Objkt tags require more than five indexed tokens", () => {
  const approved = approvedHorseTags([
    { name: "HorseRacing", token_count: 662 },
    { name: "racehorse", token_count: 17 },
    { name: "yearofthehorse", token_count: 17 },
    { name: "horseback", token_count: 26 },
    { name: "seahorse", token_count: 182 },
    { name: "horse4horse", token_count: 19 },
    { name: "saddle", token_count: 5 },
    { name: "neighborhood", token_count: 866 },
    { name: "horsepower", token_count: 82 },
  ]);
  assert.deepEqual(approved, ["horseracing", "horse4horse", "horseback", "racehorse", "seahorse", "yearofthehorse"].sort());
  assert.equal(tokenQualifies({ tags: [{ tag: { name: "HorseRacing" } }] }, new Set(approved)), true);
  assert.equal(tokenQualifies({ tags: [{ tag: { name: "saddle" } }] }, new Set(approved)), false);
});

test("only direct non-reverted Tezos wallet transfers after season start enter ledger", () => {
  const approved = new Set<string>();
  const accepted = normalizeHorfTransfer(event({ amount: 3 }), approved);
  assert.equal(accepted?.amount, 3);
  assert.equal(accepted?.from, alice);
  assert.equal(accepted?.to, bob);
  assert.match(accepted?.token.image || "", /^https:\/\//);
  assert.equal(normalizeHorfTransfer(event({ creator_address: null }), approved), null);
  assert.equal(normalizeHorfTransfer(event({ creator_address: contract }), approved), null);
  assert.equal(normalizeHorfTransfer(event({ recipient_address: contract }), approved), null);
  assert.equal(normalizeHorfTransfer(event({ recipient_address: "tz1burnburnburnburnburnburnburjAYjjX" }), approved), null);
  assert.equal(normalizeHorfTransfer(event({ recipient_address: alice }), approved), null);
  assert.equal(normalizeHorfTransfer(event({ marketplace_event_type: "list_buy" }), approved), null);
  assert.equal(normalizeHorfTransfer(event({ marketplace_contract: contract }), approved), null);
  assert.equal(normalizeHorfTransfer(event({ reverted: true }), approved), null);
  assert.equal(normalizeHorfTransfer(event({ timestamp: "2026-10-31T23:59:59Z" }), approved), null);
  assert.equal(normalizeHorfTransfer(event({ timestamp: HORF_SEASON_START }), approved)?.id, 76425265);
  assert.equal(normalizeHorfTransfer(event(), approved, HORF_SEASON_START, null, contract), null,
    "configured HORSE reward transfers must not count as horse-art trades");
});

test("season totals count token units and pairwise net horse obligations", () => {
  const base = normalizeHorfTransfer(event({ amount: 2 }), new Set())!;
  const rows: HorfTransfer[] = [
    { ...base, from: bob, to: alice },
    { ...base, id: 76425266, timestamp: "2026-11-02T12:00:00Z", from: alice, to: bob, amount: 1 },
    { ...base, id: 76425267, timestamp: "2026-11-03T12:00:00Z", from: alice, to: carol, amount: 3 },
    { ...base, id: 76425268, timestamp: "2026-11-03T13:00:00Z", from: carol, to: alice, amount: 1 },
  ];
  const result = summarizeSeason(rows, alice);
  assert.deepEqual(result.leaderboard.map(({ address, trades, received, sent }) => ({ address, trades, received, sent })), [
    { address: alice, trades: 2, received: 3, sent: 4 },
    { address: carol, trades: 1, received: 3, sent: 1 },
    { address: bob, trades: 1, received: 1, sent: 2 },
  ]);
  assert.deepEqual(result.currentUser?.owedTo, [{ address: bob, name: null, count: 1 }]);
  assert.deepEqual(result.currentUser?.owedBy, [{ address: carol, name: null, count: 2 }]);
  assert.deepEqual(result.currentUser?.waitingHorses.map(({ id, from, amount }) => ({ id, from, amount })), [
    { id: 76425265, from: bob, amount: 1 },
  ]);
  assert.equal(result.currentUser?.completedTrades, 2);
  assert.equal(result.currentUser?.recent[0]?.id, 76425268);
  assert.equal(result.currentUser?.recent[0]?.direction, "in");
});

test("bulk editions count as one outbound race ride while a multi-recipient batch counts each rider", () => {
  const bulk = normalizeHorfTransfer(event({ amount: 9990, ophash: `o${"A".repeat(50)}` }), new Set())!;
  const bulkSummary = summarizeSeason([bulk], alice);
  const sender = bulkSummary.leaderboard.find((row) => row.address === alice)!;
  const recipient = bulkSummary.leaderboard.find((row) => row.address === bob)!;
  assert.deepEqual([sender.trades, sender.sentInteractions, sender.sent], [1, 1, 9990]);
  assert.deepEqual([recipient.trades, recipient.receivedInteractions, recipient.received], [0, 1, 9990]);
  assert.deepEqual([bulkSummary.currentUser?.recent[0]?.racePoints, bulkSummary.currentUser?.recent[0]?.horseReward], [1, "10"]);
  const recipientSummary = summarizeSeason([bulk], bob);
  assert.deepEqual([recipientSummary.currentUser?.recent[0]?.racePoints, recipientSummary.currentUser?.recent[0]?.horseReward], [0, "0"]);

  const sharedOperation = `o${"B".repeat(50)}`;
  const batch: HorfTransfer[] = [
    { ...bulk, id: 76425270, operationHash: sharedOperation, to: bob, amount: 1 },
    { ...bulk, id: 76425271, operationHash: sharedOperation, to: carol, amount: 1 },
  ];
  const batchSummary = summarizeSeason(batch, alice);
  assert.equal(batchSummary.currentUser?.trades, 2);
  assert.deepEqual(batchSummary.leaderboard.filter((row) => row.address !== alice)
    .map((row) => [row.address, row.trades, row.receivedInteractions]).sort(), [
    [bob, 0, 1], [carol, 0, 1],
  ].sort());
});

test("waiting horse receipts use FIFO cancellation and earlier sends cover later receipts", () => {
  const base = normalizeHorfTransfer(event(), new Set())!;
  const rows: HorfTransfer[] = [
    { ...base, id: 1, timestamp: "2026-11-01T01:00:00Z", from: bob, to: alice, amount: 2 },
    { ...base, id: 2, timestamp: "2026-11-01T02:00:00Z", from: bob, to: alice, amount: 3 },
    { ...base, id: 3, timestamp: "2026-11-01T03:00:00Z", from: alice, to: bob, amount: 4 },
    { ...base, id: 4, timestamp: "2026-11-01T04:00:00Z", from: alice, to: carol, amount: 2 },
    { ...base, id: 5, timestamp: "2026-11-01T05:00:00Z", from: carol, to: alice, amount: 3 },
  ];
  const own = summarizeSeason(rows, alice).currentUser!;
  assert.deepEqual(own.waitingHorses.map(({ id, from, amount }) => ({ id, from, amount })), [
    { id: 5, from: carol, amount: 1 },
    { id: 2, from: bob, amount: 1 },
  ]);
  assert.deepEqual(own.owedTo.map(({ address, count }) => ({ address, count })), [
    { address: bob, count: 1 },
    { address: carol, count: 1 },
  ]);
  assert.deepEqual(own.owedBy, []);
});

test("stable claims advance the race without creating a return obligation", () => {
  const base = normalizeHorfTransfer(event(), new Set())!;
  const rows: HorfTransfer[] = [
    { ...base, id: 10, timestamp: "2026-11-02T01:00:00Z", from: bob, to: alice },
    { ...base, id: -11, timestamp: "2026-11-02T02:00:00Z", from: carol, to: alice,
      settlement: "stable", stableMode: 1 },
  ];
  const { leaderboard, currentUser } = summarizeSeason(rows, alice);
  assert.equal(leaderboard.find((row) => row.address === alice)?.trades, 0);
  assert.equal(leaderboard.find((row) => row.address === carol)?.trades, 1);
  assert.equal(leaderboard.find((row) => row.address === bob)?.trades, 1);
  assert.equal(currentUser?.completedTrades, 0, "an honor claim and unreturned send are not completed trades");
  assert.deepEqual(currentUser?.owedTo, [{ address: bob, name: null, count: 1 }]);
  assert.deepEqual(currentUser?.waitingHorses.map((horse) => horse.id), [10]);
  assert.equal(currentUser?.recent[0]?.settlement, "stable");
  assert.equal(currentUser?.recent[0]?.stableMode, 1);
});

test("completed trades count reciprocal pairs once, excluding unreturned legs and gifts", () => {
  const base = normalizeHorfTransfer(event(), new Set())!;
  const rows: HorfTransfer[] = [
    { ...base, id: 1, timestamp: "2026-11-02T01:00:00Z", from: bob, to: alice, amount: 6 },
    { ...base, id: 2, timestamp: "2026-11-02T02:00:00Z", from: carol, to: alice, amount: 1, settlement: "gift" },
    { ...base, id: 3, timestamp: "2026-11-02T03:00:00Z", from: alice, to: bob, amount: 6 },
  ];
  const own = summarizeSeason(rows, alice).currentUser!;
  assert.deepEqual([own.received, own.sent, own.trades, own.completedTrades], [7, 6, 1, 6]);
  assert.deepEqual([own.giftHorsesReceived, own.tradeHorsesReceived], [1, 6]);
  assert.equal(own.giftHorsesReceived + own.tradeHorsesReceived, own.received);
  const ranked = summarizeSeason(rows, alice).leaderboard.find((entry) => entry.address === alice)!;
  assert.deepEqual([ranked.giftHorsesReceived, ranked.tradeHorsesReceived], [1, 6]);
  assert.deepEqual(own.owedTo, []);
  assert.deepEqual(own.owedBy, []);
  const unrelated = summarizeSeason([
    { ...base, id: 4, from: bob, to: alice, amount: 2 },
    { ...base, id: 5, from: alice, to: carol, amount: 2 },
  ], alice).currentUser!;
  assert.equal(unrelated.completedTrades, 0, "sends to another rider cannot settle Bob's return ride");
});

test("pool credit claims and verified sales settle trades, while honor claims and gifts do not", () => {
  const base = normalizeHorfTransfer(event(), new Set())!;
  const rows: HorfTransfer[] = [
    { ...base, id: 1, from: bob, to: alice, settlement: "stable", stableMode: 0 },
    { ...base, id: 2, from: alice, to: carol, settlement: "stable", stableMode: 2 },
    { ...base, id: 3, from: bob, to: alice, settlement: "market" },
    { ...base, id: 4, from: alice, to: carol, settlement: "objkt" },
    { ...base, id: 5, from: bob, to: alice, settlement: "stable", stableMode: 1 },
    { ...base, id: 6, from: carol, to: alice, settlement: "gift" },
  ];
  const own = summarizeSeason(rows, alice).currentUser!;
  assert.equal(own.completedTrades, 4);
  assert.equal(own.trades, 2, "the sender receives one race ride for each outbound interaction");
  assert.deepEqual(own.owedTo, []);
  assert.deepEqual(own.owedBy, []);
});
