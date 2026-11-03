import assert from "node:assert/strict";
import test from "node:test";
import { packHorseClaimPermit, readConfiguredHorseClaimVault, signHorseClaimPermit } from "./horse-claims";

const vault = "KT1RJ6PbjHpwc3M5rw5s2Nbmefwbuwbdxton";
const claimant = "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY";

test("claim permit PACK exactly matches SmartPy Tallinn vector", () => {
  assert.equal(packHorseClaimPermit({
    chainId: "NetXdQprcVkpaWU", contractAddress: vault,
    address: claimant, totalRaw: "2000000000", oracleEpoch: "0",
  }), "0507070a000000047a06a77007070a0000001601b752c7f3de31759bce246416a6823e86b9756c6c0007070a000000160000379dfd0263493eab3182c1abed190d7bc4e2ac3107070080d0acf30e0000");
});

test("a claim permit grants only the delta, requires vault funding, and binds the claimant", async () => {
  let packed = "";
  const signer = { publicKey: async () => "oracle-key", sign: async (bytes: string) => {
    packed = bytes;
    return { prefixSig: "edsig-test" };
  } };
  const state = { contractAddress: vault, oracleEpoch: "0", claimedRaw: "1000000000",
    balanceRaw: "1000000000", asOf: null, signer };
  const permit = await signHorseClaimPermit(claimant, "2000000000", state);
  assert.equal(permit.claimableRaw, "1000000000");
  assert.equal(permit.totalRaw, "2000000000");
  assert.equal(permit.signature, "edsig-test");
  assert.equal(packed, packHorseClaimPermit({ chainId: permit.chainId,
    contractAddress: vault, address: claimant, totalRaw: permit.totalRaw, oracleEpoch: "0" }));
  await assert.rejects(() => signHorseClaimPermit(claimant, "2000000000", { ...state, balanceRaw: "999999999" }),
    /needs more HORSE funding/);
});

test("a configured vault read error propagates instead of claiming zero on an index outage", async () => {
  assert.equal(await readConfiguredHorseClaimVault(claimant, { env: {} }), null);
  await assert.rejects(() => readConfiguredHorseClaimVault(claimant, {
    env: { HORF_HORSE_CLAIM_CONTRACT_ADDRESS: vault },
    reader: { getJson: async () => { throw new Error("TzKT unavailable"); } },
  }), /TzKT unavailable/);
});
