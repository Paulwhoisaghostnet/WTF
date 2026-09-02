import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const marketRouteSource = readFileSync("server/routes/in-app-market.ts", "utf8");
const desktopAppsRouteSource = readFileSync("server/routes/desktop-apps.ts", "utf8");

test("in-app market route generates the app-store category from the ranked wtfOS catalog", () => {
  assert.match(marketRouteSource, /WTFOS_APP_STORE_CATEGORY/);
  assert.match(marketRouteSource, /WTFOS_APP_CATALOG_ENTRIES/);
  assert.match(marketRouteSource, /serializeWtfOsAppMarketItem/);
  assert.match(marketRouteSource, /evaluateWtfOsAppPurchaseEligibility/);
  assert.match(marketRouteSource, /purchaseBlockedReason/);
});

test("app-unlock SKUs are enforced server-side during checkout intent creation", () => {
  assert.match(marketRouteSource, /desktopAppKeyFromWtfosMarketSku/);
  assert.match(marketRouteSource, /reason: "purchase_blocked"/);
  assert.match(marketRouteSource, /One or more apps require another role or prerequisite/);
  assert.match(marketRouteSource, /isWtfOsAppMarketSku\(line\.sku\)\) continue/);
});

test("desktop app availability recognizes canonical and catalog-declared access inventory", () => {
  assert.match(desktopAppsRouteSource, /personalizeDesktopAppsForViewer/);
  assert.match(desktopAppsRouteSource, /isAppStoreAppKey/);
  assert.match(desktopAppsRouteSource, /hasWtfOsAppAccess/);
  assert.match(desktopAppsRouteSource, /WTFOS_APP_CATALOG/);
  assert.match(desktopAppsRouteSource, /inAppInventoryItems/);
  assert.match(desktopAppsRouteSource, /globallyEnabled\[key\] && hasWtfOsAppAccess\(WTFOS_APP_CATALOG\[key\], owned\)/);
});
