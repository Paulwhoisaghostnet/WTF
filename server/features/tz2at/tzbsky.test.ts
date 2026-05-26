import test from "node:test";
import assert from "node:assert/strict";
import { parseTzbskyCryptoAddressRecord } from "./tzbsky";

const validRecord = {
  $type: "com.tzbsky.cryptoAddress",
  addresses: [
    {
      chain: "tezos",
      address: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb",
      publicKey: "edpkExample",
      proof: {
        scheme: "tezos-micheline",
        message: "tzbsky.com: main address attestation",
        signature: "edsigExample",
      },
    },
    {
      chain: "etherlink",
      address: "0x1111111111111111111111111111111111111111",
      proof: { scheme: "eip191", message: "tzbsky.com", signature: "0xabc" },
    },
  ],
};

test("tzbsky parser accepts com.tzbsky.cryptoAddress/self-style wallet proofs", () => {
  const parsed = parseTzbskyCryptoAddressRecord(validRecord);

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].chain, "tezos");
  assert.equal(parsed[0].walletAddress, "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb");
  assert.equal(parsed[1].chain, "etherlink");
  assert.equal(parsed[1].walletAddress, "0x1111111111111111111111111111111111111111");
});

test("tzbsky parser rejects malformed chains and missing proofs", () => {
  assert.throws(
    () =>
      parseTzbskyCryptoAddressRecord({
        $type: "com.tzbsky.cryptoAddress",
        addresses: [{ chain: "bitcoin", address: "bc1whatever", proof: {} }],
      }),
    /unsupported chain/
  );

  assert.throws(
    () =>
      parseTzbskyCryptoAddressRecord({
        $type: "com.tzbsky.cryptoAddress",
        addresses: [{ chain: "tezos", address: "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb" }],
      }),
    /missing proof/
  );
});
