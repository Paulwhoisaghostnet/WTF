import assert from "node:assert/strict";
import test from "node:test";

import {
  EXTERNAL_MARKETPLACE_CONTRACTS,
  externalCancelEntrypoint,
  externalMarketplaceInfo,
  externalMarketplaceKey,
  externalMarketplaceName,
  isExternalMarketplaceEntrypoint,
  isKnownExternalMarketplace,
} from "./external-marketplaces";

const OBJKT_V6 = "KT1CePTyk6fk4cFr6fasY5YXPGks6ttjSLp4";
const TEIA = "KT1PHubm9HtyQEJ4BBpMTVomq6mhbfNZ9z5w";
const HEN_V2 = "KT1HbQepzV1nVGg8QVznG7z4RcHseD5kwqBn";

test("external marketplace contracts expose canonical identity and cancel metadata", () => {
  assert.equal(EXTERNAL_MARKETPLACE_CONTRACTS.length, 9);
  assert.equal(externalMarketplaceName(OBJKT_V6), "objkt v6");
  assert.equal(externalMarketplaceKey(OBJKT_V6), "objkt");
  assert.equal(externalCancelEntrypoint(OBJKT_V6), "retract_ask");

  assert.equal(externalMarketplaceName(TEIA), "Teia");
  assert.equal(externalMarketplaceKey(TEIA), "teia");
  assert.equal(externalCancelEntrypoint(TEIA), "cancel_swap");

  assert.equal(externalMarketplaceName(HEN_V2), "HEN v2");
  assert.equal(externalMarketplaceKey(HEN_V2), "hen");
  assert.equal(externalCancelEntrypoint(HEN_V2), "cancel_swap");
});

test("external marketplace entrypoint roles are explicit", () => {
  assert.equal(isExternalMarketplaceEntrypoint(OBJKT_V6, "collect", "sale"), true);
  assert.equal(isExternalMarketplaceEntrypoint(OBJKT_V6, "retract_ask", "cancel"), true);
  assert.equal(isExternalMarketplaceEntrypoint(OBJKT_V6, "retract_ask", "sale"), false);
  assert.equal(isExternalMarketplaceEntrypoint(TEIA, "swap", "listing"), true);
});

test("unknown marketplace addresses remain pass-through labels", () => {
  const unknown = "KT1UnknownMarketplace111111111111111";

  assert.equal(isKnownExternalMarketplace(unknown), false);
  assert.equal(externalMarketplaceInfo(unknown), null);
  assert.equal(externalMarketplaceKey(unknown), null);
  assert.equal(externalMarketplaceName(unknown), unknown);
  assert.equal(externalCancelEntrypoint(unknown), null);
});
