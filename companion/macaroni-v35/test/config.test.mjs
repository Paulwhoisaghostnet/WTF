import assert from "node:assert/strict";
import test from "node:test";

import { collectorPublishingConfig, loadCompanionConfig, publicConfig } from "../src/config.mjs";

function validEnvironment() {
  return {
    MACARONI_COMPANION_NETWORK: "shadownet",
    MACARONI_COMPANION_RPC_URL: "http://127.0.0.1:8732",
    MACARONI_COMPANION_RPC_TRUST_MODE: "creator_controlled",
    MACARONI_COMPANION_ACKNOWLEDGE_MEMPOOL_DISCLOSURE: "I_UNDERSTAND_SETTLEMENT_CID_AND_ENTROPY_ENTER_THE_TEZOS_MEMPOOL",
    MACARONI_COMPANION_INDEXER_URL: "https://api.shadownet.tzkt.io/v1",
    MACARONI_COMPANION_DUPLICATE_CHECK_URL: "https://data.shadownet.objkt.com/v3/graphql",
    MACARONI_COMPANION_PUBLIC_BASE_URL: "https://companion.test",
    MACARONI_COMPANION_COLLECTOR_ORIGIN: "https://drop.test",
    MACARONI_COMPANION_ALLOWED_ORIGINS: "https://drop.test,http://127.0.0.1:5173",
    MACARONI_COMPANION_MASTER_KEY_FILE: "./secrets/master.key",
    MACARONI_COMPANION_SIGNER_KEY_FILE: "./secrets/finalizer.key",
    MACARONI_COMPANION_ADMIN_TOKEN_FILE: "./secrets/admin.token",
    MACARONI_COMPANION_DUPLICATE_CHECK_MODE: "private_full_scan",
    MACARONI_COMPANION_PINNING_ADAPTER: "kubo",
    MACARONI_COMPANION_KUBO_API: "http://127.0.0.1:5001",
    MACARONI_COMPANION_IPFS_GATEWAY_URL: "https://ipfs.io",
    MACARONI_V35_CONTRACT_ABI_SHA256: "a".repeat(64),
    MACARONI_V35_STORAGE_SHA256: "c".repeat(64),
    MACARONI_V35_TEMPLATE_SHA256: "b".repeat(64),
  };
}

test("strict local config accepts exact origins and omits credentials from public status", () => {
  const { config, errors } = loadCompanionConfig(validEnvironment(), "/companion");
  assert.deepEqual(errors, []);
  assert.deepEqual(config.allowedOrigins, ["https://drop.test", "http://127.0.0.1:5173"]);
  assert.equal(collectorPublishingConfig(config).ready, true);
  const exposed = JSON.stringify(publicConfig(config));
  assert.equal(exposed.includes("master.key"), false);
  assert.equal(exposed.includes("admin.token"), false);
  assert.equal(exposed.includes("finalizer.key"), false);
});

test("collector publishing is blocked on desktop loopback unless explicitly limited to local development", () => {
  const base = {
    publicBaseUrl: "http://127.0.0.1:47835",
    collectorOrigin: "http://127.0.0.1:30771",
    allowedOrigins: ["http://127.0.0.1:30771"],
    allowLoopbackCollector: false,
  };
  const blocked = collectorPublishingConfig(base);
  assert.equal(blocked.ready, false);
  assert.equal(blocked.code, "collector_loopback_not_exportable");
  const development = collectorPublishingConfig({ ...base, allowLoopbackCollector: true });
  assert.equal(development.ready, true);
  assert.equal(development.localDevelopmentOnly, true);
});

test("remote collector publishing requires HTTPS and its exact CORS origin", () => {
  const wrongOrigin = collectorPublishingConfig({
    publicBaseUrl: "https://companion.test",
    collectorOrigin: "https://drop.test",
    allowedOrigins: ["https://other.test"],
  });
  assert.equal(wrongOrigin.ready, false);
  assert.equal(wrongOrigin.code, "collector_origin_not_allowlisted");
  const insecure = collectorPublishingConfig({
    publicBaseUrl: "http://companion.test",
    collectorOrigin: "https://drop.test",
    allowedOrigins: ["https://drop.test"],
  });
  assert.equal(insecure.ready, false);
  assert.equal(insecure.code, "collector_https_required");
});

test("config fails closed on wildcard origins, unread mempool warning, or unacknowledged third-party RPC", () => {
  const wildcard = validEnvironment();
  wildcard.MACARONI_COMPANION_ALLOWED_ORIGINS = "*";
  wildcard.MACARONI_COMPANION_ACKNOWLEDGE_MEMPOOL_DISCLOSURE = "REPLACE_AFTER_READING_README";
  assert.ok(loadCompanionConfig(wildcard, "/companion").errors.some((error) => error.includes("origins") || error.includes("mempool")));

  const thirdParty = validEnvironment();
  thirdParty.MACARONI_COMPANION_RPC_TRUST_MODE = "third_party_acknowledged";
  thirdParty.MACARONI_COMPANION_RPC_URL = "https://tezos-shadownet.octez.io";
  assert.ok(loadCompanionConfig(thirdParty, "/companion").errors.some((error) => error.includes("third-party RPC")));
});
