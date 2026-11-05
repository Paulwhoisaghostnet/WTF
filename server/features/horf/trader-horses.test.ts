import test from "node:test";
import assert from "node:assert/strict";
import { horseContractAddress } from "./horse-config";
import { HORF_TRADER_TOKEN_QUERY, qualifyingTraderHorses, traderTokenCreator } from "./trader-horses";

const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";

test("trader holdings use the Horf mint test and current positive balances", () => {
  const owned = [
    { contract, tokenId: "1", balance: "2", creatorAddress: "tz1cVRngPTBNK2VZQJSUCQDjPNqtzJ2H7Cgt" },
    { contract, tokenId: "2", balance: "1", creatorAddress: "tz1cVRngPTBNK2VZQJSUCQDjPNqtzJ2H7Cgt" },
    { contract, tokenId: "3", balance: "1" },
    { contract, tokenId: "4", balance: "1" },
    { contract, tokenId: "5", balance: "0" },
    { contract: horseContractAddress()!, tokenId: "0", balance: "100" },
  ];
  const indexed = [
    { fa_contract: contract, token_id: "1", name: "Horse Art 2026", timestamp: "2026-11-02T10:00:00Z", decimals: 0,
      thumbnail_uri: "ipfs://QmCollectionThumbnail", artifact_uri: "ipfs://QmFirstHorse", mime: "image/png",
      tags: [{ tag: { name: "horse art" } }],
      creators: [{ creator_address: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb", holder: { alias: "Sally's Saddle" } }] },
    { fa_contract: contract, token_id: "2", name: "Untitled", decimals: 0,
      thumbnail_uri: "ipfs://QmCollectionThumbnail", artifact_uri: "ipfs://QmSecondHorse", mime: "image/jpeg",
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
  assert.match(HORF_TRADER_TOKEN_QUERY, /artifact_uri mime/);
  assert.match(HORF_TRADER_TOKEN_QUERY, /creators \{ creator_address holder \{ alias \} \}/);
  const horses = qualifyingTraderHorses(owned, indexed);
  assert.equal(horses[0].creatorAddress, "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb", "Objkt credited creator takes precedence over TzKT first minter");
  assert.equal(horses[1].creatorAddress, null, "unknown Objkt creator is not inferred from TzKT first minter");
  assert.equal(horses[0].image, horses[1].image);
  assert.notEqual(horses[0].artifactUri, horses[1].artifactUri);
  assert.deepEqual(traderTokenCreator(indexed[0]), {
    creatorAddress: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
    creatorName: "Sally's Saddle",
  });
});

test("a HAHA-only holding stays off public profiles until a Marshal approves its token", () => {
  const owned = [{ contract, tokenId: "9", balance: "3" }];
  const indexed = [{ fa_contract: contract, token_id: "9", name: "The Laughing Clown",
    description: "Nothing equine here", decimals: 0,
    tags: [{ tag: { name: "haha", token_count: 100 } }] }];
  assert.equal(qualifyingTraderHorses(owned, indexed).length, 0);
  assert.deepEqual(qualifyingTraderHorses(owned, indexed, new Set([`${contract}/9`]))
    .map((horse) => [horse.tokenId, horse.balance]), [["9", "3"]]);
  assert.equal(qualifyingTraderHorses(owned, indexed, new Set([`${contract}/9`]),
    new Set([`${contract}/9`])).length, 0);
});
