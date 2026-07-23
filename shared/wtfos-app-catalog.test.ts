import assert from "node:assert/strict";
import test from "node:test";
import { DESKTOP_APPS, type DesktopAppKey } from "./types";
import {
  WTFOS_APP_CATALOG,
  WTFOS_APP_CATALOG_ENTRIES,
  desktopAppKeyFromWtfosMarketSku,
  evaluateWtfOsAppPurchaseEligibility,
  isAppStoreAppKey,
  isDefaultDesktopAppKey,
  wtfosAppMarketSku,
} from "./wtfos-app-catalog";

test("wtfOS app catalog ranks every desktop app exactly once", () => {
  const catalogKeys = Object.keys(WTFOS_APP_CATALOG).sort();
  const appKeys = [...DESKTOP_APPS].sort();
  assert.deepEqual(catalogKeys, appKeys);
  assert.equal(WTFOS_APP_CATALOG_ENTRIES.length, DESKTOP_APPS.length);

  for (const key of DESKTOP_APPS) {
    const entry = WTFOS_APP_CATALOG[key];
    assert.equal(entry.key, key);
    assert.ok(entry.label.length > 0, `${key} needs a label`);
    assert.ok(entry.route.startsWith("/"), `${key} needs a route`);
    assert.ok(entry.summary.length > 20, `${key} needs a user-facing summary`);
    assert.ok(entry.necessityRank >= 1 && entry.necessityRank <= 5);
  }
});

test("core apps and private role-gated apps keep their intended wtfOS placement", () => {
  const defaultDesktopKeys = DESKTOP_APPS.filter(isDefaultDesktopAppKey);
  assert.deepEqual(defaultDesktopKeys, [
    "wtfiam",
    "hoard",
    "wim",
    "w",
    "gallery",
    "mail",
  ]);

  for (const key of DESKTOP_APPS) {
    const entry = WTFOS_APP_CATALOG[key];
    if (defaultDesktopKeys.includes(key)) {
      assert.equal(entry.placement, "default-desktop", `${key} should stay core`);
      assert.equal(entry.priceWtfUnits, "0", `${key} should not need purchase`);
    } else if (entry.placement === "stuffs-menu") {
      assert.equal(entry.requiredRoles?.includes("admin"), true, `${key} needs an admin gate`);
      assert.equal(entry.priceWtfUnits, "0", `${key} should not be purchasable`);
    } else {
      assert.equal(isAppStoreAppKey(key), true, `${key} should live in WTFIAM Apps`);
      assert.ok(BigInt(entry.priceWtfUnits) > 0n, `${key} needs a WTF unlock price`);
    }
  }
});

test("app store SKUs round trip to their desktop app keys", () => {
  for (const key of DESKTOP_APPS) {
    const sku = wtfosAppMarketSku(key);
    assert.equal(desktopAppKeyFromWtfosMarketSku(sku), key);
  }
  assert.equal(desktopAppKeyFromWtfosMarketSku("not-an-app"), null);
});

test("role and prerequisite gated apps fail closed before purchase", () => {
  const witnessRoles = ["witness"];
  const trustedRoles = ["trusted_creator"];

  const skywire = evaluateWtfOsAppPurchaseEligibility(
    WTFOS_APP_CATALOG.skywire,
    witnessRoles,
    []
  );
  assert.equal(skywire.canPurchase, false);
  assert.match(skywire.reason ?? "", /staff-alpha|rollout/i);

  const creatorCheese = evaluateWtfOsAppPurchaseEligibility(
    WTFOS_APP_CATALOG["ch-ease"],
    trustedRoles,
    []
  );
  assert.equal(creatorCheese.canPurchase, true);

  const casino = evaluateWtfOsAppPurchaseEligibility(
    WTFOS_APP_CATALOG.casino,
    witnessRoles,
    []
  );
  assert.equal(casino.canPurchase, false);
  assert.match(casino.reason ?? "", /casino app pass|membership/i);

  const casinoWithPass = evaluateWtfOsAppPurchaseEligibility(
    WTFOS_APP_CATALOG.casino,
    witnessRoles,
    ["casino-app-pass"]
  );
  assert.equal(casinoWithPass.canPurchase, true);
});

test("owned app unlocks cannot be purchased again", () => {
  const appKey: DesktopAppKey = "arcade";
  const result = evaluateWtfOsAppPurchaseEligibility(
    WTFOS_APP_CATALOG[appKey],
    "contestant",
    [wtfosAppMarketSku(appKey)]
  );
  assert.equal(result.canPurchase, false);
  assert.match(result.reason ?? "", /already unlocked/i);
});
