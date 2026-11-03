import test from "node:test";
import assert from "node:assert/strict";
import { HAHA_CRP_CATEGORIES, HAHA_CRP_PRIZES } from "@shared/haha-crp";
import { nominationAdmission, tallyHahaNominees } from "./tally";

const A = "tz1VSUr8wwNhLAzempoch5d6hLRiTh8Cjcjb";
const B = "tz1UakcrmXD82EinyTmZ4qLYE9ZGQwcXPt79";
const categoryId = HAHA_CRP_CATEGORIES[0].id;

test("HAHA has ten horse categories and the scaled prize slate", () => {
  assert.equal(HAHA_CRP_CATEGORIES.length, 10);
  assert.equal(10 * (HAHA_CRP_PRIZES.first.xtz + 2 * HAHA_CRP_PRIZES.runnerUp.xtz), 150);
  assert.equal(10 * (HAHA_CRP_PRIZES.first.horse + 2 * HAHA_CRP_PRIZES.runnerUp.horse), 6000);
});

test("a wallet can back three distinct nominees in each category", () => {
  assert.equal(nominationAdmission([], A), "ok");
  assert.equal(nominationAdmission([A, B], A), "duplicate");
  assert.equal(nominationAdmission([A, B], "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY"), "ok");
  assert.equal(nominationAdmission([A, B, "tz1Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY"], "tz5Qi77tcJn9foeHHP1QHj6UX1m1vLVLMbuY"), "limit");
});

test("earlier final nomination breaks a tied tally", () => {
  const rows = [
    { categoryId, nomineeAddress: A, nomineeDisplayName: "Canter", createdAt: "2026-11-03T12:00:00.000Z" },
    { categoryId, nomineeAddress: B, nomineeDisplayName: "Mare Force", createdAt: "2026-11-03T10:00:00.000Z" },
    { categoryId, nomineeAddress: A, nomineeDisplayName: "Canter", createdAt: "2026-11-03T14:00:00.000Z" },
    { categoryId, nomineeAddress: B, nomineeDisplayName: "Mare Force", createdAt: "2026-11-03T13:00:00.000Z" },
  ];
  const nominees = tallyHahaNominees(rows).find((category) => category.id === categoryId)?.nominees;
  assert.deepEqual(nominees?.map((nominee) => [nominee.address, nominee.count, nominee.rank]), [[B, 2, 1], [A, 2, 2]]);
});

test("the earlier final nomination wins even when tied votes land in one millisecond", () => {
  const rows = [
    { categoryId, nomineeAddress: B, nomineeDisplayName: null, createdAt: "2026-11-03T12:00:00.123789Z" },
    { categoryId, nomineeAddress: A, nomineeDisplayName: null, createdAt: "2026-11-03T12:00:00.123456Z" },
  ];
  const nominees = tallyHahaNominees(rows).find((category) => category.id === categoryId)?.nominees;
  assert.deepEqual(nominees?.map((nominee) => [nominee.address, nominee.rank]), [[A, 1], [B, 2]]);
});
