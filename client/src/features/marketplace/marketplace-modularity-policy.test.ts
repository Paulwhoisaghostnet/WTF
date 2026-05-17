import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const marketplacePath = "client/src/pages/Marketplace.tsx";
const marketplace = readFileSync(marketplacePath, "utf8");
const marketplaceLines = marketplace.split("\n").length;
const tradeBoards = readFileSync("client/src/pages/TradeBoards.tsx", "utf8");
const dataHook = readFileSync(
  "client/src/features/marketplace/useMarketplaceData.ts",
  "utf8"
);
const actionHook = readFileSync(
  "client/src/features/marketplace/useMarketplaceActions.ts",
  "utf8"
);

test("marketplace page remains a route shell over feature-owned domains", () => {
  assert.ok(
    marketplaceLines < 500,
    `${marketplacePath} has ${marketplaceLines} lines`
  );

  for (const importPath of [
    "../features/marketplace/CreateMarketEntryPanel",
    "../features/marketplace/MarketplaceActivityTab",
    "../features/marketplace/MarketplaceAuctionsTab",
    "../features/marketplace/MarketplaceListingsTab",
    "../features/marketplace/MarketplaceTradeBoardsTab",
    "../features/marketplace/OfferAcceptanceDialog",
    "../features/marketplace/useMarketplaceActions",
    "../features/marketplace/useMarketplaceData",
  ]) {
    assert.match(marketplace, new RegExp(importPath.replaceAll("/", "\\/")));
  }
});

test("marketplace feature modules own tabs data actions types and helpers", () => {
  for (const path of [
    "client/src/features/marketplace/CreateMarketEntryPanel.tsx",
    "client/src/features/marketplace/MarketplaceActivityTab.tsx",
    "client/src/features/marketplace/MarketplaceAuctionsTab.tsx",
    "client/src/features/marketplace/MarketplaceListingsTab.tsx",
    "client/src/features/marketplace/MarketplaceTradeBoardsTab.tsx",
    "client/src/features/marketplace/OfferAcceptanceDialog.tsx",
    "client/src/features/marketplace/types.ts",
    "client/src/features/marketplace/useMarketplaceActions.ts",
    "client/src/features/marketplace/useMarketplaceData.ts",
    "client/src/features/marketplace/utils.ts",
  ]) {
    assert.ok(existsSync(path), `${path} must exist`);
  }
});

test("marketplace extraction preserves route compatibility and query keys", () => {
  assert.match(tradeBoards, /<Marketplace initialTab=\{2\} \/>/);
  assert.match(dataHook, /queryKey: \["marketplace", "onchain"\]/);
  assert.match(dataHook, /queryKey: \["marketplace", "trade-board", boardSearch\]/);
  assert.match(dataHook, /queryKey: \["wallets"\]/);
  assert.match(dataHook, /queryKey: \["marketplace", "external", "mine"\]/);
});

test("marketplace wallet actions stay centralized behind the action hook", () => {
  for (const action of [
    "handleCreateSubmit",
    "handleBuyListing",
    "handlePlaceAuctionBid",
    "handlePlaceListingOffer",
    "handlePlaceTradeBoardOffer",
    "handleAcceptTradeBoardOffer",
    "handleCancelExternalListing",
  ]) {
    assert.match(actionHook, new RegExp(`\\b${action}\\b`));
  }

  assert.match(actionHook, /approveMarketplaceForToken/);
  assert.match(actionHook, /approveMarketplaceForWtf/);
  assert.match(actionHook, /createMarketplaceListingWithId/);
  assert.match(actionHook, /createMarketplaceAuction/);
  assert.match(actionHook, /buyMarketplaceListing/);
  assert.match(actionHook, /bidMarketplaceAuction/);
});
