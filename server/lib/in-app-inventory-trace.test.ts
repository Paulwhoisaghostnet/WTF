import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildInAppInventoryTraceMetadata } from "./in-app-inventory-trace";

const marketRoutes = readFileSync("server/routes/in-app-market.ts", "utf8");
const marketSync = readFileSync("server/lib/in-app-market-sync.ts", "utf8");
const petFoodInventory = readFileSync("server/lib/pet-food-inventory.ts", "utf8");
const challengeActionHandlers = readFileSync(
  "server/challenges/actions/handlers.ts",
  "utf8"
);

test("inventory trace metadata captures the Law's owner/source/state contract", () => {
  const metadata = buildInAppInventoryTraceMetadata({
    currency: "wtf",
    cause: "chain_purchase",
    purchaseId: 42,
    sku: "pet-food",
    quantity: 3,
    purchaseRef: "cart:1:test",
    paymentIntentId: 7,
    walletAddress: "tz1-test",
    opHash: "op-test",
    tzktTransferId: 99,
    contractAddress: "KT1-test",
    contractListingId: 5,
    amountWtfUnits: "100000000",
    observedAt: new Date("2026-05-14T00:00:00.000Z"),
  });

  assert.deepEqual(metadata, {
    source: "chain_purchase",
    sourceType: "purchase",
    sourceId: 42,
    domain: "market",
    ownerType: "user",
    state: "owned",
    visibility: "user_inventory",
    sku: "pet-food",
    quantity: 3,
    currency: "wtf",
    purchaseId: 42,
    purchaseRef: "cart:1:test",
    paymentIntentId: 7,
    walletAddress: "tz1-test",
    opHash: "op-test",
    tzktTransferId: 99,
    contractAddress: "KT1-test",
    contractListingId: 5,
    amountWtfUnits: "100000000",
    amountExp: 0,
    observedAt: "2026-05-14T00:00:00.000Z",
    traceRule: "P6.CA3/08",
  });
});

test("market purchase inventory grants persist trace metadata on insert and update", () => {
  for (const source of [marketRoutes, marketSync]) {
    assert.match(source, /buildInAppInventoryTraceMetadata/);
    assert.match(source, /metadata: inventoryMetadata/);
    assert.match(
      source,
      /COALESCE\(\$\{inAppInventoryItems\.metadata\}, '\{\}'::jsonb\) \|\| \$\{JSON\.stringify\(inventoryMetadata\)\}::jsonb/
    );
  }
});

test("non-market inventory grants stamp owner/source/state trace metadata", () => {
  for (const source of [petFoodInventory, challengeActionHandlers]) {
    assert.match(source, /sourceType/);
    assert.match(source, /sourceId/);
    assert.match(source, /domain/);
    assert.match(source, /ownerType/);
    assert.match(source, /state/);
    assert.match(source, /visibility/);
    assert.match(source, /traceRule: "P6\.CA3\/08"/);
  }
});

test("desktop pet starter-food metadata casts SQL values used inside jsonb_build_object", () => {
  assert.match(
    petFoodInventory,
    /'starterFoodQuantity', \$\{NEW_PET_STARTER_FOOD_QUANTITY\}::int/
  );
});

test("EXP checkout deduction records a purchase cause in xp_events metadata", () => {
  assert.match(marketRoutes, /source: "in_app_market_purchase"/);
  assert.match(marketRoutes, /sourceType: "payment_intent"/);
  assert.match(marketRoutes, /cause: "exp_checkout"/);
  assert.match(marketRoutes, /sourceId: intent\.id/);
});
