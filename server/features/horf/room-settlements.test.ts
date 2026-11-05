import assert from "node:assert/strict";
import test from "node:test";
import { buildHorfRewardEntitlements, roomSettlementRewardEvents } from "./rewards";
import { summarizeSeason } from "./model";
import { roomSettlementTransfers, type StoredRoomSettlement } from "./room-ledger";
import { fetchHorfRoomSettlementPage, normalizeHorfRoomSettlementEvent } from "./room-settlements";
import { withoutRoomSwapInputDuplicates } from "./room-dedupe";
import type { RoomChainReader } from "./rooms/chain";

const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const outputContract = "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E";
const inputContract = "KT1Rg7ippRJGrFgKBDCGUyiFG7jKdcU7Dmsg";
const owner = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const claimant = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const hash = `o${"A".repeat(50)}`;
const since = "2026-11-01T00:00:00.000Z";
const timestamp = "2026-11-05T19:00:00.000Z";

function event(tag: string, id: number, payload: Record<string, unknown>) {
  return { id, timestamp, transactionId: 500 + id, contract: { address: contract }, tag, payload };
}

const swapPayload = {
  listing_id: 0, owner, claimant,
  output_contract: outputContract, output_id: 42,
  input_contract: inputContract, input_id: 9,
};

function stored(mode: 0 | 1 | 2 | 3, id: string): StoredRoomSettlement {
  return {
    contract_address: contract, tzkt_event_id: id, occurred_at: new Date(timestamp),
    operation_hash: hash, mode, owner_address: owner, claimant_address: claimant,
    output_contract: outputContract, output_token_id: "42",
    input_contract: mode >= 2 ? inputContract : null,
    input_token_id: mode >= 2 ? "9" : null,
  };
}

test("V3 settlement parser admits only claimed and swapped events, including listing zero", () => {
  assert.equal(normalizeHorfRoomSettlementEvent(event("horse_deposited", 11, swapPayload),
    contract, since, null, hash), null);
  assert.deepEqual(normalizeHorfRoomSettlementEvent(event("horse_claimed", 12,
    { listing_id: 0, owner, claimant, mode: 0, token_contract: outputContract, token_id: 42 }),
  contract, since, null, hash), {
    id: 12, timestamp, operationHash: hash, mode: 0, owner, claimant,
    outputContract, outputTokenId: "42", inputContract: null, inputTokenId: null,
  });
  assert.equal(normalizeHorfRoomSettlementEvent(event("horse_swapped", 13, swapPayload),
    contract, since, null, hash)?.mode, 2);
  assert.equal(normalizeHorfRoomSettlementEvent(event("private_offer_fulfilled", 14, swapPayload),
    contract, since, null, hash)?.mode, 3);
  assert.throws(() => normalizeHorfRoomSettlementEvent(event("horse_claimed", 15,
    { listing_id: 0, owner, claimant, mode: 2, token_contract: outputContract, token_id: 42 }),
  contract, since, null, hash));
  assert.throws(() => normalizeHorfRoomSettlementEvent(event("horse_swapped", 16,
    { ...swapPayload, input_contract: outputContract, input_id: 42 }), contract, since, null, hash));
});

test("settlement index advances past custody events and requires an applied Mainnet room transaction", async () => {
  const rows = [event("horse_deposited", 21, {}), event("horse_swapped", 22, swapPayload)];
  const reader = { getJson: async (path: string, params?: Record<string, unknown>) => {
    if (path === "/contracts/events") {
      assert.equal(params?.contract, contract);
      assert.equal(params?.["id.gt"], 20);
      return rows;
    }
    if (path === "/operations/transactions") {
      assert.equal(params?.id, 522);
      return [{ id: 522, hash, status: "applied", target: { address: contract } }];
    }
    throw new Error(`Unexpected ${path}`);
  } } as RoomChainReader;
  const page = await fetchHorfRoomSettlementPage(contract, 20, since, null, reader);
  assert.equal(page.cursor, 22);
  assert.equal(page.complete, true);
  assert.deepEqual(page.settlements.map((row) => row.mode), [2]);
  const badReader = { getJson: async (path: string) => path === "/contracts/events" ? rows :
    [{ id: 522, hash, status: "backtracked", target: { address: contract } }] } as RoomChainReader;
  await assert.rejects(() => fetchHorfRoomSettlementPage(contract, 20, since, null, badReader));
});

test("V3 1:1 swap counts once per rider and awards exactly one 10 HORSE sender reward each", () => {
  const row = stored(2, "22");
  const legs = roomSettlementTransfers(row);
  assert.equal(legs.length, 2);
  assert.equal(legs[0]?.from, owner);
  assert.equal(legs[1]?.from, claimant);
  assert.equal(legs[1]?.roomInput, true);
  const ownerStats = summarizeSeason(legs, owner);
  const claimantStats = summarizeSeason(legs, claimant);
  assert.deepEqual(ownerStats.currentUser && [ownerStats.currentUser.sent, ownerStats.currentUser.received,
    ownerStats.currentUser.trades, ownerStats.currentUser.completedTrades], [1, 1, 1, 1]);
  assert.deepEqual(claimantStats.currentUser && [claimantStats.currentUser.sent, claimantStats.currentUser.received,
    claimantStats.currentUser.trades, claimantStats.currentUser.completedTrades], [1, 1, 1, 1]);
  const rewards = buildHorfRewardEntitlements(roomSettlementRewardEvents([row]), null);
  assert.deepEqual(rewards.map((entry) => [entry.traderAddress, entry.amountRaw, entry.sourceKey]), [
    [owner, "1000000000", `rooms:${contract}:22:output`],
    [claimant, "1000000000", `rooms:${contract}:22:input`],
  ]);
});

test("Objkt direct input leg is consumed once; unrelated direct sends survive", () => {
  const input = { operationHash: hash, from: claimant, to: owner, amount: 1,
    tokenContract: inputContract, tokenId: "9" };
  const direct = [input, input, { ...input, operationHash: `o${"B".repeat(50)}` }];
  assert.deepEqual(withoutRoomSwapInputDuplicates(direct, [input], (row) => row), direct.slice(1));
});

test("V3 Honor claim has one output leg and one owner reward; excluded input removes only that reward", () => {
  assert.equal(roomSettlementTransfers(stored(1, "23")).length, 1);
  const rewards = buildHorfRewardEntitlements(roomSettlementRewardEvents([stored(2, "22")]), null,
    new Set([`${inputContract}/9`]));
  assert.deepEqual(rewards.map((entry) => entry.traderAddress), [owner]);
});
