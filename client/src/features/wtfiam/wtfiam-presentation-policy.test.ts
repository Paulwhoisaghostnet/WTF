import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shellSource = readFileSync("client/src/features/wtfiam/WtfIamShell.tsx", "utf8");
const tabsSource = readFileSync("client/src/features/wtfiam/WtfIamTabs.tsx", "utf8");
const itemCardSource = readFileSync("client/src/features/wtfiam/WtfIamItemCard.tsx", "utf8");
const cartPanelSource = readFileSync("client/src/features/wtfiam/WtfIamCartPanel.tsx", "utf8");
const marketHookSource = readFileSync("client/src/features/wtfiam/useWtfIamMarket.ts", "utf8");
const catalogSource = readFileSync("client/src/features/wtfiam/catalog.ts", "utf8");

test("WTFIAM marketplace chrome is presentation-host aware", () => {
  assert.match(shellSource, /usePresentationShell/);
  assert.match(shellSource, /data-wtfiam-surface="marketplace"/);
  assert.match(shellSource, /data-wtfiam-presentation-host=\{presentation\.host\}/);
  assert.match(shellSource, /\[data-wtfiam-presentation-host="gamma"\]/);
  assert.match(shellSource, /data-wtfiam-region="shell"/);
  assert.match(shellSource, /data-wtfiam-region="header"/);
  assert.match(shellSource, /data-wtfiam-region="meter"/);
  assert.match(shellSource, /data-wtfiam-region="listings-box"/);
  assert.match(shellSource, /data-wtfiam-region="tip-ledger"/);
});

test("WTFIAM tabs, cards, and cart expose Gamma-scoped rendered regions", () => {
  assert.match(tabsSource, /data-wtfiam-region="tabs"/);
  assert.match(tabsSource, /data-wtfiam-category=\{category\.key\}/);
  assert.match(tabsSource, /\[data-wtfiam-presentation-host="gamma"\]/);
  assert.match(itemCardSource, /data-wtfiam-region="item-card"/);
  assert.match(itemCardSource, /data-wtfiam-region="item-titlebar"/);
  assert.match(itemCardSource, /data-wtfiam-region="item-mark"/);
  assert.match(itemCardSource, /data-wtfiam-region="item-disabled-reason"/);
  assert.match(itemCardSource, /data-wtfiam-disabled-reason=/);
  assert.match(itemCardSource, /data-wtfiam-action="add-ticket"/);
  assert.match(cartPanelSource, /data-wtfiam-region="cart-panel"/);
  assert.match(cartPanelSource, /data-wtfiam-region="currency-toggle"/);
  assert.match(cartPanelSource, /data-wtfiam-currency-active=/);
  assert.match(cartPanelSource, /data-wtfiam-action="checkout"/);
});

test("WTFIAM Gamma chrome avoids classic visual treatment", () => {
  for (const source of [shellSource, tabsSource, itemCardSource, cartPanelSource]) {
    assert.match(source, /background-image:\s*none/);
    assert.match(source, /box-shadow:\s*none/);
    assert.match(source, /border-radius:\s*6px/);
    assert.match(source, /#00d2ff/);
  }
});

test("WTFIAM keeps shared market, wallet, and reward APIs untouched", () => {
  assert.match(marketHookSource, /\/api\/in-app-market\?category=/);
  assert.match(shellSource, /approveInAppMarketForWtf/);
  assert.match(shellSource, /purchaseInAppMarketListing/);
  assert.match(shellSource, /ensureWalletProviderForSend/);
  for (const endpoint of [
    "/api/in-app-market/intents",
    "/api/in-app-market/checkout-exp",
    "/api/in-app-market/checkout-reward-wtf",
    "/api/in-app-market/verify",
    "/api/in-app-market/tips/redeem",
  ]) {
    assert.match(shellSource, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
});

test("WTFIAM exposes a first-class Apps category with WTF-only app unlock affordances", () => {
  assert.match(catalogSource, /key:\s*"apps"/);
  assert.match(catalogSource, /label:\s*"Apps"/);
  assert.match(shellSource, /return "apps"/);
  assert.match(marketHookSource, /cartHasAppUnlock/);
  assert.match(marketHookSource, /item\.kind === "app-unlock"/);
  assert.match(marketHookSource, /item\.purchaseBlockedReason/);
  assert.match(cartPanelSource, /App unlocks use WTF, not EXP/);
});
