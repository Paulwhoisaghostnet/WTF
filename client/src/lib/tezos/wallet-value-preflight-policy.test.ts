import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const marketplace = readFileSync(new URL("./marketplace.ts", import.meta.url), "utf8");
const barter = readFileSync(new URL("./barter.ts", import.meta.url), "utf8");
const inAppMarket = readFileSync(new URL("./in-app-market.ts", import.meta.url), "utf8");
const clubDues = readFileSync(new URL("./club-dues.ts", import.meta.url), "utf8");
const casino = readFileSync(new URL("./casino.ts", import.meta.url), "utf8");
const dex = readFileSync(new URL("./dex.ts", import.meta.url), "utf8");
const token = readFileSync(new URL("./token.ts", import.meta.url), "utf8");
const marketplaceActions = readFileSync(
  new URL("../../features/marketplace/useMarketplaceActions.ts", import.meta.url),
  "utf8"
);

test("Tezos user-value writes bind wallet preflight to the prepared sender", () => {
  for (const [name, source] of [
    ["marketplace", marketplace],
    ["barter", barter],
    ["in-app-market", inAppMarket],
    ["club-dues", clubDues],
    ["casino", casino],
    ["dex", dex],
    ["token", token],
  ] as const) {
    assert.doesNotMatch(
      source,
      /assertNetworkReadyForSend\(\)/,
      `${name} must pass the expected wallet address into send preflight`
    );
  }

  assert.match(marketplace, /walletAddress: string;/);
  assert.match(marketplace, /assertNetworkReadyForSend\(params\.walletAddress\)/);
  assert.match(marketplace, /assertNetworkReadyForSend\(walletAddress\)/);
  assert.match(barter, /walletAddress: string;/);
  assert.match(barter, /assertNetworkReadyForSend\(params\.walletAddress\)/);
  assert.match(barter, /assertNetworkReadyForSend\(walletAddress\)/);
});

test("marketplace create flow rejects selected tokens owned by a different active wallet", () => {
  assert.match(marketplaceActions, /selectedToken\.walletAddress/);
  assert.match(
    marketplaceActions,
    /selectedToken\.walletAddress\.toLowerCase\(\) !== address\.toLowerCase\(\)/
  );
  assert.match(
    marketplaceActions,
    /Switch to the wallet that owns this token before creating a market entry/
  );
  assert.match(
    marketplaceActions,
    /await approveMarketplaceForToken\(address, selectedToken\.contract, selectedToken\.tokenId\)/
  );
});
