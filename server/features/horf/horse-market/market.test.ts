import assert from "node:assert/strict";
import test from "node:test";
import { packHorseMarketPermit, readHorseMarketListing, issueHorseMarketPermit, horseMarketAddress, HORF_HORSE_MARKET_CODE_HASH, HORF_HORSE_MARKET_MAINNET_CONTRACT } from "./market";
import { HORF_HORSE_CODE_HASH, HORF_HORSE_MAINNET_CONTRACT, HORF_HORSE_ORIGINATOR } from "../horse-config";

test("HORSE market listing permit bytes match the compiled SmartPy Mainnet vector", () => {
  const packed = packHorseMarketPermit({
    chainId: "NetXdQprcVkpaWU",
    marketAddress: "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton",
    seller: "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY",
    tokenContract: "KT1L7PSeJpnj79MEaybcEiDtbHM43g5DZe12",
    tokenId: "7", quantity: "3", unitPriceHorseRaw: "123000000",
    nonce: `0x${"11".repeat(32)}`, oracleEpoch: "0",
  });
  assert.equal(`0x${packed}`, "0x0507070a000000047a06a77007070a0000001601b752c7f3de31759bce246416a6823e86b9756c6c0007070a000000160000379dfd0263493eab3182c1abed190d7bc4e2ac3107070a00000016017e73cfaf4bcbb88ed678fd03dbeff9e97fb5bc9000070700070707000307070080d3a67507070a0000002011111111111111111111111111111111111111111111111111111111111111110000");
});

test("HORSE market listings preserve raw eight-decimal prices", () => {
  const listing = readHorseMarketListing({ active: true, key: "4", value: {
    seller: "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY",
    token_contract: "KT1L7PSeJpnj79MEaybcEiDtbHM43g5DZe12",
    token_id: "7", remaining: "3", unit_price_horse: "123000000",
  } });
  assert.equal(listing?.unitPriceHorse, "1.23");
  assert.equal(listing?.unitPriceHorseRaw, "123000000");
});

test("Horf Mainnet market remains selected when the desktop defaults to Shadownet", () => {
  assert.equal(horseMarketAddress({ TEZOS_NETWORK: "shadownet" } as NodeJS.ProcessEnv), HORF_HORSE_MARKET_MAINNET_CONTRACT);
});

test("listing permit requires current approval and sufficient held editions", async () => {
  const market = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
  const seller = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";
  const tokenContract = "KT1L7PSeJpnj79MEaybcEiDtbHM43g5DZe12";
  const reader = { async getJson<T>(path: string): Promise<T> {
    if (path === "/head") return { chainId: "NetXdQprcVkpaWU", timestamp: "2026-11-03T20:00:00Z" } as T;
    if (path === `/contracts/${market}`) return { codeHash: HORF_HORSE_MARKET_CODE_HASH, creator: { address: HORF_HORSE_ORIGINATOR } } as T;
    if (path === `/contracts/${market}/storage`) return { admin: HORF_HORSE_ORIGINATOR, oracle_key: "edpk-test", oracle_epoch: "0", horse_contract: HORF_HORSE_MAINNET_CONTRACT, next_listing_id: "0" } as T;
    if (path === `/contracts/${HORF_HORSE_MAINNET_CONTRACT}`) return { codeHash: HORF_HORSE_CODE_HASH, creator: { address: HORF_HORSE_ORIGINATOR } } as T;
    if (path === "/tokens") return [{ contract: { address: HORF_HORSE_MAINNET_CONTRACT }, tokenId: "0", standard: "fa2", metadata: { symbol: "HORSE", decimals: "8" } }] as T;
    throw new Error(`Unexpected read ${path}`);
  } };
  const input = { address: seller, tokenContract, tokenId: "7", quantity: "2", unitPriceHorseRaw: "123000000" };
  const options = { reader, env: { TEZOS_NETWORK: "mainnet", HORF_HORSE_MARKET_CONTRACT_ADDRESS: market },
    nonce: "22".repeat(32), signer: { publicKey: async () => "edpk-test", sign: async (_bytes: string) => ({ prefixSig: "edsig-test" }) },
    ownerCheck: async () => "2", tokenCheck: async () => ({ contract: tokenContract, tokenId: "7", name: "Horse", image: null }),
    approvalCheck: async () => { throw new Error("Marshal approval revoked"); } };
  await assert.rejects(issueHorseMarketPermit(input, options as never), /Marshal approval revoked/);
  const approved = { ...options, approvalCheck: async () => {} };
  const permit = await issueHorseMarketPermit(input, approved as never);
  assert.equal(permit.signature, "edsig-test");
  assert.equal(permit.unitPriceHorseRaw, "123000000");
  await assert.rejects(issueHorseMarketPermit({ ...input, quantity: "3" }, approved as never), /enough editions/);
});
