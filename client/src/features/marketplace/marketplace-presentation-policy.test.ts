import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const marketplaceSource = readFileSync("client/src/pages/Marketplace.tsx", "utf8");
const chromeSource = readFileSync("client/src/features/marketplace/MarketplaceChrome.ts", "utf8");
const tradeBoardsSource = readFileSync("client/src/pages/TradeBoards.tsx", "utf8");
const tradeBoardsTabSource = readFileSync(
  "client/src/features/marketplace/MarketplaceTradeBoardsTab.tsx",
  "utf8"
);

test("marketplace route exposes the active presentation host", () => {
  assert.match(marketplaceSource, /usePresentationShell/);
  assert.match(marketplaceSource, /MarketplaceSurface/);
  assert.match(marketplaceSource, /surfaceVariant = "marketplace"/);
  assert.match(marketplaceSource, /data-marketplace-surface=\{surfaceVariant\}/);
  assert.match(marketplaceSource, /data-marketplace-active-tab=\{activeTab\}/);
  assert.match(marketplaceSource, /data-marketplace-presentation-host=\{presentation\.host\}/);
});

test("marketplace cards have Gamma scoped chrome without changing shared actions", () => {
  assert.match(chromeSource, /\[data-marketplace-presentation-host="gamma"\]/);
  assert.match(chromeSource, /data-marketplace-region": "listing-card"/);
  assert.match(chromeSource, /data-marketplace-region": "listing-titlebar"/);
  assert.match(chromeSource, /data-marketplace-region": "token-image"/);
  assert.match(chromeSource, /data-marketplace-region": "listing-actions"/);
  assert.match(chromeSource, /background-image:\s*none/);
  assert.match(chromeSource, /box-shadow:\s*none/);
  assert.match(chromeSource, /text-shadow:\s*none/);
  assert.match(chromeSource, /border-radius:\s*6px/);
  assert.match(chromeSource, /#00d2ff/);
});

test("trade boards route keeps shared marketplace logic inside a Gamma-visible surface", () => {
  assert.match(tradeBoardsSource, /<Marketplace initialTab=\{2\} surfaceVariant="trade-boards" \/>/);
  assert.match(marketplaceSource, /<MarketplaceTradeBoardsTab/);
  assert.match(tradeBoardsTabSource, /TradeBoardSurface/);
  assert.match(tradeBoardsTabSource, /TradeBoardToolbar/);
  assert.match(tradeBoardsTabSource, /TradeBoardSearchWrap/);
  assert.match(tradeBoardsTabSource, /TradeBoardGridWrap/);
  assert.match(tradeBoardsTabSource, /TradeBoardBarterSurface/);
  assert.match(chromeSource, /data-marketplace-region": "trade-board-surface"/);
  assert.match(chromeSource, /data-marketplace-region": "trade-board-toolbar"/);
  assert.match(chromeSource, /data-marketplace-region": "trade-board-grid"/);
  assert.match(chromeSource, /data-marketplace-region": "trade-board-barter"/);
  assert.doesNotMatch(tradeBoardsSource, /usePresentationShell/);
  assert.doesNotMatch(tradeBoardsTabSource, /\/api\/gamma/);
});
