import assert from "node:assert/strict";
import test from "node:test";
import {
  getBarterAddressOrNull,
  getMarketplaceAddressOrNull,
  getTzktBase,
  resetContractConfigCacheForTests,
} from "./contract-config";

const SHADOWNET_MARKETPLACE = "KT1U9cZBQAZwTTnSrwdgBso5W25LqjgeSsYy";

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

test("Shadownet contract config uses Marketplace V2 and does not fall back to legacy barter", () => {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    TEZOS_NETWORK: process.env.TEZOS_NETWORK,
    MARKETPLACE_CONTRACT_ADDRESS: process.env.MARKETPLACE_CONTRACT_ADDRESS,
    VITE_MARKETPLACE_CONTRACT_ADDRESS: process.env.VITE_MARKETPLACE_CONTRACT_ADDRESS,
    BARTER_CONTRACT_ADDRESS: process.env.BARTER_CONTRACT_ADDRESS,
    VITE_BARTER_CONTRACT_ADDRESS: process.env.VITE_BARTER_CONTRACT_ADDRESS,
    TZKT_API_URL: process.env.TZKT_API_URL,
  };
  try {
    process.env.NODE_ENV = "development";
    process.env.TEZOS_NETWORK = "shadownet";
    delete process.env.MARKETPLACE_CONTRACT_ADDRESS;
    delete process.env.VITE_MARKETPLACE_CONTRACT_ADDRESS;
    delete process.env.BARTER_CONTRACT_ADDRESS;
    delete process.env.VITE_BARTER_CONTRACT_ADDRESS;
    delete process.env.TZKT_API_URL;
    resetContractConfigCacheForTests();

    assert.equal(getMarketplaceAddressOrNull(), SHADOWNET_MARKETPLACE);
    assert.equal(getBarterAddressOrNull(), null);
    assert.equal(getTzktBase(), "https://api.shadownet.tzkt.io/v1");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      restoreEnv(key, value);
    }
    resetContractConfigCacheForTests();
  }
});
