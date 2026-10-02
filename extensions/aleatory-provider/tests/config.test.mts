import { test } from "node:test";
import assert from "node:assert/strict";
import { readConfig, readChainConfiguration } from "../src/config.mts";

const env = {
  TEZOS_NETWORK: "mainnet",
  ALEA_ROUTER_ADDRESS: "KT1HTY5RFTUai5K2Bh2LVySQvSid9Mx2dP4J",
  ALEA_REGISTRY_ADDRESS: "KT1E7wraYc1cgywqDQX2KGMNF4TbCADsHVL9",
  WTF_ALEATORY_OPERATOR_ADDRESS: "tz1c8FUJvTvtMLFT87mCwNGTnZVEZnQGPvyo",
  ALEA_STATE_DIR: "/tmp/aleatory-test-state",
};

test("network must be chosen and price is never invented", () => {
  assert.throws(() => readConfig({ ...env, TEZOS_NETWORK: undefined }), /TEZOS_NETWORK/);
  assert.throws(() => readConfig({ ...env, TEZOS_NETWORK: "ghostnet" }), /mainnet or shadownet/);
  assert.equal(readConfig(env).renderGasMutez, undefined);
  assert.equal(readConfig({ ...env, ALEA_RENDER_GAS_MUTEZ: "50000" }).renderGasMutez, 50000);
  assert.throws(() => readConfig({ ...env, ALEA_RENDER_GAS_MUTEZ: "0.05" }), /integer/);
});

test("network defaults use project RPC policy with distinct indexers", () => {
  assert.equal(readConfig(env).rpcUrl, "https://tezos-mainnet.octez.io/");
  const shadow = readConfig({ ...env, TEZOS_NETWORK: "shadownet" });
  assert.equal(shadow.chainId, "NetXsqzbfFenSTS");
  assert.equal(shadow.tzktApi, "https://api.shadownet.tzkt.io");
});

test("wrong official registry fails before provider lookup", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ registry: "different", factories: [env.ALEA_ROUTER_ADDRESS] }));
  try { await assert.rejects(readChainConfiguration(readConfig(env)), /router\/registry/); }
  finally { globalThis.fetch = original; }
});

test("provider readback enforces operator, hot agent and chosen fee", async () => {
  const original = globalThis.fetch;
  const config = readConfig({ ...env, ALEA_PROVIDER_ADDRESS: "KT1DGd6RcA9zKErjLurg9JGQ8txNCLoFHkmv", ALEA_RENDER_GAS_MUTEZ: "50000" });
  let calls = 0;
  globalThis.fetch = async () => new Response(JSON.stringify(++calls === 1 ? { registry: config.registry, factories: [config.router] } : { operator: config.operatorAddress, agent: "tz1acHymFHm2AAEgLKRgAh9CULY2Kbb4Qnjr", render_gas: "0" }));
  try { await assert.rejects(readChainConfiguration(config), /fee differs/); }
  finally { globalThis.fetch = original; }
});
