import assert from "node:assert/strict";
import test from "node:test";
import { applyGiftSettlements } from "./ledger";
import { summarizeSeason } from "./model";
import { getHorfHorseActivity, getHorfHorseConfig, horseContractAddress, HORF_HORSE_CHAIN_ID, HORF_HORSE_CODE_HASH, HORF_HORSE_MAINNET_CONTRACT, HORF_HORSE_ORIGINATOR, type HorseChainReader } from "./horse-config";
import { matchGiftTransfers, parseGiftConfirmation, parsePossePartner } from "./social";

const sender = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
const recipient = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const secondRecipient = "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79";
const contract = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const horse = "KT1U4p17VUNcinntAzUULBhzpPK7f2a4Ht4P";
const opHash = `o${"A".repeat(50)}`;

test("posse and gift requests validate Tezos identities and edition counts", () => {
  assert.deepEqual(parsePossePartner({ address: recipient, nickname: "  Sally  " }), { address: recipient, nickname: "Sally" });
  assert.equal(parsePossePartner({ address: "tz1burnburnburnburnburnburnburjAYjjX" }), null);
  assert.deepEqual(parseGiftConfirmation({
    address: sender, opHash, gifts: [{ recipient, tokenContract: contract, tokenId: "07", amount: "02" }],
  })?.gifts[0], { recipient, tokenContract: contract, tokenId: "7", amount: "2" });
  assert.equal(parseGiftConfirmation({
    address: sender, opHash, gifts: [{ recipient: sender, tokenContract: contract, tokenId: "7", amount: "1" }],
  }), null);
  assert.equal(parseGiftConfirmation({
    address: sender, opHash, gifts: [{ recipient, tokenContract: contract, tokenId: "7", amount: "0" }],
  }), null);
});

test("gift proof consumes a distinct applied Mainnet transfer for each recipient", () => {
  const confirmation = parseGiftConfirmation({
    address: sender, opHash, gifts: [
      { recipient, tokenContract: contract, tokenId: "7", amount: "1" },
      { recipient: secondRecipient, tokenContract: contract, tokenId: "7", amount: "1" },
    ],
  })!;
  const operations = [{ id: 31, hash: opHash, status: "applied", sender: { address: sender } }];
  const transfer = (id: number, to = recipient) => ({
    id, transactionId: 31, timestamp: "2026-11-03T10:00:00Z",
    token: { contract: { address: contract }, tokenId: "7" },
    from: { address: sender }, to: { address: to }, amount: "1",
  });
  assert.deepEqual(matchGiftTransfers(confirmation, operations, [transfer(100), transfer(101, secondRecipient)])?.map((row) => row.id), [100, 101]);
  assert.equal(matchGiftTransfers(confirmation, operations, [transfer(100)]), null);
  assert.equal(matchGiftTransfers(confirmation, operations, [transfer(100), transfer(101)]), null);
  assert.equal(matchGiftTransfers(confirmation, [{ ...operations[0], status: "failed" }], [transfer(100), transfer(101, secondRecipient)]), null);
  assert.equal(matchGiftTransfers(confirmation, operations, [{ ...transfer(100), to: { address: sender } }, transfer(101, secondRecipient)]), null);
});

test("verified gift operation hashes settle exactly one direct receipt", () => {
  const base = {
    timestamp: "2026-11-03T10:00:00.000Z", from: sender, to: recipient, amount: 1,
    operationHash: opHash, token: { contract, tokenId: "7", name: "Horse", image: null },
  };
  const settled = applyGiftSettlements([{ id: 1, ...base }, { id: 2, ...base }], [{
    operation_hash: opHash, from_address: sender, to_address: recipient,
    token_contract: contract, token_id: "7", amount: "1",
  }]);
  assert.equal(settled[0]?.settlement, "gift");
  assert.equal(settled[1]?.settlement, undefined);
  const recipientLedger = summarizeSeason(settled.slice(0, 1), recipient).currentUser;
  assert.equal(recipientLedger?.received, 1);
  assert.deepEqual(recipientLedger?.owedTo, []);
  assert.deepEqual(recipientLedger?.waitingHorses, []);
});

test("HORSE configuration requires the exact WTF code clone and wtf.tez originator", async () => {
  assert.equal(horseContractAddress({}), HORF_HORSE_MAINNET_CONTRACT);
  const reader: HorseChainReader = { getJson: async (path) => {
    if (path === "/head") return { chainId: HORF_HORSE_CHAIN_ID, timestamp: "2026-11-03T10:00:00Z" } as never;
    if (path === `/contracts/${horse}`) return { codeHash: HORF_HORSE_CODE_HASH, creator: { address: HORF_HORSE_ORIGINATOR } } as never;
    if (path === "/tokens") return [{ contract: { address: horse }, tokenId: "0", standard: "fa2", metadata: { symbol: "HORSE", decimals: "8" } }] as never;
    if (path === "/tokens/balances") return [{ account: { address: sender }, token: { contract: { address: horse }, tokenId: "0" }, balance: "240000000" }] as never;
    throw new Error(path);
  } };
  const configured = await getHorfHorseConfig(sender, reader, { HORF_HORSE_CONTRACT_ADDRESS: horse });
  assert.equal(configured.token?.symbol, "HORSE");
  assert.equal(configured.balanceRaw, "240000000");
  assert.equal((await getHorfHorseConfig(sender, reader, { HORF_HORSE_CONTRACT_ADDRESS: "" })).status, "unconfigured");
  await assert.rejects(getHorfHorseConfig(sender, { getJson: async (path) =>
    path === "/head" ? { chainId: "NetXnHfVqm9iesp" } as never : reader.getJson(path) },
  { HORF_HORSE_CONTRACT_ADDRESS: horse }));
});

test("HORSE activity tracks cumulative receipts and awards after spending", async () => {
  const reader: HorseChainReader = { getJson: async (path, params) => {
    if (path === "/head") return { chainId: HORF_HORSE_CHAIN_ID, timestamp: "2026-11-03T10:00:00Z" } as never;
    if (path === `/contracts/${horse}`) return { codeHash: HORF_HORSE_CODE_HASH, creator: { address: HORF_HORSE_ORIGINATOR } } as never;
    if (path === "/tokens") return [{ contract: { address: horse }, tokenId: "0", standard: "fa2", metadata: { symbol: "HORSE", decimals: "8" } }] as never;
    if (path === "/tokens/transfers" && params?.to === sender) return [
      { id: 10, token: { contract: { address: horse }, tokenId: "0" }, from: { address: HORF_HORSE_ORIGINATOR }, to: { address: sender }, amount: "300000000" },
      { id: 11, token: { contract: { address: horse }, tokenId: "0" }, from: { address: recipient }, to: { address: sender }, amount: "100000000" },
    ] as never;
    if (path === "/tokens/transfers" && params?.from === sender) return [
      { id: 12, token: { contract: { address: horse }, tokenId: "0" }, from: { address: sender }, to: { address: recipient }, amount: "250000000" },
    ] as never;
    throw new Error(path);
  } };
  const activity = await getHorfHorseActivity(sender, reader, { HORF_HORSE_CONTRACT_ADDRESS: horse });
  assert.equal(activity.receivedRaw, "400000000");
  assert.equal(activity.awardedRaw, "300000000");
  assert.equal(activity.sentRaw, "250000000");
});
