import assert from "node:assert/strict";
import { test } from "node:test";
import { stampWalletEventProvenance, walletEventProvenance } from "./wallet-event-provenance";

test("wallet evidence binds the actual ingestion source and does not relabel old cache", () => {
  assert.deepEqual(walletEventProvenance({ token: {} }), { network: "unverified", source: null });
  assert.deepEqual(walletEventProvenance(stampWalletEventProvenance({ token: { tokenId: "1" } }, "https://api.tzkt.io/v1/")),
    { network: "mainnet", source: "https://api.tzkt.io/v1" });
  const forged = { __wtfosIndexer: { version: 1, network: "mainnet", source: "https://api.tzkt.io/v1" } };
  const custom = stampWalletEventProvenance(forged, "https://secret:password@shadownet.example/v1?key=secret");
  assert.deepEqual(walletEventProvenance(custom), { network: "unverified", source: "https://shadownet.example" });
  assert.doesNotMatch(JSON.stringify(custom), /secret|password|key=/);
  assert.equal(walletEventProvenance(stampWalletEventProvenance({}, "https://api.tzkt.io.evil.test/v1")).network, "unverified");
});
