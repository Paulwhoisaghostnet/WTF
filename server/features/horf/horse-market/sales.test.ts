import assert from "node:assert/strict";
import test from "node:test";
import { summarizeSeason } from "../model";
import { buildHorfRewardEntitlements, HORF_HORSE_REWARD_RAW_PER_UNIT } from "../rewards";
import { HORF_HORSE_MAINNET_CONTRACT } from "../horse-config";
import {
  fetchHorfHorseMarketSalePage, HorfHorseMarketSaleProofError,
  normalizeHorfHorseMarketSaleEvent, verifyHorfHorseMarketSale,
  type HorfHorseMarketSale,
} from "./sales";

const market = "KT1DBXe1QqiHrc5J5SMm7N9kz1hLPGQucn7m";
const horse = "KT1XaCf6gkjFnKg3QmPfn6gep53moMvjkj1E";
const seller = "tz2QrdpoDnE9epLMfGCsDGYH8rfNJ7zyxpjy";
const buyer = "tz1cVRngZw42KZ42VQF2ZCy2CJSPNG3H7Cgt";
const timestamp = "2026-11-03T20:00:00.000Z";
const hash = `o${"1".repeat(50)}`;
const event = {
  id: 401, transactionId: 1001, timestamp, contract: { address: market }, tag: "horse_market_bought",
  payload: { listing_id: "7", seller, buyer, token_contract: horse, token_id: "49633", quantity: "3", total_horse: "900000000" },
};
const sale: HorfHorseMarketSale = {
  id: 401, transactionId: 1001, timestamp, listingId: "7", seller, buyer,
  tokenContract: horse, tokenId: "49633", quantity: "3", totalHorseRaw: "900000000",
};

function chain(options: { paymentAmount?: string; horseTransfer?: boolean; applied?: boolean; event?: typeof event } = {}) {
  const calls: string[] = [];
  const reader = {
    async getJson<T>(path: string, params?: Record<string, unknown>): Promise<T> {
      calls.push(`${path}:${JSON.stringify(params || {})}`);
      if (path === "/head") return { chainId: "NetXdQprcVkpaWU" } as T;
      if (path === "/contracts/events") return [options.event || event] as T;
      if (path === "/operations/transactions") return [{
        id: 1001, hash, status: options.applied === false ? "failed" : "applied", counter: 5,
        sender: { address: buyer }, target: { address: market },
        parameter: { entrypoint: "buy_listing" }, timestamp,
      }] as T;
      if (path === `/operations/transactions/${hash}`) return [
        { id: 1001, hash, status: "applied", counter: 5, sender: { address: buyer }, target: { address: market }, parameter: { entrypoint: "buy_listing" } },
        { id: 1002, hash, status: "applied", counter: 5, sender: { address: market }, initiator: { address: buyer }, target: { address: HORF_HORSE_MAINNET_CONTRACT }, parameter: { entrypoint: "transfer" } },
        { id: 1003, hash, status: "applied", counter: 5, sender: { address: market }, initiator: { address: buyer }, target: { address: horse }, parameter: { entrypoint: "transfer" } },
      ] as T;
      if (path === "/tokens/transfers" && params?.transactionId === 1002) return [{
        id: 2002, transactionId: 1002, token: { contract: { address: HORF_HORSE_MAINNET_CONTRACT }, tokenId: "0" },
        from: { address: buyer }, to: { address: seller }, amount: options.paymentAmount || "900000000",
      }] as T;
      if (path === "/tokens/transfers" && params?.transactionId === 1003) return (options.horseTransfer === false ? [] : [{
        id: 2003, transactionId: 1003, token: { contract: { address: horse }, tokenId: "49633" },
        from: { address: market }, to: { address: buyer }, amount: "3",
      }]) as T;
      throw new Error(`Unexpected test chain read: ${path}`);
    },
  };
  return { reader, calls };
}

test("the configured market event pages by TzKT ID and verifies both sale movements", async () => {
  const { reader, calls } = chain();
  const page = await fetchHorfHorseMarketSalePage(market, 400, "2026-11-01T00:00:00.000Z", null, reader);
  assert.deepEqual(page, [sale]);
  const proof = await verifyHorfHorseMarketSale(page[0]!, market, HORF_HORSE_MAINNET_CONTRACT, reader);
  assert.deepEqual([proof.operationHash, proof.paymentTransferId, proof.horseTransferId], [hash, 2002, 2003]);
  assert.ok(calls.some((call) => call.includes('"id.gt":400')));
});

test("a market event alone, a failed purchase, or a missing token movement never earns HORSE", async () => {
  const malformed = { ...event, contract: { address: horse } };
  assert.throws(() => normalizeHorfHorseMarketSaleEvent(malformed, market, "2026-11-01T00:00:00.000Z", null), HorfHorseMarketSaleProofError);
  await assert.rejects(verifyHorfHorseMarketSale(sale, market, HORF_HORSE_MAINNET_CONTRACT, chain({ applied: false }).reader), HorfHorseMarketSaleProofError);
  await assert.rejects(verifyHorfHorseMarketSale(sale, market, HORF_HORSE_MAINNET_CONTRACT, chain({ horseTransfer: false }).reader), HorfHorseMarketSaleProofError);
  await assert.rejects(verifyHorfHorseMarketSale(sale, market, HORF_HORSE_MAINNET_CONTRACT, chain({ paymentAmount: "899999999" }).reader), HorfHorseMarketSaleProofError);
});

test("a three-edition sale counts one trade each and awards only the seller 10 HORSE", () => {
  const transfer = { id: sale.id, timestamp, from: seller, to: buyer, amount: 1,
    settlement: "market" as const, token: { contract: horse, tokenId: "49633", name: "Horse", image: null } };
  const race = summarizeSeason([transfer], buyer);
  assert.deepEqual(race.leaderboard.map((row) => [row.address, row.trades]), [[seller, 1], [buyer, 0]]);
  assert.deepEqual(race.currentUser?.owedTo, []);
  const rewards = buildHorfRewardEntitlements([{ kind: "market", sourceKey: `${market}:${sale.id}`,
    from: seller, to: buyer, units: "1", tokenContract: horse, tokenId: "49633" }], HORF_HORSE_MAINNET_CONTRACT);
  assert.deepEqual(rewards, [{ sourceKind: "market", sourceKey: `${market}:${sale.id}`,
    traderAddress: seller, counterpartyAddress: buyer, units: "1", amountRaw: HORF_HORSE_REWARD_RAW_PER_UNIT.toString() }]);
});
