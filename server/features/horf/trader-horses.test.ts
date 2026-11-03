import test from "node:test";
import assert from "node:assert/strict";
import { horseContractAddress } from "./horse-config";
import { qualifyingTraderHorses } from "./trader-horses";

const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";

test("trader holdings use the Horf mint test and current positive balances", () => {
  const owned = [
    { contract, tokenId: "1", balance: "2" },
    { contract, tokenId: "2", balance: "1" },
    { contract, tokenId: "3", balance: "1" },
    { contract, tokenId: "4", balance: "1" },
    { contract, tokenId: "5", balance: "0" },
    { contract: horseContractAddress()!, tokenId: "0", balance: "100" },
  ];
  const indexed = [
    { fa_contract: contract, token_id: "1", name: "Horse Art 2026", timestamp: "2026-11-02T10:00:00Z", decimals: 0 },
    { fa_contract: contract, token_id: "2", name: "Untitled", decimals: 0,
      tags: [{ tag: { name: "pony", token_count: 6 } }] },
    { fa_contract: contract, token_id: "3", name: "Untitled", decimals: 0,
      tags: [{ tag: { name: "pony", token_count: 5 } }] },
    { fa_contract: contract, token_id: "4", name: "Horse 2026", decimals: 8 },
    { fa_contract: contract, token_id: "5", name: "Neighvember 2026", decimals: 0 },
    { fa_contract: horseContractAddress(), token_id: "0", name: "Horse reward", decimals: 0 },
  ];
  assert.deepEqual(qualifyingTraderHorses(owned, indexed).map((horse) => [horse.tokenId, horse.balance]), [
    ["1", "2"], ["2", "1"],
  ]);
  assert.deepEqual(qualifyingTraderHorses(owned, indexed).map((horse) => horse.mintedAt), [
    "2026-11-02T10:00:00.000Z", null,
  ]);
});
