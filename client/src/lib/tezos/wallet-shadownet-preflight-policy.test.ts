import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const preflight = readFileSync(new URL("./preflight.ts", import.meta.url), "utf8");
const loaders = readFileSync(new URL("./loaders.ts", import.meta.url), "utf8");
const marketplace = readFileSync(new URL("./marketplace.ts", import.meta.url), "utf8");
const inAppMarket = readFileSync(new URL("./in-app-market.ts", import.meta.url), "utf8");
const token = readFileSync(new URL("./token.ts", import.meta.url), "utf8");
const wtfToken = readFileSync(new URL("./wtf-token.ts", import.meta.url), "utf8");
const sharedTypes = readFileSync(new URL("../../../../shared/types.ts", import.meta.url), "utf8");
const inAppMarketSync = readFileSync(
  new URL("../../../../server/lib/in-app-market-sync.ts", import.meta.url),
  "utf8"
);
const shadownetRunner = readFileSync(
  new URL("../../../../scripts/marketplace-v2/run-local-shadownet-puppet-e2e.mjs", import.meta.url),
  "utf8"
);

test("Shadownet marketplace sends use explicit RPC and chain-id preflight", () => {
  assert.match(sharedTypes, /shadownet:\s*"https:\/\/rpc\.shadownet\.teztnets\.com"/);
  assert.match(loaders, /localStorage\.getItem\("wtf:network"\)/);
  assert.match(preflight, /NetXsqzbfFenSTS:\s*"shadownet"/);
  assert.match(preflight, /shadownet:\s*"NetXsqzbfFenSTS"/);
});

test("Shadownet marketplace flows use the configured WTF FA2 token", () => {
  assert.match(wtfToken, /VITE_WTF_TOKEN_CONTRACT/);
  assert.match(wtfToken, /VITE_WTF_TOKEN_ID/);
  assert.match(marketplace, /getClientWtfToken/);
  assert.match(inAppMarket, /getClientWtfToken/);
  assert.match(token, /getClientWtfToken/);
  assert.match(shadownetRunner, /WTF_TOKEN_CONTRACT/);
  assert.match(shadownetRunner, /VITE_WTF_TOKEN_CONTRACT/);
  assert.match(shadownetRunner, /KT1L5m2ohNDhbzSbRcitn1LaMmGf7jhDbVGj/);
  assert.match(shadownetRunner, /IN_APP_MARKET_CONTRACT_ADDRESS/);
  assert.match(shadownetRunner, /VITE_IN_APP_MARKET_CONTRACT_ADDRESS/);
  assert.match(shadownetRunner, /KT1MdvE9hYFpQP7boybqSJ9XNfXjLUG6QZrC/);
});

test("mainnet in-app market V2 fallback carries the V2 payload contract version", () => {
  assert.match(sharedTypes, /WTF_IN_APP_MARKET_CONTRACT_VERSION\s*=\s*"v2"/);
  assert.match(inAppMarket, /DEFAULT_IN_APP_MARKET_CONTRACT_VERSION/);
  assert.match(inAppMarket, /IN_APP_MARKET_CONTRACT === WTF_IN_APP_MARKET_CONTRACT/);
  assert.match(inAppMarket, /WTF_IN_APP_MARKET_CONTRACT_VERSION/);
  assert.match(inAppMarketSync, /contractAddress === WTF_IN_APP_MARKET_CONTRACT/);
  assert.match(inAppMarketSync, /WTF_IN_APP_MARKET_CONTRACT_VERSION/);
});
