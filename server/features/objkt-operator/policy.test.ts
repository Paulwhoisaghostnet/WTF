import assert from "node:assert/strict";
import test from "node:test";
import { evaluateObjktCandidatePolicy } from "@shared/objkt-operator";
import {
  buildObjktCreatorScoreBreakdown,
  isObjktTezosAddress,
} from "./market";
import {
  isObjktOperatorOwner,
  objktOperatorOwnerUsernames,
} from "./owner";
import { normalizeObjktOperatorSettings } from "../../routes/objkt-operator";

test("Objkt Operator owner policy requires both configured username and admin role", () => {
  const env = { OBJKT_OPERATOR_OWNER_USERNAMES: "wtf-admin, private-curator" } as NodeJS.ProcessEnv;
  assert.equal(isObjktOperatorOwner({ username: "wtf-admin" }, ["admin"], env), true);
  assert.equal(isObjktOperatorOwner({ username: "private-curator" }, ["admin"], env), true);
  assert.equal(isObjktOperatorOwner({ username: "private-curator" }, ["host"], env), false);
  assert.equal(isObjktOperatorOwner({ username: "another-admin" }, ["admin"], env), false);
  assert.deepEqual([...objktOperatorOwnerUsernames({} as NodeJS.ProcessEnv)], ["wtf-admin"]);
});

test("Objkt Operator settings normalize into bounded persisted controls", () => {
  const settings = normalizeObjktOperatorSettings({
    spendCapXtz: 20,
    maxItemPriceXtz: 2.5,
    perCreatorLimit: 500,
    walletReserveXtz: -4,
    minCandidateScore: 101,
    minResaleConfidence: 44.4,
    minRecentSales180d: 2.2,
    requireSaleReference: false,
  });
  assert.equal(settings.spendCapXtz, 20);
  assert.equal(settings.maxItemPriceXtz, 2.5);
  assert.equal(settings.perCreatorLimit, 50);
  assert.equal(settings.walletReserveXtz, 0);
  assert.equal(settings.minCandidateScore, 100);
  assert.equal(settings.minResaleConfidence, 44);
  assert.equal(settings.minRecentSales180d, 2);
  assert.equal(settings.requireSaleReference, false);
});

test("creator score breakdown exposes all weighted factors and totals 100 percent", () => {
  const score = buildObjktCreatorScoreBreakdown({
    volumeXtz: 24,
    salesCount: 18,
    uniqueBuyers: 10,
    verified: true,
    lastSaleAt: new Date().toISOString(),
    affordableListingCount: 8,
    lowestAskXtz: 0,
    maxItemPriceXtz: 2,
  });
  assert.deepEqual(Object.keys(score), [
    "sales",
    "buyers",
    "volume",
    "recency",
    "verification",
    "inventoryDepth",
    "floorFit",
  ]);
  assert.equal(Object.values(score).reduce((sum, part) => sum + part.weight, 0), 100);
  assert.equal(score.sales.score, 100);
  assert.equal(score.buyers.score, 100);
  assert.equal(score.verification.score, 100);
});

test("candidate quality policy blocks thin resale evidence", () => {
  const result = evaluateObjktCandidatePolicy({
    score: 40,
    recentSales180d: 1,
    resale: { confidence: 20, referenceSource: "markup_only" },
  } as any, {
    spendCapXtz: 10,
    maxItemPriceXtz: 2,
    perCreatorLimit: 20,
    walletReserveXtz: 0.15,
    minCandidateScore: 55,
    minResaleConfidence: 44,
    minRecentSales180d: 2,
    requireSaleReference: true,
  });
  assert.deepEqual(result.blockers, [
    "candidate_score_below_floor",
    "resale_confidence_below_floor",
    "secondary_sales_below_floor",
    "sale_reference_missing",
  ]);
  assert.equal(isObjktTezosAddress("tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79"), true);
  assert.equal(isObjktTezosAddress("not-a-wallet"), false);
});
